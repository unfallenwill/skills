# Context Propagation

## What propagation does

Propagation serializes trace context (trace id, span id, sampling flag) into a carrier on egress (HTTP headers, message metadata) and deserializes it on ingress, so a trace stays connected across process boundaries. Without it, distributed traces break at every hop.

## Default: W3C TraceContext

- Headers: `traceparent`, `tracestate`.
- This is the OTel default and the current standard. Use it unless you have a specific reason not to.
- Enable it on **every** service in a request path. A single non-propagating hop severs the trace.

## Baggage

- Header: `baggage`.
- Carries request-scoped, non-secret business context (tenant id, feature flags, locale).
- Enable alongside TraceContext when per-request context must reach downstream services.
- **Never put secrets, tokens, or PII in baggage.** It is forwarded verbatim to every downstream service, including third parties.

## Legacy formats — migration only

- `b3` (Zipkin — `X-B3-TraceId` and friends) and `jaeger` (`uber-trace-id`) exist for interop with older fleets.
- During migration, configure both W3C and the legacy format on the boundary so context survives in both directions.
- Drop the legacy format once every service speaks W3C. Carrying multiple formats long-term adds noise and subtle bugs.

## Symmetry rule

Whatever propagator(s) you configure must be the same on sender and receiver. If A sends `traceparent` but B only reads `b3`, B starts a new trace. Verify the propagator is consistent across the whole request path — including API gateways and queue brokers.

## Through messaging and queues

- Propagate context in message metadata (headers/properties), not the message body.
- The SDK's messaging instrumentation usually handles injection/extraction; confirm the library for your broker does this on both producer and consumer.
- A consumed message can outlive the producing span. The trace link still connects them, but tail-sampling decisions made at the producer will not see the consumer's outcome — another reason to prefer collector-side tail sampling.

## Common mistakes

- Enabling TraceContext on the server but not the client (or vice versa).
- Storing auth tokens in baggage.
- Forgetting to configure propagation on the API gateway in front of the service.
- Mixing propagators across services in the same path.
