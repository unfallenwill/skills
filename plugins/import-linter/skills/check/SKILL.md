---
name: check
version: 0.1.0
description: >
  Run import-linter (`lint-imports`) against a project and diagnose every broken contract:
  explain the illegal import, where it is, and how to fix it. With `--fix`, also apply the
  import fix. Trigger when the user asks to "run import-linter", "check imports", "diagnose
  lint-imports failures", "why is import-linter failing", "fix import violations", 跑一下
  import-linter, 检查导入违规, lint-imports 失败了, 诊断导入问题, 修复导入违规. For generating the first config use
  `configure`; for adding new rules to an existing config use `add-contract`.
argument-hint: "[--fix] [项目目录路径]"
allowed-tools:
  - Bash
  - Read
  - Grep
  - Edit
  - Glob
  - AskUserQuestion
  - Agent
---

# Run import-linter and diagnose failures

Execute `lint-imports` and turn its output into a clear, actionable report: for each
broken contract, show the illegal edge, the file/line responsible, and the recommended
fix. Apply fixes automatically only when `--fix` is present.

**Parameters:** `$ARGUMENTS` may contain `--fix` (enable automatic edits) and a project
directory (default: cwd).

## Reference

Read when interpreting a failure (path relative to this skill):

- **`references/failure-diagnosis.md`** — how to parse `lint-imports` output, the common
  violation shapes, and fix strategies (reorder, move, `TYPE_CHECKING`, restructure,
  `ignore_imports`).

## Flow

### Step 1 — Locate the config and environment

1. Resolve the target directory (from `$ARGUMENTS` or cwd).
2. Find the config (search order: `setup.cfg`, `.importlinter`, `pyproject.toml`). If none
   exists, stop and tell the user to run `configure` first.
3. Detect the runner per `../import-linter/references/config-formats.md` (lockfile →
   `uv run` / `poetry run` / direct) so the command runs in the right environment.

### Step 2 — Run the linter

```bash
lint-imports                                  # discovered config
lint-imports --config <file> --verbose        # explicit + verbose for diagnosis
```

Use the runner detected in Step 1.3.
If the command is not installed, tell the user how to install it
(`pip install import-linter`) and stop — do not fabricate results.

If `--verbose` output is hard to parse, scope to one contract with `--contract <id>` to
isolate the failure.

### Step 3 — Parse the output

For each broken contract, `lint-imports` reports the illegal chains. Extract per finding:

- The **contract** (name/id) and its **type** (`layers` / `forbidden` / `independence`).
- The **illegal edge(s)**: importer → imported, including any intermediate modules in the
  chain.
- The **concrete file(s) and line(s)** responsible. Map the module-level edge back to the
  actual `import` / `from ... import` statement in the source — use the
  `feature-dev:code-explorer` agent for this when available, otherwise `Grep`/`Read`.

### Step 4 — Propose a fix per finding

Read `references/failure-diagnosis.md` and pick the strategy that matches the violation:

- Move the import downward (toward the lower layer) or into the module that legitimately
  owns the dependency.
- Replace a runtime import with a `TYPE_CHECKING` import when it is only needed for type
  hints (requires `exclude_type_checking_imports = true`).
- Break a cycle by extracting the shared code into a lower module both sides can import.
- For a genuine, accepted exception, add a scoped `ignore_imports` edge — and call it out
  explicitly so it does not rot.

Default to structural fixes, not `ignore_imports` — see `references/failure-diagnosis.md`
for when suppression is legitimate.

### Step 5 — Apply fixes only with `--fix`

- Without `--fix`: present each finding as a report — contract, edge, file:line, and the
  recommended fix — and stop.
- With `--fix`: apply the structural fixes with `Edit` (move/reorder imports, switch to
  `TYPE_CHECKING`). For each fix, make the smallest change that resolves the edge. Then
  re-run `lint-imports` to confirm the contract is now kept.
- If a fix is risky (large move, behavior change), do not auto-apply it even under
  `--fix`; instead report it and ask. `--fix` is for safe, localized import changes.

### Step 6 — Handle non-violation failures

- **Module/package not found / graph build error** → the root package is not importable.
  Give the exact install or invocation (`pip install -e .`, `uv run ...`). This is an
  environment problem, not a code violation.
- **Config parse error** → a field name or list syntax is wrong; re-read
  `../import-linter/references/config-formats.md` and suggest the correction (or point to
  `add-contract` / `configure`).
- **`Unmatched ignore_imports`** → a stale or malformed ignore expression; fix the
  wildcard or remove the entry.

## Output

A per-finding report, each with: contract (type + name/id), the illegal edge and its
chain, `file:line`, and the recommended fix. End with the re-run command. If `--fix` was
used, list what was changed and the final `lint-imports` result. If there were no
violations, say so plainly and show the kept contracts.
