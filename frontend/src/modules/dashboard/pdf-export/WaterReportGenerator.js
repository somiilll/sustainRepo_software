/**
 * Water Dashboard PDF Generator
 * Generates comprehensive Water performance report
 */

import { BasePDFGenerator, COLORS, PAGE, BENCHMARKS } from './BasePDFGenerator';

export class WaterReportGenerator extends BasePDFGenerator {
  constructor(options = {}) {
    super(options);
    
    this.reportTitle = 'Water Report';
    this.reportSubtitle = 'Water Management & Stewardship Analysis';
    this.themeColor = COLORS.water;
    this.reportVersion = '1.0';
    
    // Water-specific data
    this.water = options.water || {};
    this.analytics = options.analytics || {};
    
    this.preCalculateData();
  }

  getReportIcon() {
    return 'W';
  }

  preCalculateData() {
    this.data = {
      withdrawn: this.water.withdrawn || 0,
      consumed: this.water.consumed || 0,
      discharged: this.water.discharged || 0,
      recycled: this.water.recycled || 0,
      groundwater: this.water.groundwater || 0,
      surfaceWater: this.water.surface_water || 0,
      municipal: this.water.municipal || 0,
      rainwater: this.water.rainwater || 0,
    };
    
    // Calculate rates
    this.data.recycleRate = this.data.withdrawn > 0 
      ? (this.data.recycled / this.data.withdrawn) * 100 
      : 0;
    
    this.data.dischargeRate = this.data.withdrawn > 0 
      ? (this.data.discharged / this.data.withdrawn) * 100 
      : 0;
  }

  async generate() {
    try {
      // Cover Page
      this.addCoverPage();
      
      // Executive Summary
      this.addNewPage();
      this.addExecutiveSummary();
      
      // Water Balance
      this.addNewPage();
      await this.addWaterBalanceSection();
      
      // Water Sources
      this.addNewPage();
      await this.addSourcesSection();
      
      // Recycling & Efficiency
      this.addNewPage();
      await this.addRecyclingSection();
      
      // Trends
      this.addNewPage();
      await this.addTrendsSection();
      
      // Appendix
      this.addNewPage();
      this.addAppendix(this.getDefinitions());
      
      this.totalPages = this.pageNumber;
      return this.doc;
    } catch (error) {
      console.error('Error generating Water PDF:', error);
      throw error;
    }
  }

  addExecutiveSummary() {
    this.addPageTitle('Executive Summary');
    
    const narrative = this.generateNarrative();
    this.addAnalysisBox(narrative);
    
    this.addSubsectionTitle('Key Metrics');
    
    const kpis = [
      { label: 'Water Withdrawn', value: this.data.withdrawn, unit: 'KL', color: COLORS.water },
      { label: 'Water Consumed', value: this.data.consumed, unit: 'KL', color: '#6366F1' },
      { label: 'Water Discharged', value: this.data.discharged, unit: 'KL', color: '#F97316' },
      { label: 'Water Recycled', value: this.data.recycled, unit: 'KL', subtitle: `Rate: ${this.data.recycleRate.toFixed(0)}%`, color: COLORS.achievement },
    ];
    
    this.addKPIGrid(kpis, 4);
  }

  generateNarrative() {
    if (this.data.withdrawn === 0) {
      return 'Water management data is being collected for this reporting period. Complete water metrics will enable comprehensive stewardship analysis.';
    }
    
    let narrative = `Total water withdrawal for the reporting period is ${this.formatNumber(this.data.withdrawn)} KL. `;
    
    if (this.data.recycleRate >= BENCHMARKS.waterRecycle.excellent) {
      narrative += `Water recycling rate of ${this.data.recycleRate.toFixed(0)}% exceeds the ${BENCHMARKS.waterRecycle.excellent}% benchmark, demonstrating excellent water stewardship.`;
    } else if (this.data.recycleRate >= BENCHMARKS.waterRecycle.good) {
      narrative += `Water recycling rate of ${this.data.recycleRate.toFixed(0)}% meets the ${BENCHMARKS.waterRecycle.good}% benchmark.`;
    } else if (this.data.recycled > 0) {
      narrative += `Water recycling rate of ${this.data.recycleRate.toFixed(0)}% indicates opportunity for expanded water reuse programs.`;
    }
    
    return narrative;
  }

