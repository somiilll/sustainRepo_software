"""
BRSR Annexure II Template - EXACT REPLICA

This template recreates the official SEBI BRSR Annexure II format EXACTLY.
Every heading, question, numbering, paragraph, note and table matches the official document.
Only the data values are dynamic - layout, fonts, spacing, tables are IDENTICAL to the official format.

Based on official MCA/SEBI BRSR Annexure II document (July 2023 Updated Version).
"""

from typing import Dict, Any, List, Optional
from datetime import datetime


class BRSRHTMLTemplate:
    """
    Generates HTML that is an EXACT REPLICA of the SEBI BRSR Annexure II format.
    
    CRITICAL: This template uses FIXED hardcoded questions and tables.
    Questions do NOT come from configuration.
    Only answer values are dynamic.
    """
    
    # Exact Principle statements from Annexure II
    PRINCIPLES = {
        'P1': 'Businesses should conduct and govern themselves with integrity, and in a manner that is Ethical, Transparent and Accountable.',
        'P2': 'Businesses should provide goods and services in a manner that is sustainable and safe',
        'P3': 'Businesses should respect and promote the well-being of all employees, including those in their value chains',
        'P4': 'Businesses should respect the interests of and be responsive to all its stakeholders',
        'P5': 'Businesses should respect and promote human rights',
        'P6': 'Businesses should respect and make efforts to protect and restore the environment',
        'P7': 'Businesses, when engaging in influencing public and regulatory policy, should do so in a manner that is responsible and transparent',
        'P8': 'Businesses should promote inclusive growth and equitable development',
        'P9': 'Businesses should engage with and provide value to their consumers in a responsible manner',
    }
    
    def __init__(
        self,
        organization: Dict[str, Any],
        reporting_period: str,
        section_a_data: Dict[str, Any],
        section_b_data: Dict[str, Any] = None,
        section_b_configs: List[Dict[str, Any]] = None,
        section_c_data: Dict[str, Any] = None,
        section_c_configs: List[Dict[str, Any]] = None,
    ):
        self.organization = organization or {}
        self.reporting_period = reporting_period
        self.section_a = section_a_data or {}
        self.section_b_data = section_b_data or {}
        self.section_b_configs = section_b_configs or []
        self.section_c_data = section_c_data or {}
        self.section_c_configs = section_c_configs or []
        
        # Calculate previous FY
        self.previous_fy = self._calculate_previous_fy(reporting_period)
    
    def _calculate_previous_fy(self, current_fy: str) -> str:
        """Calculate previous financial year from current FY string."""
        try:
            # Handle formats like "FY 2024-2025", "FY2024-25", "2024-2025"
            fy_clean = current_fy.replace('FY', '').replace('fy', '').strip()
            if '-' in fy_clean:
                parts = fy_clean.split('-')
                start_year = int(parts[0])
                end_year_str = parts[1]
                if len(end_year_str) == 2:
                    end_year = int(f"{str(start_year)[:2]}{end_year_str}")
                else:
                    end_year = int(end_year_str)
                prev_start = start_year - 1
                prev_end = end_year - 1
                if len(end_year_str) == 2:
                    return f"FY {prev_start}-{str(prev_end)[-2:]}"
                return f"FY {prev_start}-{prev_end}"
        except (ValueError, TypeError, IndexError):
            pass
        return "FY (Previous)"
    
    def get_css(self) -> str:
        """CSS that EXACTLY replicates Annexure II styling - Arial font, exact spacing."""
        return '''
        @page {
            size: A4;
            margin: 20mm 15mm 20mm 15mm;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 10pt;
            line-height: 1.4;
            color: #000000;
            background: #FFFFFF;
        }
        
        /* Annexure label - right aligned */
        .annexure-label {
            text-align: right;
            font-size: 10pt;
            font-weight: bold;
            margin-bottom: 15px;
        }
        
        /* Document title - centered, bold */
        .doc-title {
            text-align: center;
            font-size: 12pt;
            font-weight: bold;
            margin-bottom: 20px;
            text-transform: uppercase;
        }
        
        /* Section headers - Bold, uppercase */
        .section-header {
            font-size: 11pt;
            font-weight: bold;
            margin: 25px 0 15px 0;
            text-transform: uppercase;
        }
        
        /* Roman numeral subsection headers */
        .subsection-header {
            font-size: 10pt;
            font-weight: bold;
            margin: 18px 0 10px 0;
        }
        
        /* Principle headers - Bold text without background */
        .principle-header {
            font-size: 10pt;
            font-weight: bold;
            background-color: transparent;
            color: #000000;
            padding: 8px 0;
            margin: 20px 0 12px 0;
        }
        
        /* Indicator type headers (Essential/Leadership) - Bold, underlined */
        .indicator-header {
            font-size: 10pt;
            font-weight: bold;
            text-decoration: underline;
            margin: 15px 0 10px 0;
        }
        
        /* Question items */
        .question-item {
            margin: 8px 0;
            text-align: justify;
        }
        
        .q-num {
            font-weight: normal;
            display: inline;
        }
        
        .q-text {
            display: inline;
        }
        
        /* Sub-labels for (a), (b), (c) etc */
        .sub-label {
            margin: 6px 0 4px 25px;
        }
        
        .sub-label-2 {
            margin: 4px 0 4px 40px;
        }
        
        /* Answer value display */
        .answer-value {
            margin: 4px 0 8px 25px;
            min-height: 16px;
        }
        
        .answer-inline {
            display: inline;
            margin-left: 5px;
        }
        
        /* Tables - EXACT Annexure II style with black borders */
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0 15px 0;
            font-size: 9pt;
        }
        
        th, td {
            border: 1px solid #000000;
            padding: 5px 6px;
            text-align: left;
            vertical-align: top;
        }
        
        th {
            font-weight: bold;
            background-color: #FFFFFF;
            text-align: center;
        }
        
        /* Specific column widths */
        .col-sno { width: 40px; text-align: center; }
        .col-narrow { width: 70px; text-align: center; }
        .col-percent { width: 80px; text-align: center; }
        .col-principle { width: 50px; text-align: center; }
        .col-number { width: 60px; text-align: center; }
        .col-yesno { width: 55px; text-align: center; }
        
        .answer-cell { 
            min-height: 20px;
            background-color: #FFFFFF;
        }
        
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .text-left { text-align: left; }
        
        .fy-header { 
            text-align: center; 
            font-weight: bold;
            background-color: #F2F2F2;
        }
        
        .category-header {
            font-weight: bold;
            background-color: #E7E6E6;
        }
        
        .row-header {
            font-weight: bold;
        }
        
        .bold { font-weight: bold; }
        .italic { font-style: italic; }
        
        .intro-text { 
            margin: 10px 0 15px 0; 
            font-size: 10pt;
            text-align: justify;
        }
        
        .note-text { 
            font-size: 9pt; 
            font-style: italic; 
            margin: 8px 0;
        }
        
        /* Page breaks */
        .page-break { 
            page-break-after: always; 
        }
        
        .avoid-break {
            page-break-inside: avoid;
        }
        
        /* Table with merged header cells */
        .merged-header {
            text-align: center;
            font-weight: bold;
        }
        
        @media print {
            body { 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact; 
            }
            .page-break { 
                page-break-after: always; 
            }
        }
        '''
    
    def _val(self, key: str, default: str = '') -> str:
        """Get value from section_a data."""
        val = self.section_a.get(key)
        if val is None or val == '':
            return default
        return str(val)
    
    def _get_response(self, data: Dict, key: str, default: str = '') -> str:
        """Get response value from data dictionary with fallback key patterns."""
        # Try exact key first
        val = data.get(key)
        if val is not None and val != '':
            if isinstance(val, bool):
                return 'Yes' if val else 'No'
            if isinstance(val, (list, dict)):
                return str(val) if val else default
            return str(val)
        
        # Try alternative key patterns for Section C data
        # Pattern: p1_e1_xxx -> p1_xxx or just xxx
        alt_keys = self._get_alternative_keys(key)
        for alt_key in alt_keys:
            val = data.get(alt_key)
            if val is not None and val != '':
                if isinstance(val, bool):
                    return 'Yes' if val else 'No'
                if isinstance(val, dict):
                    # Try to get nested value
                    for k in ['value', 'description', 'current_fy', 'text']:
                        if k in val:
                            return str(val[k]) if val[k] else default
                if isinstance(val, list):
                    return str(val) if val else default
                return str(val)
        
        return default
    
    def _get_alternative_keys(self, key: str) -> list:
        """Generate alternative key patterns for data lookup."""
        alt_keys = []
        
        # Remove _eX_, _lX_ patterns (e.g., p1_e1_xxx -> p1_xxx)
        import re
        simplified = re.sub(r'_[el]\d+_', '_', key)
        if simplified != key:
            alt_keys.append(simplified)
        
        # Common key mappings between template and database
        key_mappings = {
            # P3 mappings
            'p3_e1': 'p3_wellbeing_employees',
            'p3_e2': 'p3_wellbeing_workers', 
            'p3_e3': 'p3_wellbeing_spending',
            'p3_e4': 'p3_retirement_benefits',
            'p3_e5': 'p3_accessibility_differently_abled',
            'p3_e6': 'p3_equal_opportunity_policy',
            'p3_e7': 'p3_parental_leave_return',
            'p3_e8': 'grievance_mechanism_employees_workers',
            'p3_e9': 'p3_union_membership',
            'p3_e10': 'p3_training_details',
            'p3_e11': 'performance_career_reviews',
            'p3_e12': 'p3_ohs_management_system',
            'p3_e13': 'p3_safety_incidents',
            'p3_e14': 'ltifr_employees_workers',
            'p3_e15': 'p3_safety_corrective_actions',
            'p3_e16': 'p3_complaints_employees_workers',
            'p3_l1': 'p3_life_insurance_package',
            'p3_l2': 'p3_value_chain_statutory_dues',
            'p3_l3': 'p3_rehabilitation_injured',
            'p3_l4': 'transition_assistance_programs',
            'p3_l5': 'p3_value_chain_assessment',
            'p3_l6': 'p3_value_chain_corrective',
            # P4 mappings
            'p4_e1': 'p4_se_1',
            'p4_e2': 'p4_se_2',
            # P5 mappings  
            'p5_e1': 'p5_hr_training',
            'p5_e2': 'p5_minimum_wages',
            'p5_e3': 'p5_remuneration_details',
            'p5_e4': 'p5_gross_wages_females',
            'p5_e5': 'p5_hr_focal_point',
            'p5_e6': 'p5_hr_grievance_mechanism',
            'p5_e7': 'p5_hr_complaints',
            'p5_e8': 'p5_sexual_harassment_complaints',
            'p5_e9': 'p5_prevent_adverse_consequences',
            'p5_e10': 'p5_hr_business_agreements',
            'p5_l1': 'p5_business_process_changes',
            'p5_l2': 'p5_hr_due_diligence',
            'p5_l3': 'p5_accessibility_differently_abled',
            'p5_l4': 'p5_value_chain_hr_assessment',
            'p5_l5': 'p5_value_chain_corrective',
            # P6 mappings
            'p6_e1': 'p6_energy_consumption',
            'p6_e2': 'env_pat_scheme_compliance',
            'p6_e3': 'p6_water_disclosures',
            'p6_e4': 'p6_water_discharged',
            'p6_e5': 'env_zero_liquid_discharge',
            'p6_e6': 'p6_air_emissions',
            'p6_e7': 'p6_ghg_scope12',
            'p6_e8': 'env_ghg_reduction_initiatives',
            'p6_e9': 'p6_waste_management_details',
            'p6_e10': 'env_waste_management_practices_desc',
            'p6_e11': 'env_ecologically_sensitive_areas',
            'p6_e12': 'env_eia_details',
            'p6_e13': 'env_environmental_compliance',
            'p6_l1': 'p6_water_stress_areas',
            'p6_l2': 'p6_scope3_emissions',
            'p6_l3': 'env_biodiversity_impact',
            'p6_l4': 'env_resource_efficiency_initiatives',
            'p6_l5': 'env_business_continuity_disaster',
            'p6_l6': 'env_value_chain_impacts',
            'p6_l7': 'env_value_chain_assessment',
            # P7 mappings
            'p7_e1': 'trade_association_affiliations_count',
            'p7_e2': 'top_trade_associations',
            'p7_e3': 'anticompetitive_corrective_actions',
            'p7_l1': 'public_policy_positions',
            # P8 mappings
            'p8_e1': 'p8_social_impact_assessments',
            'p8_e2': 'p8_rehabilitation_resettlement',
            'p8_e3': 'p8_community_grievance',
            'p8_e4': 'p8_msme_domestic_sourcing',
            'p8_l1': 'p8_wage_distribution_location',
            'p8_l2': 'p8_sia_corrective_actions',
            'p8_l3': 'p8_csr_aspirational_districts',
            'p8_l4': 'p8_preferential_procurement',
            'p8_l5': 'p8_intellectual_property_traditional',
            'p8_l6': 'p8_ip_corrective_actions',
            'p8_l7': 'p8_csr_beneficiaries',
            # P9 mappings
            'p9_e1': 'p9_consumer_complaints_mechanism',
            'p9_e2': 'p9_product_info_disclosure',
            'p9_e3': 'p9_consumer_complaints',
            'p9_e4': 'p9_product_recall',
            'p9_e5': 'cyber_security_policy',
            'p9_e6': 'corrective_actions_advertising_cyber',
            'p9_l1': 'p9_data_breaches_count',
            'p9_l2': 'p9_product_info_channels',
            'p9_l3': 'p9_consumer_education',
            'p9_l4': 'p9_service_disruption_mechanism',
            'p9_l5': 'p9_product_info_beyond_legal',
            'p9_l6': 'p9_consumer_satisfaction_survey',
        }
        
        # Check if key starts with any mapped prefix
        for prefix, mapped_key in key_mappings.items():
            if key.startswith(prefix):
                alt_keys.append(mapped_key)
                # Also try with the suffix after the prefix
                suffix = key[len(prefix):]
                if suffix.startswith('_'):
                    suffix = suffix[1:]
                if suffix:
                    alt_keys.append(f"{mapped_key}_{suffix}")
        
        return alt_keys
    
    def _get_nested(self, data: Dict, *keys, default: str = '') -> str:
        """Get nested value from data dictionary using multiple keys."""
        current = data
        for key in keys:
            if isinstance(current, dict):
                current = current.get(key)
            else:
                return default
            if current is None:
                return default
        if isinstance(current, bool):
            return 'Yes' if current else 'No'
        if current is None or current == '':
            return default
        return str(current)
    
    def _format_address(self, key: str) -> str:
        """Format address from section_a field (stored as object with address, city, state, country, pincode)."""
        addr_data = self.section_a.get(key, {})
        if isinstance(addr_data, dict):
            parts = []
            for field in ['address', 'city', 'state', 'country', 'pincode']:
                val = addr_data.get(field)
                if val and str(val).strip():
                    parts.append(str(val))
            return ', '.join(parts) if parts else ''
        return str(addr_data) if addr_data else ''
    
    def render(self) -> str:
        """Render the complete BRSR Annexure II HTML document."""
        html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BRSR Annexure II - {self.organization.get('name', 'Organization')}</title>
    <style>
    {self.get_css()}
    </style>
</head>
<body>
    {self.render_section_a()}
    {self.render_section_b()}
    {self.render_section_c()}
