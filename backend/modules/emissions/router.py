"""
Emissions read/list/write router.

Phase B4 added: GET /emissions, GET /emissions/{id}/history, DELETE /emissions/{id}.
Phase B5 added: POST /emissions, PUT /emissions/{id}.

V3: Refactored to use unified approval_requests collection for all approval workflows.
"""
import json
import logging
import re
import uuid
from modules.approval_workflow.approver_chain import DIRECT
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from app.logging import get_logger, log_event
from audit_logger import AuditAction, AuditModule, get_audit_logger
from calc_engine.versioning import CalculationVersionError, apply_record_version_binding
from modules.approval_workflow.log_visibility import stamp_direct_create
from modules.approval_workflow.proposal_service import sync_emission_request_history
from modules.emissions.approval_service import (
    build_emission_inputs,
    create_emission_approval_request,
    create_emission_update_approval_request,
    edit_pending_create_as_approver,
    find_emission_assignment,
    ghg_approver_mode,
    request_emission_delete,
    update_existing_approval_request,
)
from modules.emissions.record_store import (
    APPROVED_COLLECTION,
    REJECTED_STATUSES,
    STATUS_PENDING_DELETE,
    fetch_emissions_for_user,
    find_record,
    is_approval_enabled_for_org,
)
from modules.auth.dependencies import get_current_user
from modules.base_year.sync_service import (
    sync_changed_emission_base_years,
    sync_deleted_emission_base_years,
)
from modules.esg_records.ghg_energy_sync import get_ghg_energy_sync_service
from modules.entitlements.dependencies import assert_ghg_scope_access, assert_period_row_limit
from modules.supplier_assessment.ghg_submission_service import (
    assert_supplier_emission_capability,
    exclude_reopened_supplier_submission_revisions,
    reporting_period_values,
    resolve_effective_supplier_ghg_scopes,
    supplier_emission_period_allowed,
    supplier_period_error,
    can_modify_supplier_ghg_record,
)
from modules.emissions.contracts import (
    EmissionBatchRollbackRequest,
    EmissionHistoryResponse,
    EmissionRecordCreate,
    EmissionRecordResponse,
)
from modules.emissions.access_policy import resolve_ghg_access_scope
from shared.database.mongo import db
from modules.esg_assignments.assignment_resolver import assignment_requires_approval
from shared.helpers.audit_helpers import compute_field_changes, get_input_label_map_from_db
from shared.helpers.uploaded_files import delete_unreferenced_emission_files, delete_uploaded_files, extract_uploaded_file_ids
from shared.utils.density_units import normalize_density_dynamic_values
from shared.utils.emission_records import without_legacy_quantity_fields

logger = get_logger(__name__)

router = APIRouter()
CUSTOM_FUEL_QUANTITY_EF_UNITS = {"kgCO2/L", "kgCO2/kg"}
C7_CATEGORY_NAME = "C7 - Employee Commuting"
C7_CATEGORY_CODE = "employee_commuting"
C7_MONTH_KEYS = (
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
)
C7_INCOMPATIBLE_RECORD_FIELDS = (
    "fuel_type",
    "fuel_database_id",
    "is_custom_fuel",
    "custom_fuel_name",
    "calculation_methodology",
    "process_type",
    "biogenic_scope_selection",
    "scope3_subcategory",
    "type_of_product",
    "quantity",
    "quantity_unit",
    "unit",
    "co2_emissions",
    "ch4_emissions",
    "n2o_emissions",
)


async def _sync_derived_energy(record: dict, action: str) -> None:
    """Synchronize locked Energy rows after any Scope 1/2 canonical GHG write."""
    if (record.get("scope") or "").lower() not in {"scope1", "scope2"}:
        return
    org_id = record.get("organization_id")
    if not org_id:
        return
    try:
        result = await get_ghg_energy_sync_service(db).sync_organization(org_id)
        log_event(logger, logging.INFO, "ghg.energy.sync", action=action, outcome="succeeded",
                  context={"organization_id": org_id, "changes": result})
    except Exception:
        # The GHG write remains authoritative. Energy list reads reconcile any
        # missed derived write on the next Energy request.
        log_event(logger, logging.WARNING, "ghg.energy.sync", action=action, outcome="degraded",
                  error_code="GHG_ENERGY_SYNC_FAILED", context={"organization_id": org_id}, exc_info=True)
SCOPE3_SELECTION_FIELDS = (
    "calculation_method_scope3",
    "spend_currency_conversion_method",
    "scope3_ef_id",
    "scope3_activity_id",
    "scope3_activity",
    "scope3_activity_type",
    "scope3_subcategory",
    "type_of_product",
)
SCOPE3_SELECTION_DYNAMIC_FIELDS = frozenset((*SCOPE3_SELECTION_FIELDS, "use_custom_activity"))


def _is_c7_employee_commuting(record_data: EmissionRecordCreate) -> bool:
    identity = f"{record_data.category_code or ''} {record_data.category or ''}".lower()
    return record_data.scope == "scope3" and bool(
        re.search(r"(^|\s)c7\b|employee[_\s-]*commuting", identity)
    )


def _uses_scope3_selection(scope: Optional[str], biogenic_scope_selection: Optional[str]) -> bool:
    return scope == "scope3" or (
        scope == "biogenic" and biogenic_scope_selection == "scope3"
    )


def _without_scope3_selection_fields(record: dict) -> dict:
    sanitized = dict(record)
    for field in SCOPE3_SELECTION_FIELDS:
        sanitized.pop(field, None)
    dynamic_values = sanitized.get("dynamic_field_values")
    if isinstance(dynamic_values, dict):
        sanitized["dynamic_field_values"] = {
            key: value
            for key, value in dynamic_values.items()
            if key not in SCOPE3_SELECTION_DYNAMIC_FIELDS
        }
    return sanitized


def _sync_evidence_files_with_urls(existing_record: dict, update_data: dict) -> dict:
    """Retain structured GHG evidence metadata only for URLs that remain attached."""
    if "evidence_url" not in update_data:
        return update_data
    retained_urls = {url.strip() for url in str(update_data.get("evidence_url") or "").split(",") if url.strip()}
    synchronized = dict(update_data)
    synchronized["evidence_files"] = [
        evidence for evidence in (existing_record.get("evidence_files") or [])
        if evidence.get("url") in retained_urls
    ]
    return synchronized


def _canonicalize_c7_update(payload: dict, record_data: EmissionRecordCreate) -> dict:
    """Apply the same identity metadata used by dedicated C7 create routes."""
    normalized = dict(payload)
    normalized.update({
        "scope": "scope3",
        "category": C7_CATEGORY_NAME,
        "category_code": C7_CATEGORY_CODE,
        "c7_data_model_version": 2,
        "activity_type": record_data.scope3_activity_type,
    })
    if record_data.frequency_type == "monthly":
        match = re.match(r"^(\d{4})-(\d{2})$", record_data.reporting_period or "")
        if match:
            year, month = int(match.group(1)), int(match.group(2))
            normalized["reporting_year"] = year
            if 1 <= month <= 12:
                normalized["reporting_month"] = C7_MONTH_KEYS[month - 1]
    elif record_data.frequency_type == "yearly":
        normalized["reporting_year"] = record_data.reporting_period
    return normalized


def _process_input_entry(dynamic_values: dict, predicate) -> tuple[Optional[str], Optional[dict]]:
    for key, value in (dynamic_values or {}).items():
        if predicate(str(key).lower()) and isinstance(value, dict):
            return key, value
    return None, None


def _process_input_value(dynamic_values: dict, predicate) -> Optional[dict]:
    _, value = _process_input_entry(dynamic_values, predicate)
    return value


