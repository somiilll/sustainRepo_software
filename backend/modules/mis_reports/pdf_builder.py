"""Beautiful Executive MIS PDF Report Builder.

Renders a multi-section PDF with embedded matplotlib charts and professional styling.
Uses reportlab for layout/tables and matplotlib for chart rendering.
"""
import io
from datetime import datetime, timezone
from typing import Any, Dict, List

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    Flowable,
)

# ─── Brand Palette ───────────────────────────────────────────────────────────
BRAND = "#166534"
BRAND_LIGHT = "#dcfce7"
BRAND_ACCENT = "#22c55e"
DARK = "#0f172a"
TEXT_PRIMARY = "#1e293b"
TEXT_SECONDARY = "#475569"
TEXT_MUTED = "#94a3b8"
TABLE_HEADER_BG = "#166534"
TABLE_ALT_ROW = "#f8fafc"
BORDER_COLOR = "#e2e8f0"
RED_TEXT = "#dc2626"
GREEN_TEXT = "#16a34a"

SCOPE_COLORS = {"scope1": "#166534", "scope2": "#2563eb", "scope3": "#f59e0b", "biogenic": "#8b5cf6"}
SCOPE_LABELS = {"scope1": "Scope 1", "scope2": "Scope 2", "scope3": "Scope 3", "biogenic": "Biogenic"}


# ─── Matplotlib Helpers ──────────────────────────────────────────────────────

def _fig_to_bytes(fig, dpi=150):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight", facecolor="white", edgecolor="none")
    buf.seek(0)
    plt.close(fig)
    return buf


def _setup_mpl():
    plt.rcParams.update({
        "font.family": "sans-serif",
        "font.sans-serif": ["DejaVu Sans"],
        "font.size": 9,
        "axes.spines.top": False,
        "axes.spines.right": False,
    })


def _render_donut_chart(scope_breakdown: List[Dict]) -> io.BytesIO:
    _setup_mpl()
    data = [(r["scope"], r["emissions"]) for r in scope_breakdown if r["emissions"] > 0]
    if not data:
        fig, ax = plt.subplots(figsize=(4, 4))
        ax.text(0.5, 0.5, "No emission data", ha="center", va="center", fontsize=12, color=TEXT_MUTED)
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.axis("off")
        return _fig_to_bytes(fig)

    labels = [SCOPE_LABELS.get(d[0], d[0]) for d in data]
    values = [d[1] for d in data]
    clrs = [SCOPE_COLORS.get(d[0], "#6b7280") for d in data]

    fig, ax = plt.subplots(figsize=(4, 4))
    wedges, texts, autotexts = ax.pie(
        values, labels=None, colors=clrs, autopct="%1.1f%%",
        startangle=90, pctdistance=0.78,
        wedgeprops=dict(width=0.4, edgecolor="white", linewidth=2),
    )
    for t in autotexts:
        t.set_fontsize(8)
        t.set_color("white")
        t.set_fontweight("bold")

    total = sum(values)
    ax.text(0, 0.04, f"{total:,.1f}", ha="center", va="center", fontsize=14, fontweight="bold", color=DARK)
    ax.text(0, -0.08, "tCO2e", ha="center", va="center", fontsize=8, color=TEXT_SECONDARY)

    ax.legend(labels, loc="lower center", bbox_to_anchor=(0.5, -0.12),
              ncol=min(len(labels), 4), fontsize=8, frameon=False)
    ax.set_title("Emissions by Scope", fontsize=11, fontweight="bold", color=DARK, pad=12)
    fig.tight_layout()
    return _fig_to_bytes(fig)


def _render_trend_chart(period_breakdown: List[Dict]) -> io.BytesIO:
    _setup_mpl()
    data = sorted(period_breakdown, key=lambda r: r.get("period", ""))
    if not data:
        fig, ax = plt.subplots(figsize=(5.5, 3))
        ax.text(0.5, 0.5, "No trend data", ha="center", va="center", fontsize=12, color=TEXT_MUTED)
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.axis("off")
        return _fig_to_bytes(fig)

    periods = [r.get("period", "?") for r in data]
    values = [r.get("emissions", 0) for r in data]
    short_labels = []
    for p in periods:
        try:
            dt = datetime.strptime(p[:7], "%Y-%m")
            short_labels.append(dt.strftime("%b %y"))
        except ValueError:
            short_labels.append(p[:7])

    fig, ax = plt.subplots(figsize=(5.5, 3))
    x = range(len(values))
    ax.plot(x, values, color=BRAND, linewidth=2.5, marker="o", markersize=5, zorder=3)
    ax.fill_between(x, values, alpha=0.1, color=BRAND_ACCENT)
    ax.set_xticks(list(x))
    ax.set_xticklabels(short_labels, fontsize=7, rotation=45, ha="right")
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{v:,.0f}"))
    ax.set_ylabel("tCO2e", fontsize=8, color=TEXT_SECONDARY)
    ax.set_title("Emissions Trend", fontsize=11, fontweight="bold", color=DARK, pad=10)
    ax.grid(axis="y", alpha=0.3, linewidth=0.5)
    ax.spines["bottom"].set_color(BORDER_COLOR)
    ax.spines["left"].set_color(BORDER_COLOR)
    fig.tight_layout()
    return _fig_to_bytes(fig)


