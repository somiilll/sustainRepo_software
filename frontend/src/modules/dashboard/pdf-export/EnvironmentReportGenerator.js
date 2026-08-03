/**
 * Environment Dashboard PDF Generator
 * Generates comprehensive Environment performance report covering emissions, energy, water, and waste
 */

import { BasePDFGenerator, COLORS, PAGE, BENCHMARKS } from './BasePDFGenerator';

export class EnvironmentReportGenerator extends BasePDFGenerator {
  constructor(options = {}) {
    super(options);
    
    this.reportTitle = 'Environment Report';
    this.reportSubtitle = 'Emissions, Energy, Water & Waste Analysis';
    this.themeColor = COLORS.environmental;
    this.reportVersion = '1.0';
    
    // Environment-specific data
    this.kpis = options.kpis || {};
    this.emissions = options.emissions || {};
    this.energy = options.energy || {};
    this.water = options.water || {};
    this.waste = options.waste || {};
    this.analytics = options.analytics || {};
    
    this.preCalculateData();
  }

  getReportIcon() {
    return 'E';
  }

  preCalculateData() {
    this.data = {
      // Emissions
      totalEmissions: this.emissions.total || this.kpis.total_emissions?.value || 0,
      netEmissions: this.emissions.net || this.kpis.net_emissions?.value || 0,
      scope1: this.emissions.scope1 || 0,
      scope2: this.emissions.scope2 || 0,
      scope3: this.emissions.scope3 || 0,
      
      // Energy
      totalEnergy: this.energy.total || this.kpis.total_energy?.value || 0,
      renewableEnergy: this.energy.renewable || 0,
      nonRenewableEnergy: this.energy.non_renewable || 0,
      renewablePct: this.energy.renewable_pct || 0,
      
      // Water
      waterWithdrawn: this.water.withdrawn || this.kpis.water_withdrawn?.value || 0,
      waterConsumed: this.water.consumed || 0,
      waterDischarged: this.water.discharged || 0,
      waterRecycled: this.water.recycled || 0,
      waterRecycledPct: this.water.recycled_pct || this.kpis.water_recycled_pct?.value || 0,
      
      // Waste
      wasteGenerated: this.waste.generated || this.kpis.waste_generated?.value || 0,
      wasteRecovered: this.waste.recovered || 0,
      wasteDisposed: this.waste.disposed || 0,
      wasteRecoveredPct: this.waste.recovered_pct || this.kpis.waste_recovered_pct?.value || 0,
    };
    
    // Calculate percentages if not provided
    if (this.data.totalEnergy > 0 && this.data.renewablePct === 0 && this.data.renewableEnergy > 0) {
      this.data.renewablePct = (this.data.renewableEnergy / this.data.totalEnergy) * 100;
    }
    
    if (this.data.waterWithdrawn > 0 && this.data.waterRecycledPct === 0 && this.data.waterRecycled > 0) {
      this.data.waterRecycledPct = (this.data.waterRecycled / this.data.waterWithdrawn) * 100;
    }
    
    if (this.data.wasteGenerated > 0 && this.data.wasteRecoveredPct === 0 && this.data.wasteRecovered > 0) {
      this.data.wasteRecoveredPct = (this.data.wasteRecovered / this.data.wasteGenerated) * 100;
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
      await this.addEmissionsSection();
      
      // Scope Breakdown
      this.addNewPage();
      await this.addScopeBreakdownSection();
      
      // Energy Performance
      this.addNewPage();
      await this.addEnergySection();
      
      // Water Management
      this.addNewPage();
      await this.addWaterSection();
      
      // Waste Management
      this.addNewPage();
      await this.addWasteSection();
      
      // AI Insights
      this.addNewPage();
      this.addInsightsSection(this.generateInsights());
      
      // Improvement Opportunities
      this.addNewPage();
      this.addImprovementsSection(this.generateImprovements());
      
      // Appendix
      this.addNewPage();
      this.addAppendix(this.getDefinitions());
      
      this.totalPages = this.pageNumber;
      return this.doc;
    } catch (error) {
      console.error('Error generating Environment PDF:', error);
      throw error;
    }
  }