def _unit_dimension(unit: str, unit_definitions: list[dict]) -> Optional[str]:
    normalized = str(unit or "").strip().lower()
    if not normalized:
        return None
    for definition in unit_definitions:
        aliases = definition.get("aliases") or []
        symbols = [definition.get("symbol"), *aliases]
        if any(str(symbol or "").strip().lower() == normalized for symbol in symbols):
            unit_type = str(definition.get("unit_type") or "").lower()
            if unit_type in {"mass", "volume"}:
                return unit_type
            vector = definition.get("dimension_vector") or definition.get("derived_dimension_vector") or {}
            if vector.get("mass"):
                return "mass"
            if vector.get("volume"):
                return "volume"
    return None


async def _validate_density_requirement(record_data: EmissionRecordCreate) -> None:
    """Reject any configured mass/volume conversion without usable density."""
    dynamic_values = record_data.dynamic_field_values or {}
    methodology_value = dynamic_values.get("calculation_methodology") or {}
    methodology = record_data.calculation_methodology or (
        methodology_value.get("value") if isinstance(methodology_value, dict) else methodology_value
    )
    supported_methodologies = {
        "using_heat_basis_ncv",
        "using_qty_basis_ef",
        "using_carbon_composition",
    }
    if methodology not in supported_methodologies:
        return

    quantity_key, quantity = _process_input_entry(
        dynamic_values,
        lambda key: key == "qty" or key == "quantity" or key.startswith("qty_") or key.startswith("quantity_"),
    )
    if methodology == "using_carbon_composition":
        reference_key, reference = "carbon_composition_reference", {"value": 1, "unit": "kg"}
    else:
        reference_key, reference = _process_input_entry(
            dynamic_values,
            (lambda key: "cv" in key or "calorific" in key or "ncv" in key)
            if methodology == "using_heat_basis_ncv"
            else (lambda key: key == "ef_quantity" or key == "custom_ef" or "emission_factor" in key or key.startswith("ef_")),
        )
    if not quantity or not reference:
        return

    try:
        quantity_value = float(quantity.get("value"))
        reference_value = float(reference.get("value"))
    except (TypeError, ValueError):
        return
    if quantity_value <= 0 or reference_value <= 0:
        return

    quantity_unit = quantity.get("unit") or ""
    reference_unit = (
        "kg"
        if methodology == "using_carbon_composition"
        else (str(reference.get("unit") or "").split("/", 1)[1].strip() if "/" in str(reference.get("unit") or "") else "")
    )
    if not quantity_unit or not reference_unit:
        return

    units = await db.units.find(
        {"is_active": True},
        {"_id": 0, "symbol": 1, "aliases": 1, "unit_type": 1, "dimension_vector": 1, "derived_dimension_vector": 1},
    ).to_list(1000)
    quantity_dimension = _unit_dimension(quantity_unit, units)
    reference_dimension = _unit_dimension(reference_unit, units)
    required_density_unit = (
        f"{reference_unit}/{quantity_unit}"
        if {quantity_dimension, reference_dimension} == {"mass", "volume"}
        else ""
    )

    if not required_density_unit:
        return

    density = dynamic_values.get("density") or {}
    if not isinstance(density, dict) or density.get("value") in (None, "", 0, "0"):
        fuel_id = getattr(record_data, "fuel_database_id", None)
        if fuel_id:
            fuel_density = await db.fuel_database.find_one(
                {"id": fuel_id},
                {"_id": 0, "density": 1, "density_unit": 1},
            )
            if fuel_density:
                density = {
                    "value": fuel_density.get("density"),
                    "unit": fuel_density.get("density_unit"),
                }
    try:
        density_value = float(density.get("value")) if isinstance(density, dict) else None
    except (TypeError, ValueError):
        density_value = None
    density_parts = str(density.get("unit") or "").split("/", 1) if isinstance(density, dict) else []
    density_dimensions = {
        _unit_dimension(part, units)
        for part in density_parts
        if _unit_dimension(part, units)
    }
    has_compatible_density_unit = density_dimensions == {"mass", "volume"}
    if density_value is None or density_value <= 0 or not has_compatible_density_unit:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Density ({required_density_unit}) is required because Quantity uses {quantity_unit} "
                f"while the calculation reference uses {reference_unit}"
            ),
        )


def _validate_custom_fuel_quantity_ef_unit(record_data: EmissionRecordCreate) -> None:
    """Restrict quantity-basis custom-fuel emission factors to supported units."""
    if not record_data.is_custom_fuel:
        return
    dynamic_values = record_data.dynamic_field_values or {}
    methodology_value = dynamic_values.get("calculation_methodology") or record_data.calculation_methodology
    methodology = methodology_value.get("value") if isinstance(methodology_value, dict) else methodology_value
    if methodology != "using_qty_basis_ef":
        return
    emission_factor = dynamic_values.get("custom_ef") or dynamic_values.get("ef_quantity") or {}
    unit = str(emission_factor.get("unit") or "").replace(" ", "") if isinstance(emission_factor, dict) else ""
    if unit not in CUSTOM_FUEL_QUANTITY_EF_UNITS:
        raise HTTPException(
            status_code=422,
            detail="Custom Fuel quantity-basis Emission Factor must use kgCO2/L or kgCO2/kg",
        )


# Module-level audit logger reference. Resolved lazily so it picks up the
# instance initialized by server.py on app startup.
def _audit_logger():
    return get_audit_logger()


# Legacy server.py routes referenced `audit_logger` directly. We provide a
# small alias so the byte-identical handler bodies still work.
class _AuditLoggerProxy:
    def __getattr__(self, name):
        return getattr(get_audit_logger(), name)


audit_logger = _AuditLoggerProxy()


@router.post("/emissions/batch-rollback")
async def rollback_emission_submission_batch(
    rollback_data: EmissionBatchRollbackRequest,
    current_user: dict = Depends(get_current_user),
):
    """Remove records created by an incomplete client-side monthly submission."""
    batch_id = rollback_data.submission_batch_id.strip()
    log_event(logger, logging.INFO, "ghg.emission.batch_rollback.started", action="ghg.emission.batch_rollback", outcome="started")
    if not batch_id:
        raise HTTPException(status_code=422, detail="submission_batch_id is required")

    created_by = current_user.get("id")
    rollback_query = {
        "submission_batch_id": batch_id,
        "created_by": created_by,
    }
    access_scope = await resolve_ghg_access_scope(current_user)
    rollback_query = access_scope.emission_query(rollback_query)
    records = await db.emission_records.find(rollback_query, {"_id": 0}).to_list(100)
    record_ids = [record["id"] for record in records if record.get("id")]
    if not record_ids:
        log_event(logger, logging.INFO, "ghg.emission.batch_rollback.completed", action="ghg.emission.batch_rollback", outcome="succeeded", context={"record_count": 0})
        return {"rolled_back_count": 0}

    try:
        await delete_unreferenced_emission_files(
            db,
            set().union(*(extract_uploaded_file_ids(record) for record in records)),
            excluding_record_ids=record_ids,
        )
    except Exception as error:
        raise HTTPException(status_code=502, detail="Could not remove submission evidence from storage. The batch was not rolled back.") from error

    await db.approval_requests.delete_many({
        "entity_type": "emission_record",
        "entity_id": {"$in": record_ids},
        "request_type": "create",
    })
    delete_result = await db.emission_records.delete_many(rollback_query)
    log_event(logger, logging.INFO, "ghg.emission.batch_rollback.completed", action="ghg.emission.batch_rollback", outcome="succeeded", context={"record_count": delete_result.deleted_count})
    return {"rolled_back_count": delete_result.deleted_count}


