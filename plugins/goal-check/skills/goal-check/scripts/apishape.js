#!/usr/bin/env node
/**
 * Print the shape of a running service's HTTP API, and optionally emit a plan skeleton.
 *
 * Never write a request body from memory. After a schema change, a plan written from
 * recollection silently verifies the wrong thing. This script reports what the service
 * ACTUALLY accepts: paths, methods, required fields, and query parameter names.
 *
 * The parameter names matter. `?min_price=5` and `?minPrice=5` look alike in a
 * request, but only one of them is the name the code reads. The other one is ignored
 * without an error, and the endpoint answers with the full unfiltered list.
 *
 * Usage:
 *   apishape.js [--manifest PATH] [--run-dir DIR] [--service NAME] [--base-url URL]
 *               [--spec-path PATH] [--skeleton] [--json]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

// Flags that take no value. They must never swallow the token that follows them.
const BOOLEAN_FLAGS = new Set(['skeleton', 'json']);

// Where frameworks commonly publish their OpenAPI document. `/openapi.json` is the
// FastAPI default; the rest cover other common stacks.
const DEFAULT_SPEC_PATHS = [
  '/openapi.json',
  '/api/openapi.json',
  '/swagger.json',
  '/v3/api-docs',
  '/api/schema/',
];

/** Walk up to the repository root (a directory containing .git). */
function findRepoRoot(start) {
  let current = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}

/** Temporary directory for this run; mirrors goalctl.js. */
function runDirFor(repoRoot) {
  if (process.env.GOAL_CHECK_RUN_DIR) return path.resolve(process.env.GOAL_CHECK_RUN_DIR);
  const crypto = require('crypto');
  const os = require('os');
  const digest = crypto.createHash('sha256').update(repoRoot).digest('hex').slice(0, 8);
  return path.join(os.tmpdir(), `goal-check-${digest}`);
}

/** Resolve the services map (service name -> base URL) from the run manifest. */
function resolveServices(manifestPath, runDir) {
  let file = manifestPath;
  if (!file) {
    const base = runDir ? path.resolve(runDir) : runDirFor(findRepoRoot(process.cwd()));
    file = path.join(base, 'manifest.json');
  }
  if (!fs.existsSync(file)) {
    throw new Error(
      `Cannot find ${file}. Start the services with goalctl.js up first, or pass --base-url.`,
    );
  }
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const services = {};
  for (const entry of manifest.services || []) services[entry.name] = entry.base_url;
  return services;
}

/**
 * Compress an OpenAPI schema into one readable line.
 *
 * @param {object} spec     schema fragment
 * @param {object} schemas  components.schemas
 * @param {number} depth    recursion depth
 * @param {Set<string>} seen  $ref names already expanded, to stop self-referencing schemas
 */
function describe(spec, schemas, depth = 0, seen = new Set()) {
  if (depth > 5 || !spec || typeof spec !== 'object') return '?';
  if (spec.$ref) {
    const name = spec.$ref.split('/').pop();
    const target = schemas[name];
    if (!target || seen.has(name)) return name;
    return describe(target, schemas, depth + 1, new Set([...seen, name]));
  }
  if (Array.isArray(spec.anyOf) || Array.isArray(spec.oneOf)) {
    return (spec.anyOf || spec.oneOf).map((item) => describe(item, schemas, depth + 1, seen)).join(' | ');
  }
  if (spec.allOf) {
    return spec.allOf.map((item) => describe(item, schemas, depth + 1, seen)).join(' & ');
  }
  if (spec.type === 'array') {
    return `[${describe(spec.items, schemas, depth + 1, seen)}]`;
  }
  if (spec.type === 'object' || spec.properties) {
    const properties = spec.properties || {};
    const names = Object.keys(properties);
    if (names.length === 0) return 'object';
    const required = spec.required || [];
    const inner = names
      .map((name) => `${name}: ${describe(properties[name], schemas, depth + 1, seen)}${required.includes(name) ? '*' : ''}`)
      .join(', ');
    return `{ ${inner} }`;
  }
  if (spec.type) return spec.type;
  if (spec.enum) return spec.enum.map((value) => JSON.stringify(value)).join(' | ');
  return '?';
}

