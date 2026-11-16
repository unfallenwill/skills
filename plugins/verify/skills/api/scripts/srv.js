#!/usr/bin/env node
/**
 * Start services with the repository's OWN native start command; this script is only a thin shell.
 *
 * The plugin never decides how a service boots. The start command always comes from the
 * repository's own toolchain (`npm run dev`, `uv run uvicorn ...`, `make dev`,
 * `docker compose up ...`). This script turns that command into a controllable,
 * observable, reclaimable background process:
 *
 *   - allocate a free port and inject it into the command (`{port}`) and the environment
 *   - inject environment variables (e.g. a DATABASE_URL pointing at a throwaway database)
 *   - poll a readiness URL until the service actually answers
 *   - capture stdout/stderr into a log file so tracebacks are readable on failure
 *   - kill the whole process group on shutdown so nothing keeps holding a port
 *
 * Usage:
 *   srv.js up   [--service NAME]... [--all] [--config PATH] [--start CMD --name NAME]
 *   srv.js down [--service NAME]... [--keep]
 *   srv.js status
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const HOST = '127.0.0.1';
const PORT_BASE = Number(process.env.VERIFY_PORT_BASE || 8800);
const DEFAULT_TIMEOUT = Number(process.env.VERIFY_TIMEOUT || 60);
const CONFIG_NAMES = ['verify.json', '.verify.json', '.verify/config.json'];

// Only these placeholders are substituted. Anything else in braces is left alone,
// because commands legitimately contain things like awk's `{print $1}`.
const PLACEHOLDER = /\{(host|port|base_url|tmpdir|cwd|name|run_dir)\}/g;

// Flags that take no value. They must never swallow the token that follows them.
const BOOLEAN_FLAGS = new Set(['all', 'keep']);

// A `sqlite:///` URL points at a file; that file is a run artifact: cleared before
// `up` so every run starts from an empty database, removed on `down`.
// `sqlite:///relative.db` is relative, `sqlite:////absolute.db` is absolute.
const SQLITE_URL = /^sqlite(?:\+[A-Za-z0-9_]+)?:\/\/\/?(?<path>.*)$/;

function die(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// --------------------------------------------------------------------------- //
// Paths and configuration
// --------------------------------------------------------------------------- //

/** Walk up to the repository root (a directory containing .git); fall back to the start path. */
function findRepoRoot(start) {
  let current = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}

/**
 * Temporary directory for this run.
 *
 * Set `VERIFY_RUN_DIR` to isolate parallel runs (separate worktrees, separate
 * branches) — otherwise two runs of the same repository fight over the port and the
 * throwaway database.
 */
function runDirFor(repoRoot) {
  if (process.env.VERIFY_RUN_DIR) return path.resolve(process.env.VERIFY_RUN_DIR);
  const digest = crypto.createHash('sha256').update(repoRoot).digest('hex').slice(0, 8);
  return path.join(os.tmpdir(), `verify-${digest}`);
}

/**
 * Load the service configuration.
 *
 * Lookup order: `--config` > `VERIFY_CONFIG` > conventional file names in the repo root.
 *
 * @returns {{config: object, path: string|null}}
 */
function loadConfig(repoRoot, explicit) {
  const candidates = [];
  if (explicit) candidates.push(path.resolve(explicit));
  if (process.env.VERIFY_CONFIG) candidates.push(path.resolve(process.env.VERIFY_CONFIG));
  for (const name of CONFIG_NAMES) candidates.push(path.join(repoRoot, name));

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(candidate, 'utf8'));
    } catch (error) {
      die(`Config file ${candidate} is not valid JSON: ${error.message}`);
    }
    return { config: data, path: candidate };
  }
  return { config: {}, path: null };
}

/** Recursively substitute known placeholders; unknown `{...}` sequences stay as they are. */
function render(value, context) {
  if (typeof value === 'string') {
    return value.replace(PLACEHOLDER, (match, key) =>
      Object.prototype.hasOwnProperty.call(context, key) ? String(context[key]) : match,
    );
  }
  if (Array.isArray(value)) return value.map((item) => render(item, context));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = render(item, context);
    return out;
  }
  return value;
}

/** Validate a service definition and fill in defaults. */
function normalizeService(spec, repoRoot) {
  if (!spec.name) die('Service definition is missing `name`.');
  if (!spec.start) die(`Service ${spec.name} is missing \`start\` (the start command).`);
  const ready = typeof spec.ready === 'string' ? { url: spec.ready } : spec.ready || {};
  return {
    name: spec.name,
    cwd: path.resolve(repoRoot, spec.cwd || '.'),
    start: spec.start,
    env: { ...(spec.env || {}) },
    ready: {
      url: ready.url || '/',
      status: ready.status === undefined ? null : ready.status,
      method: (ready.method || 'GET').toUpperCase(),
      timeout: Number(ready.timeout || DEFAULT_TIMEOUT),
    },
    port: spec.port,
    artifacts: spec.artifacts || [],
  };
}