  addExecutiveSummary() {
    this.addPageTitle('Executive Summary');
    
    const narrative = this.generateNarrative();
    this.addAnalysisBox(narrative);
    
    this.addSubsectionTitle('Key Environmental Metrics');
    
    const kpis = [
      { 
        label: 'Total Emissions', 
        value: this.data.totalEmissions, 
        unit: 'tCO₂e', 
        color: COLORS.emissions 
      },
      { 
        label: 'Renewable Energy', 
        value: this.data.renewablePct, 
        unit: '%', 
        subtitle: `Target: ${BENCHMARKS.renewableEnergy.excellent}%+`,
        color: this.data.renewablePct >= BENCHMARKS.renewableEnergy.good ? COLORS.achievement : COLORS.attention 
      },
      { 
        label: 'Water Recycled', 
        value: this.data.waterRecycledPct, 
        unit: '%', 
        subtitle: `Target: ${BENCHMARKS.waterRecycle.excellent}%+`,
        color: this.data.waterRecycledPct >= BENCHMARKS.waterRecycle.good ? COLORS.achievement : COLORS.attention 
      },
      { 
        label: 'Waste Recovered', 
        value: this.data.wasteRecoveredPct, 
        unit: '%', 
        subtitle: `Target: ${BENCHMARKS.wasteRecovery.excellent}%+`,
        color: this.data.wasteRecoveredPct >= BENCHMARKS.wasteRecovery.good ? COLORS.achievement : COLORS.attention 
      },
    ];
    
    this.addKPIGrid(kpis, 4);
    
    // Additional KPI row
    this.currentY += 5;
    
    const secondaryKpis = [
      { label: 'Total Energy', value: this.data.totalEnergy, unit: 'MWh', color: COLORS.energy },
      { label: 'Water Withdrawal', value: this.data.waterWithdrawn, unit: 'KL', color: COLORS.water },
      { label: 'Waste Generated', value: this.data.wasteGenerated, unit: 'MT', color: COLORS.waste },
    ];
    
    this.addKPIGrid(secondaryKpis, 3);
  }

  generateNarrative() {
    const parts = [];
    
    if (this.data.totalEmissions > 0) {
      parts.push(`Total GHG emissions for the reporting period are ${this.formatNumber(this.data.totalEmissions)} tCO₂e.`);
    }
    
    if (this.data.renewablePct > 0) {
      if (this.data.renewablePct >= BENCHMARKS.renewableEnergy.excellent) {
        parts.push(`Renewable energy at ${this.data.renewablePct.toFixed(1)}% exceeds the ${BENCHMARKS.renewableEnergy.excellent}% benchmark, demonstrating leadership in clean energy.`);
      } else if (this.data.renewablePct >= BENCHMARKS.renewableEnergy.good) {
        parts.push(`Renewable energy at ${this.data.renewablePct.toFixed(1)}% meets industry standards.`);
      } else {
        parts.push(`Renewable energy at ${this.data.renewablePct.toFixed(1)}% presents opportunity for improvement.`);
      }
    }
    
    if (this.data.waterRecycledPct > 0) {
      parts.push(`Water recycling rate is ${this.data.waterRecycledPct.toFixed(1)}%.`);
    }
    
    if (this.data.wasteRecoveredPct > 0) {
      parts.push(`Waste recovery rate is ${this.data.wasteRecoveredPct.toFixed(1)}%.`);
    }
    
    return parts.length > 0 
      ? parts.join(' ') 
      : 'Environmental performance data is being collected across emissions, energy, water, and waste dimensions.';
  }

