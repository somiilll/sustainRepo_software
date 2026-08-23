import React from 'react';
import { Badge } from '../../../components/ui/badge';
import { CheckCircle, Clock, Circle } from 'lucide-react';

const statusPresentation = {
  completed: { label: 'Completed', icon: CheckCircle, className: 'bg-emerald-100 text-emerald-800' },
  ready: { label: 'Ready to submit', icon: Clock, className: 'bg-blue-100 text-blue-800' },
  pending: { label: 'Pending', icon: Circle, className: 'bg-amber-100 text-amber-800' },
};

export default function RevenueTaskChecklist({ relationship }) {
  const percentageEntered = relationship.revenue_percentage !== null && relationship.revenue_percentage !== undefined;
  const amountEntered = relationship.revenue_amount !== null && relationship.revenue_amount !== undefined;
  const submitted = relationship.revenue_submission_status === 'submitted';
  const tasks = [
    { id: 'percentage', label: 'Enter revenue percentage', status: percentageEntered ? 'completed' : 'pending' },
    { id: 'amount', label: 'Enter annual revenue amount', status: amountEntered ? 'completed' : 'pending' },
    { id: 'submit', label: 'Submit revenue information', status: submitted ? 'completed' : percentageEntered && amountEntered ? 'ready' : 'pending' },
  ];

  return (
    <section className="border-y border-stone-100 py-4" data-testid="revenue-task-checklist">
      <p className="mb-3 text-sm font-medium text-stone-800" data-testid="revenue-task-checklist-title">Revenue tasks</p>
      <ul className="space-y-2" data-testid="revenue-task-list">
        {tasks.map((task) => {
          const presentation = statusPresentation[task.status];
          const Icon = presentation.icon;
          return (
            <li className="flex items-center justify-between gap-3 text-sm" key={task.id} data-testid={`revenue-task-${task.id}`}>
              <span className="flex items-center gap-2 text-stone-700"><Icon className="h-4 w-4 text-stone-500" />{task.label}</span>
              <Badge className={presentation.className} data-testid={`revenue-task-${task.id}-status`}>{presentation.label}</Badge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}