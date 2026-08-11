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
 * Set Target tab appears only when the org's features.set_target.enabled is true.
 */
export default function ESGRecordsModule({ section = 'environment', preFilterCategory = '', preFilterSubcategory: preFilterSubcatProp = '' }) {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const [reportingPeriod, setReportingPeriod] = useState('');
  const [reportingYears, setReportingYears] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showSetTarget, setShowSetTarget] = useState(false);
  const [TargetsComponent, setTargetsComponent] = useState(null);

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
      const setTargetCfg = features.set_target;
      if (setTargetCfg?.enabled) {
        setShowSetTarget(true);
        // Lazy-load ESGTargetsTab only when needed
        import('./ESGTargetsTab').then(mod => {
          setTargetsComponent(() => mod.default);
        });
      }
    }).catch(() => null);
  }, [token]);

  const handleRecordAdded = () => {
    setRefreshKey(prev => prev + 1);
    setActiveTab('logs');
  };

  const tabCount = showSetTarget ? 3 : 2;

  return (
    <div className="space-y-4" data-testid={`esg-records-module-${section}`}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className={showSetTarget ? "grid w-full max-w-md grid-cols-3" : "grid w-full max-w-xs grid-cols-2"}>
          <TabsTrigger value="logs" className="gap-2" data-testid="esg-tab-logs">
            <List className="h-4 w-4" />
            <span className="hidden sm:inline">Metrics Logs</span>
          </TabsTrigger>
          <TabsTrigger value="add-metric" className="gap-2" data-testid="esg-tab-add-metric">
            <PlusCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Add Metric</span>
          </TabsTrigger>
          {showSetTarget && (
            <TabsTrigger value="set-target" className="gap-2" data-testid="esg-tab-set-target">
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
            {TargetsComponent ? (
              <TargetsComponent section={section} reportingPeriod={reportingPeriod} />
            ) : (
              <div className="flex justify-center py-8 text-stone-400">Loading targets...</div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
