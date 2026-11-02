"""
BRSR Annexure II Template - EXACT REPLICA

This template recreates the official SEBI BRSR Annexure II format EXACTLY.
Every heading, question, numbering, paragraph, note and table matches the official document.
Only the data values are dynamic - layout, fonts, spacing, tables are IDENTICAL to the official format.

Based on official MCA/SEBI BRSR Annexure II document (July 2023 Updated Version).
"""

from typing import Dict, Any, List, Optional
from datetime import datetime


from .section_c_overrides import apply_overrides
from .generic_render import (ASSURANCE_NOTE, LEADERSHIP_KEYS, PRINCIPLES, QUESTION_RENAMES, AnswerRenderer, esc, is_unnumbered, wellbeing_override)


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
        section_a_configs: List[Dict[str, Any]] = None,
        section_b_data: Dict[str, Any] = None,
        section_b_configs: List[Dict[str, Any]] = None,
        section_c_data: Dict[str, Any] = None,
        section_c_configs: List[Dict[str, Any]] = None,
    ):
        self.organization = organization or {}
        self.reporting_period = reporting_period
        self.section_a = section_a_data or {}
        self.section_a_configs = {c['question_key']: c for c in (section_a_configs or [])}
        self.section_b_data = section_b_data or {}
        self.section_b_configs = section_b_configs or []
        self.section_c_data = section_c_data or {}
        self.section_c_configs = section_c_configs or []
        
        # Calculate previous FY
        self.previous_fy = self._calculate_previous_fy(reporting_period)
        self.answer_renderer = AnswerRenderer(reporting_period, self.previous_fy)
    
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
            font-weight: bold;
            display: inline;
        }
        
        .q-text {
            display: inline;
            font-weight: bold;
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
        """Get response value from data dictionary with automatic key mapping for Section C."""
        # Try exact key first
        val = data.get(key)
        if val is not None and val != '':
            if isinstance(val, bool):
                return 'Yes' if val else 'No'
            if isinstance(val, (list, dict)):
                if isinstance(val, dict):
                    # Try to extract meaningful value
                    for k in ['value', 'description', 'current_fy', 'text']:
                        if k in val and val[k]:
                            return str(val[k])
                return str(val) if val else default
            return str(val)
        
        # For Section C data, try alternative key patterns and nested lookups
        if data is self.section_c_data:
            # Extract the mapped key and subkey from template key patterns
            # Pattern: p3_e1a_perm_m_health_num -> mapped_key=p3_wellbeing_employees, subkey=perm_m_health_num
            import re
            match = re.match(r'(p\d+)_([el])(\d+)([a-z]?)_(.+)', key)
            if match:
                principle = match.group(1)  # p3
                indicator_type = match.group(2)  # e or l
                indicator_num = match.group(3)  # 1
                indicator_suffix = match.group(4)  # a (optional)
                subkey = match.group(5)  # perm_m_health_num
                
                # Build the lookup prefix
                prefix = f"{principle}_{indicator_type}{indicator_num}{indicator_suffix}"
                
                # Get the mapped database key
                alt_keys = self._get_alternative_keys(prefix + '_dummy')
                for mapped_key in alt_keys:
                    if mapped_key.endswith('_dummy'):
                        mapped_key = mapped_key[:-6]
                    
                    # Try nested lookup
                    result = self._get_section_c_nested(mapped_key, subkey, '')
                    if result:
                        return result
                    
                    # Try direct lookup with mapped key
                    mapped_data = data.get(mapped_key)
                    if mapped_data is not None:
                        if isinstance(mapped_data, dict):
                            nested_val = mapped_data.get(subkey)
                            if nested_val is not None:
                                if isinstance(nested_val, dict):
                                    for k in ['current_fy', 'previous_fy', 'value']:
                                        if k in nested_val and nested_val[k]:
                                            return str(nested_val[k])
                                elif isinstance(nested_val, bool):
                                    return 'Yes' if nested_val else 'No'
                                else:
                                    return str(nested_val) if nested_val else default
                        elif isinstance(mapped_data, bool):
                            return 'Yes' if mapped_data else 'No'
                        else:
                            return str(mapped_data) if mapped_data else default
            
            # Try direct alternative keys
            alt_keys = self._get_alternative_keys(key)
            for alt_key in alt_keys:
                val = data.get(alt_key)
                if val is not None and val != '':
                    if isinstance(val, bool):
                        return 'Yes' if val else 'No'
                    if isinstance(val, dict):
                        for k in ['value', 'description', 'current_fy', 'text']:
                            if k in val and val[k]:
                                return str(val[k])
                    if isinstance(val, list):
                        return str(val) if val else default
                    return str(val)
        
        return default
    
    def _get_alternative_keys(self, key: str) -> list:
        """Generate alternative key patterns for data lookup."""
        alt_keys = []
        
        # Remove _eX_, _lX_ patterns (e.g., p1_e1_xxx -> p1_xxx)
        import re
        simplified = re.sub(r'_[el]\d+[a-z]?_', '_', key)
        if simplified != key:
            alt_keys.append(simplified)
        
        # Common key mappings between template and database
        # Maps template prefix patterns to actual database keys
        key_mappings = {
            # P3 mappings - map template keys to database keys
            'p3_e1a': 'p3_wellbeing_employees',
            'p3_e1b': 'p3_wellbeing_workers',
            'p3_e2': 'p3_wellbeing_spending',
            'p3_e3': 'p3_retirement_benefits',
            'p3_e4': 'p3_accessibility_differently_abled',
            'p3_e5': 'p3_equal_opportunity_policy',
            'p3_e6': 'p3_parental_leave_return',
            'p3_e7': 'grievance_mechanism_employees_workers',
            'p3_e8': 'p3_union_membership',
            'p3_e9': 'p3_training_details',
            'p3_e10': 'performance_career_reviews',
            'p3_e11': 'p3_ohs_management_system',
            'p3_e12': 'p3_hazard_identification',
            'p3_e13': 'p3_worker_hazard_reporting',
            'p3_e14': 'p3_non_occupational_healthcare',
            'p3_e15': 'p3_safety_incidents',
            'p3_e16': 'ltifr_employees_workers',
            'p3_e17': 'p3_safe_workplace_measures',
            'p3_e18': 'p3_complaints_employees_workers',
            'p3_e19': 'p3_assessments_year',
            'p3_e20': 'p3_safety_corrective_actions',
            'p3_l1': 'p3_life_insurance_package',
            'p3_l2': 'p3_value_chain_statutory_dues',
            'p3_l3': 'p3_rehabilitation_injured',
            'p3_l4': 'transition_assistance_programs',
            'p3_l5': 'p3_value_chain_assessment',
            'p3_l6': 'p3_value_chain_corrective',
            # P4 mappings
            'p4_e1': 'p4_se_1',
            'p4_e2': 'p4_se_2',
            'p4_e3': 'p4_se_3',
            'p4_e4': 'p4_se_4',
            'p4_l1': 'p4_se_5',
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
            'p5_e11': 'p5_hr_assessments',
            'p5_e12': 'p5_hr_corrective_actions',
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
    
    def _p(self, key: str, default: str = '') -> str:
        """
        Universal principle data getter. Handles both direct keys and nested structures.
        This is the primary method for fetching Section C data in templates.
        
        Usage:
        - {self._p('p3_wellbeing_employees_perm_m_health_num')}
        - {self._p('p6_energy_consumption_total_renew_curr')}
        """
        # First try direct lookup
        val = self.section_c_data.get(key)
        if val is not None and val != '':
            if isinstance(val, bool):
                return 'Yes' if val else 'No'
            if isinstance(val, str):
                return val
            if isinstance(val, (int, float)):
                return str(val)
        
        # Try alternative keys
        alt_keys = self._get_alternative_keys(key)
        for alt_key in alt_keys:
            # Try nested lookup
            result = self._get_section_c_nested(alt_key, key.replace(alt_key + '_', ''), default)
            if result and result != default:
                return result
            
            # Try direct value
            val = self.section_c_data.get(alt_key)
            if val is not None and val != '':
                if isinstance(val, bool):
                    return 'Yes' if val else 'No'
                if isinstance(val, str):
                    return val
                if isinstance(val, dict):
                    # Try to get a meaningful value from the dict
                    for k in ['value', 'description', 'current_fy', 'text']:
                        if k in val and val[k]:
                            return str(val[k])
        
        return default
    
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
        if not addr_data and key == 'brsr_a_corporate_address':
            addr_data = {
                'address': self.organization.get('corporate_address', ''),
                'city': self.organization.get('city', ''),
                'state': self.organization.get('state', ''),
                'country': self.organization.get('country', ''),
                'pincode': self.organization.get('pincode', ''),
            }
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
        {self.answer_renderer.render(self._a_config('brsr_a_contact_person'), self.section_a.get('brsr_a_contact_person'))}
        
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
        
        {self._a_block('brsr_a_plants_offices', '18.')}
        {self._a_block('brsr_a_markets_served', '19.')}
        {self._a_block('brsr_a_export_contribution', 'b.')}
        {self._a_block('brsr_a_customer_types', 'c.')}
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
    
    def _turnover(self, row: str, fy: str, field: str) -> str:
        """Read turnover rate from the nested brsr_a_turnover_rate response."""
        data = self.section_a.get('brsr_a_turnover_rate') or {}
        value = ((data.get(fy) or data.get({'prior_fy': 'year_prior_fy'}.get(fy, fy)) or {}).get(row) or {}).get(field)
        if value is None or value == '':
            return ''
        return f'{float(value):.2f}%' if isinstance(value, (int, float)) else str(value)

    def _matrix_cell(self, key: str, category: str, employee_type: str, field: str) -> str:
        """Read a cell of an employees/workers matrix; totals are always male + female (stored totals can be stale)."""
        type_data = ((self.section_a.get(key) or {}).get(category) or {}).get(employee_type) or {}

        def number(name):
            try:
                return float(type_data.get(name))
            except (TypeError, ValueError):
                return None
        if field == 'total':
            parts = [v for v in (number('male'), number('female')) if v is not None]
            value = sum(parts) if parts else number('total')
        else:
            value = number(field)
        if value is None:
            return ''
        return str(int(value)) if float(value).is_integer() else f'{value:g}'

    def _get_employee_data(self, category: str, employee_type: str, field: str) -> str:
        return self._matrix_cell('brsr_a_employees_workers', category, employee_type, field)

    def _get_differently_abled_data(self, category: str, employee_type: str, field: str) -> str:
        return self._matrix_cell('brsr_a_differently_abled', category, employee_type, field)

    @staticmethod
    def _clean_number(value: Any) -> str:
        if value is None or value == '':
            return ''
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        return str(value)

    def _get_women_representation_data(self, row_key: str, field: str) -> str:
        """Read fixed women representation rows from current or legacy response shapes."""
        data = self.section_a.get('brsr_a_women_representation', [])
        label_by_key = {
            'board_of_directors': 'Board of Directors',
            'key_management_personnel': 'Key Management Personnel',
        }
        if isinstance(data, dict):
            row = (data.get('rows') or data).get(row_key, {})
            value = row.get(field) if isinstance(row, dict) else None
            return self._clean_number(value)
        if isinstance(data, list):
            row = next((item for item in data if item.get('key') == row_key or item.get('category') == label_by_key[row_key]), {})
            value = row.get(field) if isinstance(row, dict) else None
            return self._clean_number(value)
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

        da_emp_perm_male = self._get_differently_abled_data('employees', 'permanent', 'male')
        da_emp_perm_female = self._get_differently_abled_data('employees', 'permanent', 'female')
        da_emp_perm_total = self._get_differently_abled_data('employees', 'permanent', 'total')
        da_emp_other_male = self._get_differently_abled_data('employees', 'other_than_permanent', 'male')
        da_emp_other_female = self._get_differently_abled_data('employees', 'other_than_permanent', 'female')
        da_emp_other_total = self._get_differently_abled_data('employees', 'other_than_permanent', 'total')
        da_wrk_perm_male = self._get_differently_abled_data('workers', 'permanent', 'male')
        da_wrk_perm_female = self._get_differently_abled_data('workers', 'permanent', 'female')
        da_wrk_perm_total = self._get_differently_abled_data('workers', 'permanent', 'total')
        da_wrk_other_male = self._get_differently_abled_data('workers', 'other_than_permanent', 'male')
        da_wrk_other_female = self._get_differently_abled_data('workers', 'other_than_permanent', 'female')
        da_wrk_other_total = self._get_differently_abled_data('workers', 'other_than_permanent', 'total')
        
        # Calculate totals
        try:
            emp_total_male = str(int(float(emp_perm_male or 0)) + int(float(emp_other_male or 0))) if emp_perm_male or emp_other_male else ''
            emp_total_female = str(int(float(emp_perm_female or 0)) + int(float(emp_other_female or 0))) if emp_perm_female or emp_other_female else ''
            emp_total_total = str(int(float(emp_perm_total or 0)) + int(float(emp_other_total or 0))) if emp_perm_total or emp_other_total else ''
            
            wrk_total_male = str(int(float(wrk_perm_male or 0)) + int(float(wrk_other_male or 0))) if wrk_perm_male or wrk_other_male else ''
            wrk_total_female = str(int(float(wrk_perm_female or 0)) + int(float(wrk_other_female or 0))) if wrk_perm_female or wrk_other_female else ''
            wrk_total_total = str(int(float(wrk_perm_total or 0)) + int(float(wrk_other_total or 0))) if wrk_perm_total or wrk_other_total else ''

            da_emp_total_male = str(int(float(da_emp_perm_male or 0)) + int(float(da_emp_other_male or 0))) if da_emp_perm_male or da_emp_other_male else ''
            da_emp_total_female = str(int(float(da_emp_perm_female or 0)) + int(float(da_emp_other_female or 0))) if da_emp_perm_female or da_emp_other_female else ''
            da_emp_total_total = str(int(float(da_emp_perm_total or 0)) + int(float(da_emp_other_total or 0))) if da_emp_perm_total or da_emp_other_total else ''
            da_wrk_total_male = str(int(float(da_wrk_perm_male or 0)) + int(float(da_wrk_other_male or 0))) if da_wrk_perm_male or da_wrk_other_male else ''
            da_wrk_total_female = str(int(float(da_wrk_perm_female or 0)) + int(float(da_wrk_other_female or 0))) if da_wrk_perm_female or da_wrk_other_female else ''
            da_wrk_total_total = str(int(float(da_wrk_perm_total or 0)) + int(float(da_wrk_other_total or 0))) if da_wrk_perm_total or da_wrk_other_total else ''
        except (ValueError, TypeError):
            emp_total_male = emp_total_female = emp_total_total = ''
            wrk_total_male = wrk_total_female = wrk_total_total = ''
            da_emp_total_male = da_emp_total_female = da_emp_total_total = ''
            da_wrk_total_male = da_wrk_total_female = da_wrk_total_total = ''

        bod_total = self._get_women_representation_data('board_of_directors', 'total')
        bod_female = self._get_women_representation_data('board_of_directors', 'number_of_females')
        kmp_total = self._get_women_representation_data('key_management_personnel', 'total')
        kmp_female = self._get_women_representation_data('key_management_personnel', 'number_of_females')
        
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
                    <td class="text-center answer-cell">{da_emp_perm_total}</td>
                    <td class="text-center answer-cell">{da_emp_perm_male}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(da_emp_perm_male, da_emp_perm_total)}</td>
                    <td class="text-center answer-cell">{da_emp_perm_female}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(da_emp_perm_female, da_emp_perm_total)}</td>
                </tr>
                <tr>
                    <td class="text-center">2</td>
                    <td>Other than Permanent (E)</td>
                    <td class="text-center answer-cell">{da_emp_other_total}</td>
                    <td class="text-center answer-cell">{da_emp_other_male}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(da_emp_other_male, da_emp_other_total)}</td>
                    <td class="text-center answer-cell">{da_emp_other_female}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(da_emp_other_female, da_emp_other_total)}</td>
                </tr>
                <tr>
                    <td class="text-center">3</td>
                    <td>Total differently abled employees (D + E)</td>
                    <td class="text-center answer-cell">{da_emp_total_total}</td>
                    <td class="text-center answer-cell">{da_emp_total_male}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(da_emp_total_male, da_emp_total_total)}</td>
                    <td class="text-center answer-cell">{da_emp_total_female}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(da_emp_total_female, da_emp_total_total)}</td>
                </tr>
                <tr class="category-header"><td colspan="7">DIFFERENTLY ABLED WORKERS</td></tr>
                <tr>
                    <td class="text-center">4</td>
                    <td>Permanent (F)</td>
                    <td class="text-center answer-cell">{da_wrk_perm_total}</td>
                    <td class="text-center answer-cell">{da_wrk_perm_male}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(da_wrk_perm_male, da_wrk_perm_total)}</td>
                    <td class="text-center answer-cell">{da_wrk_perm_female}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(da_wrk_perm_female, da_wrk_perm_total)}</td>
                </tr>
                <tr>
                    <td class="text-center">5</td>
                    <td>Other than permanent (G)</td>
                    <td class="text-center answer-cell">{da_wrk_other_total}</td>
                    <td class="text-center answer-cell">{da_wrk_other_male}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(da_wrk_other_male, da_wrk_other_total)}</td>
                    <td class="text-center answer-cell">{da_wrk_other_female}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(da_wrk_other_female, da_wrk_other_total)}</td>
                </tr>
                <tr>
                    <td class="text-center">6</td>
                    <td>Total differently abled workers (F + G)</td>
                    <td class="text-center answer-cell">{da_wrk_total_total}</td>
                    <td class="text-center answer-cell">{da_wrk_total_male}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(da_wrk_total_male, da_wrk_total_total)}</td>
                    <td class="text-center answer-cell">{da_wrk_total_female}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(da_wrk_total_female, da_wrk_total_total)}</td>
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
                    <td class="text-center answer-cell">{bod_total}</td>
                    <td class="text-center answer-cell">{bod_female}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(bod_female, bod_total)}</td>
                </tr>
                <tr>
                    <td>Key Management Personnel</td>
                    <td class="text-center answer-cell">{kmp_total}</td>
                    <td class="text-center answer-cell">{kmp_female}</td>
                    <td class="text-center answer-cell">{self._calc_percentage(kmp_female, kmp_total)}</td>
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
                    <td class="text-center answer-cell">{self._turnover('permanent_employees', 'current_fy', 'male')}</td>
                    <td class="text-center answer-cell">{self._turnover('permanent_employees', 'current_fy', 'female')}</td>
                    <td class="text-center answer-cell">{self._turnover('permanent_employees', 'current_fy', 'total')}</td>
                    <td class="text-center answer-cell">{self._turnover('permanent_employees', 'previous_fy', 'male')}</td>
                    <td class="text-center answer-cell">{self._turnover('permanent_employees', 'previous_fy', 'female')}</td>
                    <td class="text-center answer-cell">{self._turnover('permanent_employees', 'previous_fy', 'total')}</td>
                    <td class="text-center answer-cell">{self._turnover('permanent_employees', 'prior_fy', 'male')}</td>
                    <td class="text-center answer-cell">{self._turnover('permanent_employees', 'prior_fy', 'female')}</td>
                    <td class="text-center answer-cell">{self._turnover('permanent_employees', 'prior_fy', 'total')}</td>
                </tr>
                <tr>
                    <td>Permanent Workers</td>
                    <td class="text-center answer-cell">{self._turnover('permanent_workers', 'current_fy', 'male')}</td>
                    <td class="text-center answer-cell">{self._turnover('permanent_workers', 'current_fy', 'female')}</td>
                    <td class="text-center answer-cell">{self._turnover('permanent_workers', 'current_fy', 'total')}</td>
                    <td class="text-center answer-cell">{self._turnover('permanent_workers', 'previous_fy', 'male')}</td>
                    <td class="text-center answer-cell">{self._turnover('permanent_workers', 'previous_fy', 'female')}</td>
                    <td class="text-center answer-cell">{self._turnover('permanent_workers', 'previous_fy', 'total')}</td>
                    <td class="text-center answer-cell">{self._turnover('permanent_workers', 'prior_fy', 'male')}</td>
                    <td class="text-center answer-cell">{self._turnover('permanent_workers', 'prior_fy', 'female')}</td>
                    <td class="text-center answer-cell">{self._turnover('permanent_workers', 'prior_fy', 'total')}</td>
                </tr>
            </tbody>
        </table>
        '''
    
    def _a_config(self, key: str) -> Dict[str, Any]:
        return self.section_a_configs.get(key) or {'question_key': key}

    def _a_block(self, key: str, number: str, question: str = '') -> str:
        config = self._a_config(key)
        text = question or config.get('question', '')
        return (f'<div class="question-item"><span class="q-num">{esc(number)}</span> <span class="q-text">{esc(text)}</span></div>'
                + self.answer_renderer.render(config, self.section_a.get(key)))

    def _render_section_a_holding(self) -> str:
        return ('<div class="subsection-header">V. Holding, Subsidiary and Associate Companies (including joint ventures)</div>'
                + self._a_block('brsr_a_holding_subsidiary', '23.', '(a) Names of holding / subsidiary / associate companies / joint ventures'))

    def _render_section_a_csr(self) -> str:
        return '<div class="subsection-header">VI. CSR Details</div>' + self._a_block('brsr_a_csr_applicability', '24.')

    def _render_section_a_transparency(self) -> str:
        return ('<div class="subsection-header">VII. Transparency and Disclosures Compliances</div>'
                + self._a_block('brsr_a_complaints_grievances', '25.') + self._a_block('brsr_a_material_issues', '26.'))

    def render_section_b(self) -> str:
        """SECTION B rendered from the saved answers and question configs."""
        html = '''
        <div class="page-break"></div>
        <div class="section-header">SECTION B: MANAGEMENT AND PROCESS DISCLOSURES</div>
        <p class="intro-text">This section is aimed at helping entities demonstrate the structures, policies and processes put in place towards adopting the NGRBC Principles and Core Elements.</p>
        '''
        for config in sorted(self.section_b_configs, key=lambda c: c.get('order', 0)):
            html += self._render_question(config, self.section_b_data.get(config['question_key']), f"{config.get('disclosure_number', '')}.")
        return html

    def _render_question(self, config: Dict[str, Any], value: Any, number: str = '') -> str:
        config = apply_overrides(wellbeing_override(config))
        question = QUESTION_RENAMES.get(config['question_key'], config.get('question', ''))
        if config['question_key'].startswith('env_assurance_'):
            question = ASSURANCE_NOTE
        label = f'<span class="q-num">{esc(number)}</span> ' if number else ''
        return (f'<div class="question-item">{label}<span class="q-text">{esc(question)}</span></div>'
                + self.answer_renderer.render(config, value))

    def render_section_c(self) -> str:
        """SECTION C: PRINCIPLE WISE PERFORMANCE DISCLOSURE rendered from saved answers and question configs."""
        html = '''
        <div class="page-break"></div>
        <div class="section-header">SECTION C: PRINCIPLE WISE PERFORMANCE DISCLOSURE</div>
        <p class="intro-text">This section is aimed at helping entities demonstrate their performance in integrating the Principles and Core Elements with key processes and decisions. The information sought is categorized as "Essential" and "Leadership".</p>
        '''
        for principle in PRINCIPLES:
            configs = sorted((c for c in self.section_c_configs if c.get('brsr_principle') == principle), key=lambda c: c.get('order', 0))
            if not configs:
                continue
            html += f'<div class="page-break"></div><div class="principle-header">PRINCIPLE {principle[1:]} {self.PRINCIPLES[principle]}</div>'
            for title, leadership in (('Essential Indicators', False), ('Leadership Indicators', True)):
                group = [c for c in configs if (c['question_key'] in LEADERSHIP_KEYS) == leadership]
                if not group:
                    continue
                html += f'<div class="indicator-header">{title}</div>'
                count = 0
                for config in group:
                    number = ''
                    if not is_unnumbered(config['question_key']):
                        count += 1
                        number = f'{count}.'
                    html += self._render_question(config, self.section_c_data.get(config['question_key']), number)
        return html

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
    