def _render_facility_bar_chart(facility_breakdown: List[Dict]) -> io.BytesIO:
    _setup_mpl()
    data = facility_breakdown[:10]
    if not data:
        fig, ax = plt.subplots(figsize=(6, 2.5))
        ax.text(0.5, 0.5, "No facility data", ha="center", va="center", fontsize=12, color=TEXT_MUTED)
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.axis("off")
        return _fig_to_bytes(fig)

    names = [r["facility"][:30] for r in reversed(data)]
    values = [r["emissions"] for r in reversed(data)]

    fig, ax = plt.subplots(figsize=(6, max(2.5, len(data) * 0.45)))
    bars = ax.barh(names, values, color=BRAND, height=0.6, edgecolor="white", linewidth=0.5)
    max_val = max(values) if values else 1
    for bar, val in zip(bars, values):
        ax.text(bar.get_width() + max_val * 0.02, bar.get_y() + bar.get_height() / 2,
                f"{val:,.1f}", va="center", fontsize=7, color=TEXT_SECONDARY)

    ax.set_xlabel("tCO2e", fontsize=8, color=TEXT_SECONDARY)
    ax.set_title("Top Facilities by Emissions", fontsize=11, fontweight="bold", color=DARK, pad=10)
    ax.xaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{v:,.0f}"))
    ax.grid(axis="x", alpha=0.3, linewidth=0.5)
    ax.spines["bottom"].set_color(BORDER_COLOR)
    ax.spines["left"].set_color(BORDER_COLOR)
    fig.tight_layout()
    return _fig_to_bytes(fig)


def _render_eww_chart(energy: Dict, water: Dict, waste: Dict) -> io.BytesIO:
    _setup_mpl()
    categories = ["Energy\n(MWh)", "Water\nWithdrawal (KL)", "Water\nRecycled (KL)", "Waste\nGenerated", "Waste\nRecovered"]
    values = [
        energy.get("total", 0) or 0,
        water.get("withdrawal", 0) or 0,
        water.get("recycled", 0) or 0,
        waste.get("generated", 0) or 0,
        waste.get("recovered", 0) or 0,
    ]
    clrs = [BRAND, "#2563eb", "#06b6d4", "#f59e0b", "#22c55e"]

    fig, ax = plt.subplots(figsize=(6, 3))
    bars = ax.bar(range(len(categories)), values, color=clrs, width=0.6, edgecolor="white", linewidth=0.5)
    max_val = max(values) if values else 1
    for bar, val in zip(bars, values):
        if val > 0:
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + max_val * 0.02,
                    f"{val:,.1f}", ha="center", va="bottom", fontsize=7, color=TEXT_SECONDARY)

    ax.set_xticks(range(len(categories)))
    ax.set_xticklabels(categories, fontsize=7)
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{v:,.0f}"))
    ax.set_title("Resource Performance", fontsize=11, fontweight="bold", color=DARK, pad=10)
    ax.grid(axis="y", alpha=0.3, linewidth=0.5)
    ax.spines["bottom"].set_color(BORDER_COLOR)
    ax.spines["left"].set_color(BORDER_COLOR)
    fig.tight_layout()
    return _fig_to_bytes(fig)


# ─── Custom Flowables ────────────────────────────────────────────────────────

