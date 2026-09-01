# Test: Sinks module with per-record-per-month logic
# Each sink record has reporting_month (0-11) and reporting_year
# Creating sinks for multiple months creates multiple separate records

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_USER = {
    "email": "ruthvikan@gmail.com",
    "password": "Password@123"
}


class TestSinksPerMonthRecords:
    """Test the new per-record-per-month sinks functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token before each test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=TEST_USER)
        if response.status_code != 200:
            pytest.skip("Login failed - skipping authenticated tests")
        
        self.token = response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Get a facility for testing
        facilities_resp = self.session.get(f"{BASE_URL}/api/facilities")
        if facilities_resp.status_code == 200 and facilities_resp.json():
            self.test_facility_id = facilities_resp.json()[0]["id"]
        else:
            pytest.skip("No facilities available for testing")
        
        # Track created sinks for cleanup
        self.created_sink_ids = []
        
        yield
        
        # Cleanup: delete all created sinks
        for sink_id in self.created_sink_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/sinks/{sink_id}")
            except requests.RequestException:
                pass
    
    def test_create_sink_with_reporting_month(self):
        """Test POST /api/sinks with reporting_month field"""
        payload = {
            "facility_id": self.test_facility_id,
            "reporting_year": "2025",
            "reporting_month": 0,  # January (0-indexed)
            "total_emissions_reduced": 100.5,
            "description": "TEST_January_sink",
            "evidence_urls": [],
            "evidence_files": [],
            "start_date": "2025-01-01",
            "end_date": "2025-01-28"
        }
        
        response = self.session.post(f"{BASE_URL}/api/sinks", json=payload)
        assert response.status_code == 200, f"Failed to create sink: {response.text}"
        
        data = response.json()
        self.created_sink_ids.append(data["id"])
        
        # Verify reporting_month is stored correctly
        assert data["reporting_month"] == 0, f"Expected reporting_month=0, got {data.get('reporting_month')}"
        assert data["reporting_year"] == "2025", f"Expected reporting_year=2025, got {data.get('reporting_year')}"
        assert data["total_emissions_reduced"] == 100.5
        assert "id" in data
        print(f"✓ Created sink with reporting_month=0 (January), id={data['id']}")
    
    def test_create_multiple_monthly_sinks(self):
        """Test creating separate sink records for Jan and Feb"""
        # Create January record
        jan_payload = {
            "facility_id": self.test_facility_id,
            "reporting_year": "2025",
            "reporting_month": 0,  # January
            "total_emissions_reduced": 50.0,
            "description": "TEST_January_2025",
            "evidence_urls": [],
            "evidence_files": [],
            "start_date": "2025-01-01",
            "end_date": "2025-01-28"
        }
        jan_response = self.session.post(f"{BASE_URL}/api/sinks", json=jan_payload)
        assert jan_response.status_code == 200, f"Failed to create Jan sink: {jan_response.text}"
        jan_data = jan_response.json()
        self.created_sink_ids.append(jan_data["id"])
        
        # Create February record
        feb_payload = {
            "facility_id": self.test_facility_id,
            "reporting_year": "2025",
            "reporting_month": 1,  # February
            "total_emissions_reduced": 75.0,
            "description": "TEST_February_2025",
            "evidence_urls": [],
            "evidence_files": [],
            "start_date": "2025-02-01",
            "end_date": "2025-02-28"
        }
        feb_response = self.session.post(f"{BASE_URL}/api/sinks", json=feb_payload)
        assert feb_response.status_code == 200, f"Failed to create Feb sink: {feb_response.text}"
        feb_data = feb_response.json()
        self.created_sink_ids.append(feb_data["id"])
        
        # Verify both records exist
        assert jan_data["id"] != feb_data["id"], "Jan and Feb should have different IDs"
        assert jan_data["reporting_month"] == 0
        assert feb_data["reporting_month"] == 1
        assert jan_data["total_emissions_reduced"] == 50.0
        assert feb_data["total_emissions_reduced"] == 75.0
        
        print(f"✓ Created 2 separate sink records: Jan (id={jan_data['id']}) and Feb (id={feb_data['id']})")
    
    def test_get_sinks_returns_reporting_month(self):
        """Test GET /api/sinks returns records with reporting_month field"""
        # Create a test sink first
        payload = {
            "facility_id": self.test_facility_id,
            "reporting_year": "2025",
            "reporting_month": 5,  # June
            "total_emissions_reduced": 30.0,
            "description": "TEST_June_sink_for_get",
            "evidence_urls": [],
            "evidence_files": []
        }
        create_resp = self.session.post(f"{BASE_URL}/api/sinks", json=payload)
        assert create_resp.status_code == 200
        created_sink = create_resp.json()
        self.created_sink_ids.append(created_sink["id"])
        
        # Now get all sinks
        response = self.session.get(f"{BASE_URL}/api/sinks")
        assert response.status_code == 200
        
        sinks = response.json()
        assert len(sinks) > 0, "Expected at least one sink"
        
        # Find our created sink
        our_sink = next((s for s in sinks if s["id"] == created_sink["id"]), None)
        assert our_sink is not None, "Created sink not found in GET /api/sinks response"
        assert our_sink["reporting_month"] == 5, f"Expected reporting_month=5, got {our_sink.get('reporting_month')}"
        assert our_sink["reporting_year"] == "2025"
        
        print(f"✓ GET /api/sinks returns reporting_month correctly (found {len(sinks)} sinks)")
    
    def test_update_sink_reporting_month(self):
        """Test PUT /api/sinks/{id} updates reporting_month and reporting_year"""
        # Create initial sink
        payload = {
            "facility_id": self.test_facility_id,
            "reporting_year": "2025",
            "reporting_month": 0,  # January
            "total_emissions_reduced": 25.0,
            "description": "TEST_update_month",
            "evidence_urls": [],
            "evidence_files": []
        }
        create_resp = self.session.post(f"{BASE_URL}/api/sinks", json=payload)
        assert create_resp.status_code == 200
        sink_id = create_resp.json()["id"]
        self.created_sink_ids.append(sink_id)
        
        # Update to February with new value
        update_payload = {
            "facility_id": self.test_facility_id,
            "reporting_year": "2025",
            "reporting_month": 1,  # February
            "total_emissions_reduced": 35.0,
            "description": "TEST_updated_to_Feb",
            "evidence_urls": [],
            "evidence_files": []
        }
        update_resp = self.session.put(f"{BASE_URL}/api/sinks/{sink_id}", json=update_payload)
        assert update_resp.status_code == 200, f"Failed to update sink: {update_resp.text}"
        
        updated_data = update_resp.json()
        assert updated_data["reporting_month"] == 1, f"Expected reporting_month=1, got {updated_data.get('reporting_month')}"
        assert updated_data["total_emissions_reduced"] == 35.0
        
        # Verify via GET
        get_resp = self.session.get(f"{BASE_URL}/api/sinks/{sink_id}")
        assert get_resp.status_code == 200
        get_data = get_resp.json()
        assert get_data["reporting_month"] == 1
        assert get_data["total_emissions_reduced"] == 35.0
        
        print(f"✓ Updated sink reporting_month from 0 to 1 successfully")
    
    def test_delete_individual_sink_record(self):
        """Test DELETE removes individual sink record"""
        # Create two sinks
        jan_payload = {
            "facility_id": self.test_facility_id,
            "reporting_year": "2025",
            "reporting_month": 0,
            "total_emissions_reduced": 10.0,
            "description": "TEST_delete_jan",
            "evidence_urls": [],
            "evidence_files": []
        }
        feb_payload = {
            "facility_id": self.test_facility_id,
            "reporting_year": "2025",
            "reporting_month": 1,
            "total_emissions_reduced": 20.0,
            "description": "TEST_delete_feb",
            "evidence_urls": [],
            "evidence_files": []
        }
        
        jan_resp = self.session.post(f"{BASE_URL}/api/sinks", json=jan_payload)
        feb_resp = self.session.post(f"{BASE_URL}/api/sinks", json=feb_payload)
        jan_id = jan_resp.json()["id"]
        feb_id = feb_resp.json()["id"]
        self.created_sink_ids.append(feb_id)  # Only add Feb to cleanup, we'll delete Jan manually
        
        # Delete January sink
        delete_resp = self.session.delete(f"{BASE_URL}/api/sinks/{jan_id}")
        assert delete_resp.status_code == 200, f"Failed to delete sink: {delete_resp.text}"
        
        # Verify Jan is gone
        get_jan_resp = self.session.get(f"{BASE_URL}/api/sinks/{jan_id}")
        assert get_jan_resp.status_code == 404, "Deleted sink should return 404"
        
        # Verify Feb still exists
        get_feb_resp = self.session.get(f"{BASE_URL}/api/sinks/{feb_id}")
        assert get_feb_resp.status_code == 200, "Feb sink should still exist"
        
        print(f"✓ Deleted Jan sink, Feb sink still exists")
    
    def test_sink_with_evidence_files(self):
        """Test creating sink with evidence_files array"""
        payload = {
            "facility_id": self.test_facility_id,
            "reporting_year": "2025",
            "reporting_month": 2,  # March
            "total_emissions_reduced": 45.0,
            "description": "TEST_with_evidence",
            "evidence_urls": ["https://example.com/file1.pdf"],
            "evidence_files": [
                {"name": "test_doc.pdf", "url": "/api/files/12345", "file_id": "12345"}
            ]
        }
        
        response = self.session.post(f"{BASE_URL}/api/sinks", json=payload)
        assert response.status_code == 200, f"Failed to create sink with evidence: {response.text}"
        
        data = response.json()
        self.created_sink_ids.append(data["id"])
        
        assert data["evidence_files"] is not None
        assert len(data["evidence_files"]) == 1
        assert data["evidence_files"][0]["name"] == "test_doc.pdf"
        
        print(f"✓ Created sink with evidence_files array correctly")
    
    def test_legacy_sink_without_reporting_month(self):
        """Test that GET /api/sinks handles legacy sinks without reporting_month"""
        # This tests backward compatibility - the API should handle older records
        # that don't have reporting_month field
        response = self.session.get(f"{BASE_URL}/api/sinks")
        assert response.status_code == 200
        
        sinks = response.json()
        # Check that all sinks have valid structure (even if reporting_month is None for legacy)
        for sink in sinks:
            assert "id" in sink
            assert "facility_id" in sink
            assert "total_emissions_reduced" in sink
            # reporting_month can be None for legacy sinks
            # This should not cause an error
        
        print(f"✓ GET /api/sinks handles all sinks including legacy ones")


class TestSinksAPIEdgeCases:
    """Test edge cases for sinks API"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=TEST_USER)
        if response.status_code != 200:
            pytest.skip("Login failed")
        
        self.token = response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        facilities_resp = self.session.get(f"{BASE_URL}/api/facilities")
        if facilities_resp.status_code == 200 and facilities_resp.json():
            self.test_facility_id = facilities_resp.json()[0]["id"]
        else:
            pytest.skip("No facilities")
        
        self.created_sink_ids = []
        yield
        
        for sink_id in self.created_sink_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/sinks/{sink_id}")
            except requests.RequestException:
                pass
    
    def test_reporting_month_boundary_values(self):
        """Test reporting_month accepts values 0-11 (Jan-Dec)"""
        # Test January (0)
        payload_jan = {
            "facility_id": self.test_facility_id,
            "reporting_year": "2025",
            "reporting_month": 0,
            "total_emissions_reduced": 10.0,
            "description": "TEST_boundary_jan",
            "evidence_urls": [],
            "evidence_files": []
        }
        resp_jan = self.session.post(f"{BASE_URL}/api/sinks", json=payload_jan)
        assert resp_jan.status_code == 200
        self.created_sink_ids.append(resp_jan.json()["id"])
        
        # Test December (11)
        payload_dec = {
            "facility_id": self.test_facility_id,
            "reporting_year": "2025",
            "reporting_month": 11,
            "total_emissions_reduced": 10.0,
            "description": "TEST_boundary_dec",
            "evidence_urls": [],
            "evidence_files": []
        }
        resp_dec = self.session.post(f"{BASE_URL}/api/sinks", json=payload_dec)
        assert resp_dec.status_code == 200
        self.created_sink_ids.append(resp_dec.json()["id"])
        
        print(f"✓ reporting_month accepts 0 (Jan) and 11 (Dec)")
    
    def test_get_single_sink_by_id(self):
        """Test GET /api/sinks/{sink_id} returns correct sink"""
        payload = {
            "facility_id": self.test_facility_id,
            "reporting_year": "2025",
            "reporting_month": 6,
            "total_emissions_reduced": 55.5,
            "description": "TEST_get_by_id",
            "evidence_urls": [],
            "evidence_files": []
        }
        create_resp = self.session.post(f"{BASE_URL}/api/sinks", json=payload)
        assert create_resp.status_code == 200
        sink_id = create_resp.json()["id"]
        self.created_sink_ids.append(sink_id)
        
        # Get by ID
        get_resp = self.session.get(f"{BASE_URL}/api/sinks/{sink_id}")
        assert get_resp.status_code == 200
        
        data = get_resp.json()
        assert data["id"] == sink_id
        assert data["reporting_month"] == 6
        assert data["total_emissions_reduced"] == 55.5
        
        print(f"✓ GET /api/sinks/{sink_id} returns correct data")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
