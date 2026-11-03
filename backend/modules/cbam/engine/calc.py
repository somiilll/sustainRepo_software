"""Core CBAM equations. Pure functions: numbers in, numbers + trace out.

References: Methodology Act 2025/2547 Annex III (Eq. 53-56); Free Allocation Act 2025/2620 Annex
(Eq. 1-6); Guidance 1 s.2.4.2 (certificate formula).
"""
from dataclasses import dataclass, field

from .guards import CbamError, precursor_mass_hint, require_fraction, require_non_negative

EF_NATURAL_GAS = 56.1  # t CO2 / TJ, point G of Annex II Methodology Act
WG_CORR = 0.667


@dataclass
class Step:
    label: str
    formula: str
    value: float
    unit: str = ""

    def as_dict(self):
        return {"label": self.label, "formula": self.formula, "value": round(self.value, 6), "unit": self.unit}


@dataclass
class Result:
    value: float
    steps: list[Step] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------- installation side
def source_stream_emissions(kind: str, quantity: float, ncv: float | None = None, ef: float | None = None,
                            of: float | None = 1.0, carbon_content: float | None = None) -> float:
    """combustion: AD x NCV x EF x OF; process: AD x EF; mass_balance: AD x C x 44/12 (signed AD)."""
    if kind == "combustion":
        return quantity * (ncv or 0) * (ef or 0) * (of if of is not None else 1.0)
    if kind == "process":
        return quantity * (ef or 0)
    if kind == "mass_balance":
        return quantity * (carbon_content or 0) * 44.0 / 12.0
    raise CbamError(f"Unknown source stream kind {kind}")


def attributed_direct(dir_em: float, heat_imp_tj: float = 0, ef_heat_imp: float = 0, heat_exp_tj: float = 0,
                      ef_heat_exp: float = 0, wg_imp_tj: float = 0, wg_exp_tj: float = 0,
                      el_prod_em: float = 0) -> Result:
    """Eq. 55: max(0; DirEm* + Em_H,imp - Em_H,exp + WG_corr,imp - WG_corr,exp - Em_el,prod)."""
    h_imp = heat_imp_tj * ef_heat_imp
    h_exp = heat_exp_tj * ef_heat_exp
    wg_imp = wg_imp_tj * EF_NATURAL_GAS
    wg_exp = wg_exp_tj * EF_NATURAL_GAS * WG_CORR
    raw = dir_em + h_imp - h_exp + wg_imp - wg_exp - el_prod_em
    r = Result(max(0.0, raw), [
        Step("Directly attributable emissions", "DirEm*", dir_em, "tCO2e"),
        Step("Heat imported", f"{heat_imp_tj} TJ x {ef_heat_imp}", h_imp, "tCO2e"),
        Step("Heat exported", f"-{heat_exp_tj} TJ x {ef_heat_exp}", -h_exp, "tCO2e"),
        Step("Waste gas imported", f"{wg_imp_tj} TJ x {EF_NATURAL_GAS}", wg_imp, "tCO2e"),
        Step("Waste gas exported", f"-{wg_exp_tj} TJ x {EF_NATURAL_GAS} x {WG_CORR}", -wg_exp, "tCO2e"),
        Step("Electricity produced", f"-Em_el,prod", -el_prod_em, "tCO2e"),
        Step("AttrEm_dir", "max(0; sum)", max(0.0, raw), "tCO2e"),
    ])
    if raw < 0:
        r.warnings.append("Attributed direct emissions were negative and floored at zero - check heat/waste-gas exports.")
    return r


def attributed_indirect(el_mwh: float, ef_el: float) -> float:
    """Eq. 56: electricity consumed x emission factor."""
    return el_mwh * ef_el


@dataclass
class PrecursorInput:
    name: str
    mass_t: float
    see_dir: float
    see_indir: float = 0.0
    annex_ii: bool = False  # iron & steel, aluminium, hydrogen precursor -> its indirect never counts
    sefa: float = 0.0


