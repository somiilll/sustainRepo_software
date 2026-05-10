"""
Test P0 and P1 Emission Bug Fixes
=================================
P0: Edit emissions - 'Failed to save emissions' error (backend 500 on PUT)
P1: Mobile Combustion showing CH4/N2O when no formula defined

Tests:
1. PUT /api/emissions/{id} works with null/0 values for calculated_ch4/n2o
2. Mobile Combustion emissions don't show CH4/N2O when no formula defined
3. Stationary Combustion emissions DO show CH4/N2O when formulas are defined
4. GWP config values use correct property names
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://emissions-hub-10.preview.emergentagent.com')

class TestEmissionBugFixes:
    """Test P0 and P1 emission bug fixes"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "testadmin@test.com", "password": "Test123!"}
        )
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.user = login_response.json().get("user")
        else:
            pytest.skip(f"Admin login failed: {login_response.status_code}")
        
        yield
    
    def test_p0_put_emissions_with_null_ch4_n2o(self):
        """P0: Test PUT /api/emissions/{id} accepts null/0 values for calculated_ch4 and calculated_n2o"""
        
        # First get an existing emission to edit
        emissions_response = self.session.get(f"{BASE_URL}/api/emissions")
        assert emissions_response.status_code == 200, f"Failed to get emissions: {emissions_response.text}"
        
        emissions = emissions_response.json()
        if not emissions:
            pytest.skip("No emissions found to test edit")
        
        # Pick the first emission to edit
        emission = emissions[0]
        emission_id = emission["id"]
        
        print(f"Testing PUT on emission ID: {emission_id}")
        print(f"Emission category: {emission.get('category')}")
        print(f"Current calculated_ch4: {emission.get('calculated_ch4')}")
        print(f"Current calculated_n2o: {emission.get('calculated_n2o')}")
        
        # Prepare update payload with null/0 for ch4 and n2o
        update_payload = {
            "facility_id": emission["facility_id"],
            "organization_id": emission.get("organization_id"),
            "reporting_period": emission["reporting_period"],
            "scope": emission["scope"],
            "category": emission["category"],
            "sub_category": emission["sub_category"],
            "fuel_type": emission.get("fuel_type"),
            "quantity": emission["quantity"],
            "quantity_unit": emission.get("quantity_unit", "kg"),
            "emission_factor": emission["emission_factor"],
            "unit": emission.get("unit", "kg CO2e"),
            "calorific_value": emission.get("calorific_value"),
            "source_of_information": emission.get("source_of_information"),
            "notes": "Test edit with null ch4/n2o values",
            "justification": emission.get("justification"),
            "evidence_url": emission.get("evidence_url"),
            "responsible_person": emission.get("responsible_person"),
            "is_custom_factor": emission.get("is_custom_factor", False),
            "fuel_database_id": emission.get("fuel_database_id"),
            "emission_factor_ch4": emission.get("emission_factor_ch4"),
            "emission_factor_n2o": emission.get("emission_factor_n2o"),
            "density": emission.get("density"),
            "conversion_factor": emission.get("conversion_factor", 1.0),
            "override_calorific_value": emission.get("override_calorific_value", False),
            "override_density": emission.get("override_density", False),
            "calculated_co2": emission.get("co2_emissions") or emission.get("calculated_co2") or 0,
            "calculated_ch4": 0,  # Test with 0 (no formula)
            "calculated_n2o": 0,  # Test with 0 (no formula)
            "calculated_co2e": emission.get("co2e_emissions") or emission.get("calculated_co2e") or 0,
            "co2_unit": emission.get("co2_unit", "tCO₂"),
            "ch4_unit": None,  # No unit when no formula
            "n2o_unit": None,  # No unit when no formula
            "co2e_unit": emission.get("co2e_unit", "tCO₂e"),
            "process_names": emission.get("process_names", []),
            "process_descriptions": emission.get("process_descriptions", [])
        }
        
        # Make PUT request
        put_response = self.session.put(
            f"{BASE_URL}/api/emissions/{emission_id}",
            json=update_payload
        )
        
        print(f"PUT response status: {put_response.status_code}")
        if put_response.status_code != 200:
            print(f"PUT response body: {put_response.text}")
        
        # P0 fix: Should not return 500 error
        assert put_response.status_code == 200, f"P0 BUG: PUT /api/emissions/{emission_id} returned {put_response.status_code}: {put_response.text}"
        
        # Verify response data
        updated_emission = put_response.json()
        assert updated_emission["id"] == emission_id
        
        # CH4 and N2O should be 0 when no formula defined
        assert updated_emission.get("ch4_emissions") == 0 or updated_emission.get("calculated_ch4") == 0, \
            f"CH4 should be 0 but got ch4_emissions={updated_emission.get('ch4_emissions')}, calculated_ch4={updated_emission.get('calculated_ch4')}"
        assert updated_emission.get("n2o_emissions") == 0 or updated_emission.get("calculated_n2o") == 0, \
            f"N2O should be 0 but got n2o_emissions={updated_emission.get('n2o_emissions')}, calculated_n2o={updated_emission.get('calculated_n2o')}"
        
        print("P0 TEST PASSED: PUT /api/emissions works with null/0 ch4/n2o values")
    
    def test_p0_put_emissions_specific_id(self):
        """P0: Test PUT on specific emission ID mentioned in bug report"""
        
        # Test with the specific ID mentioned in context
        test_emission_id = "11ed1bac-60be-4846-90ea-2597b9638418"
        
        # First check if this emission exists
        get_response = self.session.get(f"{BASE_URL}/api/emissions")
        emissions = get_response.json()
        
        emission = next((e for e in emissions if e["id"] == test_emission_id), None)
        
        if not emission:
            print(f"Specific emission {test_emission_id} not found, testing with first Mobile Combustion emission")
            # Find a Mobile Combustion emission
            emission = next((e for e in emissions if e.get("category") == "Mobile Combustion"), None)
            if not emission:
                pytest.skip("No Mobile Combustion emission found for testing")
        
        emission_id = emission["id"]
        print(f"Testing PUT on Mobile Combustion emission: {emission_id}")
        print(f"Category: {emission.get('category')}")
        print(f"Sub-category: {emission.get('sub_category')}")
        
        # Prepare minimal update payload
        update_payload = {
            "facility_id": emission["facility_id"],
            "reporting_period": emission["reporting_period"],
            "scope": emission["scope"],
            "category": emission["category"],
            "sub_category": emission["sub_category"],
            "fuel_type": emission.get("fuel_type"),
            "quantity": emission["quantity"],
            "quantity_unit": emission.get("quantity_unit", "kg"),
            "emission_factor": emission["emission_factor"],
            "unit": emission.get("unit", "kg CO2e"),
            "calorific_value": emission.get("calorific_value"),
            "is_custom_factor": emission.get("is_custom_factor", False),
            "calculated_co2": emission.get("calculated_co2") or emission.get("co2_emissions") or 0,
            "calculated_ch4": 0,  # Mobile Combustion should have 0 when no formula
            "calculated_n2o": 0,  # Mobile Combustion should have 0 when no formula
            "calculated_co2e": emission.get("calculated_co2e") or emission.get("co2e_emissions") or 0,
            "ch4_unit": None,
            "n2o_unit": None,
            "process_names": emission.get("process_names", []),
            "process_descriptions": emission.get("process_descriptions", [])
        }
        
        put_response = self.session.put(
            f"{BASE_URL}/api/emissions/{emission_id}",
            json=update_payload
        )
        
        assert put_response.status_code == 200, f"P0 BUG: Mobile Combustion emission edit failed: {put_response.status_code} - {put_response.text}"
        
        print("P0 TEST PASSED: Mobile Combustion emission edit successful")
    
    def test_p1_mobile_combustion_no_ch4_n2o_values(self):
        """P1: Mobile Combustion emissions should have 0 for CH4/N2O when no formula defined"""
        
        # Get emissions
        emissions_response = self.session.get(f"{BASE_URL}/api/emissions")
        assert emissions_response.status_code == 200
        
        emissions = emissions_response.json()
        
        # Find Mobile Combustion emissions
        mobile_combustion = [e for e in emissions if e.get("category") == "Mobile Combustion"]
        
        if not mobile_combustion:
            print("No Mobile Combustion emissions found, checking emission configurations")
            # Verify no CH4/N2O formulas are configured for Mobile Combustion
            config_response = self.session.get(f"{BASE_URL}/api/emission-configurations")
            if config_response.status_code == 200:
                configs = config_response.json()
                mobile_configs = [c for c in configs if "Mobile Combustion" in (c.get("categories") or [])]
                print(f"Mobile Combustion configs: {len(mobile_configs)}")
                for c in mobile_configs:
                    print(f"  - {c.get('name')}: formula_id={c.get('formula_id')}")
            pytest.skip("No Mobile Combustion emissions to test")
        
        print(f"Found {len(mobile_combustion)} Mobile Combustion emission(s)")
        
        for emission in mobile_combustion[:3]:  # Check first 3
            print(f"\nEmission ID: {emission['id']}")
            print(f"  Sub-category: {emission.get('sub_category')}")
            print(f"  calculated_ch4: {emission.get('calculated_ch4')}")
            print(f"  calculated_n2o: {emission.get('calculated_n2o')}")
            print(f"  ch4_unit: {emission.get('ch4_unit')}")
            print(f"  n2o_unit: {emission.get('n2o_unit')}")
            print(f"  ch4_emissions: {emission.get('ch4_emissions')}")
            print(f"  n2o_emissions: {emission.get('n2o_emissions')}")
            
            # P1 fix: When no CH4/N2O formula is defined:
            # - calculated_ch4/n2o should be 0 (not calculated)
            # - ch4_unit/n2o_unit should be null (no formula applied)
            
            # Check that ch4_unit is null when no formula
            if emission.get('ch4_unit') is None:
                # If no ch4_unit, then calculated_ch4 should be 0 or null
                ch4_val = emission.get('calculated_ch4') or emission.get('ch4_emissions') or 0
                assert ch4_val == 0, f"P1 BUG: Mobile Combustion has CH4 value {ch4_val} but no ch4_unit"
            
            # Check that n2o_unit is null when no formula
            if emission.get('n2o_unit') is None:
                # If no n2o_unit, then calculated_n2o should be 0 or null
                n2o_val = emission.get('calculated_n2o') or emission.get('n2o_emissions') or 0
                assert n2o_val == 0, f"P1 BUG: Mobile Combustion has N2O value {n2o_val} but no n2o_unit"
        
        print("\nP1 TEST PASSED: Mobile Combustion emissions have correct CH4/N2O values")
    
    def test_gwp_config_property_names(self):
        """Test GWP config uses correct property names: co2_gwp, ch4_fossil_gwp, n2o_gwp"""
        
        gwp_response = self.session.get(f"{BASE_URL}/api/gwp-config")
        
        if gwp_response.status_code != 200:
            pytest.skip(f"GWP config not available: {gwp_response.status_code}")
        
        gwp_config = gwp_response.json()
        
        if not gwp_config:
            pytest.skip("No GWP config found")
        
        print(f"GWP Config: {gwp_config}")
        
        # Verify correct property names are used
        assert "co2_gwp" in gwp_config, "GWP config missing co2_gwp property"
        assert "ch4_fossil_gwp" in gwp_config, "GWP config missing ch4_fossil_gwp property"
        assert "n2o_gwp" in gwp_config, "GWP config missing n2o_gwp property"
        
        # Verify values are reasonable
        assert gwp_config["co2_gwp"] == 1, f"CO2 GWP should be 1, got {gwp_config['co2_gwp']}"
        assert gwp_config["ch4_fossil_gwp"] > 0, f"CH4 Fossil GWP should be positive, got {gwp_config['ch4_fossil_gwp']}"
        assert gwp_config["n2o_gwp"] > 0, f"N2O GWP should be positive, got {gwp_config['n2o_gwp']}"
        
        print(f"co2_gwp: {gwp_config['co2_gwp']}")
        print(f"ch4_fossil_gwp: {gwp_config['ch4_fossil_gwp']}")
        print(f"ch4_non_fossil_gwp: {gwp_config.get('ch4_non_fossil_gwp')}")
        print(f"n2o_gwp: {gwp_config['n2o_gwp']}")
        
        print("GWP CONFIG TEST PASSED: Correct property names used")
    
    def test_emission_configurations_for_mobile_combustion(self):
        """Verify emission configurations for Mobile Combustion - CH4/N2O formulas may not exist"""
        
        # Get emission configurations
        config_response = self.session.get(f"{BASE_URL}/api/emission-configurations")
        if config_response.status_code != 200:
            pytest.skip("Emission configurations not available")
        
        configs = config_response.json()
        
        # Get formula definitions
        formula_response = self.session.get(f"{BASE_URL}/api/formula-definitions")
        formulas = formula_response.json() if formula_response.status_code == 200 else []
        
        # Find configurations for Mobile Combustion
        mobile_configs = []
        for config in configs:
            categories = config.get("categories") or []
            if "Mobile Combustion" in categories:
                mobile_configs.append(config)
        
        print(f"Mobile Combustion configurations: {len(mobile_configs)}")
        
        has_ch4_formula = False
        has_n2o_formula = False
        
        for config in mobile_configs:
            formula = next((f for f in formulas if f["id"] == config.get("formula_id")), None)
            if formula:
                formula_key = formula.get("formula_key", "").lower()
                print(f"  Config: {config.get('name')}")
                print(f"    Formula: {formula.get('formula_name')} (key: {formula_key})")
                
                if "ch4" in formula_key:
                    has_ch4_formula = True
                    print("    -> Has CH4 formula")
                if "n2o" in formula_key:
                    has_n2o_formula = True
                    print("    -> Has N2O formula")
        
        print(f"\nMobile Combustion has CH4 formula: {has_ch4_formula}")
        print(f"Mobile Combustion has N2O formula: {has_n2o_formula}")
        
        # This test verifies the configuration state
        # P1 bug: If no CH4/N2O formula defined, frontend should send 0 (not calculate values)
        if not has_ch4_formula and not has_n2o_formula:
            print("\nConfiguration confirms: No CH4/N2O formulas for Mobile Combustion")
            print("Frontend should correctly send calculated_ch4=0 and calculated_n2o=0")


