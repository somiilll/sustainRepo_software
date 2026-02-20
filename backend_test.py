#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime
import uuid

class GHGPlatformTester:
    def __init__(self, base_url="https://ghg-calc-1.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.admin_token = None
        self.user_token = None
        self.admin_user = None
        self.regular_user = None
        self.facility_id = None
        self.emission_record_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def make_request(self, method, endpoint, data=None, token=None, expect_status=200):
        """Make HTTP request with error handling"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if token:
            headers['Authorization'] = f'Bearer {token}'
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)
            
            success = response.status_code == expect_status
            return success, response.json() if success else {}, response.status_code
            
        except Exception as e:
            return False, {"error": str(e)}, 0

    def test_health_check(self):
        """Test health endpoint"""
        success, data, status = self.make_request('GET', 'health')
        self.log_test("Health Check", success and data.get('status') == 'healthy')

    def test_standard_emission_factors(self):
        """Test standard emission factors endpoint"""
        success, data, status = self.make_request('GET', 'emission-factors/standard')
        has_scope1 = 'scope1' in data
        has_scope2 = 'scope2' in data
        self.log_test("Standard Emission Factors", success and has_scope1 and has_scope2)

    def test_admin_signup(self):
        """Test admin user signup"""
        admin_data = {
            "email": f"admin_{uuid.uuid4().hex[:8]}@test.com",
            "password": "AdminPass123!",
            "full_name": "Test Admin",
            "role": "admin"
        }
        
        success, data, status = self.make_request('POST', 'auth/signup', admin_data, expect_status=200)
        if success:
            self.admin_token = data.get('access_token')
            self.admin_user = data.get('user')
        
        self.log_test("Admin Signup", success and self.admin_token is not None)

    def test_user_signup(self):
        """Test regular user signup"""
        user_data = {
            "email": f"user_{uuid.uuid4().hex[:8]}@test.com",
            "password": "UserPass123!",
            "full_name": "Test User",
            "role": "user"
        }
        
        success, data, status = self.make_request('POST', 'auth/signup', user_data, expect_status=200)
        if success:
            self.user_token = data.get('access_token')
            self.regular_user = data.get('user')
        
        self.log_test("User Signup", success and self.user_token is not None)

    def test_login(self):
        """Test login functionality"""
        if not self.admin_user:
            self.log_test("Login Test", False, "No admin user to test login")
            return
            
        login_data = {
            "email": self.admin_user['email'],
            "password": "AdminPass123!"
        }
        
        success, data, status = self.make_request('POST', 'auth/login', login_data)
        token_received = success and data.get('access_token') is not None
        self.log_test("Login", token_received)

    def test_get_me(self):
        """Test get current user endpoint"""
        success, data, status = self.make_request('GET', 'auth/me', token=self.admin_token)
        user_data_correct = success and data.get('email') == self.admin_user['email']
        self.log_test("Get Current User", user_data_correct)

    def test_create_facility(self):
        """Test facility creation"""
        facility_data = {
            "name": "Test Manufacturing Plant",
            "address": "123 Industrial Ave, Test City",
            "products_manufactured": "Steel Products",
            "machinery_used": "Blast Furnaces, Rolling Mills",
            "sector": "Manufacturing",
            "responsible_person": "John Doe",
            "reporting_frequency": "monthly"
        }
        
        success, data, status = self.make_request('POST', 'facilities', facility_data, token=self.admin_token, expect_status=200)
        if success:
            self.facility_id = data.get('id')
        
        self.log_test("Create Facility", success and self.facility_id is not None)

    def test_get_facilities(self):
        """Test get facilities endpoint"""
        success, data, status = self.make_request('GET', 'facilities', token=self.admin_token)
        has_facilities = success and isinstance(data, list) and len(data) > 0
        self.log_test("Get Facilities", has_facilities)

    def test_update_facility(self):
        """Test facility update"""
        if not self.facility_id:
            self.log_test("Update Facility", False, "No facility ID available")
            return
            
        update_data = {
            "name": "Updated Manufacturing Plant",
            "address": "123 Industrial Ave, Test City",
            "products_manufactured": "Updated Steel Products",
            "machinery_used": "Blast Furnaces, Rolling Mills",
            "sector": "Manufacturing",
            "responsible_person": "Jane Doe",
            "reporting_frequency": "quarterly"
        }
        
        success, data, status = self.make_request('PUT', f'facilities/{self.facility_id}', update_data, token=self.admin_token)
        name_updated = success and data.get('name') == 'Updated Manufacturing Plant'
        self.log_test("Update Facility", name_updated)

    def test_create_emission_record(self):
        """Test emission record creation"""
        if not self.facility_id:
            self.log_test("Create Emission Record", False, "No facility ID available")
            return
            
        emission_data = {
            "facility_id": self.facility_id,
            "reporting_period": "2024-01",
            "scope": "scope1",
            "category": "stationary_combustion",
            "sub_category": "natural_gas",
            "fuel_type": "Natural Gas",
            "quantity": 1000.0,
            "emission_factor": 2.03,
            "unit": "kg CO2e/m³",
            "source_of_information": "Utility Bills",
            "notes": "Monthly consumption data",
            "is_custom_factor": False
        }
        
        success, data, status = self.make_request('POST', 'emissions', emission_data, token=self.admin_token, expect_status=200)
        if success:
            self.emission_record_id = data.get('id')
            
        total_emissions_correct = success and data.get('total_emissions') == 2030.0  # 1000 * 2.03
        self.log_test("Create Emission Record", total_emissions_correct)

    def test_create_scope2_emission(self):
        """Test Scope 2 emission record creation"""
        if not self.facility_id:
            self.log_test("Create Scope 2 Emission", False, "No facility ID available")
            return
            
        emission_data = {
            "facility_id": self.facility_id,
            "reporting_period": "2024-01",
            "scope": "scope2",
            "category": "electricity",
            "sub_category": "grid",
            "quantity": 5000.0,
            "emission_factor": 0.82,
            "unit": "kg CO2e/kWh",
            "source_of_information": "Electricity Bills",
            "notes": "Grid electricity consumption",
            "is_custom_factor": False
        }
        
        success, data, status = self.make_request('POST', 'emissions', emission_data, token=self.admin_token, expect_status=200)
        total_emissions_correct = success and data.get('total_emissions') == 4100.0  # 5000 * 0.82
        self.log_test("Create Scope 2 Emission", total_emissions_correct)

    def test_custom_emission_factor(self):
        """Test custom emission factor creation"""
        custom_factor_data = {
            "name": "Custom Diesel Factor",
            "scope": "scope1",
            "category": "mobile_combustion",
            "sub_category": "diesel_custom",
            "factor": 2.75,
            "unit": "kg CO2e/liter",
            "source": "Local Environmental Agency",
            "is_custom": True
        }
        
        success, data, status = self.make_request('POST', 'emission-factors', custom_factor_data, token=self.admin_token, expect_status=200)
        self.log_test("Create Custom Emission Factor", success and data.get('factor') == 2.75)

    def test_get_emissions(self):
        """Test get emissions endpoint"""
        success, data, status = self.make_request('GET', 'emissions', token=self.admin_token)
        has_emissions = success and isinstance(data, list) and len(data) > 0
        self.log_test("Get Emissions", has_emissions)

    def test_dashboard_stats(self):
        """Test dashboard statistics"""
        success, data, status = self.make_request('GET', 'dashboard/stats', token=self.admin_token)
        
        if success:
            has_facilities = 'total_facilities' in data and data['total_facilities'] > 0
            has_emissions = 'total_emissions' in data and data['total_emissions'] > 0
            has_scope_breakdown = 'scope1_emissions' in data and 'scope2_emissions' in data
            has_trends = 'emissions_trend' in data and isinstance(data['emissions_trend'], list)
            
            all_stats_present = has_facilities and has_emissions and has_scope_breakdown and has_trends
            self.log_test("Dashboard Statistics", all_stats_present)
        else:
            self.log_test("Dashboard Statistics", False, f"Status: {status}")

    def test_user_management(self):
        """Test admin user management endpoints"""
        # Get all users
        success, data, status = self.make_request('GET', 'admin/users', token=self.admin_token)
        has_users = success and isinstance(data, list) and len(data) >= 2  # admin + user
        self.log_test("Get All Users (Admin)", has_users)
        
        # Assign facilities to user
        if self.regular_user and self.facility_id:
            success, data, status = self.make_request(
                'PUT', 
                f'admin/users/{self.regular_user["id"]}/assign-facilities',
                [self.facility_id],
                token=self.admin_token
            )
            self.log_test("Assign Facilities to User", success)

    def test_role_based_access(self):
        """Test role-based access control"""
        # Regular user should not be able to access admin endpoints
        success, data, status = self.make_request('GET', 'admin/users', token=self.user_token, expect_status=403)
        access_denied = status == 403
        self.log_test("Role-based Access Control", access_denied)

    def test_report_generation(self):
        """Test report generation"""
        if not self.facility_id:
            self.log_test("Report Generation", False, "No facility ID available")
            return
            
        # Test report generation (should return binary data)
        url = f"{self.api_url}/reports/facility/{self.facility_id}"
        headers = {'Authorization': f'Bearer {self.admin_token}'}
        
        try:
            response = requests.get(url, headers=headers)
            is_docx = response.headers.get('content-type') == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            has_content = len(response.content) > 1000  # Should be a substantial file
            
            self.log_test("Report Generation", response.status_code == 200 and is_docx and has_content)
        except Exception as e:
            self.log_test("Report Generation", False, str(e))

    def test_delete_operations(self):
        """Test delete operations"""
        # Delete emission record
        if self.emission_record_id:
            success, data, status = self.make_request('DELETE', f'emissions/{self.emission_record_id}', token=self.admin_token)
            self.log_test("Delete Emission Record", success)
        
        # Delete facility (admin only)
        if self.facility_id:
            success, data, status = self.make_request('DELETE', f'facilities/{self.facility_id}', token=self.admin_token)
            self.log_test("Delete Facility", success)

    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting GHG Platform Backend Tests...")
        print(f"Testing against: {self.base_url}")
        print("=" * 50)
        
        # Basic functionality tests
        self.test_health_check()
        self.test_standard_emission_factors()
        
        # Authentication tests
        self.test_admin_signup()
        self.test_user_signup()
        self.test_login()
        self.test_get_me()
        
        # Facility management tests
        self.test_create_facility()
        self.test_get_facilities()
        self.test_update_facility()
        
        # Emission tracking tests
        self.test_create_emission_record()
        self.test_create_scope2_emission()
        self.test_custom_emission_factor()
        self.test_get_emissions()
        
        # Dashboard and analytics
        self.test_dashboard_stats()
        
        # Admin features
        self.test_user_management()
        self.test_role_based_access()
        
        # Report generation
        self.test_report_generation()
        
        # Cleanup tests
        self.test_delete_operations()
        
        # Print summary
        print("=" * 50)
        print(f"📊 Tests completed: {self.tests_passed}/{self.tests_run} passed")
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"📈 Success rate: {success_rate:.1f}%")
        
        if self.tests_passed < self.tests_run:
            print("\n❌ Failed tests:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  - {result['test']}: {result['details']}")
        
        return self.tests_passed == self.tests_run

def main():
    tester = GHGPlatformTester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())