/**
 * ESG Report Generator - Executive Dashboard PDF Export V4
 * Premium boardroom-ready report with visual storytelling
 * Management-level ready with comprehensive analysis
 * 
 * Report Structure:
 * 1. Cover Page (Premium design with ESG-themed background + tagline)
 * 2. Executive Summary (Narrative paragraph + Key Metrics)
 * 3. ESG Performance Score + Maturity Rating
 * 4. Data Completeness Overview
 * 5. Key Achievements (5-8 items)
 * 6. Environmental Section Title Page (Icon + Summary + 4 KPIs)
 *    - Emissions
 *    - Energy
 *    - Water
 *    - Waste
 * 7. Social Section Title Page (Icon + Summary + 4 KPIs)
 *    - Workforce & Safety
 * 8. Governance Section Title Page (Icon + Summary + 4 KPIs)
 *    - Financial Governance
 * 9. Improvement Opportunities (Priority Table)
 * 10. Key Insights (Visual Cards)
 * 11. Recommendations Summary (Next 90 Days)
 * 12. Appendix (Methodology + ESG Score Calculation + Definitions + Metadata)
 */

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Colors matching dashboard theme
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
  // Section colors - distinct identity
  environmental: '#15803D',
  emissions: '#059669',
  energy: '#F59E0B',
  water: '#0284C7',
  waste: '#78716C',
  social: '#7C3AED',
  governance: '#4F46E5',
  // Status colors
  improved: '#10B981',
  declined: '#EF4444',
  stable: '#78716C',
  attention: '#F59E0B',
  achievement: '#059669',
  // Priority colors
  priorityHigh: '#DC2626',
  priorityMedium: '#F59E0B',
  priorityLow: '#3B82F6',
};

// Page dimensions (A4 in mm)
const PAGE = {
  width: 210,
  height: 297,
  margin: 15,
  marginSmall: 12,
  contentWidth: 180,
  headerHeight: 14,
  footerHeight: 12,
};

// Industry benchmarks for analysis
const BENCHMARKS = {
  renewableEnergy: { good: 50, excellent: 80 },
  wasteRecovery: { good: 50, excellent: 70 },
  waterRecycle: { good: 30, excellent: 50 },
  apDays: { excellent: 30, good: 60, fair: 90, typical: '30-90' },
  ltifr: { excellent: 1, good: 2, fair: 5 },
  turnover: { excellent: 5, good: 10, fair: 20 },
  diversity: { good: 30, excellent: 40 },
};

