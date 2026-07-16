import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { List, PlusCircle } from 'lucide-react';
import ESGRecordsDataEntry from './ESGRecordsDataEntry';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * ESG Records Module — 2-tab view: Metrics Logs + Add Metric.
 * Used by Environment (Energy, Water, Waste, etc.), Social, Governance pages.
 */
export default function ESGRecordsModule({ section = 'environment', preFilterCategory = '' }) {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const [reportingPeriod, setReportingPeriod] = useState('');
  const [reportingYears, setReportingYears] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const category = preFilterCategory || searchParams.get('category') || '';
  const preFilterSubcategory = searchParams.get('subcategory') || '';
  const defaultTab = searchParams.get('tab') || 'logs';

  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && (tab === 'logs' || tab === 'add-metric')) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!token) return;
    axios.get(`${API}/esg-records/reporting-years/${section}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => {
      const years = res.data || [];
      setReportingYears(years);
      if (years.length > 0 && !reportingPeriod) {
        setReportingPeriod(years[0]);
      }
    }).catch(() => null);
  }, [token, section]);

  const handleRecordAdded = () => {
    setRefreshKey(prev => prev + 1);
    setActiveTab('logs');
  };

  return (
    <div className="space-y-4" data-testid={`esg-records-module-${section}`}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="logs" className="gap-2" data-testid="esg-tab-logs">
            <List className="h-4 w-4" />
            <span className="hidden sm:inline">Metrics Logs</span>
          </TabsTrigger>
          <TabsTrigger value="add-metric" className="gap-2" data-testid="esg-tab-add-metric">
            <PlusCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Add Metric</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="mt-4">
          <ESGRecordsDataEntry
            key={`list-${refreshKey}`}
            section={section}
            mode="list"
            preFilterCategory={category}
            preFilterSubcategory={preFilterSubcategory}
          />
        </TabsContent>

        <TabsContent value="add-metric" className="mt-4">
          <ESGRecordsDataEntry
            section={section}
            mode="add"
            preFilterCategory={category}
            preFilterSubcategory={preFilterSubcategory}
            onRecordAdded={handleRecordAdded}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
