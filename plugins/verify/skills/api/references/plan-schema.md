# Plan schema

A plan is a JSON file describing the requests to send and the responses to expect.
Write it to `/tmp/verify-plan.json` — never into the repository.

```json
{
  "base_url": "http://127.0.0.1:3000",
  "steps": [ ... ]
}
```

## Top-level fields

| Field | Type | Description |
|---|---|---|
| `base_url` | string | Root URL of the service. Overridden by a step's own `base_url` or `url`. |
| `steps` | array | The steps, executed in order. |

The base URL can also come from the command line: `--base-url`. The step wins over
the plan, the plan wins over the command line.

## Step fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | no | Step name, used in the report and for variable references. Defaults to `step-<number>`. |
| `base_url` | string | no | Root URL for this step only. |
| `url` | string | no | Full URL. Takes precedence over `base_url` and `path`. |
| `method` | string | no | HTTP method, default `GET`. |
| `path` | string | no | Request path, may include a query string. Appended to the base URL; a step with no `path` hits the base URL root. Supports variable references. |
| `body` | any | no | Request body, sent as JSON. |
| `headers` | object | no | Extra request headers. |
| `coverage` | string | no | `verified` (default), `assumption` or `skipped`. See below. |
| `note` | string | no | Why a step is skipped. Shown under "Not verified". |
| `expect` | object | no | The expectations. See below. |
| `_fill_in`, `_body_shape` | string | no | Notes `apishape.js --skeleton` attaches to a step. They are not fields of the request — delete them before running. |

A step needs a target: `url`, or `base_url`, or the plan's `base_url`, or
`--base-url`. `path` is appended to the base URL.

## expect

| Field | Type | Description |
|---|---|---|
| `status` | number or number[] | Expected status code. An array means "any of these is acceptable". |
| `json` | object | Expected response JSON — a **subset** match. |
| `json_paths` | object | `{ "dotted.path": expected }` pairs, checked against the response JSON. |
| `text_contains` | string | Substring that must appear in the raw response body. |

**A step must assert something.** A step with no `status`, no `json`, no `json_paths`
and no `text_contains` passes whatever the service answers, so it is a plan error —
`probe.js` rejects it instead of counting it as a pass. An empty `json` object does
not count as an assertion either: it constrains nothing. (An empty `json` alongside a
`json_paths` or `text_contains` assertion is fine — that step does assert something.)

### Subset matching

`expect.json` only compares the fields that were written down. Extra fields in the
response do not fail. Nested objects are compared the same way, level by level.

```
expect {"sku": "SKU-1", "lines": [{"qty": 2}]}
actual {"sku": "SKU-1", "name": "Widget", "lines": [{"sku": "X", "qty": 2, "price": "1.0"}]}
-> PASS
```

Lists must have the same length and are compared item by item, in order.

Values are compared exactly. `"3.50"` and `3.5` are different — match the type the
service actually returns.

A reference that is **exactly** one placeholder keeps the JSON type of the value it
points at, so a numeric field stays a number and can be compared against a numeric
response field. A reference embedded in a longer string is always stringified:

```json
"expect": { "json": { "price": "{{create product.price}}" } }
```

If `create product.price` is `3.5`, this expects the number `3.5`, not `"3.5"`.

### json_paths

Use `json_paths` when the field name contains characters that are awkward in a subset
object, or when the value lives deep in the payload:

```json
"expect": {
  "status": 200,
  "json_paths": {
    "data.items.0.id": "SKU-1",
    "meta.total": 1
  }
}
```

List indexes are numeric path segments. A missing path is a failure, not a skip.

## Coverage markers

What a step claims it established. This is what makes the report readable: a count of
green ticks means nothing without knowing what each tick covered.

| `coverage` | Meaning | Counts as |
|---|---|---|
| `verified` | The step asserts what the requirement calls for | evidence |
| `assumption` | The step passed, but would pass even if the feature were broken | coverage, not evidence |
| `skipped` | The goal cannot be reached with an HTTP call | a gap |

`skipped` steps are not sent. They are reported under "Not verified", with their
`note` if they have one. Use them for the parts of the requirement that live in a
scheduled job, a background worker or a CLI path — they belong in the report, not
silently in the plan. A `skipped` step is a note in the report, not a task: do not go
looking for a scheduler or a CLI to check the goal, and do not perform the goal.

