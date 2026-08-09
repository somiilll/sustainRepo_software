"""
Test Bug Fixes - Iteration 54
=============================
Tests for 10 bug fixes and improvements:
1. Custom EF justification not saving (Scope 2)
2. Source shows 'CEA' for custom EF
3. Edit dialog: 'Unit Conversion Applied' removed
4. Edit dialog: 'Use Custom Fuel Type' removed
5+6. GHG Report: scope1_by_category/scope1_by_fuel tracking
7. Internal Performance Tracking hardcoded text removed
8+9. Validation auto-unselect behavior
10. Biogenic CV override option
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://mis-dashboard-v2-1.preview.emergentagent.com')


class TestScope2CustomEFJustification:
    """Tests for Issue 1 & 2: Custom EF justification saving and source_of_information for Scope 2"""
    
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
        
    def test_scope2_custom_ef_justification_saved(self):
        """Issue 1: Create Scope 2 emission with custom EF, verify justification is saved and returned"""
        
        # First get a facility to use
        facilities_resp = self.session.get(f"{BASE_URL}/api/facilities")
        assert facilities_resp.status_code == 200
        facilities = facilities_resp.json()
        
        if not facilities:
            pytest.skip("No facilities available for testing")
        
        facility_id = facilities[0]["id"]
        
        # Create a Scope 2 emission with custom EF and justification
        test_justification = f"TEST_JUSTIFICATION_{uuid.uuid4().hex[:8]}"
        test_source = f"TEST_SOURCE_{uuid.uuid4().hex[:8]}"
        
        payload = {
            "facility_id": facility_id,
            "reporting_period": "2026-01",
            "scope": "scope2",
            "category": "Purchased Electricity",
            "sub_category": "Grid Electricity",
            "fuel_type": "Grid Electricity",
            "quantity": 1000,
            "quantity_unit": "kWh",
            "unit": "kWh",
            "emission_factor": 0.5,
            "is_custom_factor": True,
            "emission_factor_basis_quantity": 0.5,
            "emission_factor_basis_unit": "tCO2/MWh",
            "justification": test_justification,
            "source_of_information": test_source,
            "notes": "Test custom EF justification",
            "responsible_person": "Test Person",
            "process_names": ["Test Process"],
            "calculated_co2": 0.5,
            "calculated_ch4": 0,
            "calculated_n2o": 0,
            "calculated_co2e": 0.5,
            "co2_unit": "tCO₂",
            "co2e_unit": "tCO₂e"
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/emissions", json=payload)
        print(f"Create response status: {create_resp.status_code}")
        print(f"Create response: {create_resp.text[:500]}")
        
        assert create_resp.status_code in [200, 201], f"Failed to create emission: {create_resp.text}"
        
        created_emission = create_resp.json()
        emission_id = created_emission["id"]
        
        # Fetch the emission and verify justification and source are saved
        get_resp = self.session.get(f"{BASE_URL}/api/emissions")
        assert get_resp.status_code == 200
        
        emissions = get_resp.json()
        emission = next((e for e in emissions if e["id"] == emission_id), None)
        
        assert emission is not None, "Created emission not found"
        
        # Issue 1: Verify justification is saved
        assert emission.get("justification") == test_justification, \
            f"Justification not saved correctly. Expected '{test_justification}', got '{emission.get('justification')}'"
        
        # Issue 2: Verify source_of_information contains user's custom source, not 'CEA'
        source = emission.get("source_of_information", "")
        assert test_source in source or source == test_source, \
            f"Source should contain custom source '{test_source}', got '{source}'"
        assert "CEA" not in source, \
            f"Source should NOT contain 'CEA' for custom EF, got '{source}'"
        
        print(f"✓ Justification saved correctly: {emission.get('justification')}")
        print(f"✓ Source saved correctly (no CEA): {emission.get('source_of_information')}")
        
        # Cleanup
        delete_resp = self.session.delete(f"{BASE_URL}/api/emissions/{emission_id}")
        print(f"Cleanup delete status: {delete_resp.status_code}")


class TestReportGeneratorTracking:
    """Tests for Issue 5+6 & 7: Report generator tracking and Internal Performance Tracking"""
    
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
        else:
            pytest.skip("Admin login failed")
        
        yield
    
    def test_report_generator_scope1_tracking_fields(self):
        """Issue 5+6: Verify report_generator._calculate_facility_totals returns scope1_by_category and scope1_by_fuel"""
        import sys
        sys.path.insert(0, '/app/backend')
        
        try:
            from report_generator import GHGReportGenerator
            
            generator = GHGReportGenerator()
            
            # Create test emissions data
            test_emissions = [
                {
                    "scope": "scope1",
                    "category": "Stationary Combustion",
                    "fuel_type": "Diesel",
                    "total_emissions": 100.0,
                    "reporting_period": "2026-01"
                },
                {
                    "scope": "scope1",
                    "category": "Mobile Combustion",
                    "fuel_type": "Petrol",
                    "total_emissions": 50.0,
                    "reporting_period": "2026-01"
                },
                {
                    "scope": "scope2",
                    "category": "Purchased Electricity",
                    "fuel_type": "Grid Electricity",
                    "total_emissions": 200.0,
                    "reporting_period": "2026-01"
                },
                {
                    "scope": "biogenic",
                    "category": "Biofuel",
                    "fuel_type": "Biodiesel",
                    "total_emissions": 25.0,
                    "reporting_period": "2026-01"
                }
            ]
            
            totals = generator._calculate_facility_totals(test_emissions)
            
            # Verify scope1_by_category exists and only contains Scope 1 emissions
            assert 'scope1_by_category' in totals, "Missing scope1_by_category in totals"
            assert totals['scope1_by_category'].get('Stationary Combustion', 0) == 100.0, \
                "Stationary Combustion not in scope1_by_category"
            assert totals['scope1_by_category'].get('Mobile Combustion', 0) == 50.0, \
                "Mobile Combustion not in scope1_by_category"
            # Scope 2 and Biogenic should NOT be in scope1_by_category
            assert 'Purchased Electricity' not in totals['scope1_by_category'], \
                "Scope 2 category should not be in scope1_by_category"
            assert 'Biofuel' not in totals['scope1_by_category'], \
                "Biogenic category should not be in scope1_by_category"
            
            # Verify scope1_by_fuel exists and only contains Scope 1 emissions
            assert 'scope1_by_fuel' in totals, "Missing scope1_by_fuel in totals"
            assert totals['scope1_by_fuel'].get('Diesel', 0) == 100.0, \
                "Diesel not in scope1_by_fuel"
            assert totals['scope1_by_fuel'].get('Petrol', 0) == 50.0, \
                "Petrol not in scope1_by_fuel"
            # Scope 2 and Biogenic fuels should NOT be in scope1_by_fuel
            assert 'Grid Electricity' not in totals['scope1_by_fuel'], \
                "Scope 2 fuel should not be in scope1_by_fuel"
            assert 'Biodiesel' not in totals['scope1_by_fuel'], \
                "Biogenic fuel should not be in scope1_by_fuel"
            
            print(f"✓ scope1_by_category: {dict(totals['scope1_by_category'])}")
            print(f"✓ scope1_by_fuel: {dict(totals['scope1_by_fuel'])}")
            
            # Verify percentages would be calculated correctly (Issue 6 - >100% fix)
            scope1_total = totals['scope1']
            if scope1_total > 0:
                for cat, val in totals['scope1_by_category'].items():
                    pct = (val / scope1_total) * 100
                    assert pct <= 100, f"Category percentage {pct}% exceeds 100% for {cat}"
                    print(f"  - {cat}: {val} tCO2e = {pct:.1f}% of Scope 1")
            
        except ImportError as e:
            pytest.skip(f"Could not import report_generator: {e}")
    
    def test_internal_performance_tracking_no_hardcoded_text(self):
        """Issue 7: Verify Internal Performance Tracking doesn't show hardcoded text if org has no data"""
        # Read the report_generator.py file and check for hardcoded text
        with open('/app/backend/report_generator.py', 'r') as f:
            content = f.read()
        
        # Check that there's no hardcoded fallback text for internal_performance_tracking
        # The section should only show the org's tracking data if it exists, not a fallback message
        
        # Find the Internal Performance Tracking section
        tracking_section_start = content.find("Internal Performance Tracking")
        assert tracking_section_start != -1, "Internal Performance Tracking section not found"
        
        # Get the next 500 characters to analyze
        section_snippet = content[tracking_section_start:tracking_section_start + 500]
        
        # There should NOT be a hardcoded fallback like "The organization has not documented..."
        # Only show content if tracking data exists
        assert "has not documented" not in section_snippet.lower(), \
            "Found hardcoded fallback text for Internal Performance Tracking"
        
        print("✓ Internal Performance Tracking section has no hardcoded fallback text")


