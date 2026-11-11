"""Builds activity_taxonomy.json - the master list of activity types the classifier chooses from.

Run:  py -3.11 mappings/_build_taxonomy.py

Each activity type maps to exactly one GHG scope/category/subcategory (or several, chosen by a context
answer such as `use_context` for fuels), an ordered list of Emergent formulas to try, the allowed unit
dimensions, the ESG modules it feeds and any companion rows. Category/subcategory IDs are null until
Emergent's JSON export arrives - only labels are filled.
"""
import json
import re
from pathlib import Path

OUT = Path(__file__).with_name("activity_taxonomy.json")

CATEGORY_LABELS = {
    "stationary_combustion": "Stationary Combustion", "mobile_combustion": "Mobile Combustion",
    "fugitive_emissions": "Fugitive Emissions", "process_emissions": "Process Emissions", "flaring": "Flaring",
    "purchased_electricity": "Purchased Electricity", "purchased_heat_steam_cooling": "Purchased Steam/Heat",
    "cat_1": "C1 - Purchased goods and services", "cat_2": "C2 - Capital goods",
    "cat_3": "C3 - Fuel and energy-related activities", "cat_4": "C4 - Upstream transportation and distribution",
    "cat_5": "C5 - Waste generated in operations", "cat_6": "C6 - Business travel", "cat_7": "C7 - Employee commuting",
    "cat_8": "C8 - Upstream leased assets", "cat_9": "C9 - Downstream transportation and distribution",
    "cat_10": "C10 - Processing of sold products", "cat_11": "C11 - Use of sold products",
    "cat_12": "C12 - End-of-life treatment of sold products", "cat_13": "C13 - Downstream leased assets",
    "cat_14": "C14 - Franchises", "cat_15": "C15 - Investments",
    "water_withdrawal": "Water withdrawal", "water_discharge": "Water discharge", "waste_generated": "Waste generated",
}
SCOPE_LABELS = {"scope_1": "Scope 1", "scope_2": "Scope 2", "scope_3": "Scope 3", "biogenic": "Biogenic",
                "water": "Water", "waste": "Waste", "none": "Not an activity"}

DOMAINS = {
    "fuel_combustion": "Fuels burned in our own or controlled equipment or vehicles: diesel/HSD, petrol, LPG, PNG/CNG, coal, furnace oil, biomass, kerosene; also lines that are explicitly the upstream / well-to-tank emissions of a fuel",
    "refrigerant_fugitive": "Refills or top-ups of refrigerant gas (R-22, R-32, R-410A...), CO2 fire extinguishers, SF6 switchgear gas",
    "industrial_gas": "Industrial and welding gases bought in cylinders or bulk: argon, nitrogen, oxygen, acetylene, CO2 shielding gas, gas blends",
    "electricity": "Purchased electricity: grid utility bills (MSEDCL, DVVNL...), open access, green tariff, renewable PPA; also lines that are explicitly grid T&D losses",
    "heat_steam_cooling": "Purchased steam, hot water, district heating or chilled water",
    "water": "Water supply or withdrawal: municipal water bills, tanker water, borewell, recycled water",
    "wastewater": "Effluent or sewage discharge and treatment (CETP, ETP, STP charges)",
    "waste": "Waste disposal, treatment or recycling: hazardous waste, scrap, e-waste, used oil, sludge, MSW; also waste hauling",
    "freight": "Transport of goods by a third party: trucking, lorry receipts, courier, rail, sea or air freight, freight forwarding",
    "business_travel": "Employee business travel: flights, trains, taxis, buses, hotel stays, travel agency bookings",
    "employee_commute": "Getting employees to and from work: contracted staff buses, cabs, shuttle services, work from home",
    "purchased_goods": "Raw materials, components, consumables, packaging and supplies bought for operations",
    "purchased_services": "Services bought: maintenance, repair, calibration, testing, training, consulting, IT, security, housekeeping (not refills of refrigerant gas or CO2 fire extinguishers - those are fugitive emissions)",
    "capital_goods": "Long-lived assets bought: machinery, plant equipment, vehicles, IT hardware, buildings, electrical equipment",
    "leased_assets": "Rent or lease of offices, warehouses, equipment or vehicles without operator - paid by us (upstream) or, when we are the landlord, leased out to others (downstream)",
    "downstream_value_chain": "What happens to products after we sell them: customers' processing, use of sold products, end-of-life / take-back / post-consumer recycling of sold products, franchises, investments",
    "non_activity": "Not an emissions activity: taxes, statutory fees, permits, consent fees, fines, deposits, advances",
}

