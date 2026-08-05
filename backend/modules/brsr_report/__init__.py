"""
BRSR Report Generator Module

Generates pixel-perfect BRSR (Business Responsibility & Sustainability Report) PDFs
following the exact SEBI Annexure II format using Playwright/Chromium.
"""

from .router import router
from .service import BRSRReportService
from .templates import BRSRHTMLTemplate

__all__ = ['router', 'BRSRReportService', 'BRSRHTMLTemplate']
