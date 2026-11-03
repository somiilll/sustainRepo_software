"""Reporting-period rules (Methodology Act 2025/2547, Art. 7 and 13; Guidance 3 s.4.10)."""
from datetime import date

FIRST_YEAR = 2026


def quarter_of(d: date) -> int:
    return (d.month - 1) // 3 + 1


def resolve_reporting_year(import_date: date, basis: str, production_date: date | None = None,
                           sector: str = "") -> int:
    """basis: 'default' | 'actual'.

    - goods imported in 2026 -> 2026, regardless of production date
    - default values for the imported good -> always the import year
    - electricity -> import year
    - actual data + evidence of production date -> production year (never before 2026)
    - otherwise -> import year
    """
    y = import_date.year
    if y <= FIRST_YEAR or basis == "default" or sector == "Electricity" or production_date is None:
        return max(y, FIRST_YEAR)
    return max(production_date.year, FIRST_YEAR)


def precursor_year(complex_good_year: int, precursor_production_date: date | None = None) -> int:
    """Default: production year of the complex good; with evidence: actual year, not before 2026."""
    if precursor_production_date is None:
        return complex_good_year
    return max(precursor_production_date.year, FIRST_YEAR)
