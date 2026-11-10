"""Deterministic signals: keyword dictionary from the taxonomy, HSN/SAC codes, the extractor's 'nature' hint,
unit dimension, and context words (DG set / forklift / transporter ...). No API calls."""
from __future__ import annotations

import re
from functools import lru_cache

from ..config import load
from ..group import dimension

NATURE_TO_DOMAIN = {"fuel": "fuel_combustion", "electricity": "electricity", "steam_heat": "heat_steam_cooling", "water": "water",
                    "wastewater": "wastewater", "waste": "waste", "refrigerant": "refrigerant_fugitive", "industrial_gas": "industrial_gas",
                    "freight": "freight", "travel": "business_travel", "goods": "purchased_goods", "service": "purchased_services",
                    "capital_item": "capital_goods", "rent": "leased_assets", "fee_or_tax": "non_activity"}

DOMAIN_FALLBACK = {"purchased_goods": "goods.other_goods", "capital_goods": "capex.machinery",
                   "purchased_services": "service.other_services"}

USE_CONTEXT_WORDS = {
    "stationary_equipment": r"\b(dg|d\.g\.|genset|gen set|generator|boiler|furnace|heater|kiln|oven|burner|thermic|thermopac|canteen|kitchen|stationary|dryer|incinerator)\b",
    "offroad_equipment": r"\b(forklift|fork lift|hydra|crane|jcb|loader|excavator|tractor|reach stacker|stacker|dumper|backhoe|earth mover)\b",
    "company_vehicle": r"\b(company vehicle|own vehicle|company owned|fleet|staff car|pool car|vehicle no|[a-z]{2}[- ]?\d{1,2}[- ]?[a-z]{1,2}[- ]?\d{4})\b",
    "third_party_vehicle": r"\b(transporter|hired vehicle|contractor vehicle|vendor vehicle|third party vehicle|diesel transport)\b",
}


def _kw_regex(kw: str) -> re.Pattern:
    if "\\" in kw or re.search(r"\.\{|\.\*|[\[\]()|]", kw):     # the keyword is already a regex
        return re.compile(kw, re.I)
    # tolerate plurals: 'electrical component' also matches 'electrical components'
    return re.compile(r"(?<![a-z0-9])" + re.escape(kw.lower().strip()) + r"(?:s|es)?(?![a-z0-9])", re.I)


@lru_cache(maxsize=1)
def _compiled():
    tax = load().taxonomy
    return [(a["id"], [(kw, _kw_regex(kw)) for kw in a["keywords"]]) for a in tax.raw["activities"]]


def item_text(item: dict) -> str:
    parts = [item.get("description_en"), item.get("description"), item.get("notes"), item.get("used_in"),
             item.get("waste_type"), item.get("disposal_method"), item.get("travel_mode"), item.get("freight_mode")]
    if len(str(item.get("description") or "")) < 4:
        parts.append(item.get("context"))
    return " ".join(str(p) for p in parts if p).lower()


def _desc_text(item: dict) -> str:
    t = " ".join(str(p) for p in (item.get("description_en"), item.get("description")) if p)
    return (t if len(t) >= 4 else t + " " + str(item.get("context") or "")).lower()


def hsn_signal(code: str | None) -> dict | None:
    if not code:
        return None
    code = "".join(ch for ch in str(code) if ch.isdigit())
    hits = [r for r in load().hsn_rules if code.startswith(r["code_prefix"])]
    return max(hits, key=lambda r: len(r["code_prefix"])) if hits else None   # most specific prefix wins


def use_context(item: dict) -> tuple[str | None, float]:
    t = item_text(item) + " " + (item.get("context") or "").lower()
    hits = [k for k, rx in USE_CONTEXT_WORDS.items() if re.search(rx, t, re.I)]
    if len(hits) == 1:
        return hits[0], 0.88
    if "offroad_equipment" in hits:
        return "offroad_equipment", 0.75
    return None, 0.0


def freight_direction(item: dict) -> tuple[str, float]:
    d = (item.get("freight_direction") or "").lower()
    m = {"inbound": "inbound", "outbound": "outbound_paid_by_us", "between_own_sites": "between_own_sites"}
    return (m[d], 0.85) if d in m else ("unknown", 0.6)


