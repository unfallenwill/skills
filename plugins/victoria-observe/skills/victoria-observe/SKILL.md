---
name: victoria-observe
description: >-
  Query and analyze observability data from VictoriaMetrics, VictoriaLogs, and VictoriaTraces.
  This skill should be used when the user wants to "query metrics", "check logs",
  "search traces", "analyze observability data", "debug with metrics",
  "find errors in logs", "trace a request", "check VictoriaMetrics",
  "query VictoriaLogs", "search VictoriaTraces", "query MetricsQL",
  "query LogsQL", "search Jaeger traces",
  "查询指标", "查看日志", "搜索链路", "分析可观测数据",
  "查一下 metrics", "看下日志有什么错误", "追踪一下这个请求",
  "通过 metrics 验证部署效果", "通过指标检查服务状态",
  "查 VictoriaMetrics", "看 VictoriaLogs", "搜 VictoriaTraces",
  or mentions analyzing metrics, logs, or distributed traces from
  VictoriaMetrics, VictoriaLogs, or VictoriaTraces.
  Do NOT use for GitHub issues, code analysis, or file editing.
argument-hint: "[service] [action] [query]"
---

# victoria-observe

Query and analyze observability data from VictoriaMetrics (metrics), VictoriaLogs (logs), and VictoriaTraces (distributed traces).

## Prerequisites

Before using this skill, verify these environment variables are set:

- `VICTORIA_METRICS_URL` — VictoriaMetrics endpoint (e.g. `http://localhost:8428`)
- `VICTORIA_LOGS_URL` — VictoriaLogs endpoint (e.g. `http://localhost:9429`)
- `VICTORIA_TRACES_URL` — VictoriaTraces endpoint (e.g. `http://localhost:9428`)

If any variable is missing, inform the user which one needs to be configured.

## Script Location

```bash
SCRIPT="$CLAUDE_PLUGIN_ROOT/skills/victoria-observe/scripts/victoria-query.js"
```

All commands follow the pattern:

```bash
node $SCRIPT <service> <action> [args...] [--start <time>] [--end <time>] [--limit <n>] [--raw]
```

**Time format**: Relative (`1h`, `30m`, `24h`, `7d`), Unix timestamp, or RFC3339. Default `--start` varies by command. Default `--end` is `now`.

## Important Notes

- **Cluster paths**: If the environment URL already includes `/select/0/prometheus`, do not add it again. The script appends API paths directly to the base URL.
- **LogsQL syntax**: Uses `_stream:{label="value"}` for stream filtering. Combine with `|` for pipes and `_time:<duration>` for relative time. Field names depend on your log pipeline (OTel uses `severity`, not `_level`).
- **Jaeger API compatibility**: VictoriaTraces uses Jaeger-compatible API. Durations use Go format (`500ms`, `1s`, `5m`). Tags are JSON objects. `--service` is required for `traces search`.
- **Output**: Default output is formatted JSON. Use `--raw` for raw API response. Trace output is compact by default (summary with span count, duration, services); use `--verbose` for full span-level details.

---

## Diagnostic Workflow

When the user describes a problem (bug, error, performance issue), follow this workflow:

### Phase 1: Scope the Problem

Ask or infer:
- What service/endpoint is affected?
- When did the issue start? (time range)
- What symptoms? (errors, latency, throughput drop)

### Phase 2: Metrics — Detect Anomalies

```bash
# Check if the service is up
node $SCRIPT metrics query 'up{job="<service>"}'

# Check error rate
node $SCRIPT metrics query 'sum(rate(http_requests_total{status=~"5.."}[5m])) by (job)'

# Check latency (p99)
node $SCRIPT metrics query 'histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, job))'

# Range query to see trends
node $SCRIPT metrics range 'rate(http_requests_total{job="<service>"}[5m])' --start 2h --step 1m
```

### Phase 3: Logs — Find Error Details

```bash
# Search for errors in the service logs
node $SCRIPT logs query '_stream:{app="<service>"} error' --start 2h

# Search for specific error messages
node $SCRIPT logs query '_stream:{app="<service>"} "panic" OR "fatal"' --start 2h --limit 50

# List available log fields for filtering
node $SCRIPT logs field-names '_stream:{app="<service>"}' --start 2h

# Check log volume over time
node $SCRIPT logs hits '_stream:{app="<service>"} error' --start 2h
```

### Phase 4: Traces — Trace the Request Path

```bash
# List available services
node $SCRIPT traces services

# Find slow requests for the service
node $SCRIPT traces search --service <service> --minDuration 1s --start 2h --limit 10

# Find error traces
node $SCRIPT traces search --service <service> --tags '{"error":"true"}' --start 2h --limit 10

# Get detailed trace by ID
node $SCRIPT traces get <traceID>

# Check service dependencies
node $SCRIPT traces dependencies --start 2h
```

### Phase 5: Correlate Findings

Cross-reference the three data sources:
1. Metrics showed the **what** (anomaly, spike, drop)
2. Logs showed the **why** (error message, stack trace)
3. Traces showed the **where** (which service, which call chain)

Summarize findings with specific timestamps, affected services, and root cause hypothesis.

---

## Query References

For detailed query syntax and templates per service, consult these reference files:

- `references/metrics-queries.md` — MetricsQL instant queries, range queries, metric discovery
- `references/logs-queries.md` — LogsQL log searches, log exploration, field discovery
- `references/traces-queries.md` — Trace search, service discovery, dependency maps

For end-to-end debugging workflows with concrete examples:

- `examples/debugging-scenarios.md` — Payment 502 errors, latency investigation, deployment verification
