"""Regression tests for ESG Annual (Standard) bank rollout and org-config sync."""

import copy
import json
import os
from pathlib import Path

import pytest
import requests

from shared.database.mongo import db
from modules.supplier_assessment.questionnaire_service import (
    seed_bundled_questionnaire_banks,
    sync_questionnaire_banks_for_all_organizations,
)
from modules.sustainability_config.service import (
    DEFAULT_SUPPLIER_ASSESSMENT_CONFIG,
    resolve_supplier_assessment_config_from_org_config,
)


# Module: bundled standard questionnaire JSON integrity
STANDARD_JSON_PATH = Path("/app/backend/modules/supplier_assessment/data/esg_annual_standard.json")

# Module: super-admin API checks for org config toggles
SUPER_ADMIN_TOKEN = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiIwZjkwYzc0MC1iODA3LTQxZTEtODk3MS00MjAwNWUxY2ZiM2UiLCJleHAiOjE3OTA2OTI4MDgsInR5cGUiOiJhY2Nlc3MifQ."
    "MecIKOw3uXpvuOOw0143FB5Ih2cqJENV1IJwGPughMo"
)


def _base_url() -> str:
    value = os.environ.get("REACT_APP_BACKEND_URL")
    if not value:
        pytest.fail("REACT_APP_BACKEND_URL is required for API tests")
    return value.rstrip("/")


def _api_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "Authorization": f"Bearer {SUPER_ADMIN_TOKEN}",
            "Content-Type": "application/json",
        }
    )
    return session


@pytest.mark.asyncio
async def test_standard_bank_json_integrity_counts_and_distribution():
    payload = json.loads(STANDARD_JSON_PATH.read_text(encoding="utf-8"))
    questions = payload.get("questions", [])

    assert payload.get("question_count") == 55
    assert len(questions) == 55

    source_ids = [q.get("source_question_id") for q in questions]
    assert len(set(source_ids)) == 55

    total_points = sum(float(q.get("max_points") or 0) for q in questions)
    assert total_points == 725

    pillars = {"Environment": 0, "Social": 0, "Governance": 0}
    types = {"type_a": 0, "type_b": 0, "type_c": 0}
    for question in questions:
        pillars[question.get("pillar")] += 1
        types[question.get("assessment_type")] += 1

    assert pillars == {"Environment": 22, "Social": 20, "Governance": 13}
    assert types == {"type_a": 35, "type_b": 5, "type_c": 15}


@pytest.mark.asyncio
async def test_each_active_org_has_single_active_standard_questionnaire_with_55_questions():
    organizations = await db.organizations.find(
        {"is_active": {"$ne": False}, "is_deleted": {"$ne": True}},
        {"_id": 0, "id": 1},
    ).to_list(None)
    assert organizations, "No active organizations found"

    for organization in organizations:
        standard_questionnaires = await db.supplier_questionnaires.find(
            {
                "organization_id": organization["id"],
                "system_question_bank": "standard",
                "is_deleted": {"$ne": True},
            },
            {"_id": 0, "id": 1, "is_active": 1},
        ).to_list(20)

        assert len(standard_questionnaires) == 1, organization["id"]
        questionnaire = standard_questionnaires[0]
        assert questionnaire.get("is_active") is True, organization["id"]

        active_questions = await db.supplier_questions.find(
            {"questionnaire_id": questionnaire["id"], "is_active": True},
            {"_id": 0, "source_question_id": 1},
        ).to_list(200)
        assert len(active_questions) == 55, organization["id"]

        active_source_ids = [q.get("source_question_id") for q in active_questions]
        assert len(set(active_source_ids)) == 55, organization["id"]


