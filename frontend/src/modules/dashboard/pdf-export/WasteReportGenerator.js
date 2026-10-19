/**
 * Waste Dashboard PDF Generator
 * Generates comprehensive Waste management performance report
 */

import { BasePDFGenerator, COLORS, PAGE, BENCHMARKS } from './BasePDFGenerator';

export class WasteReportGenerator extends BasePDFGenerator {
  constructor(options = {}) {
    super(options);
    
    this.reportTitle = 'Waste Report';
    this.reportSubtitle = 'Waste Management & Circular Economy Analysis';
    this.themeColor = COLORS.waste;
    this.reportVersion = '1.0';
    
    // Waste-specific data
    this.waste = options.waste || {};
    this.analytics = options.analytics || {};
    
    this.preCalculateData();
  }

  getReportIcon() {
    return 'W';
  }

  preCalculateData() {
    const hazardous = this.waste.hazardous || {};
    const nonHazardous = this.waste.nonHazardous || this.waste.non_hazardous || {};
    
    this.data = {
      generated: this.waste.generated || (hazardous.generated || 0) + (nonHazardous.generated || 0),
      recovered: this.waste.recovered || (hazardous.recovered || 0) + (nonHazardous.recovered || 0),
      disposed: this.waste.disposed || (hazardous.disposed || 0) + (nonHazardous.disposed || 0),
      recycled: this.waste.recycled || 0,
      composted: this.waste.composted || 0,
      incinerated: this.waste.incinerated || 0,
      landfill: this.waste.landfill || 0,
      hazardousGenerated: hazardous.generated || 0,
      hazardousRecovered: hazardous.recovered || 0,
      hazardousDisposed: hazardous.disposed || 0,
      nonHazardousGenerated: nonHazardous.generated || 0,
      nonHazardousRecovered: nonHazardous.recovered || 0,
      nonHazardousDisposed: nonHazardous.disposed || 0,
    };
    
    // Calculate rates
    this.data.recoveryRate = this.data.generated > 0 
      ? (this.data.recovered / this.data.generated) * 100 
      : 0;
    
    this.data.disposalRate = this.data.generated > 0 
      ? (this.data.disposed / this.data.generated) * 100 
      : 0;
  }

  async generate() {
    try {
      // Cover Page
      this.addCoverPage();
      
      // Executive Summary
      this.addNewPage();
      this.addExecutiveSummary();
      
      // Waste Overview
      this.addNewPage();
      await this.addWasteOverviewSection();
      
      // Waste by Type
      this.addNewPage();
      await this.addWasteByTypeSection();
      
      // Recovery & Disposal
      this.addNewPage();
      await this.addRecoverySection();
      
      // Trends
      this.addNewPage();
      await this.addTrendsSection();
      
      // AI Insights
      this.addNewPage();
      this.addInsightsSection();
      
      // Improvement Opportunities
      this.addNewPage();
      this.addImprovementsSection();
      
      // Appendix
      this.addNewPage();
      this.addAppendix(this.getDefinitions());
      
      this.totalPages = this.pageNumber;
      return this.doc;
    } catch (error) {
      console.error('Error generating Waste PDF:', error);
      throw error;
    }
  }

  addExecutiveSummary() {
    this.addPageTitle('Executive Summary');
    
    const narrative = this.generateNarrative();
    this.addAnalysisBox(narrative);
    
    this.addSubsectionTitle('Key Metrics');
    
    const kpis = [
      { label: 'Total Generated', value: this.data.generated, unit: 'MT', color: COLORS.waste },
      { label: 'Waste Recovered', value: this.data.recovered, unit: 'MT', subtitle: `Rate: ${this.data.recoveryRate.toFixed(0)}%`, color: COLORS.achievement },
      { label: 'Waste Disposed', value: this.data.disposed, unit: 'MT', subtitle: `Rate: ${this.data.disposalRate.toFixed(0)}%`, color: COLORS.declined },
      { label: 'Recovery Rate', value: this.data.recoveryRate, unit: '%', subtitle: `Benchmark: ${BENCHMARKS.wasteRecovery.excellent}%+`, color: this.data.recoveryRate >= BENCHMARKS.wasteRecovery.excellent ? COLORS.achievement : COLORS.attention },
    ];
    
    this.addKPIGrid(kpis, 4);
  }