class ProgressBarFlowable(Flowable):
    """Horizontal progress bar for target tracking."""

    def __init__(self, label, current, target, unit="", bar_width=480, height=36, progress_override=None):
        super().__init__()
        self.label = label
        self.current = current or 0
        self.target = target or 0
        self.unit = unit or ""
        self.bar_width = bar_width
        self.height = height
        self.progress_override = progress_override

    def wrap(self, aW, aH):
        return self.bar_width, self.height

    def draw(self):
        c = self.canv
        if self.progress_override is not None:
            pct = min(max(self.progress_override, 0), 100)
        else:
            pct = min((self.current / self.target * 100) if self.target else 0, 100)

        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(colors.HexColor(TEXT_PRIMARY))
        c.drawString(0, self.height - 10, self.label[:60])

        c.setFont("Helvetica", 7)
        c.setFillColor(colors.HexColor(TEXT_SECONDARY))
        c.drawRightString(self.bar_width, self.height - 10,
                          f"{self.current:,.1f} / {self.target:,.1f} {self.unit}  ({pct:.0f}%)")

        bar_y, bar_h = 2, 12
        c.setFillColor(colors.HexColor("#e2e8f0"))
        c.roundRect(0, bar_y, self.bar_width, bar_h, 4, fill=1, stroke=0)

        if pct > 0:
            c.setFillColor(colors.HexColor(GREEN_TEXT if pct >= 100 else BRAND))
            c.roundRect(0, bar_y, self.bar_width * (pct / 100), bar_h, 4, fill=1, stroke=0)


class SectionHeader(Flowable):
    """Section header with green accent bar."""

    def __init__(self, number, title):
        super().__init__()
        self.number = number
        self.title = title
        self.height = 28

    def wrap(self, aW, aH):
        return aW, self.height

    def draw(self):
        c = self.canv
        c.setFillColor(colors.HexColor(BRAND))
        c.rect(0, 0, 4, self.height, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 14)
        c.setFillColor(colors.HexColor(DARK))
        c.drawString(14, 8, f"{self.number}. {self.title}")


class KPICard(Flowable):
    """Single KPI metric card."""

    def __init__(self, label, value, previous, unit, change_pct, card_width=120, card_height=68):
        super().__init__()
        self.label = label
        self.value = value or 0
        self.previous = previous or 0
        self.unit = unit or ""
        self.change_pct = change_pct
        self.card_width = card_width
        self.card_height = card_height

    def wrap(self, aW, aH):
        return self.card_width, self.card_height

    def draw(self):
        c = self.canv
        c.setFillColor(colors.HexColor("#f8fafc"))
        c.setStrokeColor(colors.HexColor(BORDER_COLOR))
        c.roundRect(0, 0, self.card_width, self.card_height, 6, fill=1, stroke=1)

        c.setFont("Helvetica", 7)
        c.setFillColor(colors.HexColor(TEXT_SECONDARY))
        c.drawString(8, self.card_height - 14, self.label[:18])

        c.setFont("Helvetica-Bold", 12)
        c.setFillColor(colors.HexColor(DARK))
        val_str = f"{self.value:,.1f}" if self.value < 100000 else f"{self.value:,.0f}"
        c.drawString(8, self.card_height - 30, val_str)

        c.setFont("Helvetica", 6)
        c.setFillColor(colors.HexColor(TEXT_MUTED))
        c.drawString(8, self.card_height - 40, self.unit)

        if self.change_pct is not None:
            is_decrease = self.change_pct < 0
            arrow = "v" if is_decrease else "^"
            clr = GREEN_TEXT if is_decrease else RED_TEXT
            c.setFont("Helvetica-Bold", 8)
            c.setFillColor(colors.HexColor(clr))
            c.drawRightString(self.card_width - 6, 6, f"{arrow} {abs(self.change_pct):.1f}%")


# ─── Page Callbacks ──────────────────────────────────────────────────────────

