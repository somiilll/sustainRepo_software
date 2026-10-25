"""Align BRSR Section A/B configs with Annexure II without changing saved responses."""
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from modules.brsr_report.mapping_excel import _question_answer_paths
from shared.database.mongo import db


SECTION_A_UPDATES: Dict[str, Dict[str, Any]] = {
    "brsr_a_employees_workers": {
        "question": "a. Employees and workers (including differently abled)",
        "order": 20,
        "disclosure_number": "A-20a",
        "config": {
            "categories": [
                {"key": "employees", "label": "EMPLOYEES", "sub_categories": [
                    {"key": "permanent", "label": "Permanent (D)"},
                    {"key": "other_than_permanent", "label": "Other than Permanent (E)"},
                ]},
                {"key": "workers", "label": "WORKERS", "sub_categories": [
                    {"key": "permanent", "label": "Permanent (F)"},
                    {"key": "other_than_permanent", "label": "Other than Permanent (G)"},
                ]},
            ],
            "columns": ["total", "male", "male_percentage", "female", "female_percentage"],
            "column_groups": [
                {"label": "Male", "columns": ["male", "male_percentage"]},
                {"label": "Female", "columns": ["female", "female_percentage"]},
            ],
        },
    },
    "brsr_a_differently_abled": {
        "question": "b. Differently abled Employees and workers",
        "order": 20.1,
        "disclosure_number": "A-20b",
        "config": {
            "categories": [
                {"key": "employees", "label": "DIFFERENTLY ABLED EMPLOYEES", "sub_categories": [
                    {"key": "permanent", "label": "Permanent (D)"},
                    {"key": "other_than_permanent", "label": "Other than Permanent (E)"},
                ]},
                {"key": "workers", "label": "DIFFERENTLY ABLED WORKERS", "sub_categories": [
                    {"key": "permanent", "label": "Permanent (F)"},
                    {"key": "other_than_permanent", "label": "Other than Permanent (G)"},
                ]},
            ],
            "columns": ["total", "male", "male_percentage", "female", "female_percentage"],
            "column_groups": [
                {"label": "Male", "columns": ["male", "male_percentage"]},
                {"label": "Female", "columns": ["female", "female_percentage"]},
            ],
        },
    },
    "brsr_a_women_representation": {
        "order": 21,
        "disclosure_number": "A-21",
        "type": "fixed_row_table",
        "table_config": {
            "fixed_rows": [
                {"key": "board_of_directors", "label": "Board of Directors"},
                {"key": "key_management_personnel", "label": "Key Management Personnel"},
            ],
            "columns": [
                {"key": "total", "label": "Total (A)", "type": "number"},
                {"key": "number_of_females", "label": "No. of Females (B)", "type": "number"},
                {"key": "percentage", "label": "% (B/A)", "type": "computed"},
            ],
        },
        "answer_paths": [
            "rows.board_of_directors.total", "rows.board_of_directors.number_of_females", "rows.board_of_directors.percentage",
            "rows.key_management_personnel.total", "rows.key_management_personnel.number_of_females", "rows.key_management_personnel.percentage",
        ],
    },
    "brsr_a_turnover_rate": {"order": 22, "disclosure_number": "A-22"},
    "brsr_a_holding_subsidiary": {"order": 23, "disclosure_number": "A-23"},
    "brsr_a_csr_applicability": {"order": 24, "disclosure_number": "A-24"},
    "brsr_a_complaints_grievances": {"order": 25, "disclosure_number": "A-25"},
    "brsr_a_material_issues": {
        "order": 26,
        "disclosure_number": "A-26",
        "group": "VII. Transparency and Disclosures Compliances",
    },
}