/** Collect the query and path parameters of one operation. */
function describeParameters(operation) {
  const query = [];
  const pathParams = [];
  for (const parameter of operation.parameters || []) {
    const name = parameter.name;
    const type = describe(parameter.schema || {}, {});
    const flag = parameter.required ? '*' : '';
    const defaultValue =
      parameter.schema && parameter.schema.default !== undefined
        ? ` = ${JSON.stringify(parameter.schema.default)}`
        : '';
    const label = `${name} (${type}${flag}${defaultValue})`;
    if (parameter.in === 'query') query.push(label);
    else if (parameter.in === 'path') pathParams.push(name);
  }
  return { query, pathParams };
}

/**
 * Fetch the OpenAPI document of a service.
 *
 * Frameworks disagree on where the document lives. Without an explicit
 * `--spec-path`, a short list of common locations is tried.
 */
async function fetchSpec(baseUrl, specPath) {
  const candidates = specPath ? [specPath] : DEFAULT_SPEC_PATHS;
  const failures = [];

  for (const candidate of candidates) {
    const url = `${baseUrl.replace(/\/+$/, '')}${candidate}`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'manual' });
      if (response.status === 404) {
        failures.push(`${candidate}: 404`);
        continue;
      }
      if (!response.ok) {
        failures.push(`${candidate}: HTTP ${response.status}`);
        continue;
      }
      const text = await response.text();
      let doc;
      try {
        doc = JSON.parse(text);
      } catch (error) {
        failures.push(`${candidate}: not JSON`);
        continue;
      }
      if (!doc || typeof doc !== 'object' || !doc.paths) {
        failures.push(`${candidate}: no paths`);
        continue;
      }
      return { url, doc };
    } catch (error) {
      failures.push(`${candidate}: ${error.message}`);
    }
  }

  throw new Error(`no OpenAPI document found (${failures.join('; ')})`);
}

/** Print the API surface of one service. */
function printService(name, baseUrl, doc) {
  const schemas = (doc.components && doc.components.schemas) || {};
  process.stdout.write(`\n=== ${name}  ${baseUrl} ===\n`);
  const paths = doc.paths || {};
  const names = Object.keys(paths).sort();
  if (names.length === 0) process.stdout.write('  (no paths)\n');
  for (const route of names) {
    const item = paths[route];
    for (const [method, operation] of Object.entries(item)) {
      if (!HTTP_METHODS.includes(method)) continue;
      const bodySchema =
        operation.requestBody &&
        operation.requestBody.content &&
        operation.requestBody.content['application/json'];
      const shape = bodySchema ? describe(bodySchema.schema || {}, schemas) : '';
      const { query, pathParams } = describeParameters(operation);
      const suffix = shape ? `-> ${shape}` : '';
      process.stdout.write(`  ${method.toUpperCase().padEnd(6)} ${route}${suffix}\n`);
      if (pathParams.length > 0) {
        process.stdout.write(`         path params: ${pathParams.join(', ')}\n`);
      }
      if (query.length > 0) {
        process.stdout.write(`         query: ${query.join(', ')}\n`);
      }
      const codes = Object.keys(operation.responses || {}).sort();
      if (codes.length > 0) {
        process.stdout.write(`         responses: ${codes.join(', ')}\n`);
      }
    }
  }
  const schemaNames = Object.keys(schemas);
  if (schemaNames.length > 0) {
    process.stdout.write(`  response models: ${schemaNames.sort().join(', ')}\n`);
  }
}

/**
 * Build a plan skeleton: one step per operation, with the expectations left empty.
 *
 * The skeleton deliberately carries NO expected values. Copying the example responses
 * out of the OpenAPI document into `expect` would verify the implementation against
 * itself. Expectations must come from the task goal.
 */
