/**
 * Governance Dashboard PDF Generator
 * Generates comprehensive Governance performance report
 */

import { BasePDFGenerator, COLORS, PAGE, BENCHMARKS } from './BasePDFGenerator';

export class GovernanceReportGenerator extends BasePDFGenerator {
  constructor(options = {}) {
    super(options);
    
    this.reportTitle = 'Governance Report';
    this.reportSubtitle = 'Ethics, Compliance & Financial Governance Analysis';
    this.themeColor = COLORS.governance;
    this.reportVersion = '1.0';
    
    // Governance-specific data
    this.kpis = options.kpis || {};
    this.governance = options.governance || {};
    this.analytics = options.analytics || {};
    
    this.preCalculateData();
  }

  getReportIcon() {
    return 'G';
  }

  preCalculateData() {
    this.data = {
      apDays: this.kpis.ap_days?.value || this.governance.ap_days,
      antiCompetitive: this.governance.anti_competitive || 0,
      dataBreaches: this.governance.data_breaches || 0,
      violations: this.governance.violations || 0,
      corruptionCases: this.governance.corruption_cases || 0,
      boardIndependence: this.governance.board_independence || 0,
      auditFindings: this.governance.audit_findings || 0,
    };
  }

  async generate() {
    try {
      // Cover Page
      this.addCoverPage();
      
      // Executive Summary
      this.addNewPage();
      this.addExecutiveSummary();
      
      // Financial Governance
      this.addNewPage();
      await this.addFinancialGovernanceSection();
      
      // Compliance
      this.addNewPage();
      await this.addComplianceSection();
      
      // Ethics & Integrity
      this.addNewPage();
      await this.addEthicsSection();
      
      // Trends
      this.addNewPage();
      await this.addTrendsSection();
      
      // Appendix
      this.addNewPage();
      this.addAppendix(this.getDefinitions());
      
      this.totalPages = this.pageNumber;
      return this.doc;
    } catch (error) {
      console.error('Error generating Governance PDF:', error);
      throw error;
    }
  }

  addExecutiveSummary() {
    this.addPageTitle('Executive Summary');
    
    const narrative = this.generateNarrative();
    this.addAnalysisBox(narrative);
    
    this.addSubsectionTitle('Key Metrics');
    
    const apDaysStatus = this.data.apDays != null 
      ? (this.data.apDays < 60 ? COLORS.achievement : this.data.apDays < 90 ? COLORS.energy : COLORS.attention)
      : COLORS.textMuted;
    
    const kpis = [
      { label: 'AP Days', value: this.data.apDays, unit: 'days', subtitle: `Benchmark: ${BENCHMARKS.apDays.typical}`, color: apDaysStatus },
      { label: 'Anti-Competitive Cases', value: this.data.antiCompetitive, unit: '', color: this.data.antiCompetitive > 0 ? COLORS.attention : COLORS.achievement },
      { label: 'Data Breaches', value: this.data.dataBreaches, unit: '', color: this.data.dataBreaches > 0 ? COLORS.declined : COLORS.achievement },
      { label: 'Compliance Violations', value: this.data.violations, unit: '', color: this.data.violations > 0 ? COLORS.attention : COLORS.achievement },
    ];
    
    this.addKPIGrid(kpis, 4);
  }

  generateNarrative() {
    const parts = [];
    
    if (this.data.apDays != null) {
      if (this.data.apDays > 200) {
        parts.push(`Accounts Payable Days at ${Math.round(this.data.apDays)} days significantly exceeds the commonly accepted ${BENCHMARKS.apDays.typical} day range and may impact supplier relationships.`);
      } else if (this.data.apDays > 90) {
        parts.push(`Accounts Payable Days at ${Math.round(this.data.apDays)} days exceeds the ${BENCHMARKS.apDays.typical} day benchmark.`);
      } else if (this.data.apDays < 60) {
        parts.push(`Accounts Payable Days at ${Math.round(this.data.apDays)} days is within optimal range, indicating efficient payment cycle management.`);
      }
    }
    
    if (this.data.violations > 0) {
      parts.push(`${this.data.violations} compliance violation(s) require attention.`);
    } else {
      parts.push('No compliance violations reported during the period.');
    }
    
    if (this.data.dataBreaches > 0) {
      parts.push(`${this.data.dataBreaches} data breach(es) occurred, requiring review of data security protocols.`);
    }
    
    return parts.length > 0 ? parts.join(' ') : 'Governance metrics are being tracked across financial, compliance, and ethics dimensions.';
  }

