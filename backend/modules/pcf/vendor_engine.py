"""Read-only access to the uploaded PCF engine package."""
from dataclasses import dataclass
from functools import lru_cache
import importlib.util
import json
from pathlib import Path
import sys


VENDOR_ROOT = Path(__file__).resolve().parents[3] / "vendor" / "pcf-package"
WORKSPACE_TEMPLATE = VENDOR_ROOT / "templates" / "index.html"


@dataclass(frozen=True)
class PCFEngineBundle:
    factors_db: object
    calculator: object
    matcher: object
    pcf_input_type: type
    match_request_type: type
    exporter_type: type


def _load_vendor_package() -> None:
    if not VENDOR_ROOT.is_dir() or not WORKSPACE_TEMPLATE.is_file():
        raise RuntimeError("The preserved PCF package is not available")
    sys.dont_write_bytecode = True
    vendor_path = str(VENDOR_ROOT)
    if vendor_path not in sys.path:
        sys.path.insert(0, vendor_path)


@lru_cache(maxsize=1)
def get_pcf_engine() -> PCFEngineBundle:
    _load_vendor_package()
    from pcf_engine import EmissionFactorsDB, MatchRequest, PCFCalculator, PCFExporter, PCFInput, UnifiedMatchingEngine

    factors_db = EmissionFactorsDB()
    return PCFEngineBundle(
        factors_db=factors_db,
        calculator=PCFCalculator(factors_db=factors_db),
        matcher=UnifiedMatchingEngine(factors_db=factors_db),
        pcf_input_type=PCFInput,
        match_request_type=MatchRequest,
        exporter_type=PCFExporter,
    )


def get_workspace_template() -> str:
    _load_vendor_package()
    return WORKSPACE_TEMPLATE.read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def get_sample_input() -> dict:
    """Call the preserved sample-data producer without changing its source."""
    _load_vendor_package()
    source_path = VENDOR_ROOT / "app.py"
    specification = importlib.util.spec_from_file_location("_preserved_pcf_sample_app", source_path)
    if not specification or not specification.loader:
        raise RuntimeError("The preserved PCF sample source could not be loaded")
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    response = __import__("asyncio").run(module.get_sample_data())
    return json.loads(response.body)