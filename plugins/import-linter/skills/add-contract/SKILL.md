---
name: add-contract
version: 0.1.0
description: >
  Add a new contract to (or modify an existing contract in) an import-linter config
  (`.importlinter` or `pyproject.toml` `[tool.importlinter]`). Trigger when the user asks
  to "add a layer contract", "forbid these imports", "add an import-linter contract",
  "make these modules independent", "tighten import rules", 增加导入契约, 添加分层规则,
  禁止这些导入, 让这几个模块互相独立, or references an existing import-linter config and
  wants a new rule appended. For generating the first config from scratch, use `configure`;
  for diagnosing violations of an existing rule use `check`.
argument-hint: "<layers|forbidden|independence> [modules...]"
allowed-tools:
  - Read
  - Edit
  - Glob
  - Grep
  - Bash
  - AskUserQuestion
---

# Add or modify an import-linter contract

Edit an **existing** import-linter config in place: append a new contract, or adjust one
that is already there. Always preserve the file's format (INI or TOML) and the contracts
the user already has.

**Parameters:** `$ARGUMENTS` optionally starts with a contract type (`layers`,
`forbidden`, or `independence`) and module names. If the intent is ambiguous (which
modules, which direction, what is forbidden), use `AskUserQuestion` rather than guessing.

## Reference

Read before editing. This skill has no local `references/`; it reuses the sibling
`import-linter` skill's (paths shown are relative to this `SKILL.md`):

- **`../import-linter/references/contract-types.md`** — exact fields and list syntax for
  each type. This is the source of truth for option names.
- **`../import-linter/references/config-formats.md`** — INI section headers vs TOML
  array-of-tables, and how lists are written in each.

## Flow

### Step 1 — Find and load the existing config

1. Resolve the target directory (from `$ARGUMENTS` or cwd).
2. Locate the config in search order: `setup.cfg`, `.importlinter`, `pyproject.toml`. If
   more than one exists, confirm with the user which to edit — a stray second file can
   shadow the intended one.
3. `Read` the file. Note the format (INI vs TOML), the existing `root_package` /
   `root_packages`, and the contracts already present (by `id`/section name).

If **no** config exists, stop and point the user to the `configure` skill rather than
silently bootstrapping a fresh one.

### Step 2 — Determine the contract to add or change

1. From `$ARGUMENTS` and the conversation, decide the type and the modules:
   - `layers` → ordered high → low. Confirm the direction with the user if not stated.
   - `forbidden` → `source_modules` and `forbidden_modules`. Confirm which is which.
   - `independence` → the set of modules that must stay decoupled.
2. If the user is modifying an existing contract, identify it by `id` and edit its fields
   in place; do not duplicate it.
3. If a contract with the same `id` already exists, either rename the new one or confirm
   the user wants to replace the old one.

### Step 3 — Write the contract in the file's native format

Match the existing format exactly.

**INI** — add a new section after the existing ones:

```ini
[importlinter:contract:<new-id>]
name = <Human readable name>
type = <layers|forbidden|independence>
<type-specific options as multiline indented lists>
```

**TOML** — append a new `[[tool.importlinter.contracts]]` table:

```toml
[[tool.importlinter.contracts]]
id = "<new-id>"
name = "<Human readable name>"
type = "<layers|forbidden|independence>"
# type-specific options as string arrays
```

Follow the INI/TOML invariants in `../import-linter/references/config-formats.md`
(indented INI lists, quoted TOML strings, sibling expressions in one string). If the new
contract forbids an external package, ensure the top-level section has
`include_external_packages` set (add it if missing, and tell the user). Give every contract
an explicit, stable `id`.

Use `Edit` for targeted changes; preserve all unrelated contracts and comments.

### Step 4 — Validate

Run the linter once over the whole config — the output names which contract(s) failed, so
an isolated pass adds nothing but a second graph build:

```bash
lint-imports --config <file>                         # detect the runner per config-formats.md
```

Interpret:

- **Parse error** → a field name is wrong, a list is malformed, or the format is mixed.
  Re-read `contract-types.md` / `config-formats.md` and fix.
- **`Unmatched ignore_imports` error** → a wildcard is malformed or the edge no longer
  exists; correct the expression or lower alerting only temporarily.
- **Broken (real violation)** → the new rule caught existing code. Report the violation
  with file/line. Offer to (a) keep the rule and let the user fix the code, (b) scope the
  rule down, or (c) triage via the `check` skill. Default to restructuring, not
  `ignore_imports` (see `../check/references/failure-diagnosis.md`).

## Output

Report: the file edited, the contract `id` added/changed, the exact `lint-imports` command
to re-run, and the validation result. If the new rule is broken by existing code, list the
violations so the user can decide how to reconcile.
