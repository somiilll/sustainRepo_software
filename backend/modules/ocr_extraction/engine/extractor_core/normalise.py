"""Step 1 - turn any upload into either spreadsheet TABLES or document PAGES.

Spreadsheets: every sheet (hidden ones too, flagged), merged cells filled, several tables per sheet found,
title lines above a table kept as context, 2-row headers joined.
Documents: PDF pages (text layer + image) or a photo/scan, EXIF-rotated, contrast-fixed, quality-checked.
"""
from __future__ import annotations

import base64
import csv
import hashlib
import io
from dataclasses import dataclass, field
from pathlib import Path

from .units import parse_number

SHEET_EXT = {".xlsx", ".xlsm", ".xls", ".csv", ".tsv"}
DOC_EXT = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp", ".gif", ".avif", ".heic", ".heif"}


def file_kind(path: str | Path) -> str:
    ext = Path(path).suffix.lower()
    if ext in SHEET_EXT:
        return "sheet"
    if ext in DOC_EXT:
        return "document"
    return "unsupported"


def file_hash(path: str | Path) -> str:
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# =============================================================================== spreadsheets
@dataclass
class Table:
    sheet: str
    header: list[str]
    rows: list[list]                      # raw cell values below the header
    first_row: int                        # 1-based Excel row number of rows[0]
    title_lines: list[str] = field(default_factory=list)
    hidden_sheet: bool = False

    @property
    def ncols(self) -> int:
        return len(self.header)


def _cell_str(v) -> str:
    if v is None:
        return ""
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d")
    return str(v).strip()


def _nonempty(row) -> int:
    return sum(1 for v in row if _cell_str(v))


def _numeric_cells(row) -> int:
    return sum(1 for v in row if isinstance(v, (int, float)) and not isinstance(v, bool) or
               (isinstance(v, str) and parse_number(v) is not None and not any(c.isalpha() for c in v.replace("Rs", "").replace("INR", ""))))


def _header_like(row, nxt) -> bool:
    ne = _nonempty(row)
    if ne < 2 or len({_cell_str(v) for v in row if _cell_str(v)}) < 2:     # a merged title repeats one value
        return False
    text = sum(1 for v in row if _cell_str(v) and not isinstance(v, (int, float)) and not hasattr(v, "strftime"))
    return text / ne >= 0.6 and nxt is not None and (_numeric_cells(nxt) >= 1 or _nonempty(nxt) >= 2)


def _grid_from_openpyxl(ws) -> list[list]:
    grid = [list(r) for r in ws.iter_rows(values_only=True)]
    for mr in list(ws.merged_cells.ranges):          # fill merged areas with the top-left value
        v = ws.cell(mr.min_row, mr.min_col).value
        for r in range(mr.min_row, mr.max_row + 1):
            for c in range(mr.min_col, mr.max_col + 1):
                if r - 1 < len(grid) and c - 1 < len(grid[r - 1]):
                    grid[r - 1][c - 1] = v
    return grid


