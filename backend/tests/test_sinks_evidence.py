"""
Test Suite for Sinks module with per-month evidence uploads
Tests the P0 task: 'for each month there should be an option to upload evidences in sinks'
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPER_ADMIN_EMAIL = "superadmin@ecotrack.com"
SUPER_ADMIN_PASSWORD = "SuperAdmin123!"


class TestSinksModule:
    """Test suite for Sinks CRUD and evidence upload functionality"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login as superadmin and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
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
        """Get first available facility for testing"""
        response = requests.get(f"{BASE_URL}/api/facilities", headers=auth_headers)
        assert response.status_code == 200
        facilities = response.json()
        if not facilities:
            pytest.skip("No facilities available for testing")
        return facilities[0]["id"]
    
    # ==================== API TESTS ====================
    
    def test_get_sinks_list(self, auth_headers):
        """Test GET /api/sinks returns list of sinks"""
        response = requests.get(f"{BASE_URL}/api/sinks", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get sinks: {response.text}"
        sinks = response.json()
        assert isinstance(sinks, list), "Response should be a list"
        print(f"✓ GET /api/sinks - Retrieved {len(sinks)} sinks")
    
    def test_create_sink_with_monthly_data(self, auth_headers, facility_id):
        """Test POST /api/sinks creates sink with monthly_data structure"""
        # Create monthly data with values for some months
        monthly_data = {
            "0": {"value": "10.5", "evidence": []},  # January
            "1": {"value": "15.25", "evidence": []},  # February
            "5": {"value": "20.0", "evidence": []},   # June
        }
        
        payload = {
            "facility_id": facility_id,
            "start_date": "2025-01-01",
            "end_date": "2025-06-28",
            "total_emissions_reduced": 45.75,  # Sum of monthly values
            "description": "TEST_Sink_Evidence_Test",
            "evidence_urls": [],
            "monthly_data": monthly_data,
            "reporting_year": "2025"
        }
        
        response = requests.post(f"{BASE_URL}/api/sinks", json=payload, headers=auth_headers)
        assert response.status_code in [200, 201], f"Create sink failed: {response.text}"
        
        sink = response.json()
        assert sink["facility_id"] == facility_id
        assert sink["total_emissions_reduced"] == 45.75
        assert sink["monthly_data"] is not None
        assert "0" in sink["monthly_data"]  # January data
        assert sink["monthly_data"]["0"]["value"] == "10.5"
        
        print(f"✓ POST /api/sinks - Created sink with monthly_data: ID={sink['id']}")
        return sink["id"]
    
    def test_get_sink_by_id(self, auth_headers, facility_id):
        """Test GET /api/sinks/{id} returns single sink"""
        # First create a sink
        payload = {
            "facility_id": facility_id,
            "start_date": "2025-02-01",
            "end_date": "2025-02-28",
            "total_emissions_reduced": 5.0,
            "description": "TEST_Get_Sink_By_ID",
            "monthly_data": {"1": {"value": "5.0", "evidence": []}},
            "reporting_year": "2025"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/sinks", json=payload, headers=auth_headers)
        assert create_response.status_code in [200, 201]
        sink_id = create_response.json()["id"]
        
        # Get by ID
        response = requests.get(f"{BASE_URL}/api/sinks/{sink_id}", headers=auth_headers)
        assert response.status_code == 200, f"Get sink by ID failed: {response.text}"
        
        sink = response.json()
        assert sink["id"] == sink_id
        assert sink["description"] == "TEST_Get_Sink_By_ID"
        
        print(f"✓ GET /api/sinks/{{id}} - Retrieved sink ID={sink_id}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/sinks/{sink_id}", headers=auth_headers)
    
    def test_update_sink(self, auth_headers, facility_id):
        """Test PUT /api/sinks/{id} updates sink properly"""
        # Create a sink first
        create_payload = {
            "facility_id": facility_id,
            "start_date": "2025-03-01",
            "end_date": "2025-03-28",
            "total_emissions_reduced": 10.0,
            "description": "TEST_Update_Sink_Original",
            "monthly_data": {"2": {"value": "10.0", "evidence": []}},
            "reporting_year": "2025"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/sinks", json=create_payload, headers=auth_headers)
        assert create_response.status_code in [200, 201]
        sink_id = create_response.json()["id"]
        
        # Update the sink
        update_payload = {
            "facility_id": facility_id,
            "start_date": "2025-03-01",
            "end_date": "2025-04-28",
            "total_emissions_reduced": 25.0,
            "description": "TEST_Update_Sink_Modified",
            "monthly_data": {
                "2": {"value": "10.0", "evidence": []},
                "3": {"value": "15.0", "evidence": []}
            },
            "reporting_year": "2025"
        }
        
        response = requests.put(f"{BASE_URL}/api/sinks/{sink_id}", json=update_payload, headers=auth_headers)
        assert response.status_code == 200, f"Update sink failed: {response.text}"
        
        updated = response.json()
        assert updated["description"] == "TEST_Update_Sink_Modified"
        assert updated["total_emissions_reduced"] == 25.0
        assert "3" in updated["monthly_data"]  # April was added
        
        print(f"✓ PUT /api/sinks/{{id}} - Updated sink ID={sink_id}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/sinks/{sink_id}", headers=auth_headers)
    
    def test_delete_sink(self, auth_headers, facility_id):
        """Test DELETE /api/sinks/{id} deletes sink correctly"""
        # Create a sink to delete
        create_payload = {
            "facility_id": facility_id,
            "start_date": "2025-04-01",
            "end_date": "2025-04-28",
            "total_emissions_reduced": 5.0,
            "description": "TEST_Delete_Sink",
            "monthly_data": {"3": {"value": "5.0", "evidence": []}},
            "reporting_year": "2025"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/sinks", json=create_payload, headers=auth_headers)
        assert create_response.status_code in [200, 201]
        sink_id = create_response.json()["id"]
        
        # Delete the sink
        response = requests.delete(f"{BASE_URL}/api/sinks/{sink_id}", headers=auth_headers)
        assert response.status_code == 200, f"Delete sink failed: {response.text}"
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/sinks/{sink_id}", headers=auth_headers)
        assert get_response.status_code == 404, "Sink should not exist after deletion"
        
        print(f"✓ DELETE /api/sinks/{{id}} - Deleted sink ID={sink_id}")


class TestEvidenceUpload:
    """Test suite for evidence file upload functionality"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login as superadmin and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_upload_evidence_file(self, auth_headers):
        """Test POST /api/upload/evidence uploads file and returns file_id and url"""
        # Create a test PDF content (minimal valid PDF)
        test_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
        files = {
            "file": ("test_evidence.pdf", io.BytesIO(test_content), "application/pdf")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence",
            files=files,
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        
        result = response.json()
        assert "file_id" in result, "Response should contain file_id"
        assert "url" in result, "Response should contain url"
        assert result["url"].startswith("/api/files/"), "URL should start with /api/files/"
        assert "filename" in result, "Response should contain filename"
        
        print(f"✓ POST /api/upload/evidence - Uploaded file: {result['filename']}, url={result['url']}")
        return result
    
    def test_upload_image_evidence(self, auth_headers):
        """Test uploading image files as evidence"""
        # Create a minimal valid PNG (1x1 pixel transparent)
        png_content = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  # 1x1 dimensions
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,  # bit depth, color type, etc
            0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,  # IDAT chunk
            0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,  # compressed data
            0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,  # checksum
            0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,  # IEND chunk
            0xAE, 0x42, 0x60, 0x82
        ])
        
        files = {
            "file": ("test_image.png", io.BytesIO(png_content), "image/png")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/upload/evidence",
            files=files,
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Image upload failed: {response.text}"
        result = response.json()
        assert "file_id" in result
        
        print(f"✓ Uploaded image evidence: {result['filename']}")
    
    def test_view_file_public(self, auth_headers):
        """Test GET /api/files/{id}/view - public view endpoint for images/pdfs"""
        # First upload a file
        test_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
        files = {
            "file": ("view_test.pdf", io.BytesIO(test_content), "application/pdf")
        }
        
        upload_response = requests.post(
            f"{BASE_URL}/api/upload/evidence",
            files=files,
            headers=auth_headers
        )
        assert upload_response.status_code == 200
        file_id = upload_response.json()["file_id"]
        
        # Test view endpoint (public - no auth)
        view_response = requests.get(f"{BASE_URL}/api/files/{file_id}/view")
        assert view_response.status_code == 200, f"View file failed: {view_response.text}"
        assert "pdf" in view_response.headers.get("content-type", "").lower()
        
        print(f"✓ GET /api/files/{{id}}/view - PDF file viewable publicly")
    
    def test_download_file_public(self, auth_headers):
        """Test GET /api/files/{id}/download - public download endpoint"""
        # First upload a file
        test_content = b"Test CSV content,column1,column2\nvalue1,value2,value3"
        files = {
            "file": ("download_test.csv", io.BytesIO(test_content), "text/csv")
        }
        
        upload_response = requests.post(
            f"{BASE_URL}/api/upload/evidence",
            files=files,
            headers=auth_headers
        )
        assert upload_response.status_code == 200
        file_id = upload_response.json()["file_id"]
        
        # Test download endpoint (public)
        download_response = requests.get(f"{BASE_URL}/api/files/{file_id}/download")
        assert download_response.status_code == 200, f"Download file failed: {download_response.text}"
        assert "attachment" in download_response.headers.get("content-disposition", "").lower()
        
        print(f"✓ GET /api/files/{{id}}/download - File downloadable")


class TestSinkWithEvidence:
    """Test creating/updating sinks with evidence files in monthly_data"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    @pytest.fixture(scope="class")
    def facility_id(self, auth_headers):
        headers = {**auth_headers, "Content-Type": "application/json"}
        response = requests.get(f"{BASE_URL}/api/facilities", headers=headers)
        assert response.status_code == 200
        facilities = response.json()
        if not facilities:
            pytest.skip("No facilities available")
        return facilities[0]["id"]
    
    def test_create_sink_with_evidence_in_monthly_data(self, auth_headers, facility_id):
        """Test creating a sink with evidence files in monthly_data structure"""
        # First upload an evidence file
        test_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
        files = {
            "file": ("january_evidence.pdf", io.BytesIO(test_content), "application/pdf")
        }
        
        upload_response = requests.post(
            f"{BASE_URL}/api/upload/evidence",
            files=files,
            headers=auth_headers
        )
        assert upload_response.status_code == 200
        uploaded_file = upload_response.json()
        
        # Create sink with evidence in monthly_data
        monthly_data = {
            "0": {  # January
                "value": "100.0",
                "evidence": [{
                    "name": "january_evidence.pdf",
                    "url": uploaded_file["url"],
                    "file_id": uploaded_file["file_id"]
                }]
            },
            "1": {  # February - no evidence
                "value": "50.0",
                "evidence": []
            }
        }
        
        payload = {
            "facility_id": facility_id,
            "start_date": "2025-01-01",
            "end_date": "2025-02-28",
            "total_emissions_reduced": 150.0,
            "description": "TEST_Sink_With_Evidence",
            "evidence_urls": [uploaded_file["url"]],  # For backward compatibility
            "monthly_data": monthly_data,
            "reporting_year": "2025"
        }
        
        json_headers = {**auth_headers, "Content-Type": "application/json"}
        response = requests.post(f"{BASE_URL}/api/sinks", json=payload, headers=json_headers)
        assert response.status_code in [200, 201], f"Create sink failed: {response.text}"
        
        sink = response.json()
        assert sink["monthly_data"]["0"]["evidence"][0]["file_id"] == uploaded_file["file_id"]
        
        print(f"✓ Created sink with evidence in monthly_data: ID={sink['id']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/sinks/{sink['id']}", headers=json_headers)
    
    def test_update_sink_add_evidence(self, auth_headers, facility_id):
        """Test updating a sink to add evidence to existing monthly_data"""
        json_headers = {**auth_headers, "Content-Type": "application/json"}
        
        # Create sink without evidence
        create_payload = {
            "facility_id": facility_id,
            "start_date": "2025-05-01",
            "end_date": "2025-05-28",
            "total_emissions_reduced": 75.0,
            "description": "TEST_Sink_Update_Evidence",
            "monthly_data": {"4": {"value": "75.0", "evidence": []}},
            "reporting_year": "2025"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/sinks", json=create_payload, headers=json_headers)
        assert create_response.status_code in [200, 201]
        sink_id = create_response.json()["id"]
        
        # Upload evidence
        test_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
        files = {"file": ("may_evidence.pdf", io.BytesIO(test_content), "application/pdf")}
        upload_response = requests.post(f"{BASE_URL}/api/upload/evidence", files=files, headers=auth_headers)
        assert upload_response.status_code == 200
        uploaded_file = upload_response.json()
        
        # Update sink with evidence
        update_payload = {
            **create_payload,
            "monthly_data": {
                "4": {
                    "value": "75.0",
                    "evidence": [{
                        "name": "may_evidence.pdf",
                        "url": uploaded_file["url"],
                        "file_id": uploaded_file["file_id"]
                    }]
                }
            }
        }
        
        update_response = requests.put(f"{BASE_URL}/api/sinks/{sink_id}", json=update_payload, headers=json_headers)
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        updated = update_response.json()
        assert len(updated["monthly_data"]["4"]["evidence"]) == 1
        
        print(f"✓ Updated sink to add evidence: ID={sink_id}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/sinks/{sink_id}", headers=json_headers)


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
    
    def test_cleanup_test_sinks(self, auth_headers):
        """Clean up any remaining TEST_ sinks"""
        response = requests.get(f"{BASE_URL}/api/sinks", headers=auth_headers)
        if response.status_code == 200:
            sinks = response.json()
            for sink in sinks:
                if sink.get("description", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/sinks/{sink['id']}", headers=auth_headers)
                    print(f"  Cleaned up test sink: {sink['id']}")
        print("✓ Cleanup completed")
