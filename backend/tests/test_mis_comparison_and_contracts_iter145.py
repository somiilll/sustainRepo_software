"""Pure-code regression assertions for MIS comparison and PDF/service contracts."""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from modules.mis_reports.service import comparison_status, target_direction_and_status
from modules.mis_reports import pdf_builder
from modules.mis_reports import service as mis_service


# Module: MIS comparison_status semantics
def test_comparison_status_zero_baseline_returns_new_activity_message():
    change, status = comparison_status(32.04, 0, "lower")
    assert change is None
    assert status == "New activity / No comparable baseline"


# Module: MIS comparison_status large period-over-period warning text
def test_comparison_status_large_increase_returns_review_recommended_message():
    change, status = comparison_status(12419.82, 686.42, "lower")
    assert change is not None and change > 100
    assert status == "Large period-over-period change — review recommended"


# Module: MIS comparison_status target direction behavior
def test_comparison_status_renewable_higher_behaves_opposite_to_energy_lower():
    _, energy_status = comparison_status(120.0, 100.0, "lower")
    _, renewable_status = comparison_status(120.0, 100.0, "higher")
    assert energy_status == "Needs attention"
    assert renewable_status == "Improving"


# Module: Target direction + status classification
def test_target_direction_missing_explicit_direction_returns_direction_required():
    direction, status = target_direction_and_status(10, 12, None)
    assert direction == "Not configured"
    assert status == "Direction required"


# Module: Target direction + status increase/decrease rules
def test_target_direction_changes_status_for_increase_and_decrease_goals():
    decrease_direction, decrease_status = target_direction_and_status(90, 100, "decrease")
    increase_direction, increase_status = target_direction_and_status(90, 100, "increase")
    assert decrease_direction == "decrease"
    assert decrease_status == "On Track"
    assert increase_direction == "increase"
    assert increase_status == "At Risk"


# Module: PDF builder executive summary contract wording and columns
def test_pdf_builder_contract_contains_required_management_table_content():
    source = Path(pdf_builder.__file__).read_text(encoding="utf-8")
    assert "Management metric" in source
    assert "Current" in source
    assert "Previous comparable period" in source
    assert "Overall ESG Management Status" in source
    assert "Anomaly — investigate" not in source


# Module: PDF builder EWW unit rows contract
def test_pdf_builder_contract_contains_row_level_units_for_energy_water_waste():
    source = Path(pdf_builder.__file__).read_text(encoding="utf-8")
    assert '"Waste Generated"' in source and '"kg"' in source
    assert '"Waste Recovery"' in source and '"%"' in source
    assert '"Water Consumption"' in source and '"KL"' in source
    assert '"Energy Consumption"' in source and '"MWh"' in source


# Module: MIS service contract for management status and facility comparison status fields
def test_service_contract_has_overall_management_and_facility_status_fields():
    source = Path(mis_service.__file__).read_text(encoding="utf-8")
    assert "overall_management_status" in source
    assert '"status": status' in source
