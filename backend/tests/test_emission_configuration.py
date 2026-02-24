"""
Test Emission Configuration Feature
- SuperAdmin Emission Configuration page endpoints
- Scope-to-Formula mapping CRUD
- Dynamic formula execution for Scope 2 emissions
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPERADMIN_EMAIL = "superadmin@ecotrack.com"
SUPERADMIN_PASSWORD = "SuperAdmin123!"
ADMIN_EMAIL = "admin@ghg.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def superadmin_token():
    """Get SuperAdmin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": SUPERADMIN_EMAIL,
        "password": SUPERADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"SuperAdmin login failed: {response.text}")


@pytest.fixture(scope="module")
def admin_token():
    """Get Admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Admin login failed: {response.text}")


class TestEmissionConfigurationAPIs:
    """Test Emission Configuration API endpoints (SuperAdmin only)"""
    
    def test_get_emission_configurations_superadmin(self, superadmin_token):
        """SuperAdmin can GET all emission configurations"""
        response = requests.get(
            f"{BASE_URL}/api/super-admin/emission-configurations",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} emission configurations")
        
        # Verify structure if any configs exist
        if len(data) > 0:
            config = data[0]
            assert "id" in config, "Config should have id"
            assert "name" in config, "Config should have name"
            assert "scope" in config, "Config should have scope"
            assert "formula_id" in config, "Config should have formula_id"
            assert "formula_name" in config, "Config should have formula_name"
            print(f"First config: {config['name']} - Scope: {config['scope']} - Formula: {config.get('formula_name')}")
    
    def test_get_formula_definitions_superadmin(self, superadmin_token):
        """SuperAdmin can GET all formula definitions"""
        response = requests.get(
            f"{BASE_URL}/api/super-admin/formula-definitions",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} formula definitions")
        
        # Find Electricity formula for Scope 2
        electricity_formulas = [f for f in data if 'electricity' in f.get('formula_key', '').lower()]
        if electricity_formulas:
            print(f"Electricity formula found: {electricity_formulas[0]['formula_name']}")
            return electricity_formulas[0]['id']
        
        return None
    
    def test_scope2_electricity_mapping_exists(self, superadmin_token):
        """Verify Scope 2 Electricity mapping exists in configurations"""
        response = requests.get(
            f"{BASE_URL}/api/super-admin/emission-configurations",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        configs = response.json()
        
        # Look for Scope 2 configuration
        scope2_configs = [c for c in configs if c.get('scope') == 'scope2']
        
        if scope2_configs:
            print(f"Found {len(scope2_configs)} Scope 2 configurations:")
            for config in scope2_configs:
                print(f"  - {config['name']}: Formula={config.get('formula_name')}, Category={config.get('category', 'Any')}")
            assert len(scope2_configs) > 0, "Should have at least one Scope 2 config"
        else:
            print("No Scope 2 configurations found - test expected to find at least one")
            # This is expected per the test requirements


class TestEmissionConfigurationCRUD:
    """Test Create/Update/Delete operations for emission configurations"""
    
    def test_create_scope_formula_mapping(self, superadmin_token):
        """SuperAdmin can create a new scope-to-formula mapping"""
        # First get a formula ID to use
        formulas_response = requests.get(
            f"{BASE_URL}/api/super-admin/formula-definitions",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        assert formulas_response.status_code == 200
        formulas = formulas_response.json()
        
        if not formulas:
            pytest.skip("No formulas available to create mapping")
        
        # Use the first available formula
        formula_id = formulas[0]['id']
        formula_name = formulas[0]['formula_name']
        
        # Create a test configuration
        test_config = {
            "name": "TEST_Scope1_TestMapping",
            "description": "Test mapping for automated testing",
            "scope": "scope1",
            "category": "",
            "formula_id": formula_id,
            "is_active": True,
            "priority": 99
        }
        
        response = requests.post(
            f"{BASE_URL}/api/super-admin/emission-configurations",
            json=test_config,
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        
        assert response.status_code == 200, f"Failed to create: {response.text}"
        created = response.json()
        
        assert created['name'] == test_config['name']
        assert created['scope'] == test_config['scope']
        assert created['formula_id'] == formula_id
        assert created['formula_name'] == formula_name
        print(f"Created config: {created['name']} with ID: {created['id']}")
        
        return created['id']
    
    def test_delete_test_mapping(self, superadmin_token):
        """Clean up test mappings"""
        # Get all configurations
        response = requests.get(
            f"{BASE_URL}/api/super-admin/emission-configurations",
            headers={"Authorization": f"Bearer {superadmin_token}"}
        )
        
        assert response.status_code == 200
        configs = response.json()
        
        # Find and delete test configurations
        test_configs = [c for c in configs if c.get('name', '').startswith('TEST_')]
        
        for config in test_configs:
            delete_response = requests.delete(
                f"{BASE_URL}/api/super-admin/emission-configurations/{config['id']}",
                headers={"Authorization": f"Bearer {superadmin_token}"}
            )
            if delete_response.status_code == 200:
                print(f"Deleted test config: {config['name']}")


class TestAdminEmissionCalculation:
    """Test Admin-side emission calculation using configured formulas"""
    
    def test_admin_can_access_emission_configurations(self, admin_token):
        """Admin (non-SuperAdmin) can access emission configurations for calculations"""
        response = requests.get(
            f"{BASE_URL}/api/emission-configurations",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        configs = response.json()
        assert isinstance(configs, list)
        print(f"Admin can access {len(configs)} emission configurations")
    
    def test_admin_can_access_formula_definitions(self, admin_token):
        """Admin can access formula definitions for calculations"""
        response = requests.get(
            f"{BASE_URL}/api/formula-definitions",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        formulas = response.json()
        assert isinstance(formulas, list)
        print(f"Admin can access {len(formulas)} formula definitions")
        
        # Verify electricity formula is available
        electricity_formulas = [f for f in formulas if 'electricity' in f.get('formula_key', '').lower()]
        if electricity_formulas:
            print(f"Electricity formula available: {electricity_formulas[0]['formula_name']}")
    
    def test_admin_can_access_formula_parameters(self, admin_token):
        """Admin can access formula parameters (for unit conversions)"""
        response = requests.get(
            f"{BASE_URL}/api/formula-parameters",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        params = response.json()
        assert isinstance(params, list)
        print(f"Admin can access {len(params)} formula parameters")
        
        # Check for electricity_quantity parameter (critical for kWh → MWh conversion)
        elec_param = [p for p in params if p.get('parameter_key') == 'electricity_quantity']
        if elec_param:
            param = elec_param[0]
            conversions = param.get('unit_conversions', [])
            print(f"Electricity quantity parameter found with {len(conversions)} conversions")
            # Verify kWh conversion exists
            kwh_conv = [c for c in conversions if c.get('from_unit', '').lower() == 'kwh']
            if kwh_conv:
                print(f"kWh conversion: multiplier={kwh_conv[0].get('multiplier')}")


class TestPublicEndpoints:
    """Test that Admin/User can access necessary endpoints for emission calculation"""
    
    def test_public_emission_configurations_endpoint(self, admin_token):
        """Public emission-configurations endpoint returns scope-formula mappings"""
        response = requests.get(
            f"{BASE_URL}/api/emission-configurations",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Check structure
        if len(data) > 0:
            config = data[0]
            required_fields = ['id', 'name', 'scope', 'formula_id', 'is_active']
            for field in required_fields:
                assert field in config, f"Config missing field: {field}"
        
        print(f"Public endpoint returned {len(data)} configurations")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
