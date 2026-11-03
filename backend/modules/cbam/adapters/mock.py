"""Mock SustainRepo data, shaped like the real app (Facility A/B, GHG logs, suppliers)."""

ORGS = {"org1": {"id": "org1", "name": "Org1", "reporting_window": "Apr 2026 – Mar 2027"}}

FACILITIES = {
    "org1": [
        {"id": "fac-a", "name": "Facility A", "country": "India", "city": "Jamshedpur", "type": "Steel rolling mill"},
        {"id": "fac-b", "name": "Facility B", "country": "India", "city": "Angul", "type": "Aluminium smelter"},
    ]
}

# Mirrors the GHG Logs screen: Scope 1 records with activity data and factors.
EMISSION_RECORDS = {
    "fac-a": [
        {"id": "r1", "scope": "Scope 1", "category": "Stationary Combustion", "sub_category": "Natural Gas", "period": "FY 26-27",
         "quantity": 4_270_000, "unit": "Nm3", "ncv_tj_per_unit": 0.0000356, "ef_t_per_tj": 56.1, "of": 1.0, "tco2e": 8528.0},
        {"id": "r2", "scope": "Scope 1", "category": "Stationary Combustion", "sub_category": "Furnace Oil", "period": "FY 26-27",
         "quantity": 1050, "unit": "t", "ncv_tj_per_unit": 0.0404, "ef_t_per_tj": 77.4, "of": 1.0, "tco2e": 3283.4},
        {"id": "r3", "scope": "Scope 1", "category": "Mobile Combustion", "sub_category": "Diesel", "period": "FY 25-26",
         "quantity": 26_000, "unit": "L", "ncv_tj_per_unit": 0.0000359, "ef_t_per_tj": 74.1, "of": 1.0, "tco2e": 69.84},
        {"id": "r4", "scope": "Scope 1", "category": "Fugitive Emissions", "sub_category": "R-410A", "period": "2026-03",
         "quantity": 1.84, "unit": "kg", "ncv_tj_per_unit": None, "ef_t_per_tj": None, "of": None, "tco2e": 3.85},
        {"id": "r5", "scope": "Scope 2", "category": "Purchased Electricity", "sub_category": "Grid", "period": "FY 26-27",
         "quantity": 9000, "unit": "MWh", "ncv_tj_per_unit": None, "ef_t_per_tj": None, "of": None, "tco2e": 6390.0},
    ],
    "fac-b": [
        {"id": "r6", "scope": "Scope 1", "category": "Fugitive Emissions", "sub_category": "HFC-23/R-23", "period": "CY2026",
         "quantity": 3.5, "unit": "kg", "ncv_tj_per_unit": None, "ef_t_per_tj": None, "of": None, "tco2e": 43.80},
    ],
}

SUPPLIERS = {
    "org1": [
        {"id": "sup-1", "name": "Bharat Steel Rolling Pvt Ltd", "country": "India", "email": "cbam@bharatsteel.example", "installation": "Raipur works"},
        {"id": "sup-2", "name": "Huaxia Aluminium Co.", "country": "China", "email": "export@huaxia.example", "installation": "Baotou smelter"},
        {"id": "sup-3", "name": "Nile Fertilisers SAE", "country": "Egypt", "email": "esg@nilefert.example", "installation": "Damietta plant"},
        {"id": "sup-4", "name": "Dnipro Metallurgical", "country": "Ukraine", "email": "cbam@dnipromet.example", "installation": "Dnipro BOF shop"},
        {"id": "sup-5", "name": "Anadolu Demir Çelik A.Ş.", "country": "Türkiye", "email": "cbam@anadoludemir.example", "installation": "Iskenderun EAF"},
        {"id": "sup-6", "name": "Saigon Coated Steel JSC", "country": "Viet Nam", "email": "export@saigoncoated.example", "installation": "Phu My galvanising line"},
        {"id": "sup-7", "name": "Hanbit Aluminium Co.", "country": "South Korea", "email": "esg@hanbit-al.example", "installation": "Ulsan casthouse"},
        {"id": "sup-8", "name": "Minas Gusa Ltda", "country": "Brazil", "email": "cbam@minasgusa.example", "installation": "Sete Lagoas blast furnace"},
    ]
}


class MockAdapter:
    async def get_org(self, org_id: str) -> dict:
        from shared.database.mongo import db as host_db

        org = await host_db.organizations.find_one({"id": org_id}, {"_id": 0, "name": 1})
        return {"id": org_id, "name": (org or {}).get("name") or org_id, "reporting_window": "Apr 2026 – Mar 2027"}

    async def list_facilities(self, org_id: str) -> list[dict]:
        return FACILITIES["org1"]

    async def get_facility(self, org_id: str, facility_id: str) -> dict | None:
        return next((f for f in FACILITIES["org1"] if f["id"] == facility_id), None)

    async def list_emission_records(self, org_id: str, facility_id: str, fy: str | None = None) -> list[dict]:
        return EMISSION_RECORDS.get(facility_id, [])

    async def list_suppliers(self, org_id: str) -> list[dict]:
        return SUPPLIERS["org1"]
