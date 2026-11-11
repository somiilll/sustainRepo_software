# OCR v2: read_tags + clean-row quantity confidence (bug 1 / bug 2) regression
import os, json, pytest, requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
JOB_ID = os.environ.get('OCR_JOB_ID')


@pytest.fixture(scope="module")
def rows():
    if not JOB_ID:
        pytest.skip("OCR_JOB_ID not set")
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "goyalsomil2001@gmail.com", "password": "TestUser123!"})
    assert r.status_code == 200
    d = r.json()
    tok = d.get("access_token") or d.get("token")
    s.headers["Authorization"] = f"Bearer {tok}"
    res = s.get(f"{BASE_URL}/api/ocr-invoice/jobs/{JOB_ID}/rows")
    assert res.status_code == 200
    data = res.json()
    return data if isinstance(data, list) else data.get("rows", data)


def _find(rows, txt):
    for r in rows:
        if not r.get("derived") and txt.lower() in (r.get("extracted_item") or "").lower():
            return r
    raise AssertionError(f"row {txt} not found")


def test_dump(rows):
    for r in rows:
        print(json.dumps({k: r.get(k) for k in ["row_id", "extracted_item", "derived", "review_status", "confidence", "trust", "read_tags", "checks"]}, default=str)[:1500])


@pytest.mark.parametrize("name", ["Asphalt", "cargo"])
def test_clean_rows_quantity_confidence(rows, name):
    r = _find(rows, name)
    assert r["confidence"]["quantity"] == pytest.approx(0.97)
    reasons = " ".join(map(str, (r.get("trust") or {}).get("reasons") or []))
    assert "hard to read" not in reasons


def test_every_row_has_read_tags_list(rows):
    for r in rows:
        assert isinstance(r.get("read_tags"), list), r.get("row_id")


def test_taxi_read_tags(rows):
    t = _find(rows, "Taxi")["read_tags"]
    assert t and t[0]["text"] == "900" and t[0]["level"] == "uncertain"
    assert "no_context" in t[0]["tags"]


def test_asphalt_no_read_tags(rows):
    assert _find(rows, "Asphalt")["read_tags"] == []
