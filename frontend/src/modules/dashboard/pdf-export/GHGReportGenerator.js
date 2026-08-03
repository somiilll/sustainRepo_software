/**
 * GHG Dashboard PDF Generator
 * Generates comprehensive GHG/Emissions performance report
 */

import { BasePDFGenerator, COLORS, PAGE, BENCHMARKS } from './BasePDFGenerator';

export class GHGReportGenerator extends BasePDFGenerator {
  constructor(options = {}) {
    super(options);
    
    this.reportTitle = 'GHG Emissions Report';
    this.reportSubtitle = 'Greenhouse Gas Performance Analysis';
    this.themeColor = COLORS.ghg;
    this.reportVersion = '1.0';
    
    // GHG-specific data
    this.emissions = options.emissions || {};
    this.analytics = options.analytics || {};
    this.trends = options.trends || [];
    
    this.preCalculateData();
  }

  getReportIcon() {
    return 'CO2';
  }

  preCalculateData() {
    const ghg = this.emissions?.ghg_emissions || this.emissions || {};
    
    this.data = {
      scope1: ghg.total_scope1 || ghg.scope1 || 0,
      scope2: ghg.total_scope2 || ghg.scope2 || 0,
      scope3: ghg.total_scope3 || ghg.scope3 || 0,
      totalEmissions: 0,
    };
    
    this.data.totalEmissions = this.data.scope1 + this.data.scope2 + this.data.scope3;
    
    if (this.data.totalEmissions > 0) {
      this.data.scope1Pct = (this.data.scope1 / this.data.totalEmissions) * 100;
      this.data.scope2Pct = (this.data.scope2 / this.data.totalEmissions) * 100;
      this.data.scope3Pct = (this.data.scope3 / this.data.totalEmissions) * 100;
    }
  }

  async generate() {
    try {
      // Cover Page
      this.addCoverPage();
      
      // Executive Summary
      this.addNewPage();
      this.addExecutiveSummary();
      
      // Emissions Overview
      this.addNewPage();
      await this.addEmissionsOverview();
      
      // Scope 1 Details
      this.addNewPage();
      await this.addScope1Section();
      
      // Scope 2 Details
      this.addNewPage();
      await this.addScope2Section();
      
      // Scope 3 Details (if applicable)
      if (this.data.scope3 > 0) {
        this.addNewPage();
        await this.addScope3Section();
      }
      
      // Trend Analysis
      this.addNewPage();
      await this.addTrendAnalysis();
      
      // Appendix
      this.addNewPage();
      this.addAppendix(this.getDefinitions());
      
      this.totalPages = this.pageNumber;
      return this.doc;
    } catch (error) {
      console.error('Error generating GHG PDF:', error);
      throw error;
    }
  }

  addExecutiveSummary() {
    this.addPageTitle('Executive Summary');
    
    // Narrative
    const narrative = this.generateNarrative();
    this.addAnalysisBox(narrative);
    
    // KPI Grid
    this.addSubsectionTitle('Key Metrics');
    
    const kpis = [
      { label: 'Total Emissions', value: this.data.totalEmissions, unit: this.getCO2Unit(), color: COLORS.emissions },
      { label: 'Scope 1', value: this.data.scope1, unit: this.getCO2Unit(), subtitle: this.data.scope1Pct ? `${this.data.scope1Pct.toFixed(1)}%` : null, color: '#059669' },
      { label: 'Scope 2', value: this.data.scope2, unit: this.getCO2Unit(), subtitle: this.data.scope2Pct ? `${this.data.scope2Pct.toFixed(1)}%` : null, color: '#3B82F6' },
      { label: 'Scope 3', value: this.data.scope3, unit: this.getCO2Unit(), subtitle: this.data.scope3Pct ? `${this.data.scope3Pct.toFixed(1)}%` : null, color: '#8B5CF6' },
    ];
    
    this.addKPIGrid(kpis, 4);
  }

  generateNarrative() {
    if (this.data.totalEmissions === 0) {
      return 'GHG emissions data is being collected for this reporting period. Complete emissions inventory will enable comprehensive carbon footprint analysis.';
    }
    
    const maxScope = Math.max(this.data.scope1, this.data.scope2, this.data.scope3);
    const maxScopeName = maxScope === this.data.scope1 ? 'Scope 1 (direct)' : maxScope === this.data.scope2 ? 'Scope 2 (energy)' : 'Scope 3 (value chain)';
    const maxPct = ((maxScope / this.data.totalEmissions) * 100).toFixed(0);
    
    return `Total GHG emissions for the reporting period amount to ${this.formatNumber(this.data.totalEmissions)} ${this.getCO2Unit()}. ${maxScopeName} emissions represent the largest contributor at ${maxPct}% of total emissions, making it the primary focus area for decarbonization initiatives.`;
  }

