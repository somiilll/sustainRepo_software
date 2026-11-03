"""Demo data for org1, mirroring the worked examples in 'CBAM Definitive Period Calculator 2026.xlsx'."""
from .adapters.mock import SUPPLIERS
from .core import db

USER = "seed"

SUBMISSIONS = {"sup-3": {"installation_name": "Damietta plant", "route": "", "verifier": "Bureau Veritas Egypt",
                         "goods": [{"cn_code": "3102 10 19", "see_direct": 1.05, "see_indirect": 0.07, "sefa": 0.95, "route": ""}],
                         "see_direct": 1.05, "see_indirect": 0.07, "sefa": 0.95, "precursors": [], "carbon_price": None,
                         "carbon_price_paid": 0, "carbon_price_warnings": [], "verification_report": "demo_nile_verification.pdf",
                         "submitted_at": "2026-10-18T10:00:00+00:00"}}

IMPORT_LINES = [
    {"cn_code": "7208 51 20", "description": "Hot-rolled plate > 15 mm", "country_of_origin": "India", "import_date": "2026-05-12",
     "net_mass": 400, "basis": "default", "supplier_id": "sup-1", "installation_name": "Raipur works", "customs_ref": "26DE0001", "status": "Default"},
    {"cn_code": "7601 10 90", "description": "Unwrought aluminium, not alloyed", "country_of_origin": "China", "import_date": "2026-08-03",
     "net_mass": 120, "basis": "default", "supplier_id": "sup-2", "installation_name": "Baotou smelter", "customs_ref": "26DE0002", "status": "Awaiting supplier"},
    {"cn_code": "3102 10 19", "description": "Urea > 45% N", "country_of_origin": "Egypt", "import_date": "2026-02-20",
     "net_mass": 600, "basis": "default", "supplier_id": "sup-3", "installation_name": "Damietta plant", "customs_ref": "26NL0003", "status": "Default"},
    {"cn_code": "7207 11 14", "description": "Steel billet", "country_of_origin": "Ukraine", "import_date": "2026-11-15",
     "net_mass": 300, "basis": "actual", "supplier_id": "sup-4", "installation_name": "Dnipro BOF shop", "customs_ref": "26PL0004",
     "see_direct": 1.95, "see_indirect": 0, "sefa": 1.30, "status": "Actual - verified", "evidence": "demo_verification_report.pdf"},
    {"cn_code": "7318 15 88", "description": "Bolts with heads", "country_of_origin": "India", "import_date": "2026-09-08",
     "net_mass": 35, "basis": "default", "supplier_id": "sup-1", "installation_name": "Raipur works", "customs_ref": "26DE0005", "status": "Default"},
    {"cn_code": "2523 29 00", "description": "Grey Portland cement", "country_of_origin": "Tunisia", "import_date": "2026-04-22",
     "net_mass": 900, "basis": "default", "installation_name": "", "customs_ref": "26IT0006", "status": "Default"},
    {"cn_code": "7214 20 00", "description": "Rebar, hot-rolled with ribs", "country_of_origin": "Türkiye", "import_date": "2026-07-14",
     "net_mass": 250, "basis": "default", "supplier_id": "sup-5", "installation_name": "Iskenderun EAF", "customs_ref": "26IT0007", "status": "Default"},
    {"cn_code": "7210 49 00", "description": "Hot-dip galvanised coil", "country_of_origin": "Vietnam", "import_date": "2026-10-02",
     "net_mass": 180, "basis": "default", "supplier_id": "sup-6", "installation_name": "Phu My galvanising line", "customs_ref": "26NL0008", "status": "Default"},
    {"cn_code": "7601 20 99", "description": "Unwrought aluminium alloy", "country_of_origin": "South Korea", "import_date": "2026-03-09",
     "net_mass": 60, "basis": "actual", "supplier_id": "sup-7", "installation_name": "Ulsan casthouse", "customs_ref": "26DE0009",
     "see_direct": 0.31, "see_indirect": 0.42, "sefa": 0.2, "status": "Actual - verified", "evidence": "demo_hanbit_verification.pdf",
     "carbon_price": {"type": "ets", "scheme": "K-ETS", "currency": "KRW", "amount_per_t": 9000, "rebate_per_t": 0,
                      "fx_to_eur": 0.00068, "evidence": "demo_kets_surrender.pdf"}},
    {"cn_code": "7201 10 11", "description": "Non-alloy pig iron", "country_of_origin": "Brazil", "import_date": "2026-06-18",
     "net_mass": 500, "basis": "default", "supplier_id": "sup-8", "installation_name": "Sete Lagoas blast furnace", "customs_ref": "26BE0010", "status": "Default"},
]

INSTALLATION = {
    "name": "Facility A – Rolling mill", "facility_id": "fac-a", "country": "India", "reporting_year": 2026,
    "verification_status": "Draft", "verifier": "", "carbon_price_paid": 0,
    "processes": [{"id": "p-plate", "name": "Hot-rolled plate", "cn_code": "7208 51 20", "route": "", "activity_level_t": 100000,
                   "heat_imp_tj": 150, "ef_heat_imp": 62, "heat_exp_tj": 0, "ef_heat_exp": 62, "wg_imp_tj": 0, "wg_exp_tj": 0,
                   "el_prod_em": 0, "el_mwh": 9000, "ef_el": 0.529, "el_source": "grid", "el_method": "submetering", "other_direct_em": 308.6484}],  # process emissions (scale/lime) so DirEm* = 12,000 t
    "source_streams": [
        {"id": "s-ng", "process_id": "p-plate", "name": "Natural gas – reheating furnace", "kind": "combustion", "unit": "Nm3",
         "ncv": 0.0000356, "ef": 56.1, "of": 1.0, "source": "manual",
         "months": [{"month": m, "qty": q} for m, q in zip(
             ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"],
             [360000, 340000, 365000, 350000, 362000, 345000, 330000, 352000, 358000, 361000, 349000, 338000])]},
        {"id": "s-fo", "process_id": "p-plate", "name": "Furnace oil – soaking pits", "kind": "combustion", "unit": "t",
         "ncv": 0.0404, "ef": 77.4, "of": 1.0, "source": "manual", "months": [{"month": "annual", "qty": 1050}]},
    ],
    "precursors": [
        {"id": "pr-x", "process_id": "p-plate", "name": "Slab – Supplier X (verified)", "cn_code": "7207 12 10", "supplier": "Bharat Steel Rolling",
         "country": "India", "year": 2026, "mass_t": 104000, "basis": "verified", "see_direct": 1.95, "see_indirect": 0.0, "sefa": 1.30,
         "evidence": "demo_slab_verification.pdf"},
    ],
}


