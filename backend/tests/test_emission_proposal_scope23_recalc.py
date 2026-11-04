# Approver Queue: Scope 2 / Scope 3 emission proposal approver-edit recalculation (iteration 9)
import os
import pytest
import requests

BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split()[0]).rstrip('/')
ADMIN = {"email": "goyalsomil2001@gmail.com", "password": "TestUser123!"}

# proposal ids created by tests/create_scope23_pending.py (SG user, Fac2)
S2_LOC = "7e49e21e-ff38-4b0f-9d1b-e7fd58763d68"     # 10000 kWh grid EF -> 7.1
S2_MKT = "f80e3687-c5b4-40dd-b80b-932402b11c6e"     # 20000 kWh, EF override 0.5 -> 10.0
S3_SPEND = "9b0572a1-4fe2-45f7-9ee4-a3e155b7f56a"   # C2 spend 1000 USD -> 0.532
S3_C8 = "c517c571-d59a-4133-8aa7-77fdc9da2df9"      # C8 activity stationary_combustion CNG 1000 L -> 0.54359
S3_C2_ACT_KG = "0a14a2c9-e2fc-474e-8048-9980f097e090"  # C2 activity Asphalt 3456 kg -> 0.13551836544 (orig)


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
    if r.status_code != 200:
        pytest.skip("login failed")
    s.headers["Authorization"] = f"Bearer {r.json().get('access_token')}"
    return s


def _p(client, pid):
    j = client.get(f"{BASE_URL}/api/proposals/{pid}").json()
    return j.get("proposal", j)


def _edit(client, pid, fv):
    p = _p(client, pid)
    if p.get("status") not in ("pending", "in_review"):
        pytest.skip(f"{pid} not pending")
    r = client.put(f"{BASE_URL}/api/proposals/{pid}", json={"field_values": fv})
    assert r.status_code == 200, r.text[:300]
    snap = _p(client, pid)["entity_snapshot"]
    assert all(isinstance(v, dict) for v in (snap.get("dynamic_field_values") or {}).values())
    return snap


@pytest.mark.parametrize("pid,var,orig,new,orig_co2e", [
    (S2_LOC, "qty_energy", 10000, 20000, 7.1),
    (S2_MKT, "qty_energy", 20000, 40000, 10.0),
    (S3_SPEND, "spent_value", 1000, 2000, 0.532),
    (S3_C8, "activity_value", 1000, 2000, 0.54359),
])
def test_recalc_linear_scaling(client, pid, var, orig, new, orig_co2e):
    snap = _edit(client, pid, {var: str(new)})
    try:
        assert snap["dynamic_field_values"][var]["value"] == float(new)
        assert abs(snap["co2e_emissions"] - orig_co2e * new / orig) < 1e-4, f"co2e {snap['co2e_emissions']} expected {orig_co2e * new / orig}"
    finally:
        _edit(client, pid, {var: str(orig)})


# Scope 2 market-based: changing the overridden supplier EF must drive the recalculated total
def test_scope2_market_override_ef_change(client):
    snap = _edit(client, S2_MKT, {"override_ef_quantity_electricity_co2": True, "ef_quantity_electricity_co2": "0.25"})
    try:
        ef = snap["dynamic_field_values"]["ef_quantity_electricity_co2"]
        assert ef["value"] == 0.25 and ef["is_override"] is True
        assert abs(snap["co2e_emissions"] - 5.0) < 1e-4, f"co2e {snap['co2e_emissions']}"
    finally:
        _edit(client, S2_MKT, {"ef_quantity_electricity_co2": "0.5"})


# BUG: Scope 3 activity-based with non-EF-native unit (kg vs EF default t) -> recalc skips unit conversion (1000x)
def test_scope3_activity_unit_conversion_on_recalc(client):
    snap = _edit(client, S3_C2_ACT_KG, {"activity_value": "3456"})
    assert abs(snap["co2e_emissions"] - 0.13551836544) < 1e-4, f"co2e {snap['co2e_emissions']} (expected 0.1355 - unit kg->t not converted)"


def test_emissions_list_and_dashboard_ok(client):
    assert client.get(f"{BASE_URL}/api/emissions").status_code == 200
    assert client.get(f"{BASE_URL}/api/dashboard/stats?start_period=2026-04&end_period=2027-03").status_code == 200
