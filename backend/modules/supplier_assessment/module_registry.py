"""Composable supplier-assessment completion contracts and Phase 1 ESG/GHG adapters."""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List


@dataclass(frozen=True)
class ModuleCompletion:
    module_code: str
    completion_percent: float
    legacy_field: str


class SupplierAssessmentModule(ABC):
    """Contract implemented by every assessment module without changing legacy data stores."""
    module_code: str
    legacy_completion_field: str
    legacy_weight: float = 40.0

    @abstractmethod
    async def get_completion(self, database: Any, relationship: Dict[str, Any]) -> ModuleCompletion:
        """Read existing module data and return a normalized completion result."""


class EsgAssessmentModule(SupplierAssessmentModule):
    module_code = "esg"
    legacy_completion_field = "esg_completion_percent"

    async def get_completion(self, database: Any, relationship: Dict[str, Any]) -> ModuleCompletion:
        questionnaires = await database.supplier_questionnaires.find(
            {"organization_id": relationship["customer_org_id"], "is_active": True},
            {"_id": 0, "id": 1},
        ).to_list(100)
        if not questionnaires:
            return ModuleCompletion(self.module_code, 0.0, self.legacy_completion_field)

        total_completion = 0.0
        for questionnaire in questionnaires:
            response = await database.supplier_questionnaire_responses.find_one(
                {"questionnaire_id": questionnaire["id"], "supplier_relationship_id": relationship["id"]},
                {"_id": 0},
            )
            if not response:
                continue
            total_questions = await database.supplier_questions.count_documents(
                {"questionnaire_id": questionnaire["id"], "is_active": True}
            )
            answered = len([answer for answer in response.get("answers", {}).values() if answer is not None])
            if total_questions > 0:
                total_completion += (answered / total_questions) * 100

        return ModuleCompletion(
            self.module_code,
            total_completion / len(questionnaires),
            self.legacy_completion_field,
        )


class GhgAssessmentModule(SupplierAssessmentModule):
    module_code = "ghg"
    legacy_completion_field = "ghg_completion_percent"

    async def get_completion(self, database: Any, relationship: Dict[str, Any]) -> ModuleCompletion:
        record_count = await database.emission_records.count_documents({
            "source": "supplier",
            "supplier_relationship_id": relationship["id"],
        })
        return ModuleCompletion(
            self.module_code,
            min(100.0, record_count * 25),
            self.legacy_completion_field,
        )


class DocumentsAssessmentModule(SupplierAssessmentModule):
    """Completion adapter for organization-provided agreements only."""
    module_code = "documents"
    legacy_completion_field = "documents_completion_percent"

    async def get_completion(self, database: Any, relationship: Dict[str, Any]) -> ModuleCompletion:
        requirements = await database.supplier_document_requirements.find(
            {
                "customer_org_id": relationship["customer_org_id"],
                "assessment_program_id": relationship.get("assessment_program_id"),
                "assessment_program_version": relationship.get("assessment_program_version"),
                "is_active": True,
            },
            {"_id": 0, "id": 1, "document_version_id": 1},
        ).to_list(100)
        if not requirements:
            return ModuleCompletion(self.module_code, 100.0, self.legacy_completion_field)

        accepted = 0
        for requirement in requirements:
            acceptance = await database.supplier_document_acceptances.find_one(
                {
                    "supplier_relationship_id": relationship["id"],
                    "document_requirement_id": requirement["id"],
                    "document_version_id": requirement["document_version_id"],
                },
                {"_id": 0, "id": 1},
            )
            accepted += int(acceptance is not None)
        return ModuleCompletion(
            self.module_code,
            (accepted / len(requirements)) * 100,
            self.legacy_completion_field,
        )


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


supplier_assessment_module_registry = SupplierAssessmentModuleRegistry([
    EsgAssessmentModule(),
    GhgAssessmentModule(),
    DocumentsAssessmentModule(),
])