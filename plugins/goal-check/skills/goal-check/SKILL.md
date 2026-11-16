---
name: goal-check
version: 0.1.0
description: This skill should be used when the user asks to "start the service and check the API", "verify the change actually works", "smoke test the endpoint", "run it and hit the API", "end-to-end check", "起服务验证", "跑起来打一下接口", "冒烟测一下", "端到端确认", "验证行为是否符合预期", "这个功能真的能用吗", or says the task requires proving runtime behaviour rather than merely passing unit tests. Starts the service with the repository's own native start command and drives real HTTP requests from a plan derived from the task goal, reporting passes, failures and uncovered gaps honestly. Not for unit-test-only, documentation-only, or non-HTTP CLI work.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Goal-Check

Green gates do not mean correct behaviour. Static checks and unit tests answer
"is the code written correctly?". Goal-check answers a different question:

**does the system actually behave the way the task requires?**

The two answers diverge, and the divergence is expensive: a route mounted under the
wrong prefix, a serialized field dropped, an exception never translated into a status
code — all of those pass every unit test and still break the feature.

Goal-check closes the gap between the gate and the merge: start the service, send real
requests, check the responses against the task goal, and report the truth.

## When to use

- The task asks for "behaviour that matches the requirement", not just "code that compiles".
- An endpoint or a business rule was just added or changed, and it must be proven callable.
- A bug was fixed, and the root cause — not a lucky test — needs proving.
- The user says "run it", "start it up", "hit the endpoint", "smoke test", "end to end".

**Do not use** for: unit-test-only work, documentation-only changes, or scripts with no
callable interface.

## Core principle: verify against the goal, not against the implementation

The most common failure mode is writing the plan by looking at the code that was just
written. Every assertion in such a plan is guaranteed to pass, and the verification
becomes a pile of self-confirmation.

**Derive the plan from the task goal.** Concretely:

1. Decompose the task goal into individually checkable statements
   ("a duplicate SKU returns 409", "the order total equals unit price times quantity").
2. Give every statement at least one step.
3. For every step ask: **if this feature were broken, would this step fail?**
   A step that cannot fail is not evidence — delete it.

Cover all four categories. A verification missing any one of them is incomplete:

| Category | What it establishes | Example |
|---|---|---|
| Positive | The normal path returns what it should | POST product → 201, body fields correct |
| Boundary | The error branches the goal names | Duplicate SKU → 409; quantity 0 → 422 |
| State | The side effect really persisted, not just looked right in the response | After creating, GET reads the same data back |
| Regression | Existing behaviour was not broken | The old endpoint still returns its old shape |

**Assert on the response body, not only on the status code.** A 201 with empty fields is
indistinguishable from a 500.

**Read back after every write.** The response body is an in-memory object; whether it
reached storage is a different question. Follow each write with a GET that reads the
data back.

### Never let the implementation define its own expectations

`apishape.js` prints what the service actually accepts, and can emit a plan skeleton.
Use it for **names and shapes only** — paths, parameter names, required fields.

Do **not** copy the example responses out of the OpenAPI document into `expect`. Those
examples are generated from the implementation; asserting them verifies the
implementation against itself and proves nothing about the goal. Every expectation must
trace back to a sentence in the task goal.

Note the trap this creates: `?min_price=5` and `?minPrice=5` look alike, but only one is
the name the code reads. The other is silently ignored — no error, just the full
unfiltered list. Compare the goal's parameter names against what the service reports,
character by character.

### Two techniques that make a report trustworthy

**Add a control step.** When an assertion fails, distinguish "the code is broken" from
"the plan is wrong". The most reliable way is to hit the same endpoint a second way and
compare: if the request works with the name the code actually accepts but not with the
name the goal uses, the filtering logic is fine and the contract is wrong. The verdict
moves from "suspect" to "certain".

**Flag passes that carry no information.** Some steps pass whether or not the feature
works. "A threshold below every price should return everything" is trivially true when
the parameter is ignored entirely. Such a step only becomes discriminating after the
feature is fixed. Mark these in the report instead of counting them as evidence.

## Workflow

### Step 0 — Confirm the gate has passed

Run the project's own checks first (`make check`, `npm test`, `pytest`, whatever the
repository defines). A service started on broken code only runs the bug in a place
where it is harder to see. If the gate fails, stop and report why.

### Step 1 — Identify the service and its native start command

