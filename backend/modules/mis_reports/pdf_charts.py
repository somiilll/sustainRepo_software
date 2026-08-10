"""Matplotlib chart renderers for MIS PDF reports."""
import io
from datetime import datetime
from typing import Any, Dict, List

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker

from .pdf_styles import (
    BRAND, BRAND_ACCENT, DARK, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED,
    BORDER_COLOR, SCOPE_COLORS, SCOPE_LABELS,
)


def _fig_to_bytes(fig, dpi=150, tight=True):
    buf = io.BytesIO()
    bbox = "tight" if tight else None
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches=bbox, facecolor="white", edgecolor="none")
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
        ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis("off")
        return _fig_to_bytes(fig, tight=False)
    labels = [SCOPE_LABELS.get(d[0], d[0]) for d in data]; values = [d[1] for d in data]; clrs = [SCOPE_COLORS.get(d[0], "#6b7280") for d in data]
    fig, ax = plt.subplots(figsize=(4, 4))
    ax.set_aspect("equal")
    wedges, texts, autotexts = ax.pie(values, labels=None, colors=clrs, autopct="%1.1f%%", startangle=90, pctdistance=0.78, wedgeprops=dict(width=0.4, edgecolor="white", linewidth=2))
    for t in autotexts: t.set_fontsize(8); t.set_color("white"); t.set_fontweight("bold")
    total = sum(values)
    ax.text(0, 0.04, f"{total:,.1f}", ha="center", va="center", fontsize=14, fontweight="bold", color=DARK)
    ax.text(0, -0.08, "tCO2e", ha="center", va="center", fontsize=8, color=TEXT_SECONDARY)
    ax.legend(labels, loc="lower center", bbox_to_anchor=(0.5, -0.12), ncol=min(len(labels), 4), fontsize=8, frameon=False)
    ax.set_title("Emissions by Scope", fontsize=11, fontweight="bold", color=DARK, pad=12); fig.tight_layout()
    return _fig_to_bytes(fig, tight=False)


def _render_trend_chart(period_breakdown: List[Dict]) -> io.BytesIO:
    _setup_mpl()
    data = sorted(period_breakdown, key=lambda r: r.get("period", ""))
    if not data:
        fig, ax = plt.subplots(figsize=(5.5, 3)); ax.text(0.5, 0.5, "No trend data", ha="center", va="center", fontsize=12, color=TEXT_MUTED)
        ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis("off"); return _fig_to_bytes(fig)
    periods = [r.get("period", "?") for r in data]; values = [r.get("emissions", 0) for r in data]
    short_labels = []
    for p in periods:
        try: short_labels.append(datetime.strptime(p[:7], "%Y-%m").strftime("%b %y"))
        except ValueError: short_labels.append(p[:7])
    fig, ax = plt.subplots(figsize=(5.5, 3)); x = range(len(values))
    ax.plot(x, values, color=BRAND, linewidth=2.5, marker="o", markersize=5, zorder=3); ax.fill_between(x, values, alpha=0.1, color=BRAND_ACCENT)
    ax.set_xticks(list(x)); ax.set_xticklabels(short_labels, fontsize=7, rotation=45, ha="right")
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{v:,.0f}"))
    ax.set_ylabel("tCO2e", fontsize=8, color=TEXT_SECONDARY); ax.set_title("Emissions Trend", fontsize=11, fontweight="bold", color=DARK, pad=10)
    ax.grid(axis="y", alpha=0.3, linewidth=0.5); ax.spines["bottom"].set_color(BORDER_COLOR); ax.spines["left"].set_color(BORDER_COLOR); fig.tight_layout()
    return _fig_to_bytes(fig)


