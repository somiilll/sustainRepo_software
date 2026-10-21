"""Workforce grid subcategories (Female / Male / Total): row specs, field keys, rules and frontend config."""
import json
import os
from typing import Any, Dict, List, Optional

CATEGORY = "Employees/Worker"
_EXISTING = json.load(open(os.path.join(os.path.dirname(__file__), "workforce_existing_keys.json")))
FMT = ["female", "male", "total"]
FM = ["female", "male"]
AGE = [("age_u30", "Under 30", "age"), ("age_3050", "30-50", "age"), ("age_o50", "Over 50", "age")]


def R(row, label, group, level=0, brsr=None, gri=None, sum_of=None, le=None, eq=None, cols=None):
    return {"row": row, "label": label, "group": group, "level": level, "brsr": brsr, "gri": gri,
            "sum_of": sum_of, "le": le, "eq": eq, "cols": cols}


def _ages(gri, group="By Age Group", cols=None):
    return [R(r, label, group, 1, gri=gri, cols=cols) for r, label, _t in AGE]


SPECS: Dict[str, Dict[str, Any]] = {
    "New Employees/Worker": {"cfg": "NEW_HIRES_CONFIG", "prefix": "new_hires", "cols": FMT, "editable_auto_totals": True, "rows": [
        R("total", "New hires (Total)", "Total", 0, gri="401-1-a; 102-3-a, 102-3-e", sum_of=["employees", "workers"],
          eq=[["age_u30", "age_3050", "age_o50"]]),
        R("employees", "Employees", "By Employment Type", 1, gri="401-1-a; 102-3-a", sum_of=["employees_permanent", "employees_other"]),
        R("employees_permanent", "Employees - Permanent", "By Employment Type", 2, gri="102-3-a-ii"),
        R("employees_other", "Employees - Other than permanent", "By Employment Type", 2, gri="102-3-a-ii"),
        R("workers", "Workers", "By Employment Type", 1, gri="102-3-e", sum_of=["workers_permanent", "workers_other"]),
        R("workers_permanent", "Workers - Permanent", "By Employment Type", 2, gri="102-3-e"),
        R("workers_other", "Workers - Other than permanent", "By Employment Type", 2, gri="102-3-e"),
        *_ages("401-1-a", "By Age Group"),
    ]},
    "Terminated Employees": {"cfg": "TERMINATED_EMPLOYEES_CONFIG", "prefix": "term_emp", "cols": FMT, "editable_auto_totals": True, "rows": [
        R("total", "Employees terminated (Total)", "Total", 0, "A-22", "102-3-b; 401-1-b",
          sum_of=["permanent", "temporary", "contract", "part_time", "intern"]),
        R("permanent", "Permanent", "By Employment Type", 1, "A-22", "102-3-b-ii"),
        R("temporary", "Temporary", "By Employment Type", 1, gri="102-3-b-ii"),
        R("contract", "Contract", "By Employment Type", 1, gri="102-3-b-ii"),
        R("part_time", "Part-time", "By Employment Type", 1, gri="102-3-b-ii"),
        R("intern", "Intern / trainee", "By Employment Type", 1, gri="102-3-b-ii"),
    ]},
    "Terminated Workers": {"cfg": "TERMINATED_WORKERS_CONFIG", "prefix": "term_wrk", "cols": FMT, "editable_auto_totals": True, "rows": [
        R("total", "Workers terminated (Total)", "Total", 0, "A-22", "102-3-f; 401-1-b"),
    ]},
    "Employee Diversity": {"cfg": "EMPLOYEE_DIVERSITY_CONFIG", "prefix": "emp_div", "cols": FMT, "rows": [
        R("total", "Total Employees", "Total", 0, "A-20a (D+E)", "2-7-a; 405-1-b", sum_of=["permanent", "other_than_permanent"],
          eq=[["full_time", "part_time"], ["age_u30", "age_3050", "age_o50"]]),
        R("permanent", "Permanent employees", "By Contract Type", 1, "A-20a (D)", "2-7-b-i"),
        R("other_than_permanent", "Other-than-permanent employees", "By Contract Type", 1, "A-20a (E)", "2-7-b-ii",
          sum_of=["temporary", "contract", "intern"]),
        R("temporary", "Temporary", "By Contract Type", 2, "A-20a (E)", "2-7-b-ii"),
        R("contract", "Contract", "By Contract Type", 2, "A-20a (E)", "2-7-b-ii, 2-8-a"),
        R("intern", "Intern / trainee", "By Contract Type", 2, "A-20a (E)", "2-7-b-ii, 2-8-a"),
        R("full_time", "Full-time employees", "By Working Hours", 1, gri="2-7-b-iv"),
        R("part_time", "Part-time employees", "By Working Hours", 1, gri="2-7-b-v"),
        *_ages("405-1-b-ii"),
        R("minority", "of which: Minority-group employees", "Diversity Groups (subsets)", 1, gri="405-1-b-iii", le="total"),
        R("vulnerable", "of which: Vulnerable-group employees", "Diversity Groups (subsets)", 1, "A-20b", "405-1-b-iii", le="total"),
        R("differently_abled", "Differently-abled employees", "Diversity Groups (subsets)", 1, "A-20b (D+E)", "405-1-b-iii",
          sum_of=["da_permanent", "da_other_than_permanent"], le="total"),
        R("da_permanent", "Differently-abled - Permanent", "Diversity Groups (subsets)", 2, "A-20b (D)", "405-1-b-iii"),
        R("da_other_than_permanent", "Differently-abled - Other than permanent", "Diversity Groups (subsets)", 2, "A-20b (E)", "405-1-b-iii"),
    ]},
    "Workers Diversity": {"cfg": "WORKER_DIVERSITY_CONFIG", "prefix": "wrk_div", "cols": FMT, "rows": [
        R("total", "Total Workers", "Total", 0, "A-20a (F+G)", "2-7-a, 2-8-a; 405-1-b", sum_of=["permanent", "other_than_permanent"],
          eq=[["age_u30", "age_3050", "age_o50"]]),
        R("permanent", "Permanent workers", "By Contract Type", 1, "A-20a (F)", "2-7-b-i"),
        R("other_than_permanent", "Other-than-permanent workers", "By Contract Type", 1, "A-20a (G)", "2-8-a"),
        *_ages("405-1-b-ii"),
        R("minority", "of which: Minority-group workers", "Diversity Groups (subsets)", 1, gri="405-1-b-iii", le="total"),
        R("vulnerable", "of which: Vulnerable-group workers", "Diversity Groups (subsets)", 1, "A-20b", "405-1-b-iii", le="total"),
        R("differently_abled", "Differently-abled workers", "Diversity Groups (subsets)", 1, "A-20b (F+G)", "405-1-b-iii",
          sum_of=["da_permanent", "da_other_than_permanent"], le="total"),
        R("da_permanent", "Differently-abled - Permanent", "Diversity Groups (subsets)", 2, "A-20b (F)", "405-1-b-iii"),
        R("da_other_than_permanent", "Differently-abled - Other than permanent", "Diversity Groups (subsets)", 2, "A-20b (G)", "405-1-b-iii"),
    ]},
    "Board of Directors Diversity": {"cfg": "BOD_DIVERSITY_CONFIG", "prefix": "bod_div", "cols": FMT, "rows": [
        R("total", "Board of Directors (Total)", "Total", 0, "A-21", "405-1-a; 2-9-c", eq=[["age_u30", "age_3050", "age_o50"]]),
        *_ages("405-1-a-ii", "By Age Band"),
        R("minority", "of which: Minority-group members", "Diversity Groups (subsets)", 1, gri="405-1-a-iii", le="total"),
        R("vulnerable", "of which: Vulnerable-group members", "Diversity Groups (subsets)", 1, gri="405-1-a-iii", le="total"),
    ]},
    "Key Management Personnel Diversity": {"cfg": "KMP_DIVERSITY_CONFIG", "prefix": "kmp_div", "cols": FMT, "rows": [
        R("total", "Key Management Personnel (Total)", "Total", 0, "A-21", "405-1-a", eq=[["age_u30", "age_3050", "age_o50"]]),
        *_ages("405-1-a-ii", "By Age Band"),
        R("minority", "of which: Minority-group members", "Diversity Groups (subsets)", 1, gri="405-1-a-iii", le="total"),
        R("vulnerable", "of which: Vulnerable-group members", "Diversity Groups (subsets)", 1, gri="405-1-a-iii", le="total"),
    ], "extra_fields": [
        {"key": "percentage_senior_management_hired_from_local_community",
         "label": "% senior management hired from local community",
         "group": "Local Community Hiring", "gri": "202-2-a", "percent": True,
         "kpi": "Senior Management Hired from Local Community (%)"},
    ]},
    "Employee Turnover": {"cfg": "EMPLOYEE_TURNOVER_CONFIG", "prefix": "emp_to", "cols": FMT, "rows": [
        R("start", "Employees at start of year", "Headcount", 0, "A-22", "401-1-b"),
        R("end", "Employees at end of year", "Headcount", 0, "A-22", "401-1-b"),
        R("left", "Employees leaving (Total)", "Employees Leaving", 0, "A-22", "401-1-b", eq=[["age_u30", "age_3050", "age_o50"]]),
        *_ages("401-1-b", "Employees Leaving", ["total"]),
    ], "extra_tables": [("employee_leavers_by_region", "Region - leavers (by region)", "By Region", [
        {"key": "region", "label": "Region", "type": "text", "gri_disclosure": "401-1-b"},
        {"key": "leavers", "label": "Leavers", "type": "number", "gri_disclosure": "401-1-b"}])]},
    "Workers Turnover": {"cfg": "WORKER_TURNOVER_CONFIG", "prefix": "wrk_to", "cols": FMT, "rows": [
        R("start", "Workers at start of year", "Headcount", 0, "A-22", "401-1-b"),
        R("end", "Workers at end of year", "Headcount", 0, "A-22", "401-1-b"),
        R("left", "Workers leaving (Total)", "Workers Leaving", 0, "A-22", "401-1-b"),
    ]},
}

