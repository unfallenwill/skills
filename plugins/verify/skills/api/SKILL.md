---
name: api
version: 0.2.0
description: This skill should be used when the user asks to "check the API of the running service", "verify the change actually works", "smoke test the endpoint", "hit the endpoint", "end-to-end check", "起服务验证", "跑起来打一下接口", "冒烟测一下", "端到端确认", "验证行为是否符合预期", "这个功能真的能用吗", or says the behaviour has to be proven at runtime. Drives real HTTP requests from a plan written against the requirement and reports what was verified, what failed, and what was not covered. The service must already be running — this skill tests it and never starts it. Not for unit-test-only, documentation-only, or non-HTTP CLI work.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# api

Test the runtime behaviour of an HTTP service against the requirement: send real
requests, check the responses against what the requirement calls for, and report the
truth.

Correct code is not the same as correct behaviour. A route mounted under the wrong
prefix, a serialized field dropped, an exception never translated into a status code
— each of those is code that looks right and still breaks the feature. Only running
the system and asking it the questions the requirement poses settles it.

This skill answers exactly one question:

**does the system actually behave the way the requirement says it must?**

It tests. It does not build the environment: the service must already be running, and
this skill starts nothing, allocates no ports, rewrites no configuration and touches
no database.

## When to use

For a requirement whose behaviour has to be shown at runtime: an endpoint or a business
rule that was just added or changed, a bug whose root cause needs proving, or a request
to "hit the endpoint", "smoke test", "end to end".

**Do not use** for: unit-test-only work, documentation-only changes, or scripts with no
callable interface.

## Core principle: write the plan from the requirement, not from the code

The most common failure mode is writing the plan by looking at the code that was just
written. Every assertion in such a plan is guaranteed to pass, and the run becomes a
pile of self-confirmation.

**Derive the plan from the requirement.** Concretely:

1. Decompose the requirement into individually checkable statements
   ("a duplicate SKU returns 409", "the order total equals unit price times quantity").
2. Give every statement at least one step.
3. For every step ask: **if this feature were broken, would this step fail?**
   A step that cannot fail is not evidence.

Cover all four categories. A run missing any one of them is incomplete:

| Category | What it establishes | Example |
|---|---|---|
| Positive | The normal path returns what it should | POST product → 201, body fields correct |
| Boundary | The error branches the requirement names | Duplicate SKU → 409; quantity 0 → 422 |
| State | The side effect really persisted, not just looked right in the response | After creating, GET reads the same data back |
| Regression | Existing behaviour was not broken | The old endpoint still returns its old shape |

**Assert on the response body, not only on the status code.** A 201 with empty fields
is indistinguishable from a 500.

**Read back after every write.** The response body is an in-memory object; whether it
reached storage is a different question. Follow each write with a GET that reads the
data back.

### Never let the implementation define its own expectations

`apishape.js` prints what the service actually accepts. Use it for **names and shapes
only** — paths, parameter names, and the shape of a body.

Its `required` list is the implementation's own claim about itself, not the
requirement's. When the document does not require a field that the requirement does,
the service will accept a body the requirement forbids — and that difference is itself
worth reporting.

Do **not** copy the example responses out of the OpenAPI document into `expect`. Those
examples are generated from the implementation; asserting them tests the
implementation against itself. Every expectation must trace back to a sentence in the
requirement.

`${CLAUDE_PLUGIN_ROOT}/skills/api/references/failure-signals.md` has the trap that
naming creates — `?min_price=5` and `?minPrice=5` look alike, but only one is the name
the code reads, and the other is silently ignored.

## Coverage: what each step claims

Every step says how much it establishes. This is what makes the report readable — a
number of green ticks means nothing without knowing what each tick covered.

| `coverage` | Meaning | Counts as |
|---|---|---|
| `verified` (default) | The step asserts what the requirement calls for | evidence |
| `assumption` | The step passed, but would pass even if the feature were broken | coverage, not evidence |
| `skipped` | The goal cannot be reached with an HTTP call; the step is not sent | a gap |

A step that asserts nothing is a **plan error**, not a pass. `probe.js` rejects it:
a step that cannot fail is not evidence, and a report that counts it as a pass is
lying about what was checked.

**Mark the weak steps.** "A threshold below every price should return everything" is
trivially true when the parameter is ignored entirely. Such a step is an `assumption`,
not a `verified` one. The way to make it discriminating is a second step whose expected
value differs between "the filter works" and "the filter is ignored" — for example, a
threshold *above* every price, which must return nothing.