def _render_rolling_trend(title: str, trends: List[Dict], unit: str, color: str) -> io.BytesIO:
    _setup_mpl()
    if not trends or not any(row.get("value") is not None for row in trends): return _render_trend_chart([])
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
    _setup_mpl(); configured = [t for t in targets if t.get("target_direction") in {"increase", "decrease", "maintain"} and t.get("target_value") is not None and t.get("actual_value") is not None]
    if not configured: return _render_trend_chart([])
    labels = [str(t.get("name", "Target"))[:22] for t in configured]; y = list(range(len(labels))); fig, ax = plt.subplots(figsize=(5.6, max(2.2, len(labels) * .45)))
    ax.barh([v + .18 for v in y], [t["target_value"] for t in configured], height=.34, color="#7c3aed", label="Target")
    ax.barh([v - .18 for v in y], [t["actual_value"] for t in configured], height=.34, color="#0f4c81", label="Current month")
    ax.set_yticks(y); ax.set_yticklabels(labels, fontsize=7); ax.invert_yaxis(); ax.grid(axis="x", alpha=.2); ax.legend(fontsize=7, frameon=False); ax.set_title("Target Performance — Target vs Current Month", fontsize=10, fontweight="bold", color=DARK); fig.tight_layout(); return _fig_to_bytes(fig)


def _render_facility_bar_chart(facility_breakdown: List[Dict],
                              title: str = "Total Emissions by Facility — Current Month",
                              xlabel: str = "tCO2e") -> io.BytesIO:
    _setup_mpl(); data = facility_breakdown[:10]
    if not data:
        fig, ax = plt.subplots(figsize=(6, 2.5)); ax.text(0.5, 0.5, "No facility data", ha="center", va="center", fontsize=12, color=TEXT_MUTED); ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis("off"); return _fig_to_bytes(fig)
    names = [r["facility"][:30] for r in reversed(data)]; values = [r["emissions"] for r in reversed(data)]
    fig, ax = plt.subplots(figsize=(6, max(2.5, len(data) * 0.45))); bars = ax.barh(names, values, color=BRAND, height=0.6, edgecolor="white", linewidth=0.5)
    max_val = max(values) if values else 1
    for bar, val in zip(bars, values): ax.text(bar.get_width() + max_val * 0.02, bar.get_y() + bar.get_height() / 2, f"{val:,.1f}", va="center", fontsize=7, color=TEXT_SECONDARY)
    ax.set_xlabel(xlabel, fontsize=8, color=TEXT_SECONDARY); ax.set_title(title, fontsize=11, fontweight="bold", color=DARK, pad=10)
    ax.xaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{v:,.0f}")); ax.grid(axis="x", alpha=0.3, linewidth=0.5); ax.spines["bottom"].set_color(BORDER_COLOR); ax.spines["left"].set_color(BORDER_COLOR); fig.tight_layout()
    return _fig_to_bytes(fig)


def _render_labeled_trend(title: str, trend: list, unit: str, color: str,
                          current_month: str, figsize=(7.2, 2.8)) -> io.BytesIO:
    _setup_mpl()
    labels = [datetime.strptime(d["period"], "%Y-%m").strftime("%b %y") for d in trend]
    values = [d.get("value") for d in trend]
    valid_y = [v for v in values if v is not None]
    fig, ax = plt.subplots(figsize=figsize)
    if not valid_y:
        ax.text(0.5, 0.5, "No data available", ha="center", va="center", fontsize=12, color=TEXT_MUTED)
        ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis("off"); return _fig_to_bytes(fig)
    segments, seg_x, seg_y = [], [], []
    for i, v in enumerate(values):
        if v is not None: seg_x.append(i); seg_y.append(v)
        else:
            if seg_x: segments.append((list(seg_x), list(seg_y)))
            seg_x, seg_y = [], []
    if seg_x: segments.append((seg_x, seg_y))
    for sx, sy in segments:
        ax.plot(sx, sy, color=color, linewidth=2.5, marker="o", markersize=5, zorder=3)
        ax.fill_between(sx, sy, alpha=0.08, color=color)
    cur_idx = next((i for i, d in enumerate(trend) if d["period"] == current_month), None)
    if cur_idx is not None and values[cur_idx] is not None:
        ax.scatter([cur_idx], [values[cur_idx]], color=color, s=90, zorder=5, edgecolors="white", linewidth=2)
    y_range = max(valid_y) - min(valid_y) if len(valid_y) > 1 else (max(valid_y) or 1)
    for i, v in enumerate(values):
        if v is not None:
            txt = f"{v:,.0f}" if abs(v) >= 10 else f"{v:,.2f}"
            ax.annotate(txt, (i, v), textcoords="offset points", xytext=(0, 8), ha="center", fontsize=6, fontweight="bold", color=color)
    ax.set_xticks(range(len(labels))); ax.set_xticklabels(labels, fontsize=6.5, rotation=45, ha="right")
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{v:,.0f}"))
    ax.set_ylabel(unit, fontsize=7, color=TEXT_SECONDARY); ax.set_title(title, fontsize=11, fontweight="bold", color=DARK, pad=12)
    ax.grid(axis="y", alpha=0.2, linewidth=0.5); ax.spines["bottom"].set_color(BORDER_COLOR); ax.spines["left"].set_color(BORDER_COLOR); fig.tight_layout()
    return _fig_to_bytes(fig)