  async addEmissionsSection() {
    this.addPageTitle('GHG Emissions Overview', COLORS.emissions);
    
    const analysis = this.data.totalEmissions > 0
      ? `Total GHG emissions of ${this.formatNumber(this.data.totalEmissions)} tCO₂e are distributed across Scope 1 (${this.formatNumber(this.data.scope1)} tCO₂e), Scope 2 (${this.formatNumber(this.data.scope2)} tCO₂e), and Scope 3 (${this.formatNumber(this.data.scope3)} tCO₂e).`
      : 'Emissions data is being collected.';
    
    this.addAnalysisBox(analysis);
    
    // Match testId from DashboardEnvironment.jsx SectionCard components
    await this.addChartFromRef('section-scope-1-2', 'Direct & Indirect Emissions (Scope 1 & 2)', 70);
    
    this.addSubsectionTitle('Emissions Summary');
    
    const tableData = [
      ['Scope', 'Emissions (tCO₂e)', 'Share'],
      ['Scope 1 (Direct)', this.formatNumber(this.data.scope1), this.data.totalEmissions > 0 ? `${((this.data.scope1 / this.data.totalEmissions) * 100).toFixed(1)}%` : '-'],
      ['Scope 2 (Indirect)', this.formatNumber(this.data.scope2), this.data.totalEmissions > 0 ? `${((this.data.scope2 / this.data.totalEmissions) * 100).toFixed(1)}%` : '-'],
      ['Scope 3 (Value Chain)', this.formatNumber(this.data.scope3), this.data.totalEmissions > 0 ? `${((this.data.scope3 / this.data.totalEmissions) * 100).toFixed(1)}%` : '-'],
      ['Total', this.formatNumber(this.data.totalEmissions), '100%'],
    ];
    
    this.addFullWidthTable(tableData, COLORS.emissions);
  }

  async addScopeBreakdownSection() {
    this.addPageTitle('Scope 3 Value Chain Emissions');
    
    this.addAnalysisBox('Scope 3 emissions typically represent the largest portion of an organization\'s carbon footprint. Understanding upstream and downstream contributors enables targeted reduction strategies.');
    
    // Match testId from DashboardEnvironment.jsx SectionCard components
    await this.addChartFromRef('section-scope-3', 'Value Chain Emissions (Scope 3)', 80);
  }

  async addEnergySection() {
    this.addPageTitle('Energy Performance', COLORS.energy);
    
    const analysis = this.data.totalEnergy > 0
      ? `Total energy consumption is ${this.formatNumber(this.data.totalEnergy)} MWh, with ${this.data.renewablePct.toFixed(1)}% from renewable sources. ${this.data.renewablePct >= BENCHMARKS.renewableEnergy.good ? 'Energy mix meets sustainability benchmarks.' : 'Increasing renewable energy share will reduce Scope 2 emissions.'}`
      : 'Energy consumption data is being collected.';
    
    this.addAnalysisBox(analysis);
    
    // Match testId from DashboardEnvironment.jsx SectionCard components
    await this.addChartFromRef('section-energy-consumption', 'Energy Consumption', 70);
    await this.addChartFromRef('section-renewable-pct', 'Renewable Energy %', 60);
    
    this.addSubsectionTitle('Energy Summary');
    
    const tableData = [
      ['Metric', 'Value', 'Benchmark'],
      ['Total Consumption', `${this.formatNumber(this.data.totalEnergy)} MWh`, '-'],
      ['Renewable Energy', `${this.formatNumber(this.data.renewableEnergy)} MWh`, '-'],
      ['Renewable Share', `${this.data.renewablePct.toFixed(1)}%`, `${BENCHMARKS.renewableEnergy.excellent}%+`],
      ['Non-Renewable', `${this.formatNumber(this.data.nonRenewableEnergy)} MWh`, '-'],
    ];
    
    this.addFullWidthTable(tableData, COLORS.energy);
  }

