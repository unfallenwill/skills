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
 * The skeleton it can emit states the success status the document promises, and marks
 * each step as an `assumption`: it shows that the endpoint answers, not that it
 * answers correctly. The requirement is what says what "correctly" means. A route that
 * still holds a path template, or an operation the document lists no success status
 * for, comes back as a `skipped` gap instead.
 *
 * Usage:
 *   apishape.js --base-url URL [--spec-path PATH] [--skeleton] [--json]
 */

'use strict';

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
  // The enum values matter when the requirement allows only one of them, so they are
  // read before the bare type.
  if (spec.enum) return spec.enum.map((value) => JSON.stringify(value)).join(' | ');
  if (spec.type) return spec.type;
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
 * The success status an operation documents: the smallest 2xx code it lists.
 *
 * This says the endpoint answers the way the contract says it answers. It says
 * nothing about whether the response is correct.
 */
function successStatus(operation) {
  const codes = Object.keys(operation.responses || {})
    .map((code) => Number(code))
    .filter((code) => code >= 200 && code < 300);
  return codes.length ? Math.min(...codes) : null;
}

/**
 * Turn a route template into a step name that can be referenced.
 *
 * A reference is `{{step name.field}}`, and the braces of the reference cannot be
 * nested - so a step name may not contain braces. `/products/{sku}` becomes
 * `/products/:sku`. A dot is forbidden for the same reason the field path uses
 * one: the first dot separates the step name from the field path.
 */
function stepRoute(route) {
  return route.replace(/\{([^}]+)\}/g, ':$1').replace(/\./g, '-');
}

/**
 * Build a plan skeleton: one step per operation.
 *
 * Each step states the success status the document promises and is marked as an
 * `assumption` - it shows that the endpoint answers, not that it answers correctly.
 * Replace the status with the fields the requirement calls for, and flip the step
 * to `verified`, to turn it into a check of the behaviour itself. A step that cannot
 * be called as it stands - a route that still holds a path template, or an operation
 * with no documented success status - is emitted as a `skipped` gap with a note.
 */
function buildSkeleton(baseUrl, docs) {
  const steps = [];
  for (const [name, doc] of Object.entries(docs)) {
    const paths = doc.doc.paths || {};
    const schemas = (doc.doc.components || {}).schemas || {};
    for (const route of Object.keys(paths).sort()) {
      const item = paths[route];
      for (const [method, operation] of Object.entries(item)) {
        if (!HTTP_METHODS.includes(method)) continue;
        const bodySchema =
          operation.requestBody &&
          operation.requestBody.content &&
          operation.requestBody.content['application/json'];
        const status = successStatus(operation);
        // A path that still holds a template variable cannot be called: it needs a
        // concrete id. It is reported as a gap, not as a step that will fail.
        const needsValue = /\{[^}]+\}/.test(route);
        const step = {
          name: `${name} ${method.toUpperCase()} ${stepRoute(route)}`,
          method: method.toUpperCase(),
          path: route,
          coverage: needsValue ? 'skipped' : status ? 'assumption' : 'skipped',
          expect: status ? { status } : {},
          _fill_in:
            'State the status code and the fields the REQUIREMENT calls for, then set ' +
            'coverage to "verified". The status below only shows that the endpoint ' +
            'answers; it says nothing about the response being right.',
        };
        if (needsValue) {
          step.note = `the path needs a concrete id: ${route}`;
        } else if (status === null) {
          step.note = 'the document lists no success status for this operation';
        }
        if (bodySchema && bodySchema.schema) {
          step._body_shape = describe(bodySchema.schema, schemas);
          step.body = { '<field>': '<value>' };
        }
        steps.push(step);
      }
    }
  }
  return { base_url: baseUrl, steps };
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

  if (!args.baseUrl) {
    process.stderr.write(
      'Usage: apishape.js --base-url URL [--spec-path PATH] [--skeleton] [--json]\n' +
        '  --base-url is the root URL of the running service.\n',
    );
    return 1;
  }
  const baseUrl = String(args.baseUrl);

  let doc = null;
  let specUrl = null;
  try {
    const found = await fetchSpec(baseUrl, args.specPath);
    doc = found.doc;
    specUrl = found.url;
  } catch (error) {
    process.stderr.write(`[${baseUrl}] ${error.message}\n`);
    process.stderr.write(
      '\nDerive the paths from the routes registered in the source, or from the paths ' +
        'named in the requirement, and write the plan by hand.\n',
    );
    return 1;
  }

  if (args.skeleton) {
    const skeleton = buildSkeleton(baseUrl, { service: { url: specUrl, doc } });
    if (args.json) {
      process.stdout.write(`${JSON.stringify(skeleton, null, 2)}\n`);
    } else {
      printService('service', baseUrl, doc);
      process.stdout.write(
        '\n--- plan skeleton (each step only shows that the endpoint answers) ---\n',
      );
      process.stdout.write(`${JSON.stringify(skeleton, null, 2)}\n`);
    }
  } else if (args.json) {
    process.stdout.write(
      `${JSON.stringify({ base_url: baseUrl, spec_url: specUrl, paths: doc.paths }, null, 2)}\n`,
    );
  } else {
    printService('service', baseUrl, doc);
  }

  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
