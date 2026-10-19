"""Deterministic resolution of Internal AI entities against existing platform data."""
import re


# Product-approved aliases. Values are validated against canonical fuel names in fuel_database.
_FUEL_ALIASES = {
    "hsd": "diesel",
    "high speed diesel": "diesel",
    "high-speed diesel": "diesel",
}


def normalize_entity_text(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", (value or "").lower())).strip()


async def resolve_fuel_entity(db, raw_value: str) -> dict:
    """Resolve only exact canonical/approved aliases; never guess a similar fuel."""
    requested = normalize_entity_text(raw_value)
    if not requested:
        return {"status": "NOT_FOUND", "canonical_value": None, "matches": []}

    alias_target = _FUEL_ALIASES.get(requested, requested)
    fuels = await db.fuel_database.find({}, {"_id": 0, "fuel_name": 1}).to_list(1000)
    canonical_names = sorted({fuel.get("fuel_name") for fuel in fuels if fuel.get("fuel_name")})
    exact_matches = [name for name in canonical_names if normalize_entity_text(name) == alias_target]

    if len(exact_matches) == 1:
        return {
            "status": "RESOLVED",
            "canonical_value": exact_matches[0],
            "matches": exact_matches,
            "resolution": "approved_alias" if alias_target != requested else "canonical_exact",
        }
    if len(exact_matches) > 1:
        return {"status": "AMBIGUOUS", "canonical_value": None, "matches": exact_matches}
    return {"status": "NOT_FOUND", "canonical_value": None, "matches": []}


async def resolve_fuel_from_question(db, question: str) -> dict | None:
    """Resolve only an explicit canonical/approved fuel phrase found in the user's text."""
    normalized_question = normalize_entity_text(question)
    fuels = await db.fuel_database.find({}, {"_id": 0, "fuel_name": 1}).to_list(1000)
    candidates = sorted({fuel.get("fuel_name") for fuel in fuels if fuel.get("fuel_name")})
    matches = [name for name in candidates if normalize_entity_text(name) in normalized_question]
    alias_matches = [
        alias for alias in _FUEL_ALIASES
        if re.search(rf"\b{re.escape(alias)}\b", normalized_question)
    ]
    if alias_matches:
        matches.extend(_FUEL_ALIASES[alias] for alias in alias_matches)
    canonical_matches = sorted({match for match in matches})
    if len(canonical_matches) != 1:
        return None
    resolved = await resolve_fuel_entity(db, canonical_matches[0])
    resolved["raw_value"] = canonical_matches[0]
    return resolved