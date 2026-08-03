/**
 * Social Dashboard PDF Generator
 * Generates comprehensive Social performance report
 */

import { BasePDFGenerator, COLORS, PAGE, BENCHMARKS } from './BasePDFGenerator';

export class SocialReportGenerator extends BasePDFGenerator {
  constructor(options = {}) {
    super(options);
    
    this.reportTitle = 'Social Report';
    this.reportSubtitle = 'Workforce, Safety & Community Analysis';
    this.themeColor = COLORS.social;
    this.reportVersion = '1.0';
    
    // Social-specific data
    this.kpis = options.kpis || {};
    this.workforce = options.workforce || {};
    this.analytics = options.analytics || {};
    
    this.preCalculateData();
  }

  getReportIcon() {
    return 'S';
  }

  preCalculateData() {
    this.data = {
      employees: this.kpis.total_employees?.value || this.workforce.total || 0,
      turnover: this.kpis.turnover_pct?.value,
      ltifr: this.kpis.ltifr?.value,
      diversityPct: this.kpis.diversity_pct?.value,
      maleCount: this.workforce.male || 0,
      femaleCount: this.workforce.female || 0,
      newHires: this.workforce.new_hires || 0,
      attrition: this.workforce.attrition || 0,
      trainingHours: this.workforce.training_hours || 0,
      healthSafetyIncidents: this.analytics?.incidents?.healthSafety || 0,
      boardDiversity: this.workforce.board_diversity || 0,
    };
    
    // Calculate derived metrics
    if (this.data.employees > 0 && this.data.femaleCount > 0 && this.data.diversityPct == null) {
      this.data.diversityPct = (this.data.femaleCount / this.data.employees) * 100;
    }
  }

  async generate() {
    try {
      // Cover Page
      this.addCoverPage();
      
      // Executive Summary
      this.addNewPage();
      this.addExecutiveSummary();
      
      // Workforce Overview
      this.addNewPage();
      await this.addWorkforceSection();
      
      // Diversity & Inclusion
      this.addNewPage();
      await this.addDiversitySection();
      
      // Health & Safety
      this.addNewPage();
      await this.addSafetySection();
      
      // Training & Development
      this.addNewPage();
      await this.addTrainingSection();
      
      // Appendix
      this.addNewPage();
      this.addAppendix(this.getDefinitions());
      
      this.totalPages = this.pageNumber;
      return this.doc;
    } catch (error) {
      console.error('Error generating Social PDF:', error);
      throw error;
    }
  }

  addExecutiveSummary() {
    this.addPageTitle('Executive Summary');
    
    const narrative = this.generateNarrative();
    this.addAnalysisBox(narrative);
    
    this.addSubsectionTitle('Key Metrics');
    
    const kpis = [
      { label: 'Total Employees', value: this.data.employees, unit: '', color: COLORS.social },
      { label: 'Employee Turnover', value: this.data.turnover, unit: '%', subtitle: `Target: <${BENCHMARKS.turnover.good}%`, color: this.data.turnover != null && this.data.turnover < BENCHMARKS.turnover.good ? COLORS.achievement : COLORS.attention },
      { label: 'LTIFR', value: this.data.ltifr, unit: '', subtitle: `Target: <${BENCHMARKS.ltifr.good}`, color: this.data.ltifr != null && this.data.ltifr < BENCHMARKS.ltifr.good ? COLORS.achievement : COLORS.attention },
      { label: 'Female Workforce', value: this.data.diversityPct, unit: '%', subtitle: `Target: ${BENCHMARKS.diversity.excellent}%+`, color: this.data.diversityPct != null && this.data.diversityPct >= BENCHMARKS.diversity.good ? COLORS.achievement : COLORS.attention },
    ];
    
    this.addKPIGrid(kpis, 4);
  }

  generateNarrative() {
    const parts = [];
    
    if (this.data.employees > 0) {
      parts.push(`The organization employs ${this.formatNumber(this.data.employees)} people.`);
    }
    
    if (this.data.turnover != null) {
      if (this.data.turnover < BENCHMARKS.turnover.excellent) {
        parts.push(`Employee turnover at ${this.data.turnover.toFixed(1)}% is well below the ${BENCHMARKS.turnover.good}% benchmark, indicating excellent workforce retention.`);
      } else if (this.data.turnover < BENCHMARKS.turnover.good) {
        parts.push(`Employee turnover at ${this.data.turnover.toFixed(1)}% meets the <${BENCHMARKS.turnover.good}% benchmark.`);
      } else {
        parts.push(`Employee turnover at ${this.data.turnover.toFixed(1)}% exceeds the ${BENCHMARKS.turnover.good}% benchmark.`);
      }
    }
    
    if (this.data.ltifr != null) {
      if (this.data.ltifr < BENCHMARKS.ltifr.excellent) {
        parts.push(`LTIFR of ${this.data.ltifr.toFixed(2)} demonstrates industry-leading safety performance.`);
      } else if (this.data.ltifr > BENCHMARKS.ltifr.fair) {
        parts.push(`LTIFR of ${this.data.ltifr.toFixed(2)} indicates opportunity for safety program improvements.`);
      }
    }
    
    return parts.length > 0 ? parts.join(' ') : 'Social performance data is being collected across workforce, safety, and community dimensions.';
  }

