# Goal-Check

Verify runtime behaviour against the task goal — not against the implementation that
was just written.

## Why it exists

Green gates do not mean correct behaviour. Unit tests answer *"is the code written
correctly?"*. They do not answer *"does the system actually do what the task
requires?"*. The two answers diverge, and the divergence is expensive: a route mounted
under the wrong prefix, a serialized field dropped, an exception never translated into
a status code — all of them pass every unit test and still break the feature.

Goal-check closes the gap between the gate and the merge:

1. start the service with the **repository's own** start command
2. send real HTTP requests, driven by a declarative plan
3. check the responses against the **task goal**
4. report passes, failures and uncovered gaps — honestly

## What it gives you

- **Goal-derived plans** — every expectation traces back to a sentence in the task
  goal, never to the implementation. Copying expectations out of the OpenAPI examples
  verifies the code against itself and proves nothing.
- **A thin runner, not a framework** — the plugin never decides how a service boots.
  `npm run dev`, `uv run uvicorn ...`, `make dev`, `docker compose up ...` — the
  repository's own command is used verbatim. The runner only allocates a port,
  injects environment variables, waits for readiness, captures the log, and cleans up
  the process group afterwards.
- **Throwaway databases** — point `DATABASE_URL` at the run directory and every run
  starts from an empty database, without touching development data.
- **Discriminating assertions** — a step that passes whether or not the feature works
  is flagged as carrying no information, rather than counted as evidence.
- **Honest reporting** — what was verified, what failed, and what could not be
  verified at all, each with its own reason.

## Requirements

Node.js 18 or newer (the scripts use the built-in `fetch`). No npm dependencies.

## Installation

```bash
/plugin marketplace add unfallenwill/treadonsnow-skills
/plugin install goal-check@treadonsnow-skills
```

## Usage

**Automatic** — just ask for it:

> Start the service and check the API
> Verify the change actually works
> Smoke test the endpoint
> Run it and hit the API
> 起服务验证一下
> 跑起来打一遍接口
> 端到端确认

**Manual** — the bundled scripts can be used directly:

```bash
S="${CLAUDE_PLUGIN_ROOT}/skills/goal-check/scripts"

# start the service (repository's own command, from goal-check.json)
node "$S/goalctl.js" up --service api

# see what the service actually accepts
node "$S/apishape.js"

# run the plan
node "$S/probe.js" /tmp/goal-check-plan.json

# stop and clean up
node "$S/goalctl.js" down
```

Run the scripts from the repository root: the run directory is derived from the
repository path.

## The plan

```json
{
  "default_service": "api",
  "steps": [
    {
      "name": "create product",
      "method": "POST",
      "path": "/api/products",
      "body": { "sku": "SKU-1", "name": "Widget" },
      "expect": { "status": 201, "json": { "sku": "SKU-1" } }
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
      "body": { "sku": "SKU-1", "name": "Another" },
      "expect": { "status": 409 }
    }
  ]
}
```

`expect.json` is a subset match — only the fields written down are compared.
`expect.json_paths` checks dotted paths, `expect.text_contains` checks the raw body.
Every response body is stored, so later steps can reference earlier ones with
`{{step name.field}}`.

## Service configuration

`goal-check.json` at the repository root:

```json
{
  "services": [
    {
      "name": "api",
      "cwd": "services/api",
      "start": "npm run dev -- --port {port}",
      "ready": { "url": "/healthz" },
      "env": { "DATABASE_URL": "sqlite:///{tmpdir}/api.db" }
    }
  ]
}
```

Placeholders: `{host}`, `{port}`, `{base_url}`, `{tmpdir}`, `{run_dir}`, `{cwd}`,
`{name}`. See `skills/goal-check/references/runner-config.md` for the full format.

## Structure

```
goal-check/
├── .claude-plugin/plugin.json
├── skills/goal-check/
│   ├── SKILL.md                          # the workflow and the principles behind it
│   ├── references/
│   │   ├── plan-schema.md                # every plan field, expectation type, variable reference
│   │   ├── runner-config.md              # goal-check.json format, placeholders, throwaway databases
│   │   └── failure-signals.md            # symptom -> root cause lookup
│   └── scripts/
│       ├── goalctl.js                    # service lifecycle: up / down / status
│       ├── probe.js                      # run a plan, check the responses
│       └── apishape.js                   # print the interface shape, emit a plan skeleton
└── README.md
```
