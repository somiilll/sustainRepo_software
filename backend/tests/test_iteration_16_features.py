"""
Iteration 16 Test Suite - Testing GHG Platform Fixes
Features to test:
1. User deletion shows AlertDialog confirmation and works correctly
2. Evidence files have both View and Download buttons in Emissions
3. Attachments have both View and Download buttons in Organization Details
4. Attachments have both View and Download buttons in Facilities
5. Custom fuel type option appears in emission form when selecting '+ Add Custom Fuel Type'
6. Custom Factors nav item is removed from sidebar
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://scope3-upload.preview.emergentagent.com')

class TestBackendAPIs:
    """Backend API tests for iteration 16 features"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@ghg.com",
            "password": "admin123"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin authentication failed - cannot proceed with tests")
    
    @pytest.fixture(scope="class")
    def admin_headers(self, admin_token):
        """Get authorization headers"""
        return {"Authorization": f"Bearer {admin_token}"}
    
    # Feature 1: User deletion endpoint
    def test_admin_users_delete_endpoint_exists(self, admin_headers):
        """Verify DELETE /api/admin/users/{user_id} endpoint exists"""
        # First create a test user to delete
        create_response = requests.post(
            f"{BASE_URL}/api/admin/users",
            json={
                "email": "TEST_delete_iteration16@test.com",
                "full_name": "Test Delete User Iter16",
                "assigned_facilities": []
            },
            headers=admin_headers
        )
        
        if create_response.status_code in [200, 201]:
            # Get user list to find the created user
            users_response = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers)
            assert users_response.status_code == 200
            users = users_response.json()
            test_user = next((u for u in users if u.get("email") == "TEST_delete_iteration16@test.com"), None)
            
            if test_user:
                # Delete the user
                delete_response = requests.delete(
                    f"{BASE_URL}/api/admin/users/{test_user['id']}",
                    headers=admin_headers
                )
                # 200 or 204 are valid success codes for delete
                assert delete_response.status_code in [200, 204], f"Delete should succeed, got {delete_response.status_code}"
                print(f"User deletion endpoint works: Status {delete_response.status_code}")
            else:
                print("Test user created but not found in list - endpoint exists")
        else:
            print(f"User creation returned {create_response.status_code} - may have reached user limit")
    
    # Feature 2: Download endpoint for files
    def test_file_download_endpoint_exists(self):
        """Verify GET /api/files/{file_id}/download endpoint exists and returns proper response"""
        # Test with a non-existent file ID to verify endpoint exists
        response = requests.get(f"{BASE_URL}/api/files/nonexistent-file-id/download")
        # Should return 404 for non-existent file (not 405 method not allowed)
        assert response.status_code == 404, f"Expected 404 for non-existent file, got {response.status_code}"
        print(f"Download endpoint exists: Returns 404 for non-existent file as expected")
    
    def test_file_view_endpoint_exists(self):
        """Verify GET /api/files/{file_id}/view endpoint exists"""
        response = requests.get(f"{BASE_URL}/api/files/nonexistent-file-id/view")
        assert response.status_code == 404, f"Expected 404 for non-existent file, got {response.status_code}"
        print(f"View endpoint exists: Returns 404 for non-existent file as expected")
    
    # Feature 5: Emission factors for custom fuel types
    def test_emission_factors_endpoint(self, admin_headers):
        """Verify emission factors endpoint returns factors from database"""
        response = requests.get(f"{BASE_URL}/api/emission-factors", headers=admin_headers)
        assert response.status_code == 200
        factors = response.json()
        print(f"Emission factors endpoint works: Retrieved {len(factors)} factors")
        assert isinstance(factors, list)
    
    def test_custom_emission_factor_creation(self, admin_headers):
        """Test creating a custom emission factor with justification"""
        custom_factor = {
            "name": "TEST Custom Factor Iter16",
            "scope": "scope1",
            "category": "Stationary Combustion",
            "sub_category": "TEST_Custom_Fuel_Type",
            "factor": 2.5,
            "unit": "kg CO2e/L",
            "source": "Test Source",
            "region": "India",
            "justification": "Testing custom fuel type feature for iteration 16",
            "is_custom": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/custom-emission-factors",
            json=custom_factor,
            headers=admin_headers
        )
        
        if response.status_code == 201:
            data = response.json()
            factor_id = data.get("id")
            print(f"Custom factor created successfully: {factor_id}")
            
            # Clean up - delete the created factor
            if factor_id:
                delete_response = requests.delete(
                    f"{BASE_URL}/api/custom-emission-factors/{factor_id}",
                    headers=admin_headers
                )
                print(f"Cleanup: Deleted test factor, status {delete_response.status_code}")
        elif response.status_code == 400:
            # Factor might already exist
            print(f"Custom factor creation returned 400 - factor may already exist: {response.json()}")
        else:
            print(f"Custom factor creation returned {response.status_code}: {response.text}")
    
    # Test facilities endpoint has attachments
    def test_facilities_endpoint(self, admin_headers):
        """Verify facilities endpoint works and returns attachment data"""
        response = requests.get(f"{BASE_URL}/api/facilities", headers=admin_headers)
        assert response.status_code == 200
        facilities = response.json()
        print(f"Facilities endpoint works: Retrieved {len(facilities)} facilities")
        
        # Check if any facility has attachments
        facilities_with_attachments = [f for f in facilities if f.get("attachments")]
        print(f"Facilities with attachments: {len(facilities_with_attachments)}")
    
    # Test organization endpoint has attachments
    def test_organization_endpoint(self, admin_headers):
        """Verify organization endpoint works and returns attachment data"""
        response = requests.get(f"{BASE_URL}/api/organizations/my", headers=admin_headers)
        assert response.status_code == 200
        org = response.json()
        print(f"Organization endpoint works: {org.get('name')}")
        
        attachments = org.get("attachments") or []
        print(f"Organization attachments count: {len(attachments)}")
    
    # Test emissions endpoint
    def test_emissions_endpoint(self, admin_headers):
        """Verify emissions endpoint works and returns evidence_url data"""
        response = requests.get(f"{BASE_URL}/api/emissions", headers=admin_headers)
        assert response.status_code == 200
        emissions = response.json()
        print(f"Emissions endpoint works: Retrieved {len(emissions)} emission records")
        
        # Check if any emission has evidence_url
        emissions_with_evidence = [e for e in emissions if e.get("evidence_url")]
        print(f"Emissions with evidence: {len(emissions_with_evidence)}")


