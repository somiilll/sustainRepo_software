"""
Audit Logger Module
Centralized logging for all user and admin activities
"""
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorDatabase
from enum import Enum


class AuditAction(str, Enum):
    """Enumeration of all trackable actions"""
    # CRUD Operations
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    VIEW = "view"
    
    # Authentication
    LOGIN = "login"
    LOGOUT = "logout"
    PASSWORD_RESET = "password_reset"
    PASSWORD_CHANGE = "password_change"
    
    # Calculations
    CALCULATE = "calculate"
    RECALCULATE = "recalculate"
    
    # Data Operations
    IMPORT = "import"
    EXPORT = "export"
    UPLOAD = "upload"
    DOWNLOAD = "download"
    
    # Status Changes
    ACTIVATE = "activate"
    DEACTIVATE = "deactivate"
    APPROVE = "approve"
    REJECT = "reject"
    
    # Admin Actions
    ASSIGN = "assign"
    UNASSIGN = "unassign"
    CONFIGURE = "configure"


class AuditModule(str, Enum):
    """Enumeration of all modules that can be audited"""
    AUTH = "authentication"
    ORGANIZATION = "organization"
    FACILITY = "facility"
    USER = "user"
    EMISSION = "ghg_emission"
    SINK = "ghg_sink"
    FUEL_DATABASE = "fuel_database"
    EMISSION_FACTOR = "emission_factor"
    FORMULA = "formula"
    SCOPE_CATEGORY = "scope_category"
    SECTOR = "sector"
    UNIT = "unit"
    GWP_CONFIG = "gwp_config"
    REPORT = "report"
    CALCULATION_ENGINE = "calculation_engine"
    FILE = "file"
    SUBSCRIPTION = "subscription"
    SETTINGS = "settings"


