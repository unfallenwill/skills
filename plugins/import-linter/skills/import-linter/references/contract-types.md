# import-linter 2.x contract types

import-linter 2.x ships **three** built-in contract types: `layers`, `forbidden`, and
`independence`. Every contract also supports the shared `ignore_imports` and
`unmatched_ignore_imports_alerting` options.

> Legacy note: 1.x offered `forbidden-imports`, `chain`, and `interference` as separate
> types. They were consolidated in 2.0 — use `forbidden` (now wildcard-aware and with
> `as_packages`) and `independence` to cover the same ground. If a user pastes an old
> config using a removed type, translate it rather than copying it.

Each section below shows option semantics, then both **INI** and **TOML** forms.

---

## `layers` — one-way dependency direction

Enforces a layered architecture: each layer may import the layers *below* it, never above.
Higher = depends on more; lower = depended on by more. Indirect (transitive) imports
count.

**Options**

- `layers` *(required, ordered high → low)* — module/subpackage names. No wildcards.
  - `(name)` — optional layer; missing-from-disk layers are ignored instead of breaking.
  - `a | b | c` — **independent** siblings in one layer: they also may not import each
    other.
  - `a : b : c` — **non-independent** siblings: they may import each other.
  - Do **not** mix `|` and `:` on the same line.
- `containers` *(optional, wildcards ok)* — parent packages. When set, `layers` are
  interpreted as *relative to each container*, so the same layering applies in many
  places without repetition.
- `exhaustive` *(optional bool, default false)* — every module inside each container
  must be declared as a layer (requires `containers`). Use to catch stray modules.
- `exhaustive_ignores` *(optional list)* — modules exempt from the exhaustiveness check.
- `ignore_imports`, `unmatched_ignore_imports_alerting` — see shared options.

**INI**

```ini
[importlinter:contract:layers-contract]
name = Layered architecture
type = layers
layers =
    mypackage.high
    mypackage.medium
    mypackage.low
```

With a container and an optional, independent-sibling layer:

```ini
[importlinter:contract:feature-layers]
name = Per-feature layering
type = layers
layers =
    high
    (medium)
    blue | green
    low
containers =
    myproject.billing
    myproject.checkout
```

**TOML**

```toml
[[tool.importlinter.contracts]]
name = "Layered architecture"
type = "layers"
layers = [
    "mypackage.high",
    "mypackage.medium",
    "mypackage.low",
]

[[tool.importlinter.contracts]]
name = "Per-feature layering"
type = "layers"
layers = ["high", "(medium)", "blue | green", "low"]
containers = ["myproject.billing", "myproject.checkout"]
```

---

## `forbidden` — these must not import those

Checks that a set of **source** modules does not import a set of **forbidden** modules.
By default descendants are included and indirect imports count.

**Options**

- `source_modules` *(required, wildcards ok)* — modules that must not do the importing.
- `forbidden_modules` *(required, wildcards ok)* — modules that must not be imported.
  External packages are allowed but only at the root level (`django`, not
  `django.db.models`), and require `include_external_packages = True` at the top level.
- `allow_indirect_imports` *(optional bool)* — when `True`, only direct imports break the
  contract; transitive chains are forgiven.
- `as_packages` *(optional bool, default true)* — when `False`, only the exact modules
  listed are checked; their descendants are not.
- `ignore_imports`, `unmatched_ignore_imports_alerting` — see shared options.

**INI**

```ini
[importlinter:contract:no-db-in-controllers]
name = Controllers must not touch the DB layer
type = forbidden
source_modules =
    mypackage.api
    mypackage.controllers
forbidden_modules =
    mypackage.db
    mypackage.orm
```

**TOML**

```toml
[[tool.importlinter.contracts]]
name = "Controllers must not touch the DB layer"
type = "forbidden"
source_modules = ["mypackage.api", "mypackage.controllers"]
forbidden_modules = ["mypackage.db", "mypackage.orm"]
```

Forbidding an external library (requires top-level `include_external_packages = true`):

```toml
[[tool.importlinter.contracts]]
name = "No raw requests in services"
type = "forbidden"
source_modules = ["mypackage.services"]
forbidden_modules = ["requests"]
```

---

## `independence` — peers must not depend on each other

Checks that a set of modules do not depend on each other **in any direction**, directly
or indirectly. Use for plugins, features, or bounded contexts that should stay decoupled.

**Options**

- `modules` *(required, wildcards ok)* — the modules/subpackages that must be independent.
- `ignore_imports`, `unmatched_ignore_imports_alerting` — see shared options.

**INI**

```ini
[importlinter:contract:independent-features]
name = Features must not import each other
type = independence
modules =
    mypackage.features.billing
    mypackage.features.checkout
    mypackage.features.inventory
```

**TOML**

```toml
[[tool.importlinter.contracts]]
name = "Features must not import each other"
type = "independence"
modules = [
    "mypackage.features.billing",
    "mypackage.features.checkout",
    "mypackage.features.inventory",
]
```

---

## Shared options

### `ignore_imports`

Optional list of specific edges to forgive, each written as
`importer -> imported`. If an ignored edge would otherwise break a contract, the contract
is kept instead. Supports wildcards:

- `*` — one module name segment (no subpackages): `mypackage.*` matches `mypackage.foo`
  but not `mypackage.foo.bar`.
- `**` — module name plus subpackages: `mypackage.**` matches `mypackage.foo.bar`.
- A wildcard must replace a **whole** segment: `mypackage.foo*` is invalid.

INI:

```ini
ignore_imports =
    mypackage.one.green -> mypackage.utils
    mypackage.two -> mypackage.four
    myproject.api.* -> myproject.internal.**
```

TOML:

```toml
ignore_imports = [
    "mypackage.one.green -> mypackage.utils",
    "mypackage.two -> mypackage.four",
    "myproject.api.* -> myproject.internal.**",
]
```

### `unmatched_ignore_imports_alerting`

Controls what happens when an `ignore_imports` expression matches nothing in the graph
(stale ignore entries).

- `error` *(default)* — fail loudly. Keep this in CI.
- `warn` — print a warning per unmatched expression.
- `none` — silent. Use only while triaging; stale ignores silently rot otherwise.

---

## Custom contract types

If the three built-ins do not express a rule, import-linter lets you register a **custom
contract type** (a subclass with a `check` method) via entry points or the
`contract_types` configuration. Reach for this only after confirming `layers`,
`forbidden`, and `independence` genuinely cannot express the constraint — most real-world
architecture rules are a combination of these three with `ignore_imports`.
