import React from 'react';
import { CheckCircle2, Loader2, Pencil, Save } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

export const SECTION_A_KEYS = {
  I: ['cin', 'entity_name', 'year_of_incorporation', 'registered_address', 'corporate_address', 'email', 'telephone', 'website',
    'financial_year', 'stock_exchange', 'paid_up_capital', 'contact_person', 'reporting_boundary', 'assurance_provider',
    'assurance_type', 'export_contribution', 'customer_types'],
  II: ['business_activities', 'products_services'],
  III: ['plants_offices', 'markets_served'],
  IV: ['employees_workers', 'differently_abled', 'women_representation', 'turnover_rate'],
  V: ['holding_subsidiary'],
  VI: ['csr_applicability'],
  VII: ['complaints_grievances', 'material_issues'],
};
for (const id of Object.keys(SECTION_A_KEYS)) SECTION_A_KEYS[id] = SECTION_A_KEYS[id].map((k) => `brsr_a_${k}`);

export const SECTION_A_TITLES = {
  I: 'Details of the listed entity', II: 'Products and services', III: 'Operations', IV: 'Employees',
  V: 'Holding and subsidiaries', VI: 'CSR details', VII: 'Transparency and compliance',
};

const BADGES = {
  approved: ['Approved', 'bg-green-100 text-green-800'],
  rejected: ['Rejected', 'bg-red-100 text-red-800'],
  pending_approval: ['Awaiting Approval', 'bg-amber-100 text-amber-800'],
  draft: ['Draft', 'bg-amber-100 text-amber-800'],
  saved: ['Saved', 'bg-blue-100 text-blue-800'],
};

export function QuestionStatusBadge({ status, label }) {
  const key = status?.approval_status && status.approval_status !== 'not_required' ? status.approval_status : status?.status;
  const badge = BADGES[key];
  if (!badge) return null;
  return <Badge className={`text-xs ${badge[1]}`}>{label ? `${label}: ` : ''}{badge[0]}</Badge>;
}

export function SectionHeading({ id, children }) {
  return (
    <div id={`brsr-group-${id}`} className="flex flex-wrap items-center justify-between gap-3 border-b pb-2 pt-2 scroll-mt-24"
         data-testid={`section-a-heading-${id}`}>
      <h4 className="text-sm font-semibold text-text-primary">{id}. {SECTION_A_TITLES[id]}</h4>
      {children}
    </div>
  );
}

export function SectionEditBar({ id, editingSection, canEdit, saving, onEdit, onCancel, onSave, approvalEnabled, isAdmin }) {
  if (!canEdit) return null;
  if (editingSection !== id) {
    return (
      <Button variant="outline" size="sm" className="h-8" disabled={Boolean(editingSection)} onClick={() => onEdit(id)}
              data-testid={`section-edit-${id}`}>
        <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="sm" className="h-8" disabled={saving} onClick={onCancel} data-testid={`section-cancel-${id}`}>Cancel</Button>
      <Button variant="outline" size="sm" className="h-8" disabled={saving} onClick={() => onSave(id, 'draft')}
              data-testid={`section-draft-${id}`}>
        <Save className="w-3.5 h-3.5 mr-1" /> Save as Draft
      </Button>
      <Button size="sm" className="h-8 bg-primary hover:bg-primary/90" disabled={saving} onClick={() => onSave(id, 'saved')}
              data-testid={`section-save-${id}`}>
        {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
        {approvalEnabled && !isAdmin ? 'Submit Response' : 'Save Response'}
      </Button>
    </div>
  );
}
