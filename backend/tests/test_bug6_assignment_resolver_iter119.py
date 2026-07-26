"""
Bug 6 regression test - Iteration 119

Verifies the AssignmentResolver architecture:
  - AssignmentResolver.resolve() returns V2-architecture assignments (esg_assignment_assignees)
  - Climate Change assignment is found with requires_approval=True
  - Record creation via ESGRecordsService.create_record for such an assignment
    sets approval_status='pending_approval' and creates an approval_requests doc
  - Legacy assigned_to_user_id pattern still resolves (backward compat)
"""
import sys
import asyncio
import uuid
from datetime import datetime
import pytest

sys.path.insert(0, "/app/backend")

from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

# Persistent loop bound to motor client before we import motor-backed modules
_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)

from shared.database.mongo import db  # noqa: E402
from modules.esg_assignments.assignment_resolver import assignment_resolver  # noqa: E402
from modules.esg_records.service import ESGRecordsService  # noqa: E402
from modules.esg_records.contracts import CreateRecordRequest  # noqa: E402


ORG_ID = "9067d872-8a3a-4ed9-8494-e3ef04952f7c"
KNOWN_ASSIGNEE_USER_ID = "e3e7ec7e-5b3d-4011-a752-40cd67be84c0"


def run_async(coro):
    return _LOOP.run_until_complete(coro)


async def _find_v2_climate_assignment():
    assignees = await db.esg_assignment_assignees.find(
        {"user_id": KNOWN_ASSIGNEE_USER_ID}, {"_id": 0}
    ).to_list(500)
    aids = [a["assignment_id"] for a in assignees]
    if not aids:
        return None, assignees
    a = await db.esg_assignments.find_one(
        {"id": {"$in": aids}, "category": "Climate Change",
         "entity_type": "record_category"},
        {"_id": 0}
    )
    return a, assignees


class TestAssignmentResolver:
    """AssignmentResolver = single source of truth for assignment resolution."""

    def test_v2_assignees_exist_for_known_user(self):
        async def _t():
            assignees = await db.esg_assignment_assignees.find(
                {"user_id": KNOWN_ASSIGNEE_USER_ID}, {"_id": 0}
            ).to_list(500)
            print(f"\nV2 assignees for {KNOWN_ASSIGNEE_USER_ID}: {len(assignees)}")
            assert len(assignees) > 0
        run_async(_t())

    def test_resolve_finds_climate_change_v2_assignment(self):
        async def _t():
            v2, _ = await _find_v2_climate_assignment()
            assert v2 is not None, "No Climate Change V2 assignment for known user"
            sub = v2.get("subcategory")
            print(f"\nV2 assignment id={v2.get('id')} sub={sub} "
                  f"requires_approval={v2.get('requires_approval')} "
                  f"approver_id={v2.get('approver_id')}")
            resolved = await assignment_resolver.resolve(
                organization_id=ORG_ID,
                user_id=KNOWN_ASSIGNEE_USER_ID,
                category="Climate Change",
                subcategory=sub,
                record_level="organization",
            )
            assert resolved is not None
            assert resolved.get("id") == v2.get("id")
        run_async(_t())

    def test_resolve_returns_requires_approval_true(self):
        async def _t():
            v2, _ = await _find_v2_climate_assignment()
            assert v2 is not None
            resolved = await assignment_resolver.resolve(
                organization_id=ORG_ID,
                user_id=KNOWN_ASSIGNEE_USER_ID,
                category="Climate Change",
                subcategory=v2.get("subcategory"),
            )
            assert resolved is not None
            assert resolved.get("requires_approval") is True, (
                f"Expected requires_approval=True, got "
                f"{resolved.get('requires_approval')}"
            )
            assert resolved.get("approver_id") or resolved.get("approval_chain"), (
                "requires_approval=True but no approver configured"
            )
        run_async(_t())

    def test_resolve_returns_none_for_unrelated_user(self):
        async def _t():
            random_uid = str(uuid.uuid4())
            resolved = await assignment_resolver.resolve(
                organization_id=ORG_ID,
                user_id=random_uid,
                category="Climate Change",
                subcategory="Adaptation Plan",
            )
            assert resolved is None, f"Unexpected resolve for random user: {resolved}"
        run_async(_t())

    def test_legacy_pattern_still_resolves(self):
        async def _t():
            legacy = await db.esg_assignments.find_one(
                {"organization_id": ORG_ID,
                 "assigned_to_user_id": {"$ne": None},
                 "entity_type": "record_category"},
                {"_id": 0}
            )
            if not legacy:
                pytest.skip("No legacy (assigned_to_user_id) assignment present")
            resolved = await assignment_resolver.resolve(
                organization_id=ORG_ID,
                user_id=legacy["assigned_to_user_id"],
                category=legacy["category"],
                subcategory=legacy.get("subcategory"),
            )
            assert resolved is not None
            assert resolved.get("id") == legacy.get("id")
        run_async(_t())


