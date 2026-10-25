import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from shared.database.mongo import db
from .proposal_calculator import (
    build_fingerprint,
    calculate_kpi_contribution,
    resolve_answer_path,
)


PROPOSALS_COLLECTION = "brsr_kpi_import_proposals"


def _get_nested_value(value: Any, path: str) -> Any:
    current = value
    for part in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


class BRSRImportProposalService:
    async def _calculate_mapping(
        self, mapping: Dict[str, Any], org_id: str, reporting_period: str
    ) -> Optional[Dict[str, Any]]:
        kpi_ids = mapping.get("source_kpi_ids") or [mapping.get("kpi_id")]
        kpi_ids = [kpi_id for kpi_id in kpi_ids if kpi_id]
        definitions = await db.esg_kpi_definitions.find(
            {"id": {"$in": kpi_ids}, "status": {"$ne": "archived"}}, {"_id": 0}
        ).to_list(1000)
        definitions_by_id = {definition["id"]: definition for definition in definitions}

        contributing_kpis: List[Dict[str, Any]] = []
        fingerprint_contributions: List[Dict[str, Any]] = []
        values: List[float] = []
        rule = (mapping.get("aggregation_rule") or "sum").lower()

        for kpi_id in kpi_ids:
            kpi = definitions_by_id.get(kpi_id)
            if not kpi:
                continue
            value, records = await calculate_kpi_contribution(kpi, org_id, reporting_period, rule)
            if value is None or not records:
                continue
            unit = mapping.get("destination_unit") or (kpi.get("unit_config") or {}).get("default_unit")
            values.append(float(value))
            contributing_kpis.append({
                "kpi_id": kpi_id,
                "metric_name": kpi.get("metric_name") or mapping.get("source_metric_name") or kpi_id,
                "metric_code": kpi.get("metric_code"),
                "value": round(float(value), 6),
                "unit": unit,
                "record_count": len(records),
            })
            fingerprint_contributions.append({
                "kpi_id": kpi_id,
                "value": round(float(value), 12),
                "records": sorted([
                    {
                        "id": record.get("id"),
                        "version": record.get("version"),
                        "updated_at": record.get("updated_at") or record.get("created_at"),
                        "field_values": record.get("field_values") or {},
                    }
                    for record in records
                ], key=lambda record: str(record.get("id"))),
            })

        if not values:
            return None
        if rule in {"avg", "average", "average_of_entry_formula"}:
            proposed_value = sum(values) / len(values)
        else:
            proposed_value = sum(values)

        question_config = await db.esg_question_configs.find_one(
            {"question_key": mapping.get("question_key")},
            {"_id": 0, "question": 1, "section": 1},
        )
        if not question_config:
            return None

        resolved_path = resolve_answer_path(mapping.get("answer_path"))
        fingerprint = build_fingerprint(mapping, reporting_period, fingerprint_contributions)
        return {
            "mapping": mapping,
            "question_label": question_config.get("question") or mapping.get("question_key"),
            "section": question_config.get("section") or "section_c",
            "resolved_answer_path": resolved_path,
            "proposed_value": round(proposed_value, 6),
            "unit": mapping.get("destination_unit") or contributing_kpis[0].get("unit"),
            "source_fingerprint": fingerprint,
            "contributing_kpis": contributing_kpis,
        }

    async def list_proposals(self, org_id: str, reporting_period: str) -> Dict[str, Any]:
        mappings = await db.kpi_framework_mappings.find({
            "framework": "BRSR",
            "is_active": {"$ne": False},
            "question_key": {"$nin": [None, ""]},
            "answer_path": {"$nin": [None, ""]},
            "mapping_status": "exact_destination",
        }, {"_id": 0}).sort([("question_key", 1), ("answer_path", 1)]).to_list(1000)

        existing_states = await db[PROPOSALS_COLLECTION].find({
            "org_id": org_id,
            "reporting_period": reporting_period,
        }, {"_id": 0}).to_list(1000)
        states_by_mapping = {state["mapping_id"]: state for state in existing_states}
        response_cache: Dict[str, Dict[str, Any]] = {}
        proposals = []
        now = datetime.now(timezone.utc).isoformat()

        for mapping in mappings:
            calculated = await self._calculate_mapping(mapping, org_id, reporting_period)
            if not calculated:
                continue
            mapping_id = mapping["id"]
            previous = states_by_mapping.get(mapping_id)
            fingerprint_changed = bool(previous and previous.get("source_fingerprint") != calculated["source_fingerprint"])
            previous_status = previous.get("status") if previous else None

            if previous_status == "rejected" and not fingerprint_changed:
                continue
            if previous_status in {"accepted", "edited"} and fingerprint_changed:
                status = "stale"
            elif previous_status == "rejected" and fingerprint_changed:
                status = "pending"
            else:
                status = previous_status or "pending"

            question_key = mapping["question_key"]
            if question_key not in response_cache:
                response_cache[question_key] = await db.organization_esg_responses.find_one({
                    "org_id": org_id,
                    "question_key": question_key,
                    "reporting_year": reporting_period,
                }, {"_id": 0, "value": 1}) or {}
            current_value = _get_nested_value(
                response_cache[question_key].get("value"), calculated["resolved_answer_path"]
            )

            proposal_id = previous.get("id") if previous else str(uuid.uuid4())
            state_doc = {
                "id": proposal_id,
                "org_id": org_id,
                "organization_id": org_id,
                "mapping_id": mapping_id,
                "reporting_period": reporting_period,
                "question_key": question_key,
                "answer_path": mapping["answer_path"],
                "resolved_answer_path": calculated["resolved_answer_path"],
                "proposed_value": calculated["proposed_value"],
                "unit": calculated["unit"],
                "source_fingerprint": calculated["source_fingerprint"],
                "status": status,
                "updated_at": now,
            }
            await db[PROPOSALS_COLLECTION].update_one(
                {"org_id": org_id, "reporting_period": reporting_period, "mapping_id": mapping_id},
                {"$set": state_doc, "$setOnInsert": {"created_at": now}},
                upsert=True,
            )

            proposals.append({
                "id": proposal_id,
                "mapping_id": mapping_id,
                "reporting_period": reporting_period,
                "question_key": question_key,
                "question_label": calculated["question_label"],
                "answer_path": mapping["answer_path"],
                "resolved_answer_path": calculated["resolved_answer_path"],
                "reference": mapping.get("reference"),
                "source_tag": mapping.get("source_tag") or "Unknown source",
                "proposed_value": calculated["proposed_value"],
                "current_value": current_value,
                "unit": calculated["unit"],
                "aggregation_rule": mapping.get("aggregation_rule") or "sum",
                "formula_definition": mapping.get("formula_definition"),
                "source_fingerprint": calculated["source_fingerprint"],
                "status": status,
                "is_stale": status == "stale",
                "accepted_value": previous.get("accepted_value") if previous else None,
                "contributing_kpis": calculated["contributing_kpis"],
            })

        counts = {
            "total": len(proposals),
            "pending": sum(proposal["status"] == "pending" for proposal in proposals),
            "stale": sum(proposal["status"] == "stale" for proposal in proposals),
            "accepted": sum(proposal["status"] in {"accepted", "edited"} for proposal in proposals),
        }
        return {"reporting_period": reporting_period, "proposals": proposals, "counts": counts}

    async def decide(
        self,
        org_id: str,
        reporting_period: str,
        mapping_id: str,
        action: str,
        expected_fingerprint: str,
        edited_value: Any,
        user: Dict[str, Any],
    ) -> Dict[str, Any]:
        action = (action or "").lower()
        if action not in {"accept", "edit", "reject"}:
            raise HTTPException(status_code=422, detail="Action must be accept, edit, or reject")

        mapping = await db.kpi_framework_mappings.find_one({
            "id": mapping_id,
            "framework": "BRSR",
            "is_active": {"$ne": False},
            "mapping_status": "exact_destination",
        }, {"_id": 0})
        if not mapping or not mapping.get("question_key") or not mapping.get("answer_path"):
            raise HTTPException(status_code=404, detail="Import mapping not found")

        calculated = await self._calculate_mapping(mapping, org_id, reporting_period)
        if not calculated:
            raise HTTPException(status_code=409, detail="The KPI source no longer has data for this period")
        if calculated["source_fingerprint"] != expected_fingerprint:
            raise HTTPException(status_code=409, detail="The KPI source changed. Review the refreshed proposal before continuing.")

        now = datetime.now(timezone.utc).isoformat()
        user_id = user.get("id") or user.get("user_id")
        user_name = user.get("name") or user.get("full_name") or user.get("email")
        saved_value = None
        status = "rejected"

        if action in {"accept", "edit"}:
            saved_value = calculated["proposed_value"] if action == "accept" else edited_value
            if saved_value is None or isinstance(saved_value, bool):
                raise HTTPException(status_code=422, detail="Edited value is required")
            if isinstance(saved_value, str):
                try:
                    saved_value = float(saved_value.replace(",", "").strip())
                except ValueError as exc:
                    raise HTTPException(status_code=422, detail="Edited value must be numeric") from exc

            value_path = f"value.{calculated['resolved_answer_path']}"
            update_fields = {
                value_path: saved_value,
                "framework": "BRSR",
                "section": calculated["section"],
                "status": "saved",
                "approval_status": None,
                "updated_at": now,
                "updated_by": user_id,
                "updated_by_name": user_name,
                f"kpi_import_metadata.{mapping_id}": {
                    "source_fingerprint": calculated["source_fingerprint"],
                    "source_tag": mapping.get("source_tag"),
                    "import_action": action,
                    "imported_at": now,
                    "imported_by": user_id,
                },
            }
            row_path = calculated["resolved_answer_path"].rsplit(".", 1)[0]
            if calculated.get("unit") and row_path:
                existing_response = await db.organization_esg_responses.find_one({
                    "org_id": org_id,
                    "question_key": mapping["question_key"],
                    "reporting_year": reporting_period,
                }, {"_id": 0, "value": 1})
                existing_unit = _get_nested_value((existing_response or {}).get("value"), f"{row_path}.unit")
                if existing_unit in {None, ""}:
                    update_fields[f"value.{row_path}.unit"] = calculated["unit"]

            await db.organization_esg_responses.update_one(
                {"org_id": org_id, "question_key": mapping["question_key"], "reporting_year": reporting_period},
                {
                    "$set": update_fields,
                    "$setOnInsert": {
                        "id": str(uuid.uuid4()),
                        "org_id": org_id,
                        "organization_id": org_id,
                        "question_key": mapping["question_key"],
                        "reporting_year": reporting_period,
                        "created_at": now,
                    },
                },
                upsert=True,
            )
            status = "accepted" if action == "accept" else "edited"

        await db[PROPOSALS_COLLECTION].update_one(
            {"org_id": org_id, "reporting_period": reporting_period, "mapping_id": mapping_id},
            {
                "$set": {
                    "status": status,
                    "source_fingerprint": calculated["source_fingerprint"],
                    "decision_fingerprint": calculated["source_fingerprint"],
                    "accepted_value": saved_value,
                    "decided_at": now,
                    "decided_by": user_id,
                    "decided_by_name": user_name,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "id": str(uuid.uuid4()),
                    "org_id": org_id,
                    "organization_id": org_id,
                    "mapping_id": mapping_id,
                    "reporting_period": reporting_period,
                    "created_at": now,
                },
            },
            upsert=True,
        )

        await db.question_audit_log.insert_one({
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "organization_id": org_id,
            "framework": "BRSR",
            "question_key": mapping["question_key"],
            "reporting_year": reporting_period,
            "action": f"kpi_import_{status}",
            "mapping_id": mapping_id,
            "source_fingerprint": calculated["source_fingerprint"],
            "value": saved_value,
            "created_by": user_id,
            "created_by_name": user_name,
            "created_at": now,
        })

        return {
            "success": True,
            "mapping_id": mapping_id,
            "status": status,
            "reporting_period": reporting_period,
            "saved_value": saved_value,
            "message": "Proposal rejected" if status == "rejected" else "BRSR response updated",
        }


brsr_import_proposal_service = BRSRImportProposalService()