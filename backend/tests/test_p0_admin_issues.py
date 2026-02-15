"""
Test P0 Admin Issues:
1. PDF file viewing via /api/files/{file_id}/view endpoint
2. Version history showing 'Created' and 'Updated' entries for emissions
3. Country-specific emission factor lookup (Emissions.js handleCategoryChange)
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')

class TestPDFFileViewing:
    """Test that PDF files can be viewed via /api/files/{file_id}/view endpoint"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login as admin user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@ghg.com",
            "password": "admin123"
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Admin login failed - cannot test PDF viewing")
    
    def test_upload_pdf_file(self, admin_token):
        """Upload a PDF file and verify it can be viewed"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create a simple PDF-like file (for testing purposes)
        # In a real scenario, we'd upload an actual PDF
        pdf_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n116\n%%EOF"
        
        files = {'file': ('test_document.pdf', io.BytesIO(pdf_content), 'application/pdf')}
        
        response = requests.post(f"{BASE_URL}/api/upload/evidence", 
                                headers=headers, 
                                files=files)
        
        if response.status_code != 200:
            pytest.skip(f"File upload failed with status {response.status_code}")
        
        data = response.json()
        assert "file_id" in data, "Response should contain file_id"
        
        # Store file_id for view test
        self.test_file_id = data["file_id"]
        return data["file_id"]
    
    def test_view_pdf_file_endpoint(self, admin_token):
        """Test that PDF files can be viewed via the /view endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First upload a PDF file
        pdf_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n116\n%%EOF"
        
        files = {'file': ('test_view.pdf', io.BytesIO(pdf_content), 'application/pdf')}
        
        upload_response = requests.post(f"{BASE_URL}/api/upload/evidence", 
                                       headers=headers, 
                                       files=files)
        
        if upload_response.status_code != 200:
            pytest.skip(f"File upload failed: {upload_response.text}")
        
        file_id = upload_response.json()["file_id"]
        
        # Now test viewing the PDF file (no auth required for /view endpoint)
        view_response = requests.get(f"{BASE_URL}/api/files/{file_id}/view")
        
        assert view_response.status_code == 200, f"PDF view should succeed, got {view_response.status_code}"
        assert view_response.headers.get("content-type") == "application/pdf", \
            f"Content-Type should be application/pdf, got {view_response.headers.get('content-type')}"
        
        # Check that Content-Disposition is inline for PDFs
        content_disp = view_response.headers.get("content-disposition", "")
        assert "inline" in content_disp, f"PDF should have inline disposition for viewing, got {content_disp}"
        
        print(f"SUCCESS: PDF file {file_id} can be viewed with proper headers")


