"""Declaration XML built from a field -> element-path mapping, validated against an XSD when one is provided.

Until the Commission's definitive-period declaration XSD is dropped at reference/data/declaration.xsd, the
output is labelled DRAFT and is not claimed to be accepted by the CBAM Registry.
"""
import json
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

from ..core.config import settings
from ..reference.countries import iso_of

MAPPING_FILE = Path(__file__).with_name("xml_mapping.json")
DRAFT = "DRAFT - schema not validated"


def xsd_path() -> Path:
    return settings.reference_dir / "declaration.xsd"


def _set(parent: ET.Element, path: str, value) -> None:
    if value in (None, ""):
        return
    node = parent
    for part in path.split("/"):
        nxt = node.find(part)
        node = nxt if nxt is not None else ET.SubElement(node, part)
    node.text = f"{value:.6f}".rstrip("0").rstrip(".") if isinstance(value, float) else str(value)


def build(org: dict, year: int, lines: list[dict], s: dict, mapping: dict | None = None) -> tuple[bytes, dict]:
    m = mapping or json.loads(MAPPING_FILE.read_text(encoding="utf-8"))
    ns = m.get("namespace")
    root = ET.Element(m["root"], {"xmlns": ns} if ns else {})
    has_xsd = xsd_path().exists()
    header = {"report_id": f"{org.get('id', 'org')}-{year}", "draft_status": "" if has_xsd else DRAFT, "year": year,
              "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
              "declarant_name": org.get("name"), "declarant_id": org.get("eori") or org.get("id")}
    for path, key in m["header"].items():
        _set(root, path, header.get(key))
    for path, key in m["totals"].items():
        _set(root, path, s.get(key))
    for i, l in enumerate([l for l in lines if not l["calc"]["error"]], start=1):
        c = l["calc"]
        good = {"item": i, "cn": l["cn_code"].replace(" ", ""), "description": l.get("description"),
                "origin_iso3": iso_of(l.get("country_of_origin"))["iso3"] or l.get("country_of_origin"),
                "net_mass": float(l["net_mass"]), "unit": "MWh" if c.get("sector") == "Electricity" else "t",
                "import_date": l["import_date"], "installation": l.get("installation_name"),
                "determination": "Actual" if l.get("basis") == "actual" else "Default", "reporting_year": c.get("reporting_year"),
                "see_direct": c.get("see_direct"), "see_indirect": c.get("see_indirect_counted"), "see": c.get("see"),
                "sefa": c.get("sefa"), "secpp": c.get("secpp") or None, "certificates": c.get("certificates"), "evidence": l.get("evidence")}
        el = ET.SubElement(root, m["goods_element"])
        for path, key in m["goods"].items():
            _set(el, path, good.get(key))
    ET.indent(root)
    xml = b'<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="utf-8")
    return xml, validate(xml)


def validate(xml: bytes, xsd: Path | None = None) -> dict:
    xsd = xsd or xsd_path()
    if not xsd.exists():
        return {"status": "draft", "valid": None, "errors": [], "message": f"{DRAFT}: no declaration XSD at {xsd.name}"}
    import xmlschema

    schema = xmlschema.XMLSchema(str(xsd))
    errors = [str(e.reason or e)[:300] for e in schema.iter_errors(xml.decode("utf-8"))]
    return {"status": "valid" if not errors else "invalid", "valid": not errors, "errors": errors[:50],
            "message": "Validated against " + xsd.name}
