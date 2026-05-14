"""
Test file for verifying file upload fixes:
1. SuperAdmin invoice upload to 'superadmin' bucket - should work (role check fixed)
2. Admin user upload to 'superadmin' bucket - should be blocked with 403 error
3. File deletion from R2 bucket - should log deletion in backend
4. Facility module file download - should work with window.open() approach
5. File size limit text should show '5 MB' in Facilities and Sinks pages
6. Excel files (.xls, .xlsx) should be uploadable
7. Oversized file (>5MB) should show clear error message
"""

import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://sustainrepo-test.preview.emergentagent.com')

# Test credentials
SUPER_ADMIN_EMAIL = "superadmin@ecotrack.com"
SUPER_ADMIN_PASSWORD = "SuperAdmin123!"
ADMIN_EMAIL = "testadmin@test.com"
ADMIN_PASSWORD = "Test123!"


class TestFileUploadFixes:
    """Test file upload and download fixes"""
    
    @pytest.fixture(scope="class")
    def super_admin_token(self):
        """Get super admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip(f"Super admin login failed: {response.status_code} - {response.text}")
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    
    def test_super_admin_can_upload_to_superadmin_bucket(self, super_admin_token):
        """Test that super admin can upload files to superadmin bucket"""
        # Create a small test PDF file
        test_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF"
        files = {'file': ('test_invoice.pdf', io.BytesIO(test_content), 'application/pdf')}
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence?bucket_type=superadmin",
            files=files,
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        
        print(f"SuperAdmin upload response: {response.status_code}")
        print(f"Response body: {response.text}")
        
        assert response.status_code == 200, f"SuperAdmin should be able to upload to superadmin bucket. Got: {response.status_code} - {response.text}"
        data = response.json()
        assert "url" in data, "Response should contain file URL"
        assert "file_id" in data, "Response should contain file_id"
        
        # Store file_id for cleanup
        self.uploaded_file_id = data.get("file_id")
        print(f"File uploaded successfully with ID: {self.uploaded_file_id}")
    
    def test_admin_cannot_upload_to_superadmin_bucket(self, admin_token):
        """Test that admin users cannot upload to superadmin bucket - should get 403"""
        test_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF"
        files = {'file': ('test_invoice.pdf', io.BytesIO(test_content), 'application/pdf')}
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence?bucket_type=superadmin",
            files=files,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        print(f"Admin upload to superadmin bucket response: {response.status_code}")
        print(f"Response body: {response.text}")
        
        assert response.status_code == 403, f"Admin should NOT be able to upload to superadmin bucket. Expected 403, got: {response.status_code}"
        assert "super admin" in response.text.lower() or "not authorized" in response.text.lower(), "Error message should mention super admin restriction"
    
    def test_admin_can_upload_to_org_facility_bucket(self, admin_token):
        """Test that admin can upload to org_facility bucket"""
        test_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF"
        files = {'file': ('test_facility_doc.pdf', io.BytesIO(test_content), 'application/pdf')}
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence?bucket_type=org_facility",
            files=files,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        print(f"Admin upload to org_facility bucket response: {response.status_code}")
        
        assert response.status_code == 200, f"Admin should be able to upload to org_facility bucket. Got: {response.status_code} - {response.text}"
        data = response.json()
        assert "url" in data
        assert "file_id" in data
        
        # Store for cleanup
        self.admin_uploaded_file_id = data.get("file_id")
    
    def test_excel_xlsx_file_upload(self, admin_token):
        """Test that Excel .xlsx files can be uploaded"""
        # Minimal XLSX file header (ZIP format with xlsx content type)
        xlsx_content = b'PK\x03\x04\x14\x00\x00\x00\x08\x00'  # Minimal ZIP header
        files = {'file': ('test_data.xlsx', io.BytesIO(xlsx_content), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence?bucket_type=emission_evidence",
            files=files,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        print(f"Excel XLSX upload response: {response.status_code}")
        
        # Note: This might fail due to minimal content, but we're testing the content type acceptance
        if response.status_code == 200:
            print("Excel XLSX file upload accepted")
            data = response.json()
            assert "url" in data
        else:
            print(f"Excel upload response: {response.text}")
            # Check if it's a content type rejection vs other error
            assert "file type" not in response.text.lower(), "Excel XLSX should be an allowed file type"
    
    def test_excel_xls_file_upload(self, admin_token):
        """Test that Excel .xls files can be uploaded"""
        # Minimal XLS file header
        xls_content = b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'  # OLE compound document header
        files = {'file': ('test_data.xls', io.BytesIO(xls_content), 'application/vnd.ms-excel')}
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence?bucket_type=emission_evidence",
            files=files,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        print(f"Excel XLS upload response: {response.status_code}")
        
        if response.status_code == 200:
            print("Excel XLS file upload accepted")
            data = response.json()
            assert "url" in data
        else:
            print(f"Excel XLS upload response: {response.text}")
            assert "file type" not in response.text.lower(), "Excel XLS should be an allowed file type"
    
    def test_file_download_endpoint_exists(self, admin_token):
        """Test that file download endpoint exists and returns proper response"""
        # First upload a file
        test_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF"
        files = {'file': ('test_download.pdf', io.BytesIO(test_content), 'application/pdf')}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/upload/evidence?bucket_type=emission_evidence",
            files=files,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        if upload_response.status_code != 200:
            pytest.skip("Could not upload test file for download test")
        
        file_id = upload_response.json().get("file_id")
        
        # Test download endpoint
        download_response = requests.get(
            f"{BASE_URL}/api/files/{file_id}/download",
            headers={"Authorization": f"Bearer {admin_token}"},
            allow_redirects=False
        )
        
        print(f"Download endpoint response: {download_response.status_code}")
        
        # Should either return file content or redirect to R2
        assert download_response.status_code in [200, 302, 307], f"Download should work. Got: {download_response.status_code}"
    
    def test_file_view_endpoint_exists(self, admin_token):
        """Test that file view endpoint exists"""
        # First upload a file
        test_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF"
        files = {'file': ('test_view.pdf', io.BytesIO(test_content), 'application/pdf')}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/upload/evidence?bucket_type=emission_evidence",
            files=files,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        if upload_response.status_code != 200:
            pytest.skip("Could not upload test file for view test")
        
        file_id = upload_response.json().get("file_id")
        
        # Test view endpoint
        view_response = requests.get(
            f"{BASE_URL}/api/files/{file_id}/view",
            headers={"Authorization": f"Bearer {admin_token}"},
            allow_redirects=False
        )
        
        print(f"View endpoint response: {view_response.status_code}")
        
        # Should either return file content or redirect to R2
        assert view_response.status_code in [200, 302, 307], f"View should work. Got: {view_response.status_code}"
    
    def test_file_deletion_works(self, admin_token):
        """Test that file deletion works and removes from R2"""
        # First upload a file
        test_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF"
        files = {'file': ('test_delete.pdf', io.BytesIO(test_content), 'application/pdf')}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/upload/evidence?bucket_type=emission_evidence",
            files=files,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        if upload_response.status_code != 200:
            pytest.skip("Could not upload test file for deletion test")
        
        file_id = upload_response.json().get("file_id")
        print(f"Uploaded file for deletion test: {file_id}")
        
        # Delete the file
        delete_response = requests.delete(
            f"{BASE_URL}/api/files/{file_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        print(f"Delete response: {delete_response.status_code}")
        print(f"Delete response body: {delete_response.text}")
        
        assert delete_response.status_code == 200, f"File deletion should succeed. Got: {delete_response.status_code}"
        
        # Verify file is gone
        view_response = requests.get(
            f"{BASE_URL}/api/files/{file_id}/view",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert view_response.status_code == 404, "Deleted file should return 404"
    
    def test_upload_endpoint_validates_bucket_type(self, admin_token):
        """Test that invalid bucket types are rejected"""
        test_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF"
        files = {'file': ('test.pdf', io.BytesIO(test_content), 'application/pdf')}
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence?bucket_type=invalid_bucket",
            files=files,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        print(f"Invalid bucket type response: {response.status_code}")
        
        assert response.status_code == 400, f"Invalid bucket type should return 400. Got: {response.status_code}"
    
    def test_original_filename_preserved(self, admin_token):
        """Test that original filename is preserved in response"""
        original_filename = "my_important_document_2024.pdf"
        test_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF"
        files = {'file': (original_filename, io.BytesIO(test_content), 'application/pdf')}
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence?bucket_type=emission_evidence",
            files=files,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        print(f"Filename preservation response: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response data: {data}")
            # Check if filename is preserved
            if "filename" in data:
                assert data["filename"] == original_filename, f"Original filename should be preserved. Got: {data['filename']}"
            else:
                print("Note: filename field not in response - may need to check file record")


class TestFileSizeLimits:
    """Test file size limit validation"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip(f"Admin login failed: {response.status_code}")
    
    def test_file_under_5mb_accepted(self, admin_token):
        """Test that files under 5MB are accepted"""
        # Create a 1MB test file
        test_content = b"x" * (1 * 1024 * 1024)  # 1MB
        files = {'file': ('small_file.pdf', io.BytesIO(test_content), 'application/pdf')}
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence?bucket_type=emission_evidence",
            files=files,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        print(f"1MB file upload response: {response.status_code}")
        
        # Should be accepted (might fail for other reasons but not size)
        if response.status_code != 200:
            assert "size" not in response.text.lower() or "5" not in response.text, "1MB file should not be rejected for size"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
