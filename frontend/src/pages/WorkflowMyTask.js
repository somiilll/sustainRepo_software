import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Leaf, ScrollText, BookOpen } from 'lucide-react';
import MyAssignments from './MyAssignments';
import MyTasks from '../components/MyTasks';

/**
 * Workflow My Task — combined view for ESG metric tasks + BRSR/GRI disclosure tasks.
 */
export default function WorkflowMyTask() {
  const [tab, setTab] = useState('esg');

  return (
    <div className="space-y-6" data-testid="workflow-my-task">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">My Tasks</h1>
        <p className="text-sm text-stone-500">View and complete your assigned tasks across all modules.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="esg" className="gap-2" data-testid="mytask-tab-esg">
            <Leaf className="h-4 w-4" />
            ESG Metrics
          </TabsTrigger>
          <TabsTrigger value="brsr" className="gap-2" data-testid="mytask-tab-brsr">
            <ScrollText className="h-4 w-4" />
            BRSR
          </TabsTrigger>
          <TabsTrigger value="gri" className="gap-2" data-testid="mytask-tab-gri">
            <BookOpen className="h-4 w-4" />
            GRI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="esg" className="mt-4">
          <MyAssignments />
        </TabsContent>
        <TabsContent value="brsr" className="mt-4">
          <MyTasks entityType="question" framework="BRSR" />
        </TabsContent>
        <TabsContent value="gri" className="mt-4">
          <MyTasks entityType="question" framework="GRI" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
