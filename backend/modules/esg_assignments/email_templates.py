"""
Email templates for ESG Assignment notifications
"""

from typing import Optional
from datetime import datetime


def assignment_reminder_email(
    user_name: str,
    entity_type: str,
    entity_id: str,
    status: str,
    due_date: Optional[datetime],
    reporting_period: str,
    app_url: str = "https://app.sustainrepo.com"
) -> str:
    """Generate HTML email for assignment reminder"""
    
    due_str = ""
    urgency_class = ""
    urgency_text = ""
    
    if due_date:
        if isinstance(due_date, datetime):
            due_str = due_date.strftime("%B %d, %Y")
            days_until = (due_date - datetime.now()).days
            if days_until < 0:
                urgency_class = "overdue"
                urgency_text = f"<span style='color: #dc2626; font-weight: bold;'>OVERDUE by {abs(days_until)} days</span>"
            elif days_until <= 3:
                urgency_class = "urgent"
                urgency_text = f"<span style='color: #ea580c; font-weight: bold;'>Due in {days_until} days</span>"
            elif days_until <= 7:
                urgency_text = f"<span style='color: #ca8a04;'>Due in {days_until} days</span>"
    
    entity_display = entity_type.replace("_", " ").title()
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6;">
            <tr>
                <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                        <!-- Header -->
                        <tr>
                            <td style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 32px; border-radius: 12px 12px 0 0;">
                                <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                                    ESG Assignment Reminder
                                </h1>
                            </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                            <td style="padding: 32px;">
                                <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                                    Hi {user_name},
                                </p>
                                
                                <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                                    This is a reminder about your pending ESG assignment:
                                </p>
                                
                                <!-- Assignment Details Card -->
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; margin-bottom: 24px;">
                                    <tr>
                                        <td style="padding: 20px;">
                                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                                <tr>
                                                    <td style="padding: 8px 0;">
                                                        <span style="color: #6b7280; font-size: 14px;">Type:</span>
                                                        <span style="color: #111827; font-size: 14px; font-weight: 500; margin-left: 8px;">{entity_display}</span>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style="padding: 8px 0;">
                                                        <span style="color: #6b7280; font-size: 14px;">Item:</span>
                                                        <span style="color: #111827; font-size: 14px; font-weight: 500; margin-left: 8px;">{entity_id}</span>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style="padding: 8px 0;">
                                                        <span style="color: #6b7280; font-size: 14px;">Reporting Period:</span>
                                                        <span style="color: #111827; font-size: 14px; font-weight: 500; margin-left: 8px;">{reporting_period}</span>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style="padding: 8px 0;">
                                                        <span style="color: #6b7280; font-size: 14px;">Status:</span>
                                                        <span style="color: #059669; font-size: 14px; font-weight: 500; margin-left: 8px; text-transform: capitalize;">{status.replace('_', ' ')}</span>
                                                    </td>
                                                </tr>
                                                {f'''<tr>
                                                    <td style="padding: 8px 0;">
                                                        <span style="color: #6b7280; font-size: 14px;">Due Date:</span>
                                                        <span style="color: #111827; font-size: 14px; font-weight: 500; margin-left: 8px;">{due_str}</span>
                                                        {f"<br/>{urgency_text}" if urgency_text else ""}
                                                    </td>
                                                </tr>''' if due_str else ''}
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- CTA Button -->
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                    <tr>
                                        <td align="center" style="padding: 16px 0;">
                                            <a href="{app_url}" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 8px;">
                                                View Assignment
                                            </a>
                                        </td>
                                    </tr>
                                </table>
                                
                                <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                                    If you have any questions, please contact your administrator.
                                </p>
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="padding: 24px 32px; background-color: #f9fafb; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                                <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                                    This is an automated reminder from SustainRepo ESG Platform.
                                    <br/>
                                    You're receiving this because you have pending ESG assignments.
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


