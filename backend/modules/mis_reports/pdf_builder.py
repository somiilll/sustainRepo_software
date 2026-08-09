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
BRAND = "#0f4c81"
BRAND_LIGHT = "#dcfce7"
BRAND_ACCENT = "#22c55e"
DARK = "#0f172a"
TEXT_PRIMARY = "#1e293b"
TEXT_SECONDARY = "#475569"
TEXT_MUTED = "#94a3b8"
TABLE_HEADER_BG = "#17324d"
TABLE_ALT_ROW = "#f8fafc"
BORDER_COLOR = "#e2e8f0"
RED_TEXT = "#dc2626"
GREEN_TEXT = "#16a34a"

SCOPE_COLORS = {"scope1": "#166534", "scope2": "#2563eb", "scope3": "#f59e0b", "biogenic": "#8b5cf6"}
SCOPE_LABELS = {"scope1": "Scope 1", "scope2": "Scope 2", "scope3": "Scope 3", "biogenic": "Biogenic"}

# ─── Emissions Analytics v2 palette ──────────────────────────────────────────
EA_COLORS = {
    "total": "#0f4c81", "scope1": "#ea580c", "scope2": "#2563eb",
    "scope3": "#7c3aed", "biogenic": "#16a34a",
}
SCOPE1_CAT_COLORS = {
    "Stationary Combustion": "#ea580c", "Mobile Combustion": "#f59e0b",
    "Process Emissions": "#fbbf24", "Fugitive Emissions": "#92400e",
}
SCOPE2_CAT_COLORS = {
    "Purchased Electricity": "#2563eb", "Purchased Heat/Steam": "#60a5fa",
    "Purchased Cooling": "#93c5fd",
}
BIOGENIC_CAT_COLORS = {
    "Stationary Combustion": "#16a34a", "Mobile Combustion": "#4ade80",
    "Flaring": "#86efac", "Process Emissions": "#bbf7d0",
}
SCOPE3_SHADES = ["#7c3aed", "#8b5cf6", "#a78bfa", "#c4b5fd", "#6d28d9",
                 "#4c1d95", "#5b21b6", "#ddd6fe", "#9333ea", "#a855f7",
                 "#c084fc", "#d8b4fe", "#e9d5ff", "#f3e8ff", "#581c87"]

# Executive Summary v2 — Section palette (never all-green)
SECTION_COLORS = {
    "ghg": "#0e7490",          # Teal
    "energy": "#b45309",       # Amber-dark
    "water": "#0369a1",        # Cyan-dark
    "waste": "#7e22ce",        # Purple
    "social_governance": "#312e81",  # Indigo/Navy
}
INSIGHT_COLORS = {"green": "#16a34a", "red": "#dc2626", "amber": "#d97706", "grey": "#6b7280"}


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


def _render_rolling_trend(title: str, trends: List[Dict], unit: str, color: str) -> io.BytesIO:
    _setup_mpl()
    if not trends or not any(row.get("value") is not None for row in trends):
        return _render_trend_chart([])
    labels = [datetime.strptime(row["period"], "%Y-%m").strftime("%b") for row in trends]; x = range(len(labels)); values = [row.get("value") for row in trends]
    fig, ax = plt.subplots(figsize=(5.5, 3)); ax.plot(x, values, color=color, linewidth=2.5, marker="o")
    ax.set_xticks(list(x)); ax.set_xticklabels(labels, fontsize=7); ax.set_ylabel(unit, fontsize=8); ax.grid(axis="y", alpha=.25); ax.set_title(title, fontsize=11, fontweight="bold", color=DARK, pad=10); fig.tight_layout(); return _fig_to_bytes(fig)


def _render_resource_fy_trend(title: str, trends: Dict[str, List[Dict]], unit: str) -> io.BytesIO:
    _setup_mpl(); current, previous = trends.get("current", []), trends.get("previous", [])
    if not current: return _render_trend_chart([])
    labels = [datetime.strptime(row["period"], "%Y-%m").strftime("%b") for row in current]; x = range(len(labels))
    fig, ax = plt.subplots(figsize=(3.25, 2.1)); ax.plot(x, [r["value"] for r in current], color=BRAND, marker="o", linewidth=2, label="Current")
    ax.plot(x, [r["value"] for r in previous], color="#64748b", marker="o", linewidth=1.6, linestyle="--", label="Previous")
    ax.set_xticks(list(x)); ax.set_xticklabels(labels, fontsize=6); ax.set_ylabel(unit, fontsize=7); ax.grid(axis="y", alpha=.2); ax.legend(fontsize=6, frameon=False); ax.set_title(title, fontsize=9, fontweight="bold", color=DARK); fig.tight_layout(); return _fig_to_bytes(fig)


