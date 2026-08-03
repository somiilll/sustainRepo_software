/**
 * Energy Dashboard PDF Generator
 * Generates comprehensive Energy performance report
 */

import { BasePDFGenerator, COLORS, PAGE, BENCHMARKS } from './BasePDFGenerator';

export class EnergyReportGenerator extends BasePDFGenerator {
  constructor(options = {}) {
    super(options);
    
    this.reportTitle = 'Energy Report';
    this.reportSubtitle = 'Energy Consumption & Efficiency Analysis';
    this.themeColor = COLORS.energy;
    this.reportVersion = '1.0';
    
    // Energy-specific data
    this.energy = options.energy || {};
    this.analytics = options.analytics || {};
    this.productionQty = options.productionQty || 0;
    this.productionUnit = options.productionUnit || 'unit';
    
    this.preCalculateData();
  }

  getReportIcon() {
    return 'E';
  }

  preCalculateData() {
    this.data = {
      totalEnergy: this.energy.total || 0,
      renewable: this.energy.renewable || 0,
      nonRenewable: this.energy.non_renewable || 0,
      renewablePct: this.energy.renewable_pct || 0,
      grid: this.energy.grid || 0,
      solar: this.energy.solar || 0,
      wind: this.energy.wind || 0,
      diesel: this.energy.diesel || 0,
      naturalGas: this.energy.natural_gas || 0,
    };
    
    if (this.data.totalEnergy > 0 && this.data.renewablePct === 0) {
      this.data.renewablePct = (this.data.renewable / this.data.totalEnergy) * 100;
    }
    
    // Calculate intensity
    this.data.intensity = this.productionQty > 0 ? this.data.totalEnergy / this.productionQty : null;
  }

  async generate() {
    try {
      // Cover Page
      this.addCoverPage();
      
      // Executive Summary
      this.addNewPage();
      this.addExecutiveSummary();
      
      // Energy Mix
      this.addNewPage();
      await this.addEnergyMixSection();
      
      // Renewable Energy
      this.addNewPage();
      await this.addRenewableSection();
      
      // Consumption Trends
      this.addNewPage();
      await this.addConsumptionTrends();
      
      // Energy Efficiency
      this.addNewPage();
      await this.addEfficiencySection();
      
      // Appendix
      this.addNewPage();
      this.addAppendix(this.getDefinitions());
      
      this.totalPages = this.pageNumber;
      return this.doc;
    } catch (error) {
      console.error('Error generating Energy PDF:', error);
      throw error;
    }
  }

  addExecutiveSummary() {
    this.addPageTitle('Executive Summary');
    
    const narrative = this.generateNarrative();
    this.addAnalysisBox(narrative);
    
    this.addSubsectionTitle('Key Metrics');
    
    const kpis = [
      { label: 'Total Consumption', value: this.data.totalEnergy, unit: 'MWh', color: COLORS.energy },
      { label: 'Renewable Energy', value: this.data.renewablePct, unit: '%', subtitle: `Target: ${BENCHMARKS.renewableEnergy.excellent}%+`, color: COLORS.achievement },
      { label: 'Non-Renewable', value: 100 - this.data.renewablePct, unit: '%', color: COLORS.attention },
      { label: 'Energy Intensity', value: this.data.intensity, unit: this.data.intensity ? `MWh/${this.productionUnit}` : '', color: COLORS.energy },
    ];
    
    this.addKPIGrid(kpis, 4);
  }

  generateNarrative() {
    if (this.data.totalEnergy === 0) {
      return 'Energy consumption data is being collected for this reporting period. Complete energy metrics will enable comprehensive efficiency analysis.';
    }
    
    let narrative = `Total energy consumption for the reporting period is ${this.formatNumber(this.data.totalEnergy)} MWh. `;
    
    if (this.data.renewablePct >= BENCHMARKS.renewableEnergy.excellent) {
      narrative += `Renewable energy at ${this.data.renewablePct.toFixed(1)}% exceeds the ${BENCHMARKS.renewableEnergy.excellent}% industry benchmark, demonstrating leadership in clean energy transition.`;
    } else if (this.data.renewablePct >= BENCHMARKS.renewableEnergy.good) {
      narrative += `Renewable energy at ${this.data.renewablePct.toFixed(1)}% exceeds ${BENCHMARKS.renewableEnergy.good}% but remains below the ${BENCHMARKS.renewableEnergy.excellent}% leadership target.`;
    } else {
      narrative += `Renewable energy at ${this.data.renewablePct.toFixed(1)}% presents significant opportunity for clean energy adoption.`;
    }
    
    return narrative;
  }

