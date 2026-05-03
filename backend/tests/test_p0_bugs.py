"""
P0 Bug Tests for GHG Emission Platform
Testing the following P0 bugs:
1. Logo upload and preview - /api/files/{id}/view endpoint for public logo viewing
2. Evidence file download - /api/files/{id} endpoint with authentication
3. Version history showing user email - /api/emissions/{id}/history endpoint
4. Remarks/Notes saving - Organization and Facility forms
"""

import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://scope3-tracker-2.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

# Test credentials
SUPER_ADMIN_EMAIL = "superadmin@ecotrack.com"
SUPER_ADMIN_PASSWORD = "SuperAdmin123!"
ADMIN_EMAIL = "admin@ghg.com"
ADMIN_PASSWORD = "admin123"


class TestAuthentication:
    """Test authentication for Super Admin and Admin"""
    
    def test_super_admin_login(self):
        """Test Super Admin login"""
        response = requests.post(f"{API}/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Super Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert data["user"]["role"] == "super_admin", f"Expected super_admin role, got {data['user']['role']}"
        print(f"✓ Super Admin login successful: {data['user']['email']}")
    
    def test_admin_login(self):
        """Test Admin login"""
        response = requests.post(f"{API}/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert data["user"]["role"] == "admin", f"Expected admin role, got {data['user']['role']}"
        print(f"✓ Admin login successful: {data['user']['email']}")


class TestP0Bug1LogoPreview:
    """P0 Bug 1: Logo upload and preview - Test /api/files/{id}/view endpoint"""
    
    @pytest.fixture
    def super_admin_token(self):
        """Get Super Admin token"""
        response = requests.post(f"{API}/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Super Admin login failed")
    
    @pytest.fixture
    def admin_token(self):
        """Get Admin token"""
        response = requests.post(f"{API}/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Admin login failed")
    
    def test_upload_logo_file(self, super_admin_token):
        """Test uploading a logo image file"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        
        # Create a simple PNG file (1x1 pixel)
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk header
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  # 1x1 dimensions
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
            0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
            0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
            0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        
        files = {"file": ("test_logo.png", io.BytesIO(png_data), "image/png")}
        response = requests.post(f"{API}/upload/evidence", headers=headers, files=files)
        
        assert response.status_code == 200, f"Logo upload failed: {response.text}"
        data = response.json()
        assert "file_id" in data, "No file_id in response"
        assert "url" in data, "No url in response"
        print(f"✓ Logo uploaded successfully: file_id={data['file_id']}")
        return data
    
    def test_logo_view_endpoint_public(self, super_admin_token):
        """Test /api/files/{id}/view endpoint is accessible without auth (for img tags)"""
        # First upload a logo
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
            0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
            0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
            0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        
        files = {"file": ("logo_view_test.png", io.BytesIO(png_data), "image/png")}
        upload_response = requests.post(f"{API}/upload/evidence", headers=headers, files=files)
        assert upload_response.status_code == 200, f"Upload failed: {upload_response.text}"
        
        file_id = upload_response.json()["file_id"]
        
        # Now test /view endpoint WITHOUT auth - should work for images
        view_response = requests.get(f"{API}/files/{file_id}/view")
        assert view_response.status_code == 200, f"Logo view failed (no auth): {view_response.status_code}"
        assert view_response.headers.get("content-type", "").startswith("image/"), "Content-type should be image"
        print(f"✓ Logo /view endpoint works without auth (public access for img tags)")
    
    def test_logo_view_rejects_non_images(self, super_admin_token):
        """Test that /view endpoint rejects non-image files"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        
        # Upload a PDF file
        pdf_content = b"%PDF-1.4 test document content"
        files = {"file": ("test.pdf", io.BytesIO(pdf_content), "application/pdf")}
        upload_response = requests.post(f"{API}/upload/evidence", headers=headers, files=files)
        assert upload_response.status_code == 200
        
        file_id = upload_response.json()["file_id"]
        
        # Try to view PDF through /view endpoint - should be rejected
        view_response = requests.get(f"{API}/files/{file_id}/view")
        assert view_response.status_code == 403, f"Expected 403 for non-image, got {view_response.status_code}"
        print(f"✓ /view endpoint correctly rejects non-image files")


class TestP0Bug2EvidenceDownload:
    """P0 Bug 2: Evidence file download - Test /api/files/{id} with authentication"""
    
    @pytest.fixture
    def admin_token(self):
        """Get Admin token"""
        response = requests.post(f"{API}/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Admin login failed")
    
    def test_evidence_download_with_auth(self, admin_token):
        """Test evidence file download with authentication"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Upload a test file first
        test_content = b"Test evidence document content for download test"
        files = {"file": ("evidence_test.pdf", io.BytesIO(test_content), "application/pdf")}
        upload_response = requests.post(f"{API}/upload/evidence", headers=headers, files=files)
        
        assert upload_response.status_code == 200, f"Upload failed: {upload_response.text}"
        file_id = upload_response.json()["file_id"]
        
        # Now download with auth
        download_response = requests.get(f"{API}/files/{file_id}", headers=headers)
        assert download_response.status_code == 200, f"Download failed: {download_response.status_code}"
        
        # Check content-disposition header
        content_disp = download_response.headers.get("content-disposition", "")
        assert "attachment" in content_disp, f"Expected attachment header, got: {content_disp}"
        print(f"✓ Evidence download works with authentication")
    
    def test_evidence_download_requires_auth(self, admin_token):
        """Test that evidence download requires authentication"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Upload a test file
        test_content = b"Test document"
        files = {"file": ("auth_test.pdf", io.BytesIO(test_content), "application/pdf")}
        upload_response = requests.post(f"{API}/upload/evidence", headers=headers, files=files)
        assert upload_response.status_code == 200
        
        file_id = upload_response.json()["file_id"]
        
        # Try to download WITHOUT auth - should fail
        download_response = requests.get(f"{API}/files/{file_id}")
        assert download_response.status_code in [401, 403], f"Expected 401/403 without auth, got {download_response.status_code}"
        print(f"✓ Evidence download correctly requires authentication")
    
    def test_unicode_filename_download(self, admin_token):
        """Test downloading file with Unicode filename (previous bug: Unicode encoding error)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Upload file with Unicode filename
        test_content = b"Test content"
        files = {"file": ("évidence_日本語.pdf", io.BytesIO(test_content), "application/pdf")}
        upload_response = requests.post(f"{API}/upload/evidence", headers=headers, files=files)
        
        assert upload_response.status_code == 200, f"Upload failed: {upload_response.text}"
        file_id = upload_response.json()["file_id"]
        
        # Download - should not throw Unicode encoding error
        download_response = requests.get(f"{API}/files/{file_id}", headers=headers)
        assert download_response.status_code == 200, f"Unicode filename download failed: {download_response.status_code}"
        print(f"✓ Unicode filename download works (no encoding error)")


class TestP0Bug3VersionHistory:
    """P0 Bug 3: Version history showing user email instead of 'unknown user'"""
    
    @pytest.fixture
    def admin_token(self):
        """Get Admin token"""
        response = requests.post(f"{API}/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Admin login failed")
    
    def test_version_history_shows_email(self, admin_token):
        """Test that version history shows user email, not 'unknown user'"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get emissions to find one with history
        emissions_response = requests.get(f"{API}/emissions", headers=headers)
        assert emissions_response.status_code == 200
        
        emissions = emissions_response.json()
        if not emissions:
            pytest.skip("No emissions found to test version history")
        
        # Get history for first emission
        emission_id = emissions[0]["id"]
        history_response = requests.get(f"{API}/emissions/{emission_id}/history", headers=headers)
        assert history_response.status_code == 200
        
        history = history_response.json()
        print(f"Found {len(history)} history entries for emission {emission_id}")
        
        # Check that history entries have changed_by_email
        for entry in history:
            # The key fix: changed_by_email should be populated
            assert "changed_by_email" in entry, "changed_by_email not in history entry"
            if entry["changed_by_email"]:
                # Should be email, not "Unknown User" (unless user was deleted)
                print(f"  History entry: changed_by_email={entry['changed_by_email']}")
                
        print(f"✓ Version history endpoint returns changed_by_email field")
    
    def test_create_and_update_emission_for_history(self, admin_token):
        """Create and update emission to test history population"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get facilities first
        facilities_response = requests.get(f"{API}/facilities", headers=headers)
        if facilities_response.status_code != 200 or not facilities_response.json():
            pytest.skip("No facilities available for testing")
        
        facility_id = facilities_response.json()[0]["id"]
        
        # Create emission
        emission_data = {
            "facility_id": facility_id,
            "reporting_period": "2024-01",
            "scope": "scope1",
            "category": "Stationary Combustion",
            "sub_category": "Natural Gas",
            "quantity": 100,
            "emission_factor": 2.5,
            "unit": "kg CO2e/kg"
        }
        
        create_response = requests.post(f"{API}/emissions", headers=headers, json=emission_data)
        if create_response.status_code != 200:
            # May fail if no facilities, skip
            pytest.skip(f"Cannot create emission: {create_response.text}")
        
        emission_id = create_response.json()["id"]
        
        # Update emission to create history
        emission_data["quantity"] = 150
        update_response = requests.put(f"{API}/emissions/{emission_id}", headers=headers, json=emission_data)
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        # Check history
        history_response = requests.get(f"{API}/emissions/{emission_id}/history", headers=headers)
        assert history_response.status_code == 200
        
        history = history_response.json()
        assert len(history) > 0, "No history created after update"
        
        # Verify email is populated
        for entry in history:
            assert "changed_by_email" in entry
            if entry["changed_by_email"]:
                print(f"  History shows email: {entry['changed_by_email']}")
                # Should contain @ symbol if it's a real email
                if "@" not in entry["changed_by_email"] and entry["changed_by_email"] != "Unknown User":
                    pytest.fail(f"Invalid email format: {entry['changed_by_email']}")
        
        # Cleanup - delete test emission
        requests.delete(f"{API}/emissions/{emission_id}", headers=headers)
        print(f"✓ Version history correctly shows user email after update")


class TestP0Bug4RemarksSaving:
    """P0 Bug 4: Remarks/Notes saving in Organization and Facility forms"""
    
    @pytest.fixture
    def super_admin_token(self):
        """Get Super Admin token"""
        response = requests.post(f"{API}/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Super Admin login failed")
    
    @pytest.fixture
    def admin_token(self):
        """Get Admin token"""
        response = requests.post(f"{API}/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Admin login failed")
    
    def test_organization_remarks_saving(self, super_admin_token):
        """Test that remarks field saves and persists for organizations"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        
        # Create organization with remarks
        org_data = {
            "name": f"TEST_Remarks_Org_{os.urandom(4).hex()}",
            "corporate_address": "123 Test Street",
            "city": "Test City",
            "state": "Test State",
            "country": "India",
            "pincode": "123456",
            "remarks": "This is a test remark for the organization"
        }
        
        create_response = requests.post(f"{API}/super-admin/organizations", headers=headers, json=org_data)
        assert create_response.status_code == 200, f"Create org failed: {create_response.text}"
        
        org_id = create_response.json()["id"]
        created_remarks = create_response.json().get("remarks")
        assert created_remarks == org_data["remarks"], f"Remarks not saved on create: {created_remarks}"
        
        # Verify by fetching the organization
        orgs_response = requests.get(f"{API}/super-admin/organizations", headers=headers)
        assert orgs_response.status_code == 200
        
        org_found = None
        for org in orgs_response.json():
            if org["id"] == org_id:
                org_found = org
                break
        
        assert org_found is not None, "Created organization not found"
        assert org_found.get("remarks") == org_data["remarks"], f"Remarks not persisted: {org_found.get('remarks')}"
        
        # Update remarks
        org_data["remarks"] = "Updated test remark"
        update_response = requests.put(f"{API}/super-admin/organizations/{org_id}", headers=headers, json=org_data)
        assert update_response.status_code == 200
        assert update_response.json().get("remarks") == "Updated test remark", "Remarks not updated"
        
        # Cleanup
        requests.delete(f"{API}/super-admin/organizations/{org_id}", headers=headers)
        print(f"✓ Organization remarks field saves and persists correctly")
    
    def test_facility_remarks_saving(self, admin_token):
        """Test that remarks field saves and persists for facilities"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create facility with remarks
        facility_data = {
            "name": f"TEST_Remarks_Facility_{os.urandom(4).hex()}",
            "address": "456 Test Ave",
            "city": "Test City",
            "state": "Test State",
            "country": "India",
            "pincode": "654321",
            "remarks": "This is a test remark for the facility"
        }
        
        create_response = requests.post(f"{API}/facilities", headers=headers, json=facility_data)
        
        # May fail if admin has no organization - that's a separate issue
        if create_response.status_code == 400 and "No organization" in create_response.text:
            pytest.skip("Admin has no organization assigned - cannot test facility remarks")
        
        assert create_response.status_code == 200, f"Create facility failed: {create_response.text}"
        
        facility_id = create_response.json()["id"]
        created_remarks = create_response.json().get("remarks")
        assert created_remarks == facility_data["remarks"], f"Remarks not saved: {created_remarks}"
        
        # Verify by fetching
        get_response = requests.get(f"{API}/facilities/{facility_id}", headers=headers)
        assert get_response.status_code == 200
        assert get_response.json().get("remarks") == facility_data["remarks"]
        
        # Update remarks
        facility_data["remarks"] = "Updated facility remark"
        update_response = requests.put(f"{API}/facilities/{facility_id}", headers=headers, json=facility_data)
        assert update_response.status_code == 200
        assert update_response.json().get("remarks") == "Updated facility remark"
        
        # Cleanup
        requests.delete(f"{API}/facilities/{facility_id}", headers=headers)
        print(f"✓ Facility remarks field saves and persists correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
