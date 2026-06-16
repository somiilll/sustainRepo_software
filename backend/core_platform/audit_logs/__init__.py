"""
Platform Audit Logs Module

Re-exports the audit logging infrastructure.
"""

from audit_logger import (
    AuditLogger,
    AuditAction,
    AuditModule,
    get_audit_logger,
)

__all__ = [
    "AuditLogger",
    "AuditAction",
    "AuditModule",
    "get_audit_logger",
]
