"""Golden-set evaluation: run the engine on real client files and score it against expected rows.

    py -3.11 golden/evaluate.py            # with AI (needs the API keys)
    py -3.11 golden/evaluate.py --no-ai    # rules only, free, for a quick regression check

Inputs
  golden/manifest.csv       file (relative to the source folder), expected (json in golden/expected/ or blank), notes
  golden/expected/*.json    {"file", "status": "draft"|"confirmed", "expect_no_rows": bool,
                             "rows": [{"match": ["words", "in", "the", "item"], "scope", "category", "subcategory"?,
                                       "quantity"?, "unit"?, "period"?}]}
  Source folder: env GOLDEN_SOURCE_DIR, default ../../Invoice_detection (the prototype's sample files).

Outputs  golden/last_run.json (the testbench shows it) and golden/REPORT.md.
Files without expected rows still get a coverage line (rows, Ready share, rows with a formula), and files the old
prototype also processed get an agreement score (same scope/category for the same line).
"""
from __future__ import annotations

import csv
import json
import os
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "engine"))

from extractor_core.memory import Memory  # noqa: E402
from extractor_core.pipeline import Engine  # noqa: E402
from extractor_core.units import to_canonical  # noqa: E402

SOURCE = Path(os.environ.get("GOLDEN_SOURCE_DIR") or HERE.parent.parent.parent / "Invoice_detection")
PROTOTYPE_OUTPUTS = ["test_upload_results.json", "stress_test_upload_results.json"]


def _norm_cat(c: str | None) -> str | None:
    if not c:
        return None
    m = re.match(r"(cat_\d+)", c)
    return m.group(1) if m else c


def _text(r: dict) -> str:
    return " ".join(str(x or "") for x in (r.get("extracted_item"), r.get("original_text"))).lower()


def _qty_ok(exp: dict, row: dict) -> bool | None:
    if exp.get("quantity") is None:
        return None
    q, u, _, _ = to_canonical(exp["quantity"], exp.get("unit"))
    if row.get("quantity") is None or q is None:
        return False
    return abs(row["quantity"] - q) <= max(0.02 * abs(q), 1e-6)


def score_file(exp: dict, rows: list[dict]) -> dict:
    out = {"expected": len(exp.get("rows", [])), "matched": 0, "scope": None, "category": None, "subcategory": None,
           "quantity": None, "period": None, "misses": []}
    if exp.get("expect_no_rows"):
        out.update(expected=0, matched=0, scope=1.0 if not rows else 0.0, category=1.0 if not rows else 0.0)
        if rows:
            out["misses"].append(f"expected no rows, got {len(rows)}")
        return out
    used: set[str] = set()
    tallies = {k: [0, 0] for k in ("scope", "category", "subcategory", "quantity", "period")}
    for e in exp.get("rows", []):
        words = [w.lower() for w in e.get("match", [])]
        cands = [r for r in rows if r["row_id"] not in used and all(w in _text(r) for w in words)]
        # prefer the row whose category matches (a line can have a parent and a companion with the same text)
        cands.sort(key=lambda r: (_norm_cat(r["ghg"].get("category")) != e.get("category"), r.get("derived", False)))
        if not cands:
            out["misses"].append(f"no row for {' '.join(words)}")
            for k in tallies:
                if e.get(k if k != "period" else "period") is not None or k in ("scope", "category"):
                    tallies[k][1] += 1
            continue
        r = cands[0]
        used.add(r["row_id"])
        out["matched"] += 1
        checks = {
            "scope": r["ghg"].get("scope") == e.get("scope") if e.get("scope") else None,
            "category": _norm_cat(r["ghg"].get("category")) == e.get("category") if e.get("category") else None,
            "subcategory": (e["subcategory"].lower() in (r["ghg"].get("subcategory_label") or "").lower()) if e.get("subcategory") else None,
            "quantity": _qty_ok(e, r),
            "period": r.get("reporting_period") == e["period"] if e.get("period") else None,
        }
        for k, ok in checks.items():
            if ok is None:
                continue
            tallies[k][1] += 1
            tallies[k][0] += int(ok)
            if not ok:
                got = {"scope": r["ghg"].get("scope"), "category": r["ghg"].get("category"), "subcategory": r["ghg"].get("subcategory_label"),
                       "quantity": f"{r.get('quantity')} {r.get('unit')}", "period": r.get("reporting_period")}[k]
                out["misses"].append(f"{' '.join(words)}: {k} expected {e.get(k)}{' ' + str(e.get('unit')) if k == 'quantity' and e.get('unit') else ''}, got {got}")
    for k, (ok, n) in tallies.items():
        out[k] = round(ok / n, 3) if n else None
    return out


