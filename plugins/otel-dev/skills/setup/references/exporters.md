# Exporter Configuration

## OTLP — the default choice

Prefer OTLP. Two transports:

### OTLP/gRPC

- Binary protobuf over HTTP/2, port 4317.
- Lower per-record overhead, streaming export.
- Use when the service can reach the collector on gRPC without proxy friction.
- Watch for: L7 proxies / load balancers that do not speak HTTP/2, and gRPC max message size (raise it for large metric exports).

### OTLP/HTTP

- Protobuf or JSON over HTTP/1.1, port 4318 (`/v1/traces`, `/v1/metrics`, `/v1/logs`).
- Friendlier through proxies, service meshes, and corporate egress. Pick this when in doubt, or when only 443 is allowed.
- Slightly higher per-export overhead than gRPC; negligible for most services.

## Vendor backends

Most vendors (Datadog, Honeycomb, Dynatrace, New Relic, Splunk, Tempo, Grafana Cloud; AWS X-Ray via the collector's `awsxray` exporter) accept OTLP directly — prefer OTLP over a vendor-native exporter (the `setup` skill covers the reasoning).

## Configuration knobs

- `endpoint` — host:port. For OTLP/HTTP include the path, or let the SDK append it.
- `headers` — auth (e.g., `Authorization: Bearer …` or a vendor API-key header). Read from an environment variable or secret manager; never hardcode.
- `compression` — enable `gzip` on high-volume exporters to cut egress bandwidth at a small CPU cost.
- `timeout` — per-export deadline. Raise it for large batch or metric exports.
- Batch span processor:
  - `max_queue_size` — records buffered before backpressure applies.
  - `max_export_batch_size` — records per export call.
  - `schedule_delay` — maximum time between exports.
  - `export_timeout` — per-export timeout.
- TLS — enable in production. Verify the collector certificate; supply client certificates if mTLS is required.

## Common mistakes

- Hardcoding API keys in source.
- Pointing at `localhost` from inside a container — use the collector's service DNS name.
- Forgetting `gzip` on high-volume hosts → saturated egress.
- Setting `export_timeout` below the time a large batch actually takes → repeated failed exports and backpressure.
- Running OTLP/gRPC through a proxy that does not support HTTP/2.