def _render_target_comparison(targets: List[Dict]) -> io.BytesIO:
    _setup_mpl(); configured = [target for target in targets if target.get("target_direction") in {"increase", "decrease", "maintain"} and target.get("target_value") is not None and target.get("actual_value") is not None]
    if not configured: return _render_trend_chart([])
    labels = [str(target.get("name", "Target"))[:22] for target in configured]; y = list(range(len(labels))); fig, ax = plt.subplots(figsize=(5.6, max(2.2, len(labels) * .45)))
    ax.barh([value + .18 for value in y], [target["target_value"] for target in configured], height=.34, color="#7c3aed", label="Target")
    ax.barh([value - .18 for value in y], [target["actual_value"] for target in configured], height=.34, color="#0f4c81", label="Current month")
    ax.set_yticks(y); ax.set_yticklabels(labels, fontsize=7); ax.invert_yaxis(); ax.grid(axis="x", alpha=.2); ax.legend(fontsize=7, frameon=False); ax.set_title("Target Performance — Target vs Current Month", fontsize=10, fontweight="bold", color=DARK); fig.tight_layout(); return _fig_to_bytes(fig)


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



# ─── Emissions Analytics v2 — Chart Renderers ────────────────────────────────

def _render_labeled_trend(title: str, trend: list, unit: str, color: str,
                          current_month: str, figsize=(7.2, 2.8)) -> io.BytesIO:
    """Full-width trend chart with value labels on every data point."""
    _setup_mpl()
    labels = [datetime.strptime(d["period"], "%Y-%m").strftime("%b %y") for d in trend]
    values = [d.get("value") for d in trend]
    valid_x = [i for i, v in enumerate(values) if v is not None]
    valid_y = [v for v in values if v is not None]

    fig, ax = plt.subplots(figsize=figsize)
    if not valid_y:
        ax.text(0.5, 0.5, "No data available", ha="center", va="center",
                fontsize=12, color=TEXT_MUTED)
        ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis("off")
        return _fig_to_bytes(fig)

    ax.plot(valid_x, valid_y, color=color, linewidth=2.5, marker="o",
            markersize=5, zorder=3)
    ax.fill_between(valid_x, valid_y, alpha=0.08, color=color)

    # Highlight current month with a larger marker
    cur_idx = next((i for i, d in enumerate(trend) if d["period"] == current_month), None)
    if cur_idx is not None and values[cur_idx] is not None:
        ax.scatter([cur_idx], [values[cur_idx]], color=color, s=90, zorder=5,
                   edgecolors="white", linewidth=2)

    # Value labels above every point
    y_range = max(valid_y) - min(valid_y) if len(valid_y) > 1 else (max(valid_y) or 1)
    offset = max(y_range * 0.06, 0.5)
    for i, v in enumerate(values):
        if v is not None:
            txt = f"{v:,.0f}" if abs(v) >= 10 else f"{v:,.2f}"
            ax.annotate(txt, (i, v), textcoords="offset points", xytext=(0, 8),
                        ha="center", fontsize=6, fontweight="bold", color=color)

    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(labels, fontsize=6.5, rotation=45, ha="right")
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{v:,.0f}"))
    ax.set_ylabel(unit, fontsize=7, color=TEXT_SECONDARY)
    ax.set_title(title, fontsize=11, fontweight="bold", color=DARK, pad=12)
    ax.grid(axis="y", alpha=0.2, linewidth=0.5)
    ax.spines["bottom"].set_color(BORDER_COLOR)
    ax.spines["left"].set_color(BORDER_COLOR)
    fig.tight_layout()
    return _fig_to_bytes(fig)


