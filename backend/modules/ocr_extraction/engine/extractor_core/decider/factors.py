"""DB-first matching: the line's description is compared with the real emission-factor names (scope3_ef, fuel_database)
before the 155-activity taxonomy is consulted. The category always comes from the factor's own table row.

Intent decides which factors may compete: waste words beat material words (copper waste -> C5 waste factors, never the
copper product), freight words -> C4/C9, travel -> C6/C7, everything else -> C1/C2 purchases.
"""
from __future__ import annotations

import re

from ..fields import display_quantity

STOP = {"of", "and", "the", "for", "to", "in", "with", "from", "a", "an", "per", "by", "on", "at", "or", "as", "used", "type", "item", "other", "nos", "no",
        "service", "services", "charge", "charges", "cost", "fee", "fees"}
TREATMENT = {"landfill", "recycl", "compost", "combust", "anaerob", "digest", "digestate", "cur", "dry", "wet"}
WASTE = {"wast", "scrap", "landfill", "recycl", "compost", "disposal", "incinerat", "dross", "sludg", "residu", "rubbl", "debri", "ewast", "refus", "garbag"}
FREIGHT = {"cargo", "freight", "lorry", "truck", "vessel", "tanker", "teu", "dwt", "haulag", "tkm", "shipment"}
TRAVEL = {"flight", "airfar", "airline", "taxi", "cab", "hotel", "train", "rail"}
NATURE_SKIP = {"fuel", "electricity", "steam_heat", "water", "wastewater", "refrigerant", "industrial_gas", "rent", "fee_or_tax"}
NATURE_INTENT = {"waste": "waste", "freight": "freight", "travel": "travel"}
MASS = {"kg": 1.0, "g": 0.001, "t": 1000.0, "tonne": 1000.0, "tonnes": 1000.0, "mt": 1000.0}
VOLUME = {"l": 1.0, "ml": 0.001, "kl": 1000.0, "m3": 1000.0}
UNIT_TABLE = {"mass": MASS, "volume": VOLUME}
MAIN_FIELD = {"scope_1": "qty", "scope_3": "activity_value"}
SCOPE_CODE = {"scope1": "scope_1", "scope3": "scope_3"}
FUEL_CATEGORY = {"stationary_equipment": "Stationary Combustion", "company_vehicle": "Mobile Combustion", "offroad_equipment": "Mobile Combustion"}

_RANGE = re.compile(r"(\d[\d,]*)\s*[–\-]\s*(\d[\d,]*)(?:\s*([a-z]+))?", re.I)
_PLUS = re.compile(r"(\d[\d,]*)\s*\+(?:\s*([a-z]+))?", re.I)
_NUM = re.compile(r"(\d[\d,]*(?:\.\d+)?)\+?(?:\s*([a-z]+))?", re.I)


def _f(s: str) -> float:
    return float(s.replace(",", ""))


def stem(w: str) -> str:
    for suf in ("ing", "ed", "s"):
        if w.endswith(suf) and not w.endswith("ss") and len(w) > len(suf) + 2:
            w = w[:-len(suf)]
            break
    return w[:-1] if w.endswith("e") and len(w) > 3 else w


def words(text: str) -> frozenset:
    t = str(text or "").lower().replace("&", " and ")
    return frozenset(stem(w) for w in re.findall(r"[a-z0-9]+", t) if w not in STOP)


def name_parts(name: str) -> tuple[frozenset, list[tuple[float, float, str]]]:
    """Words of a factor name plus its numeric ranges with their unit word ('8000+ TEU', '0-999 TEU')."""
    ranges = [(_f(a), _f(b), (u or "").lower()) for a, b, u in _RANGE.findall(name)]
    rest = _RANGE.sub(" ", name)
    ranges += [(_f(a), float("inf"), (u or "").lower()) for a, u in _PLUS.findall(rest)]
    return words(_PLUS.sub(" ", rest)), ranges


def numbers(text: str) -> list[tuple[float, str]]:
    return [(_f(a), (u or "").lower()) for a, u in _NUM.findall(text)]


def item_text(item: dict) -> str:
    parts = [item.get("description_en"), item.get("description") if item.get("description") != item.get("description_en") else None,
             item.get("waste_type"), item.get("disposal_method"), item.get("freight_mode"), item.get("travel_mode")]
    t = " ".join(str(p) for p in parts if p)
    return t if len(str(item.get("description") or "")) >= 4 else t + " " + str(item.get("context") or "")


class Rec:
    __slots__ = ("entry", "words", "ranges")

    def __init__(self, entry: dict):
        self.entry = entry
        self.words, self.ranges = name_parts(entry["name"])


