"""Composable supplier-assessment completion contracts and Phase 1 ESG/GHG adapters."""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List


@dataclass(frozen=True)
class ModuleCompletion:
    module_code: str
    completion_percent: float
    legacy_field: str
    is_applicable: bool = True


class SupplierAssessmentModule(ABC):
    """Contract implemented by every assessment module without changing legacy data stores."""
    module_code: str
    legacy_completion_field: str
    legacy_weight: float = 40.0
    default_display_name: str
    supplier_path: str
    supplier_description: str

    @abstractmethod
    async def get_completion(self, database: Any, relationship: Dict[str, Any]) -> ModuleCompletion:
        """Read existing module data and return a normalized completion result."""


class EsgAssessmentModule(SupplierAssessmentModule):
    module_code = "esg"
    legacy_completion_field = "esg_completion_percent"
    default_display_name = "ESG Questionnaire"
    supplier_path = "/supplier-assessment/supplier"
    supplier_description = "Complete the questionnaires assigned by your customer."

    async def get_completion(self, database: Any, relationship: Dict[str, Any]) -> ModuleCompletion:
        questionnaire_query = {"organization_id": relationship["customer_org_id"], "is_active": True}
        if "questionnaire_ids" in relationship:
            questionnaire_query["id"] = {"$in": relationship.get("questionnaire_ids") or []}
        questionnaires = await database.supplier_questionnaires.find(
            questionnaire_query,
            {"_id": 0, "id": 1},
        ).to_list(100)
        if not questionnaires:
            return ModuleCompletion(self.module_code, 0.0, self.legacy_completion_field)

        submitted_questionnaires = 0
        for questionnaire in questionnaires:
            response_query = {
                "questionnaire_id": questionnaire["id"], "supplier_relationship_id": relationship["id"],
                "status": "submitted", "parent_visible": {"$ne": False},
            }
            if relationship.get("reporting_period"):
                response_query["reporting_period"] = relationship["reporting_period"]
            response = await database.supplier_questionnaire_responses.find_one(
                response_query,
                {"_id": 0},
            )
            submitted_questionnaires += int(response is not None)

        return ModuleCompletion(
            self.module_code,
            (submitted_questionnaires / len(questionnaires)) * 100,
            self.legacy_completion_field,
        )


class GhgAssessmentModule(SupplierAssessmentModule):
    module_code = "ghg"
    legacy_completion_field = "ghg_completion_percent"
    default_display_name = "GHG Emissions"
    supplier_path = "/ghg/scope1"
    supplier_description = "Report the greenhouse gas data requested by your customer."

    async def get_completion(self, database: Any, relationship: Dict[str, Any]) -> ModuleCompletion:
        query = {
            "source": "supplier",
            "supplier_relationship_id": relationship["id"],
            "submitted_to_parent_org": {"$exists": True, "$ne": None},
            "parent_visible": {"$ne": False},
        }
        if relationship.get("reporting_period"):
            query["reporting_period"] = relationship["reporting_period"]
        record_count = await database.emission_records.count_documents(query)
        return ModuleCompletion(
            self.module_code,
            min(100.0, record_count * 25),
            self.legacy_completion_field,
        )


