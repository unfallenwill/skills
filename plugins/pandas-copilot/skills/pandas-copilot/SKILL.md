---
name: pandas-copilot
description: >
  Used when the user explicitly invokes `/pandas-copilot` to turn a data file
  (primarily Excel) plus a validation standard into a verified, repeatable
  pandas data-processing script or Jupyter notebook. The user supplies data and
  a validation standard (expected output, rules/assertions, or natural-language
  criteria) and this skill runs the closed loop: set up environment → profile
  data → agree on validation (gate A) → write → run + verify → iterate → show
  real results (gate B) → finalize. Trigger phrases: "/pandas-copilot",
  "process this data with pandas", "write me a pandas script for this Excel",
  "clean this spreadsheet", "transform this data", "generate a pandas script".
  Comments in generated code follow the end user's language (Chinese comments
  for Chinese-speaking users, English for English-speaking users).
user-invocable: true
argument-hint: <path to data file and what to do with it>
allowed-tools: [Bash, Read, Write, Edit, AskUserQuestion, TaskCreate, TaskUpdate]
version: 0.1.1
---

# pandas-copilot — Validation-driven pandas script generation

Given **data + a validation standard**, generate a verified, repeatable pandas
data-processing script or notebook. The user need not know pandas — only how to
describe the goal and "what counts as correct".

## Core Principles

Three principles apply at every stage, without exception:

1. **Validation-driven.** The validation standard is the lifeblood of the loop.
   Output without validation is just ordinary code generation and is not allowed.
   When the user cannot provide validation, guide them to define it.
2. **Samples are for inferring rules, not for copying.** An "input → output"
   sample is a clue to the underlying rule. Identify which columns are
   dropped/added/aggregated/transformed and write a script and checks that work
   for **any input**. Never hardcode cell-by-cell comparisons against the sample
   itself.
3. **Two confirmation gates.** Confirm the understood validation plan before
   writing anything (gate A); show the real output the script produces before
   finalizing (gate B). Both gates must be explicitly passed by the user — a
   wrong understanding or a wrong result wastes everything after it.

## Workflow

On `/pandas-copilot` invocation, run the stages in order. The argument is the
user's data file path and processing intent.

### Stage 1 — Set up environment (before any data work)

Ensure pandas can run first; otherwise Excel cannot be read. Read
`references/env-setup.md` and follow it to set up an isolated environment,
adapting to the host platform (macOS / Linux / Windows PowerShell) and whatever
tooling is available. There is intentionally no fixed bootstrap script — decide
the concrete commands yourself from the guide.

The guide is the single source for tool precedence, the dependency list, and
the platform-specific venv interpreter path — capture that interpreter path and
reuse it for every pandas execution that follows; never use the global Python.
If none of uv/poetry/python is available, tell the user to install one and retry.

### Stage 2 — Profile the data

Locate the user's data file (Excel by default; CSV/JSON/Parquet also supported).
Read `references/excel-gotchas.md` before reading Excel to avoid its traps
(merged cells, multi-row headers, dates-as-numbers, lost leading zeros,
thousands separators). For Excel input, run the `excel_health_check()` helper
near the end of that reference for a quick diagnosis, then tune read parameters
accordingly.

Then survey the data: structure (`shape`, columns, `dtypes`, head rows),
quality (nulls, duplicates, unique counts), anomalies (suspicious types,
multiple sheets). Present the findings clearly in markdown — what the data looks
like, what problems exist, an initial plan. This sets up gate A: the user must
see the full picture before validation can be discussed.

### Stage 3 — Agree on the validation plan [Gate A]

Based on the profile, work out "what counts as correct" with the user; do not
guess. Read `references/validation-strategies.md` first. Handle three kinds of
validation input:

- **Expected output sample**: infer the rule and generalize (Principle 2);
  build column-level / statistic-level assertions, not row-by-row comparisons.
- **Rules / assertions**: translate into pandas check expressions.
- **Natural-language description**: translate into executable checks where
  possible; where not, mark "needs manual confirmation" and never pretend it
  passed.

Make the understood validation plan **concrete** — list each check and how it
will be verified — and ask the user to confirm. **Proceed to Stage 4 only after
explicit user approval.** AskUserQuestion is recommended to converge the
confirmation.

### Stage 4 — Write the script

Read `references/pandas-patterns.md` and implement with idiomatic pandas
(vectorized operations first; avoid iteration). **Comments follow the user's
language.** Make the code repeatable: read paths from a parameter or a clear
constant; do not hardcode throwaway paths. **Embed the validation**: write each
gate-A check as an `assert` or boolean check after the processing logic, so the
script is self-checking.

### Stage 5 — Run + verify

Execute the script with the venv interpreter captured in Stage 1, then classify
the outcome:

- Execution error or `assert` failure → proceed to Stage 6.
- All checks pass → proceed to Stage 7 (gate B).

### Stage 6 — Iterate

On failure, analyze and fix: an execution error points at the script logic; an
`assert` failure points at the processing logic — or, if the validation design
itself was wrong, revisit gate A. Rerun and reclassify. After several failed
rounds, fall back to gate A and realign the understanding rather than blind
trial and error. When all checks pass → proceed to Stage 7.

### Stage 7 — Show real results [Gate B]

Once verification passes, do not finalize yet. Show the user **a sample of the
script's actual output** (first rows of the processed result + key statistics +
which checks passed) and ask whether it matches expectations. **Proceed to
Stage 8 only after explicit user approval.**

### Stage 8 — Finalize

Produce a Jupyter notebook (`.ipynb`) by default, with markdown cells explaining
each step; produce a standalone `.py` script if the user explicitly asks. If the
user has not specified, default to notebook without asking. Write the file to
the current working directory with a name reflecting the task.

## Key Rules

The three Core Principles above govern every stage. Two operational rules are
worth calling out on their own:

- **Open feedback**: if the user challenges or gives feedback at any stage, fall
  back to the relevant stage and redo; do not resist.
- **Progress tracking**: at the start, create one task per stage with
  TaskCreate, named after the stage, and keep statuses current as stages pass
  (TaskUpdate) — a gate's task completes only on explicit user approval, and
  falling back to an earlier stage reopens that stage's task. When iteration
  uncovers new work, add it as a task instead of silently expanding scope.

## Resources

Load on demand to keep this file lean — each stage above says when to reach for
a reference:

- `references/env-setup.md`
- `references/pandas-patterns.md`
- `references/validation-strategies.md`
- `references/excel-gotchas.md`

A concrete end-to-end reference lives in **`examples/sales-by-customer/`** — input, expected output, the user prompt, and a sample generated notebook. Consult it in Stage 4/8 to match the intended deliverable shape (markdown walkthrough + embedded `assert` checks).