def prototype_rows() -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for name in PROTOTYPE_OUTPUTS:
        p = SOURCE / name
        if not p.exists():
            continue
        d = json.loads(p.read_text(encoding="utf-8"))
        for x in (d["data"] if isinstance(d, dict) else d):
            out.setdefault(re.sub(r"^[0-9a-f]{12}_", "", x.get("file", "")), []).append(x)
    return out


def agreement(rows: list[dict], proto: list[dict]) -> dict:
    """Same line (description + quantity) -> do the old prototype and this engine agree on scope/category?"""
    def key(desc, q):
        return (re.sub(r"[^a-z0-9]", "", (desc or "").lower())[:40], round(float(q), 2) if isinstance(q, (int, float)) else None)
    mine = {}
    for r in rows:
        if not r.get("derived"):
            mine.setdefault(key(r.get("original_text") or r.get("extracted_item"), r.get("raw_quantity")), r)
    same = diff = 0
    examples = []
    for p in proto:
        if p.get("is_auto_generated"):
            continue
        r = mine.get(key(p.get("item_description"), p.get("quantity")))
        if not r:
            continue
        if r["ghg"].get("scope") == p.get("ghg_scope") and _norm_cat(r["ghg"].get("category")) == _norm_cat(p.get("ghg_category")):
            same += 1
        else:
            diff += 1
            if len(examples) < 12:
                examples.append({"item": p.get("item_description"), "prototype": f"{p.get('ghg_scope')}/{_norm_cat(p.get('ghg_category'))}",
                                 "engine": f"{r['ghg'].get('scope')}/{r['ghg'].get('category')}", "engine_reason": (r["decision"].get("reason") or "")[:120]})
    n = same + diff
    return {"compared": n, "agree": round(same / n, 3) if n else None, "disagreements": examples}


def run(use_ai: bool = True, write_report: bool = True) -> dict:
    t0 = time.time()
    manifest = list(csv.DictReader(open(HERE / "manifest.csv", encoding="utf-8")))
    files, missing = [], []
    for m in manifest:
        p = SOURCE / m["file"]
        (files if p.exists() else missing).append(p)
    fac_file = HERE / "facilities.json"
    facilities = json.loads(fac_file.read_text(encoding="utf-8"))["facilities"] if fac_file.exists() else []
    eng = Engine(Memory(), org="golden", use_ai=use_ai, facilities=facilities)   # fresh memory: no learned shortcuts
    res = eng.run(files)
    by_file: dict[str, list[dict]] = {}
    for r in res["rows"]:
        by_file.setdefault(r["file"], []).append(r)
    docs = {d["file"]: d for d in res["documents"]}
    proto = prototype_rows()
    report_files, tot = [], {k: [0.0, 0] for k in ("scope", "category", "subcategory", "quantity", "period")}
    for m in manifest:
        name = Path(m["file"]).name
        rows = by_file.get(name, [])
        d = docs.get(name, {})
        f = {"file": name, "notes": m.get("notes", ""), "got": len(rows), "ready": sum(r["review_status"] == "ready" for r in rows),
             "with_formula": sum(bool(r["calc"].get("formula_id")) for r in rows), "error": None if d.get("status") in ("ok", None) else "; ".join(d.get("warnings", []))[:200]}
        if not (SOURCE / m["file"]).exists():
            f["error"] = "file not found in source folder"
        exp_name = (m.get("expected") or "").strip()
        if exp_name and (HERE / "expected" / exp_name).exists():
            exp = json.loads((HERE / "expected" / exp_name).read_text(encoding="utf-8"))
            s = score_file(exp, rows)
            f.update(s, expected_status=exp.get("status", "draft"))
            for k in tot:
                if s.get(k) is not None:
                    tot[k][0] += s[k]
                    tot[k][1] += 1
        pname = re.sub(r"^[0-9a-f]{12}_", "", name)
        if pname in proto:
            a = agreement(rows, proto[pname])
            f["prototype_agreement"] = a["agree"]
            f["prototype_compared"] = a["compared"]
            f["prototype_disagreements"] = a["disagreements"]
        report_files.append(f)
    blockers: dict[str, int] = {}
    for r in res["rows"]:
        if r["review_status"] != "ready":
            for c in {c["code"] for c in r["checks"] if c["level"] in ("warn", "error")} or {"low confidence"}:
                blockers[c] = blockers.get(c, 0) + 1
    summary = {"blockers": dict(sorted(blockers.items(), key=lambda kv: -kv[1])), "files": len(manifest), "files_with_expected": sum(1 for f in report_files if "expected" in f and f.get("expected") is not None),
               "rows": len(res["rows"]), "ready": sum(r["review_status"] == "ready" for r in res["rows"]),
               "missing_files": [str(p.name) for p in missing]}
    for k, (s, n) in tot.items():
        summary[f"{k}_acc"] = round(s / n, 3) if n else None
    out = {"ran_at": time.time(), "seconds": round(time.time() - t0, 1), "use_ai": use_ai, "summary": summary,
           "files": report_files, "metrics": {k: res["metrics"][k] for k in ("classifier_calls", "classifier_cost_usd", "groups", "items")}}
    if write_report:
        (HERE / "last_run.json").write_text(json.dumps(out, indent=2, default=str), encoding="utf-8")
        (HERE / "REPORT.md").write_text(markdown(out), encoding="utf-8")
    return out


