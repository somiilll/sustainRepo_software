# OCR v2 basis notes / trust wording regression (iteration 9). Requires OCR_TEST_JOB env (a job processed after the fix).
import os, re, pytest, requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
NEW_JOB = os.environ.get("OCR_TEST_JOB")
OLD_JOB = "081bea4aa8"
HIDDEN = ("haiku", "jev", "org context used", "org_context_used", "exact name", "exact_name")
RAW = ("spec in name", "code or serial", "ambiguous between roles", "unknown brand", "spec_in_name", "code_or_serial", "ambiguous_between_roles", "unknown_brand")


@pytest.fixture(scope="module")
def s():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": "goyalsomil2001@gmail.com", "password": "TestUser123!"})
    assert r.status_code == 200
    s.headers["Authorization"] = f"Bearer {r.json().get('access_token') or r.json().get('token')}"
    return s


@pytest.fixture(scope="module")
def rows(s):
    if not NEW_JOB:
        pytest.skip("OCR_TEST_JOB not set")
    r = s.get(f"{BASE}/api/ocr-invoice/jobs/{NEW_JOB}/rows")
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d, list) and len(d) >= 3
    return d


def test_basis_has_plain_notes(rows):
    for row in rows:
        for k in ("classification", "quantity", "facility", "period"):
            b = row["basis"][k]
            assert isinstance(b.get("notes"), list), (row["row_id"], k)
            for n in b["notes"]:
                assert "_" not in n, (k, n)
                assert not any(h in n.lower() for h in HIDDEN), (k, n)
                assert n.lower() not in RAW, (k, n)


def test_trust_reasons_clean(rows):
    for row in rows:
        txt = " ".join(row["trust"].get("reasons") or []) + " " + (row["trust"].get("label") or "")
        assert not any(h in txt.lower() for h in HIDDEN), txt
        assert not any(x in txt.lower() for x in RAW), txt


def test_alternatives_have_names(rows):
    for row in rows:
        for a in row["decision"].get("alternatives") or []:
            assert a.get("label") or (a.get("factor") or {}).get("name") or a.get("activity_id"), a


def test_old_job_still_readable(s):
    r = s.get(f"{BASE}/api/ocr-invoice/jobs/{OLD_JOB}/rows")
    assert r.status_code == 200 and len(r.json()) > 0