/**
 * Main PDF Generator Class - V4
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
    this.user = options.user || {};
    
    this.pageNumber = 0;
    this.totalPages = 0;
    this.currentY = PAGE.margin + PAGE.headerHeight;
    this.generatedDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    this.generatedTimestamp = new Date().toISOString();
    this.reportVersion = '4.0';
    
    // Pre-calculate data
    this.preCalculateData();
  }

  preCalculateData() {
    const emissionData = this.metrics?.emissions?.ghg_emissions || {};
    const totals = this.filteredData?.totals || {};
    const energy = this.metrics?.energy || {};
    const water = this.metrics?.water || {};
    const waste = this.metrics?.waste || {};
    const kpis = this.summary?.kpis || {};
    
    this.data = {
      scope1: totals.scope1 || emissionData.total_scope1 || 0,
      scope2: totals.scope2 || emissionData.total_scope2 || 0,
      scope3: totals.scope3 || emissionData.total_scope3 || 0,
      totalEmissions: 0,
      renewablePct: energy.renewable_pct || 0,
      totalEnergy: energy.total || 0,
      waterWithdrawn: water.withdrawn || 0,
      waterRecycled: water.recycled || 0,
      waterConsumed: water.consumed || 0,
      waterDischarged: water.discharged || 0,
      wasteGenerated: waste.generated || 0,
      wasteRecovered: waste.recovered || 0,
      wasteDisposed: waste.disposed || 0,
      employees: kpis.total_employees?.value || 0,
      turnover: kpis.turnover_pct?.value,
      ltifr: kpis.ltifr?.value,
      apDays: kpis.ap_days?.value,
      diversityPct: kpis.diversity_pct?.value,
    };
    
    this.data.totalEmissions = this.data.scope1 + this.data.scope2 + this.data.scope3;
    
    // Calculate percentages
    if (this.data.totalEmissions > 0) {
      this.data.scope1Pct = (this.data.scope1 / this.data.totalEmissions) * 100;
      this.data.scope2Pct = (this.data.scope2 / this.data.totalEmissions) * 100;
      this.data.scope3Pct = (this.data.scope3 / this.data.totalEmissions) * 100;
    }
    
    if (this.data.wasteGenerated > 0) {
      this.data.wasteRecoveryRate = (this.data.wasteRecovered / this.data.wasteGenerated) * 100;
    }
    
    if (this.data.waterWithdrawn > 0) {
      this.data.waterRecycleRate = (this.data.waterRecycled / this.data.waterWithdrawn) * 100;
    }
    
    // Calculate ESG scores and data completeness
    this.calculateESGScores();
    this.calculateDataCompleteness();
  }

  calculateESGScores() {
    let envScore = 50;
    let socScore = 50;
    let govScore = 50;
    
    // Environmental scoring
    if (this.data.renewablePct >= 80) envScore += 30;
    else if (this.data.renewablePct >= 50) envScore += 20;
    else if (this.data.renewablePct >= 20) envScore += 10;
    
    if (this.data.wasteRecoveryRate >= 70) envScore += 15;
    else if (this.data.wasteRecoveryRate >= 40) envScore += 10;
    
    if (this.data.waterRecycleRate >= 50) envScore += 5;
    
    // Social scoring
    if (this.data.turnover != null && this.data.turnover < 10) socScore += 20;
    else if (this.data.turnover != null && this.data.turnover < 20) socScore += 10;
    
    if (this.data.ltifr != null && this.data.ltifr < 1) socScore += 25;
    else if (this.data.ltifr != null && this.data.ltifr < 5) socScore += 15;
    
    if (this.data.diversityPct != null && this.data.diversityPct >= 40) socScore += 5;
    
    // Governance scoring
    if (this.data.apDays != null && this.data.apDays < 60) govScore += 30;
    else if (this.data.apDays != null && this.data.apDays < 90) govScore += 20;
    else if (this.data.apDays != null && this.data.apDays < 120) govScore += 10;
    
    this.scores = {
      environmental: Math.min(100, Math.max(0, envScore)),
      social: Math.min(100, Math.max(0, socScore)),
      governance: Math.min(100, Math.max(0, govScore)),
      overall: 0,
    };
    
    this.scores.overall = Math.round(
      (this.scores.environmental * 0.4) + 
      (this.scores.social * 0.35) + 
      (this.scores.governance * 0.25)
    );
  }

  calculateDataCompleteness() {
    // Environmental completeness
    let envFields = 0;
    let envComplete = 0;
    
    // Emissions
    envFields += 3;
    if (this.data.scope1 > 0) envComplete++;
    if (this.data.scope2 > 0) envComplete++;
    if (this.data.scope3 > 0) envComplete++;
    
    // Energy
    envFields += 2;
    if (this.data.totalEnergy > 0) envComplete++;
    if (this.data.renewablePct > 0) envComplete++;
    
    // Water
    envFields += 3;
    if (this.data.waterWithdrawn > 0) envComplete++;
    if (this.data.waterRecycled > 0) envComplete++;
    if (this.data.waterDischarged > 0) envComplete++;
    
    // Waste
    envFields += 3;
    if (this.data.wasteGenerated > 0) envComplete++;
    if (this.data.wasteRecovered > 0) envComplete++;
    if (this.data.wasteDisposed > 0) envComplete++;
    
    // Social completeness
    let socFields = 4;
    let socComplete = 0;
    if (this.data.employees > 0) socComplete++;
    if (this.data.turnover != null) socComplete++;
    if (this.data.ltifr != null) socComplete++;
    if (this.data.diversityPct != null) socComplete++;
    
    // Governance completeness
    let govFields = 1;
    let govComplete = 0;
    if (this.data.apDays != null) govComplete++;
    
    this.completeness = {
      environmental: Math.round((envComplete / envFields) * 100),
      social: Math.round((socComplete / socFields) * 100),
      governance: Math.round((govComplete / govFields) * 100),
      overall: 0,
    };
    
    const totalFields = envFields + socFields + govFields;
    const totalComplete = envComplete + socComplete + govComplete;
    this.completeness.overall = Math.round((totalComplete / totalFields) * 100);
  }

  getCO2Unit() {
    return 'tCO2e';
  }

  getMaturityLevel(score) {
    if (score >= 90) return { level: 'Leading', stars: 5 };
    if (score >= 75) return { level: 'Advanced', stars: 4 };
    if (score >= 60) return { level: 'Developing', stars: 3 };
    if (score >= 40) return { level: 'Emerging', stars: 2 };
    return { level: 'Beginning', stars: 1 };
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
      
      // 3. ESG Performance Score + Maturity
      this.addNewPage();
      this.addESGScorePage();
      
      // 4. Data Completeness
      this.addNewPage();
      this.addDataCompletenessPage();
      
      // 5. Key Achievements
      this.addNewPage();
      this.addAchievementsPage();
      
      // 6. Environmental Section Title Page
      this.addNewPage();
      this.addSectionTitlePage('environmental');
      
      // Emissions
      this.addNewPage();
      await this.addEmissionsSection();
      
      // Energy
      this.addNewPage();
      await this.addEnergySection();
      
      // Water
      this.addNewPage();
      await this.addWaterSection();
      
      // Waste
      this.addNewPage();
      await this.addWasteSection();
      
      // 7. Social Section Title Page
      this.addNewPage();
      this.addSectionTitlePage('social');
      
      this.addNewPage();
      await this.addSocialSection();
      
      // 8. Governance Section Title Page
      this.addNewPage();
      this.addSectionTitlePage('governance');
      
      this.addNewPage();
      await this.addGovernanceSection();
      
      // 9. Improvement Opportunities (Priority Table)
      this.addNewPage();
      this.addImprovementOpportunities();
      
      // 10. Key Insights (Visual Cards)
      this.addNewPage();
      this.addKeyInsights();
      
      // 11. Recommendations Summary (Next 90 Days)
      this.addNewPage();
      this.addRecommendationsSummary();
      
      // 12. Appendix
      this.addNewPage();
      this.addAppendix();
      
      // Update total pages
      this.totalPages = this.pageNumber;
      
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
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.primary);
    this.doc.text(this.organization.name || 'Organization', PAGE.margin, y);
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('ESG Dashboard Report', PAGE.width / 2, y, { align: 'center' });
    
    const period = this.getReportingPeriod();
    this.doc.text(period, PAGE.width - PAGE.margin, y, { align: 'right' });
    
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
    
    // Left: Website
    this.doc.text('www.sustainrepo.com', PAGE.margin, y - 2);
    
    // Center: Confidential
    this.doc.setFont('helvetica', 'italic');
    this.doc.text('Confidential', PAGE.width / 2, y - 2, { align: 'center' });
    
    // Right: Page number
    this.doc.setFont('helvetica', 'normal');
    this.doc.text(`Page ${this.pageNumber}`, PAGE.width - PAGE.margin, y - 2, { align: 'right' });
    
    // Bottom row: Support email
    this.doc.setFontSize(5);
    this.doc.text('info@sustainrepo.com', PAGE.margin, y + 2);
    this.doc.text('Generated by SustainRepo', PAGE.width - PAGE.margin, y + 2, { align: 'right' });
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
  // 1. COVER PAGE (Premium Design with ESG-themed background)
  // ═══════════════════════════════════════════════════════════════════════════

  addCoverPage() {
    this.pageNumber = 1;
    const centerX = PAGE.width / 2;
    
    // ESG-themed background pattern (subtle geometric)
    this.doc.setFillColor('#F0FDF4');
    this.doc.rect(0, 0, PAGE.width, PAGE.height, 'F');
    
    // Decorative circles (ESG theme)
    this.doc.setFillColor('#DCFCE7');
    this.doc.circle(30, 50, 40, 'F');
    this.doc.circle(180, 250, 50, 'F');
    this.doc.setFillColor('#D1FAE5');
    this.doc.circle(170, 80, 25, 'F');
    
    // Top gradient bar
    this.doc.setFillColor(COLORS.primary);
    this.doc.rect(0, 0, PAGE.width, 50, 'F');
    
    // Accent line
    this.doc.setFillColor(COLORS.accent);
    this.doc.rect(0, 50, PAGE.width, 4, 'F');
    
    // Company name in header
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(16);
    this.doc.setTextColor('#FFFFFF');
    this.doc.text(this.organization.name || 'Organization', centerX, 28, { align: 'center' });
    
    // ESG icon circles
    const iconY = 75;
    const iconSpacing = 40;
    
    // E circle
    this.doc.setFillColor(COLORS.environmental);
    this.doc.circle(centerX - iconSpacing, iconY, 12, 'F');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(14);
    this.doc.setTextColor('#FFFFFF');
    this.doc.text('E', centerX - iconSpacing, iconY + 4, { align: 'center' });
    
    // S circle
    this.doc.setFillColor(COLORS.social);
    this.doc.circle(centerX, iconY, 12, 'F');
    this.doc.text('S', centerX, iconY + 4, { align: 'center' });
    
    // G circle
    this.doc.setFillColor(COLORS.governance);
    this.doc.circle(centerX + iconSpacing, iconY, 12, 'F');
    this.doc.text('G', centerX + iconSpacing, iconY + 4, { align: 'center' });
    
    // Main title
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(36);
    this.doc.setTextColor(COLORS.primary);
    this.doc.text('ESG Dashboard', centerX, 115, { align: 'center' });
    this.doc.text('Report', centerX, 130, { align: 'center' });
    
    // Tagline
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(12);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('"Driving Sustainable Performance Through Data"', centerX, 145, { align: 'center' });
    
    // Decorative line
    this.doc.setDrawColor(COLORS.accent);
    this.doc.setLineWidth(2);
    this.doc.line(centerX - 60, 155, centerX + 60, 155);
    
    // Subtitle
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(11);
    this.doc.setTextColor(COLORS.text);
    this.doc.text('Environmental, Social & Governance Performance', centerX, 168, { align: 'center' });
    
    // Metadata cards
    const cardY = 185;
    const cardWidth = 80;
    const cardHeight = 40;
    
    // Left card - Period
    this.drawMetadataCard(PAGE.margin + 5, cardY, cardWidth, cardHeight, 'REPORTING PERIOD', this.getReportingPeriod());
    
    // Right card - Generated
    this.drawMetadataCard(PAGE.width - PAGE.margin - cardWidth - 5, cardY, cardWidth, cardHeight, 'GENERATED ON', this.generatedDate);
    
    // Bottom info
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Prepared by SustainRepo', centerX, 245, { align: 'center' });
    this.doc.setFontSize(8);
    this.doc.text(`Report Version ${this.reportVersion}`, centerX, 253, { align: 'center' });
    
    // Footer bar
    this.doc.setFillColor(COLORS.primary);
    this.doc.rect(0, PAGE.height - 20, PAGE.width, 20, 'F');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    this.doc.setTextColor('#FFFFFF');
    this.doc.text('CONFIDENTIAL', centerX, PAGE.height - 10, { align: 'center' });
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(7);
    this.doc.text('www.sustainrepo.com  |  info@sustainrepo.com', centerX, PAGE.height - 5, { align: 'center' });
  }

  drawMetadataCard(x, y, width, height, label, value) {
    this.doc.setFillColor('#FFFFFF');
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(0.3);
    this.doc.roundedRect(x, y, width, height, 3, 3, 'FD');
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(7);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text(label, x + width/2, y + 10, { align: 'center' });
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(10);
    this.doc.setTextColor(COLORS.text);
    this.doc.text(value, x + width/2, y + 25, { align: 'center' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. EXECUTIVE SUMMARY (Narrative)
  // ═══════════════════════════════════════════════════════════════════════════

  addExecutiveSummary() {
    this.addPageTitle('Executive Summary');
    
    // Narrative paragraph
    const narrative = this.generateNarrativeSummary();
    
    this.doc.setFillColor(COLORS.backgroundAlt);
    this.doc.setDrawColor(COLORS.accent);
    this.doc.setLineWidth(0.5);
    
    const narrativeLines = this.doc.splitTextToSize(narrative, PAGE.contentWidth - 20);
    const narrativeHeight = narrativeLines.length * 5 + 16;
    
    this.doc.roundedRect(PAGE.margin, this.currentY, PAGE.contentWidth, narrativeHeight, 3, 3, 'FD');
    
    // Left accent bar
    this.doc.setFillColor(COLORS.accent);
    this.doc.rect(PAGE.margin, this.currentY, 4, narrativeHeight, 'F');
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    this.doc.setTextColor(COLORS.text);
    this.doc.text(narrativeLines, PAGE.margin + 12, this.currentY + 10);
    
    this.currentY += narrativeHeight + 15;
    
    // Key Metrics Grid
    this.addSubsectionTitle('Key Performance Metrics');
    this.addPremiumKPIGrid();
  }

  generateNarrativeSummary() {
    const parts = [];
    
    // Emissions narrative
    if (this.data.totalEmissions > 0) {
      const maxScope = Math.max(this.data.scope1, this.data.scope2, this.data.scope3);
      const maxScopeName = maxScope === this.data.scope1 ? 'Scope 1' : maxScope === this.data.scope2 ? 'Scope 2' : 'Scope 3';
      const maxScopePct = ((maxScope / this.data.totalEmissions) * 100).toFixed(0);
      parts.push(`During the reporting period, ${maxScopeName} emissions represented the largest share of total emissions, accounting for ${maxScopePct}% of the organization's carbon footprint.`);
    }
    
    // Energy narrative
    if (this.data.renewablePct >= 50) {
      parts.push(`Renewable energy adoption remained high at ${this.data.renewablePct.toFixed(1)}%, demonstrating commitment to clean energy transition.`);
    } else if (this.data.renewablePct > 0) {
      parts.push(`Renewable energy currently represents ${this.data.renewablePct.toFixed(1)}% of total energy consumption.`);
    }
    
    // Water narrative
    if (this.data.waterRecycled > 0) {
      parts.push(`Water recycling performance demonstrated efficient resource utilization with ${this.formatNumber(this.data.waterRecycled)} KL recycled.`);
    }
    
    // Social narrative
    if (this.data.ltifr != null) {
      if (this.data.ltifr > 5) {
        parts.push(`Social indicators highlight opportunities for improving workplace safety, with LTIFR at ${this.data.ltifr.toFixed(2)}.`);
      } else {
        parts.push(`Safety performance remained strong with LTIFR at ${this.data.ltifr.toFixed(2)}.`);
      }
    }
    
    // Governance narrative with benchmark
    if (this.data.apDays != null && this.data.apDays > 200) {
      parts.push(`Accounts Payable Days (${Math.round(this.data.apDays)}) significantly exceed the commonly accepted ${BENCHMARKS.apDays.typical} day range and may impact supplier relationships.`);
    }
    
    if (parts.length === 0) {
      return 'ESG data collection is in progress across environmental, social, and governance dimensions. This report provides an initial baseline for sustainability performance tracking.';
    }
    
    return parts.join(' ');
  }

  addPremiumKPIGrid() {
    const kpis = [
      { 
        label: 'Total Emissions', 
        value: this.data.totalEmissions, 
        unit: this.getCO2Unit(),
        color: COLORS.emissions,
        subtitle: this.data.totalEmissions > 0 ? `Scope 1: ${this.data.scope1Pct?.toFixed(0) || 0}%` : null
      },
      { 
        label: 'Renewable Energy', 
        value: this.data.renewablePct, 
        unit: '%',
        color: COLORS.energy,
        subtitle: `Benchmark: ${BENCHMARKS.renewableEnergy.excellent}%+`
      },
      { 
        label: 'Water Recycled', 
        value: this.data.waterRecycled, 
        unit: 'KL',
        color: COLORS.water,
        subtitle: this.data.waterRecycleRate ? `Rate: ${this.data.waterRecycleRate.toFixed(0)}%` : null
      },
      { 
        label: 'Waste Recovery', 
        value: this.data.wasteRecovered, 
        unit: 'MT',
        color: COLORS.waste,
        subtitle: this.data.wasteRecoveryRate ? `Rate: ${this.data.wasteRecoveryRate.toFixed(0)}%` : null
      },
      { 
        label: 'Employees', 
        value: this.data.employees, 
        unit: '',
        color: COLORS.social,
        subtitle: this.data.diversityPct ? `Female: ${this.data.diversityPct.toFixed(0)}%` : null
      },
      { 
        label: 'LTIFR', 
        value: this.data.ltifr, 
        unit: '',
        color: this.data.ltifr > 5 ? COLORS.attention : COLORS.achievement,
        subtitle: `Benchmark: <${BENCHMARKS.ltifr.good}`
      },
    ];
    
    const cols = 3;
    const cardWidth = (PAGE.contentWidth - (cols - 1) * 8) / cols;
    const cardHeight = 35;
    let x = PAGE.margin;
    let y = this.currentY;
    
    kpis.forEach((kpi, index) => {
      if (index > 0 && index % cols === 0) {
        x = PAGE.margin;
        y += cardHeight + 8;
      }
      
      this.drawPremiumKPICard(x, y, cardWidth, cardHeight, kpi);
      x += cardWidth + 8;
    });
    
    this.currentY = y + cardHeight + 10;
  }

  drawPremiumKPICard(x, y, width, height, kpi) {
    // Card background
    this.doc.setFillColor('#FFFFFF');
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(0.3);
    this.doc.roundedRect(x, y, width, height, 2, 2, 'FD');
    
    // Top color bar
    this.doc.setFillColor(kpi.color);
    this.doc.rect(x, y, width, 3, 'F');
    
    // Label
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(7);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text(kpi.label.toUpperCase(), x + 5, y + 10);
    
    // Value
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(16);
    this.doc.setTextColor(kpi.color);
    const valueText = kpi.value != null ? this.formatNumber(kpi.value) : 'N/A';
    this.doc.text(valueText, x + 5, y + 21);
    
    // Unit
    if (kpi.unit && kpi.value != null) {
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(9);
      this.doc.setTextColor(COLORS.textMuted);
      const valueWidth = this.doc.getTextWidth(valueText);
      this.doc.text(kpi.unit, x + 5 + valueWidth + 2, y + 21);
    }
    
    // Subtitle
    if (kpi.subtitle) {
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(7);
      this.doc.setTextColor(COLORS.textMuted);
      this.doc.text(kpi.subtitle, x + 5, y + 29);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. ESG PERFORMANCE SCORE + MATURITY
  // ═══════════════════════════════════════════════════════════════════════════

  addESGScorePage() {
    this.addPageTitle('ESG Performance Score');
    
    const centerX = PAGE.width / 2;
    const maturity = this.getMaturityLevel(this.scores.overall);
    
    // Overall score section
    const scoreY = this.currentY + 25;
    const radius = 25;
    
    // Background circle
    this.doc.setFillColor(COLORS.backgroundAlt);
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(3);
    this.doc.circle(centerX, scoreY, radius, 'FD');
    
    // Score arc (filled based on score)
    this.doc.setFillColor(this.getScoreColor(this.scores.overall));
    this.doc.circle(centerX, scoreY, radius - 5, 'F');
    
    // White inner circle
    this.doc.setFillColor('#FFFFFF');
    this.doc.circle(centerX, scoreY, radius - 10, 'F');
    
    // Score text
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(24);
    this.doc.setTextColor(COLORS.text);
    this.doc.text(`${this.scores.overall}`, centerX, scoreY + 3, { align: 'center' });
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('/ 100', centerX, scoreY + 10, { align: 'center' });
    
    // Label
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.setTextColor(COLORS.text);
    this.doc.text('OVERALL ESG PERFORMANCE', centerX, scoreY + radius + 10, { align: 'center' });
    
    // Maturity indicator
    const maturityY = scoreY + radius + 20;
    this.doc.setFillColor(COLORS.backgroundAlt);
    this.doc.roundedRect(centerX - 50, maturityY, 100, 25, 3, 3, 'F');
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(10);
    this.doc.setTextColor(COLORS.text);
    this.doc.text('ESG Maturity', centerX, maturityY + 8, { align: 'center' });
    
    this.doc.setFontSize(12);
    this.doc.setTextColor(this.getScoreColor(this.scores.overall));
    this.doc.text(maturity.level, centerX, maturityY + 17, { align: 'center' });
    
    // Stars
    const starY = maturityY + 22;
    const starSpacing = 8;
    const startX = centerX - ((maturity.stars - 1) * starSpacing / 2);
    
    for (let i = 0; i < 5; i++) {
      const starX = startX + (i - 2) * starSpacing;
      if (i < maturity.stars) {
        this.doc.setFillColor(COLORS.energy);
      } else {
        this.doc.setFillColor(COLORS.borderLight);
      }
      this.doc.circle(starX, starY, 2.5, 'F');
    }
    
    this.currentY = maturityY + 35;
    
    // Pillar scores
    const pillars = [
      { label: 'Environmental', score: this.scores.environmental, color: COLORS.environmental },
      { label: 'Social', score: this.scores.social, color: COLORS.social },
      { label: 'Governance', score: this.scores.governance, color: COLORS.governance },
    ];
    
    const pillarWidth = (PAGE.contentWidth - 20) / 3;
    let pillarX = PAGE.margin;
    
    pillars.forEach((pillar) => {
      this.drawPillarScore(pillarX, this.currentY, pillarWidth, pillar);
      pillarX += pillarWidth + 10;
    });
    
    this.currentY += 70;
    
    // Score interpretation
    this.doc.setFillColor(COLORS.backgroundAlt);
    this.doc.roundedRect(PAGE.margin, this.currentY, PAGE.contentWidth, 35, 2, 2, 'F');
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.text);
    this.doc.text('Score Interpretation', PAGE.margin + 5, this.currentY + 10);
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('90-100: Leading  |  75-89: Advanced  |  60-74: Developing  |  40-59: Emerging  |  Below 40: Beginning', PAGE.margin + 5, this.currentY + 20);
    this.doc.text('Scores are calculated based on industry benchmarks, regulatory frameworks, and sustainability best practices.', PAGE.margin + 5, this.currentY + 28);
  }

  drawPillarScore(x, y, width, pillar) {
    const height = 55;
    
    // Card
    this.doc.setFillColor('#FFFFFF');
    this.doc.setDrawColor(pillar.color);
    this.doc.setLineWidth(1);
    this.doc.roundedRect(x, y, width, height, 3, 3, 'FD');
    
    // Top bar
    this.doc.setFillColor(pillar.color);
    this.doc.rect(x, y, width, 4, 'F');
    
    // Label
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    this.doc.setTextColor(pillar.color);
    this.doc.text(pillar.label, x + width/2, y + 15, { align: 'center' });
    
    // Score
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(22);
    this.doc.setTextColor(COLORS.text);
    this.doc.text(`${pillar.score}`, x + width/2, y + 38, { align: 'center' });
    
    // Rating
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor(this.getScoreColor(pillar.score));
    this.doc.text(this.getScoreRating(pillar.score), x + width/2, y + 48, { align: 'center' });
  }

  getScoreColor(score) {
    if (score >= 90) return COLORS.achievement;
    if (score >= 75) return COLORS.accent;
    if (score >= 60) return COLORS.energy;
    return COLORS.attention;
  }

  getScoreRating(score) {
    if (score >= 90) return 'Leading';
    if (score >= 75) return 'Advanced';
    if (score >= 60) return 'Developing';
    if (score >= 40) return 'Emerging';
    return 'Beginning';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. DATA COMPLETENESS
  // ═══════════════════════════════════════════════════════════════════════════

  addDataCompletenessPage() {
    this.addPageTitle('Data Completeness');
    
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Understanding where missing data may affect ESG scoring and analysis.', PAGE.margin, this.currentY);
    this.currentY += 12;
    
    // Overall completeness
    const centerX = PAGE.width / 2;
    const overallY = this.currentY + 20;
    
    // Progress circle
    this.doc.setFillColor(COLORS.backgroundAlt);
    this.doc.circle(centerX, overallY, 20, 'F');
    this.doc.setFillColor(this.getCompletenessColor(this.completeness.overall));
    this.doc.circle(centerX, overallY, 16, 'F');
    this.doc.setFillColor('#FFFFFF');
    this.doc.circle(centerX, overallY, 10, 'F');
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(12);
    this.doc.setTextColor(COLORS.text);
    this.doc.text(`${this.completeness.overall}%`, centerX, overallY + 3, { align: 'center' });
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(10);
    this.doc.text('Overall Reporting Completeness', centerX, overallY + 30, { align: 'center' });
    
    this.currentY = overallY + 45;
    
    // Pillar completeness bars
    const pillars = [
      { label: 'Environmental', value: this.completeness.environmental, color: COLORS.environmental },
      { label: 'Social', value: this.completeness.social, color: COLORS.social },
      { label: 'Governance', value: this.completeness.governance, color: COLORS.governance },
    ];
    
    pillars.forEach((pillar) => {
      this.drawCompletenessBar(pillar);
      this.currentY += 25;
    });
    
    this.currentY += 10;
    
    // Missing data note
    this.doc.setFillColor('#FEF3C7');
    this.doc.roundedRect(PAGE.margin, this.currentY, PAGE.contentWidth, 30, 2, 2, 'F');
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.attention);
    this.doc.text('Note on Data Completeness', PAGE.margin + 5, this.currentY + 10);
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.text);
    this.doc.text('Missing data fields may affect the accuracy of ESG scores and insights. We recommend', PAGE.margin + 5, this.currentY + 18);
    this.doc.text('prioritizing data collection for incomplete metrics to improve reporting quality.', PAGE.margin + 5, this.currentY + 24);
  }

  drawCompletenessBar(pillar) {
    const barWidth = PAGE.contentWidth - 60;
    const barHeight = 12;
    const x = PAGE.margin;
    
    // Label
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    this.doc.setTextColor(pillar.color);
    this.doc.text(pillar.label, x, this.currentY + 5);
    
    // Background bar
    this.doc.setFillColor(COLORS.borderLight);
    this.doc.roundedRect(x + 50, this.currentY, barWidth, barHeight, 2, 2, 'F');
    
    // Progress bar
    const progressWidth = (pillar.value / 100) * barWidth;
    if (progressWidth > 0) {
      this.doc.setFillColor(pillar.color);
      this.doc.roundedRect(x + 50, this.currentY, progressWidth, barHeight, 2, 2, 'F');
    }
    
    // Percentage
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(10);
    this.doc.setTextColor(COLORS.text);
    this.doc.text(`${pillar.value}%`, x + 50 + barWidth + 5, this.currentY + 8);
  }

  getCompletenessColor(value) {
    if (value >= 90) return COLORS.achievement;
    if (value >= 70) return COLORS.accent;
    if (value >= 50) return COLORS.energy;
    return COLORS.attention;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. KEY ACHIEVEMENTS (5-8 items)
  // ═══════════════════════════════════════════════════════════════════════════

  addAchievementsPage() {
    this.addPageTitle('Key Achievements');
    
    const achievements = this.generateAchievements();
    
    achievements.forEach((achievement, index) => {
      this.checkPageBreak(20);
      
      const y = this.currentY;
      
      // Achievement box
      this.doc.setFillColor(index % 2 === 0 ? '#F0FDF4' : '#ECFDF5');
      this.doc.setDrawColor(COLORS.achievement);
      this.doc.setLineWidth(0.3);
      this.doc.roundedRect(PAGE.margin, y, PAGE.contentWidth, 18, 2, 2, 'FD');
      
      // Check icon circle
      this.doc.setFillColor(COLORS.achievement);
      this.doc.circle(PAGE.margin + 10, y + 9, 4, 'F');
      
      // Checkmark (using simple shape instead of Unicode)
      this.doc.setDrawColor('#FFFFFF');
      this.doc.setLineWidth(1);
      this.doc.line(PAGE.margin + 8, y + 9, PAGE.margin + 10, y + 11);
      this.doc.line(PAGE.margin + 10, y + 11, PAGE.margin + 13, y + 7);
      
      // Text
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(10);
      this.doc.setTextColor(COLORS.text);
      this.doc.text(achievement, PAGE.margin + 20, y + 11);
      
      this.currentY += 22;
    });
  }

  generateAchievements() {
    const achievements = [];
    
    // Energy achievements
    if (this.data.renewablePct >= 80) {
      achievements.push(`Renewable energy exceeds 80% target (${this.data.renewablePct.toFixed(1)}%)`);
    } else if (this.data.renewablePct >= 50) {
      achievements.push(`Renewable energy adoption above 50% (${this.data.renewablePct.toFixed(1)}%)`);
    } else if (this.data.renewablePct > 0) {
      achievements.push(`Renewable energy tracking established (${this.data.renewablePct.toFixed(1)}%)`);
    }
    
    // Emissions achievements
    if (this.data.scope2 < this.data.scope1 && this.data.scope2 > 0) {
      achievements.push('Scope 2 emissions below Scope 1 through clean energy');
    }
    if (this.data.totalEmissions > 0) {
      achievements.push('Complete GHG emissions inventory maintained');
    }
    
    // Water achievements
    if (this.data.waterRecycleRate >= 50) {
      achievements.push(`High water recycling rate achieved (${this.data.waterRecycleRate.toFixed(0)}%)`);
    } else if (this.data.waterRecycled > 0) {
      achievements.push('Water recycling program implemented');
    }
    
    // Waste achievements
    if (this.data.wasteRecovered > this.data.wasteDisposed) {
      achievements.push('Waste recovery exceeds disposal volume');
    }
    if (this.data.wasteRecoveryRate >= 70) {
      achievements.push(`Strong waste recovery performance (${this.data.wasteRecoveryRate.toFixed(0)}%)`);
    } else if (this.data.wasteRecoveryRate >= 50) {
      achievements.push(`Waste recovery above 50% (${this.data.wasteRecoveryRate.toFixed(0)}%)`);
    }
    
    // Social achievements
    if (this.data.turnover != null && this.data.turnover < 5) {
      achievements.push(`Exceptional employee retention (${this.data.turnover.toFixed(1)}% turnover)`);
    } else if (this.data.turnover != null && this.data.turnover < 10) {
      achievements.push(`Low employee turnover maintained (${this.data.turnover.toFixed(1)}%)`);
    }
    
    if (this.data.ltifr != null && this.data.ltifr < 1) {
      achievements.push(`Excellent safety record (LTIFR: ${this.data.ltifr.toFixed(2)})`);
    } else if (this.data.ltifr != null && this.data.ltifr < 2) {
      achievements.push(`Strong safety performance (LTIFR: ${this.data.ltifr.toFixed(2)})`);
    }
    
    if (this.data.diversityPct != null && this.data.diversityPct >= 40) {
      achievements.push(`Gender diversity target achieved (${this.data.diversityPct.toFixed(0)}% female)`);
    }
    
    // Governance achievements
    if (this.data.apDays != null && this.data.apDays < 60) {
      achievements.push(`Excellent payment cycle management (${Math.round(this.data.apDays)} days)`);
    } else if (this.data.apDays != null && this.data.apDays < 90) {
      achievements.push(`Efficient supplier payment cycles (${Math.round(this.data.apDays)} days)`);
    }
    
    // Reporting achievements
    if (this.completeness.overall >= 90) {
      achievements.push('Complete ESG data reporting coverage');
    } else if (this.completeness.overall >= 70) {
      achievements.push('Comprehensive ESG data collection established');
    }
    
    // Default achievements if none generated
    if (achievements.length < 5) {
      achievements.push('ESG monitoring and reporting framework established');
      achievements.push('Sustainability data collection processes implemented');
      achievements.push('Baseline ESG metrics established for tracking');
    }
    
    return achievements.slice(0, 8);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION TITLE PAGE (Environmental/Social/Governance)
  // ═══════════════════════════════════════════════════════════════════════════

  addSectionTitlePage(section) {
    const configs = {
      environmental: {
        title: 'ENVIRONMENTAL',
        subtitle: 'Emissions, Energy, Water & Waste Performance',
        color: COLORS.environmental,
        icon: 'E',
        summary: this.generateEnvironmentalSummary(),
        kpis: [
          { label: 'Total Emissions', value: this.formatNumber(this.data.totalEmissions), unit: this.getCO2Unit() },
          { label: 'Renewable Energy', value: `${this.data.renewablePct.toFixed(1)}%`, unit: '' },
          { label: 'Water Recycled', value: this.formatNumber(this.data.waterRecycled), unit: 'KL' },
          { label: 'Waste Recovery', value: this.data.wasteRecoveryRate ? `${this.data.wasteRecoveryRate.toFixed(0)}%` : 'N/A', unit: '' },
        ],
      },
      social: {
        title: 'SOCIAL',
        subtitle: 'Workforce, Safety & Community Performance',
        color: COLORS.social,
        icon: 'S',
        summary: this.generateSocialSummary(),
        kpis: [
          { label: 'Total Employees', value: this.formatNumber(this.data.employees), unit: '' },
          { label: 'LTIFR', value: this.data.ltifr != null ? this.data.ltifr.toFixed(2) : 'N/A', unit: '' },
          { label: 'Turnover Rate', value: this.data.turnover != null ? `${this.data.turnover.toFixed(1)}%` : 'N/A', unit: '' },
          { label: 'Female Workforce', value: this.data.diversityPct != null ? `${this.data.diversityPct.toFixed(0)}%` : 'N/A', unit: '' },
        ],
      },
      governance: {
        title: 'GOVERNANCE',
        subtitle: 'Ethics, Compliance & Financial Performance',
        color: COLORS.governance,
        icon: 'G',
        summary: this.generateGovernanceSummary(),
        kpis: [
          { label: 'AP Days', value: this.data.apDays != null ? `${Math.round(this.data.apDays)}` : 'N/A', unit: 'days' },
          { label: 'Score', value: `${this.scores.governance}`, unit: '/100' },
          { label: 'Rating', value: this.getScoreRating(this.scores.governance), unit: '' },
          { label: 'Completeness', value: `${this.completeness.governance}%`, unit: '' },
        ],
      },
    };
    
    const config = configs[section];
    const centerX = PAGE.width / 2;
    
    // Background pattern
    this.doc.setFillColor(config.color);
    this.doc.setGState(new this.doc.GState({ opacity: 0.05 }));
    this.doc.rect(0, 0, PAGE.width, PAGE.height, 'F');
    this.doc.setGState(new this.doc.GState({ opacity: 1 }));
    
    // Top banner
    this.doc.setFillColor(config.color);
    this.doc.rect(0, 40, PAGE.width, 60, 'F');
    
    // Icon circle
    this.doc.setFillColor('#FFFFFF');
    this.doc.circle(centerX, 70, 20, 'F');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(24);
    this.doc.setTextColor(config.color);
    this.doc.text(config.icon, centerX, 77, { align: 'center' });
    
    // Title
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(24);
    this.doc.setTextColor('#FFFFFF');
    this.doc.text(config.title, centerX, 55, { align: 'center' });
    
    // Subtitle
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    this.doc.text(config.subtitle, centerX, 95, { align: 'center' });
    
    // Summary
    this.currentY = 115;
    this.doc.setFillColor(COLORS.backgroundAlt);
    this.doc.roundedRect(PAGE.margin, this.currentY, PAGE.contentWidth, 35, 3, 3, 'F');
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.text);
    const summaryLines = this.doc.splitTextToSize(config.summary, PAGE.contentWidth - 20);
    this.doc.text(summaryLines, PAGE.margin + 10, this.currentY + 12);
    
    // KPI Cards
    this.currentY = 165;
    const cardWidth = (PAGE.contentWidth - 15) / 2;
    const cardHeight = 35;
    
    config.kpis.forEach((kpi, index) => {
      const row = Math.floor(index / 2);
      const col = index % 2;
      const x = PAGE.margin + col * (cardWidth + 15);
      const y = this.currentY + row * (cardHeight + 10);
      
      this.doc.setFillColor('#FFFFFF');
      this.doc.setDrawColor(config.color);
      this.doc.setLineWidth(0.5);
      this.doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');
      
      // Top accent
      this.doc.setFillColor(config.color);
      this.doc.rect(x, y, cardWidth, 3, 'F');
      
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(7);
      this.doc.setTextColor(COLORS.textMuted);
      this.doc.text(kpi.label.toUpperCase(), x + 5, y + 12);
      
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(16);
      this.doc.setTextColor(config.color);
      this.doc.text(kpi.value, x + 5, y + 25);
      
      if (kpi.unit) {
        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(9);
        this.doc.setTextColor(COLORS.textMuted);
        const valueWidth = this.doc.getTextWidth(kpi.value);
        this.doc.text(kpi.unit, x + 5 + valueWidth + 2, y + 25);
      }
    });
  }

  generateEnvironmentalSummary() {
    if (this.data.totalEmissions === 0 && this.data.totalEnergy === 0) {
      return 'Environmental data collection is in progress. This section will provide detailed analysis of emissions, energy consumption, water usage, and waste management once data is available.';
    }
    
    const parts = [];
    if (this.data.renewablePct >= 80) {
      parts.push(`Strong renewable energy performance at ${this.data.renewablePct.toFixed(1)}%.`);
    }
    if (this.data.wasteRecovered > this.data.wasteDisposed) {
      parts.push('Waste recovery exceeds disposal, demonstrating circular economy practices.');
    }
    if (this.data.totalEmissions > 0) {
      parts.push(`Total GHG emissions of ${this.formatNumber(this.data.totalEmissions)} ${this.getCO2Unit()} tracked across all scopes.`);
    }
    
    return parts.length > 0 ? parts.join(' ') : 'Environmental metrics are being tracked across emissions, energy, water, and waste dimensions.';
  }

  generateSocialSummary() {
    const parts = [];
    if (this.data.employees > 0) {
      parts.push(`Workforce of ${this.formatNumber(this.data.employees)} employees.`);
    }
    if (this.data.ltifr != null && this.data.ltifr < 2) {
      parts.push('Strong safety performance maintained.');
    } else if (this.data.ltifr != null && this.data.ltifr > 5) {
      parts.push('Safety performance requires focused attention.');
    }
    if (this.data.turnover != null && this.data.turnover < 10) {
      parts.push('Low employee turnover indicates positive workplace culture.');
    }
    
    return parts.length > 0 ? parts.join(' ') : 'Social metrics tracking workforce, safety, and community engagement across operations.';
  }

  generateGovernanceSummary() {
    if (this.data.apDays != null) {
      if (this.data.apDays > 200) {
        return `Accounts Payable Days at ${Math.round(this.data.apDays)} days significantly exceeds the industry benchmark of ${BENCHMARKS.apDays.typical} days. This may impact supplier relationships and warrants process review.`;
      } else if (this.data.apDays < 60) {
        return `Strong financial governance with efficient payment cycles of ${Math.round(this.data.apDays)} days, well within the industry benchmark of ${BENCHMARKS.apDays.typical} days.`;
      }
      return `Accounts Payable Days at ${Math.round(this.data.apDays)} days. Industry benchmark is ${BENCHMARKS.apDays.typical} days.`;
    }
    return 'Governance metrics including financial compliance and ethical business practices are being tracked.';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EMISSIONS SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addEmissionsSection() {
    this.addPageTitle('Emissions', COLORS.emissions);
    
    // Chart (larger)
    await this.addChartFromRef('ghg-emission-trend', 'GHG Emission Trend', 90);
    
    // Chart interpretation with benchmarks
    this.addChartInterpretation(this.generateEmissionsInterpretation());
    
    this.currentY += 8;
    
    // Summary table with percentages
    this.addSubsectionTitle('Scope Breakdown');
    
    const tableData = [
      ['Scope', `Emissions (${this.getCO2Unit()})`, 'Contribution'],
      ['Scope 1 (Direct)', this.formatNumber(this.data.scope1), this.data.totalEmissions > 0 ? `${this.data.scope1Pct.toFixed(1)}%` : '-'],
      ['Scope 2 (Energy)', this.formatNumber(this.data.scope2), this.data.totalEmissions > 0 ? `${this.data.scope2Pct.toFixed(1)}%` : '-'],
      ['Scope 3 (Value Chain)', this.formatNumber(this.data.scope3), this.data.totalEmissions > 0 ? `${this.data.scope3Pct.toFixed(1)}%` : '-'],
      ['Total', this.formatNumber(this.data.totalEmissions), '100%'],
    ];
    
    this.addStyledTable(tableData, [70, 55, 55], COLORS.emissions);
  }

  generateEmissionsInterpretation() {
    if (this.data.totalEmissions === 0) {
      return 'Emissions data is being collected for this reporting period.';
    }
    
    const maxScope = Math.max(this.data.scope1, this.data.scope2, this.data.scope3);
    const maxScopeName = maxScope === this.data.scope1 ? 'Scope 1 (direct operations)' : maxScope === this.data.scope2 ? 'Scope 2 (purchased energy)' : 'Scope 3 (value chain)';
    const maxPct = ((maxScope / this.data.totalEmissions) * 100).toFixed(0);
    
    let interpretation = `${maxScopeName} emissions represent ${maxPct}% of the total ${this.formatNumber(this.data.totalEmissions)} ${this.getCO2Unit()} carbon footprint, making it the primary focus area for decarbonization initiatives.`;
    
    if (this.data.scope2 > 0 && this.data.renewablePct >= 80) {
      interpretation += ' High renewable energy adoption has helped minimize Scope 2 emissions.';
    }
    
    return interpretation;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENERGY SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addEnergySection() {
    this.addPageTitle('Energy', COLORS.energy);
    
    await this.addChartFromRef('energy-mix-chart', 'Energy Mix', 90);
    
    this.addChartInterpretation(this.generateEnergyInterpretation());
    
    this.currentY += 8;
    
    // Summary
    this.addSubsectionTitle('Energy Summary');
    
    const energyIntensity = this.productionQty ? this.data.totalEnergy / this.productionQty : null;
    
    const tableData = [
      ['Metric', 'Value', 'Benchmark'],
      ['Total Consumption', `${this.formatNumber(this.data.totalEnergy)} MWh`, '-'],
      ['Renewable Energy', `${this.data.renewablePct.toFixed(1)}%`, `Target: ${BENCHMARKS.renewableEnergy.excellent}%+`],
      ['Non-Renewable', `${(100 - this.data.renewablePct).toFixed(1)}%`, '-'],
      ['Energy Intensity', energyIntensity ? `${energyIntensity.toFixed(2)} MWh/${this.productionUnit}` : 'N/A', '-'],
    ];
    
    this.addStyledTable(tableData, [60, 50, 60], COLORS.energy);
  }

  generateEnergyInterpretation() {
    if (this.data.renewablePct >= BENCHMARKS.renewableEnergy.excellent) {
      return `Renewable energy at ${this.data.renewablePct.toFixed(1)}% exceeds the ${BENCHMARKS.renewableEnergy.excellent}% industry benchmark, demonstrating leadership in clean energy transition. Future emission reductions will likely require operational efficiency improvements.`;
    } else if (this.data.renewablePct >= BENCHMARKS.renewableEnergy.good) {
      return `Renewable energy at ${this.data.renewablePct.toFixed(1)}% exceeds ${BENCHMARKS.renewableEnergy.good}% but remains below the ${BENCHMARKS.renewableEnergy.excellent}% leadership benchmark. Continued investment in clean energy sources is recommended.`;
    } else if (this.data.totalEnergy > 0) {
      return `Renewable energy at ${this.data.renewablePct.toFixed(1)}% is below the ${BENCHMARKS.renewableEnergy.good}% benchmark. Significant opportunity exists to increase clean energy adoption and reduce Scope 2 emissions.`;
    }
    return 'Energy consumption data is being collected for comprehensive analysis.';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WATER SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addWaterSection() {
    this.addPageTitle('Water', COLORS.water);
    
    await this.addChartFromRef('water-flow-chart', 'Water Flow', 90);
    
    this.addChartInterpretation(this.generateWaterInterpretation());
    
    this.currentY += 8;
    
    // Summary
    this.addSubsectionTitle('Water Summary');
    
    const tableData = [
      ['Metric', 'Value (KL)', 'Status'],
      ['Withdrawn', this.data.waterWithdrawn > 0 ? this.formatNumber(this.data.waterWithdrawn) : 'Not reported', ''],
      ['Consumed', this.data.waterConsumed > 0 ? this.formatNumber(this.data.waterConsumed) : 'Not reported', ''],
      ['Discharged', this.data.waterDischarged > 0 ? this.formatNumber(this.data.waterDischarged) : 'Not reported', ''],
      ['Recycled', this.data.waterRecycled > 0 ? this.formatNumber(this.data.waterRecycled) : 'Not reported', ''],
      ['Recycle Rate', this.data.waterRecycleRate ? `${this.data.waterRecycleRate.toFixed(1)}%` : 'Insufficient data', this.data.waterRecycleRate >= BENCHMARKS.waterRecycle.excellent ? 'Strong' : ''],
    ];
    
    this.addStyledTable(tableData, [55, 50, 65], COLORS.water);
  }

  generateWaterInterpretation() {
    if (this.data.waterRecycleRate >= BENCHMARKS.waterRecycle.excellent) {
      return `Water recycling rate of ${this.data.waterRecycleRate.toFixed(0)}% exceeds the ${BENCHMARKS.waterRecycle.excellent}% benchmark, indicating effective water stewardship and commitment to resource conservation.`;
    } else if (this.data.waterRecycleRate >= BENCHMARKS.waterRecycle.good) {
      return `Water recycling rate at ${this.data.waterRecycleRate.toFixed(0)}% meets the ${BENCHMARKS.waterRecycle.good}% benchmark. Further investment in water treatment could help reach the ${BENCHMARKS.waterRecycle.excellent}% leadership target.`;
    } else if (this.data.waterRecycled > 0 && this.data.waterWithdrawn === 0) {
      return `Water recycling data (${this.formatNumber(this.data.waterRecycled)} KL) is available. Complete water withdrawal data is needed to calculate the recycling rate accurately.`;
    } else if (this.data.waterRecycleRate > 0) {
      return `Water recycling rate at ${this.data.waterRecycleRate.toFixed(0)}% is below the ${BENCHMARKS.waterRecycle.good}% benchmark. Expanding water treatment and reuse programs is recommended.`;
    }
    return 'Complete water flow data is being collected to enable comprehensive water management analysis.';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WASTE SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addWasteSection() {
    this.addPageTitle('Waste', COLORS.waste);
    
    await this.addChartFromRef('waste-management-chart', 'Waste Management', 90);
    
    this.addChartInterpretation(this.generateWasteInterpretation());
    
    this.currentY += 8;
    
    // Summary
    this.addSubsectionTitle('Waste Summary');
    
    const tableData = [
      ['Metric', 'Value (MT)', 'Percentage'],
      ['Generated', this.data.wasteGenerated > 0 ? this.formatNumber(this.data.wasteGenerated) : 'Not reported', '100%'],
      ['Recovered', this.data.wasteRecovered > 0 ? this.formatNumber(this.data.wasteRecovered) : 'Not reported', this.data.wasteRecoveryRate ? `${this.data.wasteRecoveryRate.toFixed(1)}%` : '-'],
      ['Disposed', this.data.wasteDisposed > 0 ? this.formatNumber(this.data.wasteDisposed) : 'Not reported', this.data.wasteGenerated > 0 ? `${((this.data.wasteDisposed / this.data.wasteGenerated) * 100).toFixed(1)}%` : '-'],
    ];
    
    this.addStyledTable(tableData, [55, 55, 60], COLORS.waste);
  }

  generateWasteInterpretation() {
    if (this.data.wasteRecovered > this.data.wasteDisposed) {
      return `Waste recovery (${this.formatNumber(this.data.wasteRecovered)} MT) exceeds disposal (${this.formatNumber(this.data.wasteDisposed)} MT), demonstrating effective circular economy practices and commitment to waste diversion.`;
    } else if (this.data.wasteRecoveryRate >= BENCHMARKS.wasteRecovery.excellent) {
      return `Waste recovery rate of ${this.data.wasteRecoveryRate.toFixed(0)}% exceeds the ${BENCHMARKS.wasteRecovery.excellent}% industry benchmark, indicating strong waste management practices.`;
    } else if (this.data.wasteRecoveryRate >= BENCHMARKS.wasteRecovery.good) {
      return `Waste recovery rate at ${this.data.wasteRecoveryRate.toFixed(0)}% meets the ${BENCHMARKS.wasteRecovery.good}% benchmark. Continued focus on recycling can help reach the ${BENCHMARKS.wasteRecovery.excellent}% target.`;
    } else if (this.data.wasteGenerated > 0) {
      return `Waste recovery rate at ${this.data.wasteRecoveryRate?.toFixed(0) || 0}% is below the ${BENCHMARKS.wasteRecovery.good}% benchmark. Expanding recycling, composting, and recovery programs is recommended.`;
    }
    return 'Waste management data is being collected for comprehensive analysis.';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SOCIAL SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addSocialSection() {
    this.addPageTitle('Workforce & Safety', COLORS.social);
    
    // Workforce KPIs
    this.addSubsectionTitle('Workforce Overview');
    
    const workforceData = [
      ['Metric', 'Value', 'Benchmark'],
      ['Total Employees', this.data.employees > 0 ? this.formatNumber(this.data.employees) : 'Not reported', '-'],
      ['Female Workforce', this.data.diversityPct != null ? `${this.data.diversityPct.toFixed(1)}%` : 'Not reported', `Target: ${BENCHMARKS.diversity.excellent}%+`],
      ['Employee Turnover', this.data.turnover != null ? `${this.data.turnover.toFixed(1)}%` : 'Not reported', `Target: <${BENCHMARKS.turnover.good}%`],
      ['LTIFR', this.data.ltifr != null ? this.data.ltifr.toFixed(2) : 'Not reported', `Target: <${BENCHMARKS.ltifr.good}`],
    ];
    
    this.addStyledTable(workforceData, [60, 50, 60], COLORS.social);
    
    this.currentY += 8;
    
    // LTIFR Trend
    await this.addChartFromRef('ltifr-trend-chart', 'LTIFR Trend', 70);
    
    this.addChartInterpretation(this.generateSocialInterpretation());
    
    // Incidents
    this.currentY += 5;
    this.addSubsectionTitle('Safety & Compliance');
    
    const incidents = this.analytics?.incidents || [];
    const totalIncidents = incidents.reduce((sum, row) => ({
      healthSafety: (sum.healthSafety || 0) + (row.healthSafety || 0),
      dataBreaches: (sum.dataBreaches || 0) + (row.dataBreaches || 0),
      violations: (sum.violations || 0) + (row.violations || 0),
    }), {});
    
    const incidentsData = [
      ['Incident Type', 'Count', 'Status'],
      ['Health & Safety', this.formatNumber(totalIncidents.healthSafety || 0), totalIncidents.healthSafety > 0 ? 'Monitor' : 'Clear'],
      ['Data Breaches', this.formatNumber(totalIncidents.dataBreaches || 0), totalIncidents.dataBreaches > 0 ? 'Review' : 'Clear'],
      ['Compliance Violations', this.formatNumber(totalIncidents.violations || 0), totalIncidents.violations > 0 ? 'Action needed' : 'Clear'],
    ];
    
    this.addStyledTable(incidentsData, [60, 50, 60], COLORS.social);
  }

  generateSocialInterpretation() {
    const parts = [];
    
    if (this.data.turnover != null) {
      if (this.data.turnover < BENCHMARKS.turnover.excellent) {
        parts.push(`Employee turnover at ${this.data.turnover.toFixed(1)}% is well below the ${BENCHMARKS.turnover.good}% benchmark, indicating excellent workforce retention.`);
      } else if (this.data.turnover < BENCHMARKS.turnover.good) {
        parts.push(`Employee turnover at ${this.data.turnover.toFixed(1)}% meets the <${BENCHMARKS.turnover.good}% benchmark.`);
      }
    }
    
    if (this.data.ltifr != null) {
      if (this.data.ltifr < BENCHMARKS.ltifr.excellent) {
        parts.push(`LTIFR of ${this.data.ltifr.toFixed(2)} demonstrates industry-leading safety performance.`);
      } else if (this.data.ltifr > BENCHMARKS.ltifr.fair) {
        parts.push(`LTIFR of ${this.data.ltifr.toFixed(2)} exceeds the ${BENCHMARKS.ltifr.fair} benchmark and indicates significant opportunity for safety program improvements.`);
      }
    }
    
    if (parts.length === 0) {
      return 'Social metrics are being tracked across workforce and safety dimensions.';
    }
    
    return parts.join(' ');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GOVERNANCE SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addGovernanceSection() {
    this.addPageTitle('Financial Governance', COLORS.governance);
    
    if (this.data.apDays != null) {
      await this.addChartFromRef('ap-days-chart', 'Accounts Payable Days Trend', 90);
      
      this.addChartInterpretation(this.generateGovernanceInterpretation());
      
      this.currentY += 8;
      
      this.addSubsectionTitle('Governance Metrics');
      
      const status = this.data.apDays < 60 ? 'Excellent' : this.data.apDays < 90 ? 'Good' : this.data.apDays < 120 ? 'Fair' : 'Review needed';
      
      const tableData = [
        ['Metric', 'Value', 'Benchmark'],
        ['Accounts Payable Days', `${Math.round(this.data.apDays)} days`, `${BENCHMARKS.apDays.typical} days`],
        ['Performance Rating', status, '-'],
      ];
      
      this.addStyledTable(tableData, [70, 50, 50], COLORS.governance);
    } else {
      this.doc.setFillColor(COLORS.backgroundAlt);
      this.doc.roundedRect(PAGE.margin, this.currentY, PAGE.contentWidth, 30, 2, 2, 'F');
      
      this.doc.setFont('helvetica', 'italic');
      this.doc.setFontSize(10);
      this.doc.setTextColor(COLORS.textMuted);
      this.doc.text('Governance data is not available for the selected reporting period.', PAGE.margin + 10, this.currentY + 18);
      
      this.currentY += 40;
    }
  }

  generateGovernanceInterpretation() {
    if (this.data.apDays > 300) {
      return `Accounts Payable Days at ${Math.round(this.data.apDays)} days significantly exceeds the commonly accepted ${BENCHMARKS.apDays.typical} day range. This may impact supplier relationships, credit terms, and supply chain stability. A comprehensive review of payment processes is recommended.`;
    } else if (this.data.apDays > 120) {
      return `Accounts Payable Days at ${Math.round(this.data.apDays)} days exceeds the ${BENCHMARKS.apDays.typical} day benchmark. Consider reviewing payment terms and processes to optimize working capital while maintaining supplier relationships.`;
    } else if (this.data.apDays > 90) {
      return `Accounts Payable Days at ${Math.round(this.data.apDays)} days is slightly above the typical ${BENCHMARKS.apDays.typical} day range. Payment processes are generally healthy but monitoring is recommended.`;
    } else if (this.data.apDays > 0) {
      return `Accounts Payable Days at ${Math.round(this.data.apDays)} days is within the optimal ${BENCHMARKS.apDays.typical} day range, indicating efficient payment cycle management and healthy supplier relationships.`;
    }
    return 'Governance metrics are being tracked.';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPROVEMENT OPPORTUNITIES (Priority Table)
  // ═══════════════════════════════════════════════════════════════════════════

  addImprovementOpportunities() {
    this.addPageTitle('Improvement Opportunities');
    
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Prioritized actions to improve ESG performance.', PAGE.margin, this.currentY);
    this.currentY += 10;
    
    const opportunities = this.generatePrioritizedOpportunities();
    
    // Table header
    const colWidths = [25, 95, 30, 30];
    const tableX = PAGE.margin;
    let tableY = this.currentY;
    
    // Header
    this.doc.setFillColor(COLORS.primary);
    this.doc.rect(tableX, tableY, PAGE.contentWidth, 10, 'F');
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(8);
    this.doc.setTextColor('#FFFFFF');
    this.doc.text('Priority', tableX + 3, tableY + 7);
    this.doc.text('Action', tableX + colWidths[0] + 3, tableY + 7);
    this.doc.text('Impact', tableX + colWidths[0] + colWidths[1] + 3, tableY + 7);
    this.doc.text('Timeline', tableX + colWidths[0] + colWidths[1] + colWidths[2] + 3, tableY + 7);
    
    tableY += 10;
    
    opportunities.forEach((opp, index) => {
      const rowHeight = 12;
      
      // Row background
      this.doc.setFillColor(index % 2 === 0 ? COLORS.backgroundAlt : '#FFFFFF');
      this.doc.rect(tableX, tableY, PAGE.contentWidth, rowHeight, 'F');
      
      // Priority badge
      const priorityColors = {
        'High': COLORS.priorityHigh,
        'Medium': COLORS.priorityMedium,
        'Low': COLORS.priorityLow,
      };
      
      this.doc.setFillColor(priorityColors[opp.priority] || COLORS.textMuted);
      this.doc.roundedRect(tableX + 3, tableY + 2, 18, 8, 2, 2, 'F');
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(6);
      this.doc.setTextColor('#FFFFFF');
      this.doc.text(opp.priority, tableX + 12, tableY + 7, { align: 'center' });
      
      // Action text
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8);
      this.doc.setTextColor(COLORS.text);
      const actionLines = this.doc.splitTextToSize(opp.action, colWidths[1] - 5);
      this.doc.text(actionLines[0], tableX + colWidths[0] + 3, tableY + 8);
      
      // Impact
      this.doc.setTextColor(priorityColors[opp.impact] || COLORS.text);
      this.doc.text(opp.impact, tableX + colWidths[0] + colWidths[1] + 3, tableY + 8);
      
      // Timeline
      this.doc.setTextColor(COLORS.textMuted);
      this.doc.text(opp.timeline, tableX + colWidths[0] + colWidths[1] + colWidths[2] + 3, tableY + 8);
      
      tableY += rowHeight;
    });
    
    // Table border
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(0.3);
    this.doc.rect(tableX, this.currentY, PAGE.contentWidth, tableY - this.currentY);
    
    this.currentY = tableY + 10;
  }

  generatePrioritizedOpportunities() {
    const opportunities = [];
    
    // High priority
    if (this.data.ltifr > BENCHMARKS.ltifr.fair) {
      opportunities.push({
        priority: 'High',
        action: 'Strengthen workplace safety programs to reduce LTIFR',
        impact: 'High',
        timeline: 'Immediate',
      });
    }
    
    if (this.data.apDays > 200) {
      opportunities.push({
        priority: 'High',
        action: 'Review payment processes to reduce AP Days',
        impact: 'High',
        timeline: '30 days',
      });
    }
    
    if (this.data.scope1Pct > 50) {
      opportunities.push({
        priority: 'High',
        action: 'Implement Scope 1 emissions reduction initiatives',
        impact: 'High',
        timeline: '90 days',
      });
    }
    
    // Medium priority
    if (this.data.renewablePct < BENCHMARKS.renewableEnergy.excellent) {
      opportunities.push({
        priority: 'Medium',
        action: `Increase renewable energy to ${BENCHMARKS.renewableEnergy.excellent}%+ target`,
        impact: 'Medium',
        timeline: '6 months',
      });
    }
    
    if (this.data.wasteRecoveryRate < BENCHMARKS.wasteRecovery.excellent) {
      opportunities.push({
        priority: 'Medium',
        action: 'Enhance waste recovery and recycling programs',
        impact: 'Medium',
        timeline: '6 months',
      });
    }
    
    if (this.data.waterRecycleRate < BENCHMARKS.waterRecycle.excellent) {
      opportunities.push({
        priority: 'Medium',
        action: 'Expand water recycling infrastructure',
        impact: 'Medium',
        timeline: '12 months',
      });
    }
    
    // Low priority
    if (this.data.diversityPct != null && this.data.diversityPct < BENCHMARKS.diversity.good) {
      opportunities.push({
        priority: 'Low',
        action: 'Enhance diversity and inclusion programs',
        impact: 'Medium',
        timeline: 'Ongoing',
      });
    }
    
    if (this.completeness.overall < 90) {
      opportunities.push({
        priority: 'Low',
        action: 'Improve ESG data collection completeness',
        impact: 'Low',
        timeline: 'Ongoing',
      });
    }
    
    // Default if no opportunities
    if (opportunities.length === 0) {
      opportunities.push(
        { priority: 'Medium', action: 'Continue current sustainability initiatives', impact: 'Medium', timeline: 'Ongoing' },
        { priority: 'Medium', action: 'Set science-based emissions reduction targets', impact: 'High', timeline: '6 months' },
        { priority: 'Low', action: 'Expand stakeholder ESG reporting', impact: 'Medium', timeline: '12 months' },
      );
    }
    
    return opportunities.slice(0, 8);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // KEY INSIGHTS (Visual Cards)
  // ═══════════════════════════════════════════════════════════════════════════

  addKeyInsights() {
    this.addPageTitle('Key Insights');
    
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Visual summary of key ESG performance insights.', PAGE.margin, this.currentY);
    this.currentY += 12;
    
    const insights = this.generateVisualInsights();
    
    // 2-column card layout
    const cardWidth = (PAGE.contentWidth - 10) / 2;
    const cardHeight = 40;
    
    insights.forEach((insight, index) => {
      const row = Math.floor(index / 2);
      const col = index % 2;
      
      if (col === 0) {
        this.checkPageBreak(cardHeight + 10);
      }
      
      const x = PAGE.margin + col * (cardWidth + 10);
      const y = this.currentY + row * (cardHeight + 8);
      
      // Card background
      this.doc.setFillColor('#FFFFFF');
      this.doc.setDrawColor(insight.color);
      this.doc.setLineWidth(1);
      this.doc.roundedRect(x, y, cardWidth, cardHeight, 3, 3, 'FD');
      
      // Left color strip
      this.doc.setFillColor(insight.color);
      this.doc.rect(x, y, 5, cardHeight, 'F');
      
      // Icon circle
      this.doc.setFillColor(insight.color);
      this.doc.circle(x + 15, y + 12, 6, 'F');
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(10);
      this.doc.setTextColor('#FFFFFF');
      this.doc.text(insight.icon, x + 15, y + 14, { align: 'center' });
      
      // Category
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(9);
      this.doc.setTextColor(insight.color);
      this.doc.text(insight.category, x + 25, y + 14);
      
      // Insight text
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8);
      this.doc.setTextColor(COLORS.text);
      const insightLines = this.doc.splitTextToSize(insight.text, cardWidth - 20);
      this.doc.text(insightLines.slice(0, 2), x + 10, y + 26);
    });
    
    const totalRows = Math.ceil(insights.length / 2);
    this.currentY += totalRows * (cardHeight + 8) + 10;
  }

  generateVisualInsights() {
    const insights = [];
    
    // Emissions
    if (this.data.totalEmissions > 0) {
      const maxScope = Math.max(this.data.scope1, this.data.scope2, this.data.scope3);
      const maxScopeName = maxScope === this.data.scope1 ? 'Scope 1' : maxScope === this.data.scope2 ? 'Scope 2' : 'Scope 3';
      const maxPct = ((maxScope / this.data.totalEmissions) * 100).toFixed(0);
      insights.push({
        category: 'Emissions',
        icon: 'E',
        text: `${maxScopeName} is the largest contributor at ${maxPct}% of total emissions`,
        color: COLORS.emissions,
      });
    }
    
    // Energy
    if (this.data.renewablePct >= BENCHMARKS.renewableEnergy.excellent) {
      insights.push({
        category: 'Energy',
        icon: 'E',
        text: `Renewables exceed ${BENCHMARKS.renewableEnergy.excellent}% benchmark at ${this.data.renewablePct.toFixed(0)}%`,
        color: COLORS.energy,
      });
    } else if (this.data.renewablePct > 0) {
      insights.push({
        category: 'Energy',
        icon: 'E',
        text: `Renewable energy at ${this.data.renewablePct.toFixed(0)}%, opportunity to reach ${BENCHMARKS.renewableEnergy.excellent}%`,
        color: COLORS.energy,
      });
    }
    
    // Water
    if (this.data.waterRecycleRate >= BENCHMARKS.waterRecycle.excellent) {
      insights.push({
        category: 'Water',
        icon: 'W',
        text: `Strong water stewardship with ${this.data.waterRecycleRate.toFixed(0)}% recycling rate`,
        color: COLORS.water,
      });
    }
    
    // Waste
    if (this.data.wasteRecovered > this.data.wasteDisposed) {
      insights.push({
        category: 'Waste',
        icon: 'W',
        text: 'Circular economy practices: recovery exceeds disposal',
        color: COLORS.waste,
      });
    }
    
    // Safety
    if (this.data.ltifr != null) {
      if (this.data.ltifr > BENCHMARKS.ltifr.fair) {
        insights.push({
          category: 'Safety',
          icon: 'S',
          text: `LTIFR (${this.data.ltifr.toFixed(2)}) requires attention - benchmark: <${BENCHMARKS.ltifr.good}`,
          color: COLORS.social,
        });
      } else {
        insights.push({
          category: 'Safety',
          icon: 'S',
          text: `Strong safety record with LTIFR of ${this.data.ltifr.toFixed(2)}`,
          color: COLORS.social,
        });
      }
    }
    
    // Governance
    if (this.data.apDays != null && this.data.apDays > 200) {
      insights.push({
        category: 'Governance',
        icon: 'G',
        text: `AP Days (${Math.round(this.data.apDays)}) significantly exceeds ${BENCHMARKS.apDays.typical} day norm`,
        color: COLORS.governance,
      });
    }
    
    // Add default if needed
    if (insights.length < 4) {
      insights.push({
        category: 'Progress',
        icon: 'P',
        text: 'ESG tracking established - continued data collection will enable deeper insights',
        color: COLORS.primary,
      });
    }
    
    return insights.slice(0, 6);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECOMMENDATIONS SUMMARY (Next 90 Days)
  // ═══════════════════════════════════════════════════════════════════════════

  addRecommendationsSummary() {
    this.addPageTitle('Recommendations Summary');
    
    // Header banner
    this.doc.setFillColor(COLORS.primary);
    this.doc.roundedRect(PAGE.margin, this.currentY, PAGE.contentWidth, 25, 3, 3, 'F');
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(14);
    this.doc.setTextColor('#FFFFFF');
    this.doc.text('Next 90 Days Action Plan', PAGE.width / 2, this.currentY + 15, { align: 'center' });
    
    this.currentY += 35;
    
    const recommendations = this.generateRecommendations();
    
    recommendations.forEach((rec, index) => {
      this.checkPageBreak(25);
      
      const y = this.currentY;
      
      // Box
      this.doc.setFillColor(index % 2 === 0 ? COLORS.backgroundAlt : '#FFFFFF');
      this.doc.setDrawColor(COLORS.accent);
      this.doc.setLineWidth(0.5);
      this.doc.roundedRect(PAGE.margin, y, PAGE.contentWidth, 20, 2, 2, 'FD');
      
      // Number
      this.doc.setFillColor(COLORS.accent);
      this.doc.circle(PAGE.margin + 10, y + 10, 5, 'F');
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(10);
      this.doc.setTextColor('#FFFFFF');
      this.doc.text(`${index + 1}`, PAGE.margin + 10, y + 12, { align: 'center' });
      
      // Text
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(10);
      this.doc.setTextColor(COLORS.text);
      this.doc.text(rec, PAGE.margin + 22, y + 12);
      
      this.currentY += 24;
    });
    
    this.currentY += 10;
    
    // Closing note
    this.doc.setFillColor('#F0FDF4');
    this.doc.roundedRect(PAGE.margin, this.currentY, PAGE.contentWidth, 25, 2, 2, 'F');
    
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.text);
    this.doc.text('These recommendations are based on current data and industry best practices.', PAGE.margin + 5, this.currentY + 10);
    this.doc.text('Regular monitoring and adjustment of priorities is recommended as conditions change.', PAGE.margin + 5, this.currentY + 18);
  }

  generateRecommendations() {
    const recommendations = [];
    
    // High priority first
    if (this.data.ltifr != null && this.data.ltifr > BENCHMARKS.ltifr.fair) {
      recommendations.push('Conduct comprehensive safety audit and implement improvement plan');
    }
    
    if (this.data.apDays != null && this.data.apDays > 200) {
      recommendations.push('Review and optimize accounts payable processes');
    }
    
    if (this.data.scope1Pct > 50) {
      recommendations.push('Develop Scope 1 emissions reduction roadmap');
    }
    
    // Medium priority
    if (this.data.renewablePct < BENCHMARKS.renewableEnergy.excellent) {
      recommendations.push('Evaluate renewable energy procurement options');
    }
    
    if (this.completeness.overall < 80) {
      recommendations.push('Expand ESG data collection to improve reporting completeness');
    }
    
    if (this.data.wasteRecoveryRate < BENCHMARKS.wasteRecovery.excellent) {
      recommendations.push('Assess opportunities to increase waste recovery rates');
    }
    
    if (this.data.waterRecycleRate < BENCHMARKS.waterRecycle.excellent) {
      recommendations.push('Evaluate water recycling infrastructure investments');
    }
    
    // Default recommendations
    if (recommendations.length < 4) {
      recommendations.push('Set science-based targets for emissions reduction');
      recommendations.push('Enhance supplier ESG engagement and reporting');
    }
    
    return recommendations.slice(0, 6);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // APPENDIX
  // ═══════════════════════════════════════════════════════════════════════════

  addAppendix() {
    this.addPageTitle('Appendix');
    
    // ESG Score Calculation Methodology
    this.addSubsectionTitle('ESG Score Calculation');
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.text);
    
    const scoreExplanation = [
      'Environmental Score (40% weight): Calculated from renewable energy adoption, waste recovery rates, and water recycling performance against industry benchmarks.',
      'Social Score (35% weight): Based on employee turnover rates, workplace safety (LTIFR), and workforce diversity metrics.',
      'Governance Score (25% weight): Derived from financial governance indicators including accounts payable days and compliance metrics.',
      'Overall ESG Score: Weighted average of E, S, and G pillar scores, with Environmental having the highest weight due to its material impact.',
    ];
    
    scoreExplanation.forEach((text) => {
      const lines = this.doc.splitTextToSize(text, PAGE.contentWidth);
      this.doc.text(lines, PAGE.margin, this.currentY);
      this.currentY += lines.length * 4 + 4;
    });
    
    this.currentY += 5;
    
    // General Methodology
    this.addSubsectionTitle('Data Methodology');
    
    const methodology = 'KPIs are calculated using data available in SustainRepo based on the selected reporting period. Emissions calculations follow the GHG Protocol standards. Energy, water, and waste metrics are aggregated from facility-level data. Benchmarks reference industry standards and regulatory frameworks including BRSR, GRI, and SASB.';
    const methLines = this.doc.splitTextToSize(methodology, PAGE.contentWidth);
    this.doc.text(methLines, PAGE.margin, this.currentY);
    this.currentY += methLines.length * 4 + 10;
    
    // Report Metadata
    this.addSubsectionTitle('Report Metadata');
    
    const metadataTable = [
      ['Parameter', 'Value'],
      ['Organization', this.organization.name || 'Not Specified'],
      ['Reporting Period', this.getReportingPeriod()],
      ['Reporting Frequency', this.granularity.charAt(0).toUpperCase() + this.granularity.slice(1)],
      ['Framework', 'Internal / BRSR'],
      ['Report Version', this.reportVersion],
      ['Generated On', this.generatedDate],
      ['Facilities Included', this.facilities.length > 0 ? `${this.facilities.length} facilities` : 'All facilities'],
    ];
    
    this.addStyledTable(metadataTable, [70, 100], COLORS.primary);
    
    this.currentY += 10;
    
    // Metric Definitions
    this.checkPageBreak(80);
    this.addSubsectionTitle('Metric Definitions');
    
    const definitions = [
      { term: 'GHG Emissions', def: `Total greenhouse gas emissions measured in ${this.getCO2Unit()} (tonnes of CO2 equivalent).` },
      { term: 'Renewable %', def: 'Percentage of total energy consumption from renewable sources (solar, wind, hydro, etc.).' },
      { term: 'LTIFR', def: 'Lost Time Injury Frequency Rate - number of lost-time injuries per million hours worked.' },
      { term: 'Waste Recovery', def: 'Waste diverted from disposal through recycling, reuse, composting, or energy recovery.' },
      { term: 'AP Days', def: 'Days Payable Outstanding - average number of days to pay supplier invoices.' },
    ];
    
    definitions.forEach((d) => {
      this.checkPageBreak(15);
      
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(9);
      this.doc.setTextColor(COLORS.primary);
      this.doc.text(d.term, PAGE.margin, this.currentY);
      
      this.doc.setFont('helvetica', 'normal');
      this.doc.setTextColor(COLORS.text);
      const defLines = this.doc.splitTextToSize(d.def, PAGE.contentWidth - 5);
      this.doc.text(defLines, PAGE.margin, this.currentY + 4);
      this.currentY += 4 + defLines.length * 4 + 4;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  addPageTitle(title, color = null) {
    // Icon/color indicator
    if (color) {
      this.doc.setFillColor(color);
      this.doc.roundedRect(PAGE.margin, this.currentY - 4, 8, 8, 2, 2, 'F');
    }
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(18);
    this.doc.setTextColor(color || COLORS.primary);
    this.doc.text(title, color ? PAGE.margin + 12 : PAGE.margin, this.currentY);
    
    // Underline
    this.doc.setDrawColor(color || COLORS.primary);
    this.doc.setLineWidth(0.8);
    const titleWidth = this.doc.getTextWidth(title);
    this.doc.line(color ? PAGE.margin + 12 : PAGE.margin, this.currentY + 2, (color ? PAGE.margin + 12 : PAGE.margin) + titleWidth, this.currentY + 2);
    
    this.currentY += 15;
  }

  addSubsectionTitle(title) {
    this.checkPageBreak(15);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.setTextColor(COLORS.text);
    this.doc.text(title, PAGE.margin, this.currentY);
    this.currentY += 8;
  }

  addChartInterpretation(text) {
    if (!text) return;
    
    this.checkPageBreak(25);
    
    this.doc.setFillColor('#F0FDF4');
    this.doc.setDrawColor(COLORS.accent);
    this.doc.setLineWidth(0.5);
    
    const lines = this.doc.splitTextToSize(text, PAGE.contentWidth - 16);
    const boxHeight = lines.length * 4.5 + 12;
    
    this.doc.roundedRect(PAGE.margin, this.currentY, PAGE.contentWidth, boxHeight, 2, 2, 'FD');
    
    // Left bar
    this.doc.setFillColor(COLORS.accent);
    this.doc.rect(PAGE.margin, this.currentY, 3, boxHeight, 'F');
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(7);
    this.doc.setTextColor(COLORS.emissions);
    this.doc.text('ANALYSIS', PAGE.margin + 8, this.currentY + 7);
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.text);
    this.doc.text(lines, PAGE.margin + 8, this.currentY + 14);
    
    this.currentY += boxHeight + 5;
  }

  addStyledTable(data, columnWidths, headerColor) {
    const rowHeight = 8;
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
        this.doc.setFillColor(rowIndex % 2 === 0 ? COLORS.backgroundAlt : '#FFFFFF');
      }
      
      this.doc.rect(x, y, totalWidth, rowHeight, 'F');
      
      row.forEach((cell, colIndex) => {
        this.doc.setFont('helvetica', isHeader || isTotal ? 'bold' : 'normal');
        this.doc.setFontSize(8);
        this.doc.setTextColor(isHeader ? '#FFFFFF' : COLORS.text);
        
        const cellText = String(cell || '');
        
        // Right-align numeric columns
        if (colIndex > 0 && !isHeader) {
          const textWidth = this.doc.getTextWidth(cellText);
          this.doc.text(cellText, x + columnWidths[colIndex] - textWidth - 3, y + 5.5);
        } else {
          this.doc.text(cellText, x + 3, y + 5.5);
        }
        x += columnWidths[colIndex];
      });
      
      y += rowHeight;
    });
    
    // Border
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(0.3);
    this.doc.rect(startX, this.currentY, totalWidth, data.length * rowHeight);
    
    this.currentY = y + 8;
  }

  async addChartFromRef(testId, title, maxHeight = 80) {
    const chartElement = document.querySelector(`[data-testid="${testId}"]`);
    
    if (chartElement) {
      try {
        const buttons = chartElement.querySelectorAll('button');
        const originalVisibility = [];
        buttons.forEach((btn, i) => {
          originalVisibility[i] = btn.style.visibility;
          btn.style.visibility = 'hidden';
        });
        
        const capturePromise = html2canvas(chartElement, {
          scale: 1.5,
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
        
        buttons.forEach((btn, i) => {
          btn.style.visibility = originalVisibility[i] || 'visible';
        });
        
        const imgData = canvas.toDataURL('image/jpeg', 0.85);
        const aspectRatio = canvas.width / canvas.height;
        let imgWidth = PAGE.contentWidth;
        let imgHeight = imgWidth / aspectRatio;
        
        if (imgHeight > maxHeight) {
          imgHeight = maxHeight;
          imgWidth = imgHeight * aspectRatio;
        }
        
        this.checkPageBreak(imgHeight + 5);
        
        this.doc.setDrawColor(COLORS.borderLight);
        this.doc.setLineWidth(0.3);
        this.doc.roundedRect(PAGE.margin, this.currentY, PAGE.contentWidth, imgHeight + 4, 2, 2, 'S');
        
        this.doc.addImage(imgData, 'JPEG', PAGE.margin + 2, this.currentY + 2, imgWidth - 4, imgHeight);
        this.currentY += imgHeight + 8;
        
        return true;
      } catch (error) {
        console.warn(`Chart capture failed: ${testId}`, error);
        try {
          const buttons = chartElement.querySelectorAll('button');
          buttons.forEach(btn => { btn.style.visibility = 'visible'; });
        } catch (e) {
          // Ignore
        }
        this.addChartPlaceholder(title, maxHeight * 0.6);
        return false;
      }
    } else {
      this.addChartPlaceholder(title, maxHeight * 0.6);
      return false;
    }
  }

  addChartPlaceholder(title, height = 50) {
    this.checkPageBreak(height + 5);
    
    this.doc.setFillColor(COLORS.backgroundAlt);
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(0.3);
    this.doc.roundedRect(PAGE.margin, this.currentY, PAGE.contentWidth, height, 2, 2, 'FD');
    
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text(`[${title}]`, PAGE.width / 2, this.currentY + height / 2 - 3, { align: 'center' });
    this.doc.setFontSize(7);
    this.doc.text('Chart will appear when viewing the dashboard', PAGE.width / 2, this.currentY + height / 2 + 4, { align: 'center' });
    
    this.currentY += height + 5;
  }

  formatNumber(value) {
    if (value == null || isNaN(value)) return 'N/A';
    const rounded = Math.round(value * 100) / 100;
    return rounded.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
}

export default ESGReportGenerator;
