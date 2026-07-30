"""
Supplier Assessment Email Templates.
"""
from typing import Optional, List

SUSTAINREPO_LOGO_URL = (
    "https://customer-assets.emergentagent.com/job_d67b5362-a184-47b7-81eb-abb9d39b89dd/"
    "artifacts/qllw2r8k_Logo_v3.png"
)


def supplier_invitation_email(
    supplier_name: str,
    customer_name: str,
    email: str,
    temp_password: Optional[str],
    login_link: str,
    due_date: Optional[str],
) -> str:
    """HTML body for supplier invitation email."""
    credentials_section = ""
    if temp_password:
        credentials_section = f"""
        <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                        <span style="color: #6b7280; font-size: 13px; display: block; margin-bottom: 4px;">Email</span>
                        <strong style="color: #1f2937; font-size: 15px;">{email}</strong>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 10px 0;">
                        <span style="color: #6b7280; font-size: 13px; display: block; margin-bottom: 4px;">Temporary Password</span>
                        <div style="background-color: #ffffff; padding: 14px 20px; border-radius: 8px; border: 2px solid #2eb67d; display: inline-block;">
                            <code style="color: #000000; font-size: 20px; font-family: 'Courier New', Courier, monospace; letter-spacing: 3px; font-weight: bold;">{temp_password}</code>
                        </div>
                    </td>
                </tr>
            </table>
        </div>
        """
    
    due_date_section = ""
    if due_date:
        due_date_section = f"""
        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
            <p style="color: #92400e; font-size: 13px; margin: 0;">
                <strong>Due Date:</strong> Please complete your assessment by {due_date}
            </p>
        </div>
        """
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8f9fa; padding: 40px 20px;">
            <tr>
                <td align="center">
                    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                        <tr>
                            <td style="background-color: #ffffff; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; border-bottom: 1px solid #e5e7eb;">
                                <img src="{SUSTAINREPO_LOGO_URL}" alt="SustainRepo Logo" style="width: 60px; height: 60px; border-radius: 8px; margin-bottom: 10px;">
                                <h1 style="color: #1f2937; margin: 10px 0 0 0; font-size: 24px; font-weight: 600;">SustainRepo</h1>
                                <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 14px;">Supplier Assessment Portal</p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 40px 30px;">
                                <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 20px;">Supplier Assessment Invitation</h2>
                                <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                                    Hello <strong style="color: #2eb67d;">{supplier_name}</strong>,
                                </p>
                                <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 25px 0;">
                                    <strong style="color: #2eb67d;">{customer_name}</strong> has invited you to complete a supplier ESG assessment on SustainRepo. This assessment helps evaluate environmental, social, and governance practices.
                                </p>
                                
                                {due_date_section}
                                
                                <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                                    <strong>What you'll need to provide:</strong>
                                </p>
                                <ul style="color: #4b5563; font-size: 14px; line-height: 1.8; margin: 0 0 25px 0; padding-left: 20px;">
                                    <li>Revenue percentage from this customer</li>
                                    <li>ESG questionnaire responses</li>
                                    <li>Scope 1 and Scope 2 emissions data</li>
                                </ul>
                                
                                {credentials_section}
                                
                                <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto 25px auto;">
                                    <tr>
                                        <td style="background-color: #2eb67d; border-radius: 8px;">
                                            <a href="{login_link}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600;">Login to Complete Assessment</a>
                                        </td>
                                    </tr>
                                </table>
                                
                                {"<div style='background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px;'><p style='color: #92400e; font-size: 13px; margin: 0;'><strong>Important:</strong> Please change your password upon first login for security purposes.</p></div>" if temp_password else ""}
                            </td>
                        </tr>
                        <tr>
                            <td style="background-color: #f9fafb; padding: 20px 30px; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                                <p style="color: #6b7280; font-size: 12px; margin: 0; text-align: center;">
                                    &copy; 2026 SustainRepo. All rights reserved.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """


def supplier_reminder_email(
    supplier_name: str,
    customer_name: str,
    pending_modules: List[str],
    due_date: Optional[str],
    login_link: str,
    custom_message: Optional[str],
) -> str:
    """HTML body for supplier reminder email."""
    pending_list = ""
    if pending_modules:
        items = "".join([f"<li>{m}</li>" for m in pending_modules])
        pending_list = f"""
        <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 15px 0;">
            <strong>Pending items:</strong>
        </p>
        <ul style="color: #4b5563; font-size: 14px; line-height: 1.8; margin: 0 0 25px 0; padding-left: 20px;">
            {items}
        </ul>
        """
    
    due_date_section = ""
    if due_date:
        due_date_section = f"""
        <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
            <p style="color: #991b1b; font-size: 13px; margin: 0;">
                <strong>Due Date:</strong> {due_date}
            </p>
        </div>
        """
    
    custom_section = ""
    if custom_message:
        custom_section = f"""
        <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
            <p style="color: #166534; font-size: 14px; margin: 0;">
                <strong>Message from {customer_name}:</strong><br>
                {custom_message}
            </p>
        </div>
        """
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8f9fa; padding: 40px 20px;">
            <tr>
                <td align="center">
                    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                        <tr>
                            <td style="background-color: #ffffff; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; border-bottom: 1px solid #e5e7eb;">
                                <img src="{SUSTAINREPO_LOGO_URL}" alt="SustainRepo Logo" style="width: 60px; height: 60px; border-radius: 8px; margin-bottom: 10px;">
                                <h1 style="color: #1f2937; margin: 10px 0 0 0; font-size: 24px; font-weight: 600;">SustainRepo</h1>
                                <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 14px;">Supplier Assessment Reminder</p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 40px 30px;">
                                <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 20px;">Assessment Reminder</h2>
                                <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                                    Hello <strong style="color: #2eb67d;">{supplier_name}</strong>,
                                </p>
                                <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 25px 0;">
                                    This is a friendly reminder from <strong style="color: #2eb67d;">{customer_name}</strong> to complete your supplier assessment on SustainRepo.
                                </p>
                                
                                {due_date_section}
                                
                                {custom_section}
                                
                                {pending_list}
                                
                                <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto 25px auto;">
                                    <tr>
                                        <td style="background-color: #2eb67d; border-radius: 8px;">
                                            <a href="{login_link}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600;">Complete Assessment</a>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="background-color: #f9fafb; padding: 20px 30px; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                                <p style="color: #6b7280; font-size: 12px; margin: 0; text-align: center;">
                                    &copy; 2026 SustainRepo. All rights reserved.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
