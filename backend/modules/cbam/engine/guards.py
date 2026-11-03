"""Guardrails against the classic CBAM calculation mistakes (unit, scale, sign, pairing)."""


class CbamError(ValueError):
    pass


def require_fraction(name: str, v: float) -> float:
    if v is None or not (0.0 <= float(v) <= 1.0):
        raise CbamError(f"{name}={v} must be a fraction between 0 and 1 (e.g. 0.975, not 97.5)")
    return float(v)


def require_non_negative(name: str, v: float) -> float:
    if v is None or float(v) < 0:
        raise CbamError(f"{name}={v} must be >= 0")
    return float(v)


def bm_scale_warnings(bm_a: float | None, bm_b: float | None) -> list[str]:
    if bm_a is not None and bm_b is not None and bm_a > bm_b + 1e-9:
        return [f"Column A benchmark ({bm_a}) exceeds the whole-chain Column B ({bm_b}) - check the scale."]
    return []


def precursor_mass_hint(total_precursor_t: float, output_t: float) -> list[str]:
    if total_precursor_t and output_t and total_precursor_t < output_t:
        return ["Precursor mass is below output mass. CBAM counts precursor CONSUMED (incl. losses, "
                "crop-ends, scrap), not contained - check the input quantity."]
    return []
