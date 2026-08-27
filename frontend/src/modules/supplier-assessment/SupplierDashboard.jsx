import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { AlertCircle, AlertTriangle, Calendar, ClipboardList, Cloud, DollarSign, FileText, GraduationCap } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { SupplierOnboarding } from './components/SupplierOnboarding';
import { SupplierModulePanel } from './components/SupplierModuleAccordion';
import { SupplierPageHeader } from './components/SupplierPageHeader';
import { SupplierProgressStrip } from './components/SupplierProgressStrip';
import { SupplierRevenueContent } from './components/SupplierRevenueContent';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const hasValue = (value) => value !== null && value !== undefined && value !== '';

const parseDueDate = (value) => {
  if (!value) return null;
  const dateOnlyMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dueDate = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]), 23, 59, 59, 999)
    : new Date(value);
  return Number.isNaN(dueDate.getTime()) ? null : dueDate;
};

const statusBadge = (status, testId) => {
  const styles = {
    submitted: 'bg-emerald-100 text-emerald-800',
    completed: 'bg-emerald-100 text-emerald-800',
    in_progress: 'bg-blue-100 text-blue-800',
    pending: 'bg-amber-100 text-amber-800',
  };
  const labels = { submitted: 'Submitted', completed: 'Completed', in_progress: 'In progress', pending: 'Not started' };
  return <Badge className={styles[status] || styles.pending} data-testid={testId}>{labels[status] || labels.pending}</Badge>;
};

