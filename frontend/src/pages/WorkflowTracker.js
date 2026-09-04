import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Leaf, Users2, Shield, ScrollText, BookOpen } from 'lucide-react';
import ESGRecordsTracker from '../components/ESGRecordsTracker';
import ESGTrackingTab from '../components/ESGTrackingTab';
import { ModulePageHeader } from '../components/ModulePageHeader';

/**
 * Workflow Tracker — combined tracker for ESG sections + BRSR/GRI disclosures.
 * Uses ESGTrackingTab directly (no sub-tabs).
 */
export default function WorkflowTracker() {
  const [section, setSection] = useState('environment');

  return (
    <div className="space-y-7" data-testid="workflow-tracker">
      <ModulePageHeader title="Tracker" icon={ScrollText} iconClassName="border-indigo-200 bg-indigo-50 text-indigo-700" testId="workflow-tracker" />

      <Tabs value={section} onValueChange={setSection}>
        <TabsList className="grid w-full max-w-2xl grid-cols-5">
          <TabsTrigger value="environment" className="gap-2" data-testid="tracker-tab-environment">
            <Leaf className="h-4 w-4" />
            Environment
          </TabsTrigger>
          <TabsTrigger value="social" className="gap-2" data-testid="tracker-tab-social">
            <Users2 className="h-4 w-4" />
            Social
          </TabsTrigger>
          <TabsTrigger value="governance" className="gap-2" data-testid="tracker-tab-governance">
            <Shield className="h-4 w-4" />
            Governance
          </TabsTrigger>
          <TabsTrigger value="brsr" className="gap-2" data-testid="tracker-tab-brsr">
            <ScrollText className="h-4 w-4" />
            BRSR
          </TabsTrigger>
          <TabsTrigger value="gri" className="gap-2" data-testid="tracker-tab-gri">
            <BookOpen className="h-4 w-4" />
            GRI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="environment" className="mt-4">
          <ESGRecordsTracker section="environment" />
        </TabsContent>
        <TabsContent value="social" className="mt-4">
          <ESGRecordsTracker section="social" />
        </TabsContent>
        <TabsContent value="governance" className="mt-4">
          <ESGRecordsTracker section="governance" />
        </TabsContent>
        <TabsContent value="brsr" className="mt-4">
          <ESGTrackingTab domain="all" frameworkFilter="BRSR" hideReportingPeriodSelector={true} />
        </TabsContent>
        <TabsContent value="gri" className="mt-4">
          <ESGTrackingTab domain="all" frameworkFilter="GRI" hideReportingPeriodSelector={true} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
