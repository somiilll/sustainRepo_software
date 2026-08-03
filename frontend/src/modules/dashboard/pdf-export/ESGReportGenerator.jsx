/**
 * ESG Report Generator - Executive Dashboard PDF Export V3
 * Premium boardroom-ready report with visual storytelling
 * 
 * Report Structure:
 * 1. Cover Page (Premium design with branding)
 * 2. Executive Summary (Narrative paragraph + Key Metrics)
 * 3. ESG Performance Score
 * 4. Key Achievements
 * 5. Environmental Section Banner
 *    - Emissions
 *    - Energy
 *    - Water
 *    - Waste
 * 6. Social Section Banner
 *    - Workforce & Safety
 * 7. Governance Section Banner
 *    - Financial Governance
 * 8. Improvement Opportunities
 * 9. Key Insights (Analytical)
 * 10. Appendix (Methodology + Definitions + Metadata)
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
  // Section colors
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

// Icons (Unicode symbols that render well in PDF)
const ICONS = {
  environmental: '●',
  emissions: '◉',
  energy: '⚡',
  water: '◆',
  waste: '■',
  social: '●',
  governance: '▲',
  insights: '★',
  achievement: '✓',
  opportunity: '→',
};

/**
 * Main PDF Generator Class - V3
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
    this.totalPages = 0; // Will be calculated
    this.currentY = PAGE.margin + PAGE.headerHeight;
    this.generatedDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    this.generatedTimestamp = new Date().toISOString();
    this.reportVersion = '3.0';
    
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
    
    // Calculate ESG scores (simplified rule-based)
    this.calculateESGScores();
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

  getCO2Unit() {
    return 'tCO2e';
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
      
      // 3. ESG Performance Score
      this.addNewPage();
      this.addESGScorePage();
      
      // 4. Key Achievements
      this.addNewPage();
      this.addAchievementsPage();
      
      // 5. Environmental Section
      this.addNewPage();
      this.addSectionBanner('ENVIRONMENTAL PERFORMANCE', COLORS.environmental, 'Emissions, Energy, Water & Waste');
      
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
      
      // 6. Social Section
      this.addNewPage();
      this.addSectionBanner('SOCIAL PERFORMANCE', COLORS.social, 'Workforce, Safety & Community');
      
      this.addNewPage();
      await this.addSocialSection();
      
      // 7. Governance Section
      this.addNewPage();
      this.addSectionBanner('GOVERNANCE PERFORMANCE', COLORS.governance, 'Ethics, Compliance & Finance');
      
      this.addNewPage();
      await this.addGovernanceSection();
      
      // 8. Improvement Opportunities
      this.addNewPage();
      this.addImprovementOpportunities();
      
      // 9. Key Insights
      this.addNewPage();
      this.addKeyInsights();
      
      // 10. Appendix
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
    this.doc.line(PAGE.margin, y - 4, PAGE.width - PAGE.margin, y - 4);
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(7);
    this.doc.setTextColor(COLORS.textMuted);
    
    this.doc.text('Generated by SustainRepo', PAGE.margin, y);
    this.doc.setFont('helvetica', 'italic');
    this.doc.text('Confidential', PAGE.width / 2, y, { align: 'center' });
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
    
    // Top gradient bar
    this.doc.setFillColor(COLORS.primary);
    this.doc.rect(0, 0, PAGE.width, 45, 'F');
    
    // Accent line
    this.doc.setFillColor(COLORS.accent);
    this.doc.rect(0, 45, PAGE.width, 3, 'F');
    
    // Company name in header
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(14);
    this.doc.setTextColor('#FFFFFF');
    this.doc.text(this.organization.name || 'Organization', centerX, 25, { align: 'center' });
    
    // Logo placeholder
    this.doc.setFillColor('#FFFFFF');
    this.doc.roundedRect(centerX - 20, 55, 40, 30, 3, 3, 'F');
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor(COLORS.textLight);
    this.doc.text('LOGO', centerX, 73, { align: 'center' });
    
    // Main title
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(32);
    this.doc.setTextColor(COLORS.primary);
    this.doc.text('ESG Dashboard', centerX, 110, { align: 'center' });
    this.doc.text('Report', centerX, 122, { align: 'center' });
    
    // Subtitle
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(12);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Environmental, Social & Governance Performance', centerX, 135, { align: 'center' });
    
    // Decorative line
    this.doc.setDrawColor(COLORS.accent);
    this.doc.setLineWidth(2);
    this.doc.line(centerX - 50, 145, centerX + 50, 145);
    
    // Metadata cards
    const cardY = 160;
    const cardWidth = 80;
    const cardHeight = 45;
    const gap = 10;
    
    // Left card - Period
    this.drawMetadataCard(PAGE.margin, cardY, cardWidth, cardHeight, 'REPORTING PERIOD', this.getReportingPeriod());
    
    // Right card - Generated
    this.drawMetadataCard(PAGE.width - PAGE.margin - cardWidth, cardY, cardWidth, cardHeight, 'GENERATED ON', this.generatedDate);
    
    // Center card - Framework
    this.drawMetadataCard(centerX - cardWidth/2, cardY + cardHeight + gap, cardWidth, cardHeight, 'FRAMEWORK', 'Internal / BRSR');
    
    // Bottom info
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(10);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Prepared by SustainRepo', centerX, 250, { align: 'center' });
    this.doc.setFontSize(8);
    this.doc.text(`Version ${this.reportVersion}`, centerX, 258, { align: 'center' });
    
    // Footer
    this.doc.setFillColor(COLORS.primary);
    this.doc.rect(0, PAGE.height - 15, PAGE.width, 15, 'F');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    this.doc.setTextColor('#FFFFFF');
    this.doc.text('CONFIDENTIAL', centerX, PAGE.height - 6, { align: 'center' });
  }

  drawMetadataCard(x, y, width, height, label, value) {
    this.doc.setFillColor(COLORS.backgroundAlt);
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(0.3);
    this.doc.roundedRect(x, y, width, height, 3, 3, 'FD');
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(7);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text(label, x + width/2, y + 12, { align: 'center' });
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.setTextColor(COLORS.text);
    this.doc.text(value, x + width/2, y + 28, { align: 'center' });
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
    
    // Governance narrative
    if (this.data.apDays != null && this.data.apDays > 200) {
      parts.push(`Accounts payable days at ${Math.round(this.data.apDays)} may warrant financial process review.`);
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
        subtitle: 'Target: 80%+'
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
        subtitle: this.data.ltifr > 5 ? 'Needs attention' : 'On track'
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
  // 3. ESG PERFORMANCE SCORE
  // ═══════════════════════════════════════════════════════════════════════════

  addESGScorePage() {
    this.addPageTitle('ESG Performance Score');
    
    const centerX = PAGE.width / 2;
    
    // Overall score circle
    const scoreY = this.currentY + 30;
    const radius = 25;
    
    // Background circle
    this.doc.setFillColor(COLORS.backgroundAlt);
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(3);
    this.doc.circle(centerX, scoreY, radius, 'FD');
    
    // Score arc (simplified - just show filled based on score)
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
    this.doc.setFontSize(12);
    this.doc.setTextColor(COLORS.text);
    this.doc.text('OVERALL ESG PERFORMANCE', centerX, scoreY + radius + 12, { align: 'center' });
    
    this.currentY = scoreY + radius + 30;
    
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
    this.doc.text('90-100: Excellent  |  75-89: Good  |  60-74: Fair  |  Below 60: Needs Improvement', PAGE.margin + 5, this.currentY + 20);
    this.doc.text('Scores are calculated based on industry benchmarks and best practices.', PAGE.margin + 5, this.currentY + 28);
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
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 60) return 'Fair';
    return 'Needs Work';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. KEY ACHIEVEMENTS
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
      
      // Check icon
      this.doc.setFillColor(COLORS.achievement);
      this.doc.circle(PAGE.margin + 10, y + 9, 4, 'F');
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(10);
      this.doc.setTextColor('#FFFFFF');
      this.doc.text('✓', PAGE.margin + 10, y + 11, { align: 'center' });
      
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
    
    if (this.data.renewablePct >= 80) {
      achievements.push(`Renewable energy above 80% (${this.data.renewablePct.toFixed(1)}%)`);
    } else if (this.data.renewablePct >= 50) {
      achievements.push(`Renewable energy exceeds 50% (${this.data.renewablePct.toFixed(1)}%)`);
    }
    
    if (this.data.waterRecycleRate >= 50) {
      achievements.push(`High water recycling rate (${this.data.waterRecycleRate.toFixed(0)}%)`);
    }
    
    if (this.data.wasteRecoveryRate >= 50) {
      achievements.push(`Strong waste recovery performance (${this.data.wasteRecoveryRate.toFixed(0)}%)`);
    }
    
    if (this.data.wasteRecovered > this.data.wasteDisposed) {
      achievements.push('Waste recovery exceeds disposal');
    }
    
    if (this.data.turnover != null && this.data.turnover < 10) {
      achievements.push(`Low employee turnover (${this.data.turnover.toFixed(1)}%)`);
    }
    
    if (this.data.ltifr != null && this.data.ltifr < 2) {
      achievements.push(`Strong safety performance (LTIFR: ${this.data.ltifr.toFixed(2)})`);
    }
    
    if (this.data.apDays != null && this.data.apDays < 90) {
      achievements.push(`Efficient payment cycles (${Math.round(this.data.apDays)} days)`);
    }
    
    if (achievements.length === 0) {
      achievements.push('ESG monitoring systems established');
      achievements.push('Baseline data collection completed');
      achievements.push('Sustainability reporting framework implemented');
    }
    
    return achievements.slice(0, 8);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION BANNER
  // ═══════════════════════════════════════════════════════════════════════════

  addSectionBanner(title, color, subtitle) {
    const centerX = PAGE.width / 2;
    const centerY = PAGE.height / 2 - 20;
    
    // Background
    this.doc.setFillColor(color);
    this.doc.rect(0, centerY - 40, PAGE.width, 80, 'F');
    
    // Decorative lines
    this.doc.setDrawColor('#FFFFFF');
    this.doc.setLineWidth(0.5);
    this.doc.line(PAGE.margin + 20, centerY - 15, PAGE.width - PAGE.margin - 20, centerY - 15);
    this.doc.line(PAGE.margin + 20, centerY + 20, PAGE.width - PAGE.margin - 20, centerY + 20);
    
    // Title
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(20);
    this.doc.setTextColor('#FFFFFF');
    this.doc.text(title, centerX, centerY + 3, { align: 'center' });
    
    // Subtitle
    if (subtitle) {
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(11);
      this.doc.text(subtitle, centerX, centerY + 35, { align: 'center' });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. EMISSIONS SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addEmissionsSection() {
    this.addPageTitle('Emissions', COLORS.emissions);
    
    // Chart (larger)
    await this.addChartFromRef('ghg-emission-trend', 'GHG Emission Trend', 90);
    
    // Chart interpretation
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
    const maxScopeName = maxScope === this.data.scope1 ? 'Scope 1' : maxScope === this.data.scope2 ? 'Scope 2' : 'Scope 3';
    const maxPct = ((maxScope / this.data.totalEmissions) * 100).toFixed(0);
    
    let interpretation = `${maxScopeName} emissions represent ${maxPct}% of total emissions, making it the primary focus area for decarbonization initiatives.`;
    
    if (this.data.scope2 > 0 && this.data.scope2 < this.data.scope1) {
      interpretation += ' Scope 2 remained comparatively lower, potentially reflecting progress in clean energy procurement.';
    }
    
    return interpretation;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. ENERGY SECTION
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
      ['Metric', 'Value', 'Notes'],
      ['Total Consumption', `${this.formatNumber(this.data.totalEnergy)} MWh`, ''],
      ['Renewable Energy', `${this.data.renewablePct.toFixed(1)}%`, this.data.renewablePct >= 80 ? 'Exceeds target' : 'Target: 80%'],
      ['Non-Renewable', `${(100 - this.data.renewablePct).toFixed(1)}%`, ''],
      ['Energy Intensity', energyIntensity ? `${energyIntensity.toFixed(2)} MWh/${this.productionUnit}` : 'N/A', ''],
    ];
    
    this.addStyledTable(tableData, [60, 50, 60], COLORS.energy);
  }

  generateEnergyInterpretation() {
    if (this.data.renewablePct >= 80) {
      return `Renewable energy accounts for ${this.data.renewablePct.toFixed(1)}% of total consumption, demonstrating industry-leading clean energy adoption. Future emission reductions will likely require operational efficiency improvements rather than additional renewable substitution.`;
    } else if (this.data.renewablePct >= 50) {
      return `Renewable energy at ${this.data.renewablePct.toFixed(1)}% shows significant progress toward sustainability goals. Continuing investment in clean energy sources could help achieve the 80% benchmark.`;
    } else if (this.data.totalEnergy > 0) {
      return `Renewable energy currently at ${this.data.renewablePct.toFixed(1)}%. Significant opportunity exists to increase clean energy adoption and reduce Scope 2 emissions.`;
    }
    return 'Energy consumption data is being collected for comprehensive analysis.';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. WATER SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addWaterSection() {
    this.addPageTitle('Water', COLORS.water);
    
    await this.addChartFromRef('water-flow-chart', 'Water Flow', 90);
    
    this.addChartInterpretation(this.generateWaterInterpretation());
    
    this.currentY += 8;
    
    // Summary
    this.addSubsectionTitle('Water Summary');
    
    const water = this.metrics?.water || {};
    
    const tableData = [
      ['Metric', 'Value (KL)', 'Status'],
      ['Withdrawn', this.data.waterWithdrawn > 0 ? this.formatNumber(this.data.waterWithdrawn) : 'Not reported', ''],
      ['Consumed', water.consumed > 0 ? this.formatNumber(water.consumed) : 'Not reported', ''],
      ['Discharged', water.discharged > 0 ? this.formatNumber(water.discharged) : 'Not reported', ''],
      ['Recycled', this.data.waterRecycled > 0 ? this.formatNumber(this.data.waterRecycled) : 'Not reported', ''],
      ['Recycle Rate', this.data.waterRecycleRate ? `${this.data.waterRecycleRate.toFixed(1)}%` : 'Insufficient data', this.data.waterRecycleRate >= 50 ? 'Strong' : ''],
    ];
    
    this.addStyledTable(tableData, [55, 50, 65], COLORS.water);
  }

  generateWaterInterpretation() {
    if (this.data.waterRecycleRate >= 50) {
      return `Water recycling is consistently high at ${this.data.waterRecycleRate.toFixed(0)}%, indicating effective water management practices and commitment to resource conservation.`;
    } else if (this.data.waterRecycled > 0 && this.data.waterWithdrawn === 0) {
      return `Water recycling data (${this.formatNumber(this.data.waterRecycled)} KL) is available. Complete water withdrawal data is needed to calculate the recycling rate accurately.`;
    } else if (this.data.waterRecycleRate > 0) {
      return `Water recycling rate at ${this.data.waterRecycleRate.toFixed(0)}% presents an opportunity for improvement through expanded water treatment and reuse programs.`;
    }
    return 'Complete water flow data is being collected to enable comprehensive water management analysis.';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. WASTE SECTION
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
      return 'Waste recovery exceeded disposal, indicating an effective waste management program with strong circular economy practices. This performance demonstrates commitment to waste diversion and resource recovery.';
    } else if (this.data.wasteRecoveryRate >= 50) {
      return `Waste recovery rate at ${this.data.wasteRecoveryRate.toFixed(0)}% shows good progress in waste diversion. Continued focus on recycling and recovery programs can further improve this metric.`;
    } else if (this.data.wasteGenerated > 0) {
      return `Waste recovery rate at ${this.data.wasteRecoveryRate?.toFixed(0) || 0}% indicates opportunity for improvement through expanded recycling, composting, and recovery programs.`;
    }
    return 'Waste management data is being collected for comprehensive analysis.';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. SOCIAL SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addSocialSection() {
    this.addPageTitle('Workforce & Safety', COLORS.social);
    
    // Workforce KPIs
    this.addSubsectionTitle('Workforce Overview');
    
    const workforceData = [
      ['Metric', 'Value', 'Status'],
      ['Total Employees', this.data.employees > 0 ? this.formatNumber(this.data.employees) : 'Not reported', ''],
      ['Female Workforce', this.data.diversityPct != null ? `${this.data.diversityPct.toFixed(1)}%` : 'Not reported', this.data.diversityPct >= 40 ? 'Balanced' : ''],
      ['Employee Turnover', this.data.turnover != null ? `${this.data.turnover.toFixed(1)}%` : 'Not reported', this.data.turnover < 10 ? 'Low' : this.data.turnover < 20 ? 'Moderate' : 'High'],
      ['LTIFR', this.data.ltifr != null ? this.data.ltifr.toFixed(2) : 'Not reported', this.data.ltifr < 2 ? 'Strong' : this.data.ltifr < 5 ? 'Moderate' : 'Needs attention'],
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
      ['Incident Type', 'Count', 'Impact'],
      ['Health & Safety', this.formatNumber(totalIncidents.healthSafety || 0), totalIncidents.healthSafety > 0 ? 'Monitor' : 'Clear'],
      ['Data Breaches', this.formatNumber(totalIncidents.dataBreaches || 0), totalIncidents.dataBreaches > 0 ? 'Review' : 'Clear'],
      ['Compliance Violations', this.formatNumber(totalIncidents.violations || 0), totalIncidents.violations > 0 ? 'Action needed' : 'Clear'],
    ];
    
    this.addStyledTable(incidentsData, [60, 50, 60], COLORS.social);
  }

  generateSocialInterpretation() {
    const parts = [];
    
    if (this.data.turnover != null && this.data.turnover < 10) {
      parts.push(`Employee turnover at ${this.data.turnover.toFixed(1)}% reflects strong workforce retention and engagement.`);
    }
    
    if (this.data.ltifr != null) {
      if (this.data.ltifr < 2) {
        parts.push(`LTIFR of ${this.data.ltifr.toFixed(2)} demonstrates excellent safety performance.`);
      } else if (this.data.ltifr > 5) {
        parts.push(`LTIFR of ${this.data.ltifr.toFixed(2)} indicates opportunities for safety program improvements.`);
      }
    }
    
    if (parts.length === 0) {
      return 'Social metrics are being tracked across workforce and safety dimensions.';
    }
    
    return parts.join(' ');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. GOVERNANCE SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addGovernanceSection() {
    this.addPageTitle('Financial Governance', COLORS.governance);
    
    if (this.data.apDays != null) {
      await this.addChartFromRef('ap-days-chart', 'Accounts Payable Days Trend', 90);
      
      this.addChartInterpretation(this.generateGovernanceInterpretation());
      
      this.currentY += 8;
      
      this.addSubsectionTitle('Governance Metrics');
      
      const tableData = [
        ['Metric', 'Value', 'Benchmark'],
        ['Accounts Payable Days', `${Math.round(this.data.apDays)} days`, this.data.apDays < 60 ? 'Excellent' : this.data.apDays < 90 ? 'Good' : this.data.apDays < 120 ? 'Fair' : 'Review needed'],
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
      return `Accounts Payable Days at ${Math.round(this.data.apDays)} significantly exceeds typical benchmarks and may warrant financial process review to maintain healthy supplier relationships and avoid potential supply chain risks.`;
    } else if (this.data.apDays > 90) {
      return `Accounts Payable Days at ${Math.round(this.data.apDays)} is above average. Consider reviewing payment terms and processes to optimize working capital while maintaining supplier relationships.`;
    } else if (this.data.apDays > 0) {
      return `Accounts Payable Days at ${Math.round(this.data.apDays)} indicates efficient payment cycle management and healthy supplier relationships.`;
    }
    return 'Governance metrics are being tracked.';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. IMPROVEMENT OPPORTUNITIES
  // ═══════════════════════════════════════════════════════════════════════════

  addImprovementOpportunities() {
    this.addPageTitle('Improvement Opportunities');
    
    const opportunities = this.generateOpportunities();
    
    opportunities.forEach((opp, index) => {
      this.checkPageBreak(25);
      
      const y = this.currentY;
      
      // Opportunity box
      this.doc.setFillColor(index % 2 === 0 ? '#FEF3C7' : '#FEF9C3');
      this.doc.setDrawColor(COLORS.attention);
      this.doc.setLineWidth(0.3);
      this.doc.roundedRect(PAGE.margin, y, PAGE.contentWidth, 20, 2, 2, 'FD');
      
      // Number circle
      this.doc.setFillColor(COLORS.attention);
      this.doc.circle(PAGE.margin + 10, y + 10, 5, 'F');
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(10);
      this.doc.setTextColor('#FFFFFF');
      this.doc.text(`${index + 1}`, PAGE.margin + 10, y + 12, { align: 'center' });
      
      // Text
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(10);
      this.doc.setTextColor(COLORS.text);
      this.doc.text(opp, PAGE.margin + 22, y + 12);
      
      this.currentY += 24;
    });
  }

  generateOpportunities() {
    const opportunities = [];
    
    // Emissions
    if (this.data.scope1Pct > 40) {
      opportunities.push('Reduce Scope 1 emissions through operational efficiency and fuel switching');
    }
    
    // Energy
    if (this.data.renewablePct < 80) {
      opportunities.push('Increase renewable energy adoption to reach 80%+ target');
    }
    
    // Water
    if (this.data.waterRecycleRate < 50) {
      opportunities.push('Expand water recycling programs to improve resource efficiency');
    }
    
    // Waste
    if (this.data.wasteRecoveryRate < 70) {
      opportunities.push('Enhance waste recovery and recycling initiatives');
    }
    
    // Safety
    if (this.data.ltifr > 2) {
      opportunities.push('Strengthen workplace safety programs to reduce LTIFR');
    }
    
    // Governance
    if (this.data.apDays > 90) {
      opportunities.push('Optimize payment cycles to improve supplier relationships');
    }
    
    // Diversity
    if (this.data.diversityPct != null && this.data.diversityPct < 30) {
      opportunities.push('Enhance diversity and inclusion programs');
    }
    
    if (opportunities.length === 0) {
      opportunities.push('Continue current sustainability initiatives');
      opportunities.push('Expand data collection across all ESG metrics');
      opportunities.push('Set science-based targets for emissions reduction');
    }
    
    return opportunities.slice(0, 6);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. KEY INSIGHTS (Analytical)
  // ═══════════════════════════════════════════════════════════════════════════

  addKeyInsights() {
    this.addPageTitle('Key Insights');
    
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Analytical observations generated from dashboard data.', PAGE.margin, this.currentY);
    this.currentY += 10;
    
    const insights = this.generateAnalyticalInsights();
    
    insights.forEach((insight, index) => {
      this.checkPageBreak(30);
      
      const y = this.currentY;
      
      // Insight box
      this.doc.setFillColor(index % 2 === 0 ? COLORS.backgroundAlt : '#FFFFFF');
      this.doc.setDrawColor(insight.color);
      this.doc.setLineWidth(0.5);
      
      const lines = this.doc.splitTextToSize(insight.text, PAGE.contentWidth - 25);
      const boxHeight = Math.max(lines.length * 5 + 14, 22);
      
      this.doc.roundedRect(PAGE.margin, y, PAGE.contentWidth, boxHeight, 2, 2, 'FD');
      
      // Left color bar
      this.doc.setFillColor(insight.color);
      this.doc.rect(PAGE.margin, y, 4, boxHeight, 'F');
      
      // Category badge
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(7);
      this.doc.setTextColor(insight.color);
      this.doc.text(insight.category.toUpperCase(), PAGE.margin + 10, y + 8);
      
      // Text
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(9);
      this.doc.setTextColor(COLORS.text);
      this.doc.text(lines, PAGE.margin + 10, y + 15);
      
      this.currentY += boxHeight + 5;
    });
  }

  generateAnalyticalInsights() {
    const insights = [];
    
    // Emissions insight
    if (this.data.totalEmissions > 0) {
      const maxScope = Math.max(this.data.scope1, this.data.scope2, this.data.scope3);
      const maxScopeName = maxScope === this.data.scope1 ? 'Scope 1' : maxScope === this.data.scope2 ? 'Scope 2' : 'Scope 3';
      const maxPct = ((maxScope / this.data.totalEmissions) * 100).toFixed(0);
      insights.push({
        category: 'Emissions',
        text: `${maxScopeName} contributes approximately ${maxPct}% of total emissions, making it the primary decarbonization opportunity. Targeted reduction initiatives in this scope could yield the highest impact.`,
        color: COLORS.emissions,
      });
    }
    
    // Energy insight
    if (this.data.renewablePct >= 80) {
      insights.push({
        category: 'Energy',
        text: `Renewable energy already exceeds 80% (${this.data.renewablePct.toFixed(1)}%), suggesting future emission reductions will require operational efficiency improvements rather than additional renewable substitution.`,
        color: COLORS.energy,
      });
    } else if (this.data.renewablePct > 0) {
      insights.push({
        category: 'Energy',
        text: `Renewable energy at ${this.data.renewablePct.toFixed(1)}% presents significant opportunity. Increasing to 80%+ could substantially reduce Scope 2 emissions and improve ESG ratings.`,
        color: COLORS.energy,
      });
    }
    
    // Waste insight
    if (this.data.wasteRecovered > this.data.wasteDisposed) {
      insights.push({
        category: 'Waste',
        text: 'Waste recovery exceeds disposal, indicating an effective waste management program aligned with circular economy principles. This performance supports both environmental goals and potential cost savings.',
        color: COLORS.waste,
      });
    }
    
    // Water insight
    if (this.data.waterRecycleRate >= 50) {
      insights.push({
        category: 'Water',
        text: `Water recycling at ${this.data.waterRecycleRate.toFixed(0)}% demonstrates effective water stewardship. Continued investment in water treatment could further reduce freshwater dependency.`,
        color: COLORS.water,
      });
    }
    
    // Governance insight
    if (this.data.apDays > 200) {
      insights.push({
        category: 'Governance',
        text: `Accounts payable days at ${Math.round(this.data.apDays)} significantly exceeds industry norms and may warrant financial process review to maintain healthy supplier relationships and avoid supply chain risks.`,
        color: COLORS.governance,
      });
    }
    
    // Safety insight
    if (this.data.ltifr != null && this.data.ltifr > 3) {
      insights.push({
        category: 'Safety',
        text: `LTIFR of ${this.data.ltifr.toFixed(2)} indicates opportunity for safety program enhancements. Prioritizing safety training and hazard prevention could improve both employee wellbeing and operational efficiency.`,
        color: COLORS.social,
      });
    }
    
    if (insights.length < 4) {
      insights.push({
        category: 'General',
        text: 'ESG data collection is progressing. Continued monitoring will enable trend analysis and identification of improvement opportunities.',
        color: COLORS.primary,
      });
    }
    
    return insights.slice(0, 6);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. APPENDIX
  // ═══════════════════════════════════════════════════════════════════════════

  addAppendix() {
    this.addPageTitle('Appendix');
    
    // Methodology
    this.addSubsectionTitle('Methodology');
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.text);
    const methodology = 'KPIs are calculated using data available in SustainRepo based on the selected reporting period. Emissions calculations follow the GHG Protocol. Energy, water, and waste metrics are aggregated from facility-level data. ESG scores are calculated using industry benchmarks and best practices.';
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
      ['Generated At', new Date().toLocaleTimeString()],
      ['Facilities Included', this.facilities.length > 0 ? `${this.facilities.length} facilities` : 'All facilities'],
    ];
    
    this.addStyledTable(metadataTable, [70, 100], COLORS.primary);
    
    this.currentY += 10;
    
    // Metric Definitions
    this.addSubsectionTitle('Metric Definitions');
    
    const definitions = [
      { term: 'GHG Intensity', def: `Total GHG emissions (Scope 1+2) per unit of production (${this.getCO2Unit()}/${this.productionUnit}).` },
      { term: 'Renewable %', def: 'Percentage of total energy from renewable sources.' },
      { term: 'LTIFR', def: 'Lost Time Injury Frequency Rate - injuries per million hours worked.' },
      { term: 'Waste Recovery', def: 'Waste diverted from disposal via recycling, reuse, or recovery.' },
      { term: 'AP Days', def: 'Average days to pay suppliers (Days Payable Outstanding).' },
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