# ------------------------------------------------------------------ fuels (IPCC 2006 names as Emergent subcategories)
# (slug, IPCC subcategory, description, keywords, allowed dims, biogenic, mobile_ok)
FUELS = [
    ("diesel", "Gas/Diesel Oil", "High-speed diesel (HSD), light diesel oil (LDO), DG set or vehicle diesel", ["diesel", "hsd", "h.s.d", "ldo", "high speed diesel", "gas oil"], ["volume", "mass"], False, True),
    ("petrol", "Motor Gasoline", "Petrol, motor spirit, MS, gasoline", ["petrol", "motor spirit", "gasoline", r"\bms\b"], ["volume", "mass"], False, True),
    ("lpg", "Liquefied Petroleum Gases", "LPG, propane, butane cylinders or bulk LPG", ["lpg", "propane", "butane", "liquefied petroleum", "auto lpg"], ["mass", "volume"], False, True),
    ("natural_gas", "Natural Gas", "Piped natural gas (PNG), CNG, RLNG, LNG", ["png", "cng", "natural gas", "rlng", "lng", "piped gas", "city gas"], ["gas_volume", "energy", "mass"], False, True),
    ("furnace_oil", "Residual Fuel Oil", "Furnace oil (FO), heavy fuel oil (HFO), LSHS, bunker fuel", ["furnace oil", r"\bf\.?o\b", "hfo", "heavy fuel oil", "lshs", "residual fuel"], ["volume", "mass"], False, False),
    ("kerosene", "Other Kerosene", "Kerosene, SKO, heating kerosene", ["kerosene", "sko"], ["volume", "mass"], False, False),
    ("coal_bituminous", "Other Bituminous Coal", "Steam coal, thermal coal, imported coal for boilers", ["coal", "steam coal", "thermal coal", "imported coal", "bituminous"], ["mass"], False, False),
    ("coal_sub_bituminous", "Sub-Bituminous Coal", "Sub-bituminous coal (many Indian/Indonesian grades)", ["sub-bituminous", "indonesian coal"], ["mass"], False, False),
    ("anthracite", "Anthracite", "Anthracite hard coal", ["anthracite"], ["mass"], False, False),
    ("coking_coal", "Coking Coal", "Metallurgical coking coal", ["coking coal", "met coal"], ["mass"], False, False),
    ("lignite", "Lignite", "Lignite / brown coal", ["lignite", "brown coal"], ["mass"], False, False),
    ("coke_oven_coke", "Coke Oven Coke and Lignite Coke", "Met coke, hard coke, LAM coke", ["met coke", "hard coke", "lam coke", "coke"], ["mass"], False, False),
    ("pet_coke", "Petroleum Coke", "Petroleum coke (petcoke)", ["pet coke", "petcoke", "petroleum coke"], ["mass"], False, False),
    ("naphtha", "Naphtha", "Naphtha used as fuel", ["naphtha"], ["volume", "mass"], False, False),
    ("lubricants", "Lubricants", "Lubricating oil BURNED as fuel (rare - bought lubricants are purchased goods)", ["lubricant burned", "lube oil burned"], ["volume", "mass"], False, False),
    ("bitumen", "Bitumen", "Bitumen burned as fuel", ["bitumen"], ["mass"], False, False),
    ("jet_kerosene", "Jet Kerosene", "Aviation turbine fuel (ATF), Jet A-1 for owned aircraft", ["atf", "jet a-1", "aviation turbine fuel", "jet kerosene"], ["volume", "mass"], False, True),
    ("aviation_gasoline", "Aviation Gasoline", "Avgas for owned piston aircraft", ["avgas", "aviation gasoline"], ["volume", "mass"], False, True),
    ("crude_oil", "Crude Oil", "Crude oil burned as fuel", ["crude oil"], ["volume", "mass"], False, False),
    ("refinery_gas", "Refinery Gas", "Refinery off-gas", ["refinery gas"], ["gas_volume", "mass", "energy"], False, False),
    ("waste_oils", "Waste Oils", "Used/waste oil burned as fuel", ["waste oil burned", "used oil fuel"], ["volume", "mass"], False, False),
    ("blast_furnace_gas", "Blast Furnace Gas", "Blast furnace gas", ["blast furnace gas", r"\bbfg\b"], ["gas_volume", "energy"], False, False),
    ("coke_oven_gas", "Coke Oven Gas", "Coke oven gas", ["coke oven gas", r"\bcog\b"], ["gas_volume", "energy"], False, False),
    ("ethane", "Ethane", "Ethane", ["ethane"], ["mass", "gas_volume"], False, False),
    ("ngl", "Natural Gas Liquids", "Natural gas liquids", ["natural gas liquids", r"\bngl\b"], ["volume", "mass"], False, False),
    ("white_spirit", "White Spirit and SBP", "White spirit / SBP solvents burned", ["white spirit", "mineral turpentine"], ["volume"], False, False),
    ("paraffin_wax", "Paraffin Waxes", "Paraffin wax burned", ["paraffin wax"], ["mass"], False, False),
    ("other_petroleum", "Other Petroleum Products", "Other refinery petroleum products used as fuel", ["light diesel", "other petroleum"], ["volume", "mass"], False, False),
    ("wood", "Wood / Wood Waste", "Firewood, wood chips, sawdust, wood waste", ["firewood", "fire wood", "wood chips", "wood waste", "sawdust", "wood log", "jalau"], ["mass"], True, False),
    ("charcoal", "Charcoal", "Charcoal", ["charcoal"], ["mass"], True, False),
    ("solid_biomass", "Other Primary Solid Biomass", "Rice husk, bagasse, agro-waste briquettes, biomass pellets", ["rice husk", "bagasse", "briquette", "biomass", "pellet", "groundnut shell", "mustard husk"], ["mass"], True, False),
    ("biodiesel", "Biodiesels", "Biodiesel (B100 / FAME)", ["biodiesel", "bio-diesel", r"\bb100\b", "fame"], ["volume", "mass"], True, True),
    ("biogasoline", "Biogasoline", "Ethanol / bio-gasoline", ["ethanol", "biogasoline"], ["volume"], True, True),
    ("biogas", "Other Biogas", "Biogas / compressed biogas (CBG)", ["biogas", "cbg", "compressed biogas", "gobar gas"], ["gas_volume", "mass", "energy"], True, True),
    ("landfill_gas", "Landfill Gas", "Landfill gas", ["landfill gas"], ["gas_volume", "energy"], True, False),
    ("sludge_gas", "Sludge Gas", "Sewage sludge gas", ["sludge gas"], ["gas_volume", "energy"], True, False),
    ("black_liquor", "Sulphite lyes (Black Liquor)", "Black liquor from pulp mills", ["black liquor"], ["mass"], True, False),
    ("msw_fuel", "Municipal Wastes (non-biomass fraction)", "RDF / municipal waste burned as fuel", ["rdf", "refuse derived fuel"], ["mass"], False, False),
]

