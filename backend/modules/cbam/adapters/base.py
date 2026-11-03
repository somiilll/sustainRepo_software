"""The only way the CBAM add-on reads SustainRepo data. Swap MockAdapter for HttpAdapter later."""
from typing import Protocol

from ..core.config import settings


class SustainRepoAdapter(Protocol):
    async def get_org(self, org_id: str) -> dict: ...
    async def list_facilities(self, org_id: str) -> list[dict]: ...
    async def get_facility(self, org_id: str, facility_id: str) -> dict | None: ...
    async def list_emission_records(self, org_id: str, facility_id: str, fy: str | None = None) -> list[dict]: ...
    async def list_suppliers(self, org_id: str) -> list[dict]: ...


class HttpAdapter:
    """Placeholder for the real integration (calls SUSTAINREPO_API_BASE with the user's JWT)."""

    def __init__(self, base_url: str):
        self.base_url = base_url

    async def _todo(self, *_, **__):
        raise NotImplementedError("Map SustainRepo REST endpoints here (facilities, emission records, suppliers).")

    get_org = list_facilities = get_facility = list_emission_records = list_suppliers = _todo


def get_adapter() -> SustainRepoAdapter:
    if settings.adapter == "http":
        return HttpAdapter(settings.sustainrepo_api_base)
    from .mock import MockAdapter

    return MockAdapter()