def _render_deep_donut(title: str, items: list, color_map: dict,
                       center_value: float, center_unit: str,
                       group_threshold_pct: float = 0) -> io.BytesIO:
    """Donut chart that keeps zero-value categories in the legend."""
    _setup_mpl()
    from matplotlib.patches import Patch

    plot_items = [it for it in items if it.get("value", 0) > 0]
    fig, ax = plt.subplots(figsize=(3.8, 3.8))

    if not plot_items:
        ax.text(0.5, 0.5, "No data", ha="center", va="center",
                fontsize=12, color=TEXT_MUTED)
        ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis("off")
        return _fig_to_bytes(fig)

    # Optionally group tiny slices into "Other"
    if group_threshold_pct > 0:
        major, other_val = [], 0.0
        for it in plot_items:
            if it["pct"] >= group_threshold_pct:
                major.append(it)
            else:
                other_val += it["value"]
        if other_val > 0:
            other_pct = round(other_val / center_value * 100, 1) if center_value else 0
            major.append({"category": "Other", "value": round(other_val, 2), "pct": other_pct})
        plot_items = major

    def _clr(it):
        return color_map.get(it.get("category") or it.get("scope") or it.get("label"), "#6b7280")

    pie_vals = [it["value"] for it in plot_items]
    pie_clrs = [_clr(it) for it in plot_items]
    wedges, _, autotexts = ax.pie(
        pie_vals, labels=None, colors=pie_clrs, autopct="%1.1f%%",
        startangle=90, pctdistance=0.78,
        wedgeprops=dict(width=0.4, edgecolor="white", linewidth=2),
    )
    for t in autotexts:
        t.set_fontsize(7); t.set_color("white"); t.set_fontweight("bold")

    ax.text(0, 0.04, f"{center_value:,.1f}", ha="center", va="center",
            fontsize=13, fontweight="bold", color=DARK)
    ax.text(0, -0.08, center_unit, ha="center", va="center",
            fontsize=7, color=TEXT_SECONDARY)

    # Legend with ALL original categories including zeros
    leg_labels = []
    leg_handles = []
    for it in items:
        name = it.get("category") or it.get("label") or "?"
        v = it.get("value", 0)
        p = it.get("pct", 0)
        leg_labels.append(f"{name}: {v:,.1f} ({p:.1f}%)")
        leg_handles.append(Patch(facecolor=_clr(it)))

    ax.legend(leg_handles, leg_labels, loc="lower center",
              bbox_to_anchor=(0.5, -0.22), ncol=min(len(items), 2),
              fontsize=6, frameon=False)
    ax.set_title(title, fontsize=10, fontweight="bold", color=DARK, pad=8)
    fig.tight_layout()
    return _fig_to_bytes(fig)


def _render_multiline_trend(title: str, cat_trends: dict, unit: str,
                            color_map: dict, figsize=(7.2, 2.8)) -> io.BytesIO:
    """Multi-line trend chart for category breakdowns."""
    _setup_mpl()
    fig, ax = plt.subplots(figsize=figsize)
    if not cat_trends:
        ax.text(0.5, 0.5, "No category data", ha="center", va="center",
                fontsize=12, color=TEXT_MUTED)
        ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis("off")
        return _fig_to_bytes(fig)

    periods = None
    fallback_colors = ["#0f4c81", "#ea580c", "#2563eb", "#7c3aed", "#16a34a",
                       "#d97706", "#dc2626", "#0891b2", "#4f46e5", "#be185d"]
    for idx, (cat_name, series) in enumerate(cat_trends.items()):
        if periods is None:
            periods = [datetime.strptime(d["period"], "%Y-%m").strftime("%b") for d in series]
        vals = [d.get("value") for d in series]
        vx = [i for i, v in enumerate(vals) if v is not None]
        vy = [v for v in vals if v is not None]
        clr = color_map.get(cat_name, fallback_colors[idx % len(fallback_colors)])
        if vy:
            ax.plot(vx, vy, color=clr, linewidth=1.8, marker="o", markersize=3,
                    label=cat_name[:28])
        else:
            ax.plot([], [], color=clr, linewidth=1.8, label=f"{cat_name[:28]} (no data)")

    if periods:
        ax.set_xticks(range(len(periods)))
        ax.set_xticklabels(periods, fontsize=6.5, rotation=45, ha="right")
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{v:,.0f}"))
    ax.set_ylabel(unit, fontsize=7, color=TEXT_SECONDARY)
    ax.grid(axis="y", alpha=0.2, linewidth=0.5)
    ax.legend(fontsize=6, frameon=False, loc="upper left")
    ax.set_title(title, fontsize=10, fontweight="bold", color=DARK, pad=8)
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


