#!/usr/bin/env node
/**
 * Run a declarative test plan against a running service and check every response.
 *
 * The plan is a JSON file:
 *
 *   {
 *     "base_url": "http://127.0.0.1:3000",
 *     "steps": [
 *       {
 *         "name": "create product",
 *         "method": "POST",
 *         "path": "/api/products",
 *         "body": { "sku": "SKU-1", "name": "Widget" },
 *         "coverage": "verified",
 *         "expect": { "status": 201, "json": { "sku": "SKU-1" } }
 *       }
 *     ]
 *   }
 *
 * Step fields:
 *   name        step name; used in the report and for variable references
 *   base_url    service root URL for this step; overrides the plan's base_url
 *   url         full URL; overrides base_url and path
 *   method      HTTP method, default GET
 *   path        request path; supports {{step.field}} references
 *   body        request body, sent as JSON
 *   headers     extra request headers
 *   coverage    verified (default) | assumption | skipped
 *   note        why a step is skipped; shown under "Not verified"
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
 *   probe.js [--dry-run] [--json] [--base-url URL] [--timeout MS] plan.json
 */

'use strict';

const fs = require('fs');

// A reference is {{<step name>.<field path>}}. The step name may contain spaces and
// non-ASCII characters; the field path is dotted and may contain numeric list indexes.
// A step name must therefore not contain a dot - nor a brace, because the braces
// delimit the reference and cannot be nested.
const TEMPLATE = /\{\{([^{}]+)\}\}/g;

// A string that is exactly one reference, and nothing else.
const EXACT_REFERENCE = /^\{\{([^{}]+)\}\}$/;

const DEFAULT_TIMEOUT_MS = 15000;

// Flags that take no value. A flag of this kind must never swallow the token that
// follows it, or `probe.js --dry-run plan.json` would read the plan as the flag value.
const BOOLEAN_FLAGS = new Set(['dry-run', 'json']);

// What a step claims it established.
//
//   verified   - the step asserted something and counts as evidence
//   assumption - the step passed, but would pass even if the feature were broken
//   skipped    - the goal cannot be reached with an HTTP call; the step is not sent
const COVERAGE = new Set(['verified', 'assumption', 'skipped']);

/**
 * Resolve the base URL of a step.
 *
 * Precedence, most specific first: the step's own url, the step's base_url, the
 * plan's base_url, then --base-url from the command line.
 *
 * @returns {string} the root URL
 * @throws {Error} when no base URL is available at all
 */
function resolveBaseUrl(planBaseUrl, cliBaseUrl) {
  const candidates = [planBaseUrl, cliBaseUrl];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && candidate !== '') {
      return String(candidate);
    }
  }
  throw new Error(
    'no target: give the step a `url` or a `base_url`, give the plan a `base_url`, ' +
      'or pass --base-url',
  );
}

