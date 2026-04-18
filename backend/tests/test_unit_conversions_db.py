"""Tests for DB-driven unit conversions CRUD and convert endpoint."""
import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
SUPERADMIN_EMAIL = "superadmin@ecotrack.com"
SUPERADMIN_PASSWORD = "SuperAdmin123!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": SUPERADMIN_EMAIL, "password": SUPERADMIN_PASSWORD},
        timeout=20,
    )
    if r.status_code != 200:
        pytest.skip(f"login failed: {r.status_code} {r.text}")
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    if not tok:
        pytest.skip(f"no token in response: {data}")
    return tok


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_list_unit_conversions(h):
    r = requests.get(f"{BASE_URL}/api/calc-engine/unit-conversions", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    # Expect at least seeded L->m3 and tonne->kg
    keys = {(c["from_unit"], c["to_unit"]) for c in data}
    assert ("L", "m3") in keys, f"Missing L->m3 in conversions. Got: {keys}"
    assert ("tonne", "kg") in keys, f"Missing tonne->kg in conversions. Got: {keys}"


def test_convert_direct_L_to_m3(h):
    r = requests.get(
        f"{BASE_URL}/api/calc-engine/convert",
        params={"value": 1000, "from_unit": "L", "to_unit": "m3"},
        headers=h, timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert abs(data["result"] - 1.0) < 1e-9
    assert data["factor"] == 0.001
    assert "conversion_id" in data


def test_convert_reverse_m3_to_L(h):
    """Reverse conversion: m3->L should use inverse of L->m3 factor."""
    r = requests.get(
        f"{BASE_URL}/api/calc-engine/convert",
        params={"value": 2, "from_unit": "m3", "to_unit": "L"},
        headers=h, timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert abs(data["result"] - 2000.0) < 1e-6, data
    assert data.get("reverse") is True
    assert abs(data["factor"] - 1000.0) < 1e-6


def test_convert_tonne_to_kg(h):
    r = requests.get(
        f"{BASE_URL}/api/calc-engine/convert",
        params={"value": 5, "from_unit": "tonne", "to_unit": "kg"},
        headers=h, timeout=20,
    )
    assert r.status_code == 200, r.text
    assert abs(r.json()["result"] - 5000.0) < 1e-6


def test_convert_same_unit(h):
    r = requests.get(
        f"{BASE_URL}/api/calc-engine/convert",
        params={"value": 42, "from_unit": "kg", "to_unit": "kg"},
        headers=h, timeout=20,
    )
    assert r.status_code == 200
    assert r.json()["result"] == 42


def test_convert_undefined_returns_404(h):
    # Use unit keys that exist but no conversion defined
    r = requests.get(
        f"{BASE_URL}/api/calc-engine/convert",
        params={"value": 1, "from_unit": "USD", "to_unit": "INR"},
        headers=h, timeout=20,
    )
    # There's no defined USD->INR conversion in ce_unit_conversions
    assert r.status_code == 404, r.text


def test_crud_unit_conversion_lifecycle(h):
    # Create a throwaway conversion: kg -> g (should not exist)
    unique_desc = f"TEST_{uuid.uuid4().hex[:8]}"
    from_u, to_u = "kg", "g"
    payload = {
        "from_unit": from_u,
        "to_unit": to_u,
        "factor": 1000,
        "description": unique_desc,
    }
    # Best-effort cleanup of any prior test run (including inactive)
    lst_all = requests.get(f"{BASE_URL}/api/calc-engine/unit-conversions",
                           params={"from_unit": from_u, "to_unit": to_u},
                           headers=h, timeout=20).json()
    for c in lst_all:
        requests.delete(f"{BASE_URL}/api/super-admin/calc-engine/unit-conversions/{c['id']}",
                        headers=h, timeout=20)
    created = requests.post(
        f"{BASE_URL}/api/super-admin/calc-engine/unit-conversions",
        json=payload, headers=h, timeout=20,
    )
    if created.status_code == 400 and "already exists" in created.text:
        pytest.skip("Prior conversion exists and cannot be cleaned via active listing")
    assert created.status_code == 200, created.text
    conv = created.json()
    assert conv["from_unit"] == from_u
    assert conv["to_unit"] == to_u
    assert conv["factor"] == 1000
    assert conv["is_active"] is True
    conv_id = conv["id"]

    # Verify listing includes it
    lst = requests.get(f"{BASE_URL}/api/calc-engine/unit-conversions", headers=h, timeout=20).json()
    assert any(c["id"] == conv_id for c in lst)

    # Verify convert endpoint uses this
    cvt = requests.get(
        f"{BASE_URL}/api/calc-engine/convert",
        params={"value": 2, "from_unit": from_u, "to_unit": to_u},
        headers=h, timeout=20,
    )
    assert cvt.status_code == 200, cvt.text
    assert abs(cvt.json()["result"] - 2000.0) < 1e-6

    # Update factor
    upd = requests.put(
        f"{BASE_URL}/api/super-admin/calc-engine/unit-conversions/{conv_id}",
        json={"factor": 1500, "description": unique_desc + "_UPD"},
        headers=h, timeout=20,
    )
    assert upd.status_code == 200, upd.text
    assert upd.json()["factor"] == 1500
    assert upd.json()["description"] == unique_desc + "_UPD"

    # Delete
    d = requests.delete(
        f"{BASE_URL}/api/super-admin/calc-engine/unit-conversions/{conv_id}",
        headers=h, timeout=20,
    )
    assert d.status_code == 200

    # Verify gone
    cvt2 = requests.get(
        f"{BASE_URL}/api/calc-engine/convert",
        params={"value": 1, "from_unit": from_u, "to_unit": to_u},
        headers=h, timeout=20,
    )
    assert cvt2.status_code == 404


def test_create_conversion_invalid_unit(h):
    r = requests.post(
        f"{BASE_URL}/api/super-admin/calc-engine/unit-conversions",
        json={"from_unit": "fakeunit_xyz", "to_unit": "kg", "factor": 1},
        headers=h, timeout=20,
    )
    assert r.status_code == 400
    assert "does not exist" in r.text


def test_create_conversion_same_from_to(h):
    r = requests.post(
        f"{BASE_URL}/api/super-admin/calc-engine/unit-conversions",
        json={"from_unit": "kg", "to_unit": "kg", "factor": 1},
        headers=h, timeout=20,
    )
    assert r.status_code == 400


def test_create_conversion_missing_factor(h):
    r = requests.post(
        f"{BASE_URL}/api/super-admin/calc-engine/unit-conversions",
        json={"from_unit": "kg", "to_unit": "g"},
        headers=h, timeout=20,
    )
    assert r.status_code == 400
