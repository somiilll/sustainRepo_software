"""
Test file for verifying:
1. N2O formula detection (formula_key was fixed from 'n20_emissions' to 'n2o_emissions')
2. CO2e formula detection (new formula 'co2e_emissions' was created)
3. Formula applicable_scopes field support in backend API
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestFormulaFixes:
    """Tests for N2O and CO2e formula fixes and applicable_scopes feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get authentication token for Super Admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@ecotrack.com",
            "password": "SuperAdmin123!"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_n2o_formula_key_is_correct(self):
        """Verify N2O formula has correct key 'n2o_emissions' not 'n20_emissions'"""
        response = requests.get(f"{BASE_URL}/api/formula-definitions", headers=self.headers)
        assert response.status_code == 200
        
        formulas = response.json()
        n2o_formulas = [f for f in formulas if 'n2o' in f.get('formula_key', '').lower()]
        
        # Should find N2O formula
        assert len(n2o_formulas) > 0, "N2O formula not found"
        
        # Check it has correct key (not n20)
        n2o_formula = n2o_formulas[0]
        assert n2o_formula['formula_key'] == 'n2o_emissions', f"N2O formula key is '{n2o_formula['formula_key']}', expected 'n2o_emissions'"
        assert n2o_formula['is_active'] == True, "N2O formula should be active"
        print(f"✓ N2O formula found with correct key: {n2o_formula['formula_key']}")
    
    def test_co2e_formula_exists(self):
        """Verify CO2e formula exists with key 'co2e_emissions'"""
        response = requests.get(f"{BASE_URL}/api/formula-definitions", headers=self.headers)
        assert response.status_code == 200
        
        formulas = response.json()
        co2e_formulas = [f for f in formulas if 'co2e' in f.get('formula_key', '').lower()]
        
        # Should find CO2e formula
        assert len(co2e_formulas) > 0, "CO2e formula not found"
        
        co2e_formula = co2e_formulas[0]
        assert co2e_formula['formula_key'] == 'co2e_emissions', f"CO2e formula key is '{co2e_formula['formula_key']}', expected 'co2e_emissions'"
        assert co2e_formula['is_active'] == True, "CO2e formula should be active"
        print(f"✓ CO2e formula found with correct key: {co2e_formula['formula_key']}")
    
    def test_applicable_scopes_field_in_response(self):
        """Verify formula response includes applicable_scopes field"""
        response = requests.get(f"{BASE_URL}/api/formula-definitions", headers=self.headers)
        assert response.status_code == 200
        
        formulas = response.json()
        
        # Find N2O formula - should have Scope 1 only
        n2o_formulas = [f for f in formulas if f.get('formula_key') == 'n2o_emissions']
        if n2o_formulas:
            n2o = n2o_formulas[0]
            scopes = n2o.get('applicable_scopes', [])
            assert scopes is not None, "applicable_scopes field missing"
            assert 'Scope 1' in scopes, f"N2O formula should have 'Scope 1', got {scopes}"
            print(f"✓ N2O formula applicable_scopes: {scopes}")
        
        # Find CO2e formula - should have all scopes
        co2e_formulas = [f for f in formulas if f.get('formula_key') == 'co2e_emissions']
        if co2e_formulas:
            co2e = co2e_formulas[0]
            scopes = co2e.get('applicable_scopes', [])
            assert scopes is not None, "applicable_scopes field missing"
            assert 'Scope 1' in scopes, f"CO2e formula should have 'Scope 1'"
            assert 'Scope 2' in scopes, f"CO2e formula should have 'Scope 2'"
            assert 'Biogenic' in scopes, f"CO2e formula should have 'Biogenic'"
            print(f"✓ CO2e formula applicable_scopes: {scopes}")
    
    def test_formula_creation_with_scopes(self):
        """Test creating a new formula with applicable_scopes"""
        import uuid
        test_key = f"test_formula_{uuid.uuid4().hex[:8]}"
        
        payload = {
            "formula_name": "Test Formula with Scopes",
            "formula_key": test_key,
            "description": "Test formula for scope testing",
            "output_name": "Test Output",
            "output_unit": "kg",
            "components": [{"parameter_key": "quantity", "parameter_name": "Quantity", "operation": "base"}],
            "formula_expression": "Quantity",
            "applicable_scopes": ["Scope 1", "Biogenic"],
            "is_active": True,
            "display_order": 99
        }
        
        # Create formula
        response = requests.post(f"{BASE_URL}/api/super-admin/formula-definitions", 
                                headers=self.headers, json=payload)
        assert response.status_code == 200, f"Failed to create formula: {response.text}"
        
        created = response.json()
        assert created['applicable_scopes'] == ["Scope 1", "Biogenic"], \
            f"Expected scopes ['Scope 1', 'Biogenic'], got {created.get('applicable_scopes')}"
        
        # Cleanup - delete the test formula
        formula_id = created['id']
        delete_response = requests.delete(f"{BASE_URL}/api/super-admin/formula-definitions/{formula_id}", 
                                          headers=self.headers)
        assert delete_response.status_code == 200, f"Failed to cleanup: {delete_response.text}"
        print(f"✓ Formula created and deleted with applicable_scopes: ['Scope 1', 'Biogenic']")
    
    def test_formula_update_with_scopes(self):
        """Test updating formula applicable_scopes"""
        import uuid
        test_key = f"test_update_{uuid.uuid4().hex[:8]}"
        
        # First create a formula
        payload = {
            "formula_name": "Update Test Formula",
            "formula_key": test_key,
            "description": "For update testing",
            "output_name": "Output",
            "output_unit": "kg",
            "components": [{"parameter_key": "quantity", "parameter_name": "Quantity", "operation": "base"}],
            "formula_expression": "Quantity",
            "applicable_scopes": ["Scope 2"],
            "is_active": True
        }
        
        create_response = requests.post(f"{BASE_URL}/api/super-admin/formula-definitions", 
                                        headers=self.headers, json=payload)
        assert create_response.status_code == 200
        formula_id = create_response.json()['id']
        
        # Update scopes
        payload['applicable_scopes'] = ["Scope 1", "Scope 2", "Biogenic"]
        update_response = requests.put(f"{BASE_URL}/api/super-admin/formula-definitions/{formula_id}", 
                                       headers=self.headers, json=payload)
        assert update_response.status_code == 200
        
        updated = update_response.json()
        assert updated['applicable_scopes'] == ["Scope 1", "Scope 2", "Biogenic"], \
            f"Expected all scopes, got {updated.get('applicable_scopes')}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/super-admin/formula-definitions/{formula_id}", headers=self.headers)
        print(f"✓ Formula scopes updated successfully")
    
    def test_all_four_formulas_exist_and_active(self):
        """Verify all 4 core emission formulas exist: CO2, CH4, N2O, CO2e"""
        response = requests.get(f"{BASE_URL}/api/formula-definitions", headers=self.headers)
        assert response.status_code == 200
        
        formulas = response.json()
        formula_keys = [f.get('formula_key') for f in formulas]
        
        expected_formulas = ['co2_emissions', 'ch4_emissions', 'n2o_emissions', 'co2e_emissions']
        
        for expected in expected_formulas:
            assert expected in formula_keys, f"Formula '{expected}' not found. Available: {formula_keys}"
        
        # Check all are active
        for f in formulas:
            if f.get('formula_key') in expected_formulas:
                assert f.get('is_active') == True, f"Formula {f.get('formula_key')} should be active"
        
        print(f"✓ All 4 core formulas exist and are active: {expected_formulas}")

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
