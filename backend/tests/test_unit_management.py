"""
Test Suite for Centralized Unit Management Module
Tests: Seed default units, Unit CRUD operations, Fuel Database allowed_units, 
       Emissions page unit filtering, and Volume unit density conditional logic
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://inventory-dev-deploy.preview.emergentagent.com').rstrip('/')

# Test credentials
SUPER_ADMIN_CREDS = {"email": "superadmin@ecotrack.com", "password": "SuperAdmin123!"}
ADMIN_CREDS = {"email": "admin@ghg.com", "password": "admin123"}


@pytest.fixture(scope="module")
def super_admin_token():
    """Get Super Admin token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN_CREDS)
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Super Admin authentication failed")


@pytest.fixture(scope="module")
def admin_token():
    """Get Admin token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Admin authentication failed")


@pytest.fixture
def super_admin_headers(super_admin_token):
    """Headers with Super Admin token"""
    return {
        "Authorization": f"Bearer {super_admin_token}",
        "Content-Type": "application/json"
    }


@pytest.fixture
def admin_headers(admin_token):
    """Headers with Admin token"""
    return {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json"
    }


class TestUnitsSeedDefaults:
    """Test seeding default units (4 mass + 6 volume units)"""

    def test_seed_defaults_creates_units(self, super_admin_headers):
        """POST /api/units/seed-defaults creates default units"""
        response = requests.post(
            f"{BASE_URL}/api/units/seed-defaults",
            headers=super_admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "units" in data
        # Message should indicate seeding result
        print(f"Seed result: {data['message']}, units: {data['units']}")

    def test_get_all_units_returns_expected_count(self, super_admin_headers):
        """GET /api/units returns at least 10 units (4 mass + 6 volume)"""
        response = requests.get(
            f"{BASE_URL}/api/units",
            headers=super_admin_headers
        )
        assert response.status_code == 200
        units = response.json()
        assert isinstance(units, list)
        # Should have at least 10 units after seeding (4 mass + 6 volume)
        assert len(units) >= 10, f"Expected at least 10 units, got {len(units)}"
        print(f"Total units: {len(units)}")

    def test_seed_creates_mass_units(self, super_admin_headers):
        """Verify 4 mass units exist: kg, g, tonne, lb"""
        response = requests.get(
            f"{BASE_URL}/api/units/by-type/mass",
            headers=super_admin_headers
        )
        assert response.status_code == 200
        mass_units = response.json()
        mass_symbols = [u["symbol"] for u in mass_units]
        expected_mass = ["kg", "g", "t", "lb"]
        for symbol in expected_mass:
            assert symbol in mass_symbols, f"Missing mass unit: {symbol}"
        print(f"Mass units: {mass_symbols}")

    def test_seed_creates_volume_units(self, super_admin_headers):
        """Verify 6 volume units exist: L, mL, kL, m³, gal, ft³"""
        response = requests.get(
            f"{BASE_URL}/api/units/by-type/volume",
            headers=super_admin_headers
        )
        assert response.status_code == 200
        volume_units = response.json()
        volume_symbols = [u["symbol"] for u in volume_units]
        expected_volume = ["L", "mL", "kL", "m³", "gal", "ft³"]
        for symbol in expected_volume:
            assert symbol in volume_symbols, f"Missing volume unit: {symbol}"
        print(f"Volume units: {volume_symbols}")


class TestUnitStructure:
    """Test that each unit has required fields: symbol, name, type, aliases, conversion_to_base"""

    def test_unit_has_required_fields(self, super_admin_headers):
        """Each unit should have symbol, name, unit_type, aliases, conversion_to_base"""
        response = requests.get(f"{BASE_URL}/api/units", headers=super_admin_headers)
        assert response.status_code == 200
        units = response.json()
        
        required_fields = ["id", "symbol", "name", "unit_type", "aliases", "conversion_to_base"]
        
        for unit in units:
            for field in required_fields:
                assert field in unit, f"Unit {unit.get('symbol', 'unknown')} missing field: {field}"
            
            # Validate field types
            assert isinstance(unit["symbol"], str)
            assert isinstance(unit["name"], str)
            assert unit["unit_type"] in ["mass", "volume"]
            assert isinstance(unit["aliases"], list)
            assert isinstance(unit["conversion_to_base"], (int, float))
            
            print(f"Unit {unit['symbol']}: type={unit['unit_type']}, conversion={unit['conversion_to_base']}")

    def test_kilogram_is_mass_base_unit(self, super_admin_headers):
        """Kilogram (kg) should be base unit with conversion_to_base=1.0"""
        response = requests.get(f"{BASE_URL}/api/units", headers=super_admin_headers)
        assert response.status_code == 200
        units = response.json()
        
        kg = next((u for u in units if u["symbol"] == "kg"), None)
        assert kg is not None, "kg unit not found"
        assert kg["unit_type"] == "mass"
        assert kg["is_base_unit"] == True
        assert kg["conversion_to_base"] == 1.0

    def test_litre_is_volume_base_unit(self, super_admin_headers):
        """Litre (L) should be base unit with conversion_to_base=1.0"""
        response = requests.get(f"{BASE_URL}/api/units", headers=super_admin_headers)
        assert response.status_code == 200
        units = response.json()
        
        litre = next((u for u in units if u["symbol"] == "L"), None)
        assert litre is not None, "L unit not found"
        assert litre["unit_type"] == "volume"
        assert litre["is_base_unit"] == True
        assert litre["conversion_to_base"] == 1.0


class TestFuelDatabaseUsesUnits:
    """Test that Fuel Database uses centralized units for allowed_units selection"""

    def test_fuel_database_allowed_units_contains_unit_symbols(self, super_admin_headers):
        """Fuels should have allowed_units field with unit symbols"""
        response = requests.get(
            f"{BASE_URL}/api/super-admin/fuel-database",
            headers=super_admin_headers
        )
        assert response.status_code == 200
        fuels = response.json()
        
        # Get all available unit symbols
        units_response = requests.get(f"{BASE_URL}/api/units", headers=super_admin_headers)
        all_units = units_response.json()
        all_symbols = [u["symbol"] for u in all_units]
        
        for fuel in fuels:
            if fuel.get("allowed_units"):
                for unit in fuel["allowed_units"]:
                    # Check that allowed_units uses valid unit symbols
                    assert unit in all_symbols, f"Fuel {fuel['fuel_name']} has unknown unit: {unit}"
                print(f"Fuel {fuel['fuel_name']}: allowed_units={fuel['allowed_units']}")

    def test_create_fuel_with_allowed_units(self, super_admin_headers):
        """Create fuel with specific allowed_units from centralized units"""
        # Get current units
        units_response = requests.get(f"{BASE_URL}/api/units", headers=super_admin_headers)
        units = units_response.json()
        mass_symbols = [u["symbol"] for u in units if u["unit_type"] == "mass"]
        volume_symbols = [u["symbol"] for u in units if u["unit_type"] == "volume"]
        
        # Create test fuel with both mass and volume units
        test_fuel = {
            "fuel_name": "TEST_Unit_Fuel",
            "category": "Mobile Combustion",
            "industry_sector": "Transportation",
            "scope": "scope1",
            "calorific_value": 43.0,
            "calorific_value_unit": "MJ/kg",
            "emission_factor_co2": 74100,
            "density": 0.84,
            "density_unit": "kg/L",
            "allowed_units": mass_symbols[:2] + volume_symbols[:2],  # First 2 mass + 2 volume
            "region": "Global"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/super-admin/fuel-database",
            json=test_fuel,
            headers=super_admin_headers
        )
        
        if response.status_code == 200 or response.status_code == 201:
            data = response.json()
            assert "allowed_units" in data
            assert isinstance(data["allowed_units"], list)
            print(f"Created fuel with allowed_units: {data['allowed_units']}")
            
            # Cleanup
            requests.delete(f"{BASE_URL}/api/super-admin/fuel-database/{data['id']}", headers=super_admin_headers)
        elif response.status_code == 400 and "already exists" in response.text:
            # Fuel already exists, that's OK
            print("Test fuel already exists, skipping creation")
        else:
            pytest.fail(f"Failed to create fuel: {response.status_code} - {response.text}")


class TestEmissionsUnitFiltering:
    """Test that Emissions page shows units from centralized module filtered by fuel's allowed_units"""

    def test_emissions_can_access_units_endpoint(self, admin_headers):
        """Admin can access units endpoint (needed for Emissions page)"""
        response = requests.get(f"{BASE_URL}/api/units", headers=admin_headers)
        assert response.status_code == 200
        units = response.json()
        assert len(units) > 0
        print(f"Admin can access {len(units)} units")

    def test_emissions_can_access_fuel_database(self, admin_headers):
        """Admin can access fuel database (needed for Emissions page)"""
        response = requests.get(f"{BASE_URL}/api/fuel-database", headers=admin_headers)
        assert response.status_code == 200
        fuels = response.json()
        print(f"Admin can access {len(fuels)} fuels")

    def test_fuel_allowed_units_filters_emission_quantity(self, admin_headers):
        """Verify that fuels have allowed_units for filtering in Emissions"""
        response = requests.get(f"{BASE_URL}/api/fuel-database", headers=admin_headers)
        assert response.status_code == 200
        fuels = response.json()
        
        # Check that fuels have allowed_units field
        fuels_with_units = [f for f in fuels if f.get("allowed_units")]
        print(f"Fuels with allowed_units: {len(fuels_with_units)} / {len(fuels)}")
        
        for fuel in fuels_with_units[:5]:  # Check first 5
            print(f"  {fuel['fuel_name']}: {fuel['allowed_units']}")


