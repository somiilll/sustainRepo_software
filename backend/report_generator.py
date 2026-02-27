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
from docx.shared import Inches, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
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
        # Create a new document (we'll build it from scratch based on template structure)
        doc = Document()
        
        # Format reporting period for display
        reporting_period = self._format_reporting_period(reporting_period_start, reporting_period_end)
        date_issued = datetime.now(timezone.utc).strftime("%B %d, %Y")
        company_name = organization.get('name', 'Not Available')
        
        # === COVER PAGE ===
        self._add_cover_page(doc, company_name, reporting_period, date_issued, description_of_change)
        
        # === TABLE OF CONTENTS (placeholder) ===
        doc.add_page_break()
        doc.add_heading('Table of Contents', level=1)
        doc.add_paragraph('[Table of contents will be generated automatically in Word]')
        
        # === REPORT CONTROL ===
        doc.add_page_break()
        doc.add_heading('REPORT CONTROL', level=1)
        doc.add_paragraph(f'This GHG Inventory Report is maintained at {company_name} site.')
        
        # === ABBREVIATIONS ===
        doc.add_page_break()
        doc.add_heading('ABBREVIATIONS', level=1)
        self._add_abbreviations(doc)
        
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
                reporting_period, idx + 1,  # 3.2, 3.3, etc.
                facility_prev_data
            )
        
        # === ORGANIZATION EMISSIONS ===
        section_num = len(facilities) + 2  # After all facilities
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
        except:
            return f"{start} - {end}"
    
    def _add_cover_page(self, doc, company_name, reporting_period, date_issued, description):
        """Add cover page"""
        # Report Control Table
        table = doc.add_table(rows=2, cols=2)
        table.style = 'Table Grid'
        table.cell(0, 0).text = 'Revision date'
        table.cell(0, 1).text = 'Description of change'
        table.cell(1, 0).text = date_issued
        table.cell(1, 1).text = description or 'Initial Report'
        
        # Add spacing
        for _ in range(5):
            doc.add_paragraph()
        
        # Company Name (centered, large)
        title = doc.add_paragraph()
        title.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = title.add_run(company_name)
        run.bold = True
        run.font.size = Pt(28)
        
        # Add spacing
        for _ in range(3):
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
        """Add organization details section"""
        # Address
        doc.add_heading('Address Details:', level=3)
        doc.add_paragraph(f"Street Address: {org.get('address', 'Not Available')}")
        doc.add_paragraph(f"City: {org.get('city', 'Not Available')}")
        doc.add_paragraph(f"State: {org.get('state', 'Not Available')}")
        doc.add_paragraph(f"Pin/Zip Code: {org.get('pincode', 'Not Available')}")
        doc.add_paragraph(f"Country: {org.get('country', 'Not Available')}")
        
        # Other details
        doc.add_paragraph()
        doc.add_paragraph(f"a) General Description: {org.get('description', 'Not Available')}")
        doc.add_paragraph(f"b) Mission of the organization: {org.get('mission', 'Not Available')}")
        doc.add_paragraph(f"c) Vision of the organization: {org.get('vision', 'Not Available')}")
        doc.add_paragraph(f"d) Process Description: {org.get('process_description', 'Not Available')}")
        doc.add_paragraph(f"e) Organizational Boundaries: {org.get('organizational_boundaries', 'Not Available')}")
        doc.add_paragraph(f"f) Reporting Frequency: {org.get('reporting_frequency', 'Not Available')}")
        doc.add_paragraph(f"g) Number of Facilities: {facility_count}")
        doc.add_paragraph(f"h) Remarks/Notes: {org.get('remarks', 'Not Available')}")
        
        # Attachments
        attachments = org.get('attachments', [])
        if attachments:
            doc.add_paragraph(f"i) Attachments: {len(attachments)} document(s) attached")
    
    def _add_facility_section(self, doc, facility, index):
        """Add facility details section"""
        doc.add_heading(f"2.{index} {facility.get('name', 'Unnamed Facility')}", level=2)
        
        doc.add_paragraph(f"Sector/Industry: {facility.get('sector', 'Not Available')}")
        
        doc.add_heading('Address Details:', level=3)
        doc.add_paragraph(f"1. Street Address: {facility.get('address', 'Not Available')}")
        doc.add_paragraph(f"2. City: {facility.get('city', 'Not Available')}")
        doc.add_paragraph(f"3. State: {facility.get('state', 'Not Available')}")
        doc.add_paragraph(f"4. Pin/Zip Code: {facility.get('pincode', 'Not Available')}")
        doc.add_paragraph(f"5. Country: {facility.get('country', 'Not Available')}")
        
        doc.add_paragraph()
        doc.add_paragraph(f"Products Manufactured: {facility.get('products_manufactured', 'Not Available')}")
        doc.add_paragraph(f"Quantity of Products Manufactured in a Day: {facility.get('product_quantity', 'Not Available')}")
        doc.add_paragraph(f"Machinery Used: {facility.get('machinery_used', 'Not Available')}")
        doc.add_paragraph(f"Process Description: {facility.get('process_description', 'Not Available')}")
        doc.add_paragraph(f"Person Responsible: {facility.get('responsible_person', 'Not Available')}")
        doc.add_paragraph(f"Monitoring Frequency: {facility.get('monitoring_frequency', 'Not Available')}")
        doc.add_paragraph(f"Reporting Frequency: {facility.get('reporting_frequency', 'Not Available')}")
        doc.add_paragraph(f"Remarks/Notes: {facility.get('remarks', 'Not Available')}")
        
        # Attachments
        attachments = facility.get('attachments', [])
        if attachments:
            doc.add_paragraph(f"Attachments: {len(attachments)} document(s) attached")
    
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
        doc.add_heading(f"3.{section_num} Facility – {facility_name}", level=2)
        
        # Categorize emissions
        scope1_emissions = [e for e in emissions if e.get('scope') == 'scope1']
        scope2_emissions = [e for e in emissions if e.get('scope') == 'scope2']
        biogenic_emissions = [e for e in emissions if e.get('scope') == 'biogenic']
        
        # List of emissions
        doc.add_heading(f"3.{section_num}.1 List of Emissions", level=3)
        
        # Get unique process names and fuels
        scope1_fuels = list(set([e.get('fuel_type', 'Unknown') for e in scope1_emissions]))
        scope2_fuels = list(set([e.get('fuel_type', 'Unknown') for e in scope2_emissions]))
        
        doc.add_paragraph(f"Direct/Scope 1 Emissions: {', '.join(scope1_fuels) if scope1_fuels else 'None'}")
        doc.add_paragraph(f"Indirect/Scope 2 Emissions: {', '.join(scope2_fuels) if scope2_fuels else 'None'}")
        if biogenic_emissions:
            biogenic_fuels = list(set([e.get('fuel_type', 'Unknown') for e in biogenic_emissions]))
            doc.add_paragraph(f"Biogenic Emissions: {', '.join(biogenic_fuels)}")
        
        # Source of emissions
        doc.add_heading(f"3.{section_num}.2 Source of Emissions", level=3)
        scope1_categories = list(set([e.get('category', 'Unknown') for e in scope1_emissions]))
        scope2_categories = list(set([e.get('category', 'Unknown') for e in scope2_emissions]))
        
        doc.add_paragraph(f"Direct/Scope 1 Sources: {', '.join(scope1_categories) if scope1_categories else 'None'}")
        doc.add_paragraph(f"Indirect/Scope 2 Sources: {', '.join(scope2_categories) if scope2_categories else 'None'}")
        
        # Summary table
        doc.add_heading(f"3.{section_num}.3 Summary of GHG Emissions for Reporting Period – {reporting_period}", level=3)
        self._add_emissions_summary_table(doc, emissions)
        
        # Calculate totals
        totals = self._calculate_emission_totals(emissions)
        
        # Direct Emissions Summary
        doc.add_heading('Direct Emissions / Scope 1', level=4)
        self._add_scope1_summary(doc, scope1_emissions, totals)
        
        # Indirect Emissions Summary
        doc.add_heading('Scope 2 / Indirect Emissions', level=4)
        self._add_scope2_summary(doc, scope2_emissions, totals)
        
        # Totals
        doc.add_paragraph()
        total_direct = totals['scope1_total']
        total_indirect = totals['scope2_total']
        total_sinks = totals.get('sinks_total', 0)
        
        doc.add_paragraph(f"Total Emissions Direct (A): {total_direct:.4f} tCO₂e")
        doc.add_paragraph(f"Total Emissions Indirect (B): {total_indirect:.4f} tCO₂e")
        doc.add_paragraph(f"Total Emissions (A + B): {(total_direct + total_indirect):.4f} tCO₂e")
        doc.add_paragraph()
        doc.add_paragraph(f"Total Removals/Sinks (C): {total_sinks:.4f} tCO₂e")
        doc.add_paragraph()
        total_net = total_direct + total_indirect - total_sinks
        p = doc.add_paragraph()
        run = p.add_run(f"Total GHG Emissions (A + B - C): {total_net:.4f} tCO₂e")
        run.bold = True
        
        # Previous years data
        if prev_data and len(prev_data) > 0:
            doc.add_heading(f"3.{section_num}.4 Emissions of Previous Years", level=3)
            self._add_previous_years_table(doc, prev_data)
        
        # Analysis
        doc.add_heading(f"3.{section_num}.5 Analysis", level=3)
        self._add_facility_analysis(doc, facility_name, totals, scope1_emissions, scope2_emissions)
    
    def _add_emissions_summary_table(self, doc, emissions):
        """Add emissions summary table"""
        if not emissions:
            doc.add_paragraph("No emissions data available for this reporting period.")
            return
        
        # Sort emissions by month
        sorted_emissions = sorted(emissions, key=lambda x: x.get('reporting_period', ''))
        
        # Create table
        table = doc.add_table(rows=1, cols=8)
        table.style = 'Table Grid'
        
        # Headers
        headers = ['Fuel', 'Month', 'Quantity', 'Units', 'Emission Factor', 'Source of EF', 'Comments', 'GHG Emissions (tCO₂e)']
        header_cells = table.rows[0].cells
        for i, header in enumerate(headers):
            header_cells[i].text = header
            header_cells[i].paragraphs[0].runs[0].bold = True
        
        # Data rows
        for emission in sorted_emissions:
            row = table.add_row().cells
            row[0].text = str(emission.get('fuel_type', 'N/A'))
            row[1].text = str(emission.get('reporting_period', 'N/A'))
            row[2].text = str(emission.get('quantity', 0))
            row[3].text = str(emission.get('quantity_unit', emission.get('unit', 'N/A')))
            row[4].text = str(emission.get('emission_factor', 'N/A'))
            row[5].text = str(emission.get('source_of_information', 'Database'))
            row[6].text = str(emission.get('justification', '') or emission.get('notes', '') or '-')
            
            # Get CO2e emissions
            co2e = emission.get('co2e_emissions', emission.get('total_emissions', 0)) or 0
            row[7].text = f"{co2e:.4f}"
    
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
            co2e = emission.get('co2e_emissions', emission.get('total_emissions', 0)) or 0
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
    
    def _add_scope1_summary(self, doc, emissions, totals):
        """Add Scope 1 emissions summary"""
        categories = {
            'Stationary Combustion': 0,
            'Mobile Combustion': 0,
            'Process Emissions': 0,
            'Fugitive Emissions': 0
        }
        
        for emission in emissions:
            category = emission.get('category', 'Other')
            co2e = emission.get('co2e_emissions', emission.get('total_emissions', 0)) or 0
            if category in categories:
                categories[category] += co2e
            else:
                # Try to match partial category names
                for cat in categories:
                    if cat.lower() in category.lower():
                        categories[cat] += co2e
                        break
        
        for category, value in categories.items():
            doc.add_paragraph(f"• {category}: {value:.4f} tCO₂e")
    
    def _add_scope2_summary(self, doc, emissions, totals):
        """Add Scope 2 emissions summary"""
        if not emissions:
            doc.add_paragraph("• Grid Electricity: 0.0000 tCO₂e")
            return
        
        total = sum(e.get('co2e_emissions', e.get('total_emissions', 0)) or 0 for e in emissions)
        doc.add_paragraph(f"• Grid Electricity: {total:.4f} tCO₂e")
    
    def _add_previous_years_table(self, doc, prev_data):
        """Add previous years emissions table"""
        # Group by financial year
        by_fy = defaultdict(lambda: defaultdict(float))
        
        for emission in prev_data:
            period = emission.get('reporting_period', '')
            # Extract year from period
            try:
                year = period.split('-')[0] if '-' in period else period[:4]
                fy = f"FY {year}"
            except:
                fy = "Unknown"
            
            category = emission.get('category', 'Other')
            co2e = emission.get('co2e_emissions', emission.get('total_emissions', 0)) or 0
            by_fy[fy][category] += co2e
        
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
            header_cells[i].paragraphs[0].runs[0].bold = True
        
        # Add data rows (simplified)
        categories = ['Stationary Combustion', 'Mobile Combustion', 'Fugitive Emissions', 'Process Emissions']
        for category in categories:
            row = table.add_row().cells
            row[0].text = category
            row[1].text = '-'
            for i, fy in enumerate(fys):
                row[i + 2].text = f"{by_fy[fy].get(category, 0):.2f}"
    
    def _add_facility_analysis(self, doc, facility_name, totals, scope1, scope2):
        """Add facility analysis section with charts"""
        total = totals['scope1_total'] + totals['scope2_total']
        
        doc.add_paragraph(
            f"The facility '{facility_name}' has a total GHG emission of {total:.4f} tCO₂e "
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
        ax.legend(wedges, [f'{l}: {v:.2f} tCO₂e' for l, v in zip(labels, sizes)],
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
            co2e = emission.get('co2e_emissions', emission.get('total_emissions', 0)) or 0
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
            except:
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
        """Add organization-level emissions summary"""
        # Calculate totals across all facilities
        total_by_category = defaultdict(float)
        total_by_fuel = defaultdict(float)
        total_scope1 = 0
        total_scope2 = 0
        total_biogenic = 0
        
        for emission in emissions:
            co2e = emission.get('co2e_emissions', emission.get('total_emissions', 0)) or 0
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
            header_cells[i].paragraphs[0].runs[0].bold = True
        
        # Scope 1 categories
        row = table.add_row().cells
        row[0].text = 'Direct/Scope 1 Emissions'
        row[0].paragraphs[0].runs[0].bold = True
        
        scope1_categories = ['Stationary Combustion', 'Mobile Combustion', 'Fugitive Emissions', 'Process Emissions']
        for category in scope1_categories:
            if total_by_category.get(category, 0) > 0:
                row = table.add_row().cells
                row[0].text = category
                # Get fuels for this category
                fuels = []
                for emission in emissions:
                    if emission.get('category') == category:
                        fuels.append(emission.get('fuel_type', 'Unknown'))
                row[1].text = ', '.join(set(fuels)) if fuels else '-'
                row[2].text = f"{total_by_category.get(category, 0):.4f}"
        
        # Total Scope 1
        row = table.add_row().cells
        row[0].text = 'Total Direct Emissions (A)'
        row[0].paragraphs[0].runs[0].bold = True
        row[2].text = f"{total_scope1:.4f}"
        
        # Scope 2
        row = table.add_row().cells
        row[0].text = 'Indirect/Scope 2 Emissions'
        row[0].paragraphs[0].runs[0].bold = True
        
        row = table.add_row().cells
        row[0].text = 'Grid Electricity'
        row[1].text = 'Electricity'
        row[2].text = f"{total_scope2:.4f}"
        
        row = table.add_row().cells
        row[0].text = 'Total Indirect Emissions (B)'
        row[0].paragraphs[0].runs[0].bold = True
        row[2].text = f"{total_scope2:.4f}"
        
        # Sinks
        row = table.add_row().cells
        row[0].text = 'GHG Removals/Sinks'
        row[0].paragraphs[0].runs[0].bold = True
        
        row = table.add_row().cells
        row[0].text = 'Total Sinks (C)'
        row[2].text = "0.0000"
        
        # Grand Total
        row = table.add_row().cells
        row[0].text = 'Total Emissions (A + B - C)'
        row[0].paragraphs[0].runs[0].bold = True
        row[2].text = f"{(total_scope1 + total_scope2):.4f}"
    
    def _add_organization_analysis(self, doc, facilities, emissions):
        """Add organization-level analysis with charts"""
        total_emissions = sum(
            e.get('co2e_emissions', e.get('total_emissions', 0)) or 0 
            for e in emissions
        )
        
        # Calculate scope totals
        scope1_total = sum(
            e.get('co2e_emissions', e.get('total_emissions', 0)) or 0
            for e in emissions if e.get('scope') == 'scope1'
        )
        scope2_total = sum(
            e.get('co2e_emissions', e.get('total_emissions', 0)) or 0
            for e in emissions if e.get('scope') == 'scope2'
        )
        
        doc.add_paragraph(
            f"The organization has a total GHG emission of {total_emissions:.4f} tCO₂e "
            f"across {len(facilities)} selected facility(ies) for the reporting period."
        )
        
        # Compare facilities if multiple
        if len(facilities) > 1:
            doc.add_paragraph()
            doc.add_paragraph("Facility-wise Emission Comparison:")
            
            facility_emissions_dict = {}
            for facility in facilities:
                facility_total = sum(
                    e.get('co2e_emissions', e.get('total_emissions', 0)) or 0
                    for e in emissions if e.get('facility_id') == facility.get('id')
                )
                facility_emissions_dict[facility.get('name', 'Unknown')] = facility_total
                pct = (facility_total / total_emissions * 100) if total_emissions > 0 else 0
                doc.add_paragraph(f"• {facility.get('name')}: {facility_total:.4f} tCO₂e ({pct:.1f}%)")
            
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
