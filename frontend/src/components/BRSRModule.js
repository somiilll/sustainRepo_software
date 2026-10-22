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
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { 
  BarChart3,
  Pencil,
  X,
  ClipboardList,
  Building2
} from 'lucide-react';
import { Button } from './ui/button';
import { generateReportingYears, getCurrentReportingYear } from '../utils/reportingYearUtils';
import ESGQuestionnaire from './ESGQuestionnaire';
import BRSRSectionC from './BRSRSectionC';
import BRSRDetailsSection from './BRSRDetailsSection';
import { BRSRExportButton } from '../modules/brsr-export';
import { ModulePageHeader } from './ModulePageHeader';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

export default function BRSRModule() {
  const { token } = useAuth();
  
  const [activeTab, setActiveTab] = useState('section_a');
  const [reportingPeriod, setReportingPeriod] = useState('');
  const [reportingYears, setReportingYears] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [organization, setOrganization] = useState(null);
  const [responseRefreshKey, setResponseRefreshKey] = useState(0);
  const [importProposals, setImportProposals] = useState([]);
  const [importBusyId, setImportBusyId] = useState(null);

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
    const loadImportProposals = async () => {
      if (!token || !reportingPeriod) return;
      try {
        const response = await axios.get(`${API}/api/brsr-report/import-proposals`, {
          params: { reporting_period: reportingPeriod },
          headers: { Authorization: `Bearer ${token}` },
        });
        setImportProposals(response.data.proposals || []);
      } catch (error) {
        console.error('Failed to load BRSR import proposals:', error);
        toast.error(error.response?.data?.detail || 'Failed to load KPI import proposals');
      }
    };
    loadImportProposals();
  }, [token, reportingPeriod, responseRefreshKey]);

  const importProposalsByQuestion = importProposals.reduce((grouped, proposal) => {
    const next = { ...grouped };
    next[proposal.question_key] = [...(next[proposal.question_key] || []), proposal];
    return next;
  }, {});

  const handleImportDecision = async (proposal, action, editedValue = null) => {
    setImportBusyId(proposal.mapping_id);
    try {
      await axios.post(
        `${API}/api/brsr-report/import-proposals/${proposal.mapping_id}/decision`,
        { action, source_fingerprint: proposal.source_fingerprint, edited_value: editedValue },
        {
          params: { reporting_period: reportingPeriod },
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      toast.success(action === 'reject' ? 'Imported value rejected' : 'BRSR response updated');
      setResponseRefreshKey((value) => value + 1);
      return true;
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not review this imported value');
      if (error.response?.status === 409) setResponseRefreshKey((value) => value + 1);
      return false;
    } finally {
      setImportBusyId(null);
    }
  };

  return (
    <div className="space-y-7">
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
          <Button
            variant={isEditing ? 'outline' : 'default'}
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
            className={isEditing ? 'border-red-300 text-red-600 hover:bg-red-50' : ''}
            data-testid="brsr-edit-toggle-button">
            {isEditing ? <><X className="w-4 h-4 mr-1" /> Done</> : <><Pencil className="w-4 h-4 mr-1" /> Edit</>}
          </Button>
        </>}
      />

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-stone-100 p-1 rounded-lg">
          <TabsTrigger value="section_a" className="gap-2" data-testid="brsr-section-a-tab">
            <Building2 className="w-4 h-4" />
            Section A
          </TabsTrigger>
          <TabsTrigger value="section_b" className="gap-2" data-testid="brsr-section-b-tab">
            <ClipboardList className="w-4 h-4" />
            Section B
          </TabsTrigger>
          <TabsTrigger value="section_c" className="gap-2" data-testid="brsr-section-c-tab">
            <BarChart3 className="w-4 h-4" />
            Section C
          </TabsTrigger>
        </TabsList>

        {/* Section A - General Disclosures */}
        <TabsContent value="section_a" className="mt-6">
          <BRSRDetailsSection
            key={`section-a-${responseRefreshKey}`}
            isEditing={isEditing}
            isCollapsible={false}
            reportingPeriod={reportingPeriod}
          />
        </TabsContent>

        {/* Section B - Management & Process Disclosures */}
        <TabsContent value="section_b" className="mt-6">
          <ESGQuestionnaire
            key={`section-b-${responseRefreshKey}`}
            framework="BRSR"
            section="section_b"
            isEditing={isEditing}
            reportingYear={reportingPeriod}
            importProposalsByQuestion={importProposalsByQuestion}
            importBusyId={importBusyId}
            onImportDecision={handleImportDecision}
          />
        </TabsContent>

        {/* Section C - Principle-wise Performance Disclosures */}
        <TabsContent value="section_c" className="mt-6">
          <BRSRSectionC
            key={`section-c-${responseRefreshKey}`}
            framework="BRSR"
            isEditing={isEditing}
            reportingYear={reportingPeriod}
            importProposalsByQuestion={importProposalsByQuestion}
            importBusyId={importBusyId}
            onImportDecision={handleImportDecision}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