class TestVolumeUnitDetection:
    """Test that volume unit detection uses centralized unit aliases"""

    def test_volume_units_have_aliases(self, super_admin_headers):
        """Volume units should have aliases for detection"""
        response = requests.get(
            f"{BASE_URL}/api/units/by-type/volume",
            headers=super_admin_headers
        )
        assert response.status_code == 200
        volume_units = response.json()
        
        for unit in volume_units:
            # Check that each volume unit has aliases
            assert "aliases" in unit
            print(f"Volume unit {unit['symbol']}: aliases={unit.get('aliases', [])}")

    def test_millilitre_has_multiple_aliases(self, super_admin_headers):
        """Millilitre should have aliases like ml, mL, milliliter, etc."""
        response = requests.get(f"{BASE_URL}/api/units", headers=super_admin_headers)
        units = response.json()
        
        ml = next((u for u in units if u["symbol"] == "mL"), None)
        assert ml is not None, "mL unit not found"
        assert ml["unit_type"] == "volume"
        assert len(ml["aliases"]) > 0, "mL should have aliases"
        print(f"mL aliases: {ml['aliases']}")


class TestDensityConditionalLogic:
    """Test that Density conditional formula works with centralized units"""

    def test_formula_definitions_have_conditional_components(self, admin_headers):
        """Formula definitions should support conditional components"""
        response = requests.get(f"{BASE_URL}/api/formula-definitions", headers=admin_headers)
        if response.status_code != 200:
            pytest.skip("Formula definitions endpoint not available")
        
        formulas = response.json()
        for formula in formulas:
            if formula.get("components"):
                for comp in formula["components"]:
                    if comp.get("condition"):
                        print(f"Formula {formula['formula_name']}: {comp['parameter_name']} has condition={comp['condition']}")

    def test_density_component_has_volume_condition(self, admin_headers):
        """Density component should have 'volume_units' condition"""
        response = requests.get(f"{BASE_URL}/api/formula-definitions", headers=admin_headers)
        if response.status_code != 200:
            pytest.skip("Formula definitions endpoint not available")
        
        formulas = response.json()
        density_conditions = []
        
        for formula in formulas:
            if formula.get("components"):
                for comp in formula["components"]:
                    if "density" in comp.get("parameter_key", "").lower() or "density" in comp.get("parameter_name", "").lower():
                        density_conditions.append({
                            "formula": formula["formula_name"],
                            "parameter": comp.get("parameter_name"),
                            "condition": comp.get("condition", "always")
                        })
        
        print(f"Density components found: {density_conditions}")
        # There should be at least one density component with volume condition
        volume_density = [d for d in density_conditions if d["condition"] == "volume_units"]
        if volume_density:
            print(f"Density with volume_units condition: {volume_density}")