REFRIGERANTS = [
    ("r22", "R-22", ["r-22", "r22", "hcfc-22", "hcfc 22", "freon 22"]),
    ("r32", "R-32", ["r-32", "r32", "hfc-32"]),
    ("r134a", "R-134a", ["r-134a", "r134a", "hfc-134a", "134a"]),
    ("r410a", "R-410A", ["r-410a", "r410a", "r 410a", "410a"]),
    ("r404a", "R-404A", ["r-404a", "r404a", "404a"]),
    ("r407c", "R-407C", ["r-407c", "r407c", "407c"]),
    ("r407a", "R-407A", ["r-407a", "r407a"]),
    ("r507a", "R-507A", ["r-507a", "r507a", "r-507", "r507"]),
    ("hfc23", "HFC-23", ["hfc-23", "r-23", "r23"]),
    ("hfc125", "HFC-125", ["hfc-125", "r-125"]),
    ("hfc143a", "HFC-143a", ["hfc-143a", "r-143a"]),
    ("hfc152a", "HFC-152a", ["hfc-152a", "r-152a"]),
    ("hfc227ea", "HFC-227ea", ["hfc-227ea", "fm-200", "fm200", "hfc 227"]),
    ("hfc236fa", "HFC-236fa", ["hfc-236fa"]),
    ("hfc245fa", "HFC-245fa", ["hfc-245fa", "r-245fa"]),
    ("co2_extinguisher", "CO2", [r"co2.{0,25}extinguisher", r"extinguisher.{0,25}co2", "co2 type", "co2 cylinder refill", "carbon dioxide extinguisher", "co2 refill", "co2 refilling"]),
    ("sf6", "SF6", ["sf6", "sulphur hexafluoride", "sulfur hexafluoride"]),
    ("nf3", "NF3", ["nf3"]),
    ("halon1211", "Halon-1211", ["halon 1211", "halon-1211"]),
    ("halon1301", "Halon-1301", ["halon 1301", "halon-1301"]),
    ("n2o_fugitive", "N2O", ["nitrous oxide"]),
    ("ch4_fugitive", "CH4", ["methane leak"]),
]


def A(id, domain, label, keywords, dims, ghg, formulas, modules=(), companions=(), **extra):
    rec = {"id": id, "domain": domain, "label": label, "keywords": list(keywords), "dimensions": list(dims),
           "ghg": ghg, "formulas": list(formulas), "modules": list(modules), "companions": list(companions)}
    rec.update(extra)
    return rec


def g(scope, category, subcategory):
    return {"scope": scope, "category": category, "subcategory": subcategory}


acts = []
for slug, sub, desc, kw, dims, bio, mobile_ok in FUELS:
    scope = "biogenic" if bio else "scope_1"
    by_ctx = {"stationary_equipment": g(scope, "stationary_combustion", sub)}
    if mobile_ok:
        by_ctx["company_vehicle"] = g(scope, "mobile_combustion", sub)
        by_ctx["offroad_equipment"] = g(scope, "mobile_combustion", sub)
    else:
        by_ctx["company_vehicle"] = by_ctx["offroad_equipment"] = g(scope, "stationary_combustion", sub)
    by_ctx["third_party_vehicle"] = g("scope_3", "cat_4", "Fuel for third-party transport")
    acts.append(A(f"fuel.{slug}", "fuel_combustion", desc, kw, dims,
                  {"by_context": "use_context", "options": by_ctx, "default": "stationary_equipment"},
                  ["s1_heat", "s1_quantity"], modules=["energy"], companions=["fuel_wtt"], biogenic=bio))

for slug, sub, kw in REFRIGERANTS:
    acts.append(A(f"refrigerant.{slug}", "refrigerant_fugitive", f"{sub} refill / top-up / leakage replacement",
                  kw + (["fire extinguisher refill", "extinguisher refilling"] if slug == "co2_extinguisher" else []),
                  ["mass", "count"] if slug in ("co2_extinguisher", "hfc227ea") else ["mass"], g("scope_1", "fugitive_emissions", sub), ["s1_fugitive"]))
acts.append(A("refrigerant.dcp_extinguisher", "refrigerant_fugitive",
              "Dry chemical powder (ABC/DCP), foam or water fire-extinguisher refill or servicing - no greenhouse gas released",
              ["abc", "dcp", "dry chemical powder", "dry powder", "foam type", "mechanical foam", "water type", "clean agent"],
              ["mass", "count", "currency"], g("scope_3", "cat_1", "Fire safety services"), ["s3_spend"],
              note="Not a GHG fugitive; spend-based Cat 1 only."))

