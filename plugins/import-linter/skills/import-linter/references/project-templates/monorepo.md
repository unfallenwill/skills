# Template: monorepo / multi-package

Use when the repository holds several top-level packages that must stay decoupled or
follow an agreed dependency direction. import-linter analyses multiple roots via
`root_packages`; each package must be importable (installed editable, or on `PYTHONPATH`).

Assumed layout (no shared top-level `__init__.py`):

```
packages/
├── billing/      # package: billing
├── checkout/     # package: checkout
├── inventory/    # package: inventory
└── platform/     # package: platform  (shared foundation)
```

Goal: features (`billing`, `checkout`, `inventory`) may depend on the shared `platform`
but **must not depend on each other**; `platform` may depend on nothing in-repo.

## pyproject.toml

```toml
[tool.importlinter]
root_packages = ["billing", "checkout", "inventory", "platform"]
exclude_type_checking_imports = true

[[tool.importlinter.contracts]]
id = "independent-features"
name = "Features must not import each other"
type = "independence"
modules = ["billing", "checkout", "inventory"]

[[tool.importlinter.contracts]]
id = "platform-depends-on-nothing"
name = "Platform must not import feature packages"
type = "forbidden"
source_modules = ["platform"]
forbidden_modules = ["billing", "checkout", "inventory"]

[[tool.importlinter.contracts]]
id = "feature-layering"
name = "Each feature layers api > domain > infra"
type = "layers"
layers = ["api", "domain", "infra"]
containers = ["billing", "checkout", "inventory"]
```

For the `.importlinter` (INI) form, apply the translation table in `../config-formats.md`.

## Monorepo pitfalls

- **Packages not installed** → `root_packages` entries must be importable. In a `src/`
  layout, install each package editable (`pip install -e packages/billing`) or run via the
  project toolchain so the environment resolves them.
- **Shared internal utils package** → if `platform` is allowed to be imported by everyone,
  keep it out of the `independence` set; only the features must be mutually independent.
- **Namespace packages** → if packages share a namespace (e.g. `myorg.billing`), list the
  portion names in `root_packages` and use the fully-qualified names in contracts.
