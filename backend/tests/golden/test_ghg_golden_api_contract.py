"""
Golden regression: the GHG API contract must not change.

Freezes the field names and annotations of `EmissionRecordCreate`,
`EmissionRecordResponse` and `EmissionHistoryResponse`. The refactor is
explicitly forbidden from changing API contracts, so this is a cheap,
fast tripwire that runs without a database or a server.
"""
from __future__ import annotations

import pytest

from ghg_golden_support import API_CONTRACT_BASELINE, load_baseline

BASELINE = load_baseline(API_CONTRACT_BASELINE)

MODELS = ["EmissionRecordCreate", "EmissionRecordResponse", "EmissionHistoryResponse"]


def _live_fields(model_name: str):
    from modules.emissions import contracts

    model = getattr(contracts, model_name)
    return {name: str(f.annotation) for name, f in model.model_fields.items()}


@pytest.mark.parametrize("model_name", MODELS)
def test_model_field_names_unchanged(model_name):
    expected = BASELINE[model_name]
    actual = _live_fields(model_name)
    missing = sorted(set(expected) - set(actual))
    added = sorted(set(actual) - set(expected))
    assert not missing, f"{model_name} lost fields: {missing}"
    assert not added, (
        f"{model_name} gained fields: {added}. If this is intentional, re-run "
        "capture_ghg_baseline.py and record why in the phase report."
    )


@pytest.mark.parametrize("model_name", MODELS)
def test_model_field_types_unchanged(model_name):
    expected = BASELINE[model_name]
    actual = _live_fields(model_name)
    changed = {
        name: (expected[name], actual[name])
        for name in expected
        if name in actual and expected[name] != actual[name]
    }
    assert not changed, f"{model_name} field types changed: {changed}"
