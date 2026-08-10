"""MIS PDF executive summary regression checks for energy row inclusion logic.

Pure source-level tests only. No API calls, no report delivery/send flows.
"""

import os
import sys

sys.path.append(os.path.abspath("/app/backend"))

from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Spacer

from modules.mis_reports import pdf_builder


# Executive summary: energy row inclusion + value/status contract
def _capture_styled_tables(monkeypatch):
    calls = []

    def fake_styled_table(headers, rows, col_widths=None):
        calls.append({"headers": headers, "rows": rows, "col_widths": col_widths})
        return Spacer(1, 1)

    monkeypatch.setattr(pdf_builder, "_styled_table", fake_styled_table)
    return calls


def _base_report(selected_sections):
    return {
        "selected_sections": selected_sections,
        "kpis": [{"value": 500.0, "previous": 450.0, "change_pct": 11.1}],
        "energy": {"total": 120.0},
        "previous_resources": {
            "energy": {"total": 100.0},
            "water": {"consumption": 40.0},
            "waste": {"generated": 30.0},
        },
        "water": {"consumption": 50.0},
        "waste": {"generated": 40.0},
        "target_summary": {},
        "overall_management_status": {"status": "Monitor", "high_priority_count": 0},
        "insights": [],
    }


def _get_metrics_table(calls):
    return next(call for call in calls if call["headers"][:2] == ["Management metric", "Current"])


def test_exec_summary_includes_energy_when_selected_sections_is_ghg(monkeypatch):
    calls = _capture_styled_tables(monkeypatch)
    story, styles = [], getSampleStyleSheet()

    pdf_builder._sec_executive_summary(story, styles, _base_report(["ghg"]))

    metrics_table = _get_metrics_table(calls)
    labels = [row[0] for row in metrics_table["rows"]]
    assert "Energy Consumption" in labels

    energy_row = next(row for row in metrics_table["rows"] if row[0] == "Energy Consumption")
    assert energy_row[1] == "120.00 MWh"
    assert energy_row[2] == "100.00 MWh"
    assert energy_row[3] == "Needs attention · 20.0% increase"


def test_exec_summary_keeps_energy_when_selected_sections_is_energy(monkeypatch):
    calls = _capture_styled_tables(monkeypatch)
    story, styles = [], getSampleStyleSheet()

    pdf_builder._sec_executive_summary(story, styles, _base_report(["energy"]))

    metrics_table = _get_metrics_table(calls)
    energy_row = next(row for row in metrics_table["rows"] if row[0] == "Energy Consumption")
    assert energy_row[1] == "120.00 MWh"
    assert energy_row[2] == "100.00 MWh"
    assert "20.0% increase" in energy_row[3]


def test_exec_summary_includes_energy_when_selected_sections_is_empty_include_all(monkeypatch):
    calls = _capture_styled_tables(monkeypatch)
    story, styles = [], getSampleStyleSheet()

    pdf_builder._sec_executive_summary(story, styles, _base_report([]))

    metrics_table = _get_metrics_table(calls)
    labels = [row[0] for row in metrics_table["rows"]]
    assert "Energy Consumption" in labels
    assert "Water Consumption" in labels
    assert "Waste Generated" in labels
