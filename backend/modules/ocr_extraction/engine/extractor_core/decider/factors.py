"""DB-first matching: the line's description is compared with the real emission-factor names (scope3_ef, fuel_database)
before the 155-activity taxonomy is consulted. The category always comes from the factor's own table row.

Intent decides which factors may compete: waste words beat material words (copper waste -> C5 waste factors, never the
copper product), freight words -> C4/C9, travel -> C6/C7, everything else -> C1/C2 purchases.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

from ..fields import display_quantity

STOP = {"of", "and", "the", "for", "to", "in", "with", "from", "a", "an", "per", "by", "on", "at", "or", "as", "used", "type", "item", "other", "nos", "no",
        "service", "services", "charge", "charges", "cost", "fee", "fees"}
GENERIC_WASTE = {"wast", "scrap", "ewast"}
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


DOMAIN_CATS = {"purchased_goods": ("C1",), "purchased_services": ("C1",), "capital_goods": ("C2",), "waste": ("C5",), "freight": ("C4", "C9"),
               "business_travel": ("C6",), "employee_commute": ("C7",), "leased_assets": ("C8", "C13"), "downstream_value_chain": ("C10", "C11", "C12", "C14", "C15")}


@lru_cache(maxsize=1)
def sector_map() -> tuple[dict, dict]:
    d = json.loads((Path(__file__).resolve().parents[3] / "mappings" / "factor_sectors.json").read_text(encoding="utf-8"))
    return d["sectors"], d["map"]


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
        self._by_id = {e["id"]: e for e in entries}
        for e in entries:
            if e["collection"] == "scope3_ef":
                m = re.match(r"C(\d+)\b", e["category"])
                if m:
                    self.scope3.setdefault((e["name"].lower(), e["method"]), {})[f"C{m.group(1)}"] = Rec(e)
            else:
                self.fuel.setdefault((e["name"].lower(), "activity"), {})[e["category"]] = Rec(e)

    def candidates(self, item: dict, domain: str) -> list[dict]:
        """Every factor an item of this domain could use and that its data can feed (spend needs an amount, a physical factor needs a quantity)."""
        prefs = DOMAIN_CATS.get(domain)
        if not prefs:
            return []
        qty, unit, dim = display_quantity(item)
        entries = [r.entry for r in self._pool(self.scope3, prefs, qty, unit, dim, item.get("amount"))]
        if item.get("amount") is not None and qty is None and not item.get("distance_km"):
            entries = [e for e in entries if e["method"] == "spend"] or entries      # money only: the spend-based factor is the one that can be calculated
        return entries

    @staticmethod
    def sector_of(entry: dict) -> str | None:
        return sector_map()[1].get(entry["name"].strip().lower())

    @staticmethod
    def rank(item: dict, entries: list[dict], extra: str = "") -> list[dict]:
        """Closest name first (most shared words, fewest unrelated words); at equal closeness the physical (activity) factor beats the spend one."""
        dw = words(item_text(item) + " " + extra)

        def key(e):
            fw = name_parts(e["name"])[0]
            common = len(fw & dw)
            return (-common, len(fw) - common, 0 if e["method"] == "activity" else 1)
        return sorted(entries, key=key)

    @staticmethod
    def _core_words(entry: dict) -> frozenset:
        return frozenset(w for w in name_parts(re.sub(r"\([^)]*\)", " ", entry["name"]))[0] if not any(c.isdigit() for c in w))

    @classmethod
    def variants(cls, entry: dict, entries: list[dict], text: str) -> tuple[list[dict], bool]:
        """Factors whose names are almost the same words as `entry` (same category and method) differ only in a few words (a treatment,
        a fuel, a class, 'Recycled'...). Returns (siblings, unresolved): unresolved when the row's own wording names none of the picked
        factor's distinguishing words, so the choice between the variants is a guess."""
        fw = cls._core_words(entry)
        sibs = []
        for e in entries:
            if e["id"] == entry["id"] or e["name"] == entry["name"] or e["method"] != entry["method"] or e["category"] != entry["category"]:
                continue
            ow = cls._core_words(e)
            core, both_sides = len(fw & ow), bool(fw - ow) and bool(ow - fw)
            if core >= (2 if both_sides else 1) and len(fw ^ ow) <= 4:
                sibs.append(e)
        if not sibs:
            return [], False
        others = frozenset().union(*(cls._core_words(x) for x in sibs))
        return sibs, not ((fw - others) & words(text))

    def entry_by_id(self, factor_id: str) -> dict | None:
        return self._by_id.get(factor_id)

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
        if waste:
            dw = dw - GENERIC_WASTE
            fw = fw - GENERIC_WASTE
            if not (dw & TREATMENT):
                fw = fw - TREATMENT      # 'copper waste' names no disposal route: Landfilled/Recycled/Combusted all stay candidates
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
        return {"rec": rec, "common": common, "contain": contain, "cover": cover, "exact": fw == dw, "in_range": in_range,
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
        if scored[0]["common"] >= 2:
            scored = [s for s in scored if s["common"] >= 2]
        best = scored[0]
        nw = len(best["rec"].words)
        conf = 1.0 if best["exact"] else None
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
            if rec and rec.words and rec.words == dw:
                return {"status": "strong", "entry": rec.entry, "confidence": 1.0, "candidates": [rec.entry],
                        "reason": f"Description matches fuel '{rec.entry['name']}' ({cat})", "intent": "fuel"}
        return None


QTY_VARS = {"activity_value", "qty", "qty_energy"}
INPUT_LABEL = {"qty_travelled": "Weight of goods carried", "km_travelled": "Distance travelled (km)", "qty_passenger": "Number of passengers",
               "qty_room": "Number of rooms", "qty_nights": "Number of nights", "qty_days_travelled": "Days travelled", "activity_value": "Quantity"}


def bind_inputs(spec: list[dict], item: dict, allowed: list | None = None) -> dict:
    """Maps what was extracted (quantity, weight, distance, passengers, rooms, nights) onto the inputs the factor's formula
    declares. {'fields': {var: value, var_unit: unit}, 'missing': [labels], 'notes': [...]}; nothing is guessed."""
    from ..fields import _value_for
    qty, unit, dim = display_quantity(item)
    fields, missing, notes = {}, [], []
    room_nights = str(item.get("unit") or "").lower().replace(" ", "_") == "room_nights"
    for inp in spec:
        var = inp["variable"]
        v = u = None
        if var in QTY_VARS:
            if allowed:
                st, q2, u2 = _fit(allowed, qty, unit, dim)
                if st == "ok":
                    v, u = q2, u2
                elif qty is not None:
                    notes.append(f"Unit '{unit or item.get('unit') or ''}' does not fit this factor - allowed: {', '.join(allowed)}")
            elif qty is not None and unit:
                v, u = qty, unit
        elif room_nights and var in ("qty_room", "qty_nights"):
            v, u = (1, "Nos") if var == "qty_room" else (item.get("quantity"), "nights")
        else:
            v, u = _value_for(var, {"default": inp.get("default")}, item, qty, unit, dim)
            if v is None and var == "qty_passenger" and dim == "count" and qty:
                v, u = qty, "Nos"
        if v is None:
            if inp.get("required", True):
                missing.append(INPUT_LABEL.get(var, var))
            continue
        fields[var], fields[f"{var}_unit"] = v, u or inp.get("expected_unit") or ""
    return {"fields": fields, "missing": missing, "notes": notes}


def clear_descriptor_notes(item: dict, factor_name: str) -> None:
    """'Could not confirm what 8000 means' is withdrawn when 8000 is demonstrably a size class written in the matched factor's name."""
    _, ranges = name_parts(factor_name)
    notes = item.get("read_notes") or []
    if not ranges or not notes:
        return
    keep = []
    for n in notes:
        m = re.search(r"what '([\d.,]+)' means", n)
        try:
            v = _f(m.group(1)) if m else None
        except ValueError:
            v = None
        if v is not None and any(lo <= v <= hi for lo, hi, _ in ranges):
            continue
        keep.append(n)
    if len(keep) != len(notes):
        item["read_notes"] = keep
        if not keep and item.get("read_state") == "needs_attention":
            item["read_state"], item["line_confidence"] = "extracted", 0.97


def row_parts(fm: dict, item: dict, spec: list[dict] | None = None) -> dict:
    """ghg / calc / review blocks for a row whose factor was matched from the DB (nothing is calculated here).
    `spec` = the inputs the factor's formula declares as required (from the calculation engine's decision tree)."""
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
    elif spec and sk == "scope_3":
        b = bind_inputs(spec, item, fm["allowed_units"])
        fields, missing, notes = ({} if b["missing"] else b["fields"]), b["missing"], b["notes"]
        main = next((v for v in ("activity_value", "qty_travelled") if f"{v}_unit" in b["fields"]), None)
        if main:
            shown_q, shown_u = b["fields"][main], b["fields"][f"{main}_unit"]
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
    required = [i["variable"] for i in spec] if spec and not spend else None
    calc = {"formula_id": "reviewer_selection" if fields else None, "formula_label": "Matched to the emission factor name - calculated when saved",
            "ef_method": ef_method, "fields": fields, "missing": missing, "notes": notes, "info": [],
            "status": "ok" if fields else "incomplete", "emergent_formula_id": None, "required_inputs": required}
    ref = {"collection": fm["collection"], "id": fm["id"]}
    review = {"factor": ref, "override": {"scope": fm["scope"], "category_id": fm["category_id"], "ef_method": ef_method, "factor": ref, "dynamic": None}}
    return {"ghg": ghg, "calc": calc, "review": review, "quantity": shown_q, "unit": shown_u}
