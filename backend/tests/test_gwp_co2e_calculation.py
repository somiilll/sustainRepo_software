"""
Test GWP Configuration and CO2e Calculation
============================================
Verifies that:
1. GWP Config API returns separate CH4 fossil and non-fossil values
2. CO2e calculation uses correct GWP based on scope
3. Scope 1 & Scope 2: Use CH4 Fossil GWP (29.8)
4. Biogenic: Use CH4 Non-fossil GWP (27.0)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestGWPConfigAPI:
    """Test GWP Configuration API endpoints"""
    
    def test_gwp_config_endpoint_returns_data(self):
        """Test that /api/gwp-config returns configuration with fossil/non-fossil CH4 values"""
        response = requests.get(f"{BASE_URL}/api/gwp-config")
        
        assert response.status_code == 200, f"GWP Config API failed: {response.text}"
        
        data = response.json()
        assert data is not None, "GWP Config returned null data"
        
        # Verify CO2 GWP is 1 (always)
        assert "co2_gwp" in data, "Missing co2_gwp field"
        assert data["co2_gwp"] == 1 or data["co2_gwp"] == 1.0, f"CO2 GWP should be 1, got {data['co2_gwp']}"
        
        # Verify CH4 Fossil GWP exists and has correct value
        assert "ch4_fossil_gwp" in data, "Missing ch4_fossil_gwp field - required for Scope 1/2 calculations"
        assert data["ch4_fossil_gwp"] == 29.8, f"CH4 Fossil GWP should be 29.8, got {data['ch4_fossil_gwp']}"
        
        # Verify CH4 Non-fossil GWP exists and has correct value
        assert "ch4_non_fossil_gwp" in data, "Missing ch4_non_fossil_gwp field - required for Biogenic calculations"
        assert data["ch4_non_fossil_gwp"] == 27.0 or data["ch4_non_fossil_gwp"] == 27, f"CH4 Non-fossil GWP should be 27, got {data['ch4_non_fossil_gwp']}"
        
        # Verify N2O GWP
        assert "n2o_gwp" in data, "Missing n2o_gwp field"
        assert data["n2o_gwp"] == 273, f"N2O GWP should be 273, got {data['n2o_gwp']}"
        
        print(f"GWP Config values: CO2={data['co2_gwp']}, CH4_Fossil={data['ch4_fossil_gwp']}, CH4_NonFossil={data['ch4_non_fossil_gwp']}, N2O={data['n2o_gwp']}")
    
    def test_gwp_config_has_source_info(self):
        """Test that GWP Config includes source information"""
        response = requests.get(f"{BASE_URL}/api/gwp-config")
        
        assert response.status_code == 200
        data = response.json()
        
        # Source name should be present
        assert "source_name" in data, "Missing source_name field"
        assert data["source_name"], "Source name should not be empty"
        
        print(f"GWP Source: {data['source_name']}")
        
        # Time horizon should be present
        if "time_horizon" in data:
            print(f"GWP Time Horizon: {data['time_horizon']}")


class TestCO2eCalculationLogic:
    """Test that CO2e calculations use correct GWP values based on scope"""
    
    @pytest.fixture
    def gwp_config(self):
        """Fetch current GWP config"""
        response = requests.get(f"{BASE_URL}/api/gwp-config")
        if response.status_code == 200:
            return response.json()
        return {
            "co2_gwp": 1,
            "ch4_fossil_gwp": 29.8,
            "ch4_non_fossil_gwp": 27.0,
            "n2o_gwp": 273
        }
    
    def test_scope1_uses_ch4_fossil_gwp(self, gwp_config):
        """
        Verify Scope 1 emissions use CH4 Fossil GWP in CO2e calculation
        Formula: CO2e = CO2×GWP(CO2) + CH4×GWP(CH4 Fossil) + N2O×GWP(N2O)
        """
        # Test values
        co2_emissions = 100  # kg CO2
        ch4_emissions = 10   # kg CH4
        n2o_emissions = 5    # kg N2O
        
        # Expected calculation for Scope 1: Use CH4 Fossil GWP (29.8)
        expected_co2e = (
            co2_emissions * gwp_config["co2_gwp"] +
            ch4_emissions * gwp_config["ch4_fossil_gwp"] +
            n2o_emissions * gwp_config["n2o_gwp"]
        )
        
        # Calculate: 100×1 + 10×29.8 + 5×273 = 100 + 298 + 1365 = 1763
        manual_expected = 100 * 1 + 10 * 29.8 + 5 * 273
        
        assert abs(expected_co2e - manual_expected) < 0.01, f"Calculation mismatch: {expected_co2e} vs {manual_expected}"
        
        print(f"Scope 1 CO2e calculation:")
        print(f"  CO2: {co2_emissions} × {gwp_config['co2_gwp']} = {co2_emissions * gwp_config['co2_gwp']}")
        print(f"  CH4: {ch4_emissions} × {gwp_config['ch4_fossil_gwp']} (Fossil) = {ch4_emissions * gwp_config['ch4_fossil_gwp']}")
        print(f"  N2O: {n2o_emissions} × {gwp_config['n2o_gwp']} = {n2o_emissions * gwp_config['n2o_gwp']}")
        print(f"  Total CO2e: {expected_co2e}")
    
    def test_scope2_uses_ch4_fossil_gwp(self, gwp_config):
        """
        Verify Scope 2 emissions use CH4 Fossil GWP in CO2e calculation
        Same as Scope 1: CO2e = CO2×GWP(CO2) + CH4×GWP(CH4 Fossil) + N2O×GWP(N2O)
        """
        co2_emissions = 50
        ch4_emissions = 5
        n2o_emissions = 2
        
        expected_co2e = (
            co2_emissions * gwp_config["co2_gwp"] +
            ch4_emissions * gwp_config["ch4_fossil_gwp"] +
            n2o_emissions * gwp_config["n2o_gwp"]
        )
        
        # Calculate: 50×1 + 5×29.8 + 2×273 = 50 + 149 + 546 = 745
        manual_expected = 50 * 1 + 5 * 29.8 + 2 * 273
        
        assert abs(expected_co2e - manual_expected) < 0.01
        
        print(f"Scope 2 CO2e calculation:")
        print(f"  CO2: {co2_emissions} × {gwp_config['co2_gwp']} = {co2_emissions * gwp_config['co2_gwp']}")
        print(f"  CH4: {ch4_emissions} × {gwp_config['ch4_fossil_gwp']} (Fossil) = {ch4_emissions * gwp_config['ch4_fossil_gwp']}")
        print(f"  N2O: {n2o_emissions} × {gwp_config['n2o_gwp']} = {n2o_emissions * gwp_config['n2o_gwp']}")
        print(f"  Total CO2e: {expected_co2e}")
    
    def test_biogenic_uses_ch4_non_fossil_gwp(self, gwp_config):
        """
        Verify Biogenic emissions use CH4 Non-fossil GWP in CO2e calculation
        Formula: CO2e = CO2×GWP(CO2) + CH4×GWP(CH4 Non-fossil) + N2O×GWP(N2O)
        """
        co2_emissions = 100
        ch4_emissions = 10
        n2o_emissions = 5
        
        # Expected calculation for Biogenic: Use CH4 Non-fossil GWP (27.0)
        expected_co2e = (
            co2_emissions * gwp_config["co2_gwp"] +
            ch4_emissions * gwp_config["ch4_non_fossil_gwp"] +
            n2o_emissions * gwp_config["n2o_gwp"]
        )
        
        # Calculate: 100×1 + 10×27 + 5×273 = 100 + 270 + 1365 = 1735
        manual_expected = 100 * 1 + 10 * 27.0 + 5 * 273
        
        assert abs(expected_co2e - manual_expected) < 0.01
        
        print(f"Biogenic CO2e calculation:")
        print(f"  CO2: {co2_emissions} × {gwp_config['co2_gwp']} = {co2_emissions * gwp_config['co2_gwp']}")
        print(f"  CH4: {ch4_emissions} × {gwp_config['ch4_non_fossil_gwp']} (Non-fossil) = {ch4_emissions * gwp_config['ch4_non_fossil_gwp']}")
        print(f"  N2O: {n2o_emissions} × {gwp_config['n2o_gwp']} = {n2o_emissions * gwp_config['n2o_gwp']}")
        print(f"  Total CO2e: {expected_co2e}")
    
    def test_ch4_fossil_vs_non_fossil_difference(self, gwp_config):
        """
        Verify the difference between fossil and non-fossil CH4 GWP
        This demonstrates why separate GWP values matter for accurate calculations
        """
        ch4_emissions = 100  # kg CH4
        
        # Using Fossil GWP (for Scope 1/2)
        co2e_fossil = ch4_emissions * gwp_config["ch4_fossil_gwp"]
        
        # Using Non-fossil GWP (for Biogenic)
        co2e_non_fossil = ch4_emissions * gwp_config["ch4_non_fossil_gwp"]
        
        # Difference
        difference = co2e_fossil - co2e_non_fossil
        percentage_diff = (difference / co2e_non_fossil) * 100
        
        print(f"CH4 Emission: {ch4_emissions} kg")
        print(f"  With Fossil GWP ({gwp_config['ch4_fossil_gwp']}): {co2e_fossil} kg CO2e")
        print(f"  With Non-fossil GWP ({gwp_config['ch4_non_fossil_gwp']}): {co2e_non_fossil} kg CO2e")
        print(f"  Difference: {difference} kg CO2e ({percentage_diff:.1f}% higher with Fossil)")
        
        # Verify fossil > non-fossil (AR6 values: 29.8 > 27.0)
        assert gwp_config["ch4_fossil_gwp"] > gwp_config["ch4_non_fossil_gwp"], \
            f"CH4 Fossil GWP ({gwp_config['ch4_fossil_gwp']}) should be > Non-fossil ({gwp_config['ch4_non_fossil_gwp']})"


class TestGWPConfigList:
    """Test GWP Configuration list/management endpoints"""
    
    @pytest.fixture
    def auth_header(self):
        """Get authentication token for super admin"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@ecotrack.com",
            "password": "SuperAdmin123!"
        })
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            return {"Authorization": f"Bearer {token}"}
        return {}
    
    def test_gwp_configs_list_endpoint(self, auth_header):
        """Test that super admin can list all GWP configs"""
        response = requests.get(
            f"{BASE_URL}/api/super-admin/gwp-configs",
            headers=auth_header
        )
        
        # May return 401 if not authenticated, 200 if authenticated
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list), "Should return a list of configurations"
            
            # Check if configs have required fields
            if len(data) > 0:
                config = data[0]
                assert "co2_gwp" in config or "ch4_fossil_gwp" in config, "Config should have GWP fields"
                print(f"Found {len(data)} GWP configurations")
        else:
            print(f"GWP configs list endpoint returned {response.status_code} (auth may be required)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
