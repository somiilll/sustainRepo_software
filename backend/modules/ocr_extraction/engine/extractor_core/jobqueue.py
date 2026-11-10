"""Job queue: every upload waits its turn, small jobs are not stuck behind big ones, and nothing is lost on a restart.

States:  queued -> running -> done | failed | cancelled      (and 'interrupted' for a job that was running when the server stopped)

Two lanes with their own slots:
  light  spreadsheets only (seconds)           - never waits behind a long PDF
  heavy  anything with a PDF or an image (tens of seconds)
and a cap on how many jobs one organisation can run at once, so one customer's big batch cannot starve the others.
Inside a job the engine still reads up to 4 files at once; across jobs `limits.gate` caps the AI calls.

SQLite here; in Emergent the same methods can sit on the real job runner. The runner is a plain function
`runner(job, cancel_event, set_credits) -> {"status": "done"|"failed"|"cancelled", "error": str|None, "credits": float}`.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path

ACTIVE = ("queued", "running")
RETRYABLE = ("failed", "cancelled", "interrupted")


class JobQueue:
    def __init__(self, path: str | Path, runner, heavy_slots: int = 3, light_slots: int = 2, per_org: int = 2, poll: float = 0.5):
        self.runner, self.slots, self.per_org, self.poll = runner, {"heavy": heavy_slots, "light": light_slots}, per_org, poll
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._lock = threading.RLock()
        self._cancel: dict[str, threading.Event] = {}
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._workers: list[threading.Thread] = []
        with self._lock:
            self._db.executescript("""
            CREATE TABLE IF NOT EXISTS queue(
                job_id TEXT PRIMARY KEY, org TEXT NOT NULL, mode TEXT, lane TEXT NOT NULL, status TEXT NOT NULL,
                names TEXT, paths TEXT, pages INTEGER DEFAULT 0, est_seconds REAL DEFAULT 0, created REAL, queued_at REAL,
                started REAL, finished REAL, error TEXT, credits REAL DEFAULT 0, attempts INTEGER DEFAULT 1, cancel_requested INTEGER DEFAULT 0);
            """)
            self._db.commit()

    # ------------------------------------------------------------------ reading
    def _row(self, r) -> dict:
        cols = ["job_id", "org", "mode", "lane", "status", "names", "paths", "pages", "est_seconds", "created", "queued_at", "started",
                "finished", "error", "credits", "attempts", "cancel_requested"]
        d = dict(zip(cols, r))
        d["names"], d["paths"] = json.loads(d["names"] or "[]"), json.loads(d["paths"] or "[]")
        d["cancel_requested"] = bool(d["cancel_requested"])
        return d

    def get(self, job_id: str) -> dict | None:
        with self._lock:
            r = self._db.execute("SELECT * FROM queue WHERE job_id=?", (job_id,)).fetchone()
        return self._row(r) if r else None

    def all(self, org: str | None = None, states: tuple[str, ...] | None = None) -> list[dict]:
        sql, args = "SELECT * FROM queue", []
        cond = []
        if org:
            cond.append("org=?"); args.append(org)
        if states:
            cond.append(f"status IN ({','.join('?' * len(states))})"); args += list(states)
        if cond:
            sql += " WHERE " + " AND ".join(cond)
        with self._lock:
            return [self._row(r) for r in self._db.execute(sql + " ORDER BY queued_at, rowid", args).fetchall()]

    def wait_info(self, job_id: str) -> dict:
        """For a queued job: its place in line (1 = next) and a rough wait in seconds (0 = starts now). Others: zeros."""
        with self._lock:
            j = self.get(job_id)
            if not j or j["status"] != "queued":
                return {"position": 0, "wait_seconds": 0}
            now = time.time()
            running = [x for x in self.all(states=("running",)) if x["lane"] == j["lane"]]
            ahead = [x for x in self.all(states=("queued",)) if x["lane"] == j["lane"] and (x["queued_at"], x["job_id"]) < (j["queued_at"], j["job_id"])]
            slots = max(1, self.slots[j["lane"]])
            if slots - len(running) > len(ahead) and self._org_running(j["org"]) < self.per_org:
                return {"position": len(ahead) + 1, "wait_seconds": 0}
            busy = sum(max(0.0, x["est_seconds"] - (now - (x["started"] or now))) for x in running) + sum(x["est_seconds"] for x in ahead)
            return {"position": len(ahead) + 1, "wait_seconds": max(1, round(busy / slots))}

    def _org_running(self, org: str) -> int:
        return self._db.execute("SELECT COUNT(*) FROM queue WHERE org=? AND status='running'", (org,)).fetchone()[0]

    # ------------------------------------------------------------------ changing
    def submit(self, job_id: str, org: str, mode: str, lane: str, names: list[str], paths: list[str], pages: int = 0,
               est_seconds: float = 0, created: float | None = None) -> None:
        now = time.time()
        with self._lock:
            self._db.execute("INSERT OR REPLACE INTO queue(job_id, org, mode, lane, status, names, paths, pages, est_seconds, created, queued_at) "
                             "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                             (job_id, org, mode, lane, "queued", json.dumps(names), json.dumps([str(p) for p in paths]), pages, est_seconds,
                              created or now, now))
            self._db.commit()
        self._wake.set()

    def cancel(self, job_id: str) -> str | None:
        """Queued: cancelled at once. Running: asked to stop at the next safe point. Returns the new state, or None."""
        with self._lock:
            j = self.get(job_id)
            if not j:
                return None
            if j["status"] == "queued":
                self._db.execute("UPDATE queue SET status='cancelled', finished=?, error=? WHERE job_id=?", (time.time(), "Cancelled before it started", job_id))
                self._db.commit()
                return "cancelled"
            if j["status"] == "running":
                self._db.execute("UPDATE queue SET cancel_requested=1 WHERE job_id=?", (job_id,))
                self._db.commit()
                if job_id in self._cancel:
                    self._cancel[job_id].set()
                return "cancelling"
            return j["status"]

    def retry(self, job_id: str) -> bool:
        with self._lock:
            j = self.get(job_id)
            if not j or j["status"] not in RETRYABLE:
                return False
            self._db.execute("UPDATE queue SET status='queued', queued_at=?, started=NULL, finished=NULL, error=NULL, cancel_requested=0, "
                             "credits=0, attempts=attempts+1 WHERE job_id=?", (time.time(), job_id))
            self._db.commit()
        self._wake.set()
        return True

    def remove(self, job_id: str) -> None:
        self.cancel(job_id)
        with self._lock:
            self._db.execute("DELETE FROM queue WHERE job_id=? AND status!='running'", (job_id,))
            self._db.commit()

    def set_credits(self, job_id: str, credits: float) -> None:
        with self._lock:
            self._db.execute("UPDATE queue SET credits=? WHERE job_id=?", (credits, job_id))
            self._db.commit()

    def recover(self) -> list[dict]:
        """Call once at startup, before start(): jobs that were running when the server stopped become 'interrupted'.
        Queued jobs stay queued (their files are on disk) and simply start again. Returns the interrupted jobs
        so the caller can record the credits they had already spent."""
        with self._lock:
            lost = self.all(states=("running",))
            self._db.execute("UPDATE queue SET status='interrupted', finished=?, error=? WHERE status='running'",
                             (time.time(), "The server restarted while this was running. Retry to run it again."))
            self._db.commit()
        return lost

    # ------------------------------------------------------------------ scheduling
    def dispatch_once(self) -> int:
        """Start every queued job that fits a free slot. Returns how many were started."""
        started = 0
        with self._lock:
            running = self.all(states=("running",))
            used = {k: sum(1 for x in running if x["lane"] == k) for k in self.slots}
            per_org: dict[str, int] = {}
            for x in running:
                per_org[x["org"]] = per_org.get(x["org"], 0) + 1
            for j in self.all(states=("queued",)):                                    # oldest first
                if used.get(j["lane"], 0) >= self.slots.get(j["lane"], 1) or per_org.get(j["org"], 0) >= self.per_org:
                    continue
                self._db.execute("UPDATE queue SET status='running', started=?, error=NULL WHERE job_id=? AND status='queued'", (time.time(), j["job_id"]))
                self._db.commit()
                used[j["lane"]] = used.get(j["lane"], 0) + 1
                per_org[j["org"]] = per_org.get(j["org"], 0) + 1
                ev = self._cancel[j["job_id"]] = threading.Event()
                t = threading.Thread(target=self._execute, args=(j, ev), daemon=True, name=f"job-{j['job_id']}")
                self._workers.append(t)
                t.start()
                started += 1
        return started

    def _execute(self, job: dict, cancel: threading.Event) -> None:
        try:
            res = self.runner(job, cancel, lambda c: self.set_credits(job["job_id"], c)) or {}
            status, error, credits = res.get("status", "done"), res.get("error"), res.get("credits")
        except Exception as e:                                                       # the runner should not raise; be safe
            status, error, credits = "failed", f"{type(e).__name__}: {e}", None
        with self._lock:
            self._db.execute("UPDATE queue SET status=?, finished=?, error=?, credits=COALESCE(?, credits) WHERE job_id=?",
                             (status, time.time(), error, credits, job["job_id"]))
            self._db.commit()
            self._cancel.pop(job["job_id"], None)
        self._wake.set()

    def _loop(self) -> None:
        while not self._stop.is_set():
            self.dispatch_once()
            self._wake.wait(self.poll)
            self._wake.clear()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="job-queue")
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()

    def wait_idle(self, timeout: float = 5.0) -> bool:
        """Mostly for tests: wait until nothing is queued or running."""
        end = time.time() + timeout
        while time.time() < end:
            if not self.all(states=ACTIVE):
                return True
            self.dispatch_once()
            time.sleep(0.02)
        return False