### A gap is reported, not pursued

A goal that no HTTP request can reach — a scheduled job, a background worker, a CLI
path, an email — is a **gap to report**, not a task to perform. Put it in the plan as a
`skipped` step with a note saying why it is unreachable, and report it as not verified.

Do not go looking for another way to check it: not the cron table, not systemd timers,
not a mail client, not a queue, not a CLI. And do not perform the goal in order to prove
it — sending the email the requirement mentions is a side effect of the product, not a
test of it.

The question a gap has to answer is narrow: *is there an HTTP request that could show
this?* If there is not, say so and move on.

## Workflow

### Step 1 — Find the running service

The service must already be running. This skill does not start anything.

Look for the port in the repository:

| Where to look | What to look for |
|---|---|
| `docker-compose.yml` / `compose.yaml` | `ports: - "3000:3000"` — the **left** side is the host port to hit; `docker compose ps` shows what is published |
| `package.json` | `scripts.dev`, `scripts.start` — a `--port` flag |
| `Makefile` | a `run`, `dev` or `serve` target |
| `README.md` / `CONTRIBUTING.md` | the documented way to run it locally |
| `pyproject.toml` / `Cargo.toml` | an entry point and the port it defaults to |

Framework defaults, when the repository says nothing: FastAPI and Django 8000, Flask
5000, Rails and Next.js 3000, Spring Boot 8080.

Check the port before assuming:

```bash
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:PORT/healthz
```

**Any** HTTP status proves the port is live — a healthy service with no route at that
path answers 404. Only `000` (nothing listening) means the service is not up.

If nothing is listening, name the command the repository documents and ask the user to
start it. Do not start it, and do not run any start, build or migration command.

### Step 2 — Learn the interface shape

Never write a request body from memory. After a schema change, a plan written from
recollection silently tests the wrong thing.

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/api/scripts/apishape.js" --base-url http://127.0.0.1:3000
```

It prints the paths, methods, required fields and query parameter names the service
actually accepts, and can emit a plan skeleton:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/api/scripts/apishape.js" --base-url http://127.0.0.1:3000 --skeleton
```

The skeleton states the success status the document promises and marks the step as an
`assumption` — it shows that the endpoint answers, not that it answers correctly.
Replace the status with the fields the requirement calls for, and set
`coverage: "verified"`, to turn it into a check of the behaviour itself.

Two kinds of step come back as `skipped` gaps, with a `note` saying why: a route that
still holds a path template (`/api/products/{sku}` needs a concrete id), and an
operation the document lists no success status for.

Before running a skeleton, replace its placeholder body (`{"<field>": "<value>"}`) with
real values and delete the `_`-prefixed helper keys (`_fill_in`, `_body_shape`) — they
are notes, not fields.

If the service exposes no OpenAPI document, `apishape.js` says so and exits non-zero.
Derive the paths from the routes registered in the source and from the paths named in
the requirement, and write the plan by hand. When the document exists but lives
somewhere else, point at it with `--spec-path /internal/openapi.json`.

### Step 3 — Write the plan

Write the plan to `/tmp/verify-plan.json` — never into the repository; a test plan is
a throwaway debugging artifact.

```json
{
  "base_url": "http://127.0.0.1:3000",
  "steps": [
    {
      "name": "create product",
      "method": "POST",
      "path": "/api/products",
      "body": { "sku": "SKU-1", "name": "Widget", "price": "3.50" },
      "coverage": "verified",
      "expect": { "status": 201, "json": { "sku": "SKU-1", "name": "Widget" } }
    },
    {
      "name": "read back product",
      "method": "GET",
      "path": "/api/products/{{create product.sku}}",
      "expect": { "status": 200, "json": { "name": "Widget" } }
    },
    {
      "name": "duplicate sku conflicts",
      "method": "POST",
      "path": "/api/products",
      "body": { "sku": "SKU-1", "name": "Another", "price": "1.00" },
      "expect": { "status": 409 }
    },
    {
      "name": "the nightly job is not reachable over HTTP",
      "coverage": "skipped",
      "note": "the requirement only affects the nightly reconciliation job"
    }
  ]
}
```

Every response body is stored under its step name, so a later step can reference an
earlier one with `{{step name.field}}` — that is the mechanism for reading back what
was written, rather than hardcoding an identifier that may have changed.

`expect.json` is a **subset** match: only the fields written down are compared, extra
fields in the response do not fail. See
`${CLAUDE_PLUGIN_ROOT}/skills/api/references/plan-schema.md` for every field,
variable references and the remaining expectation types.

