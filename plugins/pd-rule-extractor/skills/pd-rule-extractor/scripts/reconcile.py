# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Reconcile PD rule extraction: coverage matrix + DVP reconciliation.

Reads from the working directory (.pd-extraction/):
  doc-map.json        document inventory with units/locators
  rules-written.jsonl extracted PD rules (one JSON object per line)
  dvp-rules.jsonl     raw DVP rule rows (rule_id, locator, text)
  dvp-mapping.json    {"mappings": [{dvp_rule_id, pd_rule_id, status, reason}]}
  none-confirmed.json (optional) {"cells": [{"doc_id": ..., "category": ...}]}
      cells the extraction phase explicitly confirmed to contain no rules

Writes:
  coverage.json       document x category matrix with per-cell status
  reconciliation.json DVP reconciliation result + dangling refs + gaps
                      + unreferenced units + summary counts

Exit codes:
  0  no gaps
  1  hard error (missing/corrupt inputs)
  2  gaps found (not a failure; orchestration layer decides to continue)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

DEFAULT_CATEGORIES = [
    "入选排除", "知情同意", "访视", "给药", "样本采集", "检查评估",
    "合并用药", "不良事件", "随机盲法", "试验药品", "程序",
]

RULE_FIELDS = {"rule_id", "category", "source_files", "source_locator"}


def eprint(msg: str) -> None:
    print(msg, file=sys.stderr)


def fail(msg: str, code: int = 1) -> None:
    eprint(f"error: {msg}")
    sys.exit(code)


def load_json(path: Path, what: str, required: bool = True):
    if not path.exists():
        if required:
            fail(f"missing {what}: {path}")
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"corrupt {what}: {path} ({exc})")


def load_jsonl(path: Path, what: str, required: bool = True) -> list[dict]:
    if not path.exists():
        if required:
            fail(f"missing {what}: {path}")
        return []
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


def unit_match_keys(locator: str) -> set[str]:
    """Derive fuzzy match keys from a unit locator.

    Rule source_locator values are free text written during extraction, so
    exact matching undercounts. Keys per locator style:
      §A > B [part x/y]  -> each heading segment + full path
      <Sheet>!R1-R9      -> sheet name
      p.N-M              -> {"p.N", ..., "p.M"}
    """
    loc = locator.strip()
    keys: set[str] = set()
    if loc.startswith("§"):
        body = loc[1:].split(" [part ")[0].strip()
        keys.add(body)
        for seg in body.split(" > "):
            seg = seg.strip()
            if seg:
                keys.add(seg)
    elif loc.startswith("<") and ">!" in loc:
        keys.add(loc[1:loc.index(">!")])
    elif loc.startswith("p."):
        m = re.match(r"p\.(\d+)(?:-(\d+))?", loc)
        if m:
            a = int(m.group(1))
            b = int(m.group(2)) if m.group(2) else a
            for p in range(a, b + 1):
                keys.add(f"p.{p}")
    if not keys and loc:
        keys.add(loc)
    return keys