@router.post("/emissions", response_model=EmissionRecordResponse)
async def create_emission_record(record_data: EmissionRecordCreate, current_user: dict = Depends(get_current_user)):
    log_event(logger, logging.INFO, "ghg.emission.create.started", action="ghg.emission.create", outcome="started",
              context={"facility_id": record_data.facility_id, "scope": record_data.scope, "category": record_data.category, "frequency_type": record_data.frequency_type or "monthly"})
    record_data = record_data.model_copy(update={
        "dynamic_field_values": normalize_density_dynamic_values(record_data.dynamic_field_values),
    })
    
    facility = await db.facilities.find_one({"id": record_data.facility_id}, {"_id": 0})
    if not facility:
        log_event(logger, logging.WARNING, "ghg.emission.create.rejected", action="ghg.emission.create", outcome="rejected",
                  error_code="FACILITY_NOT_FOUND", context={"facility_id": record_data.facility_id})
        raise HTTPException(status_code=404, detail="Facility not found")

    _validate_custom_fuel_quantity_ef_unit(record_data)
    await _validate_density_requirement(record_data)
    
    org_id = facility.get("organization_id")
    user_id = current_user.get("id")
    user_role = current_user.get("role", "user")

    access_scope = await resolve_ghg_access_scope(current_user, record_data.reporting_period)
    access_scope.assert_emission_access({
        "organization_id": org_id,
        "facility_id": record_data.facility_id,
        "scope": record_data.scope,
    })

    await assert_ghg_scope_access(org_id, record_data.scope, record_data.biogenic_scope_selection)
    
    # Validate frequency_type
    frequency_type = record_data.frequency_type or "monthly"
    if frequency_type not in ["monthly", "yearly"]:
        raise HTTPException(status_code=400, detail="frequency_type must be 'monthly' or 'yearly'")
    
    # Validate reporting_period format based on frequency_type
    reporting_period = record_data.reporting_period
    if frequency_type == "yearly":
        # Yearly format: "CY2025" or "FY 2025-2026"
        if not (reporting_period.startswith("CY") or reporting_period.startswith("FY ")):
            raise HTTPException(
                status_code=400, 
                detail="For yearly frequency, reporting_period must be in format 'CY2025' or 'FY 2025-2026'"
            )
        
        # Note: We no longer block duplicate yearly records - users can add multiple entries
        # for the same category/subcategory/year if needed
    else:
        # Monthly format: "2025-03"
        import re
        if not re.match(r'^\d{4}-\d{2}$', reporting_period):
            raise HTTPException(
                status_code=400,
                detail="For monthly frequency, reporting_period must be in format 'YYYY-MM' (e.g., '2025-03')"
            )

    supplier_relationship = None
    if current_user.get("user_type") == "supplier":
        supplier_relationship = await db.supplier_relationships.find_one(
            {"supplier_org_id": current_user.get("organization_id"), "is_active": True},
            {"_id": 0, "id": 1, "customer_org_id": 1, "reporting_period": 1, "ghg_submission_frequency": 1, "financial_year_start_month": 1},
        )
        if not supplier_relationship:
            raise HTTPException(status_code=403, detail="No active supplier assignment found")
        try:
            await can_modify_supplier_ghg_record(supplier_relationship, reporting_period, frequency_type)
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error))
        allowed_supplier_scopes = await resolve_effective_supplier_ghg_scopes(supplier_relationship)
        if record_data.scope not in allowed_supplier_scopes:
            raise HTTPException(
                status_code=403,
                detail=f"{record_data.scope} is not assigned by your customer. Allowed scopes: {', '.join(allowed_supplier_scopes) or 'none'}",
            )
        try:
            await assert_supplier_emission_capability(
                supplier_relationship,
                record_data.category,
                getattr(record_data, "category_id", None),
                bool(record_data.is_custom_fuel),
            )
        except ValueError as error:
            raise HTTPException(status_code=403, detail=str(error))
        if not supplier_emission_period_allowed(
            reporting_period,
            frequency_type,
            supplier_relationship.get("reporting_period"),
            supplier_relationship.get("financial_year_start_month") or 4,
        ):
            raise HTTPException(
                status_code=400,
                detail=supplier_period_error(
                    supplier_relationship.get("reporting_period"),
                    frequency_type,
                ),
            )
    
    await assert_period_row_limit(
        org_id,
        "ghg",
        "emission_records",
        frequency_type,
        reporting_period,
    )
    
    record_dict = without_legacy_quantity_fields(record_data.model_dump())
    try:
        record_dict = await apply_record_version_binding(db, record_dict)
    except CalculationVersionError as error:
        raise HTTPException(status_code=409, detail=str(error))
    record_id = str(uuid.uuid4())
    record_dict["id"] = record_id
    record_dict["created_by"] = current_user["id"]
    record_dict["created_by_email"] = current_user.get("email", "")
    record_dict["created_by_name"] = current_user.get("full_name", "")
    
    # For Scope 3 emissions: sync sub_category with scope3_activity
    if record_data.scope and 'scope3' in record_data.scope.lower():
        # Check if scope3_activity is provided (either directly or in dynamic_field_values)
        scope3_activity = record_data.scope3_activity
        if not scope3_activity and record_data.dynamic_field_values:
            scope3_act_field = record_data.dynamic_field_values.get('scope3_activity', {})
            if isinstance(scope3_act_field, dict):
                scope3_activity = scope3_act_field.get('value')
        
        # Update sub_category to match scope3_activity if activity is set
        if scope3_activity:
            record_dict["sub_category"] = scope3_activity
    
    # ALWAYS ensure organization_id is set (from facility if not provided)
    if not record_dict.get("organization_id"):
        facility = await db.facilities.find_one({"id": record_data.facility_id}, {"_id": 0, "organization_id": 1})
        if facility and facility.get("organization_id"):
            record_dict["organization_id"] = facility["organization_id"]
        else:
            record_dict["organization_id"] = current_user.get("organization_id")
    
    # Extract emission values from outputs dict for convenience accessors
    outputs = record_data.outputs or {}
    record_dict["co2_emissions"] = outputs.get("co2", {}).get("value", 0) or 0
    record_dict["ch4_emissions"] = outputs.get("ch4", {}).get("value", 0) or 0
    record_dict["n2o_emissions"] = outputs.get("n2o", {}).get("value", 0) or 0
    record_dict["co2e_emissions"] = outputs.get("co2e", {}).get("value", 0) or 0
    record_dict["total_emissions"] = record_dict["co2e_emissions"]
    
    # If user is a supplier, mark the emission as supplier-sourced
    if current_user.get("user_type") == "supplier":
        record_dict["source"] = "supplier"
        # Find the supplier relationship linking this supplier org to a customer
        if supplier_relationship:
            record_dict["supplier_relationship_id"] = supplier_relationship["id"]
            record_dict["customer_org_id"] = supplier_relationship.get("customer_org_id")
    
    created_at = datetime.now(timezone.utc).isoformat()
    record_dict["created_at"] = created_at
    record_dict["updated_at"] = None
    record_dict["updated_by"] = None
    record_dict["updated_by_email"] = None
    record_dict["updated_by_name"] = None
    
    # Check if approval is required via assignment-based workflow
    # This is the ONLY approval mechanism for emissions
    # ADMIN BYPASS: Admins don't require approval
    requires_approval = False
    is_admin = user_role in ["admin", "super_admin"]
    assignment = None
    approver_start_level = 1
    
    if not is_admin:
        try:
            assignment = await find_emission_assignment(
                org_id=record_dict["organization_id"],
                user_id=current_user["id"],
                scope=record_data.scope,
                facility_id=record_data.facility_id,
            )
            if assignment_requires_approval(assignment):
                requires_approval = True
            elif not assignment:
                mode, approver_assignment = await ghg_approver_mode(
                    record_dict["organization_id"], current_user["id"], record_data.facility_id)
                if isinstance(mode, int) and assignment_requires_approval(approver_assignment):
                    assignment, requires_approval, approver_start_level = approver_assignment, True, mode
        except Exception:
            log_event(logger, logging.WARNING, "ghg.emission.assignment_check", action="ghg.emission.create", outcome="degraded",
                      error_code="ASSIGNMENT_CHECK_FAILED", context={"scope": record_data.scope}, exc_info=True)
    
    if requires_approval:
        # Set pending status and insert record
        record_dict["approval_status"] = "pending_approval"
        await db.emission_records.insert_one(record_dict)
        log_event(logger, logging.INFO, "ghg.emission.create.persisted", action="ghg.emission.create", outcome="pending_approval",
                  context={"record_id": record_dict.get("id"), "scope": record_data.scope, "facility_id": record_data.facility_id})
        
        # Create approval request
        await create_emission_approval_request(
            org_id=record_dict["organization_id"],
            emission_record=record_dict,
            assignment=assignment,
            user_id=current_user["id"],
            start_level=approver_start_level,
        )
        log_event(logger, logging.INFO, "ghg.emission.approval_requested", action="ghg.emission.create", outcome="succeeded",
                  context={"record_id": record_dict.get("id")})
        
        # Audit log for submission
        await audit_logger.log(
            action=AuditAction.CREATE,
            module=AuditModule.EMISSION,
            user_id=current_user["id"],
            user_email=current_user["email"],
            user_role=current_user.get("role", "user"),
            organization_id=record_dict["organization_id"],
            resource_id=record_id,
            resource_name=f"{record_data.scope} - {record_data.category} ({record_data.reporting_period})",
            description=f"Submitted emission record for approval ({record_data.category})",
            new_values=record_dict,
            metadata={
                "scope": record_data.scope,
                "category": record_data.category,
                "facility_id": record_data.facility_id,
                "approval_status": "pending_approval",
            },
        )
        
        return EmissionRecordResponse(**record_dict)
    
    # The record is final and reportable, but no approval event occurred.
    record_dict["approval_status"] = "not_required"
    await db.emission_records.insert_one(record_dict)
    await stamp_direct_create("emission_records", record_dict, current_user["id"])
    log_event(logger, logging.INFO, "ghg.emission.create.persisted", action="ghg.emission.create", outcome="succeeded",
              context={"record_id": record_dict.get("id"), "scope": record_data.scope, "facility_id": record_data.facility_id})
    await _sync_derived_energy(record_dict, "ghg.emission.create")
    
    # Phase B11: emit emission.saved (best-effort; never break write path).
    try:
        from events.event_bus import event_bus, Events
        event_bus.emit_nowait(Events.EMISSION_SAVED, {
            "record_id": record_dict.get("id"),
            "scope": record_data.scope,
            "category": record_data.category,
            "facility_id": record_data.facility_id,
            "organization_id": record_dict.get("organization_id"),
            "user_id": current_user.get("id"),
        })
    except Exception:
        pass
    
    # AUTO-SYNC: update the relevant Base Year only when this GHG entry belongs to it.
    try:
        sync_results = await sync_changed_emission_base_years(None, record_dict, current_user)
        if any(result.get("synced") for result in sync_results):
            log_event(logger, logging.INFO, "ghg.base_year.sync", action="ghg.emission.create", outcome="succeeded", context={"record_id": record_id})
    except Exception:
        log_event(logger, logging.WARNING, "ghg.base_year.sync", action="ghg.emission.create", outcome="degraded",
                  error_code="BASE_YEAR_SYNC_FAILED", context={"record_id": record_id}, exc_info=True)
    
    # Create initial version history entry for creation
    # Include both input data and calculated emission values for proper history display
    history_new_values = without_legacy_quantity_fields(record_data.model_dump())
    # Add the calculated/stored emission fields that the frontend expects in history
    history_new_values["co2_emissions"] = record_dict["co2_emissions"]
    history_new_values["ch4_emissions"] = record_dict["ch4_emissions"]
    history_new_values["n2o_emissions"] = record_dict["n2o_emissions"]
    history_new_values["co2e_emissions"] = record_dict["co2e_emissions"]
    history_new_values["total_emissions"] = record_dict["total_emissions"]
    
    if True:
        creation_history = {
            "id": str(uuid.uuid4()),
            "emission_id": record_id,
            "facility_id": record_data.facility_id,
            "organization_id": record_dict["organization_id"],
            "changed_by": current_user["id"],
            "changed_by_email": current_user.get("email", ""),
            "changed_by_name": current_user.get("full_name", ""),
            "changed_at": created_at,
            "changes": {
                "action": "created",
                "old_values": None,
                "new_values": history_new_values
            }
        }
        await db.emission_history.insert_one(creation_history)
    
    # Audit log
    await audit_logger.log(
        action=AuditAction.CREATE,
        module=AuditModule.EMISSION,
        user_id=current_user["id"],
        user_email=current_user["email"],
        user_role=current_user.get("role", "user"),
        organization_id=record_dict["organization_id"],
        resource_id=record_id,
        resource_name=f"{record_data.scope} - {record_data.category} ({record_data.reporting_period})",
        description=f"Created emission record for {record_data.category}",
        new_values=record_dict,
        metadata={
            "scope": record_data.scope,
            "category": record_data.category,
            "facility_id": record_data.facility_id,
            "total_emissions": record_dict["total_emissions"]
        }
    )
    
    return EmissionRecordResponse(**record_dict)

