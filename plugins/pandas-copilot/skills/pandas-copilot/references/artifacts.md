# Working Artifacts and Session State

Contracts for everything pandas-copilot writes to disk during the loop. The
scripts (`scripts/runner.py`) and the finalize stage both depend on these
shapes — follow them exactly.

## Layout

Working artifacts live in `.pandas-copilot/` inside the current working
directory; only the final deliverable (notebook or `.py`) goes to the CWD.

```
<cwd>/
├── .venv/                    # created in Stage 1 (env-setup.md)
├── .pandas-copilot/
│   ├── session.json          # session state — resume point across sessions
│   ├── checks.py             # Gate A validation spec (single source of truth)
│   └── pipeline.py           # load/transform code under iteration
└── <task-name>.ipynb         # final deliverable (Stage 8)
```

`.pandas-copilot/` is disposable scaffolding: keep it after finalize (it makes
future revisions cheap), but never present it as part of the deliverable.

## session.json

Update it at **every stage transition and gate decision** — it is what makes a
new session resumable. Read it at invocation; if present and `stage` < 8, offer
to resume.

```json
{
  "version": 1,
  "stage": 5,
  "data_file": "sales.xlsx",
  "intent": "merge orders by customer, sum amounts",
  "venv_python": ".venv/bin/python",
  "gate_a_passed": true,
  "gate_b_passed": false,
  "failed_rounds": 1,
  "deliverable": "notebook",
  "updated": "2026-07-23"
}
```

Field notes:

- `stage`: 1–8, the stage currently in progress (not the last finished one).
- `venv_python`: the interpreter path captured in Stage 1; on resume, verify it
  still imports pandas before trusting it, else redo Stage 1.
- `gate_a_passed` / `gate_b_passed`: set `true` only on **explicit user
  approval**, never on inference. Falling back to a gate resets its flag.
- `failed_rounds`: consecutive failed run+verify rounds in Stage 6. Reset to 0
  after a passing run or after a Gate A realignment. At 3, fall back to Gate A
  — mandatory, not advisory.
- `deliverable`: `"notebook"` (default) or `"script"`.
- `updated`: date of last write, for the user's orientation when resuming.

## checks.py — the Gate A spec

One named function per agreed check plus a list of non-automatable criteria.
This file is what the user confirms at Gate A (presented in plain language),
what `runner.py` executes, and what gets embedded into the deliverable — one
source of truth for all three.

```python
"""Validation spec agreed at Gate A. Comments/docstrings in the user's language."""

MANUAL_CHECKS = [
    "Spot-check that the largest customers look plausible",  # untranslatable criteria only
]


def check_total_amount_conserved(raw, out):
    """总金额守恒：聚合前后 amount 总和一致"""
    assert out["total_amount"].sum() == raw["amount"].sum(), (
        f"total mismatch: raw={raw['amount'].sum()} out={out['total_amount'].sum()}"
    )


def check_customer_unique(raw, out):
    """customer 是唯一键"""
    assert out["customer"].is_unique, "duplicate customers in output"
```

Rules:

- Function names start with `check_`; signature is exactly `(raw, out)` where
  `raw`/`out` are whatever `load`/`transform` return. Definition order is the
  report order.
- First docstring line = the user-facing description shown in the run report
  and at Gate A. Write it in the user's language.
- Fail by raising `AssertionError` with a message that names the actual values.
- Generalize (SKILL.md Principle 2): assert rules and conservation, never
  sample cell values. Design guidance lives in `validation-strategies.md`.
- `MANUAL_CHECKS`: strings for criteria that cannot be executed; `runner.py`
  prints them as unchecked boxes — never silently drop them.

## pipeline.py — load/transform separation

```python
"""Processing pipeline. Comments in the user's language."""
import pandas as pd


def load(path):
    """All defensive read parameters live here (see excel-gotchas.md)."""
    return pd.read_excel(path, dtype={"id": str})


def transform(raw):
    """Pure: no I/O, no prints — takes raw, returns the result."""
    return (
        raw.groupby("customer", as_index=False)
           .agg(total_amount=("amount", "sum"), order_count=("order_id", "count"))
    )
```

Rules:

- `load(path)` owns file reading and every defensive read parameter.
- `transform(raw)` is pure — no file I/O, vectorized pandas. It may return a
  single DataFrame or a `{name: DataFrame}` dict for multi-output tasks.
- Optional `save(out, path)` when output needs custom writing (multi-sheet
  formatting etc.); otherwise `runner.py --save` infers from the extension.
- No validation logic here — checks live only in `checks.py`.

## Finalize mapping (Stage 8)

The deliverable is assembled **from** `pipeline.py` and `checks.py`, not
rewritten from memory — the code the user saw pass at Gate B is the code that
ships, verbatim.

Notebook section mapping:

| Notebook section | Source |
|---|---|
| Intro: task, data, validation plan | session.json `intent` + check docstrings |
| Read | `load()` body (as a defined function + call) |
| Transform | `transform()` (as a defined function + call) |
| Validation — one cell per check | each `check_*` function + immediate call; docstring becomes the preceding markdown |
| Manual confirmation | `MANUAL_CHECKS` as a markdown checklist + a `describe()` cell |
| Save | write result next to the notebook |

Keep the function definitions in the deliverable (don't inline them away):
that is what lets the user rerun the same notebook on next month's file and
have every check re-fire.

For a `.py` deliverable, concatenate: imports → `load` → `transform` → the
check functions → a `__main__` block doing load → transform → run all checks
(report per check) → save. Same content, one self-contained file.
