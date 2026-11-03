"""Year-dependent parameters. Fractions are stored as fractions (0.975, never 97.5)."""
from dataclasses import dataclass, field

from .guards import CbamError, require_fraction

CBAM_FACTOR = {2025: 1.0, 2026: 0.975, 2027: 0.95, 2028: 0.90, 2029: 0.775, 2030: 0.515,
               2031: 0.39, 2032: 0.265, 2033: 0.14, 2034: 0.0}


@dataclass
class Factors:
    cbam_factor: dict[int, float] = field(default_factory=lambda: dict(CBAM_FACTOR))
    # Preliminary 1.0 (Guidance 4 Table 2-1); replace with Implementing Decision (EU) 2026/1862 values.
    cscf: dict[int, float] = field(default_factory=lambda: {y: 1.0 for y in range(2026, 2035)})
    markup: dict[int, float] = field(default_factory=lambda: {2026: 0.10, 2027: 0.20, 2028: 0.30})
    markup_fertilisers: float = 0.01
    # (year, quarter) -> EUR per certificate; 2026 quarterly, from 2027 weekly (enter period average).
    prices: dict[str, float] = field(default_factory=lambda: {"2026-Q1": 75.36, "2026-Q2": 75.28, "2026-Q3": 82.32})
    deminimis_t: float = 50.0
    holding_pct: float = 0.50
    penalty_eur_per_t: float = 100.0

    def validate(self) -> "Factors":
        for name in ("cbam_factor", "cscf", "markup"):
            for y, v in getattr(self, name).items():
                require_fraction(f"{name}[{y}]", v)
        require_fraction("markup_fertilisers", self.markup_fertilisers)
        require_fraction("holding_pct", self.holding_pct)
        return self

    def factor(self, year: int) -> float:
        if year not in self.cbam_factor:
            raise CbamError(f"No CBAM factor for {year}")
        return self.cbam_factor[year]

    def cscf_for(self, year: int) -> float:
        return self.cscf.get(year, 1.0)

    def markup_for(self, year: int, sector: str) -> float:
        if sector == "Fertilisers":
            return self.markup_fertilisers
        return self.markup.get(min(max(year, 2026), 2028), 0.30)

    def price(self, year: int, quarter: int) -> float | None:
        return self.prices.get(f"{year}-Q{quarter}")

    def reference_price(self, year: int) -> float | None:
        """RP_CBAM: yearly average of published prices (used to convert carbon price paid)."""
        vals = [v for k, v in self.prices.items() if k.startswith(f"{year}-") and v]
        return sum(vals) / len(vals) if vals else None

    def price_or_average(self, year: int, quarter: int) -> float | None:
        return self.price(year, quarter) or self.reference_price(year)

    def to_dict(self) -> dict:
        return {"cbam_factor": {str(k): v for k, v in self.cbam_factor.items()},
                "cscf": {str(k): v for k, v in self.cscf.items()},
                "markup": {str(k): v for k, v in self.markup.items()},
                "markup_fertilisers": self.markup_fertilisers, "prices": self.prices,
                "deminimis_t": self.deminimis_t, "holding_pct": self.holding_pct,
                "penalty_eur_per_t": self.penalty_eur_per_t}

    @classmethod
    def from_dict(cls, d: dict | None) -> "Factors":
        if not d:
            return cls()
        f = cls()
        f.cbam_factor = {int(k): float(v) for k, v in d.get("cbam_factor", f.cbam_factor).items()}
        f.cscf = {int(k): float(v) for k, v in d.get("cscf", f.cscf).items()}
        f.markup = {int(k): float(v) for k, v in d.get("markup", f.markup).items()}
        f.markup_fertilisers = float(d.get("markup_fertilisers", f.markup_fertilisers))
        f.prices = {k: float(v) for k, v in d.get("prices", f.prices).items() if v not in (None, "")}
        f.deminimis_t = float(d.get("deminimis_t", f.deminimis_t))
        f.holding_pct = float(d.get("holding_pct", f.holding_pct))
        f.penalty_eur_per_t = float(d.get("penalty_eur_per_t", f.penalty_eur_per_t))
        return f.validate()
