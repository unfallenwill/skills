# pandas-copilot

Use pandas without knowing pandas. Provide data (primarily Excel) and a
validation standard, and Copilot produces a **verified, repeatable**
data-processing script or notebook.

You don't need to build the car — just say where you're going.

## Who it's for

- Analysts, operators, finance, and researchers who aren't fluent in pandas but
  have recurring data-processing needs
- Anyone who wants a script they can run again and again and tweak, rather than
  a one-shot answer

## How it works

Each `/pandas-copilot` call runs a validation-driven closed loop — set up an
isolated environment, profile the data, agree on a validation plan with you
(**gate A**), write and self-check the script, then show you real results before
saving (**gate B**). Both gates need your explicit confirmation; nothing is
delivered on the assistant's say-so, and you can challenge or rewind at any
point.

Under the hood (v0.2):

- **Deterministic steps are scripted.** Data profiling and the Excel health
  check run as a bundled script (`scripts/profile.py`); check execution and
  per-check reporting run as another (`scripts/runner.py`) — same behavior
  every run, no ad-hoc exploration code.
- **The validation plan is a file, not a conversation.** What you confirm at
  gate A is written to `.pandas-copilot/checks.py` — the same file the runner
  executes and the final notebook embeds. One source of truth.
- **Processing and validation are separated.** The pipeline is a pure
  `transform()` plus a `load()` that owns all defensive read parameters, so
  rerunning on next month's file re-fires every check automatically.
- **Sessions are resumable.** Progress (stage, gates, environment) persists in
  `.pandas-copilot/session.json`; a new session picks up where the last left
  off.
- **Iteration is bounded.** After 3 consecutive failed fix rounds, Copilot
  stops patching and realigns the validation plan with you instead of blind
  trial and error.

See [skills/pandas-copilot/SKILL.md](skills/pandas-copilot/SKILL.md) for the
full stage-by-stage workflow.

## Three ways to give validation

You don't have to give precise data every time — all three are supported:

| Way | Example | How Copilot handles it |
|-----|---------|------------------------|
| Expected output sample | "These rows should come out like this" | Infers and generalizes the rule |
| Rules / assertions | "No nulls allowed", "amount total must match the source" | Turned into an executable check |
| Natural language | "Remove duplicates, sort by date" | Translated to a check where possible; otherwise listed as "requires manual confirmation" in every run report and the notebook |

## Usage

```
/pandas-copilot process sales.xlsx: merge orders by customer, sum amounts

/pandas-copilot clean data.xlsx: dedupe, fill nulls, normalize the date column
```

The argument is what data to process and what you want out. Copilot guides you
to pin down the validation.

## Requirements

- One of `python`, `uv`, `poetry` (`uv` preferred)
- Copilot creates a `.venv` in the **current working directory** and installs
  dependencies there; your global environment is never touched

## Output

- Default: Jupyter notebook (`.ipynb`) with markdown explaining each step —
  read/transform/validation as separate sections, one cell per agreed check
- Optional: `.py` script, runnable with `python xxx.py`
- Working artifacts (`.pandas-copilot/`) stay behind so future revisions are
  cheap; delete the directory freely if you're done