  async addEnergyMixSection() {
    this.addPageTitle('Energy Mix', COLORS.energy);
    
    const analysis = this.data.totalEnergy > 0
      ? `The energy mix shows ${this.data.renewablePct.toFixed(1)}% renewable and ${(100 - this.data.renewablePct).toFixed(1)}% non-renewable sources. ${this.data.renewablePct >= BENCHMARKS.renewableEnergy.excellent ? 'This exceeds industry benchmarks for clean energy adoption.' : 'Transitioning to renewable sources can reduce Scope 2 emissions.'}`
      : 'Energy mix data is being collected.';
    
    this.addAnalysisBox(analysis);
    
    await this.addChartFromRef('energy-mix-chart', 'Energy Mix Distribution', 70);
    
    this.addSubsectionTitle('Energy Source Breakdown');
    
    const tableData = [
      ['Source', 'Consumption (MWh)', 'Share'],
      ['Grid Electricity', this.formatNumber(this.data.grid), this.data.totalEnergy > 0 ? `${((this.data.grid / this.data.totalEnergy) * 100).toFixed(1)}%` : '-'],
      ['Solar', this.formatNumber(this.data.solar), this.data.totalEnergy > 0 ? `${((this.data.solar / this.data.totalEnergy) * 100).toFixed(1)}%` : '-'],
      ['Wind', this.formatNumber(this.data.wind), this.data.totalEnergy > 0 ? `${((this.data.wind / this.data.totalEnergy) * 100).toFixed(1)}%` : '-'],
      ['Diesel', this.formatNumber(this.data.diesel), this.data.totalEnergy > 0 ? `${((this.data.diesel / this.data.totalEnergy) * 100).toFixed(1)}%` : '-'],
      ['Natural Gas', this.formatNumber(this.data.naturalGas), this.data.totalEnergy > 0 ? `${((this.data.naturalGas / this.data.totalEnergy) * 100).toFixed(1)}%` : '-'],
      ['Total', this.formatNumber(this.data.totalEnergy), '100%'],
    ];
    
    this.addFullWidthTable(tableData, COLORS.energy);
  }

  async addRenewableSection() {
    this.addPageTitle('Renewable Energy', COLORS.achievement);
    
    const analysis = this.data.renewablePct > 0
      ? `Renewable energy sources contribute ${this.formatNumber(this.data.renewable)} MWh (${this.data.renewablePct.toFixed(1)}%) to total consumption. Key renewable sources include solar (${this.formatNumber(this.data.solar)} MWh) and wind (${this.formatNumber(this.data.wind)} MWh).`
      : 'Renewable energy adoption metrics are being tracked.';
    
    this.addAnalysisBox(analysis);
    
    await this.addChartFromRef('renewable-breakdown-chart', 'Renewable Energy Breakdown', 70);
    await this.addChartFromRef('renewable-trend-chart', 'Renewable Percentage Trend', 60);
  }

  async addConsumptionTrends() {
    this.addPageTitle('Consumption Trends');
    
    this.addAnalysisBox('Monthly energy consumption trends help identify seasonality patterns and the impact of efficiency initiatives. Tracking consumption over time enables better forecasting and optimization.');
    
    await this.addChartFromRef('energy-consumption-trend', 'Monthly Consumption Trend', 80);
    await this.addChartFromRef('energy-by-source-trend', 'Consumption by Source Over Time', 60);
  }

  async addEfficiencySection() {
    this.addPageTitle('Energy Efficiency');
    
    const analysis = this.data.intensity
      ? `Energy intensity of ${this.data.intensity.toFixed(2)} MWh per ${this.productionUnit} provides a normalized view of consumption relative to business output. Improving efficiency reduces both costs and environmental impact.`
      : 'Energy intensity metrics require production data for calculation.';
    
    this.addAnalysisBox(analysis);
    
    await this.addChartFromRef('energy-intensity-chart', 'Energy Intensity Trend', 70);
    
    this.addSubsectionTitle('Efficiency Summary');
    
    const tableData = [
      ['Metric', 'Value', 'Benchmark'],
      ['Total Consumption', `${this.formatNumber(this.data.totalEnergy)} MWh`, '-'],
      ['Renewable Share', `${this.data.renewablePct.toFixed(1)}%`, `${BENCHMARKS.renewableEnergy.excellent}%+`],
      ['Energy Intensity', this.data.intensity ? `${this.data.intensity.toFixed(2)} MWh/${this.productionUnit}` : 'N/A', '-'],
    ];
    
    this.addFullWidthTable(tableData, COLORS.energy);
  }

  getDefinitions() {
    return [
      { term: 'MWh', def: 'Megawatt-hour - a unit of energy equal to 1,000 kilowatt-hours, commonly used for large-scale energy measurement.' },
      { term: 'Renewable Energy', def: 'Energy from sources that are naturally replenished, including solar, wind, hydro, and biomass.' },
      { term: 'Non-Renewable', def: 'Energy from finite sources such as coal, oil, natural gas, and nuclear.' },
      { term: 'Energy Intensity', def: 'Energy consumption per unit of business activity, used to normalize consumption against growth.' },
      { term: 'Grid Electricity', def: 'Electricity purchased from the utility grid, which may include a mix of renewable and non-renewable sources.' },
    ];
  }
}

export default EnergyReportGenerator;