/** Turn the config's service list into normalized service definitions. */
function discoverServices(config, repoRoot) {
  const raw = config.services || [];
  const list = Array.isArray(raw)
    ? raw
    : Object.entries(raw).map(([name, spec]) => ({ name, ...spec }));
  return list.map((spec) => normalizeService(spec, repoRoot));
}

// --------------------------------------------------------------------------- //
// Ports and processes
// --------------------------------------------------------------------------- //

/** Check whether a port can be bound. */
function portIsFree(port) {
  const net = require('net');
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, HOST);
  });
}

/** Find an unused port, starting at `preferred`. */
async function pickPort(preferred, taken) {
  const base = preferred ? Number(preferred) : PORT_BASE;
  for (let port = base; port < base + 200; port += 1) {
    if (!taken.has(port) && (await portIsFree(port))) return port;
  }
  die(`No free port in range ${base}..${base + 200}`);
}

/** Read the last few lines of a log file. */
function logTail(filePath, lines = 30) {
  if (!filePath || !fs.existsSync(filePath)) return '(no log)';
  const content = fs.readFileSync(filePath, 'utf8').split('\n');
  return content.slice(-lines).join('\n');
}

/**
 * Turn a service name into something safe to use as a file name.
 *
 * A name comes from a config file or a command line, so it may contain a path
 * separator; without this, `../../etc/passwd` would escape the run directory.
 */
function safeFileName(name) {
  const cleaned = String(name).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '');
  return cleaned || 'service';
}

/**
 * Wait until the service actually answers.
 *
 * By default ANY HTTP response counts as ready — a 404 still proves the process is up
 * and serving; only that particular path is missing. Pass `ready.status` to demand
 * specific status codes.
 *
 * Throws on failure rather than exiting: the caller must still be able to tear down
 * the services that were already started in this run.
 */
async function waitReady(baseUrl, spec, child, logPath) {
  const { url, status: allowed, method, timeout } = spec.ready;
  const target = baseUrl + url;
  const deadline = Date.now() + timeout * 1000;
  let lastError = '';

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw startupError(
        `[${spec.name}] Process exited (code ${child.exitCode}). Log tail:\n${logTail(logPath)}`,
      );
    }
    try {
      const response = await fetch(target, {
        method,
        signal: AbortSignal.timeout(3000),
        redirect: 'manual',
      });
      const allowedList = allowed === null ? null : [].concat(allowed);
      if (allowedList === null || allowedList.includes(response.status)) return;
      lastError = `status ${response.status}, expected ${allowedList.join('/')}`;
    } catch (error) {
      lastError = `${error.name}: ${error.message}`;
    }
    await sleep(300);
  }

  throw startupError(
    `[${spec.name}] Timed out waiting for ${target} (${timeout}s). Last error: ${lastError}\n` +
      `Log tail:\n${logTail(logPath)}`,
  );
}

/** An error whose message is meant for the user, not a stack trace. */
function startupError(message) {
  const error = new Error(message);
  error.expected = true;
  return error;
}

/** Kill a process group, escalating to SIGKILL. */
function killEntries(entries) {
  for (const entry of entries) {
    if (!entry.pid) continue;
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      try {
        process.kill(-entry.pid, signal);
      } catch (error) {
        break;
      }
      sleepSync(400);
      try {
        process.kill(-entry.pid, 0);
      } catch (error) {
        break;
      }
    }
  }
}

/** Blocking sleep, used while waiting for a process to die. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Non-blocking sleep. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --------------------------------------------------------------------------- //
// Run artifacts
// --------------------------------------------------------------------------- //

/**
 * Collect the files this run creates: the ones listed in `artifacts`, plus any
 * `sqlite:///` URL found in the environment overrides (the usual way to point a
 * service at a throwaway database).
 *
 * Only paths inside the run directory are ever returned, so a stray path in the
 * config can never delete development data.
 */
function collectArtifacts(spec, context) {
  const found = [];
  for (const item of spec.artifacts) found.push(render(String(item), context));
  for (const value of Object.values(spec.env)) {
    const match = SQLITE_URL.exec(render(String(value), context));
    if (match) found.push(match.groups.path);
  }

  const tmpdir = String(context.tmpdir).replace(/\/+$/, '');
  const safe = new Set();
  for (const candidate of found) {
    const absolute = path.isAbsolute(candidate)
      ? candidate
      : path.resolve(context.cwd, candidate);
    if (absolute.startsWith(`${tmpdir}/`)) safe.add(absolute);
  }
  return [...safe];
}

