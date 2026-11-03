"""Shared dependencies: per-org factors, reference data, aggregation helpers."""
from collections import defaultdict

from ..core import db
from ..engine.factors import Factors
from ..engine.pipeline import compute_import_line
from ..engine.projection import project
from ..reference.countries import iso_of
from ..reference.loader import load_reference


async def get_factors(org_id: str) -> Factors:
    doc = await db.col("settings").find_one({"org_id": org_id, "id": "factors"})
    return Factors.from_dict(doc["data"] if doc else None)


async def save_factors(org_id: str, f: Factors, user: str) -> None:
    f.validate()
    before = await db.col("settings").find_one({"org_id": org_id, "id": "factors"})
    await db.col("settings").update_one({"org_id": org_id, "id": "factors"},
                                        {"$set": {"data": f.to_dict(), "updated_at": db.now()}}, upsert=True)
    await db.audit(org_id, user, "settings", "factors", "update", db.clean(before), f.to_dict())


async def get_grid_ef(org_id: str) -> dict:
    doc = await db.col("settings").find_one({"org_id": org_id, "id": "grid_ef"})
    return doc["data"] if doc else {}


async def computed_lines(org_id: str, year: int | None = None) -> tuple[list[dict], Factors]:
    ref, f = load_reference(), await get_factors(org_id)
    lines = await db.list_docs("import_lines", org_id, sort="import_date")
    out = []
    for ln in lines:
        if year and not str(ln.get("import_date", "")).startswith(str(year)):
            continue
        out.append({**ln, "calc": compute_import_line(ln, ref, f)})
    return out, f


FILTER_KEYS = ("sector", "country", "supplier", "quarter", "basis")


def filter_lines(lines: list[dict], flt: dict) -> list[dict]:
    """Dashboard filters, applied before aggregation. Values may be comma-separated lists."""
    def want(key):
        v = flt.get(key)
        return set(str(v).split(",")) if v else None

    sec, ctry, sup, qtr, basis = (want(k) for k in FILTER_KEYS)
    out = []
    for l in lines:
        c = l["calc"]
        if sec and (c.get("sector") or l.get("sector")) not in sec:
            continue
        if ctry and l.get("country_of_origin") not in ctry:
            continue
        if sup and (l.get("supplier_id") or "none") not in sup:
            continue
        if qtr and f"Q{c.get('quarter')}" not in qtr:
            continue
        if basis and l.get("basis", "default") not in basis:
            continue
        out.append(l)
    return out


def _split_row():
    return {"direct": 0.0, "indirect": 0.0, "indirect_info": 0.0, "embedded": 0.0, "mass": 0.0}


def _add_split(row: dict, l: dict) -> None:
    c = l["calc"]
    row["direct"] += c.get("emb_direct") or 0
    row["indirect"] += c.get("emb_indirect_counted") or 0
    row["indirect_info"] += c.get("emb_indirect_info") or 0
    row["embedded"] += c["embedded"]
    row["mass"] += float(l["net_mass"])