# Preserve the original field keys for the three grid migrations.  Existing record
# values therefore remain usable while the new Female / Male / Total cells receive
# stable keys for new detail entry.
LEGACY_FIELD_KEYS = {
    "New Employees/Worker": {
        "total": {"female": "female", "male": "male", "total": "total_no_of_people_hired"},
        "employees": {"total": "new_hires_employees"},
        "employees_permanent": {"total": "new_hires_employees_permanent"},
        "employees_other": {"total": "new_hires_employees_other_than_permanent"},
        "workers": {"total": "new_hires_workers"},
        "workers_permanent": {"total": "new_hires_workers_permanent"},
        "workers_other": {"total": "new_hires_workers_other_than_permanent"},
        "age_u30": {"total": "no_of_employees_worker_under_30"},
        "age_3050": {"total": "no_of_employees_worker_30_50"},
        "age_o50": {"total": "no_of_employees_worker_over_50"},
    },
    "Terminated Employees": {
        "total": {"female": "female", "male": "male", "total": "no_of_people_terminated"},
        "permanent": {"total": "no_of_permanent_employee_terminated"},
        "temporary": {"total": "no_of_temporary_employee_terminated"},
        "contract": {"total": "no_of_contract_employee_terminated"},
        "part_time": {"total": "no_of_part_time_employee_terminated"},
        "intern": {"total": "no_of_intern_trainee_terminated"},
    },
    "Terminated Workers": {
        "total": {"female": "no_of_female_terminated", "male": "no_of_male_terminated", "total": "no_of_workers_terminated"},
    },
}
for _sub, _cfg, _p, _who in (("Employees Parental Leave", "EMPLOYEE_PARENTAL_LEAVE_CONFIG", "emp_pl", "employees"),
                             ("Workers Parental Leave", "WORKER_PARENTAL_LEAVE_CONFIG", "wrk_pl", "workers")):
    SPECS[_sub] = {"cfg": _cfg, "prefix": _p, "cols": FM, "rows": [
        R("entitled", "Entitled to parental leave", "Parental Leave Funnel", 0, gri="401-3-a"),
        R("took", "Took parental leave", "Parental Leave Funnel", 0, "P3-E5", "401-3-b", le="entitled"),
        R("due_return", "Due to return to work", "Parental Leave Funnel", 0, "P3-E5", "401-3-e", le="took"),
        R("returned", "Returned to work after leave", "Parental Leave Funnel", 0, "P3-E5", "401-3-c", le="due_return"),
        R("retained", "Still employed 12 months after return", "Parental Leave Funnel", 0, "P3-E5", "401-3-d", le="returned"),
    ]}

