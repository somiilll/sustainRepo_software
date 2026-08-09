"""PDF Styles, constants, colours, and custom flowables for MIS PDF reports."""
import io
from typing import Any, Dict, List

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Flowable, Paragraph, Table, TableStyle

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

SECTION_COLORS = {
    "ghg": "#0e7490", "energy": "#b45309", "water": "#0369a1",
    "waste": "#7e22ce", "social_governance": "#312e81",
}
INSIGHT_COLORS = {"green": "#16a34a", "red": "#dc2626", "amber": "#d97706", "grey": "#6b7280"}


# ─── Custom Flowables ────────────────────────────────────────────────────────

class ProgressBarFlowable(Flowable):
    def __init__(self, label, current, target, unit="", bar_width=480, height=36, progress_override=None):
        super().__init__()
        self.label = label; self.current = current or 0; self.target = target or 0
        self.unit = unit or ""; self.bar_width = bar_width; self.height = height
        self.progress_override = progress_override

    def wrap(self, aW, aH):
        return self.bar_width, self.height

    def draw(self):
        c = self.canv
        pct = min(max(self.progress_override, 0), 100) if self.progress_override is not None else min((self.current / self.target * 100) if self.target else 0, 100)
        c.setFont("Helvetica-Bold", 8); c.setFillColor(colors.HexColor(TEXT_PRIMARY)); c.drawString(0, self.height - 10, self.label[:60])
        c.setFont("Helvetica", 7); c.setFillColor(colors.HexColor(TEXT_SECONDARY))
        c.drawRightString(self.bar_width, self.height - 10, f"{self.current:,.1f} / {self.target:,.1f} {self.unit}  ({pct:.0f}%)")
        bar_y, bar_h = 2, 12
        c.setFillColor(colors.HexColor("#e2e8f0")); c.roundRect(0, bar_y, self.bar_width, bar_h, 4, fill=1, stroke=0)
        if pct > 0:
            c.setFillColor(colors.HexColor(GREEN_TEXT if pct >= 100 else BRAND))
            c.roundRect(0, bar_y, self.bar_width * (pct / 100), bar_h, 4, fill=1, stroke=0)


class SectionHeader(Flowable):
    def __init__(self, number, title):
        super().__init__(); self.number = number; self.title = title; self.height = 28

    def wrap(self, aW, aH):
        return aW, self.height

    def draw(self):
        c = self.canv; c.setFillColor(colors.HexColor(BRAND)); c.rect(0, 0, 4, self.height, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 14); c.setFillColor(colors.HexColor(DARK)); c.drawString(14, 8, f"{self.number}. {self.title}")


class ColoredSectionBar(Flowable):
    def __init__(self, title, accent_color):
        super().__init__(); self.title = title; self.accent_color = accent_color; self.height = 22

    def wrap(self, aW, aH):
        return aW, self.height

    def draw(self):
        c = self.canv; c.setFillColor(colors.HexColor(self.accent_color)); c.rect(0, 0, 4, self.height, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 10); c.setFillColor(colors.HexColor(DARK)); c.drawString(12, 5, self.title)


class KPICard(Flowable):
    def __init__(self, label, value, previous, unit, change_pct, card_width=120, card_height=68):
        super().__init__()
        self.label = label; self.value = value or 0; self.previous = previous or 0
        self.unit = unit or ""; self.change_pct = change_pct
        self.card_width = card_width; self.card_height = card_height

    def wrap(self, aW, aH):
        return self.card_width, self.card_height

    def draw(self):
        c = self.canv
        c.setFillColor(colors.HexColor("#f8fafc")); c.setStrokeColor(colors.HexColor(BORDER_COLOR))
        c.roundRect(0, 0, self.card_width, self.card_height, 6, fill=1, stroke=1)
        c.setFont("Helvetica", 7); c.setFillColor(colors.HexColor(TEXT_SECONDARY)); c.drawString(8, self.card_height - 14, self.label[:18])
        c.setFont("Helvetica-Bold", 12); c.setFillColor(colors.HexColor(DARK))
        c.drawString(8, self.card_height - 30, f"{self.value:,.1f}" if self.value < 100000 else f"{self.value:,.0f}")
        c.setFont("Helvetica", 6); c.setFillColor(colors.HexColor(TEXT_MUTED)); c.drawString(8, self.card_height - 40, self.unit)
        if self.change_pct is not None:
            clr = GREEN_TEXT if self.change_pct < 0 else RED_TEXT
            c.setFont("Helvetica-Bold", 8); c.setFillColor(colors.HexColor(clr))
            c.drawRightString(self.card_width - 6, 6, f"{'v' if self.change_pct < 0 else '^'} {abs(self.change_pct):.1f}%")


