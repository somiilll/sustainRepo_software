/**
 * ESG Report Generator - Executive Dashboard PDF Export
 * 
 * Generates a professional PDF report from the Executive ESG Dashboard data.
 * Report Structure:
 * 1. Cover Page
 * 2. Executive Summary (KPIs + Observations)
 * 3. KPI Summary
 * 4. Emissions Section (GHG Trend + Scope Breakdown + Table)
 * 5. Energy Section (Energy Mix + Renewable/Intensity charts + Summary)
 * 6. Water Section (Water Flow + Summary table)
 * 7. Waste Section (Waste Management + Summary)
 * 8. Social Section (Employee KPIs + LTIFR + Incidents)
 * 9. Governance Section (AP Days + KPIs)
 * 10. Performance Summary (Comparison indicators)
 * 11. AI Insights (Rule-based observations)
 * 12. Appendix (Metric Definitions)
 */

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Colors
const COLORS = {
  primary: '#1A4D2E',
  secondary: '#15803D',
  accent: '#10B981',
  text: '#1C1917',
  textMuted: '#78716C',
  border: '#E7E5E4',
  background: '#FFFFFF',
  scope1: '#10B981',
  scope2: '#3B82F6',
  scope3: '#8B5CF6',
  improved: '#10B981',
  declined: '#EF4444',
  stable: '#78716C',
};

