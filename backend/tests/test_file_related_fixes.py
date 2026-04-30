"""
Test file for 6 file-related bug fixes:
1. SuperAdmin Invoice History download - should work with /download suffix
2. SuperAdmin Invoice History delete - should call DELETE API and remove from R2
3. OrganizationDetails logo replacement - should delete old logo before uploading new one
4. OrganizationDetails attachment deletion - should call DELETE API and remove from R2
5. GET /api/files/{file_id}/info endpoint - should return file metadata including original filename
6. Emissions Edit dialog - should fetch and display original filenames from /info endpoint
"""

import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://carbon-bulk-upload.preview.emergentagent.com')

# Test credentials
SUPER_ADMIN_EMAIL = "superadmin@ecotrack.com"
SUPER_ADMIN_PASSWORD = "SuperAdmin123!"
ADMIN_EMAIL = "testadmin@test.com"
ADMIN_PASSWORD = "Test123!"


class TestFileInfoEndpoint:
    """Test the new GET /api/files/{file_id}/info endpoint"""
    
    @pytest.fixture(scope="class")
    def super_admin_token(self):
        """Get super admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Super admin authentication failed")
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin authentication failed")
    
    def test_file_info_endpoint_returns_metadata(self, super_admin_token):
        """Test that /api/files/{file_id}/info returns file metadata"""
        # First upload a file to get a file_id
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        
        # Create a test PDF file
        test_content = b"%PDF-1.4 Test file content for info endpoint"
        files = {"file": ("test_info_file.pdf", io.BytesIO(test_content), "application/pdf")}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/upload/evidence?bucket_type=superadmin",
            headers=headers,
            files=files
        )
        
        assert upload_response.status_code == 200, f"Upload failed: {upload_response.text}"
        upload_data = upload_response.json()
        
        # Extract file_id from URL (format: /api/files/{file_id})
        file_url = upload_data.get("url", "")
        file_id = file_url.split("/api/files/")[-1] if "/api/files/" in file_url else None
        
        assert file_id, f"Could not extract file_id from URL: {file_url}"
        
        # Now test the /info endpoint
        info_response = requests.get(f"{BASE_URL}/api/files/{file_id}/info")
        
        assert info_response.status_code == 200, f"Info endpoint failed: {info_response.text}"
        info_data = info_response.json()
        
        # Verify response contains expected fields
        assert "id" in info_data, "Response missing 'id' field"
        assert "filename" in info_data, "Response missing 'filename' field"
        assert "content_type" in info_data, "Response missing 'content_type' field"
        
        # Verify original filename is preserved
        assert info_data["filename"] == "test_info_file.pdf", f"Filename mismatch: expected 'test_info_file.pdf', got '{info_data['filename']}'"
        
        print(f"✓ File info endpoint returned: {info_data}")
        
        # Cleanup - delete the test file
        delete_response = requests.delete(
            f"{BASE_URL}/api/files/{file_id}",
            headers=headers
        )
        print(f"Cleanup: Delete response status: {delete_response.status_code}")
    
    def test_file_info_endpoint_404_for_nonexistent(self):
        """Test that /api/files/{file_id}/info returns 404 for non-existent file"""
        fake_file_id = "00000000-0000-0000-0000-000000000000"
        
        response = requests.get(f"{BASE_URL}/api/files/{fake_file_id}/info")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ File info endpoint returns 404 for non-existent file")


class TestFileDownloadEndpoint:
    """Test file download with /download suffix"""
    
    @pytest.fixture(scope="class")
    def super_admin_token(self):
        """Get super admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Super admin authentication failed")
    
    def test_download_endpoint_works(self, super_admin_token):
        """Test that /api/files/{file_id}/download works correctly"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        
        # Upload a test PDF file
        test_content = b"%PDF-1.4 Test download content"
        files = {"file": ("test_download.pdf", io.BytesIO(test_content), "application/pdf")}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/upload/evidence?bucket_type=superadmin",
            headers=headers,
            files=files
        )
        
        assert upload_response.status_code == 200, f"Upload failed: {upload_response.text}"
        upload_data = upload_response.json()
        
        file_url = upload_data.get("url", "")
        file_id = file_url.split("/api/files/")[-1] if "/api/files/" in file_url else None
        
        assert file_id, f"Could not extract file_id from URL: {file_url}"
        
        # Test download endpoint - should redirect to R2 signed URL
        download_response = requests.get(
            f"{BASE_URL}/api/files/{file_id}/download",
            allow_redirects=False  # Don't follow redirect to check the response
        )
        
        # Should be a redirect (302 or 307) to R2 signed URL
        assert download_response.status_code in [302, 307, 200], f"Download endpoint returned unexpected status: {download_response.status_code}"
        
        if download_response.status_code in [302, 307]:
            location = download_response.headers.get("Location", "")
            assert "r2.cloudflarestorage.com" in location or "r2.dev" in location, f"Redirect not to R2: {location}"
            print(f"✓ Download endpoint redirects to R2: {location[:100]}...")
        else:
            print(f"✓ Download endpoint returned content directly")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/files/{file_id}", headers=headers)


class TestFileDeleteEndpoint:
    """Test file deletion from R2"""
    
    @pytest.fixture(scope="class")
    def super_admin_token(self):
        """Get super admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Super admin authentication failed")
    
    def test_delete_removes_from_r2(self, super_admin_token):
        """Test that DELETE /api/files/{file_id} removes file from R2"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        
        # Upload a test PDF file
        test_content = b"%PDF-1.4 Test delete content"
        files = {"file": ("test_delete.pdf", io.BytesIO(test_content), "application/pdf")}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/upload/evidence?bucket_type=superadmin",
            headers=headers,
            files=files
        )
        
        assert upload_response.status_code == 200, f"Upload failed: {upload_response.text}"
        upload_data = upload_response.json()
        
        file_url = upload_data.get("url", "")
        file_id = file_url.split("/api/files/")[-1] if "/api/files/" in file_url else None
        
        assert file_id, f"Could not extract file_id from URL: {file_url}"
        
        # Verify file exists via info endpoint
        info_response = requests.get(f"{BASE_URL}/api/files/{file_id}/info")
        assert info_response.status_code == 200, "File should exist before deletion"
        
        # Delete the file
        delete_response = requests.delete(
            f"{BASE_URL}/api/files/{file_id}",
            headers=headers
        )
        
        assert delete_response.status_code in [200, 204], f"Delete failed: {delete_response.text}"
        print(f"✓ Delete response: {delete_response.status_code}")
        
        # Verify file no longer exists
        info_response_after = requests.get(f"{BASE_URL}/api/files/{file_id}/info")
        assert info_response_after.status_code == 404, "File should not exist after deletion"
        print("✓ File successfully deleted from R2")


class TestFileSizeErrorMessage:
    """Test that file size error shows correct message"""
    
    @pytest.fixture(scope="class")
    def super_admin_token(self):
        """Get super admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Super admin authentication failed")
    
    def test_oversized_file_error_message(self, super_admin_token):
        """Test that uploading >5MB file returns appropriate error"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        
        # Create a PDF file larger than 5MB (5.5MB)
        large_content = b"%PDF-1.4 " + b"x" * (5 * 1024 * 1024 + 500000)  # 5.5MB
        files = {"file": ("large_file.pdf", io.BytesIO(large_content), "application/pdf")}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/upload/evidence?bucket_type=superadmin",
            headers=headers,
            files=files
        )
        
        # Should fail with 413 or 400
        assert upload_response.status_code in [400, 413], f"Expected 400 or 413, got {upload_response.status_code}"
        
        error_detail = upload_response.json().get("detail", "").lower()
        # Check that error message mentions size limit
        assert "5" in error_detail or "size" in error_detail or "mb" in error_detail, \
            f"Error message should mention file size: {error_detail}"
        
        print(f"✓ Oversized file error: {upload_response.json().get('detail')}")


class TestInvoiceHistoryOperations:
    """Test SuperAdmin Invoice History download and delete operations"""
    
    @pytest.fixture(scope="class")
    def super_admin_token(self):
        """Get super admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Super admin authentication failed")
    
    def test_invoice_upload_and_download(self, super_admin_token):
        """Test uploading invoice and downloading via /download endpoint"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        
        # Upload an invoice file
        test_content = b"Invoice content for testing"
        files = {"file": ("test_invoice.pdf", io.BytesIO(test_content), "application/pdf")}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/upload/evidence?bucket_type=superadmin",
            headers=headers,
            files=files
        )
        
        assert upload_response.status_code == 200, f"Invoice upload failed: {upload_response.text}"
        upload_data = upload_response.json()
        
        file_url = upload_data.get("url", "")
        file_id = file_url.split("/api/files/")[-1] if "/api/files/" in file_url else None
        
        assert file_id, f"Could not extract file_id from URL: {file_url}"
        
        # Test download with /download suffix
        download_url = f"{BASE_URL}/api/files/{file_id}/download"
        download_response = requests.get(download_url, allow_redirects=False)
        
        assert download_response.status_code in [200, 302, 307], \
            f"Download should work, got {download_response.status_code}"
        
        print(f"✓ Invoice download works via /download endpoint")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/files/{file_id}", headers=headers)


class TestEmissionsEvidenceFilenames:
    """Test that Emissions edit dialog fetches original filenames"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin authentication failed")
    
    def test_evidence_file_info_returns_original_filename(self, admin_token):
        """Test that file info endpoint returns original filename for evidence files"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Upload an evidence file with a specific name
        original_filename = "electricity_bill_jan_2024.pdf"
        test_content = b"Evidence file content"
        files = {"file": (original_filename, io.BytesIO(test_content), "application/pdf")}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/upload/evidence?bucket_type=emission_evidence",
            headers=headers,
            files=files
        )
        
        assert upload_response.status_code == 200, f"Evidence upload failed: {upload_response.text}"
        upload_data = upload_response.json()
        
        file_url = upload_data.get("url", "")
        file_id = file_url.split("/api/files/")[-1] if "/api/files/" in file_url else None
        
        assert file_id, f"Could not extract file_id from URL: {file_url}"
        
        # Fetch file info
        info_response = requests.get(f"{BASE_URL}/api/files/{file_id}/info")
        
        assert info_response.status_code == 200, f"Info endpoint failed: {info_response.text}"
        info_data = info_response.json()
        
        # Verify original filename is returned
        assert info_data.get("filename") == original_filename, \
            f"Expected filename '{original_filename}', got '{info_data.get('filename')}'"
        
        print(f"✓ Evidence file info returns original filename: {info_data['filename']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/files/{file_id}", headers=headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