# ------------------------------------------------------------------ industrial gases
acts += [
    A("gas.co2_process", "industrial_gas", "CO2 used and released in process: welding/shielding CO2, beverage CO2, dry ice, CO2 blasting",
      ["co2 gas", "carbon dioxide", "co2 welding", "shielding co2", "dry ice", "co2 liquid"], ["mass", "gas_volume"],
      g("scope_1", "process_emissions", "CO2"), ["s1_process_mass"]),
    A("gas.argon", "industrial_gas", "Argon gas (welding, inert atmosphere) - no direct GHG, purchased good",
      ["argon", r"\bar\b gas", "argon gas"], ["mass", "gas_volume", "count", "currency"], g("scope_3", "cat_1", "Industrial gases - Argon"), ["s3_activity", "s3_spend"]),
    A("gas.argon_co2_blend", "industrial_gas", "Argon/CO2 mixed shielding gas (e.g. Ar 80% CO2 20%) - CO2 share is a process emission",
      ["argon co2", "ar/co2", "ar+co2", "mixed gas", "mig gas", "shielding gas", "corgon"], ["mass", "gas_volume", "count"],
      g("scope_1", "process_emissions", "CO2"), ["s1_process_mass"], split="co2_share_of_blend"),
    A("gas.nitrogen", "industrial_gas", "Nitrogen gas or liquid nitrogen", ["nitrogen", "liquid nitrogen", r"\bln2\b", r"\bn2\b"],
      ["mass", "gas_volume", "volume", "count", "currency"], g("scope_3", "cat_1", "Industrial gases - Nitrogen"), ["s3_activity", "s3_spend"]),
    A("gas.oxygen", "industrial_gas", "Oxygen gas or liquid oxygen (industrial or medical)", ["oxygen", "liquid oxygen", r"\blox\b", r"\bo2\b"],
      ["mass", "gas_volume", "volume", "count", "currency"], g("scope_3", "cat_1", "Industrial gases - Oxygen"), ["s3_activity", "s3_spend"]),
    A("gas.acetylene", "industrial_gas", "Dissolved acetylene (DA) for gas cutting - burned, so a combustion emission",
      ["acetylene", "dissolved acetylene", r"\bda gas\b", r"\bda cylinder\b"], ["mass", "gas_volume", "count"],
      g("scope_1", "stationary_combustion", "Acetylene"), ["s1_quantity"]),
    A("gas.hydrogen", "industrial_gas", "Hydrogen gas", ["hydrogen", r"\bh2\b"], ["mass", "gas_volume", "currency"],
      g("scope_3", "cat_1", "Industrial gases - Hydrogen"), ["s3_activity", "s3_spend"]),
    A("gas.other", "industrial_gas", "Other industrial gas (helium, specialty gas, calibration gas)", ["helium", "specialty gas", "calibration gas", "span gas"],
      ["mass", "gas_volume", "count", "currency"], g("scope_3", "cat_1", "Industrial gases - Other"), ["s3_activity", "s3_spend"]),
]

# ------------------------------------------------------------------ energy
acts += [
    A("elec.grid", "electricity", "Grid electricity from a utility/DISCOM (MSEDCL, DVVNL, BESCOM, TANGEDCO...) - non-renewable mix",
      ["electricity", "energy charges", "kwh", "units consumed", "discom", "msedcl", "dvvnl", "bescom", "tangedco", "tata power", "adani electricity", "torrent power", "power bill", "electricity bill", "ht bill", "lt bill", "grid power", "power consumption", "grid supply", "mseb", "electricity board", "power charges"],
      ["energy"], g("scope_2", "purchased_electricity", "Non-Renewable Electricity"), ["s2_energy"],
      modules=["energy"], companions=["electricity"], hsn=["2716"]),
    A("elec.renewable", "electricity", "Renewable electricity: green tariff, open-access solar/wind, PPA, I-REC/REC-backed supply",
      ["green tariff", "green energy", "open access", "solar ppa", "wind ppa", "renewable", "i-rec", "green power", "solar", "net metering", "wind power"],
      ["energy"], g("scope_2", "purchased_electricity", "Renewable Electricity"), ["s2_energy"], modules=["energy"], companions=["electricity"]),
    A("elec.captive_third_party", "electricity", "Electricity bought from a third-party captive/group-captive plant",
      ["group captive", "captive power", "third party power"], ["energy"],
      g("scope_2", "purchased_electricity", "Non-Renewable Electricity"), ["s2_energy"], modules=["energy"], companions=["electricity"]),
    A("heat.steam", "heat_steam_cooling", "Purchased steam", ["steam", "process steam"], ["mass", "energy"],
      g("scope_2", "purchased_heat_steam_cooling", "Steam"), ["s2_energy"], modules=["energy"], companions=["steam_heat"]),
    A("heat.district_heat", "heat_steam_cooling", "Purchased hot water / district heating", ["district heating", "hot water supply"], ["energy"],
      g("scope_2", "purchased_heat_steam_cooling", "Heat"), ["s2_energy"], modules=["energy"], companions=["steam_heat"]),
    A("heat.cooling", "heat_steam_cooling", "Purchased chilled water / district cooling", ["chilled water", "district cooling", " tr hours", "tr-hr"], ["energy"],
      g("scope_2", "purchased_heat_steam_cooling", "Cooling"), ["s2_energy"], modules=["energy"]),
]