def _render_deep_donut(title: str, items: list, color_map: dict,
                       center_value: float, center_unit: str,
                       group_threshold_pct: float = 0) -> io.BytesIO:
    _setup_mpl()
    from matplotlib.patches import Patch
    plot_items = [it for it in items if it.get("value", 0) > 0]
    # Use a taller figure to give legend its own space below the square chart
    legend_items_count = len(plot_items) if group_threshold_pct > 0 else len(items)
    legend_rows = max(1, (legend_items_count + 1) // 2)
    legend_height = legend_rows * 0.25
    fig_h = 3.8 + legend_height
    fig = plt.figure(figsize=(3.8, fig_h))
    # Create axes in the top square portion of the figure
    chart_bottom = legend_height / fig_h
    ax = fig.add_axes([0.05, chart_bottom, 0.9, 3.8 / fig_h * 0.9])
    ax.set_aspect("equal")
    if not plot_items:
        ax.text(0.5, 0.5, "No data", ha="center", va="center", fontsize=12, color=TEXT_MUTED)
        ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis("off"); return _fig_to_bytes(fig, tight=False)
    if group_threshold_pct > 0:
        major, other_val = [], 0.0
        for it in plot_items:
            if it["pct"] >= group_threshold_pct: major.append(it)
            else: other_val += it["value"]
        if other_val > 0:
            major.append({"category": "Other", "value": round(other_val, 2), "pct": round(other_val / center_value * 100, 1) if center_value else 0})
        plot_items = major
    def _clr(it): return color_map.get(it.get("category") or it.get("scope") or it.get("label"), "#6b7280")
    wedges, _, autotexts = ax.pie([it["value"] for it in plot_items], labels=None, colors=[_clr(it) for it in plot_items], autopct="%1.1f%%", startangle=90, pctdistance=0.78, wedgeprops=dict(width=0.4, edgecolor="white", linewidth=2))
    for t in autotexts: t.set_fontsize(7); t.set_color("white"); t.set_fontweight("bold")
    ax.text(0, 0.04, f"{center_value:,.1f}", ha="center", va="center", fontsize=13, fontweight="bold", color=DARK)
    ax.text(0, -0.08, center_unit, ha="center", va="center", fontsize=7, color=TEXT_SECONDARY)
    ax.set_title(title, fontsize=10, fontweight="bold", color=DARK, pad=8)
    # Build legend in a separate area at the bottom
    leg_labels, leg_handles = [], []
    legend_source = plot_items if group_threshold_pct > 0 else items
    for it in legend_source:
        name = it.get("category") or it.get("label") or "?"; v = it.get("value", 0); p = it.get("pct", 0)
        leg_labels.append(f"{name}: {v:,.1f} ({p:.1f}%)"); leg_handles.append(Patch(facecolor=_clr(it)))
    ncols = min(len(legend_source), 2)
    fig.legend(leg_handles, leg_labels, loc="lower center", ncol=ncols, fontsize=6, frameon=False,
               bbox_to_anchor=(0.5, 0.0))
    return _fig_to_bytes(fig, tight=False)


def _render_multiline_trend(title: str, cat_trends: dict, unit: str,
                            color_map: dict, figsize=(7.2, 2.8)) -> io.BytesIO:
    _setup_mpl()
    num_cats = len(cat_trends)
    # Add extra height for the legend below the chart
    legend_rows = max(1, (num_cats + 2) // 3)
    extra_h = legend_rows * 0.22
    fig_w, fig_h = figsize[0], figsize[1] + extra_h
    fig = plt.figure(figsize=(fig_w, fig_h))
    # Chart area in top portion, legend space at bottom
    ax = fig.add_axes([0.08, (extra_h + 0.1) / fig_h, 0.88, figsize[1] * 0.82 / fig_h])
    if not cat_trends:
        ax.text(0.5, 0.5, "No category data", ha="center", va="center", fontsize=12, color=TEXT_MUTED)
        ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis("off"); return _fig_to_bytes(fig, tight=False)
    periods = None
    fallback_colors = ["#0f4c81", "#ea580c", "#2563eb", "#7c3aed", "#16a34a", "#d97706", "#dc2626", "#0891b2", "#4f46e5", "#be185d"]
    for idx, (cat_name, series) in enumerate(cat_trends.items()):
        if periods is None: periods = [datetime.strptime(d["period"], "%Y-%m").strftime("%b") for d in series]
        vals = [d.get("value") for d in series]; vy = [v for v in vals if v is not None]
        clr = color_map.get(cat_name, fallback_colors[idx % len(fallback_colors)])
        if vy:
            segs, sx, sy = [], [], []
            for i, v in enumerate(vals):
                if v is not None: sx.append(i); sy.append(v)
                else:
                    if sx: segs.append((list(sx), list(sy)))
                    sx, sy = [], []
            if sx: segs.append((sx, sy))
            for si, (seg_x, seg_y) in enumerate(segs):
                ax.plot(seg_x, seg_y, color=clr, linewidth=1.8, marker="o", markersize=3, label=cat_name[:28] if si == 0 else None)
        else: ax.plot([], [], color=clr, linewidth=1.8, label=f"{cat_name[:28]} (no data)")
    if periods: ax.set_xticks(range(len(periods))); ax.set_xticklabels(periods, fontsize=6.5, rotation=45, ha="right")
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{v:,.0f}"))
    ax.set_ylabel(unit, fontsize=7, color=TEXT_SECONDARY); ax.grid(axis="y", alpha=0.2, linewidth=0.5)
    ax.set_title(title, fontsize=10, fontweight="bold", color=DARK, pad=8)
    ax.spines["bottom"].set_color(BORDER_COLOR); ax.spines["left"].set_color(BORDER_COLOR)
    # Place legend below the chart area
    fig.legend(*ax.get_legend_handles_labels(), loc="lower center", ncol=min(num_cats, 3),
               fontsize=6, frameon=False, bbox_to_anchor=(0.5, 0.0))
    return _fig_to_bytes(fig, tight=False)


def _render_grouped_bar(title: str, groups: list, bar_colors: list,
                        unit: str, figsize=(7.2, 2.8)) -> io.BytesIO:
    _setup_mpl()
    fig, ax = plt.subplots(figsize=figsize)
    if not groups:
        ax.text(0.5, 0.5, "No data", ha="center", va="center", fontsize=12, color=TEXT_MUTED); ax.axis("off"); return _fig_to_bytes(fig)
    cat_labels = [g["label"] for g in groups]; n = len(groups[0].get("values", [])); bar_h = 0.35; y = range(len(cat_labels))
    legend_labels = groups[0].get("series_labels", [])
    for i in range(n):
        offsets = [j - bar_h * (n - 1) / 2 + i * bar_h for j in y]; vals = [g["values"][i] for g in groups]
        bars = ax.barh(offsets, vals, bar_h * 0.9, color=bar_colors[i % len(bar_colors)], label=legend_labels[i] if i < len(legend_labels) else "")
        for bar, v in zip(bars, vals):
            if v > 0: ax.text(bar.get_width() + max(max(max(g["values"]) for g in groups) * 0.02, 0.5), bar.get_y() + bar.get_height() / 2, f"{v:,.1f}", va="center", fontsize=7, color=DARK)
    ax.set_yticks(list(y)); ax.set_yticklabels(cat_labels, fontsize=8); ax.set_xlabel(unit, fontsize=7, color=TEXT_SECONDARY)
    ax.legend(fontsize=7, frameon=False, loc="lower right"); ax.set_title(title, fontsize=10, fontweight="bold", color=DARK, pad=8)
    ax.grid(axis="x", alpha=0.2); ax.invert_yaxis(); fig.tight_layout()
    return _fig_to_bytes(fig)
