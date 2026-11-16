# Plan schema

A plan is a JSON file describing the requests to send and the responses to expect.
Write it to `/tmp/verify-plan.json` — never into the repository.

```json
{
  "default_service": "api",
  "steps": [ ... ]
}
```

## Top-level fields

| Field | Type | Description |
|---|---|---|
| `default_service` | string | Service used by steps that do not name one. Resolved through the run manifest written by `srv.js`. |
| `steps` | array | The steps, executed in order. |

## Step fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | no | Step name, used in the report and for variable references. Defaults to `step-<number>`. |
| `service` | string | no | Service name; overrides `default_service`. |
| `base_url` | string | no | Service root URL. Takes precedence over `service`. |
| `url` | string | no | Full URL. Takes precedence over `base_url` and `path`. |
| `method` | string | no | HTTP method, default `GET`. |
| `path` | string | no | Request path, may include a query string. Required unless `url` or `base_url` is given. Supports variable references. |
| `body` | any | no | Request body, sent as JSON. |
| `headers` | object | no | Extra request headers. |
| `expect` | object | no | The expectations. See below. |

A step needs a target: either `url`, or `base_url`, or `service` (with a
`default_service` fallback). `path` is appended to `base_url`.

The manifest is only read when a step actually names a service. A plan whose steps
carry their own `base_url` or `url` runs without one.

## expect

| Field | Type | Description |
|---|---|---|
| `status` | number or number[] | Expected status code. An array means "any of these is acceptable". |
| `json` | object | Expected response JSON — a **subset** match. |
| `json_paths` | object | `{ "dotted.path": expected }` pairs, checked against the response JSON. |
| `text_contains` | string | Substring that must appear in the raw response body. |

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
  dot, because the first dot separates the step name from the field path.
- Nested fields use further dots: `{{create product.lines.0.sku}}`.
- Referencing a step that does not exist fails **that step** with `undefined variable`
  and leaves the rest of the plan running.
- Only JSON responses are stored. A step whose response is not JSON captures nothing.

## Complete example

```json
{
  "default_service": "api",
  "steps": [
    {
      "name": "create product",
      "method": "POST",
      "path": "/api/products",
      "body": { "sku": "SKU-1", "name": "Widget", "price": "3.50" },
      "expect": { "status": 201, "json": { "sku": "SKU-1", "name": "Widget", "price": "3.50" } }
    },
    {
      "name": "read back product",
      "method": "GET",
      "path": "/api/products/SKU-1",
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
      "expect": { "status": 200, "json_paths": { "total": 1 } }
    },
    {
      "name": "place order",
      "method": "POST",
      "path": "/api/orders",
      "body": { "order_id": "ORD-1", "lines": [{ "sku": "SKU-1", "qty": 2 }] },
      "expect": { "status": 201, "json": { "order_id": "ORD-1", "total": "7.00" } }
    },
    {
      "name": "order for unknown sku is 404",
      "method": "POST",
      "path": "/api/orders",
      "body": { "order_id": "ORD-2", "lines": [{ "sku": "GHOST", "qty": 1 }] },
      "expect": { "status": 404 }
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
| `--dry-run` | Validate the plan only — paths, service names, variable references, and the references inside `expect`. Sends nothing. |
| `--manifest` | Path to the `manifest.json` written by `srv.js`. |
| `--run-dir` | The run directory to read the manifest from. |
| `--timeout` | Per-request timeout in milliseconds. Default 15000. |
| `--json` | Print the results as JSON. |

Flags may come before or after the plan file.

An empty plan is an error: it verifies nothing, and reporting it as a pass would be
a false claim.

Run the script **from the repository root**. The run directory is derived from the
repository path, so running from elsewhere points the script at a different directory
and it will not find the manifest. Use `--manifest`, `--run-dir`, or
`VERIFY_RUN_DIR` to point at an explicit directory. A plan whose steps carry
their own `base_url` or `url` does not need the manifest at all.

A dry run sends nothing: its summary means "the plan is well formed", not "the
requests succeeded".

`default_service` must match a service `name` in `verify.json` exactly. A
mismatch makes every step fail with `unknown service`.

Step names must be unique: two steps sharing a name overwrite each other in the
variable table, and the later one wins.

Exit code: 0 when every step passed, 1 when any step failed or errored.
