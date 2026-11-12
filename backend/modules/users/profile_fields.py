"""Validation for the optional mobile number and designation stored on a user."""
import re

from fastapi import HTTPException

_MOBILE = re.compile(r"\+?[0-9][0-9 \-]{6,18}[0-9]")


def clean_mobile(value: str | None) -> str | None:
    mobile = (value or "").strip()
    if mobile and not _MOBILE.fullmatch(mobile):
        raise HTTPException(status_code=400, detail="Enter a valid mobile number")
    return mobile or None


def clean_designation(value: str | None) -> str | None:
    designation = (value or "").strip()
    if len(designation) > 100:
        raise HTTPException(status_code=400, detail="Designation must be 100 characters or fewer")
    return designation or None
