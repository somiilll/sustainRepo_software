"""Audit trail: who changed or approved which record, when, and what the old and new values were.

Append-only. SQLite by default; for Mongo implement the same three methods (record, for_item, for_job).
`actor` is whatever the host app knows about the user (the testbench has no logins, so it uses "reviewer").
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path

# the fields a reviewer can see and change; everything in a snapshot is compared field by field
TRACKED = ("review_state", "activity", "scope", "category", "quantity", "unit", "amount", "period", "facility", "use_context")


def snapshot(row: dict | None) -> dict:
    """The reviewer-visible state of a parent row, as plain values."""
    if not row:
        return {}
    g, d = row.get("ghg") or {}, row.get("decision") or {}
    return {
        "review_state": (row.get("review") or {}).get("state") or row.get("review_status"),
        "activity": row.get("activity_label") or row.get("activity_id"),
        "scope": g.get("scope_label"),
        "category": g.get("category_label"),
        "quantity": row.get("raw_quantity"),
        "unit": row.get("raw_unit"),
        "amount": row.get("amount"),
        "period": row.get("reporting_period"),
        "facility": (row.get("facility") or {}).get("name"),
        "use_context": (d.get("context") or {}).get("use_context"),
    }


def diff(before: dict, after: dict) -> dict:
    """{field: [old, new]} for the tracked fields that changed."""
    return {k: [before.get(k), after.get(k)] for k in TRACKED if before.get(k) != after.get(k)}


class AuditLog:
    def __init__(self, path: str | Path):
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock:
            self._db.executescript("""
                CREATE TABLE IF NOT EXISTS audit (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL, org TEXT NOT NULL, job_id TEXT NOT NULL,
                    item_id TEXT, row_id TEXT, label TEXT, action TEXT NOT NULL, actor TEXT NOT NULL,
                    changes TEXT, note TEXT);
                CREATE INDEX IF NOT EXISTS audit_job ON audit(org, job_id, ts);
                CREATE INDEX IF NOT EXISTS audit_item ON audit(org, job_id, item_id);
            """)
            self._db.commit()

    def record(self, org: str, job_id: str, action: str, actor: str = "reviewer", item_id: str | None = None,
               row_id: str | None = None, label: str | None = None, changes: dict | None = None,
               note: str | None = None, ts: float | None = None) -> None:
        with self._lock:
            self._db.execute(
                "INSERT INTO audit(ts, org, job_id, item_id, row_id, label, action, actor, changes, note) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (ts or time.time(), org, job_id, item_id, row_id, label, action, actor,
                 json.dumps(changes, default=str) if changes else None, note))
            self._db.commit()

    def _rows(self, sql: str, args: tuple) -> list[dict]:
        with self._lock:
            cur = self._db.execute(sql, args)
            cols = [c[0] for c in cur.description]
            out = [dict(zip(cols, r)) for r in cur.fetchall()]
        for r in out:
            r["changes"] = json.loads(r["changes"]) if r["changes"] else {}
        return out

    def for_item(self, org: str, job_id: str, item_id: str) -> list[dict]:
        return self._rows("SELECT * FROM audit WHERE org=? AND job_id=? AND item_id=? ORDER BY ts DESC, id DESC", (org, job_id, item_id))

    def for_job(self, org: str, job_id: str, limit: int = 200) -> list[dict]:
        return self._rows("SELECT * FROM audit WHERE org=? AND job_id=? ORDER BY ts DESC, id DESC LIMIT ?", (org, job_id, limit))

    def recent(self, org: str, limit: int = 200) -> list[dict]:
        return self._rows("SELECT * FROM audit WHERE org=? ORDER BY ts DESC, id DESC LIMIT ?", (org, limit))
