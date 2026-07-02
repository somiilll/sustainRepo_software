#!/usr/bin/env python3
"""
ESG Assignments Cron Job Runner

This script is designed to be run by a cron scheduler (e.g., crontab, systemd timer, or cloud scheduler).

Usage:
    python -m modules.esg_assignments.cron_job [job_type]

Job types:
    reminders   - Process due reminders and send notifications (run hourly)
    overdue     - Send overdue assignment summary emails (run daily)
    all         - Run all jobs

Examples:
    # Process reminders
    python -m modules.esg_assignments.cron_job reminders
    
    # Send overdue notifications
    python -m modules.esg_assignments.cron_job overdue
    
    # Run all jobs
    python -m modules.esg_assignments.cron_job all

Crontab examples:
    # Run reminders every hour
    0 * * * * cd /app/backend && python -m modules.esg_assignments.cron_job reminders >> /var/log/esg_reminders.log 2>&1
    
    # Run overdue notifications daily at 9 AM
    0 9 * * * cd /app/backend && python -m modules.esg_assignments.cron_job overdue >> /var/log/esg_overdue.log 2>&1
"""

import sys
import asyncio
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger("esg_cron")


async def main():
    """Main entry point for cron jobs"""
    from .scheduler import run_reminder_job, run_overdue_job
    
    if len(sys.argv) < 2:
        job_type = "all"
    else:
        job_type = sys.argv[1].lower()
    
    logger.info(f"Starting ESG cron job: {job_type}")
    start_time = datetime.now()
    
    results = {}
    
    try:
        if job_type in ("reminders", "all"):
            logger.info("Running reminder job...")
            results["reminders"] = await run_reminder_job()
            logger.info(f"Reminder job result: {results['reminders']}")
        
        if job_type in ("overdue", "all"):
            logger.info("Running overdue notifications job...")
            results["overdue"] = await run_overdue_job()
            logger.info(f"Overdue job result: {results['overdue']}")
        
        if job_type not in ("reminders", "overdue", "all"):
            logger.error(f"Unknown job type: {job_type}")
            logger.info("Available job types: reminders, overdue, all")
            sys.exit(1)
        
        duration = (datetime.now() - start_time).total_seconds()
        logger.info(f"ESG cron job completed in {duration:.2f}s")
        
        return results
        
    except Exception as e:
        logger.exception(f"ESG cron job failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
