"""One-off: groups every Scope 3 factor name into a sector, so the classifier can choose sector -> factor by meaning.
Run:  python -m modules.ocr_extraction.mappings._build_factor_sectors   (needs ANTHROPIC_API_KEY or OPENAI_API_KEY)"""
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv  # noqa: E402

load_dotenv("/app/backend/.env")
import modules.ocr_extraction  # noqa: E402,F401
from extractor_core import llm  # noqa: E402
from pymongo import MongoClient  # noqa: E402

SECTORS = {
    "agriculture_food": "Farming, forestry, fishing, food and beverage production and food products",
    "mining_quarrying": "Mining of metal ores, coal, stone, sand, gravel and support activities",
    "energy_fuels": "Fuels, oil and gas, petroleum products, electricity, gas and steam supply",
    "construction_infrastructure": "Buildings, roads, civil works, asphalt, concrete products, construction services",
    "metals_primary": "Steel, iron, aluminium, copper and other metals produced from ore or scrap; foundries, rolling, drawing, castings",
    "metals_fabricated": "Fabricated metal products, tools, dies, fasteners, welding items, tanks, coating, machine shops, springs, wire products",
    "machinery_equipment": "Industrial and commercial machinery, engines, pumps, compressors, HVAC, material handling equipment",
    "electrical_electronics": "Electrical equipment, motors, cables, batteries, lighting, computers, semiconductors, instruments",
    "vehicles_transport_equipment": "Cars, trucks, auto parts, catalytic and exhaust parts, aircraft, ships, rail and other transport equipment",
    "chemicals_plastics_rubber": "Chemicals, paints, adhesives, catalysts, gases, fertilisers, plastics, resins, rubber products",
    "paper_wood_printing": "Paper, packaging, cartons, wood products, furniture, printing",
    "textiles_apparel": "Fibres, yarn, fabric, garments, leather and footwear",
    "minerals_cement_glass": "Cement, lime, bricks, ceramics, glass, abrasives and other non-metallic mineral products",
    "other_manufacturing": "Medical devices, toys, sports goods, jewellery, signs and any other manufactured goods",
    "trade_retail": "Wholesale and retail trade, margins on goods",
    "transport_logistics": "Freight and passenger transport by road, rail, sea, air, pipeline, couriers, warehousing and support",
    "travel_hospitality": "Hotels, accommodation, restaurants, catering, travel agencies, car rental",
    "information_telecom": "Software, publishing, data processing, telecom, media, IT services",
    "finance_insurance_realestate": "Banking, insurance, investment, real estate, leasing and rental of property or equipment",
    "professional_business_services": "Consulting, engineering, legal, accounting, testing, staffing, security, cleaning, admin and support services",
    "repair_maintenance_other_services": "Repair and maintenance, personal services, membership and other services",
    "education_health_social": "Education, hospitals, medical and social care services",
    "waste_remediation": "Waste collection, treatment, landfill, recycling, incineration, composting, remediation",
    "government_institutional": "Public administration, defence and institutional activities",
}
SYSTEM = ("You group emission-factor names (industry classes and materials, mostly US NAICS style) into sectors. For each numbered name give the "
          "single best sector id. Sectors:\n" + "\n".join(f"- {k}: {v}" for k, v in SECTORS.items()))
SCHEMA = llm.obj({"items": {"type": "array", "items": llm.obj({"i": {"type": "integer"}, "sector": {"type": "string", "enum": list(SECTORS)}})}})
CHUNK = 120


def main() -> None:
    db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    names = sorted({d["activity"].strip().lower() for d in db.scope3_ef.find({}, {"_id": 0, "activity": 1}) if d.get("activity")})
    chunks = [names[i:i + CHUNK] for i in range(0, len(names), CHUNK)]
    out: dict[str, str] = {}

    def run(chunk):
        content = "\n".join(f"{i}: {n}" for i, n in enumerate(chunk))
        data, _ = llm.call_json("layout", SYSTEM, content, SCHEMA, max_tokens=6000)
        return {chunk[r["i"]]: r["sector"] for r in data["items"] if 0 <= r["i"] < len(chunk)}

    with ThreadPoolExecutor(max_workers=3) as ex:
        for part in ex.map(run, chunks):
            out.update(part)
    missing = [n for n in names if n not in out]
    print(f"{len(out)}/{len(names)} names grouped; missing {len(missing)}")
    Path(__file__).with_name("factor_sectors.json").write_text(json.dumps({"sectors": SECTORS, "map": out}, indent=0, ensure_ascii=False))


if __name__ == "__main__":
    main()
