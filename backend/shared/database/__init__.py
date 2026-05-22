"""Shared database access — single Mongo client, repository base, etc."""
from .mongo import get_mongo_client, get_database, client, db

__all__ = ["get_mongo_client", "get_database", "client", "db"]
