"""Marks exactly the catalog KPIs as target-enabled (with their target_label/target_order); everything else is switched off.
Usage: python scripts/apply_target_catalog.py [--apply]   (dry run by default)"""
import os, re, sys
from pymongo import MongoClient
sys.path.insert(0, os.path.dirname(__file__))
from target_catalog import CATALOG

SUBCAT = {"BoD Diversity": "Board of Directors Diversity", "Employee Parental Leave": "Employees Parental Leave", "Recovered": "Recovered / Diverted from disposal"}
EXTRA = {("environment", "Energy"): {"Electricity Within Organization": ["Renewable Electricity", "Renewable Electricity through solar", "Renewable Electricity through wind"]}}
OVERRIDE = {
    "Total Water Consumed in water stress area": "Water Consumption in Water-stress Areas",
    "Water Discharge in water stress area": "Water Discharge to Water-stress Areas (Total)",
    "Water discharged with no treatment done": "Water Discharge - Untreated discharge",
    "Water discharged with treatment done": "Water Discharge - Treated discharge",
    "Renewable Electricity": "Renewable Electricity Consumption",
    "Renewable Electricity through solar": "Solar Electricity Consumption",
    "Renewable Electricity through wind": "Wind Electricity Consumption",
    "Total No. of Training given": "Trainings Completed (Total)",
    "Total No. of Trainings on Organization Policy(ies)": "Trainings - Organisation Policies - Number of Trainings",
    "Total No. of Trainings on Up-skilling": "Trainings - Skill Upgrading - Number of Trainings",
    "Number of days of accounts payables": "Accounts Payable Days",
    "Total Complaints Filled": "Internal Complaints (Total)",
    "Total No. of Trainings on Health and Safety": "Trainings - Health & Safety - Number of Trainings",
    "Total No. of Trainings on Environment": "Trainings - Environment - Number of Trainings",
    "Total No. of Trainings on Human Rights Issues": "Trainings - Human Rights - Number of Trainings",
    "Total No. of Trainings on Re-skilling": "Trainings - Re-skilling - Number of Trainings",
    "Total No. of Trainings on Anti-corruption": "Trainings - Anti-corruption - Number of Trainings",
    "Total No. of Trainings on Ethical Principles": "Trainings - Ethical Principles - Number of Trainings",
    "Total corruption incidents": "Confirmed Corruption Incidents (Total)",
    "Total Data Breach involving customer PII": "Data-breach Incidents - Involving Customer PII",
    "% of Data Breach involving customer PII": "% Data Breaches Involving Customer PII",
    "LTIFR of Employees": "P3-E11 LTIFR - Employees", "LTIFR of Workers": "P3-E11 LTIFR - Workers",
}
SUB_OVERRIDE = {  # (subcategory, label) -> metric_name (labels repeated across subcategories)
    ("Employee Turnover", "Male Turnover"): "Employee Turnover Rate (Male)", ("Employee Turnover", "Female Turnover"): "Employee Turnover Rate (Female)",
    ("Workers Turnover", "Male Turnover"): "Worker Turnover Rate (Male)", ("Workers Turnover", "Female Turnover"): "Worker Turnover Rate (Female)",
    ("Employee Diversity", "Total Employees"): "Employee Diversity - Total Employees", ("Workers Diversity", "Total Workers"): "Workers Diversity - Total Workers",
    ("BoD Diversity", "Total BoD"): "Board of Directors Diversity - Board of Directors (Total)",
    ("Key Management Personnel Diversity", "Total KMP"): "Key Management Personnel Diversity - Key Management Personnel (Total)",
}
for who, pre, noun in (("Employees", "Employee Diversity - ", "employees"), ("Workers", "Workers Diversity - ", "workers")):
    SUB_OVERRIDE[(f"{who[:-1] if who == 'Employees' else who} Diversity", f"Male {who}")] = f"{pre}Total {who} (Male)"
    SUB_OVERRIDE[(f"{who[:-1] if who == 'Employees' else who} Diversity", f"Female {who}")] = f"{pre}Total {who} (Female)"
    for g in ("Minority", "Vulnerable"):
        SUB_OVERRIDE[(f"{who[:-1] if who == 'Employees' else who} Diversity", f"{who} belonging to {g} Group")] = f"{pre}of which: {g}-group {noun}"
