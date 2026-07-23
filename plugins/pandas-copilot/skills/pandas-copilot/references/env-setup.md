# Environment Setup Guide

This reference guides setting up an isolated Python runtime for pandas-copilot.
Follow it in Stage 1, **adapting to the host platform and whatever tooling is
already available**. There is intentionally no fixed bootstrap script: the host
may be macOS, Linux, or Windows PowerShell, so decide the concrete commands
yourself from the guidance below.

## Goal

Create a virtual environment in the **current working directory** (`.venv/`),
install the runtime dependencies, and finish with a known venv interpreter path
that is reused for every pandas command afterwards. Never touch the global
Python environment.

## Dependencies

`pandas`, `openpyxl` (read `.xlsx`), `jupyter`, `nbformat` (build notebooks).

## Step 1 — Detect the platform and tooling

- **POSIX** (macOS / Linux / Git Bash on Windows): detect tools with
  `command -v <tool>`. Identify the system with `uname` (`Darwin` = macOS,
  `Linux` = Linux).
- **Windows PowerShell**: detect tools with `Get-Command <tool>`. PowerShell is
  indicated by `$PSVersionTable` (or `$IsWindows` being true).

Tool precedence to try, in order: **uv > poetry (existing project) > python venv**.

## Step 2 — Create the environment using the first available tool

### uv (preferred — cross-platform, manages its own Python)

```
uv venv .venv
uv pip install --python <venv-python> pandas openpyxl jupyter nbformat
```

Works even with no system Python. `<venv-python>` is the venv interpreter from Step 3.

### poetry (only if inside an existing poetry project)

A `pyproject.toml` containing `[tool.poetry]` exists in this directory or an
ancestor.

```
poetry env use python3          # fallback: poetry env use python
<venv-python> -m pip install pandas openpyxl jupyter nbformat
```

Resolve the interpreter with:
`poetry run python -c "import sys; print(sys.executable)"`.

### python venv (fallback)

```
python3 -m venv .venv           # fallback: python -m venv .venv
<venv-python> -m pip install --upgrade pip
<venv-python> -m pip install pandas openpyxl jupyter nbformat
```

### None available

Stop and ask the user to install **uv** (recommended) or Python 3, then retry.

## Step 3 — Resolve the venv interpreter path (platform-specific)

The venv's Python lives at:

- **POSIX**: `.venv/bin/python`
- **Windows**: `.venv\Scripts\python.exe`

**Treat this path as the interpreter.** Do NOT resolve it to the underlying base
Python it may symlink to (e.g. uv-managed CPython) — the dependencies live in the
venv's own `site-packages`, and following the symlink loses them, causing
`ModuleNotFoundError`.

## Step 4 — Verify and remember

Confirm the interpreter imports pandas, then record this exact path in
`.pandas-copilot/session.json` as `venv_python` (schema in `artifacts.md`) and
reuse it for all downstream pandas execution — including `scripts/profile.py`
and `scripts/runner.py`. Never fall back to the global Python.

```
<venv-python> -c "import pandas; print(pandas.__version__)"
```