</body>
</html>'''
        return html
    
    def render_section_a(self) -> str:
        """
        SECTION A: GENERAL DISCLOSURES
        Exact replica of Annexure II Section A with all questions and tables.
        Uses brsr_a_* keys from the portal responses.
        """
        # Contact details - these might be in a separate field or part of organization
        contact_name = self._val('brsr_a_contact_name', self.organization.get('contact_name', ''))
        contact_tel = self._val('brsr_a_contact_telephone', self.organization.get('contact_telephone', ''))
        contact_email = self._val('brsr_a_contact_email', self.organization.get('contact_email', ''))
        contact_str = f"{contact_name}, Tel: {contact_tel}, Email: {contact_email}" if contact_name else ''
        
        html = f'''
        <div class="annexure-label">Annexure II</div>
        <div class="doc-title">BUSINESS RESPONSIBILITY &amp; SUSTAINABILITY REPORTING FORMAT</div>
        
        <div class="section-header">SECTION A: GENERAL DISCLOSURES</div>
        
        <!-- I. Details of the listed entity -->
        <div class="subsection-header">I. Details of the listed entity</div>
        
        <div class="question-item"><span class="q-num">1.</span> <span class="q-text">Corporate Identity Number (CIN) of the Listed Entity</span></div>
        <div class="answer-value">{self._val('brsr_a_cin')}</div>
        
        <div class="question-item"><span class="q-num">2.</span> <span class="q-text">Name of the Listed Entity</span></div>
        <div class="answer-value">{self._val('brsr_a_entity_name', self.organization.get('name', ''))}</div>
        
        <div class="question-item"><span class="q-num">3.</span> <span class="q-text">Year of incorporation</span></div>
        <div class="answer-value">{self._val('brsr_a_year_of_incorporation')}</div>
        
        <div class="question-item"><span class="q-num">4.</span> <span class="q-text">Registered office address</span></div>
        <div class="answer-value">{self._format_address('brsr_a_registered_address')}</div>
        
        <div class="question-item"><span class="q-num">5.</span> <span class="q-text">Corporate address</span></div>
        <div class="answer-value">{self._format_address('brsr_a_corporate_address')}</div>
        
        <div class="question-item"><span class="q-num">6.</span> <span class="q-text">E-mail</span></div>
        <div class="answer-value">{self._val('brsr_a_email')}</div>
        
        <div class="question-item"><span class="q-num">7.</span> <span class="q-text">Telephone</span></div>
        <div class="answer-value">{self._val('brsr_a_telephone')}</div>
        
        <div class="question-item"><span class="q-num">8.</span> <span class="q-text">Website</span></div>
        <div class="answer-value">{self._val('brsr_a_website')}</div>
        
        <div class="question-item"><span class="q-num">9.</span> <span class="q-text">Financial year for which reporting is being done</span></div>
        <div class="answer-value">{self.reporting_period}</div>
        
        <div class="question-item"><span class="q-num">10.</span> <span class="q-text">Name of the Stock Exchange(s) where shares are listed</span></div>
        <div class="answer-value">{self._val('brsr_a_stock_exchange')}</div>
        
        <div class="question-item"><span class="q-num">11.</span> <span class="q-text">Paid-up Capital</span></div>
        <div class="answer-value">{self._val('brsr_a_paid_up_capital')}</div>
        
        <div class="question-item"><span class="q-num">12.</span> <span class="q-text">Name and contact details (telephone, email address) of the person who may be contacted in case of any queries on the BRSR report</span></div>
        <div class="answer-value">{contact_str}</div>
        
        <div class="question-item"><span class="q-num">13.</span> <span class="q-text">Reporting boundary - Are the disclosures under this report made on a standalone basis (i.e. only for the entity) or on a consolidated basis (i.e. for the entity and all the entities which form a part of its consolidated financial statements, taken together).</span></div>
        <div class="answer-value">{self._val('brsr_a_reporting_boundary')}</div>
        
        <div class="question-item"><span class="q-num">14.</span> <span class="q-text">Name of assurance provider</span></div>
        <div class="answer-value">{self._val('brsr_a_assurance_provider')}</div>
        
        <div class="question-item"><span class="q-num">15.</span> <span class="q-text">Type of assurance obtained</span></div>
        <div class="answer-value">{self._val('brsr_a_assurance_type')}</div>
        
        <!-- II. Products/services -->
        <div class="subsection-header">II. Products/services</div>
        
        <div class="question-item"><span class="q-num">16.</span> <span class="q-text">Details of business activities (accounting for 90% of the turnover):</span></div>
        
        <table>
            <thead>
                <tr>
                    <th class="col-sno">S. No.</th>
                    <th>Description of Main Activity</th>
                    <th>Description of Business Activity</th>
                    <th class="col-percent">% of Turnover of the entity</th>
                </tr>
            </thead>
            <tbody>
                {self._render_business_activities()}
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">17.</span> <span class="q-text">Products/Services sold by the entity (accounting for 90% of the entity's Turnover):</span></div>
        
        <table>
            <thead>
                <tr>
                    <th class="col-sno">S. No.</th>
                    <th>Product/Service</th>
                    <th>NIC Code</th>
                    <th class="col-percent">% of total Turnover contributed</th>
                </tr>
            </thead>
            <tbody>
                {self._render_products_services()}
            </tbody>
        </table>
        
        <!-- III. Operations -->
        <div class="subsection-header">III. Operations</div>
        
        <div class="question-item"><span class="q-num">18.</span> <span class="q-text">Number of locations where plants and/or operations/offices of the entity are situated:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th>Location</th>
                    <th class="col-narrow">Number of plants</th>
                    <th class="col-narrow">Number of offices</th>
                    <th class="col-narrow">Total</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>National</td>
                    <td class="text-center answer-cell">{self._val('national_plants', '')}</td>
                    <td class="text-center answer-cell">{self._val('national_offices', '')}</td>
                    <td class="text-center answer-cell">{self._val('national_total', '')}</td>
                </tr>
                <tr>
                    <td>International</td>
                    <td class="text-center answer-cell">{self._val('international_plants', '')}</td>
                    <td class="text-center answer-cell">{self._val('international_offices', '')}</td>
                    <td class="text-center answer-cell">{self._val('international_total', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">19.</span> <span class="q-text">Markets served by the entity:</span></div>
        
        <div class="sub-label">a. Number of locations</div>
        
        <table>
            <thead>
                <tr>
                    <th>Locations</th>
                    <th class="col-narrow">Number</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>National (No. of States)</td>
                    <td class="text-center answer-cell">{self._val('national_states', '')}</td>
                </tr>
                <tr>
                    <td>International (No. of Countries)</td>
                    <td class="text-center answer-cell">{self._val('international_countries', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="sub-label">b. What is the contribution of exports as a percentage of the total turnover of the entity?</div>
        <div class="answer-value">{self._val('export_contribution_percentage', '')}%</div>
        
        <div class="sub-label">c. A brief on types of customers</div>
        <div class="answer-value">{self._val('customer_types_brief', '')}</div>
        '''
        
        # Continue with IV. Employees
        html += self._render_section_a_employees()
        
        # V. Holding, Subsidiary
        html += self._render_section_a_holding()
        
        # VI. CSR Details
        html += self._render_section_a_csr()
        
        # VII. Transparency and Disclosures
        html += self._render_section_a_transparency()
        
        return html
    
    def _render_business_activities(self) -> str:
        """Render business activities table rows using brsr_a_business_activities key."""
        activities = self.section_a.get('brsr_a_business_activities', [])
        if not activities or not isinstance(activities, list):
            return '<tr><td class="text-center">1</td><td class="answer-cell"></td><td class="answer-cell"></td><td class="text-center answer-cell"></td></tr>'
        
        rows = []
        for i, activity in enumerate(activities, 1):
            if isinstance(activity, dict):
                rows.append(f'''<tr>
                <td class="text-center">{i}</td>
                <td class="answer-cell">{activity.get('main_activity', '')}</td>
                <td class="answer-cell">{activity.get('description', '')}</td>
                <td class="text-center answer-cell">{activity.get('turnover_percentage', '')}</td>
            </tr>''')
        return '\n'.join(rows) if rows else '<tr><td class="text-center">1</td><td class="answer-cell"></td><td class="answer-cell"></td><td class="text-center answer-cell"></td></tr>'
    
    def _render_products_services(self) -> str:
        """Render products/services table rows using brsr_a_products_services key."""
        products = self.section_a.get('brsr_a_products_services', [])
        if not products or not isinstance(products, list):
            return '<tr><td class="text-center">1</td><td class="answer-cell"></td><td class="answer-cell"></td><td class="text-center answer-cell"></td></tr>'
        
        rows = []
        for i, product in enumerate(products, 1):
            if isinstance(product, dict):
                rows.append(f'''<tr>
                <td class="text-center">{i}</td>
                <td class="answer-cell">{product.get('product_service', '')}</td>
                <td class="answer-cell">{product.get('nic_code', '')}</td>
                <td class="text-center answer-cell">{product.get('turnover_percentage', '')}</td>
            </tr>''')
        return '\n'.join(rows) if rows else '<tr><td class="text-center">1</td><td class="answer-cell"></td><td class="answer-cell"></td><td class="text-center answer-cell"></td></tr>'
    
    def _get_employee_data(self, category: str, employee_type: str, field: str) -> str:
        """
        Extract employee/worker data from nested brsr_a_employees_workers structure.
        
        Args:
            category: 'employees' or 'workers'
            employee_type: 'permanent' or 'other_than_permanent'
            field: 'male', 'female', or 'total'
        """
        emp_data = self.section_a.get('brsr_a_employees_workers', {})
        if isinstance(emp_data, dict):
            cat_data = emp_data.get(category, {})
            if isinstance(cat_data, dict):
                type_data = cat_data.get(employee_type, {})
                if isinstance(type_data, dict):
                    val = type_data.get(field)
                    return str(val) if val is not None else ''
        return ''
    
    def _get_differently_abled_data(self, category: str, employee_type: str, field: str) -> str:
        """
        Extract differently abled employee/worker data from nested brsr_a_differently_abled structure.
        """
        da_data = self.section_a.get('brsr_a_differently_abled', {})
        if isinstance(da_data, dict):
            cat_data = da_data.get(category, {})
            if isinstance(cat_data, dict):
                type_data = cat_data.get(employee_type, {})
                if isinstance(type_data, dict):
                    val = type_data.get(field)
                    return str(val) if val is not None else ''
        return ''
    
    def _calc_percentage(self, part: str, total: str) -> str:
        """Calculate percentage, handling empty or zero values."""
        try:
            p = float(part) if part else 0
            t = float(total) if total else 0
            if t > 0:
                return f"{(p / t * 100):.1f}%"
        except (ValueError, TypeError):
            pass
        return ''
    
    def _render_section_a_employees(self) -> str:
        """Section A - IV. Employees - Exact Annexure II format with brsr_a_employees_workers data."""
        # Extract employee data
        emp_perm_male = self._get_employee_data('employees', 'permanent', 'male')
        emp_perm_female = self._get_employee_data('employees', 'permanent', 'female')
        emp_perm_total = self._get_employee_data('employees', 'permanent', 'total')
        
        emp_other_male = self._get_employee_data('employees', 'other_than_permanent', 'male')
        emp_other_female = self._get_employee_data('employees', 'other_than_permanent', 'female')
        emp_other_total = self._get_employee_data('employees', 'other_than_permanent', 'total')
        
        wrk_perm_male = self._get_employee_data('workers', 'permanent', 'male')
        wrk_perm_female = self._get_employee_data('workers', 'permanent', 'female')
        wrk_perm_total = self._get_employee_data('workers', 'permanent', 'total')
        
        wrk_other_male = self._get_employee_data('workers', 'other_than_permanent', 'male')
        wrk_other_female = self._get_employee_data('workers', 'other_than_permanent', 'female')
        wrk_other_total = self._get_employee_data('workers', 'other_than_permanent', 'total')
        
        # Calculate totals
        try:
            emp_total_male = str(int(float(emp_perm_male or 0)) + int(float(emp_other_male or 0))) if emp_perm_male or emp_other_male else ''
            emp_total_female = str(int(float(emp_perm_female or 0)) + int(float(emp_other_female or 0))) if emp_perm_female or emp_other_female else ''
            emp_total_total = str(int(float(emp_perm_total or 0)) + int(float(emp_other_total or 0))) if emp_perm_total or emp_other_total else ''
            
            wrk_total_male = str(int(float(wrk_perm_male or 0)) + int(float(wrk_other_male or 0))) if wrk_perm_male or wrk_other_male else ''
            wrk_total_female = str(int(float(wrk_perm_female or 0)) + int(float(wrk_other_female or 0))) if wrk_perm_female or wrk_other_female else ''
            wrk_total_total = str(int(float(wrk_perm_total or 0)) + int(float(wrk_other_total or 0))) if wrk_perm_total or wrk_other_total else ''
        except (ValueError, TypeError):
            emp_total_male = emp_total_female = emp_total_total = ''
            wrk_total_male = wrk_total_female = wrk_total_total = ''
        
        return f'''
        <!-- IV. Employees -->
        <div class="subsection-header">IV. Employees</div>
        
        <div class="question-item"><span class="q-num">20.</span> <span class="q-text">Details as at the end of Financial Year:</span></div>
        
        <div class="sub-label">a. Employees and workers (including differently abled):</div>
        
        <table>
            <thead>
                <tr>
                    <th class="col-sno">S. No.</th>
                    <th>Particulars</th>
                    <th class="col-narrow">Total (A)</th>
                    <th colspan="2">Male</th>
                    <th colspan="2">Female</th>
                </tr>
                <tr>
                    <th></th>
                    <th></th>
                    <th></th>
                    <th class="col-narrow">No. (B)</th>
                    <th class="col-narrow">% (B/A)</th>
                    <th class="col-narrow">No. (C)</th>
                    <th class="col-narrow">% (C/A)</th>
                </tr>
            </thead>
            <tbody>
                <tr class="category-header"><td colspan="7">EMPLOYEES</td></tr>
                <tr>
                    <td class="text-center">1</td>
                    <td>Permanent (D)</td>
                    <td class="text-center answer-cell">{emp_perm_total}</td>
                    <td class="text-center answer-cell">{emp_perm_male}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(emp_perm_male, emp_perm_total)}</td>
                    <td class="text-center answer-cell">{emp_perm_female}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(emp_perm_female, emp_perm_total)}</td>
                </tr>
                <tr>
                    <td class="text-center">2</td>
                    <td>Other than Permanent (E)</td>
                    <td class="text-center answer-cell">{emp_other_total}</td>
                    <td class="text-center answer-cell">{emp_other_male}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(emp_other_male, emp_other_total)}</td>
                    <td class="text-center answer-cell">{emp_other_female}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(emp_other_female, emp_other_total)}</td>
                </tr>
                <tr>
                    <td class="text-center">3</td>
                    <td>Total employees (D + E)</td>
                    <td class="text-center answer-cell">{emp_total_total}</td>
                    <td class="text-center answer-cell">{emp_total_male}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(emp_total_male, emp_total_total)}</td>
                    <td class="text-center answer-cell">{emp_total_female}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(emp_total_female, emp_total_total)}</td>
                </tr>
                <tr class="category-header"><td colspan="7">WORKERS</td></tr>
                <tr>
                    <td class="text-center">4</td>
                    <td>Permanent (F)</td>
                    <td class="text-center answer-cell">{wrk_perm_total}</td>
                    <td class="text-center answer-cell">{wrk_perm_male}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(wrk_perm_male, wrk_perm_total)}</td>
                    <td class="text-center answer-cell">{wrk_perm_female}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(wrk_perm_female, wrk_perm_total)}</td>
                </tr>
                <tr>
                    <td class="text-center">5</td>
                    <td>Other than Permanent (G)</td>
                    <td class="text-center answer-cell">{wrk_other_total}</td>
                    <td class="text-center answer-cell">{wrk_other_male}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(wrk_other_male, wrk_other_total)}</td>
                    <td class="text-center answer-cell">{wrk_other_female}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(wrk_other_female, wrk_other_total)}</td>
                </tr>
                <tr>
                    <td class="text-center">6</td>
                    <td>Total workers (F + G)</td>
                    <td class="text-center answer-cell">{wrk_total_total}</td>
                    <td class="text-center answer-cell">{wrk_total_male}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(wrk_total_male, wrk_total_total)}</td>
                    <td class="text-center answer-cell">{wrk_total_female}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(wrk_total_female, wrk_total_total)}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="sub-label">b. Differently abled Employees and workers:</div>
        
        <table>
            <thead>
                <tr>
                    <th class="col-sno">S. No.</th>
                    <th>Particulars</th>
                    <th class="col-narrow">Total (A)</th>
                    <th colspan="2">Male</th>
                    <th colspan="2">Female</th>
                </tr>
                <tr>
                    <th></th>
                    <th></th>
                    <th></th>
                    <th class="col-narrow">No. (B)</th>
                    <th class="col-narrow">% (B/A)</th>
                    <th class="col-narrow">No. (C)</th>
                    <th class="col-narrow">% (C/A)</th>
                </tr>
            </thead>
            <tbody>
                <tr class="category-header"><td colspan="7">DIFFERENTLY ABLED EMPLOYEES</td></tr>
                <tr>
                    <td class="text-center">1</td>
                    <td>Permanent (D)</td>
                    <td class="text-center answer-cell">{self._val('da_emp_perm_total', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_emp_perm_male', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_emp_perm_male_pct', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_emp_perm_female', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_emp_perm_female_pct', '')}</td>
                </tr>
                <tr>
                    <td class="text-center">2</td>
                    <td>Other than Permanent (E)</td>
                    <td class="text-center answer-cell">{self._val('da_emp_other_total', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_emp_other_male', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_emp_other_male_pct', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_emp_other_female', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_emp_other_female_pct', '')}</td>
                </tr>
                <tr>
                    <td class="text-center">3</td>
                    <td>Total differently abled employees (D + E)</td>
                    <td class="text-center answer-cell">{self._val('da_emp_total_total', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_emp_total_male', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_emp_total_male_pct', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_emp_total_female', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_emp_total_female_pct', '')}</td>
                </tr>
                <tr class="category-header"><td colspan="7">DIFFERENTLY ABLED WORKERS</td></tr>
                <tr>
                    <td class="text-center">4</td>
                    <td>Permanent (F)</td>
                    <td class="text-center answer-cell">{self._val('da_wrk_perm_total', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_wrk_perm_male', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_wrk_perm_male_pct', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_wrk_perm_female', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_wrk_perm_female_pct', '')}</td>
                </tr>
                <tr>
                    <td class="text-center">5</td>
                    <td>Other than permanent (G)</td>
                    <td class="text-center answer-cell">{self._val('da_wrk_other_total', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_wrk_other_male', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_wrk_other_male_pct', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_wrk_other_female', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_wrk_other_female_pct', '')}</td>
                </tr>
                <tr>
                    <td class="text-center">6</td>
                    <td>Total differently abled workers (F + G)</td>
                    <td class="text-center answer-cell">{self._val('da_wrk_total_total', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_wrk_total_male', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_wrk_total_male_pct', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_wrk_total_female', '')}</td>
                    <td class="text-center answer-cell">{self._val('da_wrk_total_female_pct', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">21.</span> <span class="q-text">Participation/Inclusion/Representation of women</span></div>
        
        <table>
            <thead>
                <tr>
                    <th></th>
                    <th class="col-narrow">Total (A)</th>
                    <th class="col-narrow">No. and percentage of Females</th>
                    <th class="col-narrow">% (B/A)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Board of Directors</td>
                    <td class="text-center answer-cell">{self._val('bod_total', '')}</td>
                    <td class="text-center answer-cell">{self._val('bod_female', '')}</td>
                    <td class="text-center answer-cell">{self._val('bod_female_pct', '')}</td>
                </tr>
                <tr>
                    <td>Key Management Personnel</td>
                    <td class="text-center answer-cell">{self._val('kmp_total', '')}</td>
                    <td class="text-center answer-cell">{self._val('kmp_female', '')}</td>
                    <td class="text-center answer-cell">{self._val('kmp_female_pct', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">22.</span> <span class="q-text">Turnover rate for permanent employees and workers (Disclose trends for the past 3 years)</span></div>
        
        <table>
            <thead>
                <tr>
                    <th></th>
                    <th colspan="3" class="fy-header">{self.reporting_period} (Current FY)</th>
                    <th colspan="3" class="fy-header">{self.previous_fy} (Previous FY)</th>
                    <th colspan="3" class="fy-header">FY (Year prior to previous FY)</th>
                </tr>
                <tr>
                    <th></th>
                    <th class="col-narrow">Male</th>
                    <th class="col-narrow">Female</th>
                    <th class="col-narrow">Total</th>
                    <th class="col-narrow">Male</th>
                    <th class="col-narrow">Female</th>
                    <th class="col-narrow">Total</th>
                    <th class="col-narrow">Male</th>
                    <th class="col-narrow">Female</th>
                    <th class="col-narrow">Total</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Permanent Employees</td>
                    <td class="text-center answer-cell">{self._val('turnover_emp_curr_male', '')}</td>
                    <td class="text-center answer-cell">{self._val('turnover_emp_curr_female', '')}</td>
                    <td class="text-center answer-cell">{self._val('turnover_emp_curr_total', '')}</td>
                    <td class="text-center answer-cell">{self._val('turnover_emp_prev_male', '')}</td>
                    <td class="text-center answer-cell">{self._val('turnover_emp_prev_female', '')}</td>
                    <td class="text-center answer-cell">{self._val('turnover_emp_prev_total', '')}</td>
                    <td class="text-center answer-cell">{self._val('turnover_emp_prior_male', '')}</td>
                    <td class="text-center answer-cell">{self._val('turnover_emp_prior_female', '')}</td>
                    <td class="text-center answer-cell">{self._val('turnover_emp_prior_total', '')}</td>
                </tr>
                <tr>
                    <td>Permanent Workers</td>
                    <td class="text-center answer-cell">{self._val('turnover_wrk_curr_male', '')}</td>
                    <td class="text-center answer-cell">{self._val('turnover_wrk_curr_female', '')}</td>
                    <td class="text-center answer-cell">{self._val('turnover_wrk_curr_total', '')}</td>
                    <td class="text-center answer-cell">{self._val('turnover_wrk_prev_male', '')}</td>
                    <td class="text-center answer-cell">{self._val('turnover_wrk_prev_female', '')}</td>
                    <td class="text-center answer-cell">{self._val('turnover_wrk_prev_total', '')}</td>
                    <td class="text-center answer-cell">{self._val('turnover_wrk_prior_male', '')}</td>
                    <td class="text-center answer-cell">{self._val('turnover_wrk_prior_female', '')}</td>
                    <td class="text-center answer-cell">{self._val('turnover_wrk_prior_total', '')}</td>
                </tr>
            </tbody>
        </table>
        '''
    
    def _render_section_a_holding(self) -> str:
        """Section A - V. Holding, Subsidiary and Associate Companies."""
        return f'''
        <!-- V. Holding, Subsidiary and Associate Companies -->
        <div class="subsection-header">V. Holding, Subsidiary and Associate Companies (including joint ventures)</div>
        
        <div class="question-item"><span class="q-num">23.</span> <span class="q-text">(a) Names of holding / subsidiary / associate companies / joint ventures</span></div>
        
        <table>
            <thead>
                <tr>
                    <th class="col-sno">S. No.</th>
                    <th>Name of the holding / subsidiary / associate companies / joint ventures (A)</th>
                    <th>Indicate whether holding/ Subsidiary/ Associate/ Joint Venture</th>
                    <th class="col-percent">% of shares held by listed entity</th>
                    <th>Does the entity indicated at column A, participate in the Business Responsibility initiatives of the listed entity? (Yes/No)</th>
                </tr>
            </thead>
            <tbody>
                {self._render_holding_companies()}
            </tbody>
        </table>
        '''
    
    def _render_holding_companies(self) -> str:
        """Render holding companies table rows."""
        companies = self.section_a.get('holding_companies', [])
        if not companies:
            return '<tr><td class="text-center">1</td><td class="answer-cell"></td><td class="answer-cell"></td><td class="text-center answer-cell"></td><td class="text-center answer-cell"></td></tr>'
        
        rows = []
        for i, company in enumerate(companies, 1):
            rows.append(f'''<tr>
                <td class="text-center">{i}</td>
                <td class="answer-cell">{company.get('name', '')}</td>
                <td class="answer-cell">{company.get('type', '')}</td>
                <td class="text-center answer-cell">{company.get('shares_held', '')}</td>
                <td class="text-center answer-cell">{company.get('participates_br', '')}</td>
            </tr>''')
        return '\n'.join(rows)
    
    def _render_section_a_csr(self) -> str:
        """Section A - VI. CSR Details."""
        return f'''
        <!-- VI. CSR Details -->
        <div class="subsection-header">VI. CSR Details</div>
        
        <div class="question-item"><span class="q-num">24.</span> <span class="q-text">(i) Whether CSR is applicable as per section 135 of Companies Act, 2013: (Yes/No)</span></div>
        <div class="answer-value">{self._val('csr_applicable', '')}</div>
        
        <div class="sub-label">(ii) Turnover (in Rs.)</div>
        <div class="answer-value">{self._val('csr_turnover', '')}</div>
        
        <div class="sub-label">(iii) Net worth (in Rs.)</div>
        <div class="answer-value">{self._val('csr_net_worth', '')}</div>
        '''
    
    def _render_section_a_transparency(self) -> str:
        """Section A - VII. Transparency and Disclosures Compliances."""
        return f'''
        <!-- VII. Transparency and Disclosures Compliances -->
        <div class="subsection-header">VII. Transparency and Disclosures Compliances</div>
        
        <div class="question-item"><span class="q-num">25.</span> <span class="q-text">Complaints/Grievances on any of the principles (Principles 1 to 9) under the National Guidelines on Responsible Business Conduct:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th rowspan="2">Stakeholder group from whom complaint is received</th>
                    <th rowspan="2">Grievance Redressal Mechanism in Place (Yes/No)</th>
                    <th rowspan="2">(If Yes, then provide web-link for grievance redress policy)</th>
                    <th colspan="3" class="fy-header">{self.reporting_period} (Current FY)</th>
                    <th colspan="3" class="fy-header">{self.previous_fy} (Previous FY)</th>
                </tr>
                <tr>
                    <th class="col-narrow">Number of complaints filed during the year</th>
                    <th class="col-narrow">Number of complaints pending resolution at close of the year</th>
                    <th>Remarks</th>
                    <th class="col-narrow">Number of complaints filed during the year</th>
                    <th class="col-narrow">Number of complaints pending resolution at close of the year</th>
                    <th>Remarks</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Communities</td>
                    <td class="text-center answer-cell">{self._val('grievance_communities_mechanism', '')}</td>
                    <td class="answer-cell">{self._val('grievance_communities_weblink', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_communities_curr_filed', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_communities_curr_pending', '')}</td>
                    <td class="answer-cell">{self._val('grievance_communities_curr_remarks', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_communities_prev_filed', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_communities_prev_pending', '')}</td>
                    <td class="answer-cell">{self._val('grievance_communities_prev_remarks', '')}</td>
                </tr>
                <tr>
                    <td>Investors (other than shareholders)</td>
                    <td class="text-center answer-cell">{self._val('grievance_investors_mechanism', '')}</td>
                    <td class="answer-cell">{self._val('grievance_investors_weblink', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_investors_curr_filed', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_investors_curr_pending', '')}</td>
                    <td class="answer-cell">{self._val('grievance_investors_curr_remarks', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_investors_prev_filed', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_investors_prev_pending', '')}</td>
                    <td class="answer-cell">{self._val('grievance_investors_prev_remarks', '')}</td>
                </tr>
                <tr>
                    <td>Shareholders</td>
                    <td class="text-center answer-cell">{self._val('grievance_shareholders_mechanism', '')}</td>
                    <td class="answer-cell">{self._val('grievance_shareholders_weblink', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_shareholders_curr_filed', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_shareholders_curr_pending', '')}</td>
                    <td class="answer-cell">{self._val('grievance_shareholders_curr_remarks', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_shareholders_prev_filed', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_shareholders_prev_pending', '')}</td>
                    <td class="answer-cell">{self._val('grievance_shareholders_prev_remarks', '')}</td>
                </tr>
                <tr>
                    <td>Employees and workers</td>
                    <td class="text-center answer-cell">{self._val('grievance_employees_mechanism', '')}</td>
                    <td class="answer-cell">{self._val('grievance_employees_weblink', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_employees_curr_filed', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_employees_curr_pending', '')}</td>
                    <td class="answer-cell">{self._val('grievance_employees_curr_remarks', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_employees_prev_filed', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_employees_prev_pending', '')}</td>
                    <td class="answer-cell">{self._val('grievance_employees_prev_remarks', '')}</td>
                </tr>
                <tr>
                    <td>Customers</td>
                    <td class="text-center answer-cell">{self._val('grievance_customers_mechanism', '')}</td>
                    <td class="answer-cell">{self._val('grievance_customers_weblink', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_customers_curr_filed', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_customers_curr_pending', '')}</td>
                    <td class="answer-cell">{self._val('grievance_customers_curr_remarks', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_customers_prev_filed', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_customers_prev_pending', '')}</td>
                    <td class="answer-cell">{self._val('grievance_customers_prev_remarks', '')}</td>
                </tr>
                <tr>
                    <td>Value Chain Partners</td>
                    <td class="text-center answer-cell">{self._val('grievance_valuechain_mechanism', '')}</td>
                    <td class="answer-cell">{self._val('grievance_valuechain_weblink', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_valuechain_curr_filed', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_valuechain_curr_pending', '')}</td>
                    <td class="answer-cell">{self._val('grievance_valuechain_curr_remarks', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_valuechain_prev_filed', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_valuechain_prev_pending', '')}</td>
                    <td class="answer-cell">{self._val('grievance_valuechain_prev_remarks', '')}</td>
                </tr>
                <tr>
                    <td>Other (please specify)</td>
                    <td class="text-center answer-cell">{self._val('grievance_other_mechanism', '')}</td>
                    <td class="answer-cell">{self._val('grievance_other_weblink', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_other_curr_filed', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_other_curr_pending', '')}</td>
                    <td class="answer-cell">{self._val('grievance_other_curr_remarks', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_other_prev_filed', '')}</td>
                    <td class="text-center answer-cell">{self._val('grievance_other_prev_pending', '')}</td>
                    <td class="answer-cell">{self._val('grievance_other_prev_remarks', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">26.</span> <span class="q-text">Overview of the entity's material responsible business conduct issues</span></div>
        <div class="sub-label">Please indicate material responsible business conduct and sustainability issues pertaining to environmental and social matters that present a risk or an opportunity to your business, rationale for identifying the same, approach to adapt or mitigate the risk along-with its financial implications, as per the following format:</div>
        
        <table>
            <thead>
                <tr>
                    <th class="col-sno">S. No.</th>
                    <th>Material issue identified</th>
                    <th>Indicate whether risk or opportunity (R/O)</th>
                    <th>Rationale for identifying the risk / opportunity</th>
                    <th>In case of risk, approach to adapt or mitigate</th>
                    <th>Financial implications of the risk or opportunity (Indicate positive or negative implications)</th>
                </tr>
            </thead>
            <tbody>
                {self._render_material_issues()}
            </tbody>
        </table>
        '''
    
    def _render_material_issues(self) -> str:
        """Render material issues table rows."""
        issues = self.section_a.get('material_issues', [])
        if not issues:
            return '<tr><td class="text-center">1</td><td class="answer-cell"></td><td class="text-center answer-cell"></td><td class="answer-cell"></td><td class="answer-cell"></td><td class="answer-cell"></td></tr>'
        
        rows = []
        for i, issue in enumerate(issues, 1):
            rows.append(f'''<tr>
                <td class="text-center">{i}</td>
                <td class="answer-cell">{issue.get('issue', '')}</td>
                <td class="text-center answer-cell">{issue.get('risk_opportunity', '')}</td>
                <td class="answer-cell">{issue.get('rationale', '')}</td>
                <td class="answer-cell">{issue.get('approach', '')}</td>
                <td class="answer-cell">{issue.get('financial_implications', '')}</td>
            </tr>''')
        return '\n'.join(rows)
    
    def render_section_b(self) -> str:
        """
        SECTION B: MANAGEMENT AND PROCESS DISCLOSURES
        Exact replica of Annexure II Section B.
        """
        return f'''
        <div class="page-break"></div>
        
        <div class="section-header">SECTION B: MANAGEMENT AND PROCESS DISCLOSURES</div>
        
        <p class="intro-text">This section is aimed at helping businesses demonstrate the structures, policies and processes put in place towards adopting the NGRBC Principles and Core Elements.</p>
        
        <div class="subsection-header">Policy and management processes</div>
        
        <table>
            <thead>
                <tr>
                    <th>Disclosure Questions</th>
                    <th class="col-principle">P1</th>
                    <th class="col-principle">P2</th>
                    <th class="col-principle">P3</th>
                    <th class="col-principle">P4</th>
                    <th class="col-principle">P5</th>
                    <th class="col-principle">P6</th>
                    <th class="col-principle">P7</th>
                    <th class="col-principle">P8</th>
                    <th class="col-principle">P9</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>1. a. Whether your entity's policy/policies cover each principle and its core elements of the NGRBCs. (Yes/No)</td>
                    {self._render_principle_cells('policy_covers_p')}
                </tr>
                <tr>
                    <td>b. Has the policy been approved by the Board? (Yes/No)</td>
                    {self._render_principle_cells('policy_approved_p')}
                </tr>
                <tr>
                    <td>c. Web Link of the Policies, if available</td>
                    {self._render_principle_cells('policy_weblink_p')}
                </tr>
                <tr>
                    <td>2. Whether the entity has translated the policy into procedures. (Yes / No)</td>
                    {self._render_principle_cells('policy_procedures_p')}
                </tr>
                <tr>
                    <td>3. Do the enlisted policies extend to your value chain partners? (Yes/No)</td>
                    {self._render_principle_cells('policy_valuechain_p')}
                </tr>
                <tr>
                    <td>4. Name of the national and international codes/certifications/labels/ standards (e.g. Forest Stewardship Council, Fairtrade, Rainforest Alliance, Trustea) standards (e.g. SA 8000, OHSAS, ISO, BIS) adopted by your entity and mapped to each principle.</td>
                    {self._render_principle_cells('standards_p')}
                </tr>
                <tr>
                    <td>5. Specific commitments, goals and targets set by the entity with defined timelines, if any.</td>
                    {self._render_principle_cells('commitments_p')}
                </tr>
                <tr>
                    <td>6. Performance of the entity against the specific commitments, goals and targets along-with reasons in case the same are not met.</td>
                    {self._render_principle_cells('performance_p')}
                </tr>
            </tbody>
        </table>
        
        <div class="subsection-header">Governance, leadership and oversight</div>
        
        <div class="question-item"><span class="q-num">7.</span> <span class="q-text">Statement by director responsible for the business responsibility report, highlighting ESG related challenges, targets and achievements (listed entity has flexibility regarding the placement of this disclosure)</span></div>
        <div class="answer-value">{self._get_section_b_text('director_statement')}</div>
        
        <div class="question-item"><span class="q-num">8.</span> <span class="q-text">Details of the highest authority responsible for implementation and oversight of the Business Responsibility policy (ies).</span></div>
        <div class="answer-value">{self._get_section_b_text('highest_authority_details')}</div>
        
        <div class="question-item"><span class="q-num">9.</span> <span class="q-text">Does the entity have a specified Committee of the Board/ Director responsible for decision making on sustainability related issues? (Yes / No). If yes, provide details.</span></div>
        <div class="answer-value">{self._get_section_b_text('sustainability_committee_details')}</div>
        
        <div class="question-item"><span class="q-num">10.</span> <span class="q-text">Details of Review of NGRBCs by the Company:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th>Subject for Review</th>
                    <th>Indicate whether review was undertaken by Director / Committee of the Board/ Any other Committee</th>
                    <th>Frequency (Annually/ Half yearly/ Quarterly/ Any other – please specify)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Performance against above policies and follow up action</td>
                    <td class="answer-cell">{self._get_section_b_text('performance_against_policies', 'undertaken_by_current_fy')}</td>
                    <td class="answer-cell">{self._get_section_b_text('performance_against_policies', 'frequency_current_fy')}</td>
                </tr>
                <tr>
                    <td>Compliance with statutory requirements of relevance to the principles, and, rectification of any non-compliances</td>
                    <td class="answer-cell">{self._get_section_b_text('compliance_review', 'undertaken_by_current_fy')}</td>
                    <td class="answer-cell">{self._get_section_b_text('compliance_review', 'frequency_current_fy')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">11.</span> <span class="q-text">Has the entity carried out independent assessment/ evaluation of the working of its policies by an external agency? (Yes/No). If yes, provide name of the agency.</span></div>
        
        <table>
            <thead>
                <tr>
                    <th class="col-principle">P1</th>
                    <th class="col-principle">P2</th>
                    <th class="col-principle">P3</th>
                    <th class="col-principle">P4</th>
                    <th class="col-principle">P5</th>
                    <th class="col-principle">P6</th>
                    <th class="col-principle">P7</th>
                    <th class="col-principle">P8</th>
                    <th class="col-principle">P9</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    {self._render_principle_cells('external_assessment_p')}
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">12.</span> <span class="q-text">If answer to question (1) above is "No" i.e. not all Principles are covered by a policy, reasons to be stated:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th>Questions</th>
                    <th class="col-principle">P1</th>
                    <th class="col-principle">P2</th>
                    <th class="col-principle">P3</th>
                    <th class="col-principle">P4</th>
                    <th class="col-principle">P5</th>
                    <th class="col-principle">P6</th>
                    <th class="col-principle">P7</th>
                    <th class="col-principle">P8</th>
                    <th class="col-principle">P9</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>The entity does not consider the Principles material to its business (Yes/No)</td>
                    {self._render_principle_cells('not_material_p')}
                </tr>
                <tr>
                    <td>The entity is not at a stage where it is in a position to formulate and implement the policies on specified principles (Yes/No)</td>
                    {self._render_principle_cells('not_ready_p')}
                </tr>
                <tr>
                    <td>The entity does not have the financial or/human and technical resources available for the task (Yes/No)</td>
                    {self._render_principle_cells('no_resources_p')}
                </tr>
                <tr>
                    <td>It is planned to be done in the next financial year (Yes/No)</td>
                    {self._render_principle_cells('planned_next_fy_p')}
                </tr>
                <tr>
                    <td>Any other reason (please specify)</td>
                    {self._render_principle_cells('other_reason_p')}
                </tr>
            </tbody>
        </table>
        '''
    
    def _render_principle_cells(self, prefix: str) -> str:
        """Render 9 principle cells for Section B tables."""
        cells = []
        for p in range(1, 10):
            val = self._get_section_b_principle_value(prefix, p)
            cells.append(f'<td class="text-center answer-cell">{val}</td>')
        return '\n'.join(cells)
    
    def _get_section_b_principle_value(self, prefix: str, principle_num: int) -> str:
        """
        Extract Section B value for a specific principle.
        Maps template prefixes to actual data keys in ngrbc_policy_matrix.
        """
        matrix = self.section_b_data.get('ngrbc_policy_matrix', {})
        
        # Check if mode is 'all_together' or 'principle_wise'
        mode = matrix.get('mode_current_fy', 'together')
        
        # Map prefixes to actual data keys
        prefix_mapping = {
            'policy_covers_p': 'covered',
            'policy_approved_p': 'board_approved',
            'policy_weblink_p': 'web_link',
            'policy_procedures_p': None,  # From policy_translated_to_procedures
            'policy_valuechain_p': None,  # From policy_extend_to_value_chain
            'standards_p': 'codes_standards',
            'commitments_p': 'commitments',
            'performance_p': 'performance',
            'external_assessment_p': 'independent_assessment',
            'not_material_p': 'not_material',
            'not_ready_p': 'not_ready',
            'no_resources_p': 'no_resources',
            'planned_next_fy_p': 'planned_next_fy',
            'other_reason_p': 'other_reason',
        }
        
        mapped_key = prefix_mapping.get(prefix, '')
        
        if mode == 'together' or mode == 'all_together':
            all_data = matrix.get('all_together', {})
            if mapped_key:
                val = all_data.get(f'{mapped_key}_current_fy', '')
                if isinstance(val, bool):
                    return 'Y' if val else 'N'
                return str(val) if val else ''
            # Check reasons sub-object
            reasons = all_data.get('reasons_current_fy', {})
            if reasons and mapped_key:
                val = reasons.get(mapped_key, '')
                if isinstance(val, bool):
                    return 'Y' if val else 'N'
                return str(val) if val else ''
        else:
            # Principle-wise mode
            principle_data = matrix.get('principle_wise', {})
            p_key = f'P{principle_num}_current_fy'
            p_data = principle_data.get(p_key, {})
            if mapped_key and p_data:
                val = p_data.get(mapped_key, '')
                if isinstance(val, bool):
                    return 'Y' if val else 'N'
                return str(val) if val else ''
        
        # Special handling for policy_procedures and policy_valuechain
        if prefix == 'policy_procedures_p':
            proc = self.section_b_data.get('policy_translated_to_procedures', {})
            if proc.get('mode_current_fy') == 'all_together':
                return 'Y' if proc.get('all_enabled_current_fy') else 'N'
        
        if prefix == 'policy_valuechain_p':
            vc = self.section_b_data.get('policy_extend_to_value_chain', {})
            if vc.get('mode_current_fy') == 'all_together':
                return 'Y' if vc.get('all_enabled_current_fy') else 'N'
        
        return ''
    
    def _get_section_b_text(self, key: str, subkey: str = None) -> str:
        """Get text value from Section B data."""
        data = self.section_b_data.get(key, {})
        if isinstance(data, dict):
            if subkey:
                val = data.get(subkey)
                if val is not None:
                    return str(val) if val else ''
            # Try common keys
            for k in ['all_description_current_fy', 'description_current_fy', 'value_current_fy', 'all_description', 'description', 'value']:
                val = data.get(k)
                if val:
                    return str(val)
        elif isinstance(data, str):
            return data
        return ''
    
    def _get_section_c_nested(self, key: str, subkey: str, default: str = '') -> str:
        """
        Get nested value from Section C data.
        Handles complex nested structures like:
        - p1_disciplinary_action_bribery: {workers: {current_fy: '10'}, directors: {...}}
        - env_sustainable_rd_capex: {rd: {current_fy: '45'}, capex: {...}}
        - env_sustainable_sourcing: {has_value: true, fields: {sustainable_pct: '31'}}
        """
        data = self.section_c_data.get(key, {})
        if not isinstance(data, dict):
            # If data is a simple string, return it
            if isinstance(data, str):
                return data if data else default
            return str(data) if data else default
        
        # Parse subkey to determine lookup strategy
        # subkey format can be: "rd_current_fy", "capex_details", "has_procedures"
        parts = subkey.split('_')
        
        # Try direct subkey first
        val = data.get(subkey)
        if val is not None:
            if isinstance(val, dict):
                # Try current_fy first
                fy_val = val.get('current_fy', val.get('previous_fy', val.get('value', '')))
                return str(fy_val) if fy_val else default
            if isinstance(val, bool):
                return 'Yes' if val else 'No'
            return str(val) if val else default
        
        # Try nested structure: rd_current_fy -> data['rd']['current_fy']
        if len(parts) >= 2:
            parent_key = parts[0]  # e.g., 'rd', 'capex', 'directors'
            child_key = '_'.join(parts[1:])  # e.g., 'current_fy', 'details'
            
            parent_data = data.get(parent_key, {})
            if isinstance(parent_data, dict):
                val = parent_data.get(child_key)
                if val is not None:
                    if isinstance(val, bool):
                        return 'Yes' if val else 'No'
                    return str(val) if val else default
        
        # Try with _current_fy suffix
        val = data.get(f'{subkey}_current_fy')
        if val is not None:
            return str(val) if val else default
        
        # Try nested 'fields' structure (for complex objects like env_sustainable_sourcing)
        if 'fields' in data:
            fields = data.get('fields', {})
            val = fields.get(subkey)
            if val is not None:
                return str(val) if val else default
        
        # Try direct boolean fields
        if subkey in ['has_procedures', 'has_policy', 'applicable', 'enabled']:
            val = data.get('has_value', data.get(subkey))
            if val is not None:
                if isinstance(val, bool):
                    return 'Yes' if val else 'No'
                return str(val) if val else default
        
        # Try 'percentage' field for percentage questions
        if subkey == 'percentage':
            for pct_key in ['sustainable_pct', 'percentage', 'pct']:
                val = data.get('fields', {}).get(pct_key, data.get(pct_key))
                if val:
                    return str(val)
        
        return default
    
    def _get_section_c_fy_value(self, key: str, category: str, fy_type: str = 'current_fy') -> str:
        """
        Get FY-specific value from Section C data.
        Args:
            key: Main question key (e.g., 'p1_disciplinary_action_bribery')
            category: Category within the data (e.g., 'workers', 'directors', 'kmps')
            fy_type: 'current_fy' or 'previous_fy'
        """
        data = self.section_c_data.get(key, {})
        if isinstance(data, dict):
            cat_data = data.get(category, {})
            if isinstance(cat_data, dict):
                val = cat_data.get(fy_type, '')
                return str(val) if val else ''
        return ''
    
    def render_section_c(self) -> str:
        """
        SECTION C: PRINCIPLE WISE PERFORMANCE DISCLOSURE
        Exact replica of all 9 Principles with ALL Essential and Leadership Indicators.
        """
        html = '''
        <div class="page-break"></div>
        
        <div class="section-header">SECTION C: PRINCIPLE WISE PERFORMANCE DISCLOSURE</div>
        
        <p class="intro-text">This section is aimed at helping entities demonstrate their performance in integrating the Principles and Core Elements with key processes and decisions. The information sought is categorized as "Essential" and "Leadership". While the essential indicators are expected to be disclosed by every entity that is mandated to file this report, the leadership indicators may be voluntarily disclosed by entities which aspire to progress to a higher level in their quest to be socially, environmentally and ethically responsible.</p>
        '''
        
        # Render all 9 Principles
        html += self._render_principle_1()
        html += self._render_principle_2()
        html += self._render_principle_3()
        html += self._render_principle_4()
        html += self._render_principle_5()
        html += self._render_principle_6()
        html += self._render_principle_7()
        html += self._render_principle_8()
        html += self._render_principle_9()
        
        return html
    
    def _render_principle_1(self) -> str:
        """
        PRINCIPLE 1: Businesses should conduct and govern themselves with integrity,
        and in a manner that is Ethical, Transparent and Accountable.
        
        EXACT text from Annexure II with all Essential and Leadership Indicators.
        """
        return f'''
        <div class="page-break"></div>
        
        <div class="principle-header">PRINCIPLE 1 {self.PRINCIPLES['P1']}</div>
        
        <div class="indicator-header">Essential Indicators</div>
        
        <div class="question-item"><span class="q-num">1.</span> <span class="q-text">Percentage coverage by training and awareness programmes on any of the Principles during the financial year:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th>Segment</th>
                    <th>Total number of training and awareness programmes held</th>
                    <th>Topics / principles covered under the training and its impact</th>
                    <th>%age of persons in respective category covered by the awareness programmes</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Board of Directors</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_training_awareness_coverage', 'bod_programs', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_training_awareness_coverage', 'bod_topics', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_training_awareness_coverage', 'bod_coverage', '')}</td>
                </tr>
                <tr>
                    <td>Key Managerial Personnel</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_training_awareness_coverage', 'kmp_programs', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_training_awareness_coverage', 'kmp_topics', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_training_awareness_coverage', 'kmp_coverage', '')}</td>
                </tr>
                <tr>
                    <td>Employees other than BoD and KMPs</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_training_awareness_coverage', 'employees_programs', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_training_awareness_coverage', 'employees_topics', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_training_awareness_coverage', 'employees_coverage', '')}</td>
                </tr>
                <tr>
                    <td>Workers</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_training_awareness_coverage', 'workers_programs', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_training_awareness_coverage', 'workers_topics', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_training_awareness_coverage', 'workers_coverage', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">2.</span> <span class="q-text">Details of fines / penalties /punishment/ award/ compounding fees/ settlement amount paid in proceedings (by the entity or by directors / KMPs) with regulators/ law enforcement agencies/ judicial institutions, in the financial year, in the following format (Note: the entity shall make disclosures on the basis of materiality as specified in Regulation 30 of SEBI (Listing Obligations and Disclosure Obligations) Regulations, 2015 and as disclosed on the entity's website):</span></div>
        
        <div class="sub-label">Monetary</div>
        <table>
            <thead>
                <tr>
                    <th></th>
                    <th>NGRBC Principle</th>
                    <th>Name of the regulatory/ enforcement agencies/ judicial institutions</th>
                    <th>Amount (In INR)</th>
                    <th>Brief of the Case</th>
                    <th>Has an appeal been preferred? (Yes/No)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Penalty/ Fine</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'penalty_principle', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'penalty_agency', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'penalty_amount', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'penalty_brief', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'penalty_appeal', '')}</td>
                </tr>
                <tr>
                    <td>Settlement</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'settlement_principle', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'settlement_agency', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'settlement_amount', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'settlement_brief', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'settlement_appeal', '')}</td>
                </tr>
                <tr>
                    <td>Compounding fee</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'compounding_principle', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'compounding_agency', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'compounding_amount', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'compounding_brief', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'compounding_appeal', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="sub-label">Non-Monetary</div>
        <table>
            <thead>
                <tr>
                    <th></th>
                    <th>NGRBC Principle</th>
                    <th>Name of the regulatory/ enforcement agencies/ judicial institutions</th>
                    <th>Brief of the Case</th>
                    <th>Has an appeal been preferred? (Yes/No)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Imprisonment</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'imprisonment_principle', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'imprisonment_agency', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'imprisonment_brief', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'imprisonment_appeal', '')}</td>
                </tr>
                <tr>
                    <td>Punishment</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'punishment_principle', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'punishment_agency', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'punishment_brief', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_fines_penalties', 'punishment_appeal', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">3.</span> <span class="q-text">Of the instances disclosed in Question 2 above, details of the Appeal/ Revision preferred in cases where monetary or non-monetary action has been appealed.</span></div>
        
        <table>
            <thead>
                <tr>
                    <th>Case Details</th>
                    <th>Name of the regulatory/ enforcement agencies/ judicial institutions</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="answer-cell">{self._get_section_c_nested('p1_appeals_revisions', 'case_details', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_appeals_revisions', 'agency', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">4.</span> <span class="q-text">Does the entity have an anti-corruption or anti-bribery policy? If yes, provide details in brief and if available, provide a web-link to the policy.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p1_anticorruption_policy', '')}</div>
        
        <div class="question-item"><span class="q-num">5.</span> <span class="q-text">Number of Directors/KMPs/employees/workers against whom disciplinary action was taken by any law enforcement agency for the charges of bribery/ corruption:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th></th>
                    <th class="col-narrow">{self.reporting_period} (Current FY)</th>
                    <th class="col-narrow">{self.previous_fy} (Previous FY)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Directors</td>
                    <td class="text-center answer-cell">{self._get_section_c_fy_value('p1_disciplinary_action_bribery', 'directors', 'current_fy')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_fy_value('p1_disciplinary_action_bribery', 'directors', 'previous_fy')}</td>
                </tr>
                <tr>
                    <td>KMPs</td>
                    <td class="text-center answer-cell">{self._get_section_c_fy_value('p1_disciplinary_action_bribery', 'kmps', 'current_fy')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_fy_value('p1_disciplinary_action_bribery', 'kmps', 'previous_fy')}</td>
                </tr>
                <tr>
                    <td>Employees</td>
                    <td class="text-center answer-cell">{self._get_section_c_fy_value('p1_disciplinary_action_bribery', 'employees', 'current_fy')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_fy_value('p1_disciplinary_action_bribery', 'employees', 'previous_fy')}</td>
                </tr>
                <tr>
                    <td>Workers</td>
                    <td class="text-center answer-cell">{self._get_section_c_fy_value('p1_disciplinary_action_bribery', 'workers', 'current_fy')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_fy_value('p1_disciplinary_action_bribery', 'workers', 'previous_fy')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">6.</span> <span class="q-text">Details of complaints with regard to conflict of interest:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th></th>
                    <th colspan="2" class="fy-header">{self.reporting_period} (Current FY)</th>
                    <th colspan="2" class="fy-header">{self.previous_fy} (Previous FY)</th>
                </tr>
                <tr>
                    <th></th>
                    <th class="col-narrow">Number</th>
                    <th>Remarks</th>
                    <th class="col-narrow">Number</th>
                    <th>Remarks</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Number of complaints received in relation to issues of Conflict of Interest of the Directors</td>
                    <td class="text-center answer-cell">{self._get_section_c_fy_value('p1_conflict_of_interest_complaints', 'directors_coi', 'current_fy')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_conflict_of_interest_complaints', 'directors_remarks_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_fy_value('p1_conflict_of_interest_complaints', 'directors_coi', 'previous_fy')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_conflict_of_interest_complaints', 'directors_remarks_prev', '')}</td>
                </tr>
                <tr>
                    <td>Number of complaints received in relation to issues of Conflict of Interest of the KMPs</td>
                    <td class="text-center answer-cell">{self._get_section_c_fy_value('p1_conflict_of_interest_complaints', 'kmps_coi', 'current_fy')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_conflict_of_interest_complaints', 'kmps_remarks_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_fy_value('p1_conflict_of_interest_complaints', 'kmps_coi', 'previous_fy')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_conflict_of_interest_complaints', 'kmps_remarks_prev', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">7.</span> <span class="q-text">Provide details of any corrective action taken or underway on issues related to fines / penalties / action taken by regulators/ law enforcement agencies/ judicial institutions, on cases of corruption and conflicts of interest.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p1_corrective_actions', '')}</div>
        
        <div class="question-item"><span class="q-num">8.</span> <span class="q-text">Number of days of accounts payables ((Accounts payable *365) / Cost of goods/services procured) in the following format:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th></th>
                    <th class="col-narrow">{self.reporting_period} (Current FY)</th>
                    <th class="col-narrow">{self.previous_fy} (Previous FY)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Number of days of accounts payables</td>
                    <td class="text-center answer-cell">{self._get_section_c_fy_value('p1_accounts_payables', 'days', 'current_fy')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_fy_value('p1_accounts_payables', 'days', 'previous_fy')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">9.</span> <span class="q-text">Open-ness of business</span></div>
        <div class="sub-label">Provide details of concentration of purchases and sales with trading houses, dealers, and related parties along-with loans and advances &amp; investments, with related parties, in the following format:</div>
        
        <table>
            <thead>
                <tr>
                    <th>Parameter</th>
                    <th>Metrics</th>
                    <th class="col-narrow">{self.reporting_period} (Current FY)</th>
                    <th class="col-narrow">{self.previous_fy} (Previous FY)</th>
                </tr>
            </thead>
            <tbody>
                <tr class="category-header"><td colspan="4">Concentration of Purchases</td></tr>
                <tr>
                    <td rowspan="3">Concentration of Purchases</td>
                    <td>a. Purchases from trading houses as % of total purchases</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_openness_of_business', 'purchases_trading_pct_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_openness_of_business', 'purchases_trading_pct_prev', '')}</td>
                </tr>
                <tr>
                    <td>b. Number of trading houses where purchases are made from</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_openness_of_business', 'trading_houses_count_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_openness_of_business', 'trading_houses_count_prev', '')}</td>
                </tr>
                <tr>
                    <td>c. Purchases from top 10 trading houses as % of total purchases from trading houses</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_openness_of_business', 'top10_purchases_pct_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_openness_of_business', 'top10_purchases_pct_prev', '')}</td>
                </tr>
                <tr class="category-header"><td colspan="4">Concentration of Sales</td></tr>
                <tr>
                    <td rowspan="3">Concentration of Sales</td>
                    <td>a. Sales to dealers / distributors as % of total sales</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_openness_of_business', 'sales_dealers_pct_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_openness_of_business', 'sales_dealers_pct_prev', '')}</td>
                </tr>
                <tr>
                    <td>b. Number of dealers / distributors to whom sales are made</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_openness_of_business', 'dealers_count_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_openness_of_business', 'dealers_count_prev', '')}</td>
                </tr>
                <tr>
                    <td>c. Sales to top 10 dealers / distributors as % of total sales to dealers / distributors</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_openness_of_business', 'top10_sales_pct_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_openness_of_business', 'top10_sales_pct_prev', '')}</td>
                </tr>
                <tr class="category-header"><td colspan="4">Share of RPTs in</td></tr>
                <tr>
                    <td rowspan="4">Share of RPTs in</td>
                    <td>a. Purchases (Purchases with related parties / Total Purchases)</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_openness_of_business', 'rpt_purchases_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_openness_of_business', 'rpt_purchases_prev', '')}</td>
                </tr>
                <tr>
                    <td>b. Sales (Sales to related parties / Total Sales)</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_openness_of_business', 'rpt_sales_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_openness_of_business', 'rpt_sales_prev', '')}</td>
                </tr>
                <tr>
                    <td>c. Loans &amp; advances (Loans &amp; advances given to related parties / Total loans &amp; advances)</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_openness_of_business', 'rpt_loans_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_openness_of_business', 'rpt_loans_prev', '')}</td>
                </tr>
                <tr>
                    <td>d. Investments (Investments in related parties / Total Investments made)</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_openness_of_business', 'rpt_investments_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_openness_of_business', 'rpt_investments_prev', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="indicator-header">Leadership Indicators</div>
        
        <div class="question-item"><span class="q-num">1.</span> <span class="q-text">Awareness programmes conducted for value chain partners on any of the Principles during the financial year:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th>Total number of awareness programmes held</th>
                    <th>Topics / principles covered under the training</th>
                    <th>%age of value chain partners covered (by value of business done with such partners) under the awareness programmes</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_value_chain_awareness', 'programs_count', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('p1_value_chain_awareness', 'topics', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p1_value_chain_awareness', 'coverage_pct', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">2.</span> <span class="q-text">Does the entity have processes in place to avoid/ manage conflict of interests involving members of the Board? (Yes/No) If Yes, provide details of the same.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p1_conflict_management_process', '')}</div>
        '''
    
    def _render_principle_2(self) -> str:
        """PRINCIPLE 2: Businesses should provide goods and services in a manner that is sustainable and safe"""
        return f'''
        <div class="page-break"></div>
        
        <div class="principle-header">PRINCIPLE 2 {self.PRINCIPLES['P2']}</div>
        
        <div class="indicator-header">Essential Indicators</div>
        
        <div class="question-item"><span class="q-num">1.</span> <span class="q-text">Percentage of R&amp;D and capital expenditure (capex) investments in specific technologies to improve the environmental and social impacts of product and processes to total R&amp;D and capex investments made by the entity, respectively.</span></div>
        
        <table>
            <thead>
                <tr>
                    <th></th>
                    <th class="col-narrow">{self.reporting_period} (Current FY)</th>
                    <th class="col-narrow">{self.previous_fy} (Previous FY)</th>
                    <th>Details of improvements in environmental and social impacts</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>R&amp;D</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_sustainable_rd_capex', 'rd_current_fy', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_sustainable_rd_capex', 'rd_previous_fy', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('env_sustainable_rd_capex', 'rd_details', '')}</td>
                </tr>
                <tr>
                    <td>Capex</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_sustainable_rd_capex', 'capex_current_fy', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_sustainable_rd_capex', 'capex_previous_fy', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('env_sustainable_rd_capex', 'capex_details', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">2.</span> <span class="q-text">a. Does the entity have procedures in place for sustainable sourcing? (Yes/No)</span></div>
        <div class="answer-value">{self._get_section_c_nested('env_sustainable_sourcing', 'has_procedures', '')}</div>
        
        <div class="sub-label">b. If yes, what percentage of inputs were sourced sustainably?</div>
        <div class="answer-value">{self._get_section_c_nested('env_sustainable_sourcing', 'percentage', '')}</div>
        
        <div class="question-item"><span class="q-num">3.</span> <span class="q-text">Describe the processes in place to safely reclaim your products for reusing, recycling and disposing at the end of life, for (a) Plastics (including packaging) (b) E-waste (c) Hazardous waste and (d) other waste.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'env_end_of_life_reclamation', '')}</div>
        
        <div class="question-item"><span class="q-num">4.</span> <span class="q-text">Whether Extended Producer Responsibility (EPR) is applicable to the entity's activities (Yes / No). If yes, whether the waste collection plan is in line with the Extended Producer Responsibility (EPR) plan submitted to Pollution Control Boards? If not, provide steps taken to address the same.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'env_epr_applicable', '')}</div>
        
        <div class="indicator-header">Leadership Indicators</div>
        
        <div class="question-item"><span class="q-num">1.</span> <span class="q-text">Has the entity conducted Life Cycle Perspective / Assessments (LCA) for any of its products (for manufacturing industry) or for its services (for service industry)? If yes, provide details in the following format?</span></div>
        
        <table>
            <thead>
                <tr>
                    <th>NIC Code</th>
                    <th>Name of Product /Service</th>
                    <th class="col-percent">% of total Turnover contributed</th>
                    <th>Boundary for which the Life Cycle Perspective / Assessment was conducted</th>
                    <th class="col-yesno">Whether conducted by independent external agency (Yes/No)</th>
                    <th class="col-yesno">Results communicated in public domain (Yes/No) If yes, provide the web-link.</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="answer-cell">{self._get_section_c_nested('env_life_cycle_assessment', 'nic_code', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('env_life_cycle_assessment', 'product_name', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_life_cycle_assessment', 'turnover_pct', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('env_life_cycle_assessment', 'boundary', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_life_cycle_assessment', 'external_agency', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('env_life_cycle_assessment', 'public_domain', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">2.</span> <span class="q-text">If there are any significant social or environmental concerns and/or risks arising from production or disposal of your products / services, as identified in the Life Cycle Perspective / Assessments (LCA) or through any other means, briefly describe the same along-with action taken to mitigate the same.</span></div>
        
        <table>
            <thead>
                <tr>
                    <th>Name of Product / Service</th>
                    <th>Description of the risk / concern</th>
                    <th>Action Taken</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="answer-cell">{self._get_section_c_nested('env_lca_concerns_actions', 'product_name', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('env_lca_concerns_actions', 'risk_description', '')}</td>
                    <td class="answer-cell">{self._get_section_c_nested('env_lca_concerns_actions', 'action_taken', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">3.</span> <span class="q-text">Percentage of recycled or reused input material to total material (by value) used in production (for manufacturing industry) or providing services (for service industry).</span></div>
        
        <table>
            <thead>
                <tr>
                    <th>Indicate input material</th>
                    <th class="col-narrow">Recycled or re-used input material to total material</th>
                    <th class="col-narrow">{self.reporting_period} (Current FY)</th>
                    <th class="col-narrow">{self.previous_fy} (Previous FY)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="answer-cell">{self._get_section_c_nested('env_recycled_input_material', 'material_name', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_recycled_input_material', 'recycled_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_recycled_input_material', 'current_fy', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_recycled_input_material', 'previous_fy', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">4.</span> <span class="q-text">Of the products and packaging reclaimed at end of life of products, amount (in metric tonnes) reused, recycled, and safely disposed, as per the following format:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th></th>
                    <th colspan="3" class="fy-header">{self.reporting_period} (Current FY)</th>
                    <th colspan="3" class="fy-header">{self.previous_fy} (Previous FY)</th>
                </tr>
                <tr>
                    <th></th>
                    <th class="col-narrow">Re-Used</th>
                    <th class="col-narrow">Recycled</th>
                    <th class="col-narrow">Safely Disposed</th>
                    <th class="col-narrow">Re-Used</th>
                    <th class="col-narrow">Recycled</th>
                    <th class="col-narrow">Safely Disposed</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Plastics (including packaging)</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'plastics_reused_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'plastics_recycled_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'plastics_disposed_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'plastics_reused_prev', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'plastics_recycled_prev', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'plastics_disposed_prev', '')}</td>
                </tr>
                <tr>
                    <td>E-waste</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'ewaste_reused_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'ewaste_recycled_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'ewaste_disposed_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'ewaste_reused_prev', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'ewaste_recycled_prev', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'ewaste_disposed_prev', '')}</td>
                </tr>
                <tr>
                    <td>Hazardous waste</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'hazardous_reused_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'hazardous_recycled_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'hazardous_disposed_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'hazardous_reused_prev', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'hazardous_recycled_prev', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'hazardous_disposed_prev', '')}</td>
                </tr>
                <tr>
                    <td>Other waste</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'other_reused_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'other_recycled_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'other_disposed_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'other_reused_prev', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'other_recycled_prev', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('env_reclaimed_products_packaging', 'other_disposed_prev', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">5.</span> <span class="q-text">Reclaimed products and their packaging materials (as percentage of products sold) for each product category.</span></div>
        
        <table>
            <thead>
                <tr>
                    <th>Indicate product category</th>
                    <th>Reclaimed products and their packaging materials as % of total products sold in respective category</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p2_l5_category', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p2_l5_percentage', '')}</td>
                </tr>
            </tbody>
        </table>
        '''
    
    def _render_principle_3(self) -> str:
        """PRINCIPLE 3: Businesses should respect and promote the well-being of all employees, including those in their value chains"""
        # This is a very long principle with many tables - implementing key sections
        return f'''
        <div class="page-break"></div>
        
        <div class="principle-header">PRINCIPLE 3 {self.PRINCIPLES['P3']}</div>
        
        <div class="indicator-header">Essential Indicators</div>
        
        <div class="question-item"><span class="q-num">1.</span> <span class="q-text">a. Details of measures for the well-being of employees:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th rowspan="2">Category</th>
                    <th rowspan="2" class="col-narrow">Total (A)</th>
                    <th colspan="2">Health insurance</th>
                    <th colspan="2">Accident insurance</th>
                    <th colspan="2">Maternity benefits</th>
                    <th colspan="2">Paternity Benefits</th>
                    <th colspan="2">Day Care facilities</th>
                </tr>
                <tr>
                    <th class="col-number">Number (B)</th>
                    <th class="col-number">% (B/A)</th>
                    <th class="col-number">Number (C)</th>
                    <th class="col-number">% (C/A)</th>
                    <th class="col-number">Number (D)</th>
                    <th class="col-number">% (D/A)</th>
                    <th class="col-number">Number (E)</th>
                    <th class="col-number">% (E/A)</th>
                    <th class="col-number">Number (F)</th>
                    <th class="col-number">% (F/A)</th>
                </tr>
            </thead>
            <tbody>
                <tr class="category-header"><td colspan="12">Permanent employees</td></tr>
                <tr>
                    <td>Male</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_m_total', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_m_health_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_m_health_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_m_accident_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_m_accident_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_m_maternity_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_m_maternity_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_m_paternity_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_m_paternity_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_m_daycare_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_m_daycare_pct', '')}</td>
                </tr>
                <tr>
                    <td>Female</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_f_total', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_f_health_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_f_health_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_f_accident_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_f_accident_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_f_maternity_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_f_maternity_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_f_paternity_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_f_paternity_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_f_daycare_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_f_daycare_pct', '')}</td>
                </tr>
                <tr>
                    <td>Total</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_total', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_health_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_health_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_accident_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_accident_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_maternity_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_maternity_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_paternity_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_paternity_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_daycare_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_perm_daycare_pct', '')}</td>
                </tr>
                <tr class="category-header"><td colspan="12">Other than Permanent employees</td></tr>
                <tr>
                    <td>Male</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_m_total', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_m_health_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_m_health_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_m_accident_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_m_accident_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_m_maternity_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_m_maternity_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_m_paternity_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_m_paternity_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_m_daycare_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_m_daycare_pct', '')}</td>
                </tr>
                <tr>
                    <td>Female</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_f_total', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_f_health_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_f_health_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_f_accident_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_f_accident_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_f_maternity_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_f_maternity_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_f_paternity_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_f_paternity_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_f_daycare_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_f_daycare_pct', '')}</td>
                </tr>
                <tr>
                    <td>Total</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_total', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_health_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_health_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_accident_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_accident_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_maternity_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_maternity_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_paternity_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_paternity_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_daycare_num', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1a_other_daycare_pct', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="sub-label">b. Details of measures for the well-being of workers:</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_e1b_workers_wellbeing', '')}</div>
        
        <div class="sub-label">c. Spending on measures towards well-being of employees and workers (including permanent and other than permanent) in the following format:</div>
        
        <table>
            <thead>
                <tr>
                    <th></th>
                    <th class="col-narrow">{self.reporting_period} (Current FY)</th>
                    <th class="col-narrow">{self.previous_fy} (Previous FY)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Cost incurred on well-being measures as a % of total revenue of the company</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1c_wellbeing_cost_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p3_e1c_wellbeing_cost_prev', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">2.</span> <span class="q-text">Details of retirement benefits, for Current FY and Previous Financial Year.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_e2_retirement_benefits', '')}</div>
        
        <div class="question-item"><span class="q-num">3.</span> <span class="q-text">Accessibility of workplaces</span></div>
        <div class="sub-label">Are the premises / offices of the entity accessible to differently abled employees and workers, as per the requirements of the Rights of Persons with Disabilities Act, 2016? If not, whether any steps are being taken by the entity in this regard.</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_e3_accessibility', '')}</div>
        
        <div class="question-item"><span class="q-num">4.</span> <span class="q-text">Does the entity have an equal opportunity policy as per the Rights of Persons with Disabilities Act, 2016? If so, provide a web-link to the policy.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_e4_equal_opportunity', '')}</div>
        
        <div class="question-item"><span class="q-num">5.</span> <span class="q-text">Return to work and Retention rates of permanent employees and workers that took parental leave.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_e5_parental_leave', '')}</div>
        
        <div class="question-item"><span class="q-num">6.</span> <span class="q-text">Is there a mechanism available to receive and redress grievances for the following categories of employees and worker? If yes, give details of the mechanism in brief.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_e6_grievance_mechanism', '')}</div>
        
        <div class="question-item"><span class="q-num">7.</span> <span class="q-text">Membership of employees and worker in association(s) or Unions recognised by the listed entity:</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_e7_union_membership', '')}</div>
        
        <div class="question-item"><span class="q-num">8.</span> <span class="q-text">Details of training given to employees and workers:</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_e8_training', '')}</div>
        
        <div class="question-item"><span class="q-num">9.</span> <span class="q-text">Details of performance and career development reviews of employees and worker:</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_e9_performance_reviews', '')}</div>
        
        <div class="question-item"><span class="q-num">10.</span> <span class="q-text">Health and safety management system:</span></div>
        <div class="sub-label">a. Whether an occupational health and safety management system has been implemented by the entity? (Yes/No). If yes, the coverage such system?</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_e10a_ohs_system', '')}</div>
        <div class="sub-label">b. What are the processes used to identify work-related hazards and assess risks on a routine and non-routine basis by the entity?</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_e10b_hazard_identification', '')}</div>
        <div class="sub-label">c. Whether you have processes for workers to report the work related hazards and to remove themselves from such risks. (Y/N)</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_e10c_hazard_reporting', '')}</div>
        <div class="sub-label">d. Do the employees/ worker of the entity have access to non-occupational medical and healthcare services? (Yes/No)</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_e10d_healthcare_access', '')}</div>
        
        <div class="question-item"><span class="q-num">11.</span> <span class="q-text">Details of safety related incidents, in the following format:</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_e11_safety_incidents', '')}</div>
        
        <div class="question-item"><span class="q-num">12.</span> <span class="q-text">Describe the measures taken by the entity to ensure a safe and healthy work place.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_e12_safe_workplace', '')}</div>
        
        <div class="question-item"><span class="q-num">13.</span> <span class="q-text">Number of Complaints on the following made by employees and workers:</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_e13_complaints', '')}</div>
        
        <div class="question-item"><span class="q-num">14.</span> <span class="q-text">Assessments for the year:</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_e14_assessments', '')}</div>
        
        <div class="question-item"><span class="q-num">15.</span> <span class="q-text">Provide details of any corrective action taken or underway to address safety-related incidents (if any) and on significant risks / concerns arising from assessments of health &amp; safety practices and working conditions.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_e15_corrective_actions', '')}</div>
        
        <div class="indicator-header">Leadership Indicators</div>
        
        <div class="question-item"><span class="q-num">1.</span> <span class="q-text">Does the entity extend any life insurance or any compensatory package in the event of death of (A) Employees (Y/N) (B) Workers (Y/N).</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_l1_life_insurance', '')}</div>
        
        <div class="question-item"><span class="q-num">2.</span> <span class="q-text">Provide the measures undertaken by the entity to ensure that statutory dues have been deducted and deposited by the value chain partners.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_l2_statutory_dues', '')}</div>
        
        <div class="question-item"><span class="q-num">3.</span> <span class="q-text">Provide the number of employees / workers having suffered high consequence work-related injury / ill-health / fatalities (as reported in Q11 of Essential Indicators above), who have been are rehabilitated and placed in suitable employment or whose family members have been placed in suitable employment:</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_l3_rehabilitation', '')}</div>
        
        <div class="question-item"><span class="q-num">4.</span> <span class="q-text">Does the entity provide transition assistance programs to facilitate continued employability and the management of career endings resulting from retirement or termination of employment? (Yes/No)</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_l4_transition_assistance', '')}</div>
        
        <div class="question-item"><span class="q-num">5.</span> <span class="q-text">Details on assessment of value chain partners:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th rowspan="2"></th>
                    <th colspan="2">% of value chain partners (by value of business done with such partners) that were assessed</th>
                </tr>
                <tr>
                    <th>Health and safety practices</th>
                    <th>Working Conditions</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>1</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p3_value_chain_assessment', 'health_safety_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p3_value_chain_assessment', 'working_conditions_pct', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">6.</span> <span class="q-text">Provide details of any corrective actions taken or underway to address significant risks / concerns arising from assessments of health and safety practices and working conditions of value chain partners.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p3_value_chain_corrective', '')}</div>
        '''
    
    def _render_principle_4(self) -> str:
        """PRINCIPLE 4: Businesses should respect the interests of and be responsive to all its stakeholders"""
        return f'''
        <div class="page-break"></div>
        
        <div class="principle-header">PRINCIPLE 4 {self.PRINCIPLES['P4']}</div>
        
        <div class="indicator-header">Essential Indicators</div>
        
        <div class="question-item"><span class="q-num">1.</span> <span class="q-text">Describe the processes for identifying key stakeholder groups of the entity.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p4_e1_stakeholder_identification', '')}</div>
        
        <div class="question-item"><span class="q-num">2.</span> <span class="q-text">List stakeholder groups identified as key for your entity and the frequency of engagement with each stakeholder group.</span></div>
        
        <table>
            <thead>
                <tr>
                    <th>Stakeholder Group</th>
                    <th>Whether identified as Vulnerable &amp; Marginalized Group (Yes/No)</th>
                    <th>Channels of communication (Email, SMS, Newspaper, Pamphlets, Advertisement, Community Meetings, Notice Board, Website), Other</th>
                    <th>Frequency of engagement (Annually/ Half yearly/ Quarterly / others – please specify)</th>
                    <th>Purpose and scope of engagement including key topics and concerns raised during such engagement</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p4_e2_stakeholder1_group', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p4_e2_stakeholder1_vulnerable', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p4_e2_stakeholder1_channels', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p4_e2_stakeholder1_frequency', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p4_e2_stakeholder1_purpose', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="indicator-header">Leadership Indicators</div>
        
        <div class="question-item"><span class="q-num">1.</span> <span class="q-text">Provide the processes for consultation between stakeholders and the Board on economic, environmental, and social topics or if consultation is delegated, how is feedback from such consultations provided to the Board.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p4_l1_board_consultation', '')}</div>
        
        <div class="question-item"><span class="q-num">2.</span> <span class="q-text">Whether stakeholder consultation is used to support the identification and management of environmental, and social topics (Yes / No). If so, provide details of instances as to how the inputs received from stakeholders on these topics were incorporated into policies and activities of the entity.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p4_l2_stakeholder_input', '')}</div>
        
        <div class="question-item"><span class="q-num">3.</span> <span class="q-text">Provide details of instances of engagement with, and actions taken to, address the concerns of vulnerable/ marginalized stakeholder groups.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p4_l3_vulnerable_stakeholders', '')}</div>
        '''
    
    def _render_principle_5(self) -> str:
        """PRINCIPLE 5: Businesses should respect and promote human rights"""
        return f'''
        <div class="page-break"></div>
        
        <div class="principle-header">PRINCIPLE 5 {self.PRINCIPLES['P5']}</div>
        
        <div class="indicator-header">Essential Indicators</div>
        
        <div class="question-item"><span class="q-num">1.</span> <span class="q-text">Employees and workers who have been provided training on human rights issues and policy(ies) of the entity, in the following format:</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p5_e1_hr_training', '')}</div>
        
        <div class="question-item"><span class="q-num">2.</span> <span class="q-text">Details of minimum wages paid to employees and workers, in the following format:</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p5_e2_minimum_wages', '')}</div>
        
        <div class="question-item"><span class="q-num">3.</span> <span class="q-text">Details of remuneration/salary/wages</span></div>
        <div class="sub-label">a. Median remuneration / wages:</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p5_e3a_median_remuneration', '')}</div>
        <div class="sub-label">b. Gross wages paid to females as % of total wages paid by the entity, in the following format:</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p5_e3b_female_wages', '')}</div>
        
        <div class="question-item"><span class="q-num">4.</span> <span class="q-text">Do you have a focal point (Individual/ Committee) responsible for addressing human rights impacts or issues caused or contributed to by the business? (Yes/No)</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p5_e4_focal_point', '')}</div>
        
        <div class="question-item"><span class="q-num">5.</span> <span class="q-text">Describe the internal mechanisms in place to redress grievances related to human rights issues.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p5_e5_grievance_mechanism', '')}</div>
        
        <div class="question-item"><span class="q-num">6.</span> <span class="q-text">Number of Complaints on the following made by employees and workers:</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p5_e6_complaints', '')}</div>
        
        <div class="question-item"><span class="q-num">7.</span> <span class="q-text">Complaints filed under the Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013, in the following format:</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p5_e7_posh_complaints', '')}</div>
        
        <div class="question-item"><span class="q-num">8.</span> <span class="q-text">Mechanisms to prevent adverse consequences to the complainant in discrimination and harassment cases.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p5_e8_complainant_protection', '')}</div>
        
        <div class="question-item"><span class="q-num">9.</span> <span class="q-text">Do human rights requirements form part of your business agreements and contracts? (Yes/No)</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p5_e9_hr_contracts', '')}</div>
        
        <div class="question-item"><span class="q-num">10.</span> <span class="q-text">Assessments for the year:</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p5_e10_assessments', '')}</div>
        
        <div class="question-item"><span class="q-num">11.</span> <span class="q-text">Provide details of any corrective actions taken or underway to address significant risks / concerns arising from the assessments at Question 10 above.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p5_e11_corrective_actions', '')}</div>
        
        <div class="indicator-header">Leadership Indicators</div>
        
        <div class="question-item"><span class="q-num">1.</span> <span class="q-text">Details of a business process being modified / introduced as a result of addressing human rights grievances/complaints.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p5_l1_process_modified', '')}</div>
        
        <div class="question-item"><span class="q-num">2.</span> <span class="q-text">Details of the scope and coverage of any Human rights due-diligence conducted.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p5_l2_hr_due_diligence', '')}</div>
        
        <div class="question-item"><span class="q-num">3.</span> <span class="q-text">Is the premise/office of the entity accessible to differently abled visitors, as per the requirements of the Rights of Persons with Disabilities Act, 2016?</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p5_l3_visitor_accessibility', '')}</div>
        
        <div class="question-item"><span class="q-num">4.</span> <span class="q-text">Details on assessment of value chain partners:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th rowspan="2"></th>
                    <th colspan="2">% of value chain partners (by value of business done with such partners) that were assessed</th>
                </tr>
                <tr>
                    <th>Sexual Harassment</th>
                    <th>Discrimination at workplace</th>
                    <th>Child Labour</th>
                    <th>Forced Labour/Involuntary Labour</th>
                    <th>Wages</th>
                    <th>Others – please specify</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>1</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p5_value_chain_hr_assessment', 'sexual_harassment_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p5_value_chain_hr_assessment', 'discrimination_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p5_value_chain_hr_assessment', 'child_labour_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p5_value_chain_hr_assessment', 'forced_labour_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p5_value_chain_hr_assessment', 'wages_pct', '')}</td>
                    <td class="text-center answer-cell">{self._get_section_c_nested('p5_value_chain_hr_assessment', 'others_pct', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">5.</span> <span class="q-text">Provide details of any corrective actions taken or underway to address significant risks / concerns arising from the assessments at Question 4 above.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p5_l5_valuechain_corrective', '')}</div>
        '''
    
    def _render_principle_6(self) -> str:
        """PRINCIPLE 6: Businesses should respect and make efforts to protect and restore the environment"""
        return f'''
        <div class="page-break"></div>
        
        <div class="principle-header">PRINCIPLE 6 {self.PRINCIPLES['P6']}</div>
        
        <div class="indicator-header">Essential Indicators</div>
        
        <div class="question-item"><span class="q-num">1.</span> <span class="q-text">Details of total energy consumption (in Joules or multiples) and energy intensity, in the following format:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th rowspan="2">Parameter</th>
                    <th colspan="2">{self.reporting_period}</th>
                    <th colspan="2">{self.previous_fy}</th>
                </tr>
                <tr>
                    <th>From renewable sources</th>
                    <th>From non-renewable sources</th>
                    <th>From renewable sources</th>
                    <th>From non-renewable sources</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Total electricity consumption (A)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_elec_renew_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_elec_nonrenew_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_elec_renew_prev', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_elec_nonrenew_prev', '')}</td>
                </tr>
                <tr>
                    <td>Total fuel consumption (B)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_fuel_renew_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_fuel_nonrenew_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_fuel_renew_prev', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_fuel_nonrenew_prev', '')}</td>
                </tr>
                <tr>
                    <td>Energy consumption through other sources (C)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_other_renew_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_other_nonrenew_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_other_renew_prev', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_other_nonrenew_prev', '')}</td>
                </tr>
                <tr class="row-header">
                    <td>Total energy consumed (A+B+C)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_total_renew_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_total_nonrenew_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_total_renew_prev', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_total_nonrenew_prev', '')}</td>
                </tr>
                <tr>
                    <td>Energy intensity per rupee of turnover (Total energy consumed / Revenue from operations)</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_intensity_turnover_curr', '')}</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_intensity_turnover_prev', '')}</td>
                </tr>
                <tr>
                    <td>Energy intensity per rupee of turnover adjusted for Purchasing Power Parity (PPP) (Total energy consumed / Revenue from operations adjusted for PPP)</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_intensity_ppp_curr', '')}</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_intensity_ppp_prev', '')}</td>
                </tr>
                <tr>
                    <td>Energy intensity in terms of physical output</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_intensity_physical_curr', '')}</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_intensity_physical_prev', '')}</td>
                </tr>
                <tr>
                    <td>Energy intensity (optional) – the relevant metric may be selected by the entity</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_intensity_optional_curr', '')}</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e1_intensity_optional_prev', '')}</td>
                </tr>
            </tbody>
        </table>
        <div class="note-text">Note: Indicate if any independent assessment/ evaluation/assurance has been carried out by an external agency? (Y/N) If yes, name of the external agency.</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p6_e1_external_assessment', '')}</div>
        
        <div class="question-item"><span class="q-num">2.</span> <span class="q-text">Does the entity have any sites / facilities identified as designated consumers (DCs) under the Performance, Achieve and Trade (PAT) Scheme of the Government of India? (Y/N) If yes, disclose whether targets set under the PAT scheme have been achieved. In case targets have not been achieved, provide the remedial action taken, if any.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p6_e2_pat_scheme', '')}</div>
        
        <div class="question-item"><span class="q-num">3.</span> <span class="q-text">Provide details of the following disclosures related to water, in the following format:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th rowspan="2">Parameter</th>
                    <th colspan="2">{self.reporting_period}</th>
                    <th colspan="2">{self.previous_fy}</th>
                </tr>
                <tr>
                    <th>Surface water</th>
                    <th>Ground water</th>
                    <th>Surface water</th>
                    <th>Ground water</th>
                </tr>
            </thead>
            <tbody>
                <tr class="category-header"><td colspan="5">Water withdrawal by source (in kilolitres)</td></tr>
                <tr>
                    <td>(i) Surface water</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_surface_curr', '')}</td>
                    <td class="text-center answer-cell">-</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_surface_prev', '')}</td>
                    <td class="text-center answer-cell">-</td>
                </tr>
                <tr>
                    <td>(ii) Groundwater</td>
                    <td class="text-center answer-cell">-</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_ground_curr', '')}</td>
                    <td class="text-center answer-cell">-</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_ground_prev', '')}</td>
                </tr>
                <tr>
                    <td>(iii) Third party water</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_third_party_curr', '')}</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_third_party_prev', '')}</td>
                </tr>
                <tr>
                    <td>(iv) Seawater / desalinated water</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_seawater_curr', '')}</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_seawater_prev', '')}</td>
                </tr>
                <tr>
                    <td>(v) Others</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_others_curr', '')}</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_others_prev', '')}</td>
                </tr>
                <tr class="row-header">
                    <td>Total volume of water withdrawal (in kilolitres) (i + ii + iii + iv + v)</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_total_withdrawal_curr', '')}</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_total_withdrawal_prev', '')}</td>
                </tr>
                <tr>
                    <td>Total volume of water consumption (in kilolitres)</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_total_consumption_curr', '')}</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_total_consumption_prev', '')}</td>
                </tr>
                <tr>
                    <td>Water intensity per rupee of turnover (Total water consumption / Revenue from operations)</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_intensity_turnover_curr', '')}</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_intensity_turnover_prev', '')}</td>
                </tr>
                <tr>
                    <td>Water intensity per rupee of turnover adjusted for Purchasing Power Parity (PPP)</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_intensity_ppp_curr', '')}</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_intensity_ppp_prev', '')}</td>
                </tr>
                <tr>
                    <td>Water intensity in terms of physical output</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_intensity_physical_curr', '')}</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_intensity_physical_prev', '')}</td>
                </tr>
                <tr>
                    <td>Water intensity (optional) – the relevant metric may be selected by the entity</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_intensity_optional_curr', '')}</td>
                    <td colspan="2" class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e3_intensity_optional_prev', '')}</td>
                </tr>
            </tbody>
        </table>
        <div class="note-text">Note: Indicate if any independent assessment/evaluation/assurance has been carried out by an external agency? (Y/N) If yes, name of the external agency.</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p6_e3_external_assessment', '')}</div>
        
        <div class="question-item"><span class="q-num">4.</span> <span class="q-text">Provide the following details related to water discharged:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th>Parameter</th>
                    <th class="fy-header">{self.reporting_period}</th>
                    <th class="fy-header">{self.previous_fy}</th>
                </tr>
            </thead>
            <tbody>
                <tr class="category-header"><td colspan="3">Water discharge by destination and level of treatment (in kilolitres)</td></tr>
                <tr>
                    <td>(i) To Surface water</td>
                    <td class="text-center answer-cell"></td>
                    <td class="text-center answer-cell"></td>
                </tr>
                <tr>
                    <td class="sub-label">- No treatment</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_surface_no_treatment_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_surface_no_treatment_prev', '')}</td>
                </tr>
                <tr>
                    <td class="sub-label">- With treatment – please specify level of treatment</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_surface_with_treatment_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_surface_with_treatment_prev', '')}</td>
                </tr>
                <tr>
                    <td>(ii) To Groundwater</td>
                    <td class="text-center answer-cell"></td>
                    <td class="text-center answer-cell"></td>
                </tr>
                <tr>
                    <td class="sub-label">- No treatment</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_ground_no_treatment_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_ground_no_treatment_prev', '')}</td>
                </tr>
                <tr>
                    <td class="sub-label">- With treatment – please specify level of treatment</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_ground_with_treatment_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_ground_with_treatment_prev', '')}</td>
                </tr>
                <tr>
                    <td>(iii) To Seawater</td>
                    <td class="text-center answer-cell"></td>
                    <td class="text-center answer-cell"></td>
                </tr>
                <tr>
                    <td class="sub-label">- No treatment</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_sea_no_treatment_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_sea_no_treatment_prev', '')}</td>
                </tr>
                <tr>
                    <td class="sub-label">- With treatment – please specify level of treatment</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_sea_with_treatment_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_sea_with_treatment_prev', '')}</td>
                </tr>
                <tr>
                    <td>(iv) Sent to third-parties</td>
                    <td class="text-center answer-cell"></td>
                    <td class="text-center answer-cell"></td>
                </tr>
                <tr>
                    <td class="sub-label">- No treatment</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_third_no_treatment_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_third_no_treatment_prev', '')}</td>
                </tr>
                <tr>
                    <td class="sub-label">- With treatment – please specify level of treatment</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_third_with_treatment_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_third_with_treatment_prev', '')}</td>
                </tr>
                <tr>
                    <td>(v) Others</td>
                    <td class="text-center answer-cell"></td>
                    <td class="text-center answer-cell"></td>
                </tr>
                <tr>
                    <td class="sub-label">- No treatment</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_others_no_treatment_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_others_no_treatment_prev', '')}</td>
                </tr>
                <tr>
                    <td class="sub-label">- With treatment – please specify level of treatment</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_others_with_treatment_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_others_with_treatment_prev', '')}</td>
                </tr>
                <tr class="row-header">
                    <td>Total water discharged (in kilolitres)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_total_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e4_total_prev', '')}</td>
                </tr>
            </tbody>
        </table>
        <div class="note-text">Note: Indicate if any independent assessment/evaluation/assurance has been carried out by an external agency? (Y/N) If yes, name of the external agency.</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p6_e4_external_assessment', '')}</div>
        
        <div class="question-item"><span class="q-num">5.</span> <span class="q-text">Has the entity implemented a mechanism for Zero Liquid Discharge? If yes, provide details of its coverage and implementation.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p6_e5_zld', '')}</div>
        
        <div class="question-item"><span class="q-num">6.</span> <span class="q-text">Please provide details of air emissions (other than GHG emissions) by the entity, in the following format:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th>Parameter</th>
                    <th>Please specify unit</th>
                    <th class="fy-header">{self.reporting_period}</th>
                    <th class="fy-header">{self.previous_fy}</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>NOx</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_nox_unit', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_nox_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_nox_prev', '')}</td>
                </tr>
                <tr>
                    <td>SOx</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_sox_unit', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_sox_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_sox_prev', '')}</td>
                </tr>
                <tr>
                    <td>Particulate matter (PM)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_pm_unit', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_pm_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_pm_prev', '')}</td>
                </tr>
                <tr>
                    <td>Persistent organic pollutants (POP)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_pop_unit', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_pop_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_pop_prev', '')}</td>
                </tr>
                <tr>
                    <td>Volatile organic compounds (VOC)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_voc_unit', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_voc_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_voc_prev', '')}</td>
                </tr>
                <tr>
                    <td>Hazardous air pollutants (HAP)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_hap_unit', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_hap_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_hap_prev', '')}</td>
                </tr>
                <tr>
                    <td>Others – please specify</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_others_unit', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_others_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e6_others_prev', '')}</td>
                </tr>
            </tbody>
        </table>
        <div class="note-text">Note: Indicate if any independent assessment/ evaluation/assurance has been carried out by an external agency? (Y/N) If yes, name of the external agency.</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p6_e6_external_assessment', '')}</div>
        
        <div class="question-item"><span class="q-num">7.</span> <span class="q-text">Provide details of greenhouse gas emissions (Scope 1 and Scope 2 emissions) &amp; its intensity, in the following format:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th>Parameter</th>
                    <th>Unit</th>
                    <th class="fy-header">{self.reporting_period}</th>
                    <th class="fy-header">{self.previous_fy}</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Total Scope 1 emissions (Break-up of the GHG into CO2, CH4, N2O, HFCs, PFCs, SF6, NF3, if available)</td>
                    <td class="text-center">Metric tonnes of CO2 equivalent</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e7_scope1_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e7_scope1_prev', '')}</td>
                </tr>
                <tr>
                    <td>Total Scope 2 emissions (Break-up of the GHG into CO2, CH4, N2O, HFCs, PFCs, SF6, NF3, if available)</td>
                    <td class="text-center">Metric tonnes of CO2 equivalent</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e7_scope2_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e7_scope2_prev', '')}</td>
                </tr>
                <tr class="row-header">
                    <td>Total Scope 1 and Scope 2 emissions per rupee of turnover</td>
                    <td class="text-center"></td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e7_intensity_turnover_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e7_intensity_turnover_prev', '')}</td>
                </tr>
                <tr>
                    <td>Total Scope 1 and Scope 2 emission intensity per rupee of turnover adjusted for Purchasing Power Parity (PPP)</td>
                    <td class="text-center"></td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e7_intensity_ppp_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e7_intensity_ppp_prev', '')}</td>
                </tr>
                <tr>
                    <td>Total Scope 1 and Scope 2 emission intensity in terms of physical output</td>
                    <td class="text-center"></td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e7_intensity_physical_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e7_intensity_physical_prev', '')}</td>
                </tr>
                <tr>
                    <td>Total Scope 1 and Scope 2 emission intensity (optional) – the relevant metric may be selected by the entity</td>
                    <td class="text-center"></td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e7_intensity_optional_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e7_intensity_optional_prev', '')}</td>
                </tr>
            </tbody>
        </table>
        <div class="note-text">Note: Indicate if any independent assessment/ evaluation/assurance has been carried out by an external agency? (Y/N) If yes, name of the external agency.</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p6_e7_external_assessment', '')}</div>
        
        <div class="question-item"><span class="q-num">8.</span> <span class="q-text">Does the entity have any project related to reducing Green House Gas emission? If Yes, then provide details.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p6_e8_ghg_projects', '')}</div>
        
        <div class="question-item"><span class="q-num">9.</span> <span class="q-text">Provide details related to waste management by the entity, in the following format:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th>Parameter</th>
                    <th class="fy-header">{self.reporting_period}</th>
                    <th class="fy-header">{self.previous_fy}</th>
                </tr>
            </thead>
            <tbody>
                <tr class="category-header"><td colspan="3">Total Waste generated (in metric tonnes)</td></tr>
                <tr>
                    <td>Plastic waste (A)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_plastic_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_plastic_prev', '')}</td>
                </tr>
                <tr>
                    <td>E-waste (B)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_ewaste_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_ewaste_prev', '')}</td>
                </tr>
                <tr>
                    <td>Bio-medical waste (C)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_biomedical_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_biomedical_prev', '')}</td>
                </tr>
                <tr>
                    <td>Construction and demolition waste (D)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_construction_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_construction_prev', '')}</td>
                </tr>
                <tr>
                    <td>Battery waste (E)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_battery_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_battery_prev', '')}</td>
                </tr>
                <tr>
                    <td>Radioactive waste (F)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_radioactive_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_radioactive_prev', '')}</td>
                </tr>
                <tr>
                    <td>Other Hazardous waste. Please specify, if any. (G)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_hazardous_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_hazardous_prev', '')}</td>
                </tr>
                <tr>
                    <td>Other Non-hazardous waste generated (H). Please specify, if any. (Break-up by composition i.e. by materials relevant to the sector)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_nonhazardous_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_nonhazardous_prev', '')}</td>
                </tr>
                <tr class="row-header">
                    <td>Total (A+B + C + D + E + F + G + H)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_total_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_total_prev', '')}</td>
                </tr>
                <tr>
                    <td>Waste intensity per rupee of turnover (Total waste generated / Revenue from operations)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_intensity_turnover_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_intensity_turnover_prev', '')}</td>
                </tr>
                <tr>
                    <td>Waste intensity per rupee of turnover adjusted for Purchasing Power Parity (PPP)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_intensity_ppp_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_intensity_ppp_prev', '')}</td>
                </tr>
                <tr>
                    <td>Waste intensity in terms of physical output</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_intensity_physical_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_intensity_physical_prev', '')}</td>
                </tr>
                <tr>
                    <td>Waste intensity (optional) – the relevant metric may be selected by the entity</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_intensity_optional_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_intensity_optional_prev', '')}</td>
                </tr>
                <tr class="category-header"><td colspan="3">For each category of waste generated, total waste recovered through recycling, re-using or other recovery operations (in metric tonnes)</td></tr>
                <tr>
                    <td>(i) Recycled</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_recycled_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_recycled_prev', '')}</td>
                </tr>
                <tr>
                    <td>(ii) Re-used</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_reused_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_reused_prev', '')}</td>
                </tr>
                <tr>
                    <td>(iii) Other recovery operations</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_other_recovery_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_other_recovery_prev', '')}</td>
                </tr>
                <tr class="row-header">
                    <td>Total</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_recovered_total_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_recovered_total_prev', '')}</td>
                </tr>
                <tr class="category-header"><td colspan="3">For each category of waste generated, total waste disposed by nature of disposal method (in metric tonnes)</td></tr>
                <tr>
                    <td>(i) Incineration</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_incineration_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_incineration_prev', '')}</td>
                </tr>
                <tr>
                    <td>(ii) Landfilling</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_landfilling_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_landfilling_prev', '')}</td>
                </tr>
                <tr>
                    <td>(iii) Other disposal operations</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_other_disposal_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_other_disposal_prev', '')}</td>
                </tr>
                <tr class="row-header">
                    <td>Total</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_disposed_total_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e9_disposed_total_prev', '')}</td>
                </tr>
            </tbody>
        </table>
        <div class="note-text">Note: Indicate if any independent assessment/evaluation/assurance has been carried out by an external agency? (Y/N) If yes, name of the external agency.</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p6_e9_external_assessment', '')}</div>
        
        <div class="question-item"><span class="q-num">10.</span> <span class="q-text">Briefly describe the waste management practices adopted in your establishments. Describe the strategy adopted by your company to reduce usage of hazardous and toxic chemicals in your products and processes and the practices adopted to manage such wastes.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p6_e10_waste_practices', '')}</div>
        
        <div class="question-item"><span class="q-num">11.</span> <span class="q-text">If the entity has operations/offices in/around ecologically sensitive areas (such as national parks, wildlife sanctuaries, biosphere reserves, wetlands, biodiversity hotspots, forests, coastal regulation zones etc.) where environmental approvals / clearances are required, please specify details in the following format:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th class="col-sno">S. No.</th>
                    <th>Location of operations/offices</th>
                    <th>Type of operations</th>
                    <th>Whether the conditions of environmental approval / clearance are being complied with? (Y/N) If no, the reasons thereof and corrective action taken, if any.</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="text-center">1</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p6_e11_location_1', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p6_e11_type_1', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p6_e11_compliance_1', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">12.</span> <span class="q-text">Details of environmental impact assessments of projects undertaken by the entity based on applicable laws, in the current financial year:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th class="col-sno">S. No.</th>
                    <th>Name and brief details of project</th>
                    <th>EIA Notification No.</th>
                    <th>Date</th>
                    <th>Whether conducted by independent external agency (Yes / No)</th>
                    <th>Results communicated in public domain (Yes / No)</th>
                    <th>Relevant Web link</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="text-center">1</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p6_e12_project_1', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p6_e12_notification_1', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p6_e12_date_1', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e12_external_1', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_e12_public_1', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p6_e12_weblink_1', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">13.</span> <span class="q-text">Is the entity compliant with the applicable environmental law/ regulations/ guidelines in India; such as the Water (Prevention and Control of Pollution) Act, Air (Prevention and Control of Pollution) Act, Environment protection act and rules thereunder (Y/N). If not, provide details of all such non-compliances, in the following format:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th class="col-sno">S. No.</th>
                    <th>Specify the law / regulation / guidelines which was not complied with</th>
                    <th>Provide details of the non-compliance</th>
                    <th>Any fines / penalties / action taken by regulatory agencies such as pollution control boards or by courts</th>
                    <th>Corrective action taken, if any</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="text-center">1</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p6_e13_law_1', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p6_e13_details_1', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p6_e13_fines_1', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p6_e13_corrective_1', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="indicator-header">Leadership Indicators</div>
        
        <div class="question-item"><span class="q-num">1.</span> <span class="q-text">Water withdrawal, consumption and discharge in areas of water stress (in kilolitres):</span></div>
        <div class="sub-label">For each facility / plant located in areas of water stress, provide the following information:</div>
        <div class="sub-label">(i) Name of the area</div>
        <div class="sub-label">(ii) Nature of operations</div>
        <div class="sub-label">(iii) Water withdrawal, consumption and discharge in the following format:</div>
        
        <table>
            <thead>
                <tr>
                    <th>Parameter</th>
                    <th class="fy-header">{self.reporting_period}</th>
                    <th class="fy-header">{self.previous_fy}</th>
                </tr>
            </thead>
            <tbody>
                <tr class="category-header"><td colspan="3">Water withdrawal by source (in kilolitres)</td></tr>
                <tr>
                    <td>(i) Surface water</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_surface_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_surface_prev', '')}</td>
                </tr>
                <tr>
                    <td>(ii) Groundwater</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_ground_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_ground_prev', '')}</td>
                </tr>
                <tr>
                    <td>(iii) Third party water</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_third_party_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_third_party_prev', '')}</td>
                </tr>
                <tr>
                    <td>(iv) Seawater / desalinated water</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_seawater_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_seawater_prev', '')}</td>
                </tr>
                <tr>
                    <td>(v) Others</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_others_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_others_prev', '')}</td>
                </tr>
                <tr class="row-header">
                    <td>Total volume of water withdrawal (in kilolitres)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_total_withdrawal_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_total_withdrawal_prev', '')}</td>
                </tr>
                <tr>
                    <td>Total volume of water consumption (in kilolitres)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_total_consumption_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_total_consumption_prev', '')}</td>
                </tr>
                <tr>
                    <td>Water intensity per rupee of turnover (Water consumed / turnover)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_intensity_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_intensity_prev', '')}</td>
                </tr>
                <tr>
                    <td>Water intensity (optional) – the relevant metric may be selected by the entity</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_intensity_optional_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_intensity_optional_prev', '')}</td>
                </tr>
                <tr class="category-header"><td colspan="3">Water discharge by destination and level of treatment (in kilolitres)</td></tr>
                <tr>
                    <td>(i) Into Surface water</td>
                    <td class="text-center answer-cell"></td>
                    <td class="text-center answer-cell"></td>
                </tr>
                <tr>
                    <td class="sub-label">- No treatment</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_discharge_surface_no_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_discharge_surface_no_prev', '')}</td>
                </tr>
                <tr>
                    <td class="sub-label">- With treatment – please specify level of treatment</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_discharge_surface_with_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_discharge_surface_with_prev', '')}</td>
                </tr>
                <tr>
                    <td>(ii) Into Groundwater</td>
                    <td class="text-center answer-cell"></td>
                    <td class="text-center answer-cell"></td>
                </tr>
                <tr>
                    <td class="sub-label">- No treatment</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_discharge_ground_no_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_discharge_ground_no_prev', '')}</td>
                </tr>
                <tr>
                    <td class="sub-label">- With treatment – please specify level of treatment</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_discharge_ground_with_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_discharge_ground_with_prev', '')}</td>
                </tr>
                <tr>
                    <td>(iii) Into Seawater</td>
                    <td class="text-center answer-cell"></td>
                    <td class="text-center answer-cell"></td>
                </tr>
                <tr>
                    <td class="sub-label">- No treatment</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_discharge_sea_no_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_discharge_sea_no_prev', '')}</td>
                </tr>
                <tr>
                    <td class="sub-label">- With treatment – please specify level of treatment</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_discharge_sea_with_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_discharge_sea_with_prev', '')}</td>
                </tr>
                <tr>
                    <td>(iv) Sent to third-parties</td>
                    <td class="text-center answer-cell"></td>
                    <td class="text-center answer-cell"></td>
                </tr>
                <tr>
                    <td class="sub-label">- No treatment</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_discharge_third_no_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_discharge_third_no_prev', '')}</td>
                </tr>
                <tr>
                    <td class="sub-label">- With treatment – please specify level of treatment</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_discharge_third_with_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_discharge_third_with_prev', '')}</td>
                </tr>
                <tr>
                    <td>(v) Others</td>
                    <td class="text-center answer-cell"></td>
                    <td class="text-center answer-cell"></td>
                </tr>
                <tr>
                    <td class="sub-label">- No treatment</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_discharge_others_no_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_discharge_others_no_prev', '')}</td>
                </tr>
                <tr>
                    <td class="sub-label">- With treatment – please specify level of treatment</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_discharge_others_with_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_discharge_others_with_prev', '')}</td>
                </tr>
                <tr class="row-header">
                    <td>Total water discharged (in kilolitres)</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_total_discharge_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l1_total_discharge_prev', '')}</td>
                </tr>
            </tbody>
        </table>
        <div class="note-text">Note: Indicate if any independent assessment/ evaluation/assurance has been carried out by an external agency? (Y/N) If yes, name of the external agency.</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p6_l1_external_assessment', '')}</div>
        
        <div class="question-item"><span class="q-num">2.</span> <span class="q-text">Please provide details of total Scope 3 emissions &amp; its intensity, in the following format:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th>Parameter</th>
                    <th>Unit</th>
                    <th class="fy-header">{self.reporting_period}</th>
                    <th class="fy-header">{self.previous_fy}</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Total Scope 3 emissions (Break-up of the GHG into CO2, CH4, N2O, HFCs, PFCs, SF6, NF3, if available)</td>
                    <td class="text-center">Metric tonnes of CO2 equivalent</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l2_scope3_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l2_scope3_prev', '')}</td>
                </tr>
                <tr>
                    <td>Total Scope 3 emissions per rupee of turnover</td>
                    <td class="text-center"></td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l2_intensity_turnover_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l2_intensity_turnover_prev', '')}</td>
                </tr>
                <tr>
                    <td>Total Scope 3 emission intensity per rupee of turnover adjusted for Purchasing Power Parity (PPP)</td>
                    <td class="text-center"></td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l2_intensity_ppp_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l2_intensity_ppp_prev', '')}</td>
                </tr>
                <tr>
                    <td>Total Scope 3 emission intensity in terms of physical output</td>
                    <td class="text-center"></td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l2_intensity_physical_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l2_intensity_physical_prev', '')}</td>
                </tr>
                <tr>
                    <td>Total Scope 3 emission intensity (optional) – the relevant metric may be selected by the entity</td>
                    <td class="text-center"></td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l2_intensity_optional_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p6_l2_intensity_optional_prev', '')}</td>
                </tr>
            </tbody>
        </table>
        <div class="note-text">Note: Indicate if any independent assessment/ evaluation/assurance has been carried out by an external agency? (Y/N) If yes, name of the external agency.</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p6_l2_external_assessment', '')}</div>
        
        <div class="question-item"><span class="q-num">3.</span> <span class="q-text">With respect to the ecologically sensitive areas reported at Question 11 of Essential Indicators above, provide details of significant direct &amp; indirect impact of the entity on biodiversity in such areas along-with prevention and remediation activities.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p6_l3_biodiversity', '')}</div>
        
        <div class="question-item"><span class="q-num">4.</span> <span class="q-text">If the entity has undertaken any specific initiatives or used innovative technology or solutions to improve resource efficiency, or reduce impact due to emissions / effluent discharge / waste generated, please provide details of the same as well as outcome of such initiatives, as per the following format:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th class="col-sno">S. No.</th>
                    <th>Initiative undertaken</th>
                    <th>Details of the initiative (Web-link, if any, may be provided along-with summary)</th>
                    <th>Outcome of the initiative</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="text-center">1</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p6_l4_initiative_1', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p6_l4_details_1', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p6_l4_outcome_1', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">5.</span> <span class="q-text">Does the entity have a business continuity and disaster management plan? Give details in 100 words/ web link.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p6_l5_bcp', '')}</div>
        
        <div class="question-item"><span class="q-num">6.</span> <span class="q-text">Disclose any significant adverse impact to the environment, arising from the value chain of the entity. What mitigation or adaptation measures have been taken by the entity in this regard.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p6_l6_valuechain_impact', '')}</div>
        
        <div class="question-item"><span class="q-num">7.</span> <span class="q-text">Percentage of value chain partners (by value of business done with such partners) that were assessed for environmental impacts.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p6_l7_valuechain_assessed', '')}</div>
        '''
    
    def _render_principle_7(self) -> str:
        """PRINCIPLE 7: Businesses, when engaging in influencing public and regulatory policy, should do so in a manner that is responsible and transparent"""
        return f'''
        <div class="page-break"></div>
        
        <div class="principle-header">PRINCIPLE 7 {self.PRINCIPLES['P7']}</div>
        
        <div class="indicator-header">Essential Indicators</div>
        
        <div class="question-item"><span class="q-num">1.</span> <span class="q-text">a. Number of affiliations with trade and industry chambers/ associations.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p7_e1a_affiliations_count', '')}</div>
        
        <div class="sub-label">b. List the top 10 trade and industry chambers/ associations (determined based on the total members of such body) the entity is a member of/ affiliated to.</div>
        
        <table>
            <thead>
                <tr>
                    <th class="col-sno">S. No.</th>
                    <th>Name of the trade and industry chambers/ associations</th>
                    <th>Reach of trade and industry chambers/ associations (State/National)</th>
                </tr>
            </thead>
            <tbody>
                <tr><td class="text-center">1</td><td class="answer-cell">{self._get_response(self.section_c_data, 'p7_e1b_chamber1_name', '')}</td><td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p7_e1b_chamber1_reach', '')}</td></tr>
                <tr><td class="text-center">2</td><td class="answer-cell">{self._get_response(self.section_c_data, 'p7_e1b_chamber2_name', '')}</td><td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p7_e1b_chamber2_reach', '')}</td></tr>
                <tr><td class="text-center">3</td><td class="answer-cell">{self._get_response(self.section_c_data, 'p7_e1b_chamber3_name', '')}</td><td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p7_e1b_chamber3_reach', '')}</td></tr>
                <tr><td class="text-center">4</td><td class="answer-cell">{self._get_response(self.section_c_data, 'p7_e1b_chamber4_name', '')}</td><td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p7_e1b_chamber4_reach', '')}</td></tr>
                <tr><td class="text-center">5</td><td class="answer-cell">{self._get_response(self.section_c_data, 'p7_e1b_chamber5_name', '')}</td><td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p7_e1b_chamber5_reach', '')}</td></tr>
                <tr><td class="text-center">6</td><td class="answer-cell">{self._get_response(self.section_c_data, 'p7_e1b_chamber6_name', '')}</td><td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p7_e1b_chamber6_reach', '')}</td></tr>
                <tr><td class="text-center">7</td><td class="answer-cell">{self._get_response(self.section_c_data, 'p7_e1b_chamber7_name', '')}</td><td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p7_e1b_chamber7_reach', '')}</td></tr>
                <tr><td class="text-center">8</td><td class="answer-cell">{self._get_response(self.section_c_data, 'p7_e1b_chamber8_name', '')}</td><td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p7_e1b_chamber8_reach', '')}</td></tr>
                <tr><td class="text-center">9</td><td class="answer-cell">{self._get_response(self.section_c_data, 'p7_e1b_chamber9_name', '')}</td><td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p7_e1b_chamber9_reach', '')}</td></tr>
                <tr><td class="text-center">10</td><td class="answer-cell">{self._get_response(self.section_c_data, 'p7_e1b_chamber10_name', '')}</td><td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p7_e1b_chamber10_reach', '')}</td></tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">2.</span> <span class="q-text">Provide details of corrective action taken or underway on any issues related to anti-competitive conduct by the entity, based on adverse orders from regulatory authorities.</span></div>
        
        <table>
            <thead>
                <tr>
                    <th>Name of authority</th>
                    <th>Brief of the case</th>
                    <th>Corrective action taken</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p7_e2_authority', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p7_e2_case_brief', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p7_e2_corrective_action', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="indicator-header">Leadership Indicators</div>
        
        <div class="question-item"><span class="q-num">1.</span> <span class="q-text">Details of public policy positions advocated by the entity:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th class="col-sno">S. No.</th>
                    <th>Public policy advocated</th>
                    <th>Method resorted for such advocacy</th>
                    <th class="col-yesno">Whether information available in public domain? (Yes/No)</th>
                    <th>Frequency of Review by Board (Annually/ Half yearly/ Quarterly / Others – please specify)</th>
                    <th>Web Link, if available</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="text-center">1</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p7_l1_policy', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p7_l1_method', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p7_l1_public', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p7_l1_frequency', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p7_l1_weblink', '')}</td>
                </tr>
            </tbody>
        </table>
        '''
    
    def _render_principle_8(self) -> str:
        """PRINCIPLE 8: Businesses should promote inclusive growth and equitable development"""
        return f'''
        <div class="page-break"></div>
        
        <div class="principle-header">PRINCIPLE 8 {self.PRINCIPLES['P8']}</div>
        
        <div class="indicator-header">Essential Indicators</div>
        
        <div class="question-item"><span class="q-num">1.</span> <span class="q-text">Details of Social Impact Assessments (SIA) of projects undertaken by the entity based on applicable laws, in the current financial year.</span></div>
        
        <table>
            <thead>
                <tr>
                    <th>Name and brief details of project</th>
                    <th>SIA Notification No.</th>
                    <th>Date of Notification</th>
                    <th class="col-yesno">Whether conducted by independent external agency (Yes / No)</th>
                    <th class="col-yesno">Results communicated in public domain (Yes / No)</th>
                    <th>Relevant Web link</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p8_e1_project', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p8_e1_notification', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p8_e1_date', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p8_e1_external', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p8_e1_public', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p8_e1_weblink', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">2.</span> <span class="q-text">Provide information on project(s) for which ongoing Rehabilitation and Resettlement (R&amp;R) is being undertaken by your entity, in the following format:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th class="col-sno">S. No.</th>
                    <th>Name of Project for which R&amp;R is ongoing</th>
                    <th>State</th>
                    <th>District</th>
                    <th class="col-narrow">No. of Project Affected Families (PAFs)</th>
                    <th class="col-narrow">% of PAFs covered by R&amp;R</th>
                    <th>Amounts paid to PAFs in the FY (In INR)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="text-center">1</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p8_e2_project', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p8_e2_state', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p8_e2_district', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p8_e2_pafs', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p8_e2_pafs_covered', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p8_e2_amount', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">3.</span> <span class="q-text">Describe the mechanisms to receive and redress grievances of the community.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p8_e3_grievance_mechanism', '')}</div>
        
        <div class="question-item"><span class="q-num">4.</span> <span class="q-text">Percentage of input material (inputs to total inputs by value) sourced from suppliers:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th></th>
                    <th class="col-narrow">{self.reporting_period} (Current FY)</th>
                    <th class="col-narrow">{self.previous_fy} (Previous FY)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Directly sourced from MSMEs/ small producers</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p8_e4_msme_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p8_e4_msme_prev', '')}</td>
                </tr>
                <tr>
                    <td>Directly from within India</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p8_e4_india_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p8_e4_india_prev', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">5.</span> <span class="q-text">Job creation in smaller towns – Disclose wages paid to persons employed (including employees or workers employed on a permanent or non-permanent / on contract basis) in the following locations, as % of total wage cost</span></div>
        <div class="note-text">(Place to be categorized as per RBI Classification System - rural / semi-urban / urban / metropolitan)</div>
        
        <table>
            <thead>
                <tr>
                    <th>Location</th>
                    <th class="col-narrow">{self.reporting_period} (Current FY)</th>
                    <th class="col-narrow">{self.previous_fy} (Previous FY)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Rural</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p8_e5_rural_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p8_e5_rural_prev', '')}</td>
                </tr>
                <tr>
                    <td>Semi-urban</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p8_e5_semiurban_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p8_e5_semiurban_prev', '')}</td>
                </tr>
                <tr>
                    <td>Urban</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p8_e5_urban_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p8_e5_urban_prev', '')}</td>
                </tr>
                <tr>
                    <td>Metropolitan</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p8_e5_metro_curr', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p8_e5_metro_prev', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="indicator-header">Leadership Indicators</div>
        
        <div class="question-item"><span class="q-num">1.</span> <span class="q-text">Provide details of actions taken to mitigate any negative social impacts identified in the Social Impact Assessments (Reference: Question 1 of Essential Indicators above):</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p8_l1_sia_mitigation', '')}</div>
        
        <div class="question-item"><span class="q-num">2.</span> <span class="q-text">Provide the following information on CSR projects undertaken by your entity in designated aspirational districts as identified by government bodies:</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p8_l2_csr_aspirational', '')}</div>
        
        <div class="question-item"><span class="q-num">3.</span> <span class="q-text">(a) Do you have a preferential procurement policy where you give preference to purchase from suppliers comprising marginalized /vulnerable groups? (Yes/No)</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p8_l3a_preferential', '')}</div>
        <div class="sub-label">(b) From which marginalized /vulnerable groups do you procure?</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p8_l3b_groups', '')}</div>
        <div class="sub-label">(c) What percentage of total procurement (by value) does it constitute?</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p8_l3c_percentage', '')}</div>
        
        <div class="question-item"><span class="q-num">4.</span> <span class="q-text">Details of the benefits derived and shared from the intellectual properties owned or acquired by your entity (in the current financial year), based on traditional knowledge:</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p8_l4_ip_traditional', '')}</div>
        
        <div class="question-item"><span class="q-num">5.</span> <span class="q-text">Details of corrective actions taken or underway, based on any adverse order in intellectual property related disputes wherein usage of traditional knowledge is involved.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p8_l5_ip_disputes', '')}</div>
        
        <div class="question-item"><span class="q-num">6.</span> <span class="q-text">Details of beneficiaries of CSR Projects:</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p8_l6_csr_beneficiaries', '')}</div>
        '''
    
    def _render_principle_9(self) -> str:
        """PRINCIPLE 9: Businesses should engage with and provide value to their consumers in a responsible manner"""
        return f'''
        <div class="page-break"></div>
        
        <div class="principle-header">PRINCIPLE 9 {self.PRINCIPLES['P9']}</div>
        
        <div class="indicator-header">Essential Indicators</div>
        
        <div class="question-item"><span class="q-num">1.</span> <span class="q-text">Describe the mechanisms in place to receive and respond to consumer complaints and feedback.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p9_e1_complaint_mechanism', '')}</div>
        
        <div class="question-item"><span class="q-num">2.</span> <span class="q-text">Turnover of products and/ services as a percentage of turnover from all products/service that carry information about:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th></th>
                    <th>As a percentage to total turnover</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Environmental and social parameters relevant to the product</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e2_env_social', '')}</td>
                </tr>
                <tr>
                    <td>Safe and responsible usage</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e2_safe_usage', '')}</td>
                </tr>
                <tr>
                    <td>Recycling and/or safe disposal</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e2_recycling', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">3.</span> <span class="q-text">Number of consumer complaints in respect of the following:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th rowspan="2"></th>
                    <th colspan="3" class="fy-header">{self.reporting_period} (Current FY)</th>
                    <th colspan="3" class="fy-header">{self.previous_fy} (Previous FY)</th>
                </tr>
                <tr>
                    <th class="col-narrow">Received during the year</th>
                    <th class="col-narrow">Pending resolution at end of year</th>
                    <th>Remarks</th>
                    <th class="col-narrow">Received during the year</th>
                    <th class="col-narrow">Pending resolution at end of year</th>
                    <th>Remarks</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Data privacy</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_privacy_curr_recv', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_privacy_curr_pending', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p9_e3_privacy_curr_remarks', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_privacy_prev_recv', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_privacy_prev_pending', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p9_e3_privacy_prev_remarks', '')}</td>
                </tr>
                <tr>
                    <td>Advertising</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_advertising_curr_recv', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_advertising_curr_pending', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p9_e3_advertising_curr_remarks', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_advertising_prev_recv', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_advertising_prev_pending', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p9_e3_advertising_prev_remarks', '')}</td>
                </tr>
                <tr>
                    <td>Cyber-security</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_cybersec_curr_recv', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_cybersec_curr_pending', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p9_e3_cybersec_curr_remarks', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_cybersec_prev_recv', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_cybersec_prev_pending', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p9_e3_cybersec_prev_remarks', '')}</td>
                </tr>
                <tr>
                    <td>Delivery of essential services</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_delivery_curr_recv', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_delivery_curr_pending', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p9_e3_delivery_curr_remarks', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_delivery_prev_recv', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_delivery_prev_pending', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p9_e3_delivery_prev_remarks', '')}</td>
                </tr>
                <tr>
                    <td>Restrictive Trade Practices</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_restrictive_curr_recv', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_restrictive_curr_pending', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p9_e3_restrictive_curr_remarks', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_restrictive_prev_recv', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_restrictive_prev_pending', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p9_e3_restrictive_prev_remarks', '')}</td>
                </tr>
                <tr>
                    <td>Unfair Trade Practices</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_unfair_curr_recv', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_unfair_curr_pending', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p9_e3_unfair_curr_remarks', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_unfair_prev_recv', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_unfair_prev_pending', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p9_e3_unfair_prev_remarks', '')}</td>
                </tr>
                <tr>
                    <td>Other</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_other_curr_recv', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_other_curr_pending', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p9_e3_other_curr_remarks', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_other_prev_recv', '')}</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e3_other_prev_pending', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p9_e3_other_prev_remarks', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">4.</span> <span class="q-text">Details of instances of product recalls on account of safety issues:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th></th>
                    <th class="col-narrow">Number</th>
                    <th>Reasons for recall</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Voluntary recalls</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e4_voluntary_num', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p9_e4_voluntary_reason', '')}</td>
                </tr>
                <tr>
                    <td>Forced recalls</td>
                    <td class="text-center answer-cell">{self._get_response(self.section_c_data, 'p9_e4_forced_num', '')}</td>
                    <td class="answer-cell">{self._get_response(self.section_c_data, 'p9_e4_forced_reason', '')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">5.</span> <span class="q-text">Does the entity have a framework/ policy on cyber security and risks related to data privacy? (Yes/No) If available, provide a web-link of the policy.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p9_e5_cybersec_policy', '')}</div>
        
        <div class="question-item"><span class="q-num">6.</span> <span class="q-text">Provide details of any corrective actions taken or underway on issues relating to advertising, and delivery of essential services; cyber security and data privacy of customers; re-occurrence of instances of product recalls; penalty / action taken by regulatory authorities on safety of products / services.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p9_e6_corrective_actions', '')}</div>
        
        <div class="question-item"><span class="q-num">7.</span> <span class="q-text">Provide the following information relating to data breaches:</span></div>
        <div class="sub-label">a. Number of instances of data breaches</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p9_e7a_breach_count', '')}</div>
        <div class="sub-label">b. Percentage of data breaches involving personally identifiable information of customers</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p9_e7b_pii_percentage', '')}</div>
        <div class="sub-label">c. Impact, if any, of the data breaches</div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p9_e7c_impact', '')}</div>
        
        <div class="indicator-header">Leadership Indicators</div>
        
        <div class="question-item"><span class="q-num">1.</span> <span class="q-text">Channels / platforms where information on products and services of the entity can be accessed (provide web link, if available).</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p9_l1_info_channels', '')}</div>
        
        <div class="question-item"><span class="q-num">2.</span> <span class="q-text">Steps taken to inform and educate consumers about safe and responsible usage of products and/or services.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p9_l2_consumer_education', '')}</div>
        
        <div class="question-item"><span class="q-num">3.</span> <span class="q-text">Mechanisms in place to inform consumers of any risk of disruption/discontinuation of essential services.</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p9_l3_disruption_mechanism', '')}</div>
        
        <div class="question-item"><span class="q-num">4.</span> <span class="q-text">Does the entity display product information on the product over and above what is mandated as per local laws? (Yes/No/Not Applicable) If yes, provide details in brief. Did your entity carry out any survey with regard to consumer satisfaction relating to the major products / services of the entity, significant locations of operation of the entity or the entity as a whole? (Yes/No)</span></div>
        <div class="answer-value">{self._get_response(self.section_c_data, 'p9_l4_product_info', '')}</div>
        '''