def slim(entry: dict) -> dict:
    return {k: entry.get(k) for k in ("collection", "id", "name", "scope", "category", "category_id", "method", "allowed_units", "activity_type")}


def _fit(allowed: list, qty, unit, dim):
    """('ok', qty, unit) | ('details', None, None) when the factor needs several inputs | ('mismatch', None, None)."""
    if not allowed:
        return "details", None, None
    if qty is None or not unit:
        return "mismatch", None, None
    low = {a.lower(): a for a in allowed}
    if unit.lower() in low:
        return "ok", qty, low[unit.lower()]
    table = UNIT_TABLE.get(dim or "")
    if table and unit.lower() in table:
        for a in allowed:
            if a.lower() in table:
                return "ok", round(qty * table[unit.lower()] / table[a.lower()], 6), a
    return "mismatch", None, None


class FactorIndex:
    def __init__(self, entries: list[dict]):
        self.scope3: dict[tuple, dict[str, Rec]] = {}
        self.fuel: dict[tuple, dict[str, Rec]] = {}
        for e in entries:
            if e["collection"] == "scope3_ef":
                m = re.match(r"C(\d+)\b", e["category"])
                if m:
                    self.scope3.setdefault((e["name"].lower(), e["method"]), {})[f"C{m.group(1)}"] = Rec(e)
            else:
                self.fuel.setdefault((e["name"].lower(), "activity"), {})[e["category"]] = Rec(e)

    # ------------------------------------------------------------------ intent
    @staticmethod
    def intent(item: dict, dw: frozenset) -> tuple[str, tuple[str, ...]] | None:
        nature = item.get("nature") or ""
        if nature in NATURE_SKIP:
            return None
        waste = bool(dw & WASTE) or nature == "waste" or bool(item.get("waste_type"))
        freight = bool(dw & FREIGHT) or nature == "freight"
        if waste and freight:
            return None                    # waste transport has its own split rules
        if waste:
            return "waste", ("C5",)
        if freight:
            return "freight", ("C9", "C4") if item.get("freight_direction") == "outbound_paid_by_customer" else ("C4", "C9")
        if nature == "travel" or (dw & TRAVEL and nature not in ("goods", "capital_item")):
            return "travel", ("C7", "C6") if "commut" in " ".join(dw) else ("C6", "C7")
        return "goods", ("C2", "C1") if nature == "capital_item" else ("C1", "C2")

    # ------------------------------------------------------------------ scoring
    @staticmethod
    def _score(rec: Rec, dw: frozenset, nums: list[tuple[float, str]], dwords: int, waste: bool = False) -> dict | None:
        fw = rec.words
        if waste and not (dw & TREATMENT):
            fw = fw - TREATMENT          # 'copper waste' names no disposal route: Landfilled/Recycled/Combusted all stay candidates
        if not fw:
            return None
        common = len(fw & dw)
        if not common:
            return None
        contain = common / len(fw)
        cover = common / max(dwords, 1)
        in_range = False
        if rec.ranges:
            sat = sum(1 for lo, hi, ru in rec.ranges if any(lo <= v <= hi and (not u or not ru or u == ru) for v, u in nums))
            if nums and not sat:
                return None
            contain *= 0.6 if not nums else sat / len(rec.ranges)
            in_range = bool(nums) and sat == len(rec.ranges)
        if contain < 0.5:
            return None
        return {"rec": rec, "contain": contain, "cover": cover, "exact": fw == dw, "in_range": in_range,
                "score": contain * (0.6 + 0.4 * cover) + 0.02 * len(fw)}

    def _pool(self, table: dict, prefs: tuple[str, ...], qty, unit, dim, amount):
        for (_, method), by_cat in table.items():
            rec = next((by_cat[c] for c in prefs if c in by_cat), None)
            if rec is None:
                continue
            if method == "spend" and amount is None:
                continue
            if method == "activity" and qty is None and rec.entry["allowed_units"]:
                continue
            yield rec

    def match(self, item: dict) -> dict | None:
        """{'status': 'strong'|'ambiguous', 'entry', 'confidence', 'candidates': [entry..], 'reason'} or None."""
        text = item_text(item)
        dw = words(text)
        if not dw:
            return None
        it = self.intent(item, dw)
        if it is None:
            return None
        name, prefs = it
        qty, unit, dim = display_quantity(item)
        nums = numbers(text)
        dwords = len([w for w in dw if not w.isdigit()])
        scored = []
        for rec in self._pool(self.scope3, prefs, qty, unit, dim, item.get("amount")):
            s = self._score(rec, dw, nums, dwords, waste=name == "waste")
            if s:
                fit = _fit(rec.entry["allowed_units"], qty, unit, dim)[0] if rec.entry["method"] == "activity" else "ok"
                s["score"] += 0.05 if fit != "mismatch" else 0.0
                s["score"] += 0.01 if rec.entry["method"] == "activity" else 0.0
                scored.append(s)
        if not scored:
            return None
        scored.sort(key=lambda s: -s["score"])
        best = scored[0]
        second = next((s for s in scored[1:] if s["rec"].entry["name"].lower() != best["rec"].entry["name"].lower()), None)
        margin_ok = second is None or second["score"] <= 0.6 * best["score"] or len(best["rec"].words) > len(second["rec"].words) and best["contain"] == 1 and second["contain"] < 1
        nw = len(best["rec"].words)
        conf = None
        if best["exact"] or (best["contain"] == 1 and best["in_range"]):
            conf = 0.97
        elif best["contain"] == 1 and margin_ok and (nw >= 2 or best["cover"] >= 0.34):
            conf = 0.95 if nw >= 2 else 0.92
        elif best["in_range"] and best["contain"] >= 0.6 and margin_ok:
            conf = 0.9
        short = [s["rec"].entry for s in scored[:30]]
        reason = f"Description matches factor '{best['rec'].entry['name']}' ({best['rec'].entry['category']})"
        if conf:
            return {"status": "strong", "entry": best["rec"].entry, "confidence": conf, "candidates": short, "reason": reason, "intent": name}
        return {"status": "ambiguous", "entry": best["rec"].entry, "confidence": 0.5, "candidates": short,
                "reason": reason, "intent": name}

    def match_fuel(self, item: dict, use_context: str | None) -> dict | None:
        cat = FUEL_CATEGORY.get(use_context or "")
        text = item_text(item)
        dw = words(text)
        if not cat or not dw:
            return None
        for (_, _), by_cat in self.fuel.items():
            rec = by_cat.get(cat)
            if rec and rec.words and rec.words <= dw and len(rec.words) / max(len(dw), 1) >= 0.3:
                return {"status": "strong", "entry": rec.entry, "confidence": 0.9, "candidates": [rec.entry],
                        "reason": f"Description matches fuel '{rec.entry['name']}' ({cat})", "intent": "fuel"}
        return None


