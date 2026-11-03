"""Small helpers shared by the API routers."""
import re

from fastapi import HTTPException, UploadFile
from fastapi.responses import Response

from ..core import db
from ..core.config import settings

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _safe(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("_")


def _404(x):
    if x is None:
        raise HTTPException(404, "Not found")
    return x


async def _store(file: UploadFile) -> str:
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    name = f"{db.new_id()}_{''.join(c for c in file.filename if c.isalnum() or c in '._-')}"
    (settings.storage_dir / name).write_bytes(await file.read())
    return name


def download(data: bytes, media_type: str, filename: str) -> Response:
    return Response(data, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{_safe(filename)}"'})
