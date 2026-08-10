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

        # ── Biogenic: group into Direct (Scope 1) vs Indirect (Scope 3) ──
        if scope_key == "biogenic" and comp:
            SCOPE1_CATS = {"Stationary Combustion", "Mobile Combustion", "Process Emissions", "Fugitive Emissions", "Flaring"}
            direct_val = sum(c["value"] for c in comp if c["category"] in SCOPE1_CATS)
            indirect_val = sum(c["value"] for c in comp if c["category"] not in SCOPE1_CATS)
            total_bio = direct_val + indirect_val
            grouped_comp = []
            if direct_val > 0 or any(c["category"] in SCOPE1_CATS for c in comp):
                grouped_comp.append({"category": "Direct (Scope 1)", "value": round(direct_val, 2), "pct": round(direct_val / total_bio * 100, 1) if total_bio else 0})
            if indirect_val > 0 or any(c["category"] not in SCOPE1_CATS for c in comp):
                grouped_comp.append({"category": "Indirect (Scope 3)", "value": round(indirect_val, 2), "pct": round(indirect_val / total_bio * 100, 1) if total_bio else 0})
            bio_colors = {"Direct (Scope 1)": "#16a34a", "Indirect (Scope 3)": "#7c3aed"}
            d_buf = _render_deep_donut(f"{title} Composition", grouped_comp, bio_colors, cv or 0, "tCO2e")
            d_img = Image(d_buf, width=3.6 * inch, height=3.6 * inch)
            # Detailed table still shows all categories with Direct/Indirect label
            comp_rows = []
            for c in comp:
                label = c["category"]
                prefix = "Direct" if c["category"] in SCOPE1_CATS else "Indirect"
                comp_rows.append([f"{prefix}: {label[:28]}", f"{c['value']:,.2f}", f"{c['pct']:.1f}%"])
            ct = _styled_table(["Category", "tCO2e", "%"], comp_rows, col_widths=[170, 55, 40])
            pair = Table([[d_img, ct]], colWidths=[3.8 * inch, 3.2 * inch], hAlign="LEFT")
            pair.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
            story.append(pair)
        elif comp:
            threshold = 5 if scope_key == "scope3" else 0
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
    """Comprehensive facility-level emissions analysis for ALL org facilities."""
    fd = report.get("facility_deep", {})
    facilities = fd.get("facilities", [])
    if not facilities:
        story.append(SectionHeader("3", "Facility Performance"))
        story.append(Spacer(1, 10))
        story.append(Paragraph("No facility data available.", ParagraphStyle("FPFallback", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor(TEXT_MUTED))))
        story.append(PageBreak())
        return

    current_month = fd.get("current_month", "")
    cm_label = fd.get("current_month_label", "")
    pm_label = fd.get("previous_month_label", "")
    val_s = ParagraphStyle("FPVal", fontName="Helvetica-Bold", fontSize=11, textColor=colors.HexColor(DARK), spaceAfter=2)
    fac_hdr_s = ParagraphStyle("FPFacHdr", fontName="Helvetica-Bold", fontSize=12, textColor=colors.HexColor("#0f4c81"), spaceBefore=6, spaceAfter=2)
    sub_s = ParagraphStyle("FPSub", fontName="Helvetica-Bold", fontSize=9, textColor=colors.HexColor(TEXT_SECONDARY), spaceAfter=2)
    note_s = ParagraphStyle("FPNote", fontName="Helvetica", fontSize=8, textColor=colors.HexColor(TEXT_MUTED), spaceAfter=2)

    # ═══════════ SUMMARY: All-facility comparison table + bar chart ═══════════
    story.append(SectionHeader("3", "Facility Performance"))
    story.append(Spacer(1, 10))

    # Comparison table
    comp_rows = []
    for f in facilities:
        chg = f"N/A" if f["change_pct"] is None else ("No change" if f["change_pct"] == 0 and f["current_total"] == 0 and f["previous_total"] == 0 else f"{f['change_pct']:+.1f}%")
        comp_rows.append([f["name"], f"{f['current_total']:,.2f}", f"{f['previous_total']:,.2f}", chg])
    story.append(_styled_table(["Facility", cm_label or "Current", pm_label or "Previous", "Change"], comp_rows, col_widths=[160, 100, 100, 80]))
    story.append(Spacer(1, 12))

    # All-facility bar chart
    bar_data = [{"facility": f["name"], "emissions": f["current_total"]} for f in facilities]
    story.append(Image(
        _render_facility_bar_chart(bar_data),
        width=7.2 * inch, height=max(2 * inch, min(len(facilities) * 0.45 * inch, 5.5 * inch))))
    story.append(PageBreak())

    # ═══════════ PER-FACILITY DETAIL BLOCKS ═══════════
    scope_clr = {"Scope 1": "#ea580c", "Scope 2": "#2563eb", "Scope 3": "#7c3aed", "Biogenic": "#16a34a"}
    from .pdf_styles import EA_COLORS, SCOPE1_CAT_COLORS, SCOPE2_CAT_COLORS, SCOPE3_SHADES

    for f in facilities:
        # ── Facility header ──
        story.append(Paragraph(f["name"], fac_hdr_s))
        story.append(Paragraph(
            f"Current Month: {f['current_total']:,.2f} tCO2e  |  Previous Month: {f['previous_total']:,.2f} tCO2e", val_s))
        story.append(Spacer(1, 6))

        # ── 12-month trend ──
        story.append(Image(
            _render_labeled_trend(f"{f['name']} — Total Emissions Trend", f["monthly_trend"], "tCO2e", "#0f4c81", current_month, figsize=(7.2, 2.4)),
            width=7.2 * inch, height=2.4 * inch))
        story.append(Spacer(1, 8))

        # ── Scope breakdown table (full width) ──
        sb_rows = [[s["label"], f"{s['value']:,.2f} tCO2e", f"{s['pct']:.1f}%"] for s in f["scope_breakdown"]]
        sb_rows.append(["Total", f"{f['current_total']:,.2f} tCO2e", "100%"])
        story.append(_styled_table(["Scope", "Emissions", "%"], sb_rows, col_widths=[100, 110, 60]))
        story.append(Spacer(1, 8))

        # ── Scope 1: donut + source table side-by-side ──
        s1_cats = f.get("scope1_categories", [])
        s1_total = sum(c["value"] for c in s1_cats)
        s1_clr = {"Stationary Combustion": "#ea580c", "Mobile Combustion": "#f59e0b",
                   "Process Emissions": "#fbbf24", "Fugitive Emissions": "#92400e"}
        s1_donut = Image(
            _render_deep_donut("Scope 1 Sources", s1_cats, s1_clr, s1_total, "tCO2e"),
            width=2.6 * inch, height=2.6 * inch)
        s1_rows = [[c["category"][:28], f"{c['value']:,.2f}", f"{c['pct']:.1f}%"] for c in s1_cats] if s1_cats else [["No Scope 1 data", "", ""]]
        s1_table = _styled_table(["Scope 1 Source", "tCO2e", "%"], s1_rows, col_widths=[140, 65, 45])
        row1 = Table([[s1_donut, s1_table]], colWidths=[2.8 * inch, 4.2 * inch], hAlign="LEFT")
        row1.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        story.append(row1)
        story.append(Spacer(1, 8))

        # ── Scope 2: donut + source table side-by-side ──
        s2_cats = f.get("scope2_categories", [])
        s2_total = sum(c["value"] for c in s2_cats)
        s2_clr = {"Purchased Electricity": "#2563eb", "Purchased Heat/Steam": "#60a5fa",
                   "Purchased Cooling": "#93c5fd"}
        s2_donut = Image(
            _render_deep_donut("Scope 2 Sources", s2_cats, s2_clr, s2_total, "tCO2e"),
            width=2.6 * inch, height=2.6 * inch)
        s2_rows = [[c["category"][:28], f"{c['value']:,.2f}", f"{c['pct']:.1f}%"] for c in s2_cats] if s2_cats else [["No Scope 2 data", "", ""]]
        s2_table = _styled_table(["Scope 2 Source", "tCO2e", "%"], s2_rows, col_widths=[140, 65, 45])
        row2 = Table([[s2_donut, s2_table]], colWidths=[2.8 * inch, 4.2 * inch], hAlign="LEFT")
        row2.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        story.append(row2)
        story.append(Spacer(1, 8))

        # ── Scope 3: donut + category table side-by-side ──
        s3_cats = f.get("scope3_categories", [])
        s3_total = sum(c["value"] for c in s3_cats)
        s3_clr = {SCOPE3_SHADES[i % len(SCOPE3_SHADES)]: SCOPE3_SHADES[i % len(SCOPE3_SHADES)] for i in range(15)}
        # Build color map from category names
        s3_color_map = {}
        for i, c in enumerate(s3_cats):
            s3_color_map[c["category"]] = SCOPE3_SHADES[i % len(SCOPE3_SHADES)]
        s3_donut = Image(
            _render_deep_donut("Scope 3 Sources", s3_cats, s3_color_map, s3_total, "tCO2e", group_threshold_pct=5),
            width=2.6 * inch, height=2.6 * inch)
        s3_rows = [[c["category"][:28], f"{c['value']:,.2f}", f"{c['pct']:.1f}%"] for c in s3_cats] if s3_cats else [["No Scope 3 data", "", ""]]
        s3_table = _styled_table(["Scope 3 Category", "tCO2e", "%"], s3_rows, col_widths=[140, 65, 45])
        row3 = Table([[s3_donut, s3_table]], colWidths=[2.8 * inch, 4.2 * inch], hAlign="LEFT")
        row3.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        story.append(row3)

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
        _render_labeled_trend("Waste Generated — MT", ws.get("generated_trend", []), "MT", "#7e22ce", cm),
        width=7.2 * inch, height=2.6 * inch))
    story.append(Spacer(1, 8))

    story.append(Image(
        _render_labeled_trend("Waste Disposed — MT", ws.get("disposed_trend", []), "MT", "#dc2626", cm),
        width=7.2 * inch, height=2.6 * inch))
    story.append(Spacer(1, 8))

    story.append(Image(
        _render_labeled_trend("Waste Recovered — MT", ws.get("recovered_trend", []), "MT", "#16a34a", cm),
        width=7.2 * inch, height=2.6 * inch))
    story.append(Spacer(1, 14))

    # Hazardous vs Non-Hazardous comparison bar
    cur = ws.get("current", {})
    haz_gen = cur.get("haz_generated", 0)
    haz_rec = cur.get("haz_recovered", 0)
    haz_disp = cur.get("haz_disposed", 0)
    nhaz_gen = cur.get("nonhaz_generated", 0)
    nhaz_rec = cur.get("nonhaz_recovered", 0)
    nhaz_disp = cur.get("nonhaz_disposed", 0)
    bar_groups = [
        {"label": "Generated", "values": [haz_gen, nhaz_gen], "series_labels": ["Hazardous", "Non-Hazardous"]},
        {"label": "Recovered", "values": [haz_rec, nhaz_rec], "series_labels": ["Hazardous", "Non-Hazardous"]},
        {"label": "Disposed", "values": [haz_disp, nhaz_disp], "series_labels": ["Hazardous", "Non-Hazardous"]},
    ]
    story.append(Image(
        _render_grouped_bar("Hazardous vs Non-Hazardous Waste", bar_groups, ["#dc2626", "#6366f1"], "MT"),
        width=7.2 * inch, height=2.8 * inch))
    story.append(Spacer(1, 12))

    # Hazardous trends side by side
    haz_sub = ParagraphStyle("HazSub", fontName="Helvetica-Bold", fontSize=9, textColor=colors.HexColor("#dc2626"), spaceAfter=4)
    nhaz_sub = ParagraphStyle("NHazSub", fontName="Helvetica-Bold", fontSize=9, textColor=colors.HexColor("#6366f1"), spaceAfter=4)

    story.append(Paragraph("Hazardous Waste Trends", haz_sub))
    story.append(Image(_render_labeled_trend("Hazardous Generated — MT", ws.get("haz_generated_trend", []), "MT", "#dc2626", cm), width=7.2*inch, height=2.6*inch))
    story.append(Spacer(1, 8))
    story.append(Image(_render_labeled_trend("Hazardous Recovered — MT", ws.get("haz_recovered_trend", []), "MT", "#f87171", cm), width=7.2*inch, height=2.6*inch))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Non-Hazardous Waste Trends", nhaz_sub))
    story.append(Image(_render_labeled_trend("Non-Hazardous Generated — MT", ws.get("nonhaz_generated_trend", []), "MT", "#6366f1", cm), width=7.2*inch, height=2.6*inch))
    story.append(Spacer(1, 8))
    story.append(Image(_render_labeled_trend("Non-Hazardous Recovered — MT", ws.get("nonhaz_recovered_trend", []), "MT", "#a78bfa", cm), width=7.2*inch, height=2.6*inch))
    story.append(PageBreak())


