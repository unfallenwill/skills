---
name: import-linter
version: 0.1.0
description: >
  Reference knowledge for import-linter (the `lint-imports` CLI), the Python tool that
  enforces self-imposed import architecture via "contracts". Use when the user asks about
  import-linter, lint-imports, Python import architecture, layered imports, import
  contracts, forbidding imports between modules, dependency governance,
  导入依赖约束, 分层架构导入检查, 导入契约, or needs to understand contract types, the
  `.importlinter` / `pyproject.toml` config format, or how to read `lint-imports` output.
  For generating a new config use the `configure` skill; for editing an existing one use
  `add-contract`; for running and diagnosing use `check`.
allowed-tools:
  - Read
---

# import-linter reference

import-linter is a command-line tool (`lint-imports`) that checks a Python project's
imports against **contracts** — declarative rules about which modules may import which.
It is how a team makes an implicit architecture ("the database layer never imports the
HTTP layer") explicit and enforced in CI.

This skill is the knowledge backbone. The three sibling skills do the work:

- **`configure`** — analyze a project and generate an initial config.
- **`add-contract`** — add or modify contracts in an existing config.
- **`check`** — run `lint-imports` and diagnose failures.

## The mental model

1. import-linter builds an **import graph** of the project's root package(s) using Grimp.
2. Each **contract** is a rule evaluated against that graph. A contract is either *kept*
   or *broken*.
3. `lint-imports` exits non-zero if any contract is broken.

A contract always has a human-readable `name`, a `type`, and type-specific options. In
2.x there are exactly **three built-in contract types**: `layers`, `forbidden`, and
`independence` (see `references/contract-types.md` for full semantics, custom types, and
the 1.x → 2.x mapping).

| Type | Enforces | Typical question |
|------|----------|------------------|
| `layers` | Higher layers may import lower layers; never the reverse. | "Keep a one-way dependency direction." |
| `forbidden` | A set of source modules must not import a set of forbidden modules. | "These modules may never depend on those." |
| `independence` | A set of modules must not depend on each other in any direction. | "These peers must stay decoupled." |

## Configuration file location

If `--config` is not passed, import-linter searches the current directory for, in order:

- `setup.cfg` (INI)
- `.importlinter` (INI)
- `pyproject.toml` (TOML)

Both INI and TOML are fully supported. Prefer `pyproject.toml` for new projects (keeps
tooling config in one place); keep `.importlinter` when a project already uses it.

## Running

```bash
lint-imports                                  # use discovered config
lint-imports --config pyproject.toml          # explicit config (extension picks format)
lint-imports --contract layers-contract       # check one contract by id (repeatable)
lint-imports --no-cache --verbose             # fresh graph, noisy progress
```

A package must be **importable** (installed via pip / editable install, or on the path)
for the graph to build. With `uv` and a `src/` layout, that usually means
`uv run lint-imports` from a project where the package is installed editable.

## References

When the user needs specifics, read these (paths are relative to this `SKILL.md`):

- **`references/contract-types.md`** — full syntax + INI/TOML examples for `layers`,
  `forbidden`, `independence`, plus `ignore_imports` wildcards and `unmatched_ignore_imports_alerting`.
- **`references/config-formats.md`** — side-by-side INI vs TOML: top-level options
  (`root_package`, `include_external_packages`, `exclude_type_checking_imports`),
  contract sections, and contract `id` for `--contract` selection.
- **`references/project-templates/`** — ready-to-adapt configs by project shape:
  `generic.md`, `django.md`, `monorepo.md`, `library.md`.

Use the `Read` tool to load the relevant file, then ground every option name, list
syntax, and example in what is written there — do not rely on memory for exact field
names, because INI multiline lists and TOML arrays differ.

## Pitfalls

A broken contract and a non-violation failure (module not importable, parse error,
unmatched `ignore_imports`) are different problems with different fixes — see
`../check/references/failure-diagnosis.md` for triage and `references/contract-types.md`
for option semantics.