def norm_files(value) -> list[str]:
    """source_files may be a list or a single string; normalize to list.
    String values use ';' (or full-width '；') as the multi-source separator,
    per the output-format contract for merged rules."""
    if value is None:
        return []
    if isinstance(value, str):
        return [part.strip() for part in re.split(r"[;；]", value) if part.strip()]
    if isinstance(value, list):
        return [str(v).strip() for v in value]
    return [str(value)]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--workdir", required=True, help="Working directory (.pd-extraction).")
    parser.add_argument("--categories", default=None,
                        help="Comma-separated category list overriding the default 11 (debug use only; the category literals are fixed by contract).")
    parser.add_argument("--summary", action="store_true",
                        help="Print human-readable summary only (still writes JSON outputs).")
    args = parser.parse_args()

    categories = ([c.strip() for c in args.categories.split(",") if c.strip()]
                  if args.categories else DEFAULT_CATEGORIES)
    workdir = Path(args.workdir)
    if not workdir.is_dir():
        fail(f"workdir not found: {workdir}")

    doc_map = load_json(workdir / "doc-map.json", "doc-map.json")
    if doc_map is None:
        fail(f"missing doc-map.json: {workdir / 'doc-map.json'} (run probe_docs.py extract first)")
    rules = load_jsonl(workdir / "rules-written.jsonl", "rules-written.jsonl")
    dvp_rules = load_jsonl(workdir / "dvp-rules.jsonl", "dvp-rules.jsonl", required=False)
    # Backstop: the transcription task may append duplicate rule_id rows
    # (e.g. rerun overlap); keep the first occurrence of each rule_id.
    seen_dvp: set = set()
    deduped_dvp: list[dict] = []
    for dr in dvp_rules:
        rid = dr.get("rule_id")
        if rid in seen_dvp:
            continue
        seen_dvp.add(rid)
        deduped_dvp.append(dr)
    if len(deduped_dvp) != len(dvp_rules):
        eprint(f"warning: dropped {len(dvp_rules) - len(deduped_dvp)} duplicate "
               f"dvp-rules.jsonl row(s) sharing a rule_id")
        dvp_rules = deduped_dvp
    dvp_mapping = load_json(workdir / "dvp-mapping.json", "dvp-mapping.json", required=False)
    none_confirmed = load_json(workdir / "none-confirmed.json", "none-confirmed.json",
                               required=False)

    documents = doc_map.get("documents", [])
    if not documents:
        fail("doc-map.json contains no documents")

    # Validate rule records minimally.
    for i, r in enumerate(rules, start=1):
        missing = RULE_FIELDS - set(r)
        if missing:
            fail(f"rules-written.jsonl line {i}: missing fields {sorted(missing)}")

    # --- coverage matrix ----------------------------------------------------
    confirmed_cells = set()
    if none_confirmed:
        for cell in none_confirmed.get("cells", []):
            confirmed_cells.add((cell.get("doc_id"), cell.get("category")))

    # rules by (doc_id, category): a rule covers a document if source_files
    # references it (match by doc_id or by basename of the document path).
    doc_ids = [d["doc_id"] for d in documents]
    path_to_doc = {}
    for d in documents:
        p = d.get("path", "")
        path_to_doc[p] = d["doc_id"]
        path_to_doc[Path(p).name] = d["doc_id"]

    def rule_docs(rule) -> set[str]:
        out = set()
        for f in norm_files(rule.get("source_files")):
            if f in doc_ids:
                out.add(f)
            elif f in path_to_doc:
                out.add(path_to_doc[f])
            else:
                out.add(f)  # keep unknown refs; they just won't match a doc
        return out

    matrix: dict[str, dict[str, dict]] = {}
    for d in documents:
        matrix[d["doc_id"]] = {}
        for cat in categories:
            matrix[d["doc_id"]][cat] = {"status": "missing", "rule_count": 0}

    unknown_category_rules: list[str] = []
    for r in rules:
        cat = r.get("category", "")
        if cat not in categories:
            unknown_category_rules.append(r.get("rule_id", "?"))
        for doc_id in rule_docs(r):
            if doc_id in matrix and cat in categories:
                cell = matrix[doc_id][cat]
                cell["rule_count"] += 1
                cell["status"] = "covered"

    for doc_id, cats in matrix.items():
        for cat, cell in cats.items():
            if cell["status"] == "missing" and (doc_id, cat) in confirmed_cells:
                cell["status"] = "none-confirmed"

    coverage = {
        "categories": categories,
        "documents": doc_ids,
        "matrix": matrix,
        "summary": {
            "covered": sum(1 for cats in matrix.values() for c in cats.values()
                           if c["status"] == "covered"),
            "none_confirmed": sum(1 for cats in matrix.values() for c in cats.values()
                                  if c["status"] == "none-confirmed"),
            "missing": sum(1 for cats in matrix.values() for c in cats.values()
                           if c["status"] == "missing"),
        },
    }
    if unknown_category_rules:
        coverage["rules_with_unknown_category"] = sorted(set(unknown_category_rules))

    # --- DVP reconciliation -------------------------------------------------
    mappings = (dvp_mapping or {}).get("mappings", [])
    mapped_by_dvp = {m.get("dvp_rule_id"): m for m in mappings}
    rule_ids_written = {r.get("rule_id") for r in rules}

    gaps: list[dict] = []
    n_mapped = n_non_pd = 0
    for dr in dvp_rules:
        dvp_id = dr.get("rule_id")
        m = mapped_by_dvp.get(dvp_id)
        if m is None:
            gaps.append({"type": "dvp_rule_unmapped", "dvp_rule_id": dvp_id,
                         "detail": "DVP rule has no entry in dvp-mapping.json"})
            continue
        status = m.get("status")
        if status == "mapped":
            n_mapped += 1
            pd_id = m.get("pd_rule_id")
            if not pd_id or pd_id not in rule_ids_written:
                gaps.append({"type": "dangling_pd_ref", "dvp_rule_id": dvp_id,
                             "pd_rule_id": pd_id,
                             "detail": "mapped pd_rule_id not found in rules-written.jsonl"})
        elif status == "non-pd":
            n_non_pd += 1
        else:
            gaps.append({"type": "unknown_mapping_status", "dvp_rule_id": dvp_id,
                         "detail": f"unexpected mapping status: {status!r}"})

    # --- unreferenced units -------------------------------------------------
    referenced_locators = set()
    for r in rules:
        loc = r.get("source_locator")
        if isinstance(loc, str) and loc.strip():
            referenced_locators.add(loc.strip())
        elif isinstance(loc, list):
            referenced_locators.update(str(x).strip() for x in loc if str(x).strip())

    unreferenced: list[dict] = []
    for d in documents:
        for u in d.get("units", []):
            loc = u.get("locator", "")
            keys = unit_match_keys(loc)
            # A unit counts as referenced when any of its match keys appears
            # in any rule locator (heuristic; misses are candidate gaps).
            if not any(k and k in ref for k in keys for ref in referenced_locators):
                unreferenced.append({"doc_id": d["doc_id"], "unit_id": u.get("unit_id"),
                                     "locator": loc})

    if coverage["summary"]["missing"]:
        gaps.append({
            "type": "coverage_missing_cells",
            "detail": f"{coverage['summary']['missing']} matrix cell(s) neither covered "
                      f"by a rule nor confirmed none (see coverage.json)",
        })

    reconciliation = {
        "dvp": {
            "total_rules": len(dvp_rules),
            "mapped": n_mapped,
            "non_pd": n_non_pd,
            "unmapped_gaps": sum(1 for g in gaps if g["type"] == "dvp_rule_unmapped"),
            "dangling_ref_gaps": sum(1 for g in gaps if g["type"] == "dangling_pd_ref"),
        },
        "units": {
            "total": sum(len(d.get("units", [])) for d in documents),
            "referenced": sum(len(d.get("units", [])) for d in documents) - len(unreferenced),
            "unreferenced": len(unreferenced),
            "unreferenced_units": unreferenced,
            "note": "heuristic substring match on locator keys; unreferenced units are candidate gaps",
        },
        "gaps": gaps,
        "summary": {
            "rules_written": len(rules),
            "gap_count": len(gaps),
            "coverage_missing_cells": coverage["summary"]["missing"],
        },
    }

    (workdir / "coverage.json").write_text(
        json.dumps(coverage, ensure_ascii=False, indent=2), encoding="utf-8")
    (workdir / "reconciliation.json").write_text(
        json.dumps(reconciliation, ensure_ascii=False, indent=2), encoding="utf-8")

    # --- report ---------------------------------------------------------------
    cs, rs = coverage["summary"], reconciliation["summary"]
    lines = [
        f"documents: {len(documents)}  categories: {len(categories)}  rules written: {rs['rules_written']}",
        f"coverage: covered={cs['covered']} none-confirmed={cs['none_confirmed']} missing={cs['missing']}",
        f"DVP: total={reconciliation['dvp']['total_rules']} mapped={n_mapped} "
        f"non-pd={n_non_pd} unmapped={reconciliation['dvp']['unmapped_gaps']} "
        f"dangling={reconciliation['dvp']['dangling_ref_gaps']}",
        f"units: {reconciliation['units']['referenced']}/{reconciliation['units']['total']} referenced, "
        f"{reconciliation['units']['unreferenced']} unreferenced",
        f"gaps: {rs['gap_count']}",
    ]
    if args.summary:
        for ln in lines:
            print(ln)
        for g in gaps:
            print(f"  GAP [{g['type']}] {g.get('dvp_rule_id', '')} {g['detail']}")
    else:
        json.dump({"coverage_summary": cs, "reconciliation_summary": rs,
                   "gap_count": len(gaps)}, sys.stdout, ensure_ascii=False, indent=2)
        print()

    if unknown_category_rules:
        eprint(f"warning: {len(set(unknown_category_rules))} rule(s) use a category outside the "
               f"configured list: {sorted(set(unknown_category_rules))}")

    return 2 if gaps else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as exc:
        fail(f"{type(exc).__name__}: {exc}")
