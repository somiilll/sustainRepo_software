from modules.esg_records.service import previous_applied_version


def _version(version, values, *, applied=True):
    return {
        "version": version,
        "snapshot": {"field_values": values},
        "record_was_changed": applied,
    }


def test_direct_update_uses_prior_applied_snapshot_not_rejected_proposal_preview():
    direct_update = _version(3, {"location_of_spill": "India", "volume_of_spill": 3782})
    rejected_preview = _version(2, {"location_of_spill": "", "volume_of_spill": 3789}, applied=False)
    approved_update = _version(2, {"location_of_spill": "India", "volume_of_spill": 3789})
    versions = [direct_update, rejected_preview, approved_update]

    baseline = previous_applied_version(versions, 0)

    assert baseline is approved_update
    assert baseline["snapshot"]["field_values"]["location_of_spill"] == "India"
    assert baseline["snapshot"]["field_values"]["volume_of_spill"] == 3789