async def ensure_seeded(org_id: str) -> None:
    """Load the demo data once per organisation (marker survives deleting all demo rows)."""
    if await db.col("org_meta").find_one({"org_id": org_id, "seeded": True}):
        return
    await seed(org_id)
    await db.col("org_meta").insert_one({"org_id": org_id, "seeded": True, "at": db.now()})


async def seed(org_id: str, force: bool = False) -> None:
    ORG = org_id
    sfx = org_id[:8]
    if not force and await db.col("import_lines").count_documents({"org_id": ORG}) > 0:
        return
    for l in IMPORT_LINES:
        await db.insert_doc("import_lines", ORG, l, USER)
    await db.insert_doc("installations", ORG, INSTALLATION, USER)
    req = await db.insert_doc("supplier_requests", ORG, {
        "supplier_id": "sup-2", "supplier_name": "Huaxia Aluminium Co.", "supplier_email": "export@huaxia.example", "country": "China",
        "import_line_ids": [], "cn_codes": ["7601 10 90"], "reporting_year": 2026, "due_date": "2027-05-31",
        "message": "Please provide verified 2026 SEE/SEFA for the Baotou smelter.", "token": f"demo-huaxia-{sfx}",
        "status": "Opened", "submission": None}, USER)
    lines = await db.list_docs("import_lines", ORG)
    alu = next(l for l in lines if l["cn_code"] == "7601 10 90")
    await db.update_doc("supplier_requests", ORG, req["id"], {"import_line_ids": [alu["id"]]}, USER)
    await db.col("tokens").insert_one({"token": f"demo-huaxia-{sfx}", "org_id": ORG, "request_id": req["id"]})
    inst = next(i for i in await db.list_docs("installations", ORG))
    for ref, d, buyer, q in (("INV-26-0412", "2026-04-12", "Rhein Stahlhandel GmbH", 1200), ("INV-26-0530", "2026-05-30", "Rhein Stahlhandel GmbH", 900),
                             ("INV-26-0815", "2026-08-15", "Acciai Padani S.p.A.", 650), ("INV-26-1103", "2026-11-03", "Rhein Stahlhandel GmbH", 1100)):
        await db.insert_doc("shipments", ORG, {"installation_id": inst["id"], "ref": ref, "date": d, "buyer": buyer,
                                               "process_id": "p-plate", "quantity_t": q, "note": ""}, USER)
    await db.col("verifications").insert_one({
        "org_id": ORG, "installation_id": inst["id"], "verifier_body": "Nordic Verification Services AB", "accreditation_no": "SWEDAC 1234",
        "accreditation_expiry": "2029-03-31", "lead_auditor": "A. Lindqvist", "lead_auditor_consecutive": 1,
        "independent_reviewer": "M. Rossi", "site_visit": {"type": "physical", "date": "2027-02-10"}, "first_year": True,
        "report_language": "English", "status": "Planned", "updated_at": db.now()})
    for sup, cn, status, reminded in (("sup-1", "7208 51 20", "Sent", 1), ("sup-3", "3102 10 19", "Submitted", 0), ("sup-5", "7214 20 00", "Needs completion", 2)):
        line = next(l for l in lines if l["cn_code"] == cn)
        sp = next(x for x in SUPPLIERS["org1"] if x["id"] == sup)
        r = await db.insert_doc("supplier_requests", ORG, {
            "supplier_id": sup, "supplier_name": sp["name"], "supplier_email": sp["email"], "country": sp["country"],
            "import_line_ids": [line["id"]], "cn_codes": [cn], "reporting_year": 2026, "due_date": "2027-05-31", "message": "",
            "token": f"demo-{sup}-{sfx}", "status": status, "reminders": reminded, "last_reminded": "2026-10-20T09:00:00+00:00" if reminded else None,
            "submission": SUBMISSIONS.get(sup), "review_note": "Please add the verification report." if status == "Needs completion" else "",
            "history": [{"at": "2026-10-01T09:00:00+00:00", "status": "Sent", "by": USER}]}, USER)
        await db.col("tokens").insert_one({"token": f"demo-{sup}-{sfx}", "org_id": ORG, "request_id": r["id"], "kind": "supplier"})
    await db.insert_doc("scenarios", ORG, {"name": "Current imports, EUA €80 rising 5%/yr", "rows": [
        {"cn_code": l["cn_code"], "country_of_origin": l["country_of_origin"], "net_mass": l["net_mass"], "basis": "default"}
        for l in IMPORT_LINES[:4]], "price_eur": 80, "price_growth": 0.05, "volume_growth": 0.0}, USER)
    await db.insert_doc("certificates", ORG, {"kind": "purchase", "quantity": 1200, "price": 75.36, "date": "2027-02-15",
                                              "obligation_year": 2026, "note": "First platform purchase (planned)"}, USER)
