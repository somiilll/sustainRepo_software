"""
Tests for Process Templates CRUD operations (SuperAdmin module)
- GET /api/super-admin/process-templates - List all templates (super admin only)
- POST /api/super-admin/process-templates - Create template
- PUT /api/super-admin/process-templates/{id} - Update template
- DELETE /api/super-admin/process-templates/{id} - Delete template
- GET /api/process-templates - List active templates (any authenticated user)
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPER_ADMIN_CREDS = {"email": "superadmin@ecotrack.com", "password": "SuperAdmin123!"}

# Store test data for cleanup
created_template_ids = []


@pytest.fixture(scope="module")
def super_admin_token():
    """Get super admin token for authenticated requests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN_CREDS)
    assert response.status_code == 200, f"Super admin login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def auth_headers(super_admin_token):
    """Auth headers for super admin requests"""
    return {"Authorization": f"Bearer {super_admin_token}", "Content-Type": "application/json"}


class TestProcessTemplatesBackend:
    """Backend API tests for Process Templates CRUD"""
    
    def test_01_get_templates_requires_super_admin_auth(self):
        """GET /api/super-admin/process-templates requires super admin authentication"""
        response = requests.get(f"{BASE_URL}/api/super-admin/process-templates")
        assert response.status_code == 403 or response.status_code == 401, \
            f"Should require auth, got {response.status_code}"
        print("PASSED: Super admin endpoint requires authentication")
    
    def test_02_get_templates_list(self, auth_headers):
        """GET /api/super-admin/process-templates returns list of templates"""
        response = requests.get(f"{BASE_URL}/api/super-admin/process-templates", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get templates: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASSED: Got {len(data)} templates")
        
        # Check if existing template exists (Cement - Clinker Production)
        if len(data) > 0:
            template = data[0]
            assert "id" in template, "Template should have id"
            assert "name" in template, "Template should have name"
            assert "formula" in template, "Template should have formula"
            assert "input_fields" in template, "Template should have input_fields"
            assert "predefined_inputs" in template, "Template should have predefined_inputs"
            assert "is_active" in template, "Template should have is_active"
            print(f"PASSED: Template structure validated - '{template['name']}'")
    
    def test_03_create_template_full_fields(self, auth_headers):
        """POST /api/super-admin/process-templates creates a new template with all fields"""
        payload = {
            "name": f"TEST_Template_{uuid.uuid4().hex[:8]}",
            "description": "Test template for automated testing",
            "sub_industry": "Manufacturing",
            "formula": "activity_data * emission_factor",
            "input_fields": [
                {
                    "key": "activity_data",
                    "label": "Activity Data",
                    "unit": "kg",
                    "data_type": "number",
                    "is_optional": False,
                    "default_value": ""
                },
                {
                    "key": "emission_factor",
                    "label": "Emission Factor",
                    "unit": "kgCO2/kg",
                    "data_type": "number",
                    "is_optional": False,
                    "default_value": "0.5"
                }
            ],
            "predefined_inputs": [
                {
                    "key": "ef_default",
                    "label": "Default EF",
                    "unit": "kgCO2/kg",
                    "data_type": "number",
                    "value": "0.75",
                    "can_override": True
                }
            ],
            "is_active": True
        }
        
        response = requests.post(f"{BASE_URL}/api/super-admin/process-templates", 
                                json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create template: {response.text}"
        
        data = response.json()
        created_template_ids.append(data["id"])
        
        # Verify response structure
        assert data["name"] == payload["name"], "Name mismatch"
        assert data["description"] == payload["description"], "Description mismatch"
        assert data["sub_industry"] == payload["sub_industry"], "Sub-industry mismatch"
        assert data["formula"] == payload["formula"], "Formula mismatch"
        assert len(data["input_fields"]) == 2, "Should have 2 input fields"
        assert len(data["predefined_inputs"]) == 1, "Should have 1 predefined input"
        assert data["is_active"] == True, "Should be active"
        assert "id" in data, "Should have id"
        assert "created_at" in data, "Should have created_at"
        
        print(f"PASSED: Created template '{data['name']}' with id {data['id']}")
    
    def test_04_create_template_minimal(self, auth_headers):
        """POST creates template with minimal required fields (name and formula)"""
        payload = {
            "name": f"TEST_Minimal_{uuid.uuid4().hex[:8]}",
            "formula": "quantity * ef",
            "input_fields": [],
            "predefined_inputs": []
        }
        
        response = requests.post(f"{BASE_URL}/api/super-admin/process-templates", 
                                json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create minimal template: {response.text}"
        
        data = response.json()
        created_template_ids.append(data["id"])
        
        assert data["name"] == payload["name"], "Name mismatch"
        assert data["formula"] == payload["formula"], "Formula mismatch"
        assert data["is_active"] == True, "Default is_active should be True"
        print(f"PASSED: Created minimal template '{data['name']}'")
    
    def test_05_get_template_after_create(self, auth_headers):
        """Verify created template appears in list"""
        response = requests.get(f"{BASE_URL}/api/super-admin/process-templates", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        created_ids = set(created_template_ids)
        found_ids = {t["id"] for t in data if t["id"] in created_ids}
        
        assert len(found_ids) == len(created_ids), f"Expected {len(created_ids)} created templates in list"
        print(f"PASSED: All {len(created_ids)} created templates appear in list")
    
    def test_06_update_template(self, auth_headers):
        """PUT /api/super-admin/process-templates/{id} updates an existing template"""
        if not created_template_ids:
            pytest.skip("No template to update")
        
        template_id = created_template_ids[0]
        
        update_payload = {
            "name": f"TEST_Updated_{uuid.uuid4().hex[:8]}",
            "description": "Updated description",
            "sub_industry": "Energy",
            "formula": "updated_quantity * updated_ef * factor",
            "input_fields": [
                {
                    "key": "updated_quantity",
                    "label": "Updated Quantity",
                    "unit": "tonnes",
                    "data_type": "number",
                    "is_optional": False,
                    "default_value": ""
                }
            ],
            "predefined_inputs": [
                {
                    "key": "updated_ef",
                    "label": "Updated EF",
                    "unit": "tCO2/t",
                    "data_type": "number",
                    "value": "1.5",
                    "can_override": False
                },
                {
                    "key": "factor",
                    "label": "Conversion Factor",
                    "unit": "",
                    "data_type": "number",
                    "value": "0.95",
                    "can_override": True
                }
            ],
            "is_active": False  # Deactivate
        }
        
        response = requests.put(f"{BASE_URL}/api/super-admin/process-templates/{template_id}",
                               json=update_payload, headers=auth_headers)
        assert response.status_code == 200, f"Failed to update template: {response.text}"
        
        data = response.json()
        assert data["name"] == update_payload["name"], "Name not updated"
        assert data["description"] == update_payload["description"], "Description not updated"
        assert data["sub_industry"] == update_payload["sub_industry"], "Sub-industry not updated"
        assert data["formula"] == update_payload["formula"], "Formula not updated"
        assert len(data["input_fields"]) == 1, "Input fields not updated"
        assert len(data["predefined_inputs"]) == 2, "Predefined inputs not updated"
        assert data["is_active"] == False, "is_active not updated"
        assert "updated_at" in data and data["updated_at"] is not None, "updated_at should be set"
        
        print(f"PASSED: Updated template {template_id}")
    
    def test_07_update_nonexistent_template(self, auth_headers):
        """PUT returns 404 for non-existent template"""
        fake_id = str(uuid.uuid4())
        payload = {
            "name": "Won't Work",
            "formula": "x * y",
            "input_fields": [],
            "predefined_inputs": []
        }
        
        response = requests.put(f"{BASE_URL}/api/super-admin/process-templates/{fake_id}",
                               json=payload, headers=auth_headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASSED: Update returns 404 for non-existent template")
    
    def test_08_public_endpoint_returns_active_only(self, auth_headers):
        """GET /api/process-templates returns only active templates"""
        # First create an inactive template
        inactive_payload = {
            "name": f"TEST_Inactive_{uuid.uuid4().hex[:8]}",
            "formula": "x",
            "is_active": False,
            "input_fields": [],
            "predefined_inputs": []
        }
        create_resp = requests.post(f"{BASE_URL}/api/super-admin/process-templates",
                                   json=inactive_payload, headers=auth_headers)
        if create_resp.status_code == 200:
            created_template_ids.append(create_resp.json()["id"])
        
        # Fetch public endpoint
        response = requests.get(f"{BASE_URL}/api/process-templates", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get public templates: {response.text}"
        
        data = response.json()
        inactive_templates = [t for t in data if not t.get("is_active", True)]
        assert len(inactive_templates) == 0, "Public endpoint should not return inactive templates"
        print(f"PASSED: Public endpoint returns only active templates ({len(data)} found)")
    
    def test_09_delete_template(self, auth_headers):
        """DELETE /api/super-admin/process-templates/{id} deletes a template"""
        if len(created_template_ids) < 2:
            pytest.skip("Need at least 2 templates to test delete")
        
        template_id = created_template_ids[-1]  # Delete last created
        
        response = requests.delete(f"{BASE_URL}/api/super-admin/process-templates/{template_id}",
                                  headers=auth_headers)
        assert response.status_code == 200, f"Failed to delete template: {response.text}"
        
        data = response.json()
        assert "message" in data, "Should return message"
        
        # Verify deletion
        list_response = requests.get(f"{BASE_URL}/api/super-admin/process-templates", headers=auth_headers)
        templates = list_response.json()
        deleted_template = [t for t in templates if t["id"] == template_id]
        assert len(deleted_template) == 0, "Deleted template should not appear in list"
        
        created_template_ids.remove(template_id)
        print(f"PASSED: Deleted template {template_id}")
    
    def test_10_delete_nonexistent_template(self, auth_headers):
        """DELETE returns 404 for non-existent template"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(f"{BASE_URL}/api/super-admin/process-templates/{fake_id}",
                                  headers=auth_headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASSED: Delete returns 404 for non-existent template")


@pytest.fixture(scope="module", autouse=True)
def cleanup(auth_headers):
    """Cleanup test data after all tests"""
    yield
    # Clean up all created templates
    for template_id in created_template_ids[:]:
        try:
            requests.delete(f"{BASE_URL}/api/super-admin/process-templates/{template_id}",
                          headers={"Authorization": f"Bearer {SUPER_ADMIN_CREDS}", "Content-Type": "application/json"})
        except:
            pass
    print(f"\nCleanup: Attempted to delete {len(created_template_ids)} test templates")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
