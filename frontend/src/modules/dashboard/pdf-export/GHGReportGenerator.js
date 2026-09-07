/**
 * GHG Dashboard PDF Generator
 * Renders report-native charts and tables from the current dashboard dataset.
 */
import { BasePDFGenerator, COLORS, PAGE } from './BasePDFGenerator';

const SCOPE_ROWS = [
  { key: 'scope1', label: 'Scope 1', color: '#059669' },
  { key: 'scope2', label: 'Scope 2', color: '#3B82F6' },
  { key: 'scope3', label: 'Scope 3', color: '#8B5CF6' },
];

const cleanNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export class GHGReportGenerator extends BasePDFGenerator {
  constructor(options = {}) {
    super(options);
    this.reportTitle = 'GHG Emissions Report';
    this.reportSubtitle = 'Greenhouse Gas Performance Analysis';
    this.themeColor = COLORS.ghg;
    this.reportVersion = '2.0';

    this.emissions = options.emissions || {};
    this.analytics = options.analytics || {};
    this.trends = Array.isArray(options.trends) ? options.trends : [];
    this.previousYear = options.previousYear || {};
    this.scope3Categories = Array.isArray(this.analytics.scope3_by_category)
      ? this.analytics.scope3_by_category
      : [];
    this.facilityEmissions = Array.isArray(this.analytics.emissions_by_facility)
      ? this.analytics.emissions_by_facility
      : [];
    this.preCalculateData();
  }

  getReportIcon() {
    return 'CO2';
  }

  preCalculateData() {
    const ghg = this.emissions?.ghg_emissions || this.emissions || {};
    this.data = {
      scope1: cleanNumber(ghg.total_scope1 ?? ghg.scope1),
      scope2: cleanNumber(ghg.total_scope2 ?? ghg.scope2),
      scope3: cleanNumber(ghg.total_scope3 ?? ghg.scope3),
      biogenic: cleanNumber(ghg.biogenic),
    };
    this.data.totalEmissions = this.data.scope1 + this.data.scope2 + this.data.scope3;
    this.data.scope1Pct = this.data.totalEmissions ? (this.data.scope1 / this.data.totalEmissions) * 100 : 0;
    this.data.scope2Pct = this.data.totalEmissions ? (this.data.scope2 / this.data.totalEmissions) * 100 : 0;
    this.data.scope3Pct = this.data.totalEmissions ? (this.data.scope3 / this.data.totalEmissions) * 100 : 0;
  }

  async generate() {
    this.addCoverPage();

    this.addNewPage();
    this.addExecutiveSummary();

    this.addNewPage();
    this.addEmissionsOverview();

    this.addNewPage();
    this.addFacilityEmissions();

    if (this.scope3Categories.length) {
      this.addNewPage();
      this.addScope3CategoryAnalysis();
    }

    this.addNewPage();
    this.addPriorFinancialYearComparison();

    this.addNewPage();
    this.addAppendix(this.getDefinitions());
    this.totalPages = this.pageNumber;
    return this.doc;
  }

  addExecutiveSummary() {
    this.addPageTitle('Executive Summary');
    this.addAnalysisBox(this.generateNarrative());
    this.addSubsectionTitle('Key Metrics');
    this.addKPIGrid([
      { label: 'Total Emissions', value: this.data.totalEmissions, unit: this.getCO2Unit(), color: COLORS.emissions },
      { label: 'Scope 1', value: this.data.scope1, unit: this.getCO2Unit(), subtitle: `${this.data.scope1Pct.toFixed(1)}% of total`, color: '#059669' },
      { label: 'Scope 2', value: this.data.scope2, unit: this.getCO2Unit(), subtitle: `${this.data.scope2Pct.toFixed(1)}% of total`, color: '#3B82F6' },
      { label: 'Scope 3', value: this.data.scope3, unit: this.getCO2Unit(), subtitle: `${this.data.scope3Pct.toFixed(1)}% of total`, color: '#8B5CF6' },
    ], 4);
  }

  generateNarrative() {
    if (!this.data.totalEmissions) {
      return 'GHG emissions data is being collected for this reporting period. Complete emissions inventory will enable a detailed carbon-footprint analysis.';
    }
    const largest = SCOPE_ROWS.reduce((current, row) => this.data[row.key] > this.data[current.key] ? row : current, SCOPE_ROWS[0]);
    const share = (this.data[largest.key] / this.data.totalEmissions) * 100;
    return `Total Scope 1, Scope 2, and Scope 3 emissions for the reporting period are ${this.formatNumber(this.data.totalEmissions)} ${this.getCO2Unit()}. ${largest.label} is the largest contributor at ${share.toFixed(1)}% of reported emissions.`;
  }

  addEmissionsOverview() {
    this.addPageTitle('Emissions Overview', COLORS.emissions);
    this.addAnalysisBox('The scope distribution and monthly trend below are generated directly from the reporting-period data selected on the GHG dashboard.');
    this.drawHorizontalBarChart('Emissions by Scope', SCOPE_ROWS.map((scope) => ({
      label: scope.label,
      value: this.data[scope.key],
      color: scope.color,
    })));
    this.drawTrendChart('Monthly Emissions Trend', this.trends);
    this.addSubsectionTitle('Scope Breakdown');
    this.addFullWidthTable([
      ['Scope', `Emissions (${this.getCO2Unit()})`, 'Contribution'],
      ...SCOPE_ROWS.map((scope) => [
        scope.label,
        this.formatNumber(this.data[scope.key]),
        `${((this.data[scope.key] / (this.data.totalEmissions || 1)) * 100).toFixed(1)}%`,
      ]),
      ['Total', this.formatNumber(this.data.totalEmissions), '100.0%'],
    ], COLORS.emissions);
  }

  addFacilityEmissions() {
    this.addPageTitle('Facility-wise Emissions', '#059669');
    const facilities = [...this.facilityEmissions]
      .filter((facility) => cleanNumber(facility.total_emissions) > 0)
      .sort((a, b) => cleanNumber(b.total_emissions) - cleanNumber(a.total_emissions));

    if (!facilities.length) {
      this.addAnalysisBox('No facility-level emissions are available for the selected reporting period.');
      return;
    }

    this.addAnalysisBox('Facilities are ranked by their Scope 1, Scope 2, and Scope 3 emissions for the selected reporting period.');
    this.drawHorizontalBarChart('Top Emitting Facilities', facilities.slice(0, 8).map((facility) => ({
      label: facility.facility_name || 'Unnamed facility',
      value: cleanNumber(facility.total_emissions),
      color: '#10B981',
    })));
    this.addSubsectionTitle('Facility Emissions Detail');
    this.addFullWidthTable([
      ['Facility', 'Scope 1', 'Scope 2', 'Scope 3', 'Total'],
      ...facilities.map((facility) => [
        this.truncate(facility.facility_name || 'Unnamed facility', 22),
        this.formatNumber(cleanNumber(facility.scope1_emissions)),
        this.formatNumber(cleanNumber(facility.scope2_emissions)),
        this.formatNumber(cleanNumber(facility.scope3_emissions)),
        this.formatNumber(cleanNumber(facility.total_emissions)),
      ]),
    ], '#059669');
  }

  addScope3CategoryAnalysis() {
    this.addPageTitle('Scope 3 Category Emissions', '#8B5CF6');
    const categories = [...this.scope3Categories]
      .filter((category) => cleanNumber(category.total_emissions) > 0)
      .sort((a, b) => cleanNumber(b.total_emissions) - cleanNumber(a.total_emissions));
    const reportedScope3 = categories.reduce((total, category) => total + cleanNumber(category.total_emissions), 0);

    this.addAnalysisBox(`Scope 3 category values are calculated from ${categories.reduce((total, category) => total + cleanNumber(category.record_count), 0)} reporting records. Each category’s contribution is shown against the total Scope 3 emissions in this report.`);
    this.drawHorizontalBarChart('Largest Scope 3 Categories', categories.slice(0, 8).map((category) => ({
      label: category.category || 'Uncategorised',
      value: cleanNumber(category.total_emissions),
      color: '#8B5CF6',
    })));
    this.addSubsectionTitle('Scope 3 Emissions by Category');
    this.addFullWidthTable([
      ['Category', `Emissions (${this.getCO2Unit()})`, 'Share', 'Records'],
      ...categories.map((category) => [
        this.truncate(category.category || 'Uncategorised', 30),
        this.formatNumber(cleanNumber(category.total_emissions)),
        `${cleanNumber(category.percentage || (cleanNumber(category.total_emissions) / (reportedScope3 || 1)) * 100).toFixed(1)}%`,
        String(cleanNumber(category.record_count)),
      ]),
      ['Total', this.formatNumber(reportedScope3), '100.0%', String(categories.reduce((total, category) => total + cleanNumber(category.record_count), 0))],
    ], '#8B5CF6');
  }

  addPriorFinancialYearComparison() {
    this.addPageTitle('Prior Financial Year Comparison', '#0F766E');
    const previous = {
      scope1: cleanNumber(this.previousYear.scope1),
      scope2: cleanNumber(this.previousYear.scope2),
      scope3: cleanNumber(this.previousYear.scope3),
    };
    previous.total = cleanNumber(this.previousYear.totalEmissions) || previous.scope1 + previous.scope2 + previous.scope3;
    const rows = SCOPE_ROWS.map((scope) => ({
      label: scope.label,
      current: this.data[scope.key],
      previous: previous[scope.key],
      color: scope.color,
    }));
    rows.push({ label: 'Total', current: this.data.totalEmissions, previous: previous.total, color: '#0F766E' });

    this.addAnalysisBox(previous.total
      ? 'Current reporting-period emissions are compared with the equivalent immediately preceding financial-year period, using the same facility filters.'
      : 'No prior financial-year emissions are available for the selected facility and reporting-period filters. The comparison table will populate when prior-year records exist.');
    this.drawComparisonChart('Current vs Prior Financial Year', rows);
    this.addSubsectionTitle('Year-over-Year Comparison');
    this.addFullWidthTable([
      ['Scope', 'Current FY', 'Prior FY', 'Change'],
      ...rows.map((row) => {
        const change = row.previous ? ((row.current - row.previous) / row.previous) * 100 : null;
        return [
          row.label,
          this.formatNumber(row.current),
          this.formatNumber(row.previous),
          change == null ? 'N/A' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
        ];
      }),
    ], '#0F766E');
  }

  drawHorizontalBarChart(title, rows) {
    const visibleRows = rows.filter((row) => cleanNumber(row.value) > 0).slice(0, 8);
    const chartHeight = Math.max(44, visibleRows.length * 10 + 16);
    this.checkPageBreak(chartHeight + 18);
    this.addSubsectionTitle(title);

    if (!visibleRows.length) {
      this.doc.setFont('helvetica', 'italic');
      this.doc.setFontSize(9);
      this.doc.setTextColor(COLORS.textMuted);
      this.doc.text('No data available for this reporting period.', PAGE.margin, this.currentY + 5);
      this.currentY += 15;
      return;
    }

    const maxValue = Math.max(...visibleRows.map((row) => cleanNumber(row.value)), 1);
    const labelWidth = 48;
    const barX = PAGE.margin + labelWidth;
    const barWidth = 100;
    const startY = this.currentY;
    visibleRows.forEach((row, index) => {
      const y = startY + index * 10;
      const value = cleanNumber(row.value);
      const width = (value / maxValue) * barWidth;
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(7);
      this.doc.setTextColor(COLORS.text);
      this.doc.text(this.truncate(row.label, 24), PAGE.margin, y + 5.5);
      this.doc.setFillColor('#E7E5E4');
      this.doc.roundedRect(barX, y + 1, barWidth, 5, 1, 1, 'F');
      this.doc.setFillColor(row.color || this.themeColor);
      this.doc.roundedRect(barX, y + 1, Math.max(width, 1), 5, 1, 1, 'F');
      this.doc.setFont('helvetica', 'bold');
      this.doc.setTextColor(COLORS.textMuted);
      this.doc.text(`${this.formatNumber(value)} ${this.getCO2Unit()}`, barX + barWidth + 4, y + 5.5);
    });
    this.currentY = startY + visibleRows.length * 10 + 8;
  }

  drawTrendChart(title, rows) {
    const values = rows.map((row) => cleanNumber(row.total)).filter((value) => value >= 0);
    this.checkPageBreak(82);
    this.addSubsectionTitle(title);
    if (values.length < 2) {
      this.doc.setFont('helvetica', 'italic');
      this.doc.setFontSize(9);
      this.doc.setTextColor(COLORS.textMuted);
      this.doc.text('At least two monthly records are required to draw a trend.', PAGE.margin, this.currentY + 5);
      this.currentY += 15;
      return;
    }

    const x = PAGE.margin + 12;
    const y = this.currentY + 4;
    const width = PAGE.contentWidth - 18;
    const height = 55;
    const maxValue = Math.max(...values, 1);
    this.doc.setDrawColor(COLORS.border);
    this.doc.setLineWidth(0.25);
    [0, 0.5, 1].forEach((level) => this.doc.line(x, y + height - height * level, x + width, y + height - height * level));
    this.doc.line(x, y, x, y + height);
    this.doc.line(x, y + height, x + width, y + height);

    rows.forEach((row, index) => {
      const pointX = x + (index / (rows.length - 1)) * width;
      const pointY = y + height - (cleanNumber(row.total) / maxValue) * height;
      if (index > 0) {
        const previous = rows[index - 1];
        const previousX = x + ((index - 1) / (rows.length - 1)) * width;
        const previousY = y + height - (cleanNumber(previous.total) / maxValue) * height;
        this.doc.setDrawColor(this.themeColor);
        this.doc.setLineWidth(0.9);
        this.doc.line(previousX, previousY, pointX, pointY);
      }
      this.doc.setFillColor(this.themeColor);
      this.doc.circle(pointX, pointY, 1.3, 'F');
    });
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(7);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text(this.truncate(rows[0].period || '', 10), x, y + height + 6);
    this.doc.text(this.truncate(rows[rows.length - 1].period || '', 10), x + width, y + height + 6, { align: 'right' });
    this.doc.text(`${this.formatNumber(maxValue)} ${this.getCO2Unit()}`, x, y - 2);
    this.currentY = y + height + 13;
  }

  drawComparisonChart(title, rows) {
    this.checkPageBreak(72);
    this.addSubsectionTitle(title);
    const maxValue = Math.max(...rows.flatMap((row) => [cleanNumber(row.current), cleanNumber(row.previous)]), 1);
    const labelWidth = 38;
    const barX = PAGE.margin + labelWidth;
    const barWidth = 100;
    const startY = this.currentY;
    rows.forEach((row, index) => {
      const y = startY + index * 14;
      const currentWidth = (cleanNumber(row.current) / maxValue) * barWidth;
      const priorWidth = (cleanNumber(row.previous) / maxValue) * barWidth;
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(7);
      this.doc.setTextColor(COLORS.text);
      this.doc.text(row.label, PAGE.margin, y + 7);
      this.doc.setFillColor('#D6D3D1');
      this.doc.roundedRect(barX, y + 1, Math.max(priorWidth, 1), 4, 1, 1, 'F');
      this.doc.setFillColor(row.color);
      this.doc.roundedRect(barX, y + 6, Math.max(currentWidth, 1), 4, 1, 1, 'F');
      this.doc.setFont('helvetica', 'normal');
      this.doc.setTextColor(COLORS.textMuted);
      this.doc.text(`Prior ${this.formatNumber(row.previous)} | Current ${this.formatNumber(row.current)}`, barX + barWidth + 4, y + 7);
    });
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(7);
    this.doc.setTextColor(COLORS.textMuted);
    this.doc.text('Grey: prior financial year   •   Colour: current financial year', PAGE.margin, startY + rows.length * 14 + 3);
    this.currentY = startY + rows.length * 14 + 10;
  }

  truncate(value, maxLength) {
    const text = String(value || '');
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }

  getDefinitions() {
    return [
      { term: 'Scope 1', def: 'Direct GHG emissions from sources owned or controlled by the organization.' },
      { term: 'Scope 2', def: 'Indirect emissions from purchased electricity, steam, heating, and cooling.' },
      { term: 'Scope 3', def: 'All other indirect emissions occurring in the organization’s value chain.' },
      { term: 'tCO2e', def: 'Tonnes of carbon dioxide equivalent, a standard unit for comparing greenhouse gases.' },
    ];
  }
}

export default GHGReportGenerator;