for short, full, tot in (("BoD", "Board of Directors Diversity - Board of Directors (Total)", "Board of Directors Diversity - "), ("KMP", "Key Management Personnel Diversity - Key Management Personnel (Total)", "Key Management Personnel Diversity - ")):
    sub = "BoD Diversity" if short == "BoD" else "Key Management Personnel Diversity"
    SUB_OVERRIDE[(sub, f"Male {short}")] = full + " (Male)"
    SUB_OVERRIDE[(sub, f"Female {short}")] = full + " (Female)"
    for g in ("Minority", "Vulnerable"):
        SUB_OVERRIDE[(sub, f"{short} belonging to {g} Group")] = f"{tot}of which: {g}-group members"
for who in ("Employees", "Workers"):
    SUB_OVERRIDE[("Health & Safety Incidents", f"Total Recordable work-related injuries of {who}")] = f"H&S - {who} - Recordable work-related injuries"
    SUB_OVERRIDE[("Health & Safety Incidents", f"No. of fatalities of {who}")] = f"H&S - {who} - Fatalities"
    SUB_OVERRIDE[("Health & Safety Incidents", f"High consequence work-related injury or ill-health (excl. fatalities) of {who}")] = f"H&S - {who} - High-consequence injuries (excl. fatalities)"


def norm(t):
    t = t.lower().replace("bod", "board of directors").replace("kmp", "key management personnel")
    stop = {"total", "of", "the", "no", "regarding", "received", "filled", "filed", "given", "in", "area", "areas", "with", "and"}
    return {w for w in re.sub(r"[^a-z0-9% ]", " ", t).split() if w not in stop}


def resolve(pool, sub, label):
    want = SUB_OVERRIDE.get((sub, label)) or OVERRIDE.get(label)
    if want:
        hit = [k for k in pool if k["metric_name"] == want]
        return hit[0] if len(hit) == 1 else None
    ln = norm(label)
    scored = sorted(((len(ln & norm(k["metric_name"])) / max(len(ln | norm(k["metric_name"])), 1), k) for k in pool), key=lambda x: -x[0])
    return scored[0][1] if scored and scored[0][0] >= 0.6 and (len(scored) == 1 or scored[0][0] > scored[1][0]) else None


def main(apply):
    db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    kpis = list(db.esg_kpi_definitions.find({"status": "active"}, {"_id": 0, "id": 1, "metric_name": 1, "section": 1, "category_name": 1, "subcategory": 1}))
    plan, missing = {}, []
    for (sec, cat), subs in [*CATALOG.items(), *EXTRA.items()]:
        for sub, labels in subs.items():
            pool = [k for k in kpis if k["section"] == sec and k["category_name"] == cat and k["subcategory"] == SUBCAT.get(sub, sub)]
            for i, label in enumerate(labels):
                k = resolve(pool, sub, label)
                if k is None:
                    missing.append((sec, cat, sub, label))
                else:
                    plan[k["id"]] = (label, i, k["metric_name"], f"{cat}/{sub}")
    for kid, (label, i, name, path) in plan.items():
        print(f"{path:60} {label}  <=  {name}")
    for i, (name, label) in enumerate((("Total Energy Consumption (Renewable + Non-Renewable)", "Total Energy Consumption"), ("Renewable Energy Consumption (Total)", "Renewable Energy"))):
        k = next((x for x in kpis if x["metric_name"] == name and x["category_name"] == "Energy"), None)
        if k:
            plan[k["id"]] = (label, i, name, "Energy/(computed energy division)")
    print("\nNOT MATCHED:", *missing, sep="\n  ")
    if not apply:
        return
    db.esg_kpi_definitions.update_many({"id": {"$nin": list(plan)}}, {"$set": {"visibility.target_enabled": False}, "$unset": {"target_label": "", "target_order": ""}})
    for kid, (label, i, *_rest) in plan.items():
        db.esg_kpi_definitions.update_one({"id": kid}, {"$set": {"visibility.target_enabled": True, "target_label": label, "target_order": i}})
    print(f"\napplied: {len(plan)} enabled")


if __name__ == "__main__":
    main("--apply" in sys.argv)
