/**
 * GRI Module Component
 *
 * Global Reporting Initiative Standards module, laid out like the BRSR module:
 * section cards with progress, a progress panel with status filters, tabs and a page nav.
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Tabs, TabsContent } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { Leaf, Users, Shield, Globe, BookOpen } from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { generateReportingYears, getCurrentReportingYear } from '../utils/reportingYearUtils';
import GRIQuestionnaire from './GRIQuestionnaire';
import { ModulePageHeader } from './ModulePageHeader';
import { BRSRSectionCards, BRSRProgressPanel, BRSRPageNav } from './BRSRProgress';
import { BRSRExportButton } from '../modules/brsr-export';

const API = process.env.REACT_APP_BACKEND_URL;

const GRI_SECTIONS = [
  { key: 'general', label: 'GRI 2: General Disclosure', subtitle: 'General disclosures', icon: BookOpen, testId: 'gri-general-tab' },
  { key: 'environment', label: 'Environment', subtitle: 'Environmental disclosures', icon: Leaf, testId: 'gri-environment-tab' },
  { key: 'social', label: 'Social', subtitle: 'Social disclosures', icon: Users, testId: 'gri-social-tab' },
  { key: 'governance', label: 'Governance', subtitle: 'Governance disclosures', icon: Shield, testId: 'gri-governance-tab' },
];

export default function GRIModule() {
  const { token } = useAuth();

  const [activeTab, setActiveTab] = useState('general');
  const [reportingPeriod, setReportingPeriod] = useState('');
  const [reportingYears, setReportingYears] = useState([]);
  const [progress, setProgress] = useState(null);
  const [syncedPeriod, setSyncedPeriod] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [materialOnly, setMaterialOnly] = useState(true);

  const loadProgress = useCallback(async () => {
    if (!token || !reportingPeriod || syncedPeriod !== reportingPeriod) return;
    try {
      const response = await axios.get(`${API}/api/esg-questionnaire/gri-progress`, {
        params: { reporting_period: reportingPeriod, material_only: materialOnly },
        headers: { Authorization: `Bearer ${token}` },
      });
      setProgress(response.data);
    } catch (error) {
      console.error('Failed to load GRI progress:', error);
    }
  }, [token, reportingPeriod, syncedPeriod, materialOnly]);

  useEffect(() => {
    if (!token || !reportingPeriod) return;
    let active = true;
    axios.post(`${API}/api/esg-questionnaire/gri-live-kpi-autofill`, null, {
      params: { reporting_period: reportingPeriod },
      headers: { Authorization: `Bearer ${token}` },
    }).catch((error) => console.error('Failed to sync GRI KPI values:', error))
      .finally(() => { if (active) setSyncedPeriod(reportingPeriod); });
    return () => { active = false; };
  }, [token, reportingPeriod]);

  const selectTab = (tab) => {
    setActiveTab(tab);
    setStatusFilter('all');
  };

  useEffect(() => {
    loadProgress();
    const interval = window.setInterval(loadProgress, 30000);
    window.addEventListener('focus', loadProgress);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', loadProgress);
    };
  }, [loadProgress]);

  useEffect(() => {
    const fetchOrgAndSetYears = async () => {
      let yearType = 'financial_year';
      try {
        const res = await axios.get(`${API}/api/organizations/my`, { headers: { Authorization: `Bearer ${token}` } });
        yearType = res.data.reporting_year_type || yearType;
      } catch (error) {
        console.error('Failed to fetch organization:', error);
      }
      setReportingYears(generateReportingYears(yearType, 5));
      setReportingPeriod(getCurrentReportingYear(yearType));
    };
    if (token) fetchOrgAndSetYears();
  }, [token]);

  const renderSection = (section) => (
    <TabsContent value={section} className="mt-0">
      {syncedPeriod === reportingPeriod && <GRIQuestionnaire
        section={section}
        reportingPeriod={reportingPeriod}
        materialOnly={materialOnly}
        statusFilter={statusFilter}
        questionProgress={progress?.sections?.[section]?.questions || {}}
        onSaved={loadProgress}
      />}
    </TabsContent>
  );

  const materialSwitch = (
    <label className="inline-flex items-center gap-3 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 cursor-pointer" data-testid="gri-material-toggle-label">
      <Switch checked={materialOnly} onCheckedChange={setMaterialOnly} data-testid="gri-material-toggle" />
      Material topics only
    </label>
  );

  return (
    <div className="space-y-7 gri-report">
      <ModulePageHeader
        title="GRI Framework"
        icon={Globe}
        iconClassName="border-sky-200 bg-sky-50 text-sky-800"
        testId="gri-framework"
        aside={<>
          <Label className="text-sm whitespace-nowrap">Reporting Period:</Label>
          <Select value={reportingPeriod} onValueChange={setReportingPeriod}>
            <SelectTrigger className="w-40 bg-white" data-testid="gri-reporting-period-selector">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {reportingYears.map((year) => (
                <SelectItem key={year} value={year} data-testid={`gri-reporting-period-option-${year}`}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <BRSRExportButton framework="gri" reportingPeriod={reportingPeriod} />
        </>}
      />

      <BRSRSectionCards progress={progress} activeTab={activeTab} onSelect={selectTab} sections={GRI_SECTIONS} prefix="gri-report" />
      <BRSRProgressPanel progress={progress} activeTab={activeTab} statusFilter={statusFilter} onFilter={setStatusFilter} sections={GRI_SECTIONS} prefix="gri-report" trailing={materialSwitch} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6">
        <Tabs value={activeTab} onValueChange={selectTab} className="min-w-0">
          {reportingPeriod && GRI_SECTIONS.map(({ key }) => (
            <React.Fragment key={key}>{renderSection(key)}</React.Fragment>
          ))}
        </Tabs>
        <BRSRPageNav progress={progress} activeTab={activeTab} prefix="gri-report" />
      </div>
    </div>
  );
}
