"""Phase B11+: WebSocket Live Dashboard Cockpit
=============================================

Connects clients to a real-time stream of dashboard updates driven by the
in-process event bus. When an emission is saved/updated/deleted (or any
audit event lands for the EMISSION/SINK modules), connected clients
receive a `dashboard.refresh` push so the UI can re-fetch / re-render.

Design notes:
- Authentication uses the same JWT as REST routes. Token is passed via
  query parameter `?token=...` (browsers can't set Authorization headers
  on WebSocket handshakes).
- One connection manager per process (fine for single-replica deploy).
- Server-side filtering: events only push to clients whose org matches
  the event's organization_id.
- Heartbeat: clients send `{"type":"ping"}` every 30s; server replies
  `{"type":"pong"}`. Stale connections drop on next emit.
- Payload is intentionally tiny — clients re-fetch full stats from the
  REST endpoint when they receive a `dashboard.refresh`.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
import jwt

from app.config.env import JWT_SECRET, JWT_ALGORITHM
from events.event_bus import event_bus, Events
from shared.database.mongo import db

logger = logging.getLogger(__name__)
router = APIRouter()


class _Connection:
    """Per-client state."""
    __slots__ = ("ws", "user_id", "user_role", "organization_id")

    def __init__(self, ws: WebSocket, user_id: str, user_role: str, organization_id: Optional[str]) -> None:
        self.ws = ws
        self.user_id = user_id
        self.user_role = user_role
        self.organization_id = organization_id


class ConnectionManager:
    """Tracks active WS clients and pushes events to interested ones."""

    def __init__(self) -> None:
        self._clients: Set[_Connection] = set()
        self._lock = asyncio.Lock()

    async def add(self, conn: _Connection) -> None:
        async with self._lock:
            self._clients.add(conn)
        logger.info(
            "WS dashboard: client connected user=%s role=%s org=%s total=%d",
            conn.user_id, conn.user_role, conn.organization_id, len(self._clients),
        )

    async def remove(self, conn: _Connection) -> None:
        async with self._lock:
            self._clients.discard(conn)
        logger.info("WS dashboard: client disconnected total=%d", len(self._clients))

    def client_count(self) -> int:
        return len(self._clients)

    async def broadcast(self, payload: Dict[str, Any], target_org: Optional[str] = None) -> None:
        """Push payload as JSON to interested clients.

        - super_admin clients always receive everything.
        - org-scoped clients only receive events tagged for their organization.
        """
        text = json.dumps(payload, default=str)
        dead: List[_Connection] = []
        # Snapshot the set to avoid holding the lock during awaits.
        clients = list(self._clients)
        for conn in clients:
            try:
                # Filter by org unless super_admin or untargeted.
                if conn.user_role != "super_admin" and target_org:
                    if conn.organization_id != target_org:
                        continue
                await conn.ws.send_text(text)
            except Exception:
                dead.append(conn)
        for c in dead:
            await self.remove(c)


manager = ConnectionManager()


# ---------------------------------------------------------------------------
# Event-bus → broadcast wiring (registered once at module import).
# ---------------------------------------------------------------------------
_EMISSION_MODULES = {"ghg_emission", "ghg_sink"}


async def _on_audit_persisted(payload: Dict[str, Any]) -> None:
    if payload.get("module") not in _EMISSION_MODULES:
        return
    await manager.broadcast(
        {
            "type": "dashboard.refresh",
            "reason": "audit.persisted",
            "module": payload.get("module"),
            "action": payload.get("action"),
            "audit_id": payload.get("audit_id"),
        },
        target_org=payload.get("organization_id"),
    )


async def _on_emission_event(payload: Dict[str, Any]) -> None:
    await manager.broadcast(
        {
            "type": "dashboard.refresh",
            "reason": "emission.changed",
            "scope": payload.get("scope"),
            "category": payload.get("category"),
            "record_id": payload.get("record_id"),
        },
        target_org=payload.get("organization_id"),
    )


# Register handlers (idempotent — re-import won't double-register).
event_bus.subscribe(Events.AUDIT_PERSISTED, _on_audit_persisted)
event_bus.subscribe(Events.EMISSION_SAVED, _on_emission_event)
event_bus.subscribe(Events.EMISSION_UPDATED, _on_emission_event)
event_bus.subscribe(Events.EMISSION_DELETED, _on_emission_event)


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------
async def _authenticate(token: Optional[str]) -> Optional[Dict[str, Any]]:
    """Decode JWT and return the user document, or None if invalid."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user or user.get("deleted_at"):
        return None
    if user.get("status") and user.get("status") != "active":
        return None
    return user


@router.websocket("/ws/dashboard")
async def dashboard_ws(ws: WebSocket) -> None:
    """Stream dashboard refresh notifications.

    Client must connect with `?token=<JWT>` (same JWT used for REST).
    """
    token = ws.query_params.get("token")
    user = await _authenticate(token)
    if not user:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await ws.accept()
    conn = _Connection(
        ws=ws,
        user_id=user["id"],
        user_role=user.get("role", "user"),
        organization_id=user.get("organization_id"),
    )
    await manager.add(conn)
    try:
        # Send a hello so clients can confirm the channel is live.
        await ws.send_text(json.dumps({
            "type": "hello",
            "user_id": conn.user_id,
            "role": conn.user_role,
            "organization_id": conn.organization_id,
        }))
        while True:
            msg = await ws.receive_text()
            # Minimal protocol: client may send {"type":"ping"} -> server "pong".
            try:
                data = json.loads(msg)
            except json.JSONDecodeError:
                continue
            if data.get("type") == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WS dashboard: error on connection user=%s", conn.user_id)
    finally:
        await manager.remove(conn)


__all__ = ["router", "manager"]
