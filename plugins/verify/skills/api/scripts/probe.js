#!/usr/bin/env node
/**
 * Run a declarative verification plan against a live service and check every response.
 *
 * The plan is a JSON file:
 *
 *   {
 *     "default_service": "api",
 *     "steps": [
 *       {
 *         "name": "create product",
 *         "method": "POST",
 *         "path": "/api/products",
 *         "body": { "sku": "SKU-1", "name": "Widget" },
 *         "expect": { "status": 201, "json": { "sku": "SKU-1" } }
 *       }
 *     ]
 *   }
 *
 * Step fields:
 *   name        step name; used in the report and for variable references
 *   service     service name; defaults to the plan's `default_service`
 *   base_url    service root URL (takes precedence over `service`)
 *   url         full URL (takes precedence over `base_url` and `path`)
 *   method      HTTP method, default GET
 *   path        request path; supports {{step.field}} references
 *   body        request body, sent as JSON
 *   headers     extra request headers
 *   expect      expectations:
 *                 status        status code, a number or a list of acceptable codes
 *                 json          subset match against the response JSON
 *                 json_paths    { "dotted.path": expected } pairs
 *                 text_contains substring that must appear in the raw response
 *
 * Every response body is stored in a variable table, so later steps can reference
 * earlier ones with {{step name.field}}.
 *
 * Usage:
 *   probe.js [--dry-run] [--json] [--manifest PATH] [--run-dir DIR] [--timeout MS] plan.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

// A reference is {{<step name>.<field path>}}. The step name may contain spaces and
// non-ASCII characters; the field path is dotted and may contain numeric list indexes.
// A step name must therefore not contain a dot.
const TEMPLATE = /\{\{([^{}]+)\}\}/g;

// A string that is exactly one reference, and nothing else.
const EXACT_REFERENCE = /^\{\{([^{}]+)\}\}$/;

const DEFAULT_TIMEOUT_MS = 15000;

// Flags that take no value. A flag of this kind must never swallow the token that
// follows it, or `probe.js --dry-run plan.json` would read the plan as the flag value.
const BOOLEAN_FLAGS = new Set(['dry-run', 'json']);

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

/** Temporary directory for this run; mirrors srv.js. */
function runDirFor(repoRoot) {
  if (process.env.VERIFY_RUN_DIR) return path.resolve(process.env.VERIFY_RUN_DIR);
  const crypto = require('crypto');
  const os = require('os');
  const digest = crypto.createHash('sha256').update(repoRoot).digest('hex').slice(0, 8);
  return path.join(os.tmpdir(), `verify-${digest}`);
}

/**
 * Resolve the services map (service name -> base URL) from the run manifest.
 *
 * @param {string} manifestPath  explicit manifest path
 * @param {string} runDir        explicit run directory
 * @returns {Record<string, string>}
 */
function resolveServices(manifestPath, runDir) {
  let file = manifestPath;
  if (!file) {
    const base = runDir ? path.resolve(runDir) : runDirFor(findRepoRoot(process.cwd()));
    file = path.join(base, 'manifest.json');
  }
  if (!fs.existsSync(file)) {
    throw new Error(
      `Cannot find ${file}. Start the services with srv.js up first, point at a ` +
        'manifest with --manifest, or set `base_url` (or `url`) on each step.',
    );
  }
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const services = {};
  for (const entry of manifest.services || []) services[entry.name] = entry.base_url;
  return services;
}

/**
 * Look up one reference and return the raw value.
 *
 * @throws {Error} when the step or the field does not exist
 */
function resolveReference(key, variables) {
  const trimmed = key.trim();
  const dot = trimmed.indexOf('.');
  const head = dot >= 0 ? trimmed.slice(0, dot) : trimmed;
  const rest = dot >= 0 ? trimmed.slice(dot + 1).split('.') : [];
  if (!Object.prototype.hasOwnProperty.call(variables, head)) {
    throw new Error(`undefined variable ${head}`);
  }
  let current = variables[head];
  for (const part of rest) {
    if (Array.isArray(current)) current = current[Number(part)];
    else if (current && typeof current === 'object') current = current[part];
    else throw new Error(`cannot read "${part}" from ${trimmed}`);
  }
  return current;
}

/**
 * Recursively substitute {{step.field}} placeholders.
 *
 * A string that is exactly one reference keeps the original JSON type of the value it
 * points at: a numeric field stays a number, so it can be compared against a numeric
 * response field. A reference embedded in a longer string is stringified.
 */
function render(value, variables) {
  if (typeof value === 'string') {
    const exact = EXACT_REFERENCE.exec(value);
    if (exact) return resolveReference(exact[1], variables);
    return value.replace(TEMPLATE, (match, key) => String(resolveReference(key, variables)));
  }
  if (Array.isArray(value)) return value.map((item) => render(item, variables));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = render(item, variables);
    return out;
  }
  return value;
}

