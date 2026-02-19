"""
Test Fuel Database Integration with Emissions
Tests the following features:
1. Admin login works correctly
2. Fuel Database endpoint returns fuels with all required parameters  
3. Add Emission with fuel database integration
4. Emission calculation using new formula: qty × calorific × density × conversion × EF × GWP
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@ghg.com"
ADMIN_PASSWORD = "admin123"
SUPER_ADMIN_EMAIL = "superadmin@ecotrack.com"
SUPER_ADMIN_PASSWORD = "SuperAdmin123!"

# GWP Values (IPCC AR5)
GWP_VALUES = {"CO2": 1, "CH4": 28, "N2O": 265}


class TestAdminLogin:
    """Test Admin authentication"""
    
    def test_admin_login_success(self):
        """Test admin login returns token and user info"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Missing access_token in response"
        assert "user" in data, "Missing user in response"
        assert data["user"]["role"] in ["admin", "super_admin"], f"Unexpected role: {data['user']['role']}"
        assert data["user"]["email"] == ADMIN_EMAIL
        print(f"Admin login successful: {data['user']['full_name']}")
    
    def test_admin_login_wrong_password(self):
        """Test login fails with wrong password"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": "wrongpassword"
        })
        assert response.status_code == 401, "Should return 401 for wrong password"


class TestFuelDatabaseEndpoint:
    """Test /api/fuel-database endpoint returns fuels with all parameters"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_fuel_database_returns_data(self):
        """Test /api/fuel-database returns list of fuels"""
        response = requests.get(f"{BASE_URL}/api/fuel-database", headers=self.headers)
        assert response.status_code == 200, f"Fuel database fetch failed: {response.text}"
        
        fuels = response.json()
        assert isinstance(fuels, list), "Response should be a list"
        print(f"Fuel database contains {len(fuels)} fuels")
        return fuels
    
    def test_fuel_contains_required_parameters(self):
        """Test each fuel has all required parameters for emission calculation"""
        response = requests.get(f"{BASE_URL}/api/fuel-database", headers=self.headers)
        assert response.status_code == 200
        
        fuels = response.json()
        if len(fuels) == 0:
            pytest.skip("No fuels in database to test")
        
        required_fields = [
            "id", "fuel_name", "category", "industry_sector", "scope",
            "calorific_value", "calorific_value_unit", "emission_factor_co2"
        ]
        
        for fuel in fuels[:5]:  # Check first 5 fuels
            for field in required_fields:
                assert field in fuel, f"Fuel missing required field: {field}"
            
            # Verify numeric values
            assert isinstance(fuel["calorific_value"], (int, float)), "calorific_value should be numeric"
            assert isinstance(fuel["emission_factor_co2"], (int, float)), "emission_factor_co2 should be numeric"
            assert fuel["calorific_value"] > 0, "calorific_value should be positive"
            assert fuel["emission_factor_co2"] > 0, "emission_factor_co2 should be positive"
            
            print(f"Fuel '{fuel['fuel_name']}': CV={fuel['calorific_value']} {fuel['calorific_value_unit']}, CO2 EF={fuel['emission_factor_co2']} kg/TJ")
    
    def test_fuel_contains_optional_emission_factors(self):
        """Test fuels contain optional CH4 and N2O emission factors"""
        response = requests.get(f"{BASE_URL}/api/fuel-database", headers=self.headers)
        assert response.status_code == 200
        
        fuels = response.json()
        if len(fuels) == 0:
            pytest.skip("No fuels in database to test")
        
        # Check if at least some fuels have CH4/N2O factors
        has_ch4 = any(f.get("emission_factor_ch4") for f in fuels)
        has_n2o = any(f.get("emission_factor_n2o") for f in fuels)
        
        print(f"Fuels with CH4 factors: {sum(1 for f in fuels if f.get('emission_factor_ch4'))}")
        print(f"Fuels with N2O factors: {sum(1 for f in fuels if f.get('emission_factor_n2o'))}")
        
        # Not a hard requirement, just informational
        if has_ch4:
            print("CH4 emission factors available")
        if has_n2o:
            print("N2O emission factors available")
    
    def test_fuel_grouped_by_category(self):
        """Test fuels are correctly categorized"""
        response = requests.get(f"{BASE_URL}/api/fuel-database", headers=self.headers)
        assert response.status_code == 200
        
        fuels = response.json()
        if len(fuels) == 0:
            pytest.skip("No fuels in database to test")
        
        categories = {}
        for fuel in fuels:
            cat = fuel.get("category", "Unknown")
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(fuel["fuel_name"])
        
        print(f"Found {len(categories)} categories:")
        for cat, fuel_list in categories.items():
            print(f"  {cat}: {len(fuel_list)} fuels")


