# CBAM module regression tests: entitlement gating, admin CRUD, read-only role, public portal, exports
import os
import sys
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")
sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ORG = "9067d872-8a3a-4ed9-8494-e3ef04952f7c"
OTHER_ORG_ADMIN = "ruthvikanchuri5@gmail.com"  # org without cbam entitlement
VIEWER = "goyalsomil2001+1@gmail.com"  # role 'user' in CBAM-enabled org

_db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def _mint(email):
    from shared.helpers.tokens import create_access_token
    u = _db.users.find_one({"email": email}, {"_id": 0, "id": 1})
    if not u:
        pytest.skip(f"user {email} missing")
    return create_access_token({"sub": u["id"]})


@pytest.fixture(scope="module")
def admin():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "goyalsomil2001@gmail.com", "password": "TestUser123!"})
    if r.status_code != 200:
        pytest.skip("admin login failed")
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s


def _sess(tok):
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {tok}"
    return s


# --- Admin read endpoints
@pytest.mark.parametrize("path", ["/me", "/imports", "/installations", "/supplier-requests", "/workflow/settings",
                                  "/certificates", "/dashboard", "/declarations/2026", "/reference/factors",
                                  "/platform/suppliers", "/platform/facilities", "/certificates/position"])
def test_admin_reads(admin, path):
    r = admin.get(f"{BASE_URL}/api/cbam{path}")
    assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"


def test_me_is_admin(admin):
    d = admin.get(f"{BASE_URL}/api/cbam/me").json()
    assert d.get("role") == "admin", d


def test_seeded_imports(admin):
    d = admin.get(f"{BASE_URL}/api/cbam/imports").json()
    assert isinstance(d, list) and len(d) >= 10, len(d)


# --- Admin CRUD on import lines + dashboard change
def test_import_line_crud_and_dashboard(admin):
    before = admin.get(f"{BASE_URL}/api/cbam/dashboard").json()
    n_before = len(admin.get(f"{BASE_URL}/api/cbam/imports").json())
    r = admin.post(f"{BASE_URL}/api/cbam/imports", json={"cn_code": "7208 51 20", "description": "TEST_plate",
                                                          "country_of_origin": "India", "import_date": "2026-06-01",
                                                          "net_mass": 500, "basis": "default"})
    assert r.status_code == 200, r.text
    lid = r.json()["id"]
    try:
        assert r.json()["calc"]
        lines = admin.get(f"{BASE_URL}/api/cbam/imports").json()
        assert len(lines) == n_before + 1
        after = admin.get(f"{BASE_URL}/api/cbam/dashboard").json()
        assert before != after, "dashboard unchanged after adding line"
        u = admin.put(f"{BASE_URL}/api/cbam/imports/{lid}", json={"net_mass": 700, "description": "TEST_plate2"})
        assert u.status_code == 200 and u.json()["net_mass"] == 700
    finally:
        d = admin.delete(f"{BASE_URL}/api/cbam/imports/{lid}")
        assert d.status_code == 200
    assert len(admin.get(f"{BASE_URL}/api/cbam/imports").json()) == n_before


def test_installation_detail(admin):
    insts = admin.get(f"{BASE_URL}/api/cbam/installations").json()
    assert insts
    r = admin.get(f"{BASE_URL}/api/cbam/installations/{insts[0]['id']}")
    assert r.status_code == 200 and r.json()["id"] == insts[0]["id"]


# --- Declaration exports
@pytest.mark.parametrize("fmt,ctype", [("xlsx", "spreadsheetml"), ("pdf", "application/pdf"), ("json", "json"), ("xml", "xml")])
def test_declaration_exports(admin, fmt, ctype):
    r = admin.get(f"{BASE_URL}/api/cbam/declarations/2026/export.{fmt}")
    assert r.status_code == 200, r.text[:200]
    assert ctype in r.headers.get("content-type", "")
    assert len(r.content) > 100


# --- Entitlement gating
def test_gating_other_org_403():
    s = _sess(_mint(OTHER_ORG_ADMIN))
    for p in ["/me", "/imports", "/installations", "/supplier-requests", "/workflow/settings"]:
        r = s.get(f"{BASE_URL}/api/cbam{p}")
        assert r.status_code == 403, f"{p}: {r.status_code}"
        assert "PERMISSION_DENIED" in r.text or "entitle" in r.text.lower(), r.text[:200]


def test_unauthenticated_private_rejected():
    r = requests.get(f"{BASE_URL}/api/cbam/imports")
    assert r.status_code in (401, 403)


# --- Read-only viewer in enabled org
def test_viewer_read_only():
    s = _sess(_mint(VIEWER))
    assert s.get(f"{BASE_URL}/api/cbam/me").json().get("role") == "viewer"
    assert s.get(f"{BASE_URL}/api/cbam/imports").status_code == 200
    r = s.post(f"{BASE_URL}/api/cbam/imports", json={"cn_code": "7208 51 20", "country_of_origin": "India",
                                                      "import_date": "2026-06-01", "net_mass": 1})
    assert r.status_code == 403, r.text
    r2 = s.put(f"{BASE_URL}/api/cbam/workflow/settings", json={})
    assert r2.status_code == 403, r2.text


# --- Public supplier portal
def test_public_supplier_portal():
    r = requests.get(f"{BASE_URL}/api/cbam/public/supplier/demo-huaxia-9067d872")
    assert r.status_code == 200, r.text[:200]
    assert isinstance(r.json(), dict) and r.json()


def test_public_supplier_bad_token():
    r = requests.get(f"{BASE_URL}/api/cbam/public/supplier/does-not-exist-xyz")
    assert r.status_code == 404


# --- Entitlement contract accepts cbam
def test_entitlements_contract_has_cbam():
    from modules.sustainability_config import contracts
    src = open(contracts.__file__).read()
    assert "cbam" in src
