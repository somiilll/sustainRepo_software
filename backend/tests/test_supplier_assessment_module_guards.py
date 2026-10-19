"""Focused safeguards: publishing must fail when module workflow is disabled in org config."""

import pytest

from modules.supplier_assessment import documents_service, training_service


@pytest.mark.asyncio
async def test_documents_publish_rejected_when_documents_workflow_disabled(monkeypatch):
    # Documents publish guard should block upload when org config disables documents.
    async def _disabled_documents(_org_id):
        return {"modules": {"documents": {"enabled": False}}}

    monkeypatch.setattr(
        documents_service.sustainability_config_service,
        "resolve_supplier_assessment_config",
        _disabled_documents,
    )

    with pytest.raises(ValueError, match="Enable the Documents module"):
        await documents_service.publish_agreement(
            customer_org_id="org-1",
            created_by="user-1",
            filename="nda.pdf",
            content_type="application/pdf",
            content=b"%PDF-1.4",
            title="NDA",
        )


@pytest.mark.asyncio
async def test_training_create_rejected_when_training_workflow_disabled(monkeypatch):
    # Training create guard should block assignment when org config disables training.
    async def _disabled_training(_org_id):
        return {"modules": {"training": {"enabled": False}}}

    monkeypatch.setattr(
        training_service.sustainability_config_service,
        "resolve_supplier_assessment_config",
        _disabled_training,
    )

    with pytest.raises(ValueError, match="Enable the Training module"):
        await training_service.create_training(
            org_id="org-1",
            user_id="user-1",
            title="Supplier Safety",
            description="desc",
            threshold=80,
            file_name="training.pdf",
            content_type="application/pdf",
            content=b"%PDF-1.4",
            relationship_ids=["relationship-1"],
        )