# ─── Table Helpers ───────────────────────────────────────────────────────────

def _styled_table(headers, rows, col_widths=None):
    hs = ParagraphStyle("TH", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=colors.white)
    cs = ParagraphStyle("TC", fontName="Helvetica", fontSize=8, leading=10, textColor=colors.HexColor(TEXT_PRIMARY))
    data = [[Paragraph(str(h), hs) for h in headers]]
    for row in rows:
        data.append([v if isinstance(v, (Paragraph, Flowable)) else Paragraph(str(v), cs) for v in row])
    t = Table(data, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    cmds = [("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(TABLE_HEADER_BG)), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor(BORDER_COLOR)), ("PADDING", (0, 0), (-1, -1), 6),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, 0), 8), ("BOTTOMPADDING", (0, 0), (-1, 0), 8)]
    for i in range(1, len(data)):
        if i % 2 == 0:
            cmds.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor(TABLE_ALT_ROW)))
    t.setStyle(TableStyle(cmds))
    return t


def _insight_para(text: str, color_key: str):
    hex_clr = INSIGHT_COLORS.get(color_key, "#6b7280")
    return Paragraph(text, ParagraphStyle("InsightP", fontName="Helvetica", fontSize=7, leading=9, textColor=colors.HexColor(hex_clr)))


def _fmt_val(v, unit: str = "") -> str:
    if v is None:
        return "No data available"
    if unit == "count":
        return f"{int(v):,d}" if isinstance(v, (int, float)) else str(v) if v != 0 else "0"
    if v == 0:
        return f"0 {unit}".strip() if unit else "0"
    if abs(v) < 0.01:
        return f"{v:,.6f} {unit}".strip()
    if abs(v) < 1:
        return f"{v:,.4f} {unit}".strip()
    return f"{v:,.2f} {unit}".strip()


def _exec_summary_section_table(headers, rows, section_color):
    hdr_style = ParagraphStyle("ExHdr", fontName="Helvetica-Bold", fontSize=7.5, leading=9, textColor=colors.white)
    cell_style = ParagraphStyle("ExCell", fontName="Helvetica", fontSize=7.5, leading=9, textColor=colors.HexColor(TEXT_PRIMARY))
    metric_style = ParagraphStyle("ExMetric", fontName="Helvetica-Bold", fontSize=7.5, leading=9, textColor=colors.HexColor(TEXT_PRIMARY))

    def _wrap(v, style):
        return v if isinstance(v, Flowable) else Paragraph(str(v), style)

    data = [[_wrap(h, hdr_style) for h in headers]]
    for row in rows:
        data.append([_wrap(row[0], metric_style)] + [_wrap(v, cell_style) for v in row[1:]])
    t = Table(data, colWidths=[100, 82, 82, 259], repeatRows=1, hAlign="LEFT")
    cmds = [("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(section_color)), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor(BORDER_COLOR)), ("PADDING", (0, 0), (-1, -1), 5),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, 0), 6), ("BOTTOMPADDING", (0, 0), (-1, 0), 6)]
    for i in range(1, len(data)):
        if i % 2 == 0:
            cmds.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor(TABLE_ALT_ROW)))
    t.setStyle(TableStyle(cmds))
    return t
