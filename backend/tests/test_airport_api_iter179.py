"""
Airport API Tests - Iteration 179

Tests for:
- GET /api/airports/search - Airport search by IATA code, name, city, country
- POST /api/airports/calculate-distance - Haversine distance calculation between airports

Test cases:
1. Search for 'DEL' - should return Indira Gandhi International Airport
2. Search for 'London' - should return airports with London in city/name
3. Search for 'LHR' - should return London Heathrow as exact IATA match first
4. Calculate distance DEL to LHR - should return ~6700 km
5. Calculate distance same airport (DEL to DEL) - should return 0
6. Calculate distance invalid airport code - should return 400
7. Calculate distance BOM to DXB - should return ~1925 km
8. Calculate distance JFK to LHR - should return ~5540 km
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAirportSearch:
    """Airport search endpoint tests"""
    
    def test_search_del_returns_indira_gandhi(self):
        """Search for 'DEL' should return Indira Gandhi International Airport as first result"""
        response = requests.get(f"{BASE_URL}/api/airports/search", params={"q": "DEL"})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should return at least one airport"
        
        # First result should be exact IATA match
        first_result = data[0]
        assert first_result.get("iata_code") == "DEL", f"First result should be DEL, got {first_result.get('iata_code')}"
        assert "Indira Gandhi" in first_result.get("airport_name", ""), f"Should be Indira Gandhi airport, got {first_result.get('airport_name')}"
        
        # Verify response structure
        assert "city" in first_result
        assert "country" in first_result
        assert "latitude" in first_result
        assert "longitude" in first_result
        
        print(f"✓ DEL search returned: {first_result['iata_code']} - {first_result['airport_name']}")
    
    def test_search_london_returns_london_airports(self):
        """Search for 'London' should return airports with London in city/name"""
        response = requests.get(f"{BASE_URL}/api/airports/search", params={"q": "London"})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should return at least one airport"
        
        # Check that results contain London-related airports
        london_found = False
        for airport in data:
            if "London" in airport.get("city", "") or "London" in airport.get("airport_name", ""):
                london_found = True
                break
        
        assert london_found, "Should return at least one London airport"
        print(f"✓ London search returned {len(data)} airports")
        for apt in data[:3]:
            print(f"  - {apt.get('iata_code')} - {apt.get('airport_name')} ({apt.get('city')})")
    
    def test_search_lhr_returns_heathrow_first(self):
        """Search for 'LHR' should return London Heathrow as exact IATA match first"""
        response = requests.get(f"{BASE_URL}/api/airports/search", params={"q": "LHR"})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should return at least one airport"
        
        # First result should be exact IATA match for LHR
        first_result = data[0]
        assert first_result.get("iata_code") == "LHR", f"First result should be LHR, got {first_result.get('iata_code')}"
        assert "Heathrow" in first_result.get("airport_name", ""), f"Should be Heathrow airport, got {first_result.get('airport_name')}"
        
        print(f"✓ LHR search returned: {first_result['iata_code']} - {first_result['airport_name']}")
    
    def test_search_empty_query_returns_empty(self):
        """Search with empty query should return validation error or empty list"""
        response = requests.get(f"{BASE_URL}/api/airports/search", params={"q": ""})
        
        # Either 422 (validation error) or 200 with empty list is acceptable
        assert response.status_code in [200, 422], f"Expected 200 or 422, got {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ Empty query handled correctly (status: {response.status_code})")


class TestAirportDistanceCalculation:
    """Airport distance calculation endpoint tests"""
    
    def test_distance_del_to_lhr(self):
        """Calculate distance DEL to LHR - should return ~6700 km"""
        response = requests.post(
            f"{BASE_URL}/api/airports/calculate-distance",
            json={"from_airport_code": "DEL", "to_airport_code": "LHR"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "distance_km" in data, "Response should contain distance_km"
        assert "method" in data, "Response should contain method"
        assert "earth_radius_km" in data, "Response should contain earth_radius_km"
        assert "from" in data, "Response should contain from airport details"
        assert "to" in data, "Response should contain to airport details"
        
        # Verify method
        assert data["method"] == "HAVERSINE", f"Method should be HAVERSINE, got {data['method']}"
        assert data["earth_radius_km"] == 6371, f"Earth radius should be 6371, got {data['earth_radius_km']}"
        
        # Verify distance is approximately 6700 km (allow 10% tolerance)
        distance = data["distance_km"]
        expected_distance = 6731  # Approximate DEL-LHR distance
        tolerance = 0.10  # 10% tolerance
        
        assert abs(distance - expected_distance) / expected_distance < tolerance, \
            f"Distance should be ~{expected_distance} km, got {distance} km"
        
        # Verify from/to airport details
        assert data["from"]["airport_code"] == "DEL"
        assert data["to"]["airport_code"] == "LHR"
        assert "airport_name" in data["from"]
        assert "city" in data["from"]
        assert "country" in data["from"]
        assert "latitude" in data["from"]
        assert "longitude" in data["from"]
        
        print(f"✓ DEL to LHR distance: {distance} km (expected ~{expected_distance} km)")
    
    def test_distance_same_airport_returns_zero(self):
        """Calculate distance DEL to DEL - should return 0 km"""
        response = requests.post(
            f"{BASE_URL}/api/airports/calculate-distance",
            json={"from_airport_code": "DEL", "to_airport_code": "DEL"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        assert data["distance_km"] == 0, f"Distance should be 0 for same airport, got {data['distance_km']}"
        assert data["method"] == "HAVERSINE"
        assert data["from"]["airport_code"] == "DEL"
        assert data["to"]["airport_code"] == "DEL"
        
        print(f"✓ Same airport (DEL to DEL) distance: {data['distance_km']} km")
    
    def test_distance_invalid_airport_returns_400(self):
        """Calculate distance with invalid airport code XXXXX - should return 400"""
        response = requests.post(
            f"{BASE_URL}/api/airports/calculate-distance",
            json={"from_airport_code": "XXXXX", "to_airport_code": "LHR"}
        )
        
        assert response.status_code == 400, f"Expected 400 for invalid airport, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Error response should contain detail"
        assert "XXXXX" in data["detail"], f"Error should mention invalid airport code, got: {data['detail']}"
        
        print(f"✓ Invalid airport code handled correctly: {data['detail']}")
    
    def test_distance_bom_to_dxb(self):
        """Calculate distance BOM to DXB - should return ~1925 km"""
        response = requests.post(
            f"{BASE_URL}/api/airports/calculate-distance",
            json={"from_airport_code": "BOM", "to_airport_code": "DXB"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify distance is approximately 1925 km (allow 10% tolerance)
        distance = data["distance_km"]
        expected_distance = 1925  # Approximate BOM-DXB distance
        tolerance = 0.10  # 10% tolerance
        
        assert abs(distance - expected_distance) / expected_distance < tolerance, \
            f"Distance should be ~{expected_distance} km, got {distance} km"
        
        assert data["from"]["airport_code"] == "BOM"
        assert data["to"]["airport_code"] == "DXB"
        
        print(f"✓ BOM to DXB distance: {distance} km (expected ~{expected_distance} km)")
    
    def test_distance_jfk_to_lhr(self):
        """Calculate distance JFK to LHR - should return ~5540 km"""
        response = requests.post(
            f"{BASE_URL}/api/airports/calculate-distance",
            json={"from_airport_code": "JFK", "to_airport_code": "LHR"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify distance is approximately 5540 km (allow 10% tolerance)
        distance = data["distance_km"]
        expected_distance = 5540  # Approximate JFK-LHR distance
        tolerance = 0.10  # 10% tolerance
        
        assert abs(distance - expected_distance) / expected_distance < tolerance, \
            f"Distance should be ~{expected_distance} km, got {distance} km"
        
        assert data["from"]["airport_code"] == "JFK"
        assert data["to"]["airport_code"] == "LHR"
        
        print(f"✓ JFK to LHR distance: {distance} km (expected ~{expected_distance} km)")
    
    def test_distance_missing_airport_code(self):
        """Calculate distance with missing airport code - should return 400 or 422"""
        response = requests.post(
            f"{BASE_URL}/api/airports/calculate-distance",
            json={"from_airport_code": "DEL"}  # Missing to_airport_code
        )
        
        assert response.status_code in [400, 422], f"Expected 400 or 422, got {response.status_code}: {response.text}"
        
        print(f"✓ Missing airport code handled correctly (status: {response.status_code})")
    
    def test_distance_case_insensitive(self):
        """Calculate distance with lowercase airport codes - should work"""
        response = requests.post(
            f"{BASE_URL}/api/airports/calculate-distance",
            json={"from_airport_code": "del", "to_airport_code": "lhr"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["from"]["airport_code"] == "DEL", "Should normalize to uppercase"
        assert data["to"]["airport_code"] == "LHR", "Should normalize to uppercase"
        
        print(f"✓ Case-insensitive airport codes work correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
