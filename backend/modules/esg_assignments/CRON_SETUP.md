# ESG Assignments - Cron Job Setup Guide

## Overview

The ESG Assignments module includes automated reminder functionality that can be run as scheduled cron jobs.

## Available Jobs

### 1. Reminder Job (Hourly)
Processes due reminders based on each assignment's `reminder_frequency` setting.
- Sends in-app notifications
- Sends email notifications to assigned users

### 2. Overdue Notifications Job (Daily)
Sends summary emails to users with overdue assignments.
- Groups overdue assignments by user
- Sends one summary email per user
- Highlights overdue items with urgency

## Cron Job Setup

### Option 1: System Crontab

Edit crontab:
```bash
crontab -e
```

Add the following entries:
```bash
# ESG Assignment Reminders - Run every hour at minute 0
0 * * * * cd /app/backend && /usr/bin/python3 -m modules.esg_assignments.cron_job reminders >> /var/log/esg_reminders.log 2>&1

# ESG Overdue Notifications - Run daily at 9 AM
0 9 * * * cd /app/backend && /usr/bin/python3 -m modules.esg_assignments.cron_job overdue >> /var/log/esg_overdue.log 2>&1

# Run all jobs - Alternative single command (not recommended for production)
# 0 9 * * * cd /app/backend && /usr/bin/python3 -m modules.esg_assignments.cron_job all >> /var/log/esg_cron.log 2>&1
```

### Option 2: Systemd Timer (Recommended for Production)

Create service file `/etc/systemd/system/esg-reminders.service`:
```ini
[Unit]
Description=ESG Assignment Reminders
After=network.target

[Service]
Type=oneshot
WorkingDirectory=/app/backend
ExecStart=/usr/bin/python3 -m modules.esg_assignments.cron_job reminders
User=www-data
Environment="PYTHONPATH=/app/backend"

[Install]
WantedBy=multi-user.target
```

Create timer file `/etc/systemd/system/esg-reminders.timer`:
```ini
[Unit]
Description=Run ESG Reminders hourly

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable esg-reminders.timer
sudo systemctl start esg-reminders.timer
```

### Option 3: Cloud Scheduler (GCP/AWS/Azure)

#### Google Cloud Scheduler
```bash
gcloud scheduler jobs create http esg-reminders \
    --schedule="0 * * * *" \
    --uri="https://your-app.com/api/esg-assignments/reminders/process" \
    --http-method=POST \
    --headers="Authorization=Bearer YOUR_ADMIN_TOKEN"
```

#### AWS EventBridge + Lambda
Create a Lambda function that calls the API endpoint or runs the Python module directly.

## Manual Trigger via API

Admins can manually trigger jobs via API:

```bash
# Process due reminders
curl -X POST "https://your-app.com/api/esg-assignments/reminders/process" \
    -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Send overdue notifications
curl -X POST "https://your-app.com/api/esg-assignments/reminders/send-overdue-notifications" \
    -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## Environment Variables

Ensure the following environment variables are set:
- `RESEND_API_KEY` - For email notifications (via Resend)
- `MONGO_URL` - Database connection
- `APP_URL` - Base URL for email links (defaults to https://app.sustainrepo.com)

## Logging

Logs are written to stdout by default. Redirect to files as shown in crontab examples.

Check logs:
```bash
tail -f /var/log/esg_reminders.log
```

## Testing

Run jobs manually to test:
```bash
cd /app/backend
python3 -m modules.esg_assignments.cron_job reminders
python3 -m modules.esg_assignments.cron_job overdue
```

## Troubleshooting

### Emails not sending
1. Check `RESEND_API_KEY` is set in `.env`
2. Verify user has email address in database
3. Check backend logs for email errors

### Reminders not processing
1. Verify assignments have `reminder_enabled: true`
2. Check `next_reminder_at` is set and in the past
3. Verify assignment status is not `approved` or `submitted`
