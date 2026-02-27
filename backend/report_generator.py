"""
GHG Inventory Report Generator
Generates DOCX reports based on template and database data
"""
import os
import io
import requests
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from docx import Document
from docx.shared import Inches, Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from collections import defaultdict
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
import numpy as np


class GHGReportGenerator:
    """Generates GHG Inventory Reports from template"""
    
    def __init__(self, template_path: str = None, backend_base_url: str = None):
        """Initialize with template path"""
        self.template_path = template_path or os.path.join(
            os.path.dirname(__file__), 'templates', 'GHG_inventory_report.docx'
        )
        # Use environment variable or default to localhost
        self.backend_base_url = backend_base_url or os.environ.get('BACKEND_URL', 'http://localhost:8001')
    
    def _format_month(self, period_str: str) -> str:
        """Format month string from YYYY-MM to Mon-YYYY format"""
        try:
            if not period_str:
                return 'NA'
            if ' to ' in period_str:
                parts = period_str.split(' to ')
                return f"{self._format_month(parts[0])} to {self._format_month(parts[1])}"
            dt = datetime.strptime(period_str.strip(), "%Y-%m")
            return dt.strftime("%b-%Y")
        except (ValueError, TypeError):
            return period_str or 'NA'
    
    def _format_number(self, value, decimals=2) -> str:
        """Format number to specified decimal places"""
        try:
            if value is None:
                return '0.00' if decimals == 2 else 'NA'
            num = float(value)
            return f"{num:.{decimals}f}"
        except (ValueError, TypeError):
            return 'NA'
    
    def _get_value_or_na(self, obj: Dict, key: str, default='NA') -> str:
        """Get value from dict or return NA if empty/None"""
        val = obj.get(key)
        if val is None or val == '' or val == 'Not Available':
            return default
        return str(val)
    
    def _download_image(self, url: str, db_client=None) -> Optional[io.BytesIO]:
        """Download an image from URL and return as BytesIO
        
        Handles:
        - External URLs (https://example.com/image.png)
        - Internal file API URLs (/api/files/{id}/view or full URL with /api/files/)
        - Google share links
        - Direct filesystem access for local files
        """
        if not url:
            return None
        
        try:
            import re
            
            # Handle internal API file URLs - try direct filesystem access first
            if '/api/files/' in url:
                # Extract file_id from URL patterns like:
                # - /api/files/{id}/view
                # - https://domain.com/api/files/{id}/view
                match = re.search(r'/api/files/([a-f0-9\-]+)', url)
                if match:
                    file_id = match.group(1)
                    
                    # Try direct filesystem access first (avoids blocking HTTP request)
                    file_path = self._get_file_path_from_db(file_id)
                    if file_path and os.path.exists(file_path):
                        try:
                            with open(file_path, 'rb') as f:
                                content = f.read()
                                # Check if it's an image
                                if self._is_image_content(content):
                                    print(f"DEBUG: Loaded file from filesystem: {file_path}")
                                    return io.BytesIO(content)
                        except Exception as e:
                            print(f"Error reading file from filesystem: {e}")
            
            # For external URLs, use HTTP request
            response = requests.get(url, timeout=15, allow_redirects=True)
            
            if response.status_code == 200:
                content_type = response.headers.get('content-type', '')
                # Check if it's actually an image
                if 'image' in content_type.lower():
                    return io.BytesIO(response.content)
                # Also check by extension or content sniffing
                elif any(ext in url.lower() for ext in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']):
                    return io.BytesIO(response.content)
                # Check first bytes for common image magic numbers
                elif self._is_image_content(response.content):
                    return io.BytesIO(response.content)
                        
        except Exception as e:
            print(f"Error downloading image from {url}: {e}")
        
        return None
    
    def _is_image_content(self, content: bytes) -> bool:
        """Check if content is an image based on magic bytes"""
        if len(content) < 8:
            return False
        header = content[:8]
        # PNG, JPEG, GIF, BMP, WEBP magic bytes
        return (header[:4] == b'\x89PNG' or 
                header[:2] == b'\xff\xd8' or 
                header[:6] == b'GIF87a' or 
                header[:6] == b'GIF89a' or
                header[:2] == b'BM' or
                header[:4] == b'RIFF')  # WEBP
    
    def _get_file_path_from_db(self, file_id: str) -> Optional[str]:
        """Get file path from database record (synchronous)"""
        try:
            from pymongo import MongoClient
            mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
            db_name = os.environ.get('DB_NAME', 'ghg_platform')
            
            client = MongoClient(mongo_url)
            db = client[db_name]
            
            file_record = db.uploaded_files.find_one({"id": file_id}, {"_id": 0})
            client.close()
            
            if file_record:
                return file_record.get('file_path')
            return None
        except Exception as e:
            print(f"Error getting file path from DB: {e}")
            return None
    
    def _is_image_attachment(self, attachment: Dict) -> bool:
        """Check if attachment is an image (not PDF or link)"""
        if not attachment:
            return False
        url = attachment.get('url', '') or attachment.get('file_url', '') or ''
        name = attachment.get('name', '') or attachment.get('filename', '') or ''
        
        image_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']
        for ext in image_extensions:
            if url.lower().endswith(ext) or name.lower().endswith(ext):
                return True
        # Also check content type if available
        content_type = attachment.get('type', '') or attachment.get('content_type', '')
        if 'image' in content_type.lower():
            return True
        return False

    def generate_report(
        self,
        organization: Dict[str, Any],
        facilities: List[Dict[str, Any]],
        emissions: List[Dict[str, Any]],
        reporting_period_start: str,
        reporting_period_end: str,
        description_of_change: str = "",
        previous_years_data: Optional[List[Dict[str, Any]]] = None
    ) -> io.BytesIO:
        """Generate GHG Inventory Report"""
        # Create a new document
        doc = Document()
        
        # Format reporting period for display
        reporting_period = self._format_reporting_period(reporting_period_start, reporting_period_end)
        date_issued = datetime.now(timezone.utc).strftime("%B %d, %Y")
        company_name = organization.get('name', 'Not Available')
        
        # === COVER PAGE ===
        self._add_cover_page(doc, company_name, reporting_period, date_issued, description_of_change, organization)
        
        # === REPORT CONTROL & ABBREVIATIONS (same page, NO TOC) ===
        doc.add_page_break()
        self._add_report_control_and_abbreviations(doc, company_name, date_issued, description_of_change)
        
        # === 1. ORGANIZATION DETAILS ===
        doc.add_page_break()
        doc.add_heading("1. Organization's Detail", level=1)
        self._add_organization_details(doc, organization, len(facilities))
        
        # === 2. FACILITIES ===
        doc.add_page_break()
        doc.add_heading('2. Facilities', level=1)
        for idx, facility in enumerate(facilities, 1):
            self._add_facility_section(doc, facility, idx)
        
        # === 3. QUANTIFIED GHG INVENTORY ===
        doc.add_page_break()
        doc.add_heading('3. Quantified GHG Inventory of Emissions and Removals', level=1)
        
        # 3.1 Methodology
        doc.add_heading('3.1 Methodology', level=2)
        self._add_methodology(doc)
        
        # 3.2+ Facility GHG Inventories
        for idx, facility in enumerate(facilities, 1):
            facility_emissions = [e for e in emissions if e.get('facility_id') == facility.get('id')]
            facility_prev_data = None
            if previous_years_data:
                facility_prev_data = [e for e in previous_years_data if e.get('facility_id') == facility.get('id')]
            
            self._add_facility_ghg_inventory(
                doc, facility, facility_emissions, 
                reporting_period, idx + 1,
                facility_prev_data
            )
        
        # === ORGANIZATION EMISSIONS ===
        section_num = len(facilities) + 2
        doc.add_page_break()
        doc.add_heading(f'3.{section_num} Organization Emissions', level=2)
        self._add_organization_emissions(doc, facilities, emissions)
        
        # === ORGANIZATION ANALYSIS ===
        doc.add_heading(f'3.{section_num + 1} Organization Analysis', level=2)
        self._add_organization_analysis(doc, facilities, emissions)
        
        # Save to BytesIO
        output = io.BytesIO()
        doc.save(output)
        output.seek(0)
        return output
    
    def _format_reporting_period(self, start: str, end: str) -> str:
        """Format reporting period for display"""
        try:
            start_date = datetime.strptime(start, "%Y-%m")
            end_date = datetime.strptime(end, "%Y-%m")
            return f"{start_date.strftime('%B %Y')} - {end_date.strftime('%B %Y')}"
        except (ValueError, TypeError):
            return f"{start} - {end}"
    
    def _add_cover_page(self, doc, company_name, reporting_period, date_issued, description, organization):
        """Add cover page with logo below company name"""
        # Report Control Table
        table = doc.add_table(rows=2, cols=2)
        table.style = 'Table Grid'
        table.cell(0, 0).text = 'Revision date'
        table.cell(0, 1).text = 'Description of change'
        table.cell(1, 0).text = date_issued
        table.cell(1, 1).text = description or 'Initial Report'
        
        # Add spacing
        for _ in range(4):
            doc.add_paragraph()
        
        # Company Name (centered, large)
        title = doc.add_paragraph()
        title.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = title.add_run(company_name)
        run.bold = True
        run.font.size = Pt(28)
        
        # Add logo below company name
        logo_url = organization.get('logo')
        if logo_url:
            try:
                logo_buffer = self._download_image(logo_url)
                if logo_buffer:
                    logo_data = logo_buffer.read()
                    logo_buffer.seek(0)  # Reset for add_picture
                    doc.add_paragraph()
                    logo_para = doc.add_paragraph()
                    logo_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    run = logo_para.add_run()
                    run.add_picture(logo_buffer, width=Inches(2.5))
            except Exception as e:
                print(f"Error adding logo: {e}")
        
        # Add spacing
        for _ in range(2):
            doc.add_paragraph()
        
        # Report Title
        report_title = doc.add_paragraph()
        report_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = report_title.add_run('Greenhouse Gas (GHG) Inventory Report')
        run.bold = True
        run.font.size = Pt(24)
        
        # Reporting Period
        period_para = doc.add_paragraph()
        period_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = period_para.add_run(f'Reporting Period: {reporting_period}')
        run.font.size = Pt(16)
    
    def _add_report_control_and_abbreviations(self, doc, company_name, date_issued, description):
        """Add Report Control and Abbreviations on same page"""
        doc.add_heading('REPORT CONTROL', level=1)
        doc.add_paragraph(f'This GHG Inventory Report is maintained at {company_name} site.')
        
        doc.add_paragraph()
        doc.add_paragraph()
        
        doc.add_heading('ABBREVIATIONS', level=1)
        self._add_abbreviations(doc)
    
    def _add_abbreviations(self, doc):
        """Add abbreviations table"""
        abbreviations = [
            ('GHG', 'Greenhouse Gas'),
            ('ISO', 'International Organization for Standardization'),
            ('IPCC', 'Intergovernmental Panel on Climate Change'),
            ('tCO2e', 'Tons of Carbon dioxide equivalent'),
            ('CV', 'Calorific Value'),
            ('EF', 'Emission Factor'),
            ('CO2', 'Carbon dioxide'),
            ('CH4', 'Methane'),
            ('N2O', 'Nitrous Oxide'),
            ('kWh', 'Kilo Watt Hour'),
            ('MWh', 'Mega Watt Hour'),
        ]
        
        table = doc.add_table(rows=len(abbreviations), cols=2)
        table.style = 'Table Grid'
        for i, (abbr, meaning) in enumerate(abbreviations):
            table.cell(i, 0).text = abbr
            table.cell(i, 1).text = meaning
    
    def _add_organization_details(self, doc, org, facility_count):
        """Add organization details section with attachments"""
        # 1. Address Details
        doc.add_paragraph('1. Address Details:', style='Heading 3')
        doc.add_paragraph(f"   a) Street Address: {self._get_value_or_na(org, 'corporate_address')}")
        doc.add_paragraph(f"   b) City: {self._get_value_or_na(org, 'city')}")
        doc.add_paragraph(f"   c) State: {self._get_value_or_na(org, 'state')}")
        doc.add_paragraph(f"   d) Pin/Zip Code: {self._get_value_or_na(org, 'pincode')}")
        doc.add_paragraph(f"   e) Country: {self._get_value_or_na(org, 'country')}")
        
        doc.add_paragraph()
        doc.add_paragraph(f"2. General Description: {self._get_value_or_na(org, 'general_description')}")
        doc.add_paragraph(f"3. Mission of the organization: {self._get_value_or_na(org, 'mission')}")
        doc.add_paragraph(f"4. Vision of the organization: {self._get_value_or_na(org, 'vision')}")
        doc.add_paragraph(f"5. Process Description: {self._get_value_or_na(org, 'process_description')}")
        doc.add_paragraph(f"6. Organizational Boundaries: {self._get_value_or_na(org, 'org_boundaries')}")
        doc.add_paragraph(f"7. Reporting Frequency: {self._get_value_or_na(org, 'reporting_frequency')}")
        doc.add_paragraph(f"8. Number of Facilities: {facility_count}")
        doc.add_paragraph(f"9. Remarks/Notes: {self._get_value_or_na(org, 'remarks')}")
        
        # 10. Attachments - Download and embed images
        doc.add_paragraph()
        doc.add_paragraph('10. Attachments:', style='Heading 3')
        attachments = org.get('attachments') or []
        image_attachments = [a for a in attachments if self._is_image_attachment(a)]
        
        if image_attachments:
            for idx, attachment in enumerate(image_attachments, 1):
                url = attachment.get('url') or attachment.get('file_url', '')
                name = attachment.get('name') or attachment.get('filename', f'Image {idx}')
                doc.add_paragraph(f"   {idx}. {name}")
                if url:
                    try:
                        img_buffer = self._download_image(url)
                        if img_buffer:
                            img_para = doc.add_paragraph()
                            img_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                            run = img_para.add_run()
                            run.add_picture(img_buffer, width=Inches(4))
                            doc.add_paragraph()
                    except Exception as e:
                        doc.add_paragraph(f"      (Unable to load image: {e})")
        else:
            doc.add_paragraph("   NA")
    
    def _add_facility_section(self, doc, facility, index):
        """Add facility details section with attachments"""
        doc.add_heading(f"2.{index} {facility.get('name', 'Unnamed Facility')}", level=2)
        
        doc.add_paragraph(f"a) Sector/Industry: {self._get_value_or_na(facility, 'sector')}")
        
        doc.add_paragraph()
        doc.add_paragraph('b) Address Details:', style='Heading 3')
        doc.add_paragraph(f"   i) Street Address: {self._get_value_or_na(facility, 'address')}")
        doc.add_paragraph(f"   ii) City: {self._get_value_or_na(facility, 'city')}")
        doc.add_paragraph(f"   iii) State: {self._get_value_or_na(facility, 'state')}")
        doc.add_paragraph(f"   iv) Pin/Zip Code: {self._get_value_or_na(facility, 'pincode')}")
        doc.add_paragraph(f"   v) Country: {self._get_value_or_na(facility, 'country')}")
        
        doc.add_paragraph()
        doc.add_paragraph(f"c) Products Manufactured: {self._get_value_or_na(facility, 'products_manufactured')}")
        doc.add_paragraph(f"d) Quantity of Products: {self._get_value_or_na(facility, 'product_quantity')}")
        doc.add_paragraph(f"e) Machinery Used: {self._get_value_or_na(facility, 'machinery_used')}")
        doc.add_paragraph(f"f) Process Description: {self._get_value_or_na(facility, 'process_description')}")
        doc.add_paragraph(f"g) Person Responsible: {self._get_value_or_na(facility, 'responsible_person')}")
        doc.add_paragraph(f"h) Monitoring Frequency: {self._get_value_or_na(facility, 'monitoring_frequency')}")
        doc.add_paragraph(f"i) Reporting Frequency: {self._get_value_or_na(facility, 'reporting_frequency')}")
        doc.add_paragraph(f"j) Remarks/Notes: {self._get_value_or_na(facility, 'remarks')}")
        
        # k) Attachments - Download and embed images
        doc.add_paragraph()
        doc.add_paragraph('k) Attachments:', style='Heading 3')
        attachments = facility.get('attachments') or []
        image_attachments = [a for a in attachments if self._is_image_attachment(a)]
        
        if image_attachments:
            for idx, attachment in enumerate(image_attachments, 1):
                url = attachment.get('url') or attachment.get('file_url', '')
                name = attachment.get('name') or attachment.get('filename', f'Image {idx}')
                doc.add_paragraph(f"   {idx}. {name}")
                if url:
                    try:
                        img_buffer = self._download_image(url)
                        if img_buffer:
                            img_para = doc.add_paragraph()
                            img_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                            run = img_para.add_run()
                            run.add_picture(img_buffer, width=Inches(4))
                            doc.add_paragraph()
                    except Exception as e:
                        doc.add_paragraph(f"      (Unable to load image: {e})")
        else:
            doc.add_paragraph("   NA")
    
    def _add_methodology(self, doc):
        """Add methodology section"""
        doc.add_paragraph(
            "Methodology followed for calculation of GHG emissions from GHG activity level data:"
        )
        doc.add_paragraph(
            "Scope 1/Direct Emission Factor (quantity basis): "
            "Calorific Value x Density (if applicable) x Default Emission Factor (energy basis)"
        )
        doc.add_paragraph(
            "Scope 1, Scope 2 and Biogenic Emissions: "
            "Quantity x Emission Factor (quantity basis)"
        )
    
    def _add_facility_ghg_inventory(self, doc, facility, emissions, reporting_period, section_num, prev_data=None):
        """Add GHG inventory section for a facility"""
        facility_name = facility.get('name', 'Unnamed Facility')
        
        doc.add_page_break()
        doc.add_heading(f"3.{section_num} Facility - {facility_name}", level=2)
        
        # Categorize emissions
        scope1_emissions = [e for e in emissions if e.get('scope') == 'scope1']
        scope2_emissions = [e for e in emissions if e.get('scope') == 'scope2']
        biogenic_emissions = [e for e in emissions if e.get('scope') == 'biogenic']
        
        # 3.X.1 List of emissions - Format: PROCESS_NAME - FUEL_USED
        doc.add_heading(f"3.{section_num}.1 List of Emissions", level=3)
        
        # Direct/Scope 1 - PROCESS_NAME - FUEL_USED format
        scope1_list = []
        for e in scope1_emissions:
            process_names = e.get('process_names', [])
            fuel = e.get('fuel_type', 'Unknown')
            if process_names:
                for pn in process_names:
                    if pn:
                        scope1_list.append(f"{pn} - {fuel}")
            else:
                scope1_list.append(f"{e.get('category', 'Unknown')} - {fuel}")
        
        scope1_unique = list(set(scope1_list))
        doc.add_paragraph(f"Direct/Scope 1 Emissions: {', '.join(scope1_unique) if scope1_unique else 'None'}")
        
        # Indirect/Scope 2
        scope2_list = []
        for e in scope2_emissions:
            process_names = e.get('process_names', [])
            fuel = e.get('fuel_type', 'Electricity')
            if process_names:
                for pn in process_names:
                    if pn:
                        scope2_list.append(f"{pn} - {fuel}")
            else:
                scope2_list.append(f"Importing electricity from grid - {fuel}")
        
        scope2_unique = list(set(scope2_list)) if scope2_list else ['Importing electricity from grid - Electricity']
        doc.add_paragraph(f"Indirect/Scope 2 Emissions: {', '.join(scope2_unique) if scope2_emissions else 'None'}")
        
        # 3.X.2 Source of emissions
        doc.add_heading(f"3.{section_num}.2 Source of Emissions", level=3)
        scope1_fuels = list(set([e.get('fuel_type', 'Unknown') for e in scope1_emissions]))
        scope2_fuels = list(set([e.get('fuel_type', 'Electricity') for e in scope2_emissions]))
        
        doc.add_paragraph(f"Direct/Scope 1 Sources: {', '.join(scope1_fuels) if scope1_fuels else 'None'}")
        doc.add_paragraph(f"Indirect/Scope 2 Sources: {', '.join(scope2_fuels) if scope2_fuels else 'None'}")
        
        # 3.X.3 Summary - Categorized by Scope and Category
        doc.add_heading(f"3.{section_num}.3 Summary of GHG Emissions - {reporting_period}", level=3)
        self._add_emissions_summary_table(doc, emissions)
        
        # Calculate totals
        totals = self._calculate_emission_totals(emissions)
        self._add_totals_table(doc, totals)
        
        # Previous years data
        if prev_data and len(prev_data) > 0:
            doc.add_heading(f"3.{section_num}.4 Emissions of Previous Years", level=3)
            self._add_previous_years_table(doc, prev_data)
        
        # 3.X.5 Analysis with charts
        doc.add_heading(f"3.{section_num}.5 Analysis", level=3)
        self._add_facility_analysis(doc, facility_name, totals, emissions)
    
    def _add_emissions_summary_table(self, doc, emissions):
        """Add emissions summary table categorized by Scope and Category"""
        if not emissions:
            doc.add_paragraph("No emissions data available for this reporting period.")
            return
        
        # Group by scope and category
        scope_category_emissions = defaultdict(lambda: defaultdict(list))
        for e in emissions:
            scope = e.get('scope', 'unknown')
            category = e.get('category', 'Other')
            scope_category_emissions[scope][category].append(e)
        
        # Create table
        table = doc.add_table(rows=1, cols=8)
        table.style = 'Table Grid'
        
        headers = ['Scope', 'Category', 'Fuel', 'Month', 'Quantity', 'Unit', 'Emission Factor', 'tCO2e']
        header_cells = table.rows[0].cells
        for i, header in enumerate(headers):
            header_cells[i].text = header
            for para in header_cells[i].paragraphs:
                for run in para.runs:
                    run.bold = True
        
        # Data rows organized by scope and category
        scope_order = ['scope1', 'scope2', 'biogenic']
        scope_labels = {'scope1': 'Scope 1 (Direct)', 'scope2': 'Scope 2 (Indirect)', 'biogenic': 'Biogenic'}
        
        for scope in scope_order:
            if scope in scope_category_emissions:
                for category, cat_emissions in scope_category_emissions[scope].items():
                    for emission in sorted(cat_emissions, key=lambda x: x.get('reporting_period', '')):
                        row = table.add_row().cells
                        row[0].text = scope_labels.get(scope, scope)
                        row[1].text = str(category)
                        row[2].text = str(emission.get('fuel_type', 'NA'))
                        row[3].text = self._format_month(emission.get('reporting_period', ''))
                        row[4].text = self._format_number(emission.get('quantity', 0))
                        row[5].text = str(emission.get('quantity_unit', emission.get('unit', 'NA')))
                        
                        # Emission Factor - show final calculated value
                        ef_value = self._get_emission_factor_value(emission)
                        row[6].text = ef_value
                        
                        # CO2e
                        co2e = emission.get('calculated_co2e', emission.get('co2e_emissions', emission.get('total_emissions', 0))) or 0
                        row[7].text = self._format_number(co2e, 2)
    
    def _get_emission_factor_value(self, emission) -> str:
        """Get emission factor display value - final calculated value only"""
        scope = emission.get('scope', '')
        
        if scope == 'scope2':
            # For Scope 2, show emission_factor_basis_quantity or custom emission factor
            ef = emission.get('emission_factor_basis_quantity') or emission.get('emission_factor', 0)
            ef_unit = emission.get('emission_factor_basis_unit', 'tCO2/MWh')
            return f"{self._format_number(ef)} {ef_unit}"
        
        # For Scope 1 and Biogenic - show final calculated emission factor
        # Calculate: Calorific Value x EF x Density (if applicable)
        cv = emission.get('calorific_value', 0) or 0
        ef = emission.get('emission_factor', 0) or 0
        density = emission.get('density', 0) or 0
        
        if cv and ef:
            if density and float(density) > 0:
                final_ef = float(cv) * float(ef) * float(density)
            else:
                final_ef = float(cv) * float(ef)
            return f"{self._format_number(final_ef)} kg CO2/unit"
        elif ef:
            return f"{self._format_number(ef)} kg CO2/unit"
        return 'NA'
    
    def _add_totals_table(self, doc, totals):
        """Add totals in table format"""
        doc.add_paragraph()
        
        table = doc.add_table(rows=6, cols=2)
        table.style = 'Table Grid'
        
        data = [
            ('Total Emissions Direct (A)', f"{self._format_number(totals['scope1_total'], 2)} tCO2e"),
            ('Total Emissions Indirect (B)', f"{self._format_number(totals['scope2_total'], 2)} tCO2e"),
            ('Total Emissions (A + B)', f"{self._format_number(totals['scope1_total'] + totals['scope2_total'], 2)} tCO2e"),
            ('Total Removals/Sinks (C)', f"{self._format_number(totals.get('sinks_total', 0), 2)} tCO2e"),
            ('Total Biogenic', f"{self._format_number(totals.get('biogenic_total', 0), 2)} tCO2e"),
            ('Total GHG Emissions (A + B - C)', f"{self._format_number(totals['scope1_total'] + totals['scope2_total'] - totals.get('sinks_total', 0), 2)} tCO2e"),
        ]
        
        for i, (label, value) in enumerate(data):
            table.cell(i, 0).text = label
            table.cell(i, 1).text = value
            if i == len(data) - 1:
                for para in table.cell(i, 0).paragraphs:
                    for run in para.runs:
                        run.bold = True
                for para in table.cell(i, 1).paragraphs:
                    for run in para.runs:
                        run.bold = True
    
    def _calculate_emission_totals(self, emissions):
        """Calculate emission totals by scope, category, and fuel"""
        totals = {
            'scope1_total': 0,
            'scope2_total': 0,
            'biogenic_total': 0,
            'sinks_total': 0,
            'by_category': defaultdict(float),
            'by_fuel': defaultdict(float),
            'fuel_quantity': defaultdict(float)
        }
        
        for emission in emissions:
            co2e = emission.get('calculated_co2e', emission.get('co2e_emissions', emission.get('total_emissions', 0))) or 0
            scope = emission.get('scope', '')
            category = emission.get('category', 'Other')
            fuel = emission.get('fuel_type', 'Unknown')
            quantity = emission.get('quantity', 0) or 0
            
            if scope == 'scope1':
                totals['scope1_total'] += co2e
            elif scope == 'scope2':
                totals['scope2_total'] += co2e
            elif scope == 'biogenic':
                totals['biogenic_total'] += co2e
            
            totals['by_category'][category] += co2e
            totals['by_fuel'][fuel] += co2e
            totals['fuel_quantity'][fuel] += quantity
        
        return totals
    
    def _add_previous_years_table(self, doc, prev_data):
        """Add previous years emissions table"""
        by_fy = defaultdict(lambda: defaultdict(lambda: {'fuel': '-', 'total': 0}))
        
        for emission in prev_data:
            period = emission.get('reporting_period', '')
            try:
                year = period.split('-')[0] if '-' in period else period[:4]
                fy = f"FY {year}"
            except (ValueError, IndexError, TypeError):
                fy = "Unknown"
            
            category = emission.get('category', 'Other')
            fuel = emission.get('fuel_type', 'Unknown')
            co2e = emission.get('calculated_co2e', emission.get('co2e_emissions', emission.get('total_emissions', 0))) or 0
            
            by_fy[fy][category]['fuel'] = fuel
            by_fy[fy][category]['total'] += co2e
        
        if not by_fy:
            doc.add_paragraph("No previous year data available.")
            return
        
        fys = sorted(by_fy.keys())
        table = doc.add_table(rows=1, cols=len(fys) + 2)
        table.style = 'Table Grid'
        
        headers = ['Category', 'Fuel'] + fys
        header_cells = table.rows[0].cells
        for i, header in enumerate(headers):
            header_cells[i].text = header
            for para in header_cells[i].paragraphs:
                for run in para.runs:
                    run.bold = True
        
        categories = list(set([cat for fy_data in by_fy.values() for cat in fy_data.keys()]))
        for category in categories:
            row = table.add_row().cells
            row[0].text = category
            fuel_name = 'NA'
            for fy in fys:
                if by_fy[fy][category]['fuel'] != '-':
                    fuel_name = by_fy[fy][category]['fuel']
                    break
            row[1].text = fuel_name
            for i, fy in enumerate(fys):
                value = by_fy[fy][category]['total']
                row[i + 2].text = self._format_number(value, 2) if value > 0 else '0.00'
    
    def _add_facility_analysis(self, doc, facility_name, totals, emissions):
        """Add facility analysis section with comprehensive charts"""
        total = totals['scope1_total'] + totals['scope2_total']
        
        doc.add_paragraph(
            f"The facility '{facility_name}' has a total GHG emission of {self._format_number(total, 2)} tCO2e "
            f"for the reporting period."
        )
        
        if totals['scope1_total'] > 0 or totals['scope2_total'] > 0:
            scope1_pct = (totals['scope1_total'] / total) * 100 if total > 0 else 0
            scope2_pct = (totals['scope2_total'] / total) * 100 if total > 0 else 0
            doc.add_paragraph(
                f"Scope 1 (Direct) emissions contribute {scope1_pct:.1f}% while "
                f"Scope 2 (Indirect) emissions contribute {scope2_pct:.1f}% of total emissions."
            )
        
        # Chart 1: Scope 1 vs Scope 2
        if totals['scope1_total'] > 0 or totals['scope2_total'] > 0:
            doc.add_paragraph()
            chart_buffer = self._create_scope_comparison_chart(totals['scope1_total'], totals['scope2_total'])
            doc.add_picture(chart_buffer, width=Inches(5))
            doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
            doc.add_paragraph("Figure: Scope 1 vs Scope 2 Emissions Comparison", style='Caption')
        
        # Chart 2: Category-wise emission distribution
        if totals['by_category']:
            doc.add_paragraph()
            chart_buffer = self._create_category_pie_chart(dict(totals['by_category']))
            doc.add_picture(chart_buffer, width=Inches(5))
            doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
            doc.add_paragraph("Figure: Category-wise Emission Distribution", style='Caption')
        
        # Chart 3: Fuel-wise emission distribution
        if totals['by_fuel']:
            doc.add_paragraph()
            chart_buffer = self._create_fuel_emission_chart(dict(totals['by_fuel']))
            doc.add_picture(chart_buffer, width=Inches(5))
            doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
            doc.add_paragraph("Figure: Fuel-wise Emission Distribution", style='Caption')
        
        # Chart 4: Fuel quantity distribution
        if totals['fuel_quantity']:
            doc.add_paragraph()
            chart_buffer = self._create_fuel_quantity_chart(dict(totals['fuel_quantity']))
            doc.add_picture(chart_buffer, width=Inches(5))
            doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
            doc.add_paragraph("Figure: Fuel Quantity Distribution", style='Caption')
    
    def _create_scope_comparison_chart(self, scope1_total, scope2_total):
        """Create a bar chart comparing Scope 1 and Scope 2 emissions"""
        fig, ax = plt.subplots(figsize=(8, 5))
        
        categories = ['Scope 1\n(Direct)', 'Scope 2\n(Indirect)']
        values = [scope1_total, scope2_total]
        colors = ['#2563eb', '#16a34a']
        
        bars = ax.bar(categories, values, color=colors, width=0.6, edgecolor='white', linewidth=1)
        
        for bar, value in zip(bars, values):
            height = bar.get_height()
            ax.annotate(f'{value:.2f} tCO2e',
                       xy=(bar.get_x() + bar.get_width() / 2, height),
                       xytext=(0, 3),
                       textcoords="offset points",
                       ha='center', va='bottom', fontsize=10, fontweight='bold')
        
        ax.set_ylabel('Emissions (tCO2e)', fontsize=11)
        ax.set_title('Scope 1 vs Scope 2 Emissions', fontsize=13, fontweight='bold', pad=15)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.set_ylim(0, max(values) * 1.2 if max(values) > 0 else 1)
        
        plt.tight_layout()
        
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight', facecolor='white')
        buffer.seek(0)
        plt.close(fig)
        
        return buffer
    
    def _create_category_pie_chart(self, category_data):
        """Create a pie chart showing emissions by category"""
        fig, ax = plt.subplots(figsize=(8, 6))
        
        filtered_data = {k: v for k, v in category_data.items() if v > 0}
        
        if not filtered_data:
            filtered_data = {'No Emissions': 1}
        
        labels = list(filtered_data.keys())
        sizes = list(filtered_data.values())
        
        colors = plt.cm.Set3(np.linspace(0, 1, len(labels)))
        
        wedges, texts, autotexts = ax.pie(
            sizes, 
            labels=labels, 
            autopct=lambda pct: f'{pct:.1f}%' if pct > 5 else '',
            colors=colors,
            startangle=90,
            pctdistance=0.75,
            explode=[0.02] * len(labels)
        )
        
        for text in texts:
            text.set_fontsize(9)
        for autotext in autotexts:
            autotext.set_fontsize(8)
            autotext.set_fontweight('bold')
        
        ax.set_title('Emissions by Category', fontsize=13, fontweight='bold', pad=15)
        
        ax.legend(wedges, [f'{label}: {val:.2f} tCO2e' for label, val in zip(labels, sizes)],
                  title="Categories",
                  loc="center left",
                  bbox_to_anchor=(1, 0, 0.5, 1),
                  fontsize=8)
        
        plt.tight_layout()
        
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight', facecolor='white')
        buffer.seek(0)
        plt.close(fig)
        
        return buffer
    
    def _create_fuel_emission_chart(self, fuel_data):
        """Create a bar chart showing emissions by fuel type"""
        fig, ax = plt.subplots(figsize=(10, 6))
        
        filtered_data = {k: v for k, v in fuel_data.items() if v > 0}
        
        if not filtered_data:
            filtered_data = {'No Data': 0}
        
        fuels = list(filtered_data.keys())
        values = list(filtered_data.values())
        
        # Truncate long names
        fuels_display = [f[:20] + '...' if len(f) > 20 else f for f in fuels]
        
        colors = plt.cm.viridis(np.linspace(0.3, 0.9, len(fuels)))
        
        bars = ax.barh(fuels_display, values, color=colors, height=0.6)
        
        for bar, value in zip(bars, values):
            width = bar.get_width()
            ax.annotate(f'{value:.2f}',
                       xy=(width, bar.get_y() + bar.get_height() / 2),
                       xytext=(3, 0),
                       textcoords="offset points",
                       ha='left', va='center', fontsize=9)
        
        ax.set_xlabel('Emissions (tCO2e)', fontsize=11)
        ax.set_title('Fuel-wise Emissions', fontsize=13, fontweight='bold', pad=15)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        
        plt.tight_layout()
        
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight', facecolor='white')
        buffer.seek(0)
        plt.close(fig)
        
        return buffer
    
    def _create_fuel_quantity_chart(self, fuel_quantity_data):
        """Create a bar chart showing quantity of fuel used"""
        fig, ax = plt.subplots(figsize=(10, 6))
        
        filtered_data = {k: v for k, v in fuel_quantity_data.items() if v > 0}
        
        if not filtered_data:
            filtered_data = {'No Data': 0}
        
        fuels = list(filtered_data.keys())
        quantities = list(filtered_data.values())
        
        fuels_display = [f[:20] + '...' if len(f) > 20 else f for f in fuels]
        
        colors = plt.cm.plasma(np.linspace(0.2, 0.8, len(fuels)))
        
        bars = ax.barh(fuels_display, quantities, color=colors, height=0.6)
        
        for bar, qty in zip(bars, quantities):
            width = bar.get_width()
            ax.annotate(f'{qty:.2f}',
                       xy=(width, bar.get_y() + bar.get_height() / 2),
                       xytext=(3, 0),
                       textcoords="offset points",
                       ha='left', va='center', fontsize=9)
        
        ax.set_xlabel('Quantity', fontsize=11)
        ax.set_title('Fuel Quantity Used', fontsize=13, fontweight='bold', pad=15)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        
        plt.tight_layout()
        
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight', facecolor='white')
        buffer.seek(0)
        plt.close(fig)
        
        return buffer
    
    def _create_facility_comparison_chart(self, facility_emissions):
        """Create a bar chart comparing emissions across facilities"""
        fig, ax = plt.subplots(figsize=(10, 6))
        
        facilities = list(facility_emissions.keys())
        values = list(facility_emissions.values())
        
        facilities_display = [f[:20] + '...' if len(f) > 20 else f for f in facilities]
        
        colors = plt.cm.viridis(np.linspace(0.3, 0.9, len(facilities)))
        
        bars = ax.barh(facilities_display, values, color=colors, height=0.6)
        
        for bar, value in zip(bars, values):
            width = bar.get_width()
            ax.annotate(f'{value:.2f}',
                       xy=(width, bar.get_y() + bar.get_height() / 2),
                       xytext=(3, 0),
                       textcoords="offset points",
                       ha='left', va='center', fontsize=9)
        
        ax.set_xlabel('Emissions (tCO2e)', fontsize=11)
        ax.set_title('Facility-wise Emissions Comparison', fontsize=13, fontweight='bold', pad=15)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        
        plt.tight_layout()
        
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight', facecolor='white')
        buffer.seek(0)
        plt.close(fig)
        
        return buffer
    
    def _create_monthly_trend_chart(self, emissions):
        """Create a line chart showing monthly emission trends"""
        fig, ax = plt.subplots(figsize=(10, 5))
        
        monthly_data = defaultdict(float)
        for emission in emissions:
            period = emission.get('reporting_period', '')
            co2e = emission.get('calculated_co2e', emission.get('co2e_emissions', emission.get('total_emissions', 0))) or 0
            monthly_data[period] += co2e
        
        if not monthly_data:
            monthly_data['N/A'] = 0
        
        sorted_periods = sorted(monthly_data.keys())
        values = [monthly_data[p] for p in sorted_periods]
        
        labels = []
        for p in sorted_periods:
            try:
                dt = datetime.strptime(p, "%Y-%m")
                labels.append(dt.strftime("%b '%y"))
            except (ValueError, TypeError):
                labels.append(p[:7] if len(p) > 7 else p)
        
        ax.plot(labels, values, marker='o', linewidth=2, markersize=6, color='#2563eb')
        ax.fill_between(labels, values, alpha=0.2, color='#2563eb')
        
        ax.set_xlabel('Month', fontsize=11)
        ax.set_ylabel('Emissions (tCO2e)', fontsize=11)
        ax.set_title('Monthly Emission Trend', fontsize=13, fontweight='bold', pad=15)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        
        if len(labels) > 6:
            plt.xticks(rotation=45, ha='right')
        
        plt.tight_layout()
        
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight', facecolor='white')
        buffer.seek(0)
        plt.close(fig)
        
        return buffer
    
    def _add_organization_emissions(self, doc, facilities, emissions):
        """Add organization-level emissions summary in table format"""
        total_by_category = defaultdict(float)
        total_by_fuel = defaultdict(float)
        fuel_quantity = defaultdict(float)
        total_scope1 = 0
        total_scope2 = 0
        total_biogenic = 0
        
        for emission in emissions:
            co2e = emission.get('calculated_co2e', emission.get('co2e_emissions', emission.get('total_emissions', 0))) or 0
            scope = emission.get('scope', '')
            category = emission.get('category', 'Other')
            fuel = emission.get('fuel_type', 'Unknown')
            quantity = emission.get('quantity', 0) or 0
            
            total_by_category[category] += co2e
            total_by_fuel[fuel] += co2e
            fuel_quantity[fuel] += quantity
            
            if scope == 'scope1':
                total_scope1 += co2e
            elif scope == 'scope2':
                total_scope2 += co2e
            elif scope == 'biogenic':
                total_biogenic += co2e
        
        # Create summary table
        table = doc.add_table(rows=1, cols=3)
        table.style = 'Table Grid'
        
        headers = ['Category', 'Fuel', 'Total Emissions (tCO2e)']
        header_cells = table.rows[0].cells
        for i, header in enumerate(headers):
            header_cells[i].text = header
            for para in header_cells[i].paragraphs:
                for run in para.runs:
                    run.bold = True
        
        # Scope 1 header
        row = table.add_row().cells
        row[0].text = 'Direct/Scope 1 Emissions'
        for para in row[0].paragraphs:
            for run in para.runs:
                run.bold = True
        row[1].text = ''
        row[2].text = ''
        
        scope1_categories = list(set([e.get('category', 'Other') for e in emissions if e.get('scope') == 'scope1']))
        for category in scope1_categories:
            row = table.add_row().cells
            row[0].text = category
            fuels = list(set([e.get('fuel_type', 'Unknown') for e in emissions if e.get('category') == category and e.get('scope') == 'scope1']))
            row[1].text = ', '.join(fuels) if fuels else 'NA'
            row[2].text = self._format_number(total_by_category.get(category, 0), 2)
        
        row = table.add_row().cells
        row[0].text = 'Total Direct Emissions (A)'
        for para in row[0].paragraphs:
            for run in para.runs:
                run.bold = True
        row[1].text = ''
        row[2].text = self._format_number(total_scope1, 2)
        
        # Scope 2 header
        row = table.add_row().cells
        row[0].text = 'Indirect/Scope 2 Emissions'
        for para in row[0].paragraphs:
            for run in para.runs:
                run.bold = True
        row[1].text = ''
        row[2].text = ''
        
        row = table.add_row().cells
        row[0].text = 'Importing electricity from grid'
        row[1].text = 'Electricity'
        row[2].text = self._format_number(total_scope2, 2)
        
        row = table.add_row().cells
        row[0].text = 'Total Indirect Emissions (B)'
        for para in row[0].paragraphs:
            for run in para.runs:
                run.bold = True
        row[1].text = ''
        row[2].text = self._format_number(total_scope2, 2)
        
        # Grand Total
        row = table.add_row().cells
        row[0].text = 'Total Emissions (A + B)'
        for para in row[0].paragraphs:
            for run in para.runs:
                run.bold = True
        row[1].text = ''
        row[2].text = self._format_number(total_scope1 + total_scope2, 2)
    
    def _add_organization_analysis(self, doc, facilities, emissions):
        """Add organization-level analysis with comprehensive charts"""
        total_emissions = sum(
            e.get('calculated_co2e', e.get('co2e_emissions', e.get('total_emissions', 0))) or 0 
            for e in emissions
        )
        
        scope1_total = sum(
            e.get('calculated_co2e', e.get('co2e_emissions', e.get('total_emissions', 0))) or 0
            for e in emissions if e.get('scope') == 'scope1'
        )
        scope2_total = sum(
            e.get('calculated_co2e', e.get('co2e_emissions', e.get('total_emissions', 0))) or 0
            for e in emissions if e.get('scope') == 'scope2'
        )
        
        # Calculate totals for charts
        totals = self._calculate_emission_totals(emissions)
        
        doc.add_paragraph(
            f"The organization has a total GHG emission of {self._format_number(total_emissions, 2)} tCO2e "
            f"across {len(facilities)} selected facility(ies) for the reporting period."
        )
        
        # Facility comparison
        if len(facilities) > 1:
            doc.add_paragraph()
            doc.add_paragraph("Facility-wise Emission Comparison:")
            
            facility_emissions_dict = {}
            for facility in facilities:
                facility_total = sum(
                    e.get('calculated_co2e', e.get('co2e_emissions', e.get('total_emissions', 0))) or 0
                    for e in emissions if e.get('facility_id') == facility.get('id')
                )
                facility_emissions_dict[facility.get('name', 'Unknown')] = facility_total
                pct = (facility_total / total_emissions * 100) if total_emissions > 0 else 0
                doc.add_paragraph(f"  {facility.get('name')}: {self._format_number(facility_total, 2)} tCO2e ({pct:.1f}%)")
            
            if facility_emissions_dict:
                doc.add_paragraph()
                chart_buffer = self._create_facility_comparison_chart(facility_emissions_dict)
                doc.add_picture(chart_buffer, width=Inches(6))
                doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
                doc.add_paragraph("Figure: Facility-wise Emissions Comparison", style='Caption')
        
        # Chart 1: Scope 1 vs Scope 2
        if scope1_total > 0 or scope2_total > 0:
            doc.add_paragraph()
            chart_buffer = self._create_scope_comparison_chart(scope1_total, scope2_total)
            doc.add_picture(chart_buffer, width=Inches(5))
            doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
            doc.add_paragraph("Figure: Organization Scope 1 vs Scope 2 Distribution", style='Caption')
        
        # Chart 2: Category-wise distribution
        if totals['by_category']:
            doc.add_paragraph()
            chart_buffer = self._create_category_pie_chart(dict(totals['by_category']))
            doc.add_picture(chart_buffer, width=Inches(5))
            doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
            doc.add_paragraph("Figure: Organization Category-wise Emission Distribution", style='Caption')
        
        # Chart 3: Fuel-wise emission distribution
        if totals['by_fuel']:
            doc.add_paragraph()
            chart_buffer = self._create_fuel_emission_chart(dict(totals['by_fuel']))
            doc.add_picture(chart_buffer, width=Inches(5))
            doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
            doc.add_paragraph("Figure: Organization Fuel-wise Emission Distribution", style='Caption')
        
        # Chart 4: Fuel quantity distribution
        if totals['fuel_quantity']:
            doc.add_paragraph()
            chart_buffer = self._create_fuel_quantity_chart(dict(totals['fuel_quantity']))
            doc.add_picture(chart_buffer, width=Inches(5))
            doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
            doc.add_paragraph("Figure: Organization Fuel Quantity Distribution", style='Caption')
        
        # Chart 5: Monthly trend
        if emissions:
            doc.add_paragraph()
            chart_buffer = self._create_monthly_trend_chart(emissions)
            doc.add_picture(chart_buffer, width=Inches(6))
            doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
            doc.add_paragraph("Figure: Monthly Emission Trend", style='Caption')
