"""MIS PDF incidents/compliance chart placement regression checks.

Pure source-level tests only. No API calls, no send/email/report-generation flows.
"""

import io
import os
import sys

sys.path.append(os.path.abspath("/app/backend"))

from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Spacer

from modules.mis_reports import pdf_builder


# incidents/compliance section chart placement and fallback notice behavior
def _patch_lightweight_rendering(monkeypatch):
    chart_tables = []
    paragraph_texts = []

    class FakeTable:
        def __init__(self, data, colWidths=None, hAlign=None):
            self.data = data
            self.colWidths = colWidths
            self.hAlign = hAlign
            chart_tables.append(self)

        def setStyle(self, *_args, **_kwargs):
            return None

    def fake_paragraph(text, style):
        paragraph_texts.append(str(text))
        return {"text": text, "style": style}

    monkeypatch.setattr(pdf_builder, "Table", FakeTable)
    monkeypatch.setattr(pdf_builder, "Paragraph", fake_paragraph)
    monkeypatch.setattr(pdf_builder, "Image", lambda buf, width, height: {"buf": buf, "width": width, "height": height})
    monkeypatch.setattr(pdf_builder, "_styled_table", lambda headers, rows, col_widths=None: Spacer(1, 1))
    return chart_tables, paragraph_texts


def _base_report(operational_trends):
    return {
        "operational_kpis": {
            "incident_count": 3,
            "ltifr": 0.5,
            "ghg_intensity": 1.0,
            "energy_intensity": 2.0,
            "account_payable_days": 45.2,
        },
        "twelve_month_operational_trends": operational_trends,
        "compliance": [],
        "supplier_assessment": {},
    }


def test_incidents_section_renders_only_available_operational_series_with_expected_specs(monkeypatch):
    chart_tables, _paragraph_texts = _patch_lightweight_rendering(monkeypatch)
    render_calls = []

    def fake_render_rolling_trend(title, trends, unit, color):
        render_calls.append({"title": title, "trends": trends, "unit": unit, "color": color})
        return io.BytesIO(b"ok")

    monkeypatch.setattr(pdf_builder, "_render_rolling_trend", fake_render_rolling_trend)

    report = _base_report(
        {
            "incidents": [{"period": "2025-01", "value": 3}, {"period": "2025-02", "value": None}],
            "ltifr": [{"period": "2025-01", "value": None}, {"period": "2025-02", "value": None}],
            "account_payable_days": [{"period": "2025-01", "value": 45.0}, {"period": "2025-02", "value": 47.0}],
        }
    )

    story, styles = [], getSampleStyleSheet()
    pdf_builder._sec_incidents_compliance(story, styles, report)

    assert len(render_calls) == 2
    assert render_calls[0]["title"] == "12-Month Incidents Trend"
    assert render_calls[0]["unit"] == "Count"
    assert render_calls[0]["color"] == "#4f46e5"
    assert render_calls[1]["title"] == "12-Month Account Payable Days"
    assert render_calls[1]["unit"] == "Days"
    assert render_calls[1]["color"] == "#475569"

    assert any(getattr(table, "colWidths", None) == [3.2 * pdf_builder.inch, 3.2 * pdf_builder.inch] for table in chart_tables)


def test_incidents_section_shows_unavailable_note_when_all_series_have_no_values(monkeypatch):
    _chart_tables, paragraph_texts = _patch_lightweight_rendering(monkeypatch)
    monkeypatch.setattr(pdf_builder, "_render_rolling_trend", lambda *_args, **_kwargs: io.BytesIO(b"ok"))

    report = _base_report(
        {
            "incidents": [{"period": "2025-01", "value": None}],
            "ltifr": [{"period": "2025-01", "value": None}],
            "account_payable_days": [{"period": "2025-01", "value": None}],
        }
    )

    story, styles = [], getSampleStyleSheet()
    pdf_builder._sec_incidents_compliance(story, styles, report)

    assert "12-month operational trends unavailable — insufficient approved historical data." in paragraph_texts


def test_incidents_section_pads_single_chart_row_with_spacer(monkeypatch):
    chart_tables, _paragraph_texts = _patch_lightweight_rendering(monkeypatch)
    monkeypatch.setattr(pdf_builder, "_render_rolling_trend", lambda *_args, **_kwargs: io.BytesIO(b"ok"))

    report = _base_report(
        {
            "incidents": [{"period": "2025-01", "value": 1}],
            "ltifr": [{"period": "2025-01", "value": None}],
            "account_payable_days": [{"period": "2025-01", "value": None}],
        }
    )

    story, styles = [], getSampleStyleSheet()
    pdf_builder._sec_incidents_compliance(story, styles, report)

    chart_table = next(table for table in chart_tables if table.colWidths == [3.2 * pdf_builder.inch, 3.2 * pdf_builder.inch])
    assert len(chart_table.data[-1]) == 2
    assert isinstance(chart_table.data[-1][1], Spacer)


def test_incidents_section_shows_unavailable_note_when_operational_trends_dict_missing(monkeypatch):
    """Expected behavior per requirement: no monthly series => explicit unavailable note."""
    _chart_tables, paragraph_texts = _patch_lightweight_rendering(monkeypatch)
    monkeypatch.setattr(pdf_builder, "_render_rolling_trend", lambda *_args, **_kwargs: io.BytesIO(b"ok"))

    report = _base_report({})
    story, styles = [], getSampleStyleSheet()
    pdf_builder._sec_incidents_compliance(story, styles, report)

    assert "12-month operational trends unavailable — insufficient approved historical data." in paragraph_texts
