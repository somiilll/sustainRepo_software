/**
 * BRSR Report Generator
 * 
 * Generates a comprehensive BRSR (Business Responsibility & Sustainability Report)
 * following the exact Annexure II format from SEBI guidelines.
 * 
 * Sections:
 * - Section A: General Disclosures (Entity details, Products, Operations, Employees, etc.)
 * - Section B: Management and Process Disclosures
 * - Section C: Principle-wise Performance Disclosures (P1-P9)
 */

import jsPDF from 'jspdf';

// Page dimensions (A4 in mm)
const PAGE = {
  width: 210,
  height: 297,
  margin: 12,
  marginSmall: 8,
  contentWidth: 186,
  headerHeight: 10,
  footerHeight: 8,
};

// Color palette - professional BRSR colors
const COLORS = {
  primary: '#1E3A5F',      // Dark blue
  secondary: '#2E5090',    // Medium blue
  accent: '#4A90D9',       // Light blue
  text: '#1C1917',
  textMuted: '#57534E',
  textLight: '#78716C',
  border: '#D6D3D1',
  borderLight: '#E7E5E4',
  background: '#FFFFFF',
  backgroundAlt: '#F5F5F4',
  tableHeader: '#1E3A5F',
  tableAlt: '#F8FAFC',
};

// Principle metadata matching Annexure II
const PRINCIPLE_META = {
  P1: { name: 'PRINCIPLE 1', title: 'Businesses should conduct and govern themselves with integrity, and in a manner that is Ethical, Transparent and Accountable.' },
  P2: { name: 'PRINCIPLE 2', title: 'Businesses should provide goods and services in a manner that is sustainable and safe.' },
  P3: { name: 'PRINCIPLE 3', title: 'Businesses should respect and promote the well-being of all employees, including those in their value chains.' },
  P4: { name: 'PRINCIPLE 4', title: 'Businesses should respect the interests of and be responsive to all its stakeholders.' },
  P5: { name: 'PRINCIPLE 5', title: 'Businesses should respect and promote human rights.' },
  P6: { name: 'PRINCIPLE 6', title: 'Businesses should respect and make efforts to protect and restore the environment.' },
  P7: { name: 'PRINCIPLE 7', title: 'Businesses, when engaging in influencing public and regulatory policy, should do so in a manner that is responsible and transparent.' },
  P8: { name: 'PRINCIPLE 8', title: 'Businesses should promote inclusive growth and equitable development.' },
  P9: { name: 'PRINCIPLE 9', title: 'Businesses should engage with and provide value to their consumers in a responsible manner.' },
};

