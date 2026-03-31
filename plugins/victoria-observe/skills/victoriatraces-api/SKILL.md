---
name: victoriatraces-api
description: VictoriaTraces HTTP API reference for querying distributed traces via Jaeger-compatible API. This skill should be used when searching traces, listing services/operations, getting trace details by ID, querying service dependencies, constructing HTTP requests to VictoriaTraces, or working with Jaeger API endpoints for distributed tracing analysis.
user-invocable: false
---

# VictoriaTraces API Reference

VictoriaTraces provides Jaeger-compatible HTTP API for querying distributed traces.

## Endpoints Overview

| Endpoint | Purpose |
|----------|---------|
| `/select/jaeger/api/services` | List all services |
| `/select/jaeger/api/services/<service>/operations` | List operations for a service |
| `/select/jaeger/api/traces` | Search traces |
| `/select/jaeger/api/traces/<traceID>` | Get trace by ID |
| `/select/jaeger/api/dependencies` | Service dependency graph |

Base URL: `http://<victoria-traces>:10428`

## List Services

```bash
curl http://localhost:10428/select/jaeger/api/services
```

Response:
```json
{
  "data": ["accounting", "ad", "cart", "checkout", "currency"],
  "errors": null,
  "total": 5
}
```

## List Operations

```bash
curl http://localhost:10428/select/jaeger/api/services/checkout/operations
```

Response:
```json
{
  "data": ["HTTP POST", "orders publish", "oteldemo.CartService/EmptyCart"],
  "errors": null,
  "total": 5
}
```

## Search Traces

**GET** `/select/jaeger/api/traces`

### Parameters

| Parameter | Format | Example |
|-----------|--------|---------|
| `service` | Service name (required) | `service=checkout` |
| `operation` | Operation name | `operation=oteldemo.CheckoutService/PlaceOrder` |
| `tags` | JSON object (URL-encoded) | `tags=%7B%22error%22%3A%22true%22%7D` |
| `minDuration` | Go duration | `minDuration=1ms`, `minDuration=500ms`, `minDuration=1s` |
| `maxDuration` | Go duration | `maxDuration=10s` |
| `limit` | Integer | `limit=5` |
| `start` | Microseconds timestamp | `start=1749969952453000` |
| `end` | Microseconds timestamp | `end=1750056352453000` |

### Duration Format

Go `time.Duration`: integer + unit suffix (`ms`, `s`, `m`)

Examples: `100ms`, `500ms`, `1s`, `2.5s`, `5m`

### Tags (Enhanced Filtering)

VictoriaTraces supports filtering by span attributes, resource attributes, and scope attributes:

```
# Span attributes (default)
tags={"rpc.method":"Convert"}

# Resource attributes
tags={"resource_attr:service.namespace":"opentelemetry-demo"}

# Scope attributes
tags={"scope_attr:otel.scope.name":"checkout"}
```

### Example Queries

```bash
# Search by service
curl "http://localhost:10428/select/jaeger/api/traces?service=checkout&limit=20"

# Search with operation
curl "http://localhost:10428/select/jaeger/api/traces?service=checkout&operation=oteldemo.CheckoutService/PlaceOrder&limit=5"

# Find slow traces
curl "http://localhost:10428/select/jaeger/api/traces?service=checkout&minDuration=1s&limit=10"

# Find error traces
curl "http://localhost:10428/select/jaeger/api/traces?service=checkout&tags=%7B%22error%22%3A%22true%22%7D"

# Combined filters
curl "http://localhost:10428/select/jaeger/api/traces?service=checkout&operation=oteldemo&tags=%7B%22rpc.method%22%3A%22Convert%22%7D&minDuration=1ms&maxDuration=10ms&limit=5"
```

### Response Structure

```json
{
  "data": [{
    "traceID": "9e06226196051d9c3c10dfab343791ad",
    "spans": [{
      "traceID": "...",
      "spanID": "...",
      "operationName": "oteldemo.CheckoutService/PlaceOrder",
      "startTime": 1750044449706551,
      "duration": 69871,
      "tags": [
        {"key": "rpc.method", "type": "string", "value": "PlaceOrder"},
        {"key": "error", "type": "string", "value": "unset"}
      ],
      "logs": [],
      "references": [{"refType": "CHILD_OF", "spanID": "...", "traceID": "..."}],
      "processID": "p3"
    }],
    "processes": {
      "p3": {
        "serviceName": "checkout",
        "tags": [{"key": "service.namespace", "value": "opentelemetry-demo"}]
      }
    }
  }]
}
```

Key fields per span:
- `startTime`: Microseconds since epoch
- `duration`: Microseconds
- `tags[]`: Span attributes as `{key, type, value}`
- `references[]`: Parent-child relationships (`CHILD_OF`)
- `processID`: Links to process info (service name + resource attributes)

## Get Trace by ID

```bash
curl http://localhost:10428/select/jaeger/api/traces/9e06226196051d9c3c10dfab343791ad
```

Returns full trace with all spans, processes, and service mapping.

## Service Dependencies

**GET** `/select/jaeger/api/dependencies`

```bash
curl "http://localhost:10428/select/jaeger/api/dependencies?endTs=1758213428616&lookback=60000"
```

Parameters:
- `endTs`: End timestamp in milliseconds
- `lookback`: Lookback duration in milliseconds

Response:
```json
{
  "data": [
    {"parent": "checkout", "child": "cart", "callCount": 4},
    {"parent": "checkout", "child": "shipping", "callCount": 4},
    {"parent": "frontend", "child": "checkout", "callCount": 2}
  ]
}
```

## Common Patterns

```
# 1. Discover services
GET /select/jaeger/api/services

# 2. Find operations for a service
GET /select/jaeger/api/services/{service}/operations

# 3. Search traces (service is required)
GET /select/jaeger/api/traces?service={service}&limit=20

# 4. Get trace details
GET /select/jaeger/api/traces/{traceID}

# 5. View service graph
GET /select/jaeger/api/dependencies?endTs={now_ms}&lookback=3600000
```

## Notes

- `service` parameter is **required** for trace search
- Time parameters (`start`, `end`) are in **microseconds** (not milliseconds or seconds)
- Dependencies `endTs` is in **milliseconds**
- Duration filters use Go format (`500ms`, `1s`, `5m`), not PromQL format
- Tags must be URL-encoded JSON objects
- Web UI available at `http://<victoria-traces>:10428/select/vmui`
