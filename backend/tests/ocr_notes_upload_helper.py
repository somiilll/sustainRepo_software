# Helper: create a TEST xlsx and upload it to OCR v2 (Standard/fast mode); prints job_id
import os, sys, time, requests, openpyxl

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
s = requests.Session()
r = s.post(f"{BASE}/api/auth/login", json={"email": "goyalsomil2001@gmail.com", "password": "TestUser123!"})
tok = r.json().get("access_token") or r.json().get("token")
s.headers["Authorization"] = f"Bearer {tok}"
wb = openpyxl.Workbook(); ws = wb.active
ws.append(["Item", "Quantity", "Unit"])
for row in [("KATEC 22 HCC 76 MICRON", 100, "kg"), ("Welding die", 5, "nos"), ("Copper waste", 200, "kg"), ("PP waste", 100, "kg")]:
    ws.append(row)
path = "/tmp/TEST_ocr_notes.xlsx"; wb.save(path)
with open(path, "rb") as f:
    r = s.post(f"{BASE}/api/ocr-invoice/jobs", files=[("files", ("TEST_ocr_notes.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))],
               data={"mode": "fast", "force": "true"})
print(r.status_code, r.text[:300])
jid = r.json().get("job_id")
for _ in range(36):
    j = s.get(f"{BASE}/api/ocr-invoice/jobs/{jid}").json()
    print(j.get("status"))
    if j.get("status") not in ("queued", "running"):
        break
    time.sleep(5)
print("JOB", jid)