def analytics(lines: list[dict], f: Factors, suppliers: list[dict], requests: list[dict]) -> dict:
    """Direct/indirect split, geography and supplier views over computed, filtered lines."""
    ok = [l for l in lines if not l["calc"]["error"]]
    sup_by_id = {s["id"]: s for s in suppliers}
    req_by_sup: dict[str, dict] = {}
    for r in sorted(requests, key=lambda r: r.get("updated_at", "")):
        req_by_sup[r["supplier_id"]] = r
    split = {"total": _split_row(), "by_sector": defaultdict(_split_row), "by_quarter": defaultdict(_split_row),
             "by_cn": defaultdict(lambda: {**_split_row(), "sector": "", "description": "", "see_direct": 0.0,
                                           "see_indirect": 0.0, "dv_direct": None, "dv_indirect": None, "basis": set()})}
    country = defaultdict(lambda: {"mass": 0.0, "embedded": 0.0, "direct": 0.0, "indirect": 0.0, "certificates": 0.0,
                                   "cost": 0.0, "lines": 0, "actual_mass": 0.0, "suppliers": set()})
    matrix = defaultdict(float)
    matrix_q = defaultdict(float)
    supplier = defaultdict(lambda: {"mass": 0.0, "embedded": 0.0, "certificates": 0.0, "cost": 0.0, "actual_mass": 0.0, "lines": 0})
    savings = []
    for l in ok:
        c, mass = l["calc"], float(l["net_mass"])
        _add_split(split["total"], l)
        _add_split(split["by_sector"][c["sector"]], l)
        _add_split(split["by_quarter"][f"Q{c['quarter']}"], l)
        cn = split["by_cn"][l["cn_code"]]
        _add_split(cn, l)
        cn.update(sector=c["sector"], description=l.get("description", ""), dv_direct=c.get("dv_direct"),
                  dv_indirect=c.get("dv_indirect"))
        cn["basis"].add(l.get("basis", "default"))
        name = l.get("country_of_origin") or "Unknown"
        k = country[name]
        k["mass"] += mass; k["embedded"] += c["embedded"]; k["direct"] += c.get("emb_direct") or 0
        k["indirect"] += c.get("emb_indirect_counted") or 0; k["certificates"] += c["certificates"]
        k["cost"] += c.get("cost") or 0; k["lines"] += 1
        k["actual_mass"] += mass if l.get("basis") == "actual" else 0
        k["suppliers"].add(l.get("supplier_id") or l.get("installation_name") or "unknown")
        matrix[(name, c["sector"])] += c["embedded"]
        matrix_q[(name, f"Q{c['quarter']}")] += c["embedded"]
        sid = l.get("supplier_id") or "none"
        s = supplier[sid]
        s["mass"] += mass; s["embedded"] += c["embedded"]; s["certificates"] += c["certificates"]
        s["cost"] += c.get("cost") or 0; s["lines"] += 1
        s["actual_mass"] += mass if l.get("basis") == "actual" else 0
        s.setdefault("countries", set()).add(name)
        s.setdefault("installations", set()).add(l.get("installation_name") or "")
        s.setdefault("sectors", set()).add(c["sector"])
        if l.get("basis", "default") == "default" and c.get("markup") and c.get("price"):
            # Lower bound: verified data removes at least the default mark-up (capped at what is actually charged).
            avoided_t = min(c.get("markup_cost") or 0, c["certificates"])
            if avoided_t > 0:
                savings.append({"line_id": l["id"], "cn_code": l["cn_code"], "country": name, "supplier_id": sid,
                                "supplier_name": sup_by_id.get(sid, {}).get("name", l.get("installation_name") or "Unknown supplier"),
                                "avoided_certificates": avoided_t, "avoided_eur": avoided_t * c["price"],
                                "markup": c["markup"]})
    for row in split["by_cn"].values():
        row["see_direct"] = row["direct"] / row["mass"] if row["mass"] else 0
        row["see_indirect"] = row["indirect"] / row["mass"] if row["mass"] else 0
        row["basis"] = sorted(row["basis"])
    tot = split["total"]
    charged = tot["direct"] + tot["indirect"]
    by_country = []
    for name, k in country.items():
        by_country.append({"country": name, **iso_of(name), **{x: v for x, v in k.items() if x != "suppliers"},
                           "suppliers": len(k["suppliers"]), "intensity": k["embedded"] / k["mass"] if k["mass"] else 0,
                           "actual_share": k["actual_mass"] / k["mass"] if k["mass"] else 0})
    by_supplier = []
    for sid, s in supplier.items():
        info = sup_by_id.get(sid, {})
        req = req_by_sup.get(sid)
        by_supplier.append({
            "supplier_id": sid, "name": info.get("name") or next(iter(s["installations"] - {""}), "") or "Unassigned",
            "email": info.get("email", ""), "country": info.get("country") or ", ".join(sorted(s["countries"])),
            "sectors": sorted(s["sectors"]), "mass": s["mass"], "embedded": s["embedded"], "certificates": s["certificates"],
            "cost": s["cost"], "lines": s["lines"], "intensity": s["embedded"] / s["mass"] if s["mass"] else 0,
            "actual_share": s["actual_mass"] / s["mass"] if s["mass"] else 0,
            "request_id": req["id"] if req else None, "request_status": req["status"] if req else None,
            "last_reminded": (req or {}).get("last_reminded"), "known": bool(info)})
    return {
        "split": {
            "total": {**tot, "indirect_share": tot["indirect"] / charged if charged else 0},
            "by_sector": [{"sector": k, **v} for k, v in split["by_sector"].items()],
            "by_quarter": [{"quarter": k, **v} for k, v in sorted(split["by_quarter"].items())],
            "by_cn": sorted([{"cn_code": k, **v} for k, v in split["by_cn"].items()], key=lambda r: -r["embedded"]),
        },
        "by_country": sorted(by_country, key=lambda r: -r["embedded"]),
        "country_sector": [{"country": a, "sector": b, "embedded": v} for (a, b), v in matrix.items()],
        "country_quarter": [{"country": a, "quarter": b, "embedded": v} for (a, b), v in matrix_q.items()],
        "by_supplier": sorted(by_supplier, key=lambda r: -r["certificates"]),
        "savings": sorted(savings, key=lambda r: -r["avoided_eur"])[:8],
    }


