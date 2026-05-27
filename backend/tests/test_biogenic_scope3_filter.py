"""
Tests for biogenic scope3 filtering based on org enabled_access.

Scenario: For orgs with only 'scope1_2' access (no 'scope1_2_3'), biogenic emission
records with biogenic_scope_selection='scope3' must be hidden from:
  - GET /api/emissions
  - GET /api/dashboard/stats (excluded from calculations)

Orgs that have 'scope1_2_3' in enabled_access should still see them.

Fixture data (live DB):
  - OILES INDIA PVT. LTD. (id=9067d872-...) has enabled_access=['scope1_2','scope1_2_3']
  - It has exactly 1 emission record with scope='biogenic' and biogenic_scope_selection='scope3'
    (id=511601e9-..., facility=Facility A, total_emissions=513.0933318, period=FY 2025-26)
We flip OILES INDIA's enabled_access via direct DB write to simulate the scope1_2-only
state, then restore at teardown.
"""
import os
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load backend env so we have MONGO_URL / DB_NAME
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://carbon-approval.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

ADMIN_EMAIL = "goyalsomil@hotmail.com"
ADMIN_PASSWORD = "Test123!"

OILES_ORG_ID = "9067d872-8a3a-4ed9-8494-e3ef04952f7c"
KNOWN_BIO_SCOPE3_RECORD_ID = "511601e9-0d12-4b25-937f-44ee13c14d54"
KNOWN_BIO_SCOPE3_EMISSIONS = 513.0933318  # tCO2e of the known record


# -----------------------------
# Helpers
# -----------------------------
def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _set_enabled_access(org_id: str, access_list):
    async def _do():
        client = AsyncIOMotorClient(MONGO_URL)
        try:
            await client[DB_NAME].organizations.update_one(
                {"id": org_id}, {"$set": {"enabled_access": access_list}}
            )
        finally:
            client.close()
    _run(_do())


def _get_enabled_access(org_id: str):
    async def _do():
        client = AsyncIOMotorClient(MONGO_URL)
        try:
            org = await client[DB_NAME].organizations.find_one(
                {"id": org_id}, {"_id": 0, "enabled_access": 1}
            )
            return (org or {}).get("enabled_access")
        finally:
            client.close()
    return _run(_do())


