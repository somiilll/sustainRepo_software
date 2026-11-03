"""Carbon price effectively paid in the country of origin (Art 9), converted to EUR per tonne of goods."""
from .calc import Result, Step
from .guards import CbamError

# Instruments that count as a "carbon price" under Art 3(29): a tax, levy, fee or emission allowance
# under a greenhouse gas trading system. Voluntary credits / offsets do not.
ELIGIBLE = {"carbon_tax": "Carbon tax / levy / fee", "ets": "Emissions trading system allowances"}
NOT_ELIGIBLE = {"voluntary_credit": "Voluntary carbon credits / offsets"}
UNDETERMINED_SCHEMES = ("ccts",)  # India's Carbon Credit Trading Scheme: implementing act on carbon price still a draft


def carbon_price_eur_per_t(cp: dict | None, legacy_eur_per_t=None) -> Result:
    """SECPP in EUR per tonne of goods = (price paid - rebates/compensation) x FX to EUR."""
    if not cp:
        v = float(legacy_eur_per_t or 0)
        return Result(v, [Step("Carbon price paid", "entered in EUR per tonne", v, "EUR/t")] if v else [])
    kind = cp.get("type", "carbon_tax")
    if kind in NOT_ELIGIBLE:
        raise CbamError(f"{NOT_ELIGIBLE[kind]} are not a carbon price under Art 3(29) of Reg 2023/956 and cannot be deducted.")
    if kind not in ELIGIBLE:
        raise CbamError(f"Unknown carbon price type '{kind}'")
    amount, rebate = float(cp.get("amount_per_t") or 0), float(cp.get("rebate_per_t") or 0)
    fx = float(cp.get("fx_to_eur") or (1.0 if cp.get("currency", "EUR") == "EUR" else 0))
    if amount < 0 or rebate < 0:
        raise CbamError("Carbon price and rebates must be non-negative")
    if fx <= 0:
        raise CbamError(f"Enter the exchange rate from {cp.get('currency')} to EUR")
    net_local = max(0.0, amount - rebate)
    v = net_local * fx
    r = Result(v, [Step("Carbon price paid (net of rebates)", f"({amount} - {rebate}) {cp.get('currency', 'EUR')}/t", net_local),
                   Step("SECPP in EUR", f"x FX {fx}", v, "EUR/t")])
    if any(s in str(cp.get("scheme", "")).lower() for s in UNDETERMINED_SCHEMES):
        r.warnings.append("India CCTS: whether it counts as a carbon price is undetermined until the Commission's "
                          "implementing act is adopted - deduction is provisional.")
    if not cp.get("evidence"):
        r.warnings.append("Carbon price paid needs documentary evidence (proof of payment and any rebates).")
    return r
