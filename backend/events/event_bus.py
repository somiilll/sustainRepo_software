"""
Phase B11: In-process Event Bus
================================

A minimal, dependency-free pub/sub for backend domain events.

Design constraints (per architecture doc):
- Pure in-process (no Redis/Kafka). Migration to a real bus later changes this
  module only — handlers + emitters stay the same.
- Both sync and async handlers supported. Async handlers are awaited; sync
  handlers run in the calling thread.
- Failures in one handler MUST NOT break the emitter or other handlers.
  Errors are logged and swallowed.
- Idempotent registration: subscribing the same handler twice for the same
  event is a no-op (matches the no-double-fire expectation).

Canonical events (declared, not enforced):
    emission.saved      payload: {record_id, scope, facility_id, organization_id}
    emission.updated    payload: {record_id, field_changes}
    emission.deleted    payload: {record_id}
    audit.persisted     payload: {audit_id, action, module, user_id}
    report.generated    payload: {report_id, format, facility_id}
    upload.completed    payload: {upload_id, scope, total_rows, success_rows}
    factor.overridden   payload: {factor_id, facility_id, justification}

Usage:
    from events.event_bus import event_bus

    @event_bus.on("audit.persisted")
    async def handle_audit_persisted(payload: dict):
        ...

    await event_bus.emit("audit.persisted", {"audit_id": "abc", ...})
"""
import asyncio
import inspect
import logging
from collections import defaultdict
from typing import Any, Awaitable, Callable, Dict, List, Set, Union

logger = logging.getLogger(__name__)

# Handler type — either sync or async callable accepting a single payload dict.
EventHandler = Callable[[Dict[str, Any]], Union[None, Awaitable[None]]]


# Canonical event names. Treat as documentation, not enforcement.
class Events:
    EMISSION_SAVED = "emission.saved"
    EMISSION_UPDATED = "emission.updated"
    EMISSION_DELETED = "emission.deleted"
    AUDIT_PERSISTED = "audit.persisted"
    REPORT_GENERATED = "report.generated"
    UPLOAD_COMPLETED = "upload.completed"
    FACTOR_OVERRIDDEN = "factor.overridden"


class EventBus:
    """In-process pub/sub. Thread-safe enough for single-process FastAPI."""

    def __init__(self) -> None:
        # Use list (not set) to preserve subscription order; dedup via id().
        self._handlers: Dict[str, List[EventHandler]] = defaultdict(list)
        self._handler_ids: Dict[str, Set[int]] = defaultdict(set)

    def subscribe(self, event_name: str, handler: EventHandler) -> EventHandler:
        """Register a handler for the given event. Idempotent.

        Returns the handler to allow use as a decorator.
        """
        if id(handler) in self._handler_ids[event_name]:
            return handler  # already registered — silent no-op
        self._handlers[event_name].append(handler)
        self._handler_ids[event_name].add(id(handler))
        return handler

    # Decorator alias.
    def on(self, event_name: str) -> Callable[[EventHandler], EventHandler]:
        def _decorator(handler: EventHandler) -> EventHandler:
            return self.subscribe(event_name, handler)
        return _decorator

    def unsubscribe(self, event_name: str, handler: EventHandler) -> None:
        if id(handler) not in self._handler_ids.get(event_name, set()):
            return
        self._handlers[event_name] = [h for h in self._handlers[event_name] if id(h) != id(handler)]
        self._handler_ids[event_name].discard(id(handler))

    async def emit(self, event_name: str, payload: Dict[str, Any]) -> None:
        """Fire an event. All handlers run; one handler's failure does not abort others."""
        handlers = list(self._handlers.get(event_name, []))
        if not handlers:
            return
        for h in handlers:
            try:
                result = h(payload)
                if inspect.isawaitable(result):
                    await result
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "Event handler %r for %r raised; continuing. payload=%r err=%r",
                    getattr(h, "__name__", repr(h)),
                    event_name,
                    payload,
                    exc,
                )

    def emit_nowait(self, event_name: str, payload: Dict[str, Any]) -> None:
        """Fire-and-forget from a sync context. Schedules emit on the running loop if any."""
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # No running loop — run synchronously, awaiting only sync handlers.
            for h in list(self._handlers.get(event_name, [])):
                try:
                    result = h(payload)
                    if inspect.isawaitable(result):
                        # Best-effort: discard async handlers in pure-sync context.
                        result.close() if hasattr(result, "close") else None
                except Exception:  # noqa: BLE001
                    logger.exception("emit_nowait sync handler failed for %s", event_name)
            return
        loop.create_task(self.emit(event_name, payload))

    # Test helpers
    def clear(self) -> None:
        self._handlers.clear()
        self._handler_ids.clear()

    def handler_count(self, event_name: str) -> int:
        return len(self._handlers.get(event_name, []))


# Module-level singleton — import this everywhere.
event_bus = EventBus()

__all__ = ["event_bus", "EventBus", "Events", "EventHandler"]