  generateNarrative() {
    if (this.data.generated === 0) {
      return 'Waste management data is being collected for this reporting period. Complete waste metrics will enable comprehensive circular economy analysis.';
    }
    
    let narrative = `Total waste generated for the reporting period is ${this.formatNumber(this.data.generated)} MT. `;
    
    if (this.data.recovered > this.data.disposed) {
      narrative += `Waste recovery (${this.formatNumber(this.data.recovered)} MT) exceeds disposal (${this.formatNumber(this.data.disposed)} MT), demonstrating effective circular economy practices.`;
    } else if (this.data.recoveryRate >= BENCHMARKS.wasteRecovery.excellent) {
      narrative += `Recovery rate of ${this.data.recoveryRate.toFixed(0)}% exceeds the ${BENCHMARKS.wasteRecovery.excellent}% benchmark.`;
    } else if (this.data.recoveryRate >= BENCHMARKS.wasteRecovery.good) {
      narrative += `Recovery rate of ${this.data.recoveryRate.toFixed(0)}% meets the ${BENCHMARKS.wasteRecovery.good}% benchmark.`;
    } else {
      narrative += `Recovery rate of ${this.data.recoveryRate.toFixed(0)}% presents opportunity for improved waste diversion.`;
    }
    
    return narrative;
  }

  async addWasteOverviewSection() {
    this.addPageTitle('Waste Overview', COLORS.waste);
    
    const analysis = this.data.generated > 0
      ? `Of ${this.formatNumber(this.data.generated)} MT total waste generated, ${this.formatNumber(this.data.recovered)} MT (${this.data.recoveryRate.toFixed(0)}%) was recovered through recycling, composting, or energy recovery, while ${this.formatNumber(this.data.disposed)} MT (${this.data.disposalRate.toFixed(0)}%) was sent to disposal.`
      : 'Waste generation data is being collected.';
    
    this.addAnalysisBox(analysis);
    
    // Try section-waste-trend first (individual dashboard), then fall back to waste-management-chart (ESG dashboard)
    let chartCaptured = await this.addChartFromRef('section-waste-trend', 'Waste Management Overview', 70);
    if (!chartCaptured) {
      await this.addChartFromRef('waste-management-chart', 'Waste Management Overview', 70);
    }
    
    this.addSubsectionTitle('Waste Flow Summary');
    
    const tableData = [
      ['Category', 'Volume (MT)', 'Share'],
      ['Generated', this.formatNumber(this.data.generated), '100%'],
      ['Recovered', this.formatNumber(this.data.recovered), `${this.data.recoveryRate.toFixed(1)}%`],
      ['Disposed', this.formatNumber(this.data.disposed), `${this.data.disposalRate.toFixed(1)}%`],
    ];
    
    this.addFullWidthTable(tableData, COLORS.waste);
  }

  async addWasteByTypeSection() {
    this.addPageTitle('Waste by Type');
    
    const hazardousPct = this.data.generated > 0 ? (this.data.hazardousGenerated / this.data.generated) * 100 : 0;
    const nonHazardousPct = this.data.generated > 0 ? (this.data.nonHazardousGenerated / this.data.generated) * 100 : 0;
    
    const analysis = this.data.hazardousGenerated > 0
      ? `Hazardous waste accounts for ${hazardousPct.toFixed(1)}% (${this.formatNumber(this.data.hazardousGenerated)} MT) of total waste, requiring specialized handling and disposal. Non-hazardous waste at ${nonHazardousPct.toFixed(1)}% (${this.formatNumber(this.data.nonHazardousGenerated)} MT) offers more recovery options.`
      : 'Waste is categorized by hazardous and non-hazardous types for proper handling.';
    
    this.addAnalysisBox(analysis);
    
    await this.addChartFromRef('section-haz-nhaz-trend', 'Waste by Type', 70);
    
    this.addSubsectionTitle('Hazardous vs Non-Hazardous');
    
    const tableData = [
      ['Type', 'Generated (MT)', 'Recovered (MT)', 'Disposed (MT)', 'Recovery Rate'],
      ['Hazardous', this.formatNumber(this.data.hazardousGenerated), this.formatNumber(this.data.hazardousRecovered), this.formatNumber(this.data.hazardousDisposed), this.data.hazardousGenerated > 0 ? `${((this.data.hazardousRecovered / this.data.hazardousGenerated) * 100).toFixed(0)}%` : '-'],
      ['Non-Hazardous', this.formatNumber(this.data.nonHazardousGenerated), this.formatNumber(this.data.nonHazardousRecovered), this.formatNumber(this.data.nonHazardousDisposed), this.data.nonHazardousGenerated > 0 ? `${((this.data.nonHazardousRecovered / this.data.nonHazardousGenerated) * 100).toFixed(0)}%` : '-'],
      ['Total', this.formatNumber(this.data.generated), this.formatNumber(this.data.recovered), this.formatNumber(this.data.disposed), `${this.data.recoveryRate.toFixed(0)}%`],
    ];
    
    this.addFullWidthTable(tableData, COLORS.waste);
  }