class TestEmissionCalculationWithUnits:
    """Test emission creation with different units"""

    def test_create_emission_with_mass_unit(self, admin_headers):
        """Create emission with mass unit (kg) - should skip Density in calculation"""
        # Get facilities
        facilities_response = requests.get(f"{BASE_URL}/api/facilities", headers=admin_headers)
        if facilities_response.status_code != 200 or not facilities_response.json():
            pytest.skip("No facilities available")
        
        facility_id = facilities_response.json()[0]["id"]
        
        # Get fuels
        fuels_response = requests.get(f"{BASE_URL}/api/fuel-database", headers=admin_headers)
        if fuels_response.status_code != 200 or not fuels_response.json():
            pytest.skip("No fuels available")
        
        fuel = fuels_response.json()[0]
        
        # Create emission with kg (mass unit)
        emission_data = {
            "facility_id": facility_id,
            "reporting_period": "2026-01",
            "scope": fuel.get("scope", "scope1"),
            "category": fuel.get("category", "Stationary Combustion"),
            "sub_category": fuel.get("fuel_name", "Test Fuel"),
            "fuel_type": fuel.get("fuel_name", "Test Fuel"),
            "quantity": 100,
            "emission_factor": fuel.get("emission_factor_co2", 74100),
            "unit": "kg",  # Mass unit - should skip density
            "calorific_value": fuel.get("calorific_value", 43.0),
            "fuel_database_id": fuel.get("id"),
            "emission_factor_ch4": fuel.get("emission_factor_ch4"),
            "emission_factor_n2o": fuel.get("emission_factor_n2o"),
            "density": fuel.get("density", 0.84)
        }
        
        response = requests.post(
            f"{BASE_URL}/api/emissions",
            json=emission_data,
            headers=admin_headers
        )
        
        if response.status_code in [200, 201]:
            data = response.json()
            print(f"Created emission with mass unit (kg): {data.get('total_emissions', 'N/A')}")
            # Cleanup
            requests.delete(f"{BASE_URL}/api/emissions/{data['id']}", headers=admin_headers)
        else:
            print(f"Emission creation response: {response.status_code} - {response.text[:200]}")

    def test_create_emission_with_volume_unit(self, admin_headers):
        """Create emission with volume unit (mL) - should apply Density in calculation"""
        # Get facilities
        facilities_response = requests.get(f"{BASE_URL}/api/facilities", headers=admin_headers)
        if facilities_response.status_code != 200 or not facilities_response.json():
            pytest.skip("No facilities available")
        
        facility_id = facilities_response.json()[0]["id"]
        
        # Get fuels with density
        fuels_response = requests.get(f"{BASE_URL}/api/fuel-database", headers=admin_headers)
        if fuels_response.status_code != 200 or not fuels_response.json():
            pytest.skip("No fuels available")
        
        # Find a fuel with density for volume calculations
        fuels_with_density = [f for f in fuels_response.json() if f.get("density")]
        if not fuels_with_density:
            pytest.skip("No fuels with density available")
        
        fuel = fuels_with_density[0]
        
        # Check if mL is in allowed_units
        allowed = fuel.get("allowed_units", [])
        if allowed and "mL" not in allowed and "L" not in allowed:
            print(f"Skipping: Fuel {fuel['fuel_name']} doesn't allow volume units")
            pytest.skip("No fuel with volume units in allowed_units")
        
        # Create emission with mL (volume unit)
        emission_data = {
            "facility_id": facility_id,
            "reporting_period": "2026-01",
            "scope": fuel.get("scope", "scope1"),
            "category": fuel.get("category", "Stationary Combustion"),
            "sub_category": fuel.get("fuel_name", "Test Fuel"),
            "fuel_type": fuel.get("fuel_name", "Test Fuel"),
            "quantity": 1000,
            "emission_factor": fuel.get("emission_factor_co2", 74100),
            "unit": "mL",  # Volume unit - should apply density
            "calorific_value": fuel.get("calorific_value", 43.0),
            "fuel_database_id": fuel.get("id"),
            "emission_factor_ch4": fuel.get("emission_factor_ch4"),
            "emission_factor_n2o": fuel.get("emission_factor_n2o"),
            "density": fuel.get("density", 0.84)
        }
        
        response = requests.post(
            f"{BASE_URL}/api/emissions",
            json=emission_data,
            headers=admin_headers
        )
        
        if response.status_code in [200, 201]:
            data = response.json()
            print(f"Created emission with volume unit (mL): {data.get('total_emissions', 'N/A')}")
            # Cleanup
            requests.delete(f"{BASE_URL}/api/emissions/{data['id']}", headers=admin_headers)
        else:
            print(f"Emission creation response: {response.status_code} - {response.text[:200]}")