# ------------------------------------------------------------------ water
for slug, sub, desc, kw in [
    ("municipal", "Third-party / municipal water", "Municipal corporation, MIDC, water board or utility water supply", ["water charges", "water bill", "midc water", "municipal water", "water supply", "jal board", "water tax"]),
    ("groundwater", "Groundwater", "Borewell / tubewell groundwater abstraction, CGWA charges", ["borewell", "bore well", "tubewell", "groundwater", "ground water", "cgwa"]),
    ("tanker", "Third-party water - tanker", "Water delivered by tanker", ["water tanker", "tanker water", "tanker supply"]),
    ("surface", "Surface water", "River, canal, lake or dam water drawn", ["river water", "canal water", "irrigation department", "dam water", "surface water"]),
    ("recycled", "Recycled / treated water", "Recycled or treated water bought or reused (tertiary treated, STP water)", ["recycled water", "treated water", "tertiary water", "stp water"]),
    ("rainwater", "Rainwater harvested", "Rainwater harvested and used", ["rainwater", "rain water harvesting"]),
]:
    acts.append(A(f"water.{slug}", "water", desc, kw, ["volume"], g("water", "water_withdrawal", sub), ["water_volume"], modules=["water"]))
acts.append(A("goods.packaged_water", "purchased_goods", "Packaged drinking water bottles/jars (a purchased good, not a withdrawal)",
              ["packaged drinking water", "mineral water", "water bottle", "water jar", "bisleri", "20 l jar"], ["volume", "count", "currency"],
              g("scope_3", "cat_1", "Packaged water"), ["s3_spend"]))
acts.append(A("wastewater.discharge", "wastewater", "Effluent/sewage sent to CETP, sewer or third-party treatment",
              ["cetp", "effluent", "sewage", "sewerage", "wastewater", "waste water", "etp charges", "stp charges"], ["volume", "currency"],
              g("scope_3", "cat_5", "Wastewater treatment"), ["s3_activity", "s3_spend"], modules=["water"], also_water_discharge=True))

# ------------------------------------------------------------------ waste (Cat 5 + Waste module)
WASTE = [
    ("haz_landfill", "Hazardous waste - landfill (TSDF)", "Hazardous waste sent to a TSDF secured landfill", ["tsdf", "secured landfill", "hazardous waste landfill", "haz waste", r"hazardous.{0,30}waste", "hazardous waste disposal"]),
    ("haz_incineration", "Hazardous waste - incineration", "Hazardous waste incinerated", ["incineration", "incinerable", "hazardous waste incineration"]),
    ("haz_coprocessing", "Hazardous waste - co-processing", "Hazardous waste co-processed in cement kilns", ["co-processing", "coprocessing", "cement kiln"]),
    ("etp_sludge", "ETP sludge", "ETP/chemical sludge disposal", ["etp sludge", "chemical sludge", "sludge"]),
    ("used_oil", "Used oil - recycling", "Used/spent oil sent to authorised recycler", ["used oil", "spent oil", "waste oil"]),
    ("ewaste", "E-waste - recycling", "E-waste to authorised recycler", ["e-waste", "ewaste", "electronic waste"]),
    ("battery", "Battery waste - recycling", "Used batteries to recycler", ["battery scrap", "used battery", "battery waste", "lead acid scrap"]),
    ("biomedical", "Biomedical waste - incineration", "Biomedical waste from OHC/clinic", ["biomedical", "bio-medical", "bmw"]),
    ("metal_scrap", "Metal scrap - recycling", "Ferrous/non-ferrous scrap sold or sent for recycling", ["ms scrap", "metal scrap", "iron scrap", "steel scrap", "copper scrap", "aluminium scrap", "scrap metal", "turning scrap"]),
    ("plastic", "Plastic waste - recycling", "Plastic waste/scrap recycling", ["plastic scrap", "plastic waste", "pet scrap"]),
    ("paper", "Paper and cardboard - recycling", "Paper, cardboard, corrugated box scrap", ["cardboard", "carton scrap", "paper scrap", "corrugated scrap", "waste paper"]),
    ("wood", "Wood waste - recycling", "Wooden pallets and wood scrap", ["wooden scrap", "pallet scrap", "wood scrap"]),
    ("organic", "Organic / food waste - composting", "Canteen food and garden waste", ["food waste", "organic waste", "compost", "canteen waste", "garden waste"]),
    ("msw_landfill", "Mixed solid waste - landfill", "General non-hazardous mixed waste to landfill", ["garbage", "municipal solid waste", "msw", "mixed waste", "general waste", "solid waste"]),
]
for slug, sub, desc, kw in WASTE:
    acts.append(A(f"waste.{slug}", "waste", desc, kw, ["mass", "volume", "currency"],
                  g("scope_3", "cat_5", sub), ["s3_activity", "s3_spend"], modules=["waste"], waste_disposal=True))
acts.append(A("waste.transport_only", "waste",
              "Only transport of waste (waste hauling/carting) with no waste type, quantity or disposal route",
              ["waste transport", "waste transportation", "waste carting", "hauling", "scrap transport", "garbage transport", "waste lifting"],
              ["mass", "distance", "count", "currency"], g("scope_3", "cat_4", "Road freight - waste transport"),
              ["s3_freight_tkm", "s3_spend"], waste_transport_only=True))

