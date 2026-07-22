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

## Workflow

Each `/pandas-copilot` call runs this closed loop:

1. **Set up environment** — detect `uv` / `poetry` / `python venv`, create a
   `.venv` in the current directory, and install `pandas`, `openpyxl`, etc. The
   global environment is never touched.
2. **Profile data** — read the file and map out structure, column types, nulls,
   duplicates, and anomalies.
3. **Agree on validation [Gate A]** — turn your sample, rules, or
   natural-language description into an executable validation plan, based on the
   profile. **Confirmed by you before any code is written.**
4. **Write the script** — implemented in pandas.
5. **Run + verify** — execute and check the result against the validation.
6. **Iterate** — fix and rerun until it passes.
7. **Show real results [Gate B]** — show you an actual sample of the processed
   data. **Confirmed by you before anything is saved.**
8. **Finalize** — produce a Jupyter notebook with markdown explanations
   (default) or a standalone `.py` script.

> You can challenge or give feedback at any point; Copilot drops back to the
> relevant stage and redoes it.

## Core ideas

- **Validation-driven, not code generation.** The validation standard is what
  closes the loop. Without it, this is just ordinary "AI writes pandas".
- **Samples are for inferring rules, not copying.** A validation sample is used
  to infer the underlying rule and generalize, so the script works on any input
  — not a toy that only fits the sample.
- **Two confirmation gates prevent rework.** Confirm understanding before
  writing (gate A) and confirm the result before saving (gate B). Nothing is
  delivered on the assistant's say-so.
- **Comments in your language.** Comments and explanations in the generated
  code/notebook follow your language (Chinese for Chinese users, English for
  English users).

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

## Plugin structure

```
pandas-copilot/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── pandas-copilot/
│       ├── SKILL.md                      # workflow definition
│       └── references/
│           ├── env-setup.md              # environment setup (platform-adaptive)
│           ├── pandas-patterns.md        # common pandas patterns
│           ├── validation-strategies.md  # turning validation into checks
│           └── excel-gotchas.md          # Excel-specific traps
└── README.md
```
