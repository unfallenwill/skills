# otel-dev

Language-agnostic methodology for setting up the OpenTelemetry SDK and applying semantic conventions. It tells you **what to configure, which option to pick, and why** — without binding to any language or framework.

## Components

| Component | Path | Purpose |
|---|---|---|
| Skill `setup` | `skills/setup/` | Bootstrap the SDK: signals → providers → resource → exporter → propagation → lifecycle. References: `exporters.md`, `propagation.md` |
| Skill `conventions` | `skills/conventions/` | Apply semantic conventions; control cardinality and PII. References: `attribute-catalog.md`, `resource-attributes.md` |
| Agent `otel-reviewer` | `agents/otel-reviewer.md` | Read-only audit of OTel setup and convention compliance; reports findings ranked by severity |

## Prerequisites

- The service already has, or is about to add, an OpenTelemetry SDK in some language. This skill does not pick the SDK for you.

## Installation

```bash
cc --plugin-dir /path/to/otel-dev
```

## Usage

The skills activate on intent:

- **setup**: "set up OpenTelemetry in this service", "configure the tracer provider", "should I use OTLP gRPC or HTTP", "set service.name and resource attributes", "configure W3C context propagation"
- **conventions**: "what attribute do I use for the HTTP route", "add semantic conventions to this span", "is `deployment.environment` still valid", "these attributes look high-cardinality"
- **otel-reviewer**: "review my OpenTelemetry setup", "audit these spans for convention compliance"
