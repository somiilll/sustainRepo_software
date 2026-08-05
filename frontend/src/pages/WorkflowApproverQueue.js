import React from 'react';
import ApproverQueue from '../components/ApproverQueue';

/**
 * Workflow Approver Queue — ESG Records approval queue.
 */
export default function WorkflowApproverQueue() {
  return (
    <div className="space-y-6" data-testid="workflow-approver-queue">
      <ApproverQueue />
    </div>
  );
}