  async addRecoverySection() {
    this.addPageTitle('Recovery & Disposal', COLORS.achievement);
    
    const analysis = this.data.recoveryRate >= BENCHMARKS.wasteRecovery.excellent
      ? `Waste recovery rate of ${this.data.recoveryRate.toFixed(0)}% exceeds the ${BENCHMARKS.wasteRecovery.excellent}% industry benchmark, indicating strong circular economy practices.`
      : this.data.recoveryRate >= BENCHMARKS.wasteRecovery.good
        ? `Waste recovery rate of ${this.data.recoveryRate.toFixed(0)}% meets the ${BENCHMARKS.wasteRecovery.good}% benchmark. Continued focus can achieve the ${BENCHMARKS.wasteRecovery.excellent}% target.`
        : `Waste recovery rate of ${this.data.recoveryRate.toFixed(0)}% presents opportunity for improvement through expanded recycling and composting programs.`;
    
    this.addAnalysisBox(analysis);
    
    await this.addChartFromRef('section-recovery-trend', 'Recovery Methods', 70);
    
    this.addSubsectionTitle('Recovery & Disposal Methods');
    
    const tableData = [
      ['Method', 'Volume (MT)', 'Type'],
      ['Recycled', this.formatNumber(this.data.recycled), 'Recovery'],
      ['Composted', this.formatNumber(this.data.composted), 'Recovery'],
      ['Incinerated (with energy)', this.formatNumber(this.data.incinerated), 'Recovery'],
      ['Landfill', this.formatNumber(this.data.landfill), 'Disposal'],
    ];
    
    this.addFullWidthTable(tableData, COLORS.achievement);
  }

  async addTrendsSection() {
    this.addPageTitle('Disposal Trends');
    
    this.addAnalysisBox('Tracking waste disposal trends helps identify opportunities for source reduction and improved recovery rates over time. Waste minimization at source is the most effective strategy.');
    
    await this.addChartFromRef('section-disposal-trend', 'Monthly Waste Disposal', 70);
    await this.addChartFromRef('section-waste-flow', 'Waste Flow Overview', 60);
  }

