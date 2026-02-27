"""
GHG Inventory Report Generator
Generates DOCX reports based on template and database data
"""
import os
import io
import copy
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from docx import Document
from docx.shared import Inches, Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from collections import defaultdict
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
import numpy as np


class GHGReportGenerator:
    """Generates GHG Inventory Reports from template"""
    
    def __init__(self, template_path: str = None):
        """Initialize with template path"""
        self.template_path = template_path or os.path.join(
            os.path.dirname(__file__), 'templates', 'GHG_inventory_report.docx'
        )
        self.headings_for_toc = []  # Track headings for TOC generation
    
    def _format_month(self, period_str: str) -> str:
        """Format month string from YYYY-MM to Mon-YYYY format"""
        try:
            if not period_str:
                return 'NA'
            # Handle "2025-12 to 2025-12" format
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
        """
        Generate GHG Inventory Report
        
        Args:
            organization: Organization details dict
            facilities: List of selected facility dicts
            emissions: List of emission records within reporting period
            reporting_period_start: Start date (YYYY-MM)
            reporting_period_end: End date (YYYY-MM)
            description_of_change: Description for report control section
            previous_years_data: Optional emissions from previous years
            
        Returns:
            BytesIO containing the generated DOCX file
        """
        # Reset TOC headings
        self.headings_for_toc = []
        
        # Create a new document
        doc = Document()
        
        # Format reporting period for display
        reporting_period = self._format_reporting_period(reporting_period_start, reporting_period_end)
        date_issued = datetime.now(timezone.utc).strftime("%B %d, %Y")
        company_name = organization.get('name', 'Not Available')
        
        # === COVER PAGE ===
        self._add_cover_page(doc, company_name, reporting_period, date_issued, description_of_change, organization)
        
        # === TABLE OF CONTENTS ===
        doc.add_page_break()
        self._add_toc_placeholder(doc)
        
        # === REPORT CONTROL & ABBREVIATIONS (same page) ===
        doc.add_page_break()
        self._add_report_control_and_abbreviations(doc, company_name, date_issued, description_of_change)
        
        # === 1. ORGANIZATION DETAILS ===
        doc.add_page_break()
        self._add_heading(doc, "1. Organization's Detail", level=1)
        self._add_organization_details(doc, organization, len(facilities))
        
        # === 2. FACILITIES ===
        doc.add_page_break()
        self._add_heading(doc, '2. Facilities', level=1)
        for idx, facility in enumerate(facilities, 1):
            self._add_facility_section(doc, facility, idx)
        
        # === 3. QUANTIFIED GHG INVENTORY ===
        doc.add_page_break()
        self._add_heading(doc, '3. Quantified GHG Inventory of Emissions and Removals', level=1)
        
        # 3.1 Methodology
        self._add_heading(doc, '3.1 Methodology', level=2)
        self._add_methodology(doc)
        
        # 3.2+ Facility GHG Inventories
        for idx, facility in enumerate(facilities, 1):
            facility_emissions = [e for e in emissions if e.get('facility_id') == facility.get('id')]
            facility_prev_data = None
            if previous_years_data:
                facility_prev_data = [e for e in previous_years_data if e.get('facility_id') == facility.get('id')]
            
            self._add_facility_ghg_inventory(
                doc, facility, facility_emissions, 
                reporting_period, idx + 1,  # 3.2, 3.3, etc.
                facility_prev_data
            )
        
        # === ORGANIZATION EMISSIONS ===
        section_num = len(facilities) + 2  # After all facilities
        doc.add_page_break()
        self._add_heading(doc, f'3.{section_num} Organization Emissions', level=2)
        self._add_organization_emissions(doc, facilities, emissions)
        
        # === ORGANIZATION ANALYSIS ===
        self._add_heading(doc, f'3.{section_num + 1} Organization Analysis', level=2)
        self._add_organization_analysis(doc, facilities, emissions)
        
        # Save to BytesIO
        output = io.BytesIO()
        doc.save(output)
        output.seek(0)
        return output
    
    def _add_heading(self, doc, text: str, level: int):
        """Add heading and track for TOC"""
        doc.add_heading(text, level=level)
        self.headings_for_toc.append({'text': text, 'level': level})
    
    def _add_toc_placeholder(self, doc):
        """Add Table of Contents placeholder that Word will auto-generate"""
        doc.add_heading('Table of Contents', level=1)
        
        # Add instruction for Word
        para = doc.add_paragraph()
        para.add_run('[Please update Table of Contents in MS Word: ')
        para.add_run('References → Update Table').italic = True
        para.add_run(']')
        
        # Add TOC field code (Word will populate this)
        paragraph = doc.add_paragraph()
        run = paragraph.add_run()
        fldChar1 = OxmlElement('w:fldChar')
        fldChar1.set(qn('w:fldCharType'), 'begin')
        
        instrText = OxmlElement('w:instrText')
        instrText.set(qn('xml:space'), 'preserve')
        instrText.text = 'TOC \\o "1-3" \\h \\z \\u'
        
        fldChar2 = OxmlElement('w:fldChar')
        fldChar2.set(qn('w:fldCharType'), 'separate')
        
        fldChar3 = OxmlElement('w:fldChar')
        fldChar3.set(qn('w:fldCharType'), 'end')
        
        run._r.append(fldChar1)
        run._r.append(instrText)
        run._r.append(fldChar2)
        run._r.append(fldChar3)
    
    def _format_reporting_period(self, start: str, end: str) -> str:
        """Format reporting period for display"""
        try:
            start_date = datetime.strptime(start, "%Y-%m")
            end_date = datetime.strptime(end, "%Y-%m")
            return f"{start_date.strftime('%B %Y')} - {end_date.strftime('%B %Y')}"
        except (ValueError, TypeError):
            return f"{start} - {end}"
    
    def _add_cover_page(self, doc, company_name, reporting_period, date_issued, description, organization):
        """Add cover page with logo"""
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
        
        # Add logo below company name if available
        logo_url = organization.get('logo_url') or organization.get('logo')
        if logo_url:
            try:
                # Add spacing before logo
                doc.add_paragraph()
                logo_para = doc.add_paragraph()
                logo_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                # Note: Logo would need to be fetched and added here
                # For now, add placeholder text
                run = logo_para.add_run('[Company Logo]')
                run.italic = True
            except Exception:
                pass
        
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
        # REPORT CONTROL
        self._add_heading(doc, 'REPORT CONTROL', level=1)
        doc.add_paragraph(f'This GHG Inventory Report is maintained at {company_name} site.')
        
        # Add some spacing
        doc.add_paragraph()
        doc.add_paragraph()
        
        # ABBREVIATIONS (on same page)
        self._add_heading(doc, 'ABBREVIATIONS', level=1)
        self._add_abbreviations(doc)
    
    def _add_abbreviations(self, doc):
        """Add abbreviations table"""
        abbreviations = [
            ('GHG', 'Greenhouse Gas'),
            ('ISO', 'International Organization for Standardization'),
            ('IPCC', 'Intergovernmental Panel on Climate Change'),
            ('UNFCCC', 'United Nations Framework Convention on Climate Change'),
            ('QA-QC', 'Quality Assurance – Quality Control'),
            ('EF', 'Emission Factor'),
            ('CO₂', 'Carbon dioxide'),
            ('tCO₂', 'Tons of Carbon dioxide'),
            ('tCO₂e', 'Tons of Carbon dioxide equivalent'),
            ('CEA', 'Central Electricity Authority'),
            ('kWh', 'Kilo Watt Hour'),
            ('MWh', 'Mega Watt Hour'),
            ('NCV', 'Net Calorific Value'),
            ('CH₄', 'Methane'),
            ('N₂O', 'Nitrous Oxide'),
        ]
        
        table = doc.add_table(rows=len(abbreviations), cols=2)
        table.style = 'Table Grid'
        for i, (abbr, meaning) in enumerate(abbreviations):
            table.cell(i, 0).text = abbr
            table.cell(i, 1).text = meaning
    
    def _add_organization_details(self, doc, org, facility_count):
        """Add organization details section with proper numbering"""
        # 1. Address Details (with subpoints)
        doc.add_paragraph('1. Address Details:', style='Heading 3')
        doc.add_paragraph(f"   a) Street Address: {self._get_value_or_na(org, 'address')}")
        doc.add_paragraph(f"   b) City: {self._get_value_or_na(org, 'city')}")
        doc.add_paragraph(f"   c) State: {self._get_value_or_na(org, 'state')}")
        doc.add_paragraph(f"   d) Pin/Zip Code: {self._get_value_or_na(org, 'pincode')}")
        doc.add_paragraph(f"   e) Country: {self._get_value_or_na(org, 'country')}")
        
        # 2. General Description onwards
        doc.add_paragraph()
        doc.add_paragraph(f"2. General Description: {self._get_value_or_na(org, 'description')}")
        doc.add_paragraph(f"3. Mission of the organization: {self._get_value_or_na(org, 'mission')}")
        doc.add_paragraph(f"4. Vision of the organization: {self._get_value_or_na(org, 'vision')}")
        doc.add_paragraph(f"5. Process Description: {self._get_value_or_na(org, 'process_description')}")
        doc.add_paragraph(f"6. Organizational Boundaries: {self._get_value_or_na(org, 'organizational_boundaries')}")
        doc.add_paragraph(f"7. Reporting Frequency: {self._get_value_or_na(org, 'reporting_frequency')}")
        doc.add_paragraph(f"8. Number of Facilities: {facility_count}")
        doc.add_paragraph(f"9. Remarks/Notes: {self._get_value_or_na(org, 'remarks')}")
        
        # Attachments - images only
        attachments = org.get('attachments', [])
        image_attachments = [a for a in attachments if self._is_image_attachment(a)]
        if image_attachments:
            doc.add_paragraph(f"10. Attachments: {len(image_attachments)} image(s) attached")
            # Note: Would need to fetch and embed images here
    
    def _is_image_attachment(self, attachment: Dict) -> bool:
        """Check if attachment is an image (not PDF or link)"""
        if not attachment:
            return False
        url = attachment.get('url', '') or attachment.get('file_url', '')
        name = attachment.get('name', '') or attachment.get('filename', '')
        
        image_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']
        for ext in image_extensions:
            if url.lower().endswith(ext) or name.lower().endswith(ext):
                return True
        return False
    
    def _add_facility_section(self, doc, facility, index):
        """Add facility details section with proper numbering"""
        self._add_heading(doc, f"2.{index} {facility.get('name', 'Unnamed Facility')}", level=2)
        
        # a) Sector/Industry as first point
        doc.add_paragraph(f"a) Sector/Industry: {self._get_value_or_na(facility, 'sector')}")
        
        # Address Details section
        doc.add_paragraph()
        doc.add_paragraph('b) Address Details:', style='Heading 3')
        doc.add_paragraph(f"   i) Street Address: {self._get_value_or_na(facility, 'address')}")
        doc.add_paragraph(f"   ii) City: {self._get_value_or_na(facility, 'city')}")
        doc.add_paragraph(f"   iii) State: {self._get_value_or_na(facility, 'state')}")
        doc.add_paragraph(f"   iv) Pin/Zip Code: {self._get_value_or_na(facility, 'pincode')}")
        doc.add_paragraph(f"   v) Country: {self._get_value_or_na(facility, 'country')}")
        
        doc.add_paragraph()
        doc.add_paragraph(f"c) Products Manufactured: {self._get_value_or_na(facility, 'products_manufactured')}")
        doc.add_paragraph(f"d) Quantity of Products Manufactured in a Day: {self._get_value_or_na(facility, 'product_quantity')}")
        doc.add_paragraph(f"e) Machinery Used: {self._get_value_or_na(facility, 'machinery_used')}")
        doc.add_paragraph(f"f) Process Description: {self._get_value_or_na(facility, 'process_description')}")
        doc.add_paragraph(f"g) Person Responsible: {self._get_value_or_na(facility, 'responsible_person')}")
        doc.add_paragraph(f"h) Monitoring Frequency: {self._get_value_or_na(facility, 'monitoring_frequency')}")
        doc.add_paragraph(f"i) Reporting Frequency: {self._get_value_or_na(facility, 'reporting_frequency')}")
        doc.add_paragraph(f"j) Remarks/Notes: {self._get_value_or_na(facility, 'remarks')}")
        
        # Attachments - images only
        attachments = facility.get('attachments', [])
        image_attachments = [a for a in attachments if self._is_image_attachment(a)]
        if image_attachments:
            doc.add_paragraph(f"k) Attachments: {len(image_attachments)} image(s) attached")
    
    def _add_methodology(self, doc):
        """Add methodology section"""
        doc.add_paragraph(
            "Methodology followed for calculation of GHG emissions from GHG activity level data:"
        )
        doc.add_paragraph(
            "Scope 1/Direct Emission Factor (quantity basis): "
            "Net Calorific Value × Density (if applicable) × Default Emission Factor (energy basis)"
        )
        doc.add_paragraph(
            "Biogenic Emission Factor (quantity basis): "
            "Net Calorific Value × Default Emission Factor (energy basis)"
        )
        doc.add_paragraph(
            "Scope 1, Scope 2 and Biogenic Emissions: "
            "Quantity × Emission Factor (quantity basis) × unit conversion"
        )
    
    def _add_facility_ghg_inventory(self, doc, facility, emissions, reporting_period, section_num, prev_data=None):
        """Add GHG inventory section for a facility"""
        facility_name = facility.get('name', 'Unnamed Facility')
        
        doc.add_page_break()
        self._add_heading(doc, f"3.{section_num} Facility – {facility_name}", level=2)
        
        # Categorize emissions
        scope1_emissions = [e for e in emissions if e.get('scope') == 'scope1']
        scope2_emissions = [e for e in emissions if e.get('scope') == 'scope2']
        biogenic_emissions = [e for e in emissions if e.get('scope') == 'biogenic']
        
        # List of emissions (unique processes)
        self._add_heading(doc, f"3.{section_num}.1 List of Emissions", level=3)
        
        # Get unique process names (fuel_type-category combination for uniqueness)
        scope1_processes = list(set([
            f"{e.get('fuel_type', 'Unknown')}-{e.get('category', 'Unknown')}" 
            for e in scope1_emissions
        ]))
        scope2_processes = ['Importing electricity from grid']  # Hardcoded for Scope 2
        
        doc.add_paragraph(f"Direct/Scope 1 Emissions: {', '.join(scope1_processes) if scope1_processes else 'None'}")
        doc.add_paragraph(f"Indirect/Scope 2 Emissions: {', '.join(scope2_processes) if scope2_emissions else 'None'}")
        if biogenic_emissions:
            biogenic_processes = list(set([e.get('fuel_type', 'Unknown') for e in biogenic_emissions]))
            doc.add_paragraph(f"Biogenic Emissions: {', '.join(biogenic_processes)}")
        
        # Source of emissions (unique fuel names)
        self._add_heading(doc, f"3.{section_num}.2 Source of Emissions", level=3)
        scope1_fuels = list(set([e.get('fuel_type', 'Unknown') for e in scope1_emissions]))
        scope2_fuels = list(set([e.get('fuel_type', 'Electricity') for e in scope2_emissions]))
        
        doc.add_paragraph(f"Direct/Scope 1 Sources: {', '.join(scope1_fuels) if scope1_fuels else 'None'}")
        doc.add_paragraph(f"Indirect/Scope 2 Sources: {', '.join(scope2_fuels) if scope2_fuels else 'None'}")
        
        # Summary table
        self._add_heading(doc, f"3.{section_num}.3 Summary of GHG Emissions for Reporting Period – {reporting_period}", level=3)
        self._add_emissions_summary_table(doc, emissions)
        
        # Calculate totals
        totals = self._calculate_emission_totals(emissions)
        
        # Totals in table format
        self._add_totals_table(doc, totals)
        
        # Previous years data
        if prev_data and len(prev_data) > 0:
            self._add_heading(doc, f"3.{section_num}.4 Emissions of Previous Years", level=3)
            self._add_previous_years_table(doc, prev_data)
        
        # Analysis
        self._add_heading(doc, f"3.{section_num}.5 Analysis", level=3)
        self._add_facility_analysis(doc, facility_name, totals, scope1_emissions, scope2_emissions)
    
    def _add_emissions_summary_table(self, doc, emissions):
        """Add emissions summary table with all data in table format"""
        if not emissions:
            doc.add_paragraph("No emissions data available for this reporting period.")
            return
        
        # Sort emissions by month
        sorted_emissions = sorted(emissions, key=lambda x: x.get('reporting_period', ''))
        
        # Create table
        table = doc.add_table(rows=1, cols=9)
        table.style = 'Table Grid'
        
        # Headers
        headers = ['Fuel', 'Month', 'Quantity', 'Units', 'Emission Factor', 'Justification/Comments', 'Source', 'Process', 'GHG Emissions (tCO₂e)']
        header_cells = table.rows[0].cells
        for i, header in enumerate(headers):
            header_cells[i].text = header
            for para in header_cells[i].paragraphs:
                for run in para.runs:
                    run.bold = True
        
        # Data rows
        for emission in sorted_emissions:
            row = table.add_row().cells
            row[0].text = str(emission.get('fuel_type', 'NA'))
            row[1].text = self._format_month(emission.get('reporting_period', ''))
            row[2].text = self._format_number(emission.get('quantity', 0))
            row[3].text = str(emission.get('quantity_unit', emission.get('unit', 'NA')))
            
            # Emission Factor: NCV × EF × Density (if used)
            ef_display = self._get_emission_factor_display(emission)
            row[4].text = ef_display
            
            # Justification/Comments
            justification = emission.get('justification', '') or emission.get('notes', '') or 'NA'
            row[5].text = str(justification)
            
            # Source (e.g., IPCC)
            source = emission.get('source_of_information', '') or 'Database'
            row[6].text = str(source)
            
            # Process names
            process_names = emission.get('process_names', [])
            if process_names and len(process_names) > 0:
                row[7].text = ', '.join(process_names)
            else:
                row[7].text = 'NA'
            
            # Get CO2e emissions (2 decimal places)
            co2e = emission.get('calculated_co2e', emission.get('co2e_emissions', emission.get('total_emissions', 0))) or 0
            row[8].text = self._format_number(co2e, 2)
    
    def _get_emission_factor_display(self, emission) -> str:
        """Get emission factor display string: NCV × EF × Density (if used)"""
        scope = emission.get('scope', '')
        
        if scope == 'scope2':
            # For Scope 2, show the alternative emission factor
            ef = emission.get('emission_factor', emission.get('emission_factor_co2', 0))
            ef_unit = emission.get('emission_factor_basis_unit', 'tCO₂/MWh')
            return f"{self._format_number(ef)} {ef_unit}"
        
        # For Scope 1 and Biogenic
        ncv = emission.get('calorific_value', 0)
        ef = emission.get('emission_factor', emission.get('emission_factor_co2', 0))
        density = emission.get('density', 0)
        
        if ncv and ef:
            if density and float(density) > 0:
                return f"NCV({self._format_number(ncv)}) × EF({self._format_number(ef)}) × Density({self._format_number(density)})"
            else:
                return f"NCV({self._format_number(ncv)}) × EF({self._format_number(ef)})"
        elif ef:
            return self._format_number(ef)
        return 'NA'
    
    def _add_totals_table(self, doc, totals):
        """Add totals in table format"""
        doc.add_paragraph()
        
        table = doc.add_table(rows=6, cols=2)
        table.style = 'Table Grid'
        
        data = [
            ('Total Emissions Direct (A)', f"{self._format_number(totals['scope1_total'], 2)} tCO₂e"),
            ('Total Emissions Indirect (B)', f"{self._format_number(totals['scope2_total'], 2)} tCO₂e"),
            ('Total Emissions (A + B)', f"{self._format_number(totals['scope1_total'] + totals['scope2_total'], 2)} tCO₂e"),
            ('Total Removals/Sinks (C)', f"{self._format_number(totals.get('sinks_total', 0), 2)} tCO₂e"),
            ('Total Biogenic', f"{self._format_number(totals.get('biogenic_total', 0), 2)} tCO₂e"),
            ('Total GHG Emissions (A + B - C)', f"{self._format_number(totals['scope1_total'] + totals['scope2_total'] - totals.get('sinks_total', 0), 2)} tCO₂e"),
        ]
        
        for i, (label, value) in enumerate(data):
            table.cell(i, 0).text = label
            table.cell(i, 1).text = value
            # Bold the last row
            if i == len(data) - 1:
                for para in table.cell(i, 0).paragraphs:
                    for run in para.runs:
                        run.bold = True
                for para in table.cell(i, 1).paragraphs:
                    for run in para.runs:
                        run.bold = True
    
    def _calculate_emission_totals(self, emissions):
        """Calculate emission totals by scope and category"""
        totals = {
            'scope1_total': 0,
            'scope2_total': 0,
            'biogenic_total': 0,
            'sinks_total': 0,
            'by_category': defaultdict(float),
            'by_fuel': defaultdict(float)
        }
        
        for emission in emissions:
            co2e = emission.get('calculated_co2e', emission.get('co2e_emissions', emission.get('total_emissions', 0))) or 0
            scope = emission.get('scope', '')
            category = emission.get('category', 'Other')
            fuel = emission.get('fuel_type', 'Unknown')
            
            if scope == 'scope1':
                totals['scope1_total'] += co2e
            elif scope == 'scope2':
                totals['scope2_total'] += co2e
            elif scope == 'biogenic':
                totals['biogenic_total'] += co2e
            
            totals['by_category'][category] += co2e
            totals['by_fuel'][fuel] += co2e
        
        return totals
    
    def _add_previous_years_table(self, doc, prev_data):
        """Add previous years emissions table with actual fuel data"""
        # Group by financial year and fuel
        by_fy = defaultdict(lambda: defaultdict(lambda: {'fuel': '-', 'total': 0}))
        
        for emission in prev_data:
            period = emission.get('reporting_period', '')
            # Extract year from period
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
        
        # Create table
        fys = sorted(by_fy.keys())
        table = doc.add_table(rows=1, cols=len(fys) + 2)
        table.style = 'Table Grid'
        
        # Headers
        headers = ['Category', 'Fuel'] + fys
        header_cells = table.rows[0].cells
        for i, header in enumerate(headers):
            header_cells[i].text = header
            for para in header_cells[i].paragraphs:
                for run in para.runs:
                    run.bold = True
        
        # Add data rows
        categories = ['Stationary Combustion', 'Mobile Combustion', 'Fugitive Emissions', 'Process Emissions', 'Grid Electricity']
        for category in categories:
            row = table.add_row().cells
            row[0].text = category
            # Get fuel from first FY that has this category
            fuel_name = 'NA'
            for fy in fys:
                if by_fy[fy][category]['fuel'] != '-':
                    fuel_name = by_fy[fy][category]['fuel']
                    break
            row[1].text = fuel_name
            for i, fy in enumerate(fys):
                value = by_fy[fy][category]['total']
                row[i + 2].text = self._format_number(value, 2) if value > 0 else '0.00'
    
    def _add_facility_analysis(self, doc, facility_name, totals, scope1, scope2):
        """Add facility analysis section with charts"""
        total = totals['scope1_total'] + totals['scope2_total']
        
        doc.add_paragraph(
            f"The facility '{facility_name}' has a total GHG emission of {self._format_number(total, 2)} tCO₂e "
            f"for the reporting period."
        )
        
        if totals['scope1_total'] > 0 or totals['scope2_total'] > 0:
            scope1_pct = (totals['scope1_total'] / total) * 100 if total > 0 else 0
            scope2_pct = (totals['scope2_total'] / total) * 100 if total > 0 else 0
            doc.add_paragraph(
                f"Scope 1 (Direct) emissions contribute {scope1_pct:.1f}% while "
                f"Scope 2 (Indirect) emissions contribute {scope2_pct:.1f}% of total emissions."
            )
        
        # Generate Scope 1 vs Scope 2 bar chart
        if totals['scope1_total'] > 0 or totals['scope2_total'] > 0:
            doc.add_paragraph()
            chart_buffer = self._create_scope_comparison_chart(totals['scope1_total'], totals['scope2_total'])
            doc.add_picture(chart_buffer, width=Inches(5))
            last_para = doc.paragraphs[-1]
            last_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            doc.add_paragraph("Figure: Scope 1 vs Scope 2 Emissions Comparison", style='Caption')
        
        # Generate category pie chart
        if totals['by_category']:
            doc.add_paragraph()
            chart_buffer = self._create_category_pie_chart(dict(totals['by_category']))
            doc.add_picture(chart_buffer, width=Inches(5))
            last_para = doc.paragraphs[-1]
            last_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            doc.add_paragraph("Figure: Emissions Distribution by Category", style='Caption')
    
    def _create_scope_comparison_chart(self, scope1_total, scope2_total):
        """Create a bar chart comparing Scope 1 and Scope 2 emissions"""
        fig, ax = plt.subplots(figsize=(8, 5))
        
        categories = ['Scope 1\n(Direct)', 'Scope 2\n(Indirect)']
        values = [scope1_total, scope2_total]
        colors = ['#2563eb', '#16a34a']
        
        bars = ax.bar(categories, values, color=colors, width=0.6, edgecolor='white', linewidth=1)
        
        # Add value labels on bars
        for bar, value in zip(bars, values):
            height = bar.get_height()
            ax.annotate(f'{value:.2f} tCO₂e',
                       xy=(bar.get_x() + bar.get_width() / 2, height),
                       xytext=(0, 3),
                       textcoords="offset points",
                       ha='center', va='bottom', fontsize=10, fontweight='bold')
        
        ax.set_ylabel('Emissions (tCO₂e)', fontsize=11)
        ax.set_title('Scope 1 vs Scope 2 Emissions', fontsize=13, fontweight='bold', pad=15)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.set_ylim(0, max(values) * 1.2 if max(values) > 0 else 1)
        
        plt.tight_layout()
        
        # Save to buffer
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight', facecolor='white')
        buffer.seek(0)
        plt.close(fig)
        
        return buffer
    
    def _create_category_pie_chart(self, category_data):
        """Create a pie chart showing emissions by category"""
        fig, ax = plt.subplots(figsize=(8, 6))
        
        # Filter out zero values
        filtered_data = {k: v for k, v in category_data.items() if v > 0}
        
        if not filtered_data:
            filtered_data = {'No Emissions': 1}
        
        labels = list(filtered_data.keys())
        sizes = list(filtered_data.values())
        
        # Colors palette
        colors = plt.cm.Set3(np.linspace(0, 1, len(labels)))
        
        # Create pie chart
        wedges, texts, autotexts = ax.pie(
            sizes, 
            labels=labels, 
            autopct=lambda pct: f'{pct:.1f}%' if pct > 5 else '',
            colors=colors,
            startangle=90,
            pctdistance=0.75,
            explode=[0.02] * len(labels)
        )
        
        # Style the text
        for text in texts:
            text.set_fontsize(9)
        for autotext in autotexts:
            autotext.set_fontsize(8)
            autotext.set_fontweight('bold')
        
        ax.set_title('Emissions by Category', fontsize=13, fontweight='bold', pad=15)
        
        # Add legend
        ax.legend(wedges, [f'{label}: {val:.2f} tCO₂e' for label, val in zip(labels, sizes)],
                  title="Categories",
                  loc="center left",
                  bbox_to_anchor=(1, 0, 0.5, 1),
                  fontsize=8)
        
        plt.tight_layout()
        
        # Save to buffer
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
        
        # Truncate long facility names
        facilities = [f[:20] + '...' if len(f) > 20 else f for f in facilities]
        
        colors = plt.cm.viridis(np.linspace(0.3, 0.9, len(facilities)))
        
        bars = ax.barh(facilities, values, color=colors, height=0.6)
        
        # Add value labels
        for bar, value in zip(bars, values):
            width = bar.get_width()
            ax.annotate(f'{value:.2f}',
                       xy=(width, bar.get_y() + bar.get_height() / 2),
                       xytext=(3, 0),
                       textcoords="offset points",
                       ha='left', va='center', fontsize=9)
        
        ax.set_xlabel('Emissions (tCO₂e)', fontsize=11)
        ax.set_title('Facility-wise Emissions Comparison', fontsize=13, fontweight='bold', pad=15)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        
        plt.tight_layout()
        
        # Save to buffer
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight', facecolor='white')
        buffer.seek(0)
        plt.close(fig)
        
        return buffer
    
    def _create_monthly_trend_chart(self, emissions):
        """Create a line chart showing monthly emission trends"""
        fig, ax = plt.subplots(figsize=(10, 5))
        
        # Group emissions by month
        monthly_data = defaultdict(float)
        for emission in emissions:
            period = emission.get('reporting_period', '')
            co2e = emission.get('calculated_co2e', emission.get('co2e_emissions', emission.get('total_emissions', 0))) or 0
            monthly_data[period] += co2e
        
        if not monthly_data:
            monthly_data['N/A'] = 0
        
        # Sort by period
        sorted_periods = sorted(monthly_data.keys())
        values = [monthly_data[p] for p in sorted_periods]
        
        # Format labels
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
        ax.set_ylabel('Emissions (tCO₂e)', fontsize=11)
        ax.set_title('Monthly Emission Trend', fontsize=13, fontweight='bold', pad=15)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        
        # Rotate x labels if too many
        if len(labels) > 6:
            plt.xticks(rotation=45, ha='right')
        
        plt.tight_layout()
        
        # Save to buffer
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight', facecolor='white')
        buffer.seek(0)
        plt.close(fig)
        
        return buffer
    
    def _add_organization_emissions(self, doc, facilities, emissions):
        """Add organization-level emissions summary in table format"""
        # Calculate totals across all facilities
        total_by_category = defaultdict(float)
        total_by_fuel = defaultdict(float)
        total_scope1 = 0
        total_scope2 = 0
        total_biogenic = 0
        
        for emission in emissions:
            co2e = emission.get('calculated_co2e', emission.get('co2e_emissions', emission.get('total_emissions', 0))) or 0
            scope = emission.get('scope', '')
            category = emission.get('category', 'Other')
            fuel = emission.get('fuel_type', 'Unknown')
            
            total_by_category[category] += co2e
            total_by_fuel[fuel] += co2e
            
            if scope == 'scope1':
                total_scope1 += co2e
            elif scope == 'scope2':
                total_scope2 += co2e
            elif scope == 'biogenic':
                total_biogenic += co2e
        
        # Create summary table
        table = doc.add_table(rows=1, cols=3)
        table.style = 'Table Grid'
        
        headers = ['Category', 'Fuel', 'Total Emissions (tCO₂e)']
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
        
        scope1_categories = ['Stationary Combustion', 'Mobile Combustion', 'Fugitive Emissions', 'Process Emissions']
        for category in scope1_categories:
            row = table.add_row().cells
            row[0].text = category
            # Get fuels for this category
            fuels = []
            for emission in emissions:
                if emission.get('category') == category:
                    fuels.append(emission.get('fuel_type', 'Unknown'))
            row[1].text = ', '.join(set(fuels)) if fuels else 'NA'
            row[2].text = self._format_number(total_by_category.get(category, 0), 2)
        
        # Total Scope 1
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
        
        # Scope 2 - Grid Electricity (hardcoded process)
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
        
        # Sinks
        row = table.add_row().cells
        row[0].text = 'GHG Removals/Sinks'
        for para in row[0].paragraphs:
            for run in para.runs:
                run.bold = True
        row[1].text = ''
        row[2].text = ''
        
        row = table.add_row().cells
        row[0].text = 'Total Sinks (C)'
        row[1].text = 'NA'
        row[2].text = '0.00'
        
        # Grand Total
        row = table.add_row().cells
        row[0].text = 'Total Emissions (A + B - C)'
        for para in row[0].paragraphs:
            for run in para.runs:
                run.bold = True
        row[1].text = ''
        row[2].text = self._format_number(total_scope1 + total_scope2, 2)
    
    def _add_organization_analysis(self, doc, facilities, emissions):
        """Add organization-level analysis with charts"""
        total_emissions = sum(
            e.get('calculated_co2e', e.get('co2e_emissions', e.get('total_emissions', 0))) or 0 
            for e in emissions
        )
        
        # Calculate scope totals
        scope1_total = sum(
            e.get('calculated_co2e', e.get('co2e_emissions', e.get('total_emissions', 0))) or 0
            for e in emissions if e.get('scope') == 'scope1'
        )
        scope2_total = sum(
            e.get('calculated_co2e', e.get('co2e_emissions', e.get('total_emissions', 0))) or 0
            for e in emissions if e.get('scope') == 'scope2'
        )
        
        doc.add_paragraph(
            f"The organization has a total GHG emission of {self._format_number(total_emissions, 2)} tCO₂e "
            f"across {len(facilities)} selected facility(ies) for the reporting period."
        )
        
        # Compare facilities if multiple
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
                doc.add_paragraph(f"• {facility.get('name')}: {self._format_number(facility_total, 2)} tCO₂e ({pct:.1f}%)")
            
            # Add facility comparison chart
            if facility_emissions_dict:
                doc.add_paragraph()
                chart_buffer = self._create_facility_comparison_chart(facility_emissions_dict)
                doc.add_picture(chart_buffer, width=Inches(6))
                last_para = doc.paragraphs[-1]
                last_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                doc.add_paragraph("Figure: Facility-wise Emissions Comparison", style='Caption')
        
        # Add Scope 1 vs Scope 2 pie chart for organization
        if scope1_total > 0 or scope2_total > 0:
            doc.add_paragraph()
            chart_buffer = self._create_scope_comparison_chart(scope1_total, scope2_total)
            doc.add_picture(chart_buffer, width=Inches(5))
            last_para = doc.paragraphs[-1]
            last_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            doc.add_paragraph("Figure: Organization Scope 1 vs Scope 2 Distribution", style='Caption')
        
        # Add monthly trend chart
        if emissions:
            doc.add_paragraph()
            chart_buffer = self._create_monthly_trend_chart(emissions)
            doc.add_picture(chart_buffer, width=Inches(6))
            last_para = doc.paragraphs[-1]
            last_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            doc.add_paragraph("Figure: Monthly Emission Trend", style='Caption')
