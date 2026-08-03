/**
 * Dashboard PDF Export Button - Unified component for all dashboard exports
 * Supports: GHG, Energy, Water, Waste, Social, Governance, and ESG dashboards
 */

import React, { useState, useCallback } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';

// Import all generators
import { GHGReportGenerator } from './GHGReportGenerator';
import { EnergyReportGenerator } from './EnergyReportGenerator';
import { WaterReportGenerator } from './WaterReportGenerator';
import { WasteReportGenerator } from './WasteReportGenerator';
import { SocialReportGenerator } from './SocialReportGenerator';
import { GovernanceReportGenerator } from './GovernanceReportGenerator';
import ESGReportGenerator from './ESGReportGenerator';

// Dashboard type configurations
const DASHBOARD_CONFIGS = {
  ghg: {
    label: 'GHG Report',
    Generator: GHGReportGenerator,
    filename: 'GHG_Emissions_Report',
  },
  energy: {
    label: 'Energy Report',
    Generator: EnergyReportGenerator,
    filename: 'Energy_Report',
  },
  water: {
    label: 'Water Report',
    Generator: WaterReportGenerator,
    filename: 'Water_Report',
  },
  waste: {
    label: 'Waste Report',
    Generator: WasteReportGenerator,
    filename: 'Waste_Report',
  },
  social: {
    label: 'Social Report',
    Generator: SocialReportGenerator,
    filename: 'Social_Report',
  },
  governance: {
    label: 'Governance Report',
    Generator: GovernanceReportGenerator,
    filename: 'Governance_Report',
  },
  esg: {
    label: 'ESG Report',
    Generator: ESGReportGenerator,
    filename: 'ESG_Dashboard_Report',
  },
};

/**
 * Unified Dashboard Export Button
 */
export function DashboardExportButton({
  dashboardType = 'esg',
  data = {},
  organization = {},
  dateRange = {},
  facilities = [],
  user = {},
  className = '',
  variant = 'outline',
  size = 'sm',
  showLabel = true,
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const config = DASHBOARD_CONFIGS[dashboardType] || DASHBOARD_CONFIGS.esg;

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setProgress(10);

    try {
      // Prepare options based on dashboard type
      const options = {
        organization,
        dateRange,
        facilities,
        user,
        ...data,
      };

      setProgress(30);

      // Create generator instance
      const generator = new config.Generator(options);

      setProgress(50);

      // Generate PDF
      await generator.generate();

      setProgress(80);

      // Generate filename with date
      const dateStr = new Date().toISOString().split('T')[0];
      const orgName = organization.name?.replace(/\s+/g, '_') || 'Organization';
      const filename = `${orgName}_${config.filename}_${dateStr}.pdf`;

      // Save the PDF
      generator.save(filename);

      setProgress(100);
    } catch (error) {
      console.error(`Error exporting ${config.label}:`, error);
      alert(`Failed to export ${config.label}. Please try again.`);
    } finally {
      setTimeout(() => {
        setIsExporting(false);
        setProgress(0);
      }, 500);
    }
  }, [config, data, organization, dateRange, facilities, user]);

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleExport}
      disabled={isExporting}
      className={`gap-2 ${className}`}
      data-testid={`export-${dashboardType}-pdf-btn`}
    >
      {isExporting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {showLabel && <span>Exporting... {progress}%</span>}
        </>
      ) : (
        <>
          <FileDown className="h-4 w-4" />
          {showLabel && <span>Export PDF</span>}
        </>
      )}
    </Button>
  );
}

/**
 * Hook for programmatic PDF export
 */
export function useDashboardExport(dashboardType = 'esg') {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const config = DASHBOARD_CONFIGS[dashboardType] || DASHBOARD_CONFIGS.esg;

  const exportPDF = useCallback(async (options = {}) => {
    setIsExporting(true);
    setProgress(10);
    setError(null);

    try {
      const generator = new config.Generator(options);
      setProgress(50);
      
      await generator.generate();
      setProgress(80);

      const dateStr = new Date().toISOString().split('T')[0];
      const orgName = options.organization?.name?.replace(/\s+/g, '_') || 'Organization';
      const filename = `${orgName}_${config.filename}_${dateStr}.pdf`;

      generator.save(filename);
      setProgress(100);

      return true;
    } catch (err) {
      console.error(`Error exporting ${config.label}:`, err);
      setError(err);
      return false;
    } finally {
      setTimeout(() => {
        setIsExporting(false);
        setProgress(0);
      }, 500);
    }
  }, [config]);

  const getBlob = useCallback(async (options = {}) => {
    try {
      const generator = new config.Generator(options);
      await generator.generate();
      return generator.getBlob();
    } catch (err) {
      console.error(`Error generating ${config.label} blob:`, err);
      throw err;
    }
  }, [config]);

  return {
    exportPDF,
    getBlob,
    isExporting,
    progress,
    error,
    dashboardType,
    label: config.label,
  };
}

export default DashboardExportButton;
