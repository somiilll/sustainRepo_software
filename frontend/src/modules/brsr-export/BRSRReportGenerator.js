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
  margin: 15,
  marginSmall: 10,
  contentWidth: 180,
  headerHeight: 12,
  footerHeight: 10,
};

// Color palette
const COLORS = {
  primary: '#1A4D2E',
  primaryLight: '#22633A',
  secondary: '#15803D',
  accent: '#10B981',
  text: '#1C1917',
  textMuted: '#78716C',
  textLight: '#A8A29E',
  border: '#D6D3D1',
  borderLight: '#E7E5E4',
  background: '#FFFFFF',
  backgroundAlt: '#FAFAF9',
  sectionA: '#1E40AF', // Blue for Section A
  sectionB: '#7C3AED', // Purple for Section B
  sectionC: '#059669', // Green for Section C
};

// Principle metadata
const PRINCIPLE_META = {
  P1: { name: 'Principle 1', title: 'Ethics, Transparency & Accountability', color: '#3b82f6' },
  P2: { name: 'Principle 2', title: 'Sustainable Products & Services', color: '#059669' },
  P3: { name: 'Principle 3', title: 'Employee Wellbeing', color: '#8b5cf6' },
  P4: { name: 'Principle 4', title: 'Stakeholder Responsiveness', color: '#f59e0b' },
  P5: { name: 'Principle 5', title: 'Human Rights', color: '#ef4444' },
  P6: { name: 'Principle 6', title: 'Environment Protection', color: '#14b8a6' },
  P7: { name: 'Principle 7', title: 'Policy Advocacy', color: '#6366f1' },
  P8: { name: 'Principle 8', title: 'Inclusive Growth', color: '#f97316' },
  P9: { name: 'Principle 9', title: 'Consumer Value', color: '#ec4899' },
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
    this.currentY = PAGE.margin + PAGE.headerHeight;
    this.generatedDate = new Date().toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    this.reportVersion = '1.0';
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
    this.currentY = PAGE.margin + PAGE.headerHeight;
    if (this.pageNumber > 1) {
      this.addHeader();
    }
  }

  addHeader() {
    const y = 8;
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.primary);
    this.doc.text(this.organization.name || 'Organization', PAGE.margin, y);
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Business Responsibility & Sustainability Report', PAGE.width / 2, y, { align: 'center' });
    
    this.doc.text(this.reportingPeriod, PAGE.width - PAGE.margin, y, { align: 'right' });
    
    this.doc.setDrawColor(COLORS.borderLight);
    this.doc.setLineWidth(0.3);
    this.doc.line(PAGE.margin, y + 4, PAGE.width - PAGE.margin, y + 4);
  }

  addFooter() {
    const y = PAGE.height - 8;
    
    this.doc.setDrawColor(COLORS.borderLight);
    this.doc.setLineWidth(0.3);
    this.doc.line(PAGE.margin, y - 6, PAGE.width - PAGE.margin, y - 6);
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(6);
    this.doc.setTextColor(COLORS.textMuted);
    
    this.doc.text('BRSR Report', PAGE.margin, y - 2);
    this.doc.setFont('helvetica', 'italic');
    this.doc.text('Confidential', PAGE.width / 2, y - 2, { align: 'center' });
    this.doc.setFont('helvetica', 'normal');
    this.doc.text(`Page ${this.pageNumber}`, PAGE.width - PAGE.margin, y - 2, { align: 'right' });
  }

  checkPageBreak(requiredHeight) {
    const footerBuffer = 20;
    const availableHeight = PAGE.height - PAGE.footerHeight - footerBuffer - this.currentY;
    if (requiredHeight > availableHeight) {
      this.addNewPage();
      return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COVER PAGE
  // ═══════════════════════════════════════════════════════════════════════════

  addCoverPage() {
    this.pageNumber = 1;
    const centerX = PAGE.width / 2;
    
    // Background
    this.doc.setFillColor('#EFF6FF');
    this.doc.rect(0, 0, PAGE.width, PAGE.height, 'F');
    
    // Top banner
    this.doc.setFillColor(COLORS.primary);
    this.doc.rect(0, 0, PAGE.width, 60, 'F');
    
    // Accent line
    this.doc.setFillColor(COLORS.accent);
    this.doc.rect(0, 60, PAGE.width, 4, 'F');
    
    // Company name in banner
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(18);
    this.doc.setTextColor('#FFFFFF');
    this.doc.text(this.organization.name || 'Organization Name', centerX, 35, { align: 'center' });
    
    // CIN if available
    if (this.sectionAData.cin) {
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(10);
      this.doc.text(`CIN: ${this.sectionAData.cin}`, centerX, 48, { align: 'center' });
    }
    
    // Main title
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(28);
    this.doc.setTextColor(COLORS.primary);
    this.doc.text('Business Responsibility &', centerX, 100, { align: 'center' });
    this.doc.text('Sustainability Report', centerX, 115, { align: 'center' });
    
    // Subtitle - Framework reference
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(12);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('(As per SEBI Listing Regulations - Annexure II)', centerX, 130, { align: 'center' });
    
    // Reporting period box
    this.doc.setFillColor('#FFFFFF');
    this.doc.setDrawColor(COLORS.primary);
    this.doc.setLineWidth(1);
    this.doc.roundedRect(centerX - 50, 150, 100, 30, 3, 3, 'FD');
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('REPORTING PERIOD', centerX, 160, { align: 'center' });
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(14);
    this.doc.setTextColor(COLORS.primary);
    this.doc.text(this.reportingPeriod || 'FY 2024-2025', centerX, 173, { align: 'center' });
    
    // Sections overview
    const sectionsY = 200;
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(10);
    this.doc.setTextColor(COLORS.text);
    this.doc.text('Report Contents:', PAGE.margin + 20, sectionsY);
    
    const sections = [
      { label: 'Section A', desc: 'General Disclosures', color: COLORS.sectionA },
      { label: 'Section B', desc: 'Management & Process Disclosures', color: COLORS.sectionB },
      { label: 'Section C', desc: 'Principle-wise Performance Disclosures', color: COLORS.sectionC },
    ];
    
    sections.forEach((section, idx) => {
      const y = sectionsY + 12 + (idx * 12);
      this.doc.setFillColor(section.color);
      this.doc.circle(PAGE.margin + 25, y - 1, 2, 'F');
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(9);
      this.doc.setTextColor(section.color);
      this.doc.text(section.label, PAGE.margin + 30, y);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setTextColor(COLORS.text);
      this.doc.text(`: ${section.desc}`, PAGE.margin + 52, y);
    });
    
    // Footer bar
    this.doc.setFillColor(COLORS.primary);
    this.doc.rect(0, PAGE.height - 25, PAGE.width, 25, 'F');
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor('#FFFFFF');
    this.doc.text(`Generated on: ${this.generatedDate}`, PAGE.margin, PAGE.height - 12);
    this.doc.text('Prepared using SustainRepo', PAGE.width - PAGE.margin, PAGE.height - 12, { align: 'right' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: GENERAL DISCLOSURES
  // ═══════════════════════════════════════════════════════════════════════════

  addSectionA() {
    this.addNewPage();
    
    // Section title banner
    this.doc.setFillColor(COLORS.sectionA);
    this.doc.rect(PAGE.margin, this.currentY - 5, PAGE.contentWidth, 12, 'F');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(14);
    this.doc.setTextColor('#FFFFFF');
    this.doc.text('SECTION A: GENERAL DISCLOSURES', PAGE.margin + 5, this.currentY + 3);
    this.currentY += 18;
    
    const data = this.sectionAData;
    
    // I. Details of the Listed Entity
    this.addSectionASubheading('I. Details of the Listed Entity');
    
    const entityDetails = [
      ['1.', 'Corporate Identity Number (CIN)', data.cin || '-'],
      ['2.', 'Name of the Listed Entity', data.listed_entity_name || '-'],
      ['3.', 'Year of Incorporation', data.year_of_incorporation || '-'],
      ['4.', 'Registered Office Address', this.formatAddress(data, 'registered') || '-'],
      ['5.', 'Corporate Address', this.formatAddress(data, 'corporate') || '-'],
      ['6.', 'E-mail', data.email || '-'],
      ['7.', 'Telephone', data.telephone || '-'],
      ['8.', 'Website', data.website || '-'],
      ['9.', 'Financial Year', this.reportingPeriod || '-'],
      ['10.', 'Stock Exchange(s)', data.stock_exchange || '-'],
      ['11.', 'Paid-up Capital (INR)', data.paid_up_capital ? `Rs. ${Number(data.paid_up_capital).toLocaleString('en-IN')}` : '-'],
      ['12.', 'BRSR Contact Person', this.formatContact(data) || '-'],
      ['13.', 'Reporting Boundary', data.reporting_boundary || '-'],
      ['14.', 'Name of Assurance Provider', data.assurance_provider || '-'],
      ['15.', 'Type of Assurance Obtained', data.assurance_type || '-'],
    ];
    
    this.addNumberedTable(entityDetails);
    
    // II. Products/Services
    this.addSectionASubheading('II. Products/Services');
    
    // Q16: Business Activities
    this.addQuestionLabel('16. Details of business activities (accounting for 90% of the turnover):');
    if (data.business_activities && data.business_activities.length > 0) {
      const businessHeaders = ['S.No.', 'Description of Main Activity', 'Description of Business Activity', '% of Turnover'];
      const businessRows = data.business_activities.map((item, idx) => [
        (idx + 1).toString(),
        item.description || '-',
        item.main_activity || '-',
        item.turnover_percentage !== undefined ? `${item.turnover_percentage}%` : '-'
      ]);
      this.addDataTable(businessHeaders, businessRows);
    } else {
      this.addNoDataMessage();
    }
    
    // Q17: Products/Services
    this.addQuestionLabel('17. Products/Services sold by the entity (accounting for 90% of turnover):');
    if (data.products_services && data.products_services.length > 0) {
      const productHeaders = ['S.No.', 'Product/Service', 'NIC Code', '% of Total Turnover'];
      const productRows = data.products_services.map((item, idx) => [
        (idx + 1).toString(),
        item.product_service || '-',
        item.nic_code || '-',
        item.turnover_percentage !== undefined ? `${item.turnover_percentage}%` : '-'
      ]);
      this.addDataTable(productHeaders, productRows);
    } else {
      this.addNoDataMessage();
    }
    
    // III. Operations
    this.addSectionASubheading('III. Operations');
    
    // Q18: Plants and Offices
    this.addQuestionLabel('18. Number of locations where plants and/or operations/offices are situated:');
    if (data.plants_offices && data.plants_offices.length > 0) {
      const plantHeaders = ['Location', 'Number of Plants', 'Number of Offices', 'Total'];
      const plantRows = data.plants_offices.map(item => [
        item.location_type || '-',
        item.num_plants !== undefined ? item.num_plants.toString() : '-',
        item.num_offices !== undefined ? item.num_offices.toString() : '-',
        ((item.num_plants || 0) + (item.num_offices || 0)).toString()
      ]);
      this.addDataTable(plantHeaders, plantRows);
    } else {
      this.addNoDataMessage();
    }
    
    // Q19: Markets Served
    this.addQuestionLabel('19. Markets served by the entity:');
    
    // Q19a: Number of locations
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.text);
    this.doc.text('a. Number of locations:', PAGE.margin + 5, this.currentY);
    this.currentY += 5;
    
    if (data.markets_served && data.markets_served.length > 0) {
      const marketHeaders = ['Locations', 'Number'];
      const marketRows = data.markets_served.map(item => [
        item.location_type === 'National' ? 'National (No. of States)' : 'International (No. of Countries)',
        item.number !== undefined ? item.number.toString() : '-'
      ]);
      this.addDataTable(marketHeaders, marketRows);
    } else {
      this.addNoDataMessage();
    }
    
    // Q19b: Export contribution
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.text);
    this.doc.text(`b. Export contribution (% of total turnover): ${data.export_contribution_percentage !== undefined ? data.export_contribution_percentage + '%' : '-'}`, PAGE.margin + 5, this.currentY);
    this.currentY += 8;
    
    // Q19c: Types of customers
    this.doc.text('c. Brief on types of customers:', PAGE.margin + 5, this.currentY);
    this.currentY += 5;
    if (data.customer_types_brief) {
      const customerLines = this.doc.splitTextToSize(data.customer_types_brief, PAGE.contentWidth - 10);
      this.doc.text(customerLines, PAGE.margin + 5, this.currentY);
      this.currentY += customerLines.length * 4 + 5;
    } else {
      this.addNoDataMessage();
    }
    
    // IV. Employees - From yearly sections if available
    this.addSectionASubheading('IV. Employees');
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Employee data as per the reporting period - refer to workforce section for detailed breakdown.', PAGE.margin, this.currentY);
    this.currentY += 10;
    
    // V. Holding, Subsidiary and Associate Companies
    this.addSectionASubheading('V. Holding, Subsidiary and Associate Companies (including joint ventures)');
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Details as per annual report and statutory filings.', PAGE.margin, this.currentY);
    this.currentY += 10;
    
    // VI. CSR Details
    this.addSectionASubheading('VI. CSR Details');
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('CSR applicability and details as per Section 135 of Companies Act, 2013.', PAGE.margin, this.currentY);
    this.currentY += 10;
    
    // VII. Transparency and Disclosures Compliances
    this.addSectionASubheading('VII. Transparency and Disclosures Compliances');
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Complaints/Grievances and material business conduct issues - refer to Section B & C for details.', PAGE.margin, this.currentY);
    this.currentY += 10;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B: MANAGEMENT AND PROCESS DISCLOSURES
  // ═══════════════════════════════════════════════════════════════════════════

  addSectionB() {
    this.addNewPage();
    
    // Section title banner
    this.doc.setFillColor(COLORS.sectionB);
    this.doc.rect(PAGE.margin, this.currentY - 5, PAGE.contentWidth, 12, 'F');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(14);
    this.doc.setTextColor('#FFFFFF');
    this.doc.text('SECTION B: MANAGEMENT AND PROCESS DISCLOSURES', PAGE.margin + 5, this.currentY + 3);
    this.currentY += 18;
    
    // Introduction text
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.text);
    const introText = 'This section captures information on policies, procedures, governance structures, and management processes related to business responsibility and sustainability aligned with NGRBC Principles.';
    const introLines = this.doc.splitTextToSize(introText, PAGE.contentWidth);
    this.doc.text(introLines, PAGE.margin, this.currentY);
    this.currentY += introLines.length * 4 + 8;
    
    // Group Section B configs by disclosure category
    const groupedConfigs = this.groupConfigsByCategory(this.sectionBConfigs);
    
    if (Object.keys(groupedConfigs).length === 0) {
      this.doc.setFont('helvetica', 'italic');
      this.doc.setFontSize(9);
      this.doc.setTextColor(COLORS.textMuted);
      this.doc.text('No Section B disclosures have been configured yet.', PAGE.margin, this.currentY);
      this.currentY += 10;
      return;
    }
    
    // Render each category
    Object.entries(groupedConfigs).forEach(([category, configs]) => {
      this.checkPageBreak(30);
      
      // Category heading
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(10);
      this.doc.setTextColor(COLORS.sectionB);
      this.doc.text(category, PAGE.margin, this.currentY);
      this.currentY += 6;
      
      // Render each question in category
      configs.forEach((config, idx) => {
        this.renderQuestionResponse(config, this.sectionBData[config.question_key], idx + 1);
      });
      
      this.currentY += 5;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: PRINCIPLE-WISE PERFORMANCE DISCLOSURES
  // ═══════════════════════════════════════════════════════════════════════════

  addSectionC() {
    this.addNewPage();
    
    // Section title banner
    this.doc.setFillColor(COLORS.sectionC);
    this.doc.rect(PAGE.margin, this.currentY - 5, PAGE.contentWidth, 12, 'F');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(14);
    this.doc.setTextColor('#FFFFFF');
    this.doc.text('SECTION C: PRINCIPLE WISE PERFORMANCE DISCLOSURE', PAGE.margin + 5, this.currentY + 3);
    this.currentY += 18;
    
    // Introduction text
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.text);
    const introText = 'This section provides performance disclosures against each of the nine principles of the National Guidelines on Responsible Business Conduct (NGRBC).';
    const introLines = this.doc.splitTextToSize(introText, PAGE.contentWidth);
    this.doc.text(introLines, PAGE.margin, this.currentY);
    this.currentY += introLines.length * 4 + 8;
    
    // Group Section C configs by principle
    const groupedByPrinciple = this.groupConfigsByPrinciple(this.sectionCConfigs);
    
    // Render each principle
    Object.entries(PRINCIPLE_META).forEach(([principleKey, meta]) => {
      const configs = groupedByPrinciple[principleKey] || [];
      
      this.checkPageBreak(40);
      
      // Principle header
      this.doc.setFillColor(meta.color);
      this.doc.rect(PAGE.margin, this.currentY - 2, PAGE.contentWidth, 10, 'F');
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(11);
      this.doc.setTextColor('#FFFFFF');
      this.doc.text(`${meta.name}: ${meta.title}`, PAGE.margin + 3, this.currentY + 5);
      this.currentY += 15;
      
      if (configs.length === 0) {
        this.doc.setFont('helvetica', 'italic');
        this.doc.setFontSize(9);
        this.doc.setTextColor(COLORS.textMuted);
        this.doc.text('No disclosures configured for this principle.', PAGE.margin + 5, this.currentY);
        this.currentY += 10;
      } else {
        // Group by indicator type (Essential vs Leadership)
        const essential = configs.filter(c => c.brsr_indicator_type === 'essential' || !c.brsr_indicator_type);
        const leadership = configs.filter(c => c.brsr_indicator_type === 'leadership');
        
        if (essential.length > 0) {
          this.doc.setFont('helvetica', 'bold');
          this.doc.setFontSize(9);
          this.doc.setTextColor(COLORS.text);
          this.doc.text('Essential Indicators', PAGE.margin + 3, this.currentY);
          this.currentY += 6;
          
          essential.forEach((config, idx) => {
            this.renderQuestionResponse(config, this.sectionCData[config.question_key], idx + 1);
          });
        }
        
        if (leadership.length > 0) {
          this.checkPageBreak(20);
          this.doc.setFont('helvetica', 'bold');
          this.doc.setFontSize(9);
          this.doc.setTextColor(COLORS.text);
          this.doc.text('Leadership Indicators', PAGE.margin + 3, this.currentY);
          this.currentY += 6;
          
          leadership.forEach((config, idx) => {
            this.renderQuestionResponse(config, this.sectionCData[config.question_key], idx + 1);
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
    if (data.brsr_contact_name) parts.push(data.brsr_contact_name);
    if (data.brsr_contact_telephone) parts.push(`Tel: ${data.brsr_contact_telephone}`);
    if (data.brsr_contact_email) parts.push(`Email: ${data.brsr_contact_email}`);
    return parts.length > 0 ? parts.join(', ') : null;
  }

  addSectionASubheading(text) {
    this.checkPageBreak(20);
    
    this.doc.setFillColor('#EFF6FF');
    this.doc.rect(PAGE.margin, this.currentY - 3, PAGE.contentWidth, 10, 'F');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(10);
    this.doc.setTextColor(COLORS.sectionA);
    this.doc.text(text, PAGE.margin + 3, this.currentY + 3);
    this.currentY += 12;
  }

  addQuestionLabel(text) {
    this.checkPageBreak(15);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.text);
    const lines = this.doc.splitTextToSize(text, PAGE.contentWidth);
    this.doc.text(lines, PAGE.margin, this.currentY);
    this.currentY += lines.length * 4 + 3;
  }

  addNumberedTable(rows) {
    const colWidths = [10, 60, 110]; // S.No., Label, Value
    let y = this.currentY;
    
    rows.forEach((row, idx) => {
      this.checkPageBreak(8);
      
      // Alternate row background
      if (idx % 2 === 0) {
        this.doc.setFillColor(COLORS.backgroundAlt);
        this.doc.rect(PAGE.margin, y - 2, PAGE.contentWidth, 7, 'F');
      }
      
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(8);
      this.doc.setTextColor(COLORS.text);
      this.doc.text(row[0], PAGE.margin + 2, y + 2);
      
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(row[1], PAGE.margin + colWidths[0] + 2, y + 2);
      
      // Handle long values
      const valueWidth = colWidths[2] - 5;
      const valueLines = this.doc.splitTextToSize(row[2], valueWidth);
      this.doc.text(valueLines, PAGE.margin + colWidths[0] + colWidths[1] + 2, y + 2);
      
      y += Math.max(7, valueLines.length * 4 + 2);
    });
    
    this.currentY = y + 5;
  }

  addDataTable(headers, rows, headerColor = COLORS.sectionA) {
    this.checkPageBreak(20 + rows.length * 8);
    
    const numCols = headers.length;
    const colWidth = PAGE.contentWidth / numCols;
    let y = this.currentY;
    
    // Header row
    this.doc.setFillColor(headerColor);
    this.doc.rect(PAGE.margin, y, PAGE.contentWidth, 8, 'F');
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(8);
    this.doc.setTextColor('#FFFFFF');
    
    headers.forEach((header, idx) => {
      const x = PAGE.margin + (idx * colWidth);
      this.doc.text(header, x + 2, y + 5);
    });
    
    y += 8;
    
    // Data rows
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(COLORS.text);
    
    rows.forEach((row, rowIdx) => {
      if (rowIdx % 2 === 0) {
        this.doc.setFillColor(COLORS.backgroundAlt);
        this.doc.rect(PAGE.margin, y, PAGE.contentWidth, 7, 'F');
      }
      
      row.forEach((cell, colIdx) => {
        const x = PAGE.margin + (colIdx * colWidth);
        const cellText = String(cell || '-').substring(0, 30); // Truncate long text
        this.doc.text(cellText, x + 2, y + 5);
      });
      
      y += 7;
    });
    
    // Border
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(0.3);
    this.doc.rect(PAGE.margin, this.currentY, PAGE.contentWidth, y - this.currentY);
    
    this.currentY = y + 8;
  }

  addNoDataMessage() {
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('No data available', PAGE.margin + 5, this.currentY);
    this.currentY += 8;
  }

  groupConfigsByCategory(configs) {
    const grouped = {};
    configs.forEach(config => {
      const category = config.disclosure_category || config.subsection || 'General';
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(config);
    });
    return grouped;
  }

  groupConfigsByPrinciple(configs) {
    const grouped = {};
    configs.forEach(config => {
      const principle = config.brsr_principle || 'OTHER';
      if (!grouped[principle]) grouped[principle] = [];
      grouped[principle].push(config);
    });
    return grouped;
  }

  renderQuestionResponse(config, value, questionNum) {
    this.checkPageBreak(25);
    
    // Question text
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.text);
    
    const questionText = `${questionNum}. ${config.question_text || config.title || 'Question'}`;
    const questionLines = this.doc.splitTextToSize(questionText, PAGE.contentWidth - 10);
    this.doc.text(questionLines, PAGE.margin + 3, this.currentY);
    this.currentY += questionLines.length * 4 + 2;
    
    // Response
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    
    if (value === undefined || value === null || value === '') {
      this.doc.setTextColor(COLORS.textMuted);
      this.doc.text('Response: Not provided', PAGE.margin + 5, this.currentY);
    } else if (typeof value === 'object') {
      this.doc.setTextColor(COLORS.text);
      // Handle complex types (tables, matrices, etc.)
      if (Array.isArray(value)) {
        this.doc.text(`Response: ${value.length} items recorded`, PAGE.margin + 5, this.currentY);
      } else {
        this.doc.text('Response: Data recorded (see detailed section)', PAGE.margin + 5, this.currentY);
      }
    } else {
      this.doc.setTextColor(COLORS.text);
      const responseText = `Response: ${String(value)}`;
      const responseLines = this.doc.splitTextToSize(responseText, PAGE.contentWidth - 15);
      this.doc.text(responseLines, PAGE.margin + 5, this.currentY);
      this.currentY += Math.max(0, (responseLines.length - 1) * 4);
    }
    
    this.currentY += 8;
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
