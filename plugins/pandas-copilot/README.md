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

See [skills/pandas-copilot/SKILL.md](skills/pandas-copilot/SKILL.md) for the
full stage-by-stage workflow.

## Three ways to give validation

You don't have to give precise data every time — all three are supported:

| Way | Example | How Copilot handles it |
|-----|---------|------------------------|
| Expected output sample | "These rows should come out like this" | Infers and generalizes the rule |
| Rules / assertions | "No nulls allowed", "amount total must match the source" | Turned into an executable check |
| Natural language | "Remove duplicates, sort by date" | Translated to a check where possible; otherwise marked "needs manual confirmation" in the notebook |

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

- Default: Jupyter notebook (`.ipynb`) with markdown explaining each step
- Optional: `.py` script, runnable with `python xxx.py`
