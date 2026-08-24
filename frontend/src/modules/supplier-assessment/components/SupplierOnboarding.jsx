import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, CheckCircle2, ClipboardList, ListChecks } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Progress } from '../../../components/ui/progress';

const stepMeta = [
  { id: 'facility', title: 'Facility Information', description: 'Complete the required information about your facility.', Icon: Building2 },
  { id: 'assessment', title: 'Supplier Assessment', description: 'Review the ESG and supplier assessments assigned to you.', Icon: ClipboardList },
  { id: 'tasks', title: 'Your Tasks', description: 'Complete questionnaires, document requests, training, and other requirements.', Icon: ListChecks },
];

const statusText = (status) => status === 'completed' ? 'Completed' : status === 'in_progress' ? 'In Progress' : 'Not Started';

export const SupplierOnboarding = ({ onboarding }) => {
  const navigate = useNavigate();
  const completed = stepMeta.filter((step) => onboarding.steps?.[step.id] === 'completed').length;
  return <main className="mx-auto max-w-3xl space-y-8 py-6" data-testid="supplier-onboarding">
    <header className="border-b border-stone-200 pb-6"><p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Supplier workspace</p><h1 className="mt-2 text-3xl font-semibold text-stone-900">Welcome to {onboarding.parent_name}</h1><p className="mt-2 text-sm text-stone-600">Let’s get your supplier account set up. Complete your facility information first, then review the tasks assigned to you.</p><div className="mt-5"><div className="mb-2 flex justify-between text-sm"><span className="font-medium text-stone-700">Getting started</span><span className="text-stone-500">{completed} of 3 complete</span></div><Progress value={(completed / 3) * 100} className="h-2" data-testid="supplier-onboarding-progress" /></div></header>
    <div className="space-y-3" data-testid="supplier-onboarding-steps">{stepMeta.map((step, index) => { const status = onboarding.steps?.[step.id] || 'not_started'; const Icon = step.Icon; const isPrimary = step.id === 'facility'; return <section key={step.id} className={`grid gap-4 border p-5 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center ${isPrimary ? 'border-emerald-200 bg-emerald-50/40' : 'border-stone-200 bg-white'}`} data-testid={`supplier-onboarding-step-${step.id}`}><div className={`flex h-9 w-9 items-center justify-center rounded-full ${status === 'completed' ? 'bg-emerald-600 text-white' : isPrimary ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>{status === 'completed' ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}</div><div><p className="text-sm font-semibold text-stone-900">{index + 1}. {step.title}</p><p className="mt-1 text-sm text-stone-600">{step.description}</p><p className="mt-2 text-xs font-medium text-stone-500" data-testid={`supplier-onboarding-status-${step.id}`}>{statusText(status)}</p></div>{isPrimary && <Button onClick={() => navigate('/supplier-assessment/supplier/facility')} data-testid="continue-facility-setup-button">Continue Setup <ArrowRight className="ml-2 h-4 w-4" /></Button>}</section>; })}</div>
  </main>;
};