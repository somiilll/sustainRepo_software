"""Social detail service — workforce, diversity, training, complaints, health & safety breakdowns."""
from typing import Dict, List, Optional


async def get_social_detail(
    db, org_id: str, start_date: str, end_date: str,
    facility_ids: Optional[List[str]] = None,
) -> dict:
    """Aggregate social_records for the Social Dashboard."""

    org_query = {"org_id": org_id, "is_current": {"$ne": False}, "status": {"$ne": "draft"}}
    if facility_ids:
        org_query["facility_id"] = {"$in": facility_ids}

    records = await db.social_records.find(
        org_query,
        {"_id": 0, "category": 1, "subcategory": 1, "field_values": 1, "reporting_period": 1},
    ).to_list(10000)

    # --- KPI accumulators ---
    total_employees = 0
    total_male = 0
    total_female = 0
    permanent_employees = 0
    temporary_employees = 0
    contract_employees = 0
    workers = 0
    minority = 0
    vulnerable = 0
    total_board = 0
    board_male = 0
    board_female = 0
    board_minority = 0
    board_vulnerable = 0
    total_trainings = 0
    total_incidents = 0
    loss_time_injuries = 0
    total_hours_worked = 0
    total_fatalities = 0
    return_to_work = 0
    retention_rate = 0.0
    new_hires = 0
    turnover = 0
    internal_complaints = 0
    posh_complaints = 0
    customer_complaints = 0
    external_complaints = 0
    sensitive_data_complaints = 0

    # Training breakdowns
    training_by_attendee: Dict[str, int] = {}
    training_trend: Dict[str, int] = {}  # period -> count

    # Complaint breakdowns
    complaint_status: Dict[str, int] = {"Open": 0, "Closed": 0, "Pending": 0}
    complaint_filed_against: Dict[str, int] = {}
    complaint_categories: Dict[str, int] = {
        "Internal": 0, "External": 0, "POSH": 0, "Customer": 0, "Sensitive Data": 0,
    }

    # Workforce composition over time
    workforce_composition: Dict[str, dict] = {}  # period -> {permanent, temporary, workers, contract}

    # Employee movement over time
    employee_movement: Dict[str, dict] = {}  # period -> {new_hires, turnover, retention}

    # Health & safety trend
    safety_trend: Dict[str, int] = {}  # period -> incidents

    def _period_key(rp):
        """Extract a sortable period key from reporting_period."""
        if isinstance(rp, dict):
            y = rp.get("year")
            m = rp.get("month")
            fy = rp.get("financial_year")
            if y and m:
                return f"{y}-{str(m).zfill(2)}"
            if fy:
                return fy
            if y:
                return str(y)
        if isinstance(rp, str):
            return rp
        return "unknown"

    for rec in records:
        cat = (rec.get("category") or "").lower()
        sub = (rec.get("subcategory") or "").lower()
        fv = rec.get("field_values") or {}
        period = _period_key(rec.get("reporting_period"))

        # --- Employee Diversity ---
        if "diversity" in sub or "employee" in sub:
            emps = int(fv.get("no_of_employees") or 0)
            male = int(fv.get("no_of_male") or 0)
            female = int(fv.get("no_of_female") or 0)
            total_employees += emps
            total_male += male
            total_female += female

            perm = int(fv.get("no_of_permanent_employees") or 0)
            temp = int(fv.get("no_of_temporary_employees") or 0)
            contract = int(fv.get("no_of_contract_employees") or 0)
            wrk = int(fv.get("no_of_workers") or 0)
            permanent_employees += perm
            temporary_employees += temp
            contract_employees += contract
            workers += wrk

            minority += int(fv.get("no_of_employees_minority") or 0)
            vulnerable += int(fv.get("no_of_employees_vulnerable_groups") or 0)

            # Workforce composition per period
            if period not in workforce_composition:
                workforce_composition[period] = {"permanent": 0, "temporary": 0, "workers": 0, "contract": 0}
            workforce_composition[period]["permanent"] += perm
            workforce_composition[period]["temporary"] += temp
            workforce_composition[period]["workers"] += wrk
            workforce_composition[period]["contract"] += contract

        # --- Board ---
        if "board" in sub or "director" in sub:
            # total_board += int(fv.get("total_board_of_directors") or fv.get("no_of_board_members") or 0)
            board_male += int(fv.get("no_of_male_directors") or fv.get("no_of_male") or 0)
            board_female += int(fv.get("no_of_female_directors") or fv.get("no_of_female") or 0)
            board_minority += int(fv.get("no_of_directors_minority") or fv.get("no_of_employees_belonging_to_minority") or 0)
            board_vulnerable += int(fv.get("no_of_directors_vulnerable") or fv.get("no_of_employees_belonging_to_vulnerable_groups") or 0)

            total_board = int(board_male + board_female)

        # --- Training ---
        if "training" in sub or "learning" in sub:
            count = int(fv.get("no_of_trainings_done") or 0)
            total_trainings += count

            attendee = fv.get("training_attendes_type") or "General"
            training_by_attendee[attendee] = training_by_attendee.get(attendee, 0) + count

            if period != "unknown":
                training_trend[period] = training_trend.get(period, 0) + count

        # --- Employee Movement ---
        if "movement" in sub or "hire" in sub or "turnover" in sub or "retention" in sub:
            nh = int(fv.get("new_hires") or fv.get("no_of_new_hires") or 0)
            to = int(fv.get("turnover") or fv.get("employee_turnover") or 0)
            rr = float(fv.get("retention_rate") or fv.get("employee_retention_rate") or 0)
            rtw = int(fv.get("return_to_work") or fv.get("return_to_work_rate") or 0)
            new_hires += nh
            turnover += to
            if rr > 0:
                retention_rate = rr
            return_to_work += rtw

            if period not in employee_movement:
                employee_movement[period] = {"new_hires": 0, "turnover": 0, "retention": 0}
            employee_movement[period]["new_hires"] += nh
            employee_movement[period]["turnover"] += to
            employee_movement[period]["retention"] = rr

        # --- Complaints ---
        if "complaint" in sub:
            ic = int(fv.get("total_no_of_complaints_recieved") or 0)
            pc = int(fv.get("no_of_posh_complaints") or 0)
            cc = int(fv.get("total_no_of_complaints") or 0)
            ec = int(fv.get("no_of_complaints") or 0)
            sc = int(fv.get("no_of_complaints_involving_sensitive_customer_data") or 0)
            pending_complaints = int(fv.get("no_of_pending_complaints") or 0)
            internal_complaints += ic
            posh_complaints += pc
            customer_complaints += cc
            external_complaints += ec
            sensitive_data_complaints += sc
            pending_status_complaints += pending_complaints

            complaint_categories["Internal"] += ic
            complaint_categories["External"] += ec
            complaint_categories["POSH"] += pc
            complaint_categories["Customer"] += cc
            complaint_categories["Sensitive Data"] += sc
            complaint_status["Open"] += pending_status_complaints
            complaint_status[status] += pending_status_complaints

            # Status
            # status = (fv.get("status") or fv.get("no_of_pending_complaints") or "").capitalize()
            # if status in complaint_status:
            #     total_for_status = ic + pc + cc + ec + sc
            #     complaint_status[status] += total_for_status
            # else:
            #     complaint_status["Open"] += ic + pc + cc + ec + sc

            # Filed against
            fa = fv.get("complaint_filed_against") or ""
            if fa:
                complaint_filed_against[fa] = complaint_filed_against.get(fa, 0) + ic + pc + cc + ec + sc

        # --- Health & Safety ---
        if "health" in sub or "safety" in sub or "incident" in sub:
            incidents = int(fv.get("total_no_of_incidents") or fv.get("total_incidents") or 0)
            lti = int(fv.get("no_of_loss_time_injuries") or fv.get("loss_time_injuries") or 0)
            fatalities = int(fv.get("no_of_fatality") or fv.get("no_of_fatalities") or 0)
            hw = float(fv.get("total_hours_worked") or 0)
            total_incidents += incidents
            loss_time_injuries += lti
            total_fatalities += fatalities
            total_hours_worked += hw

            if period != "unknown":
                safety_trend[period] = safety_trend.get(period, 0) + incidents

    # Format time series
    def _sorted_series(d):
        return [{"period": k, **v} for k, v in sorted(d.items())]

    def _sorted_trend(d):
        return [{"period": k, "value": v} for k, v in sorted(d.items())]

    def _sorted_breakdown(d):
        return sorted(
            [{"name": k, "value": v} for k, v in d.items() if v > 0],
            key=lambda x: x["value"], reverse=True,
        )

    # LTIFR calculation
    ltifr = (loss_time_injuries / total_hours_worked * 1_000_000) if total_hours_worked > 0 else 0

    return {
        "kpis": {
            "total_employees": total_employees,
            "total_male": total_male,
            "total_female": total_female,
            "total_trainings": total_trainings,
            "total_board": total_board,
            "return_to_work": return_to_work,
            "retention_rate": round(retention_rate, 1),
            "internal_complaints": internal_complaints,
            "posh_complaints": posh_complaints,
            "customer_complaints": customer_complaints,
            "external_complaints": external_complaints,
            "total_incidents": total_incidents,
            "loss_time_injuries": loss_time_injuries,
            "total_fatalities": total_fatalities,
            "ltifr": round(ltifr, 2),
            "new_hires": new_hires,
            "turnover": turnover,
        },
        "diversity": {
            "male": total_male,
            "female": total_female,
            "minority": minority,
            "vulnerable": vulnerable,
        },
        "board_diversity": {
            "male": board_male,
            "female": board_female,
            "minority": board_minority,
            "vulnerable": board_vulnerable,
        },
        "workforce_composition": _sorted_series(workforce_composition),
        "employee_movement": _sorted_series(employee_movement),
        "training_by_attendee": _sorted_breakdown(training_by_attendee),
        "training_trend": _sorted_trend(training_trend),
        "complaint_status": _sorted_breakdown(complaint_status),
        "complaint_filed_against": _sorted_breakdown(complaint_filed_against),
        "complaint_categories": _sorted_breakdown(complaint_categories),
        "safety_trend": _sorted_trend(safety_trend),
    }