/** Work out which URL a step should hit. */
function stepUrl(step, planBaseUrl, cliBaseUrl) {
  if (step.url) return step.url;
  const baseUrl = step.base_url || resolveBaseUrl(planBaseUrl, cliBaseUrl);
  let suffix = step.path || '';
  if (suffix && !suffix.startsWith('/')) suffix = `/${suffix}`;
  return `${String(baseUrl).replace(/\/+$/, '')}${suffix}`;
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
    // A field that is not there is a broken reference. Resolving it to undefined
    // would send a request to a URL ending in "/undefined" and fail with a 404
    // that says nothing about the plan.
    if (current === undefined) throw new Error(`undefined field "${part}" in "${trimmed}"`);
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
    const out = value.replace(TEMPLATE, (match, key) => String(resolveReference(key, variables)));
    // A reference that survived the substitution was never parseable - a step name
    // containing braces, for example. Sending it literally would hit a URL full of
    // braces and fail with a confusing 404.
    if (out.includes('{{')) {
      throw new Error(
        `cannot parse the reference in "${value}" - a step name may not contain braces`,
      );
    }
    return out;
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
    if (!actual || typeof actual !== 'object') return false;
    const entries = Object.entries(expected);
    // An empty expectation constrains nothing, so it matches anything - including a
    // list. A populated one cannot match a list, which has no named fields.
    if (entries.length === 0) return true;
    if (Array.isArray(actual)) return false;
    return entries.every(
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
 * having captured a single response. The placeholder nests: a reference may walk
 * several levels deep into it, and the URL shows the path that was substituted.
 */
function makePlaceholder(prefix = 'value') {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === Symbol.toPrimitive) return () => `<${prefix}>`;
        return makePlaceholder(`${prefix}.${String(property)}`);
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
    const cause = error.cause && error.cause.code ? ` (${error.cause.code})` : '';
    return {
      status: 0,
      payload: null,
      raw: `request failed: ${error.name}: ${error.message}${cause}`,
    };
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
 * True when the step asserts something. A step that asserts nothing passes whatever
 * the service answers - it is not evidence of anything.
 */
function hasAssertion(expect) {
  if (!expect) return false;
  if (expect.status !== undefined && expect.status !== null) return true;
  // An empty object or an empty list constrains nothing, so it is not an assertion
  // by itself - but the other expectation types still count.
  if (expect.json !== undefined && expect.json !== null) {
    const empty = typeof expect.json === 'object' && Object.keys(expect.json).length === 0;
    if (!empty) return true;
  }
  if (expect.json_paths && Object.keys(expect.json_paths).length > 0) return true;
  // An empty substring is present in every body, so it constrains nothing.
  if (
    expect.text_contains !== undefined &&
    expect.text_contains !== null &&
    expect.text_contains !== ''
  ) {
    return true;
  }
  return false;
}

/**
 * Execute the plan.
 *
 * @param {object} plan
 * @param {string|null} cliBaseUrl  base URL from the command line
 * @param {boolean} dryRun    validate the plan without sending any request
 * @param {number} timeoutMs  per-request timeout
 * @returns {Promise<object[]>} one result record per step
 */
async function runPlan(plan, cliBaseUrl, dryRun = false, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const variables = {};
  const results = [];
  const planBaseUrl = plan.base_url;
  const steps = plan.steps || [];

  if (dryRun) {
    // Seed every step name with a placeholder so that references to a real step
    // resolve. A reference to a step that does not exist still fails, which is
    // exactly what a dry run is for. Steps without an explicit name get the same
    // auto-generated name they will have at runtime.
    steps.forEach((step, index) => {
      const name = step.name || `step-${index + 1}`;
      variables[name] = makePlaceholder(name);
    });
  }

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const name = step.name || `step-${index + 1}`;
    const method = (step.method || 'GET').toUpperCase();
    const coverage = step.coverage || 'verified';

    if (!COVERAGE.has(coverage)) {
      results.push({
        step: name,
        status: 'ERROR',
        coverage,
        detail:
          `plan problem: unknown coverage "${coverage}" ` +
          '(use verified, assumption or skipped)',
      });
      continue;
    }

    if (coverage === 'skipped') {
      // The goal cannot be reached with an HTTP call. The step is not sent; it is
      // reported as a gap, never as a pass.
      results.push({
        step: name,
        status: 'SKIPPED',
        coverage,
        note: step.note || null,
      });
      continue;
    }

    let url;
    let body;
    let headers;
    let expect;
    let problems = [];
    try {
      url = String(render(stepUrl(step, planBaseUrl, cliBaseUrl), variables));
      body = render(step.body, variables);
      headers = render(step.headers, variables);
      const rendered = renderExpect(step.expect, variables);
      expect = rendered.expect;
      problems = problems.concat(rendered.problems);
    } catch (error) {
      results.push({
        step: name,
        coverage,
        status: 'ERROR',
        detail: `plan problem: ${error.message}`,
      });
      continue;
    }

    // A step that asserts nothing passes whatever the service answers. That is not
    // evidence, so the plan is wrong rather than the service.
    if (!hasAssertion(expect)) {
      results.push({
        step: name,
        method,
        url,
        status: 'ERROR',
        coverage,
        problems: [
          'state the status code, or the fields, that the requirement calls for',
        ],
        detail: 'plan problem: this step asserts nothing - a step that cannot fail is not evidence',
        response: null,
      });
      continue;
    }

    if (dryRun) {
      results.push({
        step: name,
        method,
        url,
        coverage,
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
      coverage,
      status: problems.length === 0 ? 'PASS' : 'FAIL',
      http_status: status,
      problems,
      response: payload !== null ? payload : raw.slice(0, 400),
    });
  }

  return results;
}

/** Count what the run established. */
function summarize(results) {
  const summary = { verified: 0, failed: 0, assumption: 0, skipped: 0 };
  for (const result of results) {
    if (result.status === 'SKIPPED') summary.skipped += 1;
    else if (result.status !== 'PASS') summary.failed += 1;
    else if (result.coverage === 'assumption') summary.assumption += 1;
    else summary.verified += 1;
  }
  return summary;
}

/** Print a human-readable report. */
function printReport(results, dryRun = false) {
  for (const result of results) {
    if (result.status === 'ERROR') {
      process.stdout.write(`! ${result.step}  -> ${result.detail}\n`);
      for (const problem of result.problems || []) {
        process.stdout.write(`    -> ${problem}\n`);
      }
      continue;
    }
    if (result.status === 'SKIPPED') {
      const note = result.note ? `: ${result.note}` : '';
      process.stdout.write(`SKIP ${result.step}  (not verified${note})\n`);
      continue;
    }
    const mark = result.status === 'PASS' ? 'OK' : 'FAIL';
    const suffix = result.dry_run ? '  (dry-run)' : '';
    const kind = result.coverage === 'assumption' ? '  (assumption)' : '';
    process.stdout.write(
      `${mark} ${result.step}  [${result.method || ''} ${result.url || ''}]${suffix}${kind}\n`,
    );
    if (result.http_status) process.stdout.write(`    HTTP ${result.http_status}\n`);
    for (const problem of result.problems || []) {
      process.stdout.write(`    -> ${problem}\n`);
    }
    // A request that never arrived has no response body to show; the problem line
    // already says what went wrong.
    if (
      result.status === 'FAIL' &&
      result.http_status !== 0 &&
      result.response !== null &&
      result.response !== undefined
    ) {
      const body =
        typeof result.response === 'string' ? result.response : JSON.stringify(result.response);
      process.stdout.write(`    actual response: ${body}\n`);
    }
  }

  const summary = summarize(results);
  if (dryRun) {
    // A dry run says the plan is well formed. It says nothing about the service.
    // A skipped step is a gap, not a problem - it is not part of what was validated.
    const valid = results.filter((result) => result.status === 'PASS').length;
    const skipped = results.filter((result) => result.status === 'SKIPPED').length;
    const broken = results.length - valid - skipped;
    process.stdout.write(
      `\n${valid} of ${results.length - skipped} steps validated (dry run - no requests sent).\n`,
    );
    if (broken > 0) process.stdout.write(`${broken} plan problem(s) - see above.\n`);
    return;
  }
  process.stdout.write('\n');
  process.stdout.write(`Verified      ${summary.verified}  (counts as evidence)\n`);
  process.stdout.write(`Failed        ${summary.failed}\  (the service did not behave as required)\n`);
  process.stdout.write(
    `Assumptions   ${summary.assumption}  (passed, but would pass even if the feature were broken)\n`,
  );
  process.stdout.write(
    `Not verified  ${summary.skipped}  (goals this plan cannot check over HTTP)\n`,
  );
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
      'Usage: probe.js [--dry-run] [--json] [--base-url URL] [--timeout MS] plan.json\n',
    );
    return 1;
  }

  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  } catch (error) {
    process.stderr.write(`Cannot read the plan ${planFile}: ${error.message}\n`);
    return 1;
  }

  const steps = plan.steps || [];
  if (steps.length === 0) {
    process.stderr.write(
      `The plan ${planFile} has no steps. An empty plan verifies nothing - write the ` +
        'steps that the requirement calls for.\n',
    );
    return 1;
  }

  const timeoutMs = args.timeout ? Number(args.timeout) : DEFAULT_TIMEOUT_MS;
  const cliBaseUrl = args.baseUrl ? String(args.baseUrl) : null;

  const dryRun = Boolean(args.dryRun);
  const results = await runPlan(plan, cliBaseUrl, dryRun, timeoutMs);

  const failed = results.filter((result) => result.status !== 'PASS' && result.status !== 'SKIPPED')
    .length;
  if (args.json) {
    process.stdout.write(
      `${JSON.stringify({ results, summary: summarize(results), failed }, null, 2)}\n`,
    );
  } else {
    printReport(results, dryRun);
  }
  return failed > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
