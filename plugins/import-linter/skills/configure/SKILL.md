---
name: configure
version: 0.1.0
description: >
  Generate an initial import-linter configuration (`.importlinter` or `pyproject.toml`
  `[tool.importlinter]`) by analyzing an existing Python project and proposing contracts
  that match its real architecture. Trigger when the user asks to "set up import-linter",
  "configure import-linter", "generate import contracts", "bootstrap import-linter",
  "add import architecture rules", 配置 import-linter, 生成导入契约, 初始化 import-linter,
  or gives a Python project and wants import dependency rules produced. For editing
  an existing config use `add-contract`; for running and diagnosing use `check`.
argument-hint: "[项目目录路径] [--format pyproject|ini]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - AskUserQuestion
  - Agent
---

# Configure import-linter for a project

Produce a working import-linter config that reflects the project's *actual* architecture,
then prove it parses and runs. The work is interactive: scan, propose, confirm, write,
validate.

**Parameters:** `$ARGUMENTS` may contain a project directory (absolute or relative;
default: current working directory) and optionally `--format pyproject|ini` to force the
output format. If `--format` is absent, choose by existing files (see Step 4).

## Reference

Before generating, read these (paths relative to the sibling `import-linter` skill):

- **`../import-linter/references/config-formats.md`** — INI vs TOML structure and the
  top-level `root_package` / `root_packages` / `include_external_packages` /
  `exclude_type_checking_imports` options.
- **`../import-linter/references/contract-types.md`** — exact field names and list syntax
  for `layers`, `forbidden`, `independence`.
- **`references/generation-guide.md`** (in this skill) — how to detect project shape,
  choose contract types, and decide format. Its §1 table maps the project's signals to
  exactly one template under `../import-linter/references/project-templates/` — read that
  one template, not all four.

Ground every option name and list syntax in these files — INI multiline lists and TOML
arrays differ, and getting this wrong is the most common reason a generated config fails
to parse.

## Flow

### Step 1 — Locate the project and its root package(s)

1. Resolve the target directory from `$ARGUMENTS` (default: cwd).
2. Detect the project shape and root package(s) per `references/generation-guide.md` §1–2
   (Glob for package roots, skipping environment/build directories; Grep for framework
   signals). This picks both the `root_package` / `root_packages` and the starting template.
3. Optionally, if the `feature-dev:code-explorer` agent is available, spawn it
   (model: sonnet) to map the real subpackage-to-subpackage dependencies; otherwise
   rely on `Glob`/`Grep`/`Read` directly in Step 2.

### Step 2 — Propose the architecture

1. Read the template that generation-guide §1 selected (from
   `../import-linter/references/project-templates/`).
2. From the discovered subpackages, infer the dependency *direction* (which subpackages
   are high-level entrypoints vs low-level data). Map them to layer names.
3. Decide which contract types express the rules:
   - A clear top-to-bottom direction → `layers`.
   - Modules that must never reach a particular layer → `forbidden`.
   - Peer modules/packages that must stay decoupled → `independence`.
4. Prefer a small, meaningful set (often one `layers` + one `forbidden`) over many
   contracts. A config the team cannot read is not enforced.

### Step 3 — Confirm with the user

Present the proposal with `AskUserQuestion` before writing anything:

- The proposed `root_package` / `root_packages`.
- The layer order and contract set (one line each, e.g. "layers: api → services →
  models", "forbidden: models must not import api").
- The output format if it was not pinned by `--format`.

Adjust based on answers. The user knows intent that code alone cannot reveal (e.g. two
subpackages that *look* coupled but should be independent).

### Step 4 — Write the config

1. Choose the file:
   - If `--format` given, honor it.
   - Else if `pyproject.toml` exists, append to it under `[tool.importlinter]`.
   - Else create `.importlinter` (INI). Mention `setup.cfg` only if the project already
     uses it and not the others.
2. Write the top-level section (`root_package`/`root_packages`; add
   `exclude_type_checking_imports = true` unless there's a reason not to; add
   `include_external_packages = true` only if a contract forbids an external package).
3. Write each contract with an explicit, stable `id` (TOML `id` key; INI section suffix)
   so the user can target it later with `--contract`.
4. Keep module lists scoped to real, importable package paths found in Step 1 — do not
   invent subpackages.

### Step 5 — Validate

1. Confirm the root package is importable in the project's environment. Detect the runner
   per `../import-linter/references/config-formats.md` (`uv run` / `poetry run` / direct)
   and prefix `lint-imports` with it.
2. Run the linter:

   ```bash
   lint-imports --config <file>            # or: uv run lint-imports --config <file>
   ```

3. Interpret the outcome:
   - **Kept** → report success, show the written file path, and give the exact command to
     re-run.
   - **Broken** → this is expected on first generation; the existing code has violations.
     Report them clearly and tell the user they can either fix the code or, for a one-time
     migration, scope the contract down. Default to restructuring, not `ignore_imports`
     (see `../check/references/failure-diagnosis.md`); offer to invoke the `check` skill for
     guided diagnosis.
   - **Config/parse error or module-not-found** → fix the config (field name, list
     syntax, missing `include_external_packages`, wrong root package) and re-run.

## Output

End with: the path to the written config, the command to run `lint-imports`, and a
one-line summary of each contract. If validation surfaced violations, list them with the
file/line of the offending import so the user can act.
