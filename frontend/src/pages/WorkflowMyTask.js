import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Leaf, ScrollText, BookOpen, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { generateReportingYears, getCurrentReportingYear } from '../utils/reportingYearUtils';
import MyTasks from '../components/MyTasks';
import { ModulePageHeader } from '../components/ModulePageHeader';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * Workflow My Task — combined view for ESG metric tasks + BRSR/GRI disclosure tasks.
 */
export default function WorkflowMyTask() {
  const { token } = useAuth();
  const [tab, setTab] = useState('esg');
  const [reportingPeriod, setReportingPeriod] = useState('');
  const [reportingYears, setReportingYears] = useState([]);
  const [loading, setLoading] = useState(true);

  // Initialize reporting years from org config
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
      } catch (error) {
        // Fallback to financial year
        const years = generateReportingYears('financial_year', 5);
        setReportingYears(years);
        setReportingPeriod(getCurrentReportingYear('financial_year'));
      } finally {
        setLoading(false);
      }
    };
    
    if (token) {
      fetchOrgAndSetYears();
    }
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="workflow-my-task">
      <ModulePageHeader
        title="My Tasks"
        icon={ScrollText}
        iconClassName="border-indigo-200 bg-indigo-50 text-indigo-700"
        testId="workflow-my-tasks"
        aside={<div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap text-stone-600">Reporting Period:</Label>
          <Select value={reportingPeriod} onValueChange={setReportingPeriod}>
            <SelectTrigger className="w-40 bg-white" data-testid="reporting-period-selector">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {reportingYears.map(year => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="esg" className="gap-2" data-testid="mytask-tab-esg">
            <Leaf className="h-4 w-4" />
            ESG Metrics
          </TabsTrigger>
          <TabsTrigger value="brsr" className="gap-2" data-testid="mytask-tab-brsr">
            <ScrollText className="h-4 w-4" />
            BRSR
          </TabsTrigger>
          <TabsTrigger value="gri" className="gap-2" data-testid="mytask-tab-gri">
            <BookOpen className="h-4 w-4" />
            GRI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="esg" className="mt-4">
          <MyTasks entityType="record" reportingPeriod={reportingPeriod} />
        </TabsContent>
        <TabsContent value="brsr" className="mt-4">
          <MyTasks entityType="question" framework="BRSR" reportingPeriod={reportingPeriod} />
        </TabsContent>
        <TabsContent value="gri" className="mt-4">
          <MyTasks entityType="question" framework="GRI" reportingPeriod={reportingPeriod} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
