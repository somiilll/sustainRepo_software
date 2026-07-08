import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { 
  BarChart3, 
  FileText, 
  Target, 
  Plus,
  ClipboardList
} from 'lucide-react';
import { generateReportingYears, getCurrentReportingYear } from '../utils/reportingYearUtils';
import { isAdmin } from '../utils/roleUtils';
import ESGRecordsTracker from './ESGRecordsTracker';
import ESGRecordsDataEntry from './ESGRecordsDataEntry';
import MyTasks from './MyTasks';
import ESGTargetsTab from './ESGTargetsTab';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * ESG Metrics Module - Enterprise ESG Operational Data Management
 * 
 * Subtabs:
 * - My Tasks: User's assigned metric tasks
 * - Tracker: Assignment & workflow management (all users can see their status)
 * - Data Entry: Metrics listing with draft support
 * - Targets: ESG reduction/performance targets (placeholder)
 * - Add Metric: Metric creation with save as draft
 */
export default function ESGRecordsModule({ section = 'environment', framework = null }) {
  const { token, user } = useAuth();
  const userIsAdmin = isAdmin(user);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('subtab') || 'my-tasks');
  const [reportingPeriod, setReportingPeriod] = useState('');
  const [reportingYears, setReportingYears] = useState([]);
  
  // Pre-filter from URL params (for Fill Now redirect)
  const [preFilterCategory, setPreFilterCategory] = useState(searchParams.get('category') || '');
  const [preFilterSubcategory, setPreFilterSubcategory] = useState(searchParams.get('subcategory') || '');
  const [preFilterFrequency, setPreFilterFrequency] = useState(searchParams.get('frequency') || '');
  const [preFilterPeriodStart, setPreFilterPeriodStart] = useState(searchParams.get('period_start') || '');

  // Handle URL params changes
  useEffect(() => {
    const subtab = searchParams.get('subtab');
    const category = searchParams.get('category');
    const subcategory = searchParams.get('subcategory');
    const frequency = searchParams.get('frequency');
    const periodStart = searchParams.get('period_start');
    
    console.log('ESGRecordsModule URL params:', { subtab, category, subcategory, frequency, periodStart });
    
    if (subtab) setActiveTab(subtab);
    if (category) setPreFilterCategory(category);
    if (subcategory) setPreFilterSubcategory(subcategory);
    if (frequency) setPreFilterFrequency(frequency);
    if (periodStart) setPreFilterPeriodStart(periodStart);
  }, [searchParams.toString()]);

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
      }
    };
    
    if (token) {
      fetchOrgAndSetYears();
    }
  }, [token]);

  return (
    <div className="space-y-6">
      {/* Module Header with Reporting Period */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-emerald-600" />
            ESG Metrics Management
          </h2>
          <p className="text-text-muted mt-1">
            Enterprise sustainability data collection & compliance tracking
          </p>
        </div>
        
        {/* Reporting Period Selector */}
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Reporting Period:</Label>
          <Select value={reportingPeriod} onValueChange={setReportingPeriod}>
            <SelectTrigger className="w-40 bg-white">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {reportingYears.map(year => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Subtabs - Different tabs for Admin vs User */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={`grid w-full ${userIsAdmin ? 'grid-cols-5' : 'grid-cols-4'} lg:w-[${userIsAdmin ? '750' : '600'}px]`}>
          <TabsTrigger value="my-tasks" className="gap-2" data-testid="metrics-my-tasks-tab">
            <ClipboardList className="w-4 h-4" />
            <span className="hidden sm:inline">My Tasks</span>
          </TabsTrigger>
          {/* Tracker Tab - Admin only (org-wide view & assignment) */}
          {userIsAdmin && (
            <TabsTrigger value="tracker" className="gap-2" data-testid="metrics-tracker-tab">
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Tracker</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="data-entry" className="gap-2" data-testid="metrics-data-entry-tab">
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Data Entry</span>
          </TabsTrigger>
          {/* Targets Tab - Admin only */}
          {userIsAdmin && (
            <TabsTrigger value="targets" className="gap-2" data-testid="metrics-targets-tab">
              <Target className="w-4 h-4" />
              <span className="hidden sm:inline">Targets</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="add-metric" className="gap-2" data-testid="metrics-add-tab">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Metric</span>
          </TabsTrigger>
        </TabsList>

        {/* My Tasks Tab */}
        <TabsContent value="my-tasks" className="mt-6">
          <MyTasks 
            entityType="record"
            reportingPeriod={reportingPeriod}
            domain={section}
          />
        </TabsContent>

        {/* Tracker Tab - Admin only (org-wide view & assignment) */}
        {userIsAdmin && (
          <TabsContent value="tracker" className="mt-6">
            <ESGRecordsTracker 
              section={section} 
              framework={framework}
            />
          </TabsContent>
        )}

        {/* Data Entry Tab */}
        <TabsContent value="data-entry" className="mt-6">
          <ESGRecordsDataEntry 
            section={section} 
            framework={framework} 
            mode="list"
            preFilterCategory={preFilterCategory}
            preFilterSubcategory={preFilterSubcategory}
          />
        </TabsContent>

        {/* Targets Tab - Admin only */}
        {userIsAdmin && (
          <TabsContent value="targets" className="mt-6">
            <ESGTargetsTab 
              section={section}
              reportingPeriod={reportingPeriod}
            />
          </TabsContent>
        )}

        {/* Add Metric Tab */}
        <TabsContent value="add-metric" className="mt-6">
          <ESGRecordsDataEntry 
            section={section} 
            framework={framework} 
            mode="add"
            preFilterCategory={preFilterCategory}
            preFilterSubcategory={preFilterSubcategory}
            preFilterFrequency={preFilterFrequency}
            preFilterPeriodStart={preFilterPeriodStart}
            onRecordAdded={() => setActiveTab('data-entry')}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
