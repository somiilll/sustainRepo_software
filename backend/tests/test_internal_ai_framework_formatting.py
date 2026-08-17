"""Regression tests for deterministic Internal AI BRSR response presentation."""

import os

os.environ.setdefault("OPENAI_API_KEY", "test-key")

from modules.internal_data_ai.query_contracts import QueryType, StructuredQueryPlan
from modules.internal_data_ai.question_registry import RESPONSE_FOUND
from modules.internal_data_ai.response_builder import _build_framework_question_response


def _plan(question_key: str, label: str) -> StructuredQueryPlan:
    return StructuredQueryPlan(
        query_type=QueryType.BRSR_LOOKUP,
        framework_question_key=question_key,
        framework_display_label=label,
        framework_source_path="BRSR → Management & Process",
    )


def test_ngrbc_reasons_use_saved_human_labels_not_codes_or_booleans():
    response = _build_framework_question_response(
        _plan("ngrbc_policy_matrix", "NGRBC Policy Coverage Matrix"),
        {
            "response_state": RESPONSE_FOUND,
            "framework": "BRSR",
            "responses": [{
                "question_key": "ngrbc_policy_matrix",
                "value": {
                    "mode": "together",
                    "covered": False,
                    "reasons": {"not_ready": True, "no_resources": True},
                },
            }],
        },
        "text",
    )

    answer = response["answer"]
    assert "Policies cover NGRBCs: No" in answer
    assert "not_ready" not in answer
    assert "no_resources" not in answer
    assert "True" not in answer
    assert "The entity is not at a stage" in answer
    assert "financial or/human and technical resources" in answer


def test_training_awareness_coverage_renders_as_a_markdown_table():
    response = _build_framework_question_response(
        _plan("p1_training_awareness_coverage", "Training Awareness Coverage"),
        {
            "response_state": RESPONSE_FOUND,
            "framework": "BRSR",
            "responses": [{
                "question_key": "p1_training_awareness_coverage",
                "value": {
                    "bod_programs": 2,
                    "bod_topics": "Ethics and transparency",
                    "bod_coverage": 100,
                    "kmp_programs": 1,
                    "kmp_topics": "Anti-corruption",
                    "kmp_coverage": 83,
                    "employees_coverage": 50,
                    "workers_coverage": 10,
                },
            }],
        },
        "text",
    )

    answer = response["answer"]
    assert "| Category | Programmes Conducted | Topics Covered | Coverage |" in answer
    assert "| Board of Directors | 2 | Ethics and transparency | 100% |" in answer
    assert "| Key Managerial Personnel | 1 | Anti-corruption | 83% |" in answer
    assert "| Employees other than BoD and KMP | - | - | 50% |" in answer
    assert "| Workers | - | - | 10% |" in answer


def test_nested_training_awareness_coverage_renders_as_a_markdown_table():
    response = _build_framework_question_response(
        _plan("p1_training_awareness_coverage", "Training Awareness Coverage"),
        {
            "response_state": RESPONSE_FOUND,
            "framework": "BRSR",
            "responses": [{
                "question_key": "p1_training_awareness_coverage",
                "value": {
                    "bod": {"total": "21", "trained": "21", "pct": "100"},
                    "kmp": {"total": "12", "trained": "10", "pct": "83"},
                    "employees_other_than_bod_kmp": {"total": "10", "trained": "5", "pct": "50"},
                    "workers": {"total": "10", "trained": "1", "pct": "10"},
                },
            }],
        },
        "text",
    )

    answer = response["answer"]
    assert "| Category | Total Persons | Persons Covered | Coverage |" in answer
    assert "| Board of Directors | 21 | 21 | 100% |" in answer
    assert "| Key Managerial Personnel | 12 | 10 | 83% |" in answer
    assert "| Employees other than BoD and KMP | 10 | 5 | 50% |" in answer
    assert "| Workers | 10 | 1 | 10% |" in answer