def _sec_incidents_compliance(story, styles, report):
    """Incidents & Compliance — LTIFR, AP Days, Incidents with full-width trends."""
    story.append(SectionHeader("5", "Incidents & Compliance"))
    story.append(Spacer(1, 10))

    ops = report.get("operational_kpis", {})
    operational_trends = report.get("twelve_month_operational_trends", {})
    current_month = ""
    ed = report.get("emissions_deep", {})
    if ed:
        current_month = ed.get("current_month", "")

    val_s = ParagraphStyle("ICVal", fontName="Helvetica-Bold", fontSize=12, textColor=colors.HexColor(DARK), spaceAfter=2)
    note_s = ParagraphStyle("ICNote", fontName="Helvetica", fontSize=8, textColor=colors.HexColor(TEXT_MUTED), spaceAfter=4)

    # ── Key Metrics (no GHG/Energy Intensity) ──
    ltifr_val = ops.get("ltifr")
    ap_val = ops.get("account_payable_days")
    incident_count = ops.get("incident_count", 0)

    kpi_rows = [
        ["LTIFR", f"{ltifr_val:,.2f}" if ltifr_val is not None else "Not reported"],
        ["Account Payable Days", f"{ap_val:,.1f} days" if ap_val is not None else "Not reported"],
        ["Number of Incidents", str(incident_count)],
    ]
    story.append(_styled_table(["Metric", "Value"], kpi_rows, col_widths=[250, 200]))
    story.append(Spacer(1, 16))

    # ── LTIFR Trend (full-width) — only when LTIFR is actually reported ──
    ltifr_series = operational_trends.get("ltifr", [])
    ltifr_has_data = any(p.get("value") is not None for p in ltifr_series)
    if ltifr_val is not None and ltifr_has_data:
        story.append(Image(
            _render_labeled_trend("LTIFR Trend", ltifr_series, "LTIFR", "#0f4c81", current_month),
            width=7.2 * inch, height=2.8 * inch))
    else:
        story.append(Paragraph("LTIFR trend unavailable — no reported LTIFR data.", note_s))
    story.append(Spacer(1, 14))

    # ── Incident Trend (full-width, per-month actual data) ──
    incident_series = operational_trends.get("incidents", [])
    incident_has_data = any(p.get("value") is not None for p in incident_series)
    if incident_has_data:
        story.append(Image(
            _render_labeled_trend("Incident Trend", incident_series, "Count", "#4f46e5", current_month),
            width=7.2 * inch, height=2.8 * inch))
    else:
        story.append(Paragraph("Incident trend unavailable — no reported incident data.", note_s))
    story.append(Spacer(1, 12))

    # ── Current Month Incident Breakdown ──
    exec_data = report.get("executive_summary", {})
    ib = {}
    for sec in exec_data.get("sections", []):
        if sec.get("key") == "social_governance" and sec.get("incident_breakdown"):
            ib = sec["incident_breakdown"]
            break
    if ib:
        bd_rows = [
            ["Safety Incidents", str(ib.get("safety_incidents", 0))],
            ["Data Breaches", str(ib.get("data_breaches", 0))],
            ["Violations", str(ib.get("violations", 0))],
            ["Total Incidents", str(ib.get("total", incident_count))],
        ]
        story.append(_styled_table(["Incident Type", "Current Month"], bd_rows, col_widths=[200, 120]))
        story.append(Spacer(1, 12))

    # ── Account Payable Days Trend (full-width) ──
    ap_series = operational_trends.get("account_payable_days", [])
    ap_has_data = any(p.get("value") is not None for p in ap_series)
    if ap_has_data:
        story.append(Image(
            _render_labeled_trend("Account Payable Days Trend", ap_series, "Days", "#475569", current_month),
            width=7.2 * inch, height=2.8 * inch))
        story.append(Spacer(1, 12))

    # ── Compliance frameworks ──
    compliance = report.get("compliance", [])
    if compliance:
        comp_rows = [[r["framework"], f"{r['completion_pct']:.1f}%"] for r in compliance]
        story.append(_styled_table(["Framework", "Completion"], comp_rows, col_widths=[280, 120]))

    story.append(PageBreak())


