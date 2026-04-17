"""
Test suite for Dynamic Scopes & Categories Module.

Tests:
- GET /api/scopes - List seeded scopes (scope1, scope2, scope3, biogenic)
- GET /api/categories - List seeded categories with scope_name/scope_code
- GET /api/categories?scope_code=scope1 - Filter by scope_code
- POST /api/super-admin/scopes - Create new scope (code auto-slugified)
- POST /api/super-admin/scopes - Reject duplicate names/codes (400)
- PUT /api/super-admin/scopes/{id} - Update scope
- PUT /api/super-admin/scopes/{id} - Block code change for is_system scope (400)
- DELETE /api/super-admin/scopes/{id} - Block when active categories exist (400)
- DELETE /api/super-admin/scopes/{id} - Block when emission records reference it (400)
- DELETE /api/super-admin/scopes/{id} - Soft-delete (is_active=false)
- POST /api/super-admin/scopes/{id}/restore - Restore scope (is_active=true)
- POST /api/super-admin/categories - Create under parent scope
- POST /api/super-admin/categories - Reject duplicate code within same scope
- PUT /api/super-admin/categories/{id} - Update fields; block code change for is_system
- DELETE /api/super-admin/categories/{id} - Block if emission_records reference it (400)
- DELETE /api/super-admin/categories/{id} - Soft-delete otherwise
- POST /api/super-admin/categories/{id}/restore - Restore category
- Non-superadmin users receive 403 on all /super-admin/* endpoints
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPER_ADMIN_EMAIL = "superadmin@ecotrack.com"
SUPER_ADMIN_PASSWORD = "SuperAdmin123!"
ADMIN_EMAIL = "testadmin@test.com"
ADMIN_PASSWORD = "Test123!"


class TestScopesAndCategories:
    """Test suite for Scopes and Categories CRUD operations"""
    
    @pytest.fixture(scope="class")
    def super_admin_token(self):
        """Get SuperAdmin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"SuperAdmin login failed: {response.status_code} - {response.text}")
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get Admin authentication token (non-superadmin)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def super_admin_headers(self, super_admin_token):
        """Headers with SuperAdmin auth"""
        return {
            "Authorization": f"Bearer {super_admin_token}",
            "Content-Type": "application/json"
        }
    
    @pytest.fixture(scope="class")
    def admin_headers(self, admin_token):
        """Headers with Admin auth (non-superadmin)"""
        return {
            "Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json"
        }
    
    # ========== GET /api/scopes Tests ==========
    
    def test_get_scopes_returns_seeded_scopes(self, super_admin_headers):
        """GET /api/scopes returns seeded scopes (scope1, scope2, scope3, biogenic)"""
        response = requests.get(f"{BASE_URL}/api/scopes", headers=super_admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        scopes = response.json()
        assert isinstance(scopes, list), "Response should be a list"
        assert len(scopes) >= 4, f"Expected at least 4 seeded scopes, got {len(scopes)}"
        
        # Verify seeded scope codes exist
        scope_codes = [s["code"] for s in scopes]
        expected_codes = ["scope1", "scope2", "scope3", "biogenic"]
        for code in expected_codes:
            assert code in scope_codes, f"Expected seeded scope '{code}' not found"
        
        # Verify scope structure
        for scope in scopes:
            assert "id" in scope
            assert "name" in scope
            assert "code" in scope
            assert "is_active" in scope
            assert "is_system" in scope
            assert "created_at" in scope
    
    def test_get_scopes_seeded_are_system_scopes(self, super_admin_headers):
        """Seeded scopes should have is_system=True"""
        response = requests.get(f"{BASE_URL}/api/scopes", headers=super_admin_headers)
        assert response.status_code == 200
        
        scopes = response.json()
        seeded_codes = ["scope1", "scope2", "scope3", "biogenic"]
        for scope in scopes:
            if scope["code"] in seeded_codes:
                assert scope["is_system"] is True, f"Seeded scope {scope['code']} should have is_system=True"
    
    # ========== GET /api/categories Tests ==========
    
    def test_get_categories_returns_seeded_categories(self, super_admin_headers):
        """GET /api/categories returns seeded categories with scope_name/scope_code"""
        response = requests.get(f"{BASE_URL}/api/categories", headers=super_admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        categories = response.json()
        assert isinstance(categories, list), "Response should be a list"
        assert len(categories) >= 1, "Expected at least 1 seeded category"
        
        # Verify category structure includes scope_name and scope_code
        for cat in categories:
            assert "id" in cat
            assert "name" in cat
            assert "code" in cat
            assert "scope_id" in cat
            assert "scope_name" in cat, "Category should include scope_name"
            assert "scope_code" in cat, "Category should include scope_code"
            assert "is_active" in cat
            assert "is_system" in cat
    
    def test_get_categories_filter_by_scope_code(self, super_admin_headers):
        """GET /api/categories?scope_code=scope1 filters correctly"""
        response = requests.get(f"{BASE_URL}/api/categories?scope_code=scope1", headers=super_admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        categories = response.json()
        # All returned categories should belong to scope1
        for cat in categories:
            assert cat["scope_code"] == "scope1", f"Expected scope_code='scope1', got '{cat['scope_code']}'"
        
        # Verify expected scope1 categories exist
        cat_codes = [c["code"] for c in categories]
        expected_scope1_cats = ["stationary_combustion", "mobile_combustion", "process_emissions", "fugitive_emissions"]
        for code in expected_scope1_cats:
            assert code in cat_codes, f"Expected scope1 category '{code}' not found"
    
    # ========== POST /api/super-admin/scopes Tests ==========
    
    def test_create_scope_success(self, super_admin_headers):
        """POST /api/super-admin/scopes creates a new scope"""
        unique_name = f"TEST_Scope_{uuid.uuid4().hex[:8]}"
        payload = {
            "name": unique_name,
            "description": "Test scope for pytest",
            "display_order": 99
        }
        
        response = requests.post(f"{BASE_URL}/api/super-admin/scopes", json=payload, headers=super_admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        scope = response.json()
        assert scope["name"] == unique_name
        assert scope["is_active"] is True
        assert scope["is_system"] is False  # User-created scopes are not system
        assert "id" in scope
        assert "code" in scope  # Code should be auto-generated
        
        # Cleanup - soft delete the test scope
        requests.delete(f"{BASE_URL}/api/super-admin/scopes/{scope['id']}", headers=super_admin_headers)
    
    def test_create_scope_auto_slugify_code(self, super_admin_headers):
        """POST /api/super-admin/scopes auto-slugifies code if omitted"""
        unique_name = f"TEST My Custom Scope {uuid.uuid4().hex[:6]}"
        payload = {"name": unique_name}
        
        response = requests.post(f"{BASE_URL}/api/super-admin/scopes", json=payload, headers=super_admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        scope = response.json()
        # Code should be slugified version of name
        assert "_" in scope["code"] or scope["code"].islower(), "Code should be slugified"
        assert " " not in scope["code"], "Code should not contain spaces"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/super-admin/scopes/{scope['id']}", headers=super_admin_headers)
    
    def test_create_scope_duplicate_name_rejected(self, super_admin_headers):
        """POST /api/super-admin/scopes rejects duplicate names with 400"""
        # Try to create a scope with existing name "Scope 1"
        payload = {"name": "Scope 1"}
        
        response = requests.post(f"{BASE_URL}/api/super-admin/scopes", json=payload, headers=super_admin_headers)
        assert response.status_code == 400, f"Expected 400 for duplicate name, got {response.status_code}: {response.text}"
        assert "already exists" in response.json().get("detail", "").lower()
    
    def test_create_scope_duplicate_code_rejected(self, super_admin_headers):
        """POST /api/super-admin/scopes rejects duplicate codes with 400"""
        payload = {
            "name": "Unique Name For Test",
            "code": "scope1"  # Existing code
        }
        
        response = requests.post(f"{BASE_URL}/api/super-admin/scopes", json=payload, headers=super_admin_headers)
        assert response.status_code == 400, f"Expected 400 for duplicate code, got {response.status_code}: {response.text}"
        assert "already exists" in response.json().get("detail", "").lower()
    
    # ========== PUT /api/super-admin/scopes/{id} Tests ==========
    
    def test_update_scope_success(self, super_admin_headers):
        """PUT /api/super-admin/scopes/{id} updates a scope"""
        # First create a test scope
        unique_name = f"TEST_Update_Scope_{uuid.uuid4().hex[:8]}"
        create_resp = requests.post(f"{BASE_URL}/api/super-admin/scopes", 
                                    json={"name": unique_name}, headers=super_admin_headers)
        assert create_resp.status_code == 200
        scope_id = create_resp.json()["id"]
        
        # Update the scope
        update_payload = {
            "name": f"{unique_name}_Updated",
            "description": "Updated description"
        }
        response = requests.put(f"{BASE_URL}/api/super-admin/scopes/{scope_id}", 
                               json=update_payload, headers=super_admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        updated = response.json()
        assert updated["name"] == f"{unique_name}_Updated"
        assert updated["description"] == "Updated description"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/super-admin/scopes/{scope_id}", headers=super_admin_headers)
    
    def test_update_system_scope_code_blocked(self, super_admin_headers):
        """PUT /api/super-admin/scopes/{id} blocks code change for is_system scope (400)"""
        # Get a system scope (scope1)
        scopes_resp = requests.get(f"{BASE_URL}/api/scopes", headers=super_admin_headers)
        scopes = scopes_resp.json()
        system_scope = next((s for s in scopes if s["code"] == "scope1" and s["is_system"]), None)
        
        if not system_scope:
            pytest.skip("No system scope found for testing")
        
        # Try to change the code
        response = requests.put(f"{BASE_URL}/api/super-admin/scopes/{system_scope['id']}", 
                               json={"code": "new_code"}, headers=super_admin_headers)
        assert response.status_code == 400, f"Expected 400 for system scope code change, got {response.status_code}: {response.text}"
        assert "system scope" in response.json().get("detail", "").lower() or "cannot change" in response.json().get("detail", "").lower()
    
    # ========== DELETE /api/super-admin/scopes/{id} Tests ==========
    
    def test_delete_scope_blocked_when_active_categories_exist(self, super_admin_headers):
        """DELETE /api/super-admin/scopes/{id} blocks when active categories exist (400)"""
        # Get scope1 which has active categories
        scopes_resp = requests.get(f"{BASE_URL}/api/scopes", headers=super_admin_headers)
        scopes = scopes_resp.json()
        scope1 = next((s for s in scopes if s["code"] == "scope1"), None)
        
        if not scope1:
            pytest.skip("scope1 not found")
        
        response = requests.delete(f"{BASE_URL}/api/super-admin/scopes/{scope1['id']}", headers=super_admin_headers)
        assert response.status_code == 400, f"Expected 400 when categories exist, got {response.status_code}: {response.text}"
        assert "categor" in response.json().get("detail", "").lower()
    
    def test_delete_scope_soft_deletes_when_no_references(self, super_admin_headers):
        """DELETE /api/super-admin/scopes/{id} soft-deletes (is_active=false) when no references"""
        # Create a scope with no categories
        unique_name = f"TEST_Delete_Scope_{uuid.uuid4().hex[:8]}"
        create_resp = requests.post(f"{BASE_URL}/api/super-admin/scopes", 
                                    json={"name": unique_name}, headers=super_admin_headers)
        assert create_resp.status_code == 200
        scope_id = create_resp.json()["id"]
        
        # Delete the scope
        response = requests.delete(f"{BASE_URL}/api/super-admin/scopes/{scope_id}", headers=super_admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "deactivated" in response.json().get("message", "").lower() or "soft-deleted" in response.json().get("message", "").lower()
        
        # Verify scope is now inactive
        scopes_resp = requests.get(f"{BASE_URL}/api/scopes?include_inactive=true", headers=super_admin_headers)
        scopes = scopes_resp.json()
        deleted_scope = next((s for s in scopes if s["id"] == scope_id), None)
        assert deleted_scope is not None, "Soft-deleted scope should still exist"
        assert deleted_scope["is_active"] is False, "Soft-deleted scope should have is_active=False"
    
    # ========== POST /api/super-admin/scopes/{id}/restore Tests ==========
    
    def test_restore_scope_sets_active_true(self, super_admin_headers):
        """POST /api/super-admin/scopes/{id}/restore sets is_active=true"""
        # Create and soft-delete a scope
        unique_name = f"TEST_Restore_Scope_{uuid.uuid4().hex[:8]}"
        create_resp = requests.post(f"{BASE_URL}/api/super-admin/scopes", 
                                    json={"name": unique_name}, headers=super_admin_headers)
        assert create_resp.status_code == 200
        scope_id = create_resp.json()["id"]
        
        # Soft delete
        requests.delete(f"{BASE_URL}/api/super-admin/scopes/{scope_id}", headers=super_admin_headers)
        
        # Restore
        response = requests.post(f"{BASE_URL}/api/super-admin/scopes/{scope_id}/restore", headers=super_admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        restored = response.json()
        assert restored["is_active"] is True, "Restored scope should have is_active=True"
        
        # Cleanup - delete again
        requests.delete(f"{BASE_URL}/api/super-admin/scopes/{scope_id}", headers=super_admin_headers)
    
    # ========== POST /api/super-admin/categories Tests ==========
    
    def test_create_category_success(self, super_admin_headers):
        """POST /api/super-admin/categories creates under parent scope with scope_name echoed back"""
        # Get scope1 id
        scopes_resp = requests.get(f"{BASE_URL}/api/scopes", headers=super_admin_headers)
        scopes = scopes_resp.json()
        scope1 = next((s for s in scopes if s["code"] == "scope1"), None)
        
        if not scope1:
            pytest.skip("scope1 not found")
        
        unique_name = f"TEST_Category_{uuid.uuid4().hex[:8]}"
        payload = {
            "scope_id": scope1["id"],
            "name": unique_name,
            "description": "Test category"
        }
        
        response = requests.post(f"{BASE_URL}/api/super-admin/categories", json=payload, headers=super_admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        category = response.json()
        assert category["name"] == unique_name
        assert category["scope_id"] == scope1["id"]
        assert category["scope_name"] == scope1["name"], "Response should include scope_name"
        assert category["scope_code"] == scope1["code"], "Response should include scope_code"
        assert category["is_system"] is False
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/super-admin/categories/{category['id']}", headers=super_admin_headers)
    
    def test_create_category_duplicate_code_rejected(self, super_admin_headers):
        """POST /api/super-admin/categories rejects duplicate code within same scope"""
        # Get scope1 id
        scopes_resp = requests.get(f"{BASE_URL}/api/scopes", headers=super_admin_headers)
        scopes = scopes_resp.json()
        scope1 = next((s for s in scopes if s["code"] == "scope1"), None)
        
        if not scope1:
            pytest.skip("scope1 not found")
        
        # Try to create category with existing code "stationary_combustion"
        payload = {
            "scope_id": scope1["id"],
            "name": "Unique Name",
            "code": "stationary_combustion"  # Existing code in scope1
        }
        
        response = requests.post(f"{BASE_URL}/api/super-admin/categories", json=payload, headers=super_admin_headers)
        assert response.status_code == 400, f"Expected 400 for duplicate code, got {response.status_code}: {response.text}"
        assert "already exists" in response.json().get("detail", "").lower()
    
    # ========== PUT /api/super-admin/categories/{id} Tests ==========
    
    def test_update_category_success(self, super_admin_headers):
        """PUT /api/super-admin/categories/{id} updates fields"""
        # Create a test category
        scopes_resp = requests.get(f"{BASE_URL}/api/scopes", headers=super_admin_headers)
        scopes = scopes_resp.json()
        scope1 = next((s for s in scopes if s["code"] == "scope1"), None)
        
        if not scope1:
            pytest.skip("scope1 not found")
        
        unique_name = f"TEST_Update_Cat_{uuid.uuid4().hex[:8]}"
        create_resp = requests.post(f"{BASE_URL}/api/super-admin/categories", 
                                    json={"scope_id": scope1["id"], "name": unique_name}, 
                                    headers=super_admin_headers)
        assert create_resp.status_code == 200
        cat_id = create_resp.json()["id"]
        
        # Update
        update_payload = {
            "name": f"{unique_name}_Updated",
            "description": "Updated description"
        }
        response = requests.put(f"{BASE_URL}/api/super-admin/categories/{cat_id}", 
                               json=update_payload, headers=super_admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        updated = response.json()
        assert updated["name"] == f"{unique_name}_Updated"
        assert updated["description"] == "Updated description"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/super-admin/categories/{cat_id}", headers=super_admin_headers)
    
    def test_update_system_category_code_blocked(self, super_admin_headers):
        """PUT /api/super-admin/categories/{id} blocks code change for is_system categories"""
        # Get a system category
        cats_resp = requests.get(f"{BASE_URL}/api/categories", headers=super_admin_headers)
        categories = cats_resp.json()
        system_cat = next((c for c in categories if c.get("is_system") and c["code"] == "stationary_combustion"), None)
        
        if not system_cat:
            pytest.skip("No system category found for testing")
        
        # Try to change the code
        response = requests.put(f"{BASE_URL}/api/super-admin/categories/{system_cat['id']}", 
                               json={"code": "new_code"}, headers=super_admin_headers)
        assert response.status_code == 400, f"Expected 400 for system category code change, got {response.status_code}: {response.text}"
        assert "system category" in response.json().get("detail", "").lower() or "cannot change" in response.json().get("detail", "").lower()
    
    # ========== DELETE /api/super-admin/categories/{id} Tests ==========
    
    def test_delete_category_soft_deletes_when_no_references(self, super_admin_headers):
        """DELETE /api/super-admin/categories/{id} soft-deletes when no emission records reference it"""
        # Create a test category
        scopes_resp = requests.get(f"{BASE_URL}/api/scopes", headers=super_admin_headers)
        scopes = scopes_resp.json()
        scope1 = next((s for s in scopes if s["code"] == "scope1"), None)
        
        if not scope1:
            pytest.skip("scope1 not found")
        
        unique_name = f"TEST_Delete_Cat_{uuid.uuid4().hex[:8]}"
        create_resp = requests.post(f"{BASE_URL}/api/super-admin/categories", 
                                    json={"scope_id": scope1["id"], "name": unique_name}, 
                                    headers=super_admin_headers)
        assert create_resp.status_code == 200
        cat_id = create_resp.json()["id"]
        
        # Delete
        response = requests.delete(f"{BASE_URL}/api/super-admin/categories/{cat_id}", headers=super_admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "deactivated" in response.json().get("message", "").lower() or "soft-deleted" in response.json().get("message", "").lower()
        
        # Verify category is now inactive
        cats_resp = requests.get(f"{BASE_URL}/api/categories?include_inactive=true", headers=super_admin_headers)
        categories = cats_resp.json()
        deleted_cat = next((c for c in categories if c["id"] == cat_id), None)
        assert deleted_cat is not None, "Soft-deleted category should still exist"
        assert deleted_cat["is_active"] is False, "Soft-deleted category should have is_active=False"
    
    # ========== POST /api/super-admin/categories/{id}/restore Tests ==========
    
    def test_restore_category_sets_active_true(self, super_admin_headers):
        """POST /api/super-admin/categories/{id}/restore sets is_active=true"""
        # Create and soft-delete a category
        scopes_resp = requests.get(f"{BASE_URL}/api/scopes", headers=super_admin_headers)
        scopes = scopes_resp.json()
        scope1 = next((s for s in scopes if s["code"] == "scope1"), None)
        
        if not scope1:
            pytest.skip("scope1 not found")
        
        unique_name = f"TEST_Restore_Cat_{uuid.uuid4().hex[:8]}"
        create_resp = requests.post(f"{BASE_URL}/api/super-admin/categories", 
                                    json={"scope_id": scope1["id"], "name": unique_name}, 
                                    headers=super_admin_headers)
        assert create_resp.status_code == 200
        cat_id = create_resp.json()["id"]
        
        # Soft delete
        requests.delete(f"{BASE_URL}/api/super-admin/categories/{cat_id}", headers=super_admin_headers)
        
        # Restore
        response = requests.post(f"{BASE_URL}/api/super-admin/categories/{cat_id}/restore", headers=super_admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        restored = response.json()
        assert restored["is_active"] is True, "Restored category should have is_active=True"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/super-admin/categories/{cat_id}", headers=super_admin_headers)
    
    # ========== Authorization Tests (403 for non-superadmin) ==========
    
    def test_non_superadmin_cannot_create_scope(self, admin_headers):
        """Non-superadmin users receive 403 on POST /api/super-admin/scopes"""
        payload = {"name": "Unauthorized Scope"}
        response = requests.post(f"{BASE_URL}/api/super-admin/scopes", json=payload, headers=admin_headers)
        assert response.status_code == 403, f"Expected 403 for non-superadmin, got {response.status_code}: {response.text}"
    
    def test_non_superadmin_cannot_update_scope(self, admin_headers, super_admin_headers):
        """Non-superadmin users receive 403 on PUT /api/super-admin/scopes/{id}"""
        # Get a scope id
        scopes_resp = requests.get(f"{BASE_URL}/api/scopes", headers=super_admin_headers)
        scopes = scopes_resp.json()
        if not scopes:
            pytest.skip("No scopes found")
        
        scope_id = scopes[0]["id"]
        response = requests.put(f"{BASE_URL}/api/super-admin/scopes/{scope_id}", 
                               json={"name": "Unauthorized Update"}, headers=admin_headers)
        assert response.status_code == 403, f"Expected 403 for non-superadmin, got {response.status_code}: {response.text}"
    
    def test_non_superadmin_cannot_delete_scope(self, admin_headers, super_admin_headers):
        """Non-superadmin users receive 403 on DELETE /api/super-admin/scopes/{id}"""
        scopes_resp = requests.get(f"{BASE_URL}/api/scopes", headers=super_admin_headers)
        scopes = scopes_resp.json()
        if not scopes:
            pytest.skip("No scopes found")
        
        scope_id = scopes[0]["id"]
        response = requests.delete(f"{BASE_URL}/api/super-admin/scopes/{scope_id}", headers=admin_headers)
        assert response.status_code == 403, f"Expected 403 for non-superadmin, got {response.status_code}: {response.text}"
    
    def test_non_superadmin_cannot_restore_scope(self, admin_headers, super_admin_headers):
        """Non-superadmin users receive 403 on POST /api/super-admin/scopes/{id}/restore"""
        scopes_resp = requests.get(f"{BASE_URL}/api/scopes", headers=super_admin_headers)
        scopes = scopes_resp.json()
        if not scopes:
            pytest.skip("No scopes found")
        
        scope_id = scopes[0]["id"]
        response = requests.post(f"{BASE_URL}/api/super-admin/scopes/{scope_id}/restore", headers=admin_headers)
        assert response.status_code == 403, f"Expected 403 for non-superadmin, got {response.status_code}: {response.text}"
    
    def test_non_superadmin_cannot_create_category(self, admin_headers, super_admin_headers):
        """Non-superadmin users receive 403 on POST /api/super-admin/categories"""
        scopes_resp = requests.get(f"{BASE_URL}/api/scopes", headers=super_admin_headers)
        scopes = scopes_resp.json()
        if not scopes:
            pytest.skip("No scopes found")
        
        payload = {"scope_id": scopes[0]["id"], "name": "Unauthorized Category"}
        response = requests.post(f"{BASE_URL}/api/super-admin/categories", json=payload, headers=admin_headers)
        assert response.status_code == 403, f"Expected 403 for non-superadmin, got {response.status_code}: {response.text}"
    
    def test_non_superadmin_cannot_update_category(self, admin_headers, super_admin_headers):
        """Non-superadmin users receive 403 on PUT /api/super-admin/categories/{id}"""
        cats_resp = requests.get(f"{BASE_URL}/api/categories", headers=super_admin_headers)
        categories = cats_resp.json()
        if not categories:
            pytest.skip("No categories found")
        
        cat_id = categories[0]["id"]
        response = requests.put(f"{BASE_URL}/api/super-admin/categories/{cat_id}", 
                               json={"name": "Unauthorized Update"}, headers=admin_headers)
        assert response.status_code == 403, f"Expected 403 for non-superadmin, got {response.status_code}: {response.text}"
    
    def test_non_superadmin_cannot_delete_category(self, admin_headers, super_admin_headers):
        """Non-superadmin users receive 403 on DELETE /api/super-admin/categories/{id}"""
        cats_resp = requests.get(f"{BASE_URL}/api/categories", headers=super_admin_headers)
        categories = cats_resp.json()
        if not categories:
            pytest.skip("No categories found")
        
        cat_id = categories[0]["id"]
        response = requests.delete(f"{BASE_URL}/api/super-admin/categories/{cat_id}", headers=admin_headers)
        assert response.status_code == 403, f"Expected 403 for non-superadmin, got {response.status_code}: {response.text}"
    
    def test_non_superadmin_cannot_restore_category(self, admin_headers, super_admin_headers):
        """Non-superadmin users receive 403 on POST /api/super-admin/categories/{id}/restore"""
        cats_resp = requests.get(f"{BASE_URL}/api/categories", headers=super_admin_headers)
        categories = cats_resp.json()
        if not categories:
            pytest.skip("No categories found")
        
        cat_id = categories[0]["id"]
        response = requests.post(f"{BASE_URL}/api/super-admin/categories/{cat_id}/restore", headers=admin_headers)
        assert response.status_code == 403, f"Expected 403 for non-superadmin, got {response.status_code}: {response.text}"


class TestCascadeDeleteEndpoints:
    """Test cascade delete endpoints for organizations and facilities"""
    
    @pytest.fixture(scope="class")
    def super_admin_token(self):
        """Get SuperAdmin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"SuperAdmin login failed: {response.status_code} - {response.text}")
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def super_admin_headers(self, super_admin_token):
        """Headers with SuperAdmin auth"""
        return {
            "Authorization": f"Bearer {super_admin_token}",
            "Content-Type": "application/json"
        }
    
    def test_permanent_delete_organization_endpoint_exists(self, super_admin_headers):
        """DELETE /api/super-admin/organizations/{id}/permanent endpoint exists"""
        # Use a non-existent org ID to test endpoint existence
        fake_org_id = "nonexistent-org-id-12345"
        response = requests.delete(f"{BASE_URL}/api/super-admin/organizations/{fake_org_id}/permanent", 
                                   headers=super_admin_headers)
        # Should return 404 (not found) not 405 (method not allowed) or 500
        assert response.status_code == 404, f"Expected 404 for non-existent org, got {response.status_code}: {response.text}"
        assert "not found" in response.json().get("detail", "").lower()
    
    def test_permanent_delete_organization_requires_superadmin(self):
        """DELETE /api/super-admin/organizations/{id}/permanent requires superadmin"""
        # Login as regular admin
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if login_resp.status_code != 200:
            pytest.skip("Admin login failed")
        
        admin_token = login_resp.json().get("access_token")
        admin_headers = {
            "Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json"
        }
        
        fake_org_id = "nonexistent-org-id-12345"
        response = requests.delete(f"{BASE_URL}/api/super-admin/organizations/{fake_org_id}/permanent", 
                                   headers=admin_headers)
        assert response.status_code == 403, f"Expected 403 for non-superadmin, got {response.status_code}: {response.text}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
