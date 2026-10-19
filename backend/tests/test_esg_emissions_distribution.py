"""Backend tests: GHG emission proportional distribution in ESG analytics.

Covers quarterly/yearly period distribution feature added in
esg_analytics_service.emission_month_distribution. Also verifies the
non-emission series (water.recycled, workforce.employees) still work.
"""
import os
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    # fallback to frontend/.env for local pytest runs
    try:
        with open("/app/frontend/.env") as fh:
            for line in fh:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except FileNotFoundError:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()
EMAIL = "goyalsomil2001@gmail.com"
PASSWORD = "TestUser123!"
START = "2026-04"
END = "2027-03"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"no access_token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def analytics(token):
    r = requests.get(
        f"{BASE_URL}/api/dashboard/esg-analytics",
        params={"start_date": START, "end_date": END},
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
    )
    assert r.status_code == 200, f"analytics failed: {r.status_code} {r.text}"
    return r.json()


def test_emissions_has_12_months(analytics):
    emissions = analytics.get("emissions")
    assert isinstance(emissions, list), "emissions must be a list"
    assert len(emissions) == 12, f"expected 12 monthly rows, got {len(emissions)}"


def test_emissions_row_shape_and_periods(analytics):
    expected_periods = [
        "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
        "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
    ]
    got = [row["period"] for row in analytics["emissions"]]
    assert got == expected_periods, f"unexpected period ordering: {got}"

    for row in analytics["emissions"]:
        for field in ("scope1", "scope2", "scope3", "previousTotal"):
            assert field in row, f"missing '{field}' in {row}"
            assert isinstance(row[field], (int, float)), f"{field} not numeric in {row}"


def test_emissions_non_negative(analytics):
    for row in analytics["emissions"]:
        for field in ("scope1", "scope2", "scope3", "previousTotal"):
            assert row[field] >= 0, f"negative {field} in {row}"


def test_emissions_previous_total_populated(analytics):
    # At least one previousTotal should be populated (>0) given ORG1 has
    # historical monthly emission records. If all-zero, the previous-year
    # lookup is broken.
    prev_totals = [row["previousTotal"] for row in analytics["emissions"]]
    assert any(pt > 0 for pt in prev_totals), (
        f"no month had previousTotal > 0: {prev_totals}. "
        "Either previous-year data missing OR previousTotal wiring broken."
    )


def test_emissions_current_year_has_activity(analytics):
    # Sanity: at least one current-year month should have scope1+2+3 > 0
    totals = [row["scope1"] + row["scope2"] + row["scope3"] for row in analytics["emissions"]]
    assert any(t > 0 for t in totals), f"no month has any current emissions: {totals}"


def test_water_recycled_in_jun_jul(analytics):
    water = {row["period"]: row for row in analytics["water"]}
    assert "2026-06" in water and "2026-07" in water
    # From iteration_97 baseline
    assert water["2026-06"]["recycled"] == pytest.approx(21.22, rel=0, abs=0.05), water["2026-06"]
    assert water["2026-07"]["recycled"] == pytest.approx(3122.0, rel=0, abs=0.5), water["2026-07"]


def test_workforce_employees_carries_across_months(analytics):
    workforce = analytics["workforce"]
    assert len(workforce) == 12
    for row in workforce:
        assert row["employees"] == 698, f"expected employees=698 in {row}"


def test_energy_present(analytics):
    assert isinstance(analytics.get("energy"), list)
    assert len(analytics["energy"]) == 12
    for row in analytics["energy"]:
        assert "renewable" in row and "nonRenewable" in row


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
