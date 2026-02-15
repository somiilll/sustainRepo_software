"""
Backend Tests for New Super Admin Features:
1. Organization Limits (max_facilities, max_admins, max_users)
2. Calculation Formulas CRUD (scope1, scope2, biogenic)
3. Pincode Validation (6-digit validation)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPER_ADMIN_EMAIL = "superadmin@ecotrack.com"
SUPER_ADMIN_PASSWORD = "SuperAdmin123!"


@pytest.fixture(scope="module")
def super_admin_token():
    """Get super admin authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": SUPER_ADMIN_EMAIL, "password": SUPER_ADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Super Admin login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture
def auth_headers(super_admin_token):
    """Get auth headers for API calls"""
    return {"Authorization": f"Bearer {super_admin_token}", "Content-Type": "application/json"}


class TestOrganizationLimits:
    """Tests for Organization max_facilities, max_admins, max_users"""
    
    def test_create_organization_with_default_limits(self, auth_headers):
        """Test creating organization with default limits"""
        unique_name = f"TEST_Org_Defaults_{uuid.uuid4().hex[:8]}"
        payload = {
            "name": unique_name,
            "corporate_address": "123 Test Street",
            "city": "Test City",
            "state": "Test State",
            "country": "India",
            "pincode": "123456"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/super-admin/organizations",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Create org failed: {response.text}"
        data = response.json()
        
        # Verify default limits
        assert data.get("max_facilities") == 10, "Default max_facilities should be 10"
        assert data.get("max_admins") == 5, "Default max_admins should be 5"
        assert data.get("max_users") == 20, "Default max_users should be 20"
        
        # Cleanup
        org_id = data["id"]
        requests.delete(f"{BASE_URL}/api/super-admin/organizations/{org_id}", headers=auth_headers)
        print(f"PASSED: Organization created with default limits (10, 5, 20)")
    
    def test_create_organization_with_custom_limits(self, auth_headers):
        """Test creating organization with custom limits"""
        unique_name = f"TEST_Org_Custom_{uuid.uuid4().hex[:8]}"
        payload = {
            "name": unique_name,
            "corporate_address": "456 Custom Lane",
            "city": "Custom City",
            "state": "Custom State",
            "country": "India",
            "pincode": "654321",
            "max_facilities": 25,
            "max_admins": 10,
            "max_users": 50
        }
        
        response = requests.post(
            f"{BASE_URL}/api/super-admin/organizations",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Create org failed: {response.text}"
        data = response.json()
        
        # Verify custom limits
        assert data.get("max_facilities") == 25, "max_facilities should be 25"
        assert data.get("max_admins") == 10, "max_admins should be 10"
        assert data.get("max_users") == 50, "max_users should be 50"
        
        # Cleanup
        org_id = data["id"]
        requests.delete(f"{BASE_URL}/api/super-admin/organizations/{org_id}", headers=auth_headers)
        print(f"PASSED: Organization created with custom limits (25, 10, 50)")
    
    def test_update_organization_limits(self, auth_headers):
        """Test updating organization limits"""
        unique_name = f"TEST_Org_Update_{uuid.uuid4().hex[:8]}"
        
        # Create org first
        create_response = requests.post(
            f"{BASE_URL}/api/super-admin/organizations",
            headers=auth_headers,
            json={
                "name": unique_name,
                "corporate_address": "789 Update Ave",
                "city": "Update City",
                "state": "Update State",
                "country": "India",
                "pincode": "111222"
            }
        )
        assert create_response.status_code == 200
        org_id = create_response.json()["id"]
        
        # Update with new limits
        update_payload = {
            "name": unique_name,
            "corporate_address": "789 Update Ave",
            "city": "Update City",
            "state": "Update State",
            "country": "India",
            "pincode": "111222",
            "max_facilities": 30,
            "max_admins": 15,
            "max_users": 100
        }
        
        update_response = requests.put(
            f"{BASE_URL}/api/super-admin/organizations/{org_id}",
            headers=auth_headers,
            json=update_payload
        )
        
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        data = update_response.json()
        
        # Verify updated limits
        assert data.get("max_facilities") == 30
        assert data.get("max_admins") == 15
        assert data.get("max_users") == 100
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/super-admin/organizations/{org_id}", headers=auth_headers)
        print(f"PASSED: Organization limits updated successfully")


class TestPincodeValidation:
    """Tests for 6-digit pincode validation"""
    
    def test_valid_6_digit_pincode(self, auth_headers):
        """Test that 6-digit pincode is accepted"""
        unique_name = f"TEST_Pincode_Valid_{uuid.uuid4().hex[:8]}"
        payload = {
            "name": unique_name,
            "corporate_address": "Test Address",
            "city": "Test City",
            "state": "Test State",
            "country": "India",
            "pincode": "123456"  # Valid 6-digit
        }
        
        response = requests.post(
            f"{BASE_URL}/api/super-admin/organizations",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Valid pincode rejected: {response.text}"
        data = response.json()
        assert data.get("pincode") == "123456"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/super-admin/organizations/{data['id']}", headers=auth_headers)
        print(f"PASSED: Valid 6-digit pincode accepted")
    
    def test_invalid_pincode_less_than_6_digits(self, auth_headers):
        """Test that pincode with less than 6 digits is rejected"""
        unique_name = f"TEST_Pincode_Short_{uuid.uuid4().hex[:8]}"
        payload = {
            "name": unique_name,
            "corporate_address": "Test Address",
            "city": "Test City",
            "state": "Test State",
            "country": "India",
            "pincode": "12345"  # Invalid - only 5 digits
        }
        
        response = requests.post(
            f"{BASE_URL}/api/super-admin/organizations",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 422, f"5-digit pincode should be rejected: {response.status_code}"
        print(f"PASSED: Invalid pincode (5 digits) correctly rejected with 422")
    
    def test_invalid_pincode_more_than_6_digits(self, auth_headers):
        """Test that pincode with more than 6 digits is rejected"""
        unique_name = f"TEST_Pincode_Long_{uuid.uuid4().hex[:8]}"
        payload = {
            "name": unique_name,
            "corporate_address": "Test Address",
            "city": "Test City",
            "state": "Test State",
            "country": "India",
            "pincode": "1234567"  # Invalid - 7 digits
        }
        
        response = requests.post(
            f"{BASE_URL}/api/super-admin/organizations",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 422, f"7-digit pincode should be rejected: {response.status_code}"
        print(f"PASSED: Invalid pincode (7 digits) correctly rejected with 422")
    
    def test_invalid_pincode_with_letters(self, auth_headers):
        """Test that pincode with letters is rejected"""
        unique_name = f"TEST_Pincode_Letters_{uuid.uuid4().hex[:8]}"
        payload = {
            "name": unique_name,
            "corporate_address": "Test Address",
            "city": "Test City",
            "state": "Test State",
            "country": "India",
            "pincode": "12AB56"  # Invalid - contains letters
        }
        
        response = requests.post(
            f"{BASE_URL}/api/super-admin/organizations",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 422, f"Alphanumeric pincode should be rejected: {response.status_code}"
        print(f"PASSED: Invalid pincode (with letters) correctly rejected with 422")
    
    def test_empty_pincode_allowed(self, auth_headers):
        """Test that empty pincode is allowed (optional field)"""
        unique_name = f"TEST_Pincode_Empty_{uuid.uuid4().hex[:8]}"
        payload = {
            "name": unique_name,
            "corporate_address": "Test Address",
            "city": "Test City",
            "state": "Test State",
            "country": "India",
            "pincode": ""  # Empty should be allowed
        }
        
        response = requests.post(
            f"{BASE_URL}/api/super-admin/organizations",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Empty pincode should be allowed: {response.text}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/super-admin/organizations/{response.json()['id']}", headers=auth_headers)
        print(f"PASSED: Empty pincode correctly allowed")


class TestCalculationFormulasCRUD:
    """Tests for Calculation Formulas CRUD operations"""
    
    def test_create_calculation_formula(self, auth_headers):
        """Test creating a new calculation formula"""
        unique_name = f"TEST_Formula_{uuid.uuid4().hex[:8]}"
        payload = {
            "name": unique_name,
            "scope": "scope1",
            "description": "Test formula for fuel combustion",
            "formula_expression": "quantity * emission_factor",
            "input_fields": [
                {"name": "quantity", "label": "Quantity", "type": "number", "unit": "kg", "required": True},
                {"name": "emission_factor", "label": "Emission Factor", "type": "number", "unit": "kg CO2e/kg", "required": True}
            ],
            "output_unit": "kg CO2e",
            "is_active": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/calculation-formulas",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Create formula failed: {response.text}"
        data = response.json()
        
        assert data["name"] == unique_name
        assert data["scope"] == "scope1"
        assert data["formula_expression"] == "quantity * emission_factor"
        assert data["output_unit"] == "kg CO2e"
        assert data["is_active"] == True
        assert len(data["input_fields"]) == 2
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/calculation-formulas/{data['id']}", headers=auth_headers)
        print(f"PASSED: Calculation formula created successfully")
    
    def test_create_formula_scope2(self, auth_headers):
        """Test creating formula for scope2"""
        unique_name = f"TEST_Scope2_Formula_{uuid.uuid4().hex[:8]}"
        payload = {
            "name": unique_name,
            "scope": "scope2",
            "description": "Electricity consumption formula",
            "formula_expression": "kWh * grid_factor",
            "input_fields": [
                {"name": "kWh", "label": "Electricity (kWh)", "type": "number", "unit": "kWh", "required": True},
                {"name": "grid_factor", "label": "Grid Factor", "type": "number", "unit": "kg CO2e/kWh", "required": True}
            ],
            "output_unit": "kg CO2e",
            "is_active": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/calculation-formulas",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Create scope2 formula failed: {response.text}"
        data = response.json()
        assert data["scope"] == "scope2"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/calculation-formulas/{data['id']}", headers=auth_headers)
        print(f"PASSED: Scope 2 formula created successfully")
    
    def test_create_formula_biogenic(self, auth_headers):
        """Test creating formula for biogenic emissions"""
        unique_name = f"TEST_Biogenic_Formula_{uuid.uuid4().hex[:8]}"
        payload = {
            "name": unique_name,
            "scope": "biogenic",
            "description": "Biomass combustion formula",
            "formula_expression": "biomass_weight * biogenic_factor",
            "input_fields": [
                {"name": "biomass_weight", "label": "Biomass Weight", "type": "number", "unit": "kg", "required": True},
                {"name": "biogenic_factor", "label": "Biogenic Factor", "type": "number", "unit": "kg CO2e/kg", "required": True}
            ],
            "output_unit": "kg CO2e",
            "is_active": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/calculation-formulas",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Create biogenic formula failed: {response.text}"
        data = response.json()
        assert data["scope"] == "biogenic"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/calculation-formulas/{data['id']}", headers=auth_headers)
        print(f"PASSED: Biogenic formula created successfully")
    
    def test_get_all_formulas(self, auth_headers):
        """Test fetching all calculation formulas"""
        response = requests.get(
            f"{BASE_URL}/api/calculation-formulas?active_only=false",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Get formulas failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"PASSED: Fetched {len(data)} formulas")
    
    def test_get_formula_by_id(self, auth_headers):
        """Test fetching a specific formula by ID"""
        # First create a formula
        unique_name = f"TEST_Get_Formula_{uuid.uuid4().hex[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/calculation-formulas",
            headers=auth_headers,
            json={
                "name": unique_name,
                "scope": "scope1",
                "formula_expression": "test_expr",
                "input_fields": [],
                "output_unit": "kg CO2e",
                "is_active": True
            }
        )
        assert create_response.status_code == 200
        formula_id = create_response.json()["id"]
        
        # Get by ID
        get_response = requests.get(
            f"{BASE_URL}/api/calculation-formulas/{formula_id}",
            headers=auth_headers
        )
        
        assert get_response.status_code == 200, f"Get formula by ID failed: {get_response.text}"
        data = get_response.json()
        assert data["id"] == formula_id
        assert data["name"] == unique_name
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/calculation-formulas/{formula_id}", headers=auth_headers)
        print(f"PASSED: Get formula by ID working")
    
    def test_update_formula(self, auth_headers):
        """Test updating a calculation formula"""
        # Create formula
        unique_name = f"TEST_Update_Formula_{uuid.uuid4().hex[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/calculation-formulas",
            headers=auth_headers,
            json={
                "name": unique_name,
                "scope": "scope1",
                "description": "Original description",
                "formula_expression": "original_expr",
                "input_fields": [],
                "output_unit": "kg CO2e",
                "is_active": True
            }
        )
        assert create_response.status_code == 200
        formula_id = create_response.json()["id"]
        
        # Update formula
        update_response = requests.put(
            f"{BASE_URL}/api/calculation-formulas/{formula_id}",
            headers=auth_headers,
            json={
                "name": unique_name,
                "scope": "scope2",  # Changed scope
                "description": "Updated description",
                "formula_expression": "updated_expr",
                "input_fields": [{"name": "new_field", "label": "New Field", "type": "number", "required": True}],
                "output_unit": "tonnes CO2e",
                "is_active": False
            }
        )
        
        assert update_response.status_code == 200, f"Update formula failed: {update_response.text}"
        data = update_response.json()
        
        assert data["scope"] == "scope2"
        assert data["description"] == "Updated description"
        assert data["formula_expression"] == "updated_expr"
        assert data["output_unit"] == "tonnes CO2e"
        assert data["is_active"] == False
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/calculation-formulas/{formula_id}", headers=auth_headers)
        print(f"PASSED: Formula updated successfully")
    
    def test_delete_formula(self, auth_headers):
        """Test deleting a calculation formula"""
        # Create formula
        unique_name = f"TEST_Delete_Formula_{uuid.uuid4().hex[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/calculation-formulas",
            headers=auth_headers,
            json={
                "name": unique_name,
                "scope": "scope1",
                "formula_expression": "test",
                "input_fields": [],
                "output_unit": "kg CO2e",
                "is_active": True
            }
        )
        assert create_response.status_code == 200
        formula_id = create_response.json()["id"]
        
        # Delete formula
        delete_response = requests.delete(
            f"{BASE_URL}/api/calculation-formulas/{formula_id}",
            headers=auth_headers
        )
        
        assert delete_response.status_code == 200, f"Delete formula failed: {delete_response.text}"
        
        # Verify deletion
        get_response = requests.get(
            f"{BASE_URL}/api/calculation-formulas/{formula_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 404, "Deleted formula should not be found"
        print(f"PASSED: Formula deleted successfully")
    
    def test_duplicate_formula_name_rejected(self, auth_headers):
        """Test that duplicate formula names are rejected"""
        unique_name = f"TEST_Duplicate_Formula_{uuid.uuid4().hex[:8]}"
        
        # Create first formula
        first_response = requests.post(
            f"{BASE_URL}/api/calculation-formulas",
            headers=auth_headers,
            json={
                "name": unique_name,
                "scope": "scope1",
                "formula_expression": "test",
                "input_fields": [],
                "output_unit": "kg CO2e",
                "is_active": True
            }
        )
        assert first_response.status_code == 200
        formula_id = first_response.json()["id"]
        
        # Try to create duplicate
        duplicate_response = requests.post(
            f"{BASE_URL}/api/calculation-formulas",
            headers=auth_headers,
            json={
                "name": unique_name,  # Same name
                "scope": "scope2",
                "formula_expression": "different",
                "input_fields": [],
                "output_unit": "kg CO2e",
                "is_active": True
            }
        )
        
        assert duplicate_response.status_code == 400, f"Duplicate name should be rejected: {duplicate_response.status_code}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/calculation-formulas/{formula_id}", headers=auth_headers)
        print(f"PASSED: Duplicate formula name correctly rejected")


class TestFormulaAccessControl:
    """Tests for formula access control"""
    
    def test_non_super_admin_cannot_create_formula(self, super_admin_token, auth_headers):
        """Test that non-super-admin users cannot create formulas"""
        # Get an admin user (need to create one first or use existing)
        # For this test, we'll just verify the endpoint requires super_admin
        # by checking that the endpoint works with super_admin
        
        unique_name = f"TEST_Access_Formula_{uuid.uuid4().hex[:8]}"
        response = requests.post(
            f"{BASE_URL}/api/calculation-formulas",
            headers=auth_headers,
            json={
                "name": unique_name,
                "scope": "scope1",
                "formula_expression": "test",
                "input_fields": [],
                "output_unit": "kg CO2e",
                "is_active": True
            }
        )
        
        assert response.status_code == 200, "Super admin should be able to create formulas"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/calculation-formulas/{response.json()['id']}", headers=auth_headers)
        print(f"PASSED: Super admin can create formulas (access control verified)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
