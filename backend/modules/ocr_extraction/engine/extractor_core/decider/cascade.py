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
from .factors import slim
from .providers import PROVIDERS

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
    return ". ".join(parts)


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
    def _ask(self, state: str, questions: list[Question]):
        errors = []
        for p in self.providers:
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
        acts = self.tax.by_domain[dom]
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
    def _factor_decision(entry: dict, conf: float, source: str, reason: str, alts: list[dict]) -> dict:
        return {"activity_id": None, "factor_match": slim(entry), "confidence": round(conf, 3), "source": source, "context": {},
                "reason": reason, "alternatives": [{"activity_id": None, "label": a["name"], "p": None} for a in alts[:3]], "question": None}

    def _factor_first(self, item: dict) -> dict | None:
        idx = self._index()
        r = idx.match(item) if idx else None
        if not r:
            return None
        alts = [c for c in r["candidates"] if c["id"] != r["entry"]["id"]]
        if r["status"] == "strong":
            return self._factor_decision(r["entry"], r["confidence"], "factor_names", r["reason"], alts)
        if not self.use_ai or len(r["candidates"]) < 2:
            return None
        choices = {f"f{i}": f"{c['name']} ({c['category'].split(' - ')[0]}, {c['method']})" for i, c in enumerate(r["candidates"])}
        choices["none"] = "None of these names describes the item"
        q = Question("factor", "Which emission-factor name describes this line item best? Waste or scrap wording means a waste-treatment factor, "
                               "not the material itself. Pick the most specific name.", choices)
        try:
            a, p = self._ask(build_state(item, self.org_context), [q])
        except ProviderError:
            return None
        ans = a["factor"]
        if ans.choice == "none" or ans.confidence < 0.6:
            return None
        picked = r["candidates"][int(ans.choice[1:])]
        return self._factor_decision(picked, min(ans.confidence, 0.95), p.name, f"{p.name} picked factor '{picked['name']}' from the matching names",
                                     [c for c in r["candidates"] if c["id"] != picked["id"]])

    # ------------------------------------------------------------------ one group
    def classify(self, item: dict) -> dict:
        ek, dk = memory_keys(item)
        mem = None
        if self.memory is not None:
            for key, base in ((ek, 0.99), (dk, 0.95)):
                m = self.memory.get_decision(self.org, key)
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
                return self._factor_decision(fuel["entry"], fuel["confidence"], "factor_names", fuel["reason"], [])
            return {"activity_id": None, "confidence": 0.0, "source": "none", "context": ctx, "alternatives": [],
                    "reason": "No rule matched" + (f"; AI unavailable: {ai_err[:120]}" if ai_err else ""),
                    "question": "What is this item? Pick the activity it belongs to."}

        if ai:
            for k in ("use_context", "freight_direction"):
                v, c = ai[k]
                # the AI must be clearly sure to override/add context (it answers these even for non-fuel items)
                if c >= 0.85 and c > ctx_conf.get(k, 0) and not (k == "freight_direction" and v == "unknown"):
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
    def classify_groups(self, groups: list[dict], progress=None) -> dict[str, dict]:
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
        if self.memory is None or not decision.get("activity_id"):
            return
        ek, dk = memory_keys(item)
        self.memory.save_decision(self.org, ek, decision["activity_id"], decision.get("context"), source)
        if source == "user" and scope == "all":
            self.memory.save_decision(self.org, dk, decision["activity_id"], decision.get("context"), source)
