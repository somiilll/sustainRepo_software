import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  BarChart3, 
  FileText, 
  Target, 
  Plus,
  ClipboardList
} from 'lucide-react';
import ESGRecordsTracker from './ESGRecordsTracker';
import ESGRecordsDataEntry from './ESGRecordsDataEntry';

/**
 * ESG Metrics Module - Enterprise ESG Operational Data Management
 * 
 * Subtabs:
 * - Tracker: Assignment & workflow management (like tracking)
 * - Data Entry: Metrics listing with draft support
 * - Targets: ESG reduction/performance targets (placeholder)
 * - Add Metric: Metric creation with save as draft
 */
export default function ESGRecordsModule({ section = 'environment', framework = 'BRSR' }) {
  const [activeTab, setActiveTab] = useState('tracker');

  return (
    <div className="space-y-6">
      {/* Module Header */}
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
      </div>

      {/* Subtabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="tracker" className="gap-2" data-testid="metrics-tracker-tab">
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">Tracker</span>
          </TabsTrigger>
          <TabsTrigger value="data-entry" className="gap-2" data-testid="metrics-data-entry-tab">
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Data Entry</span>
          </TabsTrigger>
          <TabsTrigger value="targets" className="gap-2" data-testid="metrics-targets-tab">
            <Target className="w-4 h-4" />
            <span className="hidden sm:inline">Targets</span>
          </TabsTrigger>
          <TabsTrigger value="add-metric" className="gap-2" data-testid="metrics-add-tab">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Metric</span>
          </TabsTrigger>
        </TabsList>

        {/* Tracker Tab */}
        <TabsContent value="tracker" className="mt-6">
          <ESGRecordsTracker section={section} framework={framework} />
        </TabsContent>

        {/* Data Entry Tab */}
        <TabsContent value="data-entry" className="mt-6">
          <ESGRecordsDataEntry 
            section={section} 
            framework={framework} 
            mode="list"
          />
        </TabsContent>

        {/* Targets Tab - Placeholder */}
        <TabsContent value="targets" className="mt-6">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Target className="w-16 h-16 text-stone-300 mb-4" />
            <h3 className="text-xl font-semibold text-text-primary mb-2">
              ESG Targets & Goals
            </h3>
            <p className="text-text-muted max-w-md">
              Track ESG reduction targets, performance goals, and progress metrics.
              This feature is coming soon.
            </p>
          </div>
        </TabsContent>

        {/* Add Metric Tab */}
        <TabsContent value="add-metric" className="mt-6">
          <ESGRecordsDataEntry 
            section={section} 
            framework={framework} 
            mode="add"
            onRecordAdded={() => setActiveTab('data-entry')}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