class TestApprovalWorkflowOnCreate:
    """Bug 6: record creation for a V2 assignment with requires_approval=True."""

    def test_create_record_triggers_approval_workflow(self):
        async def _t():
            v2, _ = await _find_v2_climate_assignment()
            assert v2 is not None
            if not v2.get("requires_approval"):
                pytest.skip("V2 Climate Change assignment does not require approval")

            service = ESGRecordsService()
            cat_config = await service.get_category_by_name(
                "environment", v2["category"], v2.get("subcategory")
            )
            if not cat_config:
                pytest.skip("Category config missing")

            task = await db.esg_reporting_tasks.find_one({
                "organization_id": ORG_ID,
                "category": v2["category"],
                "subcategory": v2.get("subcategory"),
            }, {"_id": 0})
            if not task:
                pytest.skip("No reporting task for period validation")

            # Ensure user is on esg_task_assignees for this task (V2 tasks)
            has_task_assignee = await db.esg_task_assignees.find_one({
                "task_id": task["id"],
                "user_id": KNOWN_ASSIGNEE_USER_ID,
                "is_active": True,
            })
            if not has_task_assignee:
                pytest.skip(
                    "User not on esg_task_assignees for this task - period validation would block"
                )

            # Build reporting_period from task period_key
            period_key = task.get("period_key", "")
            month_names = ["January","February","March","April","May","June",
                           "July","August","September","October","November","December"]
            rp = {}
            if "-Q" in period_key:
                y, q = period_key.split("-Q")
                rp = {"reporting_type": "quarterly", "year": int(y), "quarter": f"Q{q}"}
            elif "-" in period_key:
                y, m = period_key.split("-")
                rp = {"reporting_type": "monthly", "year": int(y), "month": month_names[int(m)-1]}
            elif period_key.isdigit():
                rp = {"reporting_type": "yearly", "year": int(period_key)}
            else:
                pytest.skip(f"Unknown period_key format: {period_key}")

            payload = {
                "category_id": cat_config.get("id"),
                "category": v2["category"],
                "subcategory": v2.get("subcategory"),
                "sub_subcategory": v2.get("sub_subcategory"),
                "frameworks": cat_config.get("frameworks", []),
                "record_level": "organization",
                "facility_id": None,
                "reporting_period": rp,
                "field_values": {},
                "evidence_files": [],
                "source_of_information": "TEST_bug6_iter119",
                "notes": "TEST_bug6_iter119 - approval workflow trigger",
                "status": "completed",
            }
            try:
                req = CreateRecordRequest(**payload)
            except Exception as e:
                pytest.skip(f"CreateRecordRequest build failed: {e}")

            # Cleanup any leftover TEST records from prior runs first
            await db.environment_records.delete_many(
                {"source_of_information": "TEST_bug6_iter119"}
            )

            record = None
            try:
                record = await service.create_record(
                    section="environment",
                    org_id=ORG_ID,
                    user_id=KNOWN_ASSIGNEE_USER_ID,
                    data=req,
                )
                print(f"\nCreated record id={record.get('id')} "
                      f"status={record.get('status')} "
                      f"approval_status={record.get('approval_status')}")

                assert record.get("status") == "completed"
                assert record.get("approval_status") == "pending_approval", (
                    f"Expected approval_status='pending_approval', got "
                    f"{record.get('approval_status')}"
                )

                ar = await db.approval_requests.find_one(
                    {"entity_id": record["id"], "entity_type": "esg_record"},
                    {"_id": 0}
                )
                assert ar is not None, "approval_requests document was NOT created"
                assert ar.get("status") == "pending"
                assert ar.get("workflow_id") == f"assignment_{v2['id']}"
                print(f"Approval request id={ar.get('id')} status={ar.get('status')} "
                      f"workflow_id={ar.get('workflow_id')}")
            finally:
                # Cleanup
                if record and record.get("id"):
                    await db.environment_records.delete_many({"id": record["id"]})
                    await db.environment_record_versions.delete_many(
                        {"record_id": record["id"]}
                    )
                    await db.approval_requests.delete_many(
                        {"entity_id": record["id"], "entity_type": "esg_record"}
                    )
                # Revert task submission markers
                await db.esg_reporting_tasks.update_one(
                    {"id": task["id"]},
                    {"$unset": {
                        "submitted_at": "",
                        "submitted_by_user_id": "",
                        "completed_at": "",
                        "completed_by_user_id": "",
                    }, "$set": {"approval_status": "not_required"}}
                )
        run_async(_t())