The plugin never decides how a service boots. Use the repository's own command:

| Where to look | What to look for |
|---|---|
| `package.json` | `scripts.dev`, `scripts.start`, `scripts.serve` |
| `Makefile` | a `run`, `dev`, or `serve` target |
| `docker-compose.yml` | the service's `command` |
| `README.md` / `CONTRIBUTING.md` | the documented way to run it locally |
| `pyproject.toml` / `Cargo.toml` | a run script or entry point |

Prefer the command the repository documents. Only fall back to invoking the framework
directly when the repository has no such command, and say so in the report.

### Step 2 — Start the service

Write a `goal-check.json` — at the repository root, or anywhere and passed with
`--config`:

```json
{
  "services": [
    {
      "name": "api",
      "cwd": "services/api",
      "start": "npm run dev -- --port {port}",
      "ready": { "url": "/healthz", "status": [200] },
      "env": { "DATABASE_URL": "sqlite:///{tmpdir}/api.db" }
    }
  ]
}
```

Then start it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/goal-check/scripts/goalctl.js" up --service api
```

The runner is a thin shell around the repository's own command. It allocates a free
port and injects it as `{port}`, injects environment variables such as a
`DATABASE_URL` pointing at a throwaway database, waits until the service answers, and
captures stdout/stderr into a log file. It never rewrites the command into a
framework-specific form.

Always give `ready` a real health path **and** the status codes that mean healthy.
Without `ready.status`, any HTTP response counts as ready — including the 404 of a
service that is up but serving nothing.

To start a service without a config file:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/goal-check/scripts/goalctl.js" up \
  --start "npm run dev" --name api --ready-url /healthz
```

**Run every script from the repository root.** The run directory is derived from the
repository path, so running from anywhere else points the scripts at a different
directory and they will not find the manifest. Use `--run-dir` or `GOAL_CHECK_RUN_DIR`
to point them at an explicit directory instead.

`goal-check.json` in the repository root is an untracked local file. Prefer
`--config /tmp/goal-check.json` when the repository should stay clean.

### Step 3 — Learn the interface shape

Never write a request body from memory. After a schema change, a plan written from
recollection silently verifies the wrong thing.

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/goal-check/scripts/apishape.js"
```

It prints the paths, methods, required fields and query parameter names the service
actually accepts, and can emit a plan skeleton with the expectations left empty:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/goal-check/scripts/apishape.js" --skeleton
```

This reads `/openapi.json` — a document **generated from the implementation**. Use it
for names and shapes only. The `responses:` line it prints is likewise
implementation-derived: do not copy those status codes into `expect.status` either.

If the service exposes no OpenAPI document, `apishape.js` exits non-zero and says so.
Derive the paths from the routes registered in the source and from the paths named in
the task goal, and write the plan by hand. When the document exists but lives
somewhere else, point at it with `--spec-path /v3/api-docs`.

### Step 4 — Write the plan

Write the plan to `/tmp/goal-check-plan.json` — never into the repository; a
verification plan is a throwaway debugging artifact.

```json
{
  "default_service": "api",
  "steps": [
    {
      "name": "create product",
      "method": "POST",
      "path": "/api/products",
      "body": { "sku": "SKU-1", "name": "Widget", "price": "3.50" },
      "expect": { "status": 201, "json": { "sku": "SKU-1", "name": "Widget" } }
    },
    {
      "name": "read back product",
      "method": "GET",
      "path": "/api/products/SKU-1",
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
      "name": "read back the product the create step returned",
      "method": "GET",
      "path": "/api/products/{{create product.id}}",
      "expect": { "status": 200, "json": { "sku": "SKU-1" } }
    }
  ]
}
```

`default_service` must match a service `name` in `goal-check.json` exactly. Every
response body is stored under its step name, so a later step can reference an earlier
one with `{{step name.field}}` — that is the mechanism for reading back what was
written, rather than hardcoding an identifier that may have changed.

`expect.json` is a **subset** match: only the fields written down are compared, extra
fields in the response do not fail. See
`${CLAUDE_PLUGIN_ROOT}/skills/goal-check/references/plan-schema.md` for every field,
variable references and the remaining expectation types.

