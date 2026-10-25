"""Idempotent configuration for the BRSR accounts-payable-days KPI."""
from datetime import datetime, timezone

from shared.database.mongo import db


ACCOUNTS_PAYABLE_DAYS_FORMULA = "(accounts_payable * 365) / cost_of_goods_services_procured"
ACCOUNTS_PAYABLE_INPUT_FIELDS = ["accounts_payable", "cost_of_goods_services_procured"]


async def ensure_accounts_payable_days_configuration() -> None:
    now = datetime.now(timezone.utc).isoformat()
    await db.esg_kpi_definitions.update_one(
        {"metric_name": "Accounts Payable Days", "status": {"$ne": "archived"}},
        {
            "$set": {
                "source_type": "calculated",
                "aggregation_type": "formula",
                "formula_config": {"formula_definition": ACCOUNTS_PAYABLE_DAYS_FORMULA},
                "source_config": {"calculated": {"input_fields": ACCOUNTS_PAYABLE_INPUT_FIELDS}},
                "metadata": {
                    "calculation_scope": "per_record_then_period_aggregate",
                    "period_aggregation": "average",
                },
                "unit_config": {
                    "default_unit": "Days",
                    "supported_units": ["Days"],
                    "allow_unit_conversion": False,
                },
                "updated_at": now,
            }
        },
    )