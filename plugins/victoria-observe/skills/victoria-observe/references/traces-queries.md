# Traces Query Templates (Jaeger API)

## Service Discovery

```bash
# List all services in the tracing system
node $SCRIPT traces services

# List operations for a service
node $SCRIPT traces operations my-service
```

## Trace Search

```bash
# Search by service name (default: last 1 hour)
node $SCRIPT traces search --service checkout --limit 20

# Search with time range
node $SCRIPT traces search --service checkout --start 1h --limit 20

# Search by operation
node $SCRIPT traces search --service checkout --operation PlaceOrder --start 1h

# Find slow traces (>500ms)
node $SCRIPT traces search --service checkout --minDuration 500ms --start 1h

# Find traces with specific tags
node $SCRIPT traces search --service checkout --tags '{"error":"true"}' --start 1h

# Find error traces across a specific service
node $SCRIPT traces search --service checkout --tags '{"error":"true"}' --start 30m --limit 50
```

## Trace Details

```bash
# Get trace details (compact summary by default)
node $SCRIPT traces get abc123def456

# Get full span-level details
node $SCRIPT traces get abc123def456 --verbose
```

Compact output shows: traceID, span count, total duration, root operation, services involved, error count.

Verbose output lists every span with operation, service, duration, parent span, and tags.

## Dependency Map

```bash
# Service dependency map (default: last 24 hours)
node $SCRIPT traces dependencies
node $SCRIPT traces dependencies --start 1h
```

## Notes

- `--service` is required for `traces search`
- Trace output is compact by default; use `--verbose` for full span details
- VictoriaTraces uses Jaeger-compatible API
- Durations use Go format: `500ms`, `1s`, `5m`
- Tags are JSON objects: `'{"key":"value"}'`
