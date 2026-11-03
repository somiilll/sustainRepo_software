"""Turns stored documents (import lines, installations) into fully traced CBAM results."""
from datetime import date

from ..reference.loader import ANNEX_II_SECTORS, ReferenceData, digits
from . import calc
from .carbon_price import carbon_price_eur_per_t
from .factors import Factors
from .guards import CbamError, bm_scale_warnings
from .lookups import lookup_benchmark, lookup_dv, sector_of
from .periods import quarter_of, resolve_reporting_year


def _d(v) -> date | None:
    if not v:
        return None
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def indirect_in_scope(sector: str | None) -> bool:
    return sector in ("Cement", "Fertilisers")


# ---------------------------------------------------------------- importer: one import line
def compute_import_line(line: dict, ref: ReferenceData, f: Factors) -> dict:
    out: dict = {"steps": [], "warnings": [], "error": None}
    try:
        cn = digits(line["cn_code"])
        sector = line.get("sector") or sector_of(ref, cn)
        if not sector:
            raise CbamError(f"CN {line['cn_code']} is not an Annex I CBAM good")
        imp = _d(line["import_date"])
        basis = line.get("basis", "default")
        year = resolve_reporting_year(imp, basis, _d(line.get("production_date")), sector)
        q = quarter_of(imp)
        mass = float(line["net_mass"])
        factor, cscf = f.factor(year), f.cscf_for(year)
        out.update(sector=sector, reporting_year=year, quarter=q, indirect_in_scope=indirect_in_scope(sector))
        out["steps"].append(calc.Step("Reporting year", f"import {imp.isoformat()}, basis {basis}", year).as_dict())

        if basis == "default":
            if sector == "Electricity":
                ef = line.get("electricity_ef")
                if ef is None:
                    raise CbamError("Electricity default needs the Annex III emission factor (tCO2e/MWh)")
                dv_total, route, src = float(ef), "", "Annex III of 2025/2621 (entered)"
                dv_dir, dv_ind, mu = dv_total, 0.0, 0.0
            else:
                hit = lookup_dv(ref, line.get("country_of_origin"), cn)
                route, src = line.get("route") or hit.route, f"{hit.country_table} / {hit.code}"
                dv_dir = hit.direct if hit.direct is not None else hit.total
                dv_ind = hit.indirect or 0.0
                # Annex II goods count direct emissions only, even where the table also lists indirect.
                dv_total = hit.total if indirect_in_scope(sector) else dv_dir
                mu = f.markup_for(year, sector)
            see = dv_total * (1 + mu)
            see_dir = min(dv_dir * (1 + mu), see)
            see_indir_counted = see - see_dir  # published totals are rounded; the remainder is the indirect part
            see_indir_info = 0.0 if indirect_in_scope(sector) else dv_ind * (1 + mu)
            out["steps"] += [
                calc.Step("Default value (total)", src, dv_total, "tCO2e/t").as_dict(),
                calc.Step("Mark-up", f"{year}, {sector}", mu).as_dict(),
                calc.Step("SEE (default)", f"{dv_total} x (1 + {mu})", see, "tCO2e/t").as_dict(),
            ]
            if sector == "Electricity":
                sefa, bm, bm_ind = 0.0, None, ""
            else:
                bm, bm_ind = lookup_benchmark(ref, cn, "B", route or None, year)
                calc.check_pairing("default", "B", False)
                s = calc.sefa_default(bm, factor, cscf)
                sefa = s.value
                out["steps"] += [st.as_dict() for st in s.steps]
            out.update(dv_total=dv_total, markup=mu, route=route, bm=bm, bm_column="B", bm_indicator=bm_ind)
        else:
            see_dir = float(line.get("see_direct") or 0)
            see_indir = float(line.get("see_indirect") or 0)
            see = see_dir + (see_indir if indirect_in_scope(sector) else 0.0)
            see_indir_counted = see_indir if indirect_in_scope(sector) else 0.0
            see_indir_info = 0.0 if indirect_in_scope(sector) else see_indir
            dv_dir = dv_ind = None
            sefa = 0.0 if sector == "Electricity" else float(line.get("sefa") or 0)
            out["steps"] += [
                calc.Step("SEE (verified actual)", f"{see_dir} + {'%s' % see_indir if indirect_in_scope(sector) else '0 (indirect out of scope)'}",
                          see, "tCO2e/t").as_dict(),
                calc.Step("SEFA (from operator report)", "Column A + precursors, per verified report", sefa, "tCO2e/t").as_dict(),
            ]
            out.update(markup=0.0, route=line.get("route", ""), bm_column="A")

        if dv_dir is None and sector != "Electricity":  # actual line: keep the default for comparison
            try:
                hit = lookup_dv(ref, line.get("country_of_origin"), cn)
                dv_dir, dv_ind = (hit.direct if hit.direct is not None else hit.total), (hit.indirect or 0.0)
            except CbamError:
                pass
        rp = f.reference_price(imp.year)
        cp = carbon_price_eur_per_t(line.get("carbon_price"), line.get("carbon_price_paid"))
        out["warnings"] += cp.warnings
        secpp = cp.value
        cert = calc.certificates(see, sefa, mass, secpp, rp)
        out["steps"] += [st.as_dict() for st in cp.steps + cert.steps]
        out["warnings"] += cert.warnings
        price = f.price_or_average(imp.year, q)
        out.update(
            see=see, sefa=sefa, cbam_factor=factor, cscf=cscf,
            see_direct=see_dir, see_indirect_counted=see_indir_counted, see_indirect_info=see_indir_info,
            dv_direct=dv_dir, dv_indirect=dv_ind,
            emb_direct=see_dir * mass, emb_indirect_counted=see_indir_counted * mass, emb_indirect_info=see_indir_info * mass,
            secpp=secpp, markup_cost=(see - see / (1 + mu)) * mass if basis == "default" else 0.0,
            embedded=see * mass, faa=sefa * mass,
            cp_deduction=(secpp / rp * mass) if (secpp and rp) else 0.0,
            certificates=cert.value, floored=cert.floored, price=price,
            price_is_estimate=f.price(imp.year, q) is None,
            cost=(cert.value * price) if price else None,
        )
    except (CbamError, KeyError, ValueError) as e:
        out["error"] = str(e)
    return out