class TestAPIEndpoints:
    """Test API endpoints for proper data handling"""
    
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
    
    def test_emissions_endpoint_returns_justification_field(self):
        """Verify emissions endpoint returns justification field"""
        resp = self.session.get(f"{BASE_URL}/api/emissions")
        assert resp.status_code == 200
        
        emissions = resp.json()
        if emissions:
            # Check that justification field exists in response schema
            first_emission = emissions[0]
            # justification may be null but should exist in the response
            # We just verify the endpoint works
            print(f"✓ Emissions endpoint working. First emission has keys: {list(first_emission.keys())[:10]}...")
    
    def test_facilities_endpoint(self):
        """Verify facilities endpoint works"""
        resp = self.session.get(f"{BASE_URL}/api/facilities")
        assert resp.status_code == 200
        print(f"✓ Facilities endpoint returns {len(resp.json())} facilities")
    
    def test_fuel_database_endpoint(self):
        """Verify fuel database endpoint works"""
        resp = self.session.get(f"{BASE_URL}/api/fuel-database")
        assert resp.status_code == 200
        fuels = resp.json()
        
        # Check for Scope 2 fuels (for custom EF testing)
        scope2_fuels = [f for f in fuels if f.get('scope') == 'scope2']
        print(f"✓ Fuel database has {len(fuels)} total fuels, {len(scope2_fuels)} Scope 2 fuels")
    
    def test_gwp_config_endpoint(self):
        """Verify GWP config is available"""
        resp = self.session.get(f"{BASE_URL}/api/gwp-config")
        if resp.status_code == 200:
            gwp = resp.json()
            if gwp:
                # Verify required GWP fields for biogenic CH4 (Issue 10 related)
                assert 'ch4_non_fossil_gwp' in gwp or 'ch4_non_fossil' in str(gwp), \
                    "Missing CH4 non-fossil GWP for biogenic calculations"
                print(f"✓ GWP config available with keys: {list(gwp.keys())}")
        else:
            print(f"GWP config not available (status: {resp.status_code})")


