"""Section builder functions for MIS PDF report pages."""
import io
from datetime import datetime, timezone
from typing import Any, Dict, List

from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import Image, PageBreak, Paragraph, Spacer, Table, TableStyle

from .pdf_styles import (
    BRAND, DARK, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, BORDER_COLOR,
    EA_COLORS, SCOPE1_CAT_COLORS, SCOPE2_CAT_COLORS, BIOGENIC_CAT_COLORS,
    SCOPE3_SHADES, INSIGHT_COLORS,
    SectionHeader, ColoredSectionBar, ProgressBarFlowable,
    _styled_table, _insight_para, _fmt_val, _exec_summary_section_table,
)
from .pdf_charts import (
    _render_donut_chart, _render_rolling_trend, _render_facility_bar_chart,
    _render_target_comparison, _render_labeled_trend, _render_deep_donut,
    _render_multiline_trend, _render_grouped_bar,
)


def _sec_cover(story, styles, org_name, period_start, period_end, generated_by, reporting_context=None):
    story.append(Spacer(1, 2.8 * inch))

    title_s = ParagraphStyle("CT", parent=styles["Title"], fontSize=28,
                             textColor=colors.HexColor(DARK), spaceAfter=6,
                             alignment=TA_LEFT, leftIndent=20)
    sub_s = ParagraphStyle("CS", parent=styles["Normal"], fontSize=14,
                           textColor=colors.HexColor(BRAND), spaceAfter=4, leftIndent=20)
    info_s = ParagraphStyle("CI", parent=styles["Normal"], fontSize=10,
                            textColor=colors.HexColor(TEXT_SECONDARY), spaceAfter=2, leftIndent=20)

    story.append(Paragraph("ESG Executive", title_s))
    story.append(Paragraph("MIS Report", title_s))
    story.append(Spacer(1, 12))
    story.append(Paragraph(org_name or "Organization", sub_s))
    story.append(Spacer(1, 20))
    if reporting_context:
        current = reporting_context["reporting_period"]
        comparison = reporting_context["comparison_period"]
        story.append(Paragraph(f"MIS MONTH: {current['label']}", info_s))
        story.append(Paragraph(f"PREVIOUS MONTH: {comparison['label']}", info_s))
    else:
        story.append(Paragraph(f"MIS MONTH: {period_start} to {period_end}", info_s))
    story.append(Paragraph(f"Generated: {datetime.now(timezone.utc).strftime('%B %d, %Y')}", info_s))
    story.append(Paragraph(f"Prepared by: {generated_by or 'SustainRepo'}", info_s))
    story.append(Spacer(1, 1.5 * inch))

    tag_s = ParagraphStyle("CTag", parent=styles["Normal"], fontSize=9,
                           textColor=colors.HexColor(TEXT_MUTED), leftIndent=20)
    story.append(Paragraph("Powered by SustainRepo  |  Comprehensive ESG Analytics", tag_s))
    story.append(PageBreak())


def _status_text(change, lower_is_better=True):
    if change is None:
        return "New activity / No comparable baseline"
    if abs(change) < 0.05:
        return "No material change"
    if lower_is_better and change > 100:
        return "Large period-over-period change — review recommended"
    good = change < 0 if lower_is_better else change > 0
    return f"{'Improving' if good else 'Needs attention'} · {abs(change):.1f}% {'decrease' if change < 0 else 'increase'}"


def _pct_change(current, previous):
    return None if not previous else ((current - previous) / previous) * 100


