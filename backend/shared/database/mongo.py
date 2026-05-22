"""
MongoDB client + database singletons.

Why a singleton module?
  - The Motor `AsyncIOMotorClient` is asyncio-aware; creating multiple
    instances per process leaks connection pools.
  - Centralizing here means modules import a stable handle (`db`) instead
    of re-reading `os.environ['MONGO_URL']` and constructing their own
    client (which `report_generator.py` currently does — flagged for
    cleanup in Phase B8).
  - Atlas (`mongodb+srv://`) requires `tlsCAFile=certifi.where()`; that
    detection lives here once.
"""
import certifi
from motor.motor_asyncio import AsyncIOMotorClient

from app.config.env import MONGO_URL, DB_NAME


def _build_client() -> AsyncIOMotorClient:
    if MONGO_URL.startswith("mongodb+srv://"):
        return AsyncIOMotorClient(MONGO_URL, tlsCAFile=certifi.where())
    return AsyncIOMotorClient(MONGO_URL)


# Module-level singletons. `client` and `db` are imported by `server.py`
# during Phase B1, replacing the previous inline construction. They remain
# the same Motor objects — no behavioural change for callers.
client: AsyncIOMotorClient = _build_client()
db = client[DB_NAME]


def get_mongo_client() -> AsyncIOMotorClient:
    return client


def get_database():
    return db
