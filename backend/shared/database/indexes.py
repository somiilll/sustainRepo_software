"""
Database Index Management

Creates indexes on MongoDB collections for query performance.
Idempotent — safe to run on every startup (create_index is a no-op if index exists).
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

logger = logging.getLogger(__name__)


async def ensure_indexes(db: AsyncIOMotorDatabase):
    """Create all required indexes. Idempotent."""

    index_specs = {
        # Auth
        "users": [
            ([("email", 1)], {"unique": True}),
            ([("organization_id", 1)], {}),
        ],

        # Organizations
        "organizations": [
            ([("id", 1)], {"unique": True}),
        ],

        # Facilities
        "facilities": [
            ([("id", 1)], {"unique": True}),
            ([("organization_id", 1)], {}),
        ],

        # Emission Records (most queried collection)
        "emission_records": [
            ([("organization_id", 1), ("scope", 1), ("reporting_period", 1)], {}),
            ([("facility_id", 1), ("scope", 1), ("reporting_period", 1)], {}),
            ([("facility_id", 1), ("reporting_period", 1)], {}),
        ],

        # ESG Targets
        "esg_targets": [
            ([("id", 1)], {"unique": True}),
            ([("organization_id", 1), ("section", 1), ("status", 1)], {}),
        ],

        # KPI Definitions
        "esg_kpi_definitions": [
            ([("id", 1)], {"unique": True}),
            ([("section", 1), ("status", 1)], {}),
            ([("metric_code", 1)], {}),
        ],

        # Production Quantities
        "production_quantities": [
            ([("organization_id", 1), ("facility_id", 1), ("reporting_period", 1)], {}),
        ],

        # Organization Financials
        "organization_financials": [
            ([("org_id", 1), ("reporting_year", 1)], {}),
        ],

        # ESG Records (environment, social, governance)
        "environment_records": [
            ([("organization_id", 1), ("category", 1), ("subcategory", 1)], {}),
            ([("org_id", 1), ("category", 1)], {}),
        ],
        "social_records": [
            ([("organization_id", 1), ("category", 1)], {}),
        ],
        "governance_records": [
            ([("organization_id", 1), ("category", 1)], {}),
        ],

        # Base Year Emissions
        "base_year_emissions": [
            ([("organization_id", 1), ("scope_group", 1)], {}),
        ],

        # Emission History
        "emission_history": [
            ([("emission_id", 1)], {}),
            ([("organization_id", 1)], {}),
        ],

        # Approval Workflow
        "approval_requests": [
            ([("organization_id", 1), ("status", 1)], {}),
        ],

        # ESG Assignments
        "esg_assignments": [
            ([("organization_id", 1), ("status", 1)], {}),
            ([("assigned_to", 1)], {}),
        ],

        # Audit Logs
        "audit_logs": [
            ([("organization_id", 1), ("created_at", -1)], {}),
        ],

        # Notifications
        "notifications": [
            ([("user_id", 1), ("organization_id", 1), ("read", 1), ("created_at", -1)], {}),
        ],

        # SBTi Targets
        "sbti_targets": [
            ([("organization_id", 1), ("term_type", 1)], {}),
        ],
    }

    total = 0
    for collection_name, indexes in index_specs.items():
        for keys, options in indexes:
            try:
                await db[collection_name].create_index(keys, **options)
                total += 1
            except Exception as e:
                logger.warning(f"Index creation failed for {collection_name}: {e}")

    logger.info(f"Ensured {total} indexes across {len(index_specs)} collections")
