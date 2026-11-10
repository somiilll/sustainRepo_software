"""Credits: every provider's call becomes the same kind of usage event."""
from extractor_core import usage


def test_token_priced_model():
    e = usage.event("extract", "anthropic", "claude-haiku-5-5", input_tokens=10_000, output_tokens=2_000)
    assert abs(e["cost_usd"] - (10_000 * 0.10 + 2_000 * 0.50) / 1e6) < 1e-9
    assert e["credits"] == round(e["cost_usd"] / 0.001, 2)
    assert e["cost_basis"] == "tokens" and not e["estimated"]


def test_long_context_rate_applies_above_threshold():
    short = usage.event("extract", "anthropic", "claude-haiku-5-5", input_tokens=50_000)
    long_ = usage.event("extract", "anthropic", "claude-haiku-5-5", input_tokens=150_000)
    assert long_["cost_usd"] / 150_000 > short["cost_usd"] / 50_000


def test_reported_cost_wins_and_fallback_is_estimated():
    a = usage.from_classifier_call({"provider": "jev", "cost_usd": 0.0001, "seconds": 1.2})
    assert a["cost_usd"] == 0.0001 and a["cost_basis"] == "reported"
    b = usage.from_classifier_call({"provider": "jev", "seconds": 1.0})
    assert b["cost_basis"] == "per_call" and b["estimated"] and b["cost_usd"] > 0


def test_unknown_model_is_never_free():
    e = usage.event("classify", "newvendor", "model-x", input_tokens=1000, output_tokens=100)
    assert e["cost_usd"] > 0 and e["estimated"]


def test_failed_call_costs_nothing_and_is_counted():
    e = usage.from_classifier_call({"provider": "openai_decisions", "error": "HTTP 429"})
    s = usage.summarise([e])
    assert e["credits"] == 0 and s["total"]["failed"] == 1 and s["total"]["calls"] == 0


def test_ledger_balance_and_report(tmp_path):
    led = usage.Ledger(tmp_path / "u.db")
    led.grant("org", 1000, "trial")
    led.record("org", "job1", [usage.event("extract", "anthropic", "claude-sonnet-5-5", 100_000, 10_000)])
    b = led.balance("org")
    assert b["used"] == 300.0 and b["remaining"] == 700.0
    rep = led.report("org", 0)
    assert rep["by_job"][0]["job_id"] == "job1" and rep["summary"]["by_step"]["extract"]["credits"] == 300.0
