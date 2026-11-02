"""Converts the report HTML (same markup used for the PDF) into an editable Word document."""
import io
from typing import List

import lxml.html
from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

BODY_PT = 11
HEADING_PT = {"doc-title": 14, "section-header": 13}


def _clean(text: str) -> str:
    return " ".join((text or "").split())


def _add_inline(paragraph, element, size: float, bold=False, italic=False, underline=False):
    def run(text, b, i):
        if text and _clean(text):
            r = paragraph.add_run(text)
            r.font.size = Pt(size)
            r.bold, r.italic, r.underline = b, i, underline or None
    run(_normalise(element.text), bold, italic)
    for child in element:
        if not isinstance(child.tag, str):
            run(_normalise(child.tail), bold, italic)
            continue
        if child.tag == "br":
            paragraph.add_run().add_break()
        else:
            _add_inline(paragraph, child, size, bold or child.tag in ("b", "strong", "th"), italic or child.tag in ("i", "em"), underline)
        run(_normalise(child.tail), bold, italic)


def _normalise(text):
    if not text:
        return ""
    return (" " if text[0].isspace() else "") + " ".join(text.split()) + (" " if text[-1].isspace() and text.strip() else "")


def _paragraph(doc, element, size=BODY_PT, bold=False, align=None, italic=False, underline=False, space_before=0, space_after=4):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(space_before)
    p.paragraph_format.space_after = Pt(space_after)
    if align is not None:
        p.alignment = align
    _add_inline(p, element, size, bold, italic, underline)
    return p


def _shade(cell, fill: str):
    props = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    props.append(shd)


def _table(doc, element):
    rows = element.xpath(".//tr")
    cls = element.get("class") or ""
    size = 8 if "dense" in cls else 9 if "medium" in cls else 10
    grid: List[List[object]] = []
    placements = []
    for r, tr in enumerate(rows):
        c = 0
        for cell in tr.xpath("./th|./td"):
            while len(grid) <= r:
                grid.append([])
            while c < len(grid[r]) and grid[r][c]:
                c += 1
            rs, cs = int(cell.get("rowspan") or 1), int(cell.get("colspan") or 1)
            for rr in range(r, r + rs):
                while len(grid) <= rr:
                    grid.append([])
                while len(grid[rr]) < c + cs:
                    grid[rr].append(None)
                for cc in range(c, c + cs):
                    grid[rr][cc] = True
            placements.append((r, c, rs, cs, cell, tr))
            c += cs
    ncols = max((len(g) for g in grid), default=0)
    if not ncols:
        return
    table = doc.add_table(rows=len(rows), cols=ncols)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for r, c, rs, cs, cell, tr in placements:
        target = table.cell(r, c)
        if rs > 1 or cs > 1:
            target = target.merge(table.cell(r + rs - 1, c + cs - 1))
        par = target.paragraphs[0]
        par.paragraph_format.space_after = Pt(0)
        header = cell.tag == "th" or "category-header" in (tr.get("class") or "")
        _add_inline(par, cell, size, bold=header)
        if cell.tag == "th":
            par.alignment = WD_ALIGN_PARAGRAPH.CENTER
        if header:
            _shade(target, "E7E6E6" if cell.tag == "th" else "F2F2F2")
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def _block(doc, el):
    tag, cls = el.tag, (el.get("class") or "").split()
    if not isinstance(tag, str):
        return
    if tag == "table":
        return _table(doc, el)
    if "page-break" in cls:
        return doc.add_page_break()
    if "annexure-label" in cls:
        return _paragraph(doc, el, BODY_PT, bold=True, italic=True, align=WD_ALIGN_PARAGRAPH.RIGHT)
    if "doc-title" in cls:
        return _paragraph(doc, el, HEADING_PT["doc-title"], bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=10)
    if "section-header" in cls:
        return _paragraph(doc, el, HEADING_PT["section-header"], bold=True, space_before=12, space_after=8)
    if "subsection-header" in cls:
        p = doc.add_paragraph()
        p.paragraph_format.space_before, p.paragraph_format.space_after = Pt(10), Pt(6)
        p.paragraph_format.tab_stops.add_tab_stop(Cm(1.8))
        num, text = el.xpath(".//span[@class='rn']"), el.xpath(".//span[@class='rt']")
        if num and text:
            _add_inline(p, num[0], BODY_PT, bold=True)
            p.add_run("\t")
            _add_inline(p, text[0], BODY_PT, bold=True, underline=True)
        else:
            _add_inline(p, el, BODY_PT, bold=True, underline=True)
        return p
    if "principle-header" in cls:
        return _paragraph(doc, el, BODY_PT, bold=True, space_before=10, space_after=6)
    if "indicator-header" in cls:
        return _paragraph(doc, el, BODY_PT, bold=True, underline=True, align=WD_ALIGN_PARAGRAPH.CENTER, space_before=8, space_after=6)
    if "question-item" in cls:
        p = doc.add_paragraph()
        p.paragraph_format.space_before, p.paragraph_format.space_after = Pt(8), Pt(3)
        p.paragraph_format.left_indent, p.paragraph_format.first_line_indent = Cm(1.0), Cm(-1.0)
        p.paragraph_format.tab_stops.add_tab_stop(Cm(1.0))
        num = el.xpath(".//span[@class='q-num']")
        if num:
            _add_inline(p, num[0], BODY_PT, bold=True)
            p.add_run("\t")
        for text in el.xpath(".//span[@class='q-text']") or [el]:
            _add_inline(p, text, BODY_PT, bold=True)
        return p
    if tag in ("div", "p", "section") and el.xpath("./table|./div|./p"):
        for child in el:
            _block(doc, child)
        return
    if tag in ("div", "p", "ul"):
        if _clean(el.text_content()):
            return _paragraph(doc, el, BODY_PT, space_after=4)
        return


def html_to_docx(html: str) -> bytes:
    doc = Document()
    section = doc.sections[0]
    section.orientation = WD_ORIENT.PORTRAIT
    section.page_width, section.page_height = Cm(21), Cm(29.7)
    section.left_margin = section.right_margin = Cm(1.8)
    section.top_margin = section.bottom_margin = Cm(1.8)
    style = doc.styles["Normal"]
    style.font.name = "Arial"
    style.element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
    style.font.size = Pt(BODY_PT)
    body = lxml.html.fromstring(html).find("body")
    for child in body:
        _block(doc, child)
    out = io.BytesIO()
    doc.save(out)
    return out.getvalue()
