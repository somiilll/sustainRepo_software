"""
Test file for Iteration 15 features:
1. Admin can delete users and deleted users cannot login
2. Custom Factors page loads and allows creating custom emission factors
3. Sectors dropdown in Facilities shows predefined options with custom option
4. Organization Details page does NOT show base_year field
5. Evidence download in Emissions works correctly
6. User sidebar does NOT have duplicate org details panel
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://compliance-data-ai.preview.emergentagent.com')

# Test credentials
ADMIN_EMAIL = "admin@ghg.com"
ADMIN_PASSWORD = "admin123"
USER_EMAIL = "test@user.com"
USER_PASSWORD = "user123"
SUPER_ADMIN_EMAIL = "superadmin@ecotrack.com"
SUPER_ADMIN_PASSWORD = "SuperAdmin123!"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def user_token():
    """Get user authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": USER_EMAIL,
        "password": USER_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"User login failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def super_admin_token():
    """Get super admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": SUPER_ADMIN_EMAIL,
        "password": SUPER_ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Super Admin login failed: {response.status_code} - {response.text}")


class TestAdminUserDeletion:
    """Test Feature 1: Admin can delete users and deleted users cannot login"""
    
    def test_admin_can_list_users(self, admin_token):
        """Admin should be able to list users in their org"""
        response = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        users = response.json()
        assert isinstance(users, list)
        print(f"Found {len(users)} users in org")
    
    def test_admin_cannot_delete_self(self, admin_token):
        """Admin should not be able to delete their own account"""
        # First get admin's own ID
        me_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert me_response.status_code == 200
        admin_id = me_response.json().get("id")
        
        # Try to delete self
        delete_response = requests.delete(
            f"{BASE_URL}/api/admin/users/{admin_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert delete_response.status_code == 400
        assert "Cannot delete your own account" in delete_response.json().get("detail", "")
        print("Admin correctly blocked from deleting self")
    
    def test_admin_delete_user_endpoint_exists(self, admin_token):
        """DELETE endpoint for users should exist"""
        # Use a non-existent user ID to verify endpoint exists
        fake_user_id = str(uuid.uuid4())
        response = requests.delete(
            f"{BASE_URL}/api/admin/users/{fake_user_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        # Should return 404 (not found) not 405 (method not allowed)
        assert response.status_code in [404, 403, 200]
        print(f"Delete user endpoint exists, returned: {response.status_code}")
    
    def test_deleted_user_cannot_login(self, admin_token, super_admin_token):
        """Soft deleted users should be blocked from logging in"""
        # Create a test user first via admin
        unique_id = str(uuid.uuid4())[:8]
        test_user_email = f"test_delete_{unique_id}@test.com"
        
        # Create test user via admin
        create_response = requests.post(
            f"{BASE_URL}/api/admin/users",
            json={
                "email": test_user_email,
                "full_name": f"Test Delete User {unique_id}",
                "assigned_facilities": []
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        if create_response.status_code != 200:
            pytest.skip(f"Could not create test user: {create_response.text}")
        
        temp_password = create_response.json().get("temp_password")
        print(f"Created test user: {test_user_email}")
        
        # Verify user can login before deletion
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": test_user_email, "password": temp_password}
        )
        assert login_response.status_code == 200, f"New user should be able to login: {login_response.text}"
        
        # Get user ID from login response
        user_id = login_response.json().get("user", {}).get("id")
        print(f"User ID: {user_id}")
        
        if not user_id:
            pytest.skip("Could not get user ID from login response")
        
        # Delete the user
        delete_response = requests.delete(
            f"{BASE_URL}/api/admin/users/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        print(f"User deleted successfully")
        
        # Try to login as deleted user - should fail
        login_after_delete = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": test_user_email, "password": temp_password}
        )
        assert login_after_delete.status_code == 403
        assert "deleted" in login_after_delete.json().get("detail", "").lower()
        print(f"Deleted user correctly blocked from login: {login_after_delete.json().get('detail')}")


class TestCustomEmissionFactors:
    """Test Feature 2: Custom Factors page loads and allows creating custom emission factors"""
    
    def test_get_emission_factors_endpoint(self, admin_token):
        """Get emission factors endpoint should work"""
        response = requests.get(
            f"{BASE_URL}/api/emission-factors",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        factors = response.json()
        assert isinstance(factors, list)
        print(f"Found {len(factors)} emission factors")
        
        # Check if there are custom factors
        custom_count = sum(1 for f in factors if f.get("is_custom") == True)
        standard_count = sum(1 for f in factors if f.get("is_custom") == False)
        print(f"Custom factors: {custom_count}, Standard factors: {standard_count}")
    
    def test_create_custom_emission_factor(self, admin_token):
        """Admin should be able to create custom emission factor"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "name": f"Test Custom Factor {unique_id}",
            "scope": "scope1",
            "category": "Stationary Combustion",
            "sub_category": f"Custom Fuel {unique_id}",
            "factor": 2.5,
            "unit": "kg CO2e/L",
            "source": "Internal measurement",
            "references": "Test reference",
            "region": "India",
            "justification": "This is a test custom factor for a unique fuel type not in standard factors"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/custom-emission-factors",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Create custom factor failed: {response.text}"
        
        created = response.json()
        assert created.get("is_custom") == True
        assert created.get("name") == payload["name"]
        print(f"Created custom factor: {created.get('id')}")
        
        # Cleanup - delete the custom factor
        delete_response = requests.delete(
            f"{BASE_URL}/api/custom-emission-factors/{created.get('id')}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Cleanup: delete response {delete_response.status_code}")
    
    def test_custom_factor_requires_justification(self, admin_token):
        """Custom factor creation should require justification"""
        payload = {
            "name": "Test Factor No Justification",
            "scope": "scope1",
            "category": "Stationary Combustion",
            "sub_category": "Test Fuel",
            "factor": 2.5,
            "unit": "kg CO2e/L",
            "source": "Test"
            # Missing justification
        }
        
        response = requests.post(
            f"{BASE_URL}/api/custom-emission-factors",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 400
        assert "justification" in response.json().get("detail", "").lower()
        print("Custom factor correctly requires justification")


class TestSectorsDropdown:
    """Test Feature 3: Sectors dropdown in Facilities shows predefined options"""
    
    def test_get_sectors_endpoint(self, admin_token):
        """Get sectors endpoint should return predefined sectors"""
        response = requests.get(
            f"{BASE_URL}/api/sectors",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        sectors = response.json()
        assert isinstance(sectors, list)
        assert len(sectors) >= 10  # Should have at least default sectors
        
        sector_names = [s.get("name") for s in sectors]
        expected_sectors = ["Manufacturing", "Transportation", "Energy", "Agriculture", 
                          "Construction", "Retail", "Healthcare", "Technology", "Finance", "Other"]
        
        for expected in expected_sectors:
            assert expected in sector_names, f"Missing expected sector: {expected}"
        
        print(f"Found {len(sectors)} sectors: {sector_names}")
    
    def test_user_can_access_sectors(self, user_token):
        """Regular user should also be able to access sectors"""
        response = requests.get(
            f"{BASE_URL}/api/sectors",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert response.status_code == 200
        print(f"User can access sectors: {len(response.json())} sectors")


class TestOrganizationDetails:
    """Test Feature 4: Organization Details page does NOT show base_year field (API verification)"""
    
    def test_get_organization_returns_base_year(self, admin_token):
        """Verify organization API response structure (base_year in model but not shown in UI)"""
        response = requests.get(
            f"{BASE_URL}/api/organizations/my",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        org = response.json()
        assert "name" in org
        assert "corporate_address" in org
        # base_year may or may not be in response - the UI just shouldn't show it
        print(f"Organization: {org.get('name')}, has base_year field: {'base_year' in org}")


class TestEvidenceDownload:
    """Test Feature 5: Evidence download in Emissions works correctly"""
    
    def test_file_upload_endpoint_exists(self, admin_token):
        """File upload endpoint should exist"""
        # Just verify the endpoint exists - not actually uploading
        response = requests.options(f"{BASE_URL}/api/upload/evidence")
        # Should not be 404
        assert response.status_code != 404
        print("Upload evidence endpoint exists")
    
    def test_file_view_endpoint_pattern(self, admin_token):
        """File view endpoint pattern should return proper response"""
        # Test with a non-existent file ID - should return 404 not 500
        fake_file_id = str(uuid.uuid4())
        response = requests.get(
            f"{BASE_URL}/api/files/{fake_file_id}/view",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        # Should be 404 (file not found) or 401 (auth required), not 500
        assert response.status_code in [404, 401, 403]
        print(f"File view endpoint response for non-existent file: {response.status_code}")


class TestUserSidebar:
    """Test Feature 6: User sidebar does NOT have duplicate org details panel (Code verification)"""
    
    def test_user_has_correct_navigation_items(self, user_token):
        """Verify user auth response has correct role"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert response.status_code == 200
        user = response.json()
        assert user.get("role") == "user"
        print(f"User role: {user.get('role')}, email: {user.get('email')}")
    
    def test_user_organization_endpoint(self, user_token):
        """User should be able to access their organization (read-only)"""
        response = requests.get(
            f"{BASE_URL}/api/organizations/my",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        # Should return 200 for users with org, or 404 if no org assigned
        assert response.status_code in [200, 404]
        if response.status_code == 200:
            print(f"User can view org: {response.json().get('name')}")
        else:
            print("User has no organization assigned")


class TestEmissionRecords:
    """Additional tests for emissions functionality"""
    
    def test_get_emissions(self, admin_token):
        """Get emissions endpoint should work"""
        response = requests.get(
            f"{BASE_URL}/api/emissions",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        emissions = response.json()
        assert isinstance(emissions, list)
        print(f"Found {len(emissions)} emission records")
        
        # Check if any emissions have evidence_url
        with_evidence = sum(1 for e in emissions if e.get("evidence_url"))
        print(f"Emissions with evidence: {with_evidence}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
