#!/usr/bin/env python3
"""pandas-copilot Stage 5 runner — execute pipeline + checks, report per check.

Usage:
    <venv-python> runner.py <data-file> [--workdir .pandas-copilot]
                            [--save PATH] [--head N]

Loads `<workdir>/pipeline.py` (must define `load(path)` and `transform(raw)`,
optionally `save(out, path)`) and `<workdir>/checks.py` (functions named
`check_*` taking `(raw, out)`, optionally a `MANUAL_CHECKS` list of strings).

Runs load -> transform, then every check in definition order, and prints:
per-check PASS/FAIL/ERROR with the check's docstring, manual-confirmation
items, and a preview of the real output (shape + head + numeric summary).

Exit codes: 0 = all checks pass, 1 = at least one check failed or errored,
2 = pipeline itself failed (load/transform raised).
"""

import argparse
import importlib.util
import os
import sys
import traceback

import pandas as pd


def load_module(path, name):
    if not os.path.exists(path):
        print(f"ERROR: {path} not found — write it before running.", file=sys.stderr)
        sys.exit(2)
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def preview(out, head_n):
    frames = out.items() if isinstance(out, dict) else [("<output>", out)]
    for name, df in frames:
        if not isinstance(df, pd.DataFrame):
            print(f"\n### {name}: {type(df).__name__} = {df!r}"[:500])
            continue
        print(f"\n### {name}")
        print(f"shape: {len(df):,} rows x {len(df.columns)} columns")
        with pd.option_context("display.max_columns", 40, "display.width", 200):
            print(df.head(head_n).to_string())
            num = df.select_dtypes(include="number")
            if not num.empty:
                print("\nnumeric summary:")
                print(num.describe().loc[["count", "mean", "min", "max"]].to_string())


def save_output(pipeline, out, path):
    if hasattr(pipeline, "save"):
        pipeline.save(out, path)
        return
    if isinstance(out, dict):
        if not path.endswith((".xlsx", ".xlsm")):
            raise SystemExit(
                "ERROR: transform() returned multiple tables; --save needs an .xlsx "
                "target or a save(out, path) in pipeline.py."
            )
        with pd.ExcelWriter(path) as writer:
            for name, df in out.items():
                df.to_excel(writer, sheet_name=str(name)[:31], index=False)
        return
    ext = os.path.splitext(path)[1].lower()
    if ext == ".csv":
        out.to_csv(path, index=False, encoding="utf-8-sig")
    elif ext in (".xlsx", ".xlsm"):
        out.to_excel(path, index=False)
    elif ext == ".parquet":
        out.to_parquet(path, index=False)
    elif ext == ".json":
        out.to_json(path, orient="records", force_ascii=False, indent=2)
    else:
        raise SystemExit(f"ERROR: unsupported --save extension {ext!r}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("data_file")
    ap.add_argument("--workdir", default=".pandas-copilot")
    ap.add_argument("--save", default=None, help="write the transformed output to this path")
    ap.add_argument("--head", type=int, default=10, help="preview rows (default 10)")
    args = ap.parse_args()

    pipeline = load_module(os.path.join(args.workdir, "pipeline.py"), "pc_pipeline")
    checks = load_module(os.path.join(args.workdir, "checks.py"), "pc_checks")

    print(f"# Run Report — {args.data_file}")

    try:
        raw = pipeline.load(args.data_file)
        out = pipeline.transform(raw)
    except Exception:
        print("\n## Pipeline error (load/transform raised)")
        traceback.print_exc()
        return 2

    check_fns = [(n, f) for n, f in vars(checks).items()
                 if n.startswith("check_") and callable(f)]
    if not check_fns:
        print("\nERROR: no check_* functions in checks.py — Gate A spec is empty.",
              file=sys.stderr)
        return 1

    print(f"\n## Checks ({len(check_fns)})")
    failed = 0
    for name, fn in check_fns:
        desc = (fn.__doc__ or "").strip().splitlines()[0] if fn.__doc__ else ""
        try:
            fn(raw, out)
            print(f"[PASS]  {name}" + (f" — {desc}" if desc else ""))
        except AssertionError as exc:
            failed += 1
            print(f"[FAIL]  {name}" + (f" — {desc}" if desc else ""))
            print(f"        AssertionError: {exc}")
        except Exception as exc:
            failed += 1
            print(f"[ERROR] {name}" + (f" — {desc}" if desc else ""))
            print(f"        {type(exc).__name__}: {exc}")

    manual = getattr(checks, "MANUAL_CHECKS", [])
    if manual:
        print(f"\n## Requires manual confirmation ({len(manual)})")
        for item in manual:
            print(f"- [ ] {item}")

    print("\n## Output preview")
    preview(out, args.head)

    if args.save:
        save_output(pipeline, out, args.save)
        print(f"\noutput written to: {args.save}")

    if failed:
        print(f"\nRESULT: {failed}/{len(check_fns)} check(s) failed — iterate (Stage 6).")
        return 1
    print(f"\nRESULT: all {len(check_fns)} check(s) passed — proceed to Gate B with this "
          "report (manual items still need the user's eyes).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
