# verify

Test the runtime behaviour of an HTTP service against the requirement — not against
the implementation that was just written.

## Why it exists

Correct code is not the same as correct behaviour. A route mounted under the wrong
prefix, a serialized field dropped, an exception never translated into a status code
— each of those is code that looks right and still breaks the feature. Only running
the system and asking it the questions the requirement poses settles it.

The plugin answers one question — *"does the system actually do what the requirement
requires?"* — by:

1. sending real HTTP requests, driven by a declarative plan
2. checking the responses against the **requirement**
3. reporting what was verified, what failed, and what was not covered — honestly

It tests. It does **not** build the environment: the service must already be running.
The plugin starts nothing, allocates no ports, rewrites no configuration and touches
no database. A test that reshapes the system it tests proves less, not more.

## What it gives you

- **Requirement-derived plans** — every expectation traces back to a sentence in the
  requirement, never to the implementation. Copying expectations out of the OpenAPI
  examples tests the code against itself and proves nothing.
- **Coverage that is visible** — every step says what it establishes: `verified`
  (evidence), `assumption` (passed, but would pass even if the feature were broken) or
  `skipped` (a goal no HTTP call can reach). A count of green ticks means nothing
  without knowing what each tick covered.
- **A plan error, not a pass** — a step that asserts nothing is rejected. It would
  pass whatever the service answered, so counting it as evidence would be a false
  claim.
- **Honest reporting** — what was verified, what failed, and what could not be
  verified at all, each with its own reason.
- **Gaps are reported, not chased** — a goal no HTTP request can reach (a nightly job,
  a background worker, an email) is listed as a gap. The plugin does not go looking
  for a scheduler or a mail client to check it, and it does not perform the goal to
  prove it.

## Requirements

Node.js 18 or newer (the scripts use the built-in `fetch`). No npm dependencies. A
running HTTP service.

## Installation

```bash
/plugin marketplace add unfallenwill/skills
/plugin install verify@treadonsnow
```

## Usage

**Automatic** — just ask for it:

> Check the API of the running service
> Verify the change actually works
> Smoke test the endpoint
> 跑起来打一下接口
> 端到端确认

**Manual** — the bundled scripts can be used directly:

```bash
S="${CLAUDE_PLUGIN_ROOT}/skills/api/scripts"

# see what the service actually accepts
node "$S/apishape.js" --base-url http://127.0.0.1:3000

# check the plan without sending anything
node "$S/probe.js" --dry-run /tmp/verify-plan.json

# run the plan
node "$S/probe.js" /tmp/verify-plan.json
```

## The plan

```json
{
  "base_url": "http://127.0.0.1:3000",
  "steps": [
    {
      "name": "create product",
      "method": "POST",
      "path": "/api/products",
      "body": { "sku": "SKU-1", "name": "Widget" },
      "coverage": "verified",
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
    },
    {
      "name": "the nightly job is not reachable over HTTP",
      "coverage": "skipped",
      "note": "the requirement only affects the nightly reconciliation job"
    }
  ]
}
```

`expect.json` is a subset match — only the fields written down are compared.
`expect.json_paths` checks dotted paths, `expect.text_contains` checks the raw body.
Every response body is stored, so later steps can reference earlier ones with
`{{step name.field}}`.

## Coverage markers

| `coverage` | Meaning | Counts as |
|---|---|---|
| `verified` | The step asserts what the requirement calls for | evidence |
| `assumption` | The step passed, but would pass even if the feature were broken | coverage, not evidence |
| `skipped` | The goal cannot be reached with an HTTP call | a gap |

The report ends with what each of those came to:

```
Verified      2  (counts as evidence)
Failed        0  (the service did not behave as required)
Assumptions   1  (passed, but would pass even if the feature were broken)
Not verified  1  (goals this plan cannot check over HTTP)
```

## Structure

```
verify/
├── .claude-plugin/plugin.json
├── skills/api/
│   ├── SKILL.md                        # the workflow and the principles behind it
│   ├── references/
│   │   ├── plan-schema.md              # every plan field, coverage marker, variable reference
│   │   └── failure-signals.md          # symptom -> root cause lookup
│   └── scripts/
│       ├── probe.js                    # run a plan, check the responses
│       └── apishape.js                 # print the interface shape, emit a plan skeleton
├── evals/
│   ├── fixtures/
│   │   └── service.js                  # the fixture service the cases run against
│   ├── core-loop/case.yaml             # the happy path: derive, run, report
│   └── honest-gaps/case.yaml           # an unmet requirement and an unreachable goal
└── README.md
```

## Testing the plugin itself

`claude plugin eval` runs the skill against real prompts and scores the result with
graders. The suite lives in `evals/`:

| Case | What it checks |
|---|---|
| `core-loop` | The skill fires, the plan comes from the requirement, the probe runs, and the report names the assertions that were checked |
| `honest-gaps` | The report names a requirement the service does not meet, reports a goal no HTTP call can reach, and keeps the two apart |

Start one fixture instance per case, on the port its case names:

```bash
node plugins/verify/evals/fixtures/service.js 8901 &
node plugins/verify/evals/fixtures/service.js 8902 &

claude plugin eval plugins/verify --runs 1 \
  --allow-tools "Bash(node */skills/api/scripts/probe.js*)" \
                "Bash(node */skills/api/scripts/apishape.js*)" \
                "Bash(curl *http://127.0.0.1:8901/*)" \
                "Bash(curl *http://127.0.0.1:8902/*)" \
                "Write(/tmp/verify-plan.json)"
```

The fixture serves an OpenAPI document whose example responses are deliberately
wrong, so a plan that copies them fails — which is exactly what the skill tells
the agent not to do. It also accepts a product with no price instead of rejecting
it, so the "price is required" requirement is genuinely unmet and the report has
to say so.

Two things the eval needs from the machine:

- **A sandbox backend** — `bwrap` and `socat`. Without them `claude plugin eval`
  refuses to run the case rather than running the shell unconfined.
- **A route from the sandbox to the fixture.** The eval runs the plugin inside a
  confined sandbox with its own network namespace, and it cannot reach a service
  listening on the host's `127.0.0.1`. Where that is the case, drive the case
  without the sandbox instead:

```bash
claude -p "$(cat prompt.txt)" --plugin-dir plugins/verify \
  --allowed-tools "Bash(node */skills/api/scripts/probe.js*)" \
                  "Bash(node */skills/api/scripts/apishape.js*)" \
                  "Bash(curl *http://127.0.0.1:8901/*)" \
                  "Bash(curl *http://127.0.0.1:8902/*)" \
                  "Write(/tmp/verify-plan.json)" \
  --output-format json
```

