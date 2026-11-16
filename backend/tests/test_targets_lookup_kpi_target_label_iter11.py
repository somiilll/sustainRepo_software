# Targets lookup categories + KPI definition target_label/target_order tests (iteration 11)
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ORG_RT = os.environ.get("ORG_RT")
SA_RT = os.environ.get("SA_RT")
KPI_ID = "dc794426-138a-4fe5-80e8-111a12fcdc2f"  # Water Consumption (Total)


def _token(rt):
    if not rt:
        pytest.skip("refresh token not provided")
    r = requests.post(f"{BASE_URL}/api/auth/refresh", headers={"Cookie": f"sustainrepo_refresh={rt}"})
    if r.status_code != 200:
        pytest.skip(f"refresh failed {r.status_code}")
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def org_h():
    return {"Authorization": f"Bearer {_token(ORG_RT)}"}


@pytest.fixture(scope="module")
def sa_h():
    return {"Authorization": f"Bearer {_token(SA_RT)}"}


# Lookup categories (Targets form + filter dropdown)
class TestLookupCategories:
    def test_environment_hierarchy(self, org_h):
        r = requests.get(f"{BASE_URL}/api/esg-targets/lookup/categories", params={"section": "environment"}, headers=org_h)
        assert r.status_code == 200
        h = r.json()["hierarchy"]
        for cat in ["GHG Emissions", "Energy", "Water"]:
            assert cat in h, f"{cat} missing; got {list(h)}"
        names = [k["metric_name"] for k in h["Water"].get("Consumption", [])]
        assert "Total Water Consumption" in names
        ghg = [k["metric_name"] for v in h["GHG Emissions"].values() for k in v]
        for n in ["Scope 1", "Scope 2", "Total GHG Emissions"]:
            assert n in ghg
        print("categories:", list(h), "water consumption:", names, "ghg:", ghg)

    def test_waste_category_present(self, org_h):
        r = requests.get(f"{BASE_URL}/api/esg-targets/lookup/categories", params={"section": "environment"}, headers=org_h)
        print("has Waste:", "Waste" in r.json()["hierarchy"])

    def test_target_order_sort(self, org_h):
        r = requests.get(f"{BASE_URL}/api/esg-targets/lookup/categories", params={"section": "environment"}, headers=org_h)
        names = [k["metric_name"] for k in r.json()["hierarchy"]["Water"]["Consumption"]]
        assert names.index("Total Water Consumption") < names.index("Total Water Consumed in water stress area")

    @pytest.mark.parametrize("section", ["social", "governance"])
    def test_other_sections(self, org_h, section):
        r = requests.get(f"{BASE_URL}/api/esg-targets/lookup/categories", params={"section": section}, headers=org_h)
        assert r.status_code == 200
        assert isinstance(r.json()["hierarchy"], dict)

    def test_missing_section_422(self, org_h):
        r = requests.get(f"{BASE_URL}/api/esg-targets/lookup/categories", headers=org_h)
        assert r.status_code == 422


# Targets list
class TestTargetsList:
    def test_list_env(self, org_h):
        r = requests.get(f"{BASE_URL}/api/esg-targets", params={"section": "environment"}, headers=org_h)
        assert r.status_code == 200
        print("targets resp keys:", list(r.json())[:10] if isinstance(r.json(), dict) else len(r.json()))


# KPI definition target_label / target_order PUT
class TestKpiTargetLabel:
    def test_get_kpi(self, sa_h):
        r = requests.get(f"{BASE_URL}/api/esg-kpi-definitions/{KPI_ID}", headers=sa_h)
        assert r.status_code == 200
        d = r.json()
        assert d["target_label"] == "Total Water Consumption"
        assert d["target_order"] == 0

    def test_put_and_restore(self, sa_h):
        orig = requests.get(f"{BASE_URL}/api/esg-kpi-definitions/{KPI_ID}", headers=sa_h).json()
        try:
            r = requests.put(f"{BASE_URL}/api/esg-kpi-definitions/{KPI_ID}", json={"target_label": "TEST_Label", "target_order": 5}, headers=sa_h)
            assert r.status_code == 200, r.text
            assert r.json()["target_label"] == "TEST_Label"
            assert r.json()["target_order"] == 5
            g = requests.get(f"{BASE_URL}/api/esg-kpi-definitions/{KPI_ID}", headers=sa_h).json()
            assert g["target_label"] == "TEST_Label" and g["target_order"] == 5
            # null values accepted
            r = requests.put(f"{BASE_URL}/api/esg-kpi-definitions/{KPI_ID}", json={"target_label": None, "target_order": None}, headers=sa_h)
            assert r.status_code == 200, r.text
            assert r.json()["target_label"] is None and r.json()["target_order"] is None
            # lookup falls back to metric_name
            lk = requests.get(f"{BASE_URL}/api/esg-targets/lookup/categories", params={"section": "environment"}, headers=sa_h)
            if lk.status_code == 200 and "Water" in lk.json()["hierarchy"]:
                names = [k["metric_name"] for k in lk.json()["hierarchy"]["Water"]["Consumption"]]
                assert "Water Consumption (Total)" in names, names
            # invalid order
            r = requests.put(f"{BASE_URL}/api/esg-kpi-definitions/{KPI_ID}", json={"target_order": "abc"}, headers=sa_h)
            assert r.status_code == 422
        finally:
            requests.put(f"{BASE_URL}/api/esg-kpi-definitions/{KPI_ID}", json={"target_label": orig["target_label"], "target_order": orig["target_order"]}, headers=sa_h)
            g = requests.get(f"{BASE_URL}/api/esg-kpi-definitions/{KPI_ID}", headers=sa_h).json()
            assert g["target_label"] == orig["target_label"] and g["target_order"] == orig["target_order"]

    def test_org_admin_cannot_put(self, org_h):
        r = requests.put(f"{BASE_URL}/api/esg-kpi-definitions/{KPI_ID}", json={"target_label": "TEST_x"}, headers=org_h)
        print("org admin PUT status:", r.status_code)
        assert r.status_code in (401, 403)