  async addWorkforceSection() {
    this.addPageTitle('Workforce Overview', COLORS.social);
    
    const analysis = this.data.employees > 0
      ? `The workforce comprises ${this.formatNumber(this.data.employees)} employees. ${this.data.newHires > 0 ? `New hires: ${this.formatNumber(this.data.newHires)}.` : ''} ${this.data.attrition > 0 ? `Attrition: ${this.formatNumber(this.data.attrition)}.` : ''}`
      : 'Workforce data is being collected.';
    
    this.addAnalysisBox(analysis);
    
    await this.addChartFromRef('workforce-composition-chart', 'Workforce Composition', 70);
    
    this.addSubsectionTitle('Workforce Summary');
    
    const tableData = [
      ['Metric', 'Value', 'Benchmark'],
      ['Total Employees', this.formatNumber(this.data.employees), '-'],
      ['Male Employees', this.formatNumber(this.data.maleCount), '-'],
      ['Female Employees', this.formatNumber(this.data.femaleCount), '-'],
      ['New Hires', this.formatNumber(this.data.newHires), '-'],
      ['Attrition', this.formatNumber(this.data.attrition), '-'],
      ['Turnover Rate', this.data.turnover != null ? `${this.data.turnover.toFixed(1)}%` : 'N/A', `<${BENCHMARKS.turnover.good}%`],
    ];
    
    this.addFullWidthTable(tableData, COLORS.social);
  }

  async addDiversitySection() {
    this.addPageTitle('Diversity & Inclusion');
    
    const analysis = this.data.diversityPct != null
      ? this.data.diversityPct >= BENCHMARKS.diversity.excellent
        ? `Gender diversity at ${this.data.diversityPct.toFixed(0)}% female representation exceeds the ${BENCHMARKS.diversity.excellent}% target, demonstrating commitment to inclusive employment.`
        : this.data.diversityPct >= BENCHMARKS.diversity.good
          ? `Gender diversity at ${this.data.diversityPct.toFixed(0)}% female representation meets the ${BENCHMARKS.diversity.good}% baseline. Continued focus can achieve the ${BENCHMARKS.diversity.excellent}% target.`
          : `Gender diversity at ${this.data.diversityPct.toFixed(0)}% female representation presents opportunity for improvement toward the ${BENCHMARKS.diversity.good}%+ target.`
      : 'Diversity metrics are being tracked.';
    
    this.addAnalysisBox(analysis);
    
    await this.addChartFromRef('employee-diversity-chart', 'Employee Diversity', 70);
    await this.addChartFromRef('board-diversity-chart', 'Board Diversity', 60);
  }

  async addSafetySection() {
    this.addPageTitle('Health & Safety', this.data.ltifr != null && this.data.ltifr < BENCHMARKS.ltifr.good ? COLORS.achievement : COLORS.attention);
    
    const analysis = this.data.ltifr != null
      ? this.data.ltifr < BENCHMARKS.ltifr.excellent
        ? `LTIFR of ${this.data.ltifr.toFixed(2)} is below the ${BENCHMARKS.ltifr.excellent} benchmark, indicating industry-leading safety performance with minimal lost-time injuries.`
        : this.data.ltifr < BENCHMARKS.ltifr.good
          ? `LTIFR of ${this.data.ltifr.toFixed(2)} is within the acceptable range (<${BENCHMARKS.ltifr.good}). Continued vigilance maintains safe working conditions.`
          : `LTIFR of ${this.data.ltifr.toFixed(2)} exceeds the ${BENCHMARKS.ltifr.good} benchmark and indicates need for enhanced safety programs and risk mitigation.`
      : 'Safety metrics including LTIFR are being tracked.';
    
    this.addAnalysisBox(analysis);
    
    await this.addChartFromRef('ltifr-trend-chart', 'LTIFR Trend', 70);
    
    this.addSubsectionTitle('Safety Metrics');
    
    const tableData = [
      ['Metric', 'Value', 'Benchmark'],
      ['LTIFR', this.data.ltifr != null ? this.data.ltifr.toFixed(2) : 'N/A', `<${BENCHMARKS.ltifr.good}`],
      ['H&S Incidents', this.formatNumber(this.data.healthSafetyIncidents), '-'],
    ];
    
    this.addFullWidthTable(tableData, COLORS.attention);
  }

  async addTrainingSection() {
    this.addPageTitle('Training & Development');
    
    const analysis = this.data.trainingHours > 0
      ? `Total training hours of ${this.formatNumber(this.data.trainingHours)} demonstrate investment in employee development. ${this.data.employees > 0 ? `Average of ${(this.data.trainingHours / this.data.employees).toFixed(1)} hours per employee.` : ''}`
      : 'Training and development metrics are being tracked.';
    
    this.addAnalysisBox(analysis);
    
    await this.addChartFromRef('training-trend-chart', 'Training Trend', 70);
    await this.addChartFromRef('training-by-category', 'Training by Category', 60);
  }

  getDefinitions() {
    return [
      { term: 'LTIFR', def: 'Lost Time Injury Frequency Rate - number of lost-time injuries per million hours worked. Lower is better.' },
      { term: 'Employee Turnover', def: 'Percentage of employees who leave the organization during the reporting period.' },
      { term: 'Diversity', def: 'Representation of different demographics including gender, ethnicity, and age in the workforce.' },
      { term: 'New Hires', def: 'Number of new employees joining the organization during the reporting period.' },
      { term: 'Attrition', def: 'Number of employees leaving the organization during the reporting period.' },
    ];
  }
}

export default SocialReportGenerator;