/** True when `actual` contains everything in `expected` (recursive subset match). */
function subsetMatches(expected, actual) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
    return Object.entries(expected).every(
      ([key, sub]) =>
        Object.prototype.hasOwnProperty.call(actual, key) && subsetMatches(sub, actual[key]),
    );
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) return false;
    return expected.every((item, index) => subsetMatches(item, actual[index]));
  }
  return Object.is(expected, actual);
}

/** Read a nested value by dotted path; lists are indexed numerically. */
function lookupPath(payload, dotted) {
  let current = payload;
  for (const part of dotted.split('.')) {
    if (Array.isArray(current)) current = current[Number(part)];
    else if (current && typeof current === 'object') current = current[part];
    else throw new Error(`${dotted}: "${part}" is not reachable`);
  }
  return current;
}

/**
 * A stand-in for a response body, used by dry runs.
 *
 * Any property resolves to a readable placeholder, so a plan can be checked without
 * having captured a single response.
 */
function makePlaceholder() {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === Symbol.toPrimitive) return () => 'object';
        return `<${String(property)}>`;
      },
    },
  );
}

// --------------------------------------------------------------------------- //
// Requests
// --------------------------------------------------------------------------- //

/**
 * Send one HTTP request.
 *
 * @returns {Promise<{status: number, payload: object|null, raw: string}>}
 */
async function sendRequest(method, url, body, headers, timeoutMs) {
  const requestHeaders = { accept: 'application/json' };
  for (const [key, value] of Object.entries(headers || {})) {
    requestHeaders[key] = String(value);
  }
  let payloadBody;
  if (body !== undefined && body !== null) {
    payloadBody = JSON.stringify(body);
    requestHeaders['content-type'] = requestHeaders['content-type'] || 'application/json';
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: payloadBody,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',
    });
  } catch (error) {
    return { status: 0, payload: null, raw: `request failed: ${error.name}: ${error.message}` };
  }

  const raw = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    payload = null;
  }
  return { status: response.status, payload, raw };
}

// --------------------------------------------------------------------------- //
// Execution
// --------------------------------------------------------------------------- //

/** Work out which URL a step should hit. */
function stepUrl(step, getServices, defaultService) {
  if (step.url) return step.url;
  let baseUrl = step.base_url;
  if (!baseUrl) {
    const name = step.service || defaultService;
    if (!name) throw new Error('no service / base_url / url: cannot resolve the request target');
    // Only steps that actually name a service need the manifest.
    const services = getServices();
    if (!Object.prototype.hasOwnProperty.call(services, name)) {
      throw new Error(
        `unknown service "${name}"; available: ${Object.keys(services).sort().join(', ') || '(none)'}`,
      );
    }
    baseUrl = services[name];
  }
  let suffix = step.path || '';
  if (suffix && !suffix.startsWith('/')) suffix = `/${suffix}`;
  return `${String(baseUrl).replace(/\/+$/, '')}${suffix}`;
}

/**
 * Render every expectation, so a broken reference inside one is reported even in a
 * dry run.
 *
 * @returns {{expect: object, problems: string[]}}
 */
function renderExpect(expect, variables) {
  const problems = [];
  const rendered = {};
  for (const [key, value] of Object.entries(expect || {})) {
    try {
      rendered[key] = render(value, variables);
    } catch (error) {
      problems.push(`expectation "${key}" has a broken reference: ${error.message}`);
    }
  }
  return { expect: rendered, problems };
}

/**
 * Execute the plan.
 *
 * @param {object} plan
 * @param {function(): Record<string, string>} getServices  resolves the manifest lazily
 * @param {boolean} dryRun    validate the plan without sending any request
 * @param {number} timeoutMs  per-request timeout
 * @returns {Promise<object[]>} one result record per step
 */