# These Employee Diversity splits are supporting inputs, not direct BRSR answers.
for _row in SPECS["Employee Diversity"]["rows"]:
    if _row["row"] in {"temporary", "contract", "intern", "vulnerable"}:
        _row["brsr"] = None
for _turnover in ("Employee Turnover", "Workers Turnover"):
    for _row in SPECS[_turnover]["rows"]:
        _row["brsr"] = None
for _row in SPECS["Employees Parental Leave"]["rows"]:
    _row["brsr"] = None


def key(sub: str, row: str, col: str) -> str:
    spec = SPECS[sub]
    return (LEGACY_FIELD_KEYS.get(sub, {}).get(row, {}).get(col)
            or _EXISTING.get(spec["cfg"], {}).get(row, {}).get(col)
            or f"{spec['prefix']}_{row}_{col}")


def row_cols(spec, r) -> List[str]:
    return r["cols"] or spec["cols"]


def grid_keys(sub: str) -> List[str]:
    spec = SPECS[sub]
    return [key(sub, r["row"], c) for r in spec["rows"] for c in row_cols(spec, r)]


def build_rules(sub: str) -> Dict[str, Any]:
    spec = SPECS[sub]
    rows = {r["row"]: r for r in spec["rows"]}
    k = lambda r, c: key(sub, r, c)  # noqa: E731

    def height(r):
        return 1 + max(height(c) for c in rows[r]["sum_of"]) if rows[r]["sum_of"] else 0

    sums, le, quality = [], [], []
    for r in spec["rows"]:
        cols = row_cols(spec, r)
        if not r["sum_of"] and "total" in cols and all(c in cols for c in FM):
            sums.append((k(r["row"], "total"), [k(r["row"], "female"), k(r["row"], "male")]))
    for r in sorted((x for x in spec["rows"] if x["sum_of"]), key=lambda x: height(x["row"])):
        cols = row_cols(spec, r)
        for c in cols:
            sums.append((k(r["row"], c), [k(ch, c) for ch in r["sum_of"] if c in row_cols(spec, rows[ch])]))
        if "total" in cols:
            sums.append((k(r["row"], "total"), [k(r["row"], "female"), k(r["row"], "male")]))
    for r in spec["rows"]:
        for c in row_cols(spec, r):
            if r["le"]:
                le.append((k(r["row"], c), k(r["le"], c)))
            for group in r["eq"] or []:
                if all(c in row_cols(spec, rows[p]) for p in group):
                    quality.append(([k(p, c) for p in group], k(r["row"], c)))
    return {"root": grid_keys(sub), "sums": sums, "le": le, "quality": quality, "other": []}