  async addWaterBalanceSection() {
    this.addPageTitle('Water Balance', COLORS.water);
    
    const analysis = this.data.withdrawn > 0
      ? `The water balance shows ${this.formatNumber(this.data.withdrawn)} KL withdrawn, ${this.formatNumber(this.data.consumed)} KL consumed, ${this.formatNumber(this.data.discharged)} KL discharged, and ${this.formatNumber(this.data.recycled)} KL recycled. ${this.data.recycled > this.data.discharged ? 'Strong recycling performance reduces freshwater demand.' : 'Expanding recycling can reduce withdrawal needs.'}`
      : 'Water balance data is being collected.';
    
    this.addAnalysisBox(analysis);
    
    await this.addChartFromRef('water-flow-chart', 'Water Flow Balance', 70);
    
    this.addSubsectionTitle('Water Flow Summary');
    
    const tableData = [
      ['Flow Type', 'Volume (KL)', 'Share of Withdrawal'],
      ['Withdrawn', this.formatNumber(this.data.withdrawn), '100%'],
      ['Consumed', this.formatNumber(this.data.consumed), this.data.withdrawn > 0 ? `${((this.data.consumed / this.data.withdrawn) * 100).toFixed(1)}%` : '-'],
      ['Discharged', this.formatNumber(this.data.discharged), this.data.withdrawn > 0 ? `${this.data.dischargeRate.toFixed(1)}%` : '-'],
      ['Recycled', this.formatNumber(this.data.recycled), this.data.withdrawn > 0 ? `${this.data.recycleRate.toFixed(1)}%` : '-'],
    ];
    
    this.addFullWidthTable(tableData, COLORS.water);
  }

  async addSourcesSection() {
    this.addPageTitle('Water Sources');
    
    const analysis = 'Water withdrawal by source helps identify dependency on specific water resources and opportunities for diversification. Reducing groundwater dependency through rainwater harvesting and recycling improves sustainability.';
    
    this.addAnalysisBox(analysis);
    
    await this.addChartFromRef('water-sources-chart', 'Water Sources Distribution', 70);
    
    this.addSubsectionTitle('Source Breakdown');
    
    const tableData = [
      ['Source', 'Volume (KL)', 'Share'],
      ['Municipal Supply', this.formatNumber(this.data.municipal), this.data.withdrawn > 0 ? `${((this.data.municipal / this.data.withdrawn) * 100).toFixed(1)}%` : '-'],
      ['Groundwater', this.formatNumber(this.data.groundwater), this.data.withdrawn > 0 ? `${((this.data.groundwater / this.data.withdrawn) * 100).toFixed(1)}%` : '-'],
      ['Surface Water', this.formatNumber(this.data.surfaceWater), this.data.withdrawn > 0 ? `${((this.data.surfaceWater / this.data.withdrawn) * 100).toFixed(1)}%` : '-'],
      ['Rainwater', this.formatNumber(this.data.rainwater), this.data.withdrawn > 0 ? `${((this.data.rainwater / this.data.withdrawn) * 100).toFixed(1)}%` : '-'],
    ];
    
    this.addFullWidthTable(tableData, COLORS.water);
  }

  async addRecyclingSection() {
    this.addPageTitle('Water Recycling & Efficiency', COLORS.achievement);
    
    const analysis = this.data.recycleRate >= BENCHMARKS.waterRecycle.excellent
      ? `Water recycling rate of ${this.data.recycleRate.toFixed(0)}% exceeds the ${BENCHMARKS.waterRecycle.excellent}% industry benchmark, indicating effective water stewardship and commitment to resource conservation.`
      : this.data.recycleRate >= BENCHMARKS.waterRecycle.good
        ? `Water recycling rate of ${this.data.recycleRate.toFixed(0)}% meets the ${BENCHMARKS.waterRecycle.good}% benchmark. Further investment in water treatment can help reach the ${BENCHMARKS.waterRecycle.excellent}% target.`
        : `Water recycling rate of ${this.data.recycleRate.toFixed(0)}% presents opportunity for improvement. Target benchmark is ${BENCHMARKS.waterRecycle.good}% or higher.`;
    
    this.addAnalysisBox(analysis);
    
    await this.addChartFromRef('water-recycling-trend', 'Recycling Rate Trend', 70);
    
    this.addSubsectionTitle('Efficiency Metrics');
    
    const tableData = [
      ['Metric', 'Value', 'Benchmark'],
      ['Recycling Rate', `${this.data.recycleRate.toFixed(1)}%`, `${BENCHMARKS.waterRecycle.excellent}%+`],
      ['Discharge Rate', `${this.data.dischargeRate.toFixed(1)}%`, '-'],
      ['Water Recycled', `${this.formatNumber(this.data.recycled)} KL`, '-'],
    ];
    
    this.addFullWidthTable(tableData, COLORS.achievement);
  }

  async addTrendsSection() {
    this.addPageTitle('Consumption Trends');
    
    this.addAnalysisBox('Tracking water consumption trends helps identify seasonality, efficiency improvements, and the impact of conservation initiatives over time.');
    
    await this.addChartFromRef('water-consumption-trend', 'Monthly Water Consumption', 70);
    await this.addChartFromRef('water-intensity-chart', 'Water Intensity Trend', 60);
  }

  getDefinitions() {
    return [
      { term: 'KL', def: 'Kilolitre - a unit of volume equal to 1,000 litres, commonly used for water measurement.' },
      { term: 'Water Withdrawal', def: 'Total volume of water drawn from any source for use by the organization.' },
      { term: 'Water Consumption', def: 'Water that is used and not returned to the original water source (evaporated, incorporated into products, etc.).' },
      { term: 'Water Discharge', def: 'Water released back to the environment after use, typically to surface water or sewage systems.' },
      { term: 'Water Recycling', def: 'Water that is treated and reused within the organization, reducing freshwater withdrawal needs.' },
    ];
  }
}

export default WaterReportGenerator;
