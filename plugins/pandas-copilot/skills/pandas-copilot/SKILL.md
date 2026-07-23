---
name: pandas-copilot
description: >
  Used when the user explicitly invokes `/pandas-copilot` to turn a data file
  (primarily Excel) plus a validation standard into a verified, repeatable
  pandas data-processing script or Jupyter notebook. The user supplies data and
  a validation standard (expected output, rules/assertions, or natural-language
  criteria) and this skill runs the closed loop: set up environment → profile
  data → agree on validation (gate A) → write → run + verify → iterate → show
  real results (gate B) → finalize. Sessions persist state to disk and are
  resumable. Trigger phrases: "/pandas-copilot", "process this data with
  pandas", "write me a pandas script for this Excel", "clean this spreadsheet",
  "transform this data", "generate a pandas script". Comments in generated code
  follow the end user's language (Chinese comments for Chinese-speaking users,
  English for English-speaking users).
user-invocable: true
argument-hint: <path to data file and what to do with it>
allowed-tools: [Bash, Read, Write, Edit, AskUserQuestion, TaskCreate, TaskUpdate]
version: 0.2.0
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

## Architecture Invariants

These are design decisions, not suggestions:

- **Main loop only — never delegate this workflow to a subagent.** Both gates
  require live user interaction, which subagents cannot do. The whole loop runs
  in the main conversation.
- **`checks.py` is the single source of truth for validation.** The user
  confirms it (Gate A), `runner.py` executes it (Stage 5), and the deliverable
  embeds it (Stage 8). Never let validation exist only in conversation or as
  scattered asserts.
- **Deterministic work runs as scripts; judgment stays with the model.**
  Profiling and check execution use this skill's `scripts/` (paths below are
  relative to this skill's base directory, announced when the skill loads).
  Interpreting results, designing checks, and writing the transform are
  model work.
- **Working artifacts live in `.pandas-copilot/`, deliverables in the CWD.**
  File contracts: `references/artifacts.md` — read it before Stage 3.

## Workflow

On `/pandas-copilot` invocation, run the stages in order. The argument is the
user's data file path and processing intent.

### Stage 0 — Resume or start fresh

If `.pandas-copilot/session.json` exists in the CWD, read it: summarize where
the previous run stopped (stage, gates passed, intent), verify the recorded
`venv_python` still imports pandas, and ask the user — resume from the recorded
stage, or start fresh (AskUserQuestion). Starting fresh reinitializes
`.pandas-copilot/`. If no session file exists, create the directory and an
initial `session.json` (schema in `references/artifacts.md`), then continue.

From here on, **update `session.json` at every stage transition and gate
decision** — it is the resume point for future sessions.

### Stage 1 — Set up environment (before any data work)

Ensure pandas can run first; otherwise Excel cannot be read. Read
`references/env-setup.md` and follow it to set up an isolated environment,
adapting to the host platform (macOS / Linux / Windows PowerShell) and whatever
tooling is available. There is intentionally no fixed bootstrap script — decide
the concrete commands yourself from the guide.

The guide is the single source for tool precedence, the dependency list, and
the platform-specific venv interpreter path — record that interpreter path in
`session.json` (`venv_python`) and reuse it for every pandas execution that
follows; never use the global Python. If none of uv/poetry/python is available,
tell the user to install one and retry.

### Stage 2 — Profile the data

Run the deterministic profiler instead of writing ad-hoc exploration code:

```
<venv-python> <skill-dir>/scripts/profile.py <data-file>
```

It prints an Excel health check (sheets, merged cells, hidden rows/columns,
header suspicion, type traps) plus a per-table profile (shape, dtypes, nulls,
uniques, samples, head). For flagged Excel traps, read
`references/excel-gotchas.md` for the mitigation to apply in `load()` later.
Large files: use `--nrows`; multi-sheet: `--sheet` to focus.

Interpret the report and present the findings clearly in markdown — what the
data looks like, what problems exist, an initial plan. This sets up gate A: the
user must see the full picture before validation can be discussed.

### Stage 3 — Agree on the validation plan [Gate A]

Based on the profile, work out "what counts as correct" with the user; do not
guess. Read `references/validation-strategies.md` (check design) and
`references/artifacts.md` (file contracts) first. Handle three kinds of
validation input:

- **Expected output sample**: infer the rule and generalize (Principle 2);
  build column-level / statistic-level assertions, not row-by-row comparisons.
- **Rules / assertions**: translate into pandas check expressions.
- **Natural-language description**: translate into executable checks where
  possible; where not, put them in `MANUAL_CHECKS` and never pretend they passed.

