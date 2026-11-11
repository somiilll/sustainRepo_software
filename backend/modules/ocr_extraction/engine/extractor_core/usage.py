"""Normalised AI usage and credits.

Every AI call, whatever the provider (Claude tokens, Jev's reported cost, a per-call price), becomes one usage
event with the same fields:

    {step, provider, model, calls, input_tokens, output_tokens, seconds, cost_usd, cost_basis, estimated, credits}

Prices live in mappings/pricing.json, so a new model or provider is a JSON entry, not code. `Ledger` keeps the
events per organisation (SQLite here; Emergent can keep the same rows in Mongo) together with credit grants, which
gives the balance, the usage per day, per step, per model and per job.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path

from .config import MAPPINGS

_PRICING: dict | None = None


def pricing() -> dict:
    global _PRICING
    if _PRICING is None:
        _PRICING = json.loads((MAPPINGS / "pricing.json").read_text(encoding="utf-8"))
    return _PRICING


def to_credits(cost_usd: float) -> float:
    c = pricing()["credit"]
    return round(cost_usd * c.get("markup", 1.0) / c["usd_per_credit"], c.get("round_to", 2))


def price(provider: str, model: str | None, input_tokens: int = 0, output_tokens: int = 0,
          reported_usd: float | None = None, calls: int = 1) -> tuple[float, str, bool]:
    """(cost in USD, basis used, estimated?) for one call (or `calls` identical calls)."""
    p = pricing()
    rate = p["models"].get(f"{provider}:{model}")
    est = False
    if rate is None:
        rate, est = p["default"], True
    est = est or bool(rate.get("estimated"))
    basis = rate["basis"]
    if basis == "reported":
        if reported_usd:
            return float(reported_usd), "reported", est
        return rate.get("fallback_per_call", 0.0) * calls, "per_call", True
    if basis == "per_call":
        return rate["per_call"] * calls, "per_call", est
    r = rate
    lc = rate.get("long_context")
    if lc and input_tokens / max(calls, 1) > lc["above_input_tokens"]:
        r = lc
    cost = (input_tokens * r["input_per_mtok"] + output_tokens * r["output_per_mtok"]) / 1_000_000
    return cost, "tokens", est


def event(step: str, provider: str, model: str | None, input_tokens: int = 0, output_tokens: int = 0,
          seconds: float = 0.0, reported_usd: float | None = None, calls: int = 1, ok: bool = True) -> dict:
    cost, basis, est = price(provider, model, input_tokens, output_tokens, reported_usd, calls) if ok else (0.0, "failed", False)
    return {"step": step, "provider": provider, "model": model, "calls": calls, "ok": ok,
            "input_tokens": int(input_tokens or 0), "output_tokens": int(output_tokens or 0), "seconds": round(seconds or 0, 3),
            "cost_usd": round(cost, 6), "cost_basis": basis, "estimated": est, "credits": to_credits(cost)}


def from_llm_call(c: dict) -> dict:
    """An OpenAI/Claude call recorded by extract.py / layout.py / rowscan.py."""
    return event(c.get("step", "extract"), {"claude": "anthropic"}.get(c.get("provider"), c.get("provider") or "anthropic"), c.get("model"), c.get("input_tokens", 0), c.get("output_tokens", 0),
                 c.get("seconds", 0))


def from_classifier_call(c: dict) -> dict:
    """A classifier call recorded by decider/cascade.py (successful or failed)."""
    from .config import load
    pol = load().policy
    name = c.get("provider", "?")
    provider = pricing()["providers"].get(name, name)
    model = c.get("model") or {"jev": pol["jev"]["model"], "openai_decisions": pol["openai_decisions"]["model"],
                               "claude": pol["models"]["classify_fallback"]}.get(name)
    return event("classify", provider, model, c.get("input_tokens", 0), c.get("output_tokens", 0), c.get("seconds", 0),
                 c.get("cost_usd"), ok="error" not in c)


def summarise(events: list[dict]) -> dict:
    """Totals plus breakdowns by step and by provider:model."""
    def blank():
        return {"calls": 0, "failed": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0, "credits": 0.0, "estimated": False}

    def add(b, e):
        b["calls"] += e["calls"] if e["ok"] else 0
        b["failed"] += 0 if e["ok"] else e["calls"]
        b["input_tokens"] += e["input_tokens"]
        b["output_tokens"] += e["output_tokens"]
        b["cost_usd"] += e["cost_usd"]
        b["credits"] += e["credits"]
        b["estimated"] = b["estimated"] or e["estimated"]

    tot, by_step, by_model = blank(), {}, {}
    for e in events:
        add(tot, e)
        add(by_step.setdefault(e["step"], blank()), e)
        add(by_model.setdefault(f"{e['provider']}:{e['model']}", blank()), e)
    for b in [tot, *by_step.values(), *by_model.values()]:
        b["cost_usd"] = round(b["cost_usd"], 6)
        b["credits"] = round(b["credits"], 2)
    return {"total": tot, "by_step": by_step, "by_model": by_model}


class Ledger:
    """Usage events and credit grants per organisation."""

    def __init__(self, path: str | Path):
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._lock = threading.Lock()
        self._db.executescript("""
            CREATE TABLE IF NOT EXISTS usage_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT, org TEXT, job_id TEXT, ts REAL, step TEXT, provider TEXT, model TEXT,
                calls INTEGER, ok INTEGER, input_tokens INTEGER, output_tokens INTEGER, seconds REAL, cost_usd REAL,
                cost_basis TEXT, estimated INTEGER, credits REAL);
            CREATE INDEX IF NOT EXISTS ix_usage_org_ts ON usage_events(org, ts);
            CREATE TABLE IF NOT EXISTS credit_grants (id INTEGER PRIMARY KEY AUTOINCREMENT, org TEXT, ts REAL, credits REAL, note TEXT);
        """)

    def has_job(self, org: str, job_id: str) -> bool:
        return self._db.execute("SELECT 1 FROM usage_events WHERE org=? AND job_id=? LIMIT 1", (org, job_id)).fetchone() is not None

    def record(self, org: str, job_id: str, events: list[dict], ts: float | None = None) -> None:
        ts = ts or time.time()
        with self._lock:
            self._db.executemany(
                "INSERT INTO usage_events (org, job_id, ts, step, provider, model, calls, ok, input_tokens, output_tokens, seconds,"
                " cost_usd, cost_basis, estimated, credits) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                [(org, job_id, ts, e["step"], e["provider"], e["model"], e["calls"], int(e["ok"]), e["input_tokens"], e["output_tokens"],
                  e["seconds"], e["cost_usd"], e["cost_basis"], int(e["estimated"]), e["credits"]) for e in events])
            self._db.commit()

    def grant(self, org: str, credits: float, note: str = "") -> None:
        with self._lock:
            self._db.execute("INSERT INTO credit_grants (org, ts, credits, note) VALUES (?,?,?,?)", (org, time.time(), credits, note))
            self._db.commit()

    def forget_job(self, org: str, job_id: str) -> None:
        """Deleting a job keeps its usage (it was spent); kept for tests and resets."""
        with self._lock:
            self._db.execute("DELETE FROM usage_events WHERE org=? AND job_id=?", (org, job_id))
            self._db.commit()

    def balance(self, org: str) -> dict:
        granted = self._db.execute("SELECT COALESCE(SUM(credits),0) FROM credit_grants WHERE org=?", (org,)).fetchone()[0]
        used = self._db.execute("SELECT COALESCE(SUM(credits),0) FROM usage_events WHERE org=?", (org,)).fetchone()[0]
        return {"granted": round(granted, 2), "used": round(used, 2), "remaining": round(granted - used, 2)}

    def report(self, org: str, since: float) -> dict:
        q = self._db.execute(
            "SELECT job_id, ts, step, provider, model, calls, ok, input_tokens, output_tokens, seconds, cost_usd, cost_basis, estimated,"
            " credits FROM usage_events WHERE org=? AND ts>=? ORDER BY ts", (org, since)).fetchall()
        cols = ["job_id", "ts", "step", "provider", "model", "calls", "ok", "input_tokens", "output_tokens", "seconds", "cost_usd",
                "cost_basis", "estimated", "credits"]
        events = [dict(zip(cols, r)) for r in q]
        for e in events:
            e["ok"], e["estimated"] = bool(e["ok"]), bool(e["estimated"])
        by_day: dict[str, dict] = {}
        by_job: dict[str, dict] = {}
        for e in events:
            d = time.strftime("%Y-%m-%d", time.localtime(e["ts"]))
            day = by_day.setdefault(d, {"credits": 0.0, "by_step": {}})
            day["credits"] = round(day["credits"] + e["credits"], 2)
            day["by_step"][e["step"]] = round(day["by_step"].get(e["step"], 0) + e["credits"], 2)
            j = by_job.setdefault(e["job_id"], {"job_id": e["job_id"], "ts": e["ts"], "credits": 0.0, "cost_usd": 0.0, "calls": 0})
            j["credits"] = round(j["credits"] + e["credits"], 2)
            j["cost_usd"] = round(j["cost_usd"] + e["cost_usd"], 6)
            j["calls"] += e["calls"] if e["ok"] else 0
        grants = [{"ts": r[0], "credits": r[1], "note": r[2]} for r in
                  self._db.execute("SELECT ts, credits, note FROM credit_grants WHERE org=? ORDER BY ts DESC LIMIT 20", (org,))]
        return {"balance": self.balance(org), "summary": summarise(events), "by_day": by_day,
                "by_job": sorted(by_job.values(), key=lambda j: -j["ts"]), "grants": grants}