def markdown(o: dict) -> str:
    s = o["summary"]
    pct = lambda v: "-" if v is None else f"{round(100 * v)}%"
    L = [f"# Golden-set report", "",
         f"Run {time.strftime('%d %b %Y %H:%M', time.localtime(o['ran_at']))}, {'with AI' if o['use_ai'] else 'rules only (no AI)'}, {o['seconds']} s. "
         f"{s['files']} files, {s['rows']} rows, {s['ready']} Ready.", "",
         "Expected rows marked **draft** were written from the documents by the engineer and must be confirmed by the "
         "product owner before these numbers are used to tune the Ready threshold.", "",
         "| Field | Accuracy (files with expected rows) |", "|---|---|"]
    for k in ("scope", "category", "subcategory", "quantity", "period"):
        L.append(f"| {k} | {pct(s.get(k + '_acc'))} |")
    if s.get("blockers"):
        L += ["", "## Why rows are not Ready (rows per reason)", "", "| Reason | Rows |", "|---|---|"] + [f"| {k} | {v} |" for k, v in s["blockers"].items()]
    L += ["", "## Per file", "", "| File | Expected | Got | Matched | Scope | Category | Sub-cat | Qty | Period | Ready | Prototype agreement |",
          "|---|---|---|---|---|---|---|---|---|---|---|"]
    for f in o["files"]:
        L.append(f"| {f['file']}{' (' + f['expected_status'] + ')' if f.get('expected_status') else ''} | {f.get('expected', '-') if f.get('expected') is not None else '-'} | {f['got']} | "
                 f"{f.get('matched', '-')} | {pct(f.get('scope'))} | {pct(f.get('category'))} | {pct(f.get('subcategory'))} | {pct(f.get('quantity'))} | "
                 f"{pct(f.get('period'))} | {f['ready']} | {pct(f.get('prototype_agreement'))}{' of ' + str(f['prototype_compared']) if f.get('prototype_compared') else ''} |")
    misses = [(f["file"], m) for f in o["files"] for m in f.get("misses", [])]
    if misses:
        L += ["", "## Misses", ""] + [f"- **{fn}**: {m}" for fn, m in misses]
    dis = [(f["file"], d) for f in o["files"] for d in f.get("prototype_disagreements", [])]
    if dis:
        L += ["", "## Where the old prototype and the engine disagree (sample)", "",
              "Not automatically errors - several are the prototype's known mistakes (e.g. outbound freight as Cat 9).", "",
              "| File | Item | Prototype | Engine | Engine's reason |", "|---|---|---|---|---|"]
        L += [f"| {fn} | {d['item']} | {d['prototype']} | {d['engine']} | {d['engine_reason']} |" for fn, d in dis]
    if s.get("missing_files"):
        L += ["", "Missing source files: " + ", ".join(s["missing_files"])]
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    r = run(use_ai="--no-ai" not in sys.argv)
    print(json.dumps(r["summary"], indent=2))
    print("Report written to", HERE / "REPORT.md")
