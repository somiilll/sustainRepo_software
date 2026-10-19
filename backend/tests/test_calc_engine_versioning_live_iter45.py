"""Live API regression for calc-engine/emissions immutable version pinning behavior."""

import os
import uuid

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
ADMIN_EMAIL = "superadmin@ecotrack.com"
ADMIN_PASSWORD = "TestUser123!"


def _api(path: str) -> str:
    assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
    return f"{BASE_URL.rstrip('/')}{path}"


def _formula_definition(multiplier: int) -> dict:
    return {
        "inputs": [
            {
                "variable": "qty",
                "expected_unit": "kg",
                "required": True,
            }
        ],
        "properties": [],
        "steps": [
            {
                "name": "co2e_calc",
                "type": "expression",
                "expression": f"qty * {multiplier}",
            }
        ],
        "outputs": [
            {
                "variable": "co2e",
                "unit": "kgCO2e",
                "produced_by_step": "co2e_calc",
            }
        ],
    }


@pytest.fixture(scope="module")
def api_session():
    """Auth/session module fixture for live API checks."""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})

    login_resp = session.post(
        _api("/api/auth/login"),
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    if login_resp.status_code != 200:
        pytest.skip(f"Admin login failed: {login_resp.status_code} {login_resp.text[:200]}")

    token = (login_resp.json() or {}).get("access_token") or (login_resp.json() or {}).get("token")
    if not token:
        pytest.skip("Login succeeded but no bearer token found")

    session.headers.update({"Authorization": f"Bearer {token}"})
    yield session


@pytest.fixture(scope="module")
def facility_id(api_session):
    """Facility fixture for emission create/update regression checks."""
    response = api_session.get(_api("/api/facilities"), timeout=30)
    assert response.status_code == 200, response.text[:300]
    facilities = response.json()
    assert isinstance(facilities, list) and facilities, "No facilities available for admin account"
    with_org = [facility for facility in facilities if facility.get("organization_id")]
    chosen = with_org[0] if with_org else facilities[0]
    return chosen["id"]


@pytest.fixture(scope="module")
def temp_catalog(api_session):
    """Create isolated formula+decision-tree versions for immutable pinning tests."""
    temp_category = f"TEST_CAT_VERSIONING_{uuid.uuid4().hex[:8]}"
    formula_name = f"TEST Formula Versioning {uuid.uuid4().hex[:6]}"

    create_formula_payload = {
        "name": formula_name,
        "description": "TEST formula for immutable versioning",
        "scope_ids": ["scope1"],
        "category_id": temp_category,
        "definition": _formula_definition(1),
    }
    create_formula_resp = api_session.post(
        _api("/api/super-admin/calc-engine/formulas"),
        json=create_formula_payload,
        timeout=30,
    )
    assert create_formula_resp.status_code == 200, create_formula_resp.text[:500]
    formula_v1_doc = create_formula_resp.json()

    create_tree_resp = api_session.post(
        _api("/api/super-admin/calc-engine/decision-trees"),
        json={"category_id": temp_category, "tree": {"formula_id": formula_v1_doc["id"]}},
        timeout=30,
    )
    assert create_tree_resp.status_code == 200, create_tree_resp.text[:500]
    tree_v1_doc = create_tree_resp.json()

    update_formula_payload = {
        **create_formula_payload,
        "definition": _formula_definition(2),
    }
    update_formula_resp = api_session.put(
        _api(f"/api/super-admin/calc-engine/formulas/{formula_v1_doc['id']}"),
        json=update_formula_payload,
        timeout=30,
    )
    assert update_formula_resp.status_code == 200, update_formula_resp.text[:500]
    formula_v2_doc = update_formula_resp.json()

    trees_resp = api_session.get(
        _api(f"/api/calc-engine/decision-trees?category_id={temp_category}"),
        timeout=30,
    )
    assert trees_resp.status_code == 200, trees_resp.text[:300]
    trees = trees_resp.json()
    assert trees, "No decision tree returned for test category"
    active_tree = trees[0]

    ctx = {
        "category_id": temp_category,
        "formula_id": formula_v1_doc["id"],
        "formula_version_v1": formula_v1_doc["version_id"],
        "formula_version_v2": formula_v2_doc["version_id"],
        "tree_id": tree_v1_doc["id"],
        "tree_version_v1": tree_v1_doc["version_id"],
        "tree_version_v2": active_tree.get("version_id"),
    }

    yield ctx

    api_session.delete(_api(f"/api/super-admin/calc-engine/decision-trees/{ctx['tree_id']}"), timeout=30)
    api_session.delete(_api(f"/api/super-admin/calc-engine/formulas/{ctx['formula_id']}"), timeout=30)


@pytest.fixture(scope="module")
def created_emission_ids():
    """Capture created generic emission IDs for teardown."""
    return []


def _base_emission_payload(facility_id: str) -> dict:
    return {
        "facility_id": facility_id,
        "reporting_period": "2099-01",
        "frequency_type": "monthly",
        "scope": "scope1",
        "category": "TEST Versioned Stationary",
        "sub_category": "TEST Fuel",
        "dynamic_field_values": {
            "qty": {"value": 10, "unit": "kg"}
        },
        "outputs": {
            "co2e": {"value": 0.01, "unit": "tCO2e"}
        },
        "notes": "TEST immutable versioning",
    }


def test_form_config_returns_decision_tree_and_formula_versions(api_session, temp_catalog):
    """Calc-engine form-config endpoint contract for version identifiers."""
    response = api_session.get(
        _api(f"/api/calc-engine/form-config/{temp_catalog['category_id']}?scope=scope1"),
        timeout=30,
    )
    assert response.status_code == 200, response.text[:400]
    data = response.json()

    assert data.get("decision_tree_version_id") == temp_catalog["tree_version_v2"]
    assert isinstance(data.get("formulas"), list) and data["formulas"]
    assert all(formula.get("version_id") for formula in data["formulas"])


def test_pinned_form_config_resolves_historical_versions(api_session, temp_catalog):
    """Pinned form-config should resolve historical tree/formula versions, not latest."""
    url = (
        f"/api/calc-engine/form-config/{temp_catalog['category_id']}"
        f"?scope=scope1&decision_tree_version_id={temp_catalog['tree_version_v1']}"
        f"&formula_version_id={temp_catalog['formula_version_v1']}"
    )
    response = api_session.get(_api(url), timeout=30)
    assert response.status_code == 200, response.text[:400]
    data = response.json()

    assert data.get("decision_tree_version_id") == temp_catalog["tree_version_v1"]
    matching = [
        item for item in data.get("formulas", [])
        if item.get("id") == temp_catalog["formula_id"]
    ]
    assert matching, "Pinned config did not include target formula"
    assert matching[0].get("version_id") == temp_catalog["formula_version_v1"]


def test_execute_by_category_returns_resolved_versions_and_snapshot(api_session, temp_catalog):
    """Execution response must include resolved versions + canonical formula snapshot."""
    response = api_session.post(
        _api("/api/calc-engine/execute-by-category"),
        json={
            "category_id": temp_catalog["category_id"],
            "decision_inputs": {},
            "inputs": {"qty": {"value": 5, "unit": "kg"}},
            "context": {},
            "user_overrides": {},
            "dry_run": True,
            "decision_tree_version_id": temp_catalog["tree_version_v1"],
            "formula_version_id": temp_catalog["formula_version_v1"],
        },
        timeout=30,
    )
    assert response.status_code == 200, response.text[:500]
    data = response.json()

    assert data.get("resolved_formula", {}).get("version_id") == temp_catalog["formula_version_v1"]
    assert data.get("resolved_decision_tree", {}).get("version_id") == temp_catalog["tree_version_v1"]
    snapshot = data.get("formula_snapshot") or {}
    assert snapshot.get("formula_version_id") == temp_catalog["formula_version_v1"]
    assert snapshot.get("definition", {}).get("steps", [])[0].get("expression") == "qty * 1"


def test_generic_emission_create_persists_version_refs(
    api_session,
    facility_id,
    temp_catalog,
    created_emission_ids,
):
    """Generic manual emission create stores immutable version references + snapshot."""
    payload = {
        **_base_emission_payload(facility_id),
        "formula_id": temp_catalog["formula_id"],
        "formula_version_id": temp_catalog["formula_version_v1"],
        "decision_tree_version_id": temp_catalog["tree_version_v1"],
    }
    response = api_session.post(_api("/api/emissions"), json=payload, timeout=30)
    assert response.status_code == 200, response.text[:500]
    data = response.json()
    created_emission_ids.append(data["id"])

    assert data.get("formula_version_id") == temp_catalog["formula_version_v1"]
    assert data.get("decision_tree_version_id") == temp_catalog["tree_version_v1"]
    assert data.get("formula_snapshot", {}).get("formula_version_id") == temp_catalog["formula_version_v1"]


def test_versioned_emission_edit_rejects_switch_to_newer_versions(
    api_session,
    facility_id,
    temp_catalog,
    created_emission_ids,
):
    """Editing a pinned emission cannot move to newer decision-tree/formula versions."""
    create_payload = {
        **_base_emission_payload(facility_id),
        "notes": "TEST pinned edit rejection",
        "formula_id": temp_catalog["formula_id"],
        "formula_version_id": temp_catalog["formula_version_v1"],
        "decision_tree_version_id": temp_catalog["tree_version_v1"],
    }
    create_resp = api_session.post(_api("/api/emissions"), json=create_payload, timeout=30)
    assert create_resp.status_code == 200, create_resp.text[:500]
    created = create_resp.json()
    created_emission_ids.append(created["id"])

    update_payload = {
        **_base_emission_payload(facility_id),
        "notes": "TEST attempt to switch pinned versions",
        "formula_id": temp_catalog["formula_id"],
        "formula_version_id": temp_catalog["formula_version_v2"],
        "decision_tree_version_id": temp_catalog["tree_version_v2"],
    }
    update_resp = api_session.put(
        _api(f"/api/emissions/{created['id']}"),
        json=update_payload,
        timeout=30,
    )
    assert update_resp.status_code == 409, update_resp.text[:500]


def test_unversioned_emission_update_remains_unversioned(
    api_session,
    facility_id,
    created_emission_ids,
):
    """Legacy/unversioned records should not silently gain version references on edit."""
    create_payload = {
        **_base_emission_payload(facility_id),
        "notes": "TEST legacy unversioned create",
    }
    create_resp = api_session.post(_api("/api/emissions"), json=create_payload, timeout=30)
    assert create_resp.status_code == 200, create_resp.text[:500]
    created = create_resp.json()
    created_emission_ids.append(created["id"])

    update_payload = {
        **_base_emission_payload(facility_id),
        "notes": "TEST legacy unversioned update",
    }
    update_resp = api_session.put(
        _api(f"/api/emissions/{created['id']}"),
        json=update_payload,
        timeout=30,
    )
    assert update_resp.status_code == 200, update_resp.text[:500]
    updated = update_resp.json()

    assert not updated.get("formula_version_id")
    assert not updated.get("decision_tree_version_id")
    assert not updated.get("formula_snapshot")


def test_formula_update_appends_formula_and_linked_tree_versions(api_session, temp_catalog):
    """Formula update must append formula version and linked active tree version."""
    versions_resp = api_session.get(
        _api(f"/api/calc-engine/formulas/{temp_catalog['formula_id']}/versions"),
        timeout=30,
    )
    assert versions_resp.status_code == 200, versions_resp.text[:300]
    versions = versions_resp.json()
    version_ids = {item.get("id") for item in versions}
    assert temp_catalog["formula_version_v1"] in version_ids
    assert temp_catalog["formula_version_v2"] in version_ids
    assert len(versions) >= 2

    tree_resp = api_session.get(
        _api(f"/api/calc-engine/decision-trees?category_id={temp_catalog['category_id']}"),
        timeout=30,
    )
    assert tree_resp.status_code == 200, tree_resp.text[:300]
    tree = tree_resp.json()[0]
    assert tree.get("version_id") == temp_catalog["tree_version_v2"]
    assert tree.get("version_id") != temp_catalog["tree_version_v1"]


def test_c7_create_persists_versions_and_edit_stays_pinned(api_session, facility_id, temp_catalog):
    """C7 create should persist versions; C7 edit must reject switching pinned versions."""
    suffix = uuid.uuid4().hex[:6]
    create_payload = {
        "facility_id": facility_id,
        "reporting_year": 2099,
        "reporting_month": "jan",
        "calculation_method": "activity_basis",
        "activity_type": "car",
        "activity_name": f"TEST_C7_{suffix}",
        "formula_id": temp_catalog["formula_id"],
        "formula_version_id": temp_catalog["formula_version_v1"],
        "decision_tree_version_id": temp_catalog["tree_version_v1"],
        "formula_name": "TEST formula",
        "employees": [
            {
                "id": f"emp-{suffix}",
                "name": "TEST Employee",
                "inputs": {"km_travelled": 100},
                "emissions": {"co2e": 1.2},
            }
        ],
        "notes": f"TEST_C7_VERSIONING_{suffix}",
    }
    create_resp = api_session.post(_api("/api/emissions/c7/month"), json=create_payload, timeout=30)
    assert create_resp.status_code == 200, create_resp.text[:500]
    created = create_resp.json()

    fetch_resp = api_session.get(_api(f"/api/emissions/{created['id']}"), timeout=30)
    assert fetch_resp.status_code == 200, fetch_resp.text[:500]
    persisted = fetch_resp.json()
    assert persisted.get("formula_version_id") == temp_catalog["formula_version_v1"]
    assert persisted.get("decision_tree_version_id") == temp_catalog["tree_version_v1"]

    update_payload = {
        **create_payload,
        "entry_id": created["id"],
        "formula_version_id": temp_catalog["formula_version_v2"],
        "decision_tree_version_id": temp_catalog["tree_version_v2"],
    }
    update_resp = api_session.post(_api("/api/emissions/c7/month"), json=update_payload, timeout=30)
    assert update_resp.status_code == 409, update_resp.text[:500]

    api_session.delete(_api(f"/api/emissions/c7/{created['id']}"), timeout=30)


def test_c7_yearly_create_persists_versions(api_session, facility_id, temp_catalog):
    """The yearly C7 contract must accept and return the pinned catalog versions."""
    suffix = uuid.uuid4().hex[:6]
    response = api_session.post(
        _api("/api/emissions/c7/yearly"),
        json={
            "facility_id": facility_id,
            "reporting_year": "CY2098",
            "calculation_method": "activity_basis",
            "activity_type": "car",
            "activity_name": f"TEST_C7_YEARLY_{suffix}",
            "formula_id": temp_catalog["formula_id"],
            "formula_version_id": temp_catalog["formula_version_v1"],
            "decision_tree_version_id": temp_catalog["tree_version_v1"],
            "formula_name": "TEST formula",
            "employees": [{
                "id": f"emp-{suffix}",
                "name": "TEST Employee",
                "inputs": {"km_travelled": 100},
                "emissions": {"co2e": 1.2},
            }],
            "notes": f"TEST_C7_YEARLY_VERSIONING_{suffix}",
        },
        timeout=30,
    )
    assert response.status_code == 200, response.text[:500]
    created = response.json()
    assert created.get("formula_version_id") == temp_catalog["formula_version_v1"]
    assert created.get("decision_tree_version_id") == temp_catalog["tree_version_v1"]
    assert created.get("formula_snapshot", {}).get("formula_version_id") == temp_catalog["formula_version_v1"]

    api_session.delete(_api(f"/api/emissions/{created['id']}"), timeout=30)


@pytest.fixture(scope="module", autouse=True)
def cleanup_generic_emissions(api_session, created_emission_ids):
    """Best-effort cleanup for generic emission records created in this module."""
    yield
    for record_id in created_emission_ids:
        try:
            api_session.delete(_api(f"/api/emissions/{record_id}"), timeout=20)
        except Exception:
            pass