import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Leaf, Users2, Shield, ScrollText, BookOpen } from 'lucide-react';
import ESGRecordsTracker from '../components/ESGRecordsTracker';
import ESGTrackingTab from '../components/ESGTrackingTab';
import { ModulePageHeader } from '../components/ModulePageHeader';

const TRIGGER_CLASS = 'gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-stone-600 transition-colors data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-sm';

/**
 * Workflow Tracker — combined tracker for ESG sections + BRSR/GRI disclosures.
 */
export default function WorkflowTracker() {
  const [section, setSection] = useState('environment');

  return (
    <div className="space-y-7" data-testid="workflow-tracker">
      <ModulePageHeader title="Tracker" icon={ScrollText} iconClassName="border-indigo-200 bg-indigo-50 text-indigo-700" testId="workflow-tracker" />

      <Tabs value={section} onValueChange={setSection}>
        <TabsList className="inline-flex h-auto max-w-full flex-wrap items-center gap-1 rounded-2xl border border-stone-200 bg-stone-100/80 p-1.5">
          <TabsTrigger value="environment" className={TRIGGER_CLASS} data-testid="tracker-tab-environment">
            <Leaf className="h-4 w-4" />
            Environment
          </TabsTrigger>
          <TabsTrigger value="social" className={TRIGGER_CLASS} data-testid="tracker-tab-social">
            <Users2 className="h-4 w-4" />
            Social
          </TabsTrigger>
          <TabsTrigger value="governance" className={TRIGGER_CLASS} data-testid="tracker-tab-governance">
            <Shield className="h-4 w-4" />
            Governance
          </TabsTrigger>
          <span className="mx-1 h-6 w-px bg-stone-300" aria-hidden="true" />
          <TabsTrigger value="brsr" className={TRIGGER_CLASS} data-testid="tracker-tab-brsr">
            <ScrollText className="h-4 w-4" />
            BRSR
          </TabsTrigger>
          <TabsTrigger value="gri" className={TRIGGER_CLASS} data-testid="tracker-tab-gri">
            <BookOpen className="h-4 w-4" />
            GRI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="environment" className="mt-5">
          <ESGRecordsTracker section="environment" />
        </TabsContent>
        <TabsContent value="social" className="mt-5">
          <ESGRecordsTracker section="social" />
        </TabsContent>
        <TabsContent value="governance" className="mt-5">
          <ESGRecordsTracker section="governance" />
        </TabsContent>
        <TabsContent value="brsr" className="mt-5">
          <ESGTrackingTab domain="all" frameworkFilter="BRSR" hideReportingPeriodSelector={true} />
        </TabsContent>
        <TabsContent value="gri" className="mt-5">
          <ESGTrackingTab domain="all" frameworkFilter="GRI" hideReportingPeriodSelector={true} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
