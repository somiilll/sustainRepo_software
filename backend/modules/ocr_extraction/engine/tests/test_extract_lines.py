"""Invoice lines -> items: add-ons and taxes roll into the main lines by value, split parts carry the money once."""
from __future__ import annotations

import pytest

from extractor_core.extract import to_items

SRC = {"file": "inv.pdf", "kind": "document"}


def inv(lines, **totals):
    return {"document_type": "tax_invoice", "vendor_name": "V", "currency": "INR", "totals": totals, "line_items": lines, "evidence": []}


def test_gap_to_grand_total_is_shared_by_value():
    its = to_items(inv([{"description": "Road freight A", "nature": "freight", "amount": 30000, "printed_line": 1},
                        {"description": "Road freight B", "nature": "freight", "amount": 10000, "printed_line": 2}],
                       tax=1200, grand_total=46150), SRC, 0)
    assert [i["spend_amount"] for i in its] == [pytest.approx(34612.5), pytest.approx(11537.5)]
    assert sum(i["spend_amount"] for i in its) == pytest.approx(46150)
    assert [i["amount"] for i in its] == [30000, 10000]
    assert "6,150.00" in its[0]["spend_note"]


def test_add_on_lines_are_not_rows_and_their_money_is_kept():
    its = to_items(inv([{"description": "Flight DEL-BOM", "nature": "travel", "amount": 8000, "printed_line": 1},
                        {"description": "Seat selection", "nature": "service", "amount": 500, "add_on": True, "printed_line": 2},
                        {"description": "GST", "nature": "fee_or_tax", "amount": 450, "printed_line": 3}]), SRC, 0)
    assert len(its) == 1 and its[0]["source"]["line"] == 0
    assert its[0]["spend_amount"] == pytest.approx(8950)


def test_split_parts_of_one_printed_line_carry_the_money_once():
    its = to_items(inv([{"description": "Hazardous waste to TSDF", "nature": "waste", "quantity": 5, "unit": "MT", "amount": 12000, "printed_line": 1},
                        {"description": "Transport of hazardous waste", "nature": "freight", "quantity": 5, "unit": "MT", "amount": 12000, "printed_line": 1}],
                       grand_total=14160), SRC, 0)
    waste, freight = its
    assert waste["amount"] is None and waste["quantity"] == 5 and not waste["spend_note"]
    assert freight["amount"] == 12000 and freight["spend_amount"] == pytest.approx(14160)


def test_lines_that_already_add_up_are_left_alone():
    its = to_items(inv([{"description": "Diesel", "nature": "fuel", "quantity": 100, "unit": "L", "amount": 9000}], grand_total=9000), SRC, 0)
    assert its[0]["spend_amount"] == 9000 and its[0]["spend_note"] is None


def test_fee_only_document_keeps_its_lines():
    its = to_items(inv([{"description": "Consent fee", "nature": "fee_or_tax", "amount": 5000}], grand_total=5000), SRC, 0)
    assert len(its) == 1
