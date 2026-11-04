# Approver Queue: emission_record proposal approver-edit + recalculation regression tests
import os
import pytest
import requests

BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split()[0]).rstrip('/')
ADMIN = {"email": "goyalsomil2001@gmail.com", "password": "TestUser123!"}
DENSITY_PROPOSAL = "6704b2a9-604f-47d9-be87-c9b6a657ad97"  # scope1 diesel, density override (orig 0.9 -> 3.5508 tCO2e)


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
    if r.status_code != 200:
        pytest.skip("login failed")
    tok = r.json().get("access_token") or r.json().get("token")
    s.headers["Authorization"] = f"Bearer {tok}"
    return s


# Guard: a single malformed dynamic_field_values entry (non-dict) crashes the whole list endpoint
def test_emissions_list_ok(client):
    r = client.get(f"{BASE_URL}/api/emissions")
    assert r.status_code == 200, r.text[:300]
    assert isinstance(r.json(), list)


def test_dashboard_stats_ok(client):
    r = client.get(f"{BASE_URL}/api/dashboard/stats?start_period=2026-04&end_period=2027-03")
    assert r.status_code == 200


def test_put_unknown_proposal_404(client):
    r = client.put(f"{BASE_URL}/api/proposals/does-not-exist-TEST", json={"field_values": {"qty": 1}})
    assert r.status_code in (400, 404)


# Approver edit recalculates totals into snapshot (density edit scales linearly for heat-basis diesel)
def test_approver_edit_recalculates(client):
    g = client.get(f"{BASE_URL}/api/proposals/{DENSITY_PROPOSAL}")
    if g.status_code != 200 or (g.json().get("proposal", g.json())).get("status") not in ("pending", "in_review"):
        pytest.skip("proposal not pending anymore")
    r = client.put(f"{BASE_URL}/api/proposals/{DENSITY_PROPOSAL}", json={"field_values": {"density": 0.9}})
    assert r.status_code == 200, r.text[:300]
    snap = (client.get(f"{BASE_URL}/api/proposals/{DENSITY_PROPOSAL}").json())
    snap = snap.get("proposal", snap)["entity_snapshot"]
    assert snap["dynamic_field_values"]["density"]["value"] == 0.9
    assert abs(snap["co2e_emissions"] - 3.5508) < 0.01
    assert snap["approver_edited"] is True
    # dynamic_field_values must only contain dict entries (EmissionRecordResponse requires dicts)
    assert all(isinstance(v, dict) for v in snap["dynamic_field_values"].values())