/** Delete throwaway files, including the SQLite -wal / -shm side files. */
function removeFiles(paths) {
  for (const target of paths || []) {
    for (const candidate of [target, `${target}-wal`, `${target}-shm`]) {
      try {
        if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
      } catch (error) {
        /* nothing we can do about it */
      }
    }
  }
}

// --------------------------------------------------------------------------- //
// Manifest
// --------------------------------------------------------------------------- //

function manifestPath(runDir) {
  return path.join(runDir, 'manifest.json');
}

function loadManifest(runDir) {
  const file = manifestPath(runDir);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return null;
  }
}

function saveManifest(runDir, manifest) {
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(manifestPath(runDir), `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: 'utf8',
    // The manifest holds resolved environment values, which may carry credentials.
    mode: 0o600,
  });
  try {
    fs.chmodSync(manifestPath(runDir), 0o600);
  } catch (error) {
    /* not fatal */
  }
}

// --------------------------------------------------------------------------- //
// Subcommands
// --------------------------------------------------------------------------- //

/**
 * Parse `--flag value` / `--flag=value` / repeated flags into an object.
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
    if (parsed[camel] === undefined) {
      parsed[camel] = value;
    } else if (Array.isArray(parsed[camel])) {
      parsed[camel].push(value);
    } else {
      parsed[camel] = [parsed[camel], value];
    }
  }
  return parsed;
}

/** Normalize a repeatable option into an array. */
function asArray(value) {
  if (value === undefined || value === true) return [];
  return Array.isArray(value) ? value : [value];
}

async function cmdUp(args) {
  const repoRoot = findRepoRoot(process.cwd());
  const { config, path: configPath } = loadConfig(repoRoot, args.config);
  const services = discoverServices(config, repoRoot);

  // A service given straight on the command line, so no config file is required.
  if (args.start) {
    const env = {};
    for (const item of asArray(args.env)) {
      if (typeof item === 'string' && item.includes('=')) {
        const eq = item.indexOf('=');
        env[item.slice(0, eq)] = item.slice(eq + 1);
      }
    }
    services.push(
      normalizeService(
        {
          name: args.name || 'service',
          cwd: args.cwd || '.',
          start: args.start,
          ready: {
            url: args.readyUrl || '/',
            status: args.readyStatus === undefined ? null : asArray(args.readyStatus).map(Number),
          },
          env,
          port: args.port,
        },
        repoRoot,
      ),
    );
  }

  if (services.length === 0) {
    die(
      'No service to start. Write a verify.json (see references/runner-config.md), ' +
        'or pass a start command directly: --start "npm run dev"',
    );
  }

  // `--service` selects among the services of the config file. A service given with
  // `--start` is always started as well: it was named explicitly on the command line,
  // so filtering it out would silently drop it.
  if (args.service && !args.all) {
    const wanted = new Set(asArray(args.service));
    const known = new Set(services.map((service) => service.name));
    const missing = [...wanted].filter((name) => !known.has(name));
    if (missing.length > 0) {
      die(
        `Unknown service(s): ${missing.join(', ')}; available: ${[...known].sort().join(', ')}`,
      );
    }
    const configCount = services.length - (args.start ? 1 : 0);
    const configServices = services.slice(0, configCount);
    const adhocServices = services.slice(configCount);
    services.splice(
      0,
      services.length,
      ...configServices.filter((service) => wanted.has(service.name)),
      ...adhocServices,
    );
  }

  // Two services sharing a name would share a log file and a manifest key, and the
  // second would silently win.
  const names = services.map((service) => service.name);
  const duplicates = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
  if (duplicates.length > 0) {
    die(
      `Duplicate service name(s): ${duplicates.join(', ')}. Service names must be ` +
        'unique - they are the keys used by the manifest and by the plan.',
    );
  }

  const runDir = args.runDir ? path.resolve(args.runDir) : runDirFor(repoRoot);
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(runDir, 0o700);
  } catch (error) {
    /* not fatal: the directory may be owned by another user */
  }

  // A previous run may still be alive: reclaim its port and database first.
  const previous = loadManifest(runDir);
  if (previous) {
    killEntries(previous.services || []);
    for (const entry of previous.services || []) {
      removeFiles(entry.artifacts);
      if (entry.log) fs.rmSync(entry.log, { force: true });
    }
  }

  const entries = [];
  const spawned = [];
  const taken = new Set();
  try {
    for (const service of services) {
      const port = await pickPort(service.port, taken);
      taken.add(port);
      const baseUrl = `http://${HOST}:${port}`;
      const context = {
        host: HOST,
        port,
        base_url: baseUrl,
        tmpdir: runDir,
        run_dir: runDir,
        cwd: service.cwd,
        name: service.name,
      };

      const env = { ...process.env };
      for (const [key, value] of Object.entries(service.env)) {
        env[key] = String(render(value, context));
      }
      env.VERIFY_SERVICE = service.name;
      env.VERIFY_BASE_URL = baseUrl;
      env.VERIFY_PORT = String(port);

      const command = render(service.start, context);
      const logPath = path.join(runDir, `${safeFileName(service.name)}.log`);
      const logFd = fs.openSync(logPath, 'w');
      const child = spawn(command, {
        shell: true,
        cwd: service.cwd,
        env,
        stdio: ['ignore', logFd, logFd],
        detached: true, // own process group, so the whole tree can be killed later
      });
      fs.closeSync(logFd);
      // Track every child, including one that fails to come up: a failure halfway
      // through must not leave the services that already started running.
      spawned.push({ pid: child.pid });

      await waitReady(baseUrl, service, child, logPath);
      child.unref(); // let this CLI exit while the service keeps running

      entries.push({
        name: service.name,
        base_url: baseUrl,
        port,
        pid: child.pid,
        log: logPath,
        cwd: service.cwd,
        start: command,
        env: Object.fromEntries(
          Object.entries(service.env).map(([key, value]) => [
            key,
            String(render(value, context)),
          ]),
        ),
        artifacts: collectArtifacts(service, context),
      });
    }
  } catch (error) {
    killEntries(spawned);
    throw error;
  }

  saveManifest(runDir, {
    repo_root: repoRoot,
    run_dir: runDir,
    config: configPath,
    created_at: new Date().toISOString(),
    services: entries,
  });

  process.stdout.write(`Services are up (run directory ${runDir}):\n`);
  for (const entry of entries) {
    process.stdout.write(
      `  ${entry.name.padEnd(20)} ${entry.base_url.padEnd(28)} log ${entry.log}\n`,
    );
  }
  process.stdout.write(`When done, run: node ${process.argv[1]} down\n`);
  return 0;
}

