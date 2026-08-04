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

const API = process.env.REACT_APP_BACKEND_URL;

export default function BRSRModule() {
  const { token } = useAuth();
  
  const [activeTab, setActiveTab] = useState('section_a');
  const [reportingPeriod, setReportingPeriod] = useState('');
  const [reportingYears, setReportingYears] = useState([]);
  const [isEditing, setIsEditing] = useState(false);

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
          <h1 className="text-2xl font-bold text-text-primary">BRSR Framework</h1>
          <p className="text-text-muted mt-1">Business Responsibility & Sustainability Reporting</p>
        </div>
        
        <div className="flex items-center gap-3">
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
          <Button
            variant={isEditing ? 'outline' : 'default'}
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
            className={isEditing ? 'border-red-300 text-red-600 hover:bg-red-50' : ''}
          >
            {isEditing ? <><X className="w-4 h-4 mr-1" /> Done</> : <><Pencil className="w-4 h-4 mr-1" /> Edit</>}
          </Button>
        </div>
      </div>

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
            isEditing={isEditing}
            isCollapsible={false}
          />
        </TabsContent>

        {/* Section B - Management & Process Disclosures */}
        <TabsContent value="section_b" className="mt-6">
          <ESGQuestionnaire 
            framework="BRSR"
            section="section_b"
            isEditing={isEditing}
            reportingYear={reportingPeriod}
          />
        </TabsContent>

        {/* Section C - Principle-wise Performance Disclosures */}
        <TabsContent value="section_c" className="mt-6">
          <BRSRSectionC
            framework="BRSR"
            isEditing={isEditing}
            reportingYear={reportingPeriod}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