SECTION_B_UPDATES: Dict[str, Dict[str, Any]] = {
    "ngrbc_policy_matrix": {"disclosure_number": "B-1/12", "brsr_principle": "SECTION_B"},
    "policy_translated_to_procedures": {"disclosure_number": "B-2", "brsr_principle": "SECTION_B"},
    "policy_extend_to_value_chain": {"disclosure_number": "B-3", "brsr_principle": "SECTION_B"},
    "codes_certifications_standards": {"disclosure_number": "B-4", "brsr_principle": "SECTION_B"},
    "commitments_goals_targets": {"disclosure_number": "B-5", "brsr_principle": "SECTION_B"},
    "performance_against_targets": {"disclosure_number": "B-6", "brsr_principle": "SECTION_B"},
    "director_statement": {"disclosure_number": "B-7", "brsr_principle": "SECTION_B"},
    "highest_authority_details": {"disclosure_number": "B-8", "brsr_principle": "SECTION_B"},
    "sustainability_committee_details": {"disclosure_number": "B-9", "brsr_principle": "SECTION_B"},
    "ngrbc_review_details": {
        "disclosure_number": "B-10", "brsr_principle": "SECTION_B", "type": "ngrbc_review_matrix",
        "question": "Details of Review of NGRBCs by the Company",
        "table_config": {
            "principles": [f"P{index}" for index in range(1, 10)],
            "fixed_rows": [
                {"key": "performance_against_policies", "label": "Performance against above policies and follow up action"},
                {"key": "statutory_compliance", "label": "Compliance with statutory requirements of relevance to the principles, and rectification of any non-compliances"},
            ],
            "review_options": ["Director", "Committee of the Board", "Any Other Committee"],
            "frequency_options": ["Annually", "Half Yearly", "Quarterly", "Any Other"],
        },
        "answer_paths": [
            f"rows.{row}.{field}.P{principle}"
            for row in ("performance_against_policies", "statutory_compliance")
            for field in ("review_by", "frequency")
            for principle in range(1, 10)
        ],
    },
    "performance_against_policies": {
        "disclosure_number": "B-10", "brsr_principle": "SECTION_B", "hidden": True,
        "legacy_alias_for": "ngrbc_review_details",
    },
    "independent_policy_assessment": {"disclosure_number": "B-11", "brsr_principle": "SECTION_B"},
}


MISSING_SECTION_A_CONFIGS: List[Dict[str, Any]] = [
    {
        "question_key": "brsr_a_export_contribution",
        "question": "What is the contribution of exports as a percentage of the total turnover of the entity?",
        "section": "section_a", "frameworks": ["BRSR"], "brsr_principle": "SECTION_A",
        "type": "number", "order": 19.1, "group": "III. Operations", "required": True,
        "disclosure_number": "A-19b", "answer_paths": ["value"], "response_mode": "atomic",
    },
    {
        "question_key": "brsr_a_customer_types",
        "question": "A brief on types of customers",
        "section": "section_a", "frameworks": ["BRSR"], "brsr_principle": "SECTION_A",
        "type": "textarea", "order": 19.2, "group": "III. Operations", "required": True,
        "disclosure_number": "A-19c", "answer_paths": ["value"], "response_mode": "atomic",
    },
]


async def sync() -> Dict[str, int]:
    now = datetime.now(timezone.utc).isoformat()
    counts = {"updated": 0, "inserted": 0}
    for question_key, fields in {**SECTION_A_UPDATES, **SECTION_B_UPDATES}.items():
        result = await db.esg_question_configs.update_one(
            {"question_key": question_key}, {"$set": {**fields, "updated_at": now}}
        )
        counts["updated"] += result.modified_count

    for config in MISSING_SECTION_A_CONFIGS:
        existing = await db.esg_question_configs.find_one({"question_key": config["question_key"]}, {"_id": 0, "question_key": 1})
        if existing:
            await db.esg_question_configs.update_one(
                {"question_key": config["question_key"]}, {"$set": {**config, "updated_at": now}}
            )
        else:
            await db.esg_question_configs.insert_one({**config, "created_at": now, "updated_at": now})
            counts["inserted"] += 1

    configs = await db.esg_question_configs.find(
        {"frameworks": "BRSR", "section": {"$in": ["section_a", "section_b"]}}, {"_id": 0}
    ).to_list(500)
    for config in configs:
        paths = _question_answer_paths(config, [])
        await db.esg_question_configs.update_one(
            {"question_key": config["question_key"]},
            {"$set": {"answer_paths": paths, "updated_at": now}},
        )
    return counts


if __name__ == "__main__":
    print(asyncio.run(sync()))