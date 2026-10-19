import html
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from modules.auth.dependencies import get_current_user
from app.config.env import FRONTEND_URL, SUSTAINREPO_RESOURCES_URL
from shared.database.mongo import db
from shared.helpers.email import send_email

router = APIRouter(prefix="/contact-sales", tags=["Contact Sales"])


class ContactSalesRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=5, max_length=40)


def _confirmation_email(name: str) -> str:
    safe_name = html.escape(name)
    logo_url = html.escape(f"{FRONTEND_URL.rstrip('/')}/sustainrepo-logo.png", quote=True)
    resources_url = html.escape(SUSTAINREPO_RESOURCES_URL, quote=True)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f7f6;font-family:Arial,sans-serif;color:#24312b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f5f7f6;padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dbe5de;border-radius:12px;overflow:hidden;">
      <tr><td style="padding:28px 40px 24px;background-color:#103d2b;"><img src="{logo_url}" width="164" alt="SustainRepo" style="display:block;width:164px;max-width:100%;height:auto;border:0;"></td></tr>
      <tr><td style="padding:40px 40px 16px;"><p style="margin:0 0 14px;font-size:16px;line-height:24px;color:#52635a;">Hi {safe_name},</p><h1 style="margin:0;font-size:28px;line-height:36px;font-weight:700;color:#123d2c;">We’ve received your request.</h1></td></tr>
      <tr><td style="padding:0 40px 24px;"><p style="margin:0;font-size:16px;line-height:26px;color:#405048;">Thank you for reaching out to SustainRepo. One of our sustainability experts will review your details and get back to you within <strong>24 business hours</strong>.</p></td></tr>
      <tr><td style="padding:0 40px 32px;"><a href="{resources_url}" style="display:inline-block;background-color:#16805a;color:#ffffff;text-decoration:none;border-radius:6px;padding:13px 20px;font-size:14px;font-weight:700;">Explore SustainRepo resources</a></td></tr>
      <tr><td style="padding:24px 40px;background-color:#eef5f0;border-top:1px solid #dbe5de;"><p style="margin:0;font-size:14px;line-height:22px;color:#52635a;">Best regards,<br><strong style="color:#123d2c;">The SustainRepo Team</strong></p></td></tr>
    </table>
  </td></tr></table>
</body></html>"""


def _internal_email(name: str, email: str, phone: str, company: str) -> str:
    return f"""<h2>New SustainRepo sales request</h2><table style=\"border-collapse:collapse\"><tr><td style=\"padding:6px;font-weight:bold\">Name</td><td style=\"padding:6px\">{html.escape(name)}</td></tr><tr><td style=\"padding:6px;font-weight:bold\">Email</td><td style=\"padding:6px\">{html.escape(email)}</td></tr><tr><td style=\"padding:6px;font-weight:bold\">Phone</td><td style=\"padding:6px\">{html.escape(phone)}</td></tr><tr><td style=\"padding:6px;font-weight:bold\">Company</td><td style=\"padding:6px\">{html.escape(company)}</td></tr></table>"""


@router.post("")
async def submit_contact_sales(data: ContactSalesRequest, current_user: dict = Depends(get_current_user)):
    organization = await db.organizations.find_one(
        {"id": current_user.get("organization_id")}, {"_id": 0, "name": 1, "organization_name": 1}
    ) or {}
    company = organization.get("organization_name") or organization.get("name") or "Not available"
    name, phone = data.name.strip(), data.phone.strip()
    confirmation_sent = await send_email(data.email, "We received your SustainRepo request", _confirmation_email(name))
    internal_sent = await send_email("info@sustainrepo.com", "New SustainRepo sales request", _internal_email(name, str(data.email), phone, company))
    if not confirmation_sent or not internal_sent:
        raise HTTPException(status_code=502, detail="We could not send your request confirmation. Please try again.")
    return {"message": "Your request has been submitted.", "company": company}