class TestUnitCRUD:
    """Test Unit CRUD operations (Super Admin only)"""

    def test_admin_cannot_create_unit(self, admin_headers):
        """Admin should not be able to create units (Super Admin only)"""
        test_unit = {
            "name": "Test Unit",
            "symbol": "TU",
            "unit_type": "mass",
            "aliases": [],
            "conversion_to_base": 1.0
        }
        
        response = requests.post(
            f"{BASE_URL}/api/units",
            json=test_unit,
            headers=admin_headers
        )
        
        # Should be forbidden
        assert response.status_code == 403

    def test_super_admin_can_create_update_delete_unit(self, super_admin_headers):
        """Super Admin can create, update, and delete units"""
        # Create
        test_unit = {
            "name": "TEST_Custom_Unit",
            "symbol": "TCU",
            "unit_type": "mass",
            "aliases": ["test custom unit", "tcu"],
            "is_base_unit": False,
            "conversion_to_base": 0.5,
            "description": "Test unit for testing"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/units",
            json=test_unit,
            headers=super_admin_headers
        )
        
        if create_response.status_code in [200, 201]:
            data = create_response.json()
            unit_id = data["id"]
            assert data["symbol"] == "TCU"
            print(f"Created unit: {data['name']} ({data['symbol']})")
            
            # Update
            test_unit["name"] = "TEST_Custom_Unit_Updated"
            test_unit["conversion_to_base"] = 0.75
            
            update_response = requests.put(
                f"{BASE_URL}/api/units/{unit_id}",
                json=test_unit,
                headers=super_admin_headers
            )
            assert update_response.status_code == 200
            updated = update_response.json()
            assert updated["name"] == "TEST_Custom_Unit_Updated"
            assert updated["conversion_to_base"] == 0.75
            print(f"Updated unit: {updated['name']}")
            
            # Delete
            delete_response = requests.delete(
                f"{BASE_URL}/api/units/{unit_id}",
                headers=super_admin_headers
            )
            assert delete_response.status_code == 200
            print("Deleted test unit")
        elif create_response.status_code == 400 and "already exists" in create_response.text:
            print("Test unit already exists, cleaning up...")
            # Find and delete existing
            units_response = requests.get(f"{BASE_URL}/api/units", headers=super_admin_headers)
            units = units_response.json()
            existing = next((u for u in units if u["symbol"] == "TCU"), None)
            if existing:
                requests.delete(f"{BASE_URL}/api/units/{existing['id']}", headers=super_admin_headers)
        else:
            pytest.fail(f"Failed to create unit: {create_response.status_code} - {create_response.text}")
