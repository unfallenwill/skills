# Template: library / SDK (public API boundary)

Use for a package published for external consumers. Goal: keep the dependency direction
public-API → internals — internals must never import the public façade (that would create
cycles), and the public API must sit above the implementation.

Assumed layout:

```
mylib/
├── __init__.py        # public exports (the API surface)   (high)
├── api.py             # typed public functions
├── _internal/         # implementation details             (low)
│   ├── engine.py
│   └── ...
└── types.py           # public types / protocols
```

## pyproject.toml

```toml
[tool.importlinter]
root_package = "mylib"
exclude_type_checking_imports = true

[[tool.importlinter.contracts]]
id = "direction"
name = "Public API sits above internals"
type = "layers"
layers = [
    "mylib.api",
    "mylib._internal",
]

[[tool.importlinter.contracts]]
id = "no-facade-from-internals"
name = "Internals must not import the public facade"
type = "forbidden"
source_modules = ["mylib._internal"]
forbidden_modules = ["mylib.api"]
```

For a library split into several submodules that should stay independent (e.g. pluggable
backends), add an `independence` contract:

```toml
[[tool.importlinter.contracts]]
id = "independent-backends"
name = "Backends must not import each other"
type = "independence"
modules = ["mylib._internal.backends.fs", "mylib._internal.backends.s3", "mylib._internal.backends.gcs"]
```

For the `.importlinter` (INI) form, apply the translation table in `../config-formats.md`.

## Library-specific pitfalls

- **`__init__.py` re-exports everything** → a "star-style" public package can pull in
  internals by accident; constrain it with `layers` putting `mylib` itself at the top and
  `_internal` below.
- **Private modules as the public API** → if users import `mylib._internal.x` directly, no
  contract will stop them; the contract protects the *in-repo* direction, which is what you
  control.
