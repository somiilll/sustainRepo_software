"""
ESG Questionnaire Service

Business logic for config-driven ESG questionnaire system.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from shared.database.mongo import db
from modules.esg_questionnaire.contracts import (
    QuestionConfigCreate,
    QuestionConfigUpdate,
    ESGResponseCreate,
    NGRBC_PRINCIPLES,
)


class ESGQuestionnaireService:
    """Service for managing ESG questionnaire configs and responses."""

    CONFIGS_COLLECTION = "esg_question_configs"
    RESPONSES_COLLECTION = "organization_esg_responses"

    def __init__(self, database=None):
        self._db = database or db
        self._configs = self._db[self.CONFIGS_COLLECTION]
        self._responses = self._db[self.RESPONSES_COLLECTION]

    # =========================================================================
    # Question Config Methods
    # =========================================================================

    async def get_question_config(self, question_key: str) -> Optional[Dict[str, Any]]:
        """Get a single question config by key."""
        return await self._configs.find_one(
            {"question_key": question_key},
            {"_id": 0}
        )

    async def list_question_configs(
        self,
        framework: Optional[str] = None,
        section: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List question configs with optional filtering."""
        query = {}
        if framework:
            query["frameworks"] = framework
        if section:
            query["section"] = section
        
        cursor = self._configs.find(query, {"_id": 0}).sort("order", 1)
        return await cursor.to_list(500)

    async def create_question_config(self, config: QuestionConfigCreate) -> Dict[str, Any]:
        """Create a new question config."""
        # Check if question_key already exists
        existing = await self.get_question_config(config.question_key)
        if existing:
            raise ValueError(f"Question with key '{config.question_key}' already exists")
        
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": str(uuid.uuid4()),
            **config.model_dump(),
            "created_at": now,
            "updated_at": None,
        }
        await self._configs.insert_one(doc)
        doc.pop("_id", None)
        return doc

    async def update_question_config(
        self, 
        question_key: str, 
        update: QuestionConfigUpdate
    ) -> Optional[Dict[str, Any]]:
        """Update an existing question config."""
        existing = await self.get_question_config(question_key)
        if not existing:
            return None
        
        update_dict = update.model_dump(exclude_unset=True)
        if not update_dict:
            return existing
        
        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await self._configs.update_one(
            {"question_key": question_key},
            {"$set": update_dict}
        )
        return await self.get_question_config(question_key)

    async def delete_question_config(self, question_key: str) -> bool:
        """Delete a question config."""
        result = await self._configs.delete_one({"question_key": question_key})
        return result.deleted_count > 0

    async def bulk_create_question_configs(
        self, 
        configs: List[QuestionConfigCreate]
    ) -> List[Dict[str, Any]]:
        """Bulk create question configs."""
        now = datetime.now(timezone.utc).isoformat()
        docs = []
        for config in configs:
            doc = {
                "id": str(uuid.uuid4()),
                **config.model_dump(),
                "created_at": now,
                "updated_at": None,
            }
            docs.append(doc)
        
        if docs:
            await self._configs.insert_many(docs)
            for doc in docs:
                doc.pop("_id", None)
        return docs

    # =========================================================================
    # Response Methods
    # =========================================================================

    async def get_responses(
        self,
        org_id: str,
        framework: str,
        reporting_year: str,
        section: str,
    ) -> Optional[Dict[str, Any]]:
        """Get responses for a specific org+framework+year+section."""
        return await self._responses.find_one(
            {
                "org_id": org_id,
                "framework": framework,
                "reporting_year": reporting_year,
                "section": section,
            },
            {"_id": 0}
        )

    async def save_responses(
        self,
        org_id: str,
        framework: str,
        reporting_year: str,
        section: str,
        data: ESGResponseCreate,
    ) -> Dict[str, Any]:
        """Save or update responses for org+framework+year+section."""
        existing = await self.get_responses(org_id, framework, reporting_year, section)
        now = datetime.now(timezone.utc).isoformat()
        
        if existing:
            # Merge responses (update existing, add new)
            merged_responses = {**existing.get("responses", {}), **data.responses}
            await self._responses.update_one(
                {
                    "org_id": org_id,
                    "framework": framework,
                    "reporting_year": reporting_year,
                    "section": section,
                },
                {"$set": {"responses": merged_responses, "updated_at": now}}
            )
            return await self.get_responses(org_id, framework, reporting_year, section)
        else:
            doc = {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "framework": framework,
                "reporting_year": reporting_year,
                "section": section,
                "responses": data.responses,
                "created_at": now,
                "updated_at": None,
            }
            await self._responses.insert_one(doc)
            doc.pop("_id", None)
            return doc

    async def get_response_summary(
        self,
        org_id: str,
        framework: str,
        reporting_year: str,
        section: str,
    ) -> Dict[str, Any]:
        """Get completion summary for a section."""
        # Get question configs for this section/framework
        configs = await self.list_question_configs(framework=framework, section=section)
        total_questions = len(configs)
        
        # Get responses
        responses = await self.get_responses(org_id, framework, reporting_year, section)
        response_data = responses.get("responses", {}) if responses else {}
        
        # Count answered questions
        answered = 0
        for config in configs:
            answer = response_data.get(config["question_key"])
            if answer is not None and answer != "" and answer != []:
                answered += 1
        
        completion = (answered / total_questions * 100) if total_questions > 0 else 0
        
        return {
            "org_id": org_id,
            "framework": framework,
            "reporting_year": reporting_year,
            "section": section,
            "total_questions": total_questions,
            "answered_questions": answered,
            "completion_percentage": round(completion, 1),
        }

    async def list_available_years(
        self,
        org_id: str,
        framework: str,
        section: str,
    ) -> List[str]:
        """List reporting years with responses for org+framework+section."""
        cursor = self._responses.find(
            {"org_id": org_id, "framework": framework, "section": section},
            {"_id": 0, "reporting_year": 1}
        ).sort("reporting_year", -1)
        docs = await cursor.to_list(100)
        return [doc["reporting_year"] for doc in docs]

    async def get_historical_data(
        self,
        org_id: str,
        framework: str,
        section: str,
        current_reporting_year: str,
    ) -> Dict[str, Any]:
        """
        Get previous FY data for historical autofill.
        
        This method fetches the previous reporting year's responses and returns
        the data that should be auto-filled into "Previous FY" columns.
        
        Example: If current_reporting_year is "2025-26", it fetches "2024-25" data.
        
        Returns:
            Dict with:
            - previous_year: The calculated previous reporting year
            - previous_responses: The responses from the previous year (or empty)
            - autofill_mappings: Question-to-field mappings for autofill
        """
        # Parse reporting year format (e.g., "2025-26" -> previous is "2024-25")
        previous_year = self._calculate_previous_fy(current_reporting_year)
        
        # Fetch previous year's responses
        previous_responses = await self.get_responses(
            org_id=org_id,
            framework=framework,
            reporting_year=previous_year,
            section=section
        )
        
        # Get question configs to identify which have historical autofill
        configs = await self.list_question_configs(framework=framework, section=section)
        
        # Build autofill mappings
        autofill_mappings = {}
        for config in configs:
            table_config = config.get("table_config", {})
            autofill_config = table_config.get("historical_autofill_config", {})
            
            if autofill_config.get("enabled"):
                question_key = config["question_key"]
                autofill_mappings[question_key] = {
                    "source_column": autofill_config.get("source_column"),
                    "target_column": autofill_config.get("target_column"),
                    "mappings": autofill_config.get("mappings", [])
                }
        
        return {
            "current_year": current_reporting_year,
            "previous_year": previous_year,
            "previous_responses": previous_responses.get("responses", {}) if previous_responses else {},
            "autofill_mappings": autofill_mappings,
            "has_previous_data": previous_responses is not None
        }

    def _calculate_previous_fy(self, reporting_year: str) -> str:
        """
        Calculate the previous financial year from a reporting year string.
        
        Examples:
            "2025-26" -> "2024-25"
            "2024-25" -> "2023-24"
            "CY 2025" -> "CY 2024"
        """
        if reporting_year.startswith("CY "):
            # Calendar year format: "CY 2025"
            year = int(reporting_year.replace("CY ", ""))
            return f"CY {year - 1}"
        elif "-" in reporting_year:
            # Financial year format: "2025-26"
            parts = reporting_year.split("-")
            start_year = int(parts[0])
            return f"{start_year - 1}-{str(start_year)[-2:]}"
        else:
            # Default: assume numeric year
            return str(int(reporting_year) - 1)

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def get_ngrbc_principles(self) -> List[Dict[str, str]]:
        """Get list of NGRBC principles (P1-P9)."""
        return NGRBC_PRINCIPLES


# Default service instance
esg_questionnaire_service = ESGQuestionnaireService()
