import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { List, PlusCircle, Target } from 'lucide-react';
import ESGRecordsDataEntry from './ESGRecordsDataEntry';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * ESG Records Module — 2 or 3-tab view: Metrics Logs + Add Metric + (Set Target).
 * Set Target renders a dedicated SetTargetForm that saves to configured_metric_records.
 * It does NOT affect environment_records, workflow tasks, or approval.
 */
export default function ESGRecordsModule({ section = 'environment', preFilterCategory = '', preFilterSubcategory: preFilterSubcatProp = '' }) {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const [reportingPeriod, setReportingPeriod] = useState('');
  const [reportingYears, setReportingYears] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showSetTarget, setShowSetTarget] = useState(false);
  const [TargetForm, setTargetForm] = useState(null);

  const category = preFilterCategory || searchParams.get('category') || '';
  const preFilterSubcategory = preFilterSubcatProp || searchParams.get('subcategory') || '';
  const defaultTab = searchParams.get('tab') || 'logs';

  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && (tab === 'logs' || tab === 'add-metric' || tab === 'set-target')) {
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

  // Check if Set Target is enabled for this org
  useEffect(() => {
    if (!token) return;
    axios.get(`${API}/sustainability-config/resolved`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => {
      const features = res.data?.features || {};
      if (features.set_target?.enabled) {
        setShowSetTarget(true);
        import('./SetTargetForm').then(mod => setTargetForm(() => mod.default));
      }
    }).catch(() => null);
  }, [token]);

  const handleRecordAdded = () => {
    setRefreshKey(prev => prev + 1);
    setActiveTab('logs');
  };

  return (
    <div className="space-y-5" data-testid={`esg-records-module-${section}`}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className={`${showSetTarget ? 'grid grid-cols-3' : 'grid grid-cols-2'} h-auto w-auto rounded-xl border border-stone-200 bg-stone-50/90 p-1 shadow-sm`}>
          <TabsTrigger value="logs" className="gap-2 rounded-lg px-4 py-2 text-sm font-medium text-stone-600 transition-colors data-[state=active]:bg-emerald-900 data-[state=active]:text-white data-[state=active]:shadow-sm" data-testid="esg-tab-logs">
            <List className="h-4 w-4" />
            <span className="hidden sm:inline">Metrics Logs</span>
          </TabsTrigger>
          <TabsTrigger value="add-metric" className="gap-2 rounded-lg px-4 py-2 text-sm font-medium text-stone-600 transition-colors data-[state=active]:bg-emerald-900 data-[state=active]:text-white data-[state=active]:shadow-sm" data-testid="esg-tab-add-metric">
            <PlusCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Add Metric</span>
          </TabsTrigger>
          {showSetTarget && (
            <TabsTrigger value="set-target" className="gap-2 rounded-lg px-4 py-2 text-sm font-medium text-stone-600 transition-colors data-[state=active]:bg-emerald-900 data-[state=active]:text-white data-[state=active]:shadow-sm" data-testid="esg-tab-set-target">
              <Target className="h-4 w-4" />
              <span className="hidden sm:inline">Set Target</span>
            </TabsTrigger>
          )}
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

        {showSetTarget && (
          <TabsContent value="set-target" className="mt-4">
            {TargetForm ? (
              <TargetForm
                section={section}
                preFilterCategory={category}
                preFilterSubcategory={preFilterSubcategory}
              />
            ) : (
              <div className="flex justify-center py-8 text-stone-400">Loading...</div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