function cmdDown(args) {
  const repoRoot = findRepoRoot(process.cwd());
  const runDir = args.runDir ? path.resolve(args.runDir) : runDirFor(repoRoot);
  const manifest = loadManifest(runDir);
  if (!manifest) {
    process.stdout.write('No services are running.\n');
    return 0;
  }

  let entries = manifest.services || [];
  if (args.service) {
    const wanted = new Set(asArray(args.service));
    entries = entries.filter((entry) => wanted.has(entry.name));
    if (entries.length === 0) {
      process.stdout.write('No matching services.\n');
      return 0;
    }
  }

  killEntries(entries);
  if (!args.keep) {
    for (const entry of entries) {
      removeFiles(entry.artifacts);
      if (entry.log) fs.rmSync(entry.log, { force: true });
    }
    if (!args.service) {
      fs.rmSync(manifestPath(runDir), { force: true });
      try {
        fs.rmdirSync(runDir); // only succeeds when empty
      } catch (error) {
        /* other runs may share the directory */
      }
    }
  }
  process.stdout.write(`Stopped ${entries.length} service(s).\n`);
  return 0;
}

function cmdStatus(args) {
  const repoRoot = findRepoRoot(process.cwd());
  const runDir = args.runDir ? path.resolve(args.runDir) : runDirFor(repoRoot);
  const manifest = loadManifest(runDir);
  if (!manifest) {
    process.stdout.write('No services are running.\n');
    return 0;
  }
  for (const entry of manifest.services || []) {
    let state = 'exited';
    try {
      process.kill(-entry.pid, 0);
      state = 'running';
    } catch (error) {
      state = 'exited';
    }
    process.stdout.write(
      `  ${entry.name.padEnd(20)} ${entry.base_url.padEnd(28)} ${state}\n`,
    );
  }
  return 0;
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const args = parseArgs(argv.slice(1));

  switch (command) {
    case 'up':
      return cmdUp(args);
    case 'down':
      return cmdDown(args);
    case 'status':
      return cmdStatus(args);
    default:
      process.stderr.write(
        'Usage: srv.js up|down|status [options]\n' +
          '  up     [--all] [--service NAME] [--config PATH] [--run-dir DIR]\n' +
          '         [--start CMD --name NAME] [--cwd DIR] [--ready-url PATH]\n' +
          '         [--ready-status CODE] [--env K=V] [--port N]\n' +
          '  down   [--service NAME] [--keep] [--run-dir DIR]\n' +
          '  status [--run-dir DIR]\n',
      );
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`${error.expected ? error.message : error.stack || error.message}\n`);
    process.exit(1);
  });
