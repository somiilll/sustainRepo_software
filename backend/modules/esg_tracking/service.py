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
        Priority: label > description (full text) > formatted key
        Returns full text - truncation should be handled by frontend.
        """
        if not config:
            return self._format_question_key(q_key)
        
        label = config.get("label")
        if label:
            return label
        
        desc = config.get("description")
        if desc:
            # Return full description - let frontend handle truncation
            # For single-sentence descriptions, return the first sentence
            first_sentence = desc.split('.')[0]
            if len(first_sentence) < len(desc) - 1:  # There's more after first sentence
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
            # Fetch all sections
            configs = await self._configs.find(
                {"section": {"$in": ["environment", "social", "governance"]}},
                {"_id": 0}
            ).to_list(5000)
        else:
            section = domain_section_map.get(domain)
            configs = await self._configs.find(
                {"section": section},
                {"_id": 0}
            ).to_list(1000)
        
        # Group configs by framework
        # Note: Configs without framework field are treated as BRSR
        framework_configs: Dict[str, List[dict]] = {}
        for config in configs:
            fw = (config.get("framework") or "brsr").lower()
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
                
                # Check completion
                is_completed = response is not None and response.get("value") is not None
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
    ) -> List[SectionSummary]:
        """
        Get all sections within a framework with their tracking status.
        
        Sections are grouped by brsr_section, topic, or principle depending on framework.
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
            section_filter = {"$in": ["environment", "social", "governance"]}
        else:
            section_filter = domain_section_map.get(domain)
        
        # Get all configs for this framework and domain
        # Note: Some configs may not have 'framework' field - treat them as BRSR by default
        config_query = {
            "section": section_filter,
            "$or": [
                {"framework": {"$regex": f"^{framework_id}$", "$options": "i"}},
                {"framework": None},  # Legacy configs without framework field
                {"framework": {"$exists": False}},  # Legacy configs without framework field
            ]
        }
        
        # If not BRSR, only get configs with explicit framework match
        if framework_id.lower() != "brsr":
            config_query = {
                "section": section_filter,
                "framework": {"$regex": f"^{framework_id}$", "$options": "i"},
            }
        
        configs = await self._configs.find(config_query, {"_id": 0}).to_list(5000)
        
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
                
                # Completion
                is_completed = response is not None and response.get("value") is not None
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
            section_filter = {"$in": ["environment", "social", "governance"]}
        else:
            section_filter = domain_section_map.get(domain)
        
        # Get org settings
        org = await self._organizations.find_one(
            {"id": organization_id},
            {"_id": 0, "stale_threshold_days": 1}
        )
        stale_threshold = org.get("stale_threshold_days", DEFAULT_STALE_THRESHOLD_DAYS) if org else DEFAULT_STALE_THRESHOLD_DAYS
        
        # Build config query - handle missing framework field for BRSR
        if framework_id.lower() == "brsr":
            config_query = {
                "section": section_filter,
                "$or": [
                    {"framework": {"$regex": f"^{framework_id}$", "$options": "i"}},
                    {"framework": None},
                    {"framework": {"$exists": False}},
                ],
                "$and": [
                    {"$or": [
                        {"brsr_principle": section_id},
                        {"brsr_section": section_id},
                        {"topic": section_id},
                    ]}
                ]
            }
        elif framework_id.upper() == "GRI":
            # For GRI, section_id is the disclosure_id
            config_query = {
                "section": section_filter,
                "framework": {"$regex": f"^{framework_id}$", "$options": "i"},
                "disclosure_id": section_id,
            }
        else:
            config_query = {
                "section": section_filter,
                "framework": {"$regex": f"^{framework_id}$", "$options": "i"},
                "$or": [
                    {"brsr_section": section_id},
                    {"topic": section_id},
                    {"brsr_principle": section_id},
                ]
            }
        
        configs = await self._configs.find(config_query, {"_id": 0}).to_list(500)
        
        # Get responses
        responses = await self._responses.find(
            {
                "organization_id": organization_id,
                "reporting_year": reporting_period,
            },
            {"_id": 0}
        ).to_list(5000)
        response_map = {r["question_key"]: r for r in responses}
        
        # Get assignments and aggregate by entity_id for multi-assignee support
        raw_assignments = await self._assignments.find(
            {
                "organization_id": organization_id,
                "reporting_period": reporting_period,
                "entity_type": "question",
            },
            {"_id": 0}
        ).to_list(5000)
        
        # Aggregate assignments by entity_id (question_key) for multi-assignee display
        assignment_map = {}
        for a in raw_assignments:
            entity_id = a.get("entity_id")
            if entity_id not in assignment_map:
                assignment_map[entity_id] = {
                    **a,
                    "assignees": [],
                }
            
            # Add assignee to the list
            if a.get("assigned_to_user_id"):
                user = await db.users.find_one(
                    {"id": a["assigned_to_user_id"]},
                    {"_id": 0, "full_name": 1, "name": 1, "email": 1}
                )
                assignee_entry = {
                    "user_id": a["assigned_to_user_id"],
                    "user_name": user.get("full_name") or user.get("name") if user else None,
                    "user_email": user.get("email") if user else None,
                    "role": a.get("role", "editor"),
                    "assignment_id": a.get("id"),
                }
                existing_ids = [x["user_id"] for x in assignment_map[entity_id]["assignees"]]
                if assignee_entry["user_id"] not in existing_ids:
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
        
        for config in configs:
            q_key = config.get("question_key")
            sub_questions = config.get("sub_questions", [])
            
            # Helper function to build a disclosure item
            def build_disclosure_item(
                item_key, display_name, item_type, 
                response, assignment, approval,
                parent_key=None, sub_key=None
            ):
                nonlocal total, completed, pending, assigned, unassigned, overdue, due_soon, stale, last_updated, assigned_user_ids
                
                total += 1
                
                # Determine completion status
                is_completed = response is not None and response.get("value") is not None
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
                
                # Approval status
                appr_status = None
                if approval:
                    appr_status = approval.get("status")
                
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
                    disclosure_name=display_name,
                    disclosure_type=item_type,
                    section_id=section_id,
                    section_name=section_id.replace("_", " ").title(),
                    framework_id=framework_id,
                    is_completed=is_completed,
                    completion_status=comp_status,
                    response_data=response.get("value") if response else None,
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
                    filling_frequency=filling_freq,
                )
            
            # If question has sub_questions, create tracking items for each sub-question
            if sub_questions and len(sub_questions) > 0:
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
                        parent_key=q_key, sub_key=sub_key
                    )
                    if item:
                        disclosures.append(item)
            else:
                # No sub-questions - treat as single trackable item
                response = response_map.get(q_key)
                assignment = assignment_map.get(q_key)
                approval = approval_map.get(q_key)
                
                item = build_disclosure_item(
                    q_key, self._get_display_name(config, q_key), "question",
                    response, assignment, approval
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
        
        Skips already assigned disclosures if skip_already_assigned=True.
        """
        from modules.esg_assignments.service import assignment_service
        from modules.esg_assignments.models import (
            CreateAssignmentRequest,
            EntityType,
            AssignmentLevel,
            AssignmentRole,
            FillingFrequency,
        )
        
        domain_section_map = {
            TrackingDomain.ENVIRONMENT: "environment",
            TrackingDomain.SOCIAL: "social",
            TrackingDomain.GOVERNANCE: "governance",
        }
        section = domain_section_map.get(domain)
        
        # Build config query - handle missing framework field for BRSR
        if request.framework_id.lower() == "brsr":
            config_query = {
                "section": section,
                "$or": [
                    {"framework": {"$regex": f"^{request.framework_id}$", "$options": "i"}},
                    {"framework": None},
                    {"framework": {"$exists": False}},
                ]
            }
        else:
            config_query = {
                "section": section,
                "framework": {"$regex": f"^{request.framework_id}$", "$options": "i"},
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
                        ]}
                    ]
                }
            else:
                config_query["$or"] = [
                    {"brsr_section": request.section_id},
                    {"topic": request.section_id},
                    {"brsr_principle": request.section_id},
                ]
        
        configs = await self._configs.find(config_query, {"_id": 0, "question_key": 1}).to_list(500)
        
        # Filter to specific disclosure IDs if provided
        if request.disclosure_ids:
            configs = [c for c in configs if c["question_key"] in request.disclosure_ids]
        
        # Get existing assignments
        existing_assignments = {}
        if not request.skip_already_assigned or True:  # Always fetch for potential update
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
            
            try:
                role = AssignmentRole(request.role) if request.role else AssignmentRole.OWNER
            except (ValueError, KeyError):
                role = AssignmentRole.OWNER
            
            try:
                freq = FillingFrequency(request.filling_frequency) if request.filling_frequency else None
            except (ValueError, KeyError):
                freq = None
            
            # Parse reminder frequency if provided
            reminder_freq = None
            if request.reminder_frequency:
                try:
                    from modules.esg_assignments.models import ReminderFrequency
                    reminder_freq = ReminderFrequency(request.reminder_frequency)
                except (ValueError, KeyError):
                    reminder_freq = None
            
            create_req = CreateAssignmentRequest(
                entity_type=EntityType.QUESTION,
                assignment_level=AssignmentLevel.QUESTION,
                entity_id=q_key,
                reporting_period=reporting_period,
                assigned_to_user_id=request.assigned_to_user_id,
                role=role,
                due_date=request.due_date,
                framework_id=request.framework_id,
                requires_approval=request.requires_approval,
                approval_chain=request.approval_chain,  # Multi-level approval chain
                filling_frequency=freq,
                reminder_enabled=request.reminder_enabled,
                reminder_frequency=reminder_freq,
                reminder_config=request.reminder_config,
            )
            
            # Check if this is a reassignment (existing assignment for this question)
            existing_assignment_id = existing_assignments.get(q_key)
            if existing_assignment_id and not request.skip_already_assigned:
                # Update existing assignment (reassign)
                from modules.esg_assignments.models import ReassignRequest
                await assignment_service.reassign(
                    assignment_id=existing_assignment_id,
                    organization_id=organization_id,
                    request=ReassignRequest(new_user_id=request.assigned_to_user_id),
                    reassigned_by_user_id=assigned_by_user_id,
                )
                updated_count += 1
            else:
                # Create new assignment
                await assignment_service.create_assignment(
                    organization_id=organization_id,
                    request=create_req,
                    assigned_by_user_id=assigned_by_user_id,
                    group_assignment_id=group_id,
                )
                created_count += 1
        
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
            "status": {"$nin": ["approved", "submitted"]},
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
            
            is_completed = response is not None and response.get("value") is not None
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
