"""Default value and benchmark selection (Guidance 4, Figure 2-4)."""
from dataclasses import dataclass

from ..reference.countries import iso_of
from ..reference.loader import ANNEX_IV, OTHER, BMOption, ReferenceData, digits
from .guards import CbamError

# CN prefixes for goods the DV file does not tabulate.
EXTRA_SECTORS = {"271600": "Electricity", "28041000": "Hydrogen"}


@dataclass
class DVHit:
    country_table: str  # which table the value came from
    code: str
    description: str
    sector: str
    direct: float | None
    indirect: float | None
    total: float
    route: str


def _match(rows, cn: str):
    """Most specific row whose code is a prefix of the CN (or whose TARIC code extends it)."""
    best = None
    for r in rows:
        if cn.startswith(r.code) or (len(r.code) > len(cn) and r.code.startswith(cn)):
            if best is None or len(r.code) > len(best.code):
                best = r
    return best


def sector_of(ref: ReferenceData, cn) -> str | None:
    cn = digits(cn)
    for p, s in EXTRA_SECTORS.items():
        if cn.startswith(p):
            return s
    hit = _match(ref.dv.get(OTHER, []), cn)
    return hit.sector if hit else None


def country_table(ref: ReferenceData, country: str | None) -> str | None:
    """EC table name for an origin as typed in customs data ('Vietnam' -> 'Viet Nam', 'Turkey' -> 'Türkiye')."""
    if not country:
        return None
    if country in ref.dv:
        return country
    iso = iso_of(country)["iso3"]
    if not iso:
        return None
    return next((t for t in ref.dv if iso_of(t)["iso3"] == iso), None)


def lookup_dv(ref: ReferenceData, country: str | None, cn, precursor: bool = False) -> DVHit:
    """Country table first; '-' or missing -> 'Other countries'; unknown-origin precursor -> Annex IV."""
    cn = digits(cn)
    tables = []
    table = country_table(ref, country)
    if table:
        tables.append(table)
    if precursor and not country:
        tables.append(ANNEX_IV)
    tables.append(OTHER)
    for t in tables:
        hit = _match(ref.dv[t], cn)
        if hit and hit.total is not None:
            return DVHit(t, hit.code, hit.description, hit.sector, hit.direct, hit.indirect, hit.total, hit.route)
    raise CbamError(f"No default value found for CN {cn} ({country or 'unknown origin'})")


def _pick(options: list[BMOption], route: str | None, year: int) -> BMOption:
    if not options:
        raise CbamError("No benchmark value in this column")
    if len(options) == 1:
        return options[0]
    band = "(1)" if year <= 2027 else "(2)"
    for o in options:
        if route and o.indicator == route:
            return o
    for o in options:
        if o.indicator == band:
            return o
    raise CbamError(f"Benchmark needs a production route; options: {[o.indicator for o in options]}, given {route!r}")


def lookup_benchmark(ref: ReferenceData, cn, column: str, route: str | None, year: int) -> tuple[float, str]:
    """column 'A' = process-only BM* (actual data); 'B' = whole-chain default BM."""
    code = digits(cn).ljust(8, "0")[:8]
    row = ref.bm.get(code)
    if row is None:  # fall back to the first 8-digit code under this heading
        cands = [r for c, r in ref.bm.items() if c.startswith(digits(cn))]
        if not cands:
            raise CbamError(f"No CBAM benchmark for CN {code}")
        row = cands[0]
    opt = _pick(row.col_a if column == "A" else row.col_b, route, year)
    return opt.value, opt.indicator
