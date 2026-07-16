import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Cloud, FileText } from 'lucide-react';
import ApproverQueue from '../components/ApproverQueue';
import ApprovalSection from '../modules/ghg/sections/ApprovalSection';

/**
 * Workflow Approver Queue — combines GHG Records and ESG Records approval queues.
 */
export default function WorkflowApproverQueue() {
  const [tab, setTab] = useState('esg');

  return (
    <div className="space-y-6" data-testid="workflow-approver-queue">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Approver Queue</h1>
        <p className="text-sm text-stone-500">Review and approve pending records across GHG and ESG modules.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="esg" className="gap-2" data-testid="approver-tab-esg">
            <FileText className="h-4 w-4" />
            ESG Records
          </TabsTrigger>
          <TabsTrigger value="ghg" className="gap-2" data-testid="approver-tab-ghg">
            <Cloud className="h-4 w-4" />
            GHG Records
          </TabsTrigger>
        </TabsList>

        <TabsContent value="esg" className="mt-4">
          <ApproverQueue />
        </TabsContent>

        <TabsContent value="ghg" className="mt-4">
          <ApprovalSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