Write the spec as `.pandas-copilot/checks.py` — one `check_*(raw, out)`
function per check, first docstring line as the user-facing description in the
user's language. Then present the plan to the user as a plain-language list
(the docstrings, plus how each is verified) and ask for confirmation.
**Proceed to Stage 4 only after explicit user approval**; set `gate_a_passed`.
AskUserQuestion is recommended to converge the confirmation.

### Stage 4 — Write the pipeline

Read `references/pandas-patterns.md` and write `.pandas-copilot/pipeline.py`:
`load(path)` holding every defensive read parameter (informed by the Stage 2
health check), and a pure `transform(raw)` in idiomatic, vectorized pandas.
**Comments follow the user's language.** No validation logic here — checks live
only in `checks.py`. Contract details: `references/artifacts.md`.

### Stage 5 — Run + verify

Execute with the venv interpreter recorded in `session.json`:

```
<venv-python> <skill-dir>/scripts/runner.py <data-file>
```

The runner executes load → transform → every check, and prints per-check
PASS/FAIL, manual-confirmation items, and a real output preview. Classify by
exit code: `2` (pipeline error) or `1` (check failure) → Stage 6; `0` → Stage 7.

### Stage 6 — Iterate (bounded)

On failure, analyze and fix: a pipeline error points at `pipeline.py`; a check
failure points at the processing logic — or, if the validation design itself
was wrong, revisit gate A. Rerun and reclassify, incrementing `failed_rounds`
in `session.json` on each failed round.

**At 3 consecutive failed rounds, stop patching and fall back to Gate A** —
present what was tried, what keeps failing, and realign the understanding with
the user. This bound is mandatory: blind trial and error past that point burns
trust and tokens. Reset `failed_rounds` after a pass or a realignment. When all
checks pass → Stage 7.

### Stage 7 — Show real results [Gate B]

Once verification passes, do not finalize yet. Relay the runner's report to the
user: which checks passed (by their plain-language descriptions), the output
preview, and the `MANUAL_CHECKS` items that need their eyes. Ask whether it
matches expectations. **Proceed to Stage 8 only after explicit user approval**;
set `gate_b_passed`.

### Stage 8 — Finalize

Assemble the deliverable **from** `pipeline.py` and `checks.py` — the code that
passed Gate B ships verbatim; do not rewrite it from memory. Follow the
finalize mapping in `references/artifacts.md`: read/transform/validation kept
as separate sections, function definitions preserved so the user can rerun on
new data with every check re-firing.

Produce a Jupyter notebook (`.ipynb`) by default, with markdown cells
explaining each step; produce a standalone `.py` script if the user explicitly
asks. If the user has not specified, default to notebook without asking. Write
the file to the current working directory with a name reflecting the task.
`examples/sales-by-customer/` shows the intended shape end to end.

## Key Rules

The Core Principles and Architecture Invariants govern every stage. Two
operational rules are worth calling out on their own:

- **Open feedback**: if the user challenges or gives feedback at any stage, fall
  back to the relevant stage and redo; do not resist. Falling back to a gate
  resets its flag in `session.json`.
- **Progress tracking**: at the start, create one task per stage with
  TaskCreate, named after the stage, and keep statuses current as stages pass
  (TaskUpdate) — a gate's task completes only on explicit user approval, and
  falling back to an earlier stage reopens that stage's task. When iteration
  uncovers new work, add it as a task instead of silently expanding scope.
  (Tasks track progress within a session; `session.json` is what survives
  across sessions.)

## Resources

Load on demand to keep this file lean — each stage above says when to reach for
a reference:

- `references/env-setup.md` — Stage 1
- `references/artifacts.md` — file contracts: session.json / checks.py / pipeline.py / finalize mapping
- `references/excel-gotchas.md` — Excel trap mitigations (Stage 2/4)
- `references/validation-strategies.md` — check design (Stage 3)
- `references/pandas-patterns.md` — idiomatic pandas (Stage 4)

Scripts (run with the venv interpreter, never load into context unless
patching is needed):

- `scripts/profile.py` — Stage 2 profiler + Excel health check
- `scripts/runner.py` — Stage 5 executor with per-check reporting

A concrete end-to-end reference lives in **`examples/sales-by-customer/`** —
input, expected output, the user prompt, the working artifacts
(`pipeline.py`, `checks.py`), and the final notebook. Consult it in Stage 3/4/8
to match the intended artifact and deliverable shapes.