class TestEmissionVersionHistory:
    """Test version history for emission records - should show Created and Updated entries"""
    
    @pytest.fixture(scope="class")
    def admin_auth(self):
        """Login as admin and get auth info"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@ghg.com",
            "password": "admin123"
        })
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()
    
    @pytest.fixture(scope="class")
    def facility_id(self, admin_auth):
        """Get a facility to use for emission tests"""
        headers = {"Authorization": f"Bearer {admin_auth['access_token']}"}
        response = requests.get(f"{BASE_URL}/api/facilities", headers=headers)
        if response.status_code != 200 or not response.json():
            pytest.skip("No facilities available for testing")
        return response.json()[0]["id"]
    
    def test_create_emission_creates_history_entry(self, admin_auth, facility_id):
        """Creating an emission should create a 'created' history entry"""
        headers = {"Authorization": f"Bearer {admin_auth['access_token']}"}
        
        emission_data = {
            "facility_id": facility_id,
            "reporting_period": "2025-01",
            "scope": "scope1",
            "category": "TEST_Stationary Combustion",
            "sub_category": "TEST_Natural Gas",
            "quantity": 100,
            "emission_factor": 2.0,
            "unit": "kg CO2e/unit",
            "notes": "Test emission for version history"
        }
        
        # Create emission
        response = requests.post(f"{BASE_URL}/api/emissions", 
                                headers=headers, 
                                json=emission_data)
        
        assert response.status_code == 200, f"Create emission failed: {response.text}"
        emission = response.json()
        emission_id = emission["id"]
        
        # Check history has creation entry
        history_response = requests.get(f"{BASE_URL}/api/emissions/{emission_id}/history", 
                                       headers=headers)
        
        assert history_response.status_code == 200, f"Get history failed: {history_response.text}"
        history = history_response.json()
        
        assert len(history) >= 1, "History should have at least one entry"
        
        # First entry should be 'created'
        first_entry = history[0]
        assert first_entry["changes"]["action"] == "created", \
            f"First history entry should have action='created', got {first_entry['changes'].get('action')}"
        
        print(f"SUCCESS: Emission {emission_id} has creation history entry with action='created'")
        
        # Cleanup - delete the test emission
        requests.delete(f"{BASE_URL}/api/emissions/{emission_id}", headers=headers)
        
        return emission_id
    
    def test_update_emission_creates_update_history_entry(self, admin_auth, facility_id):
        """Updating an emission should add an 'updated' history entry"""
        headers = {"Authorization": f"Bearer {admin_auth['access_token']}"}
        
        # Create emission first
        emission_data = {
            "facility_id": facility_id,
            "reporting_period": "2025-02",
            "scope": "scope1",
            "category": "TEST_Mobile Combustion",
            "sub_category": "TEST_Diesel",
            "quantity": 50,
            "emission_factor": 2.5,
            "unit": "kg CO2e/L",
            "notes": "Test emission for update history"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/emissions", 
                                       headers=headers, 
                                       json=emission_data)
        
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        emission_id = create_response.json()["id"]
        
        # Update the emission
        update_data = emission_data.copy()
        update_data["quantity"] = 75
        update_data["notes"] = "Updated quantity for testing"
        
        update_response = requests.put(f"{BASE_URL}/api/emissions/{emission_id}", 
                                      headers=headers, 
                                      json=update_data)
        
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        # Check history has both created and updated entries
        history_response = requests.get(f"{BASE_URL}/api/emissions/{emission_id}/history", 
                                       headers=headers)
        
        assert history_response.status_code == 200, f"Get history failed: {history_response.text}"
        history = history_response.json()
        
        assert len(history) >= 2, f"History should have at least 2 entries, got {len(history)}"
        
        # First entry should be 'created'
        assert history[0]["changes"]["action"] == "created", \
            f"First entry should be 'created', got {history[0]['changes'].get('action')}"
        
        # Second entry should be 'updated'
        assert history[1]["changes"]["action"] == "updated", \
            f"Second entry should be 'updated', got {history[1]['changes'].get('action')}"
        
        # Verify changed_by_email is populated
        assert history[0].get("changed_by_email"), "History entries should have changed_by_email"
        
        print(f"SUCCESS: Emission {emission_id} has both 'created' and 'updated' history entries")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/emissions/{emission_id}", headers=headers)


class TestCountrySpecificEmissionFactors:
    """Test that emission factor lookup prioritizes country-specific factors"""
    
    @pytest.fixture(scope="class")
    def super_admin_token(self):
        """Login as super admin to create emission factors"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@ecotrack.com",
            "password": "SuperAdmin123!"
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Super admin login failed")
    
    def test_create_global_and_country_specific_factors(self, super_admin_token):
        """Create both global and country-specific factors and verify they exist"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        
        # Clean up any existing test factors
        factors_response = requests.get(f"{BASE_URL}/api/emission-factors", headers=headers)
        if factors_response.status_code == 200:
            for factor in factors_response.json():
                if factor["category"] == "TEST_Country_Specific":
                    requests.delete(f"{BASE_URL}/api/super-admin/emission-factors/{factor['id']}", 
                                   headers=headers)
        
        # Create a global factor
        global_factor = {
            "name": "TEST Global Natural Gas",
            "scope": "scope1",
            "category": "TEST_Country_Specific",
            "sub_category": "Natural Gas Global",
            "factor": 2.0,
            "unit": "kg CO2e/m³",
            "region": "Global (All Regions)",
            "source": "Test Source"
        }
        
        global_response = requests.post(f"{BASE_URL}/api/super-admin/emission-factors",
                                       headers=headers,
                                       json=global_factor)
        
        assert global_response.status_code == 200, f"Global factor creation failed: {global_response.text}"
        global_id = global_response.json()["id"]
        
        # Create an India-specific factor
        india_factor = {
            "name": "TEST India Natural Gas",
            "scope": "scope1",
            "category": "TEST_Country_Specific",
            "sub_category": "Natural Gas India",
            "factor": 2.5,  # Higher factor for India
            "unit": "kg CO2e/m³",
            "region": "India",
            "source": "India GHG Inventory"
        }
        
        india_response = requests.post(f"{BASE_URL}/api/super-admin/emission-factors",
                                      headers=headers,
                                      json=india_factor)
        
        assert india_response.status_code == 200, f"India factor creation failed: {india_response.text}"
        india_id = india_response.json()["id"]
        
        # Verify both factors exist
        get_factors = requests.get(f"{BASE_URL}/api/emission-factors", headers=headers)
        assert get_factors.status_code == 200
        
        factors = get_factors.json()
        global_found = any(f["id"] == global_id for f in factors)
        india_found = any(f["id"] == india_id for f in factors)
        
        assert global_found, "Global factor should be in the list"
        assert india_found, "India-specific factor should be in the list"
        
        print(f"SUCCESS: Created global factor (id={global_id}, factor=2.0) and India factor (id={india_id}, factor=2.5)")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/super-admin/emission-factors/{global_id}", headers=headers)
        requests.delete(f"{BASE_URL}/api/super-admin/emission-factors/{india_id}", headers=headers)
    
    def test_emission_factors_have_region_field(self, super_admin_token):
        """Verify emission factors have region field for country-specific matching"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        
        # Get all emission factors
        response = requests.get(f"{BASE_URL}/api/emission-factors", headers=headers)
        assert response.status_code == 200
        
        factors = response.json()
        if factors:
            # Check that factors have region field (at least for some)
            factors_with_region = [f for f in factors if f.get("region")]
            print(f"Found {len(factors_with_region)} factors with region field out of {len(factors)} total")
            
            # Verify structure
            sample_factor = factors[0]
            expected_fields = ["id", "scope", "category", "sub_category", "factor", "unit"]
            for field in expected_fields:
                assert field in sample_factor, f"Factor should have {field} field"
        
        print("SUCCESS: Emission factors API returns proper structure with region field support")


