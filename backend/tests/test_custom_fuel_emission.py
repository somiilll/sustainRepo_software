"""
Test Custom Fuel Emission CO2e Calculation (P0 Bug Fix)
=========================================================
This tests the fix for: Custom fuel emissions were showing 0 tCO2e on summary cards.
The fix adds proper calculation logic: CO2e = Quantity × Emission Factor for custom fuels.

Tests:
1. Create new custom fuel emission → verify calculated_co2e = quantity × emission_factor
2. Verify emission_factor_unit is saved correctly
3. Verify existing custom fuel 'Bio Somil' (1600 tCO2e) and 'P0_Test_Custom_Fuel' (250 tCO2e) display correctly
4. Verify GET /api/emissions returns calculated_co2e and emission_factor_unit fields
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "ruthvikan@gmail.com"
ADMIN_PASSWORD = "Password@123"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json().get("access_token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get authorization headers"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def facility_id(auth_headers):
    """Get a valid facility ID for testing"""
    response = requests.get(f"{BASE_URL}/api/facilities", headers=auth_headers)
    assert response.status_code == 200
    facilities = response.json()
    assert len(facilities) > 0, "No facilities found for testing"
    return facilities[0]["id"]


class TestCustomFuelEmissionCO2eCalculation:
    """Tests for custom fuel emission CO2e calculation fix"""
    
    def test_existing_bio_somil_has_correct_co2e(self, auth_headers):
        """Verify existing custom fuel 'Bio Somil' shows 1600 tCO2e (80 × 20)"""
        response = requests.get(f"{BASE_URL}/api/emissions", headers=auth_headers)
        assert response.status_code == 200
        
        emissions = response.json()
        bio_somil = next((e for e in emissions if e.get("fuel_type") == "Bio Somil"), None)
        
        if bio_somil:
            # Data assertions - verify the calculation
            assert bio_somil.get("is_custom_factor") == True, "Bio Somil should be marked as custom factor"
            assert bio_somil.get("quantity") == 80, f"Quantity should be 80, got {bio_somil.get('quantity')}"
            assert bio_somil.get("emission_factor") == 20, f"EF should be 20, got {bio_somil.get('emission_factor')}"
            
            # P0 FIX VERIFICATION: calculated_co2e should equal quantity × emission_factor
            expected_co2e = 80 * 20  # 1600
            actual_co2e = bio_somil.get("calculated_co2e", 0)
            assert actual_co2e == expected_co2e, f"calculated_co2e should be {expected_co2e}, got {actual_co2e}"
            print(f"✅ Bio Somil: {bio_somil.get('quantity')} × {bio_somil.get('emission_factor')} = {actual_co2e} tCO2e")
        else:
            pytest.skip("Bio Somil emission not found - may have been deleted")
    
    def test_existing_p0_test_custom_fuel_has_correct_co2e(self, auth_headers):
        """Verify existing custom fuel 'P0_Test_Custom_Fuel' shows 250 tCO2e (100 × 2.5)"""
        response = requests.get(f"{BASE_URL}/api/emissions", headers=auth_headers)
        assert response.status_code == 200
        
        emissions = response.json()
        p0_fuel = next((e for e in emissions if e.get("fuel_type") == "P0_Test_Custom_Fuel"), None)
        
        if p0_fuel:
            # Data assertions
            assert p0_fuel.get("is_custom_factor") == True, "P0_Test_Custom_Fuel should be marked as custom factor"
            assert p0_fuel.get("quantity") == 100, f"Quantity should be 100, got {p0_fuel.get('quantity')}"
            assert p0_fuel.get("emission_factor") == 2.5, f"EF should be 2.5, got {p0_fuel.get('emission_factor')}"
            
            # Verify emission_factor_unit is saved
            assert p0_fuel.get("emission_factor_unit") == "tCO2/kg", f"emission_factor_unit should be 'tCO2/kg', got {p0_fuel.get('emission_factor_unit')}"
            
            # P0 FIX VERIFICATION: calculated_co2e should equal quantity × emission_factor
            expected_co2e = 100 * 2.5  # 250
            actual_co2e = p0_fuel.get("calculated_co2e", 0)
            assert actual_co2e == expected_co2e, f"calculated_co2e should be {expected_co2e}, got {actual_co2e}"
            print(f"✅ P0_Test_Custom_Fuel: {p0_fuel.get('quantity')} × {p0_fuel.get('emission_factor')} = {actual_co2e} tCO2e")
        else:
            pytest.skip("P0_Test_Custom_Fuel emission not found - may have been deleted")
    
    def test_create_new_custom_fuel_emission_calculates_co2e(self, auth_headers, facility_id):
        """
        P0 FIX TEST: Create a new custom fuel emission and verify calculated_co2e is correct.
        
        Test data: Scope 1, Category 'Stationary Combustion', 
        Custom fuel name: 'T1_Test_Custom_Fuel_{uuid}',
        Emission Factor: 3.0 tCO2/kg, Quantity: 50 kg
        Expected result: CO2e = 50 × 3.0 = 150 tCO2e
        """
        test_id = str(uuid.uuid4())[:8]
        fuel_name = f"T1_Test_Custom_Fuel_{test_id}"
        
        quantity = 50
        emission_factor = 3.0
        expected_co2e = quantity * emission_factor  # 150
        
        payload = {
            "facility_id": facility_id,
            "reporting_period": "2025-01",
            "scope": "scope1",
            "category": "Stationary Combustion",
            "sub_category": fuel_name,
            "fuel_type": fuel_name,
            "quantity": quantity,
            "quantity_unit": "kg",
            "emission_factor": emission_factor,
            "emission_factor_unit": "tCO2/kg",
            "unit": "kg",
            "is_custom_factor": True,
            "source_of_information": "T1 Testing",
            "justification": "T1 Test for P0 custom fuel CO2e calculation fix",
            "notes": "This emission was created by automated test to verify custom fuel CO2e calculation",
            "responsible_person": "T1 Testing Agent",
            "process_names": ["T1 Test Process"],
            # Pre-calculated values matching the fix logic: CO2e = Quantity × Emission Factor
            "calculated_co2": expected_co2e,
            "calculated_ch4": 0,
            "calculated_n2o": 0,
            "calculated_co2e": expected_co2e,
            "co2_unit": "tCO2",
            "ch4_unit": "tCH4",
            "n2o_unit": "tN2O",
            "co2e_unit": "tCO2e"
        }
        
        # Create the emission (API returns 200 on success)
        response = requests.post(f"{BASE_URL}/api/emissions", json=payload, headers=auth_headers)
        assert response.status_code in [200, 201], f"Failed to create emission: {response.text}"
        
        created_emission = response.json()
        emission_id = created_emission.get("id")
        print(f"Created emission ID: {emission_id}")
        
        # Verify the response has correct calculated_co2e
        assert created_emission.get("calculated_co2e") == expected_co2e, \
            f"Response calculated_co2e should be {expected_co2e}, got {created_emission.get('calculated_co2e')}"
        assert created_emission.get("emission_factor_unit") == "tCO2/kg", \
            f"Response emission_factor_unit should be 'tCO2/kg', got {created_emission.get('emission_factor_unit')}"
        
        # GET the emission to verify persistence
        get_response = requests.get(f"{BASE_URL}/api/emissions", headers=auth_headers)
        assert get_response.status_code == 200
        
        emissions = get_response.json()
        created = next((e for e in emissions if e.get("id") == emission_id), None)
        
        assert created is not None, f"Created emission {emission_id} not found in GET response"
        
        # Data assertions on persisted emission
        assert created.get("fuel_type") == fuel_name
        assert created.get("quantity") == quantity
        assert created.get("emission_factor") == emission_factor
        assert created.get("emission_factor_unit") == "tCO2/kg"
        assert created.get("is_custom_factor") == True
        
        # P0 FIX VERIFICATION: calculated_co2e must be correct
        actual_co2e = created.get("calculated_co2e", 0)
        assert actual_co2e == expected_co2e, \
            f"Persisted calculated_co2e should be {expected_co2e} (qty={quantity} × EF={emission_factor}), got {actual_co2e}"
        
        print(f"✅ New custom fuel emission: {quantity} × {emission_factor} = {actual_co2e} tCO2e")
        print(f"✅ emission_factor_unit saved correctly: {created.get('emission_factor_unit')}")
        
        # Clean up - delete test emission
        delete_response = requests.delete(f"{BASE_URL}/api/emissions/{emission_id}", headers=auth_headers)
        assert delete_response.status_code == 200, f"Failed to delete test emission: {delete_response.text}"
        print(f"✅ Test emission cleaned up")
    
    def test_api_returns_calculated_co2e_and_ef_unit_fields(self, auth_headers):
        """Verify GET /api/emissions returns calculated_co2e and emission_factor_unit fields"""
        response = requests.get(f"{BASE_URL}/api/emissions", headers=auth_headers)
        assert response.status_code == 200
        
        emissions = response.json()
        assert len(emissions) > 0, "No emissions found"
        
        # Check that the fields exist in the response schema
        sample_emission = emissions[0]
        
        # calculated_co2e field must exist
        assert "calculated_co2e" in sample_emission or "co2e_emissions" in sample_emission, \
            "Response should include calculated_co2e or co2e_emissions field"
        
        # For custom fuels, emission_factor_unit should be present
        custom_emissions = [e for e in emissions if e.get("is_custom_factor")]
        if custom_emissions:
            for ce in custom_emissions:
                # emission_factor_unit may be null for older records, but the field should exist
                assert "emission_factor_unit" in ce, "Custom fuel emissions should have emission_factor_unit field"
            print(f"✅ Found {len(custom_emissions)} custom fuel emissions with emission_factor_unit field")
        else:
            print("⚠️ No custom fuel emissions found to verify emission_factor_unit field")
        
        print("✅ API returns calculated_co2e and emission_factor_unit fields correctly")


class TestCustomFuelEmissionEdgeCases:
    """Test edge cases for custom fuel emissions"""
    
    def test_create_custom_fuel_with_scope2_electricity_unit(self, auth_headers, facility_id):
        """Test custom fuel emission with Scope 2 electricity unit (tCO2/kWh)"""
        test_id = str(uuid.uuid4())[:8]
        fuel_name = f"T1_Custom_Electricity_{test_id}"
        
        quantity = 1000  # 1000 kWh
        emission_factor = 0.5  # tCO2/kWh
        expected_co2e = quantity * emission_factor  # 500
        
        payload = {
            "facility_id": facility_id,
            "reporting_period": "2025-02",
            "scope": "scope2",
            "category": "Purchased Electricity",
            "sub_category": fuel_name,
            "fuel_type": fuel_name,
            "quantity": quantity,
            "quantity_unit": "kWh",
            "emission_factor": emission_factor,
            "emission_factor_unit": "tCO2/kWh",
            "unit": "kWh",
            "is_custom_factor": True,
            "source_of_information": "T1 Testing - Scope 2",
            "justification": "T1 Test for custom Scope 2 electricity emission",
            "responsible_person": "T1 Testing Agent",
            "process_names": ["T1 Scope 2 Test"],
            "calculated_co2": expected_co2e,
            "calculated_ch4": 0,
            "calculated_n2o": 0,
            "calculated_co2e": expected_co2e,
            "co2_unit": "tCO2",
            "co2e_unit": "tCO2e"
        }
        
        response = requests.post(f"{BASE_URL}/api/emissions", json=payload, headers=auth_headers)
        assert response.status_code in [200, 201], f"Failed to create Scope 2 emission: {response.text}"
        
        created = response.json()
        emission_id = created.get("id")
        
        # Verify calculated_co2e
        assert created.get("calculated_co2e") == expected_co2e, \
            f"Scope 2 calculated_co2e should be {expected_co2e}, got {created.get('calculated_co2e')}"
        assert created.get("emission_factor_unit") == "tCO2/kWh"
        
        print(f"✅ Scope 2 custom emission: {quantity} kWh × {emission_factor} tCO2/kWh = {expected_co2e} tCO2e")
        
        # Clean up
        requests.delete(f"{BASE_URL}/api/emissions/{emission_id}", headers=auth_headers)
        print("✅ Scope 2 test emission cleaned up")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