# Phase B4: GET /emissions moved to modules/emissions/router.py


@router.put("/emissions/{record_id}", response_model=EmissionRecordResponse)
async def update_emission_record(
    record_id: str,
    record_data: EmissionRecordCreate,
    current_user: dict = Depends(get_current_user)
):
    log_event(logger, logging.INFO, "ghg.emission.update.started", action="ghg.emission.update", outcome="started",
              context={"record_id": record_id, "frequency_type": record_data.frequency_type or "monthly"})
    record_data = record_data.model_copy(update={
        "dynamic_field_values": normalize_density_dynamic_values(record_data.dynamic_field_values),
    })
    
    # Find record directly from emission_records (approved collection)
    existing = await db[APPROVED_COLLECTION].find_one({"id": record_id}, {"_id": 0})
    source_collection = APPROVED_COLLECTION if existing else None
    
    if not existing:
        raise HTTPException(status_code=404, detail="Emission record not found")

    access_scope = await resolve_ghg_access_scope(current_user, existing.get("reporting_period"))
    access_scope.assert_emission_access(existing)
    target_facility = await db.facilities.find_one(
        {"id": record_data.facility_id}, {"_id": 0, "organization_id": 1}
    )
    if not target_facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    if target_facility.get("organization_id") != existing.get("organization_id"):
        raise HTTPException(status_code=422, detail="An emission record cannot be moved to another organization")
    target_access_scope = await resolve_ghg_access_scope(current_user, record_data.reporting_period)
    target_access_scope.assert_emission_access({
        "organization_id": target_facility.get("organization_id"),
        "facility_id": record_data.facility_id,
        "scope": record_data.scope,
    })

    try:
        versioned_record_data = await apply_record_version_binding(
            db,
            without_legacy_quantity_fields(record_data.model_dump()),
            existing_record=existing,
        )
        versioned_update_data = await apply_record_version_binding(
            db,
            without_legacy_quantity_fields(record_data.model_dump(exclude_unset=True)),
            existing_record=existing,
        )
    except CalculationVersionError as error:
        raise HTTPException(status_code=409, detail=str(error))

    versioned_update_data = _sync_evidence_files_with_urls(existing, versioned_update_data)
    if "evidence_url" in versioned_update_data:
        versioned_record_data["evidence_files"] = versioned_update_data["evidence_files"]

    is_c7_employee_commuting = _is_c7_employee_commuting(record_data)
    if is_c7_employee_commuting:
        versioned_record_data = _canonicalize_c7_update(versioned_record_data, record_data)
        versioned_update_data = _canonicalize_c7_update(versioned_update_data, record_data)

    await assert_ghg_scope_access(
        existing.get("organization_id"),
        existing.get("scope"),
        existing.get("biogenic_scope_selection"),
    )

    if existing.get("source") == "supplier" and existing.get("submitted_to_parent_org"):
        raise HTTPException(status_code=409, detail="Submitted supplier GHG entries are locked. Ask the parent organization to unlock resubmission.")

    if current_user.get("user_type") == "supplier":
        supplier_relationship = await db.supplier_relationships.find_one(
            {"supplier_org_id": current_user.get("organization_id"), "is_active": True},
            {"_id": 0, "id": 1, "reporting_period": 1, "ghg_submission_frequency": 1, "financial_year_start_month": 1},
        )
        if (
            not supplier_relationship
            or existing.get("source") != "supplier"
            or existing.get("supplier_relationship_id") != supplier_relationship.get("id")
        ):
            raise HTTPException(status_code=403, detail="This GHG record is not part of your active supplier assignment")
        try:
            await can_modify_supplier_ghg_record(supplier_relationship, record_data.reporting_period, record_data.frequency_type)
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error))
        allowed_supplier_scopes = await resolve_effective_supplier_ghg_scopes(supplier_relationship)
        if record_data.scope not in allowed_supplier_scopes:
            raise HTTPException(
                status_code=403,
                detail=f"{record_data.scope} is not assigned by your customer. Allowed scopes: {', '.join(allowed_supplier_scopes) or 'none'}",
            )
        try:
            await assert_supplier_emission_capability(
                supplier_relationship,
                record_data.category,
                getattr(record_data, "category_id", None),
                bool(record_data.is_custom_fuel),
            )
        except ValueError as error:
            raise HTTPException(status_code=403, detail=str(error))
        if not supplier_emission_period_allowed(
            record_data.reporting_period,
            record_data.frequency_type,
            supplier_relationship.get("reporting_period"),
            supplier_relationship.get("financial_year_start_month") or 4,
        ):
            raise HTTPException(
                status_code=400,
                detail=supplier_period_error(
                    supplier_relationship.get("reporting_period"),
                    record_data.frequency_type,
                ),
            )

    _validate_custom_fuel_quantity_ef_unit(record_data)
    await _validate_density_requirement(record_data)
    
    org_id = existing.get("organization_id")
    user_id = current_user.get("id")
    user_role = current_user.get("role", "user")
    is_admin = user_role in ["admin", "super_admin"]
    await assert_ghg_scope_access(org_id, record_data.scope, record_data.biogenic_scope_selection)
    
    # Check if approval workflow is enabled for org
    approval_enabled = await is_approval_enabled_for_org(org_id)
    
    # ADMIN BYPASS: Admins don't require approval
    # If admin edits a record with pending approval, delete the pending request
    cleared_requests = []
    if is_admin:
        cleared_requests = await db.approval_requests.find(
            {"entity_id": record_id, "entity_type": "emission_record", "status": {"$in": ["pending", "in_review"]}},
            {"_id": 0, "total_levels": 1}).to_list(50)
        # Delete any pending approval requests for this record
        deleted_result = await db.approval_requests.delete_many({
            "entity_id": record_id,
            "entity_type": "emission_record",
            "status": {"$in": ["pending", "in_review"]},
        })
        if deleted_result.deleted_count > 0:
            log_event(logger, logging.INFO, "ghg.emission.pending_approvals.cleared", action="ghg.emission.update", outcome="succeeded",
                      context={"record_id": record_id, "approval_count": deleted_result.deleted_count})
    
    if existing.get("approval_status") == STATUS_PENDING_DELETE:
        raise HTTPException(status_code=409, detail="This record has a pending deletion request and cannot be edited")
    approver_mode, approver_assignment = (None, None)
    if approval_enabled and not is_admin:
        approver_mode, approver_assignment = await ghg_approver_mode(org_id, user_id, existing.get("facility_id"))

    # Non-admin users go through approval workflow if enabled and assignment requires it
    if approval_enabled and not is_admin and isinstance(approver_mode, int) \
            and await edit_pending_create_as_approver(existing, versioned_record_data, user_id, approver_mode - 1):
        existing["is_my_pending_proposal"] = True
        existing["approval_status"] = "pending_approval"
        return EmissionRecordResponse(**existing)

    if approval_enabled and not is_admin and approver_mode != DIRECT:
        # Check if THIS USER already has a pending approval request for this record
        # (Multi-proposal: each user can have their own pending edit)
        existing_request = await db.approval_requests.find_one({
            "entity_id": record_id,
            "entity_type": "emission_record",
            "submitted_by": user_id,  # Only find current user's pending request
            "status": {"$in": ["pending", "in_review"]},
        }, {"_id": 0})
        
        # Find the user's assignment to determine if approval is required
        assignment = await find_emission_assignment(
            org_id=org_id,
            user_id=user_id,
            scope=record_data.scope,
            facility_id=record_data.facility_id,
        )
        if isinstance(approver_mode, int):
            assignment = approver_assignment
        
        if assignment_requires_approval(assignment):
            if existing_request:
                # Option B: In-place update of existing pending request
                await update_existing_approval_request(
                    request_id=existing_request.get("id"),
                    existing_record=existing,
                    updated_data=versioned_record_data,
                    user_id=user_id,
                    current_user=current_user,
                )
                log_event(logger, logging.INFO, "ghg.emission.update_approval_updated", action="ghg.emission.update", outcome="pending_approval",
                          context={"record_id": record_id, "approval_request_id": existing_request.get("id")})
            else:
                # Create new approval request for the update
                await create_emission_update_approval_request(
                    org_id=org_id,
                    existing_record=existing,
                    updated_data=versioned_record_data,
                    assignment=assignment,
                    user_id=user_id,
                    current_user=current_user,
                    start_level=approver_mode if isinstance(approver_mode, int) else 1,
                )
            
            # NOTE: We intentionally do NOT update emission_records.approval_status here.
            # The record stays as "approved" in the database.
            # For the submitter, fetch_emissions_for_user overlays approval_status="pending_approval"
            # For others, they see the original "approved" status.
            # This mirrors the ESG records immutable-edit pattern.
            
            # Return the existing record with pending indicators for the submitter
            existing["is_my_pending_proposal"] = True
            existing["approval_status"] = "pending_approval"  # Only in response, not DB
            log_event(logger, logging.INFO, "ghg.emission.update.persisted", action="ghg.emission.update", outcome="pending_approval",
                      context={"record_id": record_id})
            return EmissionRecordResponse(**existing)
    
    # Direct apply path (admin, super_admin, or workflow disabled)
    # Prevent changing frequency_type once saved
    existing_frequency = existing.get("frequency_type", "monthly")
    new_frequency = record_data.frequency_type or "monthly"
    if existing_frequency != new_frequency:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot change frequency_type from '{existing_frequency}' to '{new_frequency}'. Delete and recreate the record if needed."
        )
    
    clear_scope3_selection = not _uses_scope3_selection(
        record_data.scope,
        record_data.biogenic_scope_selection,
    )
    update_dict = (
        _without_scope3_selection_fields(versioned_update_data)
        if clear_scope3_selection
        else versioned_update_data
    )
    # Ensure frequency_type is preserved
    update_dict["frequency_type"] = existing_frequency
    removed_file_ids = extract_uploaded_file_ids(existing) - extract_uploaded_file_ids(update_dict)
    
    # For Scope 3 emissions: sync sub_category with scope3_activity when activity changes
    if record_data.scope and 'scope3' in record_data.scope.lower():
        # Check if scope3_activity is provided (either directly or in dynamic_field_values)
        scope3_activity = record_data.scope3_activity
        if not scope3_activity and record_data.dynamic_field_values:
            scope3_act_field = record_data.dynamic_field_values.get('scope3_activity', {})
            if isinstance(scope3_act_field, dict):
                scope3_activity = scope3_act_field.get('value')
        
        # Update sub_category to match scope3_activity if activity is set
        if scope3_activity:
            update_dict["sub_category"] = scope3_activity
    
    # C7 Employee Commuting stores employee-derived CO2e totals only. Identify
    # it from the incoming category so conversions into and away from C7 are
    # handled according to the new record shape, not the previous category.

    # Extract emission values from outputs dict for convenience accessors
    outputs = record_data.outputs or {}
    if is_c7_employee_commuting:
        c7_total = outputs.get("co2e", {}).get("value")
        if c7_total is None:
            c7_total = record_data.co2e_emissions
        if c7_total is None:
            c7_total = record_data.total_emissions
        if c7_total is None:
            c7_total = existing.get("co2e_emissions", existing.get("total_emissions", 0))
        update_dict["co2e_emissions"] = c7_total or 0
        update_dict["total_emissions"] = c7_total or 0
        if record_data.frequency_type == "monthly":
            update_dict["monthly_total"] = {
                "co2e": c7_total or 0,
                "employee_count": len(record_data.employees or []),
            }
        for gas_field in ("co2_emissions", "ch4_emissions", "n2o_emissions"):
            update_dict.pop(gas_field, None)
    else:
        update_dict["co2_emissions"] = outputs.get("co2", {}).get("value", 0) or 0
        update_dict["ch4_emissions"] = outputs.get("ch4", {}).get("value", 0) or 0
        update_dict["n2o_emissions"] = outputs.get("n2o", {}).get("value", 0) or 0
        update_dict["co2e_emissions"] = outputs.get("co2e", {}).get("value", 0) or 0
        update_dict["total_emissions"] = update_dict["co2e_emissions"]
    
    # Prepare new_values for history with proper emission field names
    history_new_values = (
        _without_scope3_selection_fields(versioned_record_data)
        if clear_scope3_selection
        else dict(versioned_record_data)
    )
    if is_c7_employee_commuting:
        for gas_field in ("co2_emissions", "ch4_emissions", "n2o_emissions"):
            history_new_values.pop(gas_field, None)
    else:
        history_new_values["co2_emissions"] = update_dict["co2_emissions"]
        history_new_values["ch4_emissions"] = update_dict["ch4_emissions"]
        history_new_values["n2o_emissions"] = update_dict["n2o_emissions"]
    history_new_values["co2e_emissions"] = update_dict["co2e_emissions"]
    history_new_values["total_emissions"] = update_dict["total_emissions"]
    
    # Look up activity names if scope3_ef_id changed (for version history display)
    old_scope3_ef_id = existing.get("scope3_ef_id")
    new_scope3_ef_id = history_new_values.get("scope3_ef_id")
    if old_scope3_ef_id != new_scope3_ef_id:
        # Look up old activity name
        if old_scope3_ef_id:
            old_ef = await db.scope3_ef.find_one({"id": old_scope3_ef_id}, {"_id": 0, "activity": 1, "name": 1})
            if old_ef:
                existing["activity_name"] = old_ef.get("activity") or old_ef.get("name") or old_scope3_ef_id
        # Look up new activity name
        if new_scope3_ef_id:
            new_ef = await db.scope3_ef.find_one({"id": new_scope3_ef_id}, {"_id": 0, "activity": 1, "name": 1})
            if new_ef:
                history_new_values["activity_name"] = new_ef.get("activity") or new_ef.get("name") or new_scope3_ef_id
    
    # Fetch input labels from DB for field change display
    input_label_map = await get_input_label_map_from_db(db)
    
    # Compute field-level changes for better tracking (#3 - Version History)
    field_changes = compute_field_changes(existing, history_new_values, input_label_map=input_label_map)

    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_by_email"] = current_user.get("email", "")
    update_dict["updated_by_name"] = current_user.get("full_name", "")
    update_dict["version"] = existing.get("version", 0) + 1

    # ─── Direct-apply path (admin, super_admin, or workflow disabled) ────
    try:
        await delete_unreferenced_emission_files(db, removed_file_ids, record_id)
    except Exception as error:
        raise HTTPException(status_code=502, detail="Could not remove replaced evidence from storage. The emission was not updated.") from error

    # Save version history entry for this update with detailed field changes
    history_dict = {
        "id": str(uuid.uuid4()),
        "emission_id": record_id,
        "facility_id": existing.get("facility_id"),
        "organization_id": existing.get("organization_id"),
        "scope": existing.get("scope"),
        "category": existing.get("category"),
        "changed_by": current_user["id"],
        "changed_by_email": current_user.get("email", ""),
        "changed_by_name": current_user.get("full_name", ""),
        "changed_at": datetime.now(timezone.utc).isoformat(),
        "version": existing.get("version", 0) + 1,
        "field_changes": field_changes,
        "changes_summary": f"{len(field_changes)} field(s) changed",
        "changes": {
            "action": "updated",
            "old_values": existing,
            "new_values": history_new_values
        }
    }
    await db.emission_history.insert_one(history_dict)

    # Update the record directly in emission_records. A conversion into C7 must
    # not retain flat-input or gas-breakdown fields from the prior category.
    update_operation = {"$set": update_dict}
    if clear_scope3_selection:
        update_operation["$unset"] = {
            field: ""
            for field in SCOPE3_SELECTION_FIELDS
        }
    if is_c7_employee_commuting:
        update_operation.setdefault("$unset", {}).update({
            field: ""
            for field in C7_INCOMPATIBLE_RECORD_FIELDS
            if field in existing and field not in update_dict
        })
    await db[APPROVED_COLLECTION].update_one({"id": record_id}, update_operation)
    if is_admin and existing.get("approval_status") == "pending_approval":
        total_levels = max([c.get("total_levels") or 1 for c in cleared_requests] or [1])
        settled = {"approval_status": "approved"}
        if "log_creator_level" in existing:
            settled["log_acted_max"] = total_levels
        await db[APPROVED_COLLECTION].update_one({"id": record_id}, {"$set": settled})
        await db.emission_history.insert_one({
            **{k: history_dict[k] for k in ("emission_id", "facility_id", "organization_id", "scope", "category", "changed_by", "changed_by_email", "changed_by_name")},
            "id": str(uuid.uuid4()), "changed_at": datetime.now(timezone.utc).isoformat(), "version": history_dict["version"],
            "field_changes": [], "changes_summary": f"Approved at Level {total_levels} of {total_levels} (admin edit)",
            "changes": {"action": "approved", "request_type": "create"},
            "approved_by": current_user["id"], "approved_by_email": current_user.get("email", ""),
            "approved_by_name": current_user.get("full_name", ""), "approved_at": datetime.now(timezone.utc).isoformat(),
        })
    updated = await db[APPROVED_COLLECTION].find_one({"id": record_id}, {"_id": 0})
    await _sync_derived_energy(updated, "ghg.emission.update")

    try:
        sync_results = await sync_changed_emission_base_years(existing, updated, current_user)
        if any(result.get("synced") for result in sync_results):
            log_event(logger, logging.INFO, "ghg.base_year.sync", action="ghg.emission.update", outcome="succeeded", context={"record_id": record_id})
    except Exception:
        log_event(logger, logging.WARNING, "ghg.base_year.sync", action="ghg.emission.update", outcome="degraded",
                  error_code="BASE_YEAR_SYNC_FAILED", context={"record_id": record_id}, exc_info=True)

    # Phase B11: emit emission.updated (best-effort).
    if True:
        try:
            from events.event_bus import event_bus, Events
            event_bus.emit_nowait(Events.EMISSION_UPDATED, {
                "record_id": record_id,
                "scope": record_data.scope,
                "category": record_data.category,
                "facility_id": record_data.facility_id,
                "organization_id": existing.get("organization_id"),
                "user_id": current_user.get("id"),
            })
        except Exception:
            pass
    
    # Audit log
    await audit_logger.log(
        action=AuditAction.UPDATE,
        module=AuditModule.EMISSION,
        user_id=current_user["id"],
        user_email=current_user["email"],
        user_role=current_user.get("role", "user"),
        organization_id=existing.get("organization_id"),
        resource_id=record_id,
        resource_name=f"{record_data.scope} - {record_data.category} ({record_data.reporting_period})",
        description=f"Updated emission record for {record_data.category}",
        old_values=existing,
        new_values=update_dict,
        metadata={
            "scope": record_data.scope,
            "category": record_data.category,
            "facility_id": record_data.facility_id,
            "total_emissions": update_dict["total_emissions"]
        }
    )
    
    log_event(logger, logging.INFO, "ghg.emission.update.persisted", action="ghg.emission.update", outcome="succeeded",
              context={"record_id": record_id, "scope": updated.get("scope"), "facility_id": updated.get("facility_id")})
    return EmissionRecordResponse(**updated)