@pytest.mark.asyncio
async def test_seed_and_all_org_sync_are_idempotent_for_standard_bank():
    organizations = await db.organizations.find(
        {"is_active": {"$ne": False}, "is_deleted": {"$ne": True}},
        {"_id": 0, "id": 1},
    ).to_list(None)
    assert organizations

    before = {}
    for organization in organizations:
        docs = await db.supplier_questionnaires.find(
            {
                "organization_id": organization["id"],
                "system_question_bank": "standard",
                "is_deleted": {"$ne": True},
            },
            {"_id": 0, "id": 1},
        ).to_list(20)
        before[organization["id"]] = [d["id"] for d in docs]

    before_bank_count = await db.supplier_question_banks.count_documents({"id": "esg_annual_standard"})
    before_questionnaire_count = await db.supplier_questionnaires.count_documents({"system_question_bank": "standard"})
    before_question_count = await db.supplier_questions.count_documents({"system_question_bank": "standard"})

    await seed_bundled_questionnaire_banks()
    await sync_questionnaire_banks_for_all_organizations()
    await sync_questionnaire_banks_for_all_organizations()

    after_bank_count = await db.supplier_question_banks.count_documents({"id": "esg_annual_standard"})
    after_questionnaire_count = await db.supplier_questionnaires.count_documents({"system_question_bank": "standard"})
    after_question_count = await db.supplier_questions.count_documents({"system_question_bank": "standard"})

    assert after_bank_count == 1
    assert after_bank_count == before_bank_count
    assert after_questionnaire_count == before_questionnaire_count
    assert after_question_count == before_question_count

    for organization in organizations:
        docs = await db.supplier_questionnaires.find(
            {
                "organization_id": organization["id"],
                "system_question_bank": "standard",
                "is_deleted": {"$ne": True},
            },
            {"_id": 0, "id": 1},
        ).to_list(20)
        assert [d["id"] for d in docs] == before[organization["id"]], organization["id"]


def test_startup_wires_all_org_questionnaire_bank_sync():
    server_py = Path("/app/backend/server.py").read_text(encoding="utf-8")
    assert "@app.on_event(\"startup\")" in server_py
    assert "sync_questionnaire_banks_for_all_organizations" in server_py
    assert "await sync_questionnaire_banks_for_all_organizations()" in server_py


def test_supplier_assessment_config_defaults_and_independent_resolver_flags():
    resolved_default = resolve_supplier_assessment_config_from_org_config(None)
    assert resolved_default["standard_question_bank_enabled"] is True
    assert resolved_default["advanced_question_bank_enabled"] is True

    resolved_standard_off = resolve_supplier_assessment_config_from_org_config(
        {"supplier_assessment": {"standard_question_bank_enabled": False}}
    )
    assert resolved_standard_off["standard_question_bank_enabled"] is False
    assert resolved_standard_off["advanced_question_bank_enabled"] is True

    resolved_advanced_off = resolve_supplier_assessment_config_from_org_config(
        {"supplier_assessment": {"advanced_question_bank_enabled": False}}
    )
    assert resolved_advanced_off["standard_question_bank_enabled"] is True
    assert resolved_advanced_off["advanced_question_bank_enabled"] is False