### Step 4 — Dry run

Check the plan before running it — a typo in a path or a variable name is cheaper to
find here than in a failed request:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/api/scripts/probe.js" --dry-run /tmp/verify-plan.json
```

```
OK create product  [POST http://127.0.0.1:3000/api/products]  (dry-run)
OK read back product  [GET http://127.0.0.1:3000/api/products/<create product.sku>]  (dry-run)
OK duplicate sku conflicts  [POST http://127.0.0.1:3000/api/products]  (dry-run)
SKIP the nightly job is not reachable over HTTP  (not verified: ...)

3 of 3 steps validated (dry run - no requests sent).
```

A dry run validates the plan only — the paths, the references, the coverage markers —
and sends nothing. Its summary means "the plan is well formed", not "the requests
succeeded". A skipped step is not part of the count: it is a gap, not a plan problem.

### Step 5 — Run the plan

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/api/scripts/probe.js" /tmp/verify-plan.json
```

Output:

```
OK create product  [POST http://127.0.0.1:3000/api/products]
    HTTP 201
OK read back product  [GET http://127.0.0.1:3000/api/products/SKU-1]
    HTTP 200
FAIL duplicate sku conflicts  [POST http://127.0.0.1:3000/api/products]
    HTTP 500
    -> status 500, expected 409
    actual response: {"detail":"Internal Server Error"}
SKIP the nightly job is not reachable over HTTP  (not verified: the requirement only affects the nightly reconciliation job)

Verified      2  (counts as evidence)
Failed        1  (the service did not behave as required)
Assumptions   0  (passed, but would pass even if the feature were broken)
Not verified  1  (goals this plan cannot check over HTTP)
```

The exit code is non-zero when any step failed.

Each request has a 15 second timeout. Raise it for slow endpoints with
`--timeout 30000` — bare milliseconds.

### Step 6 — Diagnose failures

The real cause of a 500 is almost always in the service's own log. This skill captures
no logs of its own; read them where they are reachable from the shell — the terminal
the service was started from, `docker compose logs <service>`, `journalctl -u <unit>`,
or a file the repository redirects to.

If none of those are reachable, say so — "the log was not accessible" — and report the
verdict from the response alone. Do not invent a cause. The source of the handler that
answered is the next place to look, and it may explain the failure — it never decides
what the answer should have been.

`${CLAUDE_PLUGIN_ROOT}/skills/api/references/failure-signals.md` maps symptoms to their
usual root causes — a 404 with a correct-looking path, a 500 with an `IntegrityError`,
a query parameter that is ignored, a write that returns 201 but reads back stale, and
the case where every request fails the same way because the code does not build. It
also carries the table that tells a code bug from a plan bug.

## Reporting the result

Report honestly. Do not decorate the outcome.

Every check in the report comes from the plan. A check that only ever ran as a stray
shell command sits outside the coverage the report claims — put it in the plan and run
the plan again, or leave it out of the report.

- **Verified** — state which behaviours were verified. List the key assertions (status
  code, the fields that were checked) so the coverage is visible.
- **Failed** — give the failing step, the actual response, the root cause if the log
  was reachable, and the verdict: is the code buggy, or is the plan wrong (a bad
  expectation, an invalid request body)?
- **Assumptions** — the steps that passed but prove nothing on their own. Name them, so
  they are not read as evidence.
- **Not verified** — when a goal cannot be expressed as an HTTP call (it only affects a
  scheduled job, a background worker, a CLI path, an email), say what was left out and
  why. Report it; do not go looking for another tool to check it, and do not perform it.

To decide between "the code is wrong" and "the plan is wrong", invert the expectation:
what would the service have to answer for it to be right? A 409 the requirement calls
for that turned into a 500 means the code is missing an exception translation; a 200
whose fields disagree with the requirement means the code computed the wrong value; an
expectation that does not follow from the requirement means the plan is wrong.

## Resources

- `${CLAUDE_PLUGIN_ROOT}/skills/api/references/plan-schema.md` — every plan
  field, expectation type, coverage marker and variable reference
- `${CLAUDE_PLUGIN_ROOT}/skills/api/references/failure-signals.md` — symptom →
  root cause lookup table
- `${CLAUDE_PLUGIN_ROOT}/skills/api/scripts/probe.js` — run a plan and check the
  responses
- `${CLAUDE_PLUGIN_ROOT}/skills/api/scripts/apishape.js` — print the interface
  shape, emit a plan skeleton