# ---------------------------------------------------------------- operator: one installation
def _stream_emissions(s: dict) -> float:
    total = 0.0
    for m in s.get("months", []):
        qty = m.get("qty")
        if qty in (None, ""):
            continue
        ncv = m.get("ncv") if m.get("ncv_override") else s.get("ncv")
        total += calc.source_stream_emissions(s.get("kind", "combustion"), float(qty), ncv, s.get("ef"),
                                              s.get("of", 1.0), s.get("carbon_content"))
    return total


def _precursor_inputs(precs: list[dict], year: int, ref: ReferenceData, f: Factors) -> tuple[list, list, list]:
    inputs, rows, warnings = [], [], []
    for p in precs:
        cn = digits(p.get("cn_code", ""))
        psector = p.get("sector") or sector_of(ref, cn) or ""
        row = {**p, "sector": psector}
        if p.get("origin_eu"):  # EU / Annex III origin -> counts as zero (still reported)
            see_dir = see_indir = sefa = 0.0
            row["note"] = "EU / exempt origin: SEE and SEFA count as zero"
        elif p.get("basis") == "verified":
            see_dir, see_indir, sefa = float(p.get("see_direct") or 0), float(p.get("see_indirect") or 0), float(p.get("sefa") or 0)
        else:
            hit = lookup_dv(ref, p.get("country") or None, cn, precursor=True)
            mu = f.markup_for(year, psector)
            if hit.direct is not None:
                see_dir, see_indir = hit.direct * (1 + mu), (hit.indirect or 0) * (1 + mu)
            else:
                see_dir, see_indir = hit.total * (1 + mu), 0.0
            bm, _ = lookup_benchmark(ref, cn, "B", p.get("route") or hit.route or None, year)
            sefa = calc.sefa_default(bm, f.factor(year), f.cscf_for(year)).value
            row.update(default_source=f"{hit.country_table} / {hit.code}", markup=mu, bm_b=bm)
        row.update(see_direct_used=see_dir, see_indirect_used=see_indir, sefa_used=sefa)
        rows.append(row)
        inputs.append(calc.PrecursorInput(p.get("name", cn), float(p.get("mass_t") or 0), see_dir, see_indir,
                                          psector in ANNEX_II_SECTORS, sefa))
    return inputs, rows, warnings