function buildSkeleton(services, docs) {
  const steps = [];
  for (const [name, baseUrl] of Object.entries(services)) {
    const doc = docs[name];
    if (!doc) continue;
    const paths = doc.doc.paths || {};
    for (const route of Object.keys(paths).sort()) {
      const item = paths[route];
      for (const [method, operation] of Object.entries(item)) {
        if (!HTTP_METHODS.includes(method)) continue;
        const stepName = `${name} ${method.toUpperCase()} ${route}`;
        const bodySchema =
          operation.requestBody &&
          operation.requestBody.content &&
          operation.requestBody.content['application/json'];
        const step = {
          name: stepName,
          service: name,
          method: method.toUpperCase(),
          path: route,
          expect: {},
          _fill_in:
            'State the status code and the fields the TASK GOAL requires. ' +
            'Do not copy them from the OpenAPI examples - that verifies the ' +
            'implementation against itself.',
        };
        if (bodySchema && bodySchema.schema) {
          step._body_shape = describe(bodySchema.schema, (doc.doc.components || {}).schemas || {});
          step.body = { '<field>': '<value>' };
        }
        steps.push(step);
      }
    }
  }
  return { default_service: Object.keys(services)[0], steps };
}

/**
 * Parse `--flag value` / `--flag=value`.
 *
 * Boolean flags never consume the following token.
 */
function parseArgs(argv) {
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      parsed._.push(token);
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf('=');
    let key;
    let value;
    if (eq >= 0) {
      key = body.slice(0, eq);
      value = body.slice(eq + 1);
    } else {
      key = body;
      if (BOOLEAN_FLAGS.has(key)) {
        value = true;
      } else {
        const next = argv[index + 1];
        if (next === undefined || next.startsWith('--')) {
          value = true;
        } else {
          value = next;
          index += 1;
        }
      }
    }
    const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (parsed[camel] === undefined) parsed[camel] = value;
    else if (Array.isArray(parsed[camel])) parsed[camel].push(value);
    else parsed[camel] = [parsed[camel], value];
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let services = {};
  if (args.baseUrl) {
    services[args.service || 'service'] = String(args.baseUrl);
  } else {
    services = resolveServices(args.manifest, args.runDir);
  }
  if (args.service) {
    const filtered = {};
    for (const [name, url] of Object.entries(services)) {
      if (name === args.service) filtered[name] = url;
    }
    if (Object.keys(filtered).length === 0) {
      throw new Error(
        `Unknown service "${args.service}"; available: ${Object.keys(services).sort().join(', ')}`,
      );
    }
    services = filtered;
  }

  const docs = {};
  const failures = [];
  for (const [name, baseUrl] of Object.entries(services)) {
    try {
      const { url, doc } = await fetchSpec(baseUrl, args.specPath);
      docs[name] = { url, doc };
      if (!args.json) printService(name, baseUrl, doc);
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
      process.stderr.write(`[${name}] ${error.message}\n`);
    }
  }

  if (failures.length > 0) {
    process.stderr.write(
      `\nNo OpenAPI document available for ${failures.length} of ${Object.keys(services).length} ` +
        'service(s).\n' +
        'Derive the paths from the routes registered in the source, or from the paths named ' +
        'in the task goal, and write the plan by hand.\n',
    );
  }

  if (args.skeleton) {
    const skeleton = buildSkeleton(services, docs);
    if (args.json) {
      process.stdout.write(`${JSON.stringify(skeleton, null, 2)}\n`);
    } else {
      process.stdout.write('\n--- plan skeleton (expectations left empty on purpose) ---\n');
      process.stdout.write(`${JSON.stringify(skeleton, null, 2)}\n`);
    }
  }

  // Exit non-zero when nothing could be read: an empty result must not be mistaken
  // for "this service has no endpoints".
  if (Object.keys(docs).length === 0) return 1;
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