def specific_embedded_emissions(attr_dir: float, attr_indir: float, activity_level_t: float,
                                indirect_in_scope: bool, precursors: list[PrecursorInput]) -> Result:
    """SEE = (AttrEm_dir + AttrEm_indir* + sum M_i x SEE_i) / AL.

    Precursor indirect emissions count only when the precursor is NOT an Annex II good
    (Guidance 2: crossover rules). The good's own indirect counts only when in scope.
    """
    if activity_level_t <= 0:
        raise CbamError("Activity level (tonnes produced) must be > 0")
    pre_dir = sum(p.mass_t * p.see_dir for p in precursors)
    pre_indir = sum(p.mass_t * p.see_indir for p in precursors if not p.annex_ii)
    own_indir = attr_indir if indirect_in_scope else 0.0
    ee_dir = attr_dir + pre_dir
    ee_indir = own_indir + pre_indir
    see_dir, see_indir = ee_dir / activity_level_t, ee_indir / activity_level_t
    r = Result(see_dir + see_indir, [
        Step("Attributed direct", "AttrEm_dir", attr_dir, "tCO2e"),
        Step("Precursors direct", "sum M_i x SEE_i,dir", pre_dir, "tCO2e"),
        Step("Attributed indirect" + ("" if indirect_in_scope else " (not in scope - excluded)"),
             "AttrEm_indir", own_indir, "tCO2e"),
        Step("Precursors indirect (non-Annex II only)", "sum M_i x SEE_i,indir", pre_indir, "tCO2e"),
        Step("SEE direct", f"{ee_dir:,.1f} / {activity_level_t:,.0f}", see_dir, "tCO2e/t"),
        Step("SEE indirect", f"{ee_indir:,.1f} / {activity_level_t:,.0f}", see_indir, "tCO2e/t"),
        Step("SEE total", "SEE_dir + SEE_indir", see_dir + see_indir, "tCO2e/t"),
    ])
    r.warnings += precursor_mass_hint(sum(p.mass_t for p in precursors), activity_level_t)
    r.see_dir, r.see_indir = see_dir, see_indir  # type: ignore[attr-defined]
    return r


# ---------------------------------------------------------------- free allocation adjustment
def sefa_actual(bm_a: float, cbam_factor: float, cscf: float, activity_level_t: float,
                precursors: list[PrecursorInput]) -> Result:
    """Eq. 2 + 4 + 5: SFA = CBAM_y x CSCF_y x BM*; SEFA = SFA + sum (M_i / AL) x SEFA_i."""
    require_fraction("CBAM factor", cbam_factor)
    require_non_negative("CSCF", cscf)
    sfa = cbam_factor * cscf * bm_a
    pre = sum((p.mass_t / activity_level_t) * p.sefa for p in precursors) if activity_level_t else 0.0
    return Result(sfa + pre, [
        Step("Process SFA (Column A)", f"{cbam_factor} x {cscf} x {bm_a}", sfa, "tCO2e/t"),
        Step("Precursors SEFA", "sum m_i x SEFA_i", pre, "tCO2e/t"),
        Step("SEFA", "SFA + precursors", sfa + pre, "tCO2e/t"),
    ])


def sefa_default(bm_b: float, cbam_factor: float, cscf: float) -> Result:
    """Eq. 6: SEFA = CBAM_y x CSCF_y x BM_g (Column B, whole chain - never add precursors)."""
    require_fraction("CBAM factor", cbam_factor)
    v = cbam_factor * cscf * bm_b
    return Result(v, [Step("SEFA (Column B)", f"{cbam_factor} x {cscf} x {bm_b}", v, "tCO2e/t")])


def check_pairing(see_basis: str, bm_column: str, adds_precursor_sefa: bool) -> None:
    """Actual SEE -> Column A (+ precursor SEFA). Default SEE -> Column B only."""
    if see_basis == "default" and (bm_column != "B" or adds_precursor_sefa):
        raise CbamError("Default SEE must be paired with the Column B benchmark only (no precursor SEFA) - "
                        "otherwise free allocation is double counted.")
    if see_basis == "actual" and bm_column != "A":
        raise CbamError("Actual SEE must use the Column A (process) benchmark plus precursor SEFA.")


# ---------------------------------------------------------------- obligation
def certificates(see: float, sefa: float, mass_t: float, secpp_eur_per_t: float = 0.0,
                 reference_price: float | None = None) -> Result:
    """Certificates = max[0; SEE - SEFA - SECPP / RP_CBAM] x M."""
    require_non_negative("mass", mass_t)
    cp = 0.0
    if secpp_eur_per_t:
        if not reference_price:
            raise CbamError("A reference CBAM price is needed to deduct a carbon price paid")
        cp = secpp_eur_per_t / reference_price
    net = see - sefa - cp
    r = Result(max(0.0, net) * mass_t, [
        Step("Specific embedded emissions", "SEE", see, "tCO2e/t"),
        Step("Free allocation adjustment", "- SEFA", -sefa, "tCO2e/t"),
        Step("Carbon price paid", f"- {secpp_eur_per_t} / {reference_price or '-'}", -cp, "tCO2e/t"),
        Step("Net per tonne", "max(0; SEE - SEFA - SECPP/RP)", max(0.0, net), "tCO2e/t"),
        Step("Certificates", f"x {mass_t:,.3f} t", max(0.0, net) * mass_t, "certificates"),
    ])
    if net < 0:
        r.warnings.append(f"Net result {net:.3f} t/t was floored at zero - verify SEFA is not double counted.")
    r.floored = net < 0  # type: ignore[attr-defined]
    return r


def holding_required(cumulative_net_tco2e: float, holding_pct: float = 0.5) -> float:
    """From 2027: certificates held at each quarter end >= 50% of cumulative net emissions YTD."""
    require_fraction("holding_pct", holding_pct)
    return holding_pct * cumulative_net_tco2e
