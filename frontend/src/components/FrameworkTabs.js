import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { FileText, BarChart3 } from 'lucide-react';
import TrackingModule from './TrackingModule';

/**
 * ESG Module Tabs Component
 * 
 * Provides tabs for ESG sections (Environment, Social, Governance):
 * - Metrics: ESG operational data management
 * - Tracking: Task management and workflow tracking
 * 
 * Note: Framework-specific content (BRSR, GRI, etc.) is now in the Reporting module.
 * 
 * @param {string} moduleType - 'environment' | 'social' | 'governance'
 * @param {React.ReactNode} metricsContent - Content for Metrics tab
 */
export default function FrameworkTabs({ 
  moduleType, 
  metricsContent,
  recordsContent, // Keep for backward compatibility
}) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'metrics');

  // Sync tab from URL
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && (tab === 'metrics' || tab === 'tracking')) {
      setActiveTab(tab);
    }
  }, [searchParams.toString()]);

  // Build tabs: Metrics + Tracking
  const tabs = [
    { key: 'metrics', label: 'Metrics', icon: FileText },
    { key: 'tracking', label: 'Tracking', icon: BarChart3 },
  ];

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="bg-stone-100 p-1 rounded-lg mb-6">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <TabsTrigger
              key={tab.key}
              value={tab.key}
              className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"
              data-testid={`esg-tab-${tab.key}`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {/* Metrics Tab */}
      <TabsContent value="metrics" className="mt-0">
        {metricsContent || recordsContent}
      </TabsContent>
      
      {/* Tracking Tab - My Tasks + Tracker for metrics */}
      <TabsContent value="tracking" className="mt-0">
        <TrackingModule domain={moduleType} entityType="record" />
      </TabsContent>
    </Tabs>
  );
}
