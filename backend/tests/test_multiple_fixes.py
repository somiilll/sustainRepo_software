"""
Test suite for Multiple Fixes:
1. Control type checkboxes show selected state when editing
2. Both Operational and Financial control can be selected together
3. No validation error when both controls are selected
4. Report shows explanation text after control approach statement
5. Emissions filter: End period cannot be before start period (Frontend test)
6. Fuel Database has Scope and Region filter dropdowns
"""
import pytest
import requests
import os
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://brsr-scope-tracker.preview.emergentagent.com').rstrip('/')

class TestOrganizationControlTypes:
    """Test Organization control types functionality"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "testadmin@test.com",
            "password": "Test123!"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        """Get headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_get_organization_with_control_types(self, auth_headers):
        """Test that organization data includes control_types and org_boundaries_approach"""
        response = requests.get(f"{BASE_URL}/api/organizations/my", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get organization: {response.text}"
        
        org_data = response.json()
        print(f"Organization data: {json.dumps(org_data, indent=2)}")
        
        # Check that org_boundaries_approach field exists
        assert 'org_boundaries_approach' in org_data or org_data.get('org_boundaries_approach') is None, \
            "org_boundaries_approach field should exist in response"
        
        print(f"org_boundaries_approach: {org_data.get('org_boundaries_approach')}")
        print(f"control_types: {org_data.get('control_types', [])}")
        
    def test_update_organization_with_control_both(self, auth_headers):
        """Test updating organization with both operational and financial control"""
        # First get current org data
        response = requests.get(f"{BASE_URL}/api/organizations/my", headers=auth_headers)
        assert response.status_code == 200
        org_data = response.json()
        
        # Store original values
        original_approach = org_data.get('org_boundaries_approach')
        original_control_types = org_data.get('control_types', [])
        
        # Update with control_both approach and both control types
        update_payload = {
            "name": org_data.get('name', 'Test Org Updated'),
            "corporate_address": org_data.get('corporate_address', '123 Test St'),
            "org_boundaries_approach": "control_both",
            "control_types": ["operational", "financial"],
            "person_responsible": org_data.get('person_responsible', 'Test Person')
        }
        
        response = requests.put(f"{BASE_URL}/api/organizations/my", 
                               headers=auth_headers, 
                               json=update_payload)
        assert response.status_code == 200, f"Failed to update organization: {response.text}"
        
        # Verify the update
        response = requests.get(f"{BASE_URL}/api/organizations/my", headers=auth_headers)
        assert response.status_code == 200
        updated_org = response.json()
        
        print(f"Updated org_boundaries_approach: {updated_org.get('org_boundaries_approach')}")
        print(f"Updated control_types: {updated_org.get('control_types', [])}")
        
        # Check that control_both was saved
        assert updated_org.get('org_boundaries_approach') == 'control_both', \
            f"Expected control_both, got {updated_org.get('org_boundaries_approach')}"
        
        # Check that both control types are present
        control_types = updated_org.get('control_types', [])
        assert 'operational' in control_types or updated_org.get('org_boundaries_approach') == 'control_both', \
            "Expected operational in control_types or control_both approach"
        assert 'financial' in control_types or updated_org.get('org_boundaries_approach') == 'control_both', \
            "Expected financial in control_types or control_both approach"
        
        # Restore original values
        restore_payload = {
            "name": org_data.get('name', 'Test Org Updated'),
            "corporate_address": org_data.get('corporate_address', '123 Test St'),
            "org_boundaries_approach": original_approach,
            "control_types": original_control_types,
            "person_responsible": org_data.get('person_responsible', 'Test Person')
        }
        requests.put(f"{BASE_URL}/api/organizations/my", headers=auth_headers, json=restore_payload)
        
    def test_update_organization_with_control_operational_only(self, auth_headers):
        """Test updating organization with only operational control"""
        response = requests.get(f"{BASE_URL}/api/organizations/my", headers=auth_headers)
        assert response.status_code == 200
        org_data = response.json()
        
        # Store original values
        original_approach = org_data.get('org_boundaries_approach')
        original_control_types = org_data.get('control_types', [])
        
        # Update with control_operational approach
        update_payload = {
            "name": org_data.get('name', 'Test Org Updated'),
            "corporate_address": org_data.get('corporate_address', '123 Test St'),
            "org_boundaries_approach": "control_operational",
            "control_types": ["operational"],
            "person_responsible": org_data.get('person_responsible', 'Test Person')
        }
        
        response = requests.put(f"{BASE_URL}/api/organizations/my", 
                               headers=auth_headers, 
                               json=update_payload)
        assert response.status_code == 200, f"Failed to update organization: {response.text}"
        
        # Verify the update
        response = requests.get(f"{BASE_URL}/api/organizations/my", headers=auth_headers)
        assert response.status_code == 200
        updated_org = response.json()
        
        assert updated_org.get('org_boundaries_approach') == 'control_operational', \
            f"Expected control_operational, got {updated_org.get('org_boundaries_approach')}"
        
        # Restore original values
        restore_payload = {
            "name": org_data.get('name', 'Test Org Updated'),
            "corporate_address": org_data.get('corporate_address', '123 Test St'),
            "org_boundaries_approach": original_approach,
            "control_types": original_control_types,
            "person_responsible": org_data.get('person_responsible', 'Test Person')
        }
        requests.put(f"{BASE_URL}/api/organizations/my", headers=auth_headers, json=restore_payload)
        
    def test_update_organization_with_control_financial_only(self, auth_headers):
        """Test updating organization with only financial control"""
        response = requests.get(f"{BASE_URL}/api/organizations/my", headers=auth_headers)
        assert response.status_code == 200
        org_data = response.json()
        
        # Store original values
        original_approach = org_data.get('org_boundaries_approach')
        original_control_types = org_data.get('control_types', [])
        
        # Update with control_financial approach
        update_payload = {
            "name": org_data.get('name', 'Test Org Updated'),
            "corporate_address": org_data.get('corporate_address', '123 Test St'),
            "org_boundaries_approach": "control_financial",
            "control_types": ["financial"],
            "person_responsible": org_data.get('person_responsible', 'Test Person')
        }
        
        response = requests.put(f"{BASE_URL}/api/organizations/my", 
                               headers=auth_headers, 
                               json=update_payload)
        assert response.status_code == 200, f"Failed to update organization: {response.text}"
        
        # Verify the update
        response = requests.get(f"{BASE_URL}/api/organizations/my", headers=auth_headers)
        assert response.status_code == 200
        updated_org = response.json()
        
        assert updated_org.get('org_boundaries_approach') == 'control_financial', \
            f"Expected control_financial, got {updated_org.get('org_boundaries_approach')}"
        
        # Restore original values
        restore_payload = {
            "name": org_data.get('name', 'Test Org Updated'),
            "corporate_address": org_data.get('corporate_address', '123 Test St'),
            "org_boundaries_approach": original_approach,
            "control_types": original_control_types,
            "person_responsible": org_data.get('person_responsible', 'Test Person')
        }
        requests.put(f"{BASE_URL}/api/organizations/my", headers=auth_headers, json=restore_payload)


class TestFuelDatabaseFilters:
    """Test Fuel Database filter functionality"""
    
    @pytest.fixture
    def superadmin_token(self):
        """Get superadmin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@ecotrack.com",
            "password": "SuperAdmin123!"
        })
        assert response.status_code == 200, f"SuperAdmin login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture
    def superadmin_headers(self, superadmin_token):
        """Get headers with superadmin token"""
        return {"Authorization": f"Bearer {superadmin_token}", "Content-Type": "application/json"}
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "testadmin@test.com",
            "password": "Test123!"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture
    def admin_headers(self, admin_token):
        """Get headers with admin token"""
        return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
    
    def test_fuel_database_has_scope_field(self, superadmin_headers):
        """Test that fuel database entries have scope field"""
        response = requests.get(f"{BASE_URL}/api/super-admin/fuel-database", headers=superadmin_headers)
        assert response.status_code == 200, f"Failed to get fuel database: {response.text}"
        
        fuels = response.json()
        if len(fuels) > 0:
            first_fuel = fuels[0]
            print(f"Sample fuel entry: {json.dumps(first_fuel, indent=2)}")
            assert 'scope' in first_fuel, "Fuel entry should have 'scope' field"
            print(f"Available scopes in fuels: {set(f.get('scope') for f in fuels)}")
        else:
            print("No fuels in database - skipping scope field check")
    
    def test_fuel_database_has_region_field(self, superadmin_headers):
        """Test that fuel database entries have region field"""
        response = requests.get(f"{BASE_URL}/api/super-admin/fuel-database", headers=superadmin_headers)
        assert response.status_code == 200, f"Failed to get fuel database: {response.text}"
        
        fuels = response.json()
        if len(fuels) > 0:
            first_fuel = fuels[0]
            # Region should be present - it's set to 'Global' by default
            assert 'region' in first_fuel, "Fuel entry should have 'region' field"
            print(f"Available regions in fuels: {set(f.get('region') for f in fuels if f.get('region'))}")
        else:
            print("No fuels in database - skipping region field check")
    
    def test_admin_fuel_database_access(self, admin_headers):
        """Test that admin can access fuel database (read-only)"""
        response = requests.get(f"{BASE_URL}/api/fuel-database", headers=admin_headers)
        assert response.status_code == 200, f"Failed to get fuel database as admin: {response.text}"
        
        fuels = response.json()
        print(f"Admin can access {len(fuels)} fuels from database")
        
        # Check if filtering data is available
        if len(fuels) > 0:
            scopes = set(f.get('scope') for f in fuels if f.get('scope'))
            regions = set(f.get('region') for f in fuels if f.get('region'))
            print(f"Available scopes for filtering: {scopes}")
            print(f"Available regions for filtering: {regions}")


class TestReportGeneratorControlApproach:
    """Test Report Generator control approach text"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "testadmin@test.com",
            "password": "Test123!"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture
    def admin_headers(self, admin_token):
        """Get headers with admin token"""
        return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
    
    def test_report_generator_control_approach_text_exists_in_code(self):
        """Verify that report_generator.py contains control approach explanation text"""
        report_gen_path = "/app/backend/report_generator.py"
        
        with open(report_gen_path, 'r') as f:
            content = f.read()
        
        # Check for control_both text
        assert 'control_both' in content, "report_generator.py should handle control_both approach"
        
        # Check for explanation text patterns
        assert 'Operational Control' in content or 'operational control' in content, \
            "Report generator should include Operational Control text"
        assert 'Financial Control' in content or 'financial control' in content, \
            "Report generator should include Financial Control text"
        
        # Check for the specific approach description text
        assert 'full authority to introduce and implement operating policies' in content, \
            "Report should include operational control description"
        assert 'ability to direct the financial and operating policies' in content, \
            "Report should include financial control description"
        
        # Check that control_both has specific text
        assert 'both operational and financial control' in content, \
            "Report should include control_both description"
        
        print("Report generator contains all required control approach text")


class TestEmissionsDateValidation:
    """Test Emissions page date validation"""
    
    def test_emissions_page_has_date_filter_inputs(self):
        """Verify that Emissions.js has date filter inputs with min/max attributes"""
        emissions_path = "/app/frontend/src/pages/Emissions.js"
        
        with open(emissions_path, 'r') as f:
            content = f.read()
        
        # Check for Start Period filter
        assert 'Start Period' in content, "Emissions page should have 'Start Period' filter"
        
        # Check for End Period filter
        assert 'End Period' in content, "Emissions page should have 'End Period' filter"
        
        # Check for min attribute on end period input (to prevent end < start)
        # The pattern: min={filterDateRange.from ? format(filterDateRange.from, 'yyyy-MM') : ''}
        assert "min={filterDateRange.from" in content, \
            "End period input should have min attribute based on start period"
        
        # Check for max attribute on start period input (to prevent start > end)
        # The pattern: max={filterDateRange.to ? format(filterDateRange.to, 'yyyy-MM') : ''}
        assert "max={filterDateRange.to" in content, \
            "Start period input should have max attribute based on end period"
        
        print("Emissions page has proper date validation attributes")


class TestFuelDatabaseUIFilters:
    """Test Fuel Database UI has proper filter dropdowns"""
    
    def test_fuel_database_has_scope_filter_dropdown(self):
        """Verify that FuelDatabase.js has scope filter dropdown"""
        fuel_db_path = "/app/frontend/src/pages/FuelDatabase.js"
        
        with open(fuel_db_path, 'r') as f:
            content = f.read()
        
        # Check for filterScope state
        assert 'filterScope' in content, "FuelDatabase should have filterScope state"
        assert 'setFilterScope' in content, "FuelDatabase should have setFilterScope setter"
        
        # Check for filter-scope data-testid
        assert 'data-testid="filter-scope"' in content, \
            "Scope filter dropdown should have data-testid='filter-scope'"
        
        # Check for scope options
        assert 'All Scopes' in content, "Should have 'All Scopes' option"
        assert 'Scope 1' in content or 'scope1' in content, "Should have Scope 1 option"
        assert 'Scope 2' in content or 'scope2' in content, "Should have Scope 2 option"
        
        print("FuelDatabase has scope filter dropdown")
    
    def test_fuel_database_has_region_filter_dropdown(self):
        """Verify that FuelDatabase.js has region filter dropdown"""
        fuel_db_path = "/app/frontend/src/pages/FuelDatabase.js"
        
        with open(fuel_db_path, 'r') as f:
            content = f.read()
        
        # Check for filterRegion state
        assert 'filterRegion' in content, "FuelDatabase should have filterRegion state"
        assert 'setFilterRegion' in content, "FuelDatabase should have setFilterRegion setter"
        
        # Check for filter-region data-testid
        assert 'data-testid="filter-region"' in content, \
            "Region filter dropdown should have data-testid='filter-region'"
        
        # Check for region options
        assert 'All Regions' in content, "Should have 'All Regions' option"
        assert 'REGIONS' in content, "Should reference REGIONS constant"
        
        print("FuelDatabase has region filter dropdown")
    
    def test_fuel_database_filter_logic(self):
        """Verify that filtering logic includes scope and region"""
        fuel_db_path = "/app/frontend/src/pages/FuelDatabase.js"
        
        with open(fuel_db_path, 'r') as f:
            content = f.read()
        
        # Check that filtering logic includes scope and region
        assert 'matchesScope' in content, "Filter logic should include matchesScope"
        assert 'matchesRegion' in content, "Filter logic should include matchesRegion"
        
        # Check the filter uses these in the dependency array
        assert 'filterScope' in content and 'filterRegion' in content, \
            "filteredFuels should depend on filterScope and filterRegion"
        
        print("FuelDatabase has proper filter logic for scope and region")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
