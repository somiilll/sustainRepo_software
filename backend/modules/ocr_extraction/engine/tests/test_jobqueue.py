"""Job queue: lanes, per-customer cap, cancel, retry and restart recovery (fake runner, no AI)."""
from __future__ import annotations

import threading
import time

from extractor_core.jobqueue import JobQueue


def make(tmp_path, runner=None, **kw):
    started, gate = [], threading.Event()

    def default(job, cancel, set_credits):
        started.append(job["job_id"])
        set_credits(1.5)
        gate.wait(5)                                       # hold the slot until the test opens the gate
        return {"status": "cancelled" if cancel.is_set() else "done", "credits": 2.0}
    q = JobQueue(tmp_path / "q.db", runner or default, **kw)
    return q, started, gate


def submit(q, jid, lane="heavy", org="o1"):
    q.submit(jid, org, "fast", lane, [jid + ".pdf"], ["/x/" + jid], pages=1, est_seconds=10)


def settle():
    time.sleep(0.15)


def test_jobs_run_up_to_the_lane_limit_and_the_rest_wait_in_order(tmp_path):
    q, started, gate = make(tmp_path, heavy_slots=2, per_org=9)
    for j in "abcd":
        submit(q, j)
        time.sleep(0.01)
    assert q.dispatch_once() == 2 and q.get("c")["status"] == "queued"
    settle()
    assert started == ["a", "b"]
    info = q.wait_info("d")
    assert info["position"] == 2 and info["wait_seconds"] > 0 and q.wait_info("c")["position"] == 1
    gate.set()
    assert q.wait_idle() and started == ["a", "b", "c", "d"]
    assert q.get("a")["status"] == "done" and q.get("a")["credits"] == 2.0


def test_a_spreadsheet_job_is_not_stuck_behind_pdfs(tmp_path):
    q, started, gate = make(tmp_path, heavy_slots=1, light_slots=1, per_org=9)
    submit(q, "pdf1"); submit(q, "pdf2"); submit(q, "xls", lane="light")
    q.dispatch_once(); settle()
    assert set(started) == {"pdf1", "xls"} and q.get("pdf2")["status"] == "queued"
    gate.set(); q.wait_idle()


def test_one_customer_cannot_take_every_slot(tmp_path):
    q, started, gate = make(tmp_path, heavy_slots=3, per_org=1)
    submit(q, "a1", org="A"); submit(q, "a2", org="A"); submit(q, "b1", org="B")
    q.dispatch_once(); settle()
    assert set(started) == {"a1", "b1"} and q.get("a2")["status"] == "queued"
    gate.set(); q.wait_idle()


def test_cancel_queued_is_immediate_and_cancel_running_stops_at_the_next_safe_point(tmp_path):
    q, started, gate = make(tmp_path, heavy_slots=1, per_org=9)
    submit(q, "run"); submit(q, "wait")
    q.dispatch_once(); settle()
    assert q.cancel("wait") == "cancelled" and q.get("wait")["status"] == "cancelled"
    assert q.cancel("run") == "cancelling" and q.get("run")["cancel_requested"]
    gate.set()
    assert q.wait_idle() and q.get("run")["status"] == "cancelled"
    assert q.cancel("nope") is None


def test_retry_puts_a_failed_job_back_in_line(tmp_path):
    q, started, gate = make(tmp_path, runner=lambda job, c, s: {"status": "failed", "error": "No credits left"})
    submit(q, "j")
    q.dispatch_once(); assert q.wait_idle()
    assert q.get("j")["status"] == "failed" and q.get("j")["error"] == "No credits left"
    assert q.retry("j") and q.get("j")["attempts"] == 2 and q.get("j")["status"] == "queued"
    assert not q.retry("missing")


def test_a_crashing_runner_marks_the_job_failed_not_stuck_running(tmp_path):
    def boom(job, c, s):
        raise RuntimeError("kaboom")
    q, *_ = make(tmp_path, runner=boom)
    submit(q, "j"); q.dispatch_once(); assert q.wait_idle()
    assert q.get("j")["status"] == "failed" and "kaboom" in q.get("j")["error"]


def test_restart_marks_running_jobs_interrupted_and_keeps_queued_ones(tmp_path):
    q, started, gate = make(tmp_path, heavy_slots=1, per_org=9)
    submit(q, "run"); submit(q, "wait")
    q.dispatch_once(); settle()
    gate.set(); gate.clear()
    # simulate a crash: a fresh queue object over the same file (the old thread's result is ignored)
    q2 = JobQueue(tmp_path / "q.db", lambda *a: {"status": "done"}, heavy_slots=1, per_org=9)
    q2._db.execute("UPDATE queue SET status='running', credits=1.5 WHERE job_id='run'"); q2._db.commit()
    lost = q2.recover()
    assert [j["job_id"] for j in lost] == ["run"] and lost[0]["credits"] == 1.5
    assert q2.get("run")["status"] == "interrupted" and q2.get("wait")["status"] == "queued"
    assert q2.retry("run")
    gate.set()
