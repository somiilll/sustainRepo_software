"""The whole flow for one upload batch (one 'job'):

  files -> normalise -> (sheets: layout map + apply | documents: vision read + cross-checks) -> raw items
        -> group -> classify once per group -> rows (formula fields, companions, splits) -> checks -> review status

Pure orchestration: no web framework, no database other than the Memory interface. Emergent wraps run() in its
background-job runner and stores the returned rows in its staging collection.
"""
from __future__ import annotations

import re
import time
import uuid
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import crosscheck, extract, layout, llm, normalise, rowscan, rowstate, schema, usage
from . import facilities as fac_mod
from .config import load
from .decider.cascade import Classifier
from .decider.factors import clear_descriptor_notes, row_parts
from .derive import co2_share, companion_specs
from .fields import capacity_conversion
from .fields import build_calc, display_quantity
from .group import group_items
from . import plausibility
from .facilities import apply_choice, resolve as resolve_facility
from .periods import fy_start_year
from .units import detect_decimal_comma
from .validate import doc_key, finish, resolve_period, row_checks

UNREADABLE_KEY = "__unreadable__"
UNREADABLE_DECISION = {"activity_id": None, "confidence": 0.0, "source": "none", "context": {}, "alternatives": [],
                       "reason": "The row could not be read, so it was not classified", "question": "This row could not be read - enter or fix its values"}


class JobCancelled(Exception):
    """The customer cancelled the job."""


class OutOfCredits(Exception):
    """The customer's balance ran out during a job."""