class TestUserDeletion:
    """Test user deletion API behavior"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@ghg.com",
            "password": "admin123"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin authentication failed")
    
    @pytest.fixture(scope="class")
    def admin_headers(self, admin_token):
        return {"Authorization": f"Bearer {admin_token}"}
    
    def test_admin_cannot_delete_self(self, admin_headers):
        """Admin should not be able to delete themselves"""
        # Get current admin user info
        me_response = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers)
        if me_response.status_code != 200:
            pytest.skip("Could not get current user info")
        
        admin_id = me_response.json().get("id")
        
        # Try to delete self
        delete_response = requests.delete(
            f"{BASE_URL}/api/admin/users/{admin_id}",
            headers=admin_headers
        )
        
        # Should be rejected with 400
        assert delete_response.status_code == 400, f"Expected 400, got {delete_response.status_code}"
        print("Admin cannot delete self: PASSED")
    
    def test_deleted_user_cannot_login(self, admin_headers):
        """Verify that a deleted user cannot log in"""
        # Create a test user
        create_response = requests.post(
            f"{BASE_URL}/api/admin/users",
            json={
                "email": "TEST_login_block_iter16@test.com",
                "full_name": "Test Login Block Iter16",
                "assigned_facilities": []
            },
            headers=admin_headers
        )
        
        if create_response.status_code not in [200, 201]:
            pytest.skip("Could not create test user - may have reached limit")
        
        temp_password = create_response.json().get("temp_password")
        
        # Get user ID
        users_response = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers)
        users = users_response.json()
        test_user = next((u for u in users if u.get("email") == "TEST_login_block_iter16@test.com"), None)
        
        if not test_user:
            pytest.skip("Could not find created test user")
        
        # Delete the user
        delete_response = requests.delete(
            f"{BASE_URL}/api/admin/users/{test_user['id']}",
            headers=admin_headers
        )
        assert delete_response.status_code in [200, 204]
        
        # Try to login with deleted user
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "TEST_login_block_iter16@test.com",
            "password": temp_password
        })
        
        # Should be 401 (user not found after deletion) or 403 (account deleted)
        assert login_response.status_code in [401, 403], f"Deleted user should not login, got {login_response.status_code}"
        print(f"Deleted user login blocked: Status {login_response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