# -----------------------------
# Fixtures
# -----------------------------
@pytest.fixture(scope="module")
def event_loop():
    """Module-scoped event loop so we can use asyncio in fixtures."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def admin_token():
    """Login as OILES INDIA admin once for the module."""
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    if resp.status_code != 200:
        pytest.skip(f"Auth failed: {resp.status_code} {resp.text}")
    data = resp.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No token in login response: {data}"
    return token


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def restore_enabled_access():
    """Snapshot original enabled_access and restore at teardown."""
    original = _get_enabled_access(OILES_ORG_ID)
    yield original
    # Restore
    if original is None:
        async def _unset():
            client = AsyncIOMotorClient(MONGO_URL)
            try:
                await client[DB_NAME].organizations.update_one(
                    {"id": OILES_ORG_ID}, {"$unset": {"enabled_access": ""}}
                )
            finally:
                client.close()
        _run(_unset())
    else:
        _set_enabled_access(OILES_ORG_ID, original)


# -----------------------------
# Tests: GET /api/emissions
# -----------------------------
class TestEmissionsListFiltering:
    """Biogenic scope3 records must be hidden from /api/emissions for orgs without scope1_2_3."""

    def test_with_scope3_access_sees_biogenic_scope3(self, auth_headers):
        # Ensure full access enabled
        _set_enabled_access(OILES_ORG_ID, ["scope1_2", "scope1_2_3"])

        resp = requests.get(f"{BASE_URL}/api/emissions", headers=auth_headers, timeout=60)
        assert resp.status_code == 200, resp.text
        records = resp.json()
        assert isinstance(records, list) and len(records) > 0

        ids = {r["id"] for r in records}
        assert KNOWN_BIO_SCOPE3_RECORD_ID in ids, (
            "With scope1_2_3 access, the known biogenic+scope3 record must be visible"
        )

        bio_scope3 = [
            r for r in records
            if r.get("scope") == "biogenic" and r.get("biogenic_scope_selection") == "scope3"
        ]
        assert len(bio_scope3) >= 1, "Expected at least 1 biogenic+scope3 record visible"

    def test_without_scope3_access_hides_biogenic_scope3(self, auth_headers):
        # Restrict access to scope1_2 only
        _set_enabled_access(OILES_ORG_ID, ["scope1_2"])

        resp = requests.get(f"{BASE_URL}/api/emissions", headers=auth_headers, timeout=60)
        assert resp.status_code == 200, resp.text
        records = resp.json()
        assert isinstance(records, list)

        ids = {r["id"] for r in records}
        assert KNOWN_BIO_SCOPE3_RECORD_ID not in ids, (
            "Without scope1_2_3 access, the known biogenic+scope3 record MUST be filtered out"
        )

        bio_scope3 = [
            r for r in records
            if r.get("scope") == "biogenic" and r.get("biogenic_scope_selection") == "scope3"
        ]
        assert bio_scope3 == [], (
            f"No biogenic+scope3 records should remain, got {len(bio_scope3)}: "
            f"{[r['id'] for r in bio_scope3]}"
        )

        # Non-biogenic records must still be visible (e.g., scope1/2/3 categories)
        non_bio = [r for r in records if r.get("scope") != "biogenic"]
        assert len(non_bio) > 0, "Non-biogenic records should still be visible"

    def test_other_biogenic_records_not_filtered(self, auth_headers):
        """Biogenic records with biogenic_scope_selection != 'scope3' must remain visible."""
        _set_enabled_access(OILES_ORG_ID, ["scope1_2"])

        resp = requests.get(f"{BASE_URL}/api/emissions", headers=auth_headers, timeout=60)
        assert resp.status_code == 200, resp.text
        records = resp.json()
        bio_non_scope3 = [
            r for r in records
            if r.get("scope") == "biogenic"
            and r.get("biogenic_scope_selection") != "scope3"
        ]
        # OILES has 3 biogenic records total, 1 is scope3 → 2 should remain
        assert len(bio_non_scope3) >= 1, (
            "Biogenic records with non-scope3 selection should still be returned"
        )


# -----------------------------
# Tests: GET /api/dashboard/stats
# -----------------------------
class TestDashboardStatsFiltering:
    """Biogenic scope3 records must be excluded from dashboard calcs for orgs w/o scope1_2_3."""

    def _stats(self, headers):
        resp = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers, timeout=120)
        assert resp.status_code == 200, resp.text
        return resp.json()

    def test_dashboard_with_scope3_access_includes_biogenic_scope3(self, auth_headers):
        _set_enabled_access(OILES_ORG_ID, ["scope1_2", "scope1_2_3"])
        stats_full = self._stats(auth_headers)

        _set_enabled_access(OILES_ORG_ID, ["scope1_2"])
        stats_limited = self._stats(auth_headers)

        # Recent records should not include the biogenic scope3 id when access is limited
        limited_ids = {r["id"] for r in stats_limited.get("recent_records", [])}
        assert KNOWN_BIO_SCOPE3_RECORD_ID not in limited_ids, (
            "Limited-access dashboard recent_records must not contain biogenic scope3 record"
        )

        # When biogenic scope3 record is included (full access), biogenic_indirect should
        # reflect at least its contribution. When excluded (limited), it should drop.
        bio_indirect_full = float(stats_full.get("biogenic_indirect", 0) or 0)
        bio_indirect_limited = float(stats_limited.get("biogenic_indirect", 0) or 0)

        # The difference should be >= KNOWN_BIO_SCOPE3_EMISSIONS (minus rounding/proration).
        # Allow small tolerance for proration / equity share.
        diff = bio_indirect_full - bio_indirect_limited
        assert diff >= (KNOWN_BIO_SCOPE3_EMISSIONS * 0.5), (
            f"Expected biogenic_indirect drop ~{KNOWN_BIO_SCOPE3_EMISSIONS} when filtering, "
            f"got full={bio_indirect_full} limited={bio_indirect_limited} diff={diff}"
        )

        # Biogenic indirect under limited access should be 0 for OILES (only 1 bio scope3 rec)
        assert bio_indirect_limited == pytest.approx(0, abs=0.5), (
            f"biogenic_indirect should be ~0 when org has no scope1_2_3 access, "
            f"got {bio_indirect_limited}"
        )

    def test_dashboard_total_emissions_unchanged_by_biogenic_filter(self, auth_headers):
        """Biogenic emissions are tracked separately from total_emissions (scope1+2+3).
        Filtering biogenic scope3 should NOT alter scope1/2/3 totals."""
        _set_enabled_access(OILES_ORG_ID, ["scope1_2", "scope1_2_3"])
        full = self._stats(auth_headers)
        _set_enabled_access(OILES_ORG_ID, ["scope1_2"])
        limited = self._stats(auth_headers)

        # Scope1 and Scope2 totals should be identical
        assert float(full.get("scope1_emissions", 0)) == pytest.approx(
            float(limited.get("scope1_emissions", 0)), rel=1e-3
        )
        assert float(full.get("scope2_emissions", 0)) == pytest.approx(
            float(limited.get("scope2_emissions", 0)), rel=1e-3
        )