def summarise(lines: list[dict], f: Factors, year: int) -> dict:
    ok = [l for l in lines if not l["calc"]["error"]]
    tot = lambda k: sum((l["calc"].get(k) or 0) for l in ok)
    mass_dm = sum(float(l["net_mass"]) for l in lines
                  if (l["calc"].get("sector") or l.get("sector")) not in ("Electricity", "Hydrogen"))
    always_in = any((l["calc"].get("sector")) in ("Electricity", "Hydrogen") for l in lines)
    actual_mass = sum(float(l["net_mass"]) for l in ok if l.get("basis") == "actual")
    all_mass = sum(float(l["net_mass"]) for l in ok) or 0
    by_q = defaultdict(lambda: {"embedded": 0.0, "faa": 0.0, "certificates": 0.0, "cost": 0.0})
    by_sector = defaultdict(lambda: {"mass": 0.0, "embedded": 0.0, "certificates": 0.0, "cost": 0.0})
    by_cn = defaultdict(lambda: {"description": "", "certificates": 0.0, "embedded": 0.0, "sector": ""})
    basis_split = {"default": 0.0, "actual": 0.0}
    for l in ok:
        c = l["calc"]
        q = by_q[f"Q{c['quarter']}"]
        for k in ("embedded", "faa", "certificates"):
            q[k] += c[k]
        q["cost"] += c.get("cost") or 0
        s = by_sector[c["sector"]]
        s["mass"] += float(l["net_mass"]); s["embedded"] += c["embedded"]; s["certificates"] += c["certificates"]; s["cost"] += c.get("cost") or 0
        k = l["cn_code"]
        by_cn[k]["certificates"] += c["certificates"]; by_cn[k]["embedded"] += c["embedded"]
        by_cn[k]["description"] = l.get("description", ""); by_cn[k]["sector"] = c["sector"]
        basis_split[l.get("basis", "default")] += c["embedded"]
    certs = tot("certificates")
    # Phase-in projection: same lines and SEE, factor (and default mark-up) of each future year.
    projection = project(ok, f)
    return {
        "year": year, "lines": len(lines), "lines_with_errors": len(lines) - len(ok),
        "net_mass": all_mass, "deminimis_mass": mass_dm,
        "obligated": mass_dm > f.deminimis_t or always_in, "deminimis_t": f.deminimis_t,
        "embedded": tot("embedded"), "faa": tot("faa"), "cp_deduction": tot("cp_deduction"),
        "certificates": certs, "certificates_whole": int(-(-certs // 1)), "cost": tot("cost"),
        "avg_cost_per_t": (tot("cost") / all_mass) if all_mass else 0,
        "penalty_exposure": int(-(-certs // 1)) * f.penalty_eur_per_t,
        "actual_coverage": (actual_mass / all_mass) if all_mass else 0,
        "by_quarter": [{"quarter": k, **v} for k, v in sorted(by_q.items())],
        "by_sector": [{"sector": k, **v} for k, v in by_sector.items()],
        "by_cn": sorted([{"cn_code": k, **v} for k, v in by_cn.items()], key=lambda r: -r["certificates"]),
        "basis_split": basis_split, "projection": projection,
        "floored_lines": sum(1 for l in ok if l["calc"].get("floored")),
        "missing_origin": sum(1 for l in lines if not l.get("country_of_origin")),
        "awaiting_supplier": sum(1 for l in lines if l.get("status") == "Awaiting supplier"),
        "warning_lines": sum(1 for l in ok if l["calc"].get("warnings")),
    }
