# Template: generic Python package

Use for a single-package application or library with a conventional layered layout
(`api`/`services`/`models` or `controllers`/`domain`/`infra`). Replace `myproject` and
the layer names with the real package and subpackages discovered in the project.

Assumed layout:

```
myproject/
├── api/        # HTTP / CLI / external entrypoints  (high)
├── services/   # business logic
├── repositories/  # data access
└── models/     # data definitions / ORM classes      (low)
```

Goal: enforce a one-way dependency direction (api → services → repositories → models) and
forbid the data layer from reaching back up to the API.

## pyproject.toml

```toml
[tool.importlinter]
root_package = "myproject"
exclude_type_checking_imports = true

[[tool.importlinter.contracts]]
id = "layers"
name = "Layered architecture"
type = "layers"
layers = [
    "myproject.api",
    "myproject.services",
    "myproject.repositories",
    "myproject.models",
]

[[tool.importlinter.contracts]]
id = "no-upward-from-models"
name = "Data layer must not import API/services"
type = "forbidden"
source_modules = [
    "myproject.models",
    "myproject.repositories",
]
forbidden_modules = [
    "myproject.api",
    "myproject.services",
]
```

For the `.importlinter` (INI) form, apply the translation table in `../config-formats.md`
— the only structural change is that the module lists become multiline indented entries.

## When to adapt

- **No `repositories` layer** → drop it from `layers` and from `source_modules`; keep the
  direction api → services → models.
- **Shared `utils`/`schemas` imported by everyone** → leave them out of the `layers`
  contract (they are not layers) and let them be imported freely; only constrain the
  directional layers.
- **Sibling services that should stay decoupled** → add an `independence` contract over
  `myproject.services.billing`, `myproject.services.checkout`, etc.
