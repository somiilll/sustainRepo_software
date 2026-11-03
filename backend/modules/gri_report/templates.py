"""GRI report HTML: answers grouped by GRI Standard and ordered by disclosure number."""
import html
import re
from typing import Any, Dict, List

CSS = """
@page { size: A4; margin: 20mm 18mm; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #334155; }
.gri-title { text-align: center; font-size: 22pt; font-weight: bold; color: #0F172A; text-transform: uppercase; letter-spacing: 1.5px; margin: 34px 0 10px 0; }
.gri-org { text-align: center; font-size: 15pt; font-weight: 700; color: #1E3A8A; margin: 4px 0; }
.gri-period { text-align: center; font-size: 11.5pt; color: #475569; margin: 2px 0; }
.gri-ref { text-align: center; font-size: 10pt; font-style: italic; color: #64748B; margin: 2px 0; }
.gri-divider { width: 90px; height: 4px; background: #1E3A8A; margin: 18px auto 26px auto; border-radius: 2px; }
.std-header { font-size: 14pt; font-weight: bold; color: #1E3A8A; margin: 30px 0 12px 0; padding-bottom: 6px; border-bottom: 2px solid #1E3A8A; page-break-after: avoid; }
.disc-header { display: flex; align-items: baseline; font-size: 11pt; font-weight: bold; color: #0F172A; margin: 20px 0 8px 0; padding-bottom: 3px; border-bottom: 1px solid #E2E8F0; page-break-after: avoid; }
.disc-header .rn { flex: 0 0 68px; color: #1E3A8A; }
.gq-item { padding-left: 28px; text-indent: -28px; margin: 10px 0 3px 0; font-weight: 600; color: #1E293B; page-break-after: avoid; }
.gq-item .q-num { display: inline-block; min-width: 28px; text-indent: 0; font-weight: bold; color: #1E3A8A; }
.gq-sub .q-num { display: inline-block; min-width: 24px; text-indent: 0; font-weight: bold; color: #1E3A8A; }
.gq-sub { padding-left: 24px; text-indent: -24px; margin: 8px 0 3px 28px; font-size: 10pt; font-weight: 500; color: #334155; page-break-after: avoid; }
.gq-answer { margin: 2px 0 10px 28px; padding: 3px 0 3px 12px; border-left: 2px solid #CBD5E1; color: #1E293B; }
.gq-answer.sub { margin-left: 48px; }
.empty { color: #64748B; font-style: italic; font-size: 10pt; }
"""


def _esc(value: Any) -> str:
    return html.escape(str(value)).replace("\n", "<br>")


def _standard_title(topic_id: str, topic: str) -> str:
    return "GRI 2: General Disclosures" if str(topic_id) == "2" else f"GRI {topic_id}: {topic}"


def _numeric(text: str) -> List[int]:
    return [int(p) if p.isdigit() else 0 for p in re.split(r"[-.]", text or "")]


def _answer(value: Any, sub: bool = False) -> str:
    has_value = value not in (None, "") and str(value).strip() != ""
    body = _esc(value) if has_value else '<span class="empty">Not reported</span>'
    return f'<div class="gq-answer{" sub" if sub else ""}">{body}</div>'


def _marker(question: Dict[str, Any]) -> str:
    suffix = question["question_key"].rsplit("_", 1)[-1]
    return f"{suffix}." if re.fullmatch(r"[a-z]", suffix) else ""


def _question_html(question: Dict[str, Any]) -> str:
    out = f'<div class="gq-item"><span class="q-num">{_esc(_marker(question))}</span> <span class="q-text">{_esc(question.get("description") or "")}</span></div>'
    subs = question.get("sub_questions") or []
    if not subs:
        return out + _answer(question.get("response_value"))
    for sub in subs:
        out += f'<div class="gq-sub"><span class="q-num">{_esc(sub["sub_key"])}.</span> <span class="q-text">{_esc(sub.get("label") or "")}</span></div>'
        out += _answer(sub.get("response_value"), sub=True)
    return out


def build_gri_html(organization: Dict[str, Any], reporting_period: str, questions: List[Dict[str, Any]]) -> str:
    standards: Dict[str, Dict[str, Any]] = {}
    for question in questions:
        std = standards.setdefault(str(question.get("material_topic_id") or ""), {"topic": question.get("material_topic") or "", "disclosures": {}})
        disc = std["disclosures"].setdefault(question["disclosure_id"], {"name": question.get("disclosure_name") or "", "questions": []})
        disc["questions"].append(question)
    body = [
        '<div class="gri-title">GRI STANDARDS REPORT</div>',
        f'<div class="gri-org">{_esc(organization.get("name") or "")}</div>',
        f'<div class="gri-period">Reporting period: {_esc(reporting_period)}</div>',
        '<div class="gri-ref">Information reported with reference to the GRI Standards</div>',
        '<div class="gri-divider"></div>',
    ]
    for topic_id in sorted(standards, key=_numeric):
        std = standards[topic_id]
        body.append(f'<div class="std-header">{_esc(_standard_title(topic_id, std["topic"]))}</div>')
        for disclosure_id in sorted(std["disclosures"], key=_numeric):
            disc = std["disclosures"][disclosure_id]
            body.append(f'<div class="disc-header"><span class="rn">{_esc(disclosure_id)}</span><span class="rt">{_esc(disc["name"])}</span></div>')
            for question in sorted(disc["questions"], key=lambda q: q.get("question_order") or 0):
                body.append(_question_html(question))
    return f'<!DOCTYPE html><html><head><meta charset="utf-8"><title>GRI Report</title><style>{CSS}</style></head><body>{"".join(body)}</body></html>'
