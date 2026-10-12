from modules.ocr_invoice.companion_rows import build_companion_rows


def test_electricity_creates_only_td_scope3_companion():
    rows = build_companion_rows({
        "auto_generate_cat3": True,
        "scope": "scope2",
        "category": "Purchased electricity",
        "subcategory": "Electricity - Non-Renewable",
    })

    assert len(rows) == 1
    assert rows[0]["scope"] == "scope3"
    assert rows[0]["subcategory"] == "Electricity - T&D losses and Generation"
    assert rows[0]["subcategory"] != "Coal (electricity generation)"


def test_renewable_electricity_creates_no_scope3_companion():
    rows = build_companion_rows({
        "auto_generate_cat3": True,
        "scope": "scope2",
        "category": "Purchased electricity",
        "subcategory": "Electricity - Renewable",
    })

    assert rows == []