  async addWaterSection() {
    this.addPageTitle('Water Management', COLORS.water);
    
    const analysis = this.data.waterWithdrawn > 0
      ? `Water withdrawal totals ${this.formatNumber(this.data.waterWithdrawn)} KL. Water recycling rate of ${this.data.waterRecycledPct.toFixed(1)}% ${this.data.waterRecycledPct >= BENCHMARKS.waterRecycle.good ? 'meets industry benchmarks.' : 'presents opportunity for improvement.'}`
      : 'Water management data is being collected.';
    
    this.addAnalysisBox(analysis);
    
    // Match testId from DashboardEnvironment.jsx SectionCard components
    await this.addChartFromRef('section-water-balance', 'Water Balance', 70);
    await this.addChartFromRef('section-water-trends', 'Water Trends', 60);
    
    this.addSubsectionTitle('Water Summary');
    
    const tableData = [
      ['Metric', 'Value', 'Benchmark'],
      ['Withdrawn', `${this.formatNumber(this.data.waterWithdrawn)} KL`, '-'],
      ['Consumed', `${this.formatNumber(this.data.waterConsumed)} KL`, '-'],
      ['Discharged', `${this.formatNumber(this.data.waterDischarged)} KL`, '-'],
      ['Recycled', `${this.formatNumber(this.data.waterRecycled)} KL`, '-'],
      ['Recycling Rate', `${this.data.waterRecycledPct.toFixed(1)}%`, `${BENCHMARKS.waterRecycle.excellent}%+`],
    ];
    
    this.addFullWidthTable(tableData, COLORS.water);
  }

  async addWasteSection() {
    this.addPageTitle('Waste Management', COLORS.waste);
    
    const analysis = this.data.wasteGenerated > 0
      ? `Total waste generated is ${this.formatNumber(this.data.wasteGenerated)} MT. Waste recovery rate of ${this.data.wasteRecoveredPct.toFixed(1)}% ${this.data.wasteRecoveredPct >= BENCHMARKS.wasteRecovery.good ? 'demonstrates effective waste management.' : 'presents opportunity for circular economy practices.'}`
      : 'Waste management data is being collected.';
    
    this.addAnalysisBox(analysis);
    
    // Match testId from DashboardEnvironment.jsx SectionCard components
    await this.addChartFromRef('section-waste-overview', 'Waste Overview', 70);
    await this.addChartFromRef('section-hazardous-waste', 'Hazardous Waste', 60);
    
    this.addSubsectionTitle('Waste Summary');
    
    const tableData = [
      ['Metric', 'Value', 'Benchmark'],
      ['Generated', `${this.formatNumber(this.data.wasteGenerated)} MT`, '-'],
      ['Recovered', `${this.formatNumber(this.data.wasteRecovered)} MT`, '-'],
      ['Disposed', `${this.formatNumber(this.data.wasteDisposed)} MT`, '-'],
      ['Recovery Rate', `${this.data.wasteRecoveredPct.toFixed(1)}%`, `${BENCHMARKS.wasteRecovery.excellent}%+`],
    ];
    
    this.addFullWidthTable(tableData, COLORS.waste);
  }

  getDefinitions() {
    return [
      { term: 'tCO₂e', def: 'Tonnes of carbon dioxide equivalent - a standard unit for measuring greenhouse gas emissions.' },
      { term: 'Scope 1', def: 'Direct emissions from owned or controlled sources (e.g., company vehicles, on-site fuel combustion).' },
      { term: 'Scope 2', def: 'Indirect emissions from purchased electricity, steam, heating, and cooling.' },
      { term: 'Scope 3', def: 'All other indirect emissions in the value chain (upstream and downstream).' },
      { term: 'MWh', def: 'Megawatt-hour - a unit of energy commonly used for large-scale energy measurement.' },
      { term: 'KL', def: 'Kiloliters - a unit of volume equal to 1,000 liters, used for water measurement.' },
      { term: 'MT', def: 'Metric Tonnes - a unit of mass equal to 1,000 kilograms, used for waste measurement.' },
      { term: 'Renewable Energy', def: 'Energy from sources that are naturally replenished (solar, wind, hydro, biomass).' },
    ];
  }