Check the plan before running it — a typo in a path or a variable name is cheaper to
find here than in a failed request:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/goal-check/scripts/probe.js" --dry-run /tmp/goal-check-plan.json
```

A dry run validates the plan only — including the references inside `expect` — and
sends nothing. Its summary means "the plan is well formed", not "the requests
succeeded".

### Step 5 — Run the plan

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/goal-check/scripts/probe.js" /tmp/goal-check-plan.json
```

Output:

```
OK create product  [POST http://127.0.0.1:8800/api/products]
    HTTP 201
FAIL duplicate sku conflicts  [POST http://127.0.0.1:8800/api/products]
    HTTP 500
    -> status 500, expected 409
    actual response: {"detail":"Internal Server Error"}

2/3 steps passed.
```

The exit code is non-zero when any step failed or errored.

A plan that creates data will hit conflicts on a second run. Restart the service with
a clean database before repeating it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/goal-check/scripts/goalctl.js" up --service api
```

This resets the data **only** when the service uses a throwaway SQLite file inside the
run directory — that is what the `DATABASE_URL` in `goal-check.json` arranges. For a
database server (Postgres, MySQL), `up` does not reset anything: add an explicit
reset to the plan or the start command (`docker compose down -v && up -d`, or a
migration that drops and recreates the schema), and make sure the plan creates data
with unique identifiers so it can be repeated.

Each request has a 15 second timeout. Raise it for slow endpoints with
`--timeout <ms>`.

### Step 6 — Diagnose failures

The real cause of a 500 is almost always in the service log. The run directory is
printed by `goalctl.js up`; the log of each service is `<run directory>/<service>.log`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/goal-check/scripts/goalctl.js" status
tail -50 <run directory>/api.log
```

`${CLAUDE_PLUGIN_ROOT}/skills/goal-check/references/failure-signals.md` maps symptoms
to their usual root causes — a 404 with a correct-looking path, a 500 with an
`IntegrityError`, a query parameter that is ignored, a write that returns 201 but
reads back stale.

### Step 7 — Tear down

Always stop the services afterwards, otherwise a background process keeps holding a
port:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/goal-check/scripts/goalctl.js" down
```

`down` kills the process group and removes the throwaway database and logs.

## Reporting the result

Report honestly. Do not decorate the outcome.

- **Passed** — state which behaviours were verified. List the key assertions (status
  code, the fields that were checked) so the coverage is visible.
- **Failed** — give the failing step, the actual response, the root cause from the log,
  and the verdict: is the code buggy, or is the plan wrong (a bad expectation, an
  invalid request body)?
- **Not verified** — when a goal cannot be expressed as an HTTP call (it only affects a
  scheduled job, a background worker, a CLI path), say what was left out and why.

To decide between "the code is wrong" and "the plan is wrong", invert the expectation.
A 409 that the goal requires but the service turned into a 500 means the code is
missing an exception translation. A 200 whose fields disagree with the goal means the
code computed the wrong value. An expectation that does not follow from the goal means
the plan is wrong.

Mark the passes that carry no discriminating power (see "Two techniques" above) rather
than counting them as evidence.

## Common traps

- **Do not assert only on the status code.** A 201 with missing fields verifies nothing.
- **Do not skip the negative path.** "A duplicate SKU returns 409" is one sentence in
  the goal; its step cannot be skipped.
- **Do not copy expectations from the OpenAPI examples.** That verifies the
  implementation against itself.
- **Do not put the plan in the repository.** It is a throwaway artifact.
- **Do not leave the service running.** `down` releases the port and removes the
  temporary database.

## Resources

- `${CLAUDE_PLUGIN_ROOT}/skills/goal-check/references/plan-schema.md` — every plan
  field, expectation type and variable reference
- `${CLAUDE_PLUGIN_ROOT}/skills/goal-check/references/runner-config.md` —
  `goal-check.json` format, placeholder reference, and how to point a service at a
  throwaway database
- `${CLAUDE_PLUGIN_ROOT}/skills/goal-check/references/failure-signals.md` — symptom →
  root cause lookup table
- `${CLAUDE_PLUGIN_ROOT}/skills/goal-check/scripts/goalctl.js` — service lifecycle
  (`up` / `down` / `status`)
- `${CLAUDE_PLUGIN_ROOT}/skills/goal-check/scripts/probe.js` — run a plan and check the
  responses
- `${CLAUDE_PLUGIN_ROOT}/skills/goal-check/scripts/apishape.js` — print the interface
  shape, emit a plan skeleton