# ------------------------------------------------------------------ freight
for slug, sub, desc, kw in [
    ("road", "Road freight", "Truck / lorry / tempo goods transport, GTA, lorry receipt (LR)", ["freight", "transport charges", "transportation charges", "logistics", "lorry", "truck", "tempo", "gta", "goods transport", "trucking", "cartage", "lr no", "carriage"]),
    ("rail", "Rail freight", "Goods by rail / container rake", ["rail freight", "railway receipt", "rake", "concor"]),
    ("sea", "Sea freight", "Ocean/sea freight, container shipping, by-sea shipment", ["sea freight", "ocean freight", "by sea", "bill of lading", "container freight", "shipping line", "fcl", "lcl"]),
    ("air", "Air freight", "Air cargo / airway bill shipments", ["air freight", "air cargo", "airway bill", "awb"]),
    ("courier", "Courier", "Courier and parcel services", ["courier", "parcel", "bluedart", "dtdc", "delhivery", "speed post"]),
    ("forwarding", "Freight forwarding and handling", "Customs clearing, forwarding, cargo handling, loading/unloading", ["clearing", "forwarding", "cha charges", "handling charges", "loading", "unloading", "port charges", "thc"]),
]:
    acts.append(A(f"freight.{slug}", "freight", desc, kw, ["mass", "distance", "currency", "count"],
                  {"by_context": "freight_direction", "options": {d: g("scope_3", "cat_9" if d == "outbound_paid_by_customer" else "cat_4", sub)
                                                                  for d in ["inbound", "outbound_paid_by_us", "between_own_sites", "outbound_paid_by_customer", "unknown"]},
                   "default": "unknown"}, ["s3_freight_tkm", "s3_spend"]))

# ------------------------------------------------------------------ travel / commute
acts += [
    A("travel.flight_domestic", "business_travel", "Domestic flight ticket (within India)", ["flight", "air ticket", "indigo", "air india", "akasa", "spicejet", "vistara", "pnr", "boarding"], ["distance", "count", "currency"],
      g("scope_3", "cat_6", "Flight - Domestic"), ["s3_travel_pkm", "s3_spend"]),
    A("travel.flight_international", "business_travel", "International flight ticket", ["international flight", "emirates", "lufthansa"], ["distance", "count", "currency"],
      g("scope_3", "cat_6", "Flight - International"), ["s3_travel_pkm", "s3_spend"]),
    A("travel.rail", "business_travel", "Train ticket (IRCTC, rail travel)", ["irctc", "train", "railway ticket", "rail ticket", "rajdhani", "shatabdi", "vande bharat"], ["distance", "count", "currency"],
      g("scope_3", "cat_6", "Rail"), ["s3_travel_pkm", "s3_spend"]),
    A("travel.taxi", "business_travel", "Taxi / cab / ride-hailing (Ola, Uber) for business trips", ["taxi", "cab", "uber", "ola", "car hire", "outstation cab"], ["distance", "count", "currency"],
      g("scope_3", "cat_6", "Taxi"), ["s3_travel_km", "s3_spend"]),
    A("travel.bus", "business_travel", "Intercity bus ticket", ["bus ticket", "redbus", "volvo bus", "ksrtc", "msrtc"], ["distance", "count", "currency"],
      g("scope_3", "cat_6", "Bus"), ["s3_travel_pkm", "s3_spend"]),
    A("travel.car_rental", "business_travel", "Self-drive car rental or mileage claim", ["car rental", "rental car", "self drive", "mileage claim", "zoomcar", "business trip"], ["distance", "currency"],
      g("scope_3", "cat_6", "Car - Average"), ["s3_travel_km", "s3_spend"]),
    A("travel.hotel", "business_travel", "Hotel / guest house stay", ["hotel", "room charges", "accommodation", "guest house", "lodging", "room night", "stay"], ["count", "currency"],
      g("scope_3", "cat_6", "Hotel stay"), ["s3_hotel", "s3_spend"]),
    A("travel.agency_fee", "business_travel", "Travel agency service fee / convenience fee only", ["service fee", "convenience fee", "booking fee", "agency fee"], ["currency"],
      g("scope_3", "cat_6", "Travel services"), ["s3_spend"]),
    A("commute.staff_bus", "employee_commute", "Contracted staff bus / shuttle for employees", ["staff bus", "employee bus", "shuttle", "company bus", "employee transport", "contract vehicle", "bus hire"], ["distance", "count", "currency"],
      g("scope_3", "cat_7", "Bus"), ["s3_travel_km", "s3_spend"]),
    A("commute.cab", "employee_commute", "Contracted employee cabs for home-office pick-up/drop", ["employee cab", "pick up drop", "pickup and drop", "staff cab"], ["distance", "count", "currency"],
      g("scope_3", "cat_7", "Car - Average"), ["s3_travel_km", "s3_spend"]),
    A("commute.wfh", "employee_commute", "Work-from-home days", ["work from home", "wfh"], ["count"], g("scope_3", "cat_7", "Work from home"), ["s3_wfh"]),
]

