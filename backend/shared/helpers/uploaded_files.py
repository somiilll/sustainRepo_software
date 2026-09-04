import re
from typing import Any, Iterable, Set

from r2_storage import get_r2_storage


_FILE_ID_URL_PATTERN = re.compile(r"/api/files/([A-Za-z0-9\-]+)")


def extract_uploaded_file_ids(value: Any) -> Set[str]:
    if value is None:
        return set()
    if isinstance(value, str):
        return set(_FILE_ID_URL_PATTERN.findall(value))
    if isinstance(value, list):
        return set().union(*(extract_uploaded_file_ids(item) for item in value)) if value else set()
    if isinstance(value, dict):
        file_ids = {
            value[key]
            for key in ("file_id", "fileId")
            if isinstance(value.get(key), str) and value[key]
        }
        for key, item in value.items():
            if key not in {"file_id", "fileId"}:
                file_ids.update(extract_uploaded_file_ids(item))
        return file_ids
    return set()


async def delete_uploaded_files(database, file_ids: Iterable[str]) -> int:
    ids = list(dict.fromkeys(file_id for file_id in file_ids if file_id))
    if not ids:
        return 0

    records = await database.uploaded_files.find(
        {"id": {"$in": ids}}, {"_id": 0}
    ).to_list(len(ids))
    storage = get_r2_storage()
    for record in records:
        bucket_type = record.get("bucket_type")
        r2_key = record.get("r2_key")
        if bucket_type and r2_key:
            deleted = await storage.delete_file(bucket_type, r2_key)
            if not deleted:
                raise RuntimeError("R2 did not confirm file deletion")

    if not records:
        return 0
    result = await database.uploaded_files.delete_many({"id": {"$in": [record["id"] for record in records]}})
    return result.deleted_count