# Generation guide: from project layout to contracts

How to turn a real Python project into a small, correct import-linter config. Read this
alongside `../import-linter/references/project-templates/`.

## 1. Detect project shape

Glob for package roots (`**/__init__.py` and top-level package directories), **skipping
environment and build-output directories** (`.venv`, virtualenvs, `node_modules`, `build`,
`dist`, `.eggs`). Grep for framework signals (`from django`, `import fastapi`, `manage.py`,
`settings.py`). Then map to a shape:

| Signal | Shape | Starting template |
|--------|-------|-------------------|
| One top-level package, subpackages like `api/services/models` | Single layered app | `generic.md` |
| `manage.py`, `settings.py`, `from django` / `import django` | Django/web | `django.md` |
| Multiple top-level packages, no shared `__init__.py`, maybe `packages/` or `src/<pkg>` | Monorepo / multi-package | `monorepo.md` |
| `pyproject.toml` with `[project]` + a single package with `_internal`/`api` split | Library / SDK | `library.md` |

Do not ask the user until the shape is genuinely ambiguous (two signals conflict, or none
match).

## 2. Find the root package(s)

- Flat layout: the directory containing `__init__.py` at the repo root (or under the
  project dir).
- `src/` layout: the package directory under `src/`. The package must be installed
  editable for `lint-imports` to import it — flag this to the user.
- Namespace package: list each portion in `root_packages` with its dotted name.

If you cannot determine the importable name confidently, ask the user once rather than
guessing — a wrong `root_package` fails every contract with a graph-build error.

## 3. Decide the dependency direction

For each candidate layer, ask: "does this import the others, or do the others import it?"
- Things that handle external entry (HTTP, CLI, jobs) → high.
- Pure data definitions / ORM models / protocols → low.
- Business logic → middle.

`Grep` for `from myproject.X import` / `import myproject.X` across subpackages to confirm
the real direction before committing to a `layers` order. The order in the contract is
high → low; getting it backwards makes every real dependency a violation.

## 4. Choose contract types

Start minimal and add only when a rule is not already implied:

1. **`layers`** — the backbone. One contract capturing the main direction. Use `containers`
   when the same layering repeats across apps/features.
2. **`forbidden`** — add when a specific module set must never reach another (e.g. models
   must not import views). Often redundant with `layers` for adjacent layers, but useful
   for non-adjacent or cross-package bans.
3. **`independence`** — add when peer modules/packages must not couple (feature modules,
   pluggable backends).

Resist enumerating every subpackage as its own layer. Layers should be the 3–5 conceptual
tiers; everything else is either inside a layer or exempt.

## 5. Decide the format

- `pyproject.toml` if it already exists in the project → append `[tool.importlinter]` +
  `[[tool.importlinter.contracts]]`. Centralizes tool config.
- `.importlinter` (INI) if there is no `pyproject.toml`, or the team keeps tool config out
  of it.
- `setup.cfg` only if the project already uses it and not the others.

Never create a second config file when one already exists — import-linter's search order
(`setup.cfg`, then `.importlinter`, then `pyproject.toml`) means a stray file can shadow
the intended one.

## 6. Common defaults to apply

- `exclude_type_checking_imports = true` — almost always wanted; type-only imports are not
  runtime dependencies.
- Explicit `id` on every contract — makes `--contract` targeting and the `add-contract` /
  `check` skills reliable.
- `(optional)` parentheses for layers that not every container has (e.g. `(services)` when
  some Django apps lack a services module).
- Do **not** set `include_external_packages = true` unless a `forbidden` contract names an
  external package — it enlarges the graph for no benefit otherwise.

## 7. Validate before declaring done

Always run `lint-imports` against what you wrote. A generated config that has never run is
unverified. If the first run reports the root package is not importable, tell the user the
exact install/invocation to fix it (`pip install -e .`, `uv run lint-imports`, etc.) rather
than leaving a config that cannot execute.