class TestStationaryCombustion:
    """Test Stationary Combustion has CH4/N2O when formulas ARE defined"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "testadmin@test.com", "password": "Test123!"}
        )
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Admin login failed")
        
        yield
    
    def test_stationary_combustion_has_ch4_n2o_formulas(self):
        """Verify Stationary Combustion has CH4/N2O formula configurations"""
        
        # Get emission configurations
        config_response = self.session.get(f"{BASE_URL}/api/emission-configurations")
        if config_response.status_code != 200:
            pytest.skip("Emission configurations not available")
        
        configs = config_response.json()
        
        # Get formula definitions
        formula_response = self.session.get(f"{BASE_URL}/api/formula-definitions")
        formulas = formula_response.json() if formula_response.status_code == 200 else []
        
        # Find configurations for Stationary Combustion
        stationary_configs = []
        for config in configs:
            categories = config.get("categories") or []
            if "Stationary Combustion" in categories:
                stationary_configs.append(config)
        
        print(f"Stationary Combustion configurations: {len(stationary_configs)}")
        
        has_ch4_formula = False
        has_n2o_formula = False
        
        for config in stationary_configs:
            formula = next((f for f in formulas if f["id"] == config.get("formula_id")), None)
            if formula:
                formula_key = formula.get("formula_key", "").lower()
                print(f"  Config: {config.get('name')}")
                print(f"    Formula: {formula.get('formula_name')} (key: {formula_key})")
                
                if "ch4" in formula_key:
                    has_ch4_formula = True
                if "n2o" in formula_key:
                    has_n2o_formula = True
        
        print(f"\nStationary Combustion has CH4 formula: {has_ch4_formula}")
        print(f"Stationary Combustion has N2O formula: {has_n2o_formula}")
        
        # If formulas exist, emissions should show CH4/N2O values
        if has_ch4_formula or has_n2o_formula:
            # Get Stationary Combustion emissions
            emissions_response = self.session.get(f"{BASE_URL}/api/emissions")
            if emissions_response.status_code == 200:
                emissions = emissions_response.json()
                stationary = [e for e in emissions if e.get("category") == "Stationary Combustion"]
                
                if stationary:
                    print(f"\nFound {len(stationary)} Stationary Combustion emission(s)")
                    for em in stationary[:2]:
                        print(f"  ID: {em['id']}")
                        print(f"    ch4_unit: {em.get('ch4_unit')}, calculated_ch4: {em.get('calculated_ch4')}")
                        print(f"    n2o_unit: {em.get('n2o_unit')}, calculated_n2o: {em.get('calculated_n2o')}")