  async addEmissionsOverview() {
    this.addPageTitle('Emissions Overview', COLORS.emissions);
    
    this.addAnalysisBox(this.generateOverviewAnalysis());
    
    // Main chart
    await this.addChartFromRef('ghg-emission-trend', 'GHG Emission Trend', 70);
    
    // Scope breakdown table
    this.addSubsectionTitle('Scope Breakdown');
    
    const tableData = [
      ['Scope', `Emissions (${this.getCO2Unit()})`, 'Contribution', 'Description'],
      ['Scope 1', this.formatNumber(this.data.scope1), this.data.totalEmissions > 0 ? `${this.data.scope1Pct.toFixed(1)}%` : '-', 'Direct emissions'],
      ['Scope 2', this.formatNumber(this.data.scope2), this.data.totalEmissions > 0 ? `${this.data.scope2Pct.toFixed(1)}%` : '-', 'Purchased energy'],
      ['Scope 3', this.formatNumber(this.data.scope3), this.data.totalEmissions > 0 ? `${this.data.scope3Pct.toFixed(1)}%` : '-', 'Value chain'],
      ['Total', this.formatNumber(this.data.totalEmissions), '100%', 'All scopes'],
    ];
    
    this.addFullWidthTable(tableData, COLORS.emissions);
  }

  generateOverviewAnalysis() {
    if (this.data.totalEmissions === 0) {
      return 'Emissions data collection is in progress across all scopes.';
    }
    
    const parts = [];
    
    if (this.data.scope1Pct > 50) {
      parts.push(`Scope 1 direct emissions dominate at ${this.data.scope1Pct.toFixed(0)}%, indicating significant opportunity for operational efficiency improvements and fuel switching.`);
    } else if (this.data.scope2Pct > 50) {
      parts.push(`Scope 2 indirect emissions represent ${this.data.scope2Pct.toFixed(0)}% of total, suggesting renewable energy procurement could significantly reduce the carbon footprint.`);
    } else if (this.data.scope3Pct > 50) {
      parts.push(`Scope 3 value chain emissions account for ${this.data.scope3Pct.toFixed(0)}%, highlighting the importance of supplier engagement and sustainable procurement.`);
    }
    
    return parts.length > 0 ? parts.join(' ') : 'Emissions are distributed across all three scopes.';
  }

  async addScope1Section() {
    this.addPageTitle('Scope 1 - Direct Emissions', '#059669');
    
    const analysis = this.data.scope1 > 0 
      ? `Scope 1 emissions of ${this.formatNumber(this.data.scope1)} ${this.getCO2Unit()} arise from sources owned or controlled by the organization. Key sources include stationary combustion (boilers, furnaces), mobile combustion (fleet vehicles), process emissions, and fugitive emissions (refrigerants, leaks).`
      : 'Scope 1 emissions data is being collected for this reporting period.';
    
    this.addAnalysisBox(analysis);
    
    await this.addChartFromRef('scope1-breakdown-chart', 'Scope 1 Breakdown', 70);
    await this.addChartFromRef('scope1-trend-chart', 'Scope 1 Monthly Trend', 60);
  }

  async addScope2Section() {
    this.addPageTitle('Scope 2 - Energy Indirect', '#3B82F6');
    
    const analysis = this.data.scope2 > 0 
      ? `Scope 2 emissions of ${this.formatNumber(this.data.scope2)} ${this.getCO2Unit()} result from purchased electricity, steam, heating, and cooling. Transitioning to renewable energy sources can significantly reduce these emissions.`
      : 'Scope 2 emissions data is being collected for this reporting period.';
    
    this.addAnalysisBox(analysis);
    
    await this.addChartFromRef('scope2-breakdown-chart', 'Scope 2 Breakdown', 70);
    await this.addChartFromRef('scope2-trend-chart', 'Scope 2 Monthly Trend', 60);
  }

  async addScope3Section() {
    this.addPageTitle('Scope 3 - Value Chain', '#8B5CF6');
    
    const analysis = this.data.scope3 > 0 
      ? `Scope 3 emissions of ${this.formatNumber(this.data.scope3)} ${this.getCO2Unit()} encompass all other indirect emissions in the value chain, including purchased goods and services, business travel, employee commuting, and end-of-life treatment of sold products.`
      : 'Scope 3 emissions data is being collected for this reporting period.';
    
    this.addAnalysisBox(analysis);
    
    await this.addChartFromRef('scope3-categories-chart', 'Scope 3 Categories', 70);
    await this.addChartFromRef('scope3-trend-chart', 'Scope 3 Monthly Trend', 60);
  }

  async addTrendAnalysis() {
    this.addPageTitle('Trend Analysis');
    
    this.addAnalysisBox('Historical emissions trends provide insight into progress toward decarbonization goals. Month-over-month and year-over-year comparisons help identify seasonality and the impact of reduction initiatives.');
    
    await this.addChartFromRef('emissions-trend-chart', 'Historical Emissions Trend', 80);
    await this.addChartFromRef('emissions-intensity-chart', 'Carbon Intensity Trend', 60);
  }

  getDefinitions() {
    return [
      { term: 'Scope 1', def: 'Direct GHG emissions from sources owned or controlled by the organization, including combustion of fuels in owned vehicles and facilities.' },
      { term: 'Scope 2', def: 'Indirect GHG emissions from the generation of purchased electricity, steam, heating, and cooling consumed by the organization.' },
      { term: 'Scope 3', def: 'All other indirect GHG emissions that occur in the value chain of the organization, both upstream and downstream.' },
      { term: this.getCO2Unit(), def: 'Tonnes of carbon dioxide equivalent - a standard unit for measuring carbon footprints that includes all greenhouse gases.' },
      { term: 'Carbon Intensity', def: 'GHG emissions per unit of business activity (e.g., per revenue, per employee, per product unit).' },
    ];
  }
}

export default GHGReportGenerator;
