---
name: victoriametrics-api
description: VictoriaMetrics HTTP API reference for querying metrics, exporting/importing data, TSDB stats, and administrative operations. This skill should be used when constructing HTTP requests to VictoriaMetrics, understanding query endpoints (/api/v1/query, /api/v1/query_range, /api/v1/export, /api/v1/import), response formats, checking cardinality, creating snapshots, or integrating with VictoriaMetrics API.
user-invocable: false
---

# VictoriaMetrics HTTP API Reference

VictoriaMetrics provides Prometheus-compatible querying API plus additional endpoints for data export/import, admin operations, and debugging.

## Endpoints Overview

| Endpoint | Purpose |
|----------|---------|
| `/api/v1/query` | Instant query (Prometheus-compatible) |
| `/api/v1/query_range` | Range query (Prometheus-compatible) |
| `/api/v1/series` | List time series matching a label selector |
| `/api/v1/labels` | List label names |
| `/api/v1/label/<labelName>/values` | List values for a label |
| `/api/v1/status/tsdb` | TSDB statistics (cardinality, top series) |
| `/api/v1/status/active_queries` | List currently running queries |
| `/api/v1/status/top_queries` | List top queries by stats |
| `/api/v1/export` | Export data (JSON line format) |
| `/api/v1/export/csv` | Export data (CSV format) |
| `/api/v1/export/native` | Export data (native format) |
| `/api/v1/import` | Import data (JSON line format) |
| `/api/v1/import/prometheus` | Import data (Prometheus exposition format) |
| `/api/v1/import/native` | Import data (native format) |
| `/api/v1/import/csv` | Import data (CSV format) |
| `/api/v1/admin/tsdb/delete_series` | Delete time series |
| `/api/v1/targets` | List scrape targets |
| `/api/v1/metadata` | List metric metadata |
| `/federate` | Federate data across instances |
| `/snapshot/create` | Create a backup snapshot |
| `/snapshot/list` | List snapshots |
| `/internal/force_flush` | Flush in-memory data to disk |
| `/internal/force_merge` | Force merge of partition data files |

Base URL: `http://<victoriametrics>:8428`

## Instant Query

**GET/POST** `/api/v1/query`

```bash
# Instant query at current time
curl "http://localhost:8428/api/v1/query?query=up"

# Query at specific time
curl "http://localhost:8428/api/v1/query?query=up&time=2024-01-01T00:00:00Z"

# Query with relative time
curl "http://localhost:8428/api/v1/query?query=up&time=now-1h"
```

Response:
```json
{
  "status": "success",
  "data": {
    "resultType": "vector",
    "result": [{
      "metric": {"__name__": "up", "job": "node", "instance": "localhost:9100"},
      "value": [1704067200, "1"]
    }]
  },
  "stats": {
    "executionTimeMsec": 0.5,
    "seriesFetched": 3
  }
}
```

## Range Query

**GET/POST** `/api/v1/query_range`

```bash
curl "http://localhost:8428/api/v1/query_range" \
  -d 'query=rate(http_requests_total[5m])' \
  -d 'start=2024-01-01T00:00:00Z' \
  -d 'end=2024-01-01T01:00:00Z' \
  -d 'step=60s'
```

Response returns `resultType: "matrix"` with arrays of `[timestamp, value]` pairs per series.

## Series Matching

**GET/POST** `/api/v1/series`

```bash
curl "http://localhost:8428/api/v1/series" \
  -d 'match[]=http_requests_total' \
  -d 'start=2024-01-01T00:00:00Z' \
  -d 'end=now'
```

Response:
```json
{
  "status": "success",
  "data": [
    {"__name__": "http_requests_total", "method": "GET", "status": "200"},
    {"__name__": "http_requests_total", "method": "POST", "status": "500"}
  ]
}
```

Default time range: last day starting at 00:00 UTC (unlike Prometheus which defaults to all time).

## Labels and Values

### List Label Names

```bash
curl "http://localhost:8428/api/v1/labels" -d 'start=2024-01-01T00:00:00Z' -d 'end=now'
```

### List Label Values

```bash
curl "http://localhost:8428/api/v1/label/job/values" -d 'start=2024-01-01T00:00:00Z' -d 'end=now'
```

Both default to last day starting at 00:00 UTC when `start`/`end` are omitted.

## TSDB Statistics

**GET** `/api/v1/status/tsdb`

```bash
# Basic stats
curl "http://localhost:8428/api/v1/status/tsdb"

# Top 10 series by cardinality
curl "http://localhost:8428/api/v1/status/tsdb?topN=10"

# Stats for a specific date
curl "http://localhost:8428/api/v1/status/tsdb?date=2024-01-01"

# Focus on a specific label
curl "http://localhost:8428/api/v1/status/tsdb?topN=5&focusLabel=job"

# Filter by selector
curl "http://localhost:8428/api/v1/status/tsdb?topN=10&match[]=http_requests_total"
```

## Active and Top Queries

### Active Queries

```bash
curl "http://localhost:8428/api/v1/status/active_queries"
```

### Top Queries

```bash
curl "http://localhost:8428/api/v1/status/top_queries"
```

## Export Data

### JSON Line Export

**GET** `/api/v1/export`

```bash
curl "http://localhost:8428/api/v1/export" \
  -d 'match[]=http_requests_total' \
  -d 'start=2024-01-01T00:00:00Z' \
  -d 'end=now'
```

Response (JSON lines stream):
```json
{"metric":{"__name__":"http_requests_total","job":"app"},"values":[1,2,3],"timestamps":[1704067200000,1704067260000,1704067320000]}
```

