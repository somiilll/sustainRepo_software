"""
End-to-end test for cascade_delete_organization and cascade_delete_facility.

Creates synthetic org + facilities + emissions + sinks + users + uploaded_files
directly in MongoDB, runs the cascade delete, then asserts no orphan remains.

R2 is mocked so we don't hit Cloudflare.
"""

import asyncio
import os
import sys
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from cascade_delete import (
    cascade_delete_organization,
    cascade_delete_facility,
    collect_file_ids_from_docs,
)


class FakeR2:
    def __init__(self, fail_keys=None):
        self.deleted = []
        self.fail_keys = set(fail_keys or [])

    async def delete_file(self, bucket_type, key):
        if key in self.fail_keys:
            raise RuntimeError("simulated R2 failure")
        self.deleted.append((bucket_type, key))
        return True


def gen_file_record(file_id, uploaded_by="user-1"):
    return {
        "id": file_id,
        "original_filename": f"{file_id}.pdf",
        "stored_filename": f"path/{file_id}.pdf",
        "bucket_name": "ghg-emissions-evidence-dev",
        "bucket_type": "emission_evidence",
        "r2_key": f"path/{file_id}.pdf",
        "file_size": 100,
        "content_type": "application/pdf",
        "uploaded_by": uploaded_by,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }


async def setup_fixture(db, org_id, facility_id, other_org_id, other_facility_id):
    """Create two orgs + facilities with overlapping IDs to ensure isolation."""
    # Target org
    await db.organizations.insert_one({
        "id": org_id,
        "name": "Target Org",
        "corporate_address": "x",
        "logo": f"/api/files/file-org-logo/view",
        "attachments": [{"name": "a1.pdf", "url": f"/api/files/file-org-att1", "file_id": "file-org-att1"}],
        "invoice_history": [{"date": "2024-01-01", "url": f"/api/files/file-inv-1/view", "amount": 100}],
        "is_active": True,
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.facilities.insert_one({
        "id": facility_id,
        "organization_id": org_id,
        "name": "Target Facility",
        "address": "x",
        "attachments": [{"name": "f1.pdf", "url": "/api/files/file-fac-att1"}],
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.emission_records.insert_many([
        {
            "id": "em-1",
            "organization_id": org_id,
            "facility_id": facility_id,
            "reporting_period": "2024-01",
            "scope": "scope1",
            "category": "stationary",
            "sub_category": "diesel",
            "quantity": 10.0,
            "emission_factor": 2.5,
            "unit": "kg",
            "total_emissions": 25.0,
            "evidence_url": "/api/files/file-em-ev1/view,/api/files/file-em-ev2/view",
        },
        {
            "id": "em-2",
            "organization_id": org_id,
            "facility_id": facility_id,
            "reporting_period": "2024-02",
            "scope": "scope1",
            "category": "stationary",
            "sub_category": "diesel",
            "quantity": 5.0,
            "emission_factor": 2.5,
            "unit": "kg",
            "total_emissions": 12.5,
        },
    ])
    await db.emission_history.insert_one({
        "id": "hist-1",
        "record_id": "em-1",
        "action": "create",
        "changed_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.sinks.insert_one({
        "id": "sink-1",
        "organization_id": org_id,
        "facility_id": facility_id,
        "reporting_year": "2024",
        "reporting_month": 0,
        "total_emissions_reduced": 3.0,
        "evidence_files": [{"name": "e.pdf", "url": "/api/files/file-sink-ev1", "file_id": "file-sink-ev1"}],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.base_year_emissions.insert_one({
        "id": "bye-1",
        "organization_id": org_id,
        "facility_id": facility_id,
        "base_year": 2023,
    })
    await db.users.insert_many([
        {"id": "target-user-1", "organization_id": org_id, "email": "u1@target.test", "role": "user", "is_active": True},
        {"id": "target-user-2", "organization_id": org_id, "email": "u2@target.test", "role": "admin", "is_active": True},
    ])
    await db.password_resets.insert_one({"id": "pr-1", "user_id": "target-user-1", "token": "abc"})
    # Orphan file uploaded by org user (not referenced by any doc)
    await db.uploaded_files.insert_many([
        gen_file_record("file-org-logo", uploaded_by="target-user-1"),
        gen_file_record("file-org-att1", uploaded_by="target-user-1"),
        gen_file_record("file-inv-1", uploaded_by="target-user-1"),
        gen_file_record("file-fac-att1", uploaded_by="target-user-1"),
        gen_file_record("file-em-ev1", uploaded_by="target-user-1"),
        gen_file_record("file-em-ev2", uploaded_by="target-user-1"),
        gen_file_record("file-sink-ev1", uploaded_by="target-user-1"),
        gen_file_record("file-orphan", uploaded_by="target-user-1"),
    ])

    # Sibling org — must NOT be touched by cascade
    await db.organizations.insert_one({
        "id": other_org_id,
        "name": "Other Org",
        "corporate_address": "y",
        "is_active": True,
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.facilities.insert_one({
        "id": other_facility_id,
        "organization_id": other_org_id,
        "name": "Other Facility",
        "address": "y",
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.emission_records.insert_one({
        "id": "other-em-1",
        "organization_id": other_org_id,
        "facility_id": other_facility_id,
        "reporting_period": "2024-01",
        "scope": "scope1",
        "category": "stationary",
        "sub_category": "diesel",
        "quantity": 1.0,
        "emission_factor": 1.0,
        "unit": "kg",
        "total_emissions": 1.0,
    })
    await db.users.insert_one({"id": "other-user-1", "organization_id": other_org_id, "email": "o@other.test", "role": "user"})
    await db.uploaded_files.insert_one(gen_file_record("file-other-1", uploaded_by="other-user-1"))


async def run_org_cascade_test():
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]

    org_id = "cascade-test-org-1"
    facility_id = "cascade-test-fac-1"
    other_org_id = "cascade-test-org-2"
    other_facility_id = "cascade-test-fac-2"

    # Clean any previous run
    for col in ["organizations", "facilities", "emission_records", "emission_history",
                "sinks", "base_year_emissions", "base_year_emissions_deletions",
                "users", "password_resets", "uploaded_files"]:
        await db[col].delete_many({"id": {"$regex": "^(cascade-test|em-1|em-2|other-em|hist-|sink-1|bye-|pr-1|target-user|other-user|file-)"}})

    await setup_fixture(db, org_id, facility_id, other_org_id, other_facility_id)

    r2 = FakeR2(fail_keys={"path/file-em-ev2.pdf"})  # simulate one failure
    result = await cascade_delete_organization(db, r2, org_id)

    assert result["found"] is True
    dc = result["deleted_counts"]
    print("Cascade org result:", dc)
    assert dc["facilities"] == 1
    assert dc["emission_records"] == 2
    assert dc["emission_history"] == 1
    assert dc["sinks"] == 1
    assert dc["base_year_emissions"] == 1
    assert dc["users"] == 2
    assert dc["password_resets"] == 1
    assert dc["uploaded_files_db"] == 8  # 7 referenced + 1 orphan
    assert dc["r2_files_deleted"] == 7  # 8 - 1 simulated failure
    assert dc["r2_files_failed"] == 1

    # Verify nothing left for target org
    assert await db.organizations.find_one({"id": org_id}) is None
    assert await db.facilities.count_documents({"organization_id": org_id}) == 0
    assert await db.emission_records.count_documents({"organization_id": org_id}) == 0
    assert await db.emission_records.count_documents({"facility_id": facility_id}) == 0
    assert await db.emission_history.count_documents({"record_id": "em-1"}) == 0
    assert await db.sinks.count_documents({"facility_id": facility_id}) == 0
    assert await db.base_year_emissions.count_documents({"organization_id": org_id}) == 0
    assert await db.users.count_documents({"organization_id": org_id}) == 0
    assert await db.password_resets.count_documents({"user_id": "target-user-1"}) == 0
    assert await db.uploaded_files.count_documents({"uploaded_by": "target-user-1"}) == 0

    # Verify other org intact
    assert await db.organizations.find_one({"id": other_org_id}) is not None
    assert await db.facilities.count_documents({"organization_id": other_org_id}) == 1
    assert await db.emission_records.count_documents({"organization_id": other_org_id}) == 1
    assert await db.users.count_documents({"organization_id": other_org_id}) == 1
    assert await db.uploaded_files.find_one({"id": "file-other-1"}) is not None

    # Cleanup sibling records
    await db.organizations.delete_one({"id": other_org_id})
    await db.facilities.delete_one({"id": other_facility_id})
    await db.emission_records.delete_one({"id": "other-em-1"})
    await db.users.delete_one({"id": "other-user-1"})
    await db.uploaded_files.delete_one({"id": "file-other-1"})

    print("✅ cascade_delete_organization test passed")
    client.close()


async def run_facility_cascade_test():
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]

    org_id = "fac-test-org-1"
    facility_id = "fac-test-fac-1"
    sibling_facility_id = "fac-test-fac-2"

    # Clean
    for col in ["organizations", "facilities", "emission_records", "emission_history",
                "sinks", "base_year_emissions", "uploaded_files"]:
        await db[col].delete_many({"id": {"$regex": "^(fac-test|fem-|fhist-|fsink-|fbye-|ffile-)"}})

    await db.organizations.insert_one({
        "id": org_id, "name": "Facility Test Org", "corporate_address": "x",
        "is_active": True, "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.facilities.insert_many([
        {
            "id": facility_id,
            "organization_id": org_id,
            "name": "Target Fac",
            "address": "x",
            "attachments": [{"name": "f.pdf", "url": "/api/files/ffile-fac-att1"}],
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": sibling_facility_id,
            "organization_id": org_id,
            "name": "Sibling Fac",
            "address": "y",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    ])
    await db.emission_records.insert_many([
        {"id": "fem-1", "organization_id": org_id, "facility_id": facility_id,
         "reporting_period": "2024-01", "scope": "scope1", "category": "c",
         "sub_category": "sc", "quantity": 1.0, "emission_factor": 1.0, "unit": "kg",
         "total_emissions": 1.0, "evidence_url": "/api/files/ffile-em-ev1/view"},
        {"id": "fem-2", "organization_id": org_id, "facility_id": sibling_facility_id,
         "reporting_period": "2024-01", "scope": "scope1", "category": "c",
         "sub_category": "sc", "quantity": 1.0, "emission_factor": 1.0, "unit": "kg",
         "total_emissions": 1.0},
    ])
    await db.emission_history.insert_one({"id": "fhist-1", "record_id": "fem-1", "action": "create"})
    await db.sinks.insert_one({
        "id": "fsink-1", "organization_id": org_id, "facility_id": facility_id,
        "reporting_year": "2024", "reporting_month": 0, "total_emissions_reduced": 1.0,
        "evidence_files": [{"file_id": "ffile-sink-ev1"}],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.base_year_emissions.insert_one({"id": "fbye-1", "organization_id": org_id, "facility_id": facility_id, "base_year": 2023})
    await db.uploaded_files.insert_many([
        gen_file_record("ffile-fac-att1"),
        gen_file_record("ffile-em-ev1"),
        gen_file_record("ffile-sink-ev1"),
    ])

    r2 = FakeR2()
    result = await cascade_delete_facility(db, r2, facility_id)

    assert result["found"] is True
    dc = result["deleted_counts"]
    print("Cascade facility result:", dc)
    assert dc["emission_records"] == 1
    assert dc["emission_history"] == 1
    assert dc["sinks"] == 1
    assert dc["base_year_emissions"] == 1
    assert dc["uploaded_files_db"] == 3
    assert dc["r2_files_deleted"] == 3

    # Sibling facility / its emission must remain
    assert await db.facilities.find_one({"id": sibling_facility_id}) is not None
    assert await db.emission_records.find_one({"id": "fem-2"}) is not None

    # Cleanup
    await db.organizations.delete_one({"id": org_id})
    await db.facilities.delete_one({"id": sibling_facility_id})
    await db.emission_records.delete_one({"id": "fem-2"})
    print("✅ cascade_delete_facility test passed")
    client.close()


def run_unit_extract_test():
    # Absolute URL
    assert collect_file_ids_from_docs([{"logo": "https://x.com/api/files/abc-123/view"}], ["logo"]) == ["abc-123"]
    # Comma separated
    assert sorted(collect_file_ids_from_docs(
        [{"evidence_url": "/api/files/a/view,/api/files/b/download"}], ["evidence_url"])
    ) == ["a", "b"]
    # Nested list with file_id
    assert collect_file_ids_from_docs(
        [{"attachments": [{"url": "/api/files/c/view"}, {"file_id": "d"}]}], ["attachments"]
    ) == ["c", "d"]
    # Dedup
    assert collect_file_ids_from_docs([{"a": "/api/files/x"}, {"a": "/api/files/x"}], ["a"]) == ["x"]
    print("✅ file-id extraction unit tests passed")


async def main():
    run_unit_extract_test()
    await run_org_cascade_test()
    await run_facility_cascade_test()


if __name__ == "__main__":
    asyncio.run(main())