def row_parts(fm: dict, item: dict) -> dict:
    """ghg / calc / review blocks for a row whose factor was matched from the DB (nothing is calculated here)."""
    from ..config import load
    sk = SCOPE_CODE[fm["scope"]]
    qty, unit, dim = display_quantity(item)
    spend = fm["method"] == "spend"
    ef_method = "spend" if spend else "activity"
    notes, missing, fields, shown_q, shown_u = [], [], {}, qty, unit
    if spend:
        if item.get("amount") is not None:
            fields = {"spent_value": item["amount"], "spent_value_unit": item.get("currency") or load().policy["currency_default"]}
        else:
            missing = ["Amount spent"]
    else:
        status, q2, u2 = _fit(fm["allowed_units"], qty, unit, dim)
        if status == "ok":
            fields = {MAIN_FIELD[sk]: q2, f"{MAIN_FIELD[sk]}_unit": u2}
            shown_q, shown_u = q2, u2
        elif status == "details":
            missing = ["Activity details for this factor - use Edit"]
        else:
            missing = [f"Quantity in {', '.join(fm['allowed_units'])}"]
            notes.append(f"Unit '{unit or item.get('unit') or ''}' does not fit '{fm['name']}' - allowed: {', '.join(fm['allowed_units'])}")
    tax = load().taxonomy.raw
    ghg = {"scope": sk, "category": fm["category"], "subcategory": fm["name"], "scope_label": tax["scope_labels"][sk],
           "category_label": fm["category"], "subcategory_label": fm["name"], "category_id": fm["category_id"], "subcategory_id": fm["id"]}
    calc = {"formula_id": "reviewer_selection" if fields else None, "formula_label": "Matched to the emission factor name - calculated when saved",
            "ef_method": ef_method, "fields": fields, "missing": missing, "notes": notes, "info": [],
            "status": "ok" if fields else "incomplete", "emergent_formula_id": None}
    ref = {"collection": fm["collection"], "id": fm["id"]}
    review = {"factor": ref, "override": {"scope": fm["scope"], "category_id": fm["category_id"], "ef_method": ef_method, "factor": ref, "dynamic": None}}
    return {"ghg": ghg, "calc": calc, "review": review, "quantity": shown_q, "unit": shown_u}