def _draw_cover_bg(canvas_obj, doc):
    c = canvas_obj
    w, h = A4
    c.setFillColor(colors.HexColor(BRAND))
    c.rect(0, h - 8, w, 8, fill=1, stroke=0)
    c.rect(0, 0, w, 4, fill=1, stroke=0)
    c.rect(0, 0, 4, h, fill=1, stroke=0)

    c.setFillColor(colors.HexColor(BRAND_LIGHT))
    c.circle(w - 50, h - 50, 130, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#bbf7d0"))
    c.circle(w - 30, h - 80, 65, fill=1, stroke=0)


def _draw_content_page(canvas_obj, doc):
    c = canvas_obj
    w, h = A4
    c.setStrokeColor(colors.HexColor(BRAND))
    c.setLineWidth(1.5)
    c.line(36, h - 28, w - 36, h - 28)

    c.setFont("Helvetica", 7)
    c.setFillColor(colors.HexColor(TEXT_MUTED))
    c.drawString(36, h - 24, "SustainRepo ESG MIS Report")
    c.drawRightString(w - 36, h - 24, f"Page {doc.page}")

    c.setStrokeColor(colors.HexColor(BORDER_COLOR))
    c.setLineWidth(0.5)
    c.line(36, 30, w - 36, 30)
    c.setFont("Helvetica", 6)
    c.setFillColor(colors.HexColor(TEXT_MUTED))
    c.drawString(36, 20, "Confidential  |  Generated by SustainRepo")
    c.drawRightString(w - 36, 20, datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"))


# ─── Styled Table Helper ────────────────────────────────────────────────────

def _styled_table(headers, rows, col_widths=None):
    data = [headers] + rows
    t = Table(data, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(TABLE_HEADER_BG)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor(TEXT_PRIMARY)),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor(BORDER_COLOR)),
        ("PADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            cmds.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor(TABLE_ALT_ROW)))
    t.setStyle(TableStyle(cmds))
    return t


# ─── Section Builders ────────────────────────────────────────────────────────

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
        ytd = reporting_context["ytd_period"]
        previous_ytd = reporting_context.get("previous_ytd_period")
        calendar = reporting_context["reporting_calendar"]
        story.append(Paragraph(f"Reporting Period: {current['label']}", info_s))
        story.append(Paragraph(f"Comparison Period: {comparison['label']}", info_s))
        story.append(Paragraph(f"YTD: {ytd['start_date']} to {ytd['end_date']} ({calendar['label']})", info_s))
        if previous_ytd:
            story.append(Paragraph(f"Previous FY/CY YTD: {previous_ytd['start_date']} to {previous_ytd['end_date']}", info_s))
    else:
        story.append(Paragraph(f"Reporting Period: {period_start} to {period_end}", info_s))
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
        return "Anomaly — investigate"
    good = change < 0 if lower_is_better else change > 0
    return f"{'Improving' if good else 'Needs attention'} · {abs(change):.1f}% {'decrease' if change < 0 else 'increase'}"


def _pct_change(current, previous):
    return None if not previous else ((current - previous) / previous) * 100


def _sec_executive_summary(story, styles, report):
    story.append(SectionHeader("1", "Executive Summary"))
    story.append(Spacer(1, 14))
    kpis = report.get("kpis", [])
    emissions = kpis[0] if kpis else {}
    water, waste = report.get("water", {}), report.get("waste", {})
    targets = report.get("target_summary", {})
    summary_rows = [
        ["Emissions", f"{emissions.get('value', 0):,.2f} tCO2e", _status_text(emissions.get('change_pct'), True)],
        ["Water", f"{water.get('consumption', 0):,.2f} KL", _status_text(_pct_change(water.get('consumption', 0), report.get('previous_resources', {}).get('water', {}).get('consumption', 0)), True)],
        ["Waste Recovery", f"{waste.get('recovery_pct', 0):,.1f}%", "No recovery benchmark configured"],
        ["Target Progress", f"{targets.get('active', 0)} active targets", f"{targets.get('On Track', 0) + targets.get('Achieved', 0)} on track · {targets.get('At Risk', 0)} at risk · {targets.get('Behind', 0)} behind"],
    ]
    story.append(_styled_table(["Management metric", "Current period", "Management status"], summary_rows, col_widths=[145, 130, 230]))
    story.append(Spacer(1, 14))
    labels = ["What happened", "Why / Where", "What needs attention"]
    insight_rows = [[labels[min(index, 2)], insight] for index, insight in enumerate(report.get("insights", [])[:3])]
    if insight_rows:
        story.append(_styled_table(["Management view", "Finding"], insight_rows, col_widths=[110, 395]))
    story.append(Spacer(1, 14))
    scope_rows = []
    for k in kpis[1:]:
        change = "Comparison unavailable" if k["change_pct"] is None else _status_text(k["change_pct"], True)
        scope_rows.append([k["label"], f"{k['value']:,.2f}", f"{k['previous']:,.2f}", change])
    story.append(_styled_table(["Scope", "Current", "Previous", "Comparison"], scope_rows, col_widths=[115, 90, 90, 210]))
    story.append(PageBreak())


def _sec_emissions_overview(story, styles, report):
    story.append(SectionHeader("2", "Emissions Overview"))
    story.append(Spacer(1, 14))

    donut_buf = _render_donut_chart(report["current"]["scope_breakdown"])
    donut_img = Image(donut_buf, width=3 * inch, height=3 * inch)

    trend_buf = _render_trend_chart(report.get("monthly_trend", []))
    trend_img = Image(trend_buf, width=3.6 * inch, height=2.2 * inch)

    chart_row = Table([[donut_img, trend_img]], colWidths=[3.2 * inch, 3.8 * inch], hAlign="LEFT")
    chart_row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))
    story.append(chart_row)
    story.append(Spacer(1, 16))

    scope_rows = [[r["scope"].replace("scope", "Scope ").title(), f"{r['emissions']:,.2f}"]
                  for r in report["current"]["scope_breakdown"]]
    if scope_rows:
        story.append(_styled_table(["Scope", "Emissions (tCO2e)"], scope_rows, col_widths=[200, 200]))
        story.append(Spacer(1, 12))

    cat_rows = [[r["category"], f"{r['emissions']:,.2f}"]
                for r in report["current"]["category_breakdown"][:10]]
    if cat_rows:
        story.append(_styled_table(["Category", "Emissions (tCO2e)"], cat_rows, col_widths=[250, 200]))

    story.append(PageBreak())


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