@pytest.mark.asyncio
async def test_org_config_toggle_standard_syncs_without_affecting_advanced_and_without_duplicates():
    base = _base_url()
    session = _api_session()

    orgs_res = session.get(f"{base}/api/sustainability-config/organizations", timeout=30)
    assert orgs_res.status_code == 200
    organizations = orgs_res.json()
    assert organizations
    org_id = organizations[0]["id"]

    cfg_res = session.get(f"{base}/api/sustainability-config/org-config", params={"org_id": org_id}, timeout=30)
    assert cfg_res.status_code == 200
    current_cfg = cfg_res.json() or {}

    original_supplier_assessment = copy.deepcopy(
        current_cfg.get("supplier_assessment") or DEFAULT_SUPPLIER_ASSESSMENT_CONFIG
    )

    standard_doc = await db.supplier_questionnaires.find_one(
        {"organization_id": org_id, "system_question_bank": "standard", "is_deleted": {"$ne": True}},
        {"_id": 0, "id": 1, "is_active": 1},
    )
    assert standard_doc is not None
    standard_id = standard_doc["id"]

    advanced_doc = await db.supplier_questionnaires.find_one(
        {"organization_id": org_id, "system_question_bank": "advanced", "is_deleted": {"$ne": True}},
        {"_id": 0, "id": 1, "is_active": 1},
    )
    assert advanced_doc is not None
    advanced_id = advanced_doc["id"]
    advanced_active_before = advanced_doc.get("is_active")

    disabled_payload = copy.deepcopy(original_supplier_assessment)
    disabled_payload["standard_question_bank_enabled"] = False

    disable_res = session.put(
        f"{base}/api/sustainability-config/org-config",
        params={"org_id": org_id},
        json={"supplier_assessment": disabled_payload},
        timeout=40,
    )
    assert disable_res.status_code == 200

    standard_after_disable = await db.supplier_questionnaires.find_one(
        {"id": standard_id}, {"_id": 0, "is_active": 1}
    )
    advanced_after_disable = await db.supplier_questionnaires.find_one(
        {"id": advanced_id}, {"_id": 0, "is_active": 1}
    )
    assert standard_after_disable["is_active"] is False
    assert advanced_after_disable["is_active"] == advanced_active_before

    enabled_payload = copy.deepcopy(disabled_payload)
    enabled_payload["standard_question_bank_enabled"] = True
    enable_res = session.put(
        f"{base}/api/sustainability-config/org-config",
        params={"org_id": org_id},
        json={"supplier_assessment": enabled_payload},
        timeout=40,
    )
    assert enable_res.status_code == 200

    standard_after_enable = await db.supplier_questionnaires.find_one(
        {"id": standard_id}, {"_id": 0, "is_active": 1}
    )
    assert standard_after_enable["is_active"] is True

    same_standard_docs = await db.supplier_questionnaires.find(
        {"organization_id": org_id, "system_question_bank": "standard", "is_deleted": {"$ne": True}},
        {"_id": 0, "id": 1},
    ).to_list(20)
    assert len(same_standard_docs) == 1
    assert same_standard_docs[0]["id"] == standard_id

    question_total = await db.supplier_questions.count_documents({"questionnaire_id": standard_id})
    active_question_total = await db.supplier_questions.count_documents(
        {"questionnaire_id": standard_id, "is_active": True}
    )
    assert question_total == 55
    assert active_question_total == 55

    restore_res = session.put(
        f"{base}/api/sustainability-config/org-config",
        params={"org_id": org_id},
        json={"supplier_assessment": original_supplier_assessment},
        timeout=40,
    )
    assert restore_res.status_code == 200


@pytest.mark.asyncio
async def test_delete_org_config_reapplies_default_bank_activation_if_org_had_no_config():
    base = _base_url()
    session = _api_session()

    orgs_res = session.get(f"{base}/api/sustainability-config/organizations", timeout=30)
    assert orgs_res.status_code == 200
    organizations = orgs_res.json()

    target = next((org for org in organizations if not org.get("has_config")), None)
    if not target:
        pytest.skip("No organization without existing config available for safe delete-config sync test")

    org_id = target["id"]
    disabled_payload = copy.deepcopy(DEFAULT_SUPPLIER_ASSESSMENT_CONFIG)
    disabled_payload["standard_question_bank_enabled"] = False
    disabled_payload["advanced_question_bank_enabled"] = True

    disable_res = session.put(
        f"{base}/api/sustainability-config/org-config",
        params={"org_id": org_id},
        json={"supplier_assessment": disabled_payload},
        timeout=40,
    )
    assert disable_res.status_code == 200

    standard = await db.supplier_questionnaires.find_one(
        {"organization_id": org_id, "system_question_bank": "standard", "is_deleted": {"$ne": True}},
        {"_id": 0, "is_active": 1},
    )
    assert standard and standard.get("is_active") is False

    delete_res = session.delete(
        f"{base}/api/sustainability-config/org-config",
        params={"org_id": org_id},
        timeout=40,
    )
    assert delete_res.status_code == 200

    standard_after = await db.supplier_questionnaires.find_one(
        {"organization_id": org_id, "system_question_bank": "standard", "is_deleted": {"$ne": True}},
        {"_id": 0, "is_active": 1},
    )
    advanced_after = await db.supplier_questionnaires.find_one(
        {"organization_id": org_id, "system_question_bank": "advanced", "is_deleted": {"$ne": True}},
        {"_id": 0, "is_active": 1},
    )
    assert standard_after and standard_after.get("is_active") is True
    assert advanced_after and advanced_after.get("is_active") is True