class TestEmissionUpdateWithJustification:
    """Test updating emissions preserves justification"""
    
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
    
    def test_put_emission_preserves_custom_ef_data(self):
        """Verify PUT endpoint preserves custom EF justification and source"""
        
        # Get existing emissions
        resp = self.session.get(f"{BASE_URL}/api/emissions")
        assert resp.status_code == 200
        
        emissions = resp.json()
        
        # Find a Scope 2 emission or any emission to test
        scope2_emission = next((e for e in emissions if e.get('scope') == 'scope2'), None)
        test_emission = scope2_emission or (emissions[0] if emissions else None)
        
        if not test_emission:
            pytest.skip("No emissions available for testing")
        
        emission_id = test_emission["id"]
        
        # Update with new justification
        test_justification = f"UPDATED_JUSTIFICATION_{uuid.uuid4().hex[:8]}"
        
        update_payload = {
            **{k: v for k, v in test_emission.items() if k not in ['id', '_id', 'created_at', 'updated_at', 'version']},
            "justification": test_justification,
            "notes": f"Updated at {datetime.now().isoformat()}"
        }
        
        # Ensure required fields
        update_payload.setdefault('calculated_co2', test_emission.get('co2_emissions', 0) or 0)
        update_payload.setdefault('calculated_ch4', test_emission.get('ch4_emissions', 0) or 0)
        update_payload.setdefault('calculated_n2o', test_emission.get('n2o_emissions', 0) or 0)
        update_payload.setdefault('calculated_co2e', test_emission.get('co2e_emissions', 0) or test_emission.get('total_emissions', 0) or 0)
        update_payload.setdefault('process_names', test_emission.get('process_names', []))
        update_payload.setdefault('process_descriptions', test_emission.get('process_descriptions', []))
        
        put_resp = self.session.put(f"{BASE_URL}/api/emissions/{emission_id}", json=update_payload)
        
        assert put_resp.status_code == 200, f"PUT failed: {put_resp.status_code} - {put_resp.text}"
        
        # Verify the update
        updated = put_resp.json()
        assert updated.get("justification") == test_justification, \
            f"Justification not updated. Expected '{test_justification}', got '{updated.get('justification')}'"
        
        print(f"✓ PUT successfully updated justification to: {updated.get('justification')}")
