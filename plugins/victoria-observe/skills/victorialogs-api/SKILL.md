---
name: victorialogs-api
description: VictoriaLogs HTTP API reference for querying logs, hits stats, field discovery, live tailing, and log statistics. This skill should be used when constructing HTTP requests to VictoriaLogs, understanding query endpoints (/select/logsql/query, /select/logsql/tail, /select/logsql/hits, /select/logsql/field_names), response formats, or integrating with VictoriaLogs API for log search and analysis.
user-invocable: false
---

# VictoriaLogs HTTP API Reference

VictoriaLogs provides HTTP endpoints for querying logs via LogsQL.

## Endpoints Overview

| Endpoint | Purpose |
|----------|---------|
| `/select/logsql/query` | Query logs |
| `/select/logsql/tail` | Live tailing |
| `/select/logsql/hits` | Hit counts over time |
| `/select/logsql/facets` | Most frequent field values |
| `/select/logsql/stats_query` | Log stats at a point in time |
| `/select/logsql/stats_query_range` | Log stats over time range |
| `/select/logsql/streams` | List log streams |
| `/select/logsql/stream_ids` | List stream IDs |
| `/select/logsql/stream_field_names` | Stream field names |
| `/select/logsql/stream_field_values` | Stream field values |
| `/select/logsql/field_names` | Log field names |
| `/select/logsql/field_values` | Log field values |
| `/select/tenant_ids` | List tenants |

## Query Logs

**POST** `/select/logsql/query`

```bash
# Basic query
curl http://localhost:9428/select/logsql/query -d 'query=error'

# With limit
curl http://localhost:9428/select/logsql/query -d 'query=error' -d 'limit=10'

# With time range
curl http://localhost:9428/select/logsql/query -d 'query=error' -d 'start=2024-01-01T00:00:00Z' -d 'end=now'

# With pagination
curl http://localhost:9428/select/logsql/query -d 'query=error' -d 'limit=10' -d 'offset=100'

# Timeout
curl http://localhost:9428/select/logsql/query -d 'query=error' -d 'timeout=4.2s'
```

Response: JSON lines stream, each line is `{"field1":"value1",...,"fieldN":"valueN"}`

```json
{"_msg":"error: disconnect from 19.54.37.22","_stream":"{}","_time":"2023-01-01T13:32:13Z"}
```

Key behaviors:
- Results stream as they are found (safe to close connection anytime)
- Results are NOT sorted by default (use `limit=N` for most recent, or `sort` pipe)
- Use `| fields _time, level, _msg` to select specific fields

### CSV Output

Add `format=csv` to get CSV output instead of JSON lines. The query must end with a `fields` or `stats` pipe:

```bash
curl http://localhost:9428/select/logsql/query -d 'query=error | fields _time, _msg' -d 'format=csv'
```

## Live Tailing

**GET** `/select/logsql/tail`

```bash
curl -N http://localhost:9428/select/logsql/tail -d 'query=error'

# With historical offset
curl -N http://localhost:9428/select/logsql/tail -d 'query=*' -d 'start_offset=1h'
```

Restrictions: cannot use `stats`, `uniq`, `top`, `sort`, `limit`, `offset` pipes.

## Hit Counts

**GET** `/select/logsql/hits`

```bash
curl http://localhost:9428/select/logsql/hits \
  -d 'query=error' \
  -d 'start=3h' \
  -d 'end=now' \
  -d 'step=1h'
```

Response:
```json
{
  "hits": [{
    "fields": {},
    "timestamps": ["2024-01-01T00:00:00Z", "2024-01-01T01:00:00Z"],
    "values": [410339, 450311],
    "total": 860650
  }]
}
```

Group by field: add `-d 'field=level'` for per-level breakdown.

## Facets (Most Frequent Values)

**GET** `/select/logsql/facets`

```bash
curl http://localhost:9428/select/logsql/facets \
  -d 'query=_time:1h error' \
  -d 'limit=3'
```

Response:
```json
{
  "facets": [{
    "field_name": "kubernetes_container_name",
    "values": [{"field_value": "victoria-logs", "hits": 442378}]
  }]
}
```

## Log Stats (Prometheus-compatible)

### Instant Stats
**GET** `/select/logsql/stats_query`

```bash
curl http://localhost:9428/select/logsql/stats_query \
  -d 'query=_time:1d | stats by (level) count(*)' \
  -d 'time=2024-01-02Z'
```

Query must contain `| stats` pipe. Returns Prometheus-compatible JSON.

### Range Stats
**GET** `/select/logsql/stats_query_range`

```bash
curl http://localhost:9428/select/logsql/stats_query_range \
  -d 'query=* | stats by (level) count(*)' \
  -d 'start=2024-01-01Z' \
  -d 'end=2024-01-02Z' \
  -d 'step=6h'
```

Returns Prometheus-compatible `matrix` result type. Used by Grafana plugin.

## Field Discovery

### Field Names
```bash
curl http://localhost:9428/select/logsql/field_names \
  -d 'query=error' -d 'start=5m' -d 'end=now'
```

Response: `{"values":[{"value":"_msg","hits":1033300623},...]}`

### Field Values
```bash
curl http://localhost:9428/select/logsql/field_values \
  -d 'query=error' -d 'field=host' -d 'start=5m' -d 'end=now'
```

### Stream Field Names / Values
```bash
curl http://localhost:9428/select/logsql/stream_field_names -d 'query=error' -d 'start=5m'
curl http://localhost:9428/select/logsql/stream_field_values -d 'query=error' -d 'field=host' -d 'start=5m'
```

## Streams

```bash
curl http://localhost:9428/select/logsql/streams -d 'query=error' -d 'start=5m' -d 'end=now'
```

Response: `{"values":[{"value":"{host=\"host-123\",app=\"foo\"}","hits":34980},...]}`

## Multi-Tenancy

Default tenant: `(AccountID=0, ProjectID=0)`. Override via headers:

```bash
curl -H 'AccountID: 12' -H 'ProjectID: 34' \
  http://localhost:9428/select/logsql/query -d 'query=error'
```

## Extra Filters

All endpoints accept `extra_filters` and `extra_stream_filters` for access control:

```bash
-d 'extra_filters={"namespace":"my-app","env":"prod"}'
-d 'extra_stream_filters={"namespace":"my-app","env":"prod"}'
```

These are unconditionally propagated into all subqueries (cannot be bypassed).

## Hidden Fields

Hide sensitive fields from query results:

```bash
-d 'hidden_fields_filters=pass*,pin'
```

## Response Headers

All endpoints return:
- `VL-Request-Duration-Seconds`: Query duration to first byte
- `AccountID` and `ProjectID`: Requested tenant

## Time Formats

`start` and `end` accept:
- Relative: `5m`, `1h`, `2d` (from now)
- RFC3339: `2024-01-01T00:00:00Z`
- Unix timestamps (seconds)
