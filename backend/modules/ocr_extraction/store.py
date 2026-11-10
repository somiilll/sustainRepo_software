"""MongoDB implementations of the extractor's storage classes (same methods as the SQLite reference ones).

Sync pymongo is used on purpose: the engine and job queue run on worker threads. Every record carries `org`.
"""
from __future__ import annotations

import io
import json
import os
import socket
import threading
import time
import uuid

import certifi
import gridfs
from pymongo import ASCENDING, DESCENDING, MongoClient, ReturnDocument

_url, _name = os.environ["MONGO_URL"], os.environ["DB_NAME"]
_client = MongoClient(_url, tlsCAFile=certifi.where()) if _url.startswith("mongodb+srv://") else MongoClient(_url)
DB = _client[_name]
_NOID = {"_id": 0}
INSTANCE = f"{socket.gethostname()}-{os.getpid()}-{uuid.uuid4().hex[:6]}"


def ensure_indexes() -> None:
    DB.ocr_ext_decisions.create_index([("org", ASCENDING), ("key", ASCENDING)], unique=True)
    DB.ocr_ext_decisions.create_index([("org", ASCENDING), ("updated", DESCENDING)])
    DB.ocr_ext_layouts.create_index([("org", ASCENDING), ("fingerprint", ASCENDING)], unique=True)
    DB.ocr_ext_seen_docs.create_index([("org", ASCENDING), ("doc_key", ASCENDING)], unique=True)
    DB.ocr_ext_facility_aliases.create_index([("org", ASCENDING), ("alias", ASCENDING)], unique=True)
    DB.ocr_ext_history.create_index([("org", ASCENDING), ("key", ASCENDING), ("period", DESCENDING)])
    DB.ocr_ext_usage_events.create_index([("org", ASCENDING), ("ts", ASCENDING)])
    DB.ocr_ext_usage_events.create_index([("org", ASCENDING), ("job_id", ASCENDING)])
    DB.ocr_ext_credit_grants.create_index([("org", ASCENDING), ("ts", DESCENDING)])
    DB.ocr_ext_audit.create_index([("org", ASCENDING), ("job_id", ASCENDING), ("ts", DESCENDING)])
    DB.ocr_ext_queue.create_index([("job_id", ASCENDING)], unique=True)
    DB.ocr_ext_queue.create_index([("status", ASCENDING), ("queued_at", ASCENDING)])
    DB.ocr_ext_jobs.create_index([("org", ASCENDING), ("created", DESCENDING)])
    DB.ocr_ext_jobs.create_index([("job_id", ASCENDING)], unique=True)