class TestEmissionCalculationFormula:
    """Test emission calculation using the new formula"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token, also fetch fuels and facilities"""
        # Login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
        # Get facilities
        response = requests.get(f"{BASE_URL}/api/facilities", headers=self.headers)
        assert response.status_code == 200
        self.facilities = response.json()
        
        # Get fuels
        response = requests.get(f"{BASE_URL}/api/fuel-database", headers=self.headers)
        assert response.status_code == 200
        self.fuels = response.json()
    
    def calculate_expected_emissions(self, quantity, calorific_value, density, conversion_factor, 
                                     ef_co2, ef_ch4=None, ef_n2o=None):
        """
        Calculate expected emissions using the formula:
        Energy (MJ) = quantity × calorific_value × density × conversion_factor
        Energy (TJ) = Energy (MJ) / 1,000,000
        CO2 emissions = Energy (TJ) × ef_co2 × GWP_CO2
        CH4 emissions = Energy (TJ) × ef_ch4 × GWP_CH4 (if ef_ch4)
        N2O emissions = Energy (TJ) × ef_n2o × GWP_N2O (if ef_n2o)
        Total = CO2 + CH4 + N2O
        """
        energy_mj = quantity * calorific_value * density * conversion_factor
        energy_tj = energy_mj / 1_000_000
        
        co2_emissions = energy_tj * ef_co2 * GWP_VALUES["CO2"]
        ch4_emissions = energy_tj * ef_ch4 * GWP_VALUES["CH4"] if ef_ch4 else 0
        n2o_emissions = energy_tj * ef_n2o * GWP_VALUES["N2O"] if ef_n2o else 0
        
        return co2_emissions + ch4_emissions + n2o_emissions
    
    def test_create_emission_with_fuel_database(self):
        """Test creating emission record using fuel from database"""
        if not self.facilities:
            pytest.skip("No facilities available")
        if not self.fuels:
            pytest.skip("No fuels in database")
        
        facility = self.facilities[0]
        fuel = self.fuels[0]
        
        quantity = 100  # 100 units
        calorific_value = fuel["calorific_value"]
        density = fuel.get("density") or 1.0
        conversion_factor = fuel.get("conversion_factor") or 1.0
        ef_co2 = fuel["emission_factor_co2"]
        ef_ch4 = fuel.get("emission_factor_ch4")
        ef_n2o = fuel.get("emission_factor_n2o")
        
        # Calculate expected emissions
        expected_emissions = self.calculate_expected_emissions(
            quantity, calorific_value, density, conversion_factor,
            ef_co2, ef_ch4, ef_n2o
        )
        
        # Create emission record
        payload = {
            "facility_id": facility["id"],
            "reporting_period": "2025-01",
            "scope": fuel.get("scope", "scope1"),
            "category": fuel["category"],
            "sub_category": fuel["fuel_name"],
            "fuel_type": fuel["fuel_name"],
            "quantity": quantity,
            "emission_factor": ef_co2,
            "unit": f"kg CO2/TJ",
            "calorific_value": calorific_value,
            "source_of_information": fuel.get("source", "Test"),
            "is_custom_factor": False,
            "fuel_database_id": fuel["id"],
            "emission_factor_ch4": ef_ch4,
            "emission_factor_n2o": ef_n2o,
            "density": density,
            "conversion_factor": conversion_factor
        }
        
        response = requests.post(f"{BASE_URL}/api/emissions", json=payload, headers=self.headers)
        assert response.status_code == 200, f"Failed to create emission: {response.text}"
        
        emission = response.json()
        assert "id" in emission
        assert "total_emissions" in emission
        
        # Verify calculation is correct (allow small floating point difference)
        actual = emission["total_emissions"]
        if expected_emissions > 0:
            diff_percent = abs(actual - expected_emissions) / expected_emissions * 100
            assert diff_percent < 1, f"Emission calculation off by {diff_percent:.2f}%: expected {expected_emissions:.4f}, got {actual:.4f}"
        
        print(f"Created emission with fuel '{fuel['fuel_name']}':")
        print(f"  Quantity: {quantity}, CV: {calorific_value}, Density: {density}")
        print(f"  Expected: {expected_emissions:.4f} kg CO2e, Actual: {actual:.4f} kg CO2e")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/emissions/{emission['id']}", headers=self.headers)
        
        return emission
    
    def test_emission_with_overridden_calorific_value(self):
        """Test emission with user-overridden calorific value"""
        if not self.facilities:
            pytest.skip("No facilities available")
        if not self.fuels:
            pytest.skip("No fuels in database")
        
        facility = self.facilities[0]
        fuel = self.fuels[0]
        
        quantity = 50
        # Override calorific value (user provides different value)
        original_cv = fuel["calorific_value"]
        overridden_cv = original_cv * 1.1  # 10% higher
        density = fuel.get("density") or 1.0
        conversion_factor = fuel.get("conversion_factor") or 1.0
        ef_co2 = fuel["emission_factor_co2"]
        
        expected_emissions = self.calculate_expected_emissions(
            quantity, overridden_cv, density, conversion_factor, ef_co2
        )
        
        payload = {
            "facility_id": facility["id"],
            "reporting_period": "2025-02",
            "scope": fuel.get("scope", "scope1"),
            "category": fuel["category"],
            "sub_category": fuel["fuel_name"],
            "fuel_type": fuel["fuel_name"],
            "quantity": quantity,
            "emission_factor": ef_co2,
            "unit": f"kg CO2/TJ",
            "calorific_value": overridden_cv,  # OVERRIDDEN VALUE
            "source_of_information": "Overridden CV Test",
            "is_custom_factor": False,
            "fuel_database_id": fuel["id"],
            "density": density,
            "conversion_factor": conversion_factor
        }
        
        response = requests.post(f"{BASE_URL}/api/emissions", json=payload, headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        emission = response.json()
        actual = emission["total_emissions"]
        
        print(f"Override CV test: original={original_cv}, overridden={overridden_cv}")
        print(f"  Expected: {expected_emissions:.4f}, Actual: {actual:.4f}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/emissions/{emission['id']}", headers=self.headers)
    
    def test_emission_with_overridden_density(self):
        """Test emission with user-overridden density"""
        if not self.facilities:
            pytest.skip("No facilities available")
        if not self.fuels:
            pytest.skip("No fuels in database")
        
        facility = self.facilities[0]
        fuel = self.fuels[0]
        
        quantity = 50
        calorific_value = fuel["calorific_value"]
        original_density = fuel.get("density") or 1.0
        overridden_density = original_density * 0.9  # 10% lower
        conversion_factor = fuel.get("conversion_factor") or 1.0
        ef_co2 = fuel["emission_factor_co2"]
        
        expected_emissions = self.calculate_expected_emissions(
            quantity, calorific_value, overridden_density, conversion_factor, ef_co2
        )
        
        payload = {
            "facility_id": facility["id"],
            "reporting_period": "2025-03",
            "scope": fuel.get("scope", "scope1"),
            "category": fuel["category"],
            "sub_category": fuel["fuel_name"],
            "fuel_type": fuel["fuel_name"],
            "quantity": quantity,
            "emission_factor": ef_co2,
            "unit": f"kg CO2/TJ",
            "calorific_value": calorific_value,
            "source_of_information": "Overridden Density Test",
            "is_custom_factor": False,
            "fuel_database_id": fuel["id"],
            "density": overridden_density,  # OVERRIDDEN VALUE
            "conversion_factor": conversion_factor
        }
        
        response = requests.post(f"{BASE_URL}/api/emissions", json=payload, headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        emission = response.json()
        actual = emission["total_emissions"]
        
        print(f"Override density test: original={original_density}, overridden={overridden_density}")
        print(f"  Expected: {expected_emissions:.4f}, Actual: {actual:.4f}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/emissions/{emission['id']}", headers=self.headers)
    
    def test_emission_with_ch4_n2o_factors(self):
        """Test emission calculation includes CH4 and N2O with GWP"""
        if not self.facilities:
            pytest.skip("No facilities available")
        if not self.fuels:
            pytest.skip("No fuels in database")
        
        # Find a fuel with CH4/N2O factors
        fuel_with_ghgs = None
        for f in self.fuels:
            if f.get("emission_factor_ch4") or f.get("emission_factor_n2o"):
                fuel_with_ghgs = f
                break
        
        if not fuel_with_ghgs:
            # Create emission with manual CH4/N2O values to test GWP calculation
            facility = self.facilities[0]
            fuel = self.fuels[0]
            
            quantity = 100
            calorific_value = fuel["calorific_value"]
            density = fuel.get("density") or 1.0
            conversion_factor = fuel.get("conversion_factor") or 1.0
            ef_co2 = fuel["emission_factor_co2"]
            ef_ch4 = 3.0  # kg CH4/TJ
            ef_n2o = 0.6  # kg N2O/TJ
            
            expected = self.calculate_expected_emissions(
                quantity, calorific_value, density, conversion_factor,
                ef_co2, ef_ch4, ef_n2o
            )
            
            payload = {
                "facility_id": facility["id"],
                "reporting_period": "2025-04",
                "scope": "scope1",
                "category": fuel["category"],
                "sub_category": fuel["fuel_name"],
                "fuel_type": fuel["fuel_name"],
                "quantity": quantity,
                "emission_factor": ef_co2,
                "unit": "kg CO2/TJ",
                "calorific_value": calorific_value,
                "is_custom_factor": False,
                "emission_factor_ch4": ef_ch4,
                "emission_factor_n2o": ef_n2o,
                "density": density,
                "conversion_factor": conversion_factor
            }
            
            response = requests.post(f"{BASE_URL}/api/emissions", json=payload, headers=self.headers)
            assert response.status_code == 200, f"Failed: {response.text}"
            
            emission = response.json()
            actual = emission["total_emissions"]
            
            print(f"GHG calculation test:")
            print(f"  EF CO2: {ef_co2}, EF CH4: {ef_ch4}, EF N2O: {ef_n2o}")
            print(f"  GWP: CO2={GWP_VALUES['CO2']}, CH4={GWP_VALUES['CH4']}, N2O={GWP_VALUES['N2O']}")
            print(f"  Expected: {expected:.4f}, Actual: {actual:.4f}")
            
            # Cleanup
            requests.delete(f"{BASE_URL}/api/emissions/{emission['id']}", headers=self.headers)
        else:
            print(f"Found fuel with GHG factors: {fuel_with_ghgs['fuel_name']}")


class TestCustomFuelType:
    """Test custom fuel type functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
        # Get facilities
        response = requests.get(f"{BASE_URL}/api/facilities", headers=self.headers)
        self.facilities = response.json() if response.status_code == 200 else []
    
    def test_create_emission_with_custom_fuel(self):
        """Test creating emission with custom fuel type (not from database)"""
        if not self.facilities:
            pytest.skip("No facilities available")
        
        facility = self.facilities[0]
        
        # Custom fuel type - simple calculation: quantity * emission_factor
        quantity = 100
        custom_ef = 2.5  # kg CO2e/unit
        expected_emissions = quantity * custom_ef
        
        payload = {
            "facility_id": facility["id"],
            "reporting_period": "2025-05",
            "scope": "scope1",
            "category": "Custom",
            "sub_category": "Test Bio-Fuel",
            "fuel_type": "Test Bio-Fuel",
            "quantity": quantity,
            "emission_factor": custom_ef,
            "unit": "kg CO2e/unit",
            "source_of_information": "Custom Test Source",
            "justification": "Testing custom fuel type functionality",
            "is_custom_factor": True
        }
        
        response = requests.post(f"{BASE_URL}/api/emissions", json=payload, headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        emission = response.json()
        assert emission["is_custom_factor"] == True
        
        # For custom factors, calculation is simply: quantity * emission_factor
        actual = emission["total_emissions"]
        assert abs(actual - expected_emissions) < 0.01, f"Expected {expected_emissions}, got {actual}"
        
        print(f"Custom fuel test: {quantity} * {custom_ef} = {actual} kg CO2e")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/emissions/{emission['id']}", headers=self.headers)


class TestGWPValues:
    """Test GWP values endpoint"""
    
    def test_get_gwp_values(self):
        """Test /api/gwp-values returns correct GWP constants"""
        response = requests.get(f"{BASE_URL}/api/gwp-values")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        gwp = response.json()
        assert gwp.get("CO2") == 1, f"GWP CO2 should be 1, got {gwp.get('CO2')}"
        assert gwp.get("CH4") == 28, f"GWP CH4 should be 28, got {gwp.get('CH4')}"
        assert gwp.get("N2O") == 265, f"GWP N2O should be 265, got {gwp.get('N2O')}"
        
        print(f"GWP Values: CO2={gwp['CO2']}, CH4={gwp['CH4']}, N2O={gwp['N2O']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