# ------------------------------------------------------------------ goods / services / capex / leases
GOODS = [
    ("steel", "Iron and steel", "Steel, iron, MS/SS sheets, rods, billets, pipes, castings", ["steel", "ms plate", "ss sheet", "iron", "tmt", "billet", "hr coil", "cr coil", "casting", "forging"]),
    ("aluminium", "Aluminium", "Aluminium ingots, sheets, extrusions", ["aluminium", "aluminum", "alu "]),
    ("copper", "Copper", "Copper rods, wire, cathodes, busbars", ["copper", "cu wire", "busbar"]),
    ("other_metals", "Other metals", "Zinc, brass, nickel, lead and other metals", ["zinc", "brass", "nickel", "lead ingot", "tin "]),
    ("plastics", "Plastics", "Plastic granules, resins, polymer sheets/films", ["hdpe", "ldpe", "polypropylene", "pvc", "pet resin", "granules", "polymer", "plastic"]),
    ("chemicals", "Chemicals", "Industrial chemicals, solvents, acids, paints, adhesives", ["chemical", "acid", "caustic", "solvent", "paint", "primer", "thinner", "adhesive", "resin", "reagent", "hydroxide", "sulphate", "sulfate", "chloride", "sodium", "detergent", "coolant"]),
    ("cement", "Cement and construction materials", "Cement, concrete, aggregates, bricks, sand", ["cement", "concrete", "rmc", "aggregate", "bricks", "sand"]),
    ("paper_packaging", "Paper and packaging", "Paper, corrugated boxes, cartons, packaging material", ["corrugated box", "carton", "packaging", "paper", "stretch film", "pallet"]),
    ("electrical_components", "Electrical and electronic components", "Cables, switches, PCBs, motors, sensors, spares", ["cable", "switch", "pcb", "sensor", "relay", "motor spares", "electrical items", "electrical component", "electronic component", "bearing"]),
    ("consumables", "Consumables and spares", "Tools, welding electrodes, abrasives, PPE, lab supplies, spares", ["electrode", "welding rod", "abrasive", "grinding wheel", "ppe", "gloves", "safety shoes", "spares", "spare part", "consumable", "tools", "supplies"]),
    ("office_supplies", "Office supplies", "Stationery, printing, office consumables", ["stationery", "printing", "toner", "office supplies"]),
    ("food_canteen", "Food and canteen", "Canteen food, catering, groceries", ["canteen", "catering", "food", "meals", "groceries", "tea", "snacks"]),
    ("textiles", "Textiles", "Fabric, yarn, uniforms", ["fabric", "yarn", "uniform", "cotton"]),
    ("lubricants", "Lubricants and oils", "Lubricating oil, engine/gear/hydraulic oil, grease (used, not burned)", ["lubricant", "lube oil", "engine oil", "gear oil", "hydraulic oil", "grease", "transformer oil", "cutting oil", "servo"]),
    ("other_goods", "Other purchased goods", "Any other purchased goods", ["material", "goods"]),
]
for slug, sub, desc, kw in GOODS:
    acts.append(A(f"goods.{slug}", "purchased_goods", desc, kw, ["mass", "volume", "count", "currency"],
                  g("scope_3", "cat_1", sub), ["s3_activity", "s3_spend"], generic=slug.startswith("other")))
SERVICES = [
    ("maintenance", "Repair and maintenance", "AMC, repair, overhaul, maintenance services", ["amc", "repair", "maintenance", "servicing", "overhaul"]),
    ("calibration_testing", "Testing, inspection and calibration", "Calibration, testing, inspection, certification, lab analysis", ["calibration", "testing", "inspection", "certification", "lab analysis", "nabl"]),
    ("training", "Education and training", "Training programmes, courses, workshops", ["training", "course", "workshop", "seminar"]),
    ("consulting", "Professional services", "Consulting, legal, audit, accounting, engineering services", ["consulting", "consultancy", "legal", "audit fee", "professional fee", "advisory"]),
    ("telecom_it", "IT and telecom services", "Software, SaaS, cloud, internet, telephone", ["software", "license", "subscription", "saas", "cloud", "internet", "broadband", "telephone", "mobile bill"]),
    ("manpower", "Manpower, security and housekeeping", "Contract labour, security guards, housekeeping, facility management", ["manpower", "contract labour", "security", "housekeeping", "facility management", "cleaning"]),
    ("financial", "Financial and insurance services", "Insurance premiums, bank charges", ["insurance", "premium", "bank charges"]),
    ("medical", "Medical services", "Ambulance, OHC, medical check-ups", ["ambulance", "medical", "health check", "ohc"]),
    ("other_services", "Other services", "Any other service", ["service", "charges"]),
]
for slug, sub, desc, kw in SERVICES:
    acts.append(A(f"service.{slug}", "purchased_services", desc, kw, ["currency", "count"],
                  g("scope_3", "cat_1", sub), ["s3_spend"], generic=slug.startswith("other")))
for slug, sub, desc, kw in [
    ("machinery", "Machinery and equipment", "Production machinery, compressors, pumps, plant equipment", ["machine", "machinery", "compressor", "pump", "equipment", "cnc", "press"]),
    ("vehicles", "Vehicles", "Purchase of cars, trucks, forklifts", ["vehicle purchase", "new vehicle", "forklift purchase"]),
    ("it_hardware", "IT hardware", "Computers, laptops, servers, printers", ["laptop", "computer", "server", "desktop", "printer", "monitor"]),
    ("electrical_equipment", "Electrical equipment and appliances", "Transformers, panels, ACs, appliances", ["transformer", "panel", "air conditioner", "appliance", "dg set purchase", "ups"]),
    ("buildings", "Buildings and construction", "Civil works, construction, building extension", ["civil work", "construction", "building", "shed", "fabrication work"]),
]:
    acts.append(A(f"capex.{slug}", "capital_goods", desc, kw, ["count", "currency", "mass"],
                  g("scope_3", "cat_2", sub), ["s3_spend", "s3_activity"]))
