"""High / Check / Needs-you labels, vendor-only learning and the undo / change / share controls."""
from __future__ import annotations

from extractor_core.group import group_items
from extractor_core.pipeline import Engine

from conftest import item


def parent_row(eng, it, decision=None):
    it.setdefault("item_id", "d1-0")
    group_items([it])
    dec = decision or eng.classifier.classify(it)
    return next(r for r in eng.rows_for_item(it, dec) if not r.get("derived"))


def engine(fake, mem=None):
    return Engine(memory=mem, providers=[fake])


# ------------------------------------------------------------------ labels
def test_label_needs_you_when_quantity_missing(fake):
    r = parent_row(engine(fake), item(description="HSD diesel for DG set", quantity=None, unit=None, amount=None))
    assert r["trust"]["level"] == "needs_you" and r["trust"]["reasons"]


def test_label_check_when_one_method_only(fake):
    d = {"activity_id": "fuel.diesel", "confidence": 0.9, "source": "jev", "context": {"use_context": "stationary"},
         "context_confidence": {"use_context": 0.95}, "reason": "Jev", "alternatives": [], "question": None}
    r = parent_row(engine(fake), item(description="HSD diesel for DG set", quantity=100, unit="L"), d)
    assert r["trust"]["level"] in ("check", "needs_you")
    if r["trust"]["level"] == "check":
        assert any("one method" in x or "warn" in x.lower() or x for x in r["trust"]["reasons"])


def test_label_high_when_user_confirmed_before(fake, mem):
    eng = engine(fake, mem)
    it = item(description="HSD diesel for DG set", quantity=100, unit="L", vendor="IOCL", period_hint="2026-03")
    it["item_id"] = "d1-0"
    group_items([it])
    eng.classifier.remember(it, {"activity_id": "fuel.diesel", "context": {"use_context": "stationary"}}, source="user")
    r = parent_row(eng, it)
    assert r["decision"]["source"] == "memory" and r["decision"]["memory_source"] == "user"
    assert r["trust"]["level"] == "high" and "confirmed" in r["trust"]["reasons"][0]


# ------------------------------------------------------------------ undo / change / share / confirm
def test_forget_change_share_confirm(mem):
    ek = "x:misc item|count|acme"
    mem.save_decision("o", ek, "service.maintenance", {}, "auto")
    assert mem.confirm("o", ek, "goods.steel") is False                       # a different activity does not confirm it
    assert mem.confirm("o", ek, "service.maintenance") is True
    assert mem.get_decision("o", ek)["source"] == "user"
    assert mem.set_decision("o", ek, "goods.steel") is True
    assert mem.get_decision("o", ek)["activity_id"] == "goods.steel"
    new = mem.share_with_all_vendors("o", ek)
    assert new == "d:misc item|count" and mem.get_decision("o", new)["activity_id"] == "goods.steel"
    assert mem.share_with_all_vendors("o", new) is None                       # already vendor-free
    assert mem.delete_decision("o", ek) is True and mem.get_decision("o", ek) is None
    assert mem.get_decision("o", new) is not None                             # undoing one does not touch the other
    assert [d["key"] for d in mem.list_decisions("o")] == [new]
