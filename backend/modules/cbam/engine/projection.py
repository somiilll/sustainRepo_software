"""Phase-in projection: the same goods re-priced for each year as free allocation phases out."""
from .factors import Factors

YEARS = range(2026, 2035)


def line_certificates_in(c: dict, mass: float, basis: str, f: Factors, year: int) -> float:
    """Certificates a computed line would need if imported in `year` (SEE mark-up and CBAM factor of that year)."""
    see = c["see"] / (1 + c["markup"]) * (1 + f.markup_for(year, c["sector"])) if basis == "default" else c["see"]
    sefa = c["sefa"] / c["cbam_factor"] * f.factor(year) if c["cbam_factor"] else 0.0
    cp = c.get("secpp") or 0.0
    rp = f.reference_price(2026) or 0.0
    return max(0.0, see - sefa - (cp / rp if rp else 0.0)) * mass


def project(lines: list[dict], f: Factors, price_eur: float | None = None, price_growth: float = 0.0,
            volume_growth: float = 0.0) -> list[dict]:
    """lines: [{"calc": {...}, "net_mass": t, "basis": ...}] without errors. Prices default to the 2026 average."""
    base_price = price_eur if price_eur is not None else (f.reference_price(2026) or 0.0)
    out = []
    for y in YEARS:
        k = y - 2026
        scale = (1 + volume_growth) ** k
        certs = sum(line_certificates_in(l["calc"], float(l["net_mass"]) * scale, l.get("basis", "default"), f, y) for l in lines)
        price = base_price * (1 + price_growth) ** k
        out.append({"year": y, "cbam_factor": f.factor(y), "certificates": certs, "price": price, "cost": certs * price,
                    "mass": sum(float(l["net_mass"]) for l in lines) * scale})
    return out
