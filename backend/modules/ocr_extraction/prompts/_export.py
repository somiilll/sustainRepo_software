"""Writes the exact prompts and JSON schemas the engine uses into this folder (run after changing them in code).

    py -3.11 prompts/_export.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "engine"))
from extractor_core import extract, layout  # noqa: E402
from extractor_core.config import load  # noqa: E402
from extractor_core.decider.cascade import DIRECTION_Q, USE_CONTEXT_Q  # noqa: E402

(HERE / "invoice_extraction.system.txt").write_text(extract.SYSTEM, encoding="utf-8")
(HERE / "invoice_extraction.schema.json").write_text(json.dumps(extract.schema(), indent=2), encoding="utf-8")
(HERE / "excel_layout.system.txt").write_text(layout.LAYOUT_SYSTEM, encoding="utf-8")
(HERE / "excel_layout.schema.json").write_text(json.dumps(layout._layout_schema(), indent=2), encoding="utf-8")
tax = load().taxonomy
(HERE / "classifier_questions.json").write_text(json.dumps({
    "_about": "Stage 1 asks domain + use_context + freight_direction in one call; stage 2 asks 'activity' with only the "
              "chosen domain's activities (skipped when the rules already picked an activity in that domain). The 'state' "
              "text is built by decider/cascade.build_state from the extracted line.",
    "stage_1": {
        "domain": {"instructions": "Which kind of activity is this line item?", "choices": tax.domains},
        "use_context": {"instructions": "If this is a fuel, where was it burned? (choose the closest even if not a fuel)", "choices": USE_CONTEXT_Q},
        "freight_direction": {"instructions": "If this is goods transport, which direction and who pays?", "choices": DIRECTION_Q},
    },
    "stage_2_activity_choices_by_domain": {d: {a["id"]: a["label"] for a in acts} for d, acts in tax.by_domain.items()},
    "example_state": "Item: HSD for DG set. Item as printed: HSD (High Speed Diesel). HSN/SAC code: 27101944. Quantity: 500 L. "
                     "Amount: 45000 INR. Vendor: Indian Oil Corporation. Source: tax_invoice from Indian Oil Corporation",
}, indent=1, ensure_ascii=False), encoding="utf-8")
print("prompts exported")
