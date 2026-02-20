"""
Test suite for Admin Emission Data Issues - Iteration 21
Testing:
1. Delete emission functionality (DELETE /api/emissions/{id})
2. Fuel database API for categories and fuels
3. Formula definitions API
4. Quantity unit options

Run: pytest /app/backend/tests/test_emission_admin_features.py -v --tb=short
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials
ADMIN_EMAIL = "admin@ghg.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin_auth():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    data = response.json()
    assert "access_token" in data
    return {
        "token": data["access_token"],
        "user": data["user"]
    }


@pytest.fixture(scope="module")
def admin_headers(admin_auth):
    """Get admin auth headers"""
    return {
        "Authorization": f"Bearer {admin_auth['token']}",
        "Content-Type": "application/json"
    }


class TestFuelDatabaseAPI:
    """Test fuel database API for category and fuel selection"""
    
    def test_get_fuel_database(self, admin_headers):
        """Verify fuel database API returns list of fuels"""
        response = requests.get(f"{BASE_URL}/api/fuel-database", headers=admin_headers)
        assert response.status_code == 200, f"Failed to get fuel database: {response.text}"
        fuels = response.json()
        assert isinstance(fuels, list), "Fuel database should return a list"
        print(f"✓ Fuel database API returned {len(fuels)} fuels")
        
        if len(fuels) > 0:
            # Verify fuel structure has required fields for category/fuel selection
            fuel = fuels[0]
            assert "id" in fuel, "Fuel should have id"
            assert "fuel_name" in fuel, "Fuel should have fuel_name"
            assert "category" in fuel, "Fuel should have category"
            assert "scope" in fuel, "Fuel should have scope"
            print(f"✓ First fuel: {fuel.get('fuel_name')} in category {fuel.get('category')}")
    
    def test_fuels_have_categories(self, admin_headers):
        """Verify fuels have categories that can be used for Step 1 selection"""
        response = requests.get(f"{BASE_URL}/api/fuel-database", headers=admin_headers)
        assert response.status_code == 200
        fuels = response.json()
        
        if len(fuels) > 0:
            categories = set()
            for fuel in fuels:
                if fuel.get("category"):
                    categories.add(fuel["category"])
            
            print(f"✓ Found {len(categories)} unique categories: {categories}")
            assert len(categories) > 0, "Should have at least one category"
    
    def test_fuels_have_emission_factors(self, admin_headers):
        """Verify fuels have emission factors for calculation"""
        response = requests.get(f"{BASE_URL}/api/fuel-database", headers=admin_headers)
        assert response.status_code == 200
        fuels = response.json()
        
        if len(fuels) > 0:
            fuel = fuels[0]
            # Check emission factor fields
            assert "emission_factor_co2" in fuel, "Fuel should have CO2 emission factor"
            print(f"✓ Fuel '{fuel.get('fuel_name')}' has CO2 EF: {fuel.get('emission_factor_co2')}")
            
            # CH4 and N2O may be optional
            if fuel.get("emission_factor_ch4") is not None:
                print(f"  - CH4 EF: {fuel.get('emission_factor_ch4')}")
            if fuel.get("emission_factor_n2o") is not None:
                print(f"  - N2O EF: {fuel.get('emission_factor_n2o')}")


class TestFormulaDefinitionsAPI:
    """Test formula definitions API - formulas should come from Super Admin"""
    
    def test_get_formula_definitions(self, admin_headers):
        """Verify formula definitions API returns list of formulas"""
        response = requests.get(f"{BASE_URL}/api/formula-definitions", headers=admin_headers)
        assert response.status_code == 200, f"Failed to get formula definitions: {response.text}"
        formulas = response.json()
        assert isinstance(formulas, list), "Formula definitions should return a list"
        print(f"✓ Formula definitions API returned {len(formulas)} formulas")
        
        if len(formulas) > 0:
            formula = formulas[0]
            assert "id" in formula, "Formula should have id"
            assert "formula_name" in formula, "Formula should have formula_name"
            assert "is_active" in formula, "Formula should have is_active flag"
            print(f"✓ First formula: {formula.get('formula_name')} (active: {formula.get('is_active')})")
    
    def test_formula_has_components(self, admin_headers):
        """Verify formulas have components for determining calculation parameters"""
        response = requests.get(f"{BASE_URL}/api/formula-definitions", headers=admin_headers)
        assert response.status_code == 200
        formulas = response.json()
        
        if len(formulas) > 0:
            formula = formulas[0]
            # Components define what parameters are in the formula
            components = formula.get("components", [])
            print(f"✓ Formula '{formula.get('formula_name')}' has {len(components)} components")
            
            if len(components) > 0:
                for comp in components:
                    print(f"  - {comp.get('parameter_name', 'unknown')} ({comp.get('operation', 'multiply')})")


class TestEmissionsCRUD:
    """Test emissions CRUD operations including DELETE"""
    
    def test_get_facilities(self, admin_headers):
        """Get facilities to use for creating test emission"""
        response = requests.get(f"{BASE_URL}/api/facilities", headers=admin_headers)
        assert response.status_code == 200, f"Failed to get facilities: {response.text}"
        facilities = response.json()
        assert len(facilities) > 0, "Should have at least one facility"
        return facilities[0]["id"]
    
    def test_create_and_delete_emission(self, admin_headers):
        """Test full create and delete emission flow"""
        # First get a facility
        facilities_response = requests.get(f"{BASE_URL}/api/facilities", headers=admin_headers)
        assert facilities_response.status_code == 200
        facilities = facilities_response.json()
        if len(facilities) == 0:
            pytest.skip("No facilities available for testing")
        
        facility_id = facilities[0]["id"]
        
        # Create a test emission record
        test_emission_data = {
            "facility_id": facility_id,
            "reporting_period": "2026-01",
            "scope": "scope1",
            "category": "TEST_Delete_Category",
            "sub_category": "TEST_Delete_SubCategory",
            "fuel_type": "Test Fuel for Deletion",
            "quantity": 100.0,
            "emission_factor": 2.5,
            "unit": "kg CO2e/kg",
            "is_custom_factor": True,
            "source_of_information": "Test data",
            "notes": "Test emission for deletion test"
        }
        
        # CREATE emission
        create_response = requests.post(
            f"{BASE_URL}/api/emissions",
            json=test_emission_data,
            headers=admin_headers
        )
        assert create_response.status_code == 200, f"Failed to create emission: {create_response.text}"
        created_emission = create_response.json()
        emission_id = created_emission["id"]
        print(f"✓ Created test emission with ID: {emission_id}")
        
        # Verify the emission exists via GET
        get_response = requests.get(f"{BASE_URL}/api/emissions", headers=admin_headers)
        assert get_response.status_code == 200
        emissions = get_response.json()
        emission_ids = [e["id"] for e in emissions]
        assert emission_id in emission_ids, "Created emission should be in emissions list"
        print(f"✓ Verified emission exists in GET /api/emissions")
        
        # DELETE emission
        delete_response = requests.delete(
            f"{BASE_URL}/api/emissions/{emission_id}",
            headers=admin_headers
        )
        assert delete_response.status_code == 200, f"Failed to delete emission: {delete_response.text}"
        delete_result = delete_response.json()
        assert "deleted" in delete_result.get("message", "").lower() or "success" in delete_result.get("message", "").lower(), \
            f"Delete response should confirm deletion: {delete_result}"
        print(f"✓ DELETE /api/emissions/{emission_id} returned success")
        
        # Verify the emission is gone
        get_response_after = requests.get(f"{BASE_URL}/api/emissions", headers=admin_headers)
        assert get_response_after.status_code == 200
        emissions_after = get_response_after.json()
        emission_ids_after = [e["id"] for e in emissions_after]
        assert emission_id not in emission_ids_after, "Deleted emission should not be in emissions list"
        print(f"✓ Verified emission no longer exists after deletion")
    
    def test_delete_nonexistent_emission_returns_404(self, admin_headers):
        """Test that deleting a non-existent emission returns 404"""
        fake_id = "nonexistent-id-12345"
        response = requests.delete(
            f"{BASE_URL}/api/emissions/{fake_id}",
            headers=admin_headers
        )
        assert response.status_code == 404, f"Expected 404 for nonexistent emission, got {response.status_code}"
        print(f"✓ DELETE nonexistent emission correctly returns 404")


class TestQuantityUnitsSupport:
    """Test that emissions support quantity units"""
    
    def test_emission_response_has_unit_field(self, admin_headers):
        """Verify emission records have unit field"""
        response = requests.get(f"{BASE_URL}/api/emissions", headers=admin_headers)
        assert response.status_code == 200
        emissions = response.json()
        
        if len(emissions) > 0:
            emission = emissions[0]
            # Unit field should be in the response model
            assert "unit" in emission, "Emission should have unit field"
            print(f"✓ Emission record has unit field: {emission.get('unit')}")
    
    def test_create_emission_with_unit(self, admin_headers):
        """Test creating emission with specific quantity unit"""
        # Get facility
        facilities_response = requests.get(f"{BASE_URL}/api/facilities", headers=admin_headers)
        assert facilities_response.status_code == 200
        facilities = facilities_response.json()
        if len(facilities) == 0:
            pytest.skip("No facilities available")
        
        facility_id = facilities[0]["id"]
        
        # Create emission with specific unit
        test_data = {
            "facility_id": facility_id,
            "reporting_period": "2026-01",
            "scope": "scope1",
            "category": "TEST_Unit_Category",
            "sub_category": "TEST_Unit_SubCategory",
            "fuel_type": "Test Fuel with Unit",
            "quantity": 500.0,
            "emission_factor": 2.0,
            "unit": "kg",  # Using kg unit
            "is_custom_factor": True,
            "notes": "Testing quantity unit support"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/emissions",
            json=test_data,
            headers=admin_headers
        )
        assert create_response.status_code == 200, f"Failed to create emission with unit: {create_response.text}"
        emission = create_response.json()
        print(f"✓ Created emission with unit: {emission.get('unit')}")
        
        # Cleanup - delete the test emission
        emission_id = emission["id"]
        delete_response = requests.delete(f"{BASE_URL}/api/emissions/{emission_id}", headers=admin_headers)
        assert delete_response.status_code == 200
        print(f"✓ Cleaned up test emission")


class TestCalculatedEmissions:
    """Test emission calculation results"""
    
    def test_emission_has_gas_breakdown(self, admin_headers):
        """Verify emission records have CO2, CH4, N2O, and CO2e fields"""
        response = requests.get(f"{BASE_URL}/api/emissions", headers=admin_headers)
        assert response.status_code == 200
        emissions = response.json()
        
        if len(emissions) > 0:
            emission = emissions[0]
            # Check for gas-wise emissions (these may be 0 or None if not calculated)
            expected_fields = ["co2_emissions", "ch4_emissions", "n2o_emissions", "co2e_emissions", "total_emissions"]
            for field in expected_fields:
                assert field in emission, f"Emission should have {field} field"
            
            print(f"✓ Emission record has gas breakdown fields:")
            print(f"  - CO2: {emission.get('co2_emissions')}")
            print(f"  - CH4: {emission.get('ch4_emissions')}")
            print(f"  - N2O: {emission.get('n2o_emissions')}")
            print(f"  - CO2e: {emission.get('co2e_emissions')}")
            print(f"  - Total: {emission.get('total_emissions')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
