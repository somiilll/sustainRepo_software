from bulk_upload_scope3.calculation_audit import prepare_bulk_calculation_audits


def test_prepare_bulk_calculation_audit_links_trace_to_emission_record():
    record = {
        "id": "emission-1",
        "organization_id": "org-1",
        "scope": "scope3",
        "category": "C1 - Purchased Goods and Services",
        "reporting_period": "2025-08",
        "formula_id": "formula-1",
        "formula_version_id": "formula-version-1",
        "decision_tree_version_id": "tree-version-1",
        "formula_snapshot": {"name": "Spend Based — Standard Currency Conversion"},
        "bulk_upload_job_id": "job-1",
        "created_at": "2026-09-08T11:41:14+00:00",
        "_calculation_audit": {
            "inputs": {"spent_value": {"value": 300000, "unit": "INR"}},
            "context": {"reporting_period": "2025-08"},
            "outputs": {"co2e": {"value": 3.98, "unit": "tCO2e"}},
            "applied_factors": {"exchange_rate": {"value": 85.0, "unit": ""}},
            "audit_log": [{"step": "input", "variable": "spent_value", "value": 300000}],
        },
    }

    audits = prepare_bulk_calculation_audits([record])

    assert "_calculation_audit" not in record
    assert len(audits) == 1
    assert audits[0]["emission_record_id"] == "emission-1"
    assert audits[0]["org_id"] == "org-1"
    assert audits[0]["audit_log"]
    assert audits[0]["formula_version_id"] == "formula-version-1"