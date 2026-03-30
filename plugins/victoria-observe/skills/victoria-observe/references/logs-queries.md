# Logs Query Templates (LogsQL)

## Basic Log Searches

```bash
# Recent logs from a specific app
node $SCRIPT logs query '_stream:{app="api"}' --start 30m --limit 100

# Filter by severity (field name depends on your log pipeline)
node $SCRIPT logs query '_stream:{app="api"} severity:error' --start 1h

# Full-text search
node $SCRIPT logs query '"connection refused"' --start 1h

# Combined filters
node $SCRIPT logs query '_stream:{app="api"} severity:error "timeout"' --start 2h --limit 50
```

## Log Exploration

```bash
# List all log streams
node $SCRIPT logs streams

# Discover available fields
node $SCRIPT logs field-names '_stream:{app="api"}'

# Get unique values for a field
node $SCRIPT logs field-values severity '_stream:{app="api"}' --start 1h

# Count log entries matching a query
node $SCRIPT logs hits '_stream:{app="api"} error' --start 1h
```

## Live Tailing

```bash
# Tail all logs in real time
node $SCRIPT logs tail

# Tail logs from a specific app
node $SCRIPT logs tail '_stream:{app="api"}'

# Tail with custom refresh interval (default: 1s)
node $SCRIPT logs tail '_stream:{app="api"}' --refresh-interval 2s
```

Press Ctrl+C to stop tailing.

## Notes

- `_stream:{label="value"}` filters by log stream labels
- Combine with `|` for pipes and `_time:<duration>` for relative time
- Common field names from OTel: `severity`, `service.name`, `otelTraceID`, `otelSpanID`
