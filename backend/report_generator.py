"""
GHG Inventory Report Generator
Generates DOCX reports based on the new 6-Chapter structure according to ISO 14064-1:2018
"""
import os
import io
import requests
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple
from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import qn, nsmap
from docx.oxml import OxmlElement
from collections import defaultdict
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np


class GHGReportGenerator:
    """Generates GHG Inventory Reports with 6-Chapter structure"""
    
    # Month order for sorting
    MONTH_ORDER = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    
    def __init__(self, template_path: str = None, backend_base_url: str = None):
        """Initialize with template path"""
        self.template_path = template_path or os.path.join(
            os.path.dirname(__file__), 'templates', 'GHG_inventory_report.docx'
        )
        self.backend_base_url = backend_base_url or os.environ.get('BACKEND_URL', 'http://localhost:8001')
        self.report_date = datetime.now(timezone.utc).strftime("%B %d, %Y")
    
    # ==================== UTILITY METHODS ====================
    
    def _format_month(self, period_str: str) -> str:
        """Format month string from YYYY-MM to Mon-YYYY format"""
        try:
            if not period_str:
                return 'Not Available'
            if ' to ' in period_str:
                parts = period_str.split(' to ')
                return f"{self._format_month(parts[0])} to {self._format_month(parts[1])}"
            dt = datetime.strptime(period_str.strip(), "%Y-%m")
            return dt.strftime("%b-%Y")
        except (ValueError, TypeError):
            return period_str or 'Not Available'
    
    def _format_month_full(self, period_str: str) -> str:
        """Format month string from YYYY-MM to full format (e.g., January 2025)"""
        try:
            if not period_str:
                return 'Not Available'
            dt = datetime.strptime(period_str.strip(), "%Y-%m")
            return dt.strftime("%B %Y")
        except (ValueError, TypeError):
            return period_str or 'Not Available'
    
    def _format_number(self, value, decimals=2) -> str:
        """Format number to specified decimal places"""
        try:
            if value is None:
                return '0.00'
            num = float(value)
            return f"{num:,.{decimals}f}"
        except (ValueError, TypeError):
            return '0.00'
    
    def _get_value_or_na(self, obj: Dict, key: str, default='Not Available') -> str:
        """Get value from dict or return Not Available if empty/None"""
        if obj is None:
            return default
        val = obj.get(key)
        if val is None or val == '' or val == 'NA':
            return default
        return str(val)
    
    def _sort_months(self, months: List[str]) -> List[str]:
        """Sort months in chronological order (Jan -> Dec)"""
        def month_key(month_str):
            try:
                # Handle formats like "Jan-2026" or "2026-01"
                if '-' in month_str:
                    parts = month_str.split('-')
                    if len(parts[0]) == 4:  # YYYY-MM format
                        return datetime.strptime(month_str, "%Y-%m")
                    else:  # Mon-YYYY format
                        return datetime.strptime(month_str, "%b-%Y")
                return datetime.min
            except Exception:
                return datetime.min
        return sorted(months, key=month_key)
    
    def _deduplicate_list(self, items: List[str], case_insensitive: bool = True) -> List[str]:
        """Remove duplicates from list, optionally case-insensitive"""
        seen = set()
        result = []
        for item in items:
            key = item.lower().strip() if case_insensitive else item.strip()
            if key not in seen:
                seen.add(key)
                result.append(item.strip())
        return result
    
    def _download_image(self, url: str) -> Optional[io.BytesIO]:
        """Download an image from URL and return as BytesIO"""
        if not url:
            return None
        
        try:
            import re
            
            # Handle internal API file URLs - try direct filesystem access first
            if '/api/files/' in url:
                match = re.search(r'/api/files/([a-f0-9\-]+)', url)
                if match:
                    file_id = match.group(1)
                    file_path = self._get_file_path_from_db(file_id)
                    if file_path and os.path.exists(file_path):
                        try:
                            with open(file_path, 'rb') as f:
                                content = f.read()
                                if self._is_image_content(content):
                                    return io.BytesIO(content)
                        except Exception as e:
                            print(f"Error reading file from filesystem: {e}")
            
            # For external URLs, use HTTP request
            response = requests.get(url, timeout=15, allow_redirects=True)
            
            if response.status_code == 200:
                content_type = response.headers.get('content-type', '')
                if 'image' in content_type.lower() or self._is_image_content(response.content):
                    return io.BytesIO(response.content)
                        
        except Exception as e:
            print(f"Error downloading image from {url}: {e}")
        
        return None
    
    def _is_image_content(self, content: bytes) -> bool:
        """Check if content is an image based on magic bytes"""
        if len(content) < 8:
            return False
        header = content[:8]
        return (header[:4] == b'\x89PNG' or 
                header[:2] == b'\xff\xd8' or 
                header[:6] == b'GIF87a' or 
                header[:6] == b'GIF89a' or
                header[:2] == b'BM' or
                header[:4] == b'RIFF')
    
    def _get_file_path_from_db(self, file_id: str) -> Optional[str]:
        """Get file path from database record"""
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
    
    # ==================== DOCUMENT FORMATTING ====================
    
    def _add_footer(self, doc: Document):
        """Add footer with date and platform info to all sections"""
        for section in doc.sections:
            footer = section.footer
            footer.is_linked_to_previous = False
            
            # Add footer paragraph
            p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
            p.clear()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            
            # Date of Report
            run1 = p.add_run(f"Date of Report: {self.report_date}\n")
            run1.font.size = Pt(8)
            run1.font.italic = True
            
            # Platform info
            run2 = p.add_run("The report has been prepared through the SustainRepo platform, with all related evidence securely stored and viewable in the dashboard.")
            run2.font.size = Pt(8)
            run2.font.italic = True
    
    def _add_styled_heading(self, doc: Document, text: str, level: int = 1):
        """Add a styled heading"""
        heading = doc.add_heading(text, level=level)
        heading.alignment = WD_ALIGN_PARAGRAPH.LEFT
        return heading
    
    def _add_paragraph_with_bold_label(self, doc: Document, label: str, value: str):
        """Add paragraph with bold label on one line and value on next line"""
        # Label line
        p = doc.add_paragraph()
        run_label = p.add_run(f"{label}:")
        run_label.bold = True
        
        # Value line
        value_text = value if value and value != 'Not Available' else 'Not Available'
        doc.add_paragraph(value_text)
        return p
    
    def _add_labeled_field(self, doc: Document, label: str, value: str):
        """Add a labeled field with label on one line and value on next line"""
        p = doc.add_paragraph()
        run = p.add_run(f"{label}:")
        run.bold = True
        
        value_text = value if value and value != 'Not Available' else 'Not Available'
        doc.add_paragraph(value_text)
        return p
    
    def _create_styled_table(self, doc: Document, headers: List[str], data: List[List[str]], 
                            col_widths: List[float] = None) -> Any:
        """Create a styled table with headers and data"""
        num_cols = len(headers)
        table = doc.add_table(rows=1, cols=num_cols)
        table.style = 'Table Grid'
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        
        # Set header row
        hdr_cells = table.rows[0].cells
        for i, header in enumerate(headers):
            hdr_cells[i].text = header
            for paragraph in hdr_cells[i].paragraphs:
                for run in paragraph.runs:
                    run.font.bold = True
                    run.font.size = Pt(9)
            # Set background color for header
            shading = OxmlElement('w:shd')
            shading.set(qn('w:fill'), 'E8E8E8')
            hdr_cells[i]._tc.get_or_add_tcPr().append(shading)
        
        # Add data rows
        for row_data in data:
            row_cells = table.add_row().cells
            for i, cell_data in enumerate(row_data):
                row_cells[i].text = str(cell_data) if cell_data is not None else ''
                for paragraph in row_cells[i].paragraphs:
                    for run in paragraph.runs:
                        run.font.size = Pt(9)
        
        # Set column widths if provided
        if col_widths:
            for i, width in enumerate(col_widths):
                for cell in table.columns[i].cells:
                    cell.width = Inches(width)
        
        return table
    
    # ==================== DATA PROCESSING ====================
    
    def _filter_emissions_by_period(self, emissions: List[Dict], start_period: str, end_period: str) -> List[Dict]:
        """Filter emissions to only include records within the reporting period"""
        if not emissions:
            return []
        
        filtered = []
        for em in emissions:
            period = em.get('reporting_period', '')
            if not period:
                continue
            
            # Handle single month or range
            if ' to ' in period:
                em_start, em_end = period.split(' to ')
            else:
                em_start = em_end = period
            
            # Check if emission period overlaps with reporting period
            if em_start <= end_period and em_end >= start_period:
                filtered.append(em)
        
        return filtered
    
    def _get_emissions_by_facility(self, emissions: List[Dict], facility_id: str) -> List[Dict]:
        """Get emissions for a specific facility"""
        return [em for em in emissions if em.get('facility_id') == facility_id]
    
    def _get_fuel_from_emission(self, em: Dict) -> str:
        """Get fuel name from emission record, checking multiple possible fields"""
        return (em.get('fuel_type') or em.get('fuel') or 
                em.get('sub_category') or 'Unknown')
    
    def _get_category_from_emission(self, em: Dict) -> str:
        """Get category from emission record, checking multiple possible fields"""
        return (em.get('category') or em.get('emission_category') or 'Unknown')
    
    def _get_process_names_from_emission(self, em: Dict) -> List[str]:
        """Get process names from emission record"""
        process_names = em.get('process_names', [])
        if process_names:
            return process_names if isinstance(process_names, list) else [process_names]
        
        # Fallback to single process_name field
        process = em.get('process_name') or em.get('name_of_process')
        return [process] if process else []
    
    def _calculate_facility_totals(self, facility_emissions: List[Dict]) -> Dict:
        """Calculate totals for a facility"""
        totals = {
            'scope1': 0.0,
            'scope2': 0.0,
            'biogenic': 0.0,
            'removals': 0.0,
            'by_month': defaultdict(lambda: {'scope1': 0.0, 'scope2': 0.0}),
            'by_category': defaultdict(float),
            'by_fuel': defaultdict(float),
            'scope1_co2': 0.0,
            'scope1_ch4': 0.0,
            'scope1_n2o': 0.0,
            'scope2_co2': 0.0,
        }
        
        for em in facility_emissions:
            scope = em.get('scope', '').lower()
            tco2e = float(em.get('total_emissions', 0) or 0)
            category = self._get_category_from_emission(em)
            fuel = self._get_fuel_from_emission(em)
            period = em.get('reporting_period', '')
            
            if 'scope 1' in scope or 'scope1' in scope or scope == '1':
                totals['scope1'] += tco2e
                totals['by_category'][category] += tco2e
                totals['by_fuel'][fuel] += tco2e
                # Individual gas components
                totals['scope1_co2'] += float(em.get('co2_emissions', 0) or 0)
                totals['scope1_ch4'] += float(em.get('ch4_emissions', 0) or 0)
                totals['scope1_n2o'] += float(em.get('n2o_emissions', 0) or 0)
            elif 'scope 2' in scope or 'scope2' in scope or scope == '2':
                totals['scope2'] += tco2e
                totals['scope2_co2'] += tco2e
            elif 'biogenic' in scope:
                totals['biogenic'] += tco2e
            
            # Track by month
            if period:
                month_key = self._format_month(period.split(' to ')[0] if ' to ' in period else period)
                if 'scope 1' in scope or 'scope1' in scope or scope == '1':
                    totals['by_month'][month_key]['scope1'] += tco2e
                elif 'scope 2' in scope or 'scope2' in scope or scope == '2':
                    totals['by_month'][month_key]['scope2'] += tco2e
        
        totals['total'] = totals['scope1'] + totals['scope2']
        totals['total_ghg'] = totals['total'] - totals['removals']
        
        return totals
    
    def _get_emission_processes(self, facility_emissions: List[Dict]) -> Tuple[List[str], List[str]]:
        """Get unique emission processes for Scope 1 and Scope 2"""
        scope1_processes = []
        scope2_processes = []
        
        for em in facility_emissions:
            scope = em.get('scope', '').lower()
            process_names = self._get_process_names_from_emission(em)
            fuel = self._get_fuel_from_emission(em)
            
            for process in process_names:
                if process and fuel:
                    process_fuel = f"{process} - {fuel}"
                    if 'scope1' in scope or 'scope 1' in scope or scope == '1':
                        scope1_processes.append(process_fuel)
                    elif 'scope2' in scope or 'scope 2' in scope or scope == '2':
                        scope2_processes.append(process_fuel)
            
            # If no process names but has fuel, use category
            if not process_names and fuel:
                category = self._get_category_from_emission(em)
                process_fuel = f"{category} - {fuel}"
                if 'scope1' in scope or 'scope 1' in scope or scope == '1':
                    scope1_processes.append(process_fuel)
                elif 'scope2' in scope or 'scope 2' in scope or scope == '2':
                    scope2_processes.append(process_fuel)
        
        # Deduplicate (case insensitive)
        scope1_processes = self._deduplicate_list(scope1_processes, case_insensitive=True)
        scope2_processes = self._deduplicate_list(scope2_processes, case_insensitive=True)
        
        # For Scope 2: Only show "Purchased Electricity - Electricity" if there's actual electricity data
        # Otherwise show whatever is there, or "NA" if empty
        if not scope2_processes:
            scope2_processes = ["NA"]
        
        return scope1_processes, scope2_processes
    
    def _get_unique_fuels(self, facility_emissions: List[Dict]) -> Tuple[List[str], List[str]]:
        """Get unique fuel names for Scope 1 and Scope 2"""
        scope1_fuels = []
        scope2_fuels = []
        
        for em in facility_emissions:
            scope = em.get('scope', '').lower()
            fuel = self._get_fuel_from_emission(em)
            
            if fuel and fuel != 'Unknown':
                if 'scope1' in scope or 'scope 1' in scope or scope == '1':
                    scope1_fuels.append(fuel)
                elif 'scope2' in scope or 'scope 2' in scope or scope == '2':
                    scope2_fuels.append(fuel)
        
        scope1_fuels = self._deduplicate_list(scope1_fuels, case_insensitive=True)
        scope2_fuels = self._deduplicate_list(scope2_fuels, case_insensitive=True)
        
        # For Scope 2: Show actual fuels or "NA" if none
        if not scope2_fuels:
            scope2_fuels = ["NA"]
        
        return scope1_fuels, scope2_fuels
    
    def _get_previous_year_data(self, emissions: List[Dict], current_start: str) -> Dict:
        """Get previous year emissions data"""
        try:
            current_year = int(current_start.split('-')[0])
            prev_years = {}
            
            for em in emissions:
                period = em.get('reporting_period', '')
                if not period:
                    continue
                
                em_year = int(period.split('-')[0])
                if em_year < current_year:
                    fy_key = f"FY {em_year}"
                    if fy_key not in prev_years:
                        prev_years[fy_key] = defaultdict(lambda: defaultdict(float))
                    
                    category = self._get_category_from_emission(em)
                    fuel = self._get_fuel_from_emission(em)
                    tco2e = float(em.get('total_emissions', 0) or 0)
                    
                    prev_years[fy_key][category][fuel] += tco2e
            
            return prev_years
        except Exception:
            return {}
    
    # ==================== CHART GENERATION ====================
    
    def _create_scope_comparison_chart(self, scope1: float, scope2: float) -> io.BytesIO:
        """Create Scope 1 vs Scope 2 comparison chart"""
        plt.figure(figsize=(6, 4))
        
        labels = ['Scope 1\n(Direct)', 'Scope 2\n(Indirect)']
        values = [scope1, scope2]
        colors = ['#3498db', '#e74c3c']
        
        bars = plt.bar(labels, values, color=colors, edgecolor='black', linewidth=1.2)
        
        for bar, val in zip(bars, values):
            plt.text(bar.get_x() + bar.get_width()/2, bar.get_height() + max(values)*0.02,
                    f'{val:,.2f}', ha='center', va='bottom', fontsize=9, fontweight='bold')
        
        plt.ylabel('tCO2e', fontsize=10)
        plt.title('Scope 1 vs Scope 2 Emissions Comparison', fontsize=11, fontweight='bold')
        plt.grid(axis='y', alpha=0.3)
        plt.tight_layout()
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=120, bbox_inches='tight')
        buf.seek(0)
        plt.close()
        return buf
    
    def _create_category_chart(self, categories: Dict[str, float]) -> io.BytesIO:
        """Create category-wise emission distribution chart"""
        plt.figure(figsize=(6, 4))
        
        if not categories:
            categories = {'No Data': 0}
        
        labels = list(categories.keys())
        values = list(categories.values())
        colors = plt.cm.Set3(np.linspace(0, 1, len(labels)))
        
        wedges, texts, autotexts = plt.pie(values, labels=labels, autopct='%1.1f%%',
                                           colors=colors, startangle=90)
        
        plt.title('Category-wise Emission Distribution', fontsize=11, fontweight='bold')
        plt.tight_layout()
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=120, bbox_inches='tight')
        buf.seek(0)
        plt.close()
        return buf
    
    def _create_fuel_chart(self, fuels: Dict[str, float]) -> io.BytesIO:
        """Create fuel-wise emission distribution chart"""
        plt.figure(figsize=(6, 4))
        
        if not fuels:
            fuels = {'No Data': 0}
        
        labels = list(fuels.keys())
        values = list(fuels.values())
        colors = plt.cm.Pastel1(np.linspace(0, 1, len(labels)))
        
        wedges, texts, autotexts = plt.pie(values, labels=labels, autopct='%1.1f%%',
                                           colors=colors, startangle=90)
        
        plt.title('Fuel-wise Emission Distribution', fontsize=11, fontweight='bold')
        plt.tight_layout()
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=120, bbox_inches='tight')
        buf.seek(0)
        plt.close()
        return buf
    
    def _create_monthly_trend_chart(self, monthly_data: Dict) -> io.BytesIO:
        """Create monthly emission trend chart"""
        plt.figure(figsize=(7, 4))
        
        if not monthly_data:
            monthly_data = {'No Data': {'scope1': 0, 'scope2': 0}}
        
        months = self._sort_months(list(monthly_data.keys()))
        scope1_vals = [monthly_data[m]['scope1'] for m in months]
        scope2_vals = [monthly_data[m]['scope2'] for m in months]
        
        x = np.arange(len(months))
        width = 0.35
        
        plt.bar(x - width/2, scope1_vals, width, label='Scope 1', color='#3498db')
        plt.bar(x + width/2, scope2_vals, width, label='Scope 2', color='#e74c3c')
        
        plt.xlabel('Month', fontsize=10)
        plt.ylabel('tCO2e', fontsize=10)
        plt.title('Monthly Emission Trend', fontsize=11, fontweight='bold')
        plt.xticks(x, months, rotation=45, ha='right', fontsize=8)
        plt.legend(fontsize=8)
        plt.grid(axis='y', alpha=0.3)
        plt.tight_layout()
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=120, bbox_inches='tight')
        buf.seek(0)
        plt.close()
        return buf
    
    def _create_facility_comparison_chart(self, facility_totals: Dict[str, float]) -> io.BytesIO:
        """Create facility comparison chart"""
        plt.figure(figsize=(7, 4))
        
        if not facility_totals:
            facility_totals = {'No Data': 0}
        
        labels = list(facility_totals.keys())
        values = list(facility_totals.values())
        colors = plt.cm.tab10(np.linspace(0, 1, len(labels)))
        
        bars = plt.bar(labels, values, color=colors, edgecolor='black')
        
        for bar, val in zip(bars, values):
            plt.text(bar.get_x() + bar.get_width()/2, bar.get_height() + max(values)*0.02,
                    f'{val:,.2f}', ha='center', va='bottom', fontsize=8, fontweight='bold')
        
        plt.ylabel('tCO2e', fontsize=10)
        plt.title('Facility-wise Emission Comparison', fontsize=11, fontweight='bold')
        plt.xticks(rotation=45, ha='right', fontsize=8)
        plt.grid(axis='y', alpha=0.3)
        plt.tight_layout()
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=120, bbox_inches='tight')
        buf.seek(0)
        plt.close()
        return buf
    
    # ==================== CHAPTER GENERATORS ====================
    
    def _generate_cover_page(self, doc: Document, organization: Dict, reporting_period_start: str, 
                            reporting_period_end: str):
        """Generate cover page with logo and basic info"""
        # Company Logo
        logo_url = organization.get('logo')
        if logo_url:
            try:
                logo_buffer = self._download_image(logo_url)
                if logo_buffer:
                    logo_para = doc.add_paragraph()
                    logo_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    run = logo_para.add_run()
                    run.add_picture(logo_buffer, width=Inches(2.5))
            except Exception as e:
                print(f"Error adding logo: {e}")
        
        # Company Name
        doc.add_paragraph()
        company_para = doc.add_paragraph()
        company_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = company_para.add_run(self._get_value_or_na(organization, 'name'))
        run.font.size = Pt(24)
        run.font.bold = True
        
        # Add extra spacing between company name and report title
        doc.add_paragraph()
        doc.add_paragraph()
        
        # Report Title
        title_para = doc.add_paragraph()
        title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = title_para.add_run("Greenhouse Gas (GHG) Inventory Report")
        run.font.size = Pt(18)
        run.font.bold = True
        
        # Subtitle
        subtitle_para = doc.add_paragraph()
        subtitle_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = subtitle_para.add_run("Prepared as per ISO 14064-1:2018")
        run.font.size = Pt(12)
        run.font.italic = True
        
        # Reporting Period
        period_para = doc.add_paragraph()
        period_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = period_para.add_run(f"Reporting Period: {self._format_month_full(reporting_period_start)} - {self._format_month_full(reporting_period_end)}")
        run.font.size = Pt(14)
        
        doc.add_page_break()
        
        # Abbreviations - in TABLE format
        self._add_styled_heading(doc, "ABBREVIATIONS", level=1)
        
        abbreviations = [
            ("GHG", "Greenhouse Gas"),
            ("CO₂", "Carbon Dioxide"),
            ("CH₄", "Methane"),
            ("N₂O", "Nitrous Oxide"),
            ("tCO₂e", "Tonnes of Carbon Dioxide Equivalent"),
            ("ISO", "International Organization for Standardization"),
            ("Scope 1", "Direct GHG Emissions"),
            ("Scope 2", "Indirect GHG Emissions from Purchased Energy"),
            ("GWP", "Global Warming Potential"),
            ("NCV", "Net Calorific Value"),
            ("EF", "Emission Factor"),
            ("IPCC", "Intergovernmental Panel on Climate Change"),
        ]
        
        # Create abbreviations table
        abbr_headers = ['Abbreviation', 'Full Form']
        abbr_data = [[abbr, meaning] for abbr, meaning in abbreviations]
        self._create_styled_table(doc, abbr_headers, abbr_data, col_widths=[1.5, 5.0])
        
        # Page break - Chapter 1 starts on new page
        doc.add_page_break()
    
    def _generate_chapter1(self, doc: Document, organization: Dict, facilities: List[Dict]):
        """Chapter 1: GENERAL DESCRIPTION OF THE ORGANIZATION AND INVENTORY OBJECTIVES"""
        self._add_styled_heading(doc, "Chapter 1: GENERAL DESCRIPTION OF THE ORGANIZATION AND INVENTORY OBJECTIVES", level=1)
        
        # 1. Organization's Overview
        self._add_styled_heading(doc, "1. Organization's Overview", level=2)
        
        # Address in structured format
        p = doc.add_paragraph()
        run = p.add_run("1. Address:")
        run.bold = True
        
        # Street Address
        p = doc.add_paragraph()
        p.add_run("   Street Address: ")
        p.add_run(self._get_value_or_na(organization, 'corporate_address'))
        
        # City
        p = doc.add_paragraph()
        p.add_run("   City: ")
        p.add_run(self._get_value_or_na(organization, 'city'))
        
        # Pincode
        p = doc.add_paragraph()
        p.add_run("   Pincode: ")
        p.add_run(self._get_value_or_na(organization, 'pincode'))
        
        # State
        p = doc.add_paragraph()
        p.add_run("   State: ")
        p.add_run(self._get_value_or_na(organization, 'state'))
        
        # Country
        p = doc.add_paragraph()
        p.add_run("   Country: ")
        p.add_run(self._get_value_or_na(organization, 'country'))
        
        self._add_paragraph_with_bold_label(doc, "2. General Description", 
                                           self._get_value_or_na(organization, 'general_description'))
        self._add_paragraph_with_bold_label(doc, "3. Mission of the organization", 
                                           self._get_value_or_na(organization, 'mission'))
        self._add_paragraph_with_bold_label(doc, "4. Vision of the organization", 
                                           self._get_value_or_na(organization, 'vision'))
        self._add_paragraph_with_bold_label(doc, "5. Process Description", 
                                           self._get_value_or_na(organization, 'process_description'))
        self._add_paragraph_with_bold_label(doc, "6. Person Responsible", 
                                           self._get_value_or_na(organization, 'person_responsible'))
        self._add_paragraph_with_bold_label(doc, "7. Purpose of Reporting", 
                                           self._get_value_or_na(organization, 'report_purpose'))
        self._add_paragraph_with_bold_label(doc, "8. Reporting Frequency", 
                                           self._get_value_or_na(organization, 'reporting_frequency', 'Yearly').capitalize())
        self._add_paragraph_with_bold_label(doc, "9. Number of Facilities", str(len(facilities)))
        self._add_paragraph_with_bold_label(doc, "10. Other Information", 
                                           self._get_value_or_na(organization, 'other_information'))
        
        doc.add_paragraph()
        
        # 2. Facilities
        self._add_styled_heading(doc, "2. Facilities", level=2)
        
        for i, facility in enumerate(facilities, 1):
            facility_name = self._get_value_or_na(facility, 'name')
            self._add_styled_heading(doc, f"2.{i} {facility_name}", level=3)
            
            self._add_labeled_field(doc, "a) Sector/Industry", 
                                   self._get_value_or_na(facility, 'sector'))
            
            # Facility address in structured format
            p = doc.add_paragraph()
            p.add_run("b) Address:").bold = True
            
            p = doc.add_paragraph()
            p.add_run("   Street Address: ")
            p.add_run(self._get_value_or_na(facility, 'address'))
            
            p = doc.add_paragraph()
            p.add_run("   City: ")
            p.add_run(self._get_value_or_na(facility, 'city'))
            
            p = doc.add_paragraph()
            p.add_run("   Pincode: ")
            p.add_run(self._get_value_or_na(facility, 'pincode'))
            
            p = doc.add_paragraph()
            p.add_run("   State: ")
            p.add_run(self._get_value_or_na(facility, 'state'))
            
            p = doc.add_paragraph()
            p.add_run("   Country: ")
            p.add_run(self._get_value_or_na(facility, 'country'))
            
            self._add_labeled_field(doc, "c) Products/Services", 
                                   self._get_value_or_na(facility, 'products_services') or 
                                   self._get_value_or_na(facility, 'products_manufactured'))
            
            self._add_labeled_field(doc, "d) Machinery and Equipment", 
                                   self._get_value_or_na(facility, 'machinery_equipment') or 
                                   self._get_value_or_na(facility, 'machinery_used'))
            
            self._add_labeled_field(doc, "e) Process Description", 
                                   self._get_value_or_na(facility, 'process_description'))
            
            self._add_labeled_field(doc, "f) Person Responsible", 
                                   self._get_value_or_na(facility, 'responsible_person'))
            
            self._add_labeled_field(doc, "g) Monitoring Frequency", 
                                   self._get_value_or_na(facility, 'monitoring_frequency', 'Monthly').capitalize())
            
            self._add_labeled_field(doc, "h) Reporting Frequency", 
                                   self._get_value_or_na(facility, 'reporting_frequency', 'Monthly').capitalize())
            
            self._add_labeled_field(doc, "i) Other Information", 
                                   self._get_value_or_na(facility, 'other_information') or 
                                   self._get_value_or_na(facility, 'remarks'))
        
        doc.add_page_break()
    
    def _generate_chapter2(self, doc: Document, organization: Dict):
        """Chapter 2: Organization Boundaries"""
        self._add_styled_heading(doc, "Chapter 2: Organization Boundaries", level=1)
        
        # Introduction text - Removed extra line space before definitions
        p = doc.add_paragraph()
        p.add_run("It is known that there are two types of approaches for selecting organizational boundary. They are:")
        
        # Equity Share Approach - Directly after intro (no extra line space)
        p = doc.add_paragraph()
        run = p.add_run("Equity Share Approach")
        run.bold = True
        p.add_run(" – Under this approach, a company considers and accounts for greenhouse gas emissions from various operations according to its share of equity in those operations.")
        
        # Control Approach
        p = doc.add_paragraph()
        run = p.add_run("Control Approach")
        run.bold = True
        p.add_run(" – Under this approach, a company considers and accounts for 100% of the greenhouse gas emissions from operations over which it has either operational or financial control. It does not report the GHG emissions from those operations in which it has no control.")
        
        doc.add_paragraph()
        
        # Organization's chosen approach
        org_name = self._get_value_or_na(organization, 'name')
        approach = organization.get('org_boundaries_approach', '').lower()
        equity_percentage = organization.get('org_boundaries_equity_percentage')
        additional_notes = organization.get('org_boundaries') or organization.get('org_boundaries_notes', '')
        
        p = doc.add_paragraph()
        run = p.add_run(f"{org_name}")
        run.bold = True
        
        if approach == 'equity_share' and equity_percentage:
            p.add_run(" has chosen the ")
            run2 = p.add_run("Equity Share Approach")
            run2.bold = True
            p.add_run(f". The organization accounts for greenhouse gas emissions in proportion to its equity share of {equity_percentage}%, meaning {equity_percentage}% of total emissions from joint operations are attributed to the organization based on its ownership stake.")
        elif approach == 'control':
            p.add_run(" has chosen the ")
            run2 = p.add_run("Control Approach")
            run2.bold = True
            p.add_run(". The organization accounts for 100% of greenhouse gas emissions from operations over which it exercises operational or financial control. This comprehensive approach ensures full accountability for all emissions within the organization's direct sphere of influence.")
        else:
            p.add_run(" has not specified an organizational boundary approach.")
        
        # Add additional boundary notes on the next line
        if additional_notes and additional_notes != 'Not Available':
            doc.add_paragraph()
            p = doc.add_paragraph()
            run = p.add_run("Additional Boundary Notes: ")
            run.bold = True
            p.add_run(additional_notes)
        
        doc.add_page_break()
    
    def _generate_chapter3(self, doc: Document, facilities: List[Dict], emissions: List[Dict]):
        """Chapter 3: Reporting Boundaries"""
        self._add_styled_heading(doc, "Chapter 3: Reporting Boundaries", level=1)
        
        # Introductory paragraph
        p = doc.add_paragraph()
        p.add_run("After determining the organizational boundary based on its ownership or control over operations the organization identifies the emission sources associated, categorizes the sources as Direct and Indirect GHG emission sources, and hence determines the scope of accounting and reporting.")
        
        doc.add_paragraph()
        
        # Definitions
        p = doc.add_paragraph()
        run = p.add_run("Direct GHG emissions (Scope 1)")
        run.bold = True
        p.add_run(" are emissions from sources that are owned or controlled by the organization.")
        
        doc.add_paragraph()
        
        p = doc.add_paragraph()
        run = p.add_run("Indirect GHG emissions (Scope 2)")
        run.bold = True
        p.add_run(" are emissions that result from the generation of purchased or acquired electricity, heating, cooling, and steam consumed by the organization.")
        
        doc.add_paragraph()
        
        # For each facility
        for i, facility in enumerate(facilities, 1):
            facility_id = facility.get('id')
            facility_name = self._get_value_or_na(facility, 'name')
            facility_emissions = self._get_emissions_by_facility(emissions, facility_id)
            
            self._add_styled_heading(doc, f"3.{i} {facility_name}", level=2)
            
            # 3.x.1 List of Emissions
            self._add_styled_heading(doc, f"3.{i}.1 List of Emissions", level=3)
            
            scope1_processes, scope2_processes = self._get_emission_processes(facility_emissions)
            
            p = doc.add_paragraph()
            run = p.add_run("Direct/Scope 1 Emissions:")
            run.bold = True
            
            if scope1_processes:
                for process in scope1_processes:
                    doc.add_paragraph(f"• {process}")
            else:
                doc.add_paragraph("• Not Available")
            
            doc.add_paragraph()
            
            p = doc.add_paragraph()
            run = p.add_run("Indirect/Scope 2 Emissions:")
            run.bold = True
            
            for process in scope2_processes:
                doc.add_paragraph(f"• {process}")
            
            doc.add_paragraph()
            
            # 3.x.2 Source of Emissions
            self._add_styled_heading(doc, f"3.{i}.2 Source of Emissions", level=3)
            
            scope1_fuels, scope2_fuels = self._get_unique_fuels(facility_emissions)
            
            p = doc.add_paragraph()
            run = p.add_run("Direct/Scope 1 Sources:")
            run.bold = True
            
            if scope1_fuels:
                for fuel in scope1_fuels:
                    doc.add_paragraph(f"• {fuel}")
            else:
                doc.add_paragraph("• Not Available")
            
            doc.add_paragraph()
            
            p = doc.add_paragraph()
            run = p.add_run("Indirect/Scope 2 Sources:")
            run.bold = True
            
            for fuel in scope2_fuels:
                doc.add_paragraph(f"• {fuel}")
        
        doc.add_page_break()
    
    def _generate_chapter4(self, doc: Document, organization: Dict, facilities: List[Dict], 
                          emissions: List[Dict], reporting_period_start: str, reporting_period_end: str,
                          include_previous_years: bool = True):
        """Chapter 4: QUANTIFIED GHG INVENTORY OF EMISSIONS AND REMOVALS"""
        self._add_styled_heading(doc, "Chapter 4: QUANTIFIED GHG INVENTORY OF EMISSIONS AND REMOVALS", level=1)
        
        # 4.1 Methodology
        self._add_styled_heading(doc, "4.1 Methodology", level=2)
        
        p = doc.add_paragraph()
        p.add_run("Methodology followed for calculation of GHG emissions from GHG activity level data:")
        
        doc.add_paragraph()
        
        # Fixed Formulas
        p = doc.add_paragraph()
        run = p.add_run("Scope 1 / Direct Emission Factor (quantity basis):")
        run.bold = True
        
        p = doc.add_paragraph()
        p.add_run("   Calorific Value × Density (if applicable) × Default Emission Factor (energy basis)")
        
        doc.add_paragraph()
        
        p = doc.add_paragraph()
        run = p.add_run("Scope 1, Scope 2 and Biogenic Emissions:")
        run.bold = True
        
        p = doc.add_paragraph()
        p.add_run("   Quantity × Emission Factor (quantity basis)")
        
        doc.add_paragraph()
        
        p = doc.add_paragraph()
        run = p.add_run("Total Emissions Calculation:")
        run.bold = True
        
        p = doc.add_paragraph()
        p.add_run("   tCO₂e = tCO₂ + tCH₄ × GWP(CH₄) + tN₂O × GWP(N₂O)")
        
        doc.add_paragraph()
        
        # Additional methodology notes
        p = doc.add_paragraph()
        p.add_run("Data Sources and Standards:")
        
        methodology_points = [
            "Emission factors from IPCC Guidelines and national standards",
            "Global Warming Potentials (GWP) from IPCC Fifth Assessment Report (AR5)",
            "Activity data collected from facility records and monitoring systems",
            "Calculations performed as per ISO 14064-1:2018 guidelines"
        ]
        
        for point in methodology_points:
            p = doc.add_paragraph(point, style='List Bullet')
        
        doc.add_paragraph()
        
        # Track organization totals
        org_totals = {
            'scope1': 0.0,
            'scope2': 0.0,
            'biogenic': 0.0,
            'by_category': defaultdict(float),
            'by_fuel': defaultdict(float),
            'by_facility': {}
        }
        
        period_display = f"{self._format_month_full(reporting_period_start)} - {self._format_month_full(reporting_period_end)}"
        
        # For each facility
        for i, facility in enumerate(facilities, 1):
            facility_id = facility.get('id')
            facility_name = self._get_value_or_na(facility, 'name')
            facility_emissions = self._get_emissions_by_facility(emissions, facility_id)
            
            # Filter by reporting period
            facility_emissions = self._filter_emissions_by_period(
                facility_emissions, reporting_period_start, reporting_period_end
            )
            
            totals = self._calculate_facility_totals(facility_emissions)
            
            # Update organization totals
            org_totals['scope1'] += totals['scope1']
            org_totals['scope2'] += totals['scope2']
            org_totals['biogenic'] += totals['biogenic']
            org_totals['by_facility'][facility_name] = totals['total']
            
            for cat, val in totals['by_category'].items():
                org_totals['by_category'][cat] += val
            for fuel, val in totals['by_fuel'].items():
                org_totals['by_fuel'][fuel] += val
            
            self._add_styled_heading(doc, f"4.{i+1} Facility - {facility_name}", level=2)
            
            # 4.x.1 List of Emissions
            self._add_styled_heading(doc, f"4.{i+1}.1 List of Emissions", level=3)
            scope1_processes, scope2_processes = self._get_emission_processes(facility_emissions)
            
            p = doc.add_paragraph()
            run = p.add_run("Direct/Scope 1 Emissions:")
            run.bold = True
            
            if scope1_processes:
                for process in scope1_processes:
                    doc.add_paragraph(f"• {process}")
            else:
                doc.add_paragraph("• Not Available")
            
            doc.add_paragraph()
            
            p = doc.add_paragraph()
            run = p.add_run("Indirect/Scope 2 Emissions:")
            run.bold = True
            
            for process in scope2_processes:
                doc.add_paragraph(f"• {process}")
            
            doc.add_paragraph()
            
            # 4.x.2 Source of Emissions
            self._add_styled_heading(doc, f"4.{i+1}.2 Source of Emissions", level=3)
            scope1_fuels, scope2_fuels = self._get_unique_fuels(facility_emissions)
            
            p = doc.add_paragraph()
            run = p.add_run("Direct/Scope 1 Sources:")
            run.bold = True
            
            if scope1_fuels:
                for fuel in scope1_fuels:
                    doc.add_paragraph(f"• {fuel}")
            else:
                doc.add_paragraph("• Not Available")
            
            doc.add_paragraph()
            
            p = doc.add_paragraph()
            run = p.add_run("Indirect/Scope 2 Sources:")
            run.bold = True
            
            for fuel in scope2_fuels:
                doc.add_paragraph(f"• {fuel}")
            
            doc.add_paragraph()
            
            # 4.x.3 Summary of GHG Emissions
            self._add_styled_heading(doc, f"4.{i+1}.3 Summary of GHG Emissions - {period_display}", level=3)
            
            self._add_emissions_summary_table(doc, facility_emissions, totals)
            
            doc.add_paragraph()
            
            # 4.x.4 Emissions of Previous Years
            if include_previous_years:
                prev_year_data = self._get_previous_year_data(emissions, reporting_period_start)
                if prev_year_data:
                    self._add_styled_heading(doc, f"4.{i+1}.4 Emissions of Previous Years", level=3)
                    self._add_previous_years_table(doc, prev_year_data)
                    doc.add_paragraph()
            
            # 4.x.5 Analysis
            self._add_styled_heading(doc, f"4.{i+1}.5 Analysis", level=3)
            self._add_facility_analysis(doc, facility_name, totals)
            
            doc.add_paragraph()
        
        # Organization Emissions Section
        self._add_styled_heading(doc, f"4.{len(facilities)+2} Organization Emissions", level=2)
        self._add_organization_emissions_table(doc, org_totals)
        
        doc.add_paragraph()
        
        # Organization Analysis
        self._add_styled_heading(doc, f"4.{len(facilities)+3} Organization Analysis", level=2)
        self._add_organization_analysis(doc, organization, org_totals, facilities)
        
        doc.add_page_break()
    
    def _add_emissions_summary_table(self, doc: Document, facility_emissions: List[Dict], totals: Dict):
        """Add emissions summary table for a facility"""
        headers = ['Scope', 'Category', 'Fuel', 'Month', 'tCO2e', 'tCO2', 'tCH4', 'tN2O']
        data = []
        
        # Group emissions by month and sort
        emissions_by_month = defaultdict(list)
        for em in facility_emissions:
            period = em.get('reporting_period', '')
            month_key = self._format_month(period.split(' to ')[0] if ' to ' in period else period)
            emissions_by_month[month_key].append(em)
        
        sorted_months = self._sort_months(list(emissions_by_month.keys()))
        
        for month in sorted_months:
            for em in emissions_by_month[month]:
                scope = em.get('scope', '')
                if 'scope1' in scope.lower() or 'scope 1' in scope.lower() or scope == '1':
                    scope_display = 'Scope 1 (Direct)'
                elif 'scope2' in scope.lower() or 'scope 2' in scope.lower() or scope == '2':
                    scope_display = 'Scope 2 (Indirect)'
                else:
                    scope_display = scope
                
                # Use helper methods for correct field mapping
                category = self._get_category_from_emission(em)
                fuel = self._get_fuel_from_emission(em)
                
                data.append([
                    scope_display,
                    category,
                    fuel,
                    month,
                    self._format_number(em.get('total_emissions', 0)),
                    self._format_number(em.get('co2_emissions', 0)),
                    self._format_number(em.get('ch4_emissions', 0)),
                    self._format_number(em.get('n2o_emissions', 0))
                ])
        
        # Create table WITHOUT totals (totals will be added separately)
        self._create_styled_table(doc, headers, data)
        
        # Add totals OUTSIDE the table
        doc.add_paragraph()
        
        p = doc.add_paragraph()
        run = p.add_run("Summary Totals (all values in tCO₂e):")
        run.bold = True
        run.font.size = Pt(11)
        
        totals_text = [
            f"Total Direct Emissions (A): {self._format_number(totals['scope1'])} tCO₂e",
            f"Total Indirect Emissions (B): {self._format_number(totals['scope2'])} tCO₂e",
            f"Total Emissions (A + B): {self._format_number(totals['total'])} tCO₂e",
            f"Total Removals/Sinks (C): {self._format_number(totals['removals'])} tCO₂e",
            f"Total Biogenic: {self._format_number(totals['biogenic'])} tCO₂e",
            f"Total GHG Emissions (A + B - C): {self._format_number(totals['total_ghg'])} tCO₂e"
        ]
        
        for text in totals_text:
            p = doc.add_paragraph()
            p.add_run(text)
    
    def _add_previous_years_table(self, doc: Document, prev_year_data: Dict):
        """Add previous years emissions table"""
        years = sorted(prev_year_data.keys())
        headers = ['Category', 'Fuel'] + years
        data = []
        
        # Collect all categories and fuels
        all_categories = set()
        all_fuels = defaultdict(set)
        for year_data in prev_year_data.values():
            for cat, fuels in year_data.items():
                all_categories.add(cat)
                for fuel in fuels.keys():
                    all_fuels[cat].add(fuel)
        
        for cat in sorted(all_categories):
            for fuel in sorted(all_fuels[cat]):
                row = [cat, fuel]
                for year in years:
                    val = prev_year_data.get(year, {}).get(cat, {}).get(fuel, 0)
                    row.append(self._format_number(val))
                data.append(row)
        
        if data:
            self._create_styled_table(doc, headers, data)
        else:
            doc.add_paragraph("No previous year data available.")
    
    def _add_facility_analysis(self, doc: Document, facility_name: str, totals: Dict):
        """Add analysis text for a facility"""
        total_emissions = totals['total']
        scope1 = totals['scope1']
        scope2 = totals['scope2']
        
        # Total emissions statement
        p = doc.add_paragraph()
        p.add_run(f"Total emissions from {facility_name} amount to ")
        run = p.add_run(f"{self._format_number(total_emissions)} tCO2e")
        run.bold = True
        p.add_run(".")
        
        # Scope contribution
        if total_emissions > 0:
            scope1_pct = (scope1 / total_emissions) * 100
            scope2_pct = (scope2 / total_emissions) * 100
            
            p = doc.add_paragraph()
            p.add_run(f"Scope 1 (Direct) emissions contribute {scope1_pct:.1f}% ({self._format_number(scope1)} tCO2e) of total emissions, while Scope 2 (Indirect) emissions contribute {scope2_pct:.1f}% ({self._format_number(scope2)} tCO2e).")
            
            # Category dominance
            if totals['by_category']:
                top_category = max(totals['by_category'].items(), key=lambda x: x[1])
                cat_pct = (top_category[1] / scope1) * 100 if scope1 > 0 else 0
                p = doc.add_paragraph()
                p.add_run("Among Scope 1 categories, ")
                run = p.add_run(f"{top_category[0]}")
                run.bold = True
                p.add_run(f" is the dominant source, contributing {cat_pct:.1f}% of direct emissions.")
            
            # Fuel dominance
            if totals['by_fuel']:
                top_fuel = max(totals['by_fuel'].items(), key=lambda x: x[1])
                fuel_pct = (top_fuel[1] / scope1) * 100 if scope1 > 0 else 0
                p = doc.add_paragraph()
                p.add_run("In terms of fuel consumption, ")
                run = p.add_run(f"{top_fuel[0]}")
                run.bold = True
                p.add_run(f" is the primary contributor, accounting for {fuel_pct:.1f}% of Scope 1 emissions.")
        
        doc.add_paragraph()
        
        # Chart references
        p = doc.add_paragraph()
        p.add_run("The following figures illustrate the emission distribution:")
        
        # Add charts (reduced size)
        try:
            # Scope comparison chart
            chart_buf = self._create_scope_comparison_chart(scope1, scope2)
            doc.add_paragraph()
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run()
            run.add_picture(chart_buf, width=Inches(4))
            doc.add_paragraph("Figure: Scope 1 vs Scope 2 Emissions Comparison", style='Caption')
            
            # Category chart
            if totals['by_category']:
                chart_buf = self._create_category_chart(dict(totals['by_category']))
                doc.add_paragraph()
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = p.add_run()
                run.add_picture(chart_buf, width=Inches(4))
                doc.add_paragraph("Figure: Category-wise Emission Distribution", style='Caption')
            
            # Fuel chart
            if totals['by_fuel']:
                chart_buf = self._create_fuel_chart(dict(totals['by_fuel']))
                doc.add_paragraph()
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = p.add_run()
                run.add_picture(chart_buf, width=Inches(4))
                doc.add_paragraph("Figure: Fuel-wise Emission Distribution", style='Caption')
            
            # Monthly trend
            if totals['by_month']:
                chart_buf = self._create_monthly_trend_chart(dict(totals['by_month']))
                doc.add_paragraph()
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = p.add_run()
                run.add_picture(chart_buf, width=Inches(4.5))
                doc.add_paragraph("Figure: Monthly Emission Trend", style='Caption')
                
        except Exception as e:
            print(f"Error adding facility charts: {e}")
    
    def _add_organization_emissions_table(self, doc: Document, org_totals: Dict):
        """Add organization-level emissions summary table"""
        headers = ['Category', 'Fuel', 'Total Emissions (tCO₂e)']
        data = []
        
        # Direct/Scope 1 Emissions
        data.append(['Direct/Scope 1 Emissions', '', ''])
        
        for cat in sorted(org_totals['by_category'].keys()):
            fuels_for_cat = []
            for fuel, val in org_totals['by_fuel'].items():
                fuels_for_cat.append(fuel)
            fuels_str = ", ".join(self._deduplicate_list(fuels_for_cat))
            data.append([cat, fuels_str, self._format_number(org_totals['by_category'][cat])])
        
        # Indirect/Scope 2 Emissions
        data.append(['Indirect/Scope 2 Emissions', '', ''])
        data.append(['Importing electricity from grid', 'Electricity', self._format_number(org_totals['scope2'])])
        
        # Create table WITHOUT totals
        self._create_styled_table(doc, headers, data)
        
        # Add totals OUTSIDE the table
        doc.add_paragraph()
        
        p = doc.add_paragraph()
        run = p.add_run("Organization Summary Totals (all values in tCO₂e):")
        run.bold = True
        run.font.size = Pt(11)
        
        totals_text = [
            f"Total Direct Emissions (A): {self._format_number(org_totals['scope1'])} tCO₂e",
            f"Total Indirect Emissions (B): {self._format_number(org_totals['scope2'])} tCO₂e",
            f"Total Emissions (A + B): {self._format_number(org_totals['scope1'] + org_totals['scope2'])} tCO₂e"
        ]
        
        for text in totals_text:
            p = doc.add_paragraph()
            p.add_run(text)
    
    def _add_organization_analysis(self, doc: Document, organization: Dict, org_totals: Dict, facilities: List[Dict]):
        """Add organization-level analysis"""
        org_name = self._get_value_or_na(organization, 'name')
        total = org_totals['scope1'] + org_totals['scope2']
        
        p = doc.add_paragraph()
        p.add_run("The total GHG emissions for ")
        run = p.add_run(f"{org_name}")
        run.bold = True
        p.add_run(" amount to ")
        run = p.add_run(f"{self._format_number(total)} tCO2e")
        run.bold = True
        p.add_run(f" across {len(facilities)} selected facilities.")
        
        # Scope distribution
        if total > 0:
            scope1_pct = (org_totals['scope1'] / total) * 100
            scope2_pct = (org_totals['scope2'] / total) * 100
            
            p = doc.add_paragraph()
            p.add_run(f"At the organizational level, Scope 1 emissions account for {scope1_pct:.1f}% of total emissions, while Scope 2 emissions account for {scope2_pct:.1f}%.")
        
        # Facility-wise comparison
        if org_totals['by_facility']:
            p = doc.add_paragraph()
            p.add_run("Facility-wise emission contribution:")
            
            for fac_name, fac_total in sorted(org_totals['by_facility'].items(), key=lambda x: -x[1]):
                fac_pct = (fac_total / total) * 100 if total > 0 else 0
                p = doc.add_paragraph()
                p.add_run(f"• {fac_name}: {self._format_number(fac_total)} tCO2e ({fac_pct:.1f}%)")
        
        # Mathematical validation
        p = doc.add_paragraph()
        p.add_run("\n")
        run = p.add_run("Mathematical Validation:")
        run.bold = True
        
        p = doc.add_paragraph()
        facility_sum = sum(org_totals['by_facility'].values())
        p.add_run(f"Sum of facility totals: {self._format_number(facility_sum)} tCO2e")
        
        p = doc.add_paragraph()
        p.add_run(f"Organization total (A+B): {self._format_number(total)} tCO2e")
        
        # Percentage validation
        if total > 0:
            pct_sum = sum((v/total)*100 for v in org_totals['by_facility'].values())
            p = doc.add_paragraph()
            p.add_run(f"Sum of facility percentages: {pct_sum:.1f}%")
        
        # Facility comparison chart
        try:
            if org_totals['by_facility']:
                chart_buf = self._create_facility_comparison_chart(org_totals['by_facility'])
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = p.add_run()
                run.add_picture(chart_buf, width=Inches(4.5))
                doc.add_paragraph("Figure: Facility-wise Emission Comparison", style='Caption')
        except Exception as e:
            print(f"Error adding organization chart: {e}")
    
    def _generate_chapter5(self, doc: Document, organization: Dict):
        """Chapter 5: GHG REDUCTION INITIATIVE AND INTERNAL PERFORMANCE TRACKING"""
        self._add_styled_heading(doc, "Chapter 5: GHG REDUCTION INITIATIVE AND INTERNAL PERFORMANCE TRACKING", level=1)
        
        # GHG Reduction Initiatives
        self._add_styled_heading(doc, "5.1 GHG Reduction Initiatives", level=2)
        
        initiatives = self._get_value_or_na(organization, 'ghg_reduction_initiatives')
        if initiatives and initiatives != 'Not Available':
            doc.add_paragraph(initiatives)
        else:
            doc.add_paragraph("The organization has not documented specific GHG reduction initiatives at this time.")
        
        # Internal Performance Tracking
        self._add_styled_heading(doc, "5.2 Internal Performance Tracking", level=2)
        
        tracking = self._get_value_or_na(organization, 'internal_performance_tracking')
        if tracking and tracking != 'Not Available':
            doc.add_paragraph(tracking)
        else:
            doc.add_paragraph("Internal performance tracking mechanisms are being developed to monitor and improve GHG performance over time.")
        
        doc.add_page_break()
    
    def _generate_chapter6(self, doc: Document, organization: Dict):
        """Chapter 6: Conclusion"""
        self._add_styled_heading(doc, "Chapter 6: Conclusion", level=1)
        
        org_name = self._get_value_or_na(organization, 'name')
        
        p = doc.add_paragraph()
        p.add_run("This GHG Inventory Report presents a comprehensive assessment of the greenhouse gas emissions for ")
        run = p.add_run(f"{org_name}")
        run.bold = True
        p.add_run(". The inventory has been prepared in accordance with the principles and requirements of ")
        run = p.add_run("ISO 14064-1:2018")
        run.bold = True
        p.add_run(", ensuring consistency, completeness, accuracy, and transparency in the reporting of GHG emissions.")
        
        doc.add_paragraph()
        
        p = doc.add_paragraph()
        p.add_run("The organization is committed to:")
        
        commitments = [
            "Continuously monitoring and reporting GHG emissions in accordance with international standards",
            "Implementing measures to reduce emissions across all operational facilities",
            "Improving data collection and verification processes",
            "Setting science-based targets for emission reduction",
            "Engaging stakeholders in climate action initiatives"
        ]
        
        for commitment in commitments:
            doc.add_paragraph(commitment, style='List Bullet')
        
        doc.add_paragraph()
        
        p = doc.add_paragraph()
        p.add_run("This report serves as a foundation for informed decision-making regarding climate action and sustainability strategies. The organization remains dedicated to environmental stewardship and will continue to enhance its GHG management practices in alignment with global climate goals.")
    
    # ==================== MAIN GENERATION METHOD ====================
    
    def generate_report(self, organization: Dict, facilities: List[Dict], emissions: List[Dict],
                       reporting_period_start: str, reporting_period_end: str,
                       description_of_change: str = None, include_previous_years: bool = True) -> io.BytesIO:
        """Generate the complete GHG Inventory Report"""
        
        # Create new document
        doc = Document()
        
        # Generate all chapters
        self._generate_cover_page(doc, organization, reporting_period_start, reporting_period_end)
        self._generate_chapter1(doc, organization, facilities)
        self._generate_chapter2(doc, organization)
        self._generate_chapter3(doc, facilities, emissions)
        self._generate_chapter4(doc, organization, facilities, emissions, 
                               reporting_period_start, reporting_period_end, include_previous_years)
        self._generate_chapter5(doc, organization)
        self._generate_chapter6(doc, organization)
        
        # Add footer to all sections
        self._add_footer(doc)
        
        # Save to buffer
        buffer = io.BytesIO()
        doc.save(buffer)
        buffer.seek(0)
        
        return buffer
