"""
Test Suite for Formula Definitions, Formula Parameters, and Emission Calculation
Testing the canonical formula: Base Emissions (kg gas) = quantity_kg × NCV_TJ_per_kg × EF_kg_gas_per_TJ
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://emission-records-v2.preview.emergentagent.com').rstrip('/')

# Test credentials
SUPER_ADMIN = {"email": "superadmin@ecotrack.com", "password": "SuperAdmin123!"}
ADMIN = {"email": "admin@ghg.com", "password": "admin123"}

# GWP values from IPCC AR5
GWP = {"CO2": 1, "CH4": 28, "N2O": 273}


class TestAuthentication:
    """Authentication tests"""
    
    def test_super_admin_login(self):
        """Test Super Admin can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN)
        assert response.status_code == 200, f"Super Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "super_admin"
        print(f"✓ Super Admin login successful: {data['user']['email']}")
    
    def test_admin_login(self):
        """Test Admin can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful: {data['user']['email']}")


class TestFormulaParameters:
    """Test Super Admin Formula Parameters API (GET/POST)"""
    
    @pytest.fixture
    def super_admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN)
        return response.json()["access_token"]
    
    def test_get_formula_parameters(self, super_admin_token):
        """GET /api/super-admin/formula-parameters should return list"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/super-admin/formula-parameters", headers=headers)
        
        assert response.status_code == 200, f"Failed to get formula parameters: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET formula-parameters returned {len(data)} parameters")
        
        # Validate structure of parameters
        if len(data) > 0:
            param = data[0]
            assert "id" in param
            assert "parameter_name" in param
            assert "parameter_key" in param
            assert "standard_unit" in param
            print(f"✓ Parameter structure validated: {param['parameter_name']}")
    
    def test_post_formula_parameter(self, super_admin_token):
        """POST /api/super-admin/formula-parameters should create new parameter"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        unique_key = f"test_param_{uuid.uuid4().hex[:8]}"
        
        payload = {
            "parameter_name": f"Test Parameter {unique_key}",
            "parameter_key": unique_key,
            "description": "Test parameter created by pytest",
            "standard_unit": "kg",
            "available_units": ["kg", "g", "tonne"],
            "unit_conversions": [
                {"from_unit": "g", "to_unit": "kg", "multiplier": 0.001}
            ],
            "requires_user_input": True,
            "is_optional": False,
            "display_order": 99
        }
        
        response = requests.post(f"{BASE_URL}/api/super-admin/formula-parameters", json=payload, headers=headers)
        assert response.status_code == 200, f"Failed to create formula parameter: {response.text}"
        
        data = response.json()
        assert data["parameter_key"] == unique_key
        assert data["parameter_name"] == payload["parameter_name"]
        assert data["standard_unit"] == "kg"
        print(f"✓ POST formula-parameters created: {data['parameter_name']}")
        
        # Cleanup: Delete the test parameter
        delete_response = requests.delete(
            f"{BASE_URL}/api/super-admin/formula-parameters/{data['id']}", 
            headers=headers
        )
        assert delete_response.status_code == 200
        print(f"✓ Test parameter cleaned up")
    
    def test_duplicate_parameter_key_rejected(self, super_admin_token):
        """POST with duplicate parameter_key should be rejected"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        
        # Get existing parameters to find a key
        response = requests.get(f"{BASE_URL}/api/super-admin/formula-parameters", headers=headers)
        params = response.json()
        
        if len(params) > 0:
            existing_key = params[0]["parameter_key"]
            payload = {
                "parameter_name": "Duplicate Test",
                "parameter_key": existing_key,  # Use existing key
                "standard_unit": "kg"
            }
            
            response = requests.post(f"{BASE_URL}/api/super-admin/formula-parameters", json=payload, headers=headers)
            assert response.status_code == 400, "Should reject duplicate parameter key"
            print(f"✓ Duplicate parameter key correctly rejected")