def _sec_executive_summary(story, styles, report):
    """Page 2 — Premium executive summary with section-coloured tables and 13-month insights."""
    exec_data = report.get("executive_summary", {})
    if not exec_data or not exec_data.get("sections"):
        # Graceful fallback: empty summary note
        nd = ParagraphStyle("ESFallback", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor(TEXT_MUTED))
        story.append(Paragraph("Executive Summary data is unavailable for this report configuration.", nd))
        story.append(PageBreak())
        return

    # ── Title ──
    title_s = ParagraphStyle("ExecTitle", parent=styles["Title"], fontSize=18,
                             textColor=colors.HexColor(DARK), spaceAfter=2, alignment=TA_LEFT)

    story.append(Paragraph("Executive Summary", title_s))
    story.append(Spacer(1, 14))

    # ── Derive short column headers from labels ──
    def _short_label(label):
        """'August 2026' → 'Aug 2026'"""
        parts = (label or "").split()
        if len(parts) >= 2:
            return parts[0][:3] + " " + parts[-1]
        return label or ""

    current_col = _short_label(exec_data["current_month_label"])
    previous_col = _short_label(exec_data["previous_month_label"])

    for section in exec_data.get("sections", []):
        sec_color = section.get("color", BRAND)
        story.append(ColoredSectionBar(section["title"], sec_color))
        story.append(Spacer(1, 3))

        headers = ["Metric", current_col, previous_col, "Insight"]
        rows = []
        for m in section.get("metrics", []):
            # Only surface the insight when the current-vs-previous swing is large
            insight_cell = _insight_para(m.get("text", ""), m.get("color", "grey"))
            cur = m.get("current")
            prev = m.get("previous")
            if cur is not None and prev is not None and prev != 0:
                mom_change = abs((cur - prev) / prev) * 100
                if mom_change < 30:
                    insight_cell = Paragraph("", ParagraphStyle("Blank", fontSize=1))
            elif cur is not None and prev is not None and cur == prev:
                insight_cell = Paragraph("", ParagraphStyle("Blank", fontSize=1))
            rows.append([
                m["name"],
                _fmt_val(m.get("current"), m.get("unit", "")),
                _fmt_val(m.get("previous"), m.get("unit", "")),
                insight_cell,
            ])
        story.append(_exec_summary_section_table(headers, rows, sec_color))

        # Optional incident breakdown (compact note below the Social table)
        if section.get("incident_breakdown"):
            ib = section["incident_breakdown"]
            bd_s = ParagraphStyle("IncBD", fontName="Helvetica", fontSize=6.5, leading=8,
                                  textColor=colors.HexColor(TEXT_MUTED), leftIndent=4)
            parts = []
            if ib.get("safety_incidents"):
                parts.append(f"Safety Incidents: {ib['safety_incidents']}")
            if ib.get("data_breaches"):
                parts.append(f"Data Breaches: {ib['data_breaches']}")
            if ib.get("violations"):
                parts.append(f"Violations: {ib['violations']}")
            if parts:
                story.append(Paragraph("  \u00b7  ".join(parts), bd_s))

        story.append(Spacer(1, 16))

    story.append(PageBreak())


