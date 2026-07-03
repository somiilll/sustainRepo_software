/**
 * BRSR Module Component
 * 
 * Business Responsibility & Sustainability Reporting module.
 * Contains:
 * - My Tasks: User's assigned disclosure tasks
 * - Tracker: Disclosure assignment management
 * - Section A: General Information
 * - Section B: Management & Process
 * - Section C: Principles (Environment, Social, Governance)
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { 
  ClipboardList, 
  BarChart3, 
  FileText,
  Building2,
  Settings,
  Leaf,
  Users,
  Shield
} from 'lucide-react';
import { generateReportingYears, getCurrentReportingYear } from '../utils/reportingYearUtils';
import MyTasks from './MyTasks';
import ESGTrackingTab from './ESGTrackingTab';
import ESGQuestionnaire from './ESGQuestionnaire';

const API = process.env.REACT_APP_BACKEND_URL;

export default function BRSRModule() {
  const { token, user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  
  const [activeTab, setActiveTab] = useState('my-tasks');
  const [activeSection, setActiveSection] = useState('environment');
  const [reportingPeriod, setReportingPeriod] = useState('');
  const [reportingYears, setReportingYears] = useState([]);

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

  // Section configuration for Section C
  const sections = [
    { key: 'environment', label: 'Environment', icon: Leaf, color: 'text-green-600' },
    { key: 'social', label: 'Social', icon: Users, color: 'text-blue-600' },
    { key: 'governance', label: 'Governance', icon: Shield, color: 'text-purple-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Header with Reporting Period */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-text-primary">BRSR Framework</h2>
          <p className="text-sm text-text-muted">Business Responsibility & Sustainability Reporting</p>
        </div>
        
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

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="my-tasks" className="gap-2" data-testid="brsr-my-tasks-tab">
            <ClipboardList className="w-4 h-4" />
            My Tasks
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="tracker" className="gap-2" data-testid="brsr-tracker-tab">
              <BarChart3 className="w-4 h-4" />
              Tracker
            </TabsTrigger>
          )}
          <TabsTrigger value="section-a" className="gap-2" data-testid="brsr-section-a-tab">
            <Building2 className="w-4 h-4" />
            Section A
          </TabsTrigger>
          <TabsTrigger value="section-b" className="gap-2" data-testid="brsr-section-b-tab">
            <Settings className="w-4 h-4" />
            Section B
          </TabsTrigger>
          <TabsTrigger value="section-c" className="gap-2" data-testid="brsr-section-c-tab">
            <FileText className="w-4 h-4" />
            Section C
          </TabsTrigger>
        </TabsList>

        {/* My Tasks */}
        <TabsContent value="my-tasks" className="mt-6">
          <MyTasks 
            entityType="question"
            reportingPeriod={reportingPeriod}
            domain="all"
          />
        </TabsContent>

        {/* Tracker (Admin) */}
        {isAdmin && (
          <TabsContent value="tracker" className="mt-6">
            <ESGTrackingTab 
              domain="all"
              reportingPeriodOverride={reportingPeriod}
              hideReportingPeriodSelector={true}
            />
          </TabsContent>
        )}

        {/* Section A - General Information */}
        <TabsContent value="section-a" className="mt-6">
          <ESGQuestionnaire 
            framework="BRSR"
            section="section_a"
          />
        </TabsContent>

        {/* Section B - Management */}
        <TabsContent value="section-b" className="mt-6">
          <ESGQuestionnaire 
            framework="BRSR"
            section="section_b"
          />
        </TabsContent>

        {/* Section C - Principles (with sub-tabs for E/S/G) */}
        <TabsContent value="section-c" className="mt-6">
          <div className="space-y-4">
            {/* Section C sub-navigation */}
            <div className="flex items-center gap-2 border-b pb-4">
              {sections.map(sec => {
                const Icon = sec.icon;
                const isActive = activeSection === sec.key;
                return (
                  <button
                    key={sec.key}
                    onClick={() => setActiveSection(sec.key)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      isActive 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : 'hover:bg-stone-100 text-text-secondary'
                    }`}
                    data-testid={`brsr-section-c-${sec.key}`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? sec.color : ''}`} />
                    {sec.label}
                  </button>
                );
              })}
            </div>

            {/* Section C content based on selected section */}
            <ESGQuestionnaire 
              framework="BRSR"
              section={activeSection}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
