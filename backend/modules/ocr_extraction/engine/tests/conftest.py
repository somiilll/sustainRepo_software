"""Shared fixtures. No test calls a real API: providers are fakes, documents are built in memory."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from extractor_core.decider.base import Answer, Provider, ProviderError  # noqa: E402
from extractor_core.memory import Memory  # noqa: E402


class FakeProvider(Provider):
    """Answers from a lookup: the first keyword found in the state decides (domain, activity, use_context)."""

    def __init__(self, table: dict[str, tuple[str, str | None, str | None]], name="fake", fail=False, conf=0.97):
        self.table, self.name, self.fail, self.conf = table, name, fail, conf
        self.calls = 0

    def available(self):
        return True

    def decide(self, state, questions):
        self.calls += 1
        if self.fail:
            raise ProviderError("simulated timeout")
        low = state.lower()
        hit = next((v for k, v in self.table.items() if k in low), ("non_activity", None, None))
        dom, act, ctx = hit
        out = {}
        for q in questions:
            if q.name == "domain":
                out[q.name] = Answer(dom if dom in q.choices else next(iter(q.choices)), self.conf)
            elif q.name == "activity":
                out[q.name] = Answer(act if act in q.choices else next(iter(q.choices)), self.conf, {act: self.conf})
            elif q.name == "use_context":
                out[q.name] = Answer(ctx or "stationary_equipment", 0.9 if ctx else 0.3)
            else:
                out[q.name] = Answer(next(iter(q.choices)) if "unknown" not in q.choices else "unknown", 0.5)
        return out, {"provider": self.name, "cost_usd": 0.0}


FAKE_TABLE = {
    "diesel": ("fuel_combustion", "fuel.diesel", "stationary_equipment"),
    "electricity": ("electricity", "elec.grid", None),
    "steel": ("purchased_goods", "goods.steel", None),
    "freight": ("freight", "freight.road", None),
    "water": ("water", "water.municipal", None),
}


@pytest.fixture
def fake():
    return FakeProvider(FAKE_TABLE)


@pytest.fixture
def mem():
    return Memory()


@pytest.fixture
def facilities():
    return [{"id": "F1", "name": "Plant 1", "aliases": ["Chakan plant"], "consumer_numbers": ["177529058940"], "gstins": ["27AAAAA0000A1Z5"],
             "address_keywords": ["chakan"]},
            {"id": "F2", "name": "Plant 2", "aliases": [], "consumer_numbers": [], "gstins": [], "address_keywords": ["ranjangaon"]}]


def item(**kw):
    """A minimal extracted item, as extract.to_items / layout.apply_spec produce."""
    base = {"source": {"file": "t.xlsx", "kind": "sheet"}, "doc": {}, "description": None, "description_en": None, "hsn": None,
            "quantity": None, "unit": None, "amount": None, "currency": "INR", "nature": None, "vendor": None, "date": None,
            "period_start": None, "period_end": None, "period_hint": None, "facility_hint": None, "low_confidence_fields": [],
            "evidence": [], "notes": None, "line_confidence": 0.95}
    base.update(kw)
    if base["description_en"] is None:
        base["description_en"] = base["description"]
    return base