def electricity_mwh(proc: dict) -> float:
    """Sub-metered MWh, or a share of the installation's metered total under an allocation key."""
    if (proc.get("el_method") or "submetering") == "allocation":
        share = float(proc.get("el_alloc_share") or 0)
        if not 0 <= share <= 1:
            raise CbamError("Electricity allocation share is a fraction between 0 and 1 (0.4 = 40%)")
        return float(proc.get("el_total_mwh") or 0) * share
    return float(proc.get("el_mwh") or 0)


def compute_installation(inst: dict, ref: ReferenceData, f: Factors) -> dict:
    year = int(inst.get("reporting_year", 2026))
    results = []
    for proc in inst.get("processes", []):
        pr: dict = {"process_id": proc["id"], "name": proc.get("name"), "cn_code": proc.get("cn_code"),
                    "warnings": [], "error": None}
        try:
            cn = digits(proc["cn_code"])
            sector = proc.get("sector") or sector_of(ref, cn)
            al = float(proc.get("activity_level_t") or 0)
            streams = [s for s in inst.get("source_streams", []) if s.get("process_id") == proc["id"]]
            dir_em = sum(_stream_emissions(s) for s in streams) + float(proc.get("other_direct_em") or 0)
            att = calc.attributed_direct(dir_em, *(float(proc.get(k) or 0) for k in
                                         ("heat_imp_tj", "ef_heat_imp", "heat_exp_tj", "ef_heat_exp", "wg_imp_tj", "wg_exp_tj", "el_prod_em")))
            el_mwh = electricity_mwh(proc)
            indir = calc.attributed_indirect(el_mwh, float(proc.get("ef_el") or 0))
            precs = [p for p in inst.get("precursors", []) if p.get("process_id") == proc["id"]]
            p_inputs, p_rows, _ = _precursor_inputs(precs, year, ref, f)
            see = calc.specific_embedded_emissions(att.value, indir, al, indirect_in_scope(sector), p_inputs)
            bm_a, bm_ind = lookup_benchmark(ref, cn, "A", proc.get("route") or None, year)
            try:
                bm_b, _ = lookup_benchmark(ref, cn, "B", proc.get("route") or None, year)
            except CbamError:
                bm_b = None
            calc.check_pairing("actual", "A", True)
            sefa = calc.sefa_actual(bm_a, f.factor(year), f.cscf_for(year), al, p_inputs)
            net = max(0.0, see.value - sefa.value)
            pr.update(
                sector=sector, activity_level_t=al, stream_emissions=dir_em, attr_direct=att.value,
                attr_indirect_monitored=indir, indirect_in_scope=indirect_in_scope(sector), el_mwh=el_mwh,
                el_method=proc.get("el_method") or "submetering",
                see_direct=see.see_dir, see_indirect=see.see_indir, see=see.value,
                bm_a=bm_a, bm_indicator=bm_ind, bm_b=bm_b, sefa=sefa.value, net_per_t=net,
                attribution_steps=[s.as_dict() for s in att.steps],
                see_steps=[s.as_dict() for s in see.steps], sefa_steps=[s.as_dict() for s in sefa.steps],
                precursors=p_rows,
                streams=[{"id": s["id"], "name": s.get("name"), "emissions": _stream_emissions(s)} for s in streams],
            )
            pr["warnings"] += att.warnings + see.warnings + bm_scale_warnings(bm_a, bm_b)
        except (CbamError, KeyError, ValueError, ZeroDivisionError) as e:
            pr["error"] = str(e)
        results.append(pr)
    return {"reporting_year": year, "processes": results}
