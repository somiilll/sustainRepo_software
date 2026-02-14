"""
Test P0 Fixes for GHG Platform:
1. Super Admin login redirects to /super-admin dashboard correctly
2. Admin login redirects to /dashboard correctly
3. Super Admin dashboard loads and displays organizations chart
4. Admin without organization_id doesn't crash - returns empty data gracefully
5. Evidence file download works for Admin users
6. Standard emission factors are visible in the dropdown when adding emission records
7. Custom emission factors appear alongside standard factors
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
API_URL = f"{BASE_URL}/api"

# Test credentials
SUPER_ADMIN_EMAIL = "superadmin@ecotrack.com"
SUPER_ADMIN_PASSWORD = "SuperAdmin123!"
ADMIN_WITHOUT_ORG_EMAIL = "admin@ghg.com"
ADMIN_WITHOUT_ORG_PASSWORD = "admin123"


class TestAuthenticationAndRedirects:
    """Test authentication and role-based redirects"""
    
    def test_super_admin_login_returns_correct_role(self):
        """Test that super admin login returns correct user role for frontend redirect"""
        response = requests.post(f"{API_URL}/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        
        assert response.status_code == 200, f"Super Admin login failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "access_token" in data, "No access_token in response"
        assert "user" in data, "No user in response"
        
        # Verify user role is super_admin (frontend uses this to redirect to /super-admin)
        user = data["user"]
        assert user["role"] == "super_admin", f"Expected role 'super_admin', got '{user['role']}'"
        print(f"✓ Super Admin login successful - role: {user['role']}")
    
    def test_admin_without_org_login(self):
        """Test that admin without organization can still login"""
        response = requests.post(f"{API_URL}/auth/login", json={
            "email": ADMIN_WITHOUT_ORG_EMAIL,
            "password": ADMIN_WITHOUT_ORG_PASSWORD
        })
        
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "access_token" in data, "No access_token in response"
        assert "user" in data, "No user in response"
        
        # Verify user role is admin (frontend uses this to redirect to /dashboard)
        user = data["user"]
        assert user["role"] == "admin", f"Expected role 'admin', got '{user['role']}'"
        
        # This admin should NOT have an organization_id
        assert user.get("organization_id") is None or user.get("organization_id") == "", \
            f"Expected no organization_id, got {user.get('organization_id')}"
        
        print(f"✓ Admin without org login successful - role: {user['role']}, org_id: {user.get('organization_id')}")


class TestSuperAdminDashboard:
    """Test Super Admin dashboard endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get super admin auth token"""
        response = requests.post(f"{API_URL}/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Super Admin authentication failed")
    
    def test_super_admin_dashboard_loads(self):
        """Test that super admin dashboard endpoint returns data"""
        response = requests.get(f"{API_URL}/super-admin/dashboard", headers=self.headers)
        
        assert response.status_code == 200, f"Dashboard failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "total_organizations" in data, "Missing total_organizations"
        assert "total_facilities" in data, "Missing total_facilities"
        assert "organization_stats" in data, "Missing organization_stats"
        
        # Verify types
        assert isinstance(data["total_organizations"], int), "total_organizations should be int"
        assert isinstance(data["total_facilities"], int), "total_facilities should be int"
        assert isinstance(data["organization_stats"], list), "organization_stats should be list"
        
        print(f"✓ Super Admin Dashboard: {data['total_organizations']} orgs, {data['total_facilities']} facilities")
    
    def test_organizations_stats_structure(self):
        """Test that organization stats have correct structure for chart display"""
        response = requests.get(f"{API_URL}/super-admin/dashboard", headers=self.headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # If there are organizations, verify the structure matches what the chart expects
        if len(data["organization_stats"]) > 0:
            org_stat = data["organization_stats"][0]
            
            # These fields are required for the chart
            assert "organization_name" in org_stat, "Missing organization_name for chart"
            assert "scope1_emissions" in org_stat, "Missing scope1_emissions for chart"
            assert "scope2_emissions" in org_stat, "Missing scope2_emissions for chart"
            assert "biogenic_emissions" in org_stat, "Missing biogenic_emissions for chart"
            
            print(f"✓ Organization stats structure valid: {org_stat['organization_name']}")
        else:
            print("✓ No organizations yet - chart will show empty state")


class TestAdminWithoutOrganization:
    """Test that admin without organization doesn't crash"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin without org auth token"""
        response = requests.post(f"{API_URL}/auth/login", json={
            "email": ADMIN_WITHOUT_ORG_EMAIL,
            "password": ADMIN_WITHOUT_ORG_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Admin authentication failed")
    
    def test_get_facilities_returns_empty_list(self):
        """Test that admin without org gets empty facilities list (not 500 error)"""
        response = requests.get(f"{API_URL}/facilities", headers=self.headers)
        
        # Should return 200 with empty list, NOT 500 error
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Expected list response"
        assert len(data) == 0, "Admin without org should have empty facilities"
        
        print("✓ Admin without org - facilities returns empty list")
    
    def test_get_emissions_returns_empty_list(self):
        """Test that admin without org gets empty emissions list (not 500 error)"""
        response = requests.get(f"{API_URL}/emissions", headers=self.headers)
        
        # Should return 200 with empty list, NOT 500 error
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Expected list response"
        assert len(data) == 0, "Admin without org should have empty emissions"
        
        print("✓ Admin without org - emissions returns empty list")
    
    def test_dashboard_stats_returns_empty_gracefully(self):
        """Test that admin without org gets empty dashboard stats (not 500 error)"""
        response = requests.get(f"{API_URL}/dashboard/stats", headers=self.headers)
        
        # Should return 200 with zero stats, NOT 500 error
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify empty stats structure
        assert data["total_facilities"] == 0, "Expected 0 facilities"
        assert data["total_emissions"] == 0, "Expected 0 total emissions"
        assert len(data["recent_records"]) == 0, "Expected empty recent_records"
        assert len(data["emissions_by_facility"]) == 0, "Expected empty emissions_by_facility"
        
        print("✓ Admin without org - dashboard stats returns empty gracefully")


class TestEmissionFactors:
    """Test standard and custom emission factors"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get super admin auth token"""
        response = requests.post(f"{API_URL}/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Super Admin authentication failed")
    
    def test_standard_emission_factors_available(self):
        """Test that standard emission factors are available"""
        response = requests.get(f"{API_URL}/emission-factors/standard")
        
        assert response.status_code == 200, f"Standard factors failed: {response.text}"
        data = response.json()
        
        # Verify scope structure
        assert "scope1" in data, "Missing scope1 factors"
        assert "scope2" in data, "Missing scope2 factors"
        assert "biogenic" in data, "Missing biogenic factors"
        
        # Verify scope1 categories exist
        scope1 = data["scope1"]
        assert "Stationary Combustion" in scope1, "Missing Stationary Combustion category"
        assert "Mobile Combustion" in scope1, "Missing Mobile Combustion category"
        
        # Verify factor structure
        natural_gas = scope1["Stationary Combustion"].get("Natural Gas")
        assert natural_gas is not None, "Missing Natural Gas factor"
        assert "factor" in natural_gas, "Missing factor value"
        assert "unit" in natural_gas, "Missing unit"
        assert "source" in natural_gas, "Missing source"
        
        print(f"✓ Standard factors available - scope1 has {len(scope1)} categories")
    
    def test_custom_emission_factors_endpoint(self):
        """Test that custom emission factors endpoint works"""
        response = requests.get(f"{API_URL}/emission-factors", headers=self.headers)
        
        assert response.status_code == 200, f"Custom factors failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Expected list of custom factors"
        print(f"✓ Custom factors endpoint works - {len(data)} custom factors found")


class TestFileDownload:
    """Test evidence file download functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get super admin auth token"""
        response = requests.post(f"{API_URL}/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Super Admin authentication failed")
    
    def test_file_upload_and_download(self):
        """Test that file can be uploaded and downloaded"""
        # Create a test file
        test_content = b"Test evidence document content for GHG platform"
        files = {"file": ("test_evidence.pdf", test_content, "application/pdf")}
        
        # Upload
        upload_response = requests.post(
            f"{API_URL}/upload/evidence",
            files=files,
            headers=self.headers
        )
        
        assert upload_response.status_code == 200, f"Upload failed: {upload_response.text}"
        upload_data = upload_response.json()
        
        assert "file_id" in upload_data, "Missing file_id in response"
        assert "url" in upload_data, "Missing url in response"
        
        file_id = upload_data["file_id"]
        evidence_url = upload_data["url"]
        
        # Download using the URL pattern frontend uses (starts with /api/)
        # The frontend code: BACKEND_URL + evidenceUrl where evidenceUrl = "/api/files/{file_id}"
        download_url = f"{BASE_URL}{evidence_url}"
        
        download_response = requests.get(download_url, headers=self.headers)
        
        assert download_response.status_code == 200, \
            f"Download failed with status {download_response.status_code}: {download_response.text}"
        
        # Verify content matches
        assert download_response.content == test_content, "Downloaded content doesn't match"
        
        print(f"✓ File upload/download works - URL pattern: {evidence_url}")
        
        # Cleanup
        requests.delete(f"{API_URL}/files/{file_id}", headers=self.headers)
    
    def test_file_download_with_admin_credentials(self):
        """Test that admin can download evidence files"""
        # Login as admin without org (still should be able to download files)
        admin_response = requests.post(f"{API_URL}/auth/login", json={
            "email": ADMIN_WITHOUT_ORG_EMAIL,
            "password": ADMIN_WITHOUT_ORG_PASSWORD
        })
        
        if admin_response.status_code != 200:
            pytest.skip("Admin login failed")
        
        admin_headers = {"Authorization": f"Bearer {admin_response.json()['access_token']}"}
        
        # Upload a file first (as super admin)
        test_content = b"Admin download test content"
        files = {"file": ("admin_test.pdf", test_content, "application/pdf")}
        
        upload_response = requests.post(
            f"{API_URL}/upload/evidence",
            files=files,
            headers=self.headers
        )
        
        if upload_response.status_code != 200:
            pytest.skip("Upload failed")
        
        file_id = upload_response.json()["file_id"]
        evidence_url = upload_response.json()["url"]
        
        # Download as admin
        download_url = f"{BASE_URL}{evidence_url}"
        download_response = requests.get(download_url, headers=admin_headers)
        
        assert download_response.status_code == 200, \
            f"Admin download failed: {download_response.status_code}"
        
        print("✓ Admin can download evidence files")
        
        # Cleanup
        requests.delete(f"{API_URL}/files/{file_id}", headers=self.headers)


class TestEndToEndEmissionWithEvidence:
    """Test complete emission record with evidence flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get super admin auth token"""
        response = requests.post(f"{API_URL}/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Super Admin authentication failed")
    
    def test_emission_record_with_evidence_url(self):
        """Test creating emission record with evidence URL"""
        # First check if there are any facilities
        facilities_response = requests.get(f"{API_URL}/facilities", headers=self.headers)
        
        if facilities_response.status_code != 200 or len(facilities_response.json()) == 0:
            pytest.skip("No facilities available for testing")
        
        facility = facilities_response.json()[0]
        
        # Upload evidence file
        test_content = b"Evidence for emission record"
        files = {"file": ("emission_evidence.pdf", test_content, "application/pdf")}
        
        upload_response = requests.post(
            f"{API_URL}/upload/evidence",
            files=files,
            headers=self.headers
        )
        
        if upload_response.status_code != 200:
            pytest.skip("Evidence upload failed")
        
        evidence_url = upload_response.json()["url"]
        file_id = upload_response.json()["file_id"]
        
        # Create emission record with evidence
        emission_data = {
            "facility_id": facility["id"],
            "reporting_period": "2025-01",
            "scope": "scope1",
            "category": "Stationary Combustion",
            "sub_category": "Natural Gas",
            "quantity": 100.0,
            "emission_factor": 2.03,
            "unit": "kg CO2e/m³",
            "evidence_url": evidence_url,
            "source_of_information": "GHG Protocol",
            "is_custom_factor": False
        }
        
        emission_response = requests.post(
            f"{API_URL}/emissions",
            json=emission_data,
            headers=self.headers
        )
        
        assert emission_response.status_code == 200, \
            f"Emission creation failed: {emission_response.text}"
        
        emission = emission_response.json()
        
        # Verify evidence URL is stored correctly
        assert emission["evidence_url"] == evidence_url, \
            f"Evidence URL mismatch: expected {evidence_url}, got {emission['evidence_url']}"
        
        print(f"✓ Emission record created with evidence URL: {evidence_url}")
        
        # Cleanup
        requests.delete(f"{API_URL}/emissions/{emission['id']}", headers=self.headers)
        requests.delete(f"{API_URL}/files/{file_id}", headers=self.headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
