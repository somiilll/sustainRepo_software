"""Combines the signals into one decision per group:  org memory -> rules -> Jev -> OpenAI Decisions -> Claude.

Two-stage questions keep every choice list short (Jev's limit is 255): stage 1 picks the domain (16 options) and
answers context questions; stage 2 picks the activity inside that domain. Rules and AI that agree reinforce each
other; when they disagree the confidence drops and the row goes to review.
"""
from __future__ import annotations

import re
import threading
from concurrent.futures import ThreadPoolExecutor

from .. import limits
from ..config import load
from ..group import dimension, memory_keys
from . import rules
from .base import ProviderError, Question
from . import describe
from .factors import item_text, sector_map, slim
from .providers import PROVIDERS

SHORTLIST = 6
ALTERNATIVES = 8
USE_CONTEXT_Q = {
    "stationary_equipment": "Burned in fixed equipment we own or control: DG set, boiler, furnace, kiln, heater, canteen",
    "company_vehicle": "Fuel for vehicles we own or lease (cars, trucks, buses in our fleet)",
    "offroad_equipment": "Fuel for our forklifts, cranes, hydras, loaders or other mobile site machinery",
    "third_party_vehicle": "Fuel paid for a transporter's or contractor's vehicle that we do not own",
}
DIRECTION_Q = {
    "inbound": "Goods coming to our site from a supplier",
    "outbound_paid_by_us": "Goods we send to customers and we pay the transport",
    "between_own_sites": "Goods moved between our own plants or warehouses",
    "outbound_paid_by_customer": "Goods sent to customers where the customer pays the transport",
    "unknown": "Cannot tell / not a freight item",
}


def build_state(item: dict, org_context: dict | None) -> str:
    doc = item.get("doc") or {}
    parts = [f"Item: {item.get('description_en') or item.get('description')}"]
    if item.get("description") and item.get("description") != item.get("description_en"):
        parts.append(f"Item as printed: {item['description']}")
    if item.get("hsn"):
        parts.append(f"HSN/SAC code: {item['hsn']}")
    if item.get("quantity") is not None:
        parts.append(f"Quantity: {item['quantity']} {item.get('unit') or ''}".strip())
    if item.get("amount") is not None:
        parts.append(f"Amount: {item['amount']} {item.get('currency') or 'INR'}")
    for k, label in [("vendor", "Vendor"), ("used_in", "Used in"), ("notes", "Notes"), ("context", "Source"),
                     ("waste_type", "Waste type"), ("disposal_method", "Disposal"), ("travel_mode", "Travel mode"),
                     ("freight_mode", "Freight mode"), ("origin", "From"), ("destination", "To")]:
        if item.get(k):
            parts.append(f"{label}: {item[k]}")
    if doc.get("vendor_type"):
        parts.append(f"Vendor type: {doc['vendor_type']}")
    if doc.get("other_lines"):
        parts.append("Other lines on the same document: " + "; ".join(x for x in doc["other_lines"] if x)[:300])
    if doc.get("transport_of_waste_only"):
        parts.append("The document is only for transporting waste")
    oc = org_context or {}
    if oc.get("industry"):
        parts.append(f"Reporting company: {oc.get('name', '')} ({oc['industry']})")
    if item.get("_described"):
        d = item["_described"]
        parts.append("Plain-words reading of the item (AI inference, may be wrong" + (", brand not recognised" if d["unknown"] else "") + "): " + d["plain"][:400])
    if oc.get("overview"):
        parts.append("About the company: " + str(oc["overview"])[:400])
    if oc.get("process"):
        parts.append("Company process: " + str(oc["process"])[:400])
    if fac := facility_context(item, oc.get("facilities") or []):
        parts.append(fac)
    return ". ".join(parts)


def _fac_line(f: dict) -> str:
    bits = [f"sector {f['sector']}" if f.get("sector") else "", f"makes {f['products']}" if f.get("products") else "",
            f"machinery {f['machinery']}" if f.get("machinery") else ""]
    return ", ".join(b for b in bits if b)


def facility_context(item: dict, facilities: list[dict]) -> str | None:
    """The facility the row names (profile), otherwise a short list of all facilities, so the model knows what the plant does."""
    hint = str(item.get("facility_hint") or "").strip().lower()
    hit = next((f for f in facilities if hint and f["name"].strip().lower() == hint), None)
    if hit and _fac_line(hit):
        return f"Facility {hit['name']}: {_fac_line(hit)}"
    lines = [f"{f['name']} ({_fac_line(f)})" for f in facilities[:8] if _fac_line(f)]
    return ("Facilities: " + "; ".join(lines))[:500] if lines else None