export default function SupplierDashboard() {
  const { getAuthHeader } = useAuth();
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState(null);
  const [questionnaires, setQuestionnaires] = useState([]);
  const [ghgState, setGhgState] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [onboarding, setOnboarding] = useState(null);
  const [revenuePercentage, setRevenuePercentage] = useState('');
  const [revenueAmount, setRevenueAmount] = useState('');
  const [revenueCurrency, setRevenueCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submittingRevenue, setSubmittingRevenue] = useState(false);
  const [showRevenueSubmitConfirm, setShowRevenueSubmitConfirm] = useState(false);

  const safeGet = useCallback(async (path) => {
    try { return (await axios.get(`${API}${path}`, { headers: getAuthHeader() })).data; }
    catch { return null; }
  }, [getAuthHeader]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const assessmentData = await safeGet('/supplier-assessment/my-assessment');
      if (!assessmentData) { setAssessment(null); return; }
      setAssessment(assessmentData);
      const codes = new Set((assessmentData.assessment_modules || []).map((module) => module.code));
      const [questionnaireData, ghgData, documentData, trainingData, onboardingData] = await Promise.all([
        codes.has('esg') ? safeGet('/supplier-assessment/my-assessment/questionnaires') : [],
        codes.has('ghg') ? safeGet('/supplier-assessment/my-assessment/emissions/submission') : null,
        codes.has('documents') ? safeGet('/supplier-assessment/my-assessment/documents') : [],
        codes.has('training') ? safeGet('/supplier-assessment/my-assessment/trainings') : [],
        safeGet('/supplier-assessment/my-assessment/onboarding'),
      ]);
      setQuestionnaires(questionnaireData || []); setGhgState(ghgData); setDocuments(documentData || []); setTrainings(trainingData || []); setOnboarding(onboardingData);
      const relationship = assessmentData.relationship || {};
      setRevenuePercentage(relationship.revenue_percentage ?? ''); setRevenueAmount(relationship.revenue_amount ?? ''); setRevenueCurrency(relationship.revenue_currency || 'USD');
    } finally { setLoading(false); }
  }, [safeGet]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="py-20 text-center text-sm text-slate-500" data-testid="supplier-dashboard-loading">Loading assessment…</p>;
  if (!assessment) return <div className="py-20 text-center" data-testid="supplier-dashboard-empty"><AlertCircle className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-4 text-xl font-semibold text-slate-800">No Active Assessment</h2><p className="mt-2 text-sm text-slate-500">You don&apos;t have an active supplier assessment assigned.</p></div>;
  if (onboarding && !onboarding.onboarding_complete) return <SupplierOnboarding onboarding={onboarding} />;

  const { relationship, customer_name: customerName } = assessment;
  const modules = new Map((assessment.assessment_modules || []).map((module) => [module.code, module]));
  const revenueRequired = relationship.revenue_required === true;
  const revenueSubmitted = relationship.revenue_submission_status === 'submitted';
  const percentageEntered = hasValue(relationship.revenue_percentage);
  const amountEntered = hasValue(relationship.revenue_amount);
  const revenueFieldCount = revenueRequired ? 2 : 1;
  const revenueFieldsFilled = Number(percentageEntered) + Number(revenueRequired && amountEntered);
  const revenueFilledProgress = Math.round((revenueFieldsFilled / revenueFieldCount) * 100);
  const submittedQuestionnaires = questionnaires.filter((questionnaire) => questionnaire.status === 'submitted').length;
  const esgSubmittedProgress = questionnaires.length ? (submittedQuestionnaires / questionnaires.length) * 100 : 0;
  const ghgSubmitted = ghgState?.submission?.status === 'submitted';
  const ghgHasDraftEntries = (ghgState?.draft_aggregation || []).some((entry) => entry.entry_count > 0);
  const submittedDocuments = documents.filter((document) => document.submission_status === 'submitted');
  const filledDocuments = documents.filter((document) => document.accepted || document.selected_response || document.submission_status === 'submitted');
  const documentFilledProgress = documents.length ? (filledDocuments.length / documents.length) * 100 : 0;
  const documentSubmittedProgress = documents.length ? (submittedDocuments.length / documents.length) * 100 : 0;
  const documentsSubmitted = documents.length > 0 && submittedDocuments.length === documents.length;
  const pendingDocuments = documents.filter((document) => document.submission_status !== 'submitted');
  const completedTrainings = trainings.filter((training) => training.status === 'completed');
  const dueDate = parseDueDate(relationship.due_date);
  const dueDateOverdue = Boolean(dueDate && dueDate < new Date());

  const progressItems = [
    { id: 'revenue', label: 'Revenue', progress: revenueSubmitted ? 100 : 0, Icon: DollarSign, iconClassName: 'bg-blue-50 text-blue-700', shadowClassName: 'shadow-[0_3px_10px_rgba(59,130,246,0.14)]' },
    ...(modules.has('esg') ? [{ id: 'esg', label: 'ESG Questionnaire', progress: esgSubmittedProgress, Icon: ClipboardList, iconClassName: 'bg-indigo-50 text-indigo-700', shadowClassName: 'shadow-[0_3px_10px_rgba(99,102,241,0.14)]' }] : []),
    ...(modules.has('ghg') ? [{ id: 'ghg', label: 'GHG Emissions', progress: ghgSubmitted ? 100 : 0, Icon: Cloud, iconClassName: 'bg-emerald-50 text-emerald-700', shadowClassName: 'shadow-[0_3px_10px_rgba(16,185,129,0.14)]' }] : []),
    ...(modules.has('documents') ? [{ id: 'documents', label: 'Documents', progress: documentSubmittedProgress, Icon: FileText, iconClassName: 'bg-cyan-50 text-cyan-700', shadowClassName: 'shadow-[0_3px_10px_rgba(6,182,212,0.14)]' }] : []),
    ...(modules.has('training') ? [{ id: 'training', label: 'Training', progress: modules.get('training').completion_percent, Icon: GraduationCap, iconClassName: 'bg-amber-50 text-amber-700', shadowClassName: 'shadow-[0_3px_10px_rgba(245,158,11,0.14)]' }] : []),
  ];

  const validateRevenue = () => {
    const percentage = revenuePercentage === '' ? null : Number(revenuePercentage);
    const amount = revenueAmount === '' ? null : Number(revenueAmount);
    if (percentage === null || Number.isNaN(percentage) || percentage < 0 || percentage > 100) { toast.error('Revenue percentage is required and must be between 0 and 100'); return null; }
    if (revenueRequired && (amount === null || Number.isNaN(amount) || amount < 0)) { toast.error('Annual revenue amount is required'); return null; }
    if (amount !== null && (Number.isNaN(amount) || amount < 0)) { toast.error('Enter a valid annual revenue amount'); return null; }
    return { revenue_percentage: percentage, revenue_amount: amount, revenue_currency: revenueCurrency };
  };

  const saveRevenue = async () => {
    const payload = validateRevenue(); if (!payload) return;
    setSaving(true);
    try { await axios.put(`${API}/supplier-assessment/my-assessment/revenue`, payload, { headers: getAuthHeader() }); toast.success('Revenue information saved'); await load(); }
    catch (error) { toast.error(error.response?.data?.detail || 'Failed to save revenue information'); }
    finally { setSaving(false); }
  };

  const submitRevenue = async () => {
    const payload = validateRevenue(); if (!payload) return;
    setSubmittingRevenue(true);
    try { await axios.put(`${API}/supplier-assessment/my-assessment/revenue`, payload, { headers: getAuthHeader() }); await axios.post(`${API}/supplier-assessment/my-assessment/revenue/submit`, {}, { headers: getAuthHeader() }); toast.success('Revenue information submitted'); setShowRevenueSubmitConfirm(false); await load(); }
    catch (error) { toast.error(error.response?.data?.detail || 'Could not submit revenue information'); }
    finally { setSubmittingRevenue(false); }
  };

  return <div className="mx-auto max-w-7xl space-y-7 pb-10" data-testid="supplier-dashboard">
    <SupplierPageHeader title="Supplier Assessment" icon={ClipboardList} iconClassName="border-emerald-200 bg-emerald-50 text-emerald-800" testId="supplier-assessment" aside={dueDate && <Badge variant="outline" className={dueDateOverdue ? 'border-red-300 bg-red-50 text-red-800' : 'border-blue-200 bg-white text-blue-800'} data-testid="supplier-assessment-due-date">{dueDateOverdue ? <AlertTriangle className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> : <Calendar className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}{dueDateOverdue ? 'Overdue · ' : ''}Due {dueDate.toLocaleDateString('en-GB')}</Badge>} />

    <SupplierProgressStrip items={progressItems} />

    <section className="space-y-3" data-testid="supplier-assessment-modules">
      <div><p className="text-xs font-semibold uppercase text-slate-500">Assigned modules</p><h2 className="mt-1 text-lg font-semibold text-slate-900">Complete each requirement</h2></div>
      <div className="space-y-8" data-testid="supplier-module-panels">
        <SupplierModulePanel title="Revenue Information" description={`Share your revenue relationship with ${customerName}.`} progress={revenueFilledProgress} status={statusBadge(revenueSubmitted ? 'submitted' : revenueFilledProgress ? 'in_progress' : 'pending', 'revenue-overview-status-badge')} icon={DollarSign} iconClassName="bg-blue-50 text-blue-700" shadowClassName="shadow-[0_10px_28px_rgba(59,130,246,0.18)] hover:shadow-[0_14px_34px_rgba(59,130,246,0.24)]" testId="supplier-revenue-module-panel" collapsible>
          <SupplierRevenueContent relationship={relationship} customerName={customerName} revenueRequired={revenueRequired} revenuePercentage={revenuePercentage} setRevenuePercentage={setRevenuePercentage} revenueAmount={revenueAmount} setRevenueAmount={setRevenueAmount} revenueCurrency={revenueCurrency} setRevenueCurrency={setRevenueCurrency} saving={saving} submitting={submittingRevenue} onSave={saveRevenue} onSubmit={() => { if (validateRevenue()) setShowRevenueSubmitConfirm(true); }} />
        </SupplierModulePanel>

        {modules.has('esg') && questionnaires.length === 0 && <SupplierModulePanel title="ESG Questionnaire" description="No questionnaire has been assigned yet." progress={0} status={statusBadge('pending', 'supplier-esg-empty-status')} icon={ClipboardList} iconClassName="bg-indigo-50 text-indigo-700" shadowClassName="shadow-[0_10px_28px_rgba(99,102,241,0.18)] hover:shadow-[0_14px_34px_rgba(99,102,241,0.24)]" testId="supplier-esg-module-panel"><p className="text-sm text-slate-500">Your customer has not assigned an ESG questionnaire yet.</p></SupplierModulePanel>}
        {modules.has('esg') && questionnaires.map((questionnaire) => <SupplierModulePanel key={questionnaire.questionnaire_id} title={questionnaire.questionnaire_name} description={questionnaire.status === 'submitted' ? 'Response submitted and locked.' : 'Response open.'} progress={questionnaire.completion_percent} status={statusBadge(questionnaire.status === 'submitted' ? 'submitted' : questionnaire.completion_percent > 0 || questionnaire.status === 'in_progress' || questionnaire.status === 'reopened' ? 'in_progress' : 'pending', `questionnaire-status-${questionnaire.questionnaire_id}`)} icon={ClipboardList} iconClassName="bg-indigo-50 text-indigo-700" shadowClassName="shadow-[0_10px_28px_rgba(99,102,241,0.18)] hover:shadow-[0_14px_34px_rgba(99,102,241,0.24)]" testId={`questionnaire-card-${questionnaire.questionnaire_id}`} action={<Button variant="outline" onClick={() => navigate(`/supplier-assessment/questionnaire/${questionnaire.questionnaire_id}`)} data-testid={`open-questionnaire-${questionnaire.questionnaire_id}`}>{questionnaire.status === 'submitted' ? 'View response' : 'Continue questionnaire'}</Button>} />)}

        {modules.has('ghg') && <SupplierModulePanel title={modules.get('ghg').display_name} description={ghgSubmitted ? 'Your GHG submission is locked and visible to your customer.' : ghgHasDraftEntries ? 'Draft entries are ready for review and submission.' : 'Start by adding your assigned Scope 1 or Scope 2 entries.'} status={statusBadge(ghgSubmitted ? 'submitted' : ghgHasDraftEntries ? 'in_progress' : 'pending', 'supplier-ghg-status')} icon={Cloud} iconClassName="bg-emerald-50 text-emerald-700" shadowClassName="shadow-[0_10px_28px_rgba(16,185,129,0.18)] hover:shadow-[0_14px_34px_rgba(16,185,129,0.24)]" testId="supplier-ghg-module-panel" showProgress={false} action={!ghgSubmitted && <Button variant="outline" onClick={() => navigate(ghgHasDraftEntries ? '/supplier-assessment/emissions' : '/ghg')} data-testid="supplier-ghg-action-button">{ghgHasDraftEntries ? 'Review & submit GHG' : 'Add GHG entries'}</Button>} />}

        {modules.has('documents') && <SupplierModulePanel title={modules.get('documents').display_name} description={documents.length === 0 ? 'No documents are assigned.' : documentsSubmitted ? 'All assigned documents are submitted and locked.' : `${pendingDocuments.length} document response${pendingDocuments.length === 1 ? '' : 's'} awaiting submission.`} progress={documentFilledProgress} status={statusBadge(documentsSubmitted ? 'submitted' : documentFilledProgress > 0 || documents.some((document) => document.submission_status === 'reopened') ? 'in_progress' : 'pending', 'supplier-documents-status')} icon={FileText} iconClassName="bg-cyan-50 text-cyan-700" shadowClassName="shadow-[0_10px_28px_rgba(6,182,212,0.18)] hover:shadow-[0_14px_34px_rgba(6,182,212,0.24)]" testId="supplier-documents-module-panel" action={!documentsSubmitted && documents.length > 0 && <Button variant="outline" onClick={() => navigate('/supplier-assessment/documents/review')} data-testid="supplier-documents-action-button">Review documents</Button>} />}

        {modules.has('training') && <SupplierModulePanel title={modules.get('training').display_name} description={trainings.length === 0 ? 'No training is assigned.' : completedTrainings.length === trainings.length ? 'All assigned training is complete.' : `${trainings.length - completedTrainings.length} training item${trainings.length - completedTrainings.length === 1 ? '' : 's'} remaining.`} progress={modules.get('training').completion_percent} status={statusBadge(trainings.length > 0 && completedTrainings.length === trainings.length ? 'completed' : trainings.length ? 'pending' : 'in_progress', 'supplier-training-status')} icon={GraduationCap} iconClassName="bg-amber-50 text-amber-700" shadowClassName="shadow-[0_10px_28px_rgba(245,158,11,0.18)] hover:shadow-[0_14px_34px_rgba(245,158,11,0.24)]" testId="supplier-training-module-panel" action={trainings.length > completedTrainings.length && <Button variant="outline" onClick={() => navigate('/supplier-assessment/training')} data-testid="supplier-training-action-button">Open training</Button>} />}
      </div>
    </section>

    <AlertDialog open={showRevenueSubmitConfirm} onOpenChange={setShowRevenueSubmitConfirm}><AlertDialogContent data-testid="confirm-revenue-submit-dialog"><AlertDialogHeader><AlertDialogTitle data-testid="confirm-revenue-submit-title">Submit revenue information?</AlertDialogTitle><AlertDialogDescription data-testid="confirm-revenue-submit-description">Once submitted, this revenue information is locked and cannot be edited.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel data-testid="cancel-revenue-submit-button">Cancel</AlertDialogCancel><AlertDialogAction onClick={submitRevenue} disabled={submittingRevenue} data-testid="confirm-revenue-submit-button">{submittingRevenue ? 'Submitting…' : 'Submit and lock'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}