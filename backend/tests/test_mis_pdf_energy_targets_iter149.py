"""MIS PDF regression checks: executive summary energy row, targets table contract, and chart labels.

Pure source-level tests only. No API calls, no schedule/email/delivery flows.
"""

import io
import os
import sys

sys.path.append(os.path.abspath("/app/backend"))

from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Spacer

from modules.mis_reports import pdf_builder


def _capture_tables(monkeypatch):
    calls = []

    def fake_styled_table(headers, rows, col_widths=None):
        calls.append({"headers": headers, "rows": rows, "col_widths": col_widths})
        return Spacer(1, 1)

    monkeypatch.setattr(pdf_builder, "_styled_table", fake_styled_table)
    return calls


# --- Executive Summary section ---
def test_exec_summary_includes_energy_consumption_with_current_and_previous_when_energy_selected(monkeypatch):
    calls = _capture_tables(monkeypatch)
    story, styles = [], getSampleStyleSheet()
    report = {
        "selected_sections": ["energy"],
        "kpis": [{"value": 100.0, "previous": 90.0, "change_pct": 11.1}],
        "energy": {"total": 123.45},
        "previous_resources": {"energy": {"total": 111.11}},
        "water": {},
        "waste": {},
        "target_summary": {},
        "overall_management_status": {"status": "Monitor", "high_priority_count": 0},
        "insights": [],
    }

    pdf_builder._sec_executive_summary(story, styles, report)

    metrics_table = next(call for call in calls if call["headers"][:2] == ["Management metric", "Current"])
    labels = [row[0] for row in metrics_table["rows"]]
    assert "Energy Consumption" in labels
    energy_row = next(row for row in metrics_table["rows"] if row[0] == "Energy Consumption")
    assert energy_row[1] == "123.45 MWh"
    assert energy_row[2] == "111.11 MWh"


def test_exec_summary_excludes_energy_when_not_selected_and_uses_water_consumption_label(monkeypatch):
    calls = _capture_tables(monkeypatch)
    story, styles = [], getSampleStyleSheet()
    report = {
        "selected_sections": ["water"],
        "kpis": [{"value": 10.0, "previous": 9.0, "change_pct": 11.1}],
        "energy": {"total": 77.0},
        "water": {"consumption": 88.0},
        "waste": {},
        "previous_resources": {"water": {"consumption": 80.0}},
        "target_summary": {},
        "overall_management_status": {"status": "Monitor", "high_priority_count": 0},
        "insights": [],
    }

    pdf_builder._sec_executive_summary(story, styles, report)

    metrics_table = next(call for call in calls if call["headers"][:2] == ["Management metric", "Current"])
    labels = [row[0] for row in metrics_table["rows"]]
    assert "Energy Consumption" not in labels
    assert "Water Consumption" in labels
    assert "Water" not in labels


# --- Targets section ---
def test_targets_table_has_required_columns_and_configuration_required_fallback(monkeypatch):
    calls = _capture_tables(monkeypatch)
    story, styles = [], getSampleStyleSheet()

    # keep chart rendering side-effect-free for this table-focused assertion
    monkeypatch.setattr(pdf_builder, "_render_target_comparison", lambda _targets: pdf_builder._render_trend_chart([]))

    report = {
        "targets": [
            {
                "name": "Target A",
                "target_value": 100.0,
                "actual_value": 95.0,
                "previous_actual_value": 96.0,
                "unit": "kg",
                "target_direction": "decrease",
                "status": "On Track",
                "progress_pct": 95.0,
            },
            {
                "name": "Needs Config",
                "target_value": None,
                "actual_value": None,
                "previous_actual_value": None,
                "unit": "kg",
                "target_direction": "Not configured",
                "status": "No Data",
                "progress_pct": None,
            },
        ],
        "insights": [],
        "actions": [],
    }

    pdf_builder._sec_targets(story, styles, report)

    table = next(call for call in calls if call["headers"][0] == "Target name")
    assert table["headers"] == [
        "Target name",
        "Target",
        "Current month",
        "Previous month",
        "Unit",
        "Direction",
        "Status",
        "Progress",
    ]

    configured, unconfigured = table["rows"]
    assert configured[1] == "100.0"
    assert configured[2] == "95.0"
    assert configured[3] == "96.0"
    assert configured[5] == "Decrease"
    assert configured[6] == "On Track"
    assert configured[7] == "95.0%"

    assert unconfigured[3] == "Previous month unavailable"
    assert unconfigured[6] == "Configuration Required"
    assert unconfigured[7] == "Configuration Required"


def test_render_target_comparison_filters_to_configured_targets_and_uses_required_legend_labels(monkeypatch):
    captured = {"bar_calls": []}

    class FakeFig:
        def tight_layout(self):
            return None

    class FakeAx:
        def barh(self, yvals, widths, **kwargs):
            captured["bar_calls"].append({"y": list(yvals), "widths": list(widths), "label": kwargs.get("label")})

        def set_yticks(self, *_args, **_kwargs):
            return None

        def set_yticklabels(self, *_args, **_kwargs):
            return None

        def invert_yaxis(self):
            return None

        def grid(self, *_args, **_kwargs):
            return None

        def legend(self, *_args, **_kwargs):
            return None

        def set_title(self, *_args, **_kwargs):
            return None

    monkeypatch.setattr(pdf_builder.plt, "subplots", lambda *args, **kwargs: (FakeFig(), FakeAx()))
    monkeypatch.setattr(pdf_builder, "_fig_to_bytes", lambda _fig, dpi=150: io.BytesIO(b"ok"))

    targets = [
        {"name": "Configured 1", "target_direction": "decrease", "target_value": 100, "actual_value": 90},
        {"name": "Configured 2", "target_direction": "increase", "target_value": 80, "actual_value": 70},
        {"name": "Missing actual", "target_direction": "decrease", "target_value": 50, "actual_value": None},
        {"name": "Not configured", "target_direction": "Not configured", "target_value": 10, "actual_value": 10},
    ]

    result = pdf_builder._render_target_comparison(targets)
    assert isinstance(result, io.BytesIO)

    assert len(captured["bar_calls"]) == 2
    target_bar, actual_bar = captured["bar_calls"]
    assert target_bar["label"] == "Target"
    assert actual_bar["label"] == "Current month"
    assert target_bar["widths"] == [100, 80]
    assert actual_bar["widths"] == [90, 70]


def test_render_target_comparison_uses_empty_trend_fallback_when_no_configured_targets(monkeypatch):
    marker = {"called": False}

    def fake_render_trend_chart(_rows):
        marker["called"] = True
        return io.BytesIO(b"fallback")

    monkeypatch.setattr(pdf_builder, "_render_trend_chart", fake_render_trend_chart)

    result = pdf_builder._render_target_comparison([
        {"name": "No setup", "target_direction": "Not configured", "target_value": None, "actual_value": None}
    ])

    assert marker["called"] is True
    assert isinstance(result, io.BytesIO)