  // AI Insights Section
  addInsightsSection() {
    this.addPageTitle('AI-Powered Insights');
    
    const insights = this.generateInsights();
    
    insights.forEach((insight, index) => {
      this.checkPageBreak(25);
      
      const y = this.currentY;
      const cardHeight = 22;
      
      this.doc.setFillColor(index % 2 === 0 ? '#F0FDF4' : '#FEF3C7');
      this.doc.setDrawColor(insight.color);
      this.doc.setLineWidth(0.5);
      this.doc.roundedRect(PAGE.margin, y, PAGE.contentWidth, cardHeight, 2, 2, 'FD');
      
      this.doc.setFillColor(insight.color);
      this.doc.rect(PAGE.margin, y, 4, cardHeight, 'F');
      
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(9);
      this.doc.setTextColor(insight.color);
      this.doc.text(insight.category, PAGE.margin + 10, y + 8);
      
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8);
      this.doc.setTextColor(COLORS.text);
      const lines = this.doc.splitTextToSize(insight.text, PAGE.contentWidth - 20);
      this.doc.text(lines[0], PAGE.margin + 10, y + 16);
      
      this.currentY += cardHeight + 5;
    });
  }

  generateInsights() {
    const insights = [];
    
    if (this.data.recoveryRate >= BENCHMARKS.wasteRecovery.excellent) {
      insights.push({
        category: 'STRENGTH',
        text: `Waste recovery rate of ${this.data.recoveryRate.toFixed(0)}% exceeds industry benchmark of ${BENCHMARKS.wasteRecovery.excellent}%. This demonstrates strong circular economy practices.`,
        color: COLORS.achievement,
      });
    } else if (this.data.recoveryRate < BENCHMARKS.wasteRecovery.good) {
      insights.push({
        category: 'OPPORTUNITY',
        text: `Recovery rate of ${this.data.recoveryRate.toFixed(0)}% is below the ${BENCHMARKS.wasteRecovery.good}% benchmark. Investing in recycling infrastructure could improve this metric significantly.`,
        color: COLORS.attention,
      });
    }
    
    if (this.data.recovered > this.data.disposed) {
      insights.push({
        category: 'ACHIEVEMENT',
        text: `Waste recovery (${this.formatNumber(this.data.recovered)} MT) exceeds disposal (${this.formatNumber(this.data.disposed)} MT), indicating effective waste diversion strategies.`,
        color: COLORS.achievement,
      });
    }
    
    if (this.data.hazardousGenerated > 0 && this.data.hazardousRecovered / this.data.hazardousGenerated < 0.3) {
      insights.push({
        category: 'ATTENTION',
        text: `Hazardous waste recovery is below 30%. Explore specialized recycling partners for hazardous materials to improve recovery rates.`,
        color: COLORS.declined,
      });
    }
    
    if (insights.length === 0) {
      insights.push({
        category: 'BASELINE',
        text: 'Waste management data is being established. Continue monitoring to identify optimization opportunities.',
        color: COLORS.primary,
      });
    }
    
    return insights;
  }

  // Improvement Opportunities Section
  addImprovementsSection() {
    this.addPageTitle('Improvement Opportunities');
    
    const improvements = this.generateImprovements();
    
    // Table header
    const colWidths = [25, 90, 30, 35];
    const tableX = PAGE.margin;
    let tableY = this.currentY;
    
    this.doc.setFillColor(COLORS.waste);
    this.doc.rect(tableX, tableY, PAGE.contentWidth, 10, 'F');
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(8);
    this.doc.setTextColor('#FFFFFF');
    this.doc.text('Priority', tableX + 3, tableY + 7);
    this.doc.text('Action', tableX + colWidths[0] + 3, tableY + 7);
    this.doc.text('Impact', tableX + colWidths[0] + colWidths[1] + 3, tableY + 7);
    this.doc.text('Timeline', tableX + colWidths[0] + colWidths[1] + colWidths[2] + 3, tableY + 7);
    
    tableY += 10;
    
    improvements.forEach((imp, index) => {
      const rowHeight = 12;
      
      this.doc.setFillColor(index % 2 === 0 ? COLORS.backgroundAlt : '#FFFFFF');
      this.doc.rect(tableX, tableY, PAGE.contentWidth, rowHeight, 'F');
      
      const priorityColors = { 'High': COLORS.declined, 'Medium': COLORS.attention, 'Low': COLORS.water };
      
      this.doc.setFillColor(priorityColors[imp.priority] || COLORS.textMuted);
      this.doc.roundedRect(tableX + 3, tableY + 2, 18, 8, 2, 2, 'F');
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(6);
      this.doc.setTextColor('#FFFFFF');
      this.doc.text(imp.priority, tableX + 12, tableY + 7, { align: 'center' });
      
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8);
      this.doc.setTextColor(COLORS.text);
      this.doc.text(imp.action, tableX + colWidths[0] + 3, tableY + 8);
      this.doc.text(imp.impact, tableX + colWidths[0] + colWidths[1] + 3, tableY + 8);
      this.doc.text(imp.timeline, tableX + colWidths[0] + colWidths[1] + colWidths[2] + 3, tableY + 8);
      
      tableY += rowHeight;
    });
    
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(0.3);
    this.doc.rect(tableX, this.currentY, PAGE.contentWidth, tableY - this.currentY);
    
    this.currentY = tableY + 10;
  }

  generateImprovements() {
    const improvements = [];
    
    if (this.data.recoveryRate < BENCHMARKS.wasteRecovery.good) {
      improvements.push({
        priority: 'High',
        action: 'Implement comprehensive recycling program',
        impact: 'High',
        timeline: '3 months',
      });
    }
    
    if (this.data.disposed > this.data.recovered) {
      improvements.push({
        priority: 'High',
        action: 'Reduce landfill dependency through waste-to-energy',
        impact: 'High',
        timeline: '6 months',
      });
    }
    
    if (this.data.hazardousGenerated > 0) {
      improvements.push({
        priority: 'Medium',
        action: 'Partner with specialized hazardous waste recyclers',
        impact: 'Medium',
        timeline: '6 months',
      });
    }
    
    improvements.push({
      priority: 'Medium',
      action: 'Conduct waste audit to identify source reduction',
      impact: 'Medium',
      timeline: '3 months',
    });
    
    improvements.push({
      priority: 'Low',
      action: 'Implement composting program for organic waste',
      impact: 'Medium',
      timeline: '12 months',
    });
    
    return improvements.slice(0, 6);
  }

  getDefinitions() {
    return [
      { term: 'MT', def: 'Metric Tonnes - a unit of mass equal to 1,000 kilograms, commonly used for waste measurement.' },
      { term: 'Hazardous Waste', def: 'Waste that poses substantial or potential threats to public health or the environment due to its chemical, biological, or physical properties.' },
      { term: 'Non-Hazardous Waste', def: 'Waste that does not meet hazardous waste criteria and can be handled through standard waste management processes.' },
      { term: 'Waste Recovery', def: 'Diversion of waste from disposal through recycling, reuse, composting, or energy recovery.' },
      { term: 'Circular Economy', def: 'An economic system aimed at eliminating waste through the continual use of resources via recycling and regeneration.' },
    ];
  }
}

export default WasteReportGenerator;
