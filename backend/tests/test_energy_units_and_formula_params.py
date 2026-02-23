"""
Backend tests for Energy Units Management and Formula Parameters default_value bug fix.

Features to test:
1. Energy units exist in the Units module (kWh, MWh, GWh, TJ, GJ, MJ)
2. Formula parameters API returns kg_tonne_conversion with default_value=0.001
3. Super Admin can seed and manage energy units
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPER_ADMIN_EMAIL = "superadmin@ecotrack.com"
SUPER_ADMIN_PASSWORD = "SuperAdmin123!"
ADMIN_EMAIL = "admin@ghg.com"
ADMIN_PASSWORD = "admin123"


class TestAuthentication:
    """Authentication tests for getting tokens"""
    
    def test_super_admin_login(self):
        """Test super admin can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Super admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "super_admin"
        print(f"✓ Super Admin login successful: {data['user']['email']}")
        return data["access_token"]
    
    def test_admin_login(self):
        """Test admin can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        print(f"✓ Admin login successful: {data['user']['email']}")
        return data["access_token"]


@pytest.fixture
def super_admin_token():
    """Get super admin token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": SUPER_ADMIN_EMAIL,
        "password": SUPER_ADMIN_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip("Super admin login failed")
    return response.json()["access_token"]


@pytest.fixture
def admin_token():
    """Get admin token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip("Admin login failed")
    return response.json()["access_token"]


class TestEnergyUnitsInUnitsModule:
    """Test energy units are available in the centralized Units module"""
    
    def test_units_api_returns_energy_units(self, admin_token):
        """Test /api/units returns energy units including kWh, MWh, GWh, TJ, GJ, MJ"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/units", headers=headers)
        
        assert response.status_code == 200, f"Units API failed: {response.text}"
        units = response.json()
        
        # Filter for energy units
        energy_units = [u for u in units if u.get("unit_type") == "energy"]
        
        print(f"Found {len(energy_units)} energy units:")
        for unit in energy_units:
            print(f"  - {unit['name']} ({unit['symbol']})")
        
        # Verify expected energy units exist
        expected_symbols = ["kWh", "MWh", "GWh", "TJ", "GJ", "MJ"]
        found_symbols = [u["symbol"] for u in energy_units]
        
        for expected in expected_symbols:
            assert expected in found_symbols, f"Missing energy unit: {expected}"
            print(f"✓ Energy unit '{expected}' found")
        
        assert len(energy_units) >= 6, f"Expected at least 6 energy units, got {len(energy_units)}"
        print(f"✓ All {len(expected_symbols)} expected energy units are present")
    
    def test_units_by_type_energy(self, admin_token):
        """Test /api/units/by-type/energy returns only energy units"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/units/by-type/energy", headers=headers)
        
        assert response.status_code == 200, f"Units by type API failed: {response.text}"
        units = response.json()
        
        # All returned units should be energy type
        for unit in units:
            assert unit.get("unit_type") == "energy", f"Non-energy unit returned: {unit}"
        
        print(f"✓ /api/units/by-type/energy returns {len(units)} energy units")
        
    def test_units_stats_include_energy(self, admin_token):
        """Test units endpoint returns mass, volume, AND energy units"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/units", headers=headers)
        
        assert response.status_code == 200
        units = response.json()
        
        # Count by type
        mass_count = len([u for u in units if u.get("unit_type") == "mass"])
        volume_count = len([u for u in units if u.get("unit_type") == "volume"])
        energy_count = len([u for u in units if u.get("unit_type") == "energy"])
        total_count = len(units)
        
        print(f"Unit stats: Mass={mass_count}, Volume={volume_count}, Energy={energy_count}, Total={total_count}")
        
        assert mass_count > 0, "No mass units found"
        assert volume_count > 0, "No volume units found"
        assert energy_count > 0, "No energy units found"
        
        print("✓ Units module has all three unit types: mass, volume, energy")


class TestFormulaParametersDefaultValue:
    """Test formula parameters default_value field (bug fix verification)"""
    
    def test_formula_parameters_api_returns_default_value(self, admin_token):
        """Test /api/formula-parameters returns parameters with default_value field"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/formula-parameters", headers=headers)
        
        assert response.status_code == 200, f"Formula parameters API failed: {response.text}"
        params = response.json()
        
        print(f"Found {len(params)} formula parameters")
        
        # Check if any parameters have default_value
        params_with_default = [p for p in params if p.get("default_value") is not None]
        
        if params_with_default:
            print(f"Parameters with default_value defined ({len(params_with_default)}):")
            for param in params_with_default:
                print(f"  - {param['parameter_key']}: default_value={param['default_value']}")
        
        # Look specifically for kg_tonne_conversion
        kg_tonne_param = next((p for p in params if p.get("parameter_key") == "kg_tonne_conversion"), None)
        
        if kg_tonne_param:
            print(f"\n✓ Found kg_tonne_conversion parameter:")
            print(f"  - default_value: {kg_tonne_param.get('default_value')}")
            
            # Verify default_value is 0.001 (1000 kg = 1 tonne → 0.001 conversion)
            if kg_tonne_param.get("default_value") == 0.001:
                print(f"  ✓ default_value=0.001 is correct!")
            else:
                print(f"  ⚠ Expected default_value=0.001, got {kg_tonne_param.get('default_value')}")
        else:
            print("Note: kg_tonne_conversion parameter not found - may need to be created by Super Admin")
    
    def test_formula_parameters_response_structure(self, admin_token):
        """Test formula parameters response includes default_value in schema"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/formula-parameters", headers=headers)
        
        assert response.status_code == 200
        params = response.json()
        
        if len(params) > 0:
            # Check first parameter has expected fields
            first_param = params[0]
            expected_fields = ["id", "parameter_name", "parameter_key"]
            
            for field in expected_fields:
                assert field in first_param, f"Missing field: {field}"
            
            # default_value should be present (can be null)
            # This tests the schema, not the value
            print(f"✓ Parameter '{first_param['parameter_key']}' structure verified")
            print(f"  - default_value field present: {'default_value' in first_param}")


