def test_document_progress_dedupes_program_and_explicit_assignments_by_version():
    requirements = [
        {"id": "program-nda", "document_version_id": "nda-v1", "supplier_relationship_ids": []},
        {"id": "supplier-nda", "document_version_id": "nda-v1", "supplier_relationship_ids": ["supplier-1"]},
        {"id": "program-coc", "document_version_id": "coc-v1", "supplier_relationship_ids": []},
    ]

    selected = {}
    for requirement in requirements:
        document_key = requirement["document_version_id"]
        current = selected.get(document_key)
        is_explicit = "supplier-1" in requirement["supplier_relationship_ids"]
        current_is_explicit = current and "supplier-1" in current["supplier_relationship_ids"]
        if not current or (is_explicit and not current_is_explicit):
            selected[document_key] = requirement

    assert [requirement["id"] for requirement in selected.values()] == ["supplier-nda", "program-coc"]