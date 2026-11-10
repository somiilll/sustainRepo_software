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
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import extract, layout, llm, normalise, usage
from .config import load
from .decider.cascade import Classifier
from .derive import co2_share, companion_specs
from .fields import capacity_conversion
from .fields import build_calc, display_quantity
from .group import group_items
from . import plausibility
from .facilities import apply_choice, fixed_facility
from .validate import doc_key, finish, match_facility, resolve_period, row_checks


class JobCancelled(Exception):
    """The customer cancelled the job."""


class OutOfCredits(Exception):
    """The customer's balance ran out during a job."""


class Engine:
    def __init__(self, memory=None, org: str = "default", org_context: dict | None = None,
                 facilities: list[dict] | None = None, use_ai: bool = True, providers=None, reference_date=None):
        self.memory, self.org = memory, org
        self.reference_date = reference_date          # "today" for date checks; tests pin it
        self.org_context = org_context or {}
        self.facilities = facilities or []
        self.use_ai = use_ai
        self.classifier = Classifier(memory, org, self.org_context, use_ai=use_ai, providers=providers)

    # ------------------------------------------------------------------ ingest
    def _ingest_sheet(self, path: Path, src: dict, metrics: dict) -> tuple[list[dict], dict]:
        info = {"tables": [], "warnings": []}
        items: list[dict] = []
        for t in normalise.read_tables(path):
            spec = layout.map_table(t, self.org, self.memory, self.use_ai, metrics)
            got = layout.apply_spec(t, spec, src) if spec["shape"] != "unknown" else []
            info["tables"].append({"sheet": t.sheet, "first_row": t.first_row, "rows": len(t.rows), "shape": spec["shape"],
                                   "layout_source": spec["source"], "layout_score": round(spec.get("score", 0), 2),
                                   "items": len(got), "columns": {k: t.header[v] for k, v in spec.get("columns", {}).items() if v is not None and v < t.ncols}})
            if spec["shape"] == "unknown" and len(t.rows) >= 3 and not re.search(r"instruction|legend|lookup|readme|help|note", t.sheet, re.I):
                info["warnings"].append(f"Sheet '{t.sheet}' row {t.first_row}: could not understand this table's layout")
            info["warnings"] += spec.get("warnings", [])
            items += got
        return items, info

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
        if aid and tax.get(aid).get("no_record"):
            return []
        base_id = item["item_id"]
        rows = []
        qty, unit, dim = display_quantity(item)
        fac = fixed_facility(item) or match_facility(item, self.facilities)
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
            r["checks"] = row_checks(r, item)
            return finish(r, item)

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
                f = load().formulas[c["formula"]]
                key = f["fields"][0]["key"]
                fields = {key: main["quantity"], f"{key}_unit": main["unit"]} if main["quantity"] is not None and main["calc"].get("formula_id") else {}
                calc = {"formula_id": c["formula"] if fields else None, "formula_label": f["label"], "ef_method": "activity",
                        "fields": fields, "missing": [] if fields else [f["fields"][0]["label"]], "notes": [], "status": "ok",
                        "emergent_formula_id": f.get("emergent_formula_id")}
                rows.append(make(f"{base_id}-{k}", aid, cg, calc, c["label"], derived=True, parent=main["row_id"], amount=None,
                                 dec={**decision, "reason": f"Auto-added companion of {main['row_id']} ({c['kind']})"}))
        return rows

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

        seen_hashes = {}

        def ingest(path: Path):
            if cancel is not None and cancel.is_set():
                raise JobCancelled("Cancelled")
            src = {"file": path.name, "path": str(path), "kind": normalise.file_kind(path)}
            d = {"doc_id": uuid.uuid4().hex[:8], "file": path.name, "kind": src["kind"], "status": "ok", "warnings": []}
            try:
                h = normalise.file_hash(path)
                src["file_hash"] = h
                if h in seen_hashes:
                    d.update(status="duplicate", warnings=[f"Same file as {seen_hashes[h]} in this upload"])
                    return d, []
                seen_hashes[h] = path.name
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
        decisions: dict[str, dict] = {}
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
                for g in group_items(its):
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
        plausibility.apply(items, rows, docs, history=(lambda k: self.memory.get_history(self.org, k)) if self.memory is not None else None,
                           today=self.reference_date)
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
                if dec.get("activity_id") and dec["source"] not in ("memory", "rules") and dec["confidence"] >= 0.95:
                    self.classifier.remember(g["rep"], dec, "auto")

        calls = self.classifier.calls
        events = [usage.from_llm_call(c) for c in metrics["llm_calls"]] + [usage.from_classifier_call(c) for c in calls]
        status_counts: dict[str, int] = {}
        for r in rows:
            status_counts[r["review_status"]] = status_counts.get(r["review_status"], 0) + 1
        result = {
            "job_id": job_id, "mode": mode, "documents": docs, "rows": rows, "skipped": skipped,
            "items": items, "decisions": decisions,
            "usage": {"events": events, **usage.summarise(events)},
            "metrics": {
                "files": len(paths), "items": len(items), "groups": len(groups), "rows": len(rows),
                "status": status_counts, "seconds": round(time.time() - t0, 1),
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