def _sec_emissions_analytics(story, styles, report):
    """Premium visual emissions analytics — Total, Scope 1-3, Biogenic."""
    deep = report.get("emissions_deep", {})
    if not deep:
        story.append(SectionHeader("2", "Emissions Overview"))
        story.append(Spacer(1, 10))
        story.append(Paragraph("Emissions analytics data is unavailable.", ParagraphStyle("EAFall", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor(TEXT_MUTED))))
        story.append(PageBreak())
        return

    current_month = deep.get("current_month", "")
    cm_label = deep.get("current_month_label", "")
    sub_title = ParagraphStyle("EASub", fontName="Helvetica-Bold", fontSize=10, textColor=colors.HexColor(TEXT_SECONDARY), spaceAfter=4)
    val_style = ParagraphStyle("EAVal", fontName="Helvetica-Bold", fontSize=12, textColor=colors.HexColor(DARK), spaceAfter=2)
    note_style = ParagraphStyle("EANote", fontName="Helvetica", fontSize=7, textColor=colors.HexColor(TEXT_MUTED), spaceAfter=4)

    def _scope_color_map(scope_key):
        if scope_key == "scope1":
            return SCOPE1_CAT_COLORS
        if scope_key == "scope2":
            return SCOPE2_CAT_COLORS
        if scope_key == "biogenic":
            return BIOGENIC_CAT_COLORS
        if scope_key == "scope3":
            items = deep.get("scope3", {}).get("composition", [])
            return {it["category"]: SCOPE3_SHADES[i % len(SCOPE3_SHADES)] for i, it in enumerate(items)}
        return {}

    # ═══════════════════════════════════════════════════════════════════════════
    # GHG EMISSIONS — master heading
    # ═══════════════════════════════════════════════════════════════════════════
    chapter_s = ParagraphStyle("EAChapter", parent=styles["Title"], fontSize=20,
                               textColor=colors.HexColor(DARK), spaceAfter=4, alignment=TA_LEFT)
    story.append(Paragraph("GHG Emissions", chapter_s))
    story.append(Spacer(1, 10))

    # ═══════════════════════════════════════════════════════════════════════════
    # TOTAL EMISSIONS
    # ═══════════════════════════════════════════════════════════════════════════
    story.append(ColoredSectionBar("Total Emissions", EA_COLORS["total"]))
    story.append(Spacer(1, 6))
    total = deep.get("total", {})
    story.append(Paragraph(f"{cm_label}: {total.get('current_value', 0):,.2f} tCO2e", val_style))
    story.append(Spacer(1, 6))

    trend_buf = _render_labeled_trend("Total Emissions — tCO2e", total.get("trend", []), "tCO2e", EA_COLORS["total"], current_month)
    story.append(Image(trend_buf, width=7.2 * inch, height=2.8 * inch))
    story.append(Spacer(1, 12))

    # Composition donut + scope breakdown side-by-side
    scope_comp = total.get("composition", [])
    scope_clr_map = {s["scope"]: EA_COLORS.get(s["scope"], "#6b7280") for s in scope_comp}
    # Also map by label for the donut renderer
    for s in scope_comp:
        scope_clr_map[s["label"]] = EA_COLORS.get(s["scope"], "#6b7280")
    donut_buf = _render_deep_donut("Emissions by Scope", scope_comp, scope_clr_map, total.get("current_value", 0), "tCO2e")
    donut_img = Image(donut_buf, width=3.6 * inch, height=3.6 * inch)

    comp_rows = [[s.get("label", ""), f"{s['value']:,.2f} tCO2e", f"{s['pct']:.1f}%"] for s in scope_comp]
    comp_table = _styled_table(["Scope", "Value", "%"], comp_rows, col_widths=[100, 100, 55])

    row = Table([[donut_img, comp_table]], colWidths=[3.8 * inch, 3.2 * inch], hAlign="LEFT")
    row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    story.append(row)
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════════
    # HELPER: render a scope page (trend + donut + category trends)
    # ═══════════════════════════════════════════════════════════════════════════
    def _add_scope_page(scope_key, section_num, title, color):
        block = deep.get(scope_key, {})
        story.append(ColoredSectionBar(title, color))
        story.append(Spacer(1, 6))
        cv = block.get("current_value")
        story.append(Paragraph(f"{cm_label}: {cv:,.2f} tCO2e" if cv is not None else f"{cm_label}: No data", val_style))
        story.append(Spacer(1, 6))

        # Trend
        trend_img = Image(
            _render_labeled_trend(f"{title} — tCO2e", block.get("trend", []), "tCO2e", color, current_month),
            width=7.2 * inch, height=2.8 * inch,
        )
        story.append(trend_img)
        story.append(Spacer(1, 10))

        # Composition donut + breakdown
        comp = block.get("composition", [])
        cat_cm = _scope_color_map(scope_key)
        if comp:
            threshold = 2 if scope_key == "scope3" else 0
            d_buf = _render_deep_donut(f"{title} Composition", comp, cat_cm, cv or 0, "tCO2e", group_threshold_pct=threshold)
            d_img = Image(d_buf, width=3.6 * inch, height=3.6 * inch)
            comp_rows = [[c["category"][:35], f"{c['value']:,.2f}", f"{c['pct']:.1f}%"] for c in comp]
            ct = _styled_table(["Category", "tCO2e", "%"], comp_rows, col_widths=[140, 65, 45])
            pair = Table([[d_img, ct]], colWidths=[3.8 * inch, 3.2 * inch], hAlign="LEFT")
            pair.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
            story.append(pair)
        story.append(Spacer(1, 10))

        # Category trends
        cat_trends = block.get("category_trends", {})
        if cat_trends:
            if scope_key == "scope3" and len(cat_trends) > 5:
                # Top 5 categories + Other
                sorted_cats = sorted(cat_trends.keys(), key=lambda c: sum(d.get("value") or 0 for d in cat_trends[c]), reverse=True)
                top5 = {c: cat_trends[c] for c in sorted_cats[:5]}
                # Aggregate remaining into "Other"
                other_series = [{"period": m, "value": None} for m in deep["months"]]
                for c in sorted_cats[5:]:
                    for i, d in enumerate(cat_trends[c]):
                        v = d.get("value")
                        if v is not None:
                            other_series[i]["value"] = (other_series[i]["value"] or 0) + v
                if any(d["value"] is not None for d in other_series):
                    top5["Other Categories"] = other_series
                    cat_cm["Other Categories"] = "#94a3b8"
                display_trends = top5
            else:
                display_trends = cat_trends
            ml_buf = _render_multiline_trend(f"{title} — Category Trend", display_trends, "tCO2e", cat_cm)
            story.append(Image(ml_buf, width=7.2 * inch, height=2.8 * inch))

        story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════════
    # SCOPE 1
    # ═══════════════════════════════════════════════════════════════════════════
    _add_scope_page("scope1", "3", "Scope 1 Emissions", EA_COLORS["scope1"])

    # ═══════════════════════════════════════════════════════════════════════════
    # SCOPE 2
    # ═══════════════════════════════════════════════════════════════════════════
    block2 = deep.get("scope2", {})
    story.append(ColoredSectionBar("Scope 2 Emissions", EA_COLORS["scope2"]))
    story.append(Spacer(1, 6))
    cv2 = block2.get("current_value")
    story.append(Paragraph(f"{cm_label}: {cv2:,.2f} tCO2e" if cv2 is not None else f"{cm_label}: No data", val_style))
    story.append(Spacer(1, 6))

    s2_trend = Image(
        _render_labeled_trend("Scope 2 Emissions — tCO2e", block2.get("trend", []), "tCO2e", EA_COLORS["scope2"], current_month),
        width=7.2 * inch, height=2.8 * inch,
    )
    story.append(s2_trend)
    story.append(Spacer(1, 10))

    s2_comp = block2.get("composition", [])
    s2_cm = _scope_color_map("scope2")
    if s2_comp:
        d_buf = _render_deep_donut("Scope 2 Composition", s2_comp, s2_cm, cv2 or 0, "tCO2e")
        d_img = Image(d_buf, width=3.6 * inch, height=3.6 * inch)
        comp_rows = [[c["category"][:35], f"{c['value']:,.2f}", f"{c['pct']:.1f}%"] for c in s2_comp]
        ct = _styled_table(["Category", "tCO2e", "%"], comp_rows, col_widths=[140, 65, 45])
        pair = Table([[d_img, ct]], colWidths=[3.8 * inch, 3.2 * inch], hAlign="LEFT")
        pair.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        story.append(pair)
        story.append(Spacer(1, 10))

    # Purchased Electricity dedicated trend (if it exists)
    s2_cat_trends = block2.get("category_trends", {})
    elec_key = next((k for k in s2_cat_trends if "electr" in k.lower()), None)
    if elec_key:
        e_buf = _render_labeled_trend(f"{elec_key} — tCO2e", s2_cat_trends[elec_key], "tCO2e", "#2563eb", current_month, figsize=(7.2, 2.4))
        story.append(Image(e_buf, width=7.2 * inch, height=2.4 * inch))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════════
    # SCOPE 3
    # ═══════════════════════════════════════════════════════════════════════════
    _add_scope_page("scope3", "5", "Scope 3 Emissions", EA_COLORS["scope3"])

    # ═══════════════════════════════════════════════════════════════════════════
    # BIOGENIC
    # ═══════════════════════════════════════════════════════════════════════════
    _add_scope_page("biogenic", "6", "Biogenic Emissions", EA_COLORS["biogenic"])


