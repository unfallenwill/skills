# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Verify that every dataset.variable referenced by rule conditions and fields
actually exists in the source documents.

Index source: doc-map.json sheet summaries of role="dbdesign" documents only,
as extracted deterministically by probe_docs.py. Two xlsx layouts are covered —
per-form sheets (sheet name = dataset/form, header row = variables) and
dictionary sheets (Dataset/Variable columns, one row per variable; probe emits
them as the sheet's `dict_variables` map). No source file access is needed at
verification time. References are extracted from rules-written.jsonl
`condition` and `fields` with regexes.

Outputs variable-verification.json:
  index        sheets/columns counts used for verification
  references   unique dataset.variable refs found (plus EXISTS dataset refs)
  resolved     refs confirmed against the index
  unresolved   refs NOT found in the index (must be fixed before review)
  unverifiable docs have no xlsx index at all (non-xlsx DB design); refs to
               datasets that cannot be checked deterministically

Exit codes: 0 all referenced variables verified (or nothing to check),
            1 hard input error, 2 unresolved references remain.

Usage:
  uv run verify_variables.py --workdir .pd-extraction [--summary]
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
from pathlib import Path
from typing import NoReturn

# dataset.variable references, e.g. DM.AGE, VISIT.VISDAT, EditChecks.规则编号.
# Both parts must start with a non-digit word char (Unicode-aware, so Chinese
# sheet/column names match) — this also excludes decimals and version literals
# like 'v3.0' (their post-dot part starts with a digit).
REF_RE = re.compile(r"\b([^\W\d]\w*)\.([^\W\d]\w*)\b")
# bare dataset inside EXISTS/NOT EXISTS ( ... )
EXISTS_RE = re.compile(r"(?:NOT\s+)?EXISTS\s*\(\s*([^\W\d]\w*)", re.IGNORECASE)


def eprint(msg: str) -> None:
    print(msg, file=sys.stderr)


def fail(msg: str, code: int = 1) -> NoReturn:
    eprint(f"error: {msg}")
    sys.exit(code)


def norm(name: str) -> str:
    """Normalization for dataset/sheet matching: case- and separator-insensitive."""
    return re.sub(r"[\s_\-]+", "", name).lower()


# Header names marking a dictionary-layout sheet (one row per variable):
# a column holding the dataset name + a column holding the variable name.
DATASET_HEADER_CANDIDATES = {"dataset", "数据集", "ds", "table", "表", "数据表"}
VAR_HEADER_CANDIDATES = {"variable", "变量", "var", "field", "字段", "列", "变量名"}


def load_json(path: Path, what: str):
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"corrupt {what}: {path} ({exc})")


def load_jsonl(path: Path, what: str) -> list[dict]:
    if not path.exists():
        fail(f"missing {what}: {path}")
    rows: list[dict] = []
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as exc:
            fail(f"corrupt {what} line {lineno}: {exc}")
    return rows


def _detect_dictionary_columns(headers: list[str]) -> tuple[int, int] | None:
    """Dictionary layout has a dataset-name column and a variable-name column.
    Returns (ds_idx, var_idx) or None for non-dictionary sheets. Only used to
    recognize stale doc-maps produced before probe emitted dict_variables."""
    norm_headers = [norm(h) for h in headers]
    ds_candidates = {norm(c) for c in DATASET_HEADER_CANDIDATES}
    var_candidates = {norm(c) for c in VAR_HEADER_CANDIDATES}
    ds_idx = next((i for i, h in enumerate(norm_headers) if h in ds_candidates), None)
    var_idx = next((i for i, h in enumerate(norm_headers) if h in var_candidates), None)
    if ds_idx is None or var_idx is None or ds_idx == var_idx:
        return None
    return ds_idx, var_idx


def build_index(doc_map: dict) -> dict[str, dict]:
    """sheet/dataset-name (normalized) -> {sheet, doc_id, columns: {norm: original}}.

    Only DB-design documents (role == "dbdesign") contribute — DVP xlsx sheets
    must not pollute the index (they would turn a missing DB-design index into
    spurious 'dataset not in index' failures). Both xlsx layouts come straight
    from doc-map.json: dictionary sheets via the `dict_variables` map probe
    emitted, per-form sheets via the header row.
    """
    index: dict[str, dict] = {}
    for doc in doc_map.get("documents", []):
        if doc.get("role") != "dbdesign":
            continue
        for sheet in doc.get("sheets", []):
            sheet_name = sheet.get("sheet", "")
            headers = [str(h).strip() for h in sheet.get("headers", []) if str(h).strip()]
            if not headers:
                continue
            dict_vars = sheet.get("dict_variables")
            if dict_vars:
                for ds, variables in dict_vars.items():
                    entry = index.setdefault(norm(ds), {
                        "sheet": sheet_name, "doc_id": doc.get("doc_id"),
                        "columns": {}, "layout": "dictionary",
                    })
                    for var in variables:
                        entry["columns"].setdefault(norm(var), var)
                continue
            if _detect_dictionary_columns(headers) is not None:
                # Dictionary-style headers but no dict_variables: doc-map was
                # produced by an older probe_docs.py. Never index the headers as
                # variables (Dataset/Variable/Label are not variable names).
                eprint(f"warning: sheet '{sheet_name}' looks like a dictionary layout but "
                       f"doc-map.json has no dict_variables for it — re-run "
                       f"'probe_docs.py extract' with the current version; its variables "
                       f"will be reported unresolved")
                continue
            # Form layout: sheet name is the dataset/form, headers are variables.
            entry = index.setdefault(norm(sheet_name), {
                "sheet": sheet_name,
                "doc_id": doc.get("doc_id"),
                "columns": {},
                "layout": "form",
            })
            entry["doc_id"] = doc.get("doc_id")
            for h in headers:
                entry["columns"].setdefault(norm(h), h)
    return index