def _sec_supplier_assessment(story, styles, report):
    """Supplier Assessment — Overall, Emissions, and ESG rankings."""
    scores = report.get("supplier_scores", [])
    sa = report.get("supplier_assessment", {})
    if not scores and not sa:
        return

    story.append(SectionHeader("6", "Supplier Assessment"))
    story.append(Spacer(1, 10))

    # Prepare supplier data with proper naming
    suppliers = []
    for s in scores:
        name = s.get("company_name") or s.get("supplier_name") or s.get("supplier_org_name") or f"Supplier {len(suppliers)+1}"
        suppliers.append({
            "name": name,
            "overall": s.get("overall_score"),
            "esg": s.get("esg_score"),
            "ghg": s.get("ghg_score"),
            "status": s.get("completion_status") or s.get("invitation_status", "pending"),
        })

    def _score_fmt(v):
        if v is None:
            return "Not Assessed"
        return f"{v:.1f}"

    # ── Overall Supplier Ranking ──
    overall_sorted = sorted(suppliers, key=lambda x: -(x["overall"] or -1))
    overall_rows = []
    for i, s in enumerate(overall_sorted, 1):
        overall_rows.append([str(i), s["name"], _score_fmt(s["overall"]), _score_fmt(s["esg"]), _score_fmt(s["ghg"])])
    story.append(ColoredSectionBar("Overall Supplier Ranking", "#0f4c81"))
    story.append(Spacer(1, 6))
    story.append(_styled_table(["Rank", "Supplier", "Overall Score", "ESG Score", "Emissions Score"], overall_rows, col_widths=[35, 160, 80, 80, 80]))
    story.append(Spacer(1, 10))

    # Overall ranking bar chart
    assessed = [s for s in overall_sorted if s["overall"] is not None]
    if assessed:
        bar_data = [{"facility": s["name"], "emissions": s["overall"]} for s in assessed]
        story.append(Image(
            _render_facility_bar_chart(bar_data, title="Overall Supplier Ranking", xlabel="Overall Score"),
            width=7.2 * inch, height=max(1.8 * inch, min(len(assessed) * 0.45 * inch, 4 * inch))))
    story.append(Spacer(1, 14))

    # ── Emissions + ESG Rankings side by side ──
    ghg_sorted = sorted(suppliers, key=lambda x: -(x["ghg"] or -1))
    esg_sorted = sorted(suppliers, key=lambda x: -(x["esg"] or -1))

    ghg_rows = [[str(i), s["name"][:22], _score_fmt(s["ghg"])] for i, s in enumerate(ghg_sorted, 1)]
    esg_rows = [[str(i), s["name"][:22], _score_fmt(s["esg"])] for i, s in enumerate(esg_sorted, 1)]

    ghg_table = _styled_table(["#", "Supplier", "Emissions"], ghg_rows, col_widths=[25, 115, 60])
    esg_table = _styled_table(["#", "Supplier", "ESG"], esg_rows, col_widths=[25, 115, 60])

    story.append(ColoredSectionBar("Supplier Rankings — Emissions vs ESG", "#7c3aed"))
    story.append(Spacer(1, 6))
    pair = Table([[ghg_table, esg_table]], colWidths=[3.4 * inch, 3.4 * inch], hAlign="LEFT")
    pair.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(pair)

    story.append(PageBreak())


