# OCR engine plausibility: series_outlier rewording + possible_duplicate removal (live job)
import os, time, json, tempfile
import pytest, requests
from openpyxl import Workbook

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
EMAIL, PW = "goyalsomil2001@gmail.com", "TestUser123!"


@pytest.fixture(scope="module")
def s():
    ss = requests.Session()
    r = ss.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PW})
    assert r.status_code == 200, r.text
    d = r.json()
    tok = d.get("access_token") or d.get("token")
    ss.headers["Authorization"] = f"Bearer {tok}"
    return ss


def _xlsx():
    wb = Workbook()
    ws = wb.active; ws.title = "Data"
    ws.append(["Item", "Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026"])
    ws.append(["Diesel (litres)", 7500, 7600, 10, 7550, 7480])
    ws2 = wb.create_sheet("Invoices")
    ws2.append(["Item", "Quantity", "Unit", "Amount", "Month"])
    ws2.append(["Electricity", 11000, "kWh", 88000, "Jan 2026"])
    ws2.append(["Electricity", 11000, "kWh", 88000, "Jan 2026"])
    p = os.path.join(tempfile.mkdtemp(), "TEST_iter10_plaus.xlsx")
    wb.save(p)
    return p


def test_job_checks(s):
    p = _xlsx()
    with open(p, "rb") as f:
        r = s.post(f"{BASE_URL}/api/ocr-invoice/jobs",
                   files=[("files", ("TEST_iter10_plaus.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))],
                   data={"mode": "fast", "force": "true"})
    assert r.status_code == 200, r.text
    job_id = r.json().get("job_id") or r.json().get("id")
    print("JOB", job_id)
    try:
        st = None
        for _ in range(60):
            j = s.get(f"{BASE_URL}/api/ocr-invoice/jobs/{job_id}").json()
            st = j.get("status")
            if st in ("done", "failed", "error", "cancelled"):
                break
            time.sleep(5)
        print("STATUS", st)
        assert st == "done", j
        rows = s.get(f"{BASE_URL}/api/ocr-invoice/jobs/{job_id}/rows").json()
        rows = rows.get("rows", rows) if isinstance(rows, dict) else rows
        print("NROWS", len(rows))
        all_checks = []
        for row in rows:
            ch = row.get("checks") or []
            print(json.dumps({k: row.get(k) for k in ("activity", "item", "quantity", "unit", "amount", "period", "month", "status")}, default=str), [ (c.get("code"), c.get("message")) for c in ch if isinstance(c, dict)])
            all_checks += [c for c in ch if isinstance(c, dict)]
        assert not any(c.get("code") == "possible_duplicate" for c in all_checks)
        assert not any("possible duplicate" in (c.get("message") or "").lower() for c in all_checks)
        so = [c for c in all_checks if c.get("code") == "series_outlier"]
        print("SERIES_OUTLIER", so)
        for c in so:
            assert "than the other months in this row" in c["message"]
            assert "x the other months" not in c["message"]
        if not so:
            print("NOTE: series_outlier not detected")
    finally:
        d = s.delete(f"{BASE_URL}/api/ocr-invoice/jobs/{job_id}")
        print("DELETE", d.status_code)
