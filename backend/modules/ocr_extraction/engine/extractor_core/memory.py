"""Persistent organisation memory: confirmed classifications, Excel layouts and documents already seen.

SQLite here; Emergent can implement the same four methods on MongoDB (collections: extraction_decisions,
extraction_layouts, extraction_seen_docs). Survives restarts and is shared by every user in the org,
unlike the prototype's in-memory _JEV_CLASSIFY_CACHE.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path


class Memory:
    def __init__(self, path: str | Path = ":memory:"):
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock:
            self._db.executescript("""
            CREATE TABLE IF NOT EXISTS decisions(org TEXT, key TEXT, activity_id TEXT, context TEXT, source TEXT,
                hits INTEGER DEFAULT 1, updated REAL, PRIMARY KEY(org, key));
            CREATE TABLE IF NOT EXISTS layouts(org TEXT, fingerprint TEXT, spec TEXT, updated REAL, PRIMARY KEY(org, fingerprint));
            CREATE TABLE IF NOT EXISTS seen_docs(org TEXT, doc_key TEXT, file_name TEXT, job_id TEXT, seen_at REAL,
                PRIMARY KEY(org, doc_key));
            CREATE TABLE IF NOT EXISTS facility_aliases(org TEXT, alias TEXT, facility_id TEXT, PRIMARY KEY(org, alias));
            CREATE TABLE IF NOT EXISTS history(org TEXT, key TEXT, period TEXT, quantity REAL, unit TEXT, job_id TEXT, row_id TEXT,
                PRIMARY KEY(org, key, period, job_id, row_id));
            """)

    # -------------------------------------------------------------- classification decisions
    def get_decision(self, org: str, key: str) -> dict | None:
        with self._lock:
            r = self._db.execute("SELECT activity_id, context, source, hits FROM decisions WHERE org=? AND key=?", (org, key)).fetchone()
        if not r:
            return None
        return {"activity_id": r[0], "context": json.loads(r[1] or "{}"), "source": r[2], "hits": r[3]}

    def save_decision(self, org: str, key: str, activity_id: str, context: dict | None, source: str) -> None:
        """source='user' (a correction) always wins over source='auto' (a confident AI decision)."""
        with self._lock:
            cur = self._db.execute("SELECT source FROM decisions WHERE org=? AND key=?", (org, key)).fetchone()
            if cur and cur[0] == "user" and source != "user":
                self._db.execute("UPDATE decisions SET hits=hits+1, updated=? WHERE org=? AND key=?", (time.time(), org, key))
            else:
                self._db.execute("INSERT OR REPLACE INTO decisions(org,key,activity_id,context,source,hits,updated) VALUES(?,?,?,?,?,"
                                 "COALESCE((SELECT hits FROM decisions WHERE org=? AND key=?),0)+1,?)",
                                 (org, key, activity_id, json.dumps(context or {}), source, org, key, time.time()))
            self._db.commit()

    # -------------------------------------------------------------- viewing and fixing what was learned
    def list_decisions(self, org: str, limit: int = 500) -> list[dict]:
        with self._lock:
            rows = self._db.execute("SELECT key, activity_id, context, source, hits, updated FROM decisions WHERE org=? "
                                    "ORDER BY updated DESC LIMIT ?", (org, limit)).fetchall()
        return [{"key": r[0], "activity_id": r[1], "context": json.loads(r[2] or "{}"), "source": r[3], "hits": r[4], "updated": r[5]} for r in rows]

    def delete_decision(self, org: str, key: str) -> bool:
        with self._lock:
            n = self._db.execute("DELETE FROM decisions WHERE org=? AND key=?", (org, key)).rowcount
            self._db.commit()
        return n > 0

    def set_decision(self, org: str, key: str, activity_id: str, context: dict | None = None) -> bool:
        """The customer changes what a remembered item means. Counts as their own decision (source 'user')."""
        with self._lock:
            n = self._db.execute("UPDATE decisions SET activity_id=?, context=?, source='user', updated=? WHERE org=? AND key=?",
                                 (activity_id, json.dumps(context or {}), time.time(), org, key)).rowcount
            self._db.commit()
        return n > 0

    def confirm(self, org: str, key: str, activity_id: str) -> bool:
        """A person approved a line that used this decision: an automatic memory becomes a confirmed one."""
        with self._lock:
            n = self._db.execute("UPDATE decisions SET source='user' WHERE org=? AND key=? AND source='auto' AND activity_id=?",
                                 (org, key, activity_id)).rowcount
            self._db.commit()
        return n > 0

    def share_with_all_vendors(self, org: str, key: str) -> str | None:
        """Copy a vendor-specific memory (x:...) to the wording-only key (d:...), so any vendor's line uses it. Returns the new key."""
        if not key.startswith("x:"):
            return None
        d = self.get_decision(org, key)
        if not d:
            return None
        desc, dim, _vendor = (key[2:].split("|") + ["", "", ""])[:3]
        new = f"d:{desc}|{dim}"
        with self._lock:
            self._db.execute("INSERT OR REPLACE INTO decisions(org,key,activity_id,context,source,hits,updated) VALUES(?,?,?,?,?,"
                             "COALESCE((SELECT hits FROM decisions WHERE org=? AND key=?),0),?)",
                             (org, new, d["activity_id"], json.dumps(d["context"]), "user", org, new, time.time()))
            self._db.commit()
        return new

    # -------------------------------------------------------------- approved quantities (for "10x your usual" checks)
    def add_history(self, org: str, key: str, period: str, quantity: float, unit: str | None, job_id: str, row_id: str) -> None:
        with self._lock:
            self._db.execute("INSERT OR REPLACE INTO history VALUES(?,?,?,?,?,?,?)", (org, key, period, quantity, unit, job_id, row_id))
            self._db.commit()

    def get_history(self, org: str, key: str, limit: int = 24) -> list[tuple[str, float, str | None]]:
        with self._lock:
            return self._db.execute("SELECT period, quantity, unit FROM history WHERE org=? AND key=? ORDER BY period DESC LIMIT ?",
                                    (org, key, limit)).fetchall()

    # -------------------------------------------------------------- facility names the customer has mapped before
    @staticmethod
    def _alias(name: str) -> str:
        return " ".join(str(name).lower().split())

    def get_facility_alias(self, org: str, name: str) -> str | None:
        with self._lock:
            r = self._db.execute("SELECT facility_id FROM facility_aliases WHERE org=? AND alias=?", (org, self._alias(name))).fetchone()
        return r[0] if r else None

    def save_facility_alias(self, org: str, name: str, facility_id: str | None) -> None:
        with self._lock:
            if facility_id:
                self._db.execute("INSERT OR REPLACE INTO facility_aliases VALUES(?,?,?)", (org, self._alias(name), facility_id))
            else:
                self._db.execute("DELETE FROM facility_aliases WHERE org=? AND alias=?", (org, self._alias(name)))
            self._db.commit()

    # -------------------------------------------------------------- Excel layouts
    def get_layout(self, org: str, fingerprint: str) -> dict | None:
        with self._lock:
            r = self._db.execute("SELECT spec FROM layouts WHERE org=? AND fingerprint=?", (org, fingerprint)).fetchone()
        return json.loads(r[0]) if r else None

    def save_layout(self, org: str, fingerprint: str, spec: dict) -> None:
        with self._lock:
            self._db.execute("INSERT OR REPLACE INTO layouts VALUES(?,?,?,?)", (org, fingerprint, json.dumps(spec), time.time()))
            self._db.commit()

    # -------------------------------------------------------------- duplicates
    def seen(self, org: str, doc_key: str) -> dict | None:
        with self._lock:
            r = self._db.execute("SELECT file_name, job_id, seen_at FROM seen_docs WHERE org=? AND doc_key=?", (org, doc_key)).fetchone()
        return {"file_name": r[0], "job_id": r[1], "seen_at": r[2]} if r else None

    def mark_seen(self, org: str, doc_key: str, file_name: str, job_id: str) -> None:
        with self._lock:
            self._db.execute("INSERT OR IGNORE INTO seen_docs VALUES(?,?,?,?,?)", (org, doc_key, file_name, job_id, time.time()))
            self._db.commit()

    def stats(self, org: str) -> dict:
        with self._lock:
            d = self._db.execute("SELECT COUNT(*), SUM(source='user') FROM decisions WHERE org=?", (org,)).fetchone()
            lay = self._db.execute("SELECT COUNT(*) FROM layouts WHERE org=?", (org,)).fetchone()
        return {"decisions": d[0] or 0, "user_corrections": d[1] or 0, "layouts": lay[0] or 0}
