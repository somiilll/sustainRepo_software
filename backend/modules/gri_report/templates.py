"""GRI report HTML: answers grouped by GRI Standard and ordered by disclosure number."""
import html
import re
from typing import Any, Dict, List

CSS = """
@page { size: A4; margin: 18mm 15mm; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.4; color: #000; }
.doc-title { text-align: center; font-size: 15pt; font-weight: bold; margin: 0 0 6px 0; text-transform: uppercase; }
.intro-text { text-align: center; font-size: 11pt; margin: 2px 0; }
.section-header { font-size: 13pt; font-weight: bold; margin: 26px 0 8px 0; padding-bottom: 4px; border-bottom: 2px solid #000; page-break-after: avoid; }
.subsection-header { display: flex; font-size: 11pt; font-weight: bold; margin: 16px 0 6px 0; page-break-after: avoid; }
.subsection-header .rn { flex: 0 0 60px; }
.subsection-header .rt { text-decoration: underline; }
.question-item { margin: 8px 0 3px 0; font-weight: bold; page-break-after: avoid; }
.q-num { display: inline-block; min-width: 24px; }
.sub-label { margin: 6px 0 2px 24px; }
.answer-value { border: 1px solid #000; padding: 6px 8px; min-height: 18px; margin: 2px 0 6px 0; white-space: normal; }
.answer-value.sub { margin-left: 24px; }
.empty { color: #555; font-style: italic; }
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
    return f'<div class="answer-value{" sub" if sub else ""}">{body}</div>'


def _marker(question: Dict[str, Any]) -> str:
    suffix = question["question_key"].rsplit("_", 1)[-1]
    return f"{suffix}." if re.fullmatch(r"[a-z]", suffix) else ""


def _question_html(question: Dict[str, Any]) -> str:
    out = f'<div class="question-item"><span class="q-num">{_esc(_marker(question))}</span> <span class="q-text">{_esc(question.get("description") or "")}</span></div>'
    subs = question.get("sub_questions") or []
    if not subs:
        return out + _answer(question.get("response_value"))
    for sub in subs:
        out += f'<div class="sub-label"><span class="q-num">{_esc(sub["sub_key"])}.</span> {_esc(sub.get("label") or "")}</div>'
        out += _answer(sub.get("response_value"), sub=True)
    return out


def build_gri_html(organization: Dict[str, Any], reporting_period: str, questions: List[Dict[str, Any]]) -> str:
    standards: Dict[str, Dict[str, Any]] = {}
    for question in questions:
        std = standards.setdefault(str(question.get("material_topic_id") or ""), {"topic": question.get("material_topic") or "", "disclosures": {}})
        disc = std["disclosures"].setdefault(question["disclosure_id"], {"name": question.get("disclosure_name") or "", "questions": []})
        disc["questions"].append(question)
    body = [
        '<div class="doc-title">GRI Standards Report</div>',
        f'<div class="intro-text"><b>{_esc(organization.get("name") or "")}</b></div>',
        f'<div class="intro-text">Reporting period: {_esc(reporting_period)}</div>',
        '<div class="intro-text">Information reported with reference to the GRI Standards</div>',
    ]
    for topic_id in sorted(standards, key=_numeric):
        std = standards[topic_id]
        body.append(f'<div class="section-header">{_esc(_standard_title(topic_id, std["topic"]))}</div>')
        for disclosure_id in sorted(std["disclosures"], key=_numeric):
            disc = std["disclosures"][disclosure_id]
            body.append(f'<div class="subsection-header"><span class="rn">{_esc(disclosure_id)}</span><span class="rt">{_esc(disc["name"])}</span></div>')
            for question in sorted(disc["questions"], key=lambda q: q.get("question_order") or 0):
                body.append(_question_html(question))
    return f'<!DOCTYPE html><html><head><meta charset="utf-8"><title>GRI Report</title><style>{CSS}</style></head><body>{"".join(body)}</body></html>'
