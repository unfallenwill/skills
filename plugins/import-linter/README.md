# import-linter

Configure, maintain, and diagnose [import-linter](https://import-linter.readthedocs.io/) —
the Python tool that enforces your project's import architecture via declarative
"contracts" run through `lint-imports`. 配置、维护并诊断 Python 项目的导入架构约束。

## Skills

| Skill | Command | What it does |
|-------|---------|--------------|
| `import-linter` | _(auto-trigger)_ | Reference knowledge: contract types (`layers`/`forbidden`/`independence`), config formats, CLI. |
| `configure` | `/import-linter:configure [dir] [--format pyproject\|ini]` | Analyze a project and generate an initial config that matches its real architecture. Interactive: scans, proposes, confirms, writes, validates. |
| `add-contract` | `/import-linter:add-contract <type> [modules...]` | Add or modify a contract in an existing config (INI or TOML), in place. |
| `check` | `/import-linter:check [--fix] [dir]` | Run `lint-imports`, map each broken contract to `file:line`, and recommend a fix; apply fixes with `--fix`. |

## Supported configuration

- **Formats:** `pyproject.toml` (`[tool.importlinter]`) and `.importlinter` / `setup.cfg`
  (INI). `configure` picks by existing files; `--format` overrides.
- **Contract types:** all import-linter 2.x built-ins — `layers`, `forbidden`,
  `independence` — plus `ignore_imports` wildcards and the shared options.
- **Project templates** ship in the `import-linter` skill for generic, Django/web,
  monorepo, and library/SDK layouts.

## Prerequisites

- Python project with an importable root package (editable install, or run via the
  project's toolchain).
- `import-linter` installed in the project environment:

  ```bash
  pip install import-linter
  # or, with uv:  uv add --dev import-linter
  ```

- `lint-imports` must be runnable (via `uv run` / `poetry run` / direct) for `configure`,
  `add-contract`, and `check` to validate their results.

## Local testing

```bash
/plugin marketplace add unfallenwill/treadonsnow-skills
/plugin install import-linter@treadonsnow-skills
```

Then try:

```
/import-linter:configure .            # generate a config for the current project
/import-linter:check                  # run lint-imports and diagnose
/import-linter:add-contract layers api services models
```

## Notes

- The `configure` and `check` skills optionally use the `feature-dev:code-explorer` agent
  for deep scanning; if it is unavailable they fall back to `Glob`/`Grep`/`Read`.
- Generated/edited configs are always validated by actually running `lint-imports` — a
  config that has never executed is considered unfinished.
