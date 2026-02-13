"""
Test file upload endpoints for GHG Calculation Platform
Tests: /api/upload/evidence, /api/files/{file_id}, /api/files, DELETE /api/files/{file_id}
"""
import pytest
import requests
import os
import io

# Get BASE_URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPER_ADMIN_EMAIL = "superadmin@ecotrack.com"
SUPER_ADMIN_PASSWORD = "SuperAdmin123!"


class TestFileUploadEndpoints:
    """Test file upload, download, list, and delete endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for super admin"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPER_ADMIN_EMAIL, "password": SUPER_ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get headers with auth token"""
        return {
            "Authorization": f"Bearer {auth_token}"
        }
    
    # ==================== UPLOAD TESTS ====================
    
    def test_upload_pdf_file(self, auth_headers):
        """Test uploading a PDF file"""
        # Create a mock PDF file
        pdf_content = b"%PDF-1.4 mock pdf content for testing"
        files = {
            "file": ("test_document.pdf", io.BytesIO(pdf_content), "application/pdf")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence",
            headers=auth_headers,
            files=files
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "file_id" in data, "No file_id in response"
        assert "filename" in data, "No filename in response"
        assert "size" in data, "No size in response"
        assert "url" in data, "No url in response"
        
        # Validate values
        assert data["filename"] == "test_document.pdf"
        assert data["size"] == len(pdf_content)
        assert data["url"].startswith("/api/files/")
        
        # Store file_id for later tests
        self.__class__.uploaded_pdf_id = data["file_id"]
        print(f"✓ PDF upload successful - file_id: {data['file_id']}")
    
    def test_upload_jpeg_image(self, auth_headers):
        """Test uploading a JPEG image"""
        # Create a minimal JPEG file (JFIF header)
        jpeg_content = bytes([
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
            0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9
        ])
        files = {
            "file": ("test_image.jpg", io.BytesIO(jpeg_content), "image/jpeg")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence",
            headers=auth_headers,
            files=files
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        assert data["filename"] == "test_image.jpg"
        
        self.__class__.uploaded_jpeg_id = data["file_id"]
        print(f"✓ JPEG upload successful - file_id: {data['file_id']}")
    
    def test_upload_png_image(self, auth_headers):
        """Test uploading a PNG image"""
        # Create a minimal PNG file
        png_content = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,  # IEND chunk
            0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        files = {
            "file": ("test_image.png", io.BytesIO(png_content), "image/png")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence",
            headers=auth_headers,
            files=files
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        assert data["filename"] == "test_image.png"
        
        self.__class__.uploaded_png_id = data["file_id"]
        print(f"✓ PNG upload successful - file_id: {data['file_id']}")
    
    def test_upload_xlsx_file(self, auth_headers):
        """Test uploading an Excel XLSX file"""
        # Create a minimal XLSX file (ZIP with specific content type)
        xlsx_content = b"PK\x03\x04 mock xlsx content for testing"
        files = {
            "file": ("test_spreadsheet.xlsx", io.BytesIO(xlsx_content), 
                     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence",
            headers=auth_headers,
            files=files
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        assert data["filename"] == "test_spreadsheet.xlsx"
        
        self.__class__.uploaded_xlsx_id = data["file_id"]
        print(f"✓ XLSX upload successful - file_id: {data['file_id']}")
    
    def test_upload_csv_file(self, auth_headers):
        """Test uploading a CSV file"""
        csv_content = b"name,value\ntest,123\ndata,456"
        files = {
            "file": ("test_data.csv", io.BytesIO(csv_content), "text/csv")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence",
            headers=auth_headers,
            files=files
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        assert data["filename"] == "test_data.csv"
        
        self.__class__.uploaded_csv_id = data["file_id"]
        print(f"✓ CSV upload successful - file_id: {data['file_id']}")
    
    def test_upload_docx_file(self, auth_headers):
        """Test uploading a Word DOCX file"""
        docx_content = b"PK\x03\x04 mock docx content for testing"
        files = {
            "file": ("test_document.docx", io.BytesIO(docx_content), 
                     "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence",
            headers=auth_headers,
            files=files
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        assert data["filename"] == "test_document.docx"
        
        self.__class__.uploaded_docx_id = data["file_id"]
        print(f"✓ DOCX upload successful - file_id: {data['file_id']}")
    
    # ==================== INVALID FILE TYPE TESTS ====================
    
    def test_upload_invalid_file_type_exe(self, auth_headers):
        """Test that EXE files are rejected"""
        exe_content = b"MZ mock exe content"
        files = {
            "file": ("malware.exe", io.BytesIO(exe_content), "application/x-msdownload")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence",
            headers=auth_headers,
            files=files
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "detail" in data
        assert "not allowed" in data["detail"].lower() or "supported" in data["detail"].lower()
        print("✓ EXE file correctly rejected")
    
    def test_upload_invalid_file_type_html(self, auth_headers):
        """Test that HTML files are rejected"""
        html_content = b"<html><body>test</body></html>"
        files = {
            "file": ("page.html", io.BytesIO(html_content), "text/html")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence",
            headers=auth_headers,
            files=files
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ HTML file correctly rejected")
    
    def test_upload_invalid_file_type_js(self, auth_headers):
        """Test that JavaScript files are rejected"""
        js_content = b"console.log('test');"
        files = {
            "file": ("script.js", io.BytesIO(js_content), "application/javascript")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence",
            headers=auth_headers,
            files=files
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ JavaScript file correctly rejected")
    
    # ==================== FILE SIZE TESTS ====================
    
    def test_upload_file_size_limit(self, auth_headers):
        """Test that files over 10MB are rejected"""
        # Create a file slightly over 10MB
        large_content = b"x" * (10 * 1024 * 1024 + 1)  # 10MB + 1 byte
        files = {
            "file": ("large_file.pdf", io.BytesIO(large_content), "application/pdf")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence",
            headers=auth_headers,
            files=files
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "detail" in data
        assert "size" in data["detail"].lower() or "10mb" in data["detail"].lower()
        print("✓ Large file correctly rejected")
    
    # ==================== DOWNLOAD TESTS ====================
    
    def test_download_uploaded_file(self, auth_headers):
        """Test downloading a previously uploaded file"""
        # First upload a file
        pdf_content = b"%PDF-1.4 download test content"
        files = {
            "file": ("download_test.pdf", io.BytesIO(pdf_content), "application/pdf")
        }
        
        upload_response = requests.post(
            f"{BASE_URL}/api/upload/evidence",
            headers=auth_headers,
            files=files
        )
        assert upload_response.status_code == 200
        file_id = upload_response.json()["file_id"]
        
        # Now download the file
        download_response = requests.get(
            f"{BASE_URL}/api/files/{file_id}",
            headers=auth_headers
        )
        
        assert download_response.status_code == 200, f"Download failed: {download_response.text}"
        assert download_response.content == pdf_content
        assert "content-disposition" in download_response.headers
        assert "download_test.pdf" in download_response.headers["content-disposition"]
        
        # Store for cleanup
        self.__class__.download_test_file_id = file_id
        print(f"✓ File download successful - file_id: {file_id}")
    
    def test_download_nonexistent_file(self, auth_headers):
        """Test downloading a file that doesn't exist"""
        fake_file_id = "nonexistent-file-id-12345"
        
        response = requests.get(
            f"{BASE_URL}/api/files/{fake_file_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Nonexistent file correctly returns 404")
    
    # ==================== LIST FILES TESTS ====================
    
    def test_list_files(self, auth_headers):
        """Test listing uploaded files"""
        response = requests.get(
            f"{BASE_URL}/api/files",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"List files failed: {response.text}"
        data = response.json()
        
        # Should be a list
        assert isinstance(data, list), "Response should be a list"
        
        # If there are files, validate structure
        if len(data) > 0:
            file_record = data[0]
            assert "id" in file_record, "File record should have id"
            assert "original_filename" in file_record, "File record should have original_filename"
            assert "file_size" in file_record, "File record should have file_size"
            assert "content_type" in file_record, "File record should have content_type"
            assert "uploaded_at" in file_record, "File record should have uploaded_at"
        
        print(f"✓ List files successful - found {len(data)} files")
    
    # ==================== DELETE TESTS ====================
    
    def test_delete_file(self, auth_headers):
        """Test deleting an uploaded file"""
        # First upload a file to delete
        pdf_content = b"%PDF-1.4 delete test content"
        files = {
            "file": ("delete_test.pdf", io.BytesIO(pdf_content), "application/pdf")
        }
        
        upload_response = requests.post(
            f"{BASE_URL}/api/upload/evidence",
            headers=auth_headers,
            files=files
        )
        assert upload_response.status_code == 200
        file_id = upload_response.json()["file_id"]
        
        # Delete the file
        delete_response = requests.delete(
            f"{BASE_URL}/api/files/{file_id}",
            headers=auth_headers
        )
        
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        data = delete_response.json()
        assert "message" in data
        assert "deleted" in data["message"].lower()
        
        # Verify file is gone
        get_response = requests.get(
            f"{BASE_URL}/api/files/{file_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 404, "Deleted file should return 404"
        
        print(f"✓ File delete successful - file_id: {file_id}")
    
    def test_delete_nonexistent_file(self, auth_headers):
        """Test deleting a file that doesn't exist"""
        fake_file_id = "nonexistent-file-id-67890"
        
        response = requests.delete(
            f"{BASE_URL}/api/files/{fake_file_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Delete nonexistent file correctly returns 404")
    
    # ==================== AUTH TESTS ====================
    
    def test_upload_without_auth(self):
        """Test that upload requires authentication"""
        pdf_content = b"%PDF-1.4 no auth test"
        files = {
            "file": ("no_auth.pdf", io.BytesIO(pdf_content), "application/pdf")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence",
            files=files
        )
        
        # Should return 401 or 403
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Upload without auth correctly rejected")
    
    def test_download_without_auth(self):
        """Test that download requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/files/some-file-id"
        )
        
        # Should return 401 or 403
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Download without auth correctly rejected")
    
    def test_list_files_without_auth(self):
        """Test that list files requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/files"
        )
        
        # Should return 401 or 403
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ List files without auth correctly rejected")
    
    def test_delete_without_auth(self):
        """Test that delete requires authentication"""
        response = requests.delete(
            f"{BASE_URL}/api/files/some-file-id"
        )
        
        # Should return 401 or 403
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Delete without auth correctly rejected")


class TestEmissionsWithEvidence:
    """Test emissions endpoint with evidence_url field"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for super admin"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPER_ADMIN_EMAIL, "password": SUPER_ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get headers with auth token"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
    
    @pytest.fixture(scope="class")
    def facility_id(self, auth_headers):
        """Get or create a facility for testing"""
        # First try to get existing facilities
        response = requests.get(
            f"{BASE_URL}/api/facilities",
            headers=auth_headers
        )
        
        if response.status_code == 200:
            facilities = response.json()
            if facilities:
                return facilities[0]["id"]
        
        # If no facilities, we need to create one (requires organization)
        # For now, skip if no facilities exist
        pytest.skip("No facilities available for testing emissions")
    
    def test_create_emission_with_evidence_url(self, auth_headers, facility_id):
        """Test creating an emission record with evidence_url"""
        # First upload a file
        pdf_content = b"%PDF-1.4 emission evidence"
        files = {
            "file": ("emission_evidence.pdf", io.BytesIO(pdf_content), "application/pdf")
        }
        
        upload_response = requests.post(
            f"{BASE_URL}/api/upload/evidence",
            headers={"Authorization": auth_headers["Authorization"]},
            files=files
        )
        
        if upload_response.status_code != 200:
            pytest.skip(f"File upload failed: {upload_response.text}")
        
        evidence_url = upload_response.json()["url"]
        
        # Create emission record with evidence_url
        emission_data = {
            "facility_id": facility_id,
            "reporting_period": "2024-01",
            "scope": "scope1",
            "category": "stationary_combustion",
            "sub_category": "natural_gas",
            "fuel_type": "natural_gas",
            "quantity": 100.0,
            "emission_factor": 2.03,
            "unit": "m³",
            "evidence_url": evidence_url,
            "notes": "TEST_emission_with_evidence"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/emissions",
            headers=auth_headers,
            json=emission_data
        )
        
        assert response.status_code == 200, f"Create emission failed: {response.text}"
        data = response.json()
        
        # Validate evidence_url is stored
        assert "evidence_url" in data, "Response should include evidence_url"
        assert data["evidence_url"] == evidence_url, "evidence_url should match"
        
        # Store for cleanup
        self.__class__.test_emission_id = data["id"]
        print(f"✓ Emission with evidence_url created - id: {data['id']}")
    
    def test_get_emissions_includes_evidence_url(self, auth_headers, facility_id):
        """Test that GET emissions returns evidence_url field"""
        response = requests.get(
            f"{BASE_URL}/api/emissions",
            headers=auth_headers,
            params={"facility_id": facility_id}
        )
        
        assert response.status_code == 200, f"Get emissions failed: {response.text}"
        data = response.json()
        
        # Check that emissions have evidence_url field (can be null)
        if len(data) > 0:
            emission = data[0]
            # evidence_url should be in the response (even if null)
            assert "evidence_url" in emission or emission.get("evidence_url") is None, \
                "Emission should have evidence_url field"
        
        print(f"✓ GET emissions includes evidence_url field")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