class DocumentsAssessmentModule(SupplierAssessmentModule):
    """Completion adapter for organization-provided agreements only."""
    module_code = "documents"
    legacy_completion_field = "documents_completion_percent"
    default_display_name = "Documents"
    supplier_path = "/supplier-assessment/documents/review"
    supplier_description = "Review and accept the documents shared by your customer."

    async def get_completion(self, database: Any, relationship: Dict[str, Any]) -> ModuleCompletion:
        requirements = await database.supplier_document_requirements.find(
            {
                "customer_org_id": relationship["customer_org_id"],
                "is_active": True,
            },
            {"_id": 0, "id": 1, "document_version_id": 1, "response_mode": 1, "supplier_relationship_ids": 1, "reporting_period": 1, "assessment_program_id": 1, "assessment_program_version": 1},
        ).to_list(100)
        requirements = [
            requirement for requirement in requirements
            if (
                (not requirement.get("reporting_period") or requirement["reporting_period"] == relationship.get("reporting_period"))
                and (
                    relationship["id"] in (requirement.get("supplier_relationship_ids") or [])
                    or (
                        not requirement.get("supplier_relationship_ids")
                        and
                        requirement.get("assessment_program_id") == relationship.get("assessment_program_id")
                        and requirement.get("assessment_program_version") == relationship.get("assessment_program_version")
                    )
                )
            )
        ]
        if not requirements:
            return ModuleCompletion(self.module_code, 100.0, self.legacy_completion_field)

        completed = 0
        for requirement in requirements:
            current_submission = await database.supplier_document_submissions.find_one(
                {"supplier_relationship_id": relationship["id"], "document_requirement_id": requirement["id"], "document_version_id": requirement["document_version_id"], "is_current": True},
                {"_id": 0, "status": 1},
            )
            if current_submission and current_submission.get("status") != "submitted":
                continue
            if current_submission:
                completed += 1
                continue
            response_collection = database.supplier_document_responses if requirement.get("response_mode") == "STATUS" else database.supplier_document_acceptances
            response = await response_collection.find_one({"supplier_relationship_id": relationship["id"], "document_requirement_id": requirement["id"], "document_version_id": requirement["document_version_id"]}, {"_id": 0, "id": 1})
            completed += int(response is not None)
        return ModuleCompletion(
            self.module_code,
            (completed / len(requirements)) * 100,
            self.legacy_completion_field,
        )


class TrainingAssessmentModule(SupplierAssessmentModule):
    module_code = "training"
    legacy_completion_field = "training_completion_percent"
    default_display_name = "Training"
    supplier_path = "/supplier-assessment/training"
    supplier_description = "Complete the training assigned by your customer."

    async def get_completion(self, database: Any, relationship: Dict[str, Any]) -> ModuleCompletion:
        assignments = await database.supplier_training_assignments.find(
            {"supplier_relationship_id": relationship["id"], "is_active": True}, {"_id": 0, "id": 1, "requirement_version_id": 1}
        ).to_list(200)
        if not assignments:
            return ModuleCompletion(self.module_code, 0.0, self.legacy_completion_field, is_applicable=False)
        completed = await database.supplier_training_progress.count_documents({
            "supplier_relationship_id": relationship["id"], "training_assignment_id": {"$in": [item["id"] for item in assignments]}, "status": "completed",
        })
        return ModuleCompletion(self.module_code, (completed / len(assignments)) * 100, self.legacy_completion_field)


class SupplierAssessmentModuleRegistry:
    """Registry lookup replaces module-specific orchestration branches."""
    def __init__(self, modules: Iterable[SupplierAssessmentModule]):
        self._modules = {module.module_code: module for module in modules}

    def registered_codes(self) -> List[str]:
        return list(self._modules)

    def enabled_modules(self, program_config: Dict[str, Any]) -> List[SupplierAssessmentModule]:
        module_config = (program_config.get("modules") or {})
        return [
            module for code, module in self._modules.items()
            if (module_config.get(code) or {}).get("enabled", False)
        ]

    def supplier_module_summaries(
        self, program_config: Dict[str, Any], relationship: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Serialize enabled module metadata for the supplier UI from the bound program revision."""
        module_config = program_config.get("modules") or {}
        return [
            {
                "code": module.module_code,
                "display_name": (module_config.get(module.module_code) or {}).get("display_name") or module.default_display_name,
                "completion_percent": relationship.get(module.legacy_completion_field, 0.0),
                "supplier_path": module.supplier_path,
                "description": module.supplier_description,
            }
            for module in self.enabled_modules(program_config)
        ]


supplier_assessment_module_registry = SupplierAssessmentModuleRegistry([
    EsgAssessmentModule(),
    GhgAssessmentModule(),
    DocumentsAssessmentModule(),
    TrainingAssessmentModule(),
])