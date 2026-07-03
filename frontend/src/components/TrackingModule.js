/**
 * Tracking Module Component
 * 
 * Wrapper component that provides subtabs for tracking functionality:
 * - My Tasks: Current user's pending assignments (all users)
 * - Tracker: Admin view for assignment management (admin only)
 * 
 * @param {string} domain - 'environment' | 'social' | 'governance'
 * @param {string} entityType - 'record' for Metrics, 'question' for Disclosures
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { ClipboardList, BarChart3 } from 'lucide-react';
import { generateReportingYears, getCurrentReportingYear } from '../utils/reportingYearUtils';
import MyTasks from './MyTasks';
import ESGTrackingTab from './ESGTrackingTab';

const API = process.env.REACT_APP_BACKEND_URL;

export default function TrackingModule({ domain = 'environment', entityType = 'all' }) {
  const { token, user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  
  const [activeTab, setActiveTab] = useState('my-tasks');
  const [reportingPeriod, setReportingPeriod] = useState('');
  const [reportingYears, setReportingYears] = useState([]);

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

  // Get label based on entity type
  const getEntityLabel = () => {
    if (entityType === 'record') return 'Metrics';
    if (entityType === 'question') return 'Disclosures';
    return 'All';
  };

  return (
    <div className="space-y-6">
      {/* Header with Reporting Period */}
      <div className="flex items-center justify-between">
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

      {/* Subtabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'} lg:w-[400px]`}>
          <TabsTrigger value="my-tasks" className="gap-2" data-testid="tracking-my-tasks-tab">
            <ClipboardList className="w-4 h-4" />
            My Tasks
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="tracker" className="gap-2" data-testid="tracking-tracker-tab">
              <BarChart3 className="w-4 h-4" />
              Tracker
            </TabsTrigger>
          )}
        </TabsList>

        {/* My Tasks Tab */}
        <TabsContent value="my-tasks" className="mt-6">
          <MyTasks 
            entityType={entityType}
            reportingPeriod={reportingPeriod}
            domain={domain}
          />
        </TabsContent>

        {/* Tracker Tab (Admin Only) */}
        {isAdmin && (
          <TabsContent value="tracker" className="mt-6">
            <ESGTrackingTab 
              domain={domain}
              reportingPeriodOverride={reportingPeriod}
              hideReportingPeriodSelector={true}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