class MongoMemory:
    def __init__(self):
        self._lock = threading.Lock()

    def get_decision(self, org, key):
        d = DB.ocr_ext_decisions.find_one({"org": org, "key": key}, _NOID)
        return {"activity_id": d["activity_id"], "context": d.get("context") or {}, "source": d["source"], "hits": d.get("hits", 1)} if d else None

    def save_decision(self, org, key, activity_id, context, source):
        with self._lock:
            cur = DB.ocr_ext_decisions.find_one({"org": org, "key": key}, {"source": 1})
            now = time.time()
            if cur and cur["source"] == "user" and source != "user":
                DB.ocr_ext_decisions.update_one({"org": org, "key": key}, {"$inc": {"hits": 1}, "$set": {"updated": now}})
            else:
                DB.ocr_ext_decisions.update_one({"org": org, "key": key}, {"$set": {"activity_id": activity_id, "context": context or {},
                                                "source": source, "updated": now}, "$inc": {"hits": 1}}, upsert=True)

    def list_decisions(self, org, limit=500):
        cur = DB.ocr_ext_decisions.find({"org": org}, _NOID).sort("updated", DESCENDING).limit(limit)
        return [{"key": d["key"], "activity_id": d["activity_id"], "context": d.get("context") or {}, "source": d["source"],
                 "hits": d.get("hits", 1), "updated": d.get("updated")} for d in cur]

    def delete_decision(self, org, key):
        return DB.ocr_ext_decisions.delete_one({"org": org, "key": key}).deleted_count > 0

    def delete_all_decisions(self, org):
        DB.ocr_ext_decisions.delete_many({"org": org})

    def set_decision(self, org, key, activity_id, context=None):
        return DB.ocr_ext_decisions.update_one({"org": org, "key": key}, {"$set": {"activity_id": activity_id, "context": context or {},
                                               "source": "user", "updated": time.time()}}).matched_count > 0

    def confirm(self, org, key, activity_id):
        return DB.ocr_ext_decisions.update_one({"org": org, "key": key, "source": "auto", "activity_id": activity_id},
                                               {"$set": {"source": "user"}}).matched_count > 0

    def share_with_all_vendors(self, org, key):
        if not key.startswith("x:"):
            return None
        d = self.get_decision(org, key)
        if not d:
            return None
        desc, dim, _vendor = (key[2:].split("|") + ["", "", ""])[:3]
        new = f"d:{desc}|{dim}"
        DB.ocr_ext_decisions.update_one({"org": org, "key": new}, {"$set": {"activity_id": d["activity_id"], "context": d["context"],
                                        "source": "user", "updated": time.time()}, "$setOnInsert": {"hits": 0}}, upsert=True)
        return new

    def add_history(self, org, key, period, quantity, unit, job_id, row_id):
        DB.ocr_ext_history.update_one({"org": org, "key": key, "period": period, "job_id": job_id, "row_id": row_id},
                                      {"$set": {"quantity": quantity, "unit": unit}}, upsert=True)

    def get_history(self, org, key, limit=24):
        cur = DB.ocr_ext_history.find({"org": org, "key": key}, _NOID).sort("period", DESCENDING).limit(limit)
        return [(d["period"], d["quantity"], d.get("unit")) for d in cur]

    @staticmethod
    def _alias(name):
        return " ".join(str(name).lower().split())

    def get_facility_alias(self, org, name):
        d = DB.ocr_ext_facility_aliases.find_one({"org": org, "alias": self._alias(name)})
        return d["facility_id"] if d else None

    def save_facility_alias(self, org, name, facility_id):
        q = {"org": org, "alias": self._alias(name)}
        if facility_id:
            DB.ocr_ext_facility_aliases.update_one(q, {"$set": {"facility_id": facility_id}}, upsert=True)
        else:
            DB.ocr_ext_facility_aliases.delete_one(q)

    def get_layout(self, org, fingerprint):
        d = DB.ocr_ext_layouts.find_one({"org": org, "fingerprint": fingerprint})
        return json.loads(d["spec"]) if d else None

    def save_layout(self, org, fingerprint, spec):
        DB.ocr_ext_layouts.update_one({"org": org, "fingerprint": fingerprint},
                                      {"$set": {"spec": json.dumps(spec), "updated": time.time()}}, upsert=True)

    def seen(self, org, doc_key):
        d = DB.ocr_ext_seen_docs.find_one({"org": org, "doc_key": doc_key})
        return {"file_name": d["file_name"], "job_id": d["job_id"], "seen_at": d["seen_at"]} if d else None

    def mark_seen(self, org, doc_key, file_name, job_id):
        DB.ocr_ext_seen_docs.update_one({"org": org, "doc_key": doc_key},
                                        {"$setOnInsert": {"file_name": file_name, "job_id": job_id, "seen_at": time.time()}}, upsert=True)

    def stats(self, org):
        return {"decisions": DB.ocr_ext_decisions.count_documents({"org": org}),
                "user_corrections": DB.ocr_ext_decisions.count_documents({"org": org, "source": "user"}),
                "layouts": DB.ocr_ext_layouts.count_documents({"org": org})}


class MongoAudit:
    def record(self, org, job_id, action, actor="reviewer", item_id=None, row_id=None, label=None, changes=None, note=None, ts=None):
        DB.ocr_ext_audit.insert_one({"ts": ts or time.time(), "org": org, "job_id": job_id, "item_id": item_id, "row_id": row_id,
                                     "label": label, "action": action, "actor": actor, "changes": json.loads(json.dumps(changes or {}, default=str)),
                                     "note": note})

    @staticmethod
    def _out(cur):
        return [{**{k: v for k, v in d.items() if k != "_id"}, "id": str(d["_id"])} for d in cur]

    def for_item(self, org, job_id, item_id):
        return self._out(DB.ocr_ext_audit.find({"org": org, "job_id": job_id, "item_id": item_id}).sort("ts", DESCENDING))

    def for_job(self, org, job_id, limit=200):
        return self._out(DB.ocr_ext_audit.find({"org": org, "job_id": job_id}).sort("ts", DESCENDING).limit(limit))

    def recent(self, org, limit=200):
        return self._out(DB.ocr_ext_audit.find({"org": org}).sort("ts", DESCENDING).limit(limit))