def _tables_from_grid(sheet: str, grid: list[list], hidden: bool) -> list[Table]:
    width = max((len(r) for r in grid), default=0)
    grid = [list(r) + [None] * (width - len(r)) for r in grid]
    # drop columns that are empty everywhere
    keep = [c for c in range(width) if any(_cell_str(r[c]) for r in grid)]
    grid = [[r[c] for c in keep] for r in grid]
    tables: list[Table] = []
    i, n = 0, len(grid)
    titles: list[str] = []
    while i < n:
        row = grid[i]
        if _nonempty(row) == 0:
            i += 1
            continue
        nxt = next((grid[j] for j in range(i + 1, min(i + 3, n)) if _nonempty(grid[j])), None)
        if not _header_like(row, nxt):
            distinct = list(dict.fromkeys(_cell_str(v) for v in row if _cell_str(v)))
            if len(distinct) <= 2:
                titles.append(" ".join(distinct))
            i += 1
            continue
        header = [_cell_str(v) for v in row]
        j = i + 1
        # two-row header: next row also mostly text and the one after has numbers
        if j < n and _nonempty(grid[j]) >= 2 and _numeric_cells(grid[j]) == 0 and j + 1 < n and _numeric_cells(grid[j + 1]) >= 1:
            sub = [_cell_str(v) for v in grid[j]]
            header = [(f"{a} {b}".strip() if a != b else a) for a, b in zip(header, sub)]
            j += 1
        start = j
        body = []
        blank_run = 0
        while j < n:
            r = grid[j]
            if _nonempty(r) == 0:
                blank_run += 1
                if blank_run >= 2:
                    break
                j += 1
                continue
            # a new header-like row starts the next table
            nxt2 = next((grid[k] for k in range(j + 1, min(j + 3, n)) if _nonempty(grid[k])), None)
            if body and _numeric_cells(r) == 0 and _header_like(r, nxt2) and _nonempty(r) >= max(2, _nonempty(row) // 2):
                break
            blank_run = 0
            body.append(r)
            j += 1
        if body:
            tables.append(Table(sheet, header, body, start + 1, titles[-3:], hidden))
        titles = []
        i = j
    return tables


def read_tables(path: str | Path) -> list[Table]:
    p = Path(path)
    ext = p.suffix.lower()
    if ext in (".csv", ".tsv"):
        raw = p.read_bytes()
        text = None
        for enc in ("utf-8-sig", "cp1252", "latin-1"):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        delim = "\t" if ext == ".tsv" else ","
        if ext == ".csv" and text:
            try:
                delim = csv.Sniffer().sniff(text[:5000], delimiters=",;|\t").delimiter
            except csv.Error:
                pass
        grid = [row for row in csv.reader(io.StringIO(text or ""), delimiter=delim)]
        return _tables_from_grid(p.stem, grid, False)
    if ext == ".xls":
        import pandas as pd
        out = []
        for name, df in pd.read_excel(p, sheet_name=None, header=None).items():   # needs xlrd
            out += _tables_from_grid(name, df.where(df.notna(), None).values.tolist(), False)
        return out
    import openpyxl
    wb = openpyxl.load_workbook(p, data_only=True)
    out = []
    for ws in wb.worksheets:
        out += _tables_from_grid(ws.title, _grid_from_openpyxl(ws), ws.sheet_state != "visible")
    return out


# =============================================================================== documents
@dataclass
class Page:
    index: int                 # 0-based
    jpeg_b64: str
    text: str                  # PDF text layer ('' for scans/photos)
    width: int
    height: int
    quality: dict


def _quality(img) -> dict:
    from PIL import ImageFilter, ImageStat
    g = img.convert("L")
    small = g.copy()
    small.thumbnail((1200, 1200))
    edges = ImageStat.Stat(small.filter(ImageFilter.FIND_EDGES)).stddev[0]
    contrast = ImageStat.Stat(small).stddev[0]
    issues = []
    if min(img.size) < 700:
        issues.append("low resolution")
    if edges < 9:
        issues.append("blurry")
    if contrast < 25:
        issues.append("low contrast")
    return {"edge_score": round(edges, 1), "contrast": round(contrast, 1), "issues": issues}


def _prep_image(img):
    from PIL import ImageOps
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    q = _quality(img)
    if "low contrast" in q["issues"]:
        img = ImageOps.autocontrast(img.convert("RGB"), cutoff=1)
    img = img.convert("RGB")
    img.thumbnail((2000, 2000))
    return img, q


def _b64(img) -> str:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()


def read_pages(path: str | Path, max_pages: int = 10) -> tuple[list[Page], list[str]]:
    """Returns (pages, warnings)."""
    from PIL import Image
    p = Path(path)
    warnings: list[str] = []
    pages: list[Page] = []
    if p.suffix.lower() == ".pdf":
        import fitz
        doc = fitz.open(p)
        if len(doc) > max_pages:
            warnings.append(f"PDF has {len(doc)} pages - only the first {max_pages} were read")
        for i in range(min(len(doc), max_pages)):
            page = doc.load_page(i)
            text = page.get_text("text").strip()
            pix = page.get_pixmap(dpi=150 if text else 200)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            img, q = _prep_image(img)
            pages.append(Page(i, _b64(img), text, img.width, img.height, q))
        return pages, warnings
    if p.suffix.lower() in (".heic", ".heif"):
        try:
            import pillow_heif  # type: ignore
            pillow_heif.register_heif_opener()
        except ImportError:
            raise ValueError("HEIC photos need the pillow-heif package - or export the photo as JPG")
    img = Image.open(p)
    frames = getattr(img, "n_frames", 1)
    for i in range(min(frames, max_pages)):
        if frames > 1:
            img.seek(i)
        im, q = _prep_image(img.copy())
        pages.append(Page(i, _b64(im), "", im.width, im.height, q))
    return pages, warnings