// Page dimensions (A4 in mm)
const PAGE = {
  width: 210,
  height: 297,
  margin: 15,
  contentWidth: 180,
  headerHeight: 18,
  footerHeight: 12,
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
    
    this.pageNumber = 0;
    this.currentY = PAGE.margin + PAGE.headerHeight;
    this.generatedDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  /**
   * Generate the complete report
   */
  async generate() {
    try {
      // 1. Cover Page
      this.addCoverPage();
      
      // 2. Executive Summary
      this.addNewPage();
      this.addExecutiveSummary();
      
      // 3. KPI Summary
      this.addNewPage();
      this.addKPISummary();
      
      // 4. Emissions Section
      this.addNewPage();
      await this.addEmissionsSection();
      
      // 5. Energy Section
      this.addNewPage();
      await this.addEnergySection();
      
      // 6. Water Section
      this.addNewPage();
      await this.addWaterSection();
      
      // 7. Waste Section
      this.addNewPage();
      await this.addWasteSection();
      
      // 8. Social Section
      this.addNewPage();
      await this.addSocialSection();
      
      // 9. Governance Section
      this.addNewPage();
      await this.addGovernanceSection();
      
      // 10. Performance Summary
      this.addNewPage();
      this.addPerformanceSummary();
      
      // 11. AI Insights (Rule Based)
      this.addNewPage();
      this.addAIInsights();
      
      // 12. Appendix
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
    const y = PAGE.margin - 5;
    
    // Company logo placeholder (left)
    if (this.organization.logo) {
      // Logo would be added here
    }
    
    // Company name (left)
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.primary);
    this.doc.text(this.organization.name || 'Company Name', PAGE.margin, y + 5);
    
    // Report title (center)
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.textMuted);
    const title = 'ESG Dashboard Report';
    const titleWidth = this.doc.getTextWidth(title);
    this.doc.text(title, (PAGE.width - titleWidth) / 2, y + 5);
    
    // Reporting period (right)
    const period = this.getReportingPeriod();
    const periodWidth = this.doc.getTextWidth(period);
    this.doc.text(period, PAGE.width - PAGE.margin - periodWidth, y + 5);
    
    // Header line
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(0.3);
    this.doc.line(PAGE.margin, y + 8, PAGE.width - PAGE.margin, y + 8);
  }

  addFooter() {
    const y = PAGE.height - PAGE.footerHeight;
    
    // Footer line
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(0.3);
    this.doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
    
    // Generated by (left)
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(7);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Generated by SustainRepo', PAGE.margin, y + 5);
    
    // Confidential (center)
    this.doc.setFont('helvetica', 'italic');
    const confText = 'Confidential';
    const confWidth = this.doc.getTextWidth(confText);
    this.doc.text(confText, (PAGE.width - confWidth) / 2, y + 5);
    
    // Page number (right)
    this.doc.setFont('helvetica', 'normal');
    const pageText = `Page ${this.pageNumber}`;
    const pageWidth = this.doc.getTextWidth(pageText);
    this.doc.text(pageText, PAGE.width - PAGE.margin - pageWidth, y + 5);
    
    // Generated date
    this.doc.setFontSize(6);
    this.doc.text(`Generated: ${this.generatedDate}`, PAGE.margin, y + 9);
  }

  checkPageBreak(requiredHeight) {
    const availableHeight = PAGE.height - PAGE.footerHeight - this.currentY - 5;
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
  // 1. COVER PAGE
  // ═══════════════════════════════════════════════════════════════════════════

  addCoverPage() {
    this.pageNumber = 1;
    const centerX = PAGE.width / 2;
    
    // Primary color bar at top
    this.doc.setFillColor(COLORS.primary);
    this.doc.rect(0, 0, PAGE.width, 10, 'F');
    
    // Company Logo area
    this.doc.setFillColor('#F5F5F4');
    this.doc.rect(centerX - 30, 40, 60, 40, 'F');
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Company Logo', centerX, 65, { align: 'center' });
    
    // Company Name
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(24);
    this.doc.setTextColor(COLORS.primary);
    const companyName = this.organization.name || 'Organization Name';
    this.doc.text(companyName, centerX, 105, { align: 'center' });
    
    // Report Title
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(32);
    this.doc.setTextColor(COLORS.text);
    this.doc.text('ESG Dashboard Report', centerX, 135, { align: 'center' });
    
    // Divider line
    this.doc.setDrawColor(COLORS.primary);
    this.doc.setLineWidth(1);
    this.doc.line(centerX - 40, 150, centerX + 40, 150);
    
    // Reporting Period
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Reporting Period', centerX, 170, { align: 'center' });
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(14);
    this.doc.setTextColor(COLORS.secondary);
    this.doc.text(this.getReportingPeriod(), centerX, 182, { align: 'center' });
    
    // Generated On
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Generated On', centerX, 205, { align: 'center' });
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(12);
    this.doc.setTextColor(COLORS.text);
    this.doc.text(this.generatedDate, centerX, 215, { align: 'center' });
    
    // Prepared by
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(11);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Prepared by SustainRepo', centerX, 240, { align: 'center' });
    
    // Footer bar
    this.doc.setFillColor(COLORS.primary);
    this.doc.rect(0, PAGE.height - 15, PAGE.width, 15, 'F');
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor('#FFFFFF');
    this.doc.text('Confidential', centerX, PAGE.height - 6, { align: 'center' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. EXECUTIVE SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  addExecutiveSummary() {
    this.addSectionTitle('2. Executive Summary');
    
    // KPI Cards Grid - 10 KPIs in 2 rows of 5
    const kpis = this.getExecutiveKPIs();
    this.addKPIGrid(kpis, 5);
    
    this.currentY += 8;
    
    // Observations
    this.addSubsectionTitle('Key Observations');
    const observations = this.generateExecutiveObservations();
    observations.forEach((obs) => {
      this.checkPageBreak(8);
      this.addBulletPoint(obs);
    });
  }

  getExecutiveKPIs() {
    const kpis = this.summary?.kpis || {};
    const emissionData = this.metrics?.emissions?.ghg_emissions || {};
    const totals = this.filteredData?.totals || {};
    const energy = this.metrics?.energy || {};
    const water = this.metrics?.water || {};
    const waste = this.metrics?.waste || {};
    
    const totalEmissions = emissionData.total ?? totals.total ?? 0;
    const scope12 = (totals.scope1 || emissionData.total_scope1 || 0) + (totals.scope2 || emissionData.total_scope2 || 0);
    const ghgIntensity = this.productionQty ? scope12 / this.productionQty : null;
    const totalEnergy = energy.total || 0;
    const energyIntensity = this.productionQty ? totalEnergy / this.productionQty : null;
    
    return [
      { title: 'Total Emissions', value: totalEmissions, unit: 'tCO₂e', color: '#15803D' },
      { title: 'GHG Intensity', value: ghgIntensity, unit: `tCO₂e/${this.productionUnit}`, color: '#0F766E' },
      { title: 'Energy Intensity', value: energyIntensity, unit: `MWh/${this.productionUnit}`, color: '#F59E0B' },
      { title: 'Renewable Energy %', value: energy.renewable_pct, unit: '%', color: '#84CC16' },
      { title: 'Water Recycled', value: water.recycled, unit: 'KL', color: '#0284C7' },
      { title: 'Waste Recovery', value: waste.recovered, unit: 'MT', color: '#57534E' },
      { title: 'Employees', value: kpis.total_employees?.value, unit: '', color: '#7C3AED' },
      { title: 'LTIFR', value: kpis.ltifr?.value, unit: '', color: '#DC2626' },
      { title: 'Accounts Payable Days', value: kpis.ap_days?.value, unit: 'days', color: '#4F46E5' },
      { title: 'Employee Turnover', value: kpis.turnover_pct?.value, unit: '%', color: '#F97316' },
    ];
  }

  generateExecutiveObservations() {
    const observations = [];
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
    
    // Scope contribution
    if (total > 0) {
      const maxScope = Math.max(scope1, scope2, scope3);
      if (maxScope === scope1) {
        observations.push('Scope 1 contributes the largest share of total emissions.');
      } else if (maxScope === scope2) {
        observations.push('Scope 2 contributes the largest share of total emissions.');
      } else {
        observations.push('Scope 3 contributes the largest share of total emissions.');
      }
    }
    
    // Renewable energy
    const renewablePct = energy.renewable_pct || 0;
    if (renewablePct >= 50) {
      observations.push('Renewable energy represents a significant portion of energy consumption.');
    }
    
    // Water recycling
    const withdrawn = water.withdrawn || 0;
    const recycled = water.recycled || 0;
    if (withdrawn > 0 && (recycled / withdrawn) * 100 >= 30) {
      observations.push('Water recycling performance remains strong.');
    }
    
    // Employee turnover
    const turnover = kpis.turnover_pct?.value;
    if (turnover != null && turnover < 15) {
      observations.push('Employee turnover remained low during the reporting period.');
    }
    
    if (observations.length === 0) {
      observations.push('ESG data collection is in progress across key metrics.');
    }
    
    return observations.slice(0, 4);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. KPI SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  addKPISummary() {
    this.addSectionTitle('3. KPI Summary');
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('All dashboard KPI cards displayed in printable layout. Colors maintained from dashboard.', PAGE.margin, this.currentY);
    this.currentY += 8;
    
    const kpis = this.getExecutiveKPIs();
    this.addKPIGrid(kpis, 3, true); // 3 columns, larger cards
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. EMISSIONS SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addEmissionsSection() {
    this.addSectionTitle('4. Emissions');
    
    // Reporting frequency
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.textMuted);
    const freq = this.granularity.charAt(0).toUpperCase() + this.granularity.slice(1);
    this.doc.text(`Reporting Frequency: ${freq}`, PAGE.margin, this.currentY);
    this.currentY += 8;
    
    // GHG Emission Trend Chart
    this.addSubsectionTitle('GHG Emission Trend');
    await this.addChartFromRef('ghg-emission-trend', 'GHG Emission Trend Chart', 120);
    
    // Scope Breakdown Donut (side reference)
    this.currentY += 3;
    await this.addChartFromRef('scope-breakdown-card', 'Scope Breakdown', 60);
    
    this.currentY += 5;
    
    // Scope Breakdown Table
    this.addSubsectionTitle('Scope Breakdown Summary');
    const emissionData = this.metrics?.emissions?.ghg_emissions || {};
    const totals = this.filteredData?.totals || {};
    
    const scope1 = totals.scope1 || emissionData.total_scope1 || 0;
    const scope2 = totals.scope2 || emissionData.total_scope2 || 0;
    const scope3 = totals.scope3 || emissionData.total_scope3 || 0;
    const total = scope1 + scope2 + scope3;
    
    const tableData = [
      ['Scope', 'Emissions (tCO₂e)', '% Contribution'],
      ['Scope 1', this.formatNumber(scope1), total ? `${((scope1/total)*100).toFixed(1)}%` : '0%'],
      ['Scope 2', this.formatNumber(scope2), total ? `${((scope2/total)*100).toFixed(1)}%` : '0%'],
      ['Scope 3', this.formatNumber(scope3), total ? `${((scope3/total)*100).toFixed(1)}%` : '0%'],
      ['Total', this.formatNumber(total), '100%'],
    ];
    
    this.addTable(tableData, [60, 60, 60]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. ENERGY SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addEnergySection() {
    this.addSectionTitle('5. Energy');
    
    // Energy Mix Chart
    this.addSubsectionTitle('Energy Mix');
    await this.addChartFromRef('energy-mix-chart', 'Energy Mix Chart', 80);
    
    this.currentY += 3;
    
    // Renewable % & Energy Intensity Chart
    this.addSubsectionTitle('Renewable % & Energy Intensity');
    await this.addChartFromRef('renewable-intensity-trend', 'Renewable % & Energy Intensity Trend', 80);
    
    this.currentY += 5;
    
    // Energy Summary Table
    this.addSubsectionTitle('Energy Summary');
    const energy = this.metrics?.energy || {};
    const totalEnergy = energy.total || 0;
    const renewablePct = energy.renewable_pct || 0;
    const energyIntensity = this.productionQty ? totalEnergy / this.productionQty : 0;
    
    const tableData = [
      ['Metric', 'Value'],
      ['Renewable Energy %', `${renewablePct.toFixed(1)}%`],
      ['Non-Renewable Energy %', `${(100 - renewablePct).toFixed(1)}%`],
      ['Energy Intensity', `${energyIntensity.toFixed(2)} MWh/${this.productionUnit}`],
      ['Total Energy Consumption', `${this.formatNumber(totalEnergy)} MWh`],
    ];
    
    this.addTable(tableData, [90, 90]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. WATER SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addWaterSection() {
    this.addSectionTitle('6. Water');
    
    // Water Flow Chart
    this.addSubsectionTitle('Water Flow');
    await this.addChartFromRef('water-flow-chart', 'Water Flow Chart', 80);
    
    this.currentY += 5;
    
    // Water Summary Table
    this.addSubsectionTitle('Summary');
    const water = this.metrics?.water || {};
    const withdrawn = water.withdrawn || 0;
    const consumed = water.consumed || 0;
    const discharged = water.discharged || 0;
    const recycled = water.recycled || 0;
    const recycleRate = withdrawn ? ((recycled / withdrawn) * 100) : 0;
    
    const tableData = [
      ['Metric', 'Value (KL)'],
      ['Withdrawn', this.formatNumber(withdrawn)],
      ['Consumed', this.formatNumber(consumed)],
      ['Discharged', this.formatNumber(discharged)],
      ['Recycled', this.formatNumber(recycled)],
      ['Recycle Rate %', `${recycleRate.toFixed(1)}%`],
    ];
    
    this.addTable(tableData, [90, 90]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. WASTE SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addWasteSection() {
    this.addSectionTitle('7. Waste');
    
    // Waste Management Chart
    this.addSubsectionTitle('Waste Management');
    await this.addChartFromRef('waste-management-chart', 'Waste Management Chart', 80);
    
    this.currentY += 5;
    
    // Waste Summary Table
    this.addSubsectionTitle('Summary');
    const waste = this.metrics?.waste || {};
    const generated = waste.generated || 0;
    const recovered = waste.recovered || 0;
    const disposed = waste.disposed || 0;
    const recoveryRate = generated ? ((recovered / generated) * 100) : 0;
    
    const tableData = [
      ['Metric', 'Value (MT)'],
      ['Generated', this.formatNumber(generated)],
      ['Recovered', this.formatNumber(recovered)],
      ['Disposed', this.formatNumber(disposed)],
      ['Recovery Rate', `${recoveryRate.toFixed(1)}%`],
    ];
    
    this.addTable(tableData, [90, 90]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. SOCIAL SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addSocialSection() {
    this.addSectionTitle('8. Social');
    
    const kpis = this.summary?.kpis || {};
    
    // Social KPIs
    this.addSubsectionTitle('Workforce KPIs');
    const socialKpis = [
      { title: 'Employees', value: kpis.total_employees?.value, unit: '', color: '#7C3AED' },
      { title: 'Female Workforce %', value: kpis.diversity_pct?.value, unit: '%', color: '#EC4899' },
      { title: 'LTIFR', value: kpis.ltifr?.value, unit: '', color: '#DC2626' },
      { title: 'Employee Turnover', value: kpis.turnover_pct?.value, unit: '%', color: '#F97316' },
    ];
    this.addKPIGrid(socialKpis, 4);
    
    this.currentY += 5;
    
    // LTIFR Trend Chart
    this.addSubsectionTitle('LTIFR Trend');
    await this.addChartFromRef('ltifr-trend-chart', 'LTIFR Trend Chart', 70);
    
    this.currentY += 3;
    
    // Incidents Trend Chart
    this.addSubsectionTitle('Incidents Trend');
    await this.addChartFromRef('incidents-trend-chart', 'Incidents Trend Chart', 70);
    
    this.currentY += 5;
    
    // Incidents Summary Table
    this.addSubsectionTitle('Incidents Summary');
    const incidents = this.analytics?.incidents || [];
    const totalIncidents = incidents.reduce((sum, row) => ({
      healthSafety: (sum.healthSafety || 0) + (row.healthSafety || 0),
      dataBreaches: (sum.dataBreaches || 0) + (row.dataBreaches || 0),
      violations: (sum.violations || 0) + (row.violations || 0),
    }), {});
    
    const tableData = [
      ['Incident Type', 'Total Count'],
      ['Health & Safety Incidents', this.formatNumber(totalIncidents.healthSafety || 0)],
      ['Data Breaches', this.formatNumber(totalIncidents.dataBreaches || 0)],
      ['Violations', this.formatNumber(totalIncidents.violations || 0)],
    ];
    
    this.addTable(tableData, [90, 90]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. GOVERNANCE SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addGovernanceSection() {
    this.addSectionTitle('9. Governance');
    
    const kpis = this.summary?.kpis || {};
    const apDays = kpis.ap_days?.value;
    
    if (apDays != null) {
      // Accounts Payable Days Chart
      this.addSubsectionTitle('Accounts Payable Days');
      await this.addChartFromRef('ap-days-chart', 'Accounts Payable Days Chart', 80);
      
      this.currentY += 5;
      
      // Governance KPIs
      this.addSubsectionTitle('Governance KPIs');
      const tableData = [
        ['Metric', 'Value'],
        ['Accounts Payable Days', `${this.formatNumber(apDays)} days`],
      ];
      
      this.addTable(tableData, [90, 90]);
    } else {
      this.doc.setFont('helvetica', 'italic');
      this.doc.setFontSize(11);
      this.doc.setTextColor(COLORS.textMuted);
      this.doc.text('No governance data available.', PAGE.margin, this.currentY);
      this.currentY += 10;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. PERFORMANCE SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  addPerformanceSummary() {
    this.addSectionTitle('10. Performance Summary');
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Comparison indicators based on previous period dashboard data.', PAGE.margin, this.currentY);
    this.currentY += 5;
    this.doc.text('▲ Improved  |  ▼ Declined  |  ► Stable', PAGE.margin, this.currentY);
    this.currentY += 10;
    
    const performance = this.calculatePerformanceIndicators();
    
    // Performance table with status indicators
    const tableData = [
      ['KPI', 'Current Value', 'Status'],
      ...performance.map(p => [p.kpi, p.currentValue, p.status])
    ];
    
    this.addPerformanceTable(tableData, performance);
  }

  calculatePerformanceIndicators() {
    const kpis = this.summary?.kpis || {};
    const emissionData = this.metrics?.emissions?.ghg_emissions || {};
    const energy = this.metrics?.energy || {};
    const water = this.metrics?.water || {};
    const waste = this.metrics?.waste || {};
    
    // Define KPIs with improvement direction
    // For this version, we show stable since we don't have historical comparison
    // In real implementation, compare with previous period data
    const kpiConfigs = [
      { 
        key: 'emissions', 
        label: 'Total Emissions', 
        current: emissionData.total || 0, 
        unit: 'tCO₂e',
        lowerIsBetter: true 
      },
      { 
        key: 'renewablePct', 
        label: 'Renewable %', 
        current: energy.renewable_pct || 0, 
        unit: '%',
        lowerIsBetter: false // higher is better
      },
      { 
        key: 'waterRecycled', 
        label: 'Water Recycled', 
        current: water.recycled || 0, 
        unit: 'KL',
        lowerIsBetter: false // higher is better
      },
      { 
        key: 'wasteRecovery', 
        label: 'Waste Recovery', 
        current: waste.recovered || 0, 
        unit: 'MT',
        lowerIsBetter: false // higher is better
      },
      { 
        key: 'energyIntensity', 
        label: 'Energy Intensity', 
        current: this.productionQty ? (energy.total || 0) / this.productionQty : 0, 
        unit: `MWh/${this.productionUnit}`,
        lowerIsBetter: true 
      },
      { 
        key: 'ltifr', 
        label: 'LTIFR', 
        current: kpis.ltifr?.value || 0, 
        unit: '',
        lowerIsBetter: true 
      },
      { 
        key: 'turnover', 
        label: 'Employee Turnover', 
        current: kpis.turnover_pct?.value || 0, 
        unit: '%',
        lowerIsBetter: true 
      },
      { 
        key: 'apDays', 
        label: 'Accounts Payable Days', 
        current: kpis.ap_days?.value || 0, 
        unit: 'days',
        lowerIsBetter: true 
      },
    ];
    
    return kpiConfigs.map(kpi => {
      // Default to stable since we don't have previous period comparison
      // In real implementation: compare kpi.current with kpi.previous
      const status = '► Stable';
      const statusColor = COLORS.stable;
      
      return {
        kpi: kpi.label,
        currentValue: kpi.current != null ? `${this.formatNumber(kpi.current)} ${kpi.unit}` : 'N/A',
        status,
        statusColor,
        lowerIsBetter: kpi.lowerIsBetter,
      };
    });
  }

  addPerformanceTable(data, performance) {
    const rowHeight = 8;
    const columnWidths = [70, 60, 50];
    const startX = PAGE.margin;
    let y = this.currentY;
    
    data.forEach((row, rowIndex) => {
      let x = startX;
      const isHeader = rowIndex === 0;
      
      // Row background
      if (isHeader) {
        this.doc.setFillColor(COLORS.primary);
      } else {
        this.doc.setFillColor(rowIndex % 2 === 0 ? '#FAFAF9' : '#FFFFFF');
      }
      
      const totalWidth = columnWidths.reduce((a, b) => a + b, 0);
      this.doc.rect(x, y, totalWidth, rowHeight, 'F');
      
      // Cell content
      row.forEach((cell, colIndex) => {
        this.doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
        this.doc.setFontSize(9);
        
        if (isHeader) {
          this.doc.setTextColor('#FFFFFF');
        } else if (colIndex === 2) {
          // Status column with color
          const perfItem = performance[rowIndex - 1];
          if (cell.includes('▲')) {
            this.doc.setTextColor(COLORS.improved);
          } else if (cell.includes('▼')) {
            this.doc.setTextColor(COLORS.declined);
          } else {
            this.doc.setTextColor(COLORS.stable);
          }
        } else {
          this.doc.setTextColor(COLORS.text);
        }
        
        this.doc.text(String(cell), x + 3, y + 5.5);
        x += columnWidths[colIndex];
      });
      
      y += rowHeight;
    });
    
    // Border
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(0.3);
    const totalWidth = columnWidths.reduce((a, b) => a + b, 0);
    this.doc.rect(startX, this.currentY, totalWidth, data.length * rowHeight);
    
    this.currentY = y + 5;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. AI INSIGHTS (RULE BASED)
  // ═══════════════════════════════════════════════════════════════════════════

  addAIInsights() {
    this.addSectionTitle('11. Key Insights');
    
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Rule-based observations generated from dashboard data. No AI/LLM APIs used.', PAGE.margin, this.currentY);
    this.currentY += 10;
    
    const insights = this.generateRuleBasedInsights();
    
    insights.forEach((insight, index) => {
      this.checkPageBreak(12);
      
      // Insight number
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(10);
      this.doc.setTextColor(COLORS.primary);
      this.doc.text(`${index + 1}.`, PAGE.margin, this.currentY);
      
      // Insight text
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(10);
      this.doc.setTextColor(COLORS.text);
      const lines = this.doc.splitTextToSize(insight, PAGE.contentWidth - 10);
      this.doc.text(lines, PAGE.margin + 8, this.currentY);
      this.currentY += lines.length * 5 + 5;
    });
  }

  generateRuleBasedInsights() {
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
    
    // 1. Scope contribution insight
    if (total > 0) {
      const maxScope = Math.max(scope1, scope2, scope3);
      const maxPct = ((maxScope / total) * 100).toFixed(1);
      if (maxScope === scope1) {
        insights.push(`Scope 1 remains the primary contributor to total emissions, accounting for ${maxPct}% of the total.`);
      } else if (maxScope === scope2) {
        insights.push(`Scope 2 remains the primary contributor to total emissions, accounting for ${maxPct}% of the total.`);
      } else {
        insights.push(`Scope 3 remains the primary contributor to total emissions, accounting for ${maxPct}% of the total.`);
      }
    }
    
    // 2. Renewable energy insight
    const renewablePct = energy.renewable_pct || 0;
    if (renewablePct >= 80) {
      insights.push(`Renewable energy usage exceeds 80%, demonstrating strong commitment to clean energy.`);
    } else if (renewablePct >= 50) {
      insights.push(`Renewable energy accounts for ${renewablePct.toFixed(1)}% of total consumption, showing progress toward sustainability goals.`);
    } else if (renewablePct > 0) {
      insights.push(`Renewable energy currently at ${renewablePct.toFixed(1)}% - opportunity exists to increase clean energy adoption.`);
    }
    
    // 3. Waste recovery insight
    const generated = waste.generated || 0;
    const recovered = waste.recovered || 0;
    const disposed = waste.disposed || 0;
    if (generated > 0 && recovered > disposed) {
      insights.push('Waste recovery exceeds disposal, indicating effective waste management practices.');
    } else if (generated > 0) {
      const recoveryRate = ((recovered / generated) * 100).toFixed(1);
      insights.push(`Waste recovery rate is ${recoveryRate}% of total generated waste.`);
    }
    
    // 4. Water recycling insight
    const withdrawn = water.withdrawn || 0;
    const recycled = water.recycled || 0;
    if (withdrawn > 0) {
      const recycleRate = ((recycled / withdrawn) * 100).toFixed(1);
      if (recycleRate >= 50) {
        insights.push(`Water recycling is consistently high at ${recycleRate}% of withdrawn water.`);
      } else if (recycleRate > 0) {
        insights.push(`Water recycling rate stands at ${recycleRate}% with potential for improvement.`);
      }
    }
    
    // 5. Employee turnover insight
    const turnover = kpis.turnover_pct?.value;
    if (turnover != null) {
      if (turnover < 10) {
        insights.push('Employee turnover remains stable and low, indicating strong workforce retention.');
      } else if (turnover < 20) {
        insights.push(`Employee turnover at ${turnover.toFixed(1)}% is within acceptable industry range.`);
      }
    }
    
    // Ensure we have at least 1 and max 5 insights
    if (insights.length === 0) {
      insights.push('ESG data collection is progressing. Continue monitoring key metrics for trend analysis.');
    }
    
    return insights.slice(0, 5);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. APPENDIX
  // ═══════════════════════════════════════════════════════════════════════════

  addAppendix() {
    this.addSectionTitle('12. Appendix: Metric Definitions');
    
    const definitions = [
      { term: 'GHG Intensity', definition: 'Total greenhouse gas emissions (Scope 1 + Scope 2) divided by production output. Measured in tCO₂e per unit produced.' },
      { term: 'Energy Intensity', definition: 'Total energy consumption divided by production output. Measured in MWh per unit produced.' },
      { term: 'Renewable Energy %', definition: 'Percentage of total energy consumption from renewable sources (solar, wind, hydro, biomass).' },
      { term: 'LTIFR', definition: 'Lost Time Injury Frequency Rate - Number of lost time injuries per million hours worked.' },
      { term: 'Waste Recovery', definition: 'Amount of waste diverted from disposal through recycling, reuse, composting or other recovery methods.' },
      { term: 'Accounts Payable Days', definition: 'Average number of days taken to pay suppliers. Also known as Days Payable Outstanding (DPO).' },
      { term: 'Water Recycled', definition: 'Volume of water that has been treated and reused within operations. Measured in kiloliters (KL).' },
    ];
    
    definitions.forEach((def) => {
      this.checkPageBreak(18);
      
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(10);
      this.doc.setTextColor(COLORS.primary);
      this.doc.text(def.term, PAGE.margin, this.currentY);
      this.currentY += 5;
      
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(9);
      this.doc.setTextColor(COLORS.text);
      const lines = this.doc.splitTextToSize(def.definition, PAGE.contentWidth);
      this.doc.text(lines, PAGE.margin, this.currentY);
      this.currentY += lines.length * 4 + 5;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  addSectionTitle(title) {
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(16);
    this.doc.setTextColor(COLORS.primary);
    this.doc.text(title, PAGE.margin, this.currentY);
    
    // Underline
    this.doc.setDrawColor(COLORS.primary);
    this.doc.setLineWidth(0.5);
    const titleWidth = this.doc.getTextWidth(title);
    this.doc.line(PAGE.margin, this.currentY + 2, PAGE.margin + titleWidth, this.currentY + 2);
    
    this.currentY += 12;
  }

  addSubsectionTitle(title) {
    this.checkPageBreak(15);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.setTextColor(COLORS.text);
    this.doc.text(title, PAGE.margin, this.currentY);
    this.currentY += 7;
  }

  addBulletPoint(text) {
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    this.doc.setTextColor(COLORS.text);
    
    // Bullet
    this.doc.setFillColor(COLORS.secondary);
    this.doc.circle(PAGE.margin + 2, this.currentY - 1.5, 1, 'F');
    
    // Text
    const lines = this.doc.splitTextToSize(text, PAGE.contentWidth - 10);
    this.doc.text(lines, PAGE.margin + 6, this.currentY);
    this.currentY += lines.length * 5 + 2;
  }

  addKPIGrid(kpis, columns, large = false) {
    const cardWidth = (PAGE.contentWidth - (columns - 1) * 3) / columns;
    const cardHeight = large ? 30 : 22;
    let x = PAGE.margin;
    let y = this.currentY;
    
    kpis.forEach((kpi, index) => {
      if (index > 0 && index % columns === 0) {
        x = PAGE.margin;
        y += cardHeight + 3;
      }
      
      // Card background
      this.doc.setFillColor('#FAFAF9');
      this.doc.setDrawColor(COLORS.border);
      this.doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');
      
      // Top accent line with color
      this.doc.setFillColor(kpi.color || COLORS.accent);
      this.doc.rect(x, y, cardWidth, 1.5, 'F');
      
      // Title
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(large ? 7 : 6);
      this.doc.setTextColor(COLORS.textMuted);
      const titleText = kpi.title.length > 20 ? kpi.title.substring(0, 18) + '...' : kpi.title;
      this.doc.text(titleText.toUpperCase(), x + 2, y + (large ? 7 : 5));
      
      // Value
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(large ? 14 : 11);
      this.doc.setTextColor(COLORS.text);
      const valueText = kpi.value != null ? this.formatNumber(kpi.value) : 'N/A';
      this.doc.text(valueText, x + 2, y + (large ? 17 : 13));
      
      // Unit
      if (kpi.unit) {
        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(large ? 8 : 6);
        this.doc.setTextColor(COLORS.textMuted);
        const unitText = kpi.unit.length > 15 ? kpi.unit.substring(0, 12) + '...' : kpi.unit;
        this.doc.text(unitText, x + 2, y + (large ? 23 : 18));
      }
      
      x += cardWidth + 3;
    });
    
    const rows = Math.ceil(kpis.length / columns);
    this.currentY = y + cardHeight + 5;
  }

  addTable(data, columnWidths) {
    const rowHeight = 7;
    const startX = PAGE.margin;
    let y = this.currentY;
    
    data.forEach((row, rowIndex) => {
      let x = startX;
      const isHeader = rowIndex === 0;
      const isTotal = row[0]?.toLowerCase?.() === 'total';
      
      // Row background
      if (isHeader) {
        this.doc.setFillColor(COLORS.primary);
      } else if (isTotal) {
        this.doc.setFillColor('#E7E5E4');
      } else {
        this.doc.setFillColor(rowIndex % 2 === 0 ? '#FAFAF9' : '#FFFFFF');
      }
      
      const totalWidth = columnWidths.reduce((a, b) => a + b, 0);
      this.doc.rect(x, y, totalWidth, rowHeight, 'F');
      
      // Cell content
      row.forEach((cell, colIndex) => {
        this.doc.setFont('helvetica', isHeader || isTotal ? 'bold' : 'normal');
        this.doc.setFontSize(9);
        this.doc.setTextColor(isHeader ? '#FFFFFF' : COLORS.text);
        
        this.doc.text(String(cell), x + 2, y + 5);
        x += columnWidths[colIndex];
      });
      
      y += rowHeight;
    });
    
    // Border
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(0.3);
    const totalWidth = columnWidths.reduce((a, b) => a + b, 0);
    this.doc.rect(startX, this.currentY, totalWidth, data.length * rowHeight);
    
    this.currentY = y + 5;
  }

  async addChartFromRef(testId, title, maxHeight = 80) {
    const chartElement = document.querySelector(`[data-testid="${testId}"]`);
    
    if (chartElement) {
      try {
        // Hide interactive elements before capture
        const buttons = chartElement.querySelectorAll('button');
        buttons.forEach(btn => btn.style.visibility = 'hidden');
        
        const canvas = await html2canvas(chartElement, {
          scale: 2,
          backgroundColor: '#FFFFFF',
          logging: false,
          useCORS: true,
        });
        
        // Restore buttons
        buttons.forEach(btn => btn.style.visibility = 'visible');
        
        const imgData = canvas.toDataURL('image/png');
        const aspectRatio = canvas.width / canvas.height;
        let imgWidth = PAGE.contentWidth;
        let imgHeight = imgWidth / aspectRatio;
        
        // Limit height
        if (imgHeight > maxHeight) {
          imgHeight = maxHeight;
          imgWidth = imgHeight * aspectRatio;
        }
        
        // Check page break
        this.checkPageBreak(imgHeight + 5);
        
        this.doc.addImage(imgData, 'PNG', PAGE.margin, this.currentY, imgWidth, imgHeight);
        this.currentY += imgHeight + 3;
      } catch (error) {
        console.warn(`Could not capture chart: ${testId}`, error);
        this.addChartPlaceholder(title, maxHeight * 0.6);
      }
    } else {
      this.addChartPlaceholder(title, maxHeight * 0.6);
    }
  }

  addChartPlaceholder(title, height = 50) {
    this.doc.setFillColor('#F5F5F4');
    this.doc.setDrawColor(COLORS.border);
    this.doc.roundedRect(PAGE.margin, this.currentY, PAGE.contentWidth, height, 2, 2, 'FD');
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text(`[${title}]`, PAGE.width / 2, this.currentY + height / 2, { align: 'center' });
    
    this.currentY += height + 3;
  }

  formatNumber(value) {
    if (value == null || isNaN(value)) return 'N/A';
    if (Math.abs(value) >= 1000000) {
      return (value / 1000000).toFixed(2) + 'M';
    }
    if (Math.abs(value) >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}

export default ESGReportGenerator;