GRID_RULES = {sub.lower(): build_rules(sub) for sub in SPECS}
GRID_LABELS = {sub.lower(): {key(sub, r["row"], c): f"{r['label']} - {c.capitalize()}" for r in s["rows"] for c in row_cols(s, r)}
               for sub, s in SPECS.items()}


def frontend_config(sub: str) -> Dict[str, Any]:
    spec = SPECS[sub]
    cols = spec["cols"]
    rows = {r["row"]: r for r in spec["rows"]}
    validations = []
    for r in spec["rows"]:
        for group in r["eq"] or []:
            validations.append({"type": "sum_equals", "rows": group, "target": r["row"]})
        if r["le"]:
            validations.append({"type": "less_than_or_equal", "row": r["row"], "target": r["le"]})
    return {
        "key": spec["prefix"], "title": sub,
        "editableAutoTotals": spec.get("editable_auto_totals", False),
        "columns": [{"key": c, "label": c.capitalize()} for c in cols],
        "autoCalculate": {"total": ["female", "male"]} if "total" in cols else {},
        "rows": [{"key": r["row"], "label": r["label"], "group": r["group"], "level": r["level"], "brsr": r["brsr"],
                  "gri": r["gri"], "sumOf": r["sum_of"]} for r in spec["rows"]],
        "sumOrder": [r["row"] for r in sorted((x for x in spec["rows"] if x["sum_of"]),
                                              key=lambda x: 1 + max(1 if rows[c]["sum_of"] else 0 for c in x["sum_of"]))],
        "fieldMap": {r["row"]: {c: key(sub, r["row"], c) for c in row_cols(spec, r)} for r in spec["rows"]},
        "validations": validations,
    }
