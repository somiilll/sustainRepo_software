/**
 * GRI Module Component
 * 
 * Global Reporting Initiative Standards module.
 * Tabs:
 * - Tracking: My Tasks + Admin Tracker for disclosures
 * - Environment: GRI 300 series
 * - Social: GRI 400 series
 * - Governance: GRI 200 series
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { 
  BarChart3,
  Leaf,
  Users,
  Shield
} from 'lucide-react';
import { generateReportingYears, getCurrentReportingYear } from '../utils/reportingYearUtils';
import TrackingModule from './TrackingModule';
import GRIQuestionnaire from './GRIQuestionnaire';

const API = process.env.REACT_APP_BACKEND_URL;

export default function GRIModule() {
  const { token } = useAuth();
  
  const [activeTab, setActiveTab] = useState('environment');
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

  return (
    <div className="space-y-6">
      {/* Header with Reporting Period */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">GRI Framework</h1>
          <p className="text-text-muted mt-1">Global Reporting Initiative Standards</p>
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
        <TabsList className="bg-stone-100 p-1 rounded-lg">
          <TabsTrigger value="environment" className="gap-2" data-testid="gri-environment-tab">
            <Leaf className="w-4 h-4" />
            Environment
          </TabsTrigger>
          <TabsTrigger value="social" className="gap-2" data-testid="gri-social-tab">
            <Users className="w-4 h-4" />
            Social
          </TabsTrigger>
          <TabsTrigger value="governance" className="gap-2" data-testid="gri-governance-tab">
            <Shield className="w-4 h-4" />
            Governance
          </TabsTrigger>
        </TabsList>

        {/* Environment - GRI 300 */}
        <TabsContent value="environment" className="mt-6">
          <GRIQuestionnaire 
            section="environment"
          />
        </TabsContent>

        {/* Social - GRI 400 */}
        <TabsContent value="social" className="mt-6">
          <GRIQuestionnaire 
            section="social"
          />
        </TabsContent>

        {/* Governance - GRI 200 */}
        <TabsContent value="governance" className="mt-6">
          <GRIQuestionnaire 
            section="governance"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