### CSV Export

```bash
curl "http://localhost:8428/api/v1/export/csv" \
  -d 'match[]=http_requests_total' \
  -d 'start=2024-01-01T00:00:00Z' \
  -d 'end=now' \
  -d 'format=1:metric,2:timestamp,3:value'
```

### Native Export

```bash
curl "http://localhost:8428/api/v1/export/native" \
  -d 'match[]=http_requests_total'
```

Use `reduce_memory_usage=1` to lower memory usage on large exports.

## Import Data

### JSON Line Import

**POST** `/api/v1/import`

```bash
curl -X POST http://localhost:8428/api/v1/import -d '{"metric":{"__name__":"cpu_usage","host":"server1"},"values":[0.8,0.9],"timestamps":[1704067200000,1704067260000]}'
```

Format per line:
```json
{"metric":{"__name__":"foo","job":"bar"},"values":[1,2.5],"timestamps":[1704067200000,1704067260000]}
```

### Prometheus Format Import

**POST** `/api/v1/import/prometheus`

```bash
curl -X POST http://localhost:8428/api/v1/import/prometheus -d 'cpu_usage{host="server1"} 0.8 1704067200000'
```

### CSV Import

**POST** `/api/v1/import/csv`

```bash
curl -X POST "http://localhost:8428/api/v1/import/csv?format=1:metric:cpu_usage,2:labels:host,3:timestamp:unix_s,4:value" \
  -d 'cpu_usage,server1,1704067200,0.8'
```

## Delete Series

**POST** `/api/v1/admin/tsdb/delete_series`

```bash
curl -X POST "http://localhost:8428/api/v1/admin/tsdb/delete_series" \
  -d 'match[]=http_requests_total{status="500"}'
```

## Federation

**GET** `/federate`

```bash
curl "http://localhost:8428/federate?match[]=http_requests_total"
```

Optional `max_lookback` parameter limits lookback period for matching series.

## Snapshots

```bash
# Create snapshot
curl -X POST "http://localhost:8428/snapshot/create"

# List snapshots
curl "http://localhost:8428/snapshot/list"

# Delete specific snapshot
curl -X POST "http://localhost:8428/snapshot/delete?snapshot=<name>"

# Delete all snapshots
curl -X POST "http://localhost:8428/snapshot/delete_all"
```

## Internal Operations

```bash
# Flush in-memory data to disk
curl -X POST "http://localhost:8428/internal/force_flush"

# Force merge partition data files
curl -X POST "http://localhost:8428/internal/force_merge"

# Reset rollup result cache
curl -X POST "http://localhost:8428/internal/resetRollupResultCache"
```

## Timestamp Formats

All time parameters (`start`, `end`, `time`) accept multiple formats:

| Format | Examples |
|--------|----------|
| Unix seconds | `1704067200` |
| Unix milliseconds | `1704067200000` |
| Unix microseconds | `1704067200000000` |
| Unix nanoseconds | `1704067200000000000` |
| RFC3339 | `2024-01-01T00:00:00Z` |
| Partial RFC3339 | `2024-01-01` |
| Relative | `5m`, `1h`, `2d` |
| Relative from now | `now-1h5m` |

## Extra Query Parameters

All querying endpoints accept these optional parameters:

| Parameter | Purpose | Example |
|-----------|---------|---------|
| `extra_label` | Unconditionally add label to all queries | `extra_label=tenant=acme` |
| `extra_filters[]` | Unconditionally add selector filters | `extra_filters[]={env="prod"}` |
| `round_digits` | Round response values to N digits | `round_digits=2` |
| `limit` | Limit number of returned series | `limit=100` |
| `timeout` | Query execution timeout | `timeout=30s` |
| `nocache=1` | Disable query result caching | `nocache=1` |
| `trace=1` | Enable query tracing in response | `trace=1` |

### Query Tracing

```bash
curl "http://localhost:8428/api/v1/query?query=up&trace=1"
```

Adds a `trace` field to the JSON response with detailed query execution info.

### Access Control

`extra_label` and `extra_filters[]` are propagated into all subqueries and cannot be bypassed by the user:

```bash
curl "http://localhost:8428/api/v1/query?query=up&extra_label=tenant=acme&extra_filters[]={env=%22prod%22}"
```

## Common Patterns

```
# 1. Instant query for current state
GET /api/v1/query?query={metric}[range]

# 2. Range query for time series visualization
GET /api/v1/query_range?query={metric}&start={t1}&end={t2}&step={interval}

# 3. Discover series and labels
GET /api/v1/series?match[]={selector}
GET /api/v1/labels
GET /api/v1/label/{name}/values

# 4. Check cardinality
GET /api/v1/status/tsdb?topN=10

# 5. Export data for backup or migration
GET /api/v1/export?match[]={selector}&start={t1}&end={t2}

# 6. Import bulk data
POST /api/v1/import

# 7. Debug query performance
GET /api/v1/query?query={expr}&trace=1
GET /api/v1/status/top_queries
```

## Notes

- Default port: **8428**
- Default time range for `/api/v1/series`, `/api/v1/labels`, `/api/v1/label/.../values` is the **last day starting at 00:00 UTC** (unlike Prometheus which defaults to all time)
- Timestamps in query parameters support multiple formats (see Timestamp Formats above)
- Export timestamps are in **milliseconds**; import timestamps accept configurable formats
- `stats` object in responses includes `executionTimeMsec` and `seriesFetched`
- Use `trace=1` to debug slow queries
- Use `nocache=1` to bypass result cache for real-time data
- Admin and internal endpoints may require additional access controls