  generateInsights() {
    const insights = [];
    
    // Emissions insights
    if (this.data.totalEmissions > 0 && this.data.scope3 > 0) {
      const scope3Pct = (this.data.scope3 / this.data.totalEmissions) * 100;
      if (scope3Pct > 60) {
        insights.push({
          category: 'FOCUS AREA',
          text: `Scope 3 emissions represent ${scope3Pct.toFixed(0)}% of total emissions. Engaging suppliers and customers on decarbonization will have significant impact.`,
          color: COLORS.attention,
        });
      }
    }
    
    // Energy insights
    if (this.data.renewablePct >= BENCHMARKS.renewableEnergy.excellent) {
      insights.push({
        category: 'STRENGTH',
        text: `Renewable energy at ${this.data.renewablePct.toFixed(1)}% exceeds the ${BENCHMARKS.renewableEnergy.excellent}% benchmark, demonstrating leadership in clean energy transition.`,
        color: COLORS.achievement,
      });
    } else if (this.data.renewablePct > 0 && this.data.renewablePct < BENCHMARKS.renewableEnergy.good) {
      insights.push({
        category: 'OPPORTUNITY',
        text: `Renewable energy at ${this.data.renewablePct.toFixed(1)}% is below the ${BENCHMARKS.renewableEnergy.good}% benchmark. Increasing renewable share will reduce Scope 2 emissions.`,
        color: COLORS.attention,
      });
    }
    
    // Water insights
    if (this.data.waterRecycledPct >= BENCHMARKS.waterRecycle.excellent) {
      insights.push({
        category: 'ACHIEVEMENT',
        text: `Water recycling rate of ${this.data.waterRecycledPct.toFixed(1)}% exceeds the ${BENCHMARKS.waterRecycle.excellent}% target.`,
        color: COLORS.achievement,
      });
    }
    
    // Waste insights
    if (this.data.wasteRecoveredPct >= BENCHMARKS.wasteRecovery.excellent) {
      insights.push({
        category: 'ACHIEVEMENT',
        text: `Waste recovery rate of ${this.data.wasteRecoveredPct.toFixed(1)}% demonstrates commitment to circular economy practices.`,
        color: COLORS.achievement,
      });
    } else if (this.data.wasteRecoveredPct > 0 && this.data.wasteRecoveredPct < BENCHMARKS.wasteRecovery.good) {
      insights.push({
        category: 'OPPORTUNITY',
        text: `Waste recovery at ${this.data.wasteRecoveredPct.toFixed(1)}% is below the ${BENCHMARKS.wasteRecovery.good}% benchmark. Implementing segregation and recycling programs can improve performance.`,
        color: COLORS.attention,
      });
    }
    
    if (insights.length === 0) {
      insights.push({
        category: 'BASELINE',
        text: 'Environmental metrics are being established. Continue monitoring to identify optimization opportunities.',
        color: COLORS.primary,
      });
    }
    
    return insights;
  }

  generateImprovements() {
    const improvements = [];
    
    // Emissions improvements
    if (this.data.scope3 > this.data.scope1 + this.data.scope2) {
      improvements.push({
        priority: 'High',
        action: 'Engage top suppliers on carbon reduction targets',
        impact: 'High',
        timeline: '12 months',
      });
    }
    
    // Energy improvements
    if (this.data.renewablePct < BENCHMARKS.renewableEnergy.excellent) {
      improvements.push({
        priority: 'High',
        action: 'Procure renewable energy certificates or sign PPAs',
        impact: 'High',
        timeline: '6 months',
      });
    }
    
    // Water improvements
    if (this.data.waterRecycledPct < BENCHMARKS.waterRecycle.good) {
      improvements.push({
        priority: 'Medium',
        action: 'Implement water recycling and rainwater harvesting systems',
        impact: 'Medium',
        timeline: '12 months',
      });
    }
    
    // Waste improvements
    if (this.data.wasteRecoveredPct < BENCHMARKS.wasteRecovery.good) {
      improvements.push({
        priority: 'Medium',
        action: 'Enhance waste segregation and partner with recycling vendors',
        impact: 'Medium',
        timeline: '6 months',
      });
    }
    
    // Default improvements
    improvements.push({
      priority: 'Medium',
      action: 'Conduct comprehensive environmental audit',
      impact: 'Medium',
      timeline: '3 months',
    });
    
    improvements.push({
      priority: 'Low',
      action: 'Implement real-time environmental monitoring dashboard',
      impact: 'Medium',
      timeline: '6 months',
    });
    
    return improvements.slice(0, 6);
  }
}

export default EnvironmentReportGenerator;