def evaluate(item: dict) -> dict:
    """{'activity_id', 'confidence', 'domain', 'domain_confidence', 'reasons': [...], 'candidates': [(id, score)]}"""
    tax = load().taxonomy
    text = item_text(item)
    desc = _desc_text(item)
    dim = dimension(item)
    scores: dict[str, float] = {}
    hits_by: dict[str, list[str]] = {}
    desc_hit: set[str] = set()
    for aid, kws in _compiled():
        for kw, rx in kws:
            if rx.search(desc):                 # words in the item description count fully
                w = 1.0
                desc_hit.add(aid)
            elif rx.search(text):               # words only in notes/context count much less (notes often say 'no freight')
                w = 0.15
            else:
                continue
            if tax.get(aid).get("generic"):
                w *= 0.3
            scores[aid] = scores.get(aid, 0) + w * (1 + min(len(kw), 20) / 10)
            hits_by.setdefault(aid, []).append(kw.replace("\b", ""))
    reasons = []
    # unit dimension filter (only for physical units; spend-only items keep every candidate)
    if dim not in ("currency", "unknown"):
        for aid in list(scores):
            if dim not in tax.get(aid)["dimensions"]:
                scores[aid] *= 0.3
    hsn = hsn_signal(item.get("hsn"))
    dom_prior, dom_conf = None, 0.0
    hsn_fallback = None
    if hsn:
        reasons.append(f"HSN/SAC {item['hsn']} -> {hsn['target']}")
        if hsn["target_type"] == "activity" and hsn["target"] in tax.activities:
            scores[hsn["target"]] = scores.get(hsn["target"], 0) + 4 * hsn["confidence"]
        dom_prior = hsn["target"] if hsn["target_type"] == "domain" else tax.get(hsn["target"])["domain"] if hsn["target"] in tax.activities else None
        dom_conf = hsn["confidence"]
        if hsn["target_type"] == "domain" and not any(tax.get(a)["domain"] == hsn["target"] for a in desc_hit):
            # e.g. HSN 8431 (machinery spares) with no keyword hit -> the domain's catch-all activity
            fb = DOMAIN_FALLBACK.get(hsn["target"])
            if fb in tax.activities:
                scores[fb] = scores.get(fb, 0) + 2.5 * hsn["confidence"]
                hsn_fallback = fb
    nat = NATURE_TO_DOMAIN.get(item.get("nature") or "")
    if nat:
        for aid in scores:
            if tax.get(aid)["domain"] == nat:
                scores[aid] *= 1.4
        if not dom_prior:
            dom_prior, dom_conf = nat, 0.6
    if dom_prior:
        for aid in scores:
            if tax.get(aid)["domain"] == dom_prior:
                scores[aid] *= 1.5
    # 'refilling/repair of CO2 extinguisher', 'servicing of AC with R-32 top-up': the gas/fuel is what gets emitted,
    # so a specific physical activity beats the generic service words around it
    phys = [a for a in scores if tax.get(a)["domain"] in ("refrigerant_fugitive", "fuel_combustion", "industrial_gas")]
    if phys:
        top_phys = max(scores[a] for a in phys)
        for aid in list(scores):
            if tax.get(aid)["domain"] == "purchased_services" and top_phys >= 1.5:   # a real gas/fuel word in the text
                scores[aid] *= 0.25
    # explicit upstream / downstream lines ('WTT diesel', 'T&D losses', 'sub-leased warehouse') beat the plain fuel/power words
    for aid in desc_hit:
        if tax.get(aid).get("priority"):
            scores[aid] *= tax.get(aid)["priority"]
    ranked = sorted(scores.items(), key=lambda kv: -kv[1])
    if not ranked:
        return {"activity_id": None, "confidence": 0.0, "domain": dom_prior, "domain_confidence": dom_conf, "reasons": reasons, "candidates": []}
    best, s1 = ranked[0]
    s2 = ranked[1][1] if len(ranked) > 1 else 0.0
    margin = (s1 - s2) / s1
    conf = 0.55 + 0.3 * margin
    if hsn and (hsn["target"] == best or hsn["target"] == tax.get(best)["domain"]):
        conf += 0.1
    if nat and nat == tax.get(best)["domain"]:
        conf += 0.05
    if dim not in ("currency", "unknown") and dim in tax.get(best)["dimensions"]:
        conf += 0.03
    conf = min(conf, 0.95)
    if best == hsn_fallback:
        conf = min(conf, 0.7)        # only the HSN chapter is known - let the AI decide the specific goods type
    elif best not in desc_hit and not (hsn and hsn["target"] in (best, tax.get(best)["domain"])):
        # nothing in the description itself - only weak hints from notes/context
        conf = min(conf, 0.45)
    reasons.insert(0, f"keywords {hits_by.get(best, [])[:3]}")
    return {"activity_id": best, "confidence": round(conf, 3), "domain": tax.get(best)["domain"],
            "domain_confidence": dom_conf, "reasons": reasons, "candidates": ranked[:5]}
