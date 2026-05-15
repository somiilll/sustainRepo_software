"""
End-to-end test for the Phase 1 calc engine.

Covers:
- System seed is present
- Unit conversion (same-dim, cross-compound)
- Transformation (volume -> mass via density)
- Property resolver: user override, property_values, fuel_database fallback
- Formula validator: unknown variables rejected, missing output step rejected
- Execution: gas-based formula producing co2/ch4/n2o + co2e
- Execution: co2e-only formula
- Full dry-run produces coherent audit log with version stamping
- Non-dry-run writes to ce_calculation_audit_logs
"""

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from calc_engine.execution import CalcEngine, FormulaDefinitionError, CalculationError  # noqa: E402
from calc_engine.properties import resolve_property  # noqa: E402
from calc_engine.seed import seed_calc_engine  # noqa: E402
from calc_engine.units import convert  # noqa: E402


TEST_FUEL_CODE = f"pytest_diesel_{uuid.uuid4().hex[:6]}"


async def setup_fuel(db):
    await db.fuel_database.insert_one({
        "id": str(uuid.uuid4()),
        "fuel_name": TEST_FUEL_CODE,
        "fuel_code": TEST_FUEL_CODE,
        "scope": "scope1",
        "categories": ["Mobile Combustion"],
        "region": "IN",
        "calorific_value": 43.0,
        "calorific_value_unit": "MJ/kg",
        "density": 0.832,
        "density_unit": "kg/L",
        "emission_factor_co2": 3.17,
        "emission_factor_co2_unit": "kgCO2/kg",
        "emission_factor_ch4": 0.00013,
        "emission_factor_ch4_unit": "kgCH4/kg",
        "emission_factor_n2o": 0.0000028,
        "emission_factor_n2o_unit": "kgN2O/kg",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def teardown(db, ids_to_cleanup):
    await db.fuel_database.delete_many({"fuel_code": TEST_FUEL_CODE})
    if ids_to_cleanup:
        await db.ce_property_values.delete_many({"id": {"$in": ids_to_cleanup}})
        await db.ce_calculation_audit_logs.delete_many({"context.fuel_code": TEST_FUEL_CODE})


def stationary_formula():
    return {
        "id": "F_TEST_STATIONARY",
        "version_id": "v1",
        "inputs": [
            {"variable": "qty", "expected_unit": "kg",
             "allow_dimension_conversion": True,
             "allowed_transformations": ["volume_to_mass"],
             "required": True},
        ],
        "properties": [
            {"variable": "ef_q_co2", "expected_unit": "kgCO2/kg"},
            {"variable": "ef_q_ch4", "expected_unit": "kgCH4/kg"},
            {"variable": "ef_q_n2o", "expected_unit": "kgN2O/kg"},
            {"variable": "gwp_ch4",  "expected_unit": "1"},
            {"variable": "gwp_n2o",  "expected_unit": "1"},
        ],
        "steps": [
            {"name": "co2",  "type": "expression", "expression": "qty * ef_q_co2"},
            {"name": "ch4",  "type": "expression", "expression": "qty * ef_q_ch4"},
            {"name": "n2o",  "type": "expression", "expression": "qty * ef_q_n2o"},
            {"name": "co2e", "type": "expression",
             "expression": "co2 + ch4 * gwp_ch4 + n2o * gwp_n2o"},
        ],
        "outputs": [
            {"variable": "co2",  "unit": "kgCO2",  "produced_by_step": "co2"},
            {"variable": "ch4",  "unit": "kgCH4",  "produced_by_step": "ch4"},
            {"variable": "n2o",  "unit": "kgN2O",  "produced_by_step": "n2o"},
            {"variable": "co2e", "unit": "kgCO2e", "produced_by_step": "co2e"},
        ],
    }


async def run():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    engine = CalcEngine(db)

    # Make sure seed is present (idempotent)
    seed_counts = await seed_calc_engine(db)
    print("Seed result:", seed_counts)
    # Every registry must have at least the seed
    assert await db.ce_variables.count_documents({}) >= 13
    assert await db.ce_units.count_documents({}) >= 27
    assert await db.ce_compound_units.count_documents({}) >= 14
    assert await db.ce_properties.count_documents({}) >= 8
    print("✅ Seed present")

    # ---- Unit conversion tests ----
    v, a = await convert(db, 1.0, "TJ", "MJ")
    assert v == 1e6
    v, a = await convert(db, 1000.0, "L", "m3")
    assert abs(v - 1.0) < 1e-9
    v, a = await convert(db, 1.0, "MJ/kg", "MJ/kg")
    assert v == 1.0  # no-op
    # cross dims compound
    v, a = await convert(db, 1.0, "TJ/tonne", "MJ/kg")
    assert abs(v - 1000.0) < 1e-6  # 1 TJ/t == 1000 MJ/kg
    print("✅ Unit conversion (simple + compound) works")

    # Dim mismatch should raise
    try:
        await convert(db, 1.0, "kg", "MJ")
        raise AssertionError("Expected dimension mismatch error")
    except ValueError as e:
        assert "Dimension mismatch" in str(e)
    print("✅ Dimension mismatch rejected")

    # ---- Fuel DB fallback ----
    await setup_fuel(db)
    pv_ids = []
    try:
        val, unit, audit = await resolve_property(
            db, "ef_q_co2", {"fuel_code": TEST_FUEL_CODE, "region": "IN"}
        )
        assert abs(val - 3.17) < 1e-9 and unit == "kgCO2/kg"
        assert audit["source"] == "fuel_database_fallback"
        print("✅ Fuel DB fallback works")

        # property_values wins over fuel fallback (more specific)
        pv = {
            "id": str(uuid.uuid4()),
            "property_id": (await db.ce_properties.find_one({"key": "ef_q_co2"}))["id"],
            "property_key": "ef_q_co2",
            "value": 3.22, "unit": "kgCO2/kg",
            "context": {"fuel_code": TEST_FUEL_CODE, "region": "IN", "year": 2024},
            "version_id": "pv1",
            "effective_from": datetime.now(timezone.utc).isoformat(),
            "source": "pytest",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.ce_property_values.insert_one(pv)
        pv_ids.append(pv["id"])
        val, unit, audit = await resolve_property(
            db, "ef_q_co2",
            {"fuel_code": TEST_FUEL_CODE, "region": "IN", "year": 2024},
        )
        assert abs(val - 3.22) < 1e-9
        assert audit["source"] == "property_values"
        print("✅ property_values overrides fuel DB")

        # User override beats both
        val, unit, audit = await resolve_property(
            db, "ef_q_co2",
            {"fuel_code": TEST_FUEL_CODE, "region": "IN", "year": 2024},
            user_overrides={"ef_q_co2": {"value": 99.0, "unit": "kgCO2/kg"}},
        )
        assert val == 99.0 and audit["source"] == "user_override"
        print("✅ user override wins")

        # ---- Seed GWPs as property_values for the formula ----
        for key, val in [("gwp_ch4", 28.0), ("gwp_n2o", 265.0)]:
            prop = await db.ce_properties.find_one({"key": key})
            doc = {
                "id": str(uuid.uuid4()),
                "property_id": prop["id"],
                "property_key": key,
                "value": val, "unit": "1",
                "context": {},
                "version_id": "pv1",
                "effective_from": datetime.now(timezone.utc).isoformat(),
                "source": "pytest",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.ce_property_values.insert_one(doc)
            pv_ids.append(doc["id"])

        # ---- Validator rejects unknown names ----
        bad = stationary_formula()
        bad["steps"].append({"name": "bad", "type": "expression",
                             "expression": "qty * nonexistent_var"})
        try:
            await engine.validate_formula(bad)
            raise AssertionError("Expected FormulaDefinitionError for undeclared name")
        except FormulaDefinitionError as e:
            assert "undeclared" in str(e).lower()
        print("✅ Validator rejects undeclared variable")

        # Gas-based formula missing co2e is rejected
        bad2 = stationary_formula()
        bad2["outputs"] = [o for o in bad2["outputs"] if o["variable"] != "co2e"]
        try:
            await engine.validate_formula(bad2)
            raise AssertionError("Expected FormulaDefinitionError for missing co2e")
        except FormulaDefinitionError as e:
            assert "co2e" in str(e).lower()
        print("✅ Validator enforces co2e aggregation rule")

        # ---- Execute ----
        result = await engine.execute(
            formula=stationary_formula(),
            inputs={"qty": {"value": 1000.0, "unit": "kg"}},
            context={"fuel_code": TEST_FUEL_CODE, "region": "IN", "year": 2024},
            dry_run=True,
        )
        outs = result["outputs"]
        # 1000 kg * 3.22 kgCO2/kg = 3220
        assert abs(outs["co2"]["value"] - 3220.0) < 1e-6
        # co2e = co2 + ch4*28 + n2o*265  = 3220 + 0.00013*1000*28 + 0.0000028*1000*265
        expected_co2e = 3220 + 0.13 * 28 + 0.0028 * 265
        assert abs(outs["co2e"]["value"] - expected_co2e) < 1e-6
        print(f"✅ Gas-based formula outputs: co2={outs['co2']['value']:.2f}, "
              f"ch4={outs['ch4']['value']:.4f}, n2o={outs['n2o']['value']:.6f}, "
              f"co2e={outs['co2e']['value']:.4f}")

        # Check audit trail has the expected stages
        steps = [a.get("step") or a.get("name") for a in result["audit_log"]]
        assert "validate_formula" in steps
        assert any(s == "formula_step" for s in steps) or "co2" in steps
        assert "outputs" in steps
        print(f"✅ Audit log has {len(result['audit_log'])} entries")

        # ---- Transformation: input in L, converted to kg via density ----
        result2 = await engine.execute(
            formula=stationary_formula(),
            inputs={"qty": {"value": 1000.0, "unit": "L"}},  # 1000 L diesel
            context={"fuel_code": TEST_FUEL_CODE, "region": "IN", "year": 2024},
            dry_run=True,
        )
        # 1000 L * 0.832 kg/L = 832 kg; 832 * 3.22 = 2679.04
        assert abs(result2["outputs"]["co2"]["value"] - 832.0 * 3.22) < 1e-4
        # audit log must include a transformation entry
        trans_names = [a.get("name") for a in result2["audit_log"]]
        assert "volume_to_mass" in trans_names
        print("✅ volume_to_mass transformation applied correctly")

        # ---- Non-dry-run persists audit log ----
        result3 = await engine.execute(
            formula=stationary_formula(),
            inputs={"qty": {"value": 1.0, "unit": "kg"}},
            context={"fuel_code": TEST_FUEL_CODE, "region": "IN", "year": 2024},
            dry_run=False,
            emission_record_id="pytest-rec-123",
        )
        assert result3["persisted"] is True
        saved = await db.ce_calculation_audit_logs.find_one(
            {"emission_record_id": "pytest-rec-123"}
        )
        assert saved is not None
        print("✅ Non-dry-run persists calculation_audit_logs row")

        # ---- co2e-only formula ----
        co2e_only = {
            "id": "F_CO2E_ONLY", "version_id": "v1",
            "inputs": [{"variable": "qty", "expected_unit": "kg", "required": True}],
            "properties": [{"variable": "ef_co2e", "expected_unit": "kgCO2e/kg"}],
            "steps": [{"name": "co2e", "type": "expression", "expression": "qty * ef_co2e"}],
            "outputs": [{"variable": "co2e", "unit": "kgCO2e", "produced_by_step": "co2e"}],
        }
        # seed ef_co2e property_value
        prop = await db.ce_properties.find_one({"key": "ef_co2e"})
        doc = {
            "id": str(uuid.uuid4()),
            "property_id": prop["id"],
            "property_key": "ef_co2e",
            "value": 3.5, "unit": "kgCO2e/kg",
            "context": {"fuel_code": TEST_FUEL_CODE},
            "version_id": "pv1",
            "effective_from": datetime.now(timezone.utc).isoformat(),
            "source": "pytest",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.ce_property_values.insert_one(doc)
        pv_ids.append(doc["id"])

        r = await engine.execute(
            formula=co2e_only,
            inputs={"qty": {"value": 100.0, "unit": "kg"}},
            context={"fuel_code": TEST_FUEL_CODE},
            dry_run=True,
        )
        assert abs(r["outputs"]["co2e"]["value"] - 350.0) < 1e-6
        print("✅ co2e-only formula works")

        # ---- Missing required input ----
        try:
            await engine.execute(
                formula=stationary_formula(),
                inputs={},
                context={"fuel_code": TEST_FUEL_CODE, "region": "IN"},
                dry_run=True,
            )
            raise AssertionError("Expected CalculationError")
        except CalculationError as e:
            assert "qty" in str(e)
        print("✅ Missing input rejected")

    finally:
        await teardown(db, pv_ids)
        client.close()


if __name__ == "__main__":
    asyncio.run(run())
    print("\n🎉 All Phase 1 tests passed")