class MongoLedger:
    def has_job(self, org, job_id):
        return DB.ocr_ext_usage_events.find_one({"org": org, "job_id": job_id}, {"_id": 1}) is not None

    def record(self, org, job_id, events, ts=None):
        ts = ts or time.time()
        if events:
            DB.ocr_ext_usage_events.insert_many([{**e, "org": org, "job_id": job_id, "ts": ts} for e in events])

    def grant(self, org, credits, note=""):
        DB.ocr_ext_credit_grants.insert_one({"org": org, "ts": time.time(), "credits": credits, "note": note})

    def forget_job(self, org, job_id):
        DB.ocr_ext_usage_events.delete_many({"org": org, "job_id": job_id})

    def balance(self, org):
        g = next(DB.ocr_ext_credit_grants.aggregate([{"$match": {"org": org}}, {"$group": {"_id": None, "c": {"$sum": "$credits"}}}]), {"c": 0})["c"]
        u = next(DB.ocr_ext_usage_events.aggregate([{"$match": {"org": org}}, {"$group": {"_id": None, "c": {"$sum": "$credits"}}}]), {"c": 0})["c"]
        return {"granted": round(g, 2), "used": round(u, 2), "remaining": round(g - u, 2)}

    def report(self, org, since):
        from extractor_core.usage import summarise
        events = list(DB.ocr_ext_usage_events.find({"org": org, "ts": {"$gte": since}}, _NOID).sort("ts", ASCENDING))
        by_day, by_job = {}, {}
        for e in events:
            d = time.strftime("%Y-%m-%d", time.localtime(e["ts"]))
            day = by_day.setdefault(d, {"credits": 0.0, "by_step": {}})
            day["credits"] = round(day["credits"] + e["credits"], 2)
            day["by_step"][e["step"]] = round(day["by_step"].get(e["step"], 0) + e["credits"], 2)
            j = by_job.setdefault(e["job_id"], {"job_id": e["job_id"], "ts": e["ts"], "credits": 0.0, "cost_usd": 0.0, "calls": 0})
            j["credits"] = round(j["credits"] + e["credits"], 2)
            j["cost_usd"] = round(j["cost_usd"] + e["cost_usd"], 6)
            j["calls"] += e["calls"] if e["ok"] else 0
        grants = [{"ts": g["ts"], "credits": g["credits"], "note": g.get("note", "")}
                  for g in DB.ocr_ext_credit_grants.find({"org": org}, _NOID).sort("ts", DESCENDING).limit(20)]
        return {"balance": self.balance(org), "summary": summarise(events), "by_day": by_day,
                "by_job": sorted(by_job.values(), key=lambda j: -j["ts"]), "grants": grants}


class JobStore:
    """Job summaries in `ocr_ext_jobs`; the full result (rows, items, decisions) in GridFS so size is never a limit."""

    def __init__(self):
        self.fs = gridfs.GridFS(DB, collection="ocr_ext_results")

    def write(self, org: str, job: dict) -> None:
        blob = json.dumps(job, default=str).encode("utf-8")
        for old in self.fs.find({"filename": job["job_id"]}):
            self.fs.delete(old._id)
        self.fs.put(io.BytesIO(blob), filename=job["job_id"], org=org)

    def read(self, org: str, job_id: str) -> dict | None:
        f = self.fs.find_one({"filename": job_id, "org": org})
        return json.loads(f.read().decode("utf-8")) if f else None

    def delete(self, job_id: str) -> None:
        for old in self.fs.find({"filename": job_id}):
            self.fs.delete(old._id)


