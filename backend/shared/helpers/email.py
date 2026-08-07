"""
Email helper — Resend SDK wrapper.

Resend's Python SDK is sync-only. We run it in a thread pool so the
FastAPI event loop is not blocked. `send_email` is a no-op (logged
warning, returns False) when `RESEND_API_KEY` is unset, which keeps
local dev environments happy.
"""
import asyncio
import base64
import logging

import resend

from app.config.env import RESEND_API_KEY, SENDER_EMAIL

# Configure the Resend SDK once at import time.
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


async def send_email(to_email: str, subject: str, body: str) -> bool:
    """Send an HTML email via Resend. Returns True on success, False otherwise."""
    if not RESEND_API_KEY:
        logging.warning("Resend API key not configured, skipping email")
        return False


async def send_email_with_attachments(to_email: str, subject: str, body: str, attachments: list[tuple[str, bytes]]) -> bool:
    """Send an HTML email with Resend base64 attachments."""
    if not RESEND_API_KEY:
        logging.warning("Resend API key not configured, skipping email")
        return False
    try:
        params = {
            "from": SENDER_EMAIL,
            "to": [to_email],
            "subject": subject,
            "html": body,
            "attachments": [{"filename": name, "content": base64.b64encode(content).decode("utf-8")} for name, content in attachments],
        }
        email = await asyncio.to_thread(resend.Emails.send, params)
        logging.info(f"Email with attachments sent to {to_email}, ID: {email.get('id')}")
        return True
    except Exception as error:
        logging.error(f"Failed to send report email to {to_email}: {error}")
        return False
    try:
        params = {
            "from": SENDER_EMAIL,
            "to": [to_email],
            "subject": subject,
            "html": body,
        }
        # Run sync SDK in thread to keep FastAPI non-blocking.
        email = await asyncio.to_thread(resend.Emails.send, params)
        logging.info(f"Email sent to {to_email}, ID: {email.get('id')}")
        return True
    except Exception as e:
        logging.error(f"Failed to send email: {str(e)}")
        return False
