---
name: setup
version: 0.1.0
description: >
  Bootstrap the OpenTelemetry SDK as language-agnostic decisions: which signals and providers to
  create, which resource attributes identify the service, which exporter and protocol to use, which
  context propagator to configure, and how to manage lifecycle and sampling. Use when the user asks
  to "set up OpenTelemetry", "configure OTel", "initialize the tracer/meter/logger provider", "add
  an exporter", "configure OTLP", "should I use OTLP gRPC or HTTP", "set service.name / resource
  attributes", "configure context propagation / W3C TraceContext / baggage", or mentions SDK setup,
  provider initialization, or observability bootstrap. This skill decides configuration, not where
  to instrument; for attribute naming use conventions.
---

# OpenTelemetry SDK Setup Methodology

This skill is a decision framework for configuring the OpenTelemetry SDK. It is **language-agnostic**: it tells you what to configure and which option to pick, and you apply it with your language's SDK and the project's existing patterns. It produces no language-specific code on its own.

**Prerequisite**: a service that has, or is adding, an OTel SDK in some language. If the project has no SDK at all, choose the language's official OTel distribution first, then return here.

## The bootstrap sequence

Configure OTel in this order. Each step is a decision; later steps depend on earlier ones.

1. Signals → providers
2. Resource
3. Exporter
4. Context propagation
5. SDK knobs (batching, queue, limits)
6. Lifecycle (init before work, flush on exit)
7. Auto-instrumentation

## Step 1 — Decide which signals you need

Three signals, each with its own provider:

- Traces → TracerProvider
- Metrics → MeterProvider
- Logs → LoggerProvider (stable; logs signal is GA)

Decision rule:

- **Traces** — always, for any service in a request path.
- **Metrics** — yes for services with SLOs, queue depth, business counters, or request rates.
- **Logs** — yes if you want structured logs correlated with traces via trace context. If you already have a logger, bridge it to OTel rather than replacing it.

Do not enable a signal you will not export — it adds overhead with no value.

## Step 2 — Configure the Resource

The Resource identifies the service across all signals. Every telemetry record inherits it. Get this right early: a missing or generic `service.name` makes traces unqueryable.

Required minimum:

- `service.name` — a stable identifier for this service. Never the literal `unknown_service`. Never the pod, container, or hostname.

The canonical attribute set, accepted values, and how to set them are defined in `../conventions/references/resource-attributes.md`. Read that reference when configuring the Resource.

## Step 3 — Choose the exporter

Default: **OTLP**, to a collector or to a vendor backend that speaks OTLP.

- **OTLP/gRPC** — lower per-record overhead, streaming. Harder through some L7 proxies.
- **OTLP/HTTP** — friendlier through proxies, load balancers, and service meshes. Pick it when in doubt, or when only port 443 is allowed out.

Vendor backends (Datadog, Honeycomb, Dynatrace, New Relic, Splunk, Tempo, Grafana Cloud, …) almost all accept OTLP directly now. Prefer OTLP over vendor-specific exporters unless you need a feature the OTLP path does not provide. Putting a collector in front gives you tail sampling, retry, and a single egress point.

For endpoint, headers, compression, timeout, TLS, and the batch processor knobs, see `references/exporters.md`.

## Step 4 — Choose context propagation

Propagation carries trace context across process boundaries (HTTP, messaging). Without it on **both** sides, distributed traces break at every hop.

- **Default: W3C TraceContext** (`traceparent`, `tracestate`). Use this.
- **Baggage** — enable alongside TraceContext when you forward request-scoped business context (tenant, feature flags, locale). Never put secrets or PII in baggage: it is forwarded in the clear to every downstream service, including third parties.
- **Legacy** (`b3` / Zipkin, `jaeger`) — only to interoperate with an older fleet that does not yet speak W3C. During migration, configure both W3C and the legacy format on the boundary, then drop the legacy one.

Egress/ingress symmetry: whatever propagator you set must be set on both sender and receiver, or context is lost. See `references/propagation.md`.

## Step 5 — SDK knobs

Defaults are tuned for most services; change only with reason:

- **Batch processor** — tune `max_queue_size`, `max_export_batch_size`, and `export_timeout` only when volume is high or export latency is tight.
- **Sampling** — see the sampling note below. Prefer the collector for tail sampling.
- **Attribute/value limits** — the SDK caps attribute count and value length to bound cardinality. Do not disable these blindly.

## Step 6 — Lifecycle

- Configure providers and exporters **before** the application handles work. Context captured before a provider exists cannot be retroactively exported.
- Register a shutdown hook that flushes pending telemetry on exit. Losing the flush on SIGTERM is a common cause of missing tail traces in Kubernetes.

## Step 7 — Auto-instrumentation

Prefer the language's instrumentation libraries (HTTP server/client, DB drivers, messaging) over hand-written spans for standard frameworks — they emit correct semantic conventions for free. Reach for manual spans only for business logic auto-instrumentation cannot see.

## Sampling — a sane default

Start unsampled, or with a low-rate head sampler (parent-based + 5–10% `traceidratio`), and move tail sampling to the collector once you know which traces matter (errors, slow requests, high-value flows). Head sampling cannot be undone downstream; tail sampling can.

## Rules

- Never run with `service.name = unknown_service` or empty in production.
- Never put secrets, tokens, or PII in baggage or resource attributes.
- Configure propagation symmetrically across every service in a request path.
- Always flush exporters on shutdown.
- Do not enable a signal you do not export.

## Output

Summarize the decisions made for this service so the user can review them at a glance:

```
Service: checkout-api
Signals: traces, metrics (logs via existing logger + context bridge)
Resource:
  service.name = checkout-api
  service.version = 1.4.2
  deployment.environment.name = prod
Exporter: OTLP/HTTP -> otel-collector.observability.svc:4318
Propagation: W3C TraceContext + Baggage
Sampling: parent_based(traceidratio=0.1); tail sampling at collector
Lifecycle: providers configured at startup; flush on SIGTERM
```
