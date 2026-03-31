---
name: logsql
description: LogsQL query language reference for VictoriaLogs. This skill should be used when writing LogsQL queries, searching logs in VictoriaLogs, filtering log streams, using pipe operators for log aggregation, building log analysis queries with stats/sort/fields pipes, or understanding LogsQL filter syntax including word search, regex, and field-level filters.
user-invocable: false
---

# LogsQL Reference

LogsQL is VictoriaLogs' query language for log data. Uses pipe-based syntax: `[filters] [| pipe_action ...]`

## Special Fields

| Field | Description |
|-------|-------------|
| `_msg` | Log message body (default target for word/phrase searches) |
| `_time` | Timestamp of the log entry |
| `_stream` | Log stream label set, e.g. `{app="nginx",host="srv1"}` |
| `_stream_id` | Internal stream identifier |

## Filters

### Stream Selector
```
_stream:{app="api"}
_stream:{app="nginx",instance="host-123"}
{app="api"}                      # _stream: prefix is optional
```
Operators: `=`, `!=`, `=~` (regex), `!~`, `in("a","b")`, `not_in("a","b")`

### Time Range
```
_time:5m                         # last 5 minutes
_time:1h                         # last 1 hour
_time:2.5d15m42s                 # compound duration
_time:>1h                        # older than 1 hour ago
```
Duration units: `s`, `m`, `h`, `d`, `w`, `y`

### Word and Phrase Search
```
error                            # word "error" in _msg
log.level:error                  # word "error" in log.level field
i(error)                         # case-insensitive word search
"connection refused"             # exact phrase in _msg
i("connection refused")          # case-insensitive phrase
```

### Logical Operators
```
error AND warning                # both must match (AND is optional)
error _time:5m                   # implicit AND
error OR warning                 # either matches
NOT error                        # exclude
-error                           # NOT (shorthand)
(error OR warning) _time:5m      # parentheses for grouping
```
Precedence: `NOT` > `AND` > `OR`

### Field-Level Filters
```
log.level:error                  # word in field
log.level:="error"               # exact match
log.level:in("error","fatal")    # multi-value exact match
response_size:>10KiB             # numeric comparison
app:~"nginx|apache"              # regex on field
user.ip:ipv4_range("10.0.0.0/8") # IPv4 CIDR
field:*                          # field exists
field:""                         # field is empty
-field:*                         # field does not exist
```

### Regex
```
~"err|warn"                      # regex in _msg (RE2 syntax)
~"(?i)(err|warn)"                # case-insensitive regex
event.original:~"err|warn"       # regex on specific field
```

### Wildcards
```
*                                # match all logs
err*                             # words starting with "err"
*err*                            # contains "err"
="Processing request"*           # value starts with prefix
```

## Pipe Operators

### Stats (Aggregation)
```
| stats count() logs
| stats by (host) count() logs
| stats by (_time:1h) count() logs
| stats by (_time:1m) count() logs, count_uniq(ip) unique_ips
| stats count() if (error) errors, count() total
```
Functions: `count()`, `count_uniq(field)`, `sum(field)`, `avg(field)`, `min(field)`, `max(field)`, `median(field)`, `quantile(0.99, field)`, `rate()`, `uniq_values(field)`

### Sort and Limit
```
| sort by (_time) desc
| sort by (logs desc)
| limit 10
| offset 100 | limit 50
```

### Field Manipulation
```
| fields host, log.level              # keep only these fields
| delete password, token               # remove fields
| unpack_json                          # parse JSON fields
| extract "ip=<ip> "                   # extract field from _msg
| rename old_name as new_name          # rename field
```

### Context
```
| stream_context before 5 after 10    # show surrounding log lines
```

## Common Query Patterns

```
# Recent errors from a specific app
{app="api"} error _time:30m | limit 100

# Error count per hour
error | stats by (_time:1h) count() logs

# Top hosts by error count
error | stats by (host) count() logs | sort by (logs desc) | limit 10

# Filter + phrase + time range
{app="payment"} "connection refused" _time:1h

# Extract IP addresses from logs
| extract "client_ip=<ip> " | stats by (client_ip) count() logs

# Multi-field stats
_time:5m log.level:* | stats by (log.level) count() logs
```

## Notes

- Use the `/select/logsql/streams` endpoint (see `victorialogs-api` skill) to discover available stream labels
- Use the `/select/logsql/field_names` endpoint (see `victorialogs-api` skill) to discover available fields for filtering
- Common OTel field names: `severity`, `service.name`, `otelTraceID`, `otelSpanID`