`assumption` steps still assert something; they are steps whose expectation does not
discriminate between "the feature works" and "the feature is ignored". Mark them
rather than letting them pass as evidence.

## Variable references

Every response body is stored in a variable table under its step name. Later steps can
reference earlier ones with `{{step name.field}}`:

```json
{
  "name": "create product",
  "method": "POST",
  "path": "/api/products",
  "body": { "sku": "SKU-1", "name": "Widget", "price": "3.50" },
  "expect": { "status": 201 }
},
{
  "name": "place order",
  "method": "POST",
  "path": "/api/orders",
  "body": {
    "order_id": "ORD-1",
    "lines": [{ "sku": "{{create product.sku}}", "qty": 2 }]
  },
  "expect": { "status": 201, "json": { "total": "7.00" } }
}
```

- The step name may contain spaces and non-ASCII characters; it must **not** contain a
  dot, because the first dot separates the step name from the field path. It must not
  contain braces either — the braces of a reference cannot be nested, so
  `{{a {b}.c}}` cannot be parsed and the plan is rejected.
- Nested fields use further dots: `{{create product.lines.0.sku}}`.
- Referencing a step that does not exist fails **that step** with `undefined variable`
  and leaves the rest of the plan running. Referencing a field that is not there
  fails with `undefined field`.
- Only JSON responses are stored. A step whose response is not JSON captures nothing.

## Complete example

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
      "expect": { "status": 201, "json": { "sku": "SKU-1", "name": "Widget", "price": "3.50" } }
    },
    {
      "name": "read back product",
      "method": "GET",
      "path": "/api/products/{{create product.sku}}",
      "expect": { "status": 200, "json": { "name": "Widget" }, "json_paths": { "price": "3.50" } }
    },
    {
      "name": "duplicate sku conflicts",
      "method": "POST",
      "path": "/api/products",
      "body": { "sku": "SKU-1", "name": "Another", "price": "1.00" },
      "expect": { "status": 409 }
    },
    {
      "name": "missing product is 404",
      "method": "GET",
      "path": "/api/products/GHOST",
      "expect": { "status": 404 }
    },
    {
      "name": "invalid body is rejected",
      "method": "POST",
      "path": "/api/products",
      "body": { "sku": "", "name": "X", "price": "-1" },
      "expect": { "status": 422 }
    },
    {
      "name": "price filter applies",
      "method": "GET",
      "path": "/api/products?min_price=2",
      "coverage": "assumption",
      "expect": { "status": 200, "json_paths": { "total": 1 } }
    },
    {
      "name": "a threshold above every price returns nothing",
      "method": "GET",
      "path": "/api/products?min_price=99",
      "coverage": "verified",
      "expect": { "status": 200, "json_paths": { "total": 0 } }
    },
    {
      "name": "place order",
      "method": "POST",
      "path": "/api/orders",
      "body": { "order_id": "ORD-1", "lines": [{ "sku": "{{create product.sku}}", "qty": 2 }] },
      "expect": { "status": 201, "json": { "order_id": "ORD-1", "total": "7.00" } }
    },
    {
      "name": "order for unknown sku is 404",
      "method": "POST",
      "path": "/api/orders",
      "body": { "order_id": "ORD-2", "lines": [{ "sku": "GHOST", "qty": 1 }] },
      "expect": { "status": 404 }
    },
    {
      "name": "the reconciliation job is not reachable over HTTP",
      "coverage": "skipped",
      "note": "the requirement only affects the nightly reconciliation job"
    }
  ]
}
```

## Running

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/api/scripts/probe.js" /tmp/verify-plan.json
```

| Option | Description |
|---|---|
| `--dry-run` | Validate the plan only — paths, variable references, the references inside `expect` and the coverage markers. Sends nothing. |
| `--base-url` | Root URL of the service, used when the plan does not name one. |
| `--timeout` | Per-request timeout in milliseconds. Default 15000. |
| `--json` | Print the results as JSON. |

Flags may come before or after the plan file.

An empty plan is an error: it verifies nothing, and reporting it as a pass would be a
false claim.

Step names must be unique: two steps sharing a name overwrite each other in the
variable table, and the later one wins.

Exit code: 0 when every step passed, 1 when any step failed or errored. `skipped`
steps do not fail the run — a gap is not a failure, and the report says so.
