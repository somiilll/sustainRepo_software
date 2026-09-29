"""Regression coverage for the Tier 1 Basic MSME questionnaire bank."""

import json
from collections import Counter
from pathlib import Path

from modules.sustainability_config.service import resolve_supplier_assessment_config_from_org_config


BASIC_JSON_PATH = Path("/app/backend/modules/supplier_assessment/data/esg_annual_basic.json")


def test_basic_bank_matches_the_tier_1_workbook_selection_and_points():
    payload = json.loads(BASIC_JSON_PATH.read_text(encoding="utf-8"))
    questions = payload["questions"]

    assert payload["id"] == "esg_annual_basic"
    assert payload["source_sheet"] == "Tier 1 - Basic (MSME)"
    assert payload["question_count"] == len(questions) == 25
    assert len({question["source_question_id"] for question in questions}) == 25
    assert sum(question["max_points"] for question in questions) == 350
    assert Counter(question["pillar"] for question in questions) == {
        "Environment": 9,
        "Social": 10,
        "Governance": 6,
    }
    assert Counter(question["assessment_type"] for question in questions) == {
        "type_a": 22,
        "type_b": 3,
    }


def test_basic_bank_defaults_to_enabled_and_can_be_disabled_independently():
    assert resolve_supplier_assessment_config_from_org_config(None)["basic_question_bank_enabled"] is True
    resolved = resolve_supplier_assessment_config_from_org_config({
        "supplier_assessment": {"basic_question_bank_enabled": False},
    })
    assert resolved["basic_question_bank_enabled"] is False
    assert resolved["standard_question_bank_enabled"] is True
    assert resolved["advanced_question_bank_enabled"] is True