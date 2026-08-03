/**
 * ESG Report Generator - Executive Dashboard PDF Export
 * Version 2.0 - Enhanced with narrative insights, better design, and chart support
 * 
 * Report Structure:
 * 1. Cover Page (Premium design)
 * 2. Executive Summary (Narrative highlights)
 * 3. Emissions Section (Chart + Trend Analysis)
 * 4. Energy Section (Chart + Commentary)
 * 5. Water Section (Chart + Analysis)
 * 6. Waste Section (Chart + Analysis)
 * 7. Social Section (KPIs + Commentary)
 * 8. Governance Section (Chart + Analysis)
 * 9. Performance Summary (With proper messaging)
 * 10. Key Insights (6 rule-based observations)
 * 11. Appendix (Methodology + Definitions)
 */

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Colors matching dashboard theme
const COLORS = {
  primary: '#1A4D2E',
  secondary: '#15803D',
  accent: '#10B981',
  text: '#1C1917',
  textMuted: '#78716C',
  textLight: '#A8A29E',
  border: '#E7E5E4',
  borderLight: '#F5F5F4',
  background: '#FFFFFF',
  // Section colors
  emissions: '#15803D',
  energy: '#F59E0B',
  water: '#0284C7',
  waste: '#57534E',
  social: '#7C3AED',
  governance: '#4F46E5',
  // Status colors
  improved: '#10B981',
  declined: '#EF4444',
  stable: '#78716C',
  attention: '#F59E0B',
};

// Page dimensions (A4 in mm)
const PAGE = {
  width: 210,
  height: 297,
  margin: 18,
  contentWidth: 174,
  headerHeight: 16,
  footerHeight: 14,
};

// Section icons (using Unicode symbols)
const ICONS = {
  emissions: '●', // Will use colored circle
  energy: '⚡',
  water: '◆',
  waste: '■',
  social: '●',
  governance: '▲',
};

/**
 * Main PDF Generator Class
 */
export class ESGReportGenerator {
  constructor(options = {}) {
    this.doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    
    this.organization = options.organization || {};
    this.dateRange = options.dateRange || {};
    this.metrics = options.metrics || {};
    this.analytics = options.analytics || {};
    this.summary = options.summary || {};
    this.filteredData = options.filteredData || {};
    this.granularity = options.granularity || 'monthly';
    this.productionUnit = options.productionUnit || 'unit';
    this.productionQty = options.productionQty || 0;
    this.facilities = options.facilities || [];
    
    this.pageNumber = 0;
    this.currentY = PAGE.margin + PAGE.headerHeight;
    this.generatedDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    this.generatedTimestamp = new Date().toISOString();
    this.reportVersion = '1.0';
  }

  // Helper to format CO2 unit without Unicode issues
  getCO2Unit() {
    return 'tCO2e'; // Using simple text to avoid encoding issues
  }

  /**
   * Generate the complete report
   */
  async generate() {
    try {
      // 1. Cover Page
      this.addCoverPage();
      
      // 2. Executive Summary (Narrative)
      this.addNewPage();
      this.addExecutiveSummary();
      
      // 3. Emissions Section
      this.addNewPage();
      await this.addEmissionsSection();
      
      // 4. Energy Section
      this.addNewPage();
      await this.addEnergySection();
      
      // 5. Water Section
      this.addNewPage();
      await this.addWaterSection();
      
      // 6. Waste Section
      this.addNewPage();
      await this.addWasteSection();
      
      // 7. Social Section
      this.addNewPage();
      await this.addSocialSection();
      
      // 8. Governance Section
      this.addNewPage();
      await this.addGovernanceSection();
      
      // 9. Performance Summary
      this.addNewPage();
      this.addPerformanceSummary();
      
      // 10. Key Insights
      this.addNewPage();
      this.addKeyInsights();
      
      // 11. Appendix
      this.addNewPage();
      this.addAppendix();
      
      return this.doc;
    } catch (error) {
      console.error('Error generating PDF:', error);
      throw error;
    }
  }

  save(filename = 'ESG_Dashboard_Report.pdf') {
    this.doc.save(filename);
  }

  getBlob() {
    return this.doc.output('blob');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  addNewPage() {
    if (this.pageNumber > 0) {
      this.doc.addPage();
    }
    this.pageNumber++;
    this.currentY = PAGE.margin + PAGE.headerHeight;
    if (this.pageNumber > 1) {
      this.addHeader();
    }
    this.addFooter();
  }

  addHeader() {
    const y = 8;
    
    // Company name (left)
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.primary);
    this.doc.text(this.organization.name || 'Organization', PAGE.margin, y);
    
    // Report title (center)
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.textMuted);
    const title = 'ESG Dashboard Report';
    this.doc.text(title, PAGE.width / 2, y, { align: 'center' });
    
    // Reporting period (right)
    const period = this.getReportingPeriod();
    this.doc.text(period, PAGE.width - PAGE.margin, y, { align: 'right' });
    
