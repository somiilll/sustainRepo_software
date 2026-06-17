"""
ESG Questionnaire Module

Config-driven ESG questionnaire system supporting:
- Framework-based questions (BRSR, GRI, SBTi)
- Reusable question types
- Dynamic rendering
- Section-based organization (environment, social, governance)
"""

from modules.esg_questionnaire.router import router
from modules.esg_questionnaire.service import esg_questionnaire_service
from modules.esg_questionnaire.contracts import (
    QuestionConfig,
    QuestionConfigCreate,
    ESGResponseCreate,
    NGRBC_PRINCIPLES,
    QUESTION_TYPES,
    ESG_SECTIONS,
    FRAMEWORKS,
)

__all__ = [
    "router",
    "esg_questionnaire_service",
    "QuestionConfig",
    "QuestionConfigCreate",
    "ESGResponseCreate",
    "NGRBC_PRINCIPLES",
    "QUESTION_TYPES",
    "ESG_SECTIONS",
    "FRAMEWORKS",
]