class AuditLogger:
    """Centralized audit logging service"""

    CHANGE_FIELDS_TO_EXCLUDE = {
        "id", "organization_id", "org_id", "category_id", "category_code",
        "formula_id", "formula_version_id", "decision_tree_version_id", "formula_snapshot",
        "inputs", "outputs", "properties", "steps", "submission_batch_id", "fuel_database_id",
        "scope3_ef_id", "created_by", "created_by_email", "created_by_name", "created_at",
        "updated_by", "updated_by_email", "updated_by_name", "updated_at", "version", "version_number",
        "justification",
    }
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.audit_logs
    
    async def log(
        self,
        action: AuditAction,
        module: AuditModule,
        user_id: str,
        user_email: str,
        user_role: str,
        organization_id: Optional[str] = None,
        resource_id: Optional[str] = None,
        resource_name: Optional[str] = None,
        description: Optional[str] = None,
        old_values: Optional[Dict[str, Any]] = None,
        new_values: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        status: str = "success",
        error_message: Optional[str] = None
    ) -> str:
        """
        Log an audit event
        
        Args:
            action: The action performed (create, update, delete, etc.)
            module: The module where action was performed
            user_id: ID of user who performed the action
            user_email: Email of user who performed the action
            user_role: Role of user (admin, user, super_admin)
            organization_id: ID of organization (if applicable)
            resource_id: ID of the affected resource
            resource_name: Human-readable name of the resource
            description: Human-readable description of the action
            old_values: Previous values (for updates)
            new_values: New values (for creates/updates)
            metadata: Additional context (formula used, inputs, outputs, etc.)
            ip_address: Client IP address
            user_agent: Client user agent
            status: 'success' or 'failure'
            error_message: Error message if status is 'failure'
        
        Returns:
            The ID of the created audit log entry
        """
        action_value = action.value if isinstance(action, AuditAction) else action
        sanitized_old_values = self._prepare_audit_values(old_values)
        sanitized_new_values = self._prepare_audit_values(new_values)

        if action_value == AuditAction.UPDATE.value:
            audit_old_values, audit_new_values = self._diff_audit_values(sanitized_old_values, sanitized_new_values)
        elif action_value == AuditAction.DELETE.value:
            audit_old_values, audit_new_values = sanitized_old_values, None
        else:
            audit_old_values, audit_new_values = None, sanitized_new_values

        audit_entry = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "action": action_value,
            "module": module.value if isinstance(module, AuditModule) else module,
            "user": {
                "id": user_id,
                "email": user_email,
                "role": user_role
            },
            "organization_id": organization_id,
            "resource": {
                "id": resource_id,
                "name": resource_name
            } if resource_id else None,
            "description": description,
            "changes": {
                "old_values": audit_old_values,
                "new_values": audit_new_values,
            } if audit_old_values or audit_new_values else None,
            "metadata": self._prepare_audit_values(metadata),
            "client": {
                "ip_address": ip_address,
                "user_agent": user_agent
            } if ip_address or user_agent else None,
            "status": status,
            "error_message": error_message
        }
        
        # Remove None values for cleaner storage
        audit_entry = {k: v for k, v in audit_entry.items() if v is not None}
        
        await self.collection.insert_one(audit_entry)

        # Phase B11: emit audit.persisted event (best-effort, never breaks audit insert).
        try:
            from events.event_bus import event_bus, Events
            event_bus.emit_nowait(Events.AUDIT_PERSISTED, {
                "audit_id": audit_entry["id"],
                "action": audit_entry["action"],
                "module": audit_entry["module"],
                "user_id": user_id,
                "organization_id": organization_id,
                "resource_id": resource_id,
                "timestamp": audit_entry["timestamp"],
            })
        except Exception:
            # Audit must never fail because of an event handler.
            pass

        return audit_entry["id"]
    
    def _sanitize_values(self, values: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Remove sensitive fields and MongoDB ObjectIds from values"""
        if not values:
            return None
        
        # Fields to exclude from logging
        sensitive_fields = {'password', 'password_hash', 'token', 'secret', '_id'}
        
        sanitized = {}
        for key, value in values.items():
            if key.lower() in sensitive_fields:
                continue
            # Convert ObjectId to string if needed
            if hasattr(value, '__str__') and type(value).__name__ == 'ObjectId':
                sanitized[key] = str(value)
            elif isinstance(value, dict):
                sanitized[key] = self._sanitize_values(value)
            elif isinstance(value, list):
                sanitized[key] = [
                    self._sanitize_values(item) if isinstance(item, dict) else item 
                    for item in value
                ]
            else:
                sanitized[key] = value
        
        return sanitized if sanitized else None

    def _prepare_audit_values(self, values: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Keep only populated, user-meaningful fields in business audit history."""
        sanitized = self._sanitize_values(values)
        if not sanitized:
            return None

        def clean(value: Any, key: Optional[str] = None) -> Any:
            if key and key.lower() in self.CHANGE_FIELDS_TO_EXCLUDE:
                return None
            if isinstance(value, dict):
                cleaned = {child_key: clean(child_value, child_key) for child_key, child_value in value.items()}
                cleaned = {child_key: child_value for child_key, child_value in cleaned.items() if child_value is not None}
                return cleaned or None
            if isinstance(value, list):
                cleaned = [clean(item) for item in value]
                cleaned = [item for item in cleaned if item is not None]
                return cleaned or None
            if value is None or value == "":
                return None
            return value

        return clean(sanitized)

    def _diff_audit_values(
        self,
        old_values: Optional[Dict[str, Any]],
        new_values: Optional[Dict[str, Any]],
    ) -> tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
        """Return matching old/new dictionaries containing only actual changes."""
        missing = object()

        def diff(old_value: Any, new_value: Any) -> tuple[Any, Any]:
            if isinstance(old_value, dict) and isinstance(new_value, dict):
                old_diff, new_diff = {}, {}
                for key in set(old_value) | set(new_value):
                    old_child, new_child = old_value.get(key, missing), new_value.get(key, missing)
                    if old_child is missing or new_child is missing:
                        if old_child is not missing:
                            old_diff[key] = old_child
                        if new_child is not missing:
                            new_diff[key] = new_child
                        continue
                    old_changed, new_changed = diff(old_child, new_child)
                    if old_changed is not missing:
                        old_diff[key] = old_changed
                    if new_changed is not missing:
                        new_diff[key] = new_changed
                return (old_diff or missing), (new_diff or missing)
            if old_value != new_value:
                return old_value, new_value
            return missing, missing

        old_diff, new_diff = diff(old_values or {}, new_values or {})
        return (
            old_diff if old_diff is not missing else None,
            new_diff if new_diff is not missing else None,
        )
    
    async def get_logs(
        self,
        organization_id: Optional[str] = None,
        user_id: Optional[str] = None,
        module: Optional[str] = None,
        action: Optional[str] = None,
        resource_id: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
        sort_by: str = "timestamp",
        sort_order: str = "desc"
    ) -> Dict[str, Any]:
        """
        Retrieve audit logs with filtering and pagination
        
        Returns:
            Dictionary with 'logs' list and 'total' count
        """
        query = {}
        
        if organization_id:
            query["organization_id"] = organization_id
        
        if user_id:
            query["user.id"] = user_id
        
        if module:
            query["module"] = module
        
        if action:
            query["action"] = action
        
        if resource_id:
            query["resource.id"] = resource_id
        
        if status:
            query["status"] = status
        
        if start_date:
            query.setdefault("timestamp", {})["$gte"] = start_date
        
        if end_date:
            query.setdefault("timestamp", {})["$lte"] = end_date
        
        if search:
            query["$or"] = [
                {"description": {"$regex": search, "$options": "i"}},
                {"user.email": {"$regex": search, "$options": "i"}},
                {"resource.name": {"$regex": search, "$options": "i"}}
            ]
        
        # Get total count
        total = await self.collection.count_documents(query)
        
        # Sort direction
        sort_direction = -1 if sort_order == "desc" else 1
        
        # Fetch logs
        cursor = self.collection.find(query, {"_id": 0})
        cursor = cursor.sort(sort_by, sort_direction)
        cursor = cursor.skip(skip).limit(limit)
        
        logs = await cursor.to_list(length=limit)
        await self._enrich_entity_names(logs)
        
        return {
            "logs": logs,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    
    async def get_log_by_id(self, log_id: str) -> Optional[Dict[str, Any]]:
        """Get a single audit log entry by ID"""
        log = await self.collection.find_one({"id": log_id}, {"_id": 0})
        if log:
            await self._enrich_entity_names([log])
        return log

    async def _enrich_entity_names(self, logs: List[Dict[str, Any]]) -> None:
        """Attach safe human-readable organization and facility lookup maps to audit logs."""
        organization_ids, facility_ids = set(), set()

        def collect_references(value: Any, key: Optional[str] = None) -> None:
            if isinstance(value, dict):
                for child_key, child_value in value.items():
                    collect_references(child_value, child_key)
                return
            if isinstance(value, list):
                for item in value:
                    collect_references(item, key)
                return
            if not value:
                return
            if key in {"organization_id", "org_id"}:
                organization_ids.add(str(value))
            elif key == "facility_id":
                facility_ids.add(str(value))

        for log in logs:
            collect_references(log)
            resource = log.get("resource") or {}
            if log.get("module") == AuditModule.ORGANIZATION.value and resource.get("id"):
                organization_ids.add(str(resource["id"]))
            if log.get("module") == AuditModule.FACILITY.value and resource.get("id"):
                facility_ids.add(str(resource["id"]))

        organizations = await self.db.organizations.find(
            {"id": {"$in": list(organization_ids)}},
            {"_id": 0, "id": 1, "name": 1, "organization_name": 1},
        ).to_list(length=len(organization_ids) or 1)
        facilities = await self.db.facilities.find(
            {"id": {"$in": list(facility_ids)}},
            {"_id": 0, "id": 1, "name": 1, "facility_name": 1},
        ).to_list(length=len(facility_ids) or 1)
        organization_names = {
            item["id"]: item.get("organization_name") or item.get("name") or "Unavailable organization"
            for item in organizations
        }
        facility_names = {
            item["id"]: item.get("facility_name") or item.get("name") or "Unavailable facility"
            for item in facilities
        }

        for log in logs:
            log["resolved_entities"] = {
                "organizations": organization_names,
                "facilities": facility_names,
            }
            resource = log.get("resource")
            if not resource or resource.get("name"):
                continue
            resource_id = str(resource.get("id") or "")
            if log.get("module") == AuditModule.ORGANIZATION.value:
                resource["name"] = organization_names.get(resource_id, "Unavailable organization")
            elif log.get("module") == AuditModule.FACILITY.value:
                resource["name"] = facility_names.get(resource_id, "Unavailable facility")
    
    async def get_activity_summary(
        self,
        organization_id: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get summary statistics of audit activities"""
        match_stage = {}
        
        if organization_id:
            match_stage["organization_id"] = organization_id
        
        if start_date or end_date:
            match_stage["timestamp"] = {}
            if start_date:
                match_stage["timestamp"]["$gte"] = start_date
            if end_date:
                match_stage["timestamp"]["$lte"] = end_date
        
        pipeline = []
        
        if match_stage:
            pipeline.append({"$match": match_stage})
        
        # Aggregate by action
        pipeline.append({
            "$group": {
                "_id": {
                    "action": "$action",
                    "module": "$module"
                },
                "count": {"$sum": 1}
            }
        })
        
        results = await self.collection.aggregate(pipeline).to_list(1000)
        
        # Organize results
        by_action = {}
        by_module = {}
        
        for item in results:
            action = item["_id"]["action"]
            module = item["_id"]["module"]
            count = item["count"]
            
            by_action[action] = by_action.get(action, 0) + count
            by_module[module] = by_module.get(module, 0) + count
        
        # Get top active users
        user_pipeline = []
        if match_stage:
            user_pipeline.append({"$match": match_stage})
        user_pipeline.extend([
            {"$group": {"_id": "$user.email", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10}
        ])
        
        top_users = await self.collection.aggregate(user_pipeline).to_list(10)
        
        return {
            "by_action": by_action,
            "by_module": by_module,
            "top_users": [{"email": u["_id"], "count": u["count"]} for u in top_users],
            "total_events": sum(by_action.values())
        }


# Global audit logger instance (initialized in server.py)
audit_logger: Optional[AuditLogger] = None


def get_audit_logger() -> AuditLogger:
    """Get the global audit logger instance"""
    global audit_logger
    if audit_logger is None:
        raise RuntimeError("Audit logger not initialized")
    return audit_logger


def init_audit_logger(db: AsyncIOMotorDatabase) -> AuditLogger:
    """Initialize the global audit logger instance"""
    global audit_logger
    audit_logger = AuditLogger(db)
    return audit_logger