def _render_target_bar(target_val, actual_val, unit, figsize=(5.5, 1.4)):
    """Small horizontal actual-vs-target comparison bar."""
    from .pdf_charts import _setup_mpl, _fig_to_bytes
    import matplotlib.pyplot as plt
    _setup_mpl()
    fig, ax = plt.subplots(figsize=figsize)
    labels = ["Target", "Actual"]
    vals = [target_val or 0, actual_val or 0]
    bar_colors = ["#7c3aed", "#0f4c81"]
    bars = ax.barh(labels, vals, color=bar_colors, height=0.55, edgecolor="white")
    for bar, v in zip(bars, vals):
        ax.text(bar.get_width() + max(max(vals) * 0.02, 0.1), bar.get_y() + bar.get_height() / 2,
                f"{v:,.2f}", va="center", fontsize=8, color="#0f172a")
    ax.invert_yaxis(); ax.grid(axis="x", alpha=0.15)
    ax.set_xlabel(unit, fontsize=7); ax.spines["top"].set_visible(False); ax.spines["right"].set_visible(False)
    fig.tight_layout(); return _fig_to_bytes(fig)



def _render_monthly_target_trend(title, history, unit, figsize=(7.2, 2.8)):
    """Two-line chart: Actual vs Target for monthly targets."""
    from .pdf_charts import _setup_mpl, _fig_to_bytes
    import matplotlib.pyplot as plt
    import matplotlib.ticker as mticker
    _setup_mpl()
    fig, ax = plt.subplots(figsize=figsize)
    if not history:
        ax.text(0.5, 0.5, "No monthly target data", ha="center", va="center", fontsize=12, color="#94a3b8")
        ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis("off"); return _fig_to_bytes(fig)

    from datetime import datetime as _dt
    labels = [_dt.strptime(h["period"], "%Y-%m").strftime("%b %y") for h in history]
    x = list(range(len(history)))
    targets = [h.get("target") for h in history]
    actuals = [h.get("actual") for h in history]

    # Target line (dashed)
    tx = [i for i, v in enumerate(targets) if v is not None]
    ty = [v for v in targets if v is not None]
    if ty:
        ax.plot(tx, ty, color="#7c3aed", linewidth=2, linestyle="--", marker="s", markersize=5, label="Target", zorder=3)
        for i, v in zip(tx, ty):
            ax.annotate(f"{v:,.0f}" if abs(v) >= 10 else f"{v:,.2f}", (i, v), textcoords="offset points",
                        xytext=(0, 10), ha="center", fontsize=6, fontweight="bold", color="#7c3aed")

    # Actual line (solid)
    ax_list = [i for i, v in enumerate(actuals) if v is not None]
    ay = [v for v in actuals if v is not None]
    if ay:
        # Break at None gaps
        segs, sx, sy = [], [], []
        for i, v in enumerate(actuals):
            if v is not None: sx.append(i); sy.append(v)
            else:
                if sx: segs.append((list(sx), list(sy)))
                sx, sy = [], []
        if sx: segs.append((sx, sy))
        for si, (seg_x, seg_y) in enumerate(segs):
            ax.plot(seg_x, seg_y, color="#0f4c81", linewidth=2.5, marker="o", markersize=5,
                    label="Actual" if si == 0 else None, zorder=4)
        for i, v in zip(ax_list, ay):
            ax.annotate(f"{v:,.0f}" if abs(v) >= 10 else f"{v:,.2f}", (i, v), textcoords="offset points",
                        xytext=(0, -12), ha="center", fontsize=6, fontweight="bold", color="#0f4c81")

    ax.set_xticks(x); ax.set_xticklabels(labels, fontsize=6.5, rotation=45, ha="right")
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{v:,.0f}"))
    ax.set_ylabel(unit, fontsize=7, color="#475569"); ax.grid(axis="y", alpha=0.2, linewidth=0.5)
    ax.legend(fontsize=7, frameon=False, loc="upper left")
    ax.set_title(title, fontsize=10, fontweight="bold", color="#0f172a", pad=10)
    fig.tight_layout(); return _fig_to_bytes(fig)


