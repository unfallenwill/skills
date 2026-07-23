---
name: conventions
version: 0.1.0
description: >
  Apply OpenTelemetry semantic conventions so telemetry stays queryable and correlatable across
  services: pick the right convention domain, prefer stable attributes, name custom attributes
  safely, and control cardinality and PII. Use when the user asks to "add semantic conventions",
  "what attribute should I use for HTTP/database/messaging", "name this span or attribute", "check
  resource attributes", "is this attribute high-cardinality", "is deployment.environment still
  valid", or mentions semantic conventions, attribute naming, service.name, span attributes, or
  convention compliance. For configuring the SDK itself (providers, exporters, propagation) use
  setup.
---

# Semantic Conventions Methodology

This skill is a decision framework for naming telemetry attributes so they match OpenTelemetry's semantic conventions. It is language-agnostic. Apply it to spans, metrics, logs, and resources in any stack.

## Why conventions matter

Dashboards, alerts, and cross-service queries assume shared names. If one service records `http.response.status_code` and another records `http.status`, neither query works. Conventions exist so telemetry from different services, languages, and libraries is joinable.

## The decision flow

For every attribute or span name you are about to set:

1. **Identify the domain.** What kind of operation is this — HTTP, database, messaging, RPC, an exception, something else?
2. **Use the stable convention first.** Look up the domain in `references/attribute-catalog.md`. If a stable attribute exists for what you want to record, use it exactly — name and type.
3. **Fall back to custom only if no convention fits.** Then follow the custom-attribute naming rules below.
4. **Run the cardinality + PII check** on every attribute, stable or custom.

## Domain map

- HTTP server/client — `http.request.method`, `url.full`, `server.address`, `server.port`, `http.response.status_code`, `http.route`
- Database — `db.system`, `db.operation`, `db.collection.name`, `db.query.text` (sanitized)
- Messaging — `messaging.system`, `messaging.destination.name`, `messaging.operation.name`
- RPC — `rpc.system`, `rpc.service`, `rpc.method`
- Exceptions — `exception.type`, `exception.message`, `exception.stacktrace`

Full list, with stability and accepted values, in `references/attribute-catalog.md`.

## Resource attributes

Resource attributes identify the service and are attached at SDK setup, not per-span. See `references/resource-attributes.md` for the canonical set (`service.name`, `service.version`, `deployment.environment.name`, `cloud.*`, `k8s.*`). Use that reference whenever you configure resource attributes — it is shared with the `setup` skill.

## Stability levels

Each attribute's stability (stable vs experimental) is noted in the catalog; prefer stable for anything that feeds dashboards or alerts, and check for deprecation before adopting an attribute.

## Custom attribute naming rules

When no convention fits:

- **Namespace with a domain prefix.** Reuse the existing domain prefix where one exists (`http.`, `db.`, `messaging.`, `rpc.`), or your organization's stable prefix for business attributes (e.g., `checkout.cart_size`, `payment.provider`). Avoid bare, unqualified names.
- **Dot notation, lowercase, snake_case segments.** `order.shipping_country`, not `OrderShippingCountry` or `orderShippingCountry`.
- **One attribute, one meaning.** Do not overload one name with different value shapes across services.

## Cardinality discipline

An attribute's cardinality is the number of distinct values it can take. High-cardinality attributes blow up metric series and trace storage:

- Never put raw URLs (with query strings), full SQL, request/response bodies, user IDs, or session IDs into **metric** attributes. Metrics are aggregated by label set; cardinality is multiplicative and expensive.
- On **spans**, identifiers like `user.id` or `order.id` are fine — they are how you find a specific trace — but keep them as stable IDs, not free text.
- Prefer enumerated values over free text. `payment.provider = stripe` yes; `payment.description = "Stripe charge for order #1234 on 2024-…"` no.

## PII discipline

- Never record PII (email, phone, name, address, ID numbers), secrets, tokens, or full payloads.
- IP addresses: when a convention calls for an address (`client.address`, `server.address`), record it for routing/debugging only if your policy allows; otherwise drop or hash. Never treat an IP as a user identifier.
- Prefer stable IDs (`user.id`) over direct identifiers (`user.email`).
- When unsure whether a value is sensitive, do not record it. Once it is in telemetry, it is effectively public to everyone with dashboard access.

## Rules

- Prefer stable conventions over custom attributes.
- Match attribute names and types exactly — typos break queries.
- Keep metric attributes low-cardinality; multiplicative label combinations are the usual culprit.
- No PII, no secrets, no full payloads.
- Record the stable ID, not the human-readable direct identifier.

## Output

Report each decision so the user can review:

```
Attribute: http.route (stable, HTTP server)
Value: /api/orders/{order_id}
Decision: stable convention — use exactly. Low cardinality (route template, not raw URL).

Attribute: checkout.cart_size (custom)
Value: 3
Decision: no convention fits; namespaced under checkout. Low cardinality (small integer). No PII.
```
