"""One-shot seeder called from server startup."""

from __future__ import annotations

import logging

from .properties import seed_properties
from .units import seed_units
from .variables import seed_variables

logger = logging.getLogger(__name__)


async def seed_calc_engine(db) -> dict:
    """Idempotently seed all system registries."""
    v_count = await seed_variables(db)
    simple_u, compound_u = await seed_units(db)
    p_count = await seed_properties(db)

    if any([v_count, simple_u, compound_u, p_count]):
        logger.info(
            "calc_engine seed: variables=%d simple_units=%d compound_units=%d properties=%d",
            v_count, simple_u, compound_u, p_count,
        )

    return {
        "variables_inserted": v_count,
        "simple_units_inserted": simple_u,
        "compound_units_inserted": compound_u,
        "properties_inserted": p_count,
    }