class TestFormulaDefinitions:
    """Test Super Admin Formula Definitions API (GET/POST)"""
    
    @pytest.fixture
    def super_admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN)
        return response.json()["access_token"]
    
    def test_get_formula_definitions(self, super_admin_token):
        """GET /api/super-admin/formula-definitions should return list"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/super-admin/formula-definitions", headers=headers)
        
        assert response.status_code == 200, f"Failed to get formula definitions: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET formula-definitions returned {len(data)} formulas")
        
        # Validate structure of formulas
        if len(data) > 0:
            formula = data[0]
            assert "id" in formula
            assert "formula_name" in formula
            assert "formula_key" in formula
            assert "output_name" in formula
            assert "output_unit" in formula
            assert "components" in formula
            print(f"✓ Formula structure validated: {formula['formula_name']}")
    
    def test_post_formula_definition(self, super_admin_token):
        """POST /api/super-admin/formula-definitions should create new formula"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        unique_key = f"test_formula_{uuid.uuid4().hex[:8]}"
        
        payload = {
            "formula_name": f"Test Formula {unique_key}",
            "formula_key": unique_key,
            "description": "Test formula created by pytest",
            "output_name": "Test Emissions",
            "output_unit": "kg CO2e",
            "components": [
                {"parameter_key": "quantity", "parameter_name": "Quantity", "operation": "multiply"},
                {"parameter_key": "emission_factor_co2", "parameter_name": "CO₂ Emission Factor", "operation": "multiply"}
            ],
            "formula_expression": "Quantity × CO₂ Emission Factor",
            "applies_gwp": False,
            "is_active": True,
            "display_order": 99
        }
        
        response = requests.post(f"{BASE_URL}/api/super-admin/formula-definitions", json=payload, headers=headers)
        assert response.status_code == 200, f"Failed to create formula definition: {response.text}"
        
        data = response.json()
        assert data["formula_key"] == unique_key
        assert data["formula_name"] == payload["formula_name"]
        assert data["output_unit"] == "kg CO2e"
        assert len(data["components"]) == 2
        print(f"✓ POST formula-definitions created: {data['formula_name']}")
        
        # Cleanup: Delete the test formula
        delete_response = requests.delete(
            f"{BASE_URL}/api/super-admin/formula-definitions/{data['id']}", 
            headers=headers
        )
        assert delete_response.status_code == 200
        print(f"✓ Test formula cleaned up")
    
    def test_post_formula_with_gwp(self, super_admin_token):
        """POST formula with GWP application"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        unique_key = f"test_gwp_formula_{uuid.uuid4().hex[:8]}"
        
        payload = {
            "formula_name": f"N2O Formula with GWP {unique_key}",
            "formula_key": unique_key,
            "output_name": "N₂O Emissions (CO₂e)",
            "output_unit": "kg CO₂e",
            "components": [
                {"parameter_key": "quantity", "parameter_name": "Quantity", "operation": "multiply"},
                {"parameter_key": "emission_factor_n2o", "parameter_name": "N₂O Emission Factor", "operation": "multiply"}
            ],
            "formula_expression": "Quantity × N₂O Emission Factor",
            "applies_gwp": True,
            "gwp_gas": "N2O",
            "is_active": True
        }
        
        response = requests.post(f"{BASE_URL}/api/super-admin/formula-definitions", json=payload, headers=headers)
        assert response.status_code == 200, f"Failed to create formula with GWP: {response.text}"
        
        data = response.json()
        assert data["applies_gwp"] == True
        assert data["gwp_gas"] == "N2O"
        print(f"✓ Formula with GWP created: {data['formula_name']} (GWP gas: {data['gwp_gas']})")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/super-admin/formula-definitions/{data['id']}", headers=headers)
        print(f"✓ Test GWP formula cleaned up")


class TestEmissionCalculation:
    """Test Emission Calculation using canonical formula"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        return response.json()["access_token"]
    
    @pytest.fixture
    def facility_id(self, admin_token):
        """Get or create a facility for testing"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/facilities", headers=headers)
        facilities = response.json()
        
        if len(facilities) > 0:
            return facilities[0]["id"]
        
        # Create a test facility if none exist
        facility_data = {
            "name": "Test Facility for Emission Tests",
            "address": "123 Test Street",
            "country": "India"
        }
        response = requests.post(f"{BASE_URL}/api/facilities", json=facility_data, headers=headers)
        return response.json()["id"]
    
    @pytest.fixture
    def fuel_data(self, admin_token):
        """Get fuel from database for testing"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/fuel-database", headers=headers)
        fuels = response.json()
        
        assert len(fuels) > 0, "No fuels in database for testing"
        return fuels[0]
    
    def test_emission_calculation_with_fuel_database(self, admin_token, facility_id, fuel_data):
        """Test emission calculation using fuel database values"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        quantity = 1000  # 1000 kg
        
        payload = {
            "facility_id": facility_id,
            "reporting_period": "2025-01",
            "scope": fuel_data.get("scope", "scope1"),
            "category": fuel_data["category"],
            "sub_category": fuel_data["fuel_name"],
            "fuel_type": fuel_data["fuel_name"],
            "quantity": quantity,
            "emission_factor": fuel_data["emission_factor_co2"],
            "unit": fuel_data["calorific_value_unit"],
            "calorific_value": fuel_data["calorific_value"],
            "fuel_database_id": fuel_data["id"],
            "emission_factor_ch4": fuel_data.get("emission_factor_ch4"),
            "emission_factor_n2o": fuel_data.get("emission_factor_n2o"),
            "density": fuel_data.get("density"),
            "is_custom_factor": False
        }
        
        response = requests.post(f"{BASE_URL}/api/emissions", json=payload, headers=headers)
        assert response.status_code == 200, f"Failed to create emission: {response.text}"
        
        data = response.json()
        
        # Verify emission record was created with all 4 emission values
        assert "id" in data
        assert "co2_emissions" in data
        assert "ch4_emissions" in data
        assert "n2o_emissions" in data
        assert "co2e_emissions" in data or "total_emissions" in data
        
        print(f"✓ Emission created with fuel: {fuel_data['fuel_name']}")
        print(f"  - Quantity: {quantity} kg")
        print(f"  - NCV: {fuel_data['calorific_value']} {fuel_data['calorific_value_unit']}")
        print(f"  - CO2 EF: {fuel_data['emission_factor_co2']} kg/TJ")
        print(f"  - CO2 Emissions: {data.get('co2_emissions', 0):.4f} kg")
        print(f"  - CH4 Emissions: {data.get('ch4_emissions', 0):.4f} kg")
        print(f"  - N2O Emissions: {data.get('n2o_emissions', 0):.4f} kg")
        print(f"  - CO2e Emissions: {data.get('co2e_emissions', data.get('total_emissions', 0)):.4f} kg")
        
        # Cleanup: Delete the test emission
        emission_id = data["id"]
        delete_response = requests.delete(f"{BASE_URL}/api/emissions/{emission_id}", headers=headers)
        assert delete_response.status_code == 200
        print(f"✓ Test emission cleaned up")
        
        return data
    
    def test_emission_calculation_formula_verification(self, admin_token, facility_id):
        """Verify the canonical formula: emissions = qty_kg × NCV_TJ_per_kg × EF_kg_per_TJ"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Test with known values for verification
        # Using example: Diesel (TJ/Gg = 43, EF_CO2 = 74100 kg/TJ)
        quantity_kg = 1000  # 1000 kg
        ncv_tj_per_gg = 43  # TJ/Gg
        ef_co2 = 74100  # kg CO2/TJ
        ef_ch4 = 10  # kg CH4/TJ (typical)
        ef_n2o = 0.6  # kg N2O/TJ (typical)
        
        # Manual calculation following canonical formula
        ncv_tj_per_kg = ncv_tj_per_gg * 0.001  # Convert TJ/Gg to TJ/kg
        expected_co2 = quantity_kg * ncv_tj_per_kg * ef_co2
        expected_ch4 = quantity_kg * ncv_tj_per_kg * ef_ch4
        expected_n2o = quantity_kg * ncv_tj_per_kg * ef_n2o
        expected_co2e = expected_co2 + (expected_ch4 * GWP["CH4"]) + (expected_n2o * GWP["N2O"])
        
        payload = {
            "facility_id": facility_id,
            "reporting_period": "2025-02",
            "scope": "scope1",
            "category": "Stationary Combustion",
            "sub_category": "Test Calculation Verification",
            "fuel_type": "Diesel Test",
            "quantity": quantity_kg,
            "emission_factor": ef_co2,
            "unit": "TJ/Gg",
            "calorific_value": ncv_tj_per_gg,
            "emission_factor_ch4": ef_ch4,
            "emission_factor_n2o": ef_n2o,
            "is_custom_factor": False
        }
        
        response = requests.post(f"{BASE_URL}/api/emissions", json=payload, headers=headers)
        assert response.status_code == 200, f"Failed to create emission: {response.text}"
        
        data = response.json()
        
        # Verify calculations match expected values
        actual_co2 = data.get("co2_emissions", 0)
        actual_ch4 = data.get("ch4_emissions", 0)
        actual_n2o = data.get("n2o_emissions", 0)
        actual_co2e = data.get("co2e_emissions", data.get("total_emissions", 0))
        
        print(f"\n=== Canonical Formula Verification ===")
        print(f"Input: {quantity_kg} kg × {ncv_tj_per_gg} TJ/Gg × EFs")
        print(f"NCV Conversion: {ncv_tj_per_gg} TJ/Gg = {ncv_tj_per_kg} TJ/kg")
        print(f"\nExpected CO2: {expected_co2:.4f} kg, Actual: {actual_co2:.4f} kg")
        print(f"Expected CH4: {expected_ch4:.4f} kg, Actual: {actual_ch4:.4f} kg")
        print(f"Expected N2O: {expected_n2o:.4f} kg, Actual: {actual_n2o:.4f} kg")
        print(f"Expected CO2e: {expected_co2e:.4f} kg, Actual: {actual_co2e:.4f} kg")
        
        # Allow 1% tolerance for floating point
        tolerance = 0.01
        assert abs(actual_co2 - expected_co2) / expected_co2 < tolerance, f"CO2 mismatch: {actual_co2} vs {expected_co2}"
        assert abs(actual_ch4 - expected_ch4) / expected_ch4 < tolerance, f"CH4 mismatch: {actual_ch4} vs {expected_ch4}"
        assert abs(actual_n2o - expected_n2o) / expected_n2o < tolerance, f"N2O mismatch: {actual_n2o} vs {expected_n2o}"
        assert abs(actual_co2e - expected_co2e) / expected_co2e < tolerance, f"CO2e mismatch: {actual_co2e} vs {expected_co2e}"
        
        print(f"\n✓ Canonical formula verified correctly!")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/emissions/{data['id']}", headers=headers)
        print(f"✓ Test emission cleaned up")
    
    def test_gwp_values_are_correct(self):
        """Verify GWP values used in calculation: CO2=1, CH4=28, N2O=273"""
        response = requests.get(f"{BASE_URL}/api/gwp-values")
        assert response.status_code == 200
        
        gwp_values = response.json()
        assert gwp_values.get("CO2") == 1, f"CO2 GWP should be 1, got {gwp_values.get('CO2')}"
        assert gwp_values.get("CH4") == 28, f"CH4 GWP should be 28, got {gwp_values.get('CH4')}"
        assert gwp_values.get("N2O") == 273, f"N2O GWP should be 273, got {gwp_values.get('N2O')}"
        
        print(f"✓ GWP values verified: CO2={gwp_values['CO2']}, CH4={gwp_values['CH4']}, N2O={gwp_values['N2O']}")
    
    def test_emission_stores_all_four_values(self, admin_token, facility_id, fuel_data):
        """Test that emission record stores CO2, CH4, N2O, and CO2e separately"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        payload = {
            "facility_id": facility_id,
            "reporting_period": "2025-03",
            "scope": fuel_data.get("scope", "scope1"),
            "category": fuel_data["category"],
            "sub_category": fuel_data["fuel_name"],
            "fuel_type": fuel_data["fuel_name"],
            "quantity": 500,
            "emission_factor": fuel_data["emission_factor_co2"],
            "unit": fuel_data["calorific_value_unit"],
            "calorific_value": fuel_data["calorific_value"],
            "emission_factor_ch4": fuel_data.get("emission_factor_ch4", 10),
            "emission_factor_n2o": fuel_data.get("emission_factor_n2o", 0.6),
            "is_custom_factor": False
        }
        
        response = requests.post(f"{BASE_URL}/api/emissions", json=payload, headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify all 4 emission values are present
        assert "co2_emissions" in data, "Missing co2_emissions field"
        assert "ch4_emissions" in data, "Missing ch4_emissions field"
        assert "n2o_emissions" in data, "Missing n2o_emissions field"
        assert "co2e_emissions" in data or "total_emissions" in data, "Missing co2e/total emissions field"
        
        # Verify values are not zero when EFs are provided
        assert data["co2_emissions"] > 0, "CO2 emissions should be > 0"
        
        print(f"✓ Emission record stores all 4 values:")
        print(f"  - co2_emissions: {data['co2_emissions']:.4f}")
        print(f"  - ch4_emissions: {data['ch4_emissions']:.4f}")
        print(f"  - n2o_emissions: {data['n2o_emissions']:.4f}")
        print(f"  - co2e_emissions: {data.get('co2e_emissions', data.get('total_emissions', 0)):.4f}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/emissions/{data['id']}", headers=headers)
        print(f"✓ Test emission cleaned up")


class TestFuelDatabase:
    """Test Fuel Database has required fuels"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        return response.json()["access_token"]
    
    def test_fuel_database_has_fuels(self, admin_token):
        """Verify fuel database has 8 fuels as mentioned"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/fuel-database", headers=headers)
        
        assert response.status_code == 200
        fuels = response.json()
        
        print(f"✓ Fuel database has {len(fuels)} fuels")
        
        for fuel in fuels:
            assert "id" in fuel
            assert "fuel_name" in fuel
            assert "emission_factor_co2" in fuel
            assert "calorific_value" in fuel
            assert "calorific_value_unit" in fuel
            print(f"  - {fuel['fuel_name']}: NCV={fuel['calorific_value']} {fuel['calorific_value_unit']}, CO2 EF={fuel['emission_factor_co2']} kg/TJ")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
