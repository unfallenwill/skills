#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const url = require('url');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i += 1;
      }
    } else {
      positional.push(arg);
      i += 1;
    }
  }
  return { positional, flags };
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

function parseRelativeTime(input) {
  const match = String(input).match(/^(\d+(?:\.\d+)?)(s|m|h|d|w)$/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  const unit = match[2];
  const now = Date.now() / 1000;
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  return now - val * multipliers[unit];
}

function parseTime(input) {
  if (input === undefined || input === 'now') return Date.now() / 1000;
  const relative = parseRelativeTime(input);
  if (relative !== null) return relative;
  if (/^\d+(\.\d+)?$/.test(input)) return parseFloat(input);
  const parsed = Date.parse(input);
  if (!isNaN(parsed)) return parsed / 1000;
  throw new Error(`Cannot parse time: ${input}`);
}

function formatTimestamp(unixSec) {
  return new Date(unixSec * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// HTTP request helper (zero dependencies)
// ---------------------------------------------------------------------------

function httpRequest(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(targetUrl);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(targetUrl, { timeout: 30000 }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 500)}`));
        } else {
          resolve(body);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

// Streaming HTTP request for tail - keeps connection open, calls onLine for each NDJSON line
function httpStream(targetUrl, onLine) {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(targetUrl);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(targetUrl, { timeout: 0 }, (res) => {
      if (res.statusCode >= 400) {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString('utf-8').slice(0, 500)}`)));
        return;
      }
      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk.toString('utf-8');
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line
        for (const line of lines) {
          if (line.trim()) onLine(line);
        }
      });
      res.on('end', () => {
        if (buffer.trim()) onLine(buffer);
        resolve();
      });
    });
    req.on('error', reject);
    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => { req.destroy(); resolve(); });
  });
}

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

function buildBaseUrl(envVar) {
  let base = process.env[envVar];
  if (!base) {
    console.error(`Error: Environment variable ${envVar} is not set.`);
    process.exit(1);
  }
  base = base.replace(/\/+$/, '');
  return base;
}

