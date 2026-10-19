from modules.supplier_assessment.service import supplier_service


def test_question_importance_weights_are_limited_to_low_medium_and_high():
    assert supplier_service.IMPORTANCE_WEIGHTS == {"low": 1.0, "medium": 2.0, "high": 3.0}


def test_legacy_critical_importance_resolves_as_high():
    importance, exact_weight, weight = supplier_service._resolve_question_weight("critical", None, None)

    assert (importance, exact_weight, weight) == ("high", None, 3.0)