export class BRSRReportGenerator {
  constructor(options = {}) {
    this.doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    
    this.organization = options.organization || {};
    this.reportingPeriod = options.reportingPeriod || '';
    this.sectionAData = options.sectionAData || {};
    this.sectionBData = options.sectionBData || {};
    this.sectionBConfigs = options.sectionBConfigs || [];
    this.sectionCData = options.sectionCData || {};
    this.sectionCConfigs = options.sectionCConfigs || [];
    this.user = options.user || {};
    
    this.pageNumber = 0;
    this.currentY = PAGE.margin;
    this.questionCounter = 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  addNewPage() {
    if (this.pageNumber > 0) {
      this.addFooter();
      this.doc.addPage();
    }
    this.pageNumber++;
    this.currentY = PAGE.margin;
  }

  addFooter() {
    const y = PAGE.height - 6;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text(`Page ${this.pageNumber}`, PAGE.width / 2, y, { align: 'center' });
  }

  checkPageBreak(requiredHeight) {
    const availableHeight = PAGE.height - PAGE.footerHeight - 10 - this.currentY;
    if (requiredHeight > availableHeight) {
      this.addNewPage();
      return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COVER PAGE - Matching Annexure II style
  // ═══════════════════════════════════════════════════════════════════════════

  addCoverPage() {
    this.pageNumber = 1;
    const centerX = PAGE.width / 2;
    
    // Title at top
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(16);
    this.doc.setTextColor(COLORS.primary);
    this.doc.text('ANNEXURE II', centerX, 30, { align: 'center' });
    
    this.doc.setFontSize(14);
    this.doc.text('FORMAT FOR', centerX, 45, { align: 'center' });
    
    this.doc.setFontSize(18);
    this.doc.text('BUSINESS RESPONSIBILITY &', centerX, 65, { align: 'center' });
    this.doc.text('SUSTAINABILITY REPORT', centerX, 78, { align: 'center' });
    
    // Company name box
    this.doc.setDrawColor(COLORS.primary);
    this.doc.setLineWidth(1);
    this.doc.rect(30, 100, 150, 25);
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(14);
    this.doc.setTextColor(COLORS.text);
    this.doc.text(this.organization.name || 'Company Name', centerX, 115, { align: 'center' });
    
    // CIN
    if (this.sectionAData.cin) {
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(10);
      this.doc.text(`CIN: ${this.sectionAData.cin}`, centerX, 140, { align: 'center' });
    }
    
    // Reporting Period
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(12);
    this.doc.text('Financial Year:', centerX, 160, { align: 'center' });
    this.doc.setFontSize(14);
    this.doc.text(this.reportingPeriod || 'FY 2024-2025', centerX, 175, { align: 'center' });
    
    // Sections list
    let y = 200;
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.text('This report contains:', PAGE.margin + 20, y);
    
    y += 12;
    const sections = [
      'SECTION A: GENERAL DISCLOSURES',
      'SECTION B: MANAGEMENT AND PROCESS DISCLOSURES',
      'SECTION C: PRINCIPLE WISE PERFORMANCE DISCLOSURE',
    ];
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    sections.forEach((section) => {
      this.doc.text(`• ${section}`, PAGE.margin + 25, y);
      y += 8;
    });
    
    // Footer note
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('(Pursuant to Regulation 34(2)(f) of the SEBI (Listing Obligations and', centerX, 260, { align: 'center' });
    this.doc.text('Disclosure Requirements) Regulations, 2015)', centerX, 268, { align: 'center' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: GENERAL DISCLOSURES
  // ═══════════════════════════════════════════════════════════════════════════

  addSectionA() {
    this.addNewPage();
    this.questionCounter = 0;
    
    // Section header
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(14);
    this.doc.setTextColor(COLORS.primary);
    this.doc.text('SECTION A: GENERAL DISCLOSURES', PAGE.margin, this.currentY + 5);
    this.currentY += 15;
    
    const data = this.sectionAData;
    
    // I. Details of the Listed Entity
    this.addSubsectionHeader('I. Details of the listed entity');
    
    // Questions 1-15 in table format
    const entityQuestions = [
      ['1', 'Corporate Identity Number (CIN) of the Listed Entity', data.cin || '-'],
      ['2', 'Name of the Listed Entity', data.listed_entity_name || '-'],
      ['3', 'Year of incorporation', data.year_of_incorporation ? String(data.year_of_incorporation) : '-'],
      ['4', 'Registered office address', this.formatAddress(data, 'registered') || '-'],
      ['5', 'Corporate address', this.formatAddress(data, 'corporate') || '-'],
      ['6', 'E-mail', data.email || '-'],
      ['7', 'Telephone', data.telephone || '-'],
      ['8', 'Website', data.website || '-'],
      ['9', 'Financial year for which reporting is being done', this.reportingPeriod || '-'],
      ['10', 'Name of the Stock Exchange(s) where shares are listed', data.stock_exchange || '-'],
      ['11', 'Paid-up Capital', data.paid_up_capital ? `Rs. ${Number(data.paid_up_capital).toLocaleString('en-IN')}` : '-'],
      ['12', 'Name and contact details of the person who may be contacted in case of any queries on the BRSR report', this.formatContact(data) || '-'],
      ['13', 'Reporting boundary - Are the disclosures under this report made on a standalone basis or on a consolidated basis', data.reporting_boundary || '-'],
      ['14', 'Name of assurance provider', data.assurance_provider || '-'],
      ['15', 'Type of assurance obtained', data.assurance_type || '-'],
    ];
    
    this.addQuestionTable(entityQuestions);
    
    // II. Products/Services
    this.addSubsectionHeader('II. Products/services');
    
    // Q16
    this.addQuestionNumber('16');
    this.addQuestionText('Details of business activities (accounting for 90% of the turnover):');
    
    if (data.business_activities && data.business_activities.length > 0) {
      const headers = ['S. No.', 'Description of Main Activity', 'Description of Business Activity', '% of Turnover of the entity'];
      const rows = data.business_activities.map((item, idx) => [
        String(idx + 1),
        item.description || '-',
        item.main_activity || '-',
        item.turnover_percentage !== undefined ? `${item.turnover_percentage}%` : '-'
      ]);
      this.addDataTable(headers, rows);
    } else {
      this.addEmptyTablePlaceholder();
    }
    
    // Q17
    this.addQuestionNumber('17');
    this.addQuestionText('Products/Services sold by the entity (accounting for 90% of the entity\'s Turnover):');
    
    if (data.products_services && data.products_services.length > 0) {
      const headers = ['S. No.', 'Product/Service', 'NIC Code', '% of total Turnover contributed'];
      const rows = data.products_services.map((item, idx) => [
        String(idx + 1),
        item.product_service || '-',
        item.nic_code || '-',
        item.turnover_percentage !== undefined ? `${item.turnover_percentage}%` : '-'
      ]);
      this.addDataTable(headers, rows);
    } else {
      this.addEmptyTablePlaceholder();
    }
    
    // III. Operations
    this.addSubsectionHeader('III. Operations');
    
    // Q18
    this.addQuestionNumber('18');
    this.addQuestionText('Number of locations where plants and/or operations/offices of the entity are situated:');
    
    if (data.plants_offices && data.plants_offices.length > 0) {
      const headers = ['Location', 'Number of plants', 'Number of offices', 'Total'];
      const rows = data.plants_offices.map(item => [
        item.location_type || '-',
        item.num_plants !== undefined ? String(item.num_plants) : '-',
        item.num_offices !== undefined ? String(item.num_offices) : '-',
        String((item.num_plants || 0) + (item.num_offices || 0))
      ]);
      this.addDataTable(headers, rows);
    } else {
      this.addEmptyTablePlaceholder();
    }
    
    // Q19
    this.addQuestionNumber('19');
    this.addQuestionText('Markets served by the entity:');
    
    // Q19a
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.text);
    this.doc.text('a. Number of locations', PAGE.margin + 5, this.currentY);
    this.currentY += 5;
    
    if (data.markets_served && data.markets_served.length > 0) {
      const headers = ['Locations', 'Number'];
      const rows = data.markets_served.map(item => [
        item.location_type === 'National' ? 'National (No. of States)' : 'International (No. of Countries)',
        item.number !== undefined ? String(item.number) : '-'
      ]);
      this.addDataTable(headers, rows);
    } else {
      this.addEmptyTablePlaceholder();
    }
    
    // Q19b
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.text(`b. What is the contribution of exports as a percentage of the total turnover of the entity?`, PAGE.margin + 5, this.currentY);
    this.currentY += 5;
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(`Answer: ${data.export_contribution_percentage !== undefined ? data.export_contribution_percentage + '%' : 'Not provided'}`, PAGE.margin + 8, this.currentY);
    this.currentY += 8;
    
    // Q19c
    this.doc.setFont('helvetica', 'normal');
    this.doc.text('c. A brief on types of customers', PAGE.margin + 5, this.currentY);
    this.currentY += 5;
    if (data.customer_types_brief) {
      const lines = this.doc.splitTextToSize(data.customer_types_brief, PAGE.contentWidth - 10);
      this.doc.text(lines, PAGE.margin + 8, this.currentY);
      this.currentY += lines.length * 4 + 5;
    } else {
      this.doc.setFont('helvetica', 'italic');
      this.doc.setTextColor(COLORS.textMuted);
      this.doc.text('Not provided', PAGE.margin + 8, this.currentY);
      this.currentY += 8;
    }
    
    // IV. Employees
    this.addSubsectionHeader('IV. Employees');
    this.addQuestionNumber('20');
    this.addQuestionText('Details as at the end of Financial Year:');
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('(Employee data tables - refer to workforce section for detailed breakdown)', PAGE.margin + 5, this.currentY);
    this.currentY += 10;
    
    // V. Holding, Subsidiary
    this.addSubsectionHeader('V. Holding, Subsidiary and Associate Companies (including joint ventures)');
    this.addQuestionNumber('23');
    this.addQuestionText('(a) Names of holding / subsidiary / associate companies / joint ventures');
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('(Details as per annual report and statutory filings)', PAGE.margin + 5, this.currentY);
    this.currentY += 10;
    
    // VI. CSR Details
    this.addSubsectionHeader('VI. CSR Details');
    this.addQuestionNumber('24');
    this.addQuestionText('(i) Whether CSR is applicable as per section 135 of Companies Act, 2013: (Yes/No)');
    this.currentY += 5;
    
    // VII. Transparency and Disclosures
    this.addSubsectionHeader('VII. Transparency and Disclosures Compliances');
    this.addQuestionNumber('25');
    this.addQuestionText('Complaints/Grievances on any of the principles (Principles 1 to 9) under the National Guidelines on Responsible Business Conduct:');
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('(Refer to Section C for detailed principle-wise disclosures)', PAGE.margin + 5, this.currentY);
    this.currentY += 8;
    
    this.addQuestionNumber('26');
    this.addQuestionText('Overview of the entity\'s material responsible business conduct issues:');
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('(Material issues identified with risk/opportunity assessment)', PAGE.margin + 5, this.currentY);
    this.currentY += 10;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B: MANAGEMENT AND PROCESS DISCLOSURES
  // ═══════════════════════════════════════════════════════════════════════════

  addSectionB() {
    this.addNewPage();
    
    // Section header
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(14);
    this.doc.setTextColor(COLORS.primary);
    this.doc.text('SECTION B: MANAGEMENT AND PROCESS DISCLOSURES', PAGE.margin, this.currentY + 5);
    this.currentY += 15;
    
    // Intro text
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.text);
    const introText = 'This section is aimed at helping businesses demonstrate the structures, policies, and processes put in place towards adopting the NGRBC Principles and Core Elements.';
    const introLines = this.doc.splitTextToSize(introText, PAGE.contentWidth);
    this.doc.text(introLines, PAGE.margin, this.currentY);
    this.currentY += introLines.length * 4 + 8;
    
    // Disclosure Questions
    this.addSubsectionHeader('Policy and management processes');
    
    let questionNum = 1;
    
    // Render each Section B config
    this.sectionBConfigs.forEach((config) => {
      this.checkPageBreak(30);
      
      // Get the question text from the correct field
      const questionText = config.question || config.question_text || config.title || config.description || 'Question not available';
      
      this.addQuestionNumber(String(questionNum));
      this.addQuestionText(questionText);
      
      // Get response value
      const response = this.sectionBData[config.question_key];
      this.renderResponse(response, config.type);
      
      questionNum++;
    });
    
    // If no configs, show placeholder
    if (this.sectionBConfigs.length === 0) {
      this.doc.setFont('helvetica', 'italic');
      this.doc.setFontSize(9);
      this.doc.setTextColor(COLORS.textMuted);
      this.doc.text('No Section B disclosures have been configured.', PAGE.margin + 5, this.currentY);
      this.currentY += 10;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: PRINCIPLE WISE PERFORMANCE DISCLOSURE
  // ═══════════════════════════════════════════════════════════════════════════

  addSectionC() {
    this.addNewPage();
    
    // Section header
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(14);
    this.doc.setTextColor(COLORS.primary);
    this.doc.text('SECTION C: PRINCIPLE WISE PERFORMANCE DISCLOSURE', PAGE.margin, this.currentY + 5);
    this.currentY += 15;
    
    // Intro text
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.text);
    const introText = 'This section is aimed at helping entities demonstrate their performance in integrating the Principles and Core Elements with key processes and decisions. The information sought is categorized as "Essential" and "Leadership". While the essential indicators are expected to be disclosed by every entity that is required to file this report, the leadership indicators may be voluntarily disclosed by entities which aspire to progress to a higher level in their quest to be socially, environmentally and ethically responsible.';
    const introLines = this.doc.splitTextToSize(introText, PAGE.contentWidth);
    this.doc.text(introLines, PAGE.margin, this.currentY);
    this.currentY += introLines.length * 4 + 10;
    
    // Group configs by principle
    const groupedByPrinciple = {};
    this.sectionCConfigs.forEach(config => {
      const principle = config.brsr_principle || 'OTHER';
      if (!groupedByPrinciple[principle]) groupedByPrinciple[principle] = [];
      groupedByPrinciple[principle].push(config);
    });
    
    // Render each principle
    Object.entries(PRINCIPLE_META).forEach(([principleKey, meta]) => {
      const configs = groupedByPrinciple[principleKey] || [];
      
      this.checkPageBreak(50);
      
      // Principle header box
      this.doc.setFillColor(COLORS.tableHeader);
      this.doc.rect(PAGE.margin, this.currentY, PAGE.contentWidth, 12, 'F');
      
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(10);
      this.doc.setTextColor('#FFFFFF');
      this.doc.text(meta.name, PAGE.margin + 3, this.currentY + 8);
      this.currentY += 14;
      
      // Principle description
      this.doc.setFont('helvetica', 'italic');
      this.doc.setFontSize(9);
      this.doc.setTextColor(COLORS.text);
      const titleLines = this.doc.splitTextToSize(meta.title, PAGE.contentWidth - 5);
      this.doc.text(titleLines, PAGE.margin + 2, this.currentY);
      this.currentY += titleLines.length * 4 + 8;
      
      if (configs.length === 0) {
        this.doc.setFont('helvetica', 'italic');
        this.doc.setFontSize(9);
        this.doc.setTextColor(COLORS.textMuted);
        this.doc.text('No indicators configured for this principle.', PAGE.margin + 5, this.currentY);
        this.currentY += 10;
      } else {
        // Group by indicator type
        const essential = configs.filter(c => !c.brsr_indicator_type || c.brsr_indicator_type === 'essential');
        const leadership = configs.filter(c => c.brsr_indicator_type === 'leadership');
        
        if (essential.length > 0) {
          this.doc.setFont('helvetica', 'bold');
          this.doc.setFontSize(10);
          this.doc.setTextColor(COLORS.primary);
          this.doc.text('Essential Indicators', PAGE.margin + 3, this.currentY);
          this.currentY += 7;
          
          essential.forEach((config, idx) => {
            this.checkPageBreak(25);
            
            const questionText = config.question || config.question_text || config.title || config.description || 'Indicator not specified';
            
            this.addQuestionNumber(String(idx + 1));
            this.addQuestionText(questionText);
            
            const response = this.sectionCData[config.question_key];
            this.renderResponse(response, config.type);
          });
        }
        
        if (leadership.length > 0) {
          this.checkPageBreak(25);
          this.doc.setFont('helvetica', 'bold');
          this.doc.setFontSize(10);
          this.doc.setTextColor(COLORS.primary);
          this.doc.text('Leadership Indicators', PAGE.margin + 3, this.currentY);
          this.currentY += 7;
          
          leadership.forEach((config, idx) => {
            this.checkPageBreak(25);
            
            const questionText = config.question || config.question_text || config.title || config.description || 'Indicator not specified';
            
            this.addQuestionNumber(String(idx + 1));
            this.addQuestionText(questionText);
            
            const response = this.sectionCData[config.question_key];
            this.renderResponse(response, config.type);
          });
        }
      }
      
      this.currentY += 5;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  formatAddress(data, type) {
    const prefix = type === 'registered' ? 'registered_' : 'corporate_';
    const parts = [
      data[`${prefix}address`],
      data[`${prefix}city`],
      data[`${prefix}state`],
      data[`${prefix}country`],
      data[`${prefix}pincode`]
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  }

  formatContact(data) {
    const parts = [];
    if (data.brsr_contact_name) parts.push(`Name: ${data.brsr_contact_name}`);
    if (data.brsr_contact_telephone) parts.push(`Tel: ${data.brsr_contact_telephone}`);
    if (data.brsr_contact_email) parts.push(`Email: ${data.brsr_contact_email}`);
    return parts.length > 0 ? parts.join(', ') : null;
  }

  addSubsectionHeader(text) {
    this.checkPageBreak(15);
    
    this.doc.setFillColor(COLORS.backgroundAlt);
    this.doc.rect(PAGE.margin, this.currentY - 2, PAGE.contentWidth, 8, 'F');
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(10);
    this.doc.setTextColor(COLORS.primary);
    this.doc.text(text, PAGE.margin + 2, this.currentY + 3);
    this.currentY += 12;
  }

  addQuestionNumber(num) {
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.text);
    this.doc.text(`${num}.`, PAGE.margin, this.currentY);
  }

  addQuestionText(text) {
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.text);
    const lines = this.doc.splitTextToSize(text, PAGE.contentWidth - 8);
    this.doc.text(lines, PAGE.margin + 6, this.currentY);
    this.currentY += lines.length * 4 + 3;
  }

  addQuestionTable(questions) {
    const col1Width = 8;
    const col2Width = 90;
    const col3Width = PAGE.contentWidth - col1Width - col2Width;
    
    questions.forEach((q, idx) => {
      this.checkPageBreak(12);
      
      // Alternate row background
      if (idx % 2 === 0) {
        this.doc.setFillColor(COLORS.tableAlt);
        this.doc.rect(PAGE.margin, this.currentY - 2, PAGE.contentWidth, 8, 'F');
      }
      
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(8);
      this.doc.setTextColor(COLORS.text);
      this.doc.text(q[0], PAGE.margin + 2, this.currentY + 2);
      
      this.doc.setFont('helvetica', 'normal');
      // Wrap question text if needed
      const questionLines = this.doc.splitTextToSize(q[1], col2Width - 4);
      this.doc.text(questionLines, PAGE.margin + col1Width + 2, this.currentY + 2);
      
      // Wrap answer text if needed
      const answerLines = this.doc.splitTextToSize(q[2], col3Width - 4);
      this.doc.text(answerLines, PAGE.margin + col1Width + col2Width + 2, this.currentY + 2);
      
      const rowHeight = Math.max(questionLines.length, answerLines.length) * 4 + 4;
      this.currentY += rowHeight;
    });
    
    this.currentY += 5;
  }

  addDataTable(headers, rows) {
    this.checkPageBreak(20 + rows.length * 8);
    
    const numCols = headers.length;
    const colWidth = PAGE.contentWidth / numCols;
    
    // Header row
    this.doc.setFillColor(COLORS.tableHeader);
    this.doc.rect(PAGE.margin, this.currentY, PAGE.contentWidth, 7, 'F');
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(8);
    this.doc.setTextColor('#FFFFFF');
    
    headers.forEach((header, idx) => {
      const x = PAGE.margin + (idx * colWidth);
      this.doc.text(header, x + 2, this.currentY + 5);
    });
    
    this.currentY += 7;
    
    // Data rows
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(COLORS.text);
    
    rows.forEach((row, rowIdx) => {
      if (rowIdx % 2 === 0) {
        this.doc.setFillColor(COLORS.tableAlt);
        this.doc.rect(PAGE.margin, this.currentY, PAGE.contentWidth, 6, 'F');
      }
      
      row.forEach((cell, colIdx) => {
        const x = PAGE.margin + (colIdx * colWidth);
        const cellText = String(cell || '-').substring(0, 35);
        this.doc.text(cellText, x + 2, this.currentY + 4);
      });
      
      this.currentY += 6;
    });
    
    // Border
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(0.3);
    const tableHeight = 7 + (rows.length * 6);
    this.doc.rect(PAGE.margin, this.currentY - tableHeight, PAGE.contentWidth, tableHeight);
    
    this.currentY += 8;
  }

  addEmptyTablePlaceholder() {
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('[No data provided]', PAGE.margin + 5, this.currentY);
    this.currentY += 8;
  }

  renderResponse(response, type) {
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    
    if (response === undefined || response === null || response === '') {
      this.doc.setTextColor(COLORS.textMuted);
      this.doc.setFont('helvetica', 'italic');
      this.doc.text('Response: Not provided', PAGE.margin + 6, this.currentY);
      this.currentY += 6;
      return;
    }
    
    this.doc.setTextColor(COLORS.text);
    
    if (typeof response === 'boolean') {
      this.doc.text(`Response: ${response ? 'Yes' : 'No'}`, PAGE.margin + 6, this.currentY);
      this.currentY += 6;
    } else if (typeof response === 'object') {
      if (Array.isArray(response)) {
        if (response.length === 0) {
          this.doc.setFont('helvetica', 'italic');
          this.doc.setTextColor(COLORS.textMuted);
          this.doc.text('Response: No data entries', PAGE.margin + 6, this.currentY);
        } else {
          this.doc.text(`Response: ${response.length} data entries recorded`, PAGE.margin + 6, this.currentY);
        }
      } else {
        // Complex object - show summary
        const keys = Object.keys(response).filter(k => response[k] !== null && response[k] !== undefined && response[k] !== '');
        if (keys.length === 0) {
          this.doc.setFont('helvetica', 'italic');
          this.doc.setTextColor(COLORS.textMuted);
          this.doc.text('Response: No data provided', PAGE.margin + 6, this.currentY);
        } else {
          this.doc.text(`Response: Data recorded (${keys.length} fields)`, PAGE.margin + 6, this.currentY);
        }
      }
      this.currentY += 6;
    } else {
      // String or number
      const responseText = `Response: ${String(response)}`;
      const lines = this.doc.splitTextToSize(responseText, PAGE.contentWidth - 12);
      this.doc.text(lines, PAGE.margin + 6, this.currentY);
      this.currentY += lines.length * 4 + 2;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERATE & SAVE
  // ═══════════════════════════════════════════════════════════════════════════

  async generate() {
    // Cover page
    this.addCoverPage();
    
    // Section A
    this.addSectionA();
    
    // Section B
    this.addSectionB();
    
    // Section C
    this.addSectionC();
    
    // Final footer
    this.addFooter();
    
    return this.doc;
  }

  save(filename) {
    const name = filename || `BRSR_Report_${this.reportingPeriod.replace(/\s+/g, '_')}.pdf`;
    this.doc.save(name);
  }

  getBlob() {
    return this.doc.output('blob');
  }
}

export default BRSRReportGenerator;