@router.get("/emissions", response_model=List[EmissionRecordResponse])
async def get_emission_records(
    facility_id: Optional[str] = None,
    reporting_period: Optional[str] = None,
    scope: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    query = {}
    org_id = current_user.get("organization_id")
    user_id = current_user.get("id")
    user_role = current_user.get("role", "user")
    
    if facility_id:
        query["facility_id"] = facility_id
    if reporting_period:
        query["reporting_period"] = reporting_period
    if scope:
        query["scope"] = scope

    if current_user.get("user_type") == "supplier":
        supplier_relationship = await db.supplier_relationships.find_one(
            {"supplier_org_id": org_id, "is_active": True},
            {"_id": 0, "id": 1, "reporting_period": 1},
        )
        if not supplier_relationship:
            return []
        query.update({
            "source": "supplier",
            "supplier_relationship_id": supplier_relationship["id"],
            "scope": {"$in": await resolve_effective_supplier_ghg_scopes(supplier_relationship)},
            "reporting_period": {"$in": reporting_period_values(supplier_relationship.get("reporting_period"))},
        })

    # Use the new fetch_emissions_for_user which combines approved + pending
    records = await fetch_emissions_for_user(current_user, query)

    # A supplier unlock creates editable draft copies and preserves the submitted
    # source revision for audit and parent visibility. GHG Logs should show the
    # active draft rather than rendering both revisions as duplicate entries.
    records = exclude_reopened_supplier_submission_revisions(records)
    
    # Filter out biogenic records from non-biogenic scope tabs
    # Biogenic records should ONLY appear in the biogenic tab
    if scope and scope != "biogenic":
        records = [r for r in records if r.get("scope") != "biogenic"]
    
    # Filter out rejected records for regular users (admins can see them)
    if user_role == "user":
        records = [r for r in records if r.get("approval_status") not in REJECTED_STATUSES]
    
    # Platform Access is the outer boundary for Scope 3 and indirect biogenic data.
    if user_role != "super_admin" and org_id:
        from modules.entitlements.service import entitlement_access_map, resolve_entitlement_config
        permissions = entitlement_access_map(await resolve_entitlement_config(org_id, migrate=True))
        if not permissions.get("environment.ghg.scope_3"):
            records = [
                r for r in records
                if r.get("scope") != "scope3" and not (r.get("scope") == "biogenic" and r.get("biogenic_scope_selection") == "scope3")
            ]

    # Batch-resolve display names for created_by / updated_by ids.
    user_ids = set()
    for r in records:
        if r.get("created_by"):
            user_ids.add(r["created_by"])
        if r.get("updated_by"):
            user_ids.add(r["updated_by"])

    user_map = {}
    if user_ids:
        users = await db.users.find(
            {"id": {"$in": list(user_ids)}},
            {"_id": 0, "id": 1, "full_name": 1, "email": 1},
        ).to_list(1000)
        user_map = {u["id"]: u for u in users}

    for r in records:
        if r.get("created_by") and not r.get("created_by_name"):
            user = user_map.get(r["created_by"])
            if user:
                r["created_by_name"] = user.get("full_name", "")
                if not r.get("created_by_email"):
                    r["created_by_email"] = user.get("email", "")
        if r.get("updated_by") and not r.get("updated_by_name"):
            user = user_map.get(r["updated_by"])
            if user:
                r["updated_by_name"] = user.get("full_name", "")
                if not r.get("updated_by_email"):
                    r["updated_by_email"] = user.get("email", "")

    return [EmissionRecordResponse(**r) for r in records]


@router.get("/emissions/{record_id}", response_model=EmissionRecordResponse)
async def get_emission_record(record_id: str, current_user: dict = Depends(get_current_user)):
    """Fetch a single emission record with user's pending proposal overlaid if applicable.
    
    Priority for non-admin users:
    1. Check if user has pending edit in approval_requests → overlay proposed values
    2. Return the approved record (with proposed values merged if pending edit exists)
    
    This ensures users see their submitted values while awaiting approval.
    """
    user_id = current_user.get("id")
    user_role = current_user.get("role", "user")
    
    record = None
    user_pending_proposal = None
    
    # For non-admin users, check if they have a pending edit in approval_requests
    if user_role not in ["admin", "super_admin"]:
        user_pending_proposal = await db.approval_requests.find_one(
            {
                "entity_type": "emission_record",
                "entity_id": record_id,
                "submitted_by": user_id,
                "status": {"$in": ["pending", "in_review"]}
            },
            {"_id": 0, "entity_snapshot": 1, "status": 1}
        )
    
    # Get the base record using standard lookup
    record, source = await find_record(record_id)
    
    if not record:
        raise HTTPException(status_code=404, detail="Emission record not found")

    record_org_id = record.get("organization_id")
    if not record_org_id and record.get("facility_id"):
        facility = await db.facilities.find_one({"id": record["facility_id"]}, {"_id": 0, "organization_id": 1})
        record_org_id = (facility or {}).get("organization_id")
    access_scope = await resolve_ghg_access_scope(current_user, record.get("reporting_period"))
    access_scope.assert_emission_access({**record, "organization_id": record_org_id})
    await assert_ghg_scope_access(record_org_id, record.get("scope"), record.get("biogenic_scope_selection"))
    
    # If user has a pending proposal, overlay their proposed values onto the record
    if user_pending_proposal:
        entity_snapshot = user_pending_proposal.get("entity_snapshot", {})
        proposed_changes = entity_snapshot.get("proposed_changes", {})
        
        # Overlay proposed inputs onto dynamic_field_values
        if "inputs" in proposed_changes and proposed_changes["inputs"]:
            record["dynamic_field_values"] = proposed_changes["inputs"]
        
        # Overlay proposed outputs
        if "outputs" in proposed_changes and proposed_changes["outputs"]:
            record["outputs"] = proposed_changes["outputs"]
            outputs = proposed_changes["outputs"]
            record["co2_emissions"] = (outputs.get("co2") or {}).get("value", 0) or 0
            record["ch4_emissions"] = (outputs.get("ch4") or {}).get("value", 0) or 0
            record["n2o_emissions"] = (outputs.get("n2o") or {}).get("value", 0) or 0
            record["co2e_emissions"] = (outputs.get("co2e") or {}).get("value", 0) or 0
            record["total_emissions"] = record["co2e_emissions"]
        
        # Mark that this record has user's pending proposal overlaid
        record["is_my_pending_proposal"] = True
        record["approval_status"] = "pending_approval"

    return EmissionRecordResponse(**record)


@router.get("/emissions/{record_id}/history", response_model=List[EmissionHistoryResponse])
async def get_emission_history(record_id: str, current_user: dict = Depends(get_current_user)):
    """Get version history for an emission record.

    History is the single source of truth in `db.emission_history`.
    - Admin direct create/update writes one doc per change.
    - Approved-from-pending flow flushes all `pending_records` lifecycle
      entries (edit_history + version_history + approval entry) to this
      collection on approval.

    Embedded `version_history` on the record (if any) is treated as a
    legacy fallback for records approved before this change.
    """
    record, _ = await find_record(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Emission record not found")
    access_scope = await resolve_ghg_access_scope(current_user, record.get("reporting_period"))
    access_scope.assert_emission_access(record)

    history: List[dict] = []

    # Primary source: emission_history collection.
    rows = await db.emission_history.find(
        {"emission_id": record_id},
        {"_id": 0},
    ).sort("changed_at", -1).to_list(1000)

    for entry in rows:
        # Backfill display names if missing.
        if entry.get("changed_by") and not entry.get("changed_by_email"):
            user = await db.users.find_one(
                {"id": entry["changed_by"]},
                {"_id": 0, "email": 1, "full_name": 1},
            )
            if user:
                entry["changed_by_email"] = user.get("email", "Unknown User")
                entry["changed_by_name"] = user.get("full_name", "")
        proposal_id = (entry.get("changes") or {}).get("proposal_id")
        if proposal_id and not entry.get("requested_by"):
            proposal = await db.approval_requests.find_one(
                {"id": proposal_id},
                {"_id": 0, "submitted_by": 1, "submitted_by_email": 1, "submitted_by_name": 1, "submitted_at": 1, "entity_snapshot.proposed_changes": 1, "proposed_changes": 1},
            )
            if proposal:
                entry["requested_by"] = proposal.get("submitted_by")
                entry["requested_by_email"] = proposal.get("submitted_by_email")
                entry["requested_by_name"] = proposal.get("submitted_by_name")
                entry["requested_at"] = proposal.get("submitted_at")
                if (entry.get("changes") or {}).get("action") == "rejected":
                    entry["rejected_proposed_values"] = ((proposal.get("entity_snapshot") or {}).get("proposed_changes") or proposal.get("proposed_changes"))
                if proposal.get("submitted_by") and not entry.get("requested_by_email"):
                    requester = await db.users.find_one(
                        {"id": proposal["submitted_by"]},
                        {"_id": 0, "email": 1, "full_name": 1},
                    )
                    if requester:
                        entry["requested_by_email"] = requester.get("email")
                        entry["requested_by_name"] = requester.get("full_name")
        history.append(entry)

    # Legacy fallback — if collection is empty for this record, surface any
    # embedded version_history that pre-dates the flush-on-approve change.
    if not history:
        record, _ = await find_record(record_id)

        for entry in (record or {}).get("version_history", []) or []:
            history.append({
                "id": entry.get("id", str(uuid.uuid4())),
                "emission_id": record_id,
                "changed_by": entry.get("changed_by"),
                "changed_by_email": entry.get("changed_by_email", ""),
                "changed_by_name": entry.get("changed_by_name", ""),
                "changed_at": entry.get("changed_at"),
                "version": entry.get("version"),
                "scope": record.get("scope"),
                "category": record.get("category"),
                "field_changes": entry.get("field_changes"),
                "changes_summary": entry.get("changes_summary"),
                "changes": {
                    "action": entry.get("action", "updated"),
                    "old_values": None,
                    "new_values": None,
                },
                "approved_by": entry.get("approved_by"),
                "approved_by_email": entry.get("approved_by_email"),
                "approved_by_name": entry.get("approved_by_name"),
                "approved_at": entry.get("approved_at"),
            })

    history.sort(key=lambda x: x.get("changed_at", ""), reverse=True)

    return [EmissionHistoryResponse(**h) for h in history]


@router.delete("/emissions/{record_id}")
async def delete_emission_record(record_id: str, current_user: dict = Depends(get_current_user)):
    log_event(logger, logging.INFO, "ghg.emission.delete.started", action="ghg.emission.delete", outcome="started", context={"record_id": record_id})
    existing, source_collection = await find_record(record_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Emission record not found")

    access_scope = await resolve_ghg_access_scope(current_user, existing.get("reporting_period"))
    access_scope.assert_emission_access(existing)

    await assert_ghg_scope_access(
        existing.get("organization_id"),
        existing.get("scope"),
        existing.get("biogenic_scope_selection"),
    )

    if existing.get("source") == "supplier" and existing.get("submitted_to_parent_org"):
        raise HTTPException(status_code=409, detail="Submitted supplier GHG entries are locked. Ask the parent organization to unlock resubmission.")

    if current_user.get("user_type") == "supplier" and existing.get("source") == "supplier":
        supplier_relationship = await db.supplier_relationships.find_one(
            {"supplier_org_id": current_user.get("organization_id"), "is_active": True}, {"_id": 0},
        )
        if not supplier_relationship or existing.get("supplier_relationship_id") != supplier_relationship.get("id"):
            raise HTTPException(status_code=403, detail="This GHG record is not part of your active supplier assignment")
        try:
            await can_modify_supplier_ghg_record(supplier_relationship, existing.get("reporting_period"), existing.get("frequency_type"))
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error))

    # Approval-workflow gate: non-admins' deletes of approved data go through the assignment's approvers
    target_collection = source_collection
    if current_user.get("role") not in ("admin", "super_admin") and source_collection == APPROVED_COLLECTION \
            and await is_approval_enabled_for_org(existing.get("organization_id")):
        status = existing.get("approval_status") or "approved"
        if status not in ("approved", "not_required") and not status.startswith("rejected"):
            raise HTTPException(status_code=403, detail="Cannot delete a record with pending approval")
        approver_mode, approver_assignment = await ghg_approver_mode(
            existing.get("organization_id"), current_user["id"], existing.get("facility_id"))
        if status in ("approved", "not_required") and approver_mode != DIRECT and await request_emission_delete(
                existing, current_user, approver_assignment, approver_mode if isinstance(approver_mode, int) else 1):
            log_event(logger, logging.INFO, "ghg.emission.delete.queued", action="ghg.emission.delete", outcome="pending_approval", context={"record_id": record_id})
            return {"message": "Delete request submitted for approval"}

    try:
        await delete_unreferenced_emission_files(db, extract_uploaded_file_ids(existing), record_id)
    except Exception as error:
        raise HTTPException(status_code=502, detail="Could not remove emission evidence from storage. The emission was not deleted.") from error
    result = await db[target_collection].delete_one({"id": record_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Emission record not found")
    if target_collection == APPROVED_COLLECTION:
        await _sync_derived_energy(existing, "ghg.emission.delete")

    if target_collection == APPROVED_COLLECTION:
        try:
            sync_results = await sync_deleted_emission_base_years(existing, current_user)
            if any(result.get("synced") for result in sync_results):
                log_event(logger, logging.INFO, "ghg.base_year.sync", action="ghg.emission.delete", outcome="succeeded", context={"record_id": record_id})
        except Exception:
            log_event(logger, logging.WARNING, "ghg.base_year.sync", action="ghg.emission.delete", outcome="degraded",
                      error_code="BASE_YEAR_SYNC_FAILED", context={"record_id": record_id}, exc_info=True)

    # Phase B11: emit emission.deleted (best-effort).
    # Only emit when an approved record actually leaves the dashboard view.
    if target_collection == APPROVED_COLLECTION:
        try:
            from events.event_bus import event_bus, Events
            event_bus.emit_nowait(Events.EMISSION_DELETED, {
                "record_id": record_id,
                "scope": existing.get("scope"),
                "category": existing.get("category"),
                "facility_id": existing.get("facility_id"),
                "organization_id": existing.get("organization_id"),
                "user_id": current_user.get("id"),
            })
        except Exception:
            pass

    audit_logger = get_audit_logger()
    await audit_logger.log(
        action=AuditAction.DELETE,
        module=AuditModule.EMISSION,
        user_id=current_user["id"],
        user_email=current_user["email"],
        user_role=current_user.get("role", "user"),
        organization_id=existing.get("organization_id"),
        resource_id=record_id,
        resource_name=f"{existing.get('scope', '')} - {existing.get('category', '')} ({existing.get('reporting_period', '')})",
        description=f"Deleted emission record for {existing.get('category', 'Unknown')}",
        old_values=existing,
        metadata={
            "scope": existing.get("scope"),
            "category": existing.get("category"),
            "total_emissions": existing.get("total_emissions"),
        },
    )

    log_event(logger, logging.INFO, "ghg.emission.delete.completed", action="ghg.emission.delete", outcome="succeeded",
              context={"record_id": record_id, "scope": existing.get("scope"), "facility_id": existing.get("facility_id")})
    return {"message": "Emission record deleted successfully"}
