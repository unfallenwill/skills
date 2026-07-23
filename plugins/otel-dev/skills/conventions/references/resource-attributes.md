# Resource Attributes

The Resource describes the service that produces telemetry. It is attached once at SDK setup and inherited by every span, metric, and log. See the `setup` skill for *where* this is configured; this reference defines *what* to set.

## Required

- `service.name` (stable) — stable, human-readable name for this service.
  - Never `unknown_service`, never empty, never the hostname or pod name.
  - Shared by every instance of the same service across environments — the environment is a separate attribute.

## Strongly recommended

- `service.version` (stable) — the service version (SemVer or build hash). Essential for correlating deploys with regressions.
- `service.namespace` (stable) — when services of the same name exist in different groups or orgs.
- `service.instance.id` (stable) — unique per running instance (pod/container/process). Disambiguates instances in a fleet.
- `deployment.environment.name` (stable) — `production`, `staging`, `dev`, etc. This is the current stable name; the older `deployment.environment` is deprecated — use the stable form.

## Infrastructure (via SDK resource detectors, usually automatic)

- `cloud.provider`, `cloud.account.id`, `cloud.region`, `cloud.availability_zone` (stable) — when running on a cloud.
- `host.id`, `host.name` (stable) — the host machine.
- `k8s.cluster.name`, `k8s.namespace.name`, `k8s.pod.name`, `k8s.container.name` (stable core set) — Kubernetes context.
- `container.id` (stable) — the container.

## How to set them

- Use the SDK's resource detectors for infrastructure attributes (cloud, k8s, host) — they read the runtime environment so values are correct.
- Set `service.*` and `deployment.environment.name` from deploy config or environment variables (e.g., `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`), not from code constants, so the same artifact deploys to multiple environments.
- Keep resource attributes **low-cardinality and stable**. They tag every record; a per-pod `service.name` defeats the point.

## Common mistakes

- `service.name = unknown_service` in production (the SDK default when unset). Always set it explicitly.
- Embedding the environment or version in `service.name` (e.g., `checkout-api-prod-v2`) — put those in their own attributes.
- Putting secrets or PII in resource attributes.
- Setting resource attributes inconsistently across services in the same path, so dashboards cannot group them.
