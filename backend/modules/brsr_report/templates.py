"""
BRSR Annexure II Template - EXACT REPLICA

This template recreates the official SEBI BRSR Annexure II format EXACTLY.
Only the data values are dynamic - layout, fonts, spacing, tables are identical.

Based on official MCA/SEBI BRSR Annexure II document analysis.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime


class BRSRHTMLTemplate:
    """
    Generates HTML that is an EXACT REPLICA of the SEBI BRSR Annexure II format.
    
    Design specifications from official Annexure II:
    - Font: Arial, 10pt body, 12pt headers
    - Page: A4 (210mm x 297mm)
    - Margins: ~20mm all sides
    - Tables: 1px solid black borders
    - Section headers: Bold (NO green background)
    - Subsection headers: Bold, underlined
    - Principle headers in Section C: Bold with green background
    """
    
    # Principle definitions - exact text from Annexure II
    PRINCIPLES = {
        'P1': 'Businesses should conduct and govern themselves with integrity, and in a manner that is Ethical, Transparent and Accountable.',
        'P2': 'Businesses should provide goods and services in a manner that is sustainable and safe.',
        'P3': 'Businesses should respect and promote the well-being of all employees, including those in their value chains.',
        'P4': 'Businesses should respect the interests of and be responsive to all its stakeholders.',
        'P5': 'Businesses should respect and promote human rights.',
        'P6': 'Businesses should respect and make efforts to protect and restore the environment.',
        'P7': 'Businesses, when engaging in influencing public and regulatory policy, should do so in a manner that is responsible and transparent.',
        'P8': 'Businesses should promote inclusive growth and equitable development.',
        'P9': 'Businesses should engage with and provide value to their consumers in a responsible manner.',
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
    
    def get_css(self) -> str:
        """
        CSS that EXACTLY replicates Annexure II styling.
        No custom design - pure replication.
        """
        return '''
        @page {
            size: A4;
            margin: 20mm;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 10pt;
            line-height: 1.3;
            color: #000000;
            background: #FFFFFF;
        }
        
        /* Annexure II header - top right of first page */
        .annexure-label {
            text-align: right;
            font-size: 10pt;
            font-weight: normal;
            margin-bottom: 15px;
        }
        
        /* Main document title */
        .doc-title {
            text-align: center;
            font-size: 12pt;
            font-weight: bold;
            margin-bottom: 20px;
        }
        
        /* Section headers - Bold text only, NO background color */
        .section-header {
            font-size: 11pt;
            font-weight: bold;
            margin: 20px 0 12px 0;
        }
        
        /* Subsection headers - Bold and underlined */
        .subsection-header {
            font-size: 10pt;
            font-weight: bold;
            text-decoration: underline;
            margin: 12px 0 8px 0;
        }
        
        /* Principle headers in Section C - Green background */
        .principle-header {
            background-color: #70AD47;
            font-size: 10pt;
            font-weight: bold;
            padding: 5px 8px;
            margin: 15px 0 8px 0;
        }
        
        /* Indicator type headers (Essential/Leadership) */
        .indicator-header {
            font-size: 10pt;
            font-weight: bold;
            margin: 12px 0 8px 0;
        }
        
        /* Question item container */
        .question-item {
            margin: 6px 0;
            display: flex;
            align-items: flex-start;
        }
        
        /* Question number */
        .q-num {
            min-width: 20px;
            font-weight: normal;
        }
        
        /* Question text */
        .q-text {
            flex: 1;
        }
        
        /* Sub-question labels (a), (b), etc */
        .sub-label {
            margin-left: 20px;
            margin-top: 4px;
        }
        
        /* Deeper indentation */
        .sub-label-2 {
            margin-left: 35px;
            margin-top: 4px;
        }
        
        /* Answer value */
        .answer-value {
            margin-left: 25px;
            margin-top: 2px;
            font-weight: bold;
        }
        
        /* Tables - EXACT Annexure II style */
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 8px 0 12px 0;
            font-size: 9pt;
        }
        
        th, td {
            border: 1px solid #000000;
            padding: 4px 6px;
            text-align: left;
            vertical-align: top;
        }
        
        th {
            font-weight: bold;
            background-color: #FFFFFF;
        }
        
        /* Column widths for specific table types */
        .col-sno {
            width: 35px;
            text-align: center;
        }
        
        .col-narrow {
            width: 60px;
            text-align: center;
        }
        
        .col-percent {
            width: 70px;
            text-align: center;
        }
        
        .col-principle {
            width: 45px;
            text-align: center;
        }
        
        /* Answer/response placeholder */
        .answer-cell {
            min-height: 18px;
        }
        
        /* Page break */
        .page-break {
            page-break-after: always;
        }
        
        /* For FY columns in tables */
        .fy-header {
            text-align: center;
            font-weight: bold;
        }
        
        /* Bold text */
        .bold {
            font-weight: bold;
        }
        
        /* Intro paragraph */
        .intro-text {
            margin: 8px 0 15px 0;
            font-size: 10pt;
        }
        
        /* Note text */
        .note-text {
            font-size: 9pt;
            font-style: italic;
            margin: 5px 0;
        }
        
        /* Print styles */
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
        """Get value from section_a data, return empty string if not found."""
        val = self.section_a.get(key)
        if val is None or val == '':
            return default
        return str(val)
    
    def _get_response(self, data: Dict, key: str, default: str = '') -> str:
        """Get response value from data dict."""
        val = data.get(key)
        if val is None or val == '':
            return default
        if isinstance(val, bool):
            return 'Yes' if val else 'No'
        return str(val)
    
    def _format_address(self, prefix: str) -> str:
        """Format address from section_a data."""
        parts = []
        for field in ['address', 'city', 'state', 'country', 'pincode']:
            val = self.section_a.get(f'{prefix}{field}')
            if val:
                parts.append(str(val))
        return ', '.join(parts) if parts else ''
    
    def render_section_a(self) -> str:
        """
        Render Section A: General Disclosures
        EXACT replica of Annexure II pages 1-5
        """
        
        # Get contact details
        contact_name = self._val('brsr_contact_name')
        contact_tel = self._val('brsr_contact_telephone')
        contact_email = self._val('brsr_contact_email')
        contact_details = []
        if contact_name:
            contact_details.append(f"Name: {contact_name}")
        if contact_tel:
            contact_details.append(f"Tel: {contact_tel}")
        if contact_email:
            contact_details.append(f"Email: {contact_email}")
        contact_str = ', '.join(contact_details)
        
        html = f'''
        <!-- Page 1 -->
        <div class="annexure-label">Annexure II</div>
        <div class="doc-title">BUSINESS RESPONSIBILITY &amp; SUSTAINABILITY REPORTING FORMAT</div>
        
        <div class="section-header">SECTION A: GENERAL DISCLOSURES</div>
        
        <div class="subsection-header">I. Details of the listed entity</div>
        
        <div class="question-item"><span class="q-num">1.</span><span class="q-text">Corporate Identity Number (CIN) of the Listed Entity</span></div>
        <div class="answer-value">{self._val('cin')}</div>
        
        <div class="question-item"><span class="q-num">2.</span><span class="q-text">Name of the Listed Entity</span></div>
        <div class="answer-value">{self._val('listed_entity_name')}</div>
        
        <div class="question-item"><span class="q-num">3.</span><span class="q-text">Year of incorporation</span></div>
        <div class="answer-value">{self._val('year_of_incorporation')}</div>
        
        <div class="question-item"><span class="q-num">4.</span><span class="q-text">Registered office address</span></div>
        <div class="answer-value">{self._format_address('registered_')}</div>
        
        <div class="question-item"><span class="q-num">5.</span><span class="q-text">Corporate address</span></div>
        <div class="answer-value">{self._format_address('corporate_')}</div>
        
        <div class="question-item"><span class="q-num">6.</span><span class="q-text">E-mail</span></div>
        <div class="answer-value">{self._val('email')}</div>
        
        <div class="question-item"><span class="q-num">7.</span><span class="q-text">Telephone</span></div>
        <div class="answer-value">{self._val('telephone')}</div>
        
        <div class="question-item"><span class="q-num">8.</span><span class="q-text">Website</span></div>
        <div class="answer-value">{self._val('website')}</div>
        
        <div class="question-item"><span class="q-num">9.</span><span class="q-text">Financial year for which reporting is being done</span></div>
        <div class="answer-value">{self.reporting_period}</div>
        
        <div class="question-item"><span class="q-num">10.</span><span class="q-text">Name of the Stock Exchange(s) where shares are listed</span></div>
        <div class="answer-value">{self._val('stock_exchange')}</div>
        
        <div class="question-item"><span class="q-num">11.</span><span class="q-text">Paid-up Capital</span></div>
        <div class="answer-value">{self._val('paid_up_capital')}</div>
        
        <div class="question-item"><span class="q-num">12.</span><span class="q-text">Name and contact details (telephone, email address) of the person who may be contacted in case of any queries on the BRSR report</span></div>
        <div class="answer-value">{contact_str}</div>
        
        <div class="question-item"><span class="q-num">13.</span><span class="q-text">Reporting boundary - Are the disclosures under this report made on a standalone basis (i.e. only for the entity) or on a consolidated basis (i.e. for the entity and all the entities which form a part of its consolidated financial statements, taken together).</span></div>
        <div class="answer-value">{self._val('reporting_boundary')}</div>
        
        <div class="question-item"><span class="q-num">14.</span><span class="q-text">Name of assurance provider</span></div>
        <div class="answer-value">{self._val('assurance_provider')}</div>
        
        <div class="question-item"><span class="q-num">15.</span><span class="q-text">Type of assurance obtained</span></div>
        <div class="answer-value">{self._val('assurance_type')}</div>
        
        <div class="subsection-header">II. Products/services</div>
        
        <div class="question-item"><span class="q-num">16.</span><span class="q-text">Details of business activities (accounting for 90% of the turnover):</span></div>
        
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
        
        <div class="question-item"><span class="q-num">17.</span><span class="q-text">Products/Services sold by the entity (accounting for 90% of the entity's Turnover):</span></div>
        
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
        
        <div class="subsection-header">III. Operations</div>
        
        <div class="question-item"><span class="q-num">18.</span><span class="q-text">Number of locations where plants and/or operations/offices of the entity are situated:</span></div>
        
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
                {self._render_plants_offices()}
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">19.</span><span class="q-text">Markets served by the entity:</span></div>
        
        <div class="sub-label">a. Number of locations</div>
        
        <table>
            <thead>
                <tr>
                    <th>Locations</th>
                    <th class="col-narrow">Number</th>
                </tr>
            </thead>
            <tbody>
                {self._render_markets_served()}
            </tbody>
        </table>
        
        <div class="sub-label">b. What is the contribution of exports as a percentage of the total turnover of the entity?</div>
        <div class="answer-value">{self._val('export_contribution_percentage')}%</div>
        
        <div class="sub-label">c. A brief on types of customers</div>
        <div class="answer-value">{self._val('customer_types_brief')}</div>
        
        <div class="subsection-header">IV. Employees</div>
        
        <div class="question-item"><span class="q-num">20.</span><span class="q-text">Details as at the end of Financial Year:</span></div>
        
        <div class="sub-label">a. Employees and workers (including differently abled):</div>
        
        <table>
            <thead>
                <tr>
                    <th class="col-sno">S. No.</th>
                    <th>Particulars</th>
                    <th class="col-narrow">Total (A)</th>
                    <th class="col-narrow">Male No. (B)</th>
                    <th class="col-narrow">% (B/A)</th>
                    <th class="col-narrow">Female No. (C)</th>
                    <th class="col-narrow">% (C/A)</th>
                </tr>
            </thead>
            <tbody>
                <tr><td colspan="7" class="bold">EMPLOYEES</td></tr>
                {self._render_employees_table()}
                <tr><td colspan="7" class="bold">WORKERS</td></tr>
                {self._render_workers_table()}
            </tbody>
        </table>
        
        <div class="sub-label">b. Differently abled Employees and workers:</div>
        
        <table>
            <thead>
                <tr>
                    <th class="col-sno">S. No.</th>
                    <th>Particulars</th>
                    <th class="col-narrow">Total (A)</th>
                    <th class="col-narrow">Male No. (B)</th>
                    <th class="col-narrow">% (B/A)</th>
                    <th class="col-narrow">Female No. (C)</th>
                    <th class="col-narrow">% (C/A)</th>
                </tr>
            </thead>
            <tbody>
                <tr><td colspan="7" class="bold">DIFFERENTLY ABLED EMPLOYEES</td></tr>
                {self._render_differently_abled_employees()}
                <tr><td colspan="7" class="bold">DIFFERENTLY ABLED WORKERS</td></tr>
                {self._render_differently_abled_workers()}
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">21.</span><span class="q-text">Participation/Inclusion/Representation of women</span></div>
        
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
                    <td class="answer-cell">{self._val('women_bod_total')}</td>
                    <td class="answer-cell">{self._val('women_bod_female')}</td>
                    <td class="answer-cell">{self._val('women_bod_percent')}</td>
                </tr>
                <tr>
                    <td>Key Management Personnel</td>
                    <td class="answer-cell">{self._val('women_kmp_total')}</td>
                    <td class="answer-cell">{self._val('women_kmp_female')}</td>
                    <td class="answer-cell">{self._val('women_kmp_percent')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">22.</span><span class="q-text">Turnover rate for permanent employees and workers (Disclose trends for the past 3 years)</span></div>
        
        <table>
            <thead>
                <tr>
                    <th rowspan="2"></th>
                    <th colspan="3" class="fy-header">FY {self.reporting_period} (Current Financial Year)</th>
                    <th colspan="3" class="fy-header">FY (Previous Financial Year)</th>
                    <th colspan="3" class="fy-header">FY (Year prior to previous FY)</th>
                </tr>
                <tr>
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
                    <td class="answer-cell">{self._val('turnover_perm_emp_curr_male')}</td>
                    <td class="answer-cell">{self._val('turnover_perm_emp_curr_female')}</td>
                    <td class="answer-cell">{self._val('turnover_perm_emp_curr_total')}</td>
                    <td class="answer-cell">{self._val('turnover_perm_emp_prev_male')}</td>
                    <td class="answer-cell">{self._val('turnover_perm_emp_prev_female')}</td>
                    <td class="answer-cell">{self._val('turnover_perm_emp_prev_total')}</td>
                    <td class="answer-cell">{self._val('turnover_perm_emp_prior_male')}</td>
                    <td class="answer-cell">{self._val('turnover_perm_emp_prior_female')}</td>
                    <td class="answer-cell">{self._val('turnover_perm_emp_prior_total')}</td>
                </tr>
                <tr>
                    <td>Permanent Workers</td>
                    <td class="answer-cell">{self._val('turnover_perm_wrk_curr_male')}</td>
                    <td class="answer-cell">{self._val('turnover_perm_wrk_curr_female')}</td>
                    <td class="answer-cell">{self._val('turnover_perm_wrk_curr_total')}</td>
                    <td class="answer-cell">{self._val('turnover_perm_wrk_prev_male')}</td>
                    <td class="answer-cell">{self._val('turnover_perm_wrk_prev_female')}</td>
                    <td class="answer-cell">{self._val('turnover_perm_wrk_prev_total')}</td>
                    <td class="answer-cell">{self._val('turnover_perm_wrk_prior_male')}</td>
                    <td class="answer-cell">{self._val('turnover_perm_wrk_prior_female')}</td>
                    <td class="answer-cell">{self._val('turnover_perm_wrk_prior_total')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="subsection-header">V. Holding, Subsidiary and Associate Companies (including joint ventures)</div>
        
        <div class="question-item"><span class="q-num">23.</span><span class="q-text">(a) Names of holding / subsidiary / associate companies / joint ventures</span></div>
        
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
        
        <div class="subsection-header">VI. CSR Details</div>
        
        <div class="question-item"><span class="q-num">24.</span><span class="q-text">(i) Whether CSR is applicable as per section 135 of Companies Act, 2013: (Yes/No)</span></div>
        <div class="answer-value">{self._val('csr_applicable')}</div>
        
        <div class="sub-label">(ii) Turnover (in Rs.)</div>
        <div class="answer-value">{self._val('csr_turnover')}</div>
        
        <div class="sub-label">(iii) Net worth (in Rs.)</div>
        <div class="answer-value">{self._val('csr_net_worth')}</div>
        
        <div class="subsection-header">VII. Transparency and Disclosures Compliances</div>
        
        <div class="question-item"><span class="q-num">25.</span><span class="q-text">Complaints/Grievances on any of the principles (Principles 1 to 9) under the National Guidelines on Responsible Business Conduct:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th rowspan="2">Stakeholder group from whom complaint is received</th>
                    <th rowspan="2">Grievance Redressal Mechanism in Place (Yes/No)</th>
                    <th rowspan="2">(If Yes, then provide web-link for grievance redress policy)</th>
                    <th colspan="2" class="fy-header">FY {self.reporting_period} (Current Financial Year)</th>
                    <th colspan="2" class="fy-header">FY (Previous Financial Year)</th>
                </tr>
                <tr>
                    <th class="col-narrow">Number of complaints filed during the year</th>
                    <th class="col-narrow">Number of complaints pending resolution at close of the year</th>
                    <th class="col-narrow">Number of complaints filed during the year</th>
                    <th class="col-narrow">Number of complaints pending resolution at close of the year</th>
                </tr>
            </thead>
            <tbody>
                {self._render_grievances_table()}
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">26.</span><span class="q-text">Overview of the entity's material responsible business conduct issues</span></div>
        <p class="intro-text" style="margin-left: 20px;">Please indicate material responsible business conduct and sustainability issues pertaining to environmental and social matters that present a risk or an opportunity to your business, rationale for identifying the same, approach to adapt or mitigate the risk along-with its financial implications, as per the following format</p>
        
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
        
        return html
    
    def render_section_b(self) -> str:
        """
        Render Section B: Management and Process Disclosures
        EXACT replica of Annexure II pages 6-7
        """
        
        html = '''
        <div class="page-break"></div>
        
        <div class="section-header">SECTION B: MANAGEMENT AND PROCESS DISCLOSURES</div>
        
        <p class="intro-text">This section is aimed at helping businesses demonstrate the structures, policies and processes put in place towards adopting the NGRBC Principles and Core Elements.</p>
        
        <table>
            <thead>
                <tr>
                    <th>Disclosure Questions</th>
                    <th class="col-principle">P 1</th>
                    <th class="col-principle">P 2</th>
                    <th class="col-principle">P 3</th>
                    <th class="col-principle">P 4</th>
                    <th class="col-principle">P 5</th>
                    <th class="col-principle">P 6</th>
                    <th class="col-principle">P 7</th>
                    <th class="col-principle">P 8</th>
                    <th class="col-principle">P 9</th>
                </tr>
            </thead>
            <tbody>
                <tr><td colspan="10" class="bold">Policy and management processes</td></tr>
                <tr>
                    <td>1. a. Whether your entity's policy/policies cover each principle and its core elements of the NGRBCs. (Yes/No)</td>
        '''
        # Add P1-P9 cells for question 1a
        for p in range(1, 10):
            val = self._get_response(self.section_b_data, f'policy_covers_p{p}')
            html += f'<td class="answer-cell col-principle">{val}</td>'
        html += '</tr>'
        
        html += '''
                <tr>
                    <td>b. Has the policy been approved by the Board? (Yes/No)</td>
        '''
        for p in range(1, 10):
            val = self._get_response(self.section_b_data, f'policy_approved_p{p}')
            html += f'<td class="answer-cell col-principle">{val}</td>'
        html += '</tr>'
        
        html += '''
                <tr>
                    <td>c. Web Link of the Policies, if available</td>
        '''
        for p in range(1, 10):
            val = self._get_response(self.section_b_data, f'policy_weblink_p{p}')
            html += f'<td class="answer-cell col-principle">{val}</td>'
        html += '</tr>'
        
        html += '''
                <tr>
                    <td>2. Whether the entity has translated the policy into procedures. (Yes / No)</td>
        '''
        for p in range(1, 10):
            val = self._get_response(self.section_b_data, f'policy_procedures_p{p}')
            html += f'<td class="answer-cell col-principle">{val}</td>'
        html += '</tr>'
        
        html += '''
                <tr>
                    <td>3. Do the enlisted policies extend to your value chain partners? (Yes/No)</td>
        '''
        for p in range(1, 10):
            val = self._get_response(self.section_b_data, f'policy_valuechain_p{p}')
            html += f'<td class="answer-cell col-principle">{val}</td>'
        html += '</tr>'
        
        html += '''
                <tr>
                    <td>4. Name of the national and international codes/certifications/labels/ standards (e.g. Forest Stewardship Council, Fairtrade, Rainforest Alliance, Trustea) standards (e.g. SA 8000, OHSAS, ISO, BIS) adopted by your entity and mapped to each principle.</td>
        '''
        for p in range(1, 10):
            val = self._get_response(self.section_b_data, f'standards_p{p}')
            html += f'<td class="answer-cell col-principle">{val}</td>'
        html += '</tr>'
        
        html += '''
                <tr>
                    <td>5. Specific commitments, goals and targets set by the entity with defined timelines, if any.</td>
        '''
        for p in range(1, 10):
            val = self._get_response(self.section_b_data, f'commitments_p{p}')
            html += f'<td class="answer-cell col-principle">{val}</td>'
        html += '</tr>'
        
        html += '''
                <tr>
                    <td>6. Performance of the entity against the specific commitments, goals and targets along-with reasons in case the same are not met.</td>
        '''
        for p in range(1, 10):
            val = self._get_response(self.section_b_data, f'performance_p{p}')
            html += f'<td class="answer-cell col-principle">{val}</td>'
        html += '</tr>'
        
        html += '''
                <tr><td colspan="10" class="bold">Governance, leadership and oversight</td></tr>
                <tr>
                    <td colspan="10">7. Statement by director responsible for the business responsibility report, highlighting ESG related challenges, targets and achievements (listed entity has flexibility regarding the placement of this disclosure)</td>
                </tr>
        '''
        
        html += f'''
                <tr>
                    <td colspan="10" class="answer-cell">{self._get_response(self.section_b_data, 'director_statement')}</td>
                </tr>
                <tr>
                    <td colspan="10">8. Details of the highest authority responsible for implementation and oversight of the Business Responsibility policy (ies).</td>
                </tr>
                <tr>
                    <td colspan="10" class="answer-cell">{self._get_response(self.section_b_data, 'highest_authority')}</td>
                </tr>
                <tr>
                    <td colspan="10">9. Does the entity have a specified Committee of the Board/ Director responsible for decision making on sustainability related issues? (Yes / No). If yes, provide details.</td>
                </tr>
                <tr>
                    <td colspan="10" class="answer-cell">{self._get_response(self.section_b_data, 'sustainability_committee')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">10.</span><span class="q-text">Details of Review of NGRBCs by the Company:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th>Subject for Review</th>
                    <th>Indicate whether review was undertaken by Director / Committee of the Board/ Any other Committee</th>
                    <th>Frequency (Annually/ Quarterly/ Half yearly/ Any other – please specify)</th>
                </tr>
                <tr>
                    <th></th>
                    <th class="fy-header">P 1 2 3 4 5 6 7 8 9</th>
                    <th class="fy-header">P 1 2 3 4 5 6 7 8 9</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Performance against above policies and follow up action</td>
                    <td class="answer-cell">{self._get_response(self.section_b_data, 'review_performance')}</td>
                    <td class="answer-cell">{self._get_response(self.section_b_data, 'review_performance_freq')}</td>
                </tr>
                <tr>
                    <td>Compliance with statutory requirements of relevance to the principles, and, rectification of any non-compliances</td>
                    <td class="answer-cell">{self._get_response(self.section_b_data, 'review_compliance')}</td>
                    <td class="answer-cell">{self._get_response(self.section_b_data, 'review_compliance_freq')}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">11.</span><span class="q-text">Has the entity carried out independent assessment/ evaluation of the working of its policies by an external agency? (Yes/No). If yes, provide name of the agency.</span></div>
        
        <table>
            <thead>
                <tr>
                    <th></th>
                    <th class="col-principle">P 1</th>
                    <th class="col-principle">P 2</th>
                    <th class="col-principle">P 3</th>
                    <th class="col-principle">P 4</th>
                    <th class="col-principle">P 5</th>
                    <th class="col-principle">P 6</th>
                    <th class="col-principle">P 7</th>
                    <th class="col-principle">P 8</th>
                    <th class="col-principle">P 9</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td></td>
        '''
        for p in range(1, 10):
            val = self._get_response(self.section_b_data, f'external_assessment_p{p}')
            html += f'<td class="answer-cell col-principle">{val}</td>'
        html += '''
                </tr>
            </tbody>
        </table>
        
        <div class="question-item"><span class="q-num">12.</span><span class="q-text">If answer to question (1) above is "No" i.e. not all Principles are covered by a policy, reasons to be stated:</span></div>
        
        <table>
            <thead>
                <tr>
                    <th>Questions</th>
                    <th class="col-principle">P 1</th>
                    <th class="col-principle">P 2</th>
                    <th class="col-principle">P 3</th>
                    <th class="col-principle">P 4</th>
                    <th class="col-principle">P 5</th>
                    <th class="col-principle">P 6</th>
                    <th class="col-principle">P 7</th>
                    <th class="col-principle">P 8</th>
                    <th class="col-principle">P 9</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>The entity does not consider the Principles material to its business (Yes/No)</td>
        '''
        for p in range(1, 10):
            val = self._get_response(self.section_b_data, f'not_material_p{p}')
            html += f'<td class="answer-cell col-principle">{val}</td>'
        html += '''
                </tr>
                <tr>
                    <td>The entity is not at a stage where it is in a position to formulate and implement the policies on specified principles (Yes/No)</td>
        '''
        for p in range(1, 10):
            val = self._get_response(self.section_b_data, f'not_ready_p{p}')
            html += f'<td class="answer-cell col-principle">{val}</td>'
        html += '''
                </tr>
                <tr>
                    <td>The entity does not have the financial or/human and technical resources available for the task (Yes/No)</td>
        '''
        for p in range(1, 10):
            val = self._get_response(self.section_b_data, f'no_resources_p{p}')
            html += f'<td class="answer-cell col-principle">{val}</td>'
        html += '''
                </tr>
                <tr>
                    <td>It is planned to be done in the next financial year (Yes/No)</td>
        '''
        for p in range(1, 10):
            val = self._get_response(self.section_b_data, f'planned_next_fy_p{p}')
            html += f'<td class="answer-cell col-principle">{val}</td>'
        html += '''
                </tr>
                <tr>
                    <td>Any other reason (please specify)</td>
        '''
        for p in range(1, 10):
            val = self._get_response(self.section_b_data, f'other_reason_p{p}')
            html += f'<td class="answer-cell col-principle">{val}</td>'
        html += '''
                </tr>
            </tbody>
        </table>
        '''
        
        return html
    
    def render_section_c(self) -> str:
        """
        Render Section C: Principle Wise Performance Disclosure
        EXACT replica of Annexure II pages 8-41
        """
        
        html = '''
        <div class="page-break"></div>
        
        <div class="section-header">SECTION C: PRINCIPLE WISE PERFORMANCE DISCLOSURE</div>
        
        <p class="intro-text">This section is aimed at helping entities demonstrate their performance in integrating the Principles and Core Elements with key processes and decisions. The information sought is categorized as "Essential" and "Leadership". While the essential indicators are expected to be disclosed by every entity that is mandated to file this report, the leadership indicators may be voluntarily disclosed by entities which aspire to progress to a higher level in their quest to be socially, environmentally and ethically responsible.</p>
        '''
        
        # Render each principle
        for principle_key, principle_title in self.PRINCIPLES.items():
            html += self._render_principle(principle_key, principle_title)
        
        return html
    
    def _render_principle(self, principle_key: str, principle_title: str) -> str:
        """Render a single principle with its indicators."""
        principle_num = principle_key.replace('P', '')
        
        html = f'''
        <div class="page-break"></div>
        
        <div class="principle-header">PRINCIPLE {principle_num} {principle_title}</div>
        '''
        
        # Get configs for this principle
        principle_configs = [c for c in self.section_c_configs if c.get('brsr_principle') == principle_key]
        
        # Split into essential and leadership
        essential_configs = [c for c in principle_configs if not c.get('brsr_indicator_type') or c.get('brsr_indicator_type') == 'essential']
        leadership_configs = [c for c in principle_configs if c.get('brsr_indicator_type') == 'leadership']
        
        # Essential Indicators
        html += '<div class="indicator-header">Essential Indicators</div>'
        
        if essential_configs:
            for idx, config in enumerate(essential_configs, 1):
                html += self._render_indicator(idx, config)
        else:
            # Show placeholder based on principle
            html += self._render_default_essential_indicators(principle_key)
        
        # Leadership Indicators
        html += '<div class="indicator-header">Leadership Indicators</div>'
        
        if leadership_configs:
            for idx, config in enumerate(leadership_configs, 1):
                html += self._render_indicator(idx, config)
        else:
            html += self._render_default_leadership_indicators(principle_key)
        
        return html
    
    def _render_indicator(self, idx: int, config: Dict) -> str:
        """Render a single indicator question."""
        question_text = config.get('question') or config.get('question_text') or config.get('title') or config.get('description') or ''
        question_key = config.get('question_key', '')
        response = self.section_c_data.get(question_key, '')
        
        html = f'''
        <div class="question-item"><span class="q-num">{idx}.</span><span class="q-text">{question_text}</span></div>
        '''
        
        # Format response based on type
        if response:
            if isinstance(response, dict):
                html += '<div class="answer-value">'
                for k, v in response.items():
                    if v is not None and v != '':
                        html += f'{k}: {v}<br>'
                html += '</div>'
            elif isinstance(response, list):
                if response:
                    html += f'<div class="answer-value">{len(response)} entries recorded</div>'
            else:
                html += f'<div class="answer-value">{response}</div>'
        
        return html
    
    def _render_default_essential_indicators(self, principle_key: str) -> str:
        """Render default essential indicators placeholder for a principle."""
        # This would contain the standard Annexure II questions
        # For now, return placeholder
        return f'''
        <div class="question-item"><span class="q-num">1.</span><span class="q-text">[Essential indicator questions for {principle_key} will be populated from configured questionnaire]</span></div>
        <div class="answer-value"></div>
        '''
    
    def _render_default_leadership_indicators(self, principle_key: str) -> str:
        """Render default leadership indicators placeholder for a principle."""
        return f'''
        <div class="question-item"><span class="q-num">1.</span><span class="q-text">[Leadership indicator questions for {principle_key} will be populated from configured questionnaire]</span></div>
        <div class="answer-value"></div>
        '''
    
    # === Helper methods for Section A tables ===
    
    def _render_business_activities(self) -> str:
        """Render business activities table rows."""
        data = self.section_a.get('business_activities', [])
        if not data:
            return '<tr><td class="col-sno"></td><td class="answer-cell"></td><td class="answer-cell"></td><td class="answer-cell"></td></tr>'
        
        html = ''
        for i, item in enumerate(data):
            html += f'''<tr>
                <td class="col-sno">{i + 1}</td>
                <td class="answer-cell">{item.get('main_activity', '')}</td>
                <td class="answer-cell">{item.get('description', '')}</td>
                <td class="answer-cell">{item.get('turnover_percentage', '')}%</td>
            </tr>'''
        return html
    
    def _render_products_services(self) -> str:
        """Render products/services table rows."""
        data = self.section_a.get('products_services', [])
        if not data:
            return '<tr><td class="col-sno"></td><td class="answer-cell"></td><td class="answer-cell"></td><td class="answer-cell"></td></tr>'
        
        html = ''
        for i, item in enumerate(data):
            html += f'''<tr>
                <td class="col-sno">{i + 1}</td>
                <td class="answer-cell">{item.get('product_service', '')}</td>
                <td class="answer-cell">{item.get('nic_code', '')}</td>
                <td class="answer-cell">{item.get('turnover_percentage', '')}%</td>
            </tr>'''
        return html
    
    def _render_plants_offices(self) -> str:
        """Render plants/offices table rows."""
        data = self.section_a.get('plants_offices', [])
        
        national = {'num_plants': '', 'num_offices': '', 'total': ''}
        international = {'num_plants': '', 'num_offices': '', 'total': ''}
        
        for item in data:
            loc_type = item.get('location_type', '').lower()
            plants = item.get('num_plants', 0) or 0
            offices = item.get('num_offices', 0) or 0
            total = plants + offices
            if 'national' in loc_type:
                national = {'num_plants': plants, 'num_offices': offices, 'total': total}
            elif 'international' in loc_type:
                international = {'num_plants': plants, 'num_offices': offices, 'total': total}
        
        return f'''
        <tr>
            <td>National</td>
            <td class="answer-cell">{national['num_plants']}</td>
            <td class="answer-cell">{national['num_offices']}</td>
            <td class="answer-cell">{national['total']}</td>
        </tr>
        <tr>
            <td>International</td>
            <td class="answer-cell">{international['num_plants']}</td>
            <td class="answer-cell">{international['num_offices']}</td>
            <td class="answer-cell">{international['total']}</td>
        </tr>
        '''
    
    def _render_markets_served(self) -> str:
        """Render markets served table rows."""
        data = self.section_a.get('markets_served', [])
        
        national = ''
        international = ''
        
        for item in data:
            loc_type = item.get('location_type', '').lower()
            number = item.get('number', '')
            if 'national' in loc_type:
                national = number
            elif 'international' in loc_type:
                international = number
        
        return f'''
        <tr>
            <td>National (No. of States)</td>
            <td class="answer-cell">{national}</td>
        </tr>
        <tr>
            <td>International (No. of Countries)</td>
            <td class="answer-cell">{international}</td>
        </tr>
        '''
    
    def _render_employees_table(self) -> str:
        """Render employees section of Q20 table."""
        return f'''
        <tr>
            <td class="col-sno">1.</td>
            <td>Permanent (D)</td>
            <td class="answer-cell">{self._val('emp_perm_total')}</td>
            <td class="answer-cell">{self._val('emp_perm_male')}</td>
            <td class="answer-cell">{self._val('emp_perm_male_pct')}</td>
            <td class="answer-cell">{self._val('emp_perm_female')}</td>
            <td class="answer-cell">{self._val('emp_perm_female_pct')}</td>
        </tr>
        <tr>
            <td class="col-sno">2.</td>
            <td>Other than Permanent (E)</td>
            <td class="answer-cell">{self._val('emp_other_total')}</td>
            <td class="answer-cell">{self._val('emp_other_male')}</td>
            <td class="answer-cell">{self._val('emp_other_male_pct')}</td>
            <td class="answer-cell">{self._val('emp_other_female')}</td>
            <td class="answer-cell">{self._val('emp_other_female_pct')}</td>
        </tr>
        <tr>
            <td class="col-sno">3.</td>
            <td class="bold">Total employees (D + E)</td>
            <td class="answer-cell">{self._val('emp_total_total')}</td>
            <td class="answer-cell">{self._val('emp_total_male')}</td>
            <td class="answer-cell">{self._val('emp_total_male_pct')}</td>
            <td class="answer-cell">{self._val('emp_total_female')}</td>
            <td class="answer-cell">{self._val('emp_total_female_pct')}</td>
        </tr>
        '''
    
    def _render_workers_table(self) -> str:
        """Render workers section of Q20 table."""
        return f'''
        <tr>
            <td class="col-sno">4.</td>
            <td>Permanent (F)</td>
            <td class="answer-cell">{self._val('wrk_perm_total')}</td>
            <td class="answer-cell">{self._val('wrk_perm_male')}</td>
            <td class="answer-cell">{self._val('wrk_perm_male_pct')}</td>
            <td class="answer-cell">{self._val('wrk_perm_female')}</td>
            <td class="answer-cell">{self._val('wrk_perm_female_pct')}</td>
        </tr>
        <tr>
            <td class="col-sno">5.</td>
            <td>Other than Permanent (G)</td>
            <td class="answer-cell">{self._val('wrk_other_total')}</td>
            <td class="answer-cell">{self._val('wrk_other_male')}</td>
            <td class="answer-cell">{self._val('wrk_other_male_pct')}</td>
            <td class="answer-cell">{self._val('wrk_other_female')}</td>
            <td class="answer-cell">{self._val('wrk_other_female_pct')}</td>
        </tr>
        <tr>
            <td class="col-sno">6.</td>
            <td class="bold">Total workers (F + G)</td>
            <td class="answer-cell">{self._val('wrk_total_total')}</td>
            <td class="answer-cell">{self._val('wrk_total_male')}</td>
            <td class="answer-cell">{self._val('wrk_total_male_pct')}</td>
            <td class="answer-cell">{self._val('wrk_total_female')}</td>
            <td class="answer-cell">{self._val('wrk_total_female_pct')}</td>
        </tr>
        '''
    
    def _render_differently_abled_employees(self) -> str:
        """Render differently abled employees table."""
        return f'''
        <tr>
            <td class="col-sno">1.</td>
            <td>Permanent (D)</td>
            <td class="answer-cell">{self._val('da_emp_perm_total')}</td>
            <td class="answer-cell">{self._val('da_emp_perm_male')}</td>
            <td class="answer-cell">{self._val('da_emp_perm_male_pct')}</td>
            <td class="answer-cell">{self._val('da_emp_perm_female')}</td>
            <td class="answer-cell">{self._val('da_emp_perm_female_pct')}</td>
        </tr>
        <tr>
            <td class="col-sno">2.</td>
            <td>Other than Permanent (E)</td>
            <td class="answer-cell">{self._val('da_emp_other_total')}</td>
            <td class="answer-cell">{self._val('da_emp_other_male')}</td>
            <td class="answer-cell">{self._val('da_emp_other_male_pct')}</td>
            <td class="answer-cell">{self._val('da_emp_other_female')}</td>
            <td class="answer-cell">{self._val('da_emp_other_female_pct')}</td>
        </tr>
        <tr>
            <td class="col-sno">3.</td>
            <td class="bold">Total differently abled employees (D + E)</td>
            <td class="answer-cell">{self._val('da_emp_total_total')}</td>
            <td class="answer-cell">{self._val('da_emp_total_male')}</td>
            <td class="answer-cell">{self._val('da_emp_total_male_pct')}</td>
            <td class="answer-cell">{self._val('da_emp_total_female')}</td>
            <td class="answer-cell">{self._val('da_emp_total_female_pct')}</td>
        </tr>
        '''
    
    def _render_differently_abled_workers(self) -> str:
        """Render differently abled workers table."""
        return f'''
        <tr>
            <td class="col-sno">4.</td>
            <td>Permanent (F)</td>
            <td class="answer-cell">{self._val('da_wrk_perm_total')}</td>
            <td class="answer-cell">{self._val('da_wrk_perm_male')}</td>
            <td class="answer-cell">{self._val('da_wrk_perm_male_pct')}</td>
            <td class="answer-cell">{self._val('da_wrk_perm_female')}</td>
            <td class="answer-cell">{self._val('da_wrk_perm_female_pct')}</td>
        </tr>
        <tr>
            <td class="col-sno">5.</td>
            <td>Other than permanent (G)</td>
            <td class="answer-cell">{self._val('da_wrk_other_total')}</td>
            <td class="answer-cell">{self._val('da_wrk_other_male')}</td>
            <td class="answer-cell">{self._val('da_wrk_other_male_pct')}</td>
            <td class="answer-cell">{self._val('da_wrk_other_female')}</td>
            <td class="answer-cell">{self._val('da_wrk_other_female_pct')}</td>
        </tr>
        <tr>
            <td class="col-sno">6.</td>
            <td class="bold">Total differently abled workers (F + G)</td>
            <td class="answer-cell">{self._val('da_wrk_total_total')}</td>
            <td class="answer-cell">{self._val('da_wrk_total_male')}</td>
            <td class="answer-cell">{self._val('da_wrk_total_male_pct')}</td>
            <td class="answer-cell">{self._val('da_wrk_total_female')}</td>
            <td class="answer-cell">{self._val('da_wrk_total_female_pct')}</td>
        </tr>
        '''
    
    def _render_holding_companies(self) -> str:
        """Render holding/subsidiary companies table rows."""
        data = self.section_a.get('holding_companies', [])
        if not data:
            return '<tr><td class="col-sno"></td><td class="answer-cell"></td><td class="answer-cell"></td><td class="answer-cell"></td><td class="answer-cell"></td></tr>'
        
        html = ''
        for i, item in enumerate(data):
            html += f'''<tr>
                <td class="col-sno">{i + 1}</td>
                <td class="answer-cell">{item.get('name', '')}</td>
                <td class="answer-cell">{item.get('type', '')}</td>
                <td class="answer-cell">{item.get('shares_held', '')}%</td>
                <td class="answer-cell">{item.get('participates_br', '')}</td>
            </tr>'''
        return html
    
    def _render_grievances_table(self) -> str:
        """Render grievances/complaints table rows."""
        stakeholders = [
            ('Communities', 'communities'),
            ('Investors (other than shareholders)', 'investors'),
            ('Shareholders', 'shareholders'),
            ('Employees and workers', 'employees'),
            ('Customers', 'customers'),
            ('Value Chain Partners', 'valuechain'),
            ('Other (please specify)', 'other'),
        ]
        
        html = ''
        for label, key in stakeholders:
            html += f'''<tr>
                <td>{label}</td>
                <td class="answer-cell">{self._val(f'grievance_{key}_mechanism')}</td>
                <td class="answer-cell">{self._val(f'grievance_{key}_weblink')}</td>
                <td class="answer-cell">{self._val(f'grievance_{key}_curr_filed')}</td>
                <td class="answer-cell">{self._val(f'grievance_{key}_curr_pending')}</td>
                <td class="answer-cell">{self._val(f'grievance_{key}_prev_filed')}</td>
                <td class="answer-cell">{self._val(f'grievance_{key}_prev_pending')}</td>
            </tr>'''
        return html
    
    def _render_material_issues(self) -> str:
        """Render material issues table rows."""
        data = self.section_a.get('material_issues', [])
        if not data:
            return '<tr><td class="col-sno"></td><td class="answer-cell"></td><td class="answer-cell"></td><td class="answer-cell"></td><td class="answer-cell"></td><td class="answer-cell"></td></tr>'
        
        html = ''
        for i, item in enumerate(data):
            html += f'''<tr>
                <td class="col-sno">{i + 1}</td>
                <td class="answer-cell">{item.get('issue', '')}</td>
                <td class="answer-cell">{item.get('risk_or_opportunity', '')}</td>
                <td class="answer-cell">{item.get('rationale', '')}</td>
                <td class="answer-cell">{item.get('approach', '')}</td>
                <td class="answer-cell">{item.get('financial_implications', '')}</td>
            </tr>'''
        return html
    
    def render(self) -> str:
        """Render the complete BRSR HTML document."""
        html = f'''
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>BRSR Report - {self.organization.get('name', 'Organization')}</title>
            <style>
                {self.get_css()}
            </style>
        </head>
        <body>
            {self.render_section_a()}
            {self.render_section_b()}
            {self.render_section_c()}
        </body>
        </html>
        '''
        return html
