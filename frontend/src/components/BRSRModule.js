/**
 * BRSR Module Component
 * 
 * Business Responsibility & Sustainability Reporting module.
 * Tabs:
 * - Section A: General Disclosures (Company details, products, operations)
 * - Section B: Management & Process Disclosures
 * - Section C: Principle-wise Performance Disclosures (P1-P9)
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Tabs, TabsContent } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { 
  ClipboardList
} from 'lucide-react';
import { Button } from './ui/button';
import { generateReportingYears, getCurrentReportingYear } from '../utils/reportingYearUtils';
import ESGQuestionnaire from './ESGQuestionnaire';
import BRSRSectionC from './BRSRSectionC';
import BRSRDetailsSection from './BRSRDetailsSection';
import { BRSRExportButton } from '../modules/brsr-export';
import { ModulePageHeader } from './ModulePageHeader';
import { BRSRSectionCards, BRSRProgressPanel, BRSRPageNav } from './BRSRProgress';

const API = process.env.REACT_APP_BACKEND_URL;

export default function BRSRModule() {
  const { token, user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  
  const [activeTab, setActiveTab] = useState('section_a');
  const [reportingPeriod, setReportingPeriod] = useState('');
  const [reportingYears, setReportingYears] = useState([]);
  const [organization, setOrganization] = useState(null);
  const [responseRefreshKey, setResponseRefreshKey] = useState(0);
  const [liveKPIAutofill, setLiveKPIAutofill] = useState({});
  const [progress, setProgress] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const loadProgress = React.useCallback(async () => {
    if (!token || !reportingPeriod) return;
    try {
      const response = await axios.get(`${API}/api/brsr-report/progress`, {
        params: { reporting_period: reportingPeriod },
        headers: { Authorization: `Bearer ${token}` },
      });
      setProgress(response.data);
    } catch (error) {
      console.error('Failed to load BRSR progress:', error);
    }
  }, [token, reportingPeriod]);

  const selectTab = (tab) => {
    setActiveTab(tab);
    setStatusFilter('all');
  };

  useEffect(() => { loadProgress(); }, [loadProgress, activeTab]);

  // Initialize reporting years
  useEffect(() => {
    const fetchOrgAndSetYears = async () => {
      try {
        const res = await axios.get(`${API}/api/organizations/my`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const yearType = res.data.reporting_year_type || 'financial_year';
        const years = generateReportingYears(yearType, 5);
        setReportingYears(years);
        setReportingPeriod(getCurrentReportingYear(yearType));
        setOrganization(res.data);
      } catch (error) {
        const years = generateReportingYears('financial_year', 5);
        setReportingYears(years);
        setReportingPeriod(getCurrentReportingYear('financial_year'));
      }
    };
    
    if (token) {
      fetchOrgAndSetYears();
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    const loadLiveKPIAutofill = async () => {
      if (!token || !reportingPeriod) return;
      try {
        const response = await axios.get(`${API}/api/brsr-report/live-kpi-autofill`, {
          params: { reporting_period: reportingPeriod },
          headers: { Authorization: `Bearer ${token}` },
        });
        if (active) setLiveKPIAutofill(response.data.values_by_question || {});
        if (active) loadProgress();
      } catch (error) {
        console.error('Failed to sync live BRSR KPI values:', error);
      }
    };
    loadLiveKPIAutofill();
    const interval = window.setInterval(loadLiveKPIAutofill, 30000);
    const refreshOnFocus = () => loadLiveKPIAutofill();
    window.addEventListener('focus', refreshOnFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, [token, reportingPeriod, responseRefreshKey, loadProgress]);

  const blockNegativeKey = (e) => {
    if (e.target?.type === 'number' && (e.key === '-' || e.key === 'Subtract')) e.preventDefault();
  };
  const blockNegativePaste = (e) => {
    if (e.target?.type === 'number' && (e.clipboardData?.getData('text') || '').includes('-')) e.preventDefault();
  };

  return (
    <div className="space-y-7" onKeyDownCapture={blockNegativeKey} onPasteCapture={blockNegativePaste}>
      <ModulePageHeader
        title="BRSR Framework"
        icon={ClipboardList}
        iconClassName="border-emerald-200 bg-emerald-50 text-emerald-800"
        testId="brsr-framework"
        aside={<>
          <Label className="text-sm whitespace-nowrap">Reporting Period:</Label>
          <Select value={reportingPeriod} onValueChange={setReportingPeriod}>
            <SelectTrigger className="w-40 bg-white" data-testid="brsr-reporting-period-selector">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {reportingYears.map(year => (
                <SelectItem key={year} value={year} data-testid={`brsr-reporting-period-option-${year}`}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <BRSRExportButton 
            reportingPeriod={reportingPeriod} 
            organization={organization}
          />
        </>}
      />

      {/* Main Tabs */}
      <BRSRSectionCards progress={progress} activeTab={activeTab} onSelect={selectTab} />
      <BRSRProgressPanel progress={progress} activeTab={activeTab} statusFilter={statusFilter} onFilter={setStatusFilter} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6 items-start">
      <Tabs value={activeTab} onValueChange={selectTab} className="min-w-0">

        {/* Section A - General Disclosures */}
        <TabsContent value="section_a" className="mt-0">
          <BRSRDetailsSection
            key={`section-a-${responseRefreshKey}`}
            isCollapsible={false}
            reportingPeriod={reportingPeriod}
            liveKPIAutofillByQuestion={liveKPIAutofill}
            statusFilter={statusFilter}
            questionProgress={progress?.sections?.section_a?.questions || {}}
            approvalEnabled={Boolean(progress?.approval_enabled)}
            onSaved={loadProgress}
          />
        </TabsContent>

        {/* Section B - Management & Process Disclosures */}
        <TabsContent value="section_b" className="mt-0">
          <ESGQuestionnaire
            key={`section-b-${responseRefreshKey}`}
            framework="BRSR"
            section="section_b"
            reportingYear={reportingPeriod}
            liveKPIAutofillByQuestion={liveKPIAutofill}
            statusFilter={statusFilter}
            questionProgress={progress?.sections?.section_b?.questions || {}}
            perQuestionEdit
            approvalEnabled={Boolean(progress?.approval_enabled)}
            onSaved={loadProgress}
          />
        </TabsContent>

        {/* Section C - Principle-wise Performance Disclosures */}
        <TabsContent value="section_c" className="mt-0">
          <BRSRSectionC
            key={`section-c-${responseRefreshKey}`}
            framework="BRSR"
            reportingYear={reportingPeriod}
            liveKPIAutofillByQuestion={liveKPIAutofill}
            statusFilter={statusFilter}
            questionProgress={progress?.sections?.section_c?.questions || {}}
            approvalEnabled={Boolean(progress?.approval_enabled)}
            isAdmin={isAdmin}
            onSaved={loadProgress}
          />
        </TabsContent>
      </Tabs>
      <BRSRPageNav progress={progress} activeTab={activeTab} />
      </div>
    </div>
  );
}