class Engine:
    def __init__(self, memory=None, org: str = "default", org_context: dict | None = None,
                 facilities: list[dict] | None = None, use_ai: bool = True, providers=None, reference_date=None, factors=None, factor_inputs=None):
        self.memory, self.org = memory, org
        self.reference_date = reference_date          # "today" for date checks; tests pin it
        self.org_context = org_context or {}
        self.facilities = facilities or []
        self.use_ai = use_ai
        self.classifier = Classifier(memory, org, self.org_context, use_ai=use_ai, providers=providers, factors=factors)
        self.factor_inputs = factor_inputs
        self._alias_of = (lambda name: memory.get_facility_alias(org, name)) if memory is not None else None

    # ------------------------------------------------------------------ ingest
    def _ingest_sheet(self, path: Path, src: dict, metrics: dict) -> tuple[list[dict], dict]:
        """Tables are read with their detected layout and every layout row is re-checked against the row itself; everything else
        (and every row that fails the check) is read row by row. Each non-empty row ends with exactly one disposition - none is dropped."""
        info = {"tables": [], "warnings": [], "sheets": [], "source_rows": []}
        items: list[dict] = []
        is_facility = lambda s: fac_mod.names_a_facility(s, self.facilities, self._alias_of)   # noqa: E731
        for sheet, grid, hidden in normalise.read_grids(path):
            rows = normalise.non_empty_rows(grid)
            text_of = {no: " | ".join(str(v).strip() for v in cells if v is not None and str(v).strip()) for no, cells in rows}
            ctx = rowscan.Context(sheet=sheet, source=src, hidden=hidden, fy0=fy_start_year(sheet), facilities=self.facilities, alias_of=self._alias_of,
                                  decimal_comma=detect_decimal_comma(str(v) for _, c in rows for v in c if isinstance(v, str)))
            fate: dict[int, tuple[str, str | None]] = {}
            reread: dict[int, list[str]] = {}
            by_layout: list[dict] = []
            for t in normalise.tables_from_grid(sheet, grid, hidden):
                spec = layout.map_table(t, self.org, self.memory, self.use_ai and len(t.rows) >= 3, metrics)
                got = layout.apply_spec(t, spec, src) if spec["shape"] != "unknown" else []
                quality = layout.spec_quality(t, spec, got, is_facility) if got else {"ok": False, "signals": {}, "reasons": []}
                rejected = None
                if got and not quality["ok"]:
                    failed = [k for k, ok in quality["signals"].items() if not ok]
                    rejected = f"layout checks failed ({', '.join(failed)}): " + "; ".join(quality["reasons"][:2])
                elif got:
                    repeated = crosscheck.repeated_descriptions(got) if not spec.get("constant_description") else set()
                    bad: dict[int, list[str]] = {}
                    for it in got:
                        res = crosscheck.check_item(it, grid[it["source"]["row"] - 1], ctx, repeated, from_row_text=spec.get("columns", {}).get("description") is not None and spec["shape"] != "column_items")
                        it["read_notes"] += res["notes"]
                        if res["issues"]:
                            bad.setdefault(it["source"]["row"], []).extend(res["issues"])
                    if len(bad) >= 0.5 * len({it["source"]["row"] for it in got}):
                        rejected = "row-level cross-check failed: " + "; ".join(next(iter(bad.values()))[:2])
                    else:
                        reread.update(bad)
                        got = [it for it in got if it["source"]["row"] not in bad]
                if rejected:
                    info["warnings"].append(f"Sheet '{sheet}' row {t.first_row}: {rejected} - its rows were read one by one")
                    got = []
                elif got:
                    layout.remember(self.memory, self.org, t, spec)
                    fate.update({no: ("structure", "Column titles or sheet title") for no in t.meta_rows})
                info["tables"].append({"sheet": t.sheet, "first_row": t.first_row, "rows": len(t.rows), "shape": spec["shape"],
                                       "layout_source": spec["source"], "layout_score": round(spec.get("score", 0), 2), "items": len(got),
                                       "checks": quality["signals"], "rejected": rejected, "reread_rows": len(reread),
                                       "columns": {k: t.header[v] for k, v in spec.get("columns", {}).items() if v is not None and v < t.ncols}})
                info["warnings"] += spec.get("warnings", [])
                by_layout += got
            fate.update({it["source"]["row"]: ("read", None) for it in by_layout})
            left = []
            for no, cells in rows:
                if no in fate:
                    continue
                if layout.is_summary_row(cells, lambda no=no: grid[:no - 1]):
                    fate[no] = ("summary", "Summary row - restates the rows above, so it is not counted again")
                else:
                    left.append((no, cells))
            scanned, zero_rows = rowscan.scan_rows(left, ctx)
            fate.update({no: ("zero", "Every number in the row is 0 - nothing to record") for no in zero_rows})
            rowscan.interpret(scanned, metrics, self.use_ai)
            for it in scanned:
                no = it["source"]["row"]
                if no in reread:
                    it["source"]["reread"] = reread[no][:3]
                fate[no] = ({"extracted": "read_row_by_row", "needs_attention": "needs_attention", "unreadable": "couldnt_read", "failed": "failed"}[it["read_state"]],
                            "; ".join(it["read_notes"][:1]) or None)
            for it in by_layout:
                schema.validate_item(it)
            for no in (n for n, _ in rows if n not in fate):             # cannot happen; if it ever does it is reported, not hidden
                fate[no] = ("unaccounted", "This row was not processed")
            counts = Counter(d for d, _ in fate.values())
            mode = "unstructured" if not by_layout else "structured" if counts["read"] >= 0.8 * len(rows) else "mixed"
            info["sheets"].append({"sheet": sheet, "mode": mode, "non_empty_rows": len(rows), "re_read_rows": len(reread), **counts})
            info["source_rows"] += [{"file": src.get("file"), "sheet": sheet, "row": no, "disposition": d, "reason": why, "text": text_of[no][:200]}
                                    for no, (d, why) in sorted(fate.items()) if d in ("structure", "summary", "zero", "unaccounted")]
            items += by_layout + scanned
        return items, info

    @staticmethod
    def _import_report(docs: list[dict], rows: list[dict], states: dict) -> dict:
        """Source rows, extracted rows, categorised rows, rows needing attention, ignored rows and technical failures - kept apart."""
        sheets = [s for d in docs for s in d.get("sheets", [])]
        if not sheets:
            return {}
        total = lambda k: sum(s.get(k, 0) for s in sheets)          # noqa: E731
        ignored = {k: total(k) for k in ("structure", "summary", "zero")}
        with_records = {(r["source"].get("file"), r["source"].get("sheet"), r["source"].get("row")) for r in rows if not r.get("derived") and r["source"].get("sheet")}
        return {"source_rows": total("non_empty_rows"), "ignored": {**ignored, "total": sum(ignored.values())},
                "rows_with_records": len(with_records), "records": sum(1 for r in rows if not r.get("derived")),
                "extracted": states["extracted"] + states["categorised"], "categorised": states["categorised"],
                "needs_attention": states["needs_attention"], "couldnt_read": states["couldnt_read"], "technical_failures": states["failed"],
                "re_read_rows": total("re_read_rows"), "unaccounted": total("unaccounted"),
                "reconciled": len(with_records) + sum(ignored.values()) == total("non_empty_rows") and not total("unaccounted")}

    def _ingest_document(self, path: Path, src: dict, think: bool, metrics: dict) -> tuple[list[dict], dict]:
        pages, warns = normalise.read_pages(path, load().policy["limits"]["max_pages"])
        info = {"pages": len(pages), "warnings": warns, "quality": [p.quality for p in pages], "invoices": 0, "checks": []}
        bad = sorted({i for p in pages for i in p.quality["issues"]})
        if bad:
            info["warnings"].append("Image quality: " + ", ".join(bad) + (" - a clearer photo would help" if "blurry" in bad else ""))
        if not llm.enabled():
            raise llm.AIUnavailable("Reading documents needs ANTHROPIC_API_KEY")
        data = extract.read_document(pages, think, metrics)
        invs = data.get("invoices") or []
        crit = [c for inv in invs for c in extract.cross_check(inv) if c.get("critical")]
        if crit and not think:     # re-read once with the stronger model
            data2 = extract.read_document(pages, True, metrics)
            metrics["llm_calls"][-1]["step"] = "reread"
            if len([c for inv in data2.get("invoices") or [] for c in extract.cross_check(inv) if c.get("critical")]) < len(crit):
                data, invs = data2, data2.get("invoices") or []
                info["warnings"].append("Numbers did not add up on the first read - re-read with the stronger model")
        info["model"] = data.get("_model")
        if not data.get("readable", True):
            info["warnings"].append(f"Document not readable: {data.get('unreadable_reason')}")
        items = []
        for di, inv in enumerate(invs):
            chk = extract.cross_check(inv)
            info["checks"] += chk
            its = extract.to_items(inv, src, di)
            for it in its:
                it["doc_checks"] = chk
            items += its
        info["invoices"] = len(invs)
        if not invs and data.get("readable", True):
            info["warnings"].append("No invoice, bill or activity data found (for example a procedure, certificate or letter) - nothing to record")
            info["status_note"] = "no_activity"
        info["document_types"] = sorted({inv.get("document_type") for inv in invs if inv.get("document_type")})
        info["languages"] = sorted({inv.get("language") for inv in invs if inv.get("language")})
        return items, info

    # ------------------------------------------------------------------ rows
    def rows_for_item(self, item: dict, decision: dict) -> list[dict]:
        tax = load().taxonomy
        aid = decision.get("activity_id")
        if decision.get("factor_match"):
            clear_descriptor_notes(item, decision["factor_match"]["name"])
        if aid and tax.get(aid).get("no_record"):
            return []
        base_id = item["item_id"]
        rows = []
        qty, unit, dim = display_quantity(item)
        fac = resolve_facility(item, self.facilities, self._alias_of)
        per = resolve_period(item)
        if aid:
            conv, _ = capacity_conversion(tax.get(aid), item)
            if conv is not item:              # show the converted quantity (22.5 kg CO2); raw_quantity keeps the printed one
                qty, unit, dim = display_quantity(conv)

        def make(row_id, activity_id, ghg, calc, label, derived=False, parent=None, amount=None, quantity=qty, unit_=unit, dec=None):
            act = tax.get(activity_id) if activity_id else None
            r = {
                "row_id": row_id, "item_id": base_id, "parent_id": parent, "derived": derived, "group_key": item.get("group_key"),
                "file": item["source"].get("file"), "source": item["source"], "evidence": item.get("evidence", []),
                "extracted_item": label, "original_text": item.get("description"),
                "vendor": item.get("vendor"), "invoice_number": item.get("invoice_number"), "date": item.get("date"),
                "activity_id": activity_id, "activity_label": act["label"] if act else None, "domain": act["domain"] if act else None,
                "modules": act["modules"] if act else [], "ghg": ghg, "calc": calc,
                "quantity": quantity, "unit": unit_, "dimension": dim, "raw_quantity": item.get("quantity"), "raw_unit": item.get("unit"),
                "amount": amount, "currency": item.get("currency") or load().policy["currency_default"],
                "facility": fac, "period": per, "reporting_period": per["reporting_period"],
                "decision": dec or decision,
            }
            named = load().factor_name_list(ghg.get("subcategory"), (calc or {}).get("ef_method"))
            if named:
                r["ghg"] = {**ghg, "subcategory_label": named[0]}
            r["checks"] = row_checks(r, item)
            return finish(r, item)

        if decision.get("factor_match"):
            fm = decision["factor_match"]
            p = row_parts(fm, item, self.factor_inputs(fm) if self.factor_inputs else None)
            row = make(f"{base_id}-0", None, p["ghg"], p["calc"], item.get("description_en") or item.get("description") or fm["name"],
                       amount=item.get("amount"), quantity=p["quantity"], unit_=p["unit"])
            row["review"] = p["review"]
            rows = [row]
            if fm["collection"] == "fuel_database" and fm["scope"] in ("scope1", "biogenic") and fm["category"] != "Fugitive Emissions" and load().policy["companions"]["fuel_wtt"]["enabled"]:
                rows.append(self._wtt_row(make, item, row, 1, None, decision, f"Well-to-tank - {row['extracted_item']}"))
            return rows

        if not aid:
            ghg = {"scope": None, "category": None, "subcategory": None, "scope_label": "Unclassified", "category_label": "", "subcategory_label": ""}
            calc = {"formula_id": None, "fields": {}, "missing": ["classification"], "notes": [], "status": "incomplete"}
            return [make(f"{base_id}-0", None, ghg, calc, item.get("description_en") or item.get("description"), amount=item.get("amount"))]

        label = item.get("description_en") or item.get("description") or tax.get(aid)["label"]
        act = tax.get(aid)

        ghg = tax.resolve_ghg(aid, decision.get("context"))

        # argon/CO2 blend: split by CO2 share
        if act.get("split") == "co2_share_of_blend":
            share = co2_share(" ".join(str(item.get(k) or "") for k in ("description", "description_en", "notes")))
            if share and item.get("quantity"):
                co2_item = {**item, "quantity": item["quantity"] * share}
                ar_item = {**item, "quantity": item["quantity"] * (1 - share)}
                q1, _, _ = display_quantity(co2_item)
                q2, _, _ = display_quantity(ar_item)
                rows.append(make(f"{base_id}-0", aid, ghg, build_calc(act, ghg, {**co2_item, "amount": None}),
                                 f"{label} - CO2 share {share:.0%}", amount=None, quantity=q1))
                ar = tax.get("gas.argon")
                g2 = tax.resolve_ghg("gas.argon")
                rows.append(make(f"{base_id}-1", "gas.argon", g2, build_calc(ar, g2, ar_item), f"{label} - argon share {1 - share:.0%}",
                                 derived=True, parent=f"{base_id}-0", amount=item.get("amount"), quantity=q2))
                return rows
        main_amount = item.get("amount")
        comps = companion_specs({"activity_id": aid, "ghg": ghg, "extracted_item": label}, item)
        if any(c.get("move_amount") for c in comps):
            main_amount = None           # the money belongs to the transport row; the waste row carries the quantity
        main_item = {**item, "amount": main_amount}
        main = make(f"{base_id}-0", aid, ghg, build_calc(act, ghg, main_item), label, amount=main_amount)
        rows.append(main)
        for k, c in enumerate(comps, start=1):
            cg = dict(c["ghg"])
            cg.update(scope_label=tax.raw["scope_labels"][cg["scope"]], category_label=tax.raw["category_labels"].get(cg["category"], cg["category"]),
                      subcategory_label=cg["subcategory"], category_id=None, subcategory_id=None)
            if c["kind"] == "waste_transport":
                ta = tax.get("waste.transport_only")
                titem = {**item, "quantity": item.get("quantity") if (display_quantity(item)[2] == "mass") else None}
                calc = build_calc(ta, cg, titem)
                rows.append(make(f"{base_id}-{k}", "waste.transport_only", cg, calc, c["label"], derived=True, parent=main["row_id"],
                                 amount=item.get("amount")))
            else:
                if c["kind"] == "c3_wtt":
                    rows.append(self._wtt_row(make, item, main, k, aid, decision, c["label"]))
                    continue
                f = load().formulas[c["formula"]]
                key = f["fields"][0]["key"]
                fields = {key: main["quantity"], f"{key}_unit": main["unit"]} if main["quantity"] is not None and main["calc"].get("formula_id") else {}
                calc = {"formula_id": c["formula"] if fields else None, "formula_label": f["label"], "ef_method": "activity",
                        "fields": fields, "missing": [] if fields else [f["fields"][0]["label"]], "notes": [], "status": "ok",
                        "emergent_formula_id": f.get("emergent_formula_id")}
                rows.append(make(f"{base_id}-{k}", aid, cg, calc, c["label"], derived=True, parent=main["row_id"], amount=None,
                                 dec={**decision, "reason": f"Auto-added companion of {main['row_id']} ({c['kind']})"}))
        return rows

    def _wtt_row(self, make, item: dict, main: dict, k: int, aid: str | None, decision: dict, label: str) -> dict:
        """Scope 3 Cat 3 well-to-tank row of a fuel row: the C3 factor named after the fuel, or 'needs input' listing the equally close ones."""
        tax = load().taxonomy
        pol = load().policy["companions"]["fuel_wtt"]
        f = load().formulas["s3_activity"]
        key = f["fields"][0]["key"]
        idx = self.classifier._index()
        mem = self.classifier.memory
        remembered = mem.get_factor_choice(self.classifier.org, idx.wtt_key(item)) if idx and mem is not None else None
        wtt, tied = idx.fuel_wtt_factor(item, remembered) if idx else (None, [])
        sub = wtt["name"] if wtt else pol["subcategory_label"]
        cg = {"scope": "scope_3", "category": "cat_3", "subcategory": sub, "subcategory_label": sub, "scope_label": tax.raw["scope_labels"]["scope_3"],
              "category_label": tax.raw["category_labels"].get("cat_3", "cat_3"), "category_id": wtt["category_id"] if wtt else None, "subcategory_id": wtt["id"] if wtt else None}
        ok = bool(wtt) and main["quantity"] is not None and bool(main["calc"].get("formula_id"))
        fields = {key: main["quantity"], f"{key}_unit": main["unit"]} if ok else {}
        missing = [] if ok else [f["fields"][0]["label"] if wtt else "Well-to-tank factor of this fuel - choose in Edit" + (f" ({', '.join(tied[:4])})" if tied else "")]
        calc = {"formula_id": "s3_activity" if ok else None, "formula_label": f["label"], "ef_method": "activity", "fields": fields, "missing": missing,
                "notes": [], "status": "ok", "emergent_formula_id": f.get("emergent_formula_id")}
        row = make(f"{main['row_id'].rsplit('-', 1)[0]}-{k}", aid, cg, calc, label, derived=True, parent=main["row_id"], amount=None,
                   dec={**decision, "reason": f"Auto-added companion of {main['row_id']} (c3_wtt)"})
        if wtt:
            ref = {"collection": wtt["collection"], "id": wtt["id"]}
            row["review"] = {**(row.get("review") or {}), "factor": ref, "override": {"scope": "scope3", "category_id": wtt["category_id"], "ef_method": "activity", "factor": ref, "dynamic": None}}
        return row

    # ------------------------------------------------------------------ run
    def run(self, files: list[str | Path], mode: str = "fast", progress=None, job_id: str | None = None,
            budget: float | None = None, cancel=None, facility_choices: dict | None = None) -> dict:
        """budget: stop (OutOfCredits) once this many credits are spent. Calls made so far stay in self.metrics.
        cancel: a threading.Event; when set the job stops at the next safe point (JobCancelled)."""
        t0 = time.time()
        job_id = job_id or uuid.uuid4().hex[:10]
        think = mode == "think"
        metrics: dict = {"llm_calls": []}
        self.metrics = metrics
        paths = [Path(f) for f in files]
        docs, items = [], []

        live = {"items": 0, "files_done": 0}

        def spent() -> float:
            evs = [usage.from_llm_call(c) for c in list(metrics["llm_calls"])] +                   [usage.from_classifier_call(c) for c in list(self.classifier.calls)]
            return round(sum(e["credits"] for e in evs), 2)

        def say(stage, done=None, total=None, msg=None):
            if cancel is not None and cancel.is_set():
                raise JobCancelled("Cancelled")
            if budget is not None and spent() > budget:
                raise OutOfCredits(f"Stopped: this extraction used all {budget:g} credits available ({spent():g} spent).")
            if progress:
                progress({"stage": stage, "done": done, "total": total, "message": msg, "items": live["items"],
                          "files_total": len(paths), "files_done": live["files_done"], "credits": spent(),
                          "elapsed": round(time.time() - t0, 1)})

        first_by_hash: dict[str, str] = {}               # decided in upload order, so threads cannot race for "first"
        for p in paths:
            first_by_hash.setdefault(normalise.file_hash(p), p.name)

        def ingest(path: Path):
            if cancel is not None and cancel.is_set():
                raise JobCancelled("Cancelled")
            src = {"file": path.name, "path": str(path), "kind": normalise.file_kind(path)}
            d = {"doc_id": uuid.uuid4().hex[:8], "file": path.name, "kind": src["kind"], "status": "ok", "warnings": []}
            try:
                h = normalise.file_hash(path)
                src["file_hash"] = h
                if first_by_hash[h] != path.name:
                    d.update(status="duplicate", warnings=[f"Same file as {first_by_hash[h]} in this upload"])
                    return d, []
                if self.memory is not None and (prev := self.memory.seen(self.org, "file:" + h)):
                    d["warnings"].append(f"This exact file was uploaded before ({prev['file_name']}, job {prev['job_id']})")
                    d["duplicate_of_previous"] = True
                if src["kind"] == "sheet":
                    its, info = self._ingest_sheet(path, src, metrics)
                elif src["kind"] == "document":
                    its, info = self._ingest_document(path, src, think, metrics)
                else:
                    d.update(status="error", warnings=[f"Unsupported file type {path.suffix}"])
                    return d, []
                d["warnings"] += info.pop("warnings", [])
                d.update(info)
                return d, its
            except JobCancelled:
                raise
            except Exception as e:                     # one bad file never sinks the batch
                d.update(status="error", warnings=d["warnings"] + [f"{type(e).__name__}: {e}"])
                return d, []

        # Classification starts as soon as a file has been read, while the other files are still being read:
        # the workers keep reading in the background and this loop classifies the lines of the file that just finished.
        groups_by_key: dict[str, dict] = {}
        decisions: dict[str, dict] = {UNREADABLE_KEY: UNREADABLE_DECISION}
        say("reading", 0, len(paths))
        with ThreadPoolExecutor(max_workers=4) as ex:
            for n, (d, its) in enumerate(ex.map(ingest, paths), start=1):
                for k, it in enumerate(its):
                    it["item_id"] = f"{d['doc_id']}-{k}"
                    it.setdefault("evidence", [])
                apply_choice(its, (facility_choices or {}).get(d["file"]), self.facilities)
                d["items"] = len(its)
                docs.append(d)
                items += its
                live["items"], live["files_done"] = len(items), n
                fresh = []
                for it in its:
                    if it.get("read_state") == "unreadable":
                        it["group_key"] = UNREADABLE_KEY
                for g in group_items([it for it in its if it.get("read_state") != "unreadable"]):
                    if g["key"] in groups_by_key:                    # the same item was already seen in an earlier file
                        groups_by_key[g["key"]]["item_ids"] += g["item_ids"]
                    else:
                        groups_by_key[g["key"]] = g
                        fresh.append(g)
                if fresh:
                    decisions.update(self.classifier.classify_groups(fresh))
                say("reading", n, len(paths), d["file"])

        groups = list(groups_by_key.values())
        say("classifying", len(groups), len(groups), f"{len(items)} lines -> {len(groups)} distinct items")

        say("building rows")
        rows, skipped = [], []
        by_doc: dict[str, int] = {}
        for it in items:
            dec = decisions[it["group_key"]]
            rs = self.rows_for_item(it, dec)
            if not rs:
                skipped.append({"item_id": it["item_id"], "file": it["source"]["file"], "text": it.get("description_en") or it.get("description"),
                                "amount": it.get("amount"), "reason": "Not an emissions activity (tax/fee/permit)"})
            rows += rs
            by_doc[it["item_id"].split("-")[0]] = by_doc.get(it["item_id"].split("-")[0], 0) + len(rs)

        # duplicates across this upload and earlier uploads
        dk_first: dict[str, str] = {}
        for it in items:
            k = doc_key(it)
            if not k:
                continue
            first = dk_first.setdefault(k, it["source"]["file"])
            prev = self.memory.seen(self.org, "doc:" + k) if self.memory is not None else None
            msg = None
            if first != it["source"]["file"]:
                msg = f"Same invoice ({it.get('invoice_number')}) also in {first}"
            elif prev and prev["job_id"] != job_id:
                msg = f"Invoice {it.get('invoice_number')} was already uploaded ({prev['file_name']})"
            if msg:
                for r in rows:
                    if r["item_id"] == it["item_id"]:
                        r["checks"].append({"code": "duplicate", "level": "warn", "message": msg})
                        finish(r, it)
        item_of = {it["item_id"]: it for it in items}
        plausibility.apply(items, rows, docs, history=(lambda k: self.memory.get_history(self.org, k)) if self.memory is not None else None,
                           today=self.reference_date)
        for r in rows:
            r["state"] = rowstate.of(r, item_of[r["item_id"]])
            r["shown"] = rowstate.shown(r)
        source_rows = [r for d in docs for r in d.pop("source_rows", [])]
        for d in docs:
            d["rows"] = by_doc.get(d["doc_id"], 0)
        if self.memory is not None:
            for d in docs:
                for it in (i for i in items if i["item_id"].startswith(d["doc_id"] + "-")):
                    if (h := it["source"].get("file_hash")):
                        self.memory.mark_seen(self.org, "file:" + h, d["file"], job_id)
                    if (k := doc_key(it)):
                        self.memory.mark_seen(self.org, "doc:" + k, d["file"], job_id)
            for g in groups:     # confident AI decisions speed up the next upload
                dec = decisions[g["key"]]
                if dec.get("activity_id") and dec["source"] not in ("memory", "rules") and (dec.get("confidence") or 0) >= 0.95:
                    self.classifier.remember(g["rep"], dec, "auto")

        calls = self.classifier.calls
        events = [usage.from_llm_call(c) for c in metrics["llm_calls"]] + [usage.from_classifier_call(c) for c in calls]
        status_counts: dict[str, int] = {}
        for r in rows:
            status_counts[r["review_status"]] = status_counts.get(r["review_status"], 0) + 1
        result = {
            "job_id": job_id, "mode": mode, "documents": docs, "rows": rows, "skipped": skipped, "source_rows": source_rows,
            "items": items, "decisions": decisions,
            "usage": {"events": events, **usage.summarise(events)},
            "metrics": {
                "files": len(paths), "items": len(items), "groups": len(groups), "rows": len(rows),
                "status": status_counts, "row_states": rowstate.counts(rows), "import_report": self._import_report(docs, rows, rowstate.counts(rows)), "seconds": round(time.time() - t0, 1),
                "ai_failures": (metrics.get("ai_failures", []) + [f for c in metrics["llm_calls"] for f in c.get("failures", [])])[:20],
                "classifier_calls": {p: sum(1 for c in calls if c.get("provider") == p and "error" not in c) for p in {c.get("provider") for c in calls}},
                "classifier_errors": [c for c in calls if "error" in c][:10],
                "providers_disabled": dict(self.classifier.disabled),
                "classifier_cost_usd": round(sum(c.get("cost_usd", 0) for c in calls), 5),
                "llm_calls": metrics["llm_calls"],
                "decision_sources": _count(d["source"] for d in decisions.values()),
            },
        }
        say("done")
        return result


def _count(it) -> dict:
    out: dict = {}
    for x in it:
        out[x] = out.get(x, 0) + 1
    return out
