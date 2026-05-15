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
        audit_entry = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "action": action.value if isinstance(action, AuditAction) else action,
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
                "old_values": self._sanitize_values(old_values),
                "new_values": self._sanitize_values(new_values)
            } if old_values or new_values else None,
            "metadata": metadata,
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
        
        return {
            "logs": logs,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    
    async def get_log_by_id(self, log_id: str) -> Optional[Dict[str, Any]]:
        """Get a single audit log entry by ID"""
        return await self.collection.find_one({"id": log_id}, {"_id": 0})
    
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
