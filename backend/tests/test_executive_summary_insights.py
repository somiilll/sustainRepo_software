"""Unit tests for the executive summary 13-month insight logic."""
import pytest
from modules.mis_reports.service import _compute_avg_with_count, _generate_insight


class TestComputeAvgWithCount:

    def test_normal_values(self):
        avg, count = _compute_avg_with_count([10, 20, 30])
        assert avg == 20.0
        assert count == 3

    def test_none_values_excluded(self):
        avg, count = _compute_avg_with_count([10, None, 30])
        assert avg == 20.0
        assert count == 2

    def test_all_none(self):
        avg, count = _compute_avg_with_count([None, None, None])
        assert avg is None
        assert count == 0

    def test_empty_list(self):
        avg, count = _compute_avg_with_count([])
        assert avg is None
        assert count == 0

    def test_zeros_included(self):
        avg, count = _compute_avg_with_count([0, 0, 30])
        assert avg == 10.0
        assert count == 3


class TestGenerateInsight:

    def test_increase_decrease_direction(self):
        result = _generate_insight(100, 50, "decrease")
        assert "Increased" in result["text"]
        assert result["color"] == "red"  # increase in a "decrease is better" metric

    def test_decrease_favourable(self):
        result = _generate_insight(25, 50, "decrease")
        assert "Decreased" in result["text"]
        assert result["color"] == "green"

    def test_increase_favourable_for_increase_metric(self):
        result = _generate_insight(100, 50, "increase")
        assert "Increased" in result["text"]
        assert result["color"] == "green"

    def test_decrease_bad_for_increase_metric(self):
        result = _generate_insight(25, 50, "increase")
        assert "Decreased" in result["text"]
        assert result["color"] == "red"

    def test_neutral_direction_amber_for_large(self):
        result = _generate_insight(150, 50, "neutral")
        assert result["color"] == "amber"

    def test_neutral_direction_grey_for_small(self):
        result = _generate_insight(55, 50, "neutral")
        assert result["color"] == "grey"

    def test_negligible_change(self):
        result = _generate_insight(100, 99.5, "decrease")
        assert "broadly in line" in result["text"]
        assert result["color"] == "grey"

    def test_current_none(self):
        result = _generate_insight(None, 50, "decrease")
        assert result["text"] == "No data available"
        assert result["color"] == "grey"

    def test_avg_none(self):
        result = _generate_insight(100, None, "decrease")
        assert "No meaningful" in result["text"]
        assert result["color"] == "grey"

    def test_avg_zero_current_nonzero(self):
        result = _generate_insight(100, 0, "decrease")
        assert "No meaningful" in result["text"]
        assert result["color"] == "grey"

    def test_avg_zero_current_zero(self):
        result = _generate_insight(0, 0, "decrease")
        assert "No activity" in result["text"]

    def test_current_zero_avg_nonzero(self):
        result = _generate_insight(0, 50, "decrease")
        assert "Decreased to 0" in result["text"]
        assert result["color"] == "green"  # decrease is good for "decrease" direction

    def test_current_zero_increase_direction(self):
        result = _generate_insight(0, 50, "increase")
        assert "Decreased to 0" in result["text"]
        assert result["color"] == "red"  # going to zero is bad for "increase" metric

    def test_months_count_reflected_in_text(self):
        result = _generate_insight(100, 50, "decrease", months_count=8)
        assert "8-month average" in result["text"]

    def test_variance_pct_returned(self):
        result = _generate_insight(150, 100, "decrease")
        assert result["variance_pct"] == 50.0
