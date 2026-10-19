"""
Backend tests for Materiality Assessment Module (Phase 1)
Covers GRI topics master, assessment CRUD, scoring, override, matrix, integration codes.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "goyalsomil2001@gmail.com"
PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def gri_topics(client):
    r = client.get(f"{API}/materiality/topics?framework=GRI", timeout=30)
    assert r.status_code == 200
    data = r.json()
    if data["total"] < 36:
        # seed
        seed = client.post(f"{API}/materiality/topics/seed", timeout=30)
        assert seed.status_code == 200
        r = client.get(f"{API}/materiality/topics?framework=GRI", timeout=30)
        data = r.json()
    return data["topics"]


# ---------------- Topics master ----------------
class TestTopicsMaster:
    def test_gri_topics_count_36(self, gri_topics):
        assert len(gri_topics) >= 36, f"Expected >=36 GRI topics, got {len(gri_topics)}"

    def test_gri_topics_codes_range(self, gri_topics):
        codes = {t["topic_code"] for t in gri_topics}
        for expected in ["101", "102", "201", "302", "305", "403", "418"]:
            assert expected in codes, f"Missing GRI code {expected}"

    def test_gri_topic_shape(self, gri_topics):
        t = gri_topics[0]
        for key in ["id", "topic_code", "topic_name", "framework", "category", "is_active"]:
            assert key in t
        assert t["framework"] == "GRI"
        assert t["category"] in ("Environmental", "Social", "Governance")


# ---------------- Assessment CRUD ----------------
class TestAssessmentCRUD:
    reporting_year = "TEST_FY_2099"
    assessment_id = None

    def test_create_assessment(self, client):
        # cleanup if existing
        existing = client.get(f"{API}/materiality/assessments/by-year/{self.__class__.reporting_year}")
        if existing.status_code == 200:
            client.delete(f"{API}/materiality/assessments/{existing.json()['id']}")

        r = client.post(f"{API}/materiality/assessments", json={
            "reporting_year": self.__class__.reporting_year,
            "name": "TEST Materiality Assessment",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["reporting_year"] == self.__class__.reporting_year
        assert data["business_cutoff"] == 3.0
        assert data["stakeholder_cutoff"] == 3.0
        assert data["status"] == "draft"
        TestAssessmentCRUD.assessment_id = data["id"]

    def test_duplicate_year_rejected(self, client):
        r = client.post(f"{API}/materiality/assessments", json={
            "reporting_year": self.__class__.reporting_year,
        })
        assert r.status_code == 400

    def test_get_assessment(self, client):
        r = client.get(f"{API}/materiality/assessments/{TestAssessmentCRUD.assessment_id}")
        assert r.status_code == 200
        d = r.json()
        assert "total_topics" in d and "scored_topics" in d and "material_topics" in d


# ---------------- Scoring + override ----------------
class TestScoringWorkflow:
    reporting_year = "TEST_FY_SCORING_2099"
    assessment_id = None
    topic_id = None
    topic_code = None

    def test_setup_assessment(self, client, gri_topics):
        # Cleanup
        existing = client.get(f"{API}/materiality/assessments/by-year/{self.__class__.reporting_year}")
        if existing.status_code == 200:
            client.delete(f"{API}/materiality/assessments/{existing.json()['id']}")

        r = client.post(f"{API}/materiality/assessments", json={
            "reporting_year": self.__class__.reporting_year,
            "name": "TEST Scoring",
        })
        assert r.status_code == 200
        TestScoringWorkflow.assessment_id = r.json()["id"]

        # Add 3 topics
        pick = [t for t in gri_topics if t["topic_code"] in ("302", "305", "403")]
        assert len(pick) == 3
        TestScoringWorkflow.topic_id = pick[0]["id"]  # 302 or first
        TestScoringWorkflow.topic_code = pick[0]["topic_code"]
        r = client.post(
            f"{API}/materiality/assessments/{TestScoringWorkflow.assessment_id}/topics",
            json={"topic_ids": [t["id"] for t in pick]},
        )
        assert r.status_code == 200
        assert r.json()["added"] == 3

    def test_get_assessment_topics(self, client):
        r = client.get(f"{API}/materiality/assessments/{TestScoringWorkflow.assessment_id}/topics")
        assert r.status_code == 200
        assert r.json()["total"] == 3

    def test_score_material(self, client):
        """business=4.5, stakeholder=4.2, cutoffs=3.0 => material"""
        r = client.put(
            f"{API}/materiality/assessments/{TestScoringWorkflow.assessment_id}/topics/{TestScoringWorkflow.topic_id}/score",
            json={"topic_id": TestScoringWorkflow.topic_id, "business_score": 4.5, "stakeholder_score": 4.2, "source": "manual"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["business_score"] == 4.5
        assert d["stakeholder_score"] == 4.2
        assert d["auto_status"] == "material"
        assert d["final_status"] == "material"
        assert d["is_material"] is True

    def test_score_monitor(self, client, gri_topics):
        # Score topic 305 with 4.0 business, 2.0 stakeholder => monitor
        t305 = next(t for t in gri_topics if t["topic_code"] == "305")
        r = client.put(
            f"{API}/materiality/assessments/{TestScoringWorkflow.assessment_id}/topics/{t305['id']}/score",
            json={"topic_id": t305["id"], "business_score": 4.0, "stakeholder_score": 2.0, "source": "manual"},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["auto_status"] == "monitor"
        assert d["is_material"] is False

    def test_score_non_material(self, client, gri_topics):
        t403 = next(t for t in gri_topics if t["topic_code"] == "403")
        r = client.put(
            f"{API}/materiality/assessments/{TestScoringWorkflow.assessment_id}/topics/{t403['id']}/score",
            json={"topic_id": t403["id"], "business_score": 1.5, "stakeholder_score": 2.0, "source": "manual"},
        )
        assert r.status_code == 200
        assert r.json()["auto_status"] == "non_material"

    def test_override_flip_to_material(self, client, gri_topics):
        """Override a non-material topic to be material"""
        t403 = next(t for t in gri_topics if t["topic_code"] == "403")
        r = client.put(
            f"{API}/materiality/assessments/{TestScoringWorkflow.assessment_id}/topics/{t403['id']}/override",
            json={"is_material": True, "override_reason": "TEST regulatory driver"},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["has_override"] is True
        assert d["final_status"] == "material"
        assert d["is_material"] is True
        assert d["auto_status"] == "non_material"  # auto unchanged

    def test_clear_override(self, client, gri_topics):
        t403 = next(t for t in gri_topics if t["topic_code"] == "403")
        r = client.delete(
            f"{API}/materiality/assessments/{TestScoringWorkflow.assessment_id}/topics/{t403['id']}/override"
        )
        assert r.status_code == 200
        d = r.json()
        assert d["has_override"] is False
        assert d["final_status"] == "non_material"
        assert d["is_material"] is False

    def test_matrix_data(self, client):
        r = client.get(f"{API}/materiality/assessments/{TestScoringWorkflow.assessment_id}/matrix")
        assert r.status_code == 200
        d = r.json()
        assert "data" in d and "cutoffs" in d and "scale" in d
        assert d["cutoffs"]["business"] == 3.0
        assert len(d["data"]) == 3  # all 3 scored

    def test_final_topics(self, client):
        r = client.get(f"{API}/materiality/assessments/{TestScoringWorkflow.assessment_id}/final-topics")
        assert r.status_code == 200
        codes = [t["topic_code"] for t in r.json()["topics"]]
        # only 302 is material (4.5, 4.2)
        assert TestScoringWorkflow.topic_code in codes

    def test_material_codes_org_integration(self, client):
        r = client.get(f"{API}/materiality/material-topics?reporting_year={TestScoringWorkflow.reporting_year}")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["topic_codes"], list)
        assert TestScoringWorkflow.topic_code in d["topic_codes"]

    def test_update_cutoffs_recalculates(self, client, gri_topics):
        """Raise cutoffs to 5 => nothing material anymore"""
        r = client.put(
            f"{API}/materiality/assessments/{TestScoringWorkflow.assessment_id}",
            json={"business_cutoff": 5.0, "stakeholder_cutoff": 5.0},
        )
        assert r.status_code == 200
        # Verify recalculated
        topics_r = client.get(f"{API}/materiality/assessments/{TestScoringWorkflow.assessment_id}/topics")
        for t in topics_r.json()["topics"]:
            assert t["is_material"] is False, f"Topic {t['topic_code']} still material after raising cutoff"

    def test_cleanup(self, client):
        client.delete(f"{API}/materiality/assessments/{TestScoringWorkflow.assessment_id}")
