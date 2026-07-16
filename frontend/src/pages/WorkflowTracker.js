import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Leaf, Users2, Shield } from 'lucide-react';
import ESGRecordsTracker from '../components/ESGRecordsTracker';

/**
 * Workflow Tracker — combined tracker for Environment, Social, and Governance sections.
 */
export default function WorkflowTracker() {
  const [section, setSection] = useState('environment');

  return (
    <div className="space-y-6" data-testid="workflow-tracker">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Tracker</h1>
        <p className="text-sm text-stone-500">Track data collection progress across all ESG sections.</p>
      </div>

      <Tabs value={section} onValueChange={setSection}>
        <TabsList className="grid w-full max-w-lg grid-cols-3">
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
      </Tabs>
    </div>
  );
}
