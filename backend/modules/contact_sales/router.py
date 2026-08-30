import html
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from modules.auth.dependencies import get_current_user
from shared.database.mongo import db
from shared.helpers.email import send_email

router = APIRouter(prefix="/contact-sales", tags=["Contact Sales"])


class ContactSalesRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=5, max_length=40)


def _confirmation_email(name: str) -> str:
    return f"""<p>Hi {html.escape(name)},</p><p>Thank you for reaching out to SustainRepo!</p><p>We have received your details, and one of our sustainability experts will get back to you within 24 business hours.</p><p>In the meantime, feel free to explore our Resources to see how AI-driven ESG automation can transform your reporting.</p><p>Best regards,<br>The SustainRepo Team</p>"""


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