def _sec_facility_performance(story, styles, report):
    story.append(SectionHeader("3", "Facility Performance"))
    story.append(Spacer(1, 14))

    fb = report["current"]["facility_breakdown"]
    bar_buf = _render_facility_bar_chart(fb)
    img_h = max(2 * inch, min(len(fb[:10]) * 0.4 * inch, 5 * inch))
    bar_img = Image(bar_buf, width=6 * inch, height=img_h)
    story.append(bar_img)
    story.append(Spacer(1, 16))

    fac_rows = []
    for row in report.get("facility_comparisons", []):
        fac_rows.append([row["facility"], f"{row['current']:,.2f}", f"{row['previous']:,.2f}", row.get("status") or _status_text(row["change_pct"], True)])
    if fac_rows:
        story.append(_styled_table(["Facility", "Current", "Previous", "Change"], fac_rows, col_widths=[180, 100, 100, 125]))

    story.append(PageBreak())


def _sec_energy_performance(story, styles, report):
    """Energy Performance section with trends and composition."""
    rd = report.get("resources_deep", {})
    en = rd.get("energy", {})
    if not en:
        return
    cm = rd.get("current_month", "")
    cm_label = rd.get("current_month_label", "")
    months = rd.get("months", [])
    val_s = ParagraphStyle("EValS", fontName="Helvetica-Bold", fontSize=12, textColor=colors.HexColor(DARK), spaceAfter=2)

    story.append(ColoredSectionBar("Energy Performance", "#b45309"))
    story.append(Spacer(1, 6))
    total_e = en.get("current", {}).get("total", 0) or 0
    story.append(Paragraph(f"{cm_label}: {total_e:,.2f} MWh", val_s))
    story.append(Spacer(1, 6))

    # Total consumption trend
    story.append(Image(
        _render_labeled_trend("Total Energy Consumption — MWh", en.get("total_trend", []), "MWh", "#b45309", cm),
        width=7.2 * inch, height=2.8 * inch))
    story.append(Spacer(1, 12))

    # Renewable vs Non-Renewable donut
    comp = en.get("composition", [])
    e_clr = {"Renewable Energy": "#16a34a", "Non-Renewable Energy": "#dc2626"}
    d_img = Image(
        _render_deep_donut("Energy Mix", comp, e_clr, total_e, "MWh"),
        width=3.6 * inch, height=3.6 * inch)
    comp_rows = [[c["category"], f"{c['value']:,.2f} MWh", f"{c['pct']:.1f}%"] for c in comp]
    ct = _styled_table(["Type", "Value", "%"], comp_rows, col_widths=[130, 80, 50])
    pair = Table([[d_img, ct]], colWidths=[3.8 * inch, 3.2 * inch], hAlign="LEFT")
    pair.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    story.append(pair)
    story.append(Spacer(1, 10))

    # Renewable + Non-Renewable comparison trend
    combined = {}
    for d in en.get("renewable_trend", []):
        combined.setdefault("Renewable", []).append(d)
    for d in en.get("non_renewable_trend", []):
        combined.setdefault("Non-Renewable", []).append(d)
    comb_clr = {"Renewable": "#16a34a", "Non-Renewable": "#dc2626"}
    story.append(Image(
        _render_multiline_trend("Renewable vs Non-Renewable — MWh", combined, "MWh", comb_clr),
        width=7.2 * inch, height=2.8 * inch))
    story.append(PageBreak())