    // Header line
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(0.3);
    this.doc.line(PAGE.margin, y + 4, PAGE.width - PAGE.margin, y + 4);
  }

  addFooter() {
    const y = PAGE.height - 10;
    
    // Footer line
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(0.3);
    this.doc.line(PAGE.margin, y - 3, PAGE.width - PAGE.margin, y - 3);
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(7);
    this.doc.setTextColor(COLORS.textMuted);
    
    // Generated by (left)
    this.doc.text('Generated by SustainRepo', PAGE.margin, y);
    
    // Confidential (center)
    this.doc.setFont('helvetica', 'italic');
    this.doc.text('Confidential', PAGE.width / 2, y, { align: 'center' });
    
    // Page number (right)
    this.doc.setFont('helvetica', 'normal');
    this.doc.text(`Page ${this.pageNumber}`, PAGE.width - PAGE.margin, y, { align: 'right' });
  }

  checkPageBreak(requiredHeight) {
    const availableHeight = PAGE.height - PAGE.footerHeight - this.currentY - 10;
    if (requiredHeight > availableHeight) {
      this.addNewPage();
      return true;
    }
    return false;
  }

  getReportingPeriod() {
    if (this.dateRange.from && this.dateRange.to) {
      const from = new Date(this.dateRange.from);
      const to = new Date(this.dateRange.to);
      return `${from.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${to.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
    }
    return 'Current Period';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. COVER PAGE (Premium Design)
  // ═══════════════════════════════════════════════════════════════════════════

  addCoverPage() {
    this.pageNumber = 1;
    const centerX = PAGE.width / 2;
    
    // Top accent bar
    this.doc.setFillColor(COLORS.primary);
    this.doc.rect(0, 0, PAGE.width, 12, 'F');
    
    // Accent stripe
    this.doc.setFillColor(COLORS.accent);
    this.doc.rect(0, 12, PAGE.width, 3, 'F');
    
    // Company Logo area with border
    const logoY = 45;
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(0.5);
    this.doc.roundedRect(centerX - 25, logoY, 50, 35, 3, 3, 'S');
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.textLight);
    this.doc.text('COMPANY LOGO', centerX, logoY + 20, { align: 'center' });
    
    // Company Name
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(22);
    this.doc.setTextColor(COLORS.primary);
    const companyName = this.organization.name || 'Organization Name';
    this.doc.text(companyName, centerX, 100, { align: 'center' });
    
    // Divider
    this.doc.setDrawColor(COLORS.accent);
    this.doc.setLineWidth(1.5);
    this.doc.line(centerX - 35, 110, centerX + 35, 110);
    
    // Report Title
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(28);
    this.doc.setTextColor(COLORS.text);
    this.doc.text('ESG Dashboard Report', centerX, 130, { align: 'center' });
    
    // Subtitle
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(11);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Environmental, Social & Governance Performance', centerX, 140, { align: 'center' });
    
    // Metadata box
    const boxY = 160;
    const boxHeight = 70;
    this.doc.setFillColor('#FAFAF9');
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(0.3);
    this.doc.roundedRect(PAGE.margin + 20, boxY, PAGE.contentWidth - 40, boxHeight, 3, 3, 'FD');
    
    // Metadata content
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    const metaX = PAGE.margin + 30;
    const metaX2 = centerX + 10;
    let metaY = boxY + 12;
    
    // Left column
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Reporting Framework', metaX, metaY);
    this.doc.setTextColor(COLORS.text);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Internal / BRSR', metaX, metaY + 5);
    
    metaY += 16;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Reporting Period', metaX, metaY);
    this.doc.setTextColor(COLORS.text);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(this.getReportingPeriod(), metaX, metaY + 5);
    
    metaY += 16;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Reporting Frequency', metaX, metaY);
    this.doc.setTextColor(COLORS.text);
    this.doc.setFont('helvetica', 'bold');
    const freq = this.granularity.charAt(0).toUpperCase() + this.granularity.slice(1);
    this.doc.text(freq, metaX, metaY + 5);
    
    // Right column
    metaY = boxY + 12;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Generated On', metaX2, metaY);
    this.doc.setTextColor(COLORS.text);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(this.generatedDate, metaX2, metaY + 5);
    
    metaY += 16;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Prepared By', metaX2, metaY);
    this.doc.setTextColor(COLORS.text);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('SustainRepo', metaX2, metaY + 5);
    
    metaY += 16;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Report Version', metaX2, metaY);
    this.doc.setTextColor(COLORS.text);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(this.reportVersion, metaX2, metaY + 5);
    
    // Footer bar
    this.doc.setFillColor(COLORS.primary);
    this.doc.rect(0, PAGE.height - 18, PAGE.width, 18, 'F');
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    this.doc.setTextColor('#FFFFFF');
    this.doc.text('CONFIDENTIAL', centerX, PAGE.height - 8, { align: 'center' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. EXECUTIVE SUMMARY (Narrative Highlights)
  // ═══════════════════════════════════════════════════════════════════════════

  addExecutiveSummary() {
    this.addSectionTitle('Executive Summary', null);
    
    // Get data for narrative
    const emissionData = this.metrics?.emissions?.ghg_emissions || {};
    const totals = this.filteredData?.totals || {};
    const energy = this.metrics?.energy || {};
    const water = this.metrics?.water || {};
    const waste = this.metrics?.waste || {};
    const kpis = this.summary?.kpis || {};
    
    const scope1 = totals.scope1 || emissionData.total_scope1 || 0;
    const scope2 = totals.scope2 || emissionData.total_scope2 || 0;
    const scope3 = totals.scope3 || emissionData.total_scope3 || 0;
    const totalEmissions = scope1 + scope2 + scope3;
    const renewablePct = energy.renewable_pct || 0;
    const recycled = water.recycled || 0;
    const totalEmployees = kpis.total_employees?.value || 0;
    const turnover = kpis.turnover_pct?.value;
    const ltifr = kpis.ltifr?.value;
    const apDays = kpis.ap_days?.value;
    
    // Environmental Highlights
    this.addHighlightSection('Environmental Highlights', COLORS.emissions, [
      `Total emissions reached ${this.formatNumberWithCommas(totalEmissions)} ${this.getCO2Unit()}.`,
      renewablePct > 0 
        ? `Renewable energy contributed ${this.formatPercent(renewablePct)} of total energy consumption.`
        : 'Renewable energy data is being collected.',
      recycled > 0
        ? `Water recycling remained strong at ${this.formatNumberWithCommas(recycled)} KL.`
        : 'Water recycling metrics are being tracked.',
    ]);
    
    this.currentY += 5;
    
    // Social Highlights
    this.addHighlightSection('Social Highlights', COLORS.social, [
      totalEmployees > 0
        ? `Workforce remained stable with ${this.formatNumberWithCommas(totalEmployees)} employees.`
        : 'Workforce data is being collected.',
      turnover != null && turnover < 15
        ? `Employee turnover remained low at ${this.formatPercent(turnover)}.`
        : turnover != null
          ? `Employee turnover at ${this.formatPercent(turnover)}.`
          : 'Employee turnover data not available.',
      ltifr != null
        ? ltifr > 1
          ? `LTIFR at ${ltifr.toFixed(2)} requires attention.`
          : `LTIFR at ${ltifr.toFixed(2)} indicates strong safety performance.`
        : 'LTIFR data not available.',
    ]);
    
    this.currentY += 5;
    
    // Governance Highlights
    this.addHighlightSection('Governance Highlights', COLORS.governance, [
      apDays != null
        ? apDays > 300
          ? `Average Accounts Payable Days: ${Math.round(apDays)} (may warrant review).`
          : `Average Accounts Payable Days: ${Math.round(apDays)}.`
        : 'Accounts Payable data not available.',
    ]);
    
    this.currentY += 10;
    
    // Key Metrics Summary Box
    this.addMetricsSummaryBox();
  }

  addHighlightSection(title, color, highlights) {
    this.checkPageBreak(35);
    
    // Section header with color bar
    this.doc.setFillColor(color);
    this.doc.rect(PAGE.margin, this.currentY, 3, 20, 'F');
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.setTextColor(color);
    this.doc.text(title, PAGE.margin + 6, this.currentY + 5);
    
    this.currentY += 10;
    
    // Bullet points
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.text);
    
    highlights.forEach((text) => {
      if (text) {
        this.doc.setFillColor(color);
        this.doc.circle(PAGE.margin + 8, this.currentY - 1, 1, 'F');
        
        const lines = this.doc.splitTextToSize(text, PAGE.contentWidth - 15);
        this.doc.text(lines, PAGE.margin + 12, this.currentY);
        this.currentY += lines.length * 4.5 + 2;
      }
    });
  }

  addMetricsSummaryBox() {
    this.checkPageBreak(50);
    
    const kpis = this.summary?.kpis || {};
    const emissionData = this.metrics?.emissions?.ghg_emissions || {};
    const totals = this.filteredData?.totals || {};
    const energy = this.metrics?.energy || {};
    
    const totalEmissions = (totals.scope1 || 0) + (totals.scope2 || 0) + (totals.scope3 || 0) || emissionData.total || 0;
    
    // Box background
    this.doc.setFillColor('#F5F5F4');
    this.doc.setDrawColor(COLORS.border);
    this.doc.roundedRect(PAGE.margin, this.currentY, PAGE.contentWidth, 42, 2, 2, 'FD');
    
    // Title
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(10);
    this.doc.setTextColor(COLORS.text);
    this.doc.text('Key Performance Metrics', PAGE.margin + 5, this.currentY + 8);
    
    // Metrics in a row
    const metrics = [
      { label: 'Total Emissions', value: totalEmissions, unit: this.getCO2Unit(), color: COLORS.emissions },
      { label: 'Renewable %', value: energy.renewable_pct, unit: '%', color: COLORS.energy },
      { label: 'Employees', value: kpis.total_employees?.value, unit: '', color: COLORS.social },
      { label: 'LTIFR', value: kpis.ltifr?.value, unit: '', color: COLORS.declined },
      { label: 'AP Days', value: kpis.ap_days?.value, unit: 'days', color: COLORS.governance },
    ];
    
    const metricWidth = (PAGE.contentWidth - 10) / metrics.length;
    let metricX = PAGE.margin + 5;
    const metricY = this.currentY + 18;
    
    metrics.forEach((m) => {
      // Value
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(14);
      this.doc.setTextColor(m.color);
      const valueText = m.value != null ? this.formatNumberWithCommas(m.value) : 'N/A';
      this.doc.text(valueText, metricX, metricY);
      
      // Unit
      if (m.unit && m.value != null) {
        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(8);
        this.doc.setTextColor(COLORS.textMuted);
        this.doc.text(m.unit, metricX + this.doc.getTextWidth(valueText) + 1, metricY);
      }
      
      // Label
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(7);
      this.doc.setTextColor(COLORS.textMuted);
      this.doc.text(m.label.toUpperCase(), metricX, metricY + 7);
      
      metricX += metricWidth;
    });
    
    this.currentY += 50;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. EMISSIONS SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addEmissionsSection() {
    this.addSectionTitle('Emissions', COLORS.emissions);
    
    // Reporting frequency note
    this.addFrequencyNote();
    
    // Try to capture GHG chart
    await this.addChartFromRef('ghg-emission-trend', 'GHG Emission Trend', 70);
    
    this.currentY += 3;
    
    // Scope Breakdown Table
    const emissionData = this.metrics?.emissions?.ghg_emissions || {};
    const totals = this.filteredData?.totals || {};
    
    const scope1 = totals.scope1 || emissionData.total_scope1 || 0;
    const scope2 = totals.scope2 || emissionData.total_scope2 || 0;
    const scope3 = totals.scope3 || emissionData.total_scope3 || 0;
    const total = scope1 + scope2 + scope3;
    
    this.addSubsectionTitle('Scope Breakdown');
    
    const tableData = [
      ['Scope', `Emissions (${this.getCO2Unit()})`, '% Contribution'],
      ['Scope 1 (Direct)', this.formatNumberWithCommas(scope1), total ? this.formatPercent((scope1/total)*100) : '0%'],
      ['Scope 2 (Indirect - Energy)', this.formatNumberWithCommas(scope2), total ? this.formatPercent((scope2/total)*100) : '0%'],
      ['Scope 3 (Value Chain)', this.formatNumberWithCommas(scope3), total ? this.formatPercent((scope3/total)*100) : '0%'],
      ['Total', this.formatNumberWithCommas(total), '100%'],
    ];
    
    this.addStyledTable(tableData, [70, 50, 50], COLORS.emissions);
    
    // Trend Analysis
    this.currentY += 5;
    this.addTrendAnalysis(this.generateEmissionsTrendAnalysis(scope1, scope2, scope3, total));
  }

  generateEmissionsTrendAnalysis(scope1, scope2, scope3, total) {
    const lines = [];
    if (total > 0) {
      const maxScope = Math.max(scope1, scope2, scope3);
      const maxPct = ((maxScope / total) * 100).toFixed(1);
      
      if (maxScope === scope1) {
        lines.push(`Scope 1 emissions represented ${maxPct}% of total emissions during the reporting period, indicating direct emissions are the primary contributor.`);
      } else if (maxScope === scope2) {
        lines.push(`Scope 2 emissions represented ${maxPct}% of total emissions, suggesting purchased energy is the main emission source.`);
      } else {
        lines.push(`Scope 3 emissions represented ${maxPct}% of total emissions, highlighting the significance of value chain emissions.`);
      }
      
      if (scope2 > 0 && scope2 < scope1) {
        lines.push('Scope 2 remained comparatively lower than Scope 1.');
      }
    } else {
      lines.push('Emissions data is being collected for this reporting period.');
    }
    return lines;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. ENERGY SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addEnergySection() {
    this.addSectionTitle('Energy', COLORS.energy);
    
    await this.addChartFromRef('energy-mix-chart', 'Energy Mix', 65);
    
    this.currentY += 3;
    
    // Energy Summary
    const energy = this.metrics?.energy || {};
    const totalEnergy = energy.total || 0;
    const renewablePct = energy.renewable_pct || 0;
    const nonRenewablePct = 100 - renewablePct;
    const energyIntensity = this.productionQty ? totalEnergy / this.productionQty : null;
    
    this.addSubsectionTitle('Energy Summary');
    
    const tableData = [
      ['Metric', 'Value'],
      ['Total Energy Consumption', `${this.formatNumberWithCommas(totalEnergy)} MWh`],
      ['Renewable Energy', this.formatPercent(renewablePct)],
      ['Non-Renewable Energy', this.formatPercent(nonRenewablePct)],
      ['Energy Intensity', energyIntensity != null ? `${energyIntensity.toFixed(2)} MWh/${this.productionUnit}` : 'Not Available'],
    ];
    
    this.addStyledTable(tableData, [90, 80], COLORS.energy);
    
    // Trend Analysis
    this.currentY += 5;
    this.addTrendAnalysis(this.generateEnergyTrendAnalysis(renewablePct, totalEnergy));
  }

  generateEnergyTrendAnalysis(renewablePct, totalEnergy) {
    const lines = [];
    if (renewablePct >= 80) {
      lines.push(`Renewable energy accounts for ${this.formatPercent(renewablePct)} of total consumption, demonstrating strong commitment to clean energy transition.`);
    } else if (renewablePct >= 50) {
      lines.push(`Renewable energy represents ${this.formatPercent(renewablePct)} of energy mix, showing progress toward sustainability goals.`);
    } else if (renewablePct > 0) {
      lines.push(`Renewable energy is currently ${this.formatPercent(renewablePct)} of total consumption. Opportunity exists to increase clean energy adoption.`);
    } else if (totalEnergy > 0) {
      lines.push('Energy consumption is being tracked. Renewable energy adoption should be prioritized.');
    } else {
      lines.push('Energy data is being collected for this reporting period.');
    }
    return lines;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. WATER SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addWaterSection() {
    this.addSectionTitle('Water', COLORS.water);
    
    await this.addChartFromRef('water-flow-chart', 'Water Flow', 65);
    
    this.currentY += 3;
    
    const water = this.metrics?.water || {};
    const withdrawn = water.withdrawn || 0;
    const consumed = water.consumed || 0;
    const discharged = water.discharged || 0;
    const recycled = water.recycled || 0;
    
    // Calculate recycle rate only if we have meaningful data
    let recycleRate = null;
    if (withdrawn > 0) {
      recycleRate = (recycled / withdrawn) * 100;
    } else if (recycled > 0) {
      // If we have recycled but no withdrawn, note data inconsistency
      recycleRate = null;
    }
    
    this.addSubsectionTitle('Water Summary');
    
    const tableData = [
      ['Metric', 'Value (KL)'],
      ['Withdrawn', withdrawn > 0 ? this.formatNumberWithCommas(withdrawn) : 'Not Reported'],
      ['Consumed', consumed > 0 ? this.formatNumberWithCommas(consumed) : 'Not Reported'],
      ['Discharged', discharged > 0 ? this.formatNumberWithCommas(discharged) : 'Not Reported'],
      ['Recycled', recycled > 0 ? this.formatNumberWithCommas(recycled) : 'Not Reported'],
      ['Recycle Rate', recycleRate != null ? this.formatPercent(recycleRate) : 'Insufficient Data'],
    ];
    
    this.addStyledTable(tableData, [90, 80], COLORS.water);
    
    // Trend Analysis
    this.currentY += 5;
    this.addTrendAnalysis(this.generateWaterTrendAnalysis(withdrawn, recycled, recycleRate));
  }

  generateWaterTrendAnalysis(withdrawn, recycled, recycleRate) {
    const lines = [];
    if (recycleRate != null && recycleRate >= 50) {
      lines.push(`Water recycling performance is strong at ${this.formatPercent(recycleRate)}, indicating effective water management practices.`);
    } else if (recycleRate != null && recycleRate > 0) {
      lines.push(`Water recycling rate is ${this.formatPercent(recycleRate)}. Consider initiatives to improve water reuse.`);
    } else if (recycled > 0 && withdrawn === 0) {
      lines.push(`Water recycling data (${this.formatNumberWithCommas(recycled)} KL) is available, but withdrawal data is incomplete. Recycle rate cannot be calculated.`);
    } else {
      lines.push('Complete water flow data is being collected to enable comprehensive analysis.');
    }
    return lines;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. WASTE SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addWasteSection() {
    this.addSectionTitle('Waste', COLORS.waste);
    
    await this.addChartFromRef('waste-management-chart', 'Waste Management', 65);
    
    this.currentY += 3;
    
    const waste = this.metrics?.waste || {};
    const generated = waste.generated || 0;
    const recovered = waste.recovered || 0;
    const disposed = waste.disposed || 0;
    const recoveryRate = generated > 0 ? (recovered / generated) * 100 : null;
    
    this.addSubsectionTitle('Waste Summary');
    
    const tableData = [
      ['Metric', 'Value (MT)'],
      ['Generated', generated > 0 ? this.formatNumberWithCommas(generated) : 'Not Reported'],
      ['Recovered', recovered > 0 ? this.formatNumberWithCommas(recovered) : 'Not Reported'],
      ['Disposed', disposed > 0 ? this.formatNumberWithCommas(disposed) : 'Not Reported'],
      ['Recovery Rate', recoveryRate != null ? this.formatPercent(recoveryRate) : 'Not Applicable'],
    ];
    
    this.addStyledTable(tableData, [90, 80], COLORS.waste);
    
    // Trend Analysis
    this.currentY += 5;
    this.addTrendAnalysis(this.generateWasteTrendAnalysis(generated, recovered, disposed, recoveryRate));
  }

  generateWasteTrendAnalysis(generated, recovered, disposed, recoveryRate) {
    const lines = [];
    if (recovered > disposed) {
      lines.push('Waste recovery exceeded disposal, indicating effective waste management and circular economy practices.');
    } else if (recoveryRate != null && recoveryRate >= 50) {
      lines.push(`Waste recovery rate is ${this.formatPercent(recoveryRate)}, showing commitment to waste diversion.`);
    } else if (recoveryRate != null) {
      lines.push(`Waste recovery rate is ${this.formatPercent(recoveryRate)}. Opportunities exist to improve waste diversion.`);
    } else {
      lines.push('Waste management data is being collected for comprehensive analysis.');
    }
    return lines;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. SOCIAL SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addSocialSection() {
    this.addSectionTitle('Social', COLORS.social);
    
    const kpis = this.summary?.kpis || {};
    
    // Workforce KPIs
    this.addSubsectionTitle('Workforce Overview');
    
    const workforceData = [
      ['Metric', 'Value'],
      ['Total Employees', kpis.total_employees?.value != null ? this.formatNumberWithCommas(kpis.total_employees.value) : 'Not Reported'],
      ['Female Workforce', kpis.diversity_pct?.value != null ? this.formatPercent(kpis.diversity_pct.value) : 'Not Reported'],
      ['Employee Turnover', kpis.turnover_pct?.value != null ? this.formatPercent(kpis.turnover_pct.value) : 'Not Reported'],
      ['LTIFR', kpis.ltifr?.value != null ? kpis.ltifr.value.toFixed(2) : 'Not Reported'],
    ];
    
    this.addStyledTable(workforceData, [90, 80], COLORS.social);
    
    this.currentY += 5;
    
    // LTIFR Trend
    await this.addChartFromRef('ltifr-trend-chart', 'LTIFR Trend', 55);
    
    // Incidents Summary
    this.currentY += 3;
    this.addSubsectionTitle('Safety & Compliance');
    
    const incidents = this.analytics?.incidents || [];
    const totalIncidents = incidents.reduce((sum, row) => ({
      healthSafety: (sum.healthSafety || 0) + (row.healthSafety || 0),
      dataBreaches: (sum.dataBreaches || 0) + (row.dataBreaches || 0),
      violations: (sum.violations || 0) + (row.violations || 0),
    }), {});
    
    const incidentsData = [
      ['Incident Type', 'Count'],
      ['Health & Safety Incidents', this.formatNumberWithCommas(totalIncidents.healthSafety || 0)],
      ['Data Breaches', this.formatNumberWithCommas(totalIncidents.dataBreaches || 0)],
      ['Compliance Violations', this.formatNumberWithCommas(totalIncidents.violations || 0)],
    ];
    
    this.addStyledTable(incidentsData, [90, 80], COLORS.social);
    
    // Trend Analysis
    this.currentY += 5;
    this.addTrendAnalysis(this.generateSocialTrendAnalysis(kpis, totalIncidents));
  }

  generateSocialTrendAnalysis(kpis, incidents) {
    const lines = [];
    const turnover = kpis.turnover_pct?.value;
    const ltifr = kpis.ltifr?.value;
    
    if (turnover != null && turnover < 10) {
      lines.push('Employee retention is strong with low turnover, indicating positive workplace culture.');
    } else if (turnover != null && turnover < 20) {
      lines.push(`Employee turnover at ${this.formatPercent(turnover)} is within acceptable industry range.`);
    }
    
    if (ltifr != null && ltifr > 1) {
      lines.push(`LTIFR of ${ltifr.toFixed(2)} indicates safety improvements may be needed.`);
    } else if (ltifr != null) {
      lines.push(`LTIFR of ${ltifr.toFixed(2)} reflects commitment to workplace safety.`);
    }
    
    if (lines.length === 0) {
      lines.push('Social metrics are being monitored across workforce and safety dimensions.');
    }
    return lines;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. GOVERNANCE SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addGovernanceSection() {
    this.addSectionTitle('Governance', COLORS.governance);
    
    const kpis = this.summary?.kpis || {};
    const apDays = kpis.ap_days?.value;
    
    if (apDays != null) {
      await this.addChartFromRef('ap-days-chart', 'Accounts Payable Days Trend', 65);
      
      this.currentY += 3;
      
      this.addSubsectionTitle('Governance Metrics');
      
      const tableData = [
        ['Metric', 'Value'],
        ['Accounts Payable Days', `${Math.round(apDays)} days`],
      ];
      
      this.addStyledTable(tableData, [90, 80], COLORS.governance);
      
      // Trend Analysis
      this.currentY += 5;
      const analysis = apDays > 300
        ? [`Accounts Payable Days at ${Math.round(apDays)} exceeds typical benchmarks and may warrant review for supplier relationship management.`]
        : apDays > 60
          ? [`Accounts Payable Days at ${Math.round(apDays)} is within normal range for the industry.`]
          : [`Accounts Payable Days at ${Math.round(apDays)} indicates efficient payment cycles.`];
      this.addTrendAnalysis(analysis);
    } else {
      this.doc.setFont('helvetica', 'italic');
      this.doc.setFontSize(10);
      this.doc.setTextColor(COLORS.textMuted);
      this.doc.text('Governance data is not available for this reporting period.', PAGE.margin, this.currentY);
      this.currentY += 15;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. PERFORMANCE SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  addPerformanceSummary() {
    this.addSectionTitle('Performance Summary', null);
    
    // Note about comparison
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Period-over-period comparison indicators based on available data.', PAGE.margin, this.currentY);
    this.currentY += 8;
    
    // Check if we have previous period data
    const hasPreviousPeriod = false; // In real implementation, check for previous period data
    
    if (!hasPreviousPeriod) {
      // Show message about no previous data
      this.doc.setFillColor('#FEF3C7');
      this.doc.setDrawColor('#F59E0B');
      this.doc.roundedRect(PAGE.margin, this.currentY, PAGE.contentWidth, 18, 2, 2, 'FD');
      
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(9);
      this.doc.setTextColor('#92400E');
      this.doc.text('Note: Previous reporting period data is not available.', PAGE.margin + 5, this.currentY + 7);
      this.doc.text('Trend analysis will be available once multiple reporting periods are completed.', PAGE.margin + 5, this.currentY + 13);
      
      this.currentY += 25;
    }
    
    // Current values summary
    this.addSubsectionTitle('Current Period Values');
    
    const kpis = this.summary?.kpis || {};
    const emissionData = this.metrics?.emissions?.ghg_emissions || {};
    const totals = this.filteredData?.totals || {};
    const energy = this.metrics?.energy || {};
    const water = this.metrics?.water || {};
    const waste = this.metrics?.waste || {};
    
    const totalEmissions = (totals.scope1 || 0) + (totals.scope2 || 0) + (totals.scope3 || 0) || emissionData.total || 0;
    
    const tableData = [
      ['KPI', 'Current Value', 'Target Direction'],
      ['Total Emissions', `${this.formatNumberWithCommas(totalEmissions)} ${this.getCO2Unit()}`, 'Lower is better'],
      ['Renewable Energy %', energy.renewable_pct != null ? this.formatPercent(energy.renewable_pct) : 'Not Available', 'Higher is better'],
      ['Water Recycled', water.recycled != null ? `${this.formatNumberWithCommas(water.recycled)} KL` : 'Not Available', 'Higher is better'],
      ['Waste Recovery', waste.recovered != null ? `${this.formatNumberWithCommas(waste.recovered)} MT` : 'Not Available', 'Higher is better'],
      ['LTIFR', kpis.ltifr?.value != null ? kpis.ltifr.value.toFixed(2) : 'Not Available', 'Lower is better'],
      ['Employee Turnover', kpis.turnover_pct?.value != null ? this.formatPercent(kpis.turnover_pct.value) : 'Not Available', 'Lower is better'],
      ['AP Days', kpis.ap_days?.value != null ? `${Math.round(kpis.ap_days.value)} days` : 'Not Available', 'Lower is better'],
    ];
    
    this.addStyledTable(tableData, [60, 55, 55], COLORS.primary);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. KEY INSIGHTS (Rule-Based)
  // ═══════════════════════════════════════════════════════════════════════════

  addKeyInsights() {
    this.addSectionTitle('Key Insights', null);
    
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Rule-based observations generated from dashboard data.', PAGE.margin, this.currentY);
    this.currentY += 10;
    
    const insights = this.generateAllInsights();
    
    insights.forEach((insight, index) => {
      this.checkPageBreak(18);
      
      // Insight box
      this.doc.setFillColor(index % 2 === 0 ? '#F5F5F4' : '#FAFAF9');
      this.doc.setDrawColor(COLORS.border);
      
      const lines = this.doc.splitTextToSize(insight.text, PAGE.contentWidth - 20);
      const boxHeight = lines.length * 5 + 10;
      
      this.doc.roundedRect(PAGE.margin, this.currentY, PAGE.contentWidth, boxHeight, 2, 2, 'FD');
      
      // Category indicator
      this.doc.setFillColor(insight.color);
      this.doc.rect(PAGE.margin, this.currentY, 4, boxHeight, 'F');
      
      // Number
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(11);
      this.doc.setTextColor(insight.color);
      this.doc.text(`${index + 1}.`, PAGE.margin + 8, this.currentY + 7);
      
      // Text
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(9);
      this.doc.setTextColor(COLORS.text);
      this.doc.text(lines, PAGE.margin + 16, this.currentY + 7);
      
      this.currentY += boxHeight + 3;
    });
  }

  generateAllInsights() {
    const insights = [];
    const emissionData = this.metrics?.emissions?.ghg_emissions || {};
    const totals = this.filteredData?.totals || {};
    const energy = this.metrics?.energy || {};
    const water = this.metrics?.water || {};
    const waste = this.metrics?.waste || {};
    const kpis = this.summary?.kpis || {};
    
    const scope1 = totals.scope1 || emissionData.total_scope1 || 0;
    const scope2 = totals.scope2 || emissionData.total_scope2 || 0;
    const scope3 = totals.scope3 || emissionData.total_scope3 || 0;
    const total = scope1 + scope2 + scope3;
    
    // 1. Emissions insight
    if (total > 0) {
      const maxScope = Math.max(scope1, scope2, scope3);
      const maxPct = ((maxScope / total) * 100).toFixed(1);
      const scopeName = maxScope === scope1 ? 'Scope 1' : maxScope === scope2 ? 'Scope 2' : 'Scope 3';
      insights.push({
        text: `${scopeName} contributes ${maxPct}% of total emissions, making it the primary focus area for emission reduction initiatives.`,
        color: COLORS.emissions,
      });
    }
    
    // 2. Renewable energy insight
    const renewablePct = energy.renewable_pct || 0;
    if (renewablePct >= 80) {
      insights.push({
        text: `Renewable energy usage exceeds 80% (${this.formatPercent(renewablePct)}), demonstrating industry-leading clean energy adoption.`,
        color: COLORS.energy,
      });
    } else if (renewablePct >= 50) {
      insights.push({
        text: `Renewable energy at ${this.formatPercent(renewablePct)} shows strong progress. Target 80%+ to align with best practices.`,
        color: COLORS.energy,
      });
    }
    
    // 3. Waste insight
    const generated = waste.generated || 0;
    const recovered = waste.recovered || 0;
    const disposed = waste.disposed || 0;
    if (recovered > disposed && generated > 0) {
      insights.push({
        text: 'Waste recovery outperformed disposal, indicating successful circular economy practices and waste diversion programs.',
        color: COLORS.waste,
      });
    } else if (generated > 0) {
      const recoveryRate = ((recovered / generated) * 100).toFixed(1);
      insights.push({
        text: `Waste recovery rate is ${recoveryRate}%. Consider expanding recycling and recovery programs to improve this metric.`,
        color: COLORS.waste,
      });
    }
    
    // 4. Water insight
    const recycled = water.recycled || 0;
    const withdrawn = water.withdrawn || 0;
    if (withdrawn > 0 && recycled > 0) {
      const recycleRate = ((recycled / withdrawn) * 100).toFixed(1);
      insights.push({
        text: `Water recycling consistently high at ${recycleRate}%, supporting sustainable water management objectives.`,
        color: COLORS.water,
      });
    } else if (recycled > 0) {
      insights.push({
        text: `Water recycling of ${this.formatNumberWithCommas(recycled)} KL reported. Complete water withdrawal data needed for rate calculation.`,
        color: COLORS.water,
      });
    }
    
    // 5. Turnover insight
    const turnover = kpis.turnover_pct?.value;
    if (turnover != null && turnover < 10) {
      insights.push({
        text: `Employee turnover remains stable at ${this.formatPercent(turnover)}, reflecting strong workforce retention and engagement.`,
        color: COLORS.social,
      });
    }
    
    // 6. AP Days insight
    const apDays = kpis.ap_days?.value;
    if (apDays != null && apDays > 300) {
      insights.push({
        text: `Accounts Payable Days exceeds 300 days (${Math.round(apDays)}) and may warrant review to maintain healthy supplier relationships.`,
        color: COLORS.governance,
      });
    } else if (apDays != null) {
      insights.push({
        text: `Accounts Payable Days at ${Math.round(apDays)} days indicates efficient payment cycle management.`,
        color: COLORS.governance,
      });
    }
    
    // Ensure we have at least 3 insights
    if (insights.length < 3) {
      insights.push({
        text: 'ESG data collection is progressing across all key areas. Continue monitoring to enable comprehensive trend analysis.',
        color: COLORS.primary,
      });
    }
    
    return insights.slice(0, 6); // Max 6 insights
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. APPENDIX
  // ═══════════════════════════════════════════════════════════════════════════

  addAppendix() {
    this.addSectionTitle('Appendix', null);
    
    // Methodology
    this.addSubsectionTitle('Methodology');
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.text);
    const methodology = 'KPIs are calculated using data available in SustainRepo based on the selected reporting period. Emissions calculations follow the GHG Protocol. Energy, water, and waste metrics are aggregated from facility-level data.';
    const methLines = this.doc.splitTextToSize(methodology, PAGE.contentWidth);
    this.doc.text(methLines, PAGE.margin, this.currentY);
    this.currentY += methLines.length * 4 + 8;
    
    // Reporting Boundary
    this.addSubsectionTitle('Reporting Boundary');
    
    const boundaryData = [
      ['Parameter', 'Value'],
      ['Organization', this.organization.name || 'Not Specified'],
      ['Reporting Period', this.getReportingPeriod()],
      ['Reporting Frequency', this.granularity.charAt(0).toUpperCase() + this.granularity.slice(1)],
      ['Facilities Included', this.facilities.length > 0 ? `${this.facilities.length} facilities` : 'All facilities'],
      ['Framework', 'Internal / BRSR'],
      ['Report Version', this.reportVersion],
      ['Generated On', this.generatedDate],
    ];
    
    this.addStyledTable(boundaryData, [80, 90], COLORS.primary);
    
    this.currentY += 8;
    
    // Metric Definitions
    this.addSubsectionTitle('Metric Definitions');
    
    const definitions = [
      { term: 'GHG Intensity', def: `Total GHG emissions (Scope 1+2) divided by production output. Unit: ${this.getCO2Unit()} per ${this.productionUnit}.` },
      { term: 'Renewable Energy %', def: 'Percentage of total energy from renewable sources (solar, wind, hydro, biomass).' },
      { term: 'LTIFR', def: 'Lost Time Injury Frequency Rate - injuries per million hours worked.' },
      { term: 'Waste Recovery', def: 'Waste diverted from disposal via recycling, reuse, or recovery methods.' },
      { term: 'AP Days', def: 'Average days to pay suppliers (Days Payable Outstanding).' },
    ];
    
    definitions.forEach((d) => {
      this.checkPageBreak(12);
      
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(9);
      this.doc.setTextColor(COLORS.primary);
      this.doc.text(d.term, PAGE.margin, this.currentY);
      
      this.doc.setFont('helvetica', 'normal');
      this.doc.setTextColor(COLORS.text);
      const defLines = this.doc.splitTextToSize(d.def, PAGE.contentWidth - 5);
      this.doc.text(defLines, PAGE.margin, this.currentY + 4);
      this.currentY += 4 + defLines.length * 4 + 3;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  addSectionTitle(title, color) {
    // Section icon/color bar
    if (color) {
      this.doc.setFillColor(color);
      this.doc.roundedRect(PAGE.margin, this.currentY - 3, 6, 6, 1, 1, 'F');
    }
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(16);
    this.doc.setTextColor(color || COLORS.primary);
    this.doc.text(title, color ? PAGE.margin + 10 : PAGE.margin, this.currentY);
    
    // Underline
    this.doc.setDrawColor(color || COLORS.primary);
    this.doc.setLineWidth(0.7);
    const titleWidth = this.doc.getTextWidth(title);
    this.doc.line(color ? PAGE.margin + 10 : PAGE.margin, this.currentY + 2, (color ? PAGE.margin + 10 : PAGE.margin) + titleWidth, this.currentY + 2);
    
    this.currentY += 12;
  }

  addSubsectionTitle(title) {
    this.checkPageBreak(12);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(10);
    this.doc.setTextColor(COLORS.text);
    this.doc.text(title, PAGE.margin, this.currentY);
    this.currentY += 6;
  }

  addFrequencyNote() {
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.textMuted);
    const freq = this.granularity.charAt(0).toUpperCase() + this.granularity.slice(1);
    this.doc.text(`Reporting Frequency: ${freq}`, PAGE.margin, this.currentY);
    this.currentY += 6;
  }

  addTrendAnalysis(lines) {
    if (!lines || lines.length === 0) return;
    
    this.checkPageBreak(20);
    
    // Analysis box
    this.doc.setFillColor('#F0FDF4');
    this.doc.setDrawColor('#86EFAC');
    
    const allText = lines.join(' ');
    const textLines = this.doc.splitTextToSize(allText, PAGE.contentWidth - 16);
    const boxHeight = textLines.length * 4.5 + 10;
    
    this.doc.roundedRect(PAGE.margin, this.currentY, PAGE.contentWidth, boxHeight, 2, 2, 'FD');
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.emissions);
    this.doc.text('ANALYSIS', PAGE.margin + 5, this.currentY + 6);
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.text);
    this.doc.text(textLines, PAGE.margin + 5, this.currentY + 12);
    
    this.currentY += boxHeight + 5;
  }

  addStyledTable(data, columnWidths, headerColor) {
    const rowHeight = 7;
    const startX = PAGE.margin;
    let y = this.currentY;
    const totalWidth = columnWidths.reduce((a, b) => a + b, 0);
    
    data.forEach((row, rowIndex) => {
      let x = startX;
      const isHeader = rowIndex === 0;
      const isTotal = row[0]?.toString().toLowerCase().includes('total');
      
      // Row background
      if (isHeader) {
        this.doc.setFillColor(headerColor || COLORS.primary);
      } else if (isTotal) {
        this.doc.setFillColor('#E7E5E4');
      } else {
        this.doc.setFillColor(rowIndex % 2 === 0 ? '#FAFAF9' : '#FFFFFF');
      }
      
      this.doc.rect(x, y, totalWidth, rowHeight, 'F');
      
      // Cell content
      row.forEach((cell, colIndex) => {
        this.doc.setFont('helvetica', isHeader || isTotal ? 'bold' : 'normal');
        this.doc.setFontSize(8);
        this.doc.setTextColor(isHeader ? '#FFFFFF' : COLORS.text);
        
        // Right-align numeric columns (index > 0)
        const cellText = String(cell);
        if (colIndex > 0 && !isHeader) {
          const textWidth = this.doc.getTextWidth(cellText);
          this.doc.text(cellText, x + columnWidths[colIndex] - textWidth - 3, y + 5);
        } else {
          this.doc.text(cellText, x + 3, y + 5);
        }
        x += columnWidths[colIndex];
      });
      
      y += rowHeight;
    });
    
    // Border
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(0.3);
    this.doc.rect(startX, this.currentY, totalWidth, data.length * rowHeight);
    
    this.currentY = y + 5;
  }

  async addChartFromRef(testId, title, maxHeight = 70) {
    const chartElement = document.querySelector(`[data-testid="${testId}"]`);
    
    if (chartElement) {
      try {
        // Hide buttons before capture
        const buttons = chartElement.querySelectorAll('button');
        const originalVisibility = [];
        buttons.forEach((btn, i) => {
          originalVisibility[i] = btn.style.visibility;
          btn.style.visibility = 'hidden';
        });
        
        // Create capture promise with timeout
        const capturePromise = html2canvas(chartElement, {
          scale: 2,
          backgroundColor: '#FFFFFF',
          logging: false,
          useCORS: true,
          allowTaint: true,
          foreignObjectRendering: false,
          removeContainer: true,
        });
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 8000)
        );
        
        const canvas = await Promise.race([capturePromise, timeoutPromise]);
        
        // Restore buttons
        buttons.forEach((btn, i) => {
          btn.style.visibility = originalVisibility[i] || 'visible';
        });
        
        const imgData = canvas.toDataURL('image/png');
        const aspectRatio = canvas.width / canvas.height;
        let imgWidth = PAGE.contentWidth;
        let imgHeight = imgWidth / aspectRatio;
        
        if (imgHeight > maxHeight) {
          imgHeight = maxHeight;
          imgWidth = imgHeight * aspectRatio;
        }
        
        this.checkPageBreak(imgHeight + 5);
        
        // Add subtle border around chart
        this.doc.setDrawColor(COLORS.border);
        this.doc.setLineWidth(0.3);
        this.doc.roundedRect(PAGE.margin, this.currentY, PAGE.contentWidth, imgHeight + 4, 2, 2, 'S');
        
        this.doc.addImage(imgData, 'PNG', PAGE.margin + 2, this.currentY + 2, imgWidth - 4, imgHeight);
        this.currentY += imgHeight + 8;
        
        return true;
      } catch (error) {
        console.warn(`Chart capture failed: ${testId}`, error);
        // Restore buttons on error
        try {
          const buttons = chartElement.querySelectorAll('button');
          buttons.forEach(btn => { btn.style.visibility = 'visible'; });
        } catch (e) {
          // Ignore
        }
        this.addChartPlaceholder(title, maxHeight * 0.5);
        return false;
      }
    } else {
      this.addChartPlaceholder(title, maxHeight * 0.5);
      return false;
    }
  }

  addChartPlaceholder(title, height = 40) {
    this.checkPageBreak(height + 5);
    
    this.doc.setFillColor('#F5F5F4');
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(0.3);
    this.doc.roundedRect(PAGE.margin, this.currentY, PAGE.contentWidth, height, 2, 2, 'FD');
    
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text(`[${title}]`, PAGE.width / 2, this.currentY + height / 2 - 2, { align: 'center' });
    this.doc.setFontSize(7);
    this.doc.text('Chart data will appear when viewing dashboard', PAGE.width / 2, this.currentY + height / 2 + 4, { align: 'center' });
    
    this.currentY += height + 5;
  }

  formatNumberWithCommas(value) {
    if (value == null || isNaN(value)) return 'N/A';
    // Round to 2 decimal places and format with commas
    const rounded = Math.round(value * 100) / 100;
    return rounded.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  formatPercent(value) {
    if (value == null || isNaN(value)) return 'N/A';
    return `${value.toFixed(1)}%`;
  }
}

export default ESGReportGenerator;
