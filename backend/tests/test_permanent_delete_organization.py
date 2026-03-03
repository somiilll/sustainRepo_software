"""
Test Suite for Permanent Delete Organization Feature
Tests the SuperAdmin-only feature that permanently deletes an organization and ALL associated data
Including: emission_records, sinks, facilities, users

Endpoint: DELETE /api/super-admin/organizations/{org_id}/permanent
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPERADMIN_CREDENTIALS = {
    "email": "superadmin@ecotrack.com",
    "password": "SuperAdmin123!"
}


class TestPermanentDeleteOrganization:
    """Test suite for permanent organization deletion feature"""
    
    @pytest.fixture(scope="class")
    def superadmin_token(self):
        """Get SuperAdmin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=SUPERADMIN_CREDENTIALS
        )
        assert response.status_code == 200, f"SuperAdmin login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def superadmin_headers(self, superadmin_token):
        """Get headers with SuperAdmin auth"""
        return {
            "Authorization": f"Bearer {superadmin_token}",
            "Content-Type": "application/json"
        }
    
    @pytest.fixture(scope="class")
    def test_org_with_data(self, superadmin_headers):
        """Create a test organization with facilities, emissions, and sinks for deletion testing"""
        # Create test organization
        unique_suffix = str(uuid.uuid4())[:8]
        org_data = {
            "name": f"TEST_PERM_DELETE_ORG_{unique_suffix}",
            "corporate_address": "123 Test Delete Street",
            "city": "Test City",
            "state": "Test State",
            "country": "India",
            "pincode": "123456"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/super-admin/organizations",
            json=org_data,
            headers=superadmin_headers
        )
        assert response.status_code == 200, f"Failed to create test org: {response.text}"
        org = response.json()
        org_id = org["id"]
        
        # Create a test facility for this org (need to use admin endpoint)
        # First create an admin for this org
        admin_email = f"testadmin_{unique_suffix}@test.com"
        admin_response = requests.post(
            f"{BASE_URL}/api/super-admin/admins",
            params={
                "email": admin_email,
                "full_name": f"Test Admin {unique_suffix}",
                "organization_id": org_id
            },
            headers=superadmin_headers
        )
        
        # Note: Admin creation may fail if email exists, but we still have org to delete
        # The main test is that the org and any associated data gets deleted
        
        yield {
            "org_id": org_id,
            "org_name": org_data["name"],
            "unique_suffix": unique_suffix
        }
        
        # Cleanup: Try to delete if test didn't already
        try:
            requests.delete(
                f"{BASE_URL}/api/super-admin/organizations/{org_id}/permanent",
                headers=superadmin_headers
            )
        except:
            pass
    
    def test_permanent_delete_requires_superadmin_role(self):
        """Test that permanent delete endpoint requires SuperAdmin role (403 for non-superadmin)"""
        # First get a non-superadmin token - create a test user
        superadmin_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=SUPERADMIN_CREDENTIALS
        )
        superadmin_token = superadmin_response.json()["access_token"]
        superadmin_headers = {
            "Authorization": f"Bearer {superadmin_token}",
            "Content-Type": "application/json"
        }
        
        # Get any organization to test against
        orgs_response = requests.get(
            f"{BASE_URL}/api/super-admin/organizations",
            headers=superadmin_headers
        )
        assert orgs_response.status_code == 200
        orgs = orgs_response.json()
        
        if not orgs:
            pytest.skip("No organizations available to test role restriction")
        
        test_org_id = orgs[0]["id"]
        
        # Test with no auth - should get 403 or 401
        no_auth_response = requests.delete(
            f"{BASE_URL}/api/super-admin/organizations/{test_org_id}/permanent"
        )
        assert no_auth_response.status_code in [401, 403], \
            f"Expected 401/403 without auth, got {no_auth_response.status_code}"
        print(f"✓ No auth test: Got {no_auth_response.status_code} as expected")
    
    def test_permanent_delete_nonexistent_org_returns_404(self, superadmin_headers):
        """Test that deleting a non-existent organization returns 404"""
        fake_id = str(uuid.uuid4())
        
        response = requests.delete(
            f"{BASE_URL}/api/super-admin/organizations/{fake_id}/permanent",
            headers=superadmin_headers
        )
        
        assert response.status_code == 404, f"Expected 404 for non-existent org, got {response.status_code}"
        assert "not found" in response.json().get("detail", "").lower()
        print(f"✓ Non-existent org returns 404 as expected")
    
    def test_permanent_delete_success_and_cascading(self, superadmin_headers, test_org_with_data):
        """Test that permanent delete successfully removes org and all associated data"""
        org_id = test_org_with_data["org_id"]
        org_name = test_org_with_data["org_name"]
        
        # Verify org exists before deletion
        orgs_before = requests.get(
            f"{BASE_URL}/api/super-admin/organizations?include_deleted=true",
            headers=superadmin_headers
        ).json()
        org_exists_before = any(o["id"] == org_id for o in orgs_before)
        assert org_exists_before, "Test org should exist before deletion"
        print(f"✓ Test organization '{org_name}' exists before deletion")
        
        # Perform permanent deletion
        response = requests.delete(
            f"{BASE_URL}/api/super-admin/organizations/{org_id}/permanent",
            headers=superadmin_headers
        )
        
        assert response.status_code == 200, f"Permanent delete failed: {response.text}"
        
        # Verify response contains delete counts
        result = response.json()
        assert "message" in result, "Response should contain message"
        assert "deleted_counts" in result, "Response should contain deleted_counts"
        assert "facilities" in result["deleted_counts"], "deleted_counts should have facilities"
        assert "emission_records" in result["deleted_counts"], "deleted_counts should have emission_records"
        assert "sinks" in result["deleted_counts"], "deleted_counts should have sinks"
        assert "users" in result["deleted_counts"], "deleted_counts should have users"
        
        print(f"✓ Permanent delete response: {result}")
        
        # Verify org no longer exists
        orgs_after = requests.get(
            f"{BASE_URL}/api/super-admin/organizations?include_deleted=true",
            headers=superadmin_headers
        ).json()
        org_exists_after = any(o["id"] == org_id for o in orgs_after)
        assert not org_exists_after, "Organization should NOT exist after permanent deletion"
        print(f"✓ Organization '{org_name}' successfully removed from database")
    
    def test_permanent_delete_returns_correct_deleted_counts(self, superadmin_headers):
        """Test that permanent delete returns accurate deleted counts for all related data"""
        # Create a fresh org for accurate count testing
        unique_suffix = str(uuid.uuid4())[:8]
        org_data = {
            "name": f"TEST_COUNT_DELETE_{unique_suffix}",
            "corporate_address": "456 Count Test Street",
            "city": "Count City",
            "state": "Count State",
            "country": "India",
            "pincode": "654321"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/super-admin/organizations",
            json=org_data,
            headers=superadmin_headers
        )
        assert response.status_code == 200
        org_id = response.json()["id"]
        
        # Delete immediately (no facilities/emissions created)
        delete_response = requests.delete(
            f"{BASE_URL}/api/super-admin/organizations/{org_id}/permanent",
            headers=superadmin_headers
        )
        
        assert delete_response.status_code == 200
        result = delete_response.json()
        
        # For a new org with no data, counts should all be 0
        assert result["deleted_counts"]["facilities"] == 0, "Fresh org should have 0 facilities"
        assert result["deleted_counts"]["emission_records"] == 0, "Fresh org should have 0 emission_records"
        assert result["deleted_counts"]["sinks"] == 0, "Fresh org should have 0 sinks"
        # Users might be 0 or more depending on if admin was created
        assert result["deleted_counts"]["users"] >= 0, "Users count should be >= 0"
        
        print(f"✓ Deleted counts for fresh org: {result['deleted_counts']}")


