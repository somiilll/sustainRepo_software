"""
BRSR Report Service

Generates BRSR PDFs using Playwright/Chromium for pixel-perfect rendering.
"""

import os
import asyncio
import tempfile
from typing import Dict, Any, List, Optional
from datetime import datetime

from playwright.async_api import async_playwright


class BRSRReportService:
    """
    Service class for generating BRSR reports using Playwright.
    
    Uses Chromium to render HTML templates to PDF, ensuring pixel-perfect
    replication of the Annexure II format.
    """
    
    @staticmethod
    async def generate_pdf(
        html_content: str,
        filename: Optional[str] = None
    ) -> bytes:
        """
        Generates a PDF from HTML content using Playwright/Chromium.
        
        Args:
            html_content: Complete HTML document string
            filename: Optional filename for the PDF
            
        Returns:
            PDF file as bytes
        """
        async with async_playwright() as p:
            # Launch Chromium
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                ]
            )
            
            try:
                # Create a new page
                page = await browser.new_page()
                
                # Set the HTML content
                await page.set_content(html_content, wait_until='networkidle')
                
                # Generate PDF with exact A4 format and Annexure II margins
                pdf_bytes = await page.pdf(
                    format='A4',
                    print_background=True,
                    margin={
                        'top': '15mm',
                        'bottom': '15mm',
                        'left': '20mm',
                        'right': '20mm'
                    },
                    display_header_footer=True,
                    header_template='''
                        <div style="font-family: Arial, sans-serif; font-size: 10px; width: 100%; text-align: right; padding-right: 20mm; color: #000;">
                            Annexure II
                        </div>
                    ''',
                    footer_template='''
                        <div style="font-family: Arial, sans-serif; font-size: 10px; width: 100%; text-align: center; color: #000;">
                            <span class="pageNumber"></span>
                        </div>
                    ''',
                )
                
                return pdf_bytes
                
            finally:
                await browser.close()
    
    @staticmethod
    def generate_pdf_sync(html_content: str) -> bytes:
        """
        Synchronous wrapper for generate_pdf.
        """
        return asyncio.run(BRSRReportService.generate_pdf(html_content))