def _sec_eww(story, styles, report):
    story.append(SectionHeader("4", "Energy, Water & Waste Performance"))
    story.append(Spacer(1, 14))

    energy = report.get("energy", {})
    water = report.get("water", {})
    waste = report.get("waste", {})

    previous = report.get("previous_resources", {})
    def rows_for(title, metrics):
        story.append(Paragraph(title, ParagraphStyle(f"{title}Style", parent=styles["Heading3"], textColor=colors.HexColor(DARK), spaceAfter=6)))
        rows = []
        for label, current_value, previous_value, unit, lower_is_better in metrics:
            status = "No activity in either period" if current_value == 0 and previous_value == 0 else _status_text(_pct_change(current_value, previous_value), lower_is_better)
            rows.append([label, f"{current_value:,.2f} {unit}", f"{previous_value:,.2f} {unit}", status])
        story.append(_styled_table(["Metric", "Current", "Previous", "Status"], rows, col_widths=[170, 105, 105, 125]))
        story.append(Spacer(1, 10))
    rows_for("Energy", [("Energy Consumption", energy.get("total", 0) or 0, previous.get("energy", {}).get("total", 0) or 0, "MWh", True), ("Renewable Energy", energy.get("renewable_pct", 0) or 0, previous.get("energy", {}).get("renewable_pct", 0) or 0, "%", False)])
    rows_for("Water", [("Water Consumption", water.get("consumption", 0) or 0, previous.get("water", {}).get("consumption", 0) or 0, "KL", True), ("Water Recycled", water.get("recycled", 0) or 0, previous.get("water", {}).get("recycled", 0) or 0, "KL", False)])
    rows_for("Waste", [("Waste Generated", waste.get("generated", 0) or 0, previous.get("waste", {}).get("generated", 0) or 0, "kg", True), ("Waste Recovery", waste.get("recovery_pct", 0) or 0, previous.get("waste", {}).get("recovery_pct", 0) or 0, "%", False)])
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
                t.get("unit", ""),
                t.get("target_direction", "maintain").title(),
                t.get("status", "No Data"),
                f"{pct:.1f}%" if pct is not None else "---",
            ])
        story.append(_styled_table(
            ["Target name", "Target", "Actual", "Unit", "Direction", "Status", "Progress"],
            tgt_rows, col_widths=[105, 70, 70, 45, 60, 65, 55]
        ))

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


# ─── Public Entry Point ─────────────────────────────────────────────────────

def build_beautiful_executive_pdf(report: Dict[str, Any], organization_name: str, generated_by: str) -> bytes:
    """Generate the complete multi-section executive MIS PDF report."""
    buffer = io.BytesIO()
    styles = getSampleStyleSheet()

    doc = SimpleDocTemplate(buffer, pagesize=A4,
                            rightMargin=36, leftMargin=36,
                            topMargin=42, bottomMargin=42)
    story: list = []

    filters = report.get("filters", {})
    period_start = filters.get("reporting_period_start", "---")
    period_end = filters.get("reporting_period_end", "---")

    _sec_cover(story, styles, organization_name, period_start, period_end, generated_by, report.get("reporting_context"))
    _sec_executive_summary(story, styles, report)
    _sec_emissions_overview(story, styles, report)
    _sec_facility_performance(story, styles, report)
    _sec_eww(story, styles, report)
    _sec_incidents_compliance(story, styles, report)
    _sec_targets(story, styles, report)

    doc.build(story, onFirstPage=_draw_cover_bg, onLaterPages=_draw_content_page)
    return buffer.getvalue()
