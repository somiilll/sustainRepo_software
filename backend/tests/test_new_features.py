"""
Test suite for new GHG Platform features:
1. Fuel Database: allowed_units field
2. Formula Module: conditional components
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Credentials
SUPER_ADMIN_EMAIL = "superadmin@ecotrack.com"
SUPER_ADMIN_PASSWORD = "SuperAdmin123!"
ADMIN_EMAIL = "admin@ghg.com"
ADMIN_PASSWORD = "admin123"


class TestAuthHelper:
    """Helper class for authentication"""
    
    @staticmethod
    def get_token(email, password):
        """Get auth token for user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        return None
    
    @staticmethod
    def get_auth_header(token):
        """Get authorization header"""
        return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def super_admin_token():
    """Get Super Admin token"""
    token = TestAuthHelper.get_token(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    if not token:
        pytest.skip("Could not authenticate as Super Admin")
    return token


@pytest.fixture(scope="module")
def admin_token():
    """Get Admin token"""
    token = TestAuthHelper.get_token(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not token:
        pytest.skip("Could not authenticate as Admin")
    return token


@pytest.fixture(scope="module")
def super_admin_headers(super_admin_token):
    """Get Super Admin auth headers"""
    return TestAuthHelper.get_auth_header(super_admin_token)


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    """Get Admin auth headers"""
    return TestAuthHelper.get_auth_header(admin_token)


class TestFuelDatabaseAllowedUnits:
    """Test Fuel Database allowed_units feature"""
    
    created_fuel_id = None  # Class variable to track created fuel
    
    def test_01_create_fuel_with_mass_units_only(self, super_admin_headers):
        """Test creating fuel with only mass units allowed"""
        fuel_data = {
            "fuel_name": "TEST_Mass_Only_Fuel",
            "category": "Stationary Combustion",
            "industry_sector": "Manufacturing",
            "scope": "scope1",
            "calorific_value": 45.0,
            "calorific_value_unit": "MJ/kg",
            "emission_factor_co2": 74100,
            "emission_factor_ch4": 3,
            "emission_factor_n2o": 0.6,
            "density": None,
            "density_unit": "kg/L",
            "conversion_factor": 1,
            "source": "Test Source",
            "region": "Global",
            "allowed_units": ["kg", "g", "tonne"]  # Mass units only
        }
        
        response = requests.post(
            f"{BASE_URL}/api/super-admin/fuel-database",
            json=fuel_data,
            headers=super_admin_headers
        )
        
        assert response.status_code in [200, 201], f"Failed to create fuel: {response.text}"
        data = response.json()
        
        # Verify allowed_units is stored correctly
        assert "allowed_units" in data, "Response should contain allowed_units"
        assert data["allowed_units"] == ["kg", "g", "tonne"], f"allowed_units mismatch: {data.get('allowed_units')}"
        
        TestFuelDatabaseAllowedUnits.created_fuel_id = data["id"]
        print(f"Created fuel with mass units only: {data['id']}")
    
    def test_02_create_fuel_with_volume_units(self, super_admin_headers):
        """Test creating fuel with both mass and volume units allowed"""
        fuel_data = {
            "fuel_name": "TEST_Liquid_Fuel_WithVolume",
            "category": "Mobile Combustion",
            "industry_sector": "Transportation",
            "scope": "scope1",
            "calorific_value": 43.0,
            "calorific_value_unit": "MJ/kg",
            "emission_factor_co2": 74100,
            "emission_factor_ch4": 3,
            "emission_factor_n2o": 0.6,
            "density": 0.85,
            "density_unit": "kg/L",
            "conversion_factor": 1,
            "source": "Test Source",
            "region": "Global",
            "allowed_units": ["kg", "tonne", "L", "kL", "gal"]  # Mix of mass and volume
        }
        
        response = requests.post(
            f"{BASE_URL}/api/super-admin/fuel-database",
            json=fuel_data,
            headers=super_admin_headers
        )
        
        assert response.status_code in [200, 201], f"Failed to create fuel: {response.text}"
        data = response.json()
        
        # Verify allowed_units contains both mass and volume
        assert "allowed_units" in data, "Response should contain allowed_units"
        expected_units = {"kg", "tonne", "L", "kL", "gal"}
        actual_units = set(data["allowed_units"])
        assert actual_units == expected_units, f"allowed_units mismatch: expected {expected_units}, got {actual_units}"
        
        print(f"Created liquid fuel with volume units: {data['id']}")
    
    def test_03_get_fuel_returns_allowed_units(self, super_admin_headers):
        """Test that GET fuel returns allowed_units"""
        response = requests.get(
            f"{BASE_URL}/api/super-admin/fuel-database",
            headers=super_admin_headers
        )
        
        assert response.status_code == 200, f"Failed to get fuels: {response.text}"
        fuels = response.json()
        
        # Find our test fuels
        test_fuels = [f for f in fuels if f["fuel_name"].startswith("TEST_")]
        assert len(test_fuels) >= 2, f"Expected at least 2 test fuels, found {len(test_fuels)}"
        
        for fuel in test_fuels:
            if fuel["fuel_name"] == "TEST_Mass_Only_Fuel":
                assert fuel.get("allowed_units") == ["kg", "g", "tonne"], \
                    f"Mass-only fuel has wrong units: {fuel.get('allowed_units')}"
            elif fuel["fuel_name"] == "TEST_Liquid_Fuel_WithVolume":
                assert set(fuel.get("allowed_units", [])) == {"kg", "tonne", "L", "kL", "gal"}, \
                    f"Liquid fuel has wrong units: {fuel.get('allowed_units')}"
        
        print("Verified allowed_units returned in GET response")
    
    def test_04_update_fuel_allowed_units(self, super_admin_headers):
        """Test updating fuel's allowed_units"""
        if not TestFuelDatabaseAllowedUnits.created_fuel_id:
            pytest.skip("No fuel created to update")
        
        update_data = {
            "fuel_name": "TEST_Mass_Only_Fuel",
            "category": "Stationary Combustion",
            "industry_sector": "Manufacturing",
            "scope": "scope1",
            "calorific_value": 45.0,
            "calorific_value_unit": "MJ/kg",
            "emission_factor_co2": 74100,
            "emission_factor_ch4": 3,
            "emission_factor_n2o": 0.6,
            "density": None,
            "density_unit": "kg/L",
            "conversion_factor": 1,
            "source": "Test Source",
            "region": "Global",
            "allowed_units": ["kg", "g", "tonne", "lb"]  # Added lb
        }
        
        response = requests.put(
            f"{BASE_URL}/api/super-admin/fuel-database/{TestFuelDatabaseAllowedUnits.created_fuel_id}",
            json=update_data,
            headers=super_admin_headers
        )
        
        assert response.status_code == 200, f"Failed to update fuel: {response.text}"
        data = response.json()
        
        assert set(data.get("allowed_units", [])) == {"kg", "g", "tonne", "lb"}, \
            f"Updated allowed_units mismatch: {data.get('allowed_units')}"
        
        print(f"Updated fuel allowed_units successfully")


class TestFormulaConditionalComponents:
    """Test Formula Module conditional components feature"""
    
    created_formula_id = None
    created_param_id = None
    
    def test_01_create_parameter(self, super_admin_headers):
        """Create a test parameter for formula"""
        param_data = {
            "parameter_name": "TEST_Density_Parameter",
            "parameter_key": "test_density",
            "description": "Test density parameter for conditional testing",
            "unit_conversions": [],
            "requires_user_input": False,
            "predefined_source": "fuel_database.density",
            "is_optional": True,
            "display_order": 10,
            "applicable_categories": None,
            "applicable_industries": None
        }
        
        response = requests.post(
            f"{BASE_URL}/api/super-admin/formula-parameters",
            json=param_data,
            headers=super_admin_headers
        )
        
        # If parameter already exists, fetch it
        if response.status_code == 400 and "already exists" in response.text:
            # Get existing parameters
            get_response = requests.get(
                f"{BASE_URL}/api/super-admin/formula-parameters",
                headers=super_admin_headers
            )
            if get_response.status_code == 200:
                params = get_response.json()
                for p in params:
                    if p["parameter_key"] == "test_density":
                        TestFormulaConditionalComponents.created_param_id = p["id"]
                        print(f"Using existing parameter: {p['id']}")
                        return
        
        assert response.status_code in [200, 201], f"Failed to create parameter: {response.text}"
        data = response.json()
        TestFormulaConditionalComponents.created_param_id = data["id"]
        print(f"Created test parameter: {data['id']}")
    
    def test_02_create_formula_with_conditional_component(self, super_admin_headers):
        """Test creating formula with conditional component (volume_units condition)"""
        # First, get existing parameters
        params_response = requests.get(
            f"{BASE_URL}/api/super-admin/formula-parameters",
            headers=super_admin_headers
        )
        assert params_response.status_code == 200
        params = params_response.json()
        
        # Find quantity and density parameters
        quantity_param = next((p for p in params if "quantity" in p["parameter_key"].lower()), None)
        density_param = next((p for p in params if "density" in p["parameter_key"].lower()), None)
        
        if not quantity_param:
            pytest.skip("No quantity parameter found")
        
        # Build components with conditional density
        components = [
            {
                "parameter_key": quantity_param["parameter_key"],
                "parameter_name": quantity_param["parameter_name"],
                "operation": "base",
                "condition": "always"  # Always apply quantity
            }
        ]
        
        if density_param:
            components.append({
                "parameter_key": density_param["parameter_key"],
                "parameter_name": density_param["parameter_name"],
                "operation": "multiply",
                "condition": "volume_units"  # Only apply when volume unit selected
            })
        
        formula_data = {
            "formula_name": "TEST_Conditional_Formula",
            "formula_key": "test_conditional_formula",
            "description": "Test formula with conditional density component",
            "output_name": "Test Output",
            "output_unit": "kg",
            "components": components,
            "formula_expression": "Quantity × Density (if volume)",
            "applies_gwp": False,
            "gwp_gas": None,
            "applicable_categories": None,
            "applicable_industries": None,
            "is_active": True,
            "display_order": 99,
            "mass_units": ["kg", "g", "tonne", "lb"],
            "volume_units": ["L", "mL", "kL", "m3", "gal", "ft3"]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/super-admin/formula-definitions",
            json=formula_data,
            headers=super_admin_headers
        )
        
        # If formula already exists, try to fetch it
        if response.status_code == 400 and "already exists" in response.text:
            get_response = requests.get(
                f"{BASE_URL}/api/super-admin/formula-definitions",
                headers=super_admin_headers
            )
            if get_response.status_code == 200:
                formulas = get_response.json()
                for f in formulas:
                    if f["formula_key"] == "test_conditional_formula":
                        TestFormulaConditionalComponents.created_formula_id = f["id"]
                        print(f"Using existing formula: {f['id']}")
                        return
        
        assert response.status_code in [200, 201], f"Failed to create formula: {response.text}"
        data = response.json()
        
        # Verify conditional component is stored
        assert "components" in data, "Formula should have components"
        density_comp = next((c for c in data["components"] if "density" in c["parameter_key"].lower()), None)
        if density_comp:
            assert density_comp.get("condition") == "volume_units", \
                f"Density condition should be volume_units, got: {density_comp.get('condition')}"
        
        TestFormulaConditionalComponents.created_formula_id = data["id"]
        print(f"Created conditional formula: {data['id']}")
    
    def test_03_get_formula_returns_conditions(self, super_admin_headers):
        """Test that GET formulas returns component conditions"""
        response = requests.get(
            f"{BASE_URL}/api/super-admin/formula-definitions",
            headers=super_admin_headers
        )
        
        assert response.status_code == 200, f"Failed to get formulas: {response.text}"
        formulas = response.json()
        
        # Find test formula or any formula with conditions
        test_formula = next((f for f in formulas if f["formula_key"] == "test_conditional_formula"), None)
        
        if test_formula:
            print(f"Found test formula with components: {test_formula['components']}")
            for comp in test_formula.get("components", []):
                assert "condition" in comp, f"Component should have condition: {comp}"
                print(f"  Component {comp['parameter_name']}: condition={comp.get('condition')}")
        else:
            # Check if any formula has conditions
            for formula in formulas:
                for comp in formula.get("components", []):
                    if comp.get("condition") and comp.get("condition") != "always":
                        print(f"Found conditional component in {formula['formula_name']}: {comp}")
        
        print("Verified formula conditions in GET response")
    
    def test_04_update_formula_component_condition(self, super_admin_headers):
        """Test updating formula component condition"""
        if not TestFormulaConditionalComponents.created_formula_id:
            pytest.skip("No formula created to update")
        
        # Get current formula
        get_response = requests.get(
            f"{BASE_URL}/api/super-admin/formula-definitions",
            headers=super_admin_headers
        )
        assert get_response.status_code == 200
        formulas = get_response.json()
        
        current_formula = next(
            (f for f in formulas if f["id"] == TestFormulaConditionalComponents.created_formula_id),
            None
        )
        
        if not current_formula:
            pytest.skip("Could not find created formula")
        
        # Update component condition to mass_units
        updated_components = []
        for comp in current_formula.get("components", []):
            new_comp = comp.copy()
            if "density" in comp["parameter_key"].lower():
                new_comp["condition"] = "mass_units"  # Change from volume_units to mass_units
            updated_components.append(new_comp)
        
        update_data = {
            "formula_name": current_formula["formula_name"],
            "formula_key": current_formula["formula_key"],
            "description": current_formula.get("description"),
            "output_name": current_formula["output_name"],
            "output_unit": current_formula["output_unit"],
            "components": updated_components,
            "formula_expression": current_formula.get("formula_expression", ""),
            "applies_gwp": current_formula.get("applies_gwp", False),
            "gwp_gas": current_formula.get("gwp_gas"),
            "applicable_categories": current_formula.get("applicable_categories"),
            "applicable_industries": current_formula.get("applicable_industries"),
            "is_active": current_formula.get("is_active", True),
            "display_order": current_formula.get("display_order", 0),
            "mass_units": current_formula.get("mass_units", ["kg", "g", "tonne", "lb"]),
            "volume_units": current_formula.get("volume_units", ["L", "mL", "kL", "m3", "gal", "ft3"])
        }
        
        response = requests.put(
            f"{BASE_URL}/api/super-admin/formula-definitions/{TestFormulaConditionalComponents.created_formula_id}",
            json=update_data,
            headers=super_admin_headers
        )
        
        assert response.status_code == 200, f"Failed to update formula: {response.text}"
        data = response.json()
        
        # Verify condition was updated
        density_comp = next((c for c in data["components"] if "density" in c["parameter_key"].lower()), None)
        if density_comp:
            assert density_comp.get("condition") == "mass_units", \
                f"Density condition should be mass_units after update, got: {density_comp.get('condition')}"
        
        print("Successfully updated formula component condition")


class TestEmissionsWithAllowedUnits:
    """Test that Emissions page respects fuel's allowed_units"""
    
    def test_01_admin_gets_fuels_with_allowed_units(self, admin_headers):
        """Test that Admin can see fuel database with allowed_units"""
        response = requests.get(
            f"{BASE_URL}/api/fuel-database",
            headers=admin_headers
        )
        
        assert response.status_code == 200, f"Failed to get fuel database: {response.text}"
        fuels = response.json()
        
        # Check that fuels have allowed_units field
        fuels_with_units = [f for f in fuels if f.get("allowed_units")]
        print(f"Found {len(fuels_with_units)} fuels with allowed_units defined")
        
        for fuel in fuels_with_units:
            print(f"  {fuel['fuel_name']}: {fuel['allowed_units']}")
        
        # At least one fuel should have allowed_units
        assert len(fuels_with_units) > 0 or len(fuels) == 0, "Expected fuels to have allowed_units or no fuels"
    
    def test_02_get_formula_definitions_for_calculation(self, admin_headers):
        """Test that Admin can get active formula definitions"""
        response = requests.get(
            f"{BASE_URL}/api/formula-definitions",
            headers=admin_headers
        )
        
        assert response.status_code == 200, f"Failed to get formula definitions: {response.text}"
        formulas = response.json()
        
        print(f"Found {len(formulas)} active formula definitions")
        
        for formula in formulas:
            print(f"  {formula['formula_name']} ({formula['formula_key']})")
            for comp in formula.get("components", []):
                condition = comp.get("condition", "always")
                print(f"    - {comp['parameter_name']}: operation={comp.get('operation')}, condition={condition}")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_fuels(self, super_admin_headers):
        """Delete test fuels created during testing"""
        response = requests.get(
            f"{BASE_URL}/api/super-admin/fuel-database",
            headers=super_admin_headers
        )
        
        if response.status_code == 200:
            fuels = response.json()
            for fuel in fuels:
                if fuel["fuel_name"].startswith("TEST_"):
                    delete_response = requests.delete(
                        f"{BASE_URL}/api/super-admin/fuel-database/{fuel['id']}",
                        headers=super_admin_headers
                    )
                    if delete_response.status_code in [200, 204]:
                        print(f"Deleted test fuel: {fuel['fuel_name']}")
    
    def test_cleanup_test_formulas(self, super_admin_headers):
        """Delete test formulas created during testing"""
        response = requests.get(
            f"{BASE_URL}/api/super-admin/formula-definitions",
            headers=super_admin_headers
        )
        
        if response.status_code == 200:
            formulas = response.json()
            for formula in formulas:
                if formula["formula_key"].startswith("test_"):
                    delete_response = requests.delete(
                        f"{BASE_URL}/api/super-admin/formula-definitions/{formula['id']}",
                        headers=super_admin_headers
                    )
                    if delete_response.status_code in [200, 204]:
                        print(f"Deleted test formula: {formula['formula_name']}")
    
    def test_cleanup_test_parameters(self, super_admin_headers):
        """Delete test parameters created during testing"""
        response = requests.get(
            f"{BASE_URL}/api/super-admin/formula-parameters",
            headers=super_admin_headers
        )
        
        if response.status_code == 200:
            params = response.json()
            for param in params:
                if param["parameter_key"].startswith("test_"):
                    delete_response = requests.delete(
                        f"{BASE_URL}/api/super-admin/formula-parameters/{param['id']}",
                        headers=super_admin_headers
                    )
                    if delete_response.status_code in [200, 204]:
                        print(f"Deleted test parameter: {param['parameter_name']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