acts += [
    A("elec.td_losses", "electricity", "A line that is explicitly grid transmission & distribution (T&D) losses or upstream generation of electricity",
      ["t&d loss", "t & d loss", "transmission and distribution loss", "transmission & distribution loss", "network losses", "line losses", r"t&d"],
      ["energy", "currency"], g("scope_3", "cat_3", "Electricity - T&D losses and Generation"), ["s3_activity", "s3_spend"], priority=3),
    A("fuel.upstream_wtt", "fuel_combustion", "A line that is explicitly the well-to-tank / upstream (extraction, refining, transport) emissions of a fuel",
      ["well-to-tank", "well to tank", "wtt", "upstream emissions", "fuel upstream", "extraction & transmission", "extraction and transmission"],
      ["volume", "mass", "energy", "gas_volume", "currency"], g("scope_3", "cat_3", "Fuel - Well to Tank (WTT)"), ["s3_activity", "s3_spend"], priority=3),
    A("downstream.processing", "downstream_value_chain", "Further processing of our sold intermediate products by customers",
      ["processing of sold", "customer processing", "downstream processing"], ["mass", "energy", "currency"], g("scope_3", "cat_10", "Processing of sold products"), ["s3_activity", "s3_spend"], priority=2),
    A("downstream.use_phase", "downstream_value_chain", "Energy or fuel used by customers when using our sold products (use phase)",
      ["use of sold products", "use phase", "sold appliances", "lifetime consumption", "product use"], ["energy", "volume", "currency"], g("scope_3", "cat_11", "Use of sold products"), ["s3_activity", "s3_spend"], priority=2),
    A("downstream.end_of_life", "downstream_value_chain", "End-of-life treatment of products we sold: customer take-back, post-consumer recovery and recycling",
      ["end-of-life", "end of life", "post-consumer", "post consumer", "take-back", "take back", "sold products recycling", "decommissioned sold", "epr"],
      ["mass", "currency"], g("scope_3", "cat_12", "End-of-life treatment of sold products"), ["s3_activity", "s3_spend"], priority=2),
    A("lease.downstream", "leased_assets", "Assets we own and lease out to others (we are the landlord/lessor): sublet space, rented-out equipment",
      ["subleased", "sub-leased", "sublet", "leased out", "let out", "rental income", "to tenant", "tenant lease", "lessee"],
      ["currency", "count"], g("scope_3", "cat_13", "Downstream leased assets"), ["s3_spend"], priority=2),
    A("downstream.franchise", "downstream_value_chain", "Franchise outlets operated by franchisees", ["franchise", "franchisee", "franchised", "franchise store", "franchised store"], ["currency", "energy"],
      g("scope_3", "cat_14", "Franchises"), ["s3_spend", "s3_activity"], priority=2),
    A("downstream.investment", "downstream_value_chain", "Equity or debt investments, project finance", ["equity investment", "investment in", "project finance", "debt investment"], ["currency"],
      g("scope_3", "cat_15", "Investments"), ["s3_spend"], priority=2),
    A("lease.building", "leased_assets", "Rent of office, warehouse or factory premises", ["rent", "lease rent", "office rent", "warehouse rent", "leave and license"], ["currency"],
      g("scope_3", "cat_8", "Leased buildings"), ["s3_spend"], note="If the company controls the leased site's energy, report its energy in Scope 1/2 instead."),
    A("lease.equipment_vehicle", "leased_assets", "Hire/rental of equipment or vehicles (cranes, hydra, forklifts, cars) without fuel", ["hydra hire", "crane hire", "hire charges", "equipment rent", "equipment rental", "machine rental"], ["currency", "count"],
      g("scope_3", "cat_8", "Leased equipment"), ["s3_spend"]),
    A("none.tax_fee", "non_activity", "Taxes, statutory/consent fees, permits, fines, deposits, rounding - not an emissions activity",
      ["gst", "cgst", "sgst", "igst", "tcs", "tds", "consent fee", "mpcb", "cpcb", "permit", "penalty", "fine", "security deposit", "electricity duty", "round off", "late payment"],
      ["currency"], g("none", "none", "None"), [], no_record=True),
]

# ------------------------------------------------------------------ write
REMOVED_DOMAINS = {"purchased_goods", "purchased_services", "capital_goods", "waste", "freight", "business_travel", "employee_commute",
                   "leased_assets", "downstream_value_chain"}      # classified against the factor tables (scope3_ef), not this list
acts = [a for a in acts if a["domain"] not in REMOVED_DOMAINS]
ids = [a["id"] for a in acts]
assert len(ids) == len(set(ids)), "duplicate ids"
for a in acts:
    assert a["domain"] in DOMAINS, a["id"]
by_dom = {}
for a in acts:
    by_dom.setdefault(a["domain"], []).append(a["id"])
assert max(len(v) for v in by_dom.values()) <= 255  # Jev choice limit

OUT.write_text(json.dumps({
    "_about": "Activity types the classifier chooses from. Generated by _build_taxonomy.py - edit that file, not this one. "
              "category_id / subcategory_id stay null until Emergent's JSON export is mapped in.",
    "scope_labels": SCOPE_LABELS, "category_labels": CATEGORY_LABELS,
    "domains": DOMAINS, "activities": acts,
}, indent=1, ensure_ascii=False), encoding="utf-8")
print(f"{len(acts)} activities in {len(DOMAINS)} domains -> {OUT.name}")
for d, v in by_dom.items():
    print(f"  {d}: {len(v)}")