def extract_refs(rule: dict) -> list[dict]:
    """All dataset.variable refs (condition + fields) and EXISTS dataset refs."""
    refs: list[dict] = []
    seen: set[tuple[str, str]] = set()
    texts = [str(rule.get("condition", "") or ""), str(rule.get("fields", "") or "")]
    for text in texts:
        for m in REF_RE.finditer(text):
            key = (m.group(1), m.group(2))
            if key not in seen:
                seen.add(key)
                refs.append({"kind": "variable", "dataset": key[0], "variable": key[1],
                             "ref": f"{key[0]}.{key[1]}"})
        for m in EXISTS_RE.finditer(text):
            ds = m.group(1)
            key = (ds, "")
            if key not in seen:
                seen.add(key)
                refs.append({"kind": "dataset", "dataset": ds, "variable": None, "ref": ds})
    return refs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--workdir", required=True, help="Working directory (.pd-extraction).")
    parser.add_argument("--summary", action="store_true",
                        help="Print human-readable summary (still writes JSON output).")
    args = parser.parse_args()

    workdir = Path(args.workdir)
    if not workdir.is_dir():
        fail(f"workdir not found: {workdir}")

    doc_map = load_json(workdir / "doc-map.json", "doc-map.json")
    if doc_map is None:
        fail(f"missing doc-map.json: {workdir / 'doc-map.json'} (run probe_docs.py extract first)")
    rules = load_jsonl(workdir / "rules-written.jsonl", "rules-written.jsonl")

    index = build_index(doc_map)
    has_index = bool(index)

    resolved: list[dict] = []
    unresolved: list[dict] = []
    n_refs = 0
    for rule in rules:
        rid = rule.get("rule_id", "?")
        for ref in extract_refs(rule):
            n_refs += 1
            if not has_index:
                continue  # counted as unverifiable below
            entry = index.get(norm(ref["dataset"]))
            if entry is None:
                suggestion = difflib.get_close_matches(norm(ref["dataset"]), index.keys(), n=3)
                unresolved.append({**ref, "rule_id": rid, "problem": "dataset not in index",
                                   "candidates": [index[s]["sheet"] for s in suggestion]})
                continue
            if ref["kind"] == "dataset":
                resolved.append({**ref, "rule_id": rid, "sheet": entry["sheet"]})
                continue
            if norm(ref["variable"]) not in entry["columns"]:
                suggestion = difflib.get_close_matches(
                    norm(ref["variable"]), entry["columns"].keys(), n=3)
                unresolved.append({**ref, "rule_id": rid,
                                   "problem": f"variable not in sheet {entry['sheet']}",
                                   "candidates": [entry["columns"][s] for s in suggestion]})
                continue
            resolved.append({**ref, "rule_id": rid, "sheet": entry["sheet"]})

    result = {
        "index": {"sheets": len(index),
                  "columns_total": sum(len(e["columns"]) for e in index.values()),
                  "available": has_index},
        "references_total": n_refs,
        "resolved_count": len(resolved),
        "unresolved_count": len(unresolved) if has_index else 0,
        "unverifiable_count": 0 if has_index else n_refs,
        "resolved": resolved,
        "unresolved": unresolved if has_index else [],
        "note": ("no xlsx sheet index in doc-map.json; references cannot be verified "
                 "deterministically (DB design doc is not xlsx) — verify via LLM against "
                 "chunks and record the outcome" if not has_index else
                 "exit code 2 while unresolved references remain; fix rules or correct "
                 "the variable names, then rerun"),
    }
    (workdir / "variable-verification.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.summary:
        print(f"index: {result['index']['sheets']} sheets, "
              f"{result['index']['columns_total']} columns")
        print(f"references: {n_refs}  resolved: {result['resolved_count']}  "
              f"unresolved: {result['unresolved_count']}  "
              f"unverifiable: {result['unverifiable_count']}")
        for u in result["unresolved"][:20]:
            print(f"  UNRESOLVED [{u['rule_id']}] {u['ref']} — {u['problem']}"
                  + (f" (candidates: {', '.join(u['candidates'])})" if u["candidates"] else ""))
    else:
        json.dump({"references_total": n_refs,
                   "resolved": result["resolved_count"],
                   "unresolved": result["unresolved_count"],
                   "unverifiable": result["unverifiable_count"]},
                  sys.stdout, ensure_ascii=False, indent=2)
        print()

    return 2 if result["unresolved_count"] else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as exc:
        fail(f"{type(exc).__name__}: {exc}")