async function runPlan(plan, getServices, dryRun = false, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const variables = {};
  const results = [];
  const defaultService = plan.default_service;
  const steps = plan.steps || [];

  if (dryRun) {
    // Seed every step name with a placeholder so that references to a real step
    // resolve. A reference to a step that does not exist still fails, which is
    // exactly what a dry run is for. Steps without an explicit name get the same
    // auto-generated name they will have at runtime.
    steps.forEach((step, index) => {
      variables[step.name || `step-${index + 1}`] = makePlaceholder();
    });
  }

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const name = step.name || `step-${index + 1}`;
    const method = (step.method || 'GET').toUpperCase();

    let url;
    let body;
    let headers;
    let expect;
    let problems = [];
    try {
      url = String(render(stepUrl(step, getServices, defaultService), variables));
      body = render(step.body, variables);
      headers = render(step.headers, variables);
      const rendered = renderExpect(step.expect, variables);
      expect = rendered.expect;
      problems = problems.concat(rendered.problems);
    } catch (error) {
      results.push({
        step: name,
        status: 'ERROR',
        detail: `plan problem: ${error.message}`,
      });
      continue;
    }

    if (dryRun) {
      results.push({
        step: name,
        method,
        url,
        status: problems.length === 0 ? 'PASS' : 'FAIL',
        http_status: null,
        problems,
        response: null,
        dry_run: true,
      });
      continue;
    }

    const { status, payload, raw } = await sendRequest(method, url, body, headers, timeoutMs);

    const expectedStatus = expect.status;
    if (status === 0) {
      // The request never arrived (connection refused, timeout) - that is not a pass.
      problems.push(raw);
    } else if (expectedStatus !== undefined && expectedStatus !== null) {
      const allowed = [].concat(expectedStatus);
      if (!allowed.includes(status)) {
        problems.push(`status ${status}, expected ${allowed.join('/')}`);
      }
    }

    if (expect.json !== undefined && expect.json !== null) {
      if (payload === null) {
        problems.push(`response is not JSON: ${raw.slice(0, 200)}`);
      } else if (!subsetMatches(expect.json, payload)) {
        problems.push(
          `response JSON mismatch, expected to contain ${JSON.stringify(expect.json)}, ` +
            `got ${JSON.stringify(payload)}`,
        );
      }
    }

    for (const [dotted, wanted] of Object.entries(expect.json_paths || {})) {
      if (payload === null) {
        problems.push(`response is not JSON, cannot check path ${dotted}`);
        continue;
      }
      let actual;
      try {
        actual = lookupPath(payload, dotted);
      } catch (error) {
        problems.push(`cannot read ${dotted} from response: ${error.message}`);
        continue;
      }
      if (!Object.is(actual, wanted)) {
        problems.push(`${dotted} is ${JSON.stringify(actual)}, expected ${JSON.stringify(wanted)}`);
      }
    }

    if (expect.text_contains !== undefined && expect.text_contains !== null) {
      if (!raw.includes(String(expect.text_contains))) {
        problems.push(`response does not contain ${JSON.stringify(String(expect.text_contains))}`);
      }
    }

    if (payload !== null) variables[name] = payload;

    results.push({
      step: name,
      method,
      url,
      status: problems.length === 0 ? 'PASS' : 'FAIL',
      http_status: status,
      problems,
      response: payload !== null ? payload : raw.slice(0, 400),
    });
  }

  return results;
}

/** Print a human-readable report. */
function printReport(results) {
  for (const result of results) {
    if (result.status === 'ERROR') {
      process.stdout.write(`! ${result.step}  -> ${result.detail}\n`);
      continue;
    }
    const mark = result.status === 'PASS' ? 'OK' : 'FAIL';
    const suffix = result.dry_run ? '  (dry-run)' : '';
    process.stdout.write(`${mark} ${result.step}  [${result.method || ''} ${result.url || ''}]${suffix}\n`);
    if (result.http_status) process.stdout.write(`    HTTP ${result.http_status}\n`);
    for (const problem of result.problems || []) {
      process.stdout.write(`    -> ${problem}\n`);
    }
    if (result.status === 'FAIL' && result.response !== null && result.response !== undefined) {
      const body =
        typeof result.response === 'string' ? result.response : JSON.stringify(result.response);
      process.stdout.write(`    actual response: ${body}\n`);
    }
  }
  const failed = results.filter((result) => result.status !== 'PASS').length;
  const dryRun = results.length > 0 && results.every((result) => result.dry_run);
  if (dryRun) {
    // A dry run says the plan is well formed. It says nothing about the service.
    process.stdout.write(
      `\n${results.length - failed}/${results.length} steps validated (dry run - no requests sent).\n`,
    );
  } else {
    process.stdout.write(`\n${results.length - failed}/${results.length} steps passed.\n`);
  }
}

/**
 * Parse `--flag value` / `--flag=value` / repeated flags.
 *
 * Boolean flags never consume the following token: `probe.js --dry-run plan.json`
 * must treat `plan.json` as the plan, not as the value of `--dry-run`.
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
  const planFile = args._[0];

  if (!planFile) {
    process.stderr.write(
      'Usage: probe.js [--dry-run] [--json] [--manifest PATH] [--run-dir DIR] ' +
        '[--timeout MS] plan.json\n',
    );
    return 1;
  }

  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const steps = plan.steps || [];
  if (steps.length === 0) {
    process.stderr.write(
      `The plan ${planFile} has no steps. An empty plan verifies nothing - write the ` +
        'steps that the task goal requires.\n',
    );
    return 1;
  }

  const timeoutMs = args.timeout ? Number(args.timeout) : DEFAULT_TIMEOUT_MS;

  // The manifest is only read when a step actually names a service. A plan whose
  // steps carry their own base_url or url runs without one.
  let cachedServices = null;
  let servicesError = null;
  const getServices = () => {
    if (cachedServices) return cachedServices;
    if (!servicesError) {
      try {
        cachedServices = resolveServices(args.manifest, args.runDir);
      } catch (error) {
        servicesError = error;
      }
    }
    if (servicesError) throw servicesError;
    return cachedServices;
  };

  const results = await runPlan(plan, getServices, Boolean(args.dryRun), timeoutMs);

  const failed = results.filter((result) => result.status !== 'PASS').length;
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ results, failed }, null, 2)}\n`);
  } else {
    printReport(results);
  }
  return failed > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