function buildUrl(base, path, params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const separator = base.endsWith('/') ? '' : '/';
  return qs ? `${base}${separator}${path}?${qs}` : `${base}${separator}${path}`;
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function outputJson(data, raw) {
  if (raw) {
    console.log(typeof data === 'string' ? data : JSON.stringify(data));
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

function formatLogsResponse(body, raw) {
  if (raw) {
    console.log(body);
    return;
  }
  // VictoriaLogs returns NDJSON (one JSON object per line)
  const lines = body.trim().split('\n').filter(Boolean);
  const logs = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const core = {
        _time: entry._time,
        _stream: entry._stream,
        _msg: entry._msg || entry.message || entry.msg || '',
      };
      // Preserve valuable structured fields (OTel, severity, etc.)
      const extras = {};
      for (const [k, v] of Object.entries(entry)) {
        if (k.startsWith('_') || k === 'level' || k === 'error') continue;
        if (v !== undefined && v !== null && v !== '') {
          extras[k] = v;
        }
      }
      if (Object.keys(extras).length > 0) core._extra = extras;
      if (entry.level) core.level = entry.level;
      if (entry.error) core.error = entry.error;
      logs.push(core);
    } catch {
      logs.push({ _raw: line });
    }
  }
  console.log(JSON.stringify(logs, null, 2));
}

// ---------------------------------------------------------------------------
// Trace output formatting
// ---------------------------------------------------------------------------

function formatTraceCompact(trace) {
  const spans = trace.spans || [];
  const processes = trace.processes || {};
  const spanCount = spans.length;

  // Find root span (no CHILD_OF reference)
  const rootSpan = spans.find((s) =>
    !(s.references || []).some((r) => r.refType === 'CHILD_OF')
  ) || spans[0];

  // Collect service names
  const services = [...new Set(
    spans.map((s) => processes[s.processID]?.serviceName).filter(Boolean)
  )];

  // Count errors
  const errorCount = spans.filter((s) =>
    (s.tags || []).some((t) => t.key === 'error' && t.value !== 'unset' && t.value !== 'false')
  ).length;

  const result = {
    traceID: trace.traceID,
    spans: spanCount,
    duration: rootSpan ? formatDuration(rootSpan.duration) : '?',
    rootOperation: rootSpan?.operationName || '?',
    services,
  };
  if (errorCount > 0) result.errors = errorCount;
  return result;
}

function formatTraceVerbose(trace) {
  const spans = trace.spans || [];
  const processes = trace.processes || {};
  return {
    traceID: trace.traceID,
    spans: spans.map((s) => ({
      operation: s.operationName,
      service: processes[s.processID]?.serviceName || '?',
      duration: formatDuration(s.duration),
      ...(s.references?.length ? { parentSpanID: s.references[0].spanID } : {}),
      tags: Object.fromEntries((s.tags || []).map((t) => [t.key, t.value])),
    })),
  };
}

function formatDuration(microseconds) {
  if (microseconds === undefined || microseconds === null) return '?';
  if (microseconds < 1000) return `${microseconds}μs`;
  if (microseconds < 1e6) return `${(microseconds / 1000).toFixed(1)}ms`;
  if (microseconds < 6e7) return `${(microseconds / 1e6).toFixed(1)}s`;
  return `${(microseconds / 6e7).toFixed(1)}m`;
}

function outputTraces(data, verbose) {
  const traces = data.data || [];
  if (verbose) {
    console.log(JSON.stringify({
      total: data.total || traces.length,
      data: traces.map(formatTraceVerbose),
    }, null, 2));
  } else {
    console.log(JSON.stringify({
      total: data.total || traces.length,
      traces: traces.map(formatTraceCompact),
    }, null, 2));
  }
}

// ---------------------------------------------------------------------------
// Metrics commands
// ---------------------------------------------------------------------------

async function cmdMetricsQuery(positional, flags) {
  const query = positional[0];
  if (!query) throw new Error('Usage: metrics query <MetricsQL expression>');
  const base = buildBaseUrl('VICTORIA_METRICS_URL');
  const params = { query, time: flags.time ? parseTime(flags.time) : undefined };
  const u = buildUrl(base, 'api/v1/query', params);
  const body = await httpRequest(u);
  outputJson(JSON.parse(body), flags.raw);
}

async function cmdMetricsRange(positional, flags) {
  const query = positional[0];
  if (!query) throw new Error('Usage: metrics range <MetricsQL expression>');
  const base = buildBaseUrl('VICTORIA_METRICS_URL');
  const start = parseTime(flags.start || '1h');
  const end = parseTime(flags.end || 'now');
  const params = {
    query,
    start: String(start),
    end: String(end),
    step: flags.step || '5m',
  };
  const u = buildUrl(base, 'api/v1/query_range', params);
  const body = await httpRequest(u);
  outputJson(JSON.parse(body), flags.raw);
}

async function cmdMetricsLabels(positional, flags) {
  const base = buildBaseUrl('VICTORIA_METRICS_URL');
  const params = {};
  if (positional[0]) params['match[]'] = positional[0];
  if (flags.start) params.start = String(parseTime(flags.start));
  if (flags.end) params.end = String(parseTime(flags.end));
  const u = buildUrl(base, 'api/v1/labels', params);
  const body = await httpRequest(u);
  outputJson(JSON.parse(body), flags.raw);
}

async function cmdMetricsLabelValues(positional, flags) {
  const label = positional[0];
  if (!label) throw new Error('Usage: metrics label-values <label name>');
  const base = buildBaseUrl('VICTORIA_METRICS_URL');
  const params = {};
  if (positional[1]) params['match[]'] = positional[1];
  if (flags.start) params.start = String(parseTime(flags.start));
  if (flags.end) params.end = String(parseTime(flags.end));
  const u = buildUrl(base, `api/v1/label/${label}/values`, params);
  const body = await httpRequest(u);
  outputJson(JSON.parse(body), flags.raw);
}

async function cmdMetricsSeries(positional, flags) {
  const match = positional[0];
  if (!match) throw new Error('Usage: metrics series <match selector>');
  const base = buildBaseUrl('VICTORIA_METRICS_URL');
  const params = { 'match[]': match };
  if (flags.start) params.start = String(parseTime(flags.start));
  if (flags.end) params.end = String(parseTime(flags.end));
  if (flags.limit) params.limit = flags.limit;
  const u = buildUrl(base, 'api/v1/series', params);
  const body = await httpRequest(u);
  outputJson(JSON.parse(body), flags.raw);
}

async function cmdMetricsExport(positional, flags) {
  const match = positional[0];
  if (!match) throw new Error('Usage: metrics export <match selector>');
  const base = buildBaseUrl('VICTORIA_METRICS_URL');
  const params = { 'match[]': match };
  if (flags.start) params.start = String(parseTime(flags.start));
  if (flags.end) params.end = String(parseTime(flags.end));
  const u = buildUrl(base, 'api/v1/export', params);
  const body = await httpRequest(u);
  // Export returns NDJSON
  if (flags.raw) {
    console.log(body);
  } else {
    const lines = body.trim().split('\n').filter(Boolean);
    const records = lines.map((l) => {
      try { return JSON.parse(l); } catch { return l; }
    });
    console.log(JSON.stringify(records, null, 2));
  }
}

// ---------------------------------------------------------------------------
// Logs commands
// ---------------------------------------------------------------------------

async function cmdLogsQuery(positional, flags) {
  const query = positional[0];
  if (!query) throw new Error('Usage: logs query <LogsQL expression>');
  const base = buildBaseUrl('VICTORIA_LOGS_URL');
  const params = { query };
  if (flags.start) params.start = String(Math.round(parseTime(flags.start)));
  if (flags.end) params.end = String(Math.round(parseTime(flags.end)));
  if (flags.limit) params.limit = flags.limit;
  const u = buildUrl(base, 'select/logsql/query', params);
  const body = await httpRequest(u);
  formatLogsResponse(body, flags.raw);
}

async function cmdLogsHits(positional, flags) {
  const query = positional[0];
  if (!query) throw new Error('Usage: logs hits <LogsQL expression>');
  const base = buildBaseUrl('VICTORIA_LOGS_URL');
  const params = { query, step: flags.step || '1h' };
  if (flags.start) params.start = String(Math.round(parseTime(flags.start)));
  if (flags.end) params.end = String(Math.round(parseTime(flags.end)));
  const u = buildUrl(base, 'select/logsql/hits', params);
  const body = await httpRequest(u);
  outputJson(JSON.parse(body), flags.raw);
}

async function cmdLogsFieldNames(positional, flags) {
  const base = buildBaseUrl('VICTORIA_LOGS_URL');
  const params = { query: positional[0] || '*' };
  if (flags.start) params.start = String(Math.round(parseTime(flags.start)));
  if (flags.end) params.end = String(Math.round(parseTime(flags.end)));
  const u = buildUrl(base, 'select/logsql/field_names', params);
  const body = await httpRequest(u);
  outputJson(JSON.parse(body), flags.raw);
}

async function cmdLogsFieldValues(positional, flags) {
  const field = positional[0];
  if (!field) throw new Error('Usage: logs field-values <field name>');
  const base = buildBaseUrl('VICTORIA_LOGS_URL');
  const params = { field, query: positional[1] || '*' };
  if (flags.start) params.start = String(Math.round(parseTime(flags.start)));
  if (flags.end) params.end = String(Math.round(parseTime(flags.end)));
  if (flags.limit) params.limit = flags.limit;
  const u = buildUrl(base, 'select/logsql/field_values', params);
  const body = await httpRequest(u);
  outputJson(JSON.parse(body), flags.raw);
}

async function cmdLogsStreams(positional, flags) {
  const base = buildBaseUrl('VICTORIA_LOGS_URL');
  // streams endpoint requires a query parameter; default to match all
  const params = { query: positional[0] || '*' };
  if (flags.start) params.start = String(Math.round(parseTime(flags.start)));
  if (flags.end) params.end = String(Math.round(parseTime(flags.end)));
  if (flags.limit) params.limit = flags.limit;
  const u = buildUrl(base, 'select/logsql/streams', params);
  const body = await httpRequest(u);
  outputJson(JSON.parse(body), flags.raw);
}

async function cmdLogsTail(positional, flags) {
  const query = positional[0] || '*';
  const base = buildBaseUrl('VICTORIA_LOGS_URL');
  const params = { query };
  if (flags.start) params.start = String(Math.round(parseTime(flags.start)));
  if (flags['refresh-interval']) params.refresh_interval = flags['refresh-interval'];
  const u = buildUrl(base, 'select/logsql/tail', params);

  console.error(`Tailing logs... (Ctrl+C to stop)`);
  console.error(`Query: ${query}`);
  console.error('---');

  await httpStream(u, (line) => {
    try {
      const entry = JSON.parse(line);
      const msg = entry._msg || entry.message || entry.msg || '';
      const time = entry._time || '';
      const level = entry.severity || entry.level || '';
      const prefix = level ? `[${level}] ` : '';
      // Compact one-line output for tail
      console.log(`${time} ${prefix}${msg}`);
    } catch {
      console.log(line);
    }
  });
}

// ---------------------------------------------------------------------------
// Traces commands (Jaeger-compatible API)
// ---------------------------------------------------------------------------

async function cmdTracesServices(positional, flags) {
  const base = buildBaseUrl('VICTORIA_TRACES_URL');
  const u = buildUrl(base, 'select/jaeger/api/services', {});
  const body = await httpRequest(u);
  outputJson(JSON.parse(body), flags.raw);
}

async function cmdTracesOperations(positional, flags) {
  const service = positional[0];
  if (!service) throw new Error('Usage: traces operations <service name>');
  const base = buildBaseUrl('VICTORIA_TRACES_URL');
  const u = buildUrl(base, `select/jaeger/api/services/${encodeURIComponent(service)}/operations`, {});
  const body = await httpRequest(u);
  outputJson(JSON.parse(body), flags.raw);
}

async function cmdTracesSearch(positional, flags) {
  const base = buildBaseUrl('VICTORIA_TRACES_URL');
  const params = {};
  if (flags.service) params.service = flags.service;
  else throw new Error('traces search requires --service <name>. Run "traces services" to list available services.');
  if (flags.operation) params.operation = flags.operation;
  if (flags.tags) params.tags = flags.tags;
  if (flags.minDuration) params.minDuration = flags.minDuration;
  if (flags.maxDuration) params.maxDuration = flags.maxDuration;
  if (flags.limit) params.limit = flags.limit;
  // Default to last 1 hour if no start specified
  const tStart = flags.start ? parseTime(flags.start) : parseTime('1h');
  const tEnd = flags.end ? parseTime(flags.end) : parseTime('now');
  params.start = String(Math.round(tStart * 1e6));
  params.end = String(Math.round(tEnd * 1e6));
  const u = buildUrl(base, 'select/jaeger/api/traces', params);
  const body = await httpRequest(u);
  const data = JSON.parse(body);
  outputTraces(data, flags.verbose);
}

async function cmdTracesGet(positional, flags) {
  const traceID = positional[0];
  if (!traceID) throw new Error('Usage: traces get <trace ID>');
  const base = buildBaseUrl('VICTORIA_TRACES_URL');
  const u = buildUrl(base, `select/jaeger/api/traces/${traceID}`, {});
  const body = await httpRequest(u);
  const data = JSON.parse(body);
  outputTraces(data, flags.verbose);
}

async function cmdTracesDependencies(positional, flags) {
  const base = buildBaseUrl('VICTORIA_TRACES_URL');
  const params = {};
  const tStart = flags.start ? parseTime(flags.start) : parseTime('24h');
  const tEnd = flags.end ? parseTime(flags.end) : parseTime('now');
  params.start = String(Math.round(tStart * 1e6));
  params.end = String(Math.round(tEnd * 1e6));
  const u = buildUrl(base, 'select/jaeger/api/dependencies', params);
  const body = await httpRequest(u);
  outputJson(JSON.parse(body), flags.raw);
}

// ---------------------------------------------------------------------------
// Command routing
// ---------------------------------------------------------------------------

const COMMANDS = {
  metrics: {
    query: cmdMetricsQuery,
    range: cmdMetricsRange,
    labels: cmdMetricsLabels,
    'label-values': cmdMetricsLabelValues,
    series: cmdMetricsSeries,
    export: cmdMetricsExport,
  },
  logs: {
    query: cmdLogsQuery,
    hits: cmdLogsHits,
    'field-names': cmdLogsFieldNames,
    'field-values': cmdLogsFieldValues,
    streams: cmdLogsStreams,
    tail: cmdLogsTail,
  },
  traces: {
    services: cmdTracesServices,
    operations: cmdTracesOperations,
    search: cmdTracesSearch,
    get: cmdTracesGet,
    dependencies: cmdTracesDependencies,
  },
};

function printHelp() {
  console.log(`
victoria-query - Query VictoriaMetrics, VictoriaLogs, and VictoriaTraces

Usage: node victoria-query.js <service> <action> [args...] [options]

Services and actions:
  metrics query <query>              Instant MetricsQL query
  metrics range <query>              Range MetricsQL query (--start, --end, --step)
  metrics labels [match]             List label names
  metrics label-values <label>       List label values
  metrics series <match>             Find time series
  metrics export <match>             Export raw data

  logs query <logsql>                LogsQL query
  logs hits <logsql>                 Log hit counts
  logs field-names [query]           List log field names
  logs field-values <field> [query]  List log field values
  logs streams                       List log streams
  logs tail [logsql]                 Live tail logs (Ctrl+C to stop)

  traces services                    List services
  traces operations <service>        List operations for a service
  traces search [options]            Search traces (--service, --operation, --tags,
                                      --minDuration, --maxDuration, --limit)
  traces get <traceID>               Get trace by ID
  traces dependencies                Service dependency graph

Options:
  --start <time>     Start time (relative: 1h, 30m, 24h, 7d | unix timestamp | RFC3339)
  --end <time>       End time (default: now)
  --step <duration>  Query step for range queries (default: 5m)
  --limit <n>        Limit number of results
  --raw              Output raw JSON without formatting
  --verbose          Show full trace span details (traces commands)

Environment variables:
  VICTORIA_METRICS_URL   VictoriaMetrics URL (e.g. http://localhost:8428)
  VICTORIA_LOGS_URL      VictoriaLogs URL (e.g. http://localhost:9429)
  VICTORIA_TRACES_URL    VictoriaTraces URL (e.g. http://localhost:9428)
`.trim());
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));

  if (positional.length === 0 || flags.help) {
    printHelp();
    process.exit(0);
  }

  const service = positional[0];
  const action = positional[1];

  if (!service || !action) {
    console.error('Error: Please specify <service> and <action>.');
    console.error('Run with --help for usage.');
    process.exit(1);
  }

  const serviceCommands = COMMANDS[service];
  if (!serviceCommands) {
    console.error(`Error: Unknown service "${service}". Use: metrics, logs, traces`);
    process.exit(1);
  }

  const cmd = serviceCommands[action];
  if (!cmd) {
    console.error(`Error: Unknown action "${action}" for service "${service}".`);
    console.error(`Available: ${Object.keys(serviceCommands).join(', ')}`);
    process.exit(1);
  }

  try {
    await cmd(positional.slice(2), flags);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