def _sec_water_performance(story, styles, report):
    """Water Performance section with individual metric trends."""
    rd = report.get("resources_deep", {})
    wa = rd.get("water", {})
    if not wa:
        return
    cm = rd.get("current_month", "")
    cm_label = rd.get("current_month_label", "")

    story.append(ColoredSectionBar("Water Performance", "#0369a1"))
    story.append(Spacer(1, 10))

    # Consumption trend
    story.append(Image(
        _render_labeled_trend("Water Consumption — KL", wa.get("consumption_trend", []), "KL", "#0369a1", cm),
        width=7.2 * inch, height=2.6 * inch))
    story.append(Spacer(1, 10))

    # Withdrawal + Discharge side by side
    w_img = Image(
        _render_labeled_trend("Water Withdrawal — KL", wa.get("withdrawal_trend", []), "KL", "#0284c7", cm, figsize=(3.5, 2.4)),
        width=3.5 * inch, height=2.4 * inch)
    d_img = Image(
        _render_labeled_trend("Water Discharge — KL", wa.get("discharge_trend", []), "KL", "#0891b2", cm, figsize=(3.5, 2.4)),
        width=3.5 * inch, height=2.4 * inch)
    story.append(Table([[w_img, d_img]], colWidths=[3.6 * inch, 3.6 * inch], hAlign="LEFT"))
    story.append(Spacer(1, 10))

    # Recycle trend
    story.append(Image(
        _render_labeled_trend("Water Recycle — KL", wa.get("recycle_trend", []), "KL", "#059669", cm),
        width=7.2 * inch, height=2.6 * inch))
    story.append(Spacer(1, 12))

    # Water Withdrawal by Source — donut + multi-line trend
    src_comp = wa.get("source_composition", [])
    src_trends = wa.get("source_trends", {})
    if src_comp:
        src_clr = {"Groundwater": "#0284c7", "Surface Water": "#0891b2",
                   "Third-Party Water": "#6366f1", "Seawater / Desalinated": "#06b6d4"}
        src_total = sum(s["value"] for s in src_comp)
        d_img = Image(
            _render_deep_donut("Withdrawal by Source", src_comp, src_clr, src_total, "KL"),
            width=3.6 * inch, height=3.6 * inch)
        comp_rows = [[c["category"], f"{c['value']:,.2f} KL", f"{c['pct']:.1f}%"] for c in src_comp]
        ct = _styled_table(["Source", "Volume", "%"], comp_rows, col_widths=[120, 80, 50])
        pair = Table([[d_img, ct]], colWidths=[3.8 * inch, 3.2 * inch], hAlign="LEFT")
        pair.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        story.append(pair)
        story.append(Spacer(1, 10))

    if src_trends:
        src_clr_trend = {"Groundwater": "#0284c7", "Surface Water": "#0891b2",
                         "Third-Party Water": "#6366f1", "Seawater / Desalinated": "#06b6d4"}
        story.append(Image(
            _render_multiline_trend("Water Withdrawal Source Trend — KL", src_trends, "KL", src_clr_trend),
            width=7.2 * inch, height=2.8 * inch))

    story.append(PageBreak())


