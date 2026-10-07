import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Building2, CheckCircle2, ClipboardList, Leaf, Landmark, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Textarea } from '../../components/ui/textarea';
import { ResponseReviewSidebar } from './components/ResponseReviewSidebar';
import { ResponseReviewQuestionPanel } from './components/ResponseReviewQuestionPanel';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PILLARS = [
  { id: 'environment', label: 'Environment', Icon: Leaf, card: 'border-emerald-100 bg-emerald-50/70 text-emerald-900', icon: 'text-emerald-700' },
  { id: 'social', label: 'Social', Icon: UsersRound, card: 'border-sky-100 bg-sky-50/70 text-sky-900', icon: 'text-sky-700' },
  { id: 'governance', label: 'Governance', Icon: Landmark, card: 'border-violet-100 bg-violet-50/70 text-violet-900', icon: 'text-violet-700' },
];

const scoreLabel = (value) => {
  const score = Number(value);
  return Number.isFinite(score) ? (Number.isInteger(score) ? String(score) : score.toFixed(2)) : '—';
};

const humanize = (value) => String(value || 'General').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function SupplierResponseReviewPage() {
  const { supplierId, questionnaireId } = useParams();
  const navigate = useNavigate();
  const { getAuthHeader } = useAuth();
  const [loading, setLoading] = useState(true);
  const [response, setResponse] = useState(null);
  const [supplier, setSupplier] = useState(null);
  const [questionnaire, setQuestionnaire] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [activePillar, setActivePillar] = useState('all');
  const [activeCategoryKey, setActiveCategoryKey] = useState('');
  const [selectedQuestionId, setSelectedQuestionId] = useState('');
  const [openingEvidenceKey, setOpeningEvidenceKey] = useState('');
  const [reviewingQuestionId, setReviewingQuestionId] = useState('');
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [needsResubmission, setNeedsResubmission] = useState(true);
  const [reviewerScore, setReviewerScore] = useState('0');
  const [reviewerNote, setReviewerNote] = useState('');

  const fetchResponseData = useCallback(async () => {
    const result = await axios.get(`${API}/supplier-assessment/suppliers/${supplierId}/questionnaires/${questionnaireId}/responses`, { headers: getAuthHeader() });
    setResponse(result.data); setQuestions(result.data.questions || []);
  }, [getAuthHeader, questionnaireId, supplierId]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const [responseResult, supplierResult, questionnaireResult] = await Promise.allSettled([
        axios.get(`${API}/supplier-assessment/suppliers/${supplierId}/questionnaires/${questionnaireId}/responses`, { headers: getAuthHeader() }),
        axios.get(`${API}/supplier-assessment/suppliers/${supplierId}`, { headers: getAuthHeader() }),
        axios.get(`${API}/supplier-assessment/questionnaires/${questionnaireId}`, { headers: getAuthHeader() }),
      ]);
      if (responseResult.status !== 'fulfilled') throw responseResult.reason;
      setResponse(responseResult.value.data); setQuestions(responseResult.value.data.questions || []);
      if (supplierResult.status === 'fulfilled') setSupplier(supplierResult.value.data);
      if (questionnaireResult.status === 'fulfilled') setQuestionnaire(questionnaireResult.value.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to load questionnaire response');
    } finally { setLoading(false); }
  }, [getAuthHeader, questionnaireId, supplierId]);

  useEffect(() => { loadPage(); }, [loadPage]);

  const taxonomyNames = useMemo(() => Object.fromEntries(Object.entries(questionnaire?.esg_subcategories || {}).flatMap(([section, categories]) => (categories || []).map((category) => [`${section}:${category.code}`, category.name]))), [questionnaire]);
  const visibleQuestions = useMemo(() => questions.filter((question) => {
    if (activePillar !== 'all' && question.category !== activePillar) return false;
    return !activeCategoryKey || `${question.category}:${question.question_category || 'general'}` === activeCategoryKey;
  }), [activeCategoryKey, activePillar, questions]);
  const selectedIndex = Math.max(0, visibleQuestions.findIndex((question) => question.id === selectedQuestionId));
  const selectedQuestion = visibleQuestions[selectedIndex] || null;
  const calculatedScores = useMemo(() => Object.fromEntries((response?.score_breakdown?.question_scores || []).map((item) => [item.question_id, item])), [response]);
  const sidebarGroups = useMemo(() => Object.fromEntries(PILLARS.map(({ id }) => {
    const pillarQuestions = questions.filter((question) => question.category === id);
    const categories = [...new Set(pillarQuestions.map((question) => question.question_category || 'general'))].map((category) => ({
      key: `${id}:${category}`, label: taxonomyNames[`${id}:${category}`] || humanize(category), questions: pillarQuestions.filter((question) => (question.question_category || 'general') === category),
    }));
    return [id, { questionCount: pillarQuestions.length, categories }];
  })), [questions, taxonomyNames]);

  useEffect(() => { if (visibleQuestions.length && !visibleQuestions.some((question) => question.id === selectedQuestionId)) setSelectedQuestionId(visibleQuestions[0].id); }, [selectedQuestionId, visibleQuestions]);

  const submitReview = async (payload) => {
    if (!selectedQuestion) return;
    setReviewingQuestionId(selectedQuestion.id);
    try {
      await axios.put(`${API}/supplier-assessment/suppliers/${supplierId}/questionnaires/${questionnaireId}/questions/${selectedQuestion.id}/review`, payload, { headers: getAuthHeader() });
      toast.success(payload.status === 'accepted' ? 'Question response accepted' : payload.needs_resubmission ? 'Clarification requested and question unlocked for supplier' : 'Question rejected with approved score');
      await fetchResponseData();
      setRejectModalOpen(false);
    } catch (error) { toast.error(error.response?.data?.detail || 'Could not submit review decision'); }
    finally { setReviewingQuestionId(''); }
  };

  const openReject = () => {
    const review = selectedQuestion?.review || {};
    setNeedsResubmission(review.needs_resubmission ?? true);
    setReviewerScore(review.reviewer_score === undefined || review.reviewer_score === null ? '0' : String(review.reviewer_score));
    setReviewerNote(review.reviewer_note || ''); setRejectModalOpen(true);
  };
  const confirmReject = async () => {
    if (!reviewerNote.trim()) return toast.error(needsResubmission ? 'Instructions or feedback for supplier is required' : 'Review rationale or comment is required');
    const score = Number(reviewerScore);
    if (!needsResubmission && (Number.isNaN(score) || score < 0 || score > (selectedQuestion?.max_points ?? 100))) return toast.error('Enter an approved score within the question maximum');
    await submitReview(needsResubmission ? { status: 'rejected', needs_resubmission: true, reviewer_note: reviewerNote.trim() } : { status: 'rejected', needs_resubmission: false, reviewer_score: score, reviewer_note: reviewerNote.trim() });
  };
  const openEvidence = async (file, download = false) => {
    if (!selectedQuestion) return;
    const key = `${selectedQuestion.id}-${file.id}-${download ? 'download' : 'view'}`; setOpeningEvidenceKey(key);
    try { const { data } = await axios.get(`${API}/supplier-assessment/suppliers/${supplierId}/questionnaires/${questionnaireId}/questions/${selectedQuestion.id}/evidence/${file.id}`, { params: { download }, headers: getAuthHeader() }); window.open(data.url, '_blank', 'noopener,noreferrer'); }
    catch (error) { toast.error(error.response?.data?.detail || 'Could not open evidence file'); }
    finally { setOpeningEvidenceKey(''); }
  };

  if (loading) return <div className="flex h-96 items-center justify-center" data-testid="response-review-loading"><div className="text-center"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" /><p className="mt-3 text-sm text-stone-500">Loading submission review...</p></div></div>;
  if (!selectedQuestion) return <div className="mx-auto max-w-3xl border border-dashed border-stone-300 bg-white p-12 text-center" data-testid="response-review-empty"><p className="text-sm text-stone-600">No submitted questions are available to review.</p><Button variant="outline" className="mt-4" onClick={() => navigate('/supplier-assessment/esg')} data-testid="response-review-empty-back-button">Back to questionnaires</Button></div>;

  const esgScore = response?.score_breakdown?.esg_score || {};
  const supplierName = supplier?.company_name || response?.company_name || 'Supplier';
  const questionnaireName = questionnaire?.name || response?.name || 'ESG Questionnaire';
  const reportingPeriod = supplier?.reporting_period || response?.reporting_period || questionnaire?.reporting_period || 'Current period';
  return <div className="space-y-5 pb-10" data-testid="supplier-response-review-page">
    <header className="border-b border-stone-200 bg-white px-1 pb-4" data-testid="response-review-header"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => navigate('/supplier-assessment/esg')} aria-label="Back to questionnaires" data-testid="response-review-back-button"><ArrowLeft className="h-4 w-4" /></Button><h1 className="text-xl font-bold text-stone-950" data-testid="response-review-title">Review Response</h1></div>
      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_10rem_10rem_repeat(3,10rem)]" data-testid="response-review-summary">
        <div className="grid gap-3 sm:grid-cols-2"><div className="flex min-w-0 items-center gap-3 border border-stone-100 bg-stone-50 px-4 py-3"><Building2 className="h-5 w-5 shrink-0 text-sky-700" /><div className="min-w-0"><p className="text-xs text-stone-500">Supplier</p><p className="truncate text-sm font-semibold text-stone-950" data-testid="response-review-supplier-name">{supplierName}</p></div></div><div className="flex min-w-0 items-center gap-3 border border-stone-100 bg-stone-50 px-4 py-3"><ClipboardList className="h-5 w-5 shrink-0 text-sky-700" /><div className="min-w-0"><p className="text-xs text-stone-500">Questionnaire</p><p className="truncate text-sm font-semibold text-stone-950" data-testid="response-review-questionnaire-name">{questionnaireName}</p><p className="mt-0.5 text-xs text-stone-500" data-testid="response-review-reporting-period">{reportingPeriod}</p></div></div></div>
        <div className="border border-stone-100 bg-stone-50 px-4 py-3"><p className="text-xs text-stone-500">Status</p><Badge className="mt-2 bg-emerald-100 text-emerald-800 hover:bg-emerald-100" data-testid="response-review-status"><CheckCircle2 className="mr-1 h-3 w-3" />Submitted</Badge></div><div className="border border-stone-100 bg-stone-50 px-4 py-3"><p className="text-xs text-stone-500">Overall Score</p><p className="mt-1 text-xl font-bold text-stone-950" data-testid="response-review-overall-score">{scoreLabel(response?.calculated_score ?? esgScore.overall_score)} <span className="text-xs font-medium">/ 100</span></p></div>
        {PILLARS.map(({ id, label, Icon, card, icon }) => <div key={id} className={`border px-4 py-3 ${card}`} data-testid={`response-review-pillar-score-${id}`}><p className={`flex items-center gap-1.5 text-xs font-semibold ${icon}`}><Icon className="h-3.5 w-3.5" />{label}</p><p className="mt-2 text-xl font-bold">{scoreLabel(esgScore[id]?.score)} <span className="text-xs font-medium">/ 100</span></p></div>)}
      </div>
    </header>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white px-1" data-testid="response-review-tabs"><div className="flex flex-wrap gap-1">{[{ id: 'all', label: 'All Questions', count: questions.length }, ...PILLARS.map(({ id, label }) => ({ id, label, count: sidebarGroups[id].questionCount }))].map((tab) => <button key={tab.id} type="button" onClick={() => { setActivePillar(tab.id); setActiveCategoryKey(''); }} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${activePillar === tab.id ? 'border-emerald-600 bg-emerald-50/80 text-emerald-800' : 'border-transparent text-stone-600 hover:bg-stone-50 hover:text-stone-950'}`} data-testid={`response-review-tab-${tab.id}`}><span>{tab.label}</span><span className="rounded-full bg-white px-1.5 py-0.5 text-xs tabular-nums">{tab.count}</span></button>)}</div><div className="flex flex-wrap items-center gap-4 px-3 py-2 text-xs text-stone-500" data-testid="response-review-status-legend"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-stone-300" />Not viewed</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Viewed</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Pending</span></div></div>
    <main className="grid min-w-0 overflow-hidden border border-stone-200 bg-white shadow-[0_5px_20px_rgba(28,55,43,0.06)] xl:grid-cols-[18rem_minmax(0,1fr)]" data-testid="response-review-workspace"><ResponseReviewSidebar groups={sidebarGroups} activeCategoryKey={activeCategoryKey} onCategorySelect={(categoryKey) => { const firstQuestion = questions.find((question) => `${question.category}:${question.question_category || 'general'}` === categoryKey); setActiveCategoryKey(categoryKey); setActivePillar(categoryKey.split(':')[0]); setSelectedQuestionId(firstQuestion?.id || ''); }} /><ResponseReviewQuestionPanel question={selectedQuestion} index={selectedIndex} total={visibleQuestions.length} score={calculatedScores[selectedQuestion.id]} onAccept={() => submitReview({ status: 'accepted', needs_resubmission: false })} onReject={openReject} onPrevious={() => setSelectedQuestionId(visibleQuestions[Math.max(0, selectedIndex - 1)]?.id || selectedQuestion.id)} onNext={() => setSelectedQuestionId(visibleQuestions[Math.min(visibleQuestions.length - 1, selectedIndex + 1)]?.id || selectedQuestion.id)} onOpenEvidence={openEvidence} openingEvidenceKey={openingEvidenceKey} saving={reviewingQuestionId === selectedQuestion.id} /></main>
    <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}><DialogContent className="max-w-md" data-testid="response-review-reject-dialog"><DialogHeader><DialogTitle data-testid="response-review-reject-dialog-title">Reject Question Response</DialogTitle><DialogDescription>Choose whether to request a supplier clarification or set the approved score yourself.</DialogDescription></DialogHeader><div className="space-y-4 py-2"><div className="border border-stone-200 bg-stone-50 p-3 text-xs text-stone-700" data-testid="response-review-reject-question-summary">{selectedQuestion.question_text}</div><div><Label className="text-xs font-semibold text-stone-900">Does the supplier need to submit again? *</Label><RadioGroup value={needsResubmission ? 'yes' : 'no'} onValueChange={(value) => setNeedsResubmission(value === 'yes')} className="mt-2 space-y-2" data-testid="response-review-reject-mode"><label htmlFor="response-review-clarify" className={`flex cursor-pointer items-start gap-3 border p-3 text-sm ${needsResubmission ? 'border-amber-400 bg-amber-50' : 'border-stone-200'}`} data-testid="response-review-clarify-label"><RadioGroupItem value="yes" id="response-review-clarify" data-testid="response-review-clarify-radio" /><span><strong>Request clarification</strong><small className="mt-1 block text-xs text-stone-500">Unlocks only this question and emails the supplier.</small></span></label><label htmlFor="response-review-score-direct" className={`flex cursor-pointer items-start gap-3 border p-3 text-sm ${!needsResubmission ? 'border-rose-400 bg-rose-50' : 'border-stone-200'}`} data-testid="response-review-direct-score-label"><RadioGroupItem value="no" id="response-review-score-direct" data-testid="response-review-direct-score-radio" /><span><strong>Set approved score</strong><small className="mt-1 block text-xs text-stone-500">Keeps the response locked and applies your score.</small></span></label></RadioGroup></div>{!needsResubmission && <div><Label htmlFor="response-review-approved-score" className="text-xs font-semibold">Approved score *</Label><Input id="response-review-approved-score" type="number" min="0" max={selectedQuestion.max_points ?? 100} step="0.1" value={reviewerScore} onChange={(event) => setReviewerScore(event.target.value)} className="mt-1" data-testid="response-review-approved-score-input" /></div>}<div><Label htmlFor="response-review-reviewer-note" className="text-xs font-semibold">{needsResubmission ? 'Instructions for supplier *' : 'Review rationale *'}</Label><Textarea id="response-review-reviewer-note" value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} className="mt-1" rows={4} data-testid="response-review-reviewer-note" /></div></div><DialogFooter><Button variant="outline" onClick={() => setRejectModalOpen(false)} data-testid="response-review-cancel-reject-button">Cancel</Button><Button variant="destructive" disabled={!reviewerNote.trim() || reviewingQuestionId === selectedQuestion.id} onClick={confirmReject} data-testid="response-review-confirm-reject-button">Confirm decision</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