class ColoredSectionBar(Flowable):
    """Compact section header with a colored accent bar for executive summary."""

    def __init__(self, title, accent_color):
        super().__init__()
        self.title = title
        self.accent_color = accent_color
        self.height = 22

    def wrap(self, aW, aH):
        return aW, self.height

    def draw(self):
        c = self.canv
        c.setFillColor(colors.HexColor(self.accent_color))
        c.rect(0, 0, 4, self.height, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(colors.HexColor(DARK))
        c.drawString(12, 5, self.title)


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
    header_style = ParagraphStyle("TableHeaderWrap", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=colors.white)
    cell_style = ParagraphStyle("TableCellWrap", fontName="Helvetica", fontSize=7.5, leading=9, textColor=colors.HexColor(TEXT_PRIMARY))
    def wrap(value, style):
        return value if isinstance(value, Flowable) else Paragraph(str(value), style)
    data = [[wrap(value, header_style) for value in headers]] + [[wrap(value, cell_style) for value in row] for row in rows]
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


def _insight_para(text: str, color_key: str):
    """Paragraph with direction-aware colour for the Insight column."""
    hex_clr = INSIGHT_COLORS.get(color_key, "#6b7280")
    style = ParagraphStyle("InsightP", fontName="Helvetica", fontSize=7, leading=9, textColor=colors.HexColor(hex_clr))
    return Paragraph(text, style)


def _fmt_val(v, unit: str = "") -> str:
    """Human-friendly value formatting with correct unit."""
    if v is None:
        return "No data available"
    # Count-based metrics: integer, no unit suffix
    if unit == "count":
        if v == 0:
            return "0"
        return f"{int(v):,d}" if isinstance(v, (int, float)) else str(v)
    if v == 0:
        return f"0 {unit}".strip() if unit else "0"
    if abs(v) < 0.01:
        return f"{v:,.6f} {unit}".strip()
    if abs(v) < 1:
        return f"{v:,.4f} {unit}".strip()
    return f"{v:,.2f} {unit}".strip()


def _exec_summary_section_table(headers, rows, section_color):
    """Compact executive summary table with section-coloured header row."""
    hdr_style = ParagraphStyle("ExHdr", fontName="Helvetica-Bold", fontSize=7.5, leading=9, textColor=colors.white)
    cell_style = ParagraphStyle("ExCell", fontName="Helvetica", fontSize=7.5, leading=9, textColor=colors.HexColor(TEXT_PRIMARY))
    metric_style = ParagraphStyle("ExMetric", fontName="Helvetica-Bold", fontSize=7.5, leading=9, textColor=colors.HexColor(TEXT_PRIMARY))

    def _wrap(v, style):
        return v if isinstance(v, Flowable) else Paragraph(str(v), style)

    data = [[_wrap(h, hdr_style) for h in headers]]
    for row in rows:
        data.append([_wrap(row[0], metric_style)] + [_wrap(v, cell_style) for v in row[1:]])

    t = Table(data, colWidths=[100, 82, 82, 259], repeatRows=1, hAlign="LEFT")
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(section_color)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 7.5),
        ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor(TEXT_PRIMARY)),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor(BORDER_COLOR)),
        ("PADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
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
    # TOTAL EMISSIONS
    # ═══════════════════════════════════════════════════════════════════════════
    story.append(SectionHeader("2", "Total Emissions"))
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
        story.append(SectionHeader(section_num, title))
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
    story.append(SectionHeader("4", "Scope 2 Emissions"))
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
    trends = report.get("twelve_month_resource_trends", {})
    if trends:
        charts = [[Image(_render_rolling_trend("12-Month Energy Trend", trends.get("energy", []), "MWh", "#d97706"), width=3.1*inch, height=2*inch), Image(_render_rolling_trend("12-Month Water Recycle", trends.get("water_recycle", []), "KL", "#0284c7"), width=3.1*inch, height=2*inch)], [Image(_render_rolling_trend("12-Month Waste Recovery", trends.get("waste_recovery", []), "%", "#7e22ce"), width=3.1*inch, height=2*inch), Image(_render_rolling_trend("12-Month Renewable Energy", trends.get("renewable_energy", []), "%", "#d97706"), width=3.1*inch, height=2*inch)]]
        story.append(Table(charts, colWidths=[3.2*inch, 3.2*inch], hAlign="LEFT"))
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

    selected = set(report.get("selected_sections") or [])
    include_all = not selected
    include_ghg = include_all or "ghg" in selected
    include_resources = include_all or bool(selected & {"energy", "water", "waste"})
    include_targets = include_all or bool(selected & {"voluntary_environment", "voluntary_social", "voluntary_governance", "sbti"})
    _sec_cover(story, styles, organization_name, period_start, period_end, generated_by, report.get("reporting_context"))
    _sec_executive_summary(story, styles, report)
    if include_ghg:
        _sec_emissions_analytics(story, styles, report)
        _sec_facility_performance(story, styles, report)
    if include_resources:
        _sec_eww(story, styles, report)
    if include_all or "social" in selected or "governance" in selected:
        _sec_incidents_compliance(story, styles, report)
    if include_targets:
        _sec_targets(story, styles, report)

    doc.build(story, onFirstPage=_draw_cover_bg, onLaterPages=_draw_content_page)
    return buffer.getvalue()