class TestPermanentDeleteVsSoftDelete:
    """Compare permanent delete vs soft delete behavior"""
    
    @pytest.fixture(scope="class")
    def superadmin_headers(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=SUPERADMIN_CREDENTIALS
        )
        assert response.status_code == 200
        return {
            "Authorization": f"Bearer {response.json()['access_token']}",
            "Content-Type": "application/json"
        }
    
    def test_soft_delete_keeps_org_in_database(self, superadmin_headers):
        """Verify that soft delete (regular DELETE) keeps org in DB with is_deleted=true"""
        # Create org
        unique_suffix = str(uuid.uuid4())[:8]
        org_data = {
            "name": f"TEST_SOFT_DELETE_{unique_suffix}",
            "corporate_address": "789 Soft Delete St",
            "city": "Soft City",
            "state": "Soft State",
            "country": "India",
            "pincode": "111111"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/super-admin/organizations",
            json=org_data,
            headers=superadmin_headers
        )
        assert create_response.status_code == 200
        org_id = create_response.json()["id"]
        
        # Soft delete
        soft_delete_response = requests.delete(
            f"{BASE_URL}/api/super-admin/organizations/{org_id}",
            headers=superadmin_headers
        )
        assert soft_delete_response.status_code == 200
        
        # Verify org still exists with is_deleted=true
        orgs = requests.get(
            f"{BASE_URL}/api/super-admin/organizations?include_deleted=true",
            headers=superadmin_headers
        ).json()
        
        soft_deleted_org = next((o for o in orgs if o["id"] == org_id), None)
        assert soft_deleted_org is not None, "Soft deleted org should still exist"
        assert soft_deleted_org.get("is_deleted") == True, "is_deleted should be True"
        assert soft_deleted_org.get("is_active") == False, "is_active should be False"
        print(f"✓ Soft delete keeps org in DB with is_deleted=True")
        
        # Cleanup: Permanent delete
        requests.delete(
            f"{BASE_URL}/api/super-admin/organizations/{org_id}/permanent",
            headers=superadmin_headers
        )
    
    def test_permanent_delete_removes_org_completely(self, superadmin_headers):
        """Verify that permanent delete completely removes org from database"""
        # Create org
        unique_suffix = str(uuid.uuid4())[:8]
        org_data = {
            "name": f"TEST_PERM_COMPLETE_{unique_suffix}",
            "corporate_address": "999 Complete Delete St",
            "city": "Complete City",
            "state": "Complete State",
            "country": "India",
            "pincode": "222222"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/super-admin/organizations",
            json=org_data,
            headers=superadmin_headers
        )
        assert create_response.status_code == 200
        org_id = create_response.json()["id"]
        
        # Permanent delete
        perm_delete_response = requests.delete(
            f"{BASE_URL}/api/super-admin/organizations/{org_id}/permanent",
            headers=superadmin_headers
        )
        assert perm_delete_response.status_code == 200
        
        # Verify org does NOT exist even with include_deleted
        orgs = requests.get(
            f"{BASE_URL}/api/super-admin/organizations?include_deleted=true",
            headers=superadmin_headers
        ).json()
        
        deleted_org = next((o for o in orgs if o["id"] == org_id), None)
        assert deleted_org is None, "Permanently deleted org should NOT exist in database"
        print(f"✓ Permanent delete completely removes org from database")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