  async addFinancialGovernanceSection() {
    this.addPageTitle('Financial Governance', COLORS.governance);
    
    const analysis = this.data.apDays != null
      ? this.data.apDays > 200
        ? `Accounts Payable Days of ${Math.round(this.data.apDays)} significantly exceeds the commonly accepted ${BENCHMARKS.apDays.typical} day range. Extended payment cycles may impact supplier relationships, credit terms, and supply chain stability. A comprehensive review of payment processes is recommended.`
        : this.data.apDays < 60
          ? `Accounts Payable Days of ${Math.round(this.data.apDays)} is within the optimal ${BENCHMARKS.apDays.typical} day range, indicating efficient payment cycle management and healthy supplier relationships.`
          : `Accounts Payable Days of ${Math.round(this.data.apDays)} is slightly above the ${BENCHMARKS.apDays.typical} day benchmark. Monitoring payment processes is recommended.`
      : 'Financial governance metrics including AP Days are being tracked.';
    
    this.addAnalysisBox(analysis);
    
    await this.addChartFromRef('ap-days-chart', 'Accounts Payable Days Trend', 70);
    
    this.addSubsectionTitle('Financial Metrics');
    
    const status = this.data.apDays != null 
      ? (this.data.apDays < 60 ? 'Excellent' : this.data.apDays < 90 ? 'Good' : this.data.apDays < 120 ? 'Fair' : 'Review needed')
      : 'N/A';
    
    const tableData = [
      ['Metric', 'Value', 'Benchmark', 'Status'],
      ['Accounts Payable Days', this.data.apDays != null ? `${Math.round(this.data.apDays)} days` : 'N/A', `${BENCHMARKS.apDays.typical} days`, status],
      ['Audit Findings', this.formatNumber(this.data.auditFindings), '-', this.data.auditFindings > 0 ? 'Review' : 'Clear'],
    ];
    
    this.addFullWidthTable(tableData, COLORS.governance);
  }

  async addComplianceSection() {
    this.addPageTitle('Compliance');
    
    const totalIssues = this.data.violations + this.data.dataBreaches;
    const analysis = totalIssues === 0
      ? 'No compliance violations or data breaches reported during the reporting period. Continued monitoring and preventive measures maintain compliance standards.'
      : `${totalIssues} compliance-related issue(s) identified: ${this.data.violations} violation(s) and ${this.data.dataBreaches} data breach(es). Root cause analysis and corrective actions are recommended.`;
    
    this.addAnalysisBox(analysis);
    
    await this.addChartFromRef('violations-trend-chart', 'Compliance Violations Trend', 70);
    
    this.addSubsectionTitle('Compliance Summary');
    
    const tableData = [
      ['Category', 'Count', 'Status'],
      ['Regulatory Violations', this.formatNumber(this.data.violations), this.data.violations > 0 ? 'Action needed' : 'Clear'],
      ['Data Breaches', this.formatNumber(this.data.dataBreaches), this.data.dataBreaches > 0 ? 'Action needed' : 'Clear'],
      ['Anti-Competitive Cases', this.formatNumber(this.data.antiCompetitive), this.data.antiCompetitive > 0 ? 'Review' : 'Clear'],
    ];
    
    this.addFullWidthTable(tableData, COLORS.governance);
  }

  async addEthicsSection() {
    this.addPageTitle('Ethics & Integrity');
    
    const analysis = this.data.corruptionCases === 0
      ? 'No corruption cases reported during the reporting period. Ethics training and whistleblower mechanisms support a culture of integrity.'
      : `${this.data.corruptionCases} corruption case(s) identified require investigation and remediation. Strengthening ethics programs and controls is recommended.`;
    
    this.addAnalysisBox(analysis);
    
    await this.addChartFromRef('corruption-cases-chart', 'Corruption Cases', 70);
    await this.addChartFromRef('ethics-training-chart', 'Ethics Training Completion', 60);
    
    this.addSubsectionTitle('Ethics Metrics');
    
    const tableData = [
      ['Metric', 'Value', 'Status'],
      ['Corruption Cases', this.formatNumber(this.data.corruptionCases), this.data.corruptionCases > 0 ? 'Action needed' : 'Clear'],
      ['Board Independence', this.data.boardIndependence > 0 ? `${this.data.boardIndependence.toFixed(0)}%` : 'N/A', '-'],
    ];
    
    this.addFullWidthTable(tableData, COLORS.governance);
  }

  async addTrendsSection() {
    this.addPageTitle('Governance Trends');
    
    this.addAnalysisBox('Tracking governance metrics over time helps identify patterns and the effectiveness of control measures. Consistent monitoring supports continuous improvement in governance practices.');
    
    await this.addChartFromRef('data-breach-trend', 'Data Breach Trend', 70);
    await this.addChartFromRef('compliance-score-trend', 'Compliance Score Trend', 60);
  }

  getDefinitions() {
    return [
      { term: 'AP Days', def: 'Accounts Payable Days (Days Payable Outstanding) - average number of days to pay supplier invoices. Industry benchmark is 30-90 days.' },
      { term: 'Data Breach', def: 'Unauthorized access to, or disclosure of, sensitive data that compromises confidentiality, integrity, or availability.' },
      { term: 'Compliance Violation', def: 'Non-conformance with laws, regulations, standards, or internal policies.' },
      { term: 'Anti-Competitive', def: 'Actions or agreements that unfairly restrict competition in the market.' },
      { term: 'Board Independence', def: 'Percentage of board members who are independent (not part of management).' },
    ];
  }
}

export default GovernanceReportGenerator;
