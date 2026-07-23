# Attribute Catalog by Domain

Common OpenTelemetry span/metric/log attributes. Stability is noted; prefer stable. This is a quick-reference subset, not exhaustive — consult the official semantic conventions for the full list and accepted values.

## HTTP — server

- `http.request.method` (stable) — request method. Use the canonical uppercase form; set `http.request.method.original` when the original casing matters.
- `http.response.status_code` (stable) — HTTP response status code.
- `http.route` (stable) — matched route template, e.g. `/api/orders/{order_id}`. Not the raw URL.
- `url.full` (stable) — absolute URL. **Span only, never on metrics** — high cardinality.
- `url.scheme`, `url.path` (stable) — URL components.
- `server.address`, `server.port` (stable) — host and port the request was served on.
- `client.address` (stable) — peer address. Treat as routing data, not a user identifier.

## HTTP — client

The same HTTP attributes apply; `server.address` / `server.port` refer to the remote being called.

## Database

- `db.system` (stable) — the database product (`postgresql`, `mysql`, `redis`, `mongodb`, …).
- `db.operation` (stable) — operation name (`SELECT`, `INSERT`, or the operation as the DB knows it).
- `db.collection.name` (stable) — table or collection name.
- `db.query.text` (experimental) — the query text. Sanitize parameters; do not bind raw values here unless they are non-sensitive. Never put this on metrics.
- `db.response.status_code` (stable) — database-specific status or error code.

## Messaging

- `messaging.system` (stable) — broker (`kafka`, `rabbitmq`, `sqs`, …).
- `messaging.destination.name` (stable) — topic or queue name.
- `messaging.operation.name` (stable) — `publish`, `receive`, `process`.
- `messaging.message.id`, `messaging.message.conversation_id` (stable) — message identifiers.

## RPC

- `rpc.system` (stable) — the RPC framework (`grpc`, `apache_dubbo`, …).
- `rpc.service` (stable) — fully-qualified service name.
- `rpc.method` (stable) — method name.
- `rpc.grpc.status_code` (stable, gRPC) — numeric gRPC status.

## Exceptions

Record these on an exception span, not as free-text log lines:

- `exception.type` (stable) — exception class or type name.
- `exception.message` (stable) — exception message.
- `exception.stacktrace` (stable) — stack trace. Strip sensitive values from message and trace before recording.

## Stability notes

- **stable** → depend on it; name and type are fixed.
- **experimental** / **dev** → may change; acceptable when nothing stable exists, but track it. Prefer stable; check for deprecation before adopting an attribute.
