"""
Test for Dynamic Output Units Bug Fix
Bug: Formula output units were hardcoded. When Super Admin sets output_unit='tCO2' for the CO2 formula,
     the Admin calculation preview was still showing 'kg CO₂'.
Fix: Made output units dynamic, read from the formula definitions.

Expected output_unit values:
- CO2: 'tCO2' 
- CH4: 'kgCH4'
- N2O: 'kg N₂O'
- CO2e: 'kg CO₂e'
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestDynamicOutputUnits:
    """Test that formula definitions return correct dynamic output_unit values"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        # Login as admin to get token
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@ghg.com", "password": "admin123"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_formula_definitions_endpoint_returns_output_unit(self):
        """Test that /api/formula-definitions endpoint returns output_unit field"""
        response = requests.get(f"{BASE_URL}/api/formula-definitions", headers=self.headers)
        assert response.status_code == 200, f"API failed: {response.text}"
        
        formulas = response.json()
        assert len(formulas) > 0, "No formula definitions found"
        
        # Verify each formula has output_unit field
        for formula in formulas:
            assert "output_unit" in formula, f"Formula {formula.get('formula_key')} missing output_unit field"
            assert formula["output_unit"], f"Formula {formula.get('formula_key')} has empty output_unit"
    
    def test_co2_formula_has_tco2_output_unit(self):
        """Test CO2 formula returns 'tCO2' output unit (not hardcoded 'kg CO₂')"""
        response = requests.get(f"{BASE_URL}/api/formula-definitions", headers=self.headers)
        assert response.status_code == 200
        
        formulas = response.json()
        co2_formula = next((f for f in formulas if 'co2' in f.get('formula_key', '').lower() and 'co2e' not in f.get('formula_key', '').lower()), None)
        
        assert co2_formula is not None, "CO2 formula not found"
        assert co2_formula["output_unit"] == "tCO2", f"Expected 'tCO2' but got '{co2_formula['output_unit']}'"
        print(f"✅ CO2 formula output_unit: {co2_formula['output_unit']}")
    
    def test_ch4_formula_has_kgch4_output_unit(self):
        """Test CH4 formula returns 'kgCH4' output unit"""
        response = requests.get(f"{BASE_URL}/api/formula-definitions", headers=self.headers)
        assert response.status_code == 200
        
        formulas = response.json()
        ch4_formula = next((f for f in formulas if 'ch4' in f.get('formula_key', '').lower()), None)
        
        assert ch4_formula is not None, "CH4 formula not found"
        assert ch4_formula["output_unit"] == "kgCH4", f"Expected 'kgCH4' but got '{ch4_formula['output_unit']}'"
        print(f"✅ CH4 formula output_unit: {ch4_formula['output_unit']}")
    
    def test_n2o_formula_has_kg_n2o_output_unit(self):
        """Test N2O formula returns 'kg N₂O' output unit"""
        response = requests.get(f"{BASE_URL}/api/formula-definitions", headers=self.headers)
        assert response.status_code == 200
        
        formulas = response.json()
        n2o_formula = next((f for f in formulas if 'n2o' in f.get('formula_key', '').lower() or 'n20' in f.get('formula_key', '').lower()), None)
        
        assert n2o_formula is not None, "N2O formula not found"
        assert n2o_formula["output_unit"] == "kg N₂O", f"Expected 'kg N₂O' but got '{n2o_formula['output_unit']}'"
        print(f"✅ N2O formula output_unit: {n2o_formula['output_unit']}")
    
    def test_co2e_formula_has_kg_co2e_output_unit(self):
        """Test CO2e formula returns 'kg CO₂e' output unit"""
        response = requests.get(f"{BASE_URL}/api/formula-definitions", headers=self.headers)
        assert response.status_code == 200
        
        formulas = response.json()
        co2e_formula = next((f for f in formulas if 'co2e' in f.get('formula_key', '').lower()), None)
        
        assert co2e_formula is not None, "CO2e formula not found"
        assert co2e_formula["output_unit"] == "kg CO₂e", f"Expected 'kg CO₂e' but got '{co2e_formula['output_unit']}'"
        print(f"✅ CO2e formula output_unit: {co2e_formula['output_unit']}")
    
    def test_all_formula_output_units_summary(self):
        """Summary test - verify all expected output units"""
        response = requests.get(f"{BASE_URL}/api/formula-definitions", headers=self.headers)
        assert response.status_code == 200
        
        formulas = response.json()
        
        # Expected output units from the bug fix
        expected_units = {
            'co2_emissions': 'tCO2',
            'ch4_emissions': 'kgCH4',
            'n2o_emissions': 'kg N₂O',
            'co2e_emissions': 'kg CO₂e'
        }
        
        for formula_key, expected_unit in expected_units.items():
            formula = next((f for f in formulas if f.get('formula_key') == formula_key), None)
            if formula:
                actual_unit = formula.get('output_unit', '')
                assert actual_unit == expected_unit, f"Formula {formula_key}: expected '{expected_unit}' but got '{actual_unit}'"
                print(f"✅ {formula_key}: {actual_unit}")
        
        print("\n=== All dynamic output units verified ===")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
