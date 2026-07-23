# import-linter configuration formats

import-linter reads configuration from one of (searched in this order when `--config` is
not given): `setup.cfg` (INI), `.importlinter` (INI), `pyproject.toml` (TOML). Both INI
and TOML are fully supported and equivalent in power; pick by project convention.

Every config has two parts:

1. **Top-level** `[importlinter]` / `[tool.importlinter]` — graph-wide settings.
2. **Contracts** — one section/table per rule.

## Top-level options

- `root_package` *(string, required unless `root_packages` is set)* — the top-level
  importable package to validate. For namespace packages, supply the portion name
  (e.g. `myns.foo`). Must be importable (installed editable or on the path).
- `root_packages` *(list)* — use instead of `root_package` to analyse multiple packages.
- `include_external_packages` *(bool)* — also build nodes for external packages so they
  can be referenced in `forbidden_modules`. External packages are never statically
  analyzed; only imports *of* them are checked. Required if any contract forbids an
  external package.
- `exclude_type_checking_imports` *(bool)* — ignore imports made under
  `if TYPE_CHECKING:`. Enable when type-checking-only imports should not count as real
  dependencies (the usual reason to want this).

## Full example — INI (`.importlinter` or `setup.cfg`)

```ini
[importlinter]
root_package = mypackage
include_external_packages = True
exclude_type_checking_imports = True

[importlinter:contract:layers-contract]
name = Layered architecture
type = layers
layers =
    mypackage.api
    mypackage.services
    mypackage.models

[importlinter:contract:no-db-in-api]
name = API must not touch the ORM
type = forbidden
source_modules =
    mypackage.api
forbidden_modules =
    mypackage.models
    sqlalchemy
ignore_imports =
    mypackage.api.di -> mypackage.models
```

Contract section headers in INI are `importlinter:contract:<id>`. The `<id>` (here
`layers-contract`, `no-db-in-api`) is what you pass to `--contract` on the CLI.

## Full example — TOML (`pyproject.toml`)

```toml
[tool.importlinter]
root_package = "mypackage"
include_external_packages = true
exclude_type_checking_imports = true

[[tool.importlinter.contracts]]
id = "layers-contract"
name = "Layered architecture"
type = "layers"
layers = ["mypackage.api", "mypackage.services", "mypackage.models"]

[[tool.importlinter.contracts]]
id = "no-db-in-api"
name = "API must not touch the ORM"
type = "forbidden"
source_modules = ["mypackage.api"]
forbidden_modules = ["mypackage.models", "sqlalchemy"]
ignore_imports = ["mypackage.api.di -> mypackage.models"]
```

In TOML each contract is an entry in the `[[tool.importlinter.contracts]]` array-of-tables.
The `id` key (optional but recommended) is what `--contract` selects; if omitted,
import-linter generates one, but an explicit id is easier to target from the CLI.

## Format-translation rules

When moving between INI and TOML:

| INI | TOML |
|-----|------|
| `[importlinter]` | `[tool.importlinter]` |
| `[importlinter:contract:<id>]` | `[[tool.importlinter.contracts]]` with `id = "<id>"` |
| Multiline indented list | String array `[ "a", "b" ]` |
| `True` / `False` (INI) | `true` / `false` (TOML) |
| `key = value` inline | `key = "value"` (strings must be quoted) |
| `ignore_imports` multiline edges | `ignore_imports = [ "a -> b", ... ]` |

Two gotchas when hand-editing:

- INI multiline lists must be **indented** continuation lines; a flush-left line ends the
  list.
- In TOML, sibling-layer expressions stay inside one string —
  `layers = ["high", "blue | green", "low"]` — do **not** split `blue | green` into two
  array elements.

## Running against a specific file

```bash
lint-imports --config pyproject.toml           # extension .toml → parsed as TOML
lint-imports --config .importlinter            # no .toml extension → parsed as INI
lint-imports --config setup.cfg --contract layers-contract
```

`--config` overrides the default search. The file extension (`.toml` or not) decides the
parser.

### Choosing the runner

The root package must be importable, so run `lint-imports` through the project's own
toolchain:

| Detection | Runner |
|-----------|--------|
| `uv.lock` | `uv run lint-imports` |
| `poetry.lock` | `poetry run lint-imports` |
| `Pipfile` / `requirements.txt` / active venv | `lint-imports` (env must be active) |

With a `src/` layout, install the package editable (`pip install -e .`) first — the graph
cannot build from source files alone.