def _sec_waste_performance(story, styles, report):
    """Waste Performance section with hazardous/non-hazardous breakdown."""
    rd = report.get("resources_deep", {})
    ws = rd.get("waste", {})
    if not ws:
        return
    cm = rd.get("current_month", "")
    cm_label = rd.get("current_month_label", "")

    story.append(ColoredSectionBar("Waste Performance", "#7e22ce"))
    story.append(Spacer(1, 10))

    # Main trends: Generated, Disposed, Recovered
    story.append(Image(
        _render_labeled_trend("Waste Generated — kg", ws.get("generated_trend", []), "kg", "#7e22ce", cm),
        width=7.2 * inch, height=2.6 * inch))
    story.append(Spacer(1, 8))

    disp_img = Image(
        _render_labeled_trend("Waste Disposed — kg", ws.get("disposed_trend", []), "kg", "#dc2626", cm, figsize=(3.5, 2.4)),
        width=3.5 * inch, height=2.4 * inch)
    rec_img = Image(
        _render_labeled_trend("Waste Recovered — kg", ws.get("recovered_trend", []), "kg", "#16a34a", cm, figsize=(3.5, 2.4)),
        width=3.5 * inch, height=2.4 * inch)
    story.append(Table([[disp_img, rec_img]], colWidths=[3.6 * inch, 3.6 * inch], hAlign="LEFT"))
    story.append(Spacer(1, 14))

    # Hazardous vs Non-Hazardous comparison bar
    cur = ws.get("current", {})
    haz_gen = cur.get("haz_generated", 0)
    haz_rec = cur.get("haz_recovered", 0)
    haz_disp = max(haz_gen - haz_rec, 0)
    nhaz_gen = cur.get("nonhaz_generated", 0)
    nhaz_rec = cur.get("nonhaz_recovered", 0)
    nhaz_disp = max(nhaz_gen - nhaz_rec, 0)
    bar_groups = [
        {"label": "Generated", "values": [haz_gen, nhaz_gen], "series_labels": ["Hazardous", "Non-Hazardous"]},
        {"label": "Recovered", "values": [haz_rec, nhaz_rec], "series_labels": ["Hazardous", "Non-Hazardous"]},
        {"label": "Disposed", "values": [haz_disp, nhaz_disp], "series_labels": ["Hazardous", "Non-Hazardous"]},
    ]
    story.append(Image(
        _render_grouped_bar("Hazardous vs Non-Hazardous Waste", bar_groups, ["#dc2626", "#6366f1"], "kg"),
        width=7.2 * inch, height=2.8 * inch))
    story.append(Spacer(1, 12))

    # Hazardous trends side by side
    haz_sub = ParagraphStyle("HazSub", fontName="Helvetica-Bold", fontSize=9, textColor=colors.HexColor("#dc2626"), spaceAfter=4)
    nhaz_sub = ParagraphStyle("NHazSub", fontName="Helvetica-Bold", fontSize=9, textColor=colors.HexColor("#6366f1"), spaceAfter=4)

    story.append(Paragraph("Hazardous Waste Trends", haz_sub))
    hg = Image(_render_labeled_trend("Haz. Generated", ws.get("haz_generated_trend", []), "kg", "#dc2626", cm, figsize=(3.5, 2)), width=3.5*inch, height=2*inch)
    hr = Image(_render_labeled_trend("Haz. Recovered", ws.get("haz_recovered_trend", []), "kg", "#f87171", cm, figsize=(3.5, 2)), width=3.5*inch, height=2*inch)
    story.append(Table([[hg, hr]], colWidths=[3.6*inch, 3.6*inch], hAlign="LEFT"))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Non-Hazardous Waste Trends", nhaz_sub))
    ng = Image(_render_labeled_trend("Non-Haz. Generated", ws.get("nonhaz_generated_trend", []), "kg", "#6366f1", cm, figsize=(3.5, 2)), width=3.5*inch, height=2*inch)
    nr = Image(_render_labeled_trend("Non-Haz. Recovered", ws.get("nonhaz_recovered_trend", []), "kg", "#a78bfa", cm, figsize=(3.5, 2)), width=3.5*inch, height=2*inch)
    story.append(Table([[ng, nr]], colWidths=[3.6*inch, 3.6*inch], hAlign="LEFT"))
    story.append(PageBreak())


