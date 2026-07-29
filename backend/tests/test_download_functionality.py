"""
Test download functionality for PDF/file attachments in Organization, Facilities, and Emissions modules.
Tests the /api/files/{id}/download and /api/files/{id}/view endpoints.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://dual-framework-queue.preview.emergentagent.com')

# Test file ID provided by main agent
TEST_FILE_ID = "af5f0ba2-cf67-4f51-9d0f-1fbb48f0d953"

class TestFileDownloadEndpoints:
    """Test file download/view endpoints - these are the key endpoints for download functionality"""
    
    def test_download_endpoint_returns_200(self):
        """Test that download endpoint returns 200 for existing file"""
        response = requests.get(f"{BASE_URL}/api/files/{TEST_FILE_ID}/download")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✓ Download endpoint returns 200 for file {TEST_FILE_ID}")
    
    def test_download_endpoint_has_attachment_disposition(self):
        """Test that download endpoint returns Content-Disposition: attachment header"""
        response = requests.get(f"{BASE_URL}/api/files/{TEST_FILE_ID}/download")
        assert response.status_code == 200
        
        content_disposition = response.headers.get('content-disposition', '')
        assert 'attachment' in content_disposition.lower(), \
            f"Expected 'attachment' in Content-Disposition, got: {content_disposition}"
        assert 'filename=' in content_disposition.lower(), \
            f"Expected 'filename=' in Content-Disposition, got: {content_disposition}"
        print(f"✓ Download endpoint has Content-Disposition: {content_disposition}")
    
    def test_download_endpoint_returns_correct_content_type(self):
        """Test that download endpoint returns appropriate content type"""
        response = requests.get(f"{BASE_URL}/api/files/{TEST_FILE_ID}/download")
        assert response.status_code == 200
        
        content_type = response.headers.get('content-type', '')
        # Should be a valid file content type (not JSON error)
        assert 'json' not in content_type.lower() or response.status_code != 200, \
            f"Download endpoint should not return JSON, got: {content_type}"
        print(f"✓ Download endpoint returns content type: {content_type}")
    
    def test_download_endpoint_returns_content(self):
        """Test that download endpoint returns actual file content"""
        response = requests.get(f"{BASE_URL}/api/files/{TEST_FILE_ID}/download")
        assert response.status_code == 200
        assert len(response.content) > 0, "Downloaded file should have content"
        print(f"✓ Download endpoint returns {len(response.content)} bytes of content")
    
    def test_view_endpoint_returns_200(self):
        """Test that view endpoint returns 200 for existing file"""
        response = requests.get(f"{BASE_URL}/api/files/{TEST_FILE_ID}/view")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✓ View endpoint returns 200 for file {TEST_FILE_ID}")
    
    def test_view_endpoint_has_inline_disposition(self):
        """Test that view endpoint returns Content-Disposition: inline header"""
        response = requests.get(f"{BASE_URL}/api/files/{TEST_FILE_ID}/view")
        assert response.status_code == 200
        
        content_disposition = response.headers.get('content-disposition', '')
        assert 'inline' in content_disposition.lower(), \
            f"Expected 'inline' in Content-Disposition, got: {content_disposition}"
        print(f"✓ View endpoint has Content-Disposition: {content_disposition}")
    
    def test_nonexistent_file_returns_404(self):
        """Test that endpoints return 404 for non-existent files"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        
        response_download = requests.get(f"{BASE_URL}/api/files/{fake_id}/download")
        assert response_download.status_code == 404, \
            f"Expected 404 for non-existent file download, got {response_download.status_code}"
        
        response_view = requests.get(f"{BASE_URL}/api/files/{fake_id}/view")
        assert response_view.status_code == 404, \
            f"Expected 404 for non-existent file view, got {response_view.status_code}"
        
        print("✓ Both endpoints return 404 for non-existent files")


class TestAuthenticatedFileAccess:
    """Test file access with authentication (for emissions evidence)"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token for admin user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@ghg.com",
            "password": "admin123"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_emissions_endpoint_accessible(self, auth_token):
        """Test that emissions endpoint is accessible with auth"""
        response = requests.get(f"{BASE_URL}/api/emissions", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        print(f"✓ Emissions endpoint accessible, found {len(response.json())} records")
    
    def test_facilities_endpoint_accessible(self, auth_token):
        """Test that facilities endpoint is accessible with auth"""
        response = requests.get(f"{BASE_URL}/api/facilities", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        print(f"✓ Facilities endpoint accessible, found {len(response.json())} facilities")
    
    def test_organization_endpoint_accessible(self, auth_token):
        """Test that organization endpoint is accessible with auth"""
        response = requests.get(f"{BASE_URL}/api/organizations/my", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        print(f"✓ Organization endpoint accessible")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
