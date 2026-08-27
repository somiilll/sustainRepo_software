"""Add mass/volume Heat Basis routing for Custom Fuel combustion."""

import asyncio
from copy import deepcopy

from calc_engine.formulas import create_formula, update_decision_tree
from shared.database.mongo import db


CREATED_BY = "custom-fuel-heat-basis-volume-routing-migration"
COMBUSTION_CODES = ["stationary_combustion", "mobile_combustion"]
CV_UNITS = [
    "TJ/kg", "MJ/kg", "TJ/g", "MJ/g", "TJ/t", "MJ/t",
    "TJ/L", "MJ/L", "TJ/kL", "MJ/kL", "TJ/ml", "MJ/ml",
    "TJ/m3", "MJ/m3", "TJ/cm3", "MJ/cm3",
]


def volume_definition(mass_definition):
    definition = deepcopy(mass_definition)
    definition["inputs"] = [
        {
            "variable": "qty",
            "expected_unit": "L",
            "required": True,
            "allow_dimension_conversion": True,
            "allowed_transformations": [],
        },
    ]
    for property_definition in definition.get("properties", []):
        if property_definition.get("variable") == "cv":
            property_definition["expected_unit"] = "TJ/L"
    return definition


def heat_basis_formula_name(category, scope_code):
    return f"Custom Fuel - Heat Basis Volume - {category['name']} ({scope_code})"


def with_heat_basis_routing(tree, mass_formula_id, volume_formula_id):
    options = tree["options"]
    existing_node = options.get("using_heat_basis_ncv", {}).get("next")
    if (
        existing_node
        and existing_node.get("field_name") == "cv_quantity_basis"
        and existing_node.get("options", {}).get("mass", {}).get("formula_id") == mass_formula_id
        and existing_node.get("options", {}).get("volume", {}).get("formula_id") == volume_formula_id
    ):
        return tree, False

    updated_tree = deepcopy(tree)
    updated_tree["options"]["using_heat_basis_ncv"] = {
        "next": {
            "field_name": "cv_quantity_basis",
            "allowed_values": ["mass", "volume"],
            "options": {
                "mass": {"formula_id": mass_formula_id},
                "volume": {"formula_id": volume_formula_id},
            },
        },
    }
    return updated_tree, True


async def migrate():
    mapping = await db.ce_input_field_mappings.find_one(
        {"maps_to_variable": "cv", "is_active": True},
        {"_id": 0},
    )
    if not mapping:
        raise RuntimeError("Active Calorific Value field mapping was not found")
    await db.ce_input_field_mappings.update_one(
        {"id": mapping["id"]},
        {"$set": {"allowed_units": CV_UNITS}},
    )
    print("Updated Calorific Value allowed units for mass and volume inputs")

    categories = await db.emission_categories.find(
        {"code": {"$in": COMBUSTION_CODES}, "is_active": True},
        {"_id": 0, "id": 1, "name": 1, "scope_id": 1},
    ).to_list(20)
    if not categories:
        raise RuntimeError("No Stationary or Mobile Combustion categories were found")

    scope_docs = await db.scopes.find(
        {"id": {"$in": [category["scope_id"] for category in categories]}},
        {"_id": 0, "id": 1, "code": 1},
    ).to_list(20)
    scope_codes = {scope["id"]: scope.get("code", "scope") for scope in scope_docs}

    for category in categories:
        tree_doc = await db.ce_decision_trees.find_one(
            {"category_id": category["id"], "is_active": True},
            {"_id": 0},
        )
        if not tree_doc:
            raise RuntimeError(f"No active decision tree for {category['name']}")
        mass_formula_id = tree_doc["tree"]["options"].get("using_heat_basis_ncv", {}).get("formula_id")
        if not mass_formula_id:
            existing_node = tree_doc["tree"]["options"].get("using_heat_basis_ncv", {}).get("next", {})
            mass_formula_id = existing_node.get("options", {}).get("mass", {}).get("formula_id")
        if not mass_formula_id:
            raise RuntimeError(f"No Heat Basis mass formula for {category['name']}")
        mass_formula = await db.ce_formulas.find_one({"id": mass_formula_id, "is_active": True}, {"_id": 0})
        if not mass_formula:
            raise RuntimeError(f"Active Heat Basis mass formula {mass_formula_id} was not found")

        name = heat_basis_formula_name(category, scope_codes.get(category["scope_id"], "scope"))
        volume_formula = await db.ce_formulas.find_one({"name": name, "is_active": True}, {"_id": 0})
        if not volume_formula:
            volume_formula = await create_formula(
                db,
                name=name,
                description="Heat Basis formula for volume-based Custom Fuel inputs.",
                scope_ids=[category["scope_id"]],
                category_ids=[category["id"]],
                category_id=category["id"],
                definition=volume_definition(mass_formula["definition"]),
                created_by=CREATED_BY,
            )
            print(f"Created volume Heat Basis formula {volume_formula['id']} for {category['name']}")
        else:
            print(f"Using existing volume Heat Basis formula {volume_formula['id']} for {category['name']}")

        updated_tree, changed = with_heat_basis_routing(
            tree_doc["tree"], mass_formula_id, volume_formula["id"],
        )
        if changed:
            await update_decision_tree(
                db, tree_doc["id"], tree=updated_tree, created_by=CREATED_BY,
            )
            print(f"Updated Heat Basis routing for {category['name']}")
        else:
            print(f"Heat Basis routing already updated for {category['name']}")


if __name__ == "__main__":
    asyncio.run(migrate())