def _sec_incidents_compliance(story, styles, report):
    story.append(SectionHeader("5", "Incidents & Compliance"))
    story.append(Spacer(1, 14))

    ops = report.get("operational_kpis", {})
    ops_rows = [
        ["Safety Incidents", str(ops.get("incident_count", 0))],
        ["LTIFR", f"{ops['ltifr']:,.2f}" if ops.get("ltifr") is not None else "Not reported"],
        ["GHG Intensity", f"{ops['ghg_intensity']:,.4f}" if ops.get("ghg_intensity") is not None else "Not reported"],
        ["Energy Intensity", f"{ops['energy_intensity']:,.4f}" if ops.get("energy_intensity") is not None else "Not reported"],
        ["Account Payable Days", f"{ops['account_payable_days']:,.1f}" if ops.get("account_payable_days") is not None else "Not reported"],
    ]
    story.append(_styled_table(["Operational KPI", "Value"], ops_rows, col_widths=[250, 200]))
    story.append(Spacer(1, 16))

    operational_trends = report.get("twelve_month_operational_trends", {})
    if operational_trends:
        available = {key: series for key, series in operational_trends.items() if any(point.get("value") is not None for point in series)}
        if available:
            story.append(Paragraph("12-Month Operational Trends", ParagraphStyle("OpsTrendTitle", parent=styles["Heading3"], textColor=colors.HexColor(DARK), spaceAfter=8)))
            charts = []
            chart_specs = [("incidents", "12-Month Incidents Trend", "Count", "#4f46e5"), ("ltifr", "12-Month LTIFR Trend", "LTIFR", "#0f4c81"), ("account_payable_days", "12-Month Account Payable Days", "Days", "#475569")]
            for key, title, unit, color in chart_specs:
                if key in available:
                    charts.append(Image(_render_rolling_trend(title, available[key], unit, color), width=3.1 * inch, height=2 * inch))
            chart_rows = [charts[index:index + 2] for index in range(0, len(charts), 2)]
            if len(chart_rows[-1]) == 1:
                chart_rows[-1].append(Spacer(3.1 * inch, 2 * inch))
            story.append(Table(chart_rows, colWidths=[3.2 * inch, 3.2 * inch], hAlign="LEFT"))
            story.append(Spacer(1, 14))
        else:
            note = ParagraphStyle("OpsTrendNote", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor(TEXT_MUTED))
            story.append(Paragraph("12-month operational trends unavailable — insufficient approved historical data.", note))
            story.append(Spacer(1, 10))
    else:
        note = ParagraphStyle("OpsTrendEmptyNote", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor(TEXT_MUTED))
        story.append(Paragraph("12-month operational trends unavailable — insufficient approved historical data.", note))
        story.append(Spacer(1, 10))

    compliance = report.get("compliance", [])
    if compliance:
        comp_rows = [[r["framework"], f"{r['completion_pct']:.1f}%"] for r in compliance]
        story.append(_styled_table(["Framework", "Completion"], comp_rows, col_widths=[280, 120]))
        story.append(Spacer(1, 12))

    sa = report.get("supplier_assessment", {})
    if sa:
        sa_rows = [
            ["Suppliers Assessed", str(sa.get("suppliers_assessed", 0))],
            ["High-Risk Suppliers", str(sa.get("high_risk_suppliers", 0))],
            ["Pending Assessments", str(sa.get("pending_assessments", 0))],
        ]
        story.append(_styled_table(["Supplier Assessment", "Count"], sa_rows, col_widths=[250, 120]))

    story.append(PageBreak())


def _sec_targets(story, styles, report):
    story.append(SectionHeader("6", "Targets & Progress"))
    story.append(Spacer(1, 14))

    targets = report.get("targets", [])
    if not targets:
        nd = ParagraphStyle("ND", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor(TEXT_MUTED))
        story.append(Paragraph("No ESG targets have been set for this organization.", nd))
    else:
        tgt_rows = []
        for t in targets:
            tv = t.get("target_value") or 0
            av = t.get("actual_value")
            pct = t.get("progress_pct")
            tgt_rows.append([
                t.get("name", "---"),
                f"{tv:,.1f}" if tv else "---",
                f"{av:,.1f}" if av is not None else "---",
                f"{t.get('previous_actual_value'):,.1f}" if t.get("previous_actual_value") is not None else "Previous month unavailable",
                t.get("unit", ""),
                t.get("target_direction", "maintain").title(),
                "Configuration Required" if t.get("target_direction") == "Not configured" else t.get("status", "No Data"),
                f"{pct:.1f}%" if pct is not None and t.get("target_direction") != "Not configured" else "Configuration Required",
            ])
        story.append(_styled_table(
            ["Target name", "Target", "Current month", "Previous month", "Unit", "Direction", "Status", "Progress"],
            tgt_rows, col_widths=[90, 55, 60, 75, 35, 55, 60, 45]
        ))
        story.append(Spacer(1, 14))
        story.append(Image(_render_target_comparison(targets), width=5.6 * inch, height=max(2.2 * inch, min(4.2 * inch, len(targets) * .45 * inch))))

    story.append(Spacer(1, 16))

    insights = report.get("insights", [])
    if insights:
        story.append(SectionHeader("7", "Key Insights"))
        story.append(Spacer(1, 12))
        ins_s = ParagraphStyle("Ins", parent=styles["Normal"], fontSize=9,
                               textColor=colors.HexColor(TEXT_PRIMARY), spaceAfter=4, leftIndent=20)
        for insight in insights:
            story.append(Paragraph(f"&bull; {insight}", ins_s))
    actions = report.get("actions", [])
    if actions:
        story.append(Spacer(1, 14))
        story.append(SectionHeader("8", "Management Actions"))
        story.append(Spacer(1, 8))
        action_rows = [[action.get("priority", "Medium"), action.get("area", "Management"), action.get("action", "Review")]
                       for action in actions]
        story.append(_styled_table(["Priority", "Area", "Action Required"], action_rows, col_widths=[70, 115, 285]))