def _sec_targets(story, styles, report):
    """Targets section — individual visual blocks per target, grouped by section."""
    story.append(SectionHeader("7", "Targets"))
    story.append(Spacer(1, 10))

    targets = report.get("targets", [])
    target_summary = report.get("target_summary", {})

    if not targets:
        story.append(Paragraph("No ESG targets have been set for this organisation.", ParagraphStyle("ND", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor(TEXT_MUTED))))
        story.append(PageBreak())
        return

    note_s = ParagraphStyle("TgtNote", fontName="Helvetica", fontSize=8, textColor=colors.HexColor(TEXT_MUTED), spaceAfter=2)

    # ── Summary ──
    summary_rows = [
        ["Active Targets", str(target_summary.get("active", len(targets)))],
        ["On Track", str(target_summary.get("On Track", 0))],
        ["Achieved", str(target_summary.get("Achieved", 0))],
        ["At Risk", str(target_summary.get("At Risk", 0))],
        ["Behind", str(target_summary.get("Behind", 0))],
    ]
    story.append(_styled_table(["Status", "Count"], summary_rows, col_widths=[200, 100]))
    story.append(Spacer(1, 14))

    # ── Group targets by section ──
    sections_order = ["environment", "social", "governance", "sbti"]
    section_labels = {"environment": "Environment", "social": "Social", "governance": "Governance", "sbti": "SBTi"}
    grouped = {}
    for t in targets:
        sec = t.get("section", "environment")
        grouped.setdefault(sec, []).append(t)

    for sec_key in sections_order:
        sec_targets = grouped.get(sec_key)
        if not sec_targets:
            continue

        story.append(ColoredSectionBar(f"{section_labels.get(sec_key, sec_key)} Targets", "#4f46e5"))
        story.append(Spacer(1, 8))

        for t in sec_targets:
            name = t.get("name", "Unnamed Target")
            tracking_mode = t.get("tracking_mode", "static")
            tv = t.get("target_value")
            av = t.get("actual_value")
            pct = t.get("progress_pct")
            gap = t.get("gap")
            status = t.get("status", "No Data")
            direction = t.get("target_direction", "maintain")
            unit = t.get("unit", "")
            period = t.get("reporting_period", "")

            tgt_hdr = ParagraphStyle("TgtHdr", fontName="Helvetica-Bold", fontSize=10, textColor=colors.HexColor("#0f4c81"), spaceAfter=2)
            story.append(Paragraph(name, tgt_hdr))

            mode_label = {"yearly": "Yearly", "static": "Static", "monthly": "Monthly"}.get(tracking_mode, tracking_mode.title())
            if t.get("target_source") == "sbti":
                term_label = (t.get("term_type") or "").replace("_", " ").title()
                story.append(Paragraph(f"SBTi {term_label} Target  |  Target Year: {period}  |  Direction: {direction.title()}", note_s))
            else:
                story.append(Paragraph(f"{mode_label} Target  |  {period}  |  Direction: {direction.title()}", note_s))

            info_rows = [
                ["Target Value", f"{tv:,.2f} {unit}" if tv is not None else "Not set"],
                ["Actual Value", f"{av:,.2f} {unit}" if av is not None else "No data"],
                ["Achievement", f"{pct:.1f}%" if pct is not None else "N/A"],
                ["Gap", f"{gap:+,.2f} {unit}" if gap is not None else "N/A"],
                ["Status", status],
            ]
            story.append(_styled_table(["", ""], info_rows, col_widths=[120, 200]))
            story.append(Spacer(1, 6))

            if tv is not None and av is not None:
                story.append(Image(_render_target_bar(tv, av, unit), width=5.5 * inch, height=1.4 * inch))

            # Monthly target: actual vs target trend chart
            mh = t.get("monthly_history", [])
            if mh:
                story.append(Spacer(1, 6))
                story.append(Image(
                    _render_monthly_target_trend(f"{name} — Actual vs Target", mh, unit),
                    width=7.2 * inch, height=2.8 * inch))
                # Compact history table
                mh_rows = []
                for h in mh:
                    tv_str = f"{h['target']:,.2f}" if h.get("target") is not None else "—"
                    av_str = f"{h['actual']:,.2f}" if h.get("actual") is not None else "No data"
                    if h.get("target") and h.get("actual"):
                        perf = round(h["actual"] / h["target"] * 100, 1)
                        perf_str = f"{perf:.1f}%"
                    else:
                        perf_str = "—"
                    mh_rows.append([h["period"], tv_str, av_str, perf_str])
                if mh_rows:
                    story.append(Spacer(1, 4))
                    story.append(_styled_table(["Month", "Target", "Actual", "Achievement"], mh_rows, col_widths=[80, 90, 90, 80]))

            story.append(Spacer(1, 14))

    story.append(PageBreak())

    # ── Insights & Actions ──
    insights = report.get("insights", [])
    if insights:
        story.append(SectionHeader("8", "Key Insights"))
        story.append(Spacer(1, 12))
        ins_s = ParagraphStyle("Ins", parent=styles["Normal"], fontSize=9,
                               textColor=colors.HexColor(TEXT_PRIMARY), spaceAfter=4, leftIndent=20)
        for insight in insights:
            story.append(Paragraph(f"&bull; {insight}", ins_s))
    actions = report.get("actions", [])
    if actions:
        story.append(Spacer(1, 14))
        story.append(SectionHeader("9", "Management Actions"))
        story.append(Spacer(1, 8))
        action_rows = [[action.get("priority", "Medium"), action.get("area", "Management"), action.get("action", "Review")]
                       for action in actions]
        story.append(_styled_table(["Priority", "Area", "Action Required"], action_rows, col_widths=[70, 115, 285]))
