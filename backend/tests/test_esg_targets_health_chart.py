# ESG Targets redesign: with-progress `health`/`chart` fields + chart-data endpoint shape
import os
import subprocess
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
USER_ID = "e3e7ec7e-5b3d-4011-a752-40cd67be84c0"
HEALTH_VALUES = {"on_track", "at_risk", "breached", "no_data", None}


def _mint_refresh():
    cmd = ("cd /app/backend && set -a; . ./.env; set +a; python -c \"from shared.helpers.tokens import "
           f"create_refresh_token; print(create_refresh_token({{'sub':'{USER_ID}'}}))\"")
    return subprocess.check_output(["bash", "-c", cmd]).decode().strip()


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/refresh", headers={"Cookie": f"sustainrepo_refresh={_mint_refresh()}"})
    if r.status_code != 200:
        pytest.skip(f"auth refresh failed {r.status_code}")
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope="module")
def env_targets(client):
    r = client.get(f"{BASE_URL}/api/esg-targets/with-progress", params={"section": "environment"})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    return data


class TestWithProgress:
    def test_health_and_chart_fields(self, env_targets):
        assert len(env_targets) >= 1
        for t in env_targets:
            assert "health" in t and "chart" in t
            assert t["health"] in HEALTH_VALUES
            assert "_id" not in t
            if t.get("status") == "expired" or not t.get("kpi_id"):
                assert t["health"] is None and t["chart"] is None
            else:
                assert t["chart"]["chart_type"] in ("static", "monthly", "yearly", "yearly_cumulative", "none", "unknown")

    def test_static_target_breached(self, env_targets):
        st = [t for t in env_targets if t.get("tracking_mode") == "static" and t.get("chart")]
        assert st, "no static target"
        c = st[0]["chart"]
        for k in ("baseline_value", "current_value", "target_value", "progress_percentage", "unit"):
            assert k in c
        assert st[0]["health"] == "breached"
        assert c["progress_percentage"] < 0

    def test_static_header_progress_consistent_with_chart(self, env_targets):
        # header PROGRESS uses target.progress_percentage, banner uses chart.progress_percentage
        st = [t for t in env_targets if t.get("tracking_mode") == "static" and t.get("chart")][0]
        assert st["progress_percentage"] == st["chart"]["progress_percentage"], (
            f"list progress {st['progress_percentage']} != chart {st['chart']['progress_percentage']}")

    def test_monthly_target_chart(self, env_targets):
        mt = [t for t in env_targets if t.get("tracking_mode") == "monthly"]
        assert mt
        c = mt[0]["chart"]
        assert c["chart_type"] == "monthly"
        assert len(c["data"]) == 12
        assert [d["month"] for d in c["data"]][:2] == ["Apr", "May"]
        for d in c["data"]:
            for k in ("month", "actual", "target", "status", "is_current", "is_future"):
                assert k in d

    @pytest.mark.parametrize("section", ["social", "governance"])
    def test_other_sections(self, client, section):
        r = client.get(f"{BASE_URL}/api/esg-targets/with-progress", params={"section": section})
        assert r.status_code == 200
        assert isinstance(r.json(), list)


class TestChartDataEndpoint:
    def test_chart_data_matches_embedded_chart(self, client, env_targets):
        for t in env_targets:
            if not t.get("chart"):
                continue
            r = client.get(f"{BASE_URL}/api/esg-targets/{t['id']}/chart-data")
            assert r.status_code == 200
            assert r.json() == t["chart"]

    def test_chart_data_404(self, client):
        r = client.get(f"{BASE_URL}/api/esg-targets/nonexistent-id-xyz/chart-data")
        assert r.status_code == 404

    def test_unauthenticated(self):
        r = requests.get(f"{BASE_URL}/api/esg-targets/with-progress", params={"section": "environment"})
        assert r.status_code in (401, 403)
