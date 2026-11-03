"""Outbound notifications (supplier reminders, verifier invites).

The test version never sends real e-mail: LogNotifier records the message in the audit trail and returns a
mailto: link the user can open. Set NOTIFIER=smtp (plus SMTP_* env vars) once SustainRepo's mail service is wired.
"""
from dataclasses import dataclass
from urllib.parse import quote

from . import db
from .config import settings


@dataclass
class Message:
    to: str
    subject: str
    body: str


class LogNotifier:
    channel = "log"

    async def send(self, org_id: str, user: str, msg: Message, entity: str, entity_id: str) -> dict:
        await db.audit(org_id, user, entity, entity_id, "notify", None, {"to": msg.to, "subject": msg.subject, "body": msg.body})
        return {"sent": False, "channel": self.channel,
                "mailto": f"mailto:{msg.to}?subject={quote(msg.subject)}&body={quote(msg.body)}"}


class SmtpNotifier(LogNotifier):
    channel = "smtp"

    async def send(self, org_id, user, msg, entity, entity_id):  # pragma: no cover - needs a mail server
        raise NotImplementedError("SMTP delivery is wired when SustainRepo's mail service is available")


def get_notifier() -> LogNotifier:
    return SmtpNotifier() if settings.notifier == "smtp" else LogNotifier()