class Classifier:
    def __init__(self, memory=None, org: str = "default", org_context: dict | None = None, use_ai: bool = True,
                 chain: list[str] | None = None, providers: dict | None = None, factors=None):
        cfg = load()
        self.tax, self.policy = cfg.taxonomy, cfg.policy
        self.memory, self.org, self.org_context = memory, org, org_context or {}
        self._factors = factors
        names = [n for n in (chain or self.policy["classifier_chain"]) if n in PROVIDERS]
        self.providers = providers if providers is not None else [PROVIDERS[n]() for n in names]
        self.use_ai = use_ai
        self.calls: list[dict] = []
        self._lock = threading.Lock()
        self._fails: dict[str, int] = {}     # consecutive failures per provider
        self.disabled: dict[str, str] = {}   # provider -> why it was switched off for the rest of this job

    # ------------------------------------------------------------------ AI
    def _ask(self, state: str, questions: list[Question], only: list[str] | None = None):
        errors = []
        for p in ([PROVIDERS[n]() for n in only] if only else self.providers):
            if not p.available() or p.name in self.disabled:
                continue
            try:
                with limits.gate("classifier"):
                    ans, usage = p.decide(state, questions)
                with self._lock:
                    self.calls.append({**usage, "questions": [q.name for q in questions]})
                    self._fails[p.name] = 0
                return ans, p
            except ProviderError as e:
                msg = str(e)
                errors.append(f"{p.name}: {msg}")
                with self._lock:
                    self.calls.append({"provider": p.name, "error": msg[:200]})
                    self._fails[p.name] = self._fails.get(p.name, 0) + 1
                    # circuit breaker: a bad key / no credit never recovers inside a job; flaky timeouts get 3 tries
                    if re.search(r"HTTP (401|402|403)|insufficient_quota|no credits", msg) or self._fails[p.name] >= 3:
                        self.disabled.setdefault(p.name, msg[:160])
        raise ProviderError("; ".join(errors) or "no classifier available (set OPENROUTER_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY)")

    def _ai(self, item: dict, rules_pick: dict) -> dict:
        state = build_state(item, self.org_context)
        q1 = [Question("domain", "Which kind of activity is this line item?", self.tax.domains),
              Question("use_context", "If this is a fuel, where was it burned? (choose the closest even if not a fuel)", USE_CONTEXT_Q),
              Question("freight_direction", "If this is goods transport, which direction and who pays?", DIRECTION_Q)]
        a1, p1 = self._ask(state, q1)
        dom = a1["domain"].choice
        acts = self.tax.by_domain.get(dom)
        if not acts:         # purchases, waste, freight, travel...: chosen from the real factor names, not from an activity list
            return {"factor_domain": dom, "domain_confidence": a1["domain"].confidence, "provider": p1.name, "alternatives": []}
        r_act = rules_pick.get("activity_id")
        if len(acts) == 1:
            act, p_act, probs, prov = acts[0]["id"], 1.0, {}, p1
        elif r_act and self.tax.get(r_act)["domain"] == dom and rules_pick["confidence"] >= 0.8:
            # the AI confirms the rules' domain: keep the rules' specific activity and skip the second call
            act, p_act, probs, prov = r_act, 0.9, {}, p1
        else:
            a2, prov = self._ask(state, [Question("activity", f"Which specific activity is it? ({self.tax.domains[dom]})",
                                                  {a["id"]: a["label"] for a in acts})])
            act, p_act, probs = a2["activity"].choice, a2["activity"].confidence, a2["activity"].probabilities
        conf = a1["domain"].confidence * p_act
        alts = sorted(((k, v) for k, v in probs.items() if k != act and v), key=lambda kv: -kv[1])[:3]
        return {"activity_id": act, "confidence": conf, "provider": prov.name, "domain": dom,
                "domain_confidence": a1["domain"].confidence,
                "use_context": (a1["use_context"].choice, a1["use_context"].confidence),
                "freight_direction": (a1["freight_direction"].choice, a1["freight_direction"].confidence),
                "alternatives": [{"activity_id": k, "p": round(v, 3)} for k, v in alts]}

    # ------------------------------------------------------------------ DB factor names first
    def _index(self):
        try:
            return self._factors() if self._factors else None
        except Exception as e:                       # the factor tables are unreachable: fall back to the taxonomy
            self.calls.append({"provider": "factor_db", "error": f"factor names unavailable: {e}"[:200]})
            return None

    @staticmethod
    def _factor_decision(entry: dict, source: str, reason: str, alts: list[dict], level: str, tags: list[str], question: str | None = None) -> dict:
        return {"activity_id": None, "factor_match": slim(entry), "confidence": None, "level": level, "tags": tags, "source": source, "context": {},
                "reason": reason, "alternatives": [{"activity_id": None, "label": a["name"], "p": None, "factor": slim(a)} for a in alts[:ALTERNATIVES]], "question": question}

    def _factor_first(self, item: dict) -> dict | None:
        """Stage 1: an exact factor name is used as it is. Anything else goes on to classification + Haiku identification."""
        idx = self._index()
        r = (idx.match_gas(item) or idx.match(item)) if idx else None
        if not r or r["status"] != "strong":
            return None
        return self._factor_decision(r["entry"], "factor_names", r["reason"], [c for c in r["candidates"] if c["id"] != r["entry"]["id"]], "certain", ["exact_name"])

    def _factor_by_domain(self, item: dict, dom: str) -> dict | None:
        """Classification (Jev) gave the item type; Jev picks the sector and narrows the factor names to a shortlist; Haiku makes the final factor choice."""
        idx = self._index()
        cands = idx.candidates(item, dom) if idx else []
        if not cands:
            return None
        state = build_state(item, self.org_context)
        sectors, _ = sector_map()
        by_sec: dict[str, list[dict]] = {}
        for c in cands:
            by_sec.setdefault(idx.sector_of(c) or "other_manufacturing", []).append(c)
        rd = item.get("_described") or {}
        extra = " ".join([rd.get("plain", ""), *rd.get("synonyms", [])])
        sec = "all"
        if dom in ("purchased_goods", "purchased_services", "capital_goods") and len(cands) > 150 and len(by_sec) > 1:
            q = Question("sector", "Which sector does this purchase belong to? Decide what the product or service really is and what this company does with it.",
                         {k: sectors.get(k, k) for k in by_sec})
            a, _ = self._ask(state, [q])
            sec = a["sector"].choice
            near = list(dict.fromkeys([sec, *(k for k, v in sorted(a["sector"].probabilities.items(), key=lambda kv: -kv[1]) if k in by_sec and v)]))[:3]
            # sector is a hint, not a gate: best names anywhere + best names in Jev's likeliest sectors
            merged = [*idx.rank(item, cands, extra)[:20]]
            for k, n in zip(near, (25, 10, 5)):
                merged += idx.rank(item, by_sec[k], extra)[:n]
            pool = list({c["id"]: c for c in merged}.values())[:60]
        elif len(by_sec) == 1:
            sec = next(iter(by_sec))                   # freight, waste and travel lists are short and are not grouped by industry
        if sec == "all" or len(by_sec) == 1:
            pool = idx.rank(item, cands, extra)[:60]
        show_sector = len(by_sec) > 1 and sec != "all"
        choices = {f"f{i}": f"{c['name']} ({c['category'].split(' - ')[0]}, {c['method']}" + (f", {sectors.get(idx.sector_of(c) or '', '')[:40]}" if show_sector else "") + ")"
                   for i, c in enumerate(pool)}
        choices["none"] = "None of these names describes the item"
        q = Question("factor", "Which emission-factor name fits this line best? Waste or scrap wording means a waste-treatment factor, not the material. "
                               "Pick the most specific name for what the item is.", choices)
        a, p = self._ask(state, [q])
        ans = a["factor"]
        tags = ["jev_pick"] + (["unknown_brand"] if rd.get("unknown") else [])
        order = [k for k, v in sorted(ans.probabilities.items(), key=lambda kv: -kv[1]) if k in choices and k != "none" and v]
        short_keys = list(dict.fromkeys(([ans.choice] if ans.choice in choices and ans.choice != "none" else []) + order))[:SHORTLIST]
        short_keys = short_keys or [f"f{i}" for i in range(min(SHORTLIST, len(pool)))]
        hq_choices = {k: choices[k] for k in short_keys}
        hq_choices["none"] = choices["none"]
        hq = Question("factor", q.instructions + " Jev has already narrowed the list; you make the final choice.", hq_choices)
        try:
            ha, p = self._ask(state, [hq], only=["claude"])
            ans, tags = ha["factor"], ["haiku_final", *tags]
            level = ans.level if ans.level in ("certain", "likely", "uncertain", "guess") else "uncertain"
            tags += [t for t in ans.tags if t not in tags]
        except ProviderError:                          # Haiku unavailable: Jev's own pick stands
            rev = self.policy["review"]
            c = ans.confidence or 0
            level = "certain" if c >= rev["ready_threshold"] else "likely" if c >= rev["ask_below"] else "uncertain"
        if ans.choice == "none" or ans.choice not in choices:
            return self._factor_decision(pool[0], p.name, f"{p.name}: no factor name clearly fits - best guess shown", pool[1:4], "guess",
                                         ["no_good_option", *tags], "Please confirm what this item is.")
        picked = pool[int(ans.choice[1:])]
        alts = [pool[int(k[1:])] for k in (short_keys + order) if k != ans.choice and k in choices and k != "none"]
        sibs, unresolved = idx.variants(picked, cands, item_text(item))
        alts = list(({x["id"]: x for x in [*sibs, *alts, *pool] if x["id"] != picked["id"]}).values())[:ALTERNATIVES]
        question = "Please confirm what this item is." if level in ("uncertain", "guess") else None
        if unresolved:
            level, tags = "uncertain", [*tags, "variant_unspecified"]
            question = "The item does not say which variant it is - please choose the right one."
        return self._factor_decision(picked, p.name, f"{p.name} identified '{picked['name']}' (sector {sec})", alts, level, tags, question)

    # ------------------------------------------------------------------ one group
    def classify(self, item: dict) -> dict:
        if self.use_ai and (rd := describe.lookup(describe.text_of(item))):
            item = {**item, "_described": rd}
        ek, dk = memory_keys(item)
        mem = None
        if self.memory is not None:
            for key, base in ((ek, 0.99), (dk, 0.95)):
                m = self.memory.get_decision(self.org, key)
                if m and str(m["activity_id"]).startswith("factor:"):
                    idx = self._index()
                    ent = idx.entry_by_id(m["activity_id"][7:]) if idx else None
                    if ent:
                        mem = {**self._factor_decision(ent, "memory", "Remembered factor choice", [], "certain" if m["source"] == "user" else "likely",
                                                       ["confirmed_by_you"] if m["source"] == "user" else ["remembered_ai_answer"]),
                               "memory_source": m["source"], "memory_scope": "all vendors" if key == dk else "this vendor"}
                        break
                if m and m["activity_id"] in self.tax.activities:
                    conf = base if m["source"] == "user" else base - 0.03
                    mem = {"activity_id": m["activity_id"], "confidence": conf, "source": "memory", "memory_source": m["source"],
                           "memory_scope": "all vendors" if key == dk else "this vendor", "context": m["context"], "reason": f"Remembered ({'your correction' if m['source'] == 'user' else 'earlier confident decision'}, used {m['hits']}x)",
                           "alternatives": [], "question": None}
                    break
        if mem and mem["memory_source"] == "user":
            return mem
        fm = self._factor_first(item)
        if fm:
            return fm
        if mem:
            return mem
        r = rules.evaluate(item)
        ctx: dict = {}
        ctx_conf: dict = {}
        uc, ucc = rules.use_context(item)
        if uc:
            ctx["use_context"], ctx_conf["use_context"] = uc, ucc
        fd, fdc = rules.freight_direction(item)
        ctx["freight_direction"], ctx_conf["freight_direction"] = fd, fdc

        def needs_ctx(aid):
            k = self.tax.context_key(aid) if aid else None
            return k == "use_context" and ctx_conf.get("use_context", 0) < 0.7

        ai, ai_err = None, None
        rules_enough = bool(r["activity_id"]) and r["confidence"] >= self.policy["review"].get("rules_skip_ai_at", 0.95)             and not needs_ctx(r["activity_id"])
        if self.use_ai and not rules_enough:
            try:
                ai = self._ai(item, r)
            except ProviderError as e:
                ai_err = str(e)
            if ai and ai.get("factor_domain"):
                try:
                    if d := self._factor_by_domain(item, ai["factor_domain"]):
                        return d
                except ProviderError as e:
                    ai_err = str(e)
                ai = None

        if ai and r["activity_id"]:
            if ai["activity_id"] == r["activity_id"]:
                act = ai["activity_id"]
                conf = min(0.99, 1 - (1 - ai["confidence"]) * (1 - r["confidence"]))
                source, reason = f"rules+{ai['provider']}", f"Rules and {ai['provider']} agree ({'; '.join(r['reasons'])})"
            else:
                pick_ai = ai["confidence"] >= r["confidence"]
                act = ai["activity_id"] if pick_ai else r["activity_id"]
                other = r["activity_id"] if pick_ai else ai["activity_id"]
                conf = max(ai["confidence"], r["confidence"]) * 0.75
                source = ai["provider"] if pick_ai else "rules"
                reason = f"{ai['provider']} chose {ai['activity_id']}, rules chose {r['activity_id']} - please check"
                ai["alternatives"] = [{"activity_id": other, "p": round(min(ai['confidence'], r['confidence']), 3)}] + ai["alternatives"]
        elif ai:
            act, conf, source = ai["activity_id"], ai["confidence"], ai["provider"]
            reason = f"{ai['provider']}: domain {ai['domain']} ({ai['domain_confidence']:.0%})"
        elif r["activity_id"]:
            act, conf, source = r["activity_id"], r["confidence"] if rules_enough else min(r["confidence"], 0.8), "rules"
            reason = "; ".join(r["reasons"]) + (f" (AI unavailable: {ai_err[:80]})" if ai_err else "")
        else:
            idx = self._index()
            fuel = idx.match_fuel(item, ctx.get("use_context") if ctx_conf.get("use_context", 0) >= 0.7 else None) if idx else None
            if fuel:
                return self._factor_decision(fuel["entry"], "factor_names", fuel["reason"], [], "certain", ["exact_name"])
            return {"activity_id": None, "confidence": 0.0, "source": "none", "context": ctx, "alternatives": [],
                    "reason": "No rule matched" + (f"; AI unavailable: {ai_err[:120]}" if ai_err else ""),
                    "question": "What is this item? Pick the activity it belongs to."}

        if ai:
            for k in ("use_context", "freight_direction"):
                v, c = ai[k]
                # the AI must be clearly sure to override/add context (it answers these even for non-fuel items)
                if c >= self.policy["review"]["ready_threshold"] and c > ctx_conf.get(k, 0) and not (k == "freight_direction" and v == "unknown"):
                    ctx[k], ctx_conf[k] = v, c
        question = None
        if self.tax.context_key(act) == "use_context" and ctx_conf.get("use_context", 0) < 0.7:
            conf = min(conf, 0.75)
            question = "Where was this fuel used: our own equipment (DG set/boiler), our own vehicles or forklifts, or a transporter's vehicle?"
        if conf < self.policy["review"]["ask_below"] and not question:
            question = "Please confirm what this item is."
        alts = (ai or {}).get("alternatives") or [{"activity_id": k, "p": None} for k, _ in r["candidates"][1:3]]
        return {"activity_id": act, "confidence": round(conf, 3), "source": source, "context": ctx,
                "context_confidence": ctx_conf, "reason": reason, "alternatives": alts, "question": question}

    # ------------------------------------------------------------------ many groups
    def prepare(self, groups: list[dict]) -> None:
        """Haiku writes the internal plain-words reading, 10 items per call, only for items with no exact factor name and no remembered answer."""
        idx = self._index()
        if not (self.use_ai and idx):
            return
        texts = []
        for g in groups:
            rep = g["rep"]
            m = idx.match(rep)
            ek, dk = memory_keys(rep)
            known = self.memory is not None and (self.memory.get_decision(self.org, ek) or self.memory.get_decision(self.org, dk))
            if not (m and m["status"] == "strong") and not known:
                texts.append(describe.text_of(rep))
        if texts:
            describe.describe_missing(texts, build_state({}, self.org_context))

    def classify_groups(self, groups: list[dict], progress=None) -> dict[str, dict]:
        self.prepare(groups)
        out: dict[str, dict] = {}
        conc = self.policy["jev"]["concurrency"]
        done = [0]

        def run(g):
            d = self.classify(g["rep"])
            with self._lock:
                done[0] += 1
                if progress:
                    progress(done[0], len(groups))
            return g["key"], d

        with ThreadPoolExecutor(max_workers=max(1, min(conc, len(groups)))) as ex:
            for k, d in ex.map(run, groups):
                out[k] = d
        return out

    def remember(self, item: dict, decision: dict, source: str = "auto", scope: str = "vendor") -> None:
        """A correction is remembered for that vendor only; scope='all' also applies it to the same wording from any vendor."""
        aid = decision.get("activity_id") or (f"factor:{decision['factor_match']['id']}" if decision.get("factor_match") else None)
        if self.memory is None or not aid:
            return
        ek, dk = memory_keys(item)
        self.memory.save_decision(self.org, ek, aid, decision.get("context"), source)
        if source == "user" and scope == "all":
            self.memory.save_decision(self.org, dk, aid, decision.get("context"), source)
