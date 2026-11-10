"""Approved OCR water rows -> Environment > Water > Withdrawal records (one monthly record per row and period)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from modules.esg_records.contracts import CreateRecordRequest, ReportingPeriod
from modules.esg_records.service import esg_records_service
from r2_storage import get_r2_storage

from .saver import SaveError, _scaled

SOURCE_KEY = {
    "Third-party / municipal water": "water_withdrawal_through_third_party_water",
    "Third-party water - tanker": "water_withdrawal_through_third_party_water",
    "Recycled / treated water": "water_withdrawal_through_third_party_water",
    "Groundwater": "water_withdrawal_through_ground_water",
    "Surface water": "water_withdrawal_through_surface_water",
    "Rainwater harvested": "water_withdrawal_through_other_sources",
}
UNITS = {"l": "Litres", "litre": "Litres", "litres": "Litres", "kl": "KiloLitres", "m3": "KiloLitres", "m³": "KiloLitres", "ml": "MegaLitres"}


async def _evidence(db, org: str, user: dict, file_key: str | None, filename: str, cache: dict) -> list[dict]:
    if not file_key:
        return []
    if file_key not in cache:
        r2 = get_r2_storage()
        content, ctype = await r2.get_file("ocr_temp", file_key)
        up = await r2.upload_file(file_content=content, filename=filename, bucket_type="esg_metrics", content_type=ctype or "application/octet-stream", organization_id=org)
        if not up or not up.get("key"):
            raise SaveError("The source document could not be stored as evidence")
        fid = str(uuid.uuid4())
        await db.uploaded_files.insert_one({"id": fid, "original_filename": filename, "stored_filename": up["key"], "bucket_name": up.get("bucket"), "bucket_type": "esg_metrics",
                                            "r2_key": up["key"], "file_size": len(content), "content_type": ctype or "application/octet-stream", "organization_id": org,
                                            "uploaded_by": user.get("id"), "uploaded_at": datetime.now(timezone.utc).isoformat(), "source": "ocr_extraction"})
        cache[file_key] = {"id": fid, "file_id": fid, "filename": filename, "file_type": ctype or "application/octet-stream", "file_size": len(content),
                           "upload_url": f"/api/files/{fid}", "uploaded_at": datetime.now(timezone.utc).isoformat(), "uploaded_by": user.get("id") or ""}
    return [cache[file_key]]


async def save_water_record(db, org: str, user: dict, rec: dict, file_key: str | None, cache: dict) -> list[str]:
    if not rec.get("facility_id"):
        raise SaveError("Needs a facility before it can be saved")
    key = SOURCE_KEY.get(rec.get("subcategory"))
    unit_raw = (rec["fields"].get("qty_unit") or "").lower()
    unit = UNITS.get(unit_raw)
    if not key:
        raise SaveError(f"Water source '{rec.get('subcategory')}' has no Water Withdrawal field")
    if not unit:
        raise SaveError(f"Water unit '{rec['fields'].get('qty_unit')}' is not supported. Use litres, kL, m3 or ML (Edit the unit).")
    cat = await db.esg_record_categories.find_one({"section": "environment", "category": "Water", "subcategory": "Withdrawal"}, {"_id": 0, "id": 1})
    if not cat:
        raise SaveError("Water > Withdrawal is not set up in this system")
    facility = await db.facilities.find_one({"id": rec["facility_id"], "organization_id": org, "is_deleted": {"$ne": True}}, {"_id": 0, "id": 1})
    if not facility:
        raise SaveError("The facility on this row no longer exists. Pick another in Edit.")
    is_admin = user.get("role") in ("admin", "super_admin")
    alloc = rec.get("period_allocation") or [{"period": rec["reporting_period"], "share": 1.0}]
    evidence = await _evidence(db, org, user, file_key, (rec.get("evidence") or {}).get("file") or "document", cache)
    ids = []
    for part in alloc:
        year, month = (int(x) for x in part["period"].split("-"))
        qty = _scaled(rec["fields"], part["share"])["qty"]
        data = CreateRecordRequest(
            facility_id=facility["id"], record_level="facility", category_id=cat["id"], category="Water", subcategory="Withdrawal",
            reporting_period=ReportingPeriod(reporting_type="monthly", year=year, month=str(month)),
            field_values={key: round(qty, 6), f"{key}_unit": unit}, evidence_files=evidence,
            source_of_information="OCR Invoice Upload",
            notes=f"OCR extraction row {rec['row_id']}. {rec.get('description') or ''}".strip(), status="completed")
        try:
            record = await esg_records_service.create_record(section="environment", org_id=org, user_id=user.get("id"), data=data,
                                                              allow_without_assignment=is_admin, is_admin=is_admin)
        except ValueError as e:
            raise SaveError(str(e)) from e
        except Exception as e:  # noqa: BLE001
            raise SaveError(getattr(e, "detail", None) or str(e)) from e
        ids.append(record["id"])
    return ids
