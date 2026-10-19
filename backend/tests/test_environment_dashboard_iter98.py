"""
Test Environment Dashboard APIs - Iteration 98
Tests for:
- GET /api/dashboard/environment-detail
- GET /api/dashboard/esg-analytics
Both endpoints require authentication and return environment-specific data.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
TEST_EMAIL = "goyalsomil2001@gmail.com"
TEST_PASSWORD = "TestUser123!"


class TestEnvironmentDashboardAPIs:
    """Test Environment Dashboard endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for ORG1 admin"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    # ─────────────────────────────────────────────────────────────────────────
    # Test: GET /api/dashboard/environment-detail
    # ─────────────────────────────────────────────────────────────────────────
    def test_environment_detail_endpoint_exists(self, auth_headers):
        """Test that environment-detail endpoint exists and returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/environment-detail",
            params={"start_date": "2026-04", "end_date": "2027-03"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_environment_detail_returns_scope1_breakdown(self, auth_headers):
        """Test that environment-detail returns scope1_breakdown array"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/environment-detail",
            params={"start_date": "2026-04", "end_date": "2027-03"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "scope1_breakdown" in data, "Missing scope1_breakdown in response"
        assert isinstance(data["scope1_breakdown"], list), "scope1_breakdown should be a list"
        
        # Check structure of breakdown items
        if len(data["scope1_breakdown"]) > 0:
            item = data["scope1_breakdown"][0]
            assert "name" in item, "scope1_breakdown item missing 'name'"
            assert "value" in item, "scope1_breakdown item missing 'value'"
            assert "key" in item, "scope1_breakdown item missing 'key'"
    
    def test_environment_detail_returns_scope2_breakdown(self, auth_headers):
        """Test that environment-detail returns scope2_breakdown array"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/environment-detail",
            params={"start_date": "2026-04", "end_date": "2027-03"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "scope2_breakdown" in data, "Missing scope2_breakdown in response"
        assert isinstance(data["scope2_breakdown"], list), "scope2_breakdown should be a list"
    
    def test_environment_detail_returns_scope3_upstream(self, auth_headers):
        """Test that environment-detail returns scope3_upstream array"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/environment-detail",
            params={"start_date": "2026-04", "end_date": "2027-03"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "scope3_upstream" in data, "Missing scope3_upstream in response"
        assert isinstance(data["scope3_upstream"], list), "scope3_upstream should be a list"
    
    def test_environment_detail_returns_scope3_downstream(self, auth_headers):
        """Test that environment-detail returns scope3_downstream array"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/environment-detail",
            params={"start_date": "2026-04", "end_date": "2027-03"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "scope3_downstream" in data, "Missing scope3_downstream in response"
        assert isinstance(data["scope3_downstream"], list), "scope3_downstream should be a list"
    
    def test_environment_detail_returns_hotspots(self, auth_headers):
        """Test that environment-detail returns hotspots array"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/environment-detail",
            params={"start_date": "2026-04", "end_date": "2027-03"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "hotspots" in data, "Missing hotspots in response"
        assert isinstance(data["hotspots"], list), "hotspots should be a list"
        
        # Check structure of hotspot items
        if len(data["hotspots"]) > 0:
            item = data["hotspots"][0]
            assert "name" in item, "hotspot item missing 'name'"
            assert "value" in item, "hotspot item missing 'value'"
    
    def test_environment_detail_returns_water_sources(self, auth_headers):
        """Test that environment-detail returns water_sources array"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/environment-detail",
            params={"start_date": "2026-04", "end_date": "2027-03"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "water_sources" in data, "Missing water_sources in response"
        assert isinstance(data["water_sources"], list), "water_sources should be a list"
    
    def test_environment_detail_returns_hazardous_waste(self, auth_headers):
        """Test that environment-detail returns hazardous_waste object"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/environment-detail",
            params={"start_date": "2026-04", "end_date": "2027-03"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "hazardous_waste" in data, "Missing hazardous_waste in response"
        assert isinstance(data["hazardous_waste"], dict), "hazardous_waste should be a dict"
        
        # Check structure
        hw = data["hazardous_waste"]
        assert "generated" in hw, "hazardous_waste missing 'generated'"
        assert "recovered" in hw, "hazardous_waste missing 'recovered'"
        assert "disposed" in hw, "hazardous_waste missing 'disposed'"
    
    def test_environment_detail_returns_non_hazardous_waste(self, auth_headers):
        """Test that environment-detail returns non_hazardous_waste object"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/environment-detail",
            params={"start_date": "2026-04", "end_date": "2027-03"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "non_hazardous_waste" in data, "Missing non_hazardous_waste in response"
        assert isinstance(data["non_hazardous_waste"], dict), "non_hazardous_waste should be a dict"
        
        # Check structure
        nhw = data["non_hazardous_waste"]
        assert "generated" in nhw, "non_hazardous_waste missing 'generated'"
        assert "recovered" in nhw, "non_hazardous_waste missing 'recovered'"
        assert "disposed" in nhw, "non_hazardous_waste missing 'disposed'"
    
    # ─────────────────────────────────────────────────────────────────────────
    # Test: GET /api/dashboard/esg-analytics
    # ─────────────────────────────────────────────────────────────────────────
    def test_esg_analytics_endpoint_exists(self, auth_headers):
        """Test that esg-analytics endpoint exists and returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/esg-analytics",
            params={"start_date": "2026-04", "end_date": "2027-03"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_esg_analytics_returns_emissions_array(self, auth_headers):
        """Test that esg-analytics returns emissions time series array"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/esg-analytics",
            params={"start_date": "2026-04", "end_date": "2027-03"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "emissions" in data, "Missing emissions in response"
        assert isinstance(data["emissions"], list), "emissions should be a list"
    
    def test_esg_analytics_returns_energy_array(self, auth_headers):
        """Test that esg-analytics returns energy time series array"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/esg-analytics",
            params={"start_date": "2026-04", "end_date": "2027-03"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "energy" in data, "Missing energy in response"
        assert isinstance(data["energy"], list), "energy should be a list"
    
    def test_esg_analytics_returns_water_array(self, auth_headers):
        """Test that esg-analytics returns water time series array"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/esg-analytics",
            params={"start_date": "2026-04", "end_date": "2027-03"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "water" in data, "Missing water in response"
        assert isinstance(data["water"], list), "water should be a list"
    
    def test_esg_analytics_returns_waste_array(self, auth_headers):
        """Test that esg-analytics returns waste time series array"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/esg-analytics",
            params={"start_date": "2026-04", "end_date": "2027-03"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "waste" in data, "Missing waste in response"
        assert isinstance(data["waste"], list), "waste should be a list"
    
    def test_esg_analytics_emissions_structure(self, auth_headers):
        """Test that emissions array items have expected structure"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/esg-analytics",
            params={"start_date": "2026-04", "end_date": "2027-03"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        emissions = data.get("emissions", [])
        if len(emissions) > 0:
            item = emissions[0]
            # Should have period and scope values
            assert "period" in item, "emissions item missing 'period'"
            # May have scope1, scope2, scope3 fields
            print(f"Emissions item keys: {list(item.keys())}")
    
    def test_esg_analytics_water_structure(self, auth_headers):
        """Test that water array items have expected structure"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/esg-analytics",
            params={"start_date": "2026-04", "end_date": "2027-03"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        water = data.get("water", [])
        if len(water) > 0:
            item = water[0]
            assert "period" in item, "water item missing 'period'"
            print(f"Water item keys: {list(item.keys())}")
    
    # ─────────────────────────────────────────────────────────────────────────
    # Test: Error handling
    # ─────────────────────────────────────────────────────────────────────────
    def test_environment_detail_requires_auth(self):
        """Test that environment-detail requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/environment-detail",
            params={"start_date": "2026-04", "end_date": "2027-03"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_esg_analytics_requires_auth(self):
        """Test that esg-analytics requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/esg-analytics",
            params={"start_date": "2026-04", "end_date": "2027-03"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_environment_detail_requires_date_params(self, auth_headers):
        """Test that environment-detail requires start_date and end_date"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/environment-detail",
            headers=auth_headers
        )
        # Should return 422 (validation error) if params missing
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}"
    
    def test_esg_analytics_requires_date_params(self, auth_headers):
        """Test that esg-analytics requires start_date and end_date"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/esg-analytics",
            headers=auth_headers
        )
        # Should return 422 (validation error) if params missing
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