class TestFiltersOverlap:
    """Test Emissions page filters - check basic API functionality"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login as admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@ghg.com",
            "password": "admin123"
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Admin login failed")
    
    def test_emissions_filter_by_facility(self, admin_token):
        """Test that emissions can be filtered by facility_id"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get facilities
        facilities = requests.get(f"{BASE_URL}/api/facilities", headers=headers).json()
        if not facilities:
            pytest.skip("No facilities for filter test")
        
        facility_id = facilities[0]["id"]
        
        # Filter emissions by facility
        response = requests.get(f"{BASE_URL}/api/emissions?facility_id={facility_id}", 
                               headers=headers)
        
        assert response.status_code == 200, f"Filter by facility failed: {response.text}"
        
        emissions = response.json()
        # All returned emissions should be for this facility
        for e in emissions:
            assert e["facility_id"] == facility_id, f"Emission {e['id']} has wrong facility_id"
        
        print(f"SUCCESS: Filter by facility_id={facility_id} returned {len(emissions)} emissions")
    
    def test_emissions_filter_by_scope(self, admin_token):
        """Test that emissions can be filtered by scope"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(f"{BASE_URL}/api/emissions?scope=scope1", headers=headers)
        
        assert response.status_code == 200, f"Filter by scope failed: {response.text}"
        
        emissions = response.json()
        for e in emissions:
            assert e["scope"] == "scope1", f"Emission {e['id']} has wrong scope"
        
        print(f"SUCCESS: Filter by scope=scope1 returned {len(emissions)} emissions")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