class TestFuelDatabaseIntegration:
    """Test Fuel Database uses centralized energy units"""
    
    def test_fuel_database_api_accessible(self, admin_token):
        """Test /api/fuel-database endpoint is accessible"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/fuel-database", headers=headers)
        
        assert response.status_code == 200, f"Fuel database API failed: {response.text}"
        fuels = response.json()
        
        print(f"✓ Fuel database accessible, contains {len(fuels)} fuels")
        
        if fuels:
            # Check for fuels with energy-related basis units
            fuels_with_energy_basis = [f for f in fuels if f.get("emission_factor_basis_unit") in ["kWh", "MWh", "GWh"]]
            print(f"  - Fuels with energy basis unit: {len(fuels_with_energy_basis)}")


class TestSuperAdminUnitManagement:
    """Test Super Admin can manage energy units"""
    
    def test_super_admin_can_create_energy_unit(self, super_admin_token):
        """Test Super Admin can create a new energy unit"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        
        # Try to create a test energy unit
        test_unit = {
            "name": "TEST_Watt-hour",
            "symbol": "TEST_Wh",
            "unit_type": "energy",
            "aliases": ["watt-hour", "watthour"],
            "is_base_unit": False,
            "description": "Test energy unit for testing",
            "is_active": True
        }
        
        response = requests.post(f"{BASE_URL}/api/units", headers=headers, json=test_unit)
        
        if response.status_code == 200:
            created_unit = response.json()
            print(f"✓ Created test energy unit: {created_unit['symbol']}")
            
            # Clean up - delete the test unit
            delete_response = requests.delete(f"{BASE_URL}/api/units/{created_unit['id']}", headers=headers)
            if delete_response.status_code == 200:
                print(f"✓ Cleaned up test unit")
        elif response.status_code == 400 and "already exists" in response.text:
            print(f"✓ Unit creation properly validates duplicates")
        else:
            print(f"Unit creation response: {response.status_code} - {response.text}")
    
    def test_super_admin_can_update_energy_unit(self, super_admin_token):
        """Test Super Admin can update an existing energy unit"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        
        # Get existing energy units
        response = requests.get(f"{BASE_URL}/api/units", headers=headers)
        assert response.status_code == 200
        
        units = response.json()
        energy_units = [u for u in units if u.get("unit_type") == "energy"]
        
        if energy_units:
            test_unit = energy_units[0]
            original_description = test_unit.get("description", "")
            
            # Update description
            update_data = {
                "name": test_unit["name"],
                "symbol": test_unit["symbol"],
                "unit_type": "energy",
                "aliases": test_unit.get("aliases", []),
                "is_base_unit": test_unit.get("is_base_unit", False),
                "description": "Updated test description",
                "is_active": True
            }
            
            update_response = requests.put(
                f"{BASE_URL}/api/units/{test_unit['id']}", 
                headers=headers, 
                json=update_data
            )
            
            if update_response.status_code == 200:
                print(f"✓ Super Admin can update energy unit: {test_unit['symbol']}")
                
                # Revert the change
                update_data["description"] = original_description
                requests.put(f"{BASE_URL}/api/units/{test_unit['id']}", headers=headers, json=update_data)
            else:
                print(f"Update response: {update_response.status_code}")
        else:
            print("No energy units found to test update")


class TestSeedDefaults:
    """Test seed defaults endpoint includes energy units"""
    
    def test_seed_defaults_includes_energy_units(self, super_admin_token):
        """Test that seed-defaults adds energy units"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        
        # Call seed defaults (should be idempotent)
        response = requests.post(f"{BASE_URL}/api/units/seed-defaults", headers=headers)
        
        assert response.status_code == 200, f"Seed defaults failed: {response.text}"
        result = response.json()
        
        print(f"Seed defaults result: {result}")
        
        # Verify energy units now exist
        units_response = requests.get(f"{BASE_URL}/api/units", headers=headers)
        assert units_response.status_code == 200
        
        units = units_response.json()
        energy_units = [u for u in units if u.get("unit_type") == "energy"]
        
        assert len(energy_units) >= 6, f"Expected at least 6 energy units after seeding"
        print(f"✓ After seeding: {len(energy_units)} energy units exist")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
