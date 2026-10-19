from modules.organizations.contracts import OrganizationCreate
from modules.sustainability_config.service import normalize_organization_settings


def test_normalize_organization_settings_treats_null_frameworks_as_empty():
    settings = normalize_organization_settings({"esg_frameworks_enabled": None})

    assert settings["esg_frameworks_enabled"] == []


def test_new_organization_defaults_frameworks_to_empty_list():
    organization = OrganizationCreate(
        name="Test organization",
        corporate_address="Test address",
        subscription_expires_at="2026-12-31",
    )

    assert organization.esg_frameworks_enabled == []


def test_new_organization_accepts_legacy_null_frameworks_as_empty_list():
    organization = OrganizationCreate(
        name="Test organization",
        corporate_address="Test address",
        subscription_expires_at="2026-12-31",
        esg_frameworks_enabled=None,
    )

    assert organization.esg_frameworks_enabled == []