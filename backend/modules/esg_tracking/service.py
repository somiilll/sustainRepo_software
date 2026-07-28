"""
ESG Tracking Service

Core business logic for ESG tracking, aggregating data from multiple collections
to provide a unified view of disclosure ownership, completion, and compliance status.
"""

import logging
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timezone, timedelta
from shared.database.mongo import db
from shared.helpers.email import send_email

from .models import (
    TrackingDomain,
    CompletionStatus,
    FrameworkSummary,
    SectionSummary,
    DisclosureTrackingItem,
    TrackingFilter,
    BulkAssignRequest,
)

logger = logging.getLogger(__name__)

# Stale threshold in days (configurable per org in future)
DEFAULT_STALE_THRESHOLD_DAYS = 90

# Due soon threshold
DUE_SOON_DAYS = 7


class TrackingService:
    """
    Service for ESG tracking and workflow management.
    
    Aggregates data from:
    - esg_question_configs (framework structure)
    - esg_responses (completion data)
    - esg_assignments (ownership)
    - approval_requests (approval status)
    """
    
    def __init__(self):
        self._configs = db["esg_question_configs"]
        self._responses = db["esg_responses"]
        self._assignments = db["esg_assignments"]
        self._approval_requests = db["approval_requests"]
        self._users = db["users"]
        self._organizations = db["organizations"]
        self._frameworks = db["esg_frameworks"]
    
    def _format_question_key(self, key: str) -> str:
        """
        Convert question key to human-readable name.
        e.g., "env_sustainable_rd_capex" -> "Sustainable R&D Capex"
        """
        # Remove section prefix (env_, soc_, gov_)
        prefixes = ['env_', 'soc_', 'gov_', 'social_', 'governance_', 'environment_']
        formatted = key
        for prefix in prefixes:
            if formatted.startswith(prefix):
                formatted = formatted[len(prefix):]
                break
        
        # Common abbreviation expansions
        abbreviations = {
            'rd': 'R&D',
            'capex': 'Capital Expenditure',
            'epr': 'Extended Producer Responsibility',
            'lca': 'Life Cycle Assessment',
            'eia': 'Environmental Impact Assessment',
            'ghg': 'GHG',
            'pat': 'PAT',
            'zld': 'Zero Liquid Discharge',
            'desc': '',  # Remove 'desc' suffix
        }
        
        # Split by underscore and process each word
        words = formatted.split('_')
        result = []
        for word in words:
            lower = word.lower()
            if lower in abbreviations:
                if abbreviations[lower]:  # Skip empty mappings
                    result.append(abbreviations[lower])
            else:
                result.append(word.capitalize())
        
        return ' '.join(result).strip()
    
    def _get_display_name(self, config: Optional[dict], q_key: str) -> str:
        """
        Get the display name for a disclosure from config.
        Priority: label > question > description > formatted key
        Returns full text - truncation should be handled by frontend.
        """
        if not config:
            return self._format_question_key(q_key)
        
        label = config.get("label")
        if label:
            return label
        
        question = config.get("question")
        if question:
            return question
        
        desc = config.get("description")
        if desc:
            first_sentence = desc.split('.')[0]
            if len(first_sentence) < len(desc) - 1:
                return first_sentence + "."
            return desc
        
        return self._format_question_key(q_key)
    
    # =========================================================================
    # FRAMEWORK-LEVEL TRACKING
    # =========================================================================
    
    async def get_frameworks_summary(
        self,
        organization_id: str,
        domain: TrackingDomain,
        reporting_period: str,
    ) -> List[FrameworkSummary]:
        """
        Get summary of all enabled frameworks for a domain.
        
        Returns completion %, assignment status, and overdue counts per framework.
        """
        # Get organization's enabled frameworks
        org = await self._organizations.find_one(
            {"id": organization_id},
            {"_id": 0, "enabled_frameworks": 1, "stale_threshold_days": 1}
        )
        
        enabled_frameworks = org.get("enabled_frameworks", ["brsr"]) if org else ["brsr"]
        # Normalize to lowercase for comparison
        enabled_frameworks = [fw.lower() for fw in enabled_frameworks]
        stale_threshold = org.get("stale_threshold_days", DEFAULT_STALE_THRESHOLD_DAYS)
        
        # Get all question configs for this domain (or all domains if "all")
        domain_section_map = {
            TrackingDomain.ENVIRONMENT: "environment",
            TrackingDomain.SOCIAL: "social",
            TrackingDomain.GOVERNANCE: "governance",
        }
        
        # Build query based on domain
        if domain == TrackingDomain.ALL:
            # Fetch all sections including BRSR section_b/section_c
            configs = await self._configs.find(
                {"section": {"$in": ["environment", "social", "governance", "section_a", "section_b", "section_c"]}},
                {"_id": 0}
            ).to_list(5000)
        else:
            section = domain_section_map.get(domain)
            configs = await self._configs.find(
                {"section": section},
                {"_id": 0}
            ).to_list(1000)
        
        # Group configs by framework
        # Note: Configs use either "framework" (string) or "frameworks" (array)
        framework_configs: Dict[str, List[dict]] = {}
        for config in configs:
            fw = (config.get("framework") or "").lower()
            if not fw:
                # Check frameworks array
                fws = config.get("frameworks") or []
                fw = fws[0].lower() if fws else "brsr"
            if fw not in framework_configs:
                framework_configs[fw] = []
            framework_configs[fw].append(config)
        
        # Get all responses for this org and period
        responses = await self._responses.find(
            {
                "organization_id": organization_id,
                "reporting_year": reporting_period,
            },
            {"_id": 0, "question_key": 1, "updated_at": 1, "value": 1}
        ).to_list(5000)
        
        response_map = {r["question_key"]: r for r in responses}
        
        # Get all assignments for this org and period
        assignments = await self._assignments.find(
            {
                "organization_id": organization_id,
                "reporting_period": reporting_period,
                "entity_type": "question",
            },
            {"_id": 0}
        ).to_list(5000)
        
        assignment_map = {a["entity_id"]: a for a in assignments}
        
        now = datetime.now(timezone.utc)
        stale_cutoff = now - timedelta(days=stale_threshold)
        
        summaries = []
        
        for fw_id, fw_configs in framework_configs.items():
            if fw_id not in enabled_frameworks:
                continue
            
            total = len(fw_configs)
            completed = 0
            pending = 0
            assigned = 0
            unassigned = 0
            overdue = 0
            stale = 0
            last_updated = None
            
            for config in fw_configs:
                q_key = config.get("question_key")
                response = response_map.get(q_key)
                assignment = assignment_map.get(q_key)
                
                # Check completion - value must be non-empty (not None, not "", not [], not {})
                response_value = response.get("value") if response else None
                value_is_empty = response_value is None or response_value == "" or response_value == [] or response_value == {}
                is_completed = response is not None and not value_is_empty
                if is_completed:
                    completed += 1
                    
                    # Check if stale
                    resp_updated = response.get("updated_at")
                    if resp_updated:
                        if isinstance(resp_updated, str):
                            try:
                                resp_updated = datetime.fromisoformat(resp_updated.replace("Z", "+00:00"))
                            except (ValueError, TypeError):
                                resp_updated = None
                        
                        # Normalize naive datetime to UTC for comparison
                        if resp_updated and resp_updated.tzinfo is None:
                            resp_updated = resp_updated.replace(tzinfo=timezone.utc)
                        
                        if resp_updated and resp_updated < stale_cutoff:
                            stale += 1
                        
                        if resp_updated and (last_updated is None or resp_updated > last_updated):
                            last_updated = resp_updated
                else:
                    pending += 1
                
                # Check assignment
                if assignment:
                    assigned += 1
                    
                    # Check overdue
                    due_date = assignment.get("due_date")
                    if due_date:
                        if isinstance(due_date, str):
                            try:
                                due_date = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
                            except (ValueError, TypeError):
                                due_date = None
                        
                        # Normalize naive datetime to UTC for comparison
                        if due_date and due_date.tzinfo is None:
                            due_date = due_date.replace(tzinfo=timezone.utc)
                        
                        if due_date and due_date < now and not is_completed:
                            overdue += 1
                else:
                    unassigned += 1
            
            completion_pct = (completed / total * 100) if total > 0 else 0
            
            # Get framework display name
            fw_doc = await self._frameworks.find_one(
                {"id": fw_id},
                {"_id": 0, "name": 1}
            )
            fw_name = fw_doc.get("name") if fw_doc else fw_id.upper()
            
            # Get domain string for response
            domain_str = domain.value if domain else "all"
            
            summaries.append(FrameworkSummary(
                framework_id=fw_id,
                framework_name=fw_name,
                domain=domain_str,
                total_disclosures=total,
                completed_disclosures=completed,
                pending_disclosures=pending,
                assigned_disclosures=assigned,
                unassigned_disclosures=unassigned,
                overdue_count=overdue,
                stale_count=stale,
                completion_percentage=round(completion_pct, 1),
                last_updated=last_updated,
                enabled=True,
            ))
        
        return summaries
    
    # =========================================================================
    # SECTION-LEVEL TRACKING
    # =========================================================================
    
    async def get_framework_sections(
        self,
        organization_id: str,
        domain: TrackingDomain,
        framework_id: str,
        reporting_period: str,
        filter_by_materiality: bool = False,
    ) -> List[SectionSummary]:
        """
        Get all sections within a framework with their tracking status.
        
        Sections are grouped by brsr_section, topic, or principle depending on framework.
        If filter_by_materiality=True (for GRI), only returns sections for material topics.
        """
        domain_section_map = {
            TrackingDomain.ENVIRONMENT: "environment",
            TrackingDomain.SOCIAL: "social",
            TrackingDomain.GOVERNANCE: "governance",
        }
        
        # Get org settings
        org = await self._organizations.find_one(
            {"id": organization_id},
            {"_id": 0, "stale_threshold_days": 1}
        )
        stale_threshold = org.get("stale_threshold_days", DEFAULT_STALE_THRESHOLD_DAYS) if org else DEFAULT_STALE_THRESHOLD_DAYS
        
        # Build section filter based on domain
        if domain == TrackingDomain.ALL:
            section_filter = {"$in": ["environment", "social", "governance", "section_a", "section_b", "section_c"]}
        else:
            section_filter = domain_section_map.get(domain)
        
        # Get all configs for this framework and domain
        # Handle both "framework" (string) and "frameworks" (array) fields
        if framework_id.lower() == "brsr":
            config_query = {
                "section": section_filter,
                "$or": [
                    {"framework": {"$regex": f"^{framework_id}$", "$options": "i"}},
                    {"frameworks": {"$regex": f"^{framework_id}$", "$options": "i"}},
                    {"framework": None},
                    {"framework": {"$exists": False}},
                ]
            }
        else:
            config_query = {
                "section": section_filter,
                "$or": [
                    {"framework": {"$regex": f"^{framework_id}$", "$options": "i"}},
                    {"frameworks": {"$regex": f"^{framework_id}$", "$options": "i"}},
                ]
            }
        
        configs = await self._configs.find(config_query, {"_id": 0}).to_list(5000)
        
        # Filter by materiality for GRI
        if filter_by_materiality and framework_id.upper() == "GRI":
            from modules.materiality.service import materiality_service
            material_codes = await materiality_service.get_material_topic_codes_for_org(organization_id)
            if material_codes:
                # Filter configs - disclosure_id format is "302-1", topic code is first part
                configs = [
                    c for c in configs
                    if c.get("disclosure_id", "").split("-")[0] in material_codes
                ]
        
        # Get responses
        responses = await self._responses.find(
            {
                "organization_id": organization_id,
                "reporting_year": reporting_period,
            },
            {"_id": 0, "question_key": 1, "updated_at": 1, "value": 1}
        ).to_list(5000)
        response_map = {r["question_key"]: r for r in responses}
        
        # Get assignments
        assignments = await self._assignments.find(
            {
                "organization_id": organization_id,
                "reporting_period": reporting_period,
                "entity_type": "question",
            },
            {"_id": 0}
        ).to_list(5000)
        assignment_map = {a["entity_id"]: a for a in assignments}
        
        now = datetime.now(timezone.utc)
        stale_cutoff = now - timedelta(days=stale_threshold)
        due_soon_cutoff = now + timedelta(days=DUE_SOON_DAYS)
        
        # Group configs by section (brsr_principle, brsr_section, topic, or disclosure_id for GRI)
        section_configs: Dict[str, List[dict]] = {}
        for config in configs:
            # For GRI framework, group by disclosure_id; for BRSR use brsr_principle/brsr_section
            if framework_id and framework_id.upper() == "GRI":
                sec_id = config.get("disclosure_id") or config.get("topic") or "Other"
            else:
                sec_id = config.get("brsr_principle") or config.get("brsr_section") or config.get("topic") or "Other"
            if sec_id not in section_configs:
                section_configs[sec_id] = []
            section_configs[sec_id].append(config)
        
        summaries = []
        
        for sec_id, sec_configs in section_configs.items():
            total = len(sec_configs)
            completed = 0
            pending = 0
            assigned = 0
            unassigned = 0
            overdue = 0
            due_soon = 0
            stale = 0
            last_updated = None
            assigned_user_ids = set()
            
            for config in sec_configs:
                q_key = config.get("question_key")
                response = response_map.get(q_key)
                assignment = assignment_map.get(q_key)
                
                # Completion - value must be non-empty
                response_value = response.get("value") if response else None
                value_is_empty = response_value is None or response_value == "" or response_value == [] or response_value == {}
                is_completed = response is not None and not value_is_empty
                if is_completed:
                    completed += 1
                    
                    resp_updated = response.get("updated_at")
                    if resp_updated:
                        if isinstance(resp_updated, str):
                            try:
                                resp_updated = datetime.fromisoformat(resp_updated.replace("Z", "+00:00"))
                            except (ValueError, TypeError):
                                resp_updated = None
                        
                        # Normalize naive datetime to UTC for comparison
                        if resp_updated and resp_updated.tzinfo is None:
                            resp_updated = resp_updated.replace(tzinfo=timezone.utc)
                        
                        if resp_updated and resp_updated < stale_cutoff:
                            stale += 1
                        
                        if resp_updated and (last_updated is None or resp_updated > last_updated):
                            last_updated = resp_updated
                else:
                    pending += 1
                
                # Assignment
                if assignment:
                    assigned += 1
                    user_id = assignment.get("assigned_to_user_id")
                    if user_id:
                        assigned_user_ids.add(user_id)
                    
                    due_date = assignment.get("due_date")
                    if due_date:
                        if isinstance(due_date, str):
                            try:
                                due_date = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
                            except (ValueError, TypeError):
                                due_date = None
                        
                        # Normalize naive datetime to UTC for comparison
                        if due_date and due_date.tzinfo is None:
                            due_date = due_date.replace(tzinfo=timezone.utc)
                        
                        if due_date:
                            if due_date < now and not is_completed:
                                overdue += 1
                            elif due_date < due_soon_cutoff and not is_completed:
                                due_soon += 1
                else:
                    unassigned += 1
            
            # Get user details for assigned users
            assigned_users = []
            if assigned_user_ids:
                users = await self._users.find(
                    {"id": {"$in": list(assigned_user_ids)}},
                    {"_id": 0, "id": 1, "name": 1, "email": 1}
                ).to_list(100)
                assigned_users = [{"id": u["id"], "name": u.get("name") or u.get("email")} for u in users]
            
            completion_pct = (completed / total * 100) if total > 0 else 0
            
            # Get section display name
            sec_name = sec_id.replace("_", " ").title()
            
            summaries.append(SectionSummary(
                section_id=sec_id,
                section_name=sec_name,
                framework_id=framework_id,
                total_disclosures=total,
                completed_disclosures=completed,
                pending_disclosures=pending,
                assigned_count=assigned,
                unassigned_count=unassigned,
                overdue_count=overdue,
                due_soon_count=due_soon,
                stale_count=stale,
                completion_percentage=round(completion_pct, 1),
                assigned_users=assigned_users,
                last_updated=last_updated,
            ))
        
        # Sort by section name
        summaries.sort(key=lambda s: s.section_name)
        
        return summaries
    
    # =========================================================================
    # DISCLOSURE-LEVEL TRACKING
    # =========================================================================
    
    async def get_section_disclosures(
        self,
        organization_id: str,
        domain: TrackingDomain,
        framework_id: str,
        section_id: str,
        reporting_period: str,
        filters: Optional[TrackingFilter] = None,
    ) -> Tuple[SectionSummary, List[DisclosureTrackingItem]]:
        """
        Get all disclosures within a section with full tracking details.
        
        Returns section summary and list of disclosure items.
        """
        domain_section_map = {
            TrackingDomain.ENVIRONMENT: "environment",
            TrackingDomain.SOCIAL: "social",
            TrackingDomain.GOVERNANCE: "governance",
        }
        
        # Build section filter based on domain
        if domain == TrackingDomain.ALL:
            section_filter = {"$in": ["environment", "social", "governance", "section_a", "section_b", "section_c"]}
        else:
            section_filter = domain_section_map.get(domain)
        
        # Get org settings
        org = await self._organizations.find_one(
            {"id": organization_id},
            {"_id": 0, "stale_threshold_days": 1}
        )
        stale_threshold = org.get("stale_threshold_days", DEFAULT_STALE_THRESHOLD_DAYS) if org else DEFAULT_STALE_THRESHOLD_DAYS
        
        # Build config query - handle both "framework" and "frameworks" fields
        fw_match = [
            {"framework": {"$regex": f"^{framework_id}$", "$options": "i"}},
            {"frameworks": {"$regex": f"^{framework_id}$", "$options": "i"}},
        ]
        if framework_id.lower() == "brsr":
            fw_match.extend([{"framework": None}, {"framework": {"$exists": False}}])

        if framework_id.lower() == "brsr":
            config_query = {
                "section": section_filter,
                "$or": fw_match,
                "$and": [
                    {"$or": [
                        {"brsr_principle": section_id},
                        {"brsr_section": section_id},
                        {"section": section_id},
                        {"topic": section_id},
                    ]}
                ]
            }
        elif framework_id.upper() == "GRI":
            config_query = {
                "section": section_filter,
                "$or": [
                    {"framework": {"$regex": f"^{framework_id}$", "$options": "i"}},
                    {"frameworks": {"$regex": f"^{framework_id}$", "$options": "i"}},
                ],
                "disclosure_id": section_id,
            }
        else:
            config_query = {
                "section": section_filter,
                "$or": fw_match,
                "$and": [
                    {"$or": [
                        {"brsr_section": section_id},
                        {"topic": section_id},
                        {"brsr_principle": section_id},
                    ]}
                ]
            }
        
        configs = await self._configs.find(config_query, {"_id": 0}).to_list(500)
        
        # Get responses from organization_esg_responses (drafts/submissions)
        responses = await self._responses.find(
            {
                "organization_id": organization_id,
                "reporting_year": reporting_period,
            },
            {"_id": 0}
        ).to_list(5000)
        response_map = {r["question_key"]: r for r in responses}
        
        # Also get final/approved responses from esg_responses (includes approval_status)
        # GRI responses may use 'status' field (e.g., "approved", "pending") instead of 'approval_status'
        final_responses = await db.esg_responses.find(
            {
                "organization_id": organization_id,
                "reporting_year": reporting_period,
            },
            {"_id": 0, "question_key": 1, "approval_status": 1, "status": 1, "rejection_reason": 1, 
             "value": 1, "updated_at": 1, "submitted_at": 1, "submitted_by": 1, "approved_at": 1}
        ).to_list(5000)
        
        # Merge approval status from esg_responses into response_map
        for fr in final_responses:
            qk = fr.get("question_key")
            if qk:
                # Normalize approval_status: GRI uses 'status' field (approved/pending), BRSR uses 'approval_status'
                effective_approval_status = fr.get("approval_status")
                if not effective_approval_status:
                    # Fallback to 'status' field for GRI responses
                    status_val = fr.get("status")
                    if status_val == "approved" or fr.get("approved_at"):
                        effective_approval_status = "approved"
                    elif status_val == "pending_approval":
                        effective_approval_status = "pending_approval"
                    elif status_val == "rejected":
                        effective_approval_status = "rejected"
                    # Note: "pending" or "saved" status means no approval workflow triggered yet
                
                if qk in response_map:
                    # Merge approval fields into existing response
                    response_map[qk]["approval_status"] = effective_approval_status
                    response_map[qk]["rejection_reason"] = fr.get("rejection_reason")
                    response_map[qk]["submitted_at"] = fr.get("submitted_at")
                    response_map[qk]["submitted_by"] = fr.get("submitted_by")
                else:
                    # Use the esg_responses entry with normalized approval_status
                    fr["approval_status"] = effective_approval_status
                    response_map[qk] = fr
        
        # Get assignments and aggregate by entity_id for multi-assignee support
        raw_assignments = await self._assignments.find(
            {
                "organization_id": organization_id,
                "reporting_period": reporting_period,
                "entity_type": "question",
            },
            {"_id": 0}
        ).to_list(5000)
        
        # Get all assignment IDs for batch fetching assignees
        assignment_ids = [a.get("id") for a in raw_assignments if a.get("id")]
        
        # Fetch assignees from esg_assignment_assignees table (new model)
        assignees_cursor = db.esg_assignment_assignees.find(
            {"assignment_id": {"$in": assignment_ids}, "removed_at": None},
            {"_id": 0, "assignment_id": 1, "user_id": 1, "role": 1}
        )
        raw_assignees = await assignees_cursor.to_list(10000)
        
        # Group assignees by assignment_id
        assignees_by_assignment = {}
        for assignee in raw_assignees:
            aid = assignee["assignment_id"]
            if aid not in assignees_by_assignment:
                assignees_by_assignment[aid] = []
            assignees_by_assignment[aid].append(assignee)
        
        # Get user details for all assignees
        all_user_ids = list(set([a["user_id"] for a in raw_assignees]))
        # Also include legacy assigned_to_user_id
        for a in raw_assignments:
            if a.get("assigned_to_user_id"):
                all_user_ids.append(a["assigned_to_user_id"])
        all_user_ids = list(set(all_user_ids))
        
        users_cursor = db.users.find(
            {"id": {"$in": all_user_ids}},
            {"_id": 0, "id": 1, "full_name": 1, "name": 1, "email": 1}
        )
        users_list = await users_cursor.to_list(1000)
        user_map_local = {u["id"]: u for u in users_list}
        
        # Aggregate assignments by entity_id (question_key) for multi-assignee display
        assignment_map = {}
        for a in raw_assignments:
            entity_id = a.get("entity_id")
            if entity_id not in assignment_map:
                assignment_map[entity_id] = {
                    **a,
                    "assignees": [],
                }
            
            assignment_id = a.get("id")
            
            # First, try to get assignees from the new esg_assignment_assignees table
            if assignment_id and assignment_id in assignees_by_assignment:
                for assignee in assignees_by_assignment[assignment_id]:
                    user = user_map_local.get(assignee["user_id"])
                    assignee_entry = {
                        "user_id": assignee["user_id"],
                        "user_name": user.get("full_name") or user.get("name") if user else None,
                        "user_email": user.get("email") if user else None,
                        "role": assignee.get("role", "editor"),
                        "assignment_id": assignment_id,
                    }
                    existing_ids = [x["user_id"] for x in assignment_map[entity_id]["assignees"]]
                    if assignee_entry["user_id"] not in existing_ids:
                        assignment_map[entity_id]["assignees"].append(assignee_entry)
            
            # Fallback: use legacy assigned_to_user_id if no assignees found
            if not assignment_map[entity_id]["assignees"] and a.get("assigned_to_user_id"):
                user = user_map_local.get(a["assigned_to_user_id"])
                assignee_entry = {
                    "user_id": a["assigned_to_user_id"],
                    "user_name": user.get("full_name") or user.get("name") if user else None,
                    "user_email": user.get("email") if user else None,
                    "role": a.get("role", "editor"),
                    "assignment_id": assignment_id,
                }
                assignment_map[entity_id]["assignees"].append(assignee_entry)
        
        # Set primary assignee name for backward compatibility
        for entity_id, asgn in assignment_map.items():
            if asgn["assignees"]:
                asgn["assigned_to_name"] = asgn["assignees"][0].get("user_name")
        
        # Get approval requests if any
        approval_requests = await self._approval_requests.find(
            {
                "organization_id": organization_id,
                "entity_type": "esg_response",
            },
            {"_id": 0, "entity_id": 1, "status": 1}
        ).to_list(1000)
        approval_map = {a["entity_id"]: a for a in approval_requests}
        
        now = datetime.now(timezone.utc)
        stale_cutoff = now - timedelta(days=stale_threshold)
        due_soon_cutoff = now + timedelta(days=DUE_SOON_DAYS)
        
        # Build disclosure items
        disclosures = []
        total = 0
        completed = 0
        pending = 0
        assigned = 0
        unassigned = 0
        overdue = 0
        due_soon = 0
        stale = 0
        last_updated = None
        assigned_user_ids = set()
        approver_user_ids = set()  # Track approver IDs for name lookup
        
        for config in configs:
            q_key = config.get("question_key")
            sub_questions = config.get("sub_questions", [])
            config_domain = config.get("section", "")  # The actual ESG domain from config
            
            # For GRI parent questions with sub_questions, compute aggregated status from subquestion responses
            aggregated_response = None
            if framework_id.lower() == "gri" and sub_questions and len(sub_questions) > 0:
                subpart_responses = []
                for sub_q in sub_questions:
                    sub_key = sub_q.get("sub_key", "")
                    full_sub_key = f"{q_key}_{sub_key}"
                    sub_resp = response_map.get(full_sub_key)
                    subpart_responses.append({
                        "question_key": full_sub_key,
                        "value": sub_resp.get("value") if sub_resp else None,
                        "approval_status": sub_resp.get("approval_status") if sub_resp else None,
                        "rejection_reason": sub_resp.get("rejection_reason") if sub_resp else None,
                    })
                
                if subpart_responses:
                    # Compute aggregated status
                    subparts_filled = sum(1 for sp in subpart_responses if sp.get("value") is not None and sp.get("value") != "")
                    total_subparts = len(subpart_responses)
                    all_have_value = subparts_filled == total_subparts
                    all_approved = all(sp.get("approval_status") == "approved" for sp in subpart_responses)
                    any_rejected = any(sp.get("approval_status") == "rejected" for sp in subpart_responses)
                    any_pending = any(sp.get("approval_status") == "pending_approval" for sp in subpart_responses)
                    
                    # Determine aggregated approval status
                    if any_rejected:
                        agg_approval_status = "rejected"
                    elif all_approved and all_have_value:
                        agg_approval_status = "approved"
                    elif any_pending or (all_have_value and not all_approved):
                        agg_approval_status = "pending_approval"
                    else:
                        agg_approval_status = None
                    
                    # Build aggregated response
                    # CRITICAL FIX: Only mark as "completed" (value not None) when ALL subparts have values
                    # If partially filled, set value to None so parent shows as "not completed"
                    # But include metadata for progress display
                    aggregated_response = {
                        # Only non-None value when ALL subparts filled (determines is_completed)
                        "value": {"subparts_completed": subparts_filled, "total_subparts": total_subparts} if all_have_value else None,
                        "approval_status": agg_approval_status,
                        "rejection_reason": next((sp.get("rejection_reason") for sp in subpart_responses if sp.get("approval_status") == "rejected"), None),
                        # Include progress info even when not complete (for UI display)
                        "progress": {"filled": subparts_filled, "total": total_subparts},
                    }
            
            # Helper function to build a disclosure item
            def build_disclosure_item(
                item_key, display_name, item_type, 
                response, assignment, approval,
                parent_key=None, sub_key=None,
                item_domain=None,  # Pass the domain from config
            ):
                nonlocal total, completed, pending, assigned, unassigned, overdue, due_soon, stale, last_updated, assigned_user_ids, approver_user_ids
                
                total += 1
                
                # Determine completion status
                # A response is completed only if it has a non-empty value
                response_value = response.get("value") if response else None
                # Check for various "empty" conditions: None, empty string, empty list, empty dict
                value_is_empty = (
                    response_value is None or 
                    response_value == "" or 
                    response_value == [] or 
                    response_value == {}
                )
                is_completed = response is not None and not value_is_empty
                resp_updated = None
                days_since = None
                is_stale = False
                
                if is_completed:
                    completed += 1
                    resp_updated = response.get("updated_at")
                    if resp_updated:
                        if isinstance(resp_updated, str):
                            try:
                                resp_updated = datetime.fromisoformat(resp_updated.replace("Z", "+00:00"))
                            except (ValueError, TypeError):
                                resp_updated = None
                        
                        if resp_updated and resp_updated.tzinfo is None:
                            resp_updated = resp_updated.replace(tzinfo=timezone.utc)
                        
                        if resp_updated:
                            days_since = (now - resp_updated).days
                            is_stale = resp_updated < stale_cutoff
                            if is_stale:
                                stale += 1
                            
                            if last_updated is None or resp_updated > last_updated:
                                last_updated = resp_updated
                    
                    comp_status = CompletionStatus.STALE if is_stale else CompletionStatus.COMPLETED
                elif response is not None:
                    pending += 1
                    comp_status = CompletionStatus.IN_PROGRESS
                else:
                    pending += 1
                    comp_status = CompletionStatus.NOT_STARTED
                
                # Assignment details
                is_assigned = assignment is not None
                assigned_to_user_id = None
                assigned_by_user_id = None
                assignment_id = None
                assignment_role = None
                due_date_val = None
                is_overdue_item = False
                is_due_soon_flag = False
                days_until_due = None
                last_reminder = None
                filling_freq = None
                requires_appr = False
                assignees_list = []  # Multi-assignee support
                appr_status_val = None  # Approval status from assignment
                approver_id = None  # Approver user ID
                approval_chain = []  # Multi-level approval chain
                
                if assignment:
                    assigned += 1
                    assigned_to_user_id = assignment.get("assigned_to_user_id")
                    assigned_by_user_id = assignment.get("assigned_by_user_id")
                    assignment_id = assignment.get("id")
                    assignment_role = assignment.get("role")
                    filling_freq = assignment.get("filling_frequency")
                    requires_appr = assignment.get("requires_approval", False)
                    last_reminder = assignment.get("last_reminder_sent_at")
                    assignees_list = assignment.get("assignees", [])
                    
                    # Extract approver info
                    approval_chain = assignment.get("approval_chain", [])
                    approver_id = assignment.get("approver_id")
                    # If approver_id not set but approval_chain exists, use first in chain
                    if not approver_id and approval_chain:
                        approver_id = approval_chain[0]
                    
                    if approver_id:
                        approver_user_ids.add(approver_id)
                    
                    if assigned_to_user_id:
                        assigned_user_ids.add(assigned_to_user_id)
                    
                    due_date_val = assignment.get("due_date")
                    if due_date_val:
                        if isinstance(due_date_val, str):
                            try:
                                due_date_val = datetime.fromisoformat(due_date_val.replace("Z", "+00:00"))
                            except (ValueError, TypeError):
                                due_date_val = None
                        
                        if due_date_val and due_date_val.tzinfo is None:
                            due_date_val = due_date_val.replace(tzinfo=timezone.utc)
                        
                        if due_date_val:
                            days_until_due = (due_date_val - now).days
                            if due_date_val < now and not is_completed:
                                is_overdue_item = True
                                overdue += 1
                            elif due_date_val < due_soon_cutoff and not is_completed:
                                is_due_soon_flag = True
                                due_soon += 1
                else:
                    unassigned += 1
                
                # Approval status - from esg_responses (single source of truth for questionnaires)
                appr_status = None
                if response and response.get("approval_status"):
                    appr_status = response.get("approval_status")
                elif approval:
                    appr_status = approval.get("status")
                elif requires_appr:
                    appr_status = "not_required"  # Has assignment with requires_approval but no response yet
                
                # Also check for rejection reason from response
                rejection_reason = None
                if response and response.get("rejection_reason"):
                    rejection_reason = response.get("rejection_reason")
                
                # Apply filters
                if filters:
                    if filters.is_overdue is True and not is_overdue_item:
                        return None
                    if filters.is_unassigned is True and is_assigned:
                        return None
                    if filters.is_stale is True and not is_stale:
                        return None
                    if filters.is_due_soon is True and not is_due_soon_flag:
                        return None
                    if filters.assigned_to_user_id and assigned_to_user_id != filters.assigned_to_user_id:
                        return None
                    if filters.status:
                        if filters.status == "completed" and not is_completed:
                            return None
                        if filters.status == "pending" and is_completed:
                            return None
                
                return DisclosureTrackingItem(
                    disclosure_id=item_key,
                    question_key=item_key,  # Add question_key for frontend
                    disclosure_name=display_name,
                    disclosure_type=item_type,
                    section_id=section_id,
                    section_name=section_id.replace("_", " ").title(),
                    domain=item_domain,  # The actual ESG domain (environment/social/governance)
                    framework_id=framework_id,
                    is_completed=is_completed,
                    completion_status=comp_status,
                    # Handle both dict and string response values (GRI uses strings, BRSR uses dicts)
                    response_data=response.get("value") if response and isinstance(response.get("value"), dict) else ({"value": response.get("value")} if response and response.get("value") is not None else None),
                    last_response_updated_at=resp_updated,
                    is_assigned=is_assigned,
                    assigned_to_user_id=assigned_to_user_id,
                    assigned_to_user_name=None,
                    assigned_to_user_email=None,
                    assigned_by_user_id=assigned_by_user_id,
                    assigned_by_user_name=None,
                    assignment_id=assignment_id,
                    assignment_role=assignment_role,
                    assignees=assignees_list,  # Multi-assignee support
                    due_date=due_date_val,
                    is_overdue=is_overdue_item,
                    is_due_soon=is_due_soon_flag,
                    days_until_due=days_until_due,
                    last_reminder_sent_at=last_reminder,
                    is_stale=is_stale,
                    days_since_update=days_since,
                    requires_approval=requires_appr,
                    approval_status=appr_status,
                    approver_id=approver_id,
                    approver_name=None,  # Will be populated later with user lookup
                    approver_email=None,
                    approval_chain=approval_chain,
                    rejection_reason=rejection_reason,
                    filling_frequency=filling_freq,
                )
            
            # If question has sub_questions, create tracking items for each sub-question
            # EXCEPT for GRI - show parent questions with aggregated status instead
            if sub_questions and len(sub_questions) > 0 and framework_id.lower() != "gri":
                for sub_q in sub_questions:
                    sub_key = sub_q.get("sub_key", "")
                    sub_label = sub_q.get("label", "")
                    full_sub_key = f"{q_key}_{sub_key}"
                    
                    # Try to find response/assignment for sub-question first, fallback to parent
                    response = response_map.get(full_sub_key) or response_map.get(q_key)
                    assignment = assignment_map.get(full_sub_key) or assignment_map.get(q_key)
                    approval = approval_map.get(full_sub_key) or approval_map.get(q_key)
                    
                    # Create display name
                    parent_desc = config.get("description", q_key)
                    if len(parent_desc) > 80:
                        parent_desc = parent_desc[:80] + "..."
                    display_name = f"{parent_desc} → {sub_label}"
                    
                    item = build_disclosure_item(
                        full_sub_key, display_name, "sub_question",
                        response, assignment, approval,
                        parent_key=q_key, sub_key=sub_key,
                        item_domain=config_domain,
                    )
                    if item:
                        disclosures.append(item)
            else:
                # No sub-questions - treat as single trackable item
                # For GRI parent questions with subparts, use aggregated response
                if aggregated_response is not None:
                    response = aggregated_response
                else:
                    response = response_map.get(q_key)
                assignment = assignment_map.get(q_key)
                approval = approval_map.get(q_key)
                
                item = build_disclosure_item(
                    q_key, self._get_display_name(config, q_key), "question",
                    response, assignment, approval,
                    item_domain=config_domain,
                )
                if item:
                    disclosures.append(item)
        
        # Populate user names
        if assigned_user_ids:
            users = await self._users.find(
                {"id": {"$in": list(assigned_user_ids)}},
                {"_id": 0, "id": 1, "name": 1, "email": 1}
            ).to_list(100)
            user_map = {u["id"]: u for u in users}
            
            for disc in disclosures:
                if disc.assigned_to_user_id and disc.assigned_to_user_id in user_map:
                    user = user_map[disc.assigned_to_user_id]
                    disc.assigned_to_user_name = user.get("name") or user.get("email")
                    disc.assigned_to_user_email = user.get("email")
        
        # Populate approver names
        if approver_user_ids:
            approver_users = await self._users.find(
                {"id": {"$in": list(approver_user_ids)}},
                {"_id": 0, "id": 1, "name": 1, "email": 1}
            ).to_list(100)
            approver_map = {u["id"]: u for u in approver_users}
            
            for disc in disclosures:
                if disc.approver_id and disc.approver_id in approver_map:
                    user = approver_map[disc.approver_id]
                    disc.approver_name = user.get("name") or user.get("email")
                    disc.approver_email = user.get("email")
        
        # Build section summary
        assigned_users = []
        if assigned_user_ids:
            users = await self._users.find(
                {"id": {"$in": list(assigned_user_ids)}},
                {"_id": 0, "id": 1, "name": 1, "email": 1}
            ).to_list(100)
            assigned_users = [{"id": u["id"], "name": u.get("name") or u.get("email")} for u in users]
        
        completion_pct = (completed / total * 100) if total > 0 else 0
        
        section_summary = SectionSummary(
            section_id=section_id,
            section_name=section_id.replace("_", " ").title(),
            framework_id=framework_id,
            total_disclosures=total,
            completed_disclosures=completed,
            pending_disclosures=pending,
            assigned_count=assigned,
            unassigned_count=unassigned,
            overdue_count=overdue,
            due_soon_count=due_soon,
            stale_count=stale,
            completion_percentage=round(completion_pct, 1),
            assigned_users=assigned_users,
            last_updated=last_updated,
        )
        
        return section_summary, disclosures
    
    # =========================================================================
    # ASSIGNMENT OPERATIONS
    # =========================================================================
    
    async def bulk_assign_disclosures(
        self,
        organization_id: str,
        request: BulkAssignRequest,
        assigned_by_user_id: str,
        domain: TrackingDomain,
        reporting_period: str,
    ) -> Dict[str, Any]:
        """
        Bulk assign disclosures in a section or framework.
        
        Uses the same assignment model as KPI metrics:
        - esg_assignments (one per question/work item)
        - esg_assignment_assignees (many-to-many for users)
        
        Supports:
        - Multiple assignees per question
        - Replacing assignees on reassignment
        - Updating all fields (due_date, reminder, approval) on reassignment
        """
        from modules.esg_assignments.assignment_service_v2 import assignment_service_v2
        
        domain_section_map = {
            TrackingDomain.ENVIRONMENT: "environment",
            TrackingDomain.SOCIAL: "social",
            TrackingDomain.GOVERNANCE: "governance",
        }
        
        # For BRSR "all" domain, include section_b/section_c
        if domain == TrackingDomain.ALL:
            section_val = {"$in": ["environment", "social", "governance", "section_a", "section_b", "section_c"]}
        else:
            section_val = domain_section_map.get(domain)
        
        # Build config query - handle both "framework" and "frameworks" fields
        fw_match = [
            {"framework": {"$regex": f"^{request.framework_id}$", "$options": "i"}},
            {"frameworks": {"$regex": f"^{request.framework_id}$", "$options": "i"}},
        ]
        if request.framework_id.lower() == "brsr":
            fw_match.extend([{"framework": None}, {"framework": {"$exists": False}}])
        
        config_query = {
            "section": section_val,
            "$or": fw_match,
        }
        
        if request.section_id:
            if "$or" in config_query:
                # Need to use $and to combine with existing $or
                config_query = {
                    "$and": [
                        config_query,
                        {"$or": [
                            {"brsr_section": request.section_id},
                            {"topic": request.section_id},
                            {"brsr_principle": request.section_id},
                            {"disclosure_id": request.section_id},  # For GRI which uses disclosure_id
                        ]}
                    ]
                }
            else:
                config_query["$or"] = [
                    {"brsr_section": request.section_id},
                    {"topic": request.section_id},
                    {"brsr_principle": request.section_id},
                    {"disclosure_id": request.section_id},  # For GRI which uses disclosure_id
                ]
        
        configs = await self._configs.find(config_query, {"_id": 0, "question_key": 1, "disclosure_id": 1}).to_list(500)
        
        # Filter to specific disclosure IDs if provided
        # Support both question_key and disclosure_id matching
        if request.disclosure_ids:
            filtered_configs = []
            for c in configs:
                # Check if it matches question_key OR disclosure_id
                if c.get("question_key") in request.disclosure_ids:
                    filtered_configs.append(c)
                elif c.get("disclosure_id") in request.disclosure_ids:
                    filtered_configs.append(c)
            configs = filtered_configs
        
        # Get user IDs - support both legacy single user and new multiple users
        user_ids = request.assigned_user_ids or []
        if request.assigned_to_user_id and request.assigned_to_user_id not in user_ids:
            user_ids.append(request.assigned_to_user_id)
        
        if not user_ids:
            return {
                "success": False,
                "error": "No users specified for assignment",
                "created_count": 0,
                "updated_count": 0,
                "skipped_count": 0,
            }
        
        # Get existing assignments to determine create vs update
        existing_assignments = {}
        existing = await self._assignments.find(
            {
                "organization_id": organization_id,
                "reporting_period": reporting_period,
                "entity_type": "question",
            },
            {"_id": 0, "entity_id": 1, "id": 1}
        ).to_list(5000)
        existing_assignments = {a["entity_id"]: a["id"] for a in existing}
        existing_keys = set(existing_assignments.keys())
        
        # Create/Update assignments
        created_count = 0
        skipped_count = 0
        updated_count = 0
        group_id = str(__import__("uuid").uuid4())
        
        for config in configs:
            q_key = config["question_key"]
            
            # Skip if already assigned and skip_already_assigned is True
            if request.skip_already_assigned and q_key in existing_keys:
                skipped_count += 1
                continue
            
            # Build assignment data (similar to KPI metrics)
            assignment_data = {
                "organization_id": organization_id,
                "entity_type": "question",  # Required for read path compatibility
                "entity_id": q_key,  # Required for read path compatibility
                "category": "disclosure",  # Virtual category for disclosures
                "subcategory": request.framework_id,  # Framework as subcategory
                "sub_subcategory": q_key,  # Question key as sub_subcategory
                "facility_id": None,  # Disclosures are org-level
                "reporting_period": reporting_period,
                "assignment_level": "organization",
                "start_date": request.start_date,
                "end_date": request.end_date,
                "timezone": request.timezone or "Asia/Kolkata",
                "filling_frequency": request.filling_frequency,
                "due_config": request.due_config,
                "due_date": request.due_date.isoformat() if request.due_date else None,
                "reminder_enabled": request.reminder_enabled,
                "reminder_config": request.reminder_config,
                "reminder_frequency": request.reminder_frequency,  # Add reminder frequency
                "requires_approval": request.requires_approval,
                # Extract approver_id from approval_chain[0] if not directly provided
                # This handles frontend sending approval_chain instead of approver_id
                "approver_id": request.approver_id or (request.approval_chain[0] if request.approval_chain else None),
                "approval_chain": request.approval_chain or [],
                "framework_id": request.framework_id,
                "group_assignment_id": group_id,
            }
            
            # Use assignment_service_v2 which handles multiple assignees properly
            assignment, is_new = await assignment_service_v2.create_or_update_assignment(
                data=assignment_data,
                user_ids=user_ids,
                created_by_user_id=assigned_by_user_id,
            )
            
            if is_new:
                created_count += 1
            else:
                updated_count += 1
        
        return {
            "success": True,
            "created_count": created_count,
            "updated_count": updated_count,
            "skipped_count": skipped_count,
            "group_assignment_id": group_id,
        }
    
    async def reassign_disclosure(
        self,
        organization_id: str,
        disclosure_id: str,
        new_user_id: str,
        reassigned_by_user_id: str,
        reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Reassign a disclosure to a different user.
        
        Does not affect existing response data.
        """
        from modules.esg_assignments.service import assignment_service
        from modules.esg_assignments.models import ReassignRequest
        
        # Find the assignment
        assignment = await self._assignments.find_one(
            {
                "organization_id": organization_id,
                "entity_id": disclosure_id,
                "entity_type": "question",
            },
            {"_id": 0}
        )
        
        if not assignment:
            return {"success": False, "error": "Assignment not found"}
        
        result = await assignment_service.reassign(
            assignment_id=assignment["id"],
            organization_id=organization_id,
            request=ReassignRequest(new_user_id=new_user_id, reason=reason),
            reassigned_by_user_id=reassigned_by_user_id,
        )
        
        return {"success": True, "assignment": result}
    
    # =========================================================================
    # REMINDER OPERATIONS
    # =========================================================================
    
    async def send_reminder(
        self,
        organization_id: str,
        disclosure_id: str,
        sent_by_user_id: str,
        custom_message: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Send an immediate reminder for a disclosure.
        
        Logs the reminder event and sends email via Resend.
        """
        # Get assignment
        assignment = await self._assignments.find_one(
            {
                "organization_id": organization_id,
                "entity_id": disclosure_id,
                "entity_type": "question",
            },
            {"_id": 0}
        )
        
        if not assignment:
            return {"success": False, "error": "No assignment found for this disclosure"}
        
        assigned_user_id = assignment.get("assigned_to_user_id")
        if not assigned_user_id:
            return {"success": False, "error": "No user assigned"}
        
        # Get user details
        user = await self._users.find_one(
            {"id": assigned_user_id},
            {"_id": 0, "email": 1, "name": 1}
        )
        
        if not user or not user.get("email"):
            return {"success": False, "error": "Assigned user has no email"}
        
        # Get disclosure details
        config = await self._configs.find_one(
            {"question_key": disclosure_id},
            {"_id": 0, "label": 1}
        )
        disclosure_name = config.get("label", disclosure_id) if config else disclosure_id
        
        # Get sender details
        sender = await self._users.find_one(
            {"id": sent_by_user_id},
            {"_id": 0, "name": 1, "email": 1}
        )
        sender_name = sender.get("name") or "Admin" if sender else "Admin"
        
        # Build email
        user_name = user.get("name") or user.get("email").split("@")[0]
        due_date = assignment.get("due_date")
        due_str = ""
        if due_date:
            if isinstance(due_date, str):
                due_str = due_date[:10]
            else:
                due_str = due_date.strftime("%Y-%m-%d")
        
        subject = f"Reminder: {disclosure_name} - ESG Disclosure"
        
        body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>ESG Disclosure Reminder</h2>
            <p>Hello {user_name},</p>
            <p>This is a reminder that you have a pending ESG disclosure assignment:</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Disclosure:</strong> {disclosure_name}</p>
                <p><strong>Reporting Period:</strong> {assignment.get('reporting_period', 'N/A')}</p>
                {f'<p><strong>Due Date:</strong> {due_str}</p>' if due_str else ''}
            </div>
            {f'<p><em>Message from {sender_name}:</em> {custom_message}</p>' if custom_message else ''}
            <p>Please complete this disclosure at your earliest convenience.</p>
            <p>Best regards,<br>ESG Platform</p>
        </body>
        </html>
        """
        
        try:
            await send_email(
                to_email=user["email"],
                subject=subject,
                body=body,
            )
            
            # Update last reminder sent
            now = datetime.now(timezone.utc)
            await self._assignments.update_one(
                {"id": assignment["id"]},
                {"$set": {"last_reminder_sent_at": now}}
            )
            
            logger.info(f"Reminder sent for {disclosure_id} to {user['email']}")
            
            return {
                "success": True,
                "sent_to": user["email"],
                "disclosure": disclosure_name,
            }
            
        except Exception as e:
            logger.error(f"Failed to send reminder: {e}")
            return {"success": False, "error": str(e)}
    
    # =========================================================================
    # AGGREGATE QUERIES
    # =========================================================================
    
    async def get_overdue_disclosures(
        self,
        organization_id: str,
        domain: Optional[TrackingDomain] = None,
        reporting_period: Optional[str] = None,
    ) -> List[DisclosureTrackingItem]:
        """Get all overdue disclosures."""
        now = datetime.now(timezone.utc)
        
        query = {
            "organization_id": organization_id,
            "entity_type": "question",
            "due_date": {"$lt": now},
            "status": {"$nin": ["completed"]},  # Use new status architecture
        }
        
        assignments = await self._assignments.find(query, {"_id": 0}).to_list(500)
        
        # Get response status for each
        items = []
        for assignment in assignments:
            q_key = assignment.get("entity_id")
            
            # Check if completed
            response = await self._responses.find_one(
                {
                    "organization_id": organization_id,
                    "question_key": q_key,
                },
                {"_id": 0, "value": 1}
            )
            
            # Check completion - value must be non-empty
            response_value = response.get("value") if response else None
            value_is_empty = response_value is None or response_value == "" or response_value == [] or response_value == {}
            is_completed = response is not None and not value_is_empty
            if is_completed:
                continue  # Skip completed ones
            
            # Get config for name
            config = await self._configs.find_one(
                {"question_key": q_key},
                {"_id": 0, "label": 1, "section": 1, "brsr_section": 1, "framework": 1}
            )
            
            if domain:
                domain_section = {
                    TrackingDomain.ENVIRONMENT: "environment",
                    TrackingDomain.SOCIAL: "social",
                    TrackingDomain.GOVERNANCE: "governance",
                }.get(domain)
                if config and config.get("section") != domain_section:
                    continue
            
            due_date = assignment.get("due_date")
            if isinstance(due_date, str):
                try:
                    due_date = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    due_date = None
            
            # Normalize naive datetime to UTC for comparison
            if due_date and due_date.tzinfo is None:
                due_date = due_date.replace(tzinfo=timezone.utc)
            
            items.append(DisclosureTrackingItem(
                disclosure_id=q_key,
                disclosure_name=self._get_display_name(config, q_key),
                disclosure_type="question",
                section_id=config.get("brsr_section", "") if config else "",
                section_name=config.get("brsr_section", "").replace("_", " ").title() if config else "",
                framework_id=config.get("framework", "brsr") if config else "brsr",
                is_completed=False,
                completion_status=CompletionStatus.NOT_STARTED,
                is_assigned=True,
                assigned_to_user_id=assignment.get("assigned_to_user_id"),
                assignment_id=assignment.get("id"),
                due_date=due_date,
                is_overdue=True,
                days_until_due=(due_date - now).days if due_date else None,
            ))
        
        return items
    
    async def get_unassigned_disclosures(
        self,
        organization_id: str,
        domain: TrackingDomain,
        framework_id: str,
        reporting_period: str,
    ) -> List[DisclosureTrackingItem]:
        """Get all unassigned disclosures for a framework."""
        domain_section = {
            TrackingDomain.ENVIRONMENT: "environment",
            TrackingDomain.SOCIAL: "social",
            TrackingDomain.GOVERNANCE: "governance",
        }.get(domain)
        
        # Get all configs
        configs = await self._configs.find(
            {
                "section": domain_section,
                "framework": {"$regex": f"^{framework_id}$", "$options": "i"},
            },
            {"_id": 0}
        ).to_list(1000)
        
        # Get assigned question keys
        assignments = await self._assignments.find(
            {
                "organization_id": organization_id,
                "reporting_period": reporting_period,
                "entity_type": "question",
            },
            {"_id": 0, "entity_id": 1}
        ).to_list(5000)
        assigned_keys = {a["entity_id"] for a in assignments}
        
        items = []
        for config in configs:
            q_key = config.get("question_key")
            if q_key in assigned_keys:
                continue
            
            items.append(DisclosureTrackingItem(
                disclosure_id=q_key,
                disclosure_name=self._get_display_name(config, q_key),
                disclosure_type="question",
                section_id=config.get("brsr_section") or config.get("topic") or "",
                section_name=(config.get("brsr_section") or config.get("topic") or "").replace("_", " ").title(),
                framework_id=framework_id,
                is_completed=False,
                completion_status=CompletionStatus.NOT_STARTED,
                is_assigned=False,
            ))
        
        return items
    
    async def get_stale_disclosures(
        self,
        organization_id: str,
        domain: Optional[TrackingDomain] = None,
        threshold_days: int = DEFAULT_STALE_THRESHOLD_DAYS,
    ) -> List[DisclosureTrackingItem]:
        """Get all stale (old) completed disclosures."""
        now = datetime.now(timezone.utc)
        stale_cutoff = now - timedelta(days=threshold_days)
        
        # Get responses older than threshold
        query = {
            "organization_id": organization_id,
            "updated_at": {"$lt": stale_cutoff},
            "value": {"$ne": None},
        }
        
        responses = await self._responses.find(query, {"_id": 0}).to_list(1000)
        
        items = []
        for response in responses:
            q_key = response.get("question_key")
            
            config = await self._configs.find_one(
                {"question_key": q_key},
                {"_id": 0, "label": 1, "section": 1, "brsr_section": 1, "framework": 1}
            )
            
            if domain:
                domain_section = {
                    TrackingDomain.ENVIRONMENT: "environment",
                    TrackingDomain.SOCIAL: "social",
                    TrackingDomain.GOVERNANCE: "governance",
                }.get(domain)
                if config and config.get("section") != domain_section:
                    continue
            
            updated_at = response.get("updated_at")
            if isinstance(updated_at, str):
                try:
                    updated_at = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    updated_at = None
            
            # Normalize naive datetime to UTC for comparison
            if updated_at and updated_at.tzinfo is None:
                updated_at = updated_at.replace(tzinfo=timezone.utc)
            
            days_since = (now - updated_at).days if updated_at else None
            
            items.append(DisclosureTrackingItem(
                disclosure_id=q_key,
                disclosure_name=self._get_display_name(config, q_key),
                disclosure_type="question",
                section_id=config.get("brsr_section", "") if config else "",
                section_name=config.get("brsr_section", "").replace("_", " ").title() if config else "",
                framework_id=config.get("framework", "brsr") if config else "brsr",
                is_completed=True,
                completion_status=CompletionStatus.STALE,
                last_response_updated_at=updated_at,
                is_stale=True,
                days_since_update=days_since,
            ))
        
        return items


# Singleton instance
tracking_service = TrackingService()
