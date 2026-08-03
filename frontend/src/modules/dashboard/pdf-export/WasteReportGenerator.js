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
    
    await this.addChartFromRef('waste-management-chart', 'Waste Management Overview', 70);
    
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
    
    await this.addChartFromRef('waste-type-breakdown', 'Waste by Type', 70);
    
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
    
    await this.addChartFromRef('waste-recovery-methods', 'Recovery Methods', 70);
    
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
    this.addPageTitle('Generation Trends');
    
    this.addAnalysisBox('Tracking waste generation trends helps identify opportunities for source reduction and improved recovery rates over time. Waste minimization at source is the most effective strategy.');
    
    await this.addChartFromRef('waste-generation-trend', 'Monthly Waste Generation', 70);
    await this.addChartFromRef('waste-recovery-trend', 'Recovery Rate Trend', 60);
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
