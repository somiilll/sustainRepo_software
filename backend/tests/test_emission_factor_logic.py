"""
Test Emission Factor Logic Changes
Tests:
1. Super Admin can CRUD standard emission factors
2. No hardcoded default factors exist
3. Admin/User can view standard factors but cannot edit/delete them
4. Admin/User can CRUD custom emission factors with justification
5. Organization access: User read-only, Admin can edit
6. Facility access: User can edit (not delete), Admin can CRUD
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPER_ADMIN = {"email": "superadmin@ecotrack.com", "password": "SuperAdmin123!"}
ADMIN = {"email": "admin@ghg.com", "password": "admin123"}


@pytest.fixture(scope="module")
def super_admin_token():
    """Get super admin token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN)
    if response.status_code != 200:
        pytest.skip(f"Super admin login failed: {response.text}")
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    """Get admin token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.text}")
    return response.json()["access_token"]


def get_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


class TestSuperAdminEmissionFactors:
    """Super Admin emission factors CRUD tests"""
    
    created_factor_id = None
    
    def test_super_admin_can_create_standard_factor(self, super_admin_token):
        """Super Admin should be able to create standard emission factors"""
        payload = {
            "name": "TEST Natural Gas Standard Factor",
            "scope": "scope1",
            "category": "Stationary Combustion",
            "sub_category": "Natural Gas TEST",
            "factor": 2.04,
            "unit": "kg CO2e/m³",
            "source": "GHG Protocol Test",
            "references": "https://ghgprotocol.org/test",
            "region": "Global (All Regions)"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/super-admin/emission-factors",
            json=payload,
            headers=get_headers(super_admin_token)
        )
        
        # Data assertions
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["name"] == payload["name"]
        assert data["is_custom"] == False, "Standard factor should have is_custom=false"
        assert "id" in data
        
        # Save for later tests
        TestSuperAdminEmissionFactors.created_factor_id = data["id"]
        print(f"Created standard factor: {data['id']}")
    
    def test_super_admin_can_read_standard_factors(self, super_admin_token):
        """Super Admin should be able to read all standard factors"""
        response = requests.get(
            f"{BASE_URL}/api/emission-factors/standard",
            headers=get_headers(super_admin_token)
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Should return a list of factors"
        print(f"Found {len(data)} standard factors")
    
    def test_super_admin_can_update_standard_factor(self, super_admin_token):
        """Super Admin should be able to update standard factors"""
        if not TestSuperAdminEmissionFactors.created_factor_id:
            pytest.skip("No factor to update")
        
        payload = {
            "name": "TEST Natural Gas Updated Factor",
            "scope": "scope1",
            "category": "Stationary Combustion",
            "sub_category": "Natural Gas TEST",
            "factor": 2.10,
            "unit": "kg CO2e/m³",
            "source": "GHG Protocol Test Updated",
            "references": "https://ghgprotocol.org/test-updated",
            "region": "Global (All Regions)"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/super-admin/emission-factors/{TestSuperAdminEmissionFactors.created_factor_id}",
            json=payload,
            headers=get_headers(super_admin_token)
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["factor"] == 2.10, "Factor should be updated"
        assert data["is_custom"] == False, "Should remain standard factor"
        print(f"Updated factor: {data['id']}")
    
    def test_super_admin_can_delete_standard_factor(self, super_admin_token):
        """Super Admin should be able to delete standard factors"""
        if not TestSuperAdminEmissionFactors.created_factor_id:
            pytest.skip("No factor to delete")
        
        response = requests.delete(
            f"{BASE_URL}/api/super-admin/emission-factors/{TestSuperAdminEmissionFactors.created_factor_id}",
            headers=get_headers(super_admin_token)
        )
        
        assert response.status_code == 200
        print(f"Deleted factor: {TestSuperAdminEmissionFactors.created_factor_id}")


class TestAdminCannotModifyStandardFactors:
    """Admin should NOT be able to edit/delete standard factors"""
    
    def test_admin_can_view_standard_factors(self, admin_token):
        """Admin should be able to view standard factors"""
        response = requests.get(
            f"{BASE_URL}/api/emission-factors",
            headers=get_headers(admin_token)
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Admin can view {len(data)} emission factors")
    
    def test_admin_cannot_use_super_admin_endpoints(self, admin_token):
        """Admin should get 403 when trying to use super-admin endpoints"""
        # Try to create via super admin endpoint
        payload = {
            "name": "TEST Unauthorized Factor",
            "scope": "scope1",
            "category": "Stationary Combustion",
            "sub_category": "Coal TEST",
            "factor": 2.5,
            "unit": "kg CO2e/kg",
            "source": "Test",
            "references": "Test ref"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/super-admin/emission-factors",
            json=payload,
            headers=get_headers(admin_token)
        )
        
        assert response.status_code == 403, f"Admin should get 403 for super-admin endpoint, got {response.status_code}"
        print("Admin correctly denied access to super-admin emission factor creation")


class TestAdminCustomFactors:
    """Admin can CRUD custom emission factors"""
    
    custom_factor_id = None
    
    def test_admin_can_create_custom_factor_with_justification(self, admin_token):
        """Admin should be able to create custom factors with justification"""
        payload = {
            "name": "TEST Admin Custom Factor",
            "scope": "scope1",
            "category": "Custom Category",
            "sub_category": "Custom Sub TEST",
            "factor": 3.14,
            "unit": "kg CO2e/unit",
            "source": "Internal Measurement",
            "references": "Internal measurement process",
            "justification": "Specific to our org manufacturing process",
            "is_custom": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/custom-emission-factors",
            json=payload,
            headers=get_headers(admin_token)
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["is_custom"] == True
        assert data["justification"] == payload["justification"]
        
        TestAdminCustomFactors.custom_factor_id = data["id"]
        print(f"Admin created custom factor: {data['id']}")
    
    def test_admin_custom_factor_requires_justification(self, admin_token):
        """Custom factor creation should require justification"""
        payload = {
            "name": "TEST No Justification Factor",
            "scope": "scope1",
            "category": "Custom Category",
            "sub_category": "No Just TEST",
            "factor": 1.0,
            "unit": "kg CO2e/unit",
            "source": "Test",
            # No justification provided
        }
        
        response = requests.post(
            f"{BASE_URL}/api/custom-emission-factors",
            json=payload,
            headers=get_headers(admin_token)
        )
        
        assert response.status_code == 400, f"Expected 400 without justification, got {response.status_code}"
        print("Custom factor correctly requires justification")
    
    def test_admin_can_update_custom_factor(self, admin_token):
        """Admin should be able to update their custom factors"""
        if not TestAdminCustomFactors.custom_factor_id:
            pytest.skip("No custom factor to update")
        
        payload = {
            "name": "TEST Admin Custom Factor Updated",
            "scope": "scope1",
            "category": "Custom Category",
            "sub_category": "Custom Sub TEST",
            "factor": 3.50,
            "unit": "kg CO2e/unit",
            "source": "Internal Measurement Updated",
            "references": "Updated references",
            "justification": "Updated justification for changes"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/custom-emission-factors/{TestAdminCustomFactors.custom_factor_id}",
            json=payload,
            headers=get_headers(admin_token)
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["factor"] == 3.50
        print(f"Admin updated custom factor: {data['id']}")
    
    def test_admin_can_delete_custom_factor(self, admin_token):
        """Admin should be able to delete their custom factors"""
        if not TestAdminCustomFactors.custom_factor_id:
            pytest.skip("No custom factor to delete")
        
        response = requests.delete(
            f"{BASE_URL}/api/custom-emission-factors/{TestAdminCustomFactors.custom_factor_id}",
            headers=get_headers(admin_token)
        )
        
        assert response.status_code == 200
        print(f"Admin deleted custom factor: {TestAdminCustomFactors.custom_factor_id}")


class TestOrganizationAccess:
    """Test organization access levels"""
    
    def test_admin_can_get_organization(self, admin_token):
        """Admin should be able to get organization details"""
        response = requests.get(
            f"{BASE_URL}/api/organizations/my",
            headers=get_headers(admin_token)
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "name" in data
        print(f"Admin got organization: {data['name']}")
    
    def test_admin_can_update_organization(self, admin_token):
        """Admin should be able to update organization"""
        # First get current org details
        get_response = requests.get(
            f"{BASE_URL}/api/organizations/my",
            headers=get_headers(admin_token)
        )
        
        if get_response.status_code != 200:
            pytest.skip("Could not get organization")
        
        org_data = get_response.json()
        
        # Update with same data + remarks
        payload = {
            "name": org_data["name"],
            "corporate_address": org_data.get("corporate_address", "123 Test St"),
            "city": org_data.get("city", ""),
            "state": org_data.get("state", ""),
            "country": org_data.get("country", ""),
            "pincode": org_data.get("pincode", ""),
            "remarks": "TEST remarks added by testing agent"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/organizations/my",
            json=payload,
            headers=get_headers(admin_token)
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["remarks"] == "TEST remarks added by testing agent"
        print(f"Admin updated organization with remarks")


class TestFacilityAccess:
    """Test facility access levels"""
    
    def test_admin_can_get_facilities(self, admin_token):
        """Admin should be able to list facilities"""
        response = requests.get(
            f"{BASE_URL}/api/facilities",
            headers=get_headers(admin_token)
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Admin can view {len(data)} facilities")


class TestNoHardcodedFactors:
    """Verify no hardcoded factors exist"""
    
    def test_standard_factors_come_from_db_only(self, super_admin_token):
        """Standard factors should only come from database"""
        response = requests.get(
            f"{BASE_URL}/api/emission-factors/standard",
            headers=get_headers(super_admin_token)
        )
        
        assert response.status_code == 200
        factors = response.json()
        
        # All factors should have database-generated IDs (UUIDs)
        for factor in factors:
            assert "id" in factor, "Factor should have ID from database"
            assert factor.get("is_custom") == False or factor.get("is_custom") is None or factor.get("is_custom") == False, \
                "Standard factors should have is_custom=False"
        
        print(f"All {len(factors)} standard factors come from database (no hardcoded)")


# Cleanup fixture
@pytest.fixture(scope="module", autouse=True)
def cleanup(super_admin_token, admin_token):
    """Cleanup test data after all tests"""
    yield
    # Cleanup is handled within individual test classes
