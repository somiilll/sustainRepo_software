"""Phase B11+ regression tests:
  1. Super-admin router split (7 files) — sample of the 91 routes.
  2. Event bus emitters wired (audit + emission events).
  3. WebSocket /api/ws/dashboard auth + ping/pong + live event broadcast + org isolation.
"""
import asyncio
import json
import os
import sys
import time
import uuid

import pytest
import requests
import websockets

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://esg-executive-pack.preview.emergentagent.com").rstrip("/")
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")

ADMIN_A = {"email": "goyalsomil@hotmail.com", "password": "Test123!"}
ADMIN_B = {"email": "goyalsomil2@hotmail.com", "password": "Test123!"}
SUPER_ADMIN = {"email": "superadmin@ecotrack.com", "password": "SuperAdmin123!"}

FACILITY_A = "c2ec2a8f-fffc-4cfc-958c-85073ce3ab63"
DIESEL_FUEL_ID = "5b5cdce3-29ed-4cab-b22c-22b39f57b0fd"


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_a_token():
    return _login(ADMIN_A)


@pytest.fixture(scope="module")
def admin_b_token():
    return _login(ADMIN_B)


@pytest.fixture(scope="module")
def super_admin_token():
    return _login(SUPER_ADMIN)


# ---------------------------------------------------------------------------
# 1. Super-admin split-router smoke (sampling of ~20 routes from 7 sub-routers)
# ---------------------------------------------------------------------------
class TestSuperAdminSplitRouter:
    def _h(self, t): return {"Authorization": f"Bearer {t}"}

    def test_organizations_list(self, super_admin_token):
        r = requests.get(f"{BASE_URL}/api/super-admin/organizations", headers=self._h(super_admin_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 14

    def test_admins_list(self, super_admin_token):
        r = requests.get(f"{BASE_URL}/api/super-admin/admins", headers=self._h(super_admin_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_super_admin_dashboard(self, super_admin_token):
        r = requests.get(f"{BASE_URL}/api/super-admin/dashboard", headers=self._h(super_admin_token), timeout=15)
        assert r.status_code == 200

    def test_units_list(self, admin_a_token):
        r = requests.get(f"{BASE_URL}/api/units", headers=self._h(admin_a_token), timeout=15)
        assert r.status_code == 200
        units = r.json()
        assert isinstance(units, list) and len(units) >= 32

    def test_units_by_type(self, admin_a_token):
        r = requests.get(f"{BASE_URL}/api/units/by-type/volume", headers=self._h(admin_a_token), timeout=15)
        assert r.status_code == 200

    def test_units_create_and_delete(self, super_admin_token):
        h = self._h(super_admin_token)
        unique = f"TEST_unit_{uuid.uuid4().hex[:8]}"
        payload = {"name": unique, "symbol": unique[:8], "unit_type": "mass", "conversion_factor": 1.0, "base_unit": "kg"}
        c = requests.post(f"{BASE_URL}/api/units", headers=h, json=payload, timeout=15)
        assert c.status_code in (200, 201), f"create unit failed: {c.status_code} {c.text}"
        unit_id = c.json().get("id") or c.json().get("data", {}).get("id")
        assert unit_id, f"no id in create response: {c.json()}"
        d = requests.delete(f"{BASE_URL}/api/units/{unit_id}", headers=h, timeout=15)
        assert d.status_code in (200, 204)

    def test_fuel_database(self, admin_a_token):
        r = requests.get(f"{BASE_URL}/api/fuel-database", headers=self._h(admin_a_token), timeout=20)
        assert r.status_code == 200

    def test_scope3_ef(self, admin_a_token):
        r = requests.get(f"{BASE_URL}/api/scope3-ef", headers=self._h(admin_a_token), timeout=15)
        assert r.status_code == 200

    def test_scope3_ef_categories(self, admin_a_token):
        r = requests.get(f"{BASE_URL}/api/scope3-ef/categories", headers=self._h(admin_a_token), timeout=15)
        assert r.status_code == 200

    def test_emission_categories(self, admin_a_token):
        r = requests.get(f"{BASE_URL}/api/emission-categories", headers=self._h(admin_a_token), timeout=15)
        assert r.status_code == 200

    def test_sectors(self, admin_a_token):
        r = requests.get(f"{BASE_URL}/api/sectors", headers=self._h(admin_a_token), timeout=15)
        assert r.status_code == 200
        assert len(r.json()) >= 10

    def test_process_templates(self, admin_a_token):
        r = requests.get(f"{BASE_URL}/api/process-templates", headers=self._h(admin_a_token), timeout=15)
        assert r.status_code == 200

    def test_gwp_config(self, admin_a_token):
        r = requests.get(f"{BASE_URL}/api/gwp-config", headers=self._h(admin_a_token), timeout=15)
        assert r.status_code == 200

    def test_gwp_values(self, admin_a_token):
        r = requests.get(f"{BASE_URL}/api/gwp-values", headers=self._h(admin_a_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "CO2" in d and "CH4" in d and "N2O" in d

    def test_currency_conversion_active(self, admin_a_token):
        r = requests.get(f"{BASE_URL}/api/currency-conversion/active?source_currency=USD",
                         headers=self._h(admin_a_token), timeout=15)
        assert r.status_code == 200

    def test_formula_parameters(self, admin_a_token):
        r = requests.get(f"{BASE_URL}/api/formula-parameters", headers=self._h(admin_a_token), timeout=15)
        assert r.status_code == 200

    def test_formula_definitions(self, admin_a_token):
        r = requests.get(f"{BASE_URL}/api/formula-definitions", headers=self._h(admin_a_token), timeout=15)
        assert r.status_code == 200

    def test_emission_configurations(self, admin_a_token):
        r = requests.get(f"{BASE_URL}/api/emission-configurations", headers=self._h(admin_a_token), timeout=15)
        assert r.status_code == 200

    def test_emission_factors(self, admin_a_token):
        r = requests.get(f"{BASE_URL}/api/emission-factors", headers=self._h(admin_a_token), timeout=15)
        assert r.status_code == 200

    def test_calculation_formulas(self, admin_a_token):
        r = requests.get(f"{BASE_URL}/api/calculation-formulas", headers=self._h(admin_a_token), timeout=15)
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# 2. Boot health + dashboard byte-identity
# ---------------------------------------------------------------------------
class TestBootHealthAndDashboard:
    def test_health_contracts(self, admin_a_token):
        r = requests.get(f"{BASE_URL}/api/health/contracts",
                         headers={"Authorization": f"Bearer {admin_a_token}"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "passed"
        assert d.get("modules_checked", 0) >= 22
        assert d.get("failed") in (None, [], 0)

    def test_dashboard_stats_byte_identical(self, admin_a_token):
        r = requests.get(f"{BASE_URL}/api/dashboard/stats",
                         headers={"Authorization": f"Bearer {admin_a_token}"}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        # Byte-identical baseline from iteration_79
        assert round(float(d.get("total_emissions", 0)), 2) == 4194.63, f"got total={d.get('total_emissions')}"
        assert round(float(d.get("scope1_emissions", 0)), 2) == 251.86, f"got scope1={d.get('scope1_emissions')}"


# ---------------------------------------------------------------------------
# 3. Event bus handler-count assertions (in-process)
# ---------------------------------------------------------------------------
class TestEventBusHandlers:
    def test_handlers_registered(self):
        # Importing ws_router triggers handler registration
        sys.path.insert(0, "/app/backend")
        from modules.dashboards import ws_router as _wr  # noqa: F401
        from events.event_bus import event_bus, Events
        assert event_bus.handler_count(Events.AUDIT_PERSISTED) >= 1
        assert event_bus.handler_count(Events.EMISSION_SAVED) >= 1
        assert event_bus.handler_count(Events.EMISSION_UPDATED) >= 1
        assert event_bus.handler_count(Events.EMISSION_DELETED) >= 1


# ---------------------------------------------------------------------------
# 4. WebSocket auth (close on missing/invalid token)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_ws_rejects_missing_token():
    url = f"{WS_BASE}/api/ws/dashboard"
    with pytest.raises(Exception):
        async with websockets.connect(url, open_timeout=10) as ws:
            await asyncio.wait_for(ws.recv(), timeout=3)


@pytest.mark.asyncio
async def test_ws_rejects_invalid_token():
    url = f"{WS_BASE}/api/ws/dashboard?token=not-a-real-jwt"
    with pytest.raises(Exception):
        async with websockets.connect(url, open_timeout=10) as ws:
            await asyncio.wait_for(ws.recv(), timeout=3)


# ---------------------------------------------------------------------------
# 5. WS hello + ping/pong
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_ws_hello_and_ping_pong(admin_a_token):
    url = f"{WS_BASE}/api/ws/dashboard?token={admin_a_token}"
    async with websockets.connect(url, open_timeout=10) as ws:
        hello = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
        assert hello["type"] == "hello"
        assert "user_id" in hello and "role" in hello and "organization_id" in hello
        await ws.send(json.dumps({"type": "ping"}))
        pong = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
        assert pong["type"] == "pong"


# ---------------------------------------------------------------------------
# 6. WS live events: emission create -> 2 messages, delete -> 2 messages
# ---------------------------------------------------------------------------
def _emission_payload():
    return {
        "facility_id": FACILITY_A,
        "scope": "scope1",
        "category": "stationary_combustion",
        "sub_category": "Diesel",
        "fuel_id": DIESEL_FUEL_ID,
        "fuel_name": "Diesel",
        "reporting_period": "2025-08",
        "frequency_type": "monthly",
        "quantity_used": 10.0,
        "quantity_used_unit": "litre",
        "process_names": ["TEST_ws_live"],
        "responsible_person": "WS Tester",
        "designation": "QA",
        "contact_number": "1234567890",
        "co2_emissions": 1.0,
        "ch4_emissions": 0.001,
        "n2o_emissions": 0.001,
        "co2e_emissions": 1.3,
        "total_emissions": 1.3,
    }


@pytest.mark.asyncio
async def test_ws_emission_create_and_delete_broadcast(admin_a_token):
    url = f"{WS_BASE}/api/ws/dashboard?token={admin_a_token}"
    received = []
    async with websockets.connect(url, open_timeout=10) as ws:
        hello = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
        assert hello["type"] == "hello"

        # POST emission in a thread so the asyncio loop keeps reading WS frames
        loop = asyncio.get_event_loop()

        def _post():
            return requests.post(
                f"{BASE_URL}/api/emissions",
                headers={"Authorization": f"Bearer {admin_a_token}"},
                json=_emission_payload(), timeout=20,
            )
        post_fut = loop.run_in_executor(None, _post)

        # collect up to ~5s of WS messages
        try:
            for _ in range(6):
                msg = await asyncio.wait_for(ws.recv(), timeout=5)
                received.append(json.loads(msg))
                if len(received) >= 2:
                    break
        except asyncio.TimeoutError:
            pass

        post_resp = await post_fut
        assert post_resp.status_code in (200, 201), f"emission create failed: {post_resp.status_code} {post_resp.text}"
        rec_id = post_resp.json().get("id")

        reasons = {m.get("reason") for m in received if m.get("type") == "dashboard.refresh"}
        assert "emission.changed" in reasons, f"missing emission.changed: {received}"
        assert "audit.persisted" in reasons, f"missing audit.persisted: {received}"

        # DELETE the record and expect 2 more messages
        del_received = []
        def _del():
            return requests.delete(
                f"{BASE_URL}/api/emissions/{rec_id}",
                headers={"Authorization": f"Bearer {admin_a_token}"}, timeout=20,
            )
        del_fut = loop.run_in_executor(None, _del)
        try:
            for _ in range(6):
                msg = await asyncio.wait_for(ws.recv(), timeout=5)
                del_received.append(json.loads(msg))
                if len(del_received) >= 2:
                    break
        except asyncio.TimeoutError:
            pass

        del_resp = await del_fut
        assert del_resp.status_code in (200, 204)

        del_reasons = {m.get("reason") for m in del_received if m.get("type") == "dashboard.refresh"}
        assert "emission.changed" in del_reasons, f"missing emission.changed on delete: {del_received}"
        assert "audit.persisted" in del_reasons, f"missing audit.persisted on delete: {del_received}"


# ---------------------------------------------------------------------------
# 7. Org isolation: super-admin sees everything; org-B does NOT see org-A event
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_ws_org_isolation(admin_a_token, admin_b_token, super_admin_token):
    url_b = f"{WS_BASE}/api/ws/dashboard?token={admin_b_token}"
    url_sa = f"{WS_BASE}/api/ws/dashboard?token={super_admin_token}"
    rec_id = None
    try:
        async with websockets.connect(url_b, open_timeout=10) as ws_b, \
                   websockets.connect(url_sa, open_timeout=10) as ws_sa:
            # consume hellos
            await asyncio.wait_for(ws_b.recv(), timeout=5)
            await asyncio.wait_for(ws_sa.recv(), timeout=5)

            loop = asyncio.get_event_loop()
            def _post():
                return requests.post(
                    f"{BASE_URL}/api/emissions",
                    headers={"Authorization": f"Bearer {admin_a_token}"},
                    json=_emission_payload(), timeout=20,
                )
            post_fut = loop.run_in_executor(None, _post)

            sa_msgs, b_msgs = [], []

            async def _drain(ws, bucket):
                try:
                    while True:
                        m = await asyncio.wait_for(ws.recv(), timeout=4)
                        bucket.append(json.loads(m))
                except asyncio.TimeoutError:
                    pass

            await asyncio.gather(_drain(ws_sa, sa_msgs), _drain(ws_b, b_msgs))
            post_resp = await post_fut
            assert post_resp.status_code in (200, 201)
            rec_id = post_resp.json().get("id")

            sa_reasons = {m.get("reason") for m in sa_msgs}
            b_reasons = {m.get("reason") for m in b_msgs}

            assert "emission.changed" in sa_reasons, f"super_admin missed event: {sa_msgs}"
            # Org B must NOT have received org A's event
            assert "emission.changed" not in b_reasons, f"ORG ISOLATION LEAK: org B got org A event: {b_msgs}"
    finally:
        if rec_id:
            requests.delete(f"{BASE_URL}/api/emissions/{rec_id}",
                            headers={"Authorization": f"Bearer {admin_a_token}"}, timeout=10)
