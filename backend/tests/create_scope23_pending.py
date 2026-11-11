# Creates pending Scope2/Scope3 emission records as SG (non-admin assignee) for approver-queue testing
import requests, json, sys
B = "https://ocr-factor-match--4fgyofns.preview.emergentagent.com"
def login(email):
    s = requests.Session()
    t = s.post(f"{B}/api/auth/login", json={"email": email, "password": "TestUser123!"}).json()["access_token"]
    s.headers["Authorization"] = f"Bearer {t}"
    return s
sg = login("goyalsomil2001+2@gmail.com")
FAC2 = "20c4cc39-e5da-4a47-811e-149118930b0f"
ORG = "9067d872-8a3a-4ed9-8494-e3ef04952f7c"

def make(label, cat_id, base, decision, inputs, context, ef_id=None, overrides=None, extra_dfv=None):
    req = {"category_id": cat_id, "decision_inputs": decision, "inputs": inputs, "context": context,
           "user_overrides": overrides or {}, "org_id": ORG, "dry_run": True, "scope3_ef_id": ef_id}
    r = sg.post(f"{B}/api/calc-engine/execute-by-category", json=req)
    if r.status_code != 200:
        print(label, "CALC FAIL", r.status_code, r.text[:400]); return
    res = r.json()
    outs = res.get("outputs", {})
    co2e = (outs.get("co2e") or {}).get("value", 0)
    dfv = {**inputs, **(overrides or {}), **(extra_dfv or {})}
    body = {**base, "facility_id": FAC2, "frequency_type": "monthly", "category_id": cat_id,
            "formula_id": res.get("formula_id"), "dynamic_field_values": dfv,
            "outputs": {"co2": outs.get("co2") or {"value": 0, "unit": "tCO2"}, "ch4": {"value": 0, "unit": "tCH4"},
                        "n2o": {"value": 0, "unit": "tN2O"}, "co2e": outs.get("co2e")},
            "co2_emissions": (outs.get("co2") or {}).get("value", 0), "co2e_emissions": co2e, "total_emissions": co2e,
            "notes": f"TEST_{label}"}
    p = sg.post(f"{B}/api/emissions", json=body)
    j = p.json() if p.headers.get("content-type", "").startswith("application/json") else {}
    print(label, "co2e", co2e, "formula", res.get("formula_id"), "POST", p.status_code, j.get("id"), j.get("approval_status"), p.text[:200] if p.status_code >= 300 else "")

S2 = "cec39c99-70ae-47bd-abfd-1be5462243e3"
NRE = "646edd59-6245-4b87-bac6-38886c154e76"
s2base = {"scope": "scope2", "category": "Purchased Electricity", "sub_category": "Non-Renewable Electricity",
          "fuel_type": "Non-Renewable Electricity", "fuel_database_id": NRE}
ctx2 = {"fuel_code": NRE, "fuel_database_id": NRE, "fuel_name": "Non-Renewable Electricity", "scope": "scope2", "category_id": S2}
which = sys.argv[1:]
if "s2loc" in which:
    make("S2_location", S2, {**s2base, "reporting_period": "2026-07"}, {}, {"qty_energy": {"value": 10000, "unit": "kWh"}},
         {**ctx2, "reporting_period": "2026-07"},
         extra_dfv={"ef_quantity_electricity_co2": {"value": None, "unit": "tCO2/MWh", "is_override": False, "justification": ""}})
if "s2mkt" in which:
    make("S2_market", S2, {**s2base, "reporting_period": "2026-08"}, {}, {"qty_energy": {"value": 20000, "unit": "kWh"}},
         {**ctx2, "reporting_period": "2026-08"},
         overrides={"ef_quantity_electricity_co2": {"value": 0.5, "unit": "tCO2/MWh", "is_override": True, "justification": "TEST_supplier specific EF (market-based)"}})
C2 = "45c38f7b-20f0-4409-ac37-809d049ce7bd"
if "s3spend" in which:
    ef = "0dafc845-6521-4edf-a2ea-636d74a1f16c"
    make("S3_C2_spend", C2, {"scope": "scope3", "category": "C2 - Capital Goods", "sub_category": "Soybean Farming", "reporting_period": "2026-07",
         "calculation_method_scope3": "spend_basis", "spend_currency_conversion_method": "standard", "scope3_ef_id": ef,
         "scope3_activity": "Soybean Farming", "scope3_activity_type": "", "scope3_subcategory": ""},
         {"calculation_method_scope3": "spend_basis", "spend_currency_conversion_method": "standard"},
         {"spent_value": {"value": 1000, "unit": "USD"}}, {"scope": "scope3", "category_id": C2, "scope3_ef_id": ef, "reporting_period": "2026-07"}, ef_id=ef,
         extra_dfv={"exchange_rate": {"value": None, "unit": "", "is_override": False, "justification": ""},
                    "calculation_method_scope3": {"value": "spend_basis", "unit": ""}, "spend_currency_conversion_method": {"value": "standard", "unit": ""},
                    "scope3_ef_id": {"value": ef, "unit": ""}, "scope3_activity": {"value": "Soybean Farming", "unit": ""},
                    "scope3_activity_type": {"value": "", "unit": ""}, "scope3_subcategory": {"value": "", "unit": ""}})
C8 = "aa482371-de52-43fb-8f59-17229e548d58"
if "s3c8" in which:
    ef = "d3601562-3cf4-4a45-9263-f33344a26034"  # CNG, L
    make("S3_C8_activity_subcat", C8, {"scope": "scope3", "category": "C8 - Upstream Leased Assets", "sub_category": "CNG", "reporting_period": "2026-07",
         "calculation_method_scope3": "activity_basis", "scope3_ef_id": ef, "scope3_activity": "CNG", "scope3_activity_type": "",
         "scope3_subcategory": "stationary_combustion"},
         {"calculation_method_scope3": "activity_basis", "allocation_method": "entire_quantity", "subcategory_selection": "stationary_combustion"},
         {"activity_value": {"value": 1000, "unit": "L"}}, {"scope": "scope3", "category_id": C8, "scope3_ef_id": ef, "scope3_ef_default_unit": "L", "reporting_period": "2026-07"}, ef_id=ef,
         extra_dfv={"calculation_method_scope3": {"value": "activity_basis", "unit": ""}, "allocation_method": {"value": "entire_quantity", "unit": ""},
                    "scope3_ef_id": {"value": ef, "unit": ""}, "scope3_activity": {"value": "CNG", "unit": ""},
                    "scope3_activity_type": {"value": "", "unit": ""}, "scope3_subcategory": {"value": "stationary_combustion", "unit": ""}})