def assignment_overdue_email(
    user_name: str,
    overdue_count: int,
    assignments: list,
    app_url: str = "https://app.sustainrepo.com"
) -> str:
    """Generate HTML email for overdue assignments summary"""
    
    # Build assignments list HTML
    assignments_html = ""
    for a in assignments[:10]:  # Limit to 10 items
        entity_type = a.get('entity_type', '').replace('_', ' ').title()
        entity_id = a.get('entity_id', '')
        due_date = a.get('due_date')
        due_str = due_date.strftime("%b %d, %Y") if isinstance(due_date, datetime) else str(due_date)
        
        assignments_html += f"""
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
                <span style="color: #111827; font-size: 14px;">{entity_type}: {entity_id}</span>
                <br/>
                <span style="color: #dc2626; font-size: 12px;">Due: {due_str}</span>
            </td>
        </tr>
        """
    
    if overdue_count > 10:
        assignments_html += f"""
        <tr>
            <td style="padding: 12px; color: #6b7280; font-size: 14px;">
                ... and {overdue_count - 10} more overdue items
            </td>
        </tr>
        """
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6;">
            <tr>
                <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                        <!-- Header -->
                        <tr>
                            <td style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 32px; border-radius: 12px 12px 0 0;">
                                <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                                    ⚠️ Overdue ESG Assignments
                                </h1>
                            </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                            <td style="padding: 32px;">
                                <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                                    Hi {user_name},
                                </p>
                                
                                <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                                    You have <span style="color: #dc2626; font-weight: bold;">{overdue_count} overdue</span> ESG assignment(s) that require your attention:
                                </p>
                                
                                <!-- Overdue Items List -->
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #fef2f2; border-radius: 8px; border: 1px solid #fecaca; margin-bottom: 24px;">
                                    {assignments_html}
                                </table>
                                
                                <!-- CTA Button -->
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                    <tr>
                                        <td align="center" style="padding: 16px 0;">
                                            <a href="{app_url}" style="display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 8px;">
                                                Complete Assignments Now
                                            </a>
                                        </td>
                                    </tr>
                                </table>
                                
                                <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                                    Please complete these assignments as soon as possible to stay compliant.
                                </p>
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="padding: 24px 32px; background-color: #f9fafb; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                                <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                                    This is an automated reminder from SustainRepo ESG Platform.
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


def assignment_created_email(
    user_name: str,
    entity_type: str,
    entity_id: str,
    reporting_period: str,
    due_date: Optional[datetime],
    assigned_by: str,
    app_url: str = "https://app.sustainrepo.com"
) -> str:
    """Generate HTML email for new assignment notification"""
    
    due_str = due_date.strftime("%B %d, %Y") if isinstance(due_date, datetime) else ""
    entity_display = entity_type.replace("_", " ").title()
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6;">
            <tr>
                <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                        <!-- Header -->
                        <tr>
                            <td style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 32px; border-radius: 12px 12px 0 0;">
                                <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                                    New ESG Assignment
                                </h1>
                            </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                            <td style="padding: 32px;">
                                <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                                    Hi {user_name},
                                </p>
                                
                                <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                                    You have been assigned a new ESG task by <strong>{assigned_by}</strong>:
                                </p>
                                
                                <!-- Assignment Details Card -->
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; border-radius: 8px; border: 1px solid #bfdbfe; margin-bottom: 24px;">
                                    <tr>
                                        <td style="padding: 20px;">
                                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                                <tr>
                                                    <td style="padding: 8px 0;">
                                                        <span style="color: #6b7280; font-size: 14px;">Type:</span>
                                                        <span style="color: #111827; font-size: 14px; font-weight: 500; margin-left: 8px;">{entity_display}</span>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style="padding: 8px 0;">
                                                        <span style="color: #6b7280; font-size: 14px;">Item:</span>
                                                        <span style="color: #111827; font-size: 14px; font-weight: 500; margin-left: 8px;">{entity_id}</span>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style="padding: 8px 0;">
                                                        <span style="color: #6b7280; font-size: 14px;">Reporting Period:</span>
                                                        <span style="color: #111827; font-size: 14px; font-weight: 500; margin-left: 8px;">{reporting_period}</span>
                                                    </td>
                                                </tr>
                                                {f'''<tr>
                                                    <td style="padding: 8px 0;">
                                                        <span style="color: #6b7280; font-size: 14px;">Due Date:</span>
                                                        <span style="color: #111827; font-size: 14px; font-weight: 500; margin-left: 8px;">{due_str}</span>
                                                    </td>
                                                </tr>''' if due_str else ''}
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- CTA Button -->
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                    <tr>
                                        <td align="center" style="padding: 16px 0;">
                                            <a href="{app_url}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 8px;">
                                                View Assignment
                                            </a>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="padding: 24px 32px; background-color: #f9fafb; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                                <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                                    This is an automated notification from SustainRepo ESG Platform.
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
