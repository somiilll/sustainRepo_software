"""Loads the Commission's informative Excel files into lookup tables.

- Default values: Impl. Reg. (EU) 2025/2621 as corrected by 2026/1740 (file v2, 6 Aug 2026)
- CBAM benchmarks: Impl. Reg. (EU) 2025/2620 (file of 6 Feb 2026)
"""
from dataclasses import dataclass, field
from functools import lru_cache

import openpyxl

from ..core.config import settings

DV_FILE = "default_values_2026_1740.xlsx"
BM_FILE = "benchmarks_2025_2620.xlsx"
DV_VERSION = "DV 2025/2621 corr. 2026/1740 (EC file v2, 06.08.2026)"
BM_VERSION = "BM 2025/2620 (EC file 06.02.2026)"
OTHER = "Other Countries and Territories"
ANNEX_IV = "Annex IV"
SECTORS = ("Cement", "Iron and steel", "Aluminium", "Fertilisers", "Hydrogen", "Electricity")
ANNEX_II_SECTORS = ("Iron and steel", "Aluminium", "Hydrogen")  # direct emissions only


def digits(cn) -> str:
    return "".join(ch for ch in str(cn) if ch.isdigit())


def num(v) -> float | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(" ", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None  # "-", "N/A", "see below", ""


@dataclass
class DVRow:
    code: str
    description: str
    sector: str
    direct: float | None
    indirect: float | None
    total: float | None
    route: str


@dataclass
class BMOption:
    value: float
    indicator: str  # "", "(A)".."(L)" route, or "(1)"/"(2)" production-year band


@dataclass
class BMRow:
    code: str
    description: str
    sector: str
    col_a: list[BMOption] = field(default_factory=list)
    col_b: list[BMOption] = field(default_factory=list)


@dataclass
class ReferenceData:
    dv: dict[str, list[DVRow]]  # country -> rows (incl. OTHER and ANNEX_IV)
    bm: dict[str, BMRow]  # 8-digit CN -> row
    versions: dict[str, str]

    @property
    def countries(self) -> list[str]:
        return sorted(c for c in self.dv if c not in (OTHER, ANNEX_IV))


def _load_dv() -> dict[str, list[DVRow]]:
    wb = openpyxl.load_workbook(settings.reference_dir / DV_FILE, read_only=True, data_only=True)
    out: dict[str, list[DVRow]] = {}
    for ws in wb.worksheets[2:]:
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            continue
        country = str(rows[0][0]).strip()
        annex_iv = country == ANNEX_IV
        sector = ""
        table: list[DVRow] = []
        for r in rows[2:]:
            if not r or r[0] in (None, ""):
                continue
            if all(c in (None, "") for c in r[1:]):
                sector = str(r[0]).strip()
                continue
            if annex_iv:
                total, route, direct, indirect = num(r[2]), (r[3] or ""), None, None
            else:
                direct, indirect, total, route = num(r[2]), num(r[3]), num(r[4]), (r[5] or "")
            table.append(DVRow(digits(r[0]), str(r[1] or ""), sector, direct, indirect, total, str(route).strip()))
        out[country] = table
    return out


def _load_bm() -> dict[str, BMRow]:
    wb = openpyxl.load_workbook(settings.reference_dir / BM_FILE, read_only=True, data_only=True)
    ws = wb["Benchmarks"]
    out: dict[str, BMRow] = {}
    sector, cur = "", None
    for r in list(ws.iter_rows(values_only=True))[1:]:
        r = tuple(r) + (None,) * (6 - len(r))
        if r[0] not in (None, "") and all(c in (None, "") for c in r[1:]):
            sector = str(r[0]).strip()
            continue
        if r[0] not in (None, ""):
            cur = BMRow(digits(r[0]).ljust(8, "0")[:8], str(r[1] or ""), sector)
            out[cur.code] = cur
        if cur is None:
            continue
        if num(r[2]) is not None:
            cur.col_a.append(BMOption(num(r[2]), str(r[3] or "").strip()))
        if num(r[4]) is not None:
            cur.col_b.append(BMOption(num(r[4]), str(r[5] or "").strip()))
    return out


@lru_cache(maxsize=1)
def load_reference() -> ReferenceData:
    return ReferenceData(_load_dv(), _load_bm(), {"default_values": DV_VERSION, "benchmarks": BM_VERSION})
