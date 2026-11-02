# Cross-framework answer links (BRSR <-> GRI): upload, check, push, sync autofill, regression
import io
import os

import pytest
import requests
from openpyxl import Workbook

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
PERIOD = "FY 2099-2100"
EMAIL = "goyalsomil2001@gmail.com"
PASSWORD = "TestUser123!"


def xlsx(rows):
    wb = Workbook()
    ws = wb.active
    ws.append(["framework_a", "question_key_a", "framework_b", "question_key_b", "path_a", "path_b"])
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    r = sess.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    tok = r.json().get("access_token") or r.json().get("token")
    sess.headers.update({"Authorization": f"Bearer {tok}"})
    return sess


def save(s, key, value):
    r = s.post(f"{BASE_URL}/api/esg-questionnaire/response",
               json={"question_key": key, "value": value, "reporting_period": PERIOD, "status": "saved"})
    assert r.status_code == 200, r.text
    return r.json()


def check(s, fw, keys):
    r = s.post(f"{BASE_URL}/api/framework-links/check", json={"framework": fw, "question_keys": keys, "reporting_period": PERIOD})
    assert r.status_code == 200, r.text
    return r.json()["targets"]


def get_val(s, fw, section, key):
    r = s.get(f"{BASE_URL}/api/esg-questionnaire/responses/{fw}/{section}/{PERIOD}")
    assert r.status_code == 200, r.text
    v = r.json()["responses"].get(key)
    return v.get("value") if isinstance(v, dict) and "value" in v else v


# Regression: no links -> no targets
def test_00_regression_no_links(s):
    links = s.get(f"{BASE_URL}/api/framework-links").json()["links"]
    if links:
        pytest.skip("links already exist")
    save(s, "brsr_a_entity_name", "TEST_Regress Ltd")
    save(s, "gri_2_1_a", "TEST_Regress GRI")
    assert check(s, "BRSR", ["brsr_a_entity_name"]) == []
    assert check(s, "GRI", ["gri_2_1_a"]) == []


# Upload validation: unknown key -> 422 and nothing saved
def test_01_upload_unknown_key(s):
    before = len(s.get(f"{BASE_URL}/api/framework-links").json()["links"])
    data = xlsx([["BRSR", "brsr_a_entity_name", "GRI", "gri_2_1_a"], ["BRSR", "brsr_zzz_nope", "GRI", "gri_2_1_a"]])
    r = s.post(f"{BASE_URL}/api/framework-links/upload", files={"file": ("l.xlsx", data)})
    assert r.status_code == 422, r.text
    assert len(s.get(f"{BASE_URL}/api/framework-links").json()["links"]) == before


# Row-level errors should reach the admin (global 422 handler currently replaces them with a generic message)
def test_01b_upload_unknown_key_row_errors_visible(s):
    data = xlsx([["BRSR", "brsr_zzz_nope", "GRI", "gri_2_1_a"]])
    r = s.post(f"{BASE_URL}/api/framework-links/upload", files={"file": ("l.xlsx", data)})
    assert r.status_code == 422
    assert "Row 2" in r.text, f"row errors swallowed: {r.text}"


# Upload missing columns -> 400
def test_02_upload_missing_columns(s):
    wb = Workbook(); wb.active.append(["framework_a", "question_key_a"]); buf = io.BytesIO(); wb.save(buf)
    r = s.post(f"{BASE_URL}/api/framework-links/upload", files={"file": ("l.xlsx", buf.getvalue())})
    assert r.status_code == 400


# Upload valid file -> saved 2
def test_03_upload_valid(s):
    data = xlsx([["BRSR", "brsr_a_contact_person", "GRI", "gri_2_3_d"], ["BRSR", "brsr_a_entity_name", "GRI", "gri_2_1_a"]])
    r = s.post(f"{BASE_URL}/api/framework-links/upload", files={"file": ("l.xlsx", data)})
    assert r.status_code == 200, r.text
    assert r.json() == {"saved": 2}
    links = s.get(f"{BASE_URL}/api/framework-links").json()["links"]
    assert len(links) == 2
    # Re-upload is idempotent (upsert)
    r = s.post(f"{BASE_URL}/api/framework-links/upload", files={"file": ("l.xlsx", data)})
    assert r.json() == {"saved": 2}
    assert len(s.get(f"{BASE_URL}/api/framework-links").json()["links"]) == 2


# Check + push BRSR -> GRI and GRI -> BRSR
def test_04_check_and_push_entity_name(s):
    save(s, "brsr_a_entity_name", "ABC Ltd")
    save(s, "gri_2_1_a", "XYZ GRI Name")
    t = check(s, "GRI", ["gri_2_1_a"])
    assert len(t) == 1 and t[0]["framework"] == "BRSR" and t[0]["question_key"] == "brsr_a_entity_name"
    assert t[0]["current_value"] == "ABC Ltd" and t[0]["new_value"] == "XYZ GRI Name"
    assert "Name of the Listed Entity" in t[0]["label"]
    r = s.post(f"{BASE_URL}/api/framework-links/push", json={"framework": "GRI", "reporting_period": PERIOD,
               "targets": [{"framework": "BRSR", "question_key": "brsr_a_entity_name", "source_key": "gri_2_1_a"}]})
    assert r.status_code == 200 and r.json()["updated"] == 1
    assert get_val(s, "BRSR", "section_a", "brsr_a_entity_name") == "XYZ GRI Name"
    assert check(s, "GRI", ["gri_2_1_a"]) == []


# Contact person dict -> GRI text one-way
def test_05_contact_person_one_way(s):
    save(s, "brsr_a_contact_person", {"name": "Jane Doe", "telephone": "999", "email": "jane@x.com"})
    t = check(s, "BRSR", ["brsr_a_contact_person"])
    assert len(t) == 1 and t[0]["question_key"] == "gri_2_3_d"
    assert t[0]["new_value"] == "Jane Doe, 999, jane@x.com"
    save(s, "gri_2_3_d", "Some contact text")
    assert check(s, "GRI", ["gri_2_3_d"]) == []


# Sync autofill: empty GRI target filled from BRSR, autofilled map reports it
def test_06_sync_autofill(s):
    # make sure gri_2_3_d empty
    save(s, "gri_2_3_d", "")
    r = s.post(f"{BASE_URL}/api/esg-questionnaire/gri-live-kpi-autofill", params={"reporting_period": PERIOD})
    assert r.status_code == 200, r.text
    assert get_val(s, "GRI", "general", "gri_2_3_d") == "Jane Doe, 999, jane@x.com"
    m = s.get(f"{BASE_URL}/api/framework-links/autofilled", params={"framework": "GRI", "reporting_period": PERIOD}).json()["questions"]
    assert m.get("gri_2_3_d", {}).get("question_key") == "brsr_a_contact_person"
    # manual edit not overwritten by sync
    save(s, "gri_2_3_d", "Manual contact")
    s.post(f"{BASE_URL}/api/esg-questionnaire/gri-live-kpi-autofill", params={"reporting_period": PERIOD})
    assert get_val(s, "GRI", "general", "gri_2_3_d") == "Manual contact"
    m = s.get(f"{BASE_URL}/api/framework-links/autofilled", params={"framework": "GRI", "reporting_period": PERIOD}).json()["questions"]
    assert "gri_2_3_d" not in m
