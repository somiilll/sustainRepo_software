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
                return 'NA'
            if ' to ' in period_str:
                parts = period_str.split(' to ')
                return f"{self._format_month(parts[0])} to {self._format_month(parts[1])}"
            dt = datetime.strptime(period_str.strip(), "%Y-%m")
            return dt.strftime("%b-%Y")
        except (ValueError, TypeError):
            return period_str or 'NA'
    
    def _format_month_full(self, period_str: str) -> str:
        """Format month string from YYYY-MM to full format (e.g., January 2025)"""
        try:
            if not period_str:
                return 'NA'
            dt = datetime.strptime(period_str.strip(), "%Y-%m")
            return dt.strftime("%B %Y")
        except (ValueError, TypeError):
            return period_str or 'NA'
    
    def _format_number(self, value, decimals=2) -> str:
        """Format number to specified decimal places"""
        try:
            if value is None:
                return '0.00'
            num = float(value)
            return f"{num:,.{decimals}f}"
        except (ValueError, TypeError):
            return '0.00'
    
    def _get_value_or_na(self, obj: Dict, key: str, default='NA') -> str:
        """Get value from dict or return NA if empty/None"""
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
            if item is None:
                continue
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
        """Add footer with date to all sections"""
        for section in doc.sections:
            footer = section.footer
            footer.is_linked_to_previous = False
            
            # Add footer paragraph
            p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
            p.clear()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            
            # Date of Report only
            run1 = p.add_run(f"Date of Report: {self.report_date}")
            run1.font.size = Pt(8)
            run1.font.italic = True
    
    def _add_styled_heading(self, doc: Document, text: str, level: int = 1):
        """Add a styled heading - Chapter headings are centered, uppercase, and size 16"""
        if not text:
            text = "Untitled"
        # Check if this is a chapter heading
        is_chapter = text.lower().startswith('chapter')
        
        if is_chapter and level == 1:
            # Chapter headings: centered, uppercase, size 16
            heading = doc.add_heading(text.upper(), level=level)
            heading.alignment = WD_ALIGN_PARAGRAPH.CENTER
            # Set font size to 16pt for chapter headings
            for run in heading.runs:
                run.font.size = Pt(16)
        else:
            # Regular headings
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
        value_text = value if value and value != 'NA' else 'NA'
        doc.add_paragraph(value_text)
        return p
    
    def _add_labeled_field(self, doc: Document, label: str, value: str):
        """Add a labeled field with label on one line and value on next line"""
        p = doc.add_paragraph()
        run = p.add_run(f"{label}:")
        run.bold = True
        
        value_text = value if value and value != 'NA' else 'NA'
        doc.add_paragraph(value_text)
        return p
    
    def _create_styled_table(self, doc: Document, headers: List[str], data: List[List[str]], 
                            col_widths: List[float] = None, bold_rows: List[int] = None) -> Any:
        """Create a styled table with headers and data
        
        Args:
            bold_rows: List of row indices (0-based, not counting header) that should be bold
        """
        num_cols = len(headers)
        table = doc.add_table(rows=1, cols=num_cols)
        table.style = 'Table Grid'
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        
        bold_rows = bold_rows or []
        
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
        for row_idx, row_data in enumerate(data):
            row_cells = table.add_row().cells
            is_bold_row = row_idx in bold_rows
            for i, cell_data in enumerate(row_data):
                row_cells[i].text = str(cell_data) if cell_data is not None else ''
                for paragraph in row_cells[i].paragraphs:
                    for run in paragraph.runs:
                        run.font.size = Pt(9)
                        if is_bold_row:
                            run.font.bold = True
        
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
            period = em.get('reporting_period') or ''
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
    
    def _calculate_facility_totals(self, facility_emissions: List[Dict], facility_id: str = None) -> Dict:
        """Calculate totals for a facility, including sinks deduction"""
        totals = {
            'scope1': 0.0,
            'scope2': 0.0,
            'biogenic': 0.0,
            'removals': 0.0,
            'by_month': defaultdict(lambda: {'scope1': 0.0, 'scope2': 0.0}),
            'by_category': defaultdict(float),
            'by_fuel': defaultdict(float),
            'by_category_fuel': defaultdict(lambda: defaultdict(float)),  # {category: {fuel: emissions}}
            'by_scope_category_fuel': defaultdict(lambda: defaultdict(lambda: defaultdict(float))),  # {scope: {category: {fuel: emissions}}}
            'scope1_co2': 0.0,
            'scope1_ch4': 0.0,
            'scope1_n2o': 0.0,
            'scope2_co2': 0.0,
            'scope2_ch4': 0.0,
            'scope2_n2o': 0.0,
        }
        
        for em in facility_emissions:
            scope = (em.get('scope') or '').lower()
            tco2e = float(em.get('total_emissions', 0) or 0)
            category = self._get_category_from_emission(em)
            fuel = self._get_fuel_from_emission(em)
            period = em.get('reporting_period') or ''
            
            # Track by_category and by_fuel for ALL scopes
            totals['by_category'][category] += tco2e
            totals['by_fuel'][fuel] += tco2e
            totals['by_category_fuel'][category][fuel] += tco2e
            
            # Determine scope label for by_scope_category_fuel
            if 'scope 1' in scope or 'scope1' in scope or scope == '1':
                totals['by_scope_category_fuel']['scope1'][category][fuel] += tco2e
                totals['scope1'] += tco2e
                # Individual gas components from actual data
                totals['scope1_co2'] += float(em.get('co2_emissions', 0) or 0)
                totals['scope1_ch4'] += float(em.get('ch4_emissions', 0) or 0)
                totals['scope1_n2o'] += float(em.get('n2o_emissions', 0) or 0)
            elif 'scope 2' in scope or 'scope2' in scope or scope == '2':
                totals['scope2'] += tco2e
                totals['by_scope_category_fuel']['scope2'][category][fuel] += tco2e
                # Individual gas components from actual data (not hardcoded to CO2)
                totals['scope2_co2'] += float(em.get('co2_emissions', 0) or 0)
                totals['scope2_ch4'] += float(em.get('ch4_emissions', 0) or 0)
                totals['scope2_n2o'] += float(em.get('n2o_emissions', 0) or 0)
            elif 'biogenic' in scope:
                totals['biogenic'] += tco2e
                totals['by_scope_category_fuel']['biogenic'][category][fuel] += tco2e
            
            # Track by month
            if period:
                month_key = self._format_month(period.split(' to ')[0] if ' to ' in period else period)
                if 'scope 1' in scope or 'scope1' in scope or scope == '1':
                    totals['by_month'][month_key]['scope1'] += tco2e
                elif 'scope 2' in scope or 'scope2' in scope or scope == '2':
                    totals['by_month'][month_key]['scope2'] += tco2e
        
        # Calculate sinks/removals for this facility
        if hasattr(self, 'sinks_data') and self.sinks_data and facility_id:
            facility_sinks = [s for s in self.sinks_data if s.get('facility_id') == facility_id]
            totals['removals'] = sum(s.get('total_emissions_reduced', 0) for s in facility_sinks)
        elif hasattr(self, 'sinks_total'):
            # If no facility_id provided, use total sinks distributed
            totals['removals'] = getattr(self, 'sinks_total', 0)
        
        totals['total'] = totals['scope1'] + totals['scope2']
        totals['total_ghg'] = totals['total'] - totals['removals']
        
        return totals
    
    def _get_emission_processes(self, facility_emissions: List[Dict]) -> Tuple[List[str], List[str]]:
        """Get unique emission processes for Scope 1 and Scope 2"""
        scope1_processes = []
        scope2_processes = []
        
        for em in facility_emissions:
            scope = (em.get('scope') or '').lower()
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
        
        # Show "NA" if no processes found for a scope
        if not scope2_processes:
            scope2_processes = ["NA"]
        
        return scope1_processes, scope2_processes
    
    def _get_unique_fuels(self, facility_emissions: List[Dict]) -> Tuple[List[str], List[str]]:
        """Get unique fuel names for Scope 1 and Scope 2"""
        scope1_fuels = []
        scope2_fuels = []
        
        for em in facility_emissions:
            scope = (em.get('scope') or '').lower()
            fuel = self._get_fuel_from_emission(em)
            
            if fuel and fuel != 'Unknown':
                if 'scope1' in scope or 'scope 1' in scope or scope == '1':
                    scope1_fuels.append(fuel)
                elif 'scope2' in scope or 'scope 2' in scope or scope == '2':
                    scope2_fuels.append(fuel)
        
        scope1_fuels = self._deduplicate_list(scope1_fuels, case_insensitive=True)
        scope2_fuels = self._deduplicate_list(scope2_fuels, case_insensitive=True)
        
        if not scope2_fuels:
            scope2_fuels = ["NA"]
        
        return scope1_fuels, scope2_fuels
    
    def _get_previous_year_data(self, emissions: List[Dict], current_start: str) -> Dict:
        """Get previous period emissions data (any emissions before the current reporting period start)"""
        try:
            prev_periods = {}
            
            for em in emissions:
                period = em.get('reporting_period') or ''
                if not period:
                    continue
                
                # Handle period formats: "2025-01", "2025-01 to 2025-03", etc.
                # Extract the start of the emission's period
                em_period_start = period.split(' to ')[0].strip() if ' to ' in period else period.strip()
                
                # Compare the full period string (YYYY-MM format compares correctly as strings)
                # Only include emissions that are BEFORE the current reporting period start
                if em_period_start < current_start:
                    # Group by fiscal year for display
                    em_year = int(em_period_start.split('-')[0])
                    fy_key = f"FY {em_year}"
                    
                    if fy_key not in prev_periods:
                        prev_periods[fy_key] = defaultdict(lambda: defaultdict(float))
                    
                    category = self._get_category_from_emission(em)
                    fuel = self._get_fuel_from_emission(em)
                    tco2e = float(em.get('total_emissions', 0) or em.get('co2e_emissions', 0) or 0)
                    
                    prev_periods[fy_key][category][fuel] += tco2e
            
            return prev_periods
        except Exception as e:
            print(f"Error getting previous period data: {e}")
            return {}
    
    # ==================== CHART GENERATION ====================
    
    def _create_scope_comparison_chart(self, scope1: float, scope2: float) -> io.BytesIO:
        """Create Scope 1 vs Scope 2 comparison chart"""
        fig, ax = plt.subplots(figsize=(6, 4.5))
        
        labels = ['Scope 1\n(Direct)', 'Scope 2\n(Indirect)']
        values = [scope1, scope2]
        colors = ['#3498db', '#e74c3c']
        
        bars = ax.bar(labels, values, color=colors, edgecolor='black', linewidth=1.2)
        
        # Calculate proper offset for text labels to avoid overlap
        max_val = max(values) if max(values) > 0 else 1
        text_offset = max_val * 0.05
        
        for bar, val in zip(bars, values):
            ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + text_offset,
                    f'{val:,.2f}', ha='center', va='bottom', fontsize=9, fontweight='bold')
        
        ax.set_ylabel('tCO2e', fontsize=10)
        ax.set_title('Scope 1 vs Scope 2 Emissions Comparison', fontsize=11, fontweight='bold')
        ax.grid(axis='y', alpha=0.3)
        
        # Add extra space at the top to prevent text overlap with chart border
        y_max = max_val + text_offset + (max_val * 0.15)
        ax.set_ylim(0, y_max)
        
        plt.tight_layout(pad=1.5)
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=120, bbox_inches='tight')
        buf.seek(0)
        plt.close(fig)
        return buf
    
    def _create_category_chart(self, categories: Dict[str, float]) -> io.BytesIO:
        """Create category-wise emission distribution chart"""
        fig, ax = plt.subplots(figsize=(8, 5))
        
        if not categories:
            categories = {'No Data': 0}
        
        labels = list(categories.keys())
        values = list(categories.values())
        colors = plt.cm.Set3(np.linspace(0, 1, len(labels)))
        
        # Use shorter labels if they're too long
        short_labels = [l[:20] + '...' if len(l) > 20 else l for l in labels]
        
        wedges, texts, autotexts = ax.pie(values, labels=short_labels, autopct='%1.1f%%',
                                           colors=colors, startangle=90,
                                           pctdistance=0.75, labeldistance=1.15)
        
        # Adjust text properties to prevent overlap
        for text in texts:
            text.set_fontsize(8)
        for autotext in autotexts:
            autotext.set_fontsize(7)
            autotext.set_fontweight('bold')
        
        ax.set_title('Category-wise Emission Distribution', fontsize=11, fontweight='bold', pad=15)
        plt.tight_layout(pad=2)
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=120, bbox_inches='tight')
        buf.seek(0)
        plt.close(fig)
        return buf
    
    def _create_fuel_chart(self, fuels: Dict[str, float]) -> io.BytesIO:
        """Create fuel-wise emission distribution chart"""
        fig, ax = plt.subplots(figsize=(8, 5))
        
        if not fuels:
            fuels = {'No Data': 0}
        
        labels = list(fuels.keys())
        values = list(fuels.values())
        colors = plt.cm.Pastel1(np.linspace(0, 1, len(labels)))
        
        # Use shorter labels if they're too long
        short_labels = [l[:20] + '...' if len(l) > 20 else l for l in labels]
        
        wedges, texts, autotexts = ax.pie(values, labels=short_labels, autopct='%1.1f%%',
                                           colors=colors, startangle=90,
                                           pctdistance=0.75, labeldistance=1.15)
        
        # Adjust text properties to prevent overlap
        for text in texts:
            text.set_fontsize(8)
        for autotext in autotexts:
            autotext.set_fontsize(7)
            autotext.set_fontweight('bold')
        
        ax.set_title('Fuel-wise Emission Distribution', fontsize=11, fontweight='bold', pad=15)
        plt.tight_layout(pad=2)
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=120, bbox_inches='tight')
        buf.seek(0)
        plt.close(fig)
        return buf
    
    def _create_monthly_trend_chart(self, monthly_data: Dict) -> io.BytesIO:
        """Create monthly emission trend chart"""
        fig, ax = plt.subplots(figsize=(10, 5))
        
        if not monthly_data:
            monthly_data = {'No Data': {'scope1': 0, 'scope2': 0}}
        
        months = self._sort_months(list(monthly_data.keys()))
        scope1_vals = [monthly_data[m]['scope1'] for m in months]
        scope2_vals = [monthly_data[m]['scope2'] for m in months]
        
        x = np.arange(len(months))
        width = 0.35
        
        bars1 = ax.bar(x - width/2, scope1_vals, width, label='Scope 1', color='#3498db')
        bars2 = ax.bar(x + width/2, scope2_vals, width, label='Scope 2', color='#e74c3c')
        
        ax.set_xlabel('Month', fontsize=10)
        ax.set_ylabel('tCO2e', fontsize=10)
        ax.set_title('Monthly Emission Trend', fontsize=11, fontweight='bold', pad=10)
        ax.set_xticks(x)
        ax.set_xticklabels(months, rotation=45, ha='right', fontsize=8)
        ax.legend(fontsize=8, loc='upper right')
        ax.grid(axis='y', alpha=0.3)
        
        # Add margin at top for text if needed
        max_val = max(max(scope1_vals) if scope1_vals else 0, max(scope2_vals) if scope2_vals else 0)
        if max_val > 0:
            ax.set_ylim(0, max_val * 1.15)
        
        plt.tight_layout(pad=1.5)
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=120, bbox_inches='tight')
        buf.seek(0)
        plt.close(fig)
        return buf
    
    def _create_facility_comparison_chart(self, facility_totals: Dict[str, float]) -> io.BytesIO:
        """Create facility comparison chart"""
        fig, ax = plt.subplots(figsize=(9, 5))
        
        if not facility_totals:
            facility_totals = {'No Data': 0}
        
        labels = list(facility_totals.keys())
        values = list(facility_totals.values())
        colors = plt.cm.tab10(np.linspace(0, 1, len(labels)))
        
        # Truncate long facility names
        short_labels = [l[:15] + '...' if len(l) > 15 else l for l in labels]
        
        bars = ax.bar(short_labels, values, color=colors, edgecolor='black')
        
        max_val = max(values) if values and max(values) > 0 else 1
        for bar, val in zip(bars, values):
            ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + max_val*0.02,
                    f'{val:,.2f}', ha='center', va='bottom', fontsize=8, fontweight='bold')
        
        ax.set_ylabel('tCO2e', fontsize=10)
        ax.set_title('Facility-wise Emission Comparison', fontsize=11, fontweight='bold', pad=10)
        ax.set_xticklabels(short_labels, rotation=45, ha='right', fontsize=8)
        ax.grid(axis='y', alpha=0.3)
        
        # Add margin at top for text labels
        ax.set_ylim(0, max_val * 1.15)
        
        plt.tight_layout(pad=1.5)
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=120, bbox_inches='tight')
        buf.seek(0)
        plt.close(fig)
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
        
        # Disclaimer - Above Abbreviations
        self._add_styled_heading(doc, "DISCLAIMER", level=1)
        
        org_name = organization.get('name') or 'the Company'
        disclaimer_text = f"This report is generated through SustainRepo platform. The data presented in this report has been provided by {org_name} through the SustainRepo platform. While the information has been compiled as submitted, SustainRepo does not independently verify the accuracy or completeness of the data provided. Accordingly, SustainRepo shall not be held responsible for any inaccuracies, misstatements, or omissions in the information, nor for any resulting consequences, including reputational or financial loss arising from reliance on this report."
        
        p = doc.add_paragraph()
        p.add_run(disclaimer_text)
        p.paragraph_format.space_after = Pt(12)
        
        doc.add_paragraph()
        
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
        
        # 1. Organization
        self._add_styled_heading(doc, "1. Organization", level=2)
        
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
        
        # Add a simple statement about which approach was chosen
        approach = (organization.get('org_boundaries_approach') or '').lower()
        if approach == 'equity_share':
            doc.add_paragraph()
            p = doc.add_paragraph()
            run = p.add_run(f"{self._get_value_or_na(organization, 'name')} has adopted the Equity Share Approach for this GHG inventory.")
            run.bold = True
        elif approach in ['control', 'control_operational', 'control_financial']:
            doc.add_paragraph()
            p = doc.add_paragraph()
            approach_name = "Operational Control" if approach == 'control_operational' else ("Financial Control" if approach == 'control_financial' else "Control")
            run = p.add_run(f"{self._get_value_or_na(organization, 'name')} has adopted the {approach_name} Approach for this GHG inventory.")
            run.bold = True
        
        doc.add_paragraph()
        
        # Organization's detailed boundary approach explanation (only if approach is specified with equity percentage)
        org_name = self._get_value_or_na(organization, 'name')
        equity_percentage = organization.get('org_boundaries_equity_percentage')
        additional_notes = organization.get('org_boundaries') or organization.get('org_boundaries_notes', '')
        
        # Only add detailed explanation if equity share with specific percentage
        if approach == 'equity_share' and equity_percentage:
            p = doc.add_paragraph()
            run = p.add_run(f"{org_name}")
            run.bold = True
            p.add_run(" has chosen the ")
            run2 = p.add_run("Equity Share Approach")
            run2.bold = True
            p.add_run(f". The organization accounts for greenhouse gas emissions in proportion to its equity share of {equity_percentage}%, meaning {equity_percentage}% of total emissions from joint operations are attributed to the organization based on its ownership stake.")
        
        # Add additional boundary notes on the next line
        if additional_notes and additional_notes != 'NA':
            doc.add_paragraph()
            p = doc.add_paragraph()
            run = p.add_run("Additional Boundary Notes:")
            run.bold = True
            # Value on the next line
            doc.add_paragraph(additional_notes)
        
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
            
            # Check if facility has emissions
            if not facility_emissions:
                p = doc.add_paragraph()
                run = p.add_run("No emission reported for this facility.")
                run.italic = True
                doc.add_paragraph()
                continue
            
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
                doc.add_paragraph("• No emission reported")
            
            doc.add_paragraph()
            
            p = doc.add_paragraph()
            run = p.add_run("Indirect/Scope 2 Emissions:")
            run.bold = True
            
            if scope2_processes and scope2_processes != ["NA"]:
                for process in scope2_processes:
                    doc.add_paragraph(f"• {process}")
            else:
                doc.add_paragraph("• No emission reported")
            
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
                doc.add_paragraph("• No emission reported")
            
            doc.add_paragraph()
            
            p = doc.add_paragraph()
            run = p.add_run("Indirect/Scope 2 Sources:")
            run.bold = True
            
            if scope2_fuels and scope2_fuels != ["NA"]:
                for fuel in scope2_fuels:
                    doc.add_paragraph(f"• {fuel}")
            else:
                doc.add_paragraph("• No emission reported")
        
        doc.add_page_break()
    
    def _generate_chapter4(self, doc: Document, organization: Dict, facilities: List[Dict], 
                          emissions: List[Dict], reporting_period_start: str, reporting_period_end: str,
                          include_previous_years: bool = True):
        """Chapter 4: QUANTIFIED GHG INVENTORY OF EMISSIONS AND REMOVALS"""
        self._add_styled_heading(doc, "Chapter 4: QUANTIFIED GHG INVENTORY OF EMISSIONS AND REMOVALS", level=1)
        
        # Check if organization uses equity share approach
        use_equity_share = organization.get('org_boundaries_approach') == 'equity_share'
        
        # Build facility equity share map
        facility_equity_map = {}
        for f in facilities:
            equity_pct = f.get('equity_share_percentage', 100.0) or 100.0
            facility_equity_map[f.get('id')] = equity_pct
        
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
        
        # 4.2 Uncertainty Assessment
        self._add_styled_heading(doc, "4.2 Uncertainty Assessment", level=2)
        
        p = doc.add_paragraph()
        p.add_run("GHG inventory data are associated with varying degrees of uncertainty, and such actual uncertainties have both technical and policy implications. For Addressing Uncertainty, \"to ensure that a company's strategies and forward-looking actions are based on the most robust data set and most appropriate computational methods, it is important that this data set and method be based on four key factors (\"The Four C's\"). These are Comparability, Consistency, Certainty, and Confidence. Uncertainties in inventories are the result of three categories:")
        
        uncertainty_categories = [
            "Spurious errors, which may be due to incomplete, unclear, or faulty definitions of emission sources that result from human error or machine malfunction.",
            "Systematic errors, which may be due to the methods (or models) used to quantify emissions for the process under consideration; and",
            "Random errors, which may be due to natural variability of the process that produces the emissions."
        ]
        
        for category in uncertainty_categories:
            p = doc.add_paragraph(category, style='List Bullet')
        
        doc.add_paragraph()
        
        p = doc.add_paragraph()
        p.add_run("Uncertainty in quantification of GHG emissions can be on account of uncertainty in available activity data and input parameters used in calculation of emissions. Normally, it is beyond the scope of a company to address the uncertainties in equations that are used for calculating emissions.")
        
        doc.add_paragraph()
        
        p = doc.add_paragraph()
        p.add_run("A bottom-up approach has been used for compiling emission inventory. The emissions from individual sources are quantified initially. Emissions from all the sources have been added to obtain emission inventory for the entire operations. Following quality control steps have been adhered to in preparation of inventory to minimize uncertainty:")
        
        doc.add_paragraph()
        
        # Display Uncertainty Assessment selections from Organization Details
        uncertainty_selections = organization.get('uncertainty_assessment', [])
        if uncertainty_selections and len(uncertainty_selections) > 0:
            for selection in uncertainty_selections:
                p = doc.add_paragraph(selection, style='List Bullet')
        else:
            p = doc.add_paragraph()
            p.add_run("NA")
        
        doc.add_paragraph()
        
        # Track organization totals
        org_totals = {
            'scope1': 0.0,
            'scope2': 0.0,
            'biogenic': 0.0,
            'removals': 0.0,
            'by_category': defaultdict(float),
            'by_fuel': defaultdict(float),
            'by_category_fuel': defaultdict(lambda: defaultdict(float)),
            'by_scope_category_fuel': defaultdict(lambda: defaultdict(lambda: defaultdict(float))),
            'by_facility': {},
            'by_facility_sinks': {}
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
            
            # Calculate raw totals (before equity adjustment)
            raw_totals = self._calculate_facility_totals(facility_emissions, facility_id)
            
            # Get equity share percentage for this facility
            equity_pct = facility_equity_map.get(facility_id, 100.0)
            equity_factor = equity_pct / 100.0
            
            # Apply equity share adjustment if applicable
            if use_equity_share and equity_factor < 1.0:
                totals = {
                    'scope1': raw_totals['scope1'] * equity_factor,
                    'scope2': raw_totals['scope2'] * equity_factor,
                    'biogenic': raw_totals['biogenic'] * equity_factor,
                    'removals': raw_totals['removals'] * equity_factor,
                    'total': raw_totals['total'] * equity_factor,
                    'total_ghg': raw_totals['total_ghg'] * equity_factor,
                    'by_month': raw_totals['by_month'],
                    'by_category': {k: v * equity_factor for k, v in raw_totals['by_category'].items()},
                    'by_fuel': {k: v * equity_factor for k, v in raw_totals['by_fuel'].items()},
                    'by_category_fuel': raw_totals['by_category_fuel'],
                    'by_scope_category_fuel': raw_totals['by_scope_category_fuel'],
                    'scope1_co2': raw_totals.get('scope1_co2', 0) * equity_factor,
                    'scope1_ch4': raw_totals.get('scope1_ch4', 0) * equity_factor,
                    'scope1_n2o': raw_totals.get('scope1_n2o', 0) * equity_factor,
                    'scope2_co2': raw_totals.get('scope2_co2', 0) * equity_factor,
                    'scope2_ch4': raw_totals.get('scope2_ch4', 0) * equity_factor,
                    'scope2_n2o': raw_totals.get('scope2_n2o', 0) * equity_factor,
                }
            else:
                totals = raw_totals
            
            # Update organization totals (with equity-adjusted values)
            org_totals['scope1'] += totals['scope1']
            org_totals['scope2'] += totals['scope2']
            org_totals['biogenic'] += totals['biogenic']
            org_totals['removals'] += totals['removals']
            org_totals['by_facility'][facility_name] = totals['total']
            org_totals['by_facility_sinks'][facility_name] = totals['removals']
            
            for cat, val in totals['by_category'].items():
                org_totals['by_category'][cat] += val
            for fuel, val in totals['by_fuel'].items():
                org_totals['by_fuel'][fuel] += val
            for cat, fuels in raw_totals['by_category_fuel'].items():
                for fuel, val in fuels.items():
                    adjusted_val = val * equity_factor if use_equity_share else val
                    org_totals['by_category_fuel'][cat][fuel] += adjusted_val
            for scope, cats in raw_totals['by_scope_category_fuel'].items():
                for cat, fuels in cats.items():
                    for fuel, val in fuels.items():
                        adjusted_val = val * equity_factor if use_equity_share else val
                        org_totals['by_scope_category_fuel'][scope][cat][fuel] += adjusted_val
            
            self._add_styled_heading(doc, f"4.{i+2} Facility - {facility_name}", level=2)
            
            # Check if facility has any emissions in the reporting period
            has_emissions = len(facility_emissions) > 0
            
            # Get ALL emissions for THIS FACILITY for historical data (before checking has_emissions)
            all_facility_emissions = self._get_emissions_by_facility(emissions, facility_id)
            
            # Check if facility has sinks in the reporting period
            facility_sinks = [s for s in (self.sinks_data or []) if s.get('facility_id') == facility_id]
            has_sinks = len(facility_sinks) > 0
            raw_facility_sink_total = sum(s.get('total_emissions_reduced', 0) for s in facility_sinks)
            # Apply equity share to sinks
            facility_sink_total = raw_facility_sink_total * equity_factor if use_equity_share else raw_facility_sink_total
            
            if not has_emissions:
                # No emissions reported for this facility in the current period
                p = doc.add_paragraph()
                if has_sinks:
                    if use_equity_share and equity_pct < 100:
                        run = p.add_run(f"No emission reported for this facility in the selected reporting period. However, carbon sinks/removals totaling {self._format_number(facility_sink_total)} tCO₂e (equity-adjusted at {equity_pct:.0f}%) have been reported.")
                    else:
                        run = p.add_run(f"No emission reported for this facility in the selected reporting period. However, carbon sinks/removals totaling {self._format_number(facility_sink_total)} tCO₂e have been reported.")
                else:
                    run = p.add_run("No emission reported for this facility in the selected reporting period.")
                run.italic = True
                doc.add_paragraph()
                
                # Show Carbon Sinks section if facility has sinks
                if has_sinks:
                    self._add_styled_heading(doc, f"4.{i+2}.1 Carbon Sinks / Removals", level=3)
                    sink_headers = ['Description', 'Period', 'Emissions Reduced (tCO₂e)']
                    sink_data = []
                    for s in facility_sinks:
                        desc = s.get('description') or '-'
                        month = s.get('reporting_month')
                        year = s.get('reporting_year') or ''
                        if month is not None and year:
                            months_short = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                            period_str = f"{months_short[month]}'{year}"
                        elif s.get('start_date'):
                            period_str = s.get('start_date', '')[:7]
                        else:
                            period_str = year or '-'
                        # Apply equity share to individual sink values
                        sink_value = s.get('total_emissions_reduced', 0) * equity_factor if use_equity_share else s.get('total_emissions_reduced', 0)
                        sink_data.append([desc, period_str, self._format_number(sink_value)])
                    
                    if sink_data:
                        self._create_styled_table(doc, sink_headers, sink_data)
                    
                    # Add equity share statement for sinks if applicable
                    if use_equity_share:
                        doc.add_paragraph()
                        p = doc.add_paragraph()
                        run = p.add_run(f"The organization has chosen the Equity Share approach. For this facility, the organization accounts for {equity_pct:.0f}% equity share; therefore, {equity_pct:.0f}% of the carbon sinks/removals from this facility are attributed to the organization.")
                        run.bold = True
                    
                    p = doc.add_paragraph()
                    p.add_run(f"Total Removals/Sinks: {self._format_number(facility_sink_total)} tCO₂e")
                    doc.add_paragraph()
                
                # Still show historical data even if no current period emissions
                if include_previous_years:
                    prev_year_data = self._get_previous_year_data(all_facility_emissions, reporting_period_start)
                    
                    # Section number depends on whether sinks section was added
                    section_num = 2 if has_sinks else 1
                    self._add_styled_heading(doc, f"4.{i+2}.{section_num} Emissions of Previous Years", level=3)
                    
                    if prev_year_data:
                        self._add_previous_years_table(doc, prev_year_data, equity_factor)
                    else:
                        doc.add_paragraph("NA")
                    doc.add_paragraph()
                
                continue
            
            # 4.x.1 List of Emissions
            self._add_styled_heading(doc, f"4.{i+2}.1 List of Emissions", level=3)
            scope1_processes, scope2_processes = self._get_emission_processes(facility_emissions)
            
            p = doc.add_paragraph()
            run = p.add_run("Direct/Scope 1 Emissions:")
            run.bold = True
            
            if scope1_processes:
                for process in scope1_processes:
                    doc.add_paragraph(f"• {process}")
            else:
                doc.add_paragraph("• No emission reported")
            
            doc.add_paragraph()
            
            p = doc.add_paragraph()
            run = p.add_run("Indirect/Scope 2 Emissions:")
            run.bold = True
            
            if scope2_processes and scope2_processes != ["NA"]:
                for process in scope2_processes:
                    doc.add_paragraph(f"• {process}")
            else:
                doc.add_paragraph("• No emission reported")
            
            doc.add_paragraph()
            
            # 4.x.2 Source of Emissions
            self._add_styled_heading(doc, f"4.{i+2}.2 Source of Emissions", level=3)
            scope1_fuels, scope2_fuels = self._get_unique_fuels(facility_emissions)
            
            p = doc.add_paragraph()
            run = p.add_run("Direct/Scope 1 Sources:")
            run.bold = True
            
            if scope1_fuels:
                for fuel in scope1_fuels:
                    doc.add_paragraph(f"• {fuel}")
            else:
                doc.add_paragraph("• No emission reported")
            
            doc.add_paragraph()
            
            p = doc.add_paragraph()
            run = p.add_run("Indirect/Scope 2 Sources:")
            run.bold = True
            
            if scope2_fuels and scope2_fuels != ["NA"]:
                for fuel in scope2_fuels:
                    doc.add_paragraph(f"• {fuel}")
            else:
                doc.add_paragraph("• No emission reported")
            
            doc.add_paragraph()
            
            # 4.x.3 Summary of GHG Emissions
            self._add_styled_heading(doc, f"4.{i+2}.3 Summary of GHG Emissions - {period_display}", level=3)
            
            self._add_emissions_summary_table(doc, facility_emissions, totals, use_equity_share, equity_pct)
            
            doc.add_paragraph()
            
            # 4.x.4 Emissions of Previous Years - Use FACILITY-SPECIFIC historical data (already fetched above)
            if include_previous_years:
                prev_year_data = self._get_previous_year_data(all_facility_emissions, reporting_period_start)
                
                # Always add the section heading
                self._add_styled_heading(doc, f"4.{i+2}.4 Emissions of Previous Years", level=3)
                
                if prev_year_data:
                    self._add_previous_years_table(doc, prev_year_data, equity_factor)
                else:
                    # Show NA when no previous year data available
                    doc.add_paragraph("NA")
                doc.add_paragraph()
            
            # 4.x.5 Carbon Sinks / Removals for this facility
            if totals['removals'] > 0:
                self._add_styled_heading(doc, f"4.{i+2}.5 Carbon Sinks / Removals", level=3)
                # Get individual sink records for this facility
                facility_sinks = [s for s in (self.sinks_data or []) if s.get('facility_id') == facility_id]
                if facility_sinks:
                    sink_headers = ['Description', 'Period', 'Emissions Reduced (tCO₂e)']
                    sink_data = []
                    for s in facility_sinks:
                        desc = s.get('description') or '-'
                        month = s.get('reporting_month')
                        year = s.get('reporting_year') or ''
                        if month is not None and year:
                            months_short = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                            period_str = f"{months_short[month]}'{year}"
                        elif s.get('start_date'):
                            period_str = s.get('start_date', '')[:7]
                        else:
                            period_str = year or '-'
                        # Apply equity share to individual sink values
                        sink_value = s.get('total_emissions_reduced', 0) * equity_factor if use_equity_share else s.get('total_emissions_reduced', 0)
                        sink_data.append([desc, period_str, self._format_number(sink_value)])
                    self._create_styled_table(doc, sink_headers, sink_data)
                
                # Add equity share statement for sinks if applicable
                if use_equity_share:
                    doc.add_paragraph()
                    p = doc.add_paragraph()
                    run = p.add_run(f"The organization has chosen the Equity Share approach. For this facility, the organization accounts for {equity_pct:.0f}% equity share; therefore, {equity_pct:.0f}% of the carbon sinks/removals from this facility are attributed to the organization.")
                    run.bold = True
                
                p = doc.add_paragraph()
                p.add_run(f"Total Removals/Sinks: {self._format_number(totals['removals'])} tCO₂e")
                doc.add_paragraph()
            
            # 4.x.6 Analysis
            next_section = 6 if totals['removals'] > 0 else 5
            self._add_styled_heading(doc, f"4.{i+2}.{next_section} Analysis", level=3)
            self._add_facility_analysis(doc, facility_name, totals)
            
            doc.add_paragraph()
        
        # Organization Emissions Section
        self._add_styled_heading(doc, f"4.{len(facilities)+3} Organization Emissions", level=2)
        self._add_organization_emissions_table(doc, org_totals)
        
        doc.add_paragraph()
        
        # Organization Analysis
        self._add_styled_heading(doc, f"4.{len(facilities)+4} Organization Analysis", level=2)
        self._add_organization_analysis(doc, organization, org_totals, facilities)
        
        doc.add_page_break()
    
    def _add_emissions_summary_table(self, doc: Document, facility_emissions: List[Dict], totals: Dict, 
                                      use_equity_share: bool = False, equity_pct: float = 100.0):
        """Add emissions summary table for a facility - sorted hierarchically: Scope → Category → Fuel → Month"""
        headers = ['Scope', 'Category', 'Fuel', 'Month', 'tCO2e', 'tCO2', 'tCH4', 'tN2O']
        data = []
        
        # Track unique entries to prevent duplicates
        seen_entries = set()
        
        # Helper function to get scope sort order
        def get_scope_order(scope):
            scope_lower = (scope or '').lower()
            if 'scope1' in scope_lower or 'scope 1' in scope_lower or scope == '1':
                return 1
            elif 'scope2' in scope_lower or 'scope 2' in scope_lower or scope == '2':
                return 2
            elif 'scope3' in scope_lower or 'scope 3' in scope_lower or scope == '3':
                return 3
            elif 'biogenic' in scope_lower:
                return 4
            return 9
        
        # Helper function to parse date for sorting
        def get_date_key(em):
            period = em.get('reporting_period') or ''
            month_str = period.split(' to ')[0].strip() if ' to ' in period else period.strip()
            try:
                if '-' in month_str:
                    parts = month_str.split('-')
                    if len(parts) >= 2 and len(parts[0]) == 4:  # YYYY-MM format
                        return (int(parts[0]), int(parts[1]))
                return (9999, 99)  # Put unparseable dates at end
            except Exception:
                return (9999, 99)
        
        # Sort emissions hierarchically: 1) Scope, 2) Category, 3) Fuel, 4) Date
        def sort_key(em):
            scope_order = get_scope_order(em.get('scope', ''))
            category = (self._get_category_from_emission(em) or '').lower()
            fuel = (self._get_fuel_from_emission(em) or '').lower()
            date_key = get_date_key(em)
            return (scope_order, category, fuel, date_key[0], date_key[1])
        
        sorted_emissions = sorted(facility_emissions, key=sort_key)
        
        for em in sorted_emissions:
            # Create unique key to prevent duplicates
            period = em.get('reporting_period') or ''
            month_str = period.split(' to ')[0].strip() if ' to ' in period else period.strip()
            category = self._get_category_from_emission(em)
            fuel = self._get_fuel_from_emission(em)
            scope = em.get('scope') or ''
            
            unique_key = f"{scope}|{category}|{fuel}|{month_str}|{em.get('id', '')}"
            if unique_key in seen_entries:
                continue
            seen_entries.add(unique_key)
            
            # Format scope display
            scope_lower = scope.lower() if scope else ''
            if 'scope1' in scope_lower or 'scope 1' in scope_lower or scope == '1':
                scope_display = 'Scope 1 (Direct)'
            elif 'scope2' in scope_lower or 'scope 2' in scope_lower or scope == '2':
                scope_display = 'Scope 2 (Indirect)'
            elif 'biogenic' in scope_lower:
                scope_display = 'Biogenic'
            else:
                scope_display = scope or 'Unknown'
            
            month = self._format_month(month_str)
            
            data.append([
                scope_display,
                category,
                fuel,
                month,
                self._format_number(em.get('total_emissions', 0) or em.get('co2e_emissions', 0)),
                self._format_number(em.get('co2_emissions', 0)),
                self._format_number(em.get('ch4_emissions', 0)),
                self._format_number(em.get('n2o_emissions', 0))
            ])
        
        # Create table WITHOUT totals (totals will be added separately)
        self._create_styled_table(doc, headers, data)
        
        # Add Equity Share statement BEFORE Summary Totals (for all equity share facilities)
        if use_equity_share:
            doc.add_paragraph()
            p = doc.add_paragraph()
            run = p.add_run(f"The organization has chosen the Equity Share approach. For this facility, the organization accounts for {equity_pct:.0f}% equity share; therefore, {equity_pct:.0f}% of the GHG emissions from this facility are attributed to the organization.")
            run.bold = True
        
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
    
    def _add_previous_years_table(self, doc: Document, prev_year_data: Dict, equity_factor: float = 1.0):
        """Add previous years emissions table with optional equity share adjustment"""
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
                    # Apply equity factor to historical data
                    adjusted_val = val * equity_factor
                    row.append(self._format_number(adjusted_val))
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
        bold_rows = []  # Track which rows should be bold
        
        scope_cat_fuel = org_totals.get('by_scope_category_fuel', {})
        
        # Direct/Scope 1 Emissions (bold header row)
        scope1_data = scope_cat_fuel.get('scope1', {})
        bold_rows.append(len(data))
        data.append(['Direct/Scope 1 Emissions', '', ''])
        
        if scope1_data:
            for cat in sorted(scope1_data.keys()):
                fuels_in_cat = scope1_data[cat]
                fuels_str = ", ".join(self._deduplicate_list(sorted(fuels_in_cat.keys()), case_insensitive=True))
                cat_total = sum(fuels_in_cat.values())
                data.append([cat, fuels_str, self._format_number(cat_total)])
        else:
            data.append(['No emission reported', '-', '0.00'])
        
        # Indirect/Scope 2 Emissions (bold header row)
        scope2_data = scope_cat_fuel.get('scope2', {})
        bold_rows.append(len(data))
        data.append(['Indirect/Scope 2 Emissions', '', ''])
        
        if scope2_data:
            for cat in sorted(scope2_data.keys()):
                fuels_in_cat = scope2_data[cat]
                fuels_str = ", ".join(self._deduplicate_list(sorted(fuels_in_cat.keys()), case_insensitive=True))
                cat_total = sum(fuels_in_cat.values())
                data.append([cat, fuels_str, self._format_number(cat_total)])
        else:
            data.append(['No emission reported', '-', self._format_number(org_totals['scope2'])])
        
        # Biogenic Emissions (bold header row if there's data)
        biogenic_data = scope_cat_fuel.get('biogenic', {})
        biogenic = org_totals.get('biogenic', 0)
        if biogenic > 0:
            bold_rows.append(len(data))
            data.append(['Biogenic Emissions', '', ''])
            if biogenic_data:
                for cat in sorted(biogenic_data.keys()):
                    fuels_in_cat = biogenic_data[cat]
                    fuels_str = ", ".join(self._deduplicate_list(sorted(fuels_in_cat.keys()), case_insensitive=True))
                    cat_total = sum(fuels_in_cat.values())
                    data.append([cat, fuels_str, self._format_number(cat_total)])
            else:
                data.append(['Biogenic sources', '-', self._format_number(biogenic)])
        
        # Sinks/Removals (bold header row if there's data)
        removals = org_totals.get('removals', 0)
        if removals > 0:
            bold_rows.append(len(data))
            data.append(['Sinks/Removals', '', ''])
            data.append(['Carbon sinks and removals', '-', self._format_number(removals)])
        
        # Create table with bold header rows
        self._create_styled_table(doc, headers, data, bold_rows=bold_rows)
        
        # Add totals OUTSIDE the table
        doc.add_paragraph()
        
        p = doc.add_paragraph()
        run = p.add_run("Organization Summary Totals (all values in tCO₂e):")
        run.bold = True
        run.font.size = Pt(11)
        
        total_emissions = org_totals['scope1'] + org_totals['scope2']
        net_emissions = total_emissions - removals
        
        totals_text = [
            f"Total Direct Emissions (A): {self._format_number(org_totals['scope1'])} tCO₂e",
            f"Total Indirect Emissions (B): {self._format_number(org_totals['scope2'])} tCO₂e",
            f"Total Emissions (A + B): {self._format_number(total_emissions)} tCO₂e",
            f"Total Removals/Sinks (C): {self._format_number(removals)} tCO₂e",
            f"Total Biogenic: {self._format_number(org_totals.get('biogenic', 0))} tCO₂e",
            f"Net GHG Emissions (A + B - C): {self._format_number(net_emissions)} tCO₂e"
        ]
        
        for text in totals_text:
            p = doc.add_paragraph()
            p.add_run(text)
    
    def _add_organization_analysis(self, doc: Document, organization: Dict, org_totals: Dict, facilities: List[Dict]):
        """Add organization-level analysis"""
        org_name = self._get_value_or_na(organization, 'name')
        total = org_totals['scope1'] + org_totals['scope2']
        removals = org_totals.get('removals', 0)
        net_emissions = total - removals
        
        p = doc.add_paragraph()
        p.add_run("The total GHG emissions for ")
        run = p.add_run(f"{org_name}")
        run.bold = True
        p.add_run(" amount to ")
        run = p.add_run(f"{self._format_number(total)} tCO2e")
        run.bold = True
        p.add_run(f" across {len(facilities)} selected facilities.")
        
        # Add Carbon Sinks information if present
        if removals > 0:
            p = doc.add_paragraph()
            p.add_run("The organization has reported carbon sinks/removals totaling ")
            run = p.add_run(f"{self._format_number(removals)} tCO2e")
            run.bold = True
            p.add_run(". After accounting for these removals, the ")
            run = p.add_run("net GHG emissions")
            run.bold = True
            p.add_run(" for the organization amount to ")
            run = p.add_run(f"{self._format_number(net_emissions)} tCO2e")
            run.bold = True
            p.add_run(".")
            
            # Sinks by facility breakdown if available
            if org_totals.get('by_facility_sinks'):
                facilities_with_sinks = {k: v for k, v in org_totals['by_facility_sinks'].items() if v > 0}
                if facilities_with_sinks:
                    p = doc.add_paragraph()
                    p.add_run("Carbon sinks contribution by facility:")
                    for fac_name, sink_total in sorted(facilities_with_sinks.items(), key=lambda x: -x[1]):
                        sink_pct = (sink_total / removals) * 100 if removals > 0 else 0
                        p = doc.add_paragraph()
                        p.add_run(f"• {fac_name}: {self._format_number(sink_total)} tCO2e ({sink_pct:.1f}%)")
        
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
        if initiatives and initiatives != 'NA':
            doc.add_paragraph(initiatives)
        else:
            doc.add_paragraph("The organization has not documented specific GHG reduction initiatives at this time.")
        
        # Internal Performance Tracking
        self._add_styled_heading(doc, "5.2 Internal Performance Tracking", level=2)
        
        tracking = self._get_value_or_na(organization, 'internal_performance_tracking')
        if tracking and tracking != 'NA':
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
        p.add_run(".")
        
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
                       include_previous_years: bool = True,
                       sinks_total: float = 0.0, sinks_data: List[Dict] = None) -> io.BytesIO:
        """Generate the complete GHG Inventory Report"""
        
        # Store sinks data for use in calculations
        self.sinks_total = sinks_total
        self.sinks_data = sinks_data or []
        
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