class MongoJobQueue:
    """Same behaviour as extractor_core.jobqueue.JobQueue, on the shared database so every pod sees one queue."""
    ACTIVE = ("queued", "running")
    RETRYABLE = ("failed", "cancelled", "interrupted")

    def __init__(self, runner, heavy_slots=3, light_slots=2, per_org=2, poll=0.7):
        self.runner, self.slots, self.per_org, self.poll = runner, {"heavy": heavy_slots, "light": light_slots}, per_org, poll
        self._cancel: dict[str, threading.Event] = {}
        self._wake, self._stop = threading.Event(), threading.Event()
        self._thread: threading.Thread | None = None

    @property
    def col(self):
        return DB.ocr_ext_queue

    def get(self, job_id):
        return self.col.find_one({"job_id": job_id}, _NOID)

    def all(self, org=None, states=None):
        q = {}
        if org:
            q["org"] = org
        if states:
            q["status"] = {"$in": list(states)}
        return list(self.col.find(q, _NOID).sort("queued_at", ASCENDING))

    def wait_info(self, job_id):
        j = self.get(job_id)
        if not j or j["status"] != "queued":
            return {"position": 0, "wait_seconds": 0}
        now = time.time()
        running = [x for x in self.all(states=("running",)) if x["lane"] == j["lane"]]
        ahead = [x for x in self.all(states=("queued",)) if x["lane"] == j["lane"] and (x["queued_at"], x["job_id"]) < (j["queued_at"], j["job_id"])]
        slots = max(1, self.slots[j["lane"]])
        org_running = sum(1 for x in self.all(states=("running",)) if x["org"] == j["org"])
        if slots - len(running) > len(ahead) and org_running < self.per_org:
            return {"position": len(ahead) + 1, "wait_seconds": 0}
        busy = sum(max(0.0, x["est_seconds"] - (now - (x.get("started") or now))) for x in running) + sum(x["est_seconds"] for x in ahead)
        return {"position": len(ahead) + 1, "wait_seconds": max(1, round(busy / slots))}

    def submit(self, job_id, org, mode, lane, names, paths, pages=0, est_seconds=0, created=None):
        now = time.time()
        self.col.replace_one({"job_id": job_id}, {"job_id": job_id, "org": org, "mode": mode, "lane": lane, "status": "queued", "names": names,
                             "paths": [str(p) for p in paths], "pages": pages, "est_seconds": est_seconds, "created": created or now,
                             "queued_at": now, "started": None, "finished": None, "error": None, "credits": 0, "attempts": 1,
                             "cancel_requested": False}, upsert=True)
        self._wake.set()

    def cancel(self, job_id):
        j = self.get(job_id)
        if not j:
            return None
        if j["status"] == "queued":
            self.col.update_one({"job_id": job_id, "status": "queued"}, {"$set": {"status": "cancelled", "finished": time.time(), "error": "Cancelled before it started"}})
            return "cancelled"
        if j["status"] == "running":
            self.col.update_one({"job_id": job_id}, {"$set": {"cancel_requested": True}})
            if job_id in self._cancel:
                self._cancel[job_id].set()
            return "cancelling"
        return j["status"]

    def retry(self, job_id):
        j = self.get(job_id)
        if not j or j["status"] not in self.RETRYABLE:
            return False
        self.col.update_one({"job_id": job_id}, {"$set": {"status": "queued", "queued_at": time.time(), "started": None, "finished": None, "error": None,
                            "cancel_requested": False, "credits": 0}, "$inc": {"attempts": 1}})
        self._wake.set()
        return True

    def remove(self, job_id):
        self.cancel(job_id)
        self.col.delete_one({"job_id": job_id, "status": {"$ne": "running"}})

    def set_credits(self, job_id, credits):
        self.col.update_one({"job_id": job_id}, {"$set": {"credits": credits}})

    def recover(self):
        """Jobs this server was running when it stopped become 'interrupted'; returns them so their spend can be recorded."""
        stale_before = time.time() - 6 * 3600
        q = {"status": "running", "$or": [{"instance": {"$regex": f"^{socket.gethostname()}-"}}, {"started": {"$lt": stale_before}}]}
        lost = list(self.col.find(q, _NOID))
        self.col.update_many(q, {"$set": {"status": "interrupted", "finished": time.time(),
                                          "error": "The server restarted while this was running. Retry to run it again."}})
        return lost

    def dispatch_once(self):
        started = 0
        running = self.all(states=("running",))
        used = {k: sum(1 for x in running if x["lane"] == k) for k in self.slots}
        per_org: dict[str, int] = {}
        for x in running:
            per_org[x["org"]] = per_org.get(x["org"], 0) + 1
        for j in self.all(states=("queued",)):
            if used.get(j["lane"], 0) >= self.slots.get(j["lane"], 1) or per_org.get(j["org"], 0) >= self.per_org:
                continue
            claimed = self.col.find_one_and_update({"job_id": j["job_id"], "status": "queued"},
                                                   {"$set": {"status": "running", "started": time.time(), "error": None, "instance": INSTANCE}},
                                                   projection=_NOID, return_document=ReturnDocument.AFTER)
            if not claimed:
                continue
            used[j["lane"]] = used.get(j["lane"], 0) + 1
            per_org[j["org"]] = per_org.get(j["org"], 0) + 1
            ev = self._cancel[j["job_id"]] = threading.Event()
            threading.Thread(target=self._execute, args=(claimed, ev), daemon=True, name=f"ocr-job-{j['job_id']}").start()
            started += 1
        return started

    def _watch_cancel(self, job_id, ev, done: threading.Event):
        while not done.wait(2.0):
            j = self.get(job_id)
            if j and j.get("cancel_requested"):
                ev.set()
                return

    def _execute(self, job, cancel):
        done = threading.Event()
        threading.Thread(target=self._watch_cancel, args=(job["job_id"], cancel, done), daemon=True).start()
        try:
            res = self.runner(job, cancel, lambda c: self.set_credits(job["job_id"], c)) or {}
            status, error, credits = res.get("status", "done"), res.get("error"), res.get("credits")
        except Exception as e:  # noqa: BLE001
            status, error, credits = "failed", f"{type(e).__name__}: {e}", None
        done.set()
        upd = {"status": status, "finished": time.time(), "error": error}
        if credits is not None:
            upd["credits"] = credits
        self.col.update_one({"job_id": job["job_id"]}, {"$set": upd})
        self._cancel.pop(job["job_id"], None)
        self._wake.set()

    def _loop(self):
        while not self._stop.is_set():
            try:
                self.dispatch_once()
            except Exception:  # noqa: BLE001
                pass
            self._wake.wait(self.poll)
            self._wake.clear()

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="ocr-job-queue")
        self._thread.start()
