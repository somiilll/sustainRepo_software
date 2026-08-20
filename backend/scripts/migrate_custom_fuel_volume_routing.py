"""Add volume-based Quantity Basis EF routing for Custom Fuel combustion."""

import asyncio

from calc_engine.formulas import create_formula, update_decision_tree
from shared.database.mongo import db


CREATED_BY = "custom-fuel-volume-routing-migration"
MASS_FORMULA_ID = "f863ca67-fc8a-42a8-96dd-3044bde9f57c"
VOLUME_FORMULA_NAME = "Custom Fuel - Quantity Basis Volume"
COMBUSTION_CODES = ["stationary_combustion", "mobile_combustion"]


def volume_formula_definition():
    return {
        "inputs": [
            {
                "variable": "qty",
                "expected_unit": "L",
                "required": True,
                "allow_dimension_conversion": True,
                "allowed_transformations": [],
            },
            {
                "variable": "ef_quantity",
                "expected_unit": "kgCO2/L",
                "required": True,
                "allow_dimension_conversion": True,
                "allowed_transformations": [],
            },
        ],
        "properties": [],
        "steps": [
            {"name": "co2", "type": "expression", "expression": "qty * ef_quantity / 1000"},
            {"name": "co2e", "type": "expression", "expression": "co2"},
        ],
        "outputs": [
            {"variable": "co2e", "unit": "tCO2e", "produced_by_step": "co2e"},
            {"variable": "co2", "unit": "tCO2", "produced_by_step": "co2"},
        ],
    }


def with_quantity_basis_routing(tree, volume_formula_id):
    options = tree["options"]
    quantity_branch = options.get("using_qty_basis_ef")
    existing_node = quantity_branch.get("next") if isinstance(quantity_branch, dict) else None
    if (
        existing_node
        and existing_node.get("field_name") == "ef_quantity_basis"
        and existing_node.get("options", {}).get("mass", {}).get("formula_id") == MASS_FORMULA_ID
        and existing_node.get("options", {}).get("volume", {}).get("formula_id") == volume_formula_id
    ):
        return tree, False

    updated_tree = {
        **tree,
        "options": {
            **options,
            "using_qty_basis_ef": {
                "next": {
                    "field_name": "ef_quantity_basis",
                    "allowed_values": ["mass", "volume"],
                    "options": {
                        "mass": {"formula_id": MASS_FORMULA_ID},
                        "volume": {"formula_id": volume_formula_id},
                    },
                },
            },
        },
    }
    return updated_tree, True


async def migrate():
    categories = await db.emission_categories.find(
        {"code": {"$in": COMBUSTION_CODES}},
        {"_id": 0, "id": 1, "scope_id": 1},
    ).to_list(20)
    if not categories:
        raise RuntimeError("No Stationary or Mobile Combustion categories were found")

    category_ids = [category["id"] for category in categories]
    formula = await db.ce_formulas.find_one({"name": VOLUME_FORMULA_NAME}, {"_id": 0})
    if not formula:
        formula = await create_formula(
            db,
            name=VOLUME_FORMULA_NAME,
            description="Quantity Basis EF formula for volume-based Custom Fuel inputs.",
            scope_ids=sorted({category["scope_id"] for category in categories}),
            category_ids=category_ids,
            category_id=category_ids[0],
            definition=volume_formula_definition(),
            created_by=CREATED_BY,
        )
        print(f"Created volume formula {formula['id']}")
    else:
        print(f"Using existing volume formula {formula['id']}")

    trees = await db.ce_decision_trees.find(
        {"category_id": {"$in": category_ids}, "is_active": True},
        {"_id": 0},
    ).to_list(20)
    if len(trees) != len(category_ids):
        raise RuntimeError("Each combustion category must have one active decision tree")

    for tree_doc in trees:
        updated_tree, changed = with_quantity_basis_routing(tree_doc["tree"], formula["id"])
        if not changed:
            print(f"Decision tree {tree_doc['id']} already routes volume Quantity Basis EF")
            continue
        await update_decision_tree(db, tree_doc["id"], tree=updated_tree, created_by=CREATED_BY)
        print(f"Updated decision tree {tree_doc['id']}")


if __name__ == "__main__":
    asyncio.run(migrate())