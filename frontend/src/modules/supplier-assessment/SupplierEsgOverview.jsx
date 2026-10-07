import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowRight, Calendar, CheckCircle, Circle, ClipboardList, Download, Eye, Paperclip } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Progress } from '../../components/ui/progress';
import { SupplierModulePanel } from './components/SupplierModuleAccordion';
import { SupplierPageHeader } from './components/SupplierPageHeader';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatAnswer = (answer) => {
  if (typeof answer === 'boolean') return answer ? 'Yes' : 'No';
  if (Array.isArray(answer)) return answer.join(', ');
  if (typeof answer === 'object' && answer !== null) return JSON.stringify(answer);
  return String(answer);
};

const questionnaireStatus = (questionnaire) => {
  if (questionnaire.has_unlocked_questions) return <Badge className="bg-amber-100 text-amber-900" data-testid={`supplier-esg-status-${questionnaire.questionnaire_id}`}>Clarification required</Badge>;
  if (questionnaire.status === 'submitted') return <Badge className="bg-emerald-100 text-emerald-800" data-testid={`supplier-esg-status-${questionnaire.questionnaire_id}`}><CheckCircle className="mr-1 h-3 w-3" />Submitted</Badge>;
  const inProgress = ['in_progress', 'reopened'].includes(questionnaire.status) || Number(questionnaire.completion_percent) > 0;
  return <Badge className={inProgress ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'} data-testid={`supplier-esg-status-${questionnaire.questionnaire_id}`}>{inProgress ? 'In progress' : 'Not started'}</Badge>;
};

const questionReviewStatus = (question) => {
  const review = question.review || {};
  if (review.status === 'accepted') return <Badge className="ml-2 bg-emerald-100 text-emerald-800" data-testid={`supplier-esg-question-review-status-${question.id}`}>Accepted</Badge>;
  if (review.status === 'rejected' && review.needs_resubmission) return <Badge className="ml-2 bg-amber-100 text-amber-900" data-testid={`supplier-esg-question-review-status-${question.id}`}>Needs clarification</Badge>;
  if (review.status === 'rejected') return <Badge className="ml-2 bg-rose-100 text-rose-800" data-testid={`supplier-esg-question-review-status-${question.id}`}>Rejected</Badge>;
  return null;
};

export default function SupplierEsgOverview() {
  const { getAuthHeader } = useAuth();
  const navigate = useNavigate();
  const [questionnaires, setQuestionnaires] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openingEvidenceKey, setOpeningEvidenceKey] = useState('');

  const load = useCallback(async () => {
    try {
      const summaries = (await axios.get(`${API}/supplier-assessment/my-assessment/questionnaires`, { headers: getAuthHeader() })).data || [];
      const detailed = await Promise.all(summaries.map(async (summary) => {
        try { const response = await axios.get(`${API}/supplier-assessment/my-assessment/questionnaires/${summary.questionnaire_id}`, { headers: getAuthHeader() }); return { ...summary, questions: response.data.questions || [] }; }
        catch { return { ...summary, questions: [] }; }
      }));
      setQuestionnaires(detailed);
    } catch { toast.error('Could not load ESG questionnaires'); }
    finally { setLoading(false); }
  }, [getAuthHeader]);

  useEffect(() => { load(); }, [load]);
  const openEvidence = async (questionnaireId, questionId, file, download = false) => {
    const key = `${questionId}-${file.id}-${download ? 'download' : 'view'}`;
    setOpeningEvidenceKey(key);
    try {
      const response = await axios.get(`${API}/supplier-assessment/my-assessment/questionnaires/${questionnaireId}/questions/${questionId}/evidence/${file.id}`, { headers: getAuthHeader(), responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      if (download) { const link = document.createElement('a'); link.href = url; link.download = file.original_filename || 'evidence'; link.click(); }
      else window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { toast.error('Could not open evidence file'); }
    finally { setOpeningEvidenceKey(''); }
  };
  if (loading) return <p className="py-16 text-center text-sm text-slate-500" data-testid="supplier-esg-overview-loading">Loading ESG questionnaires…</p>;

  return <div className="mx-auto max-w-7xl space-y-8 pb-10" data-testid="supplier-esg-overview">
    <SupplierPageHeader title="ESG Questionnaires" description="Open each questionnaire to review its progress and continue your response." icon={ClipboardList} iconClassName="border-indigo-200 bg-indigo-50 text-indigo-700" testId="supplier-esg-overview" />
    {questionnaires.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 shadow-[0_8px_28px_rgba(15,23,42,0.07)]" data-testid="supplier-esg-overview-empty">No ESG questionnaires are assigned.</div> : <div className="space-y-4" data-testid="supplier-esg-questionnaire-panels">
      {questionnaires.map((questionnaire) => { const editable = questionnaire.has_unlocked_questions || ['in_progress', 'reopened', 'not_started'].includes(questionnaire.status); const actionLabel = questionnaire.has_unlocked_questions ? 'Clarification required' : editable ? 'Fill questionnaire' : ''; return <SupplierModulePanel key={questionnaire.questionnaire_id} title={questionnaire.questionnaire_name} description={questionnaire.due_date ? `Due ${new Date(questionnaire.due_date).toLocaleDateString()}` : 'Assigned ESG questionnaire'} progress={questionnaire.completion_percent} status={questionnaireStatus(questionnaire)} icon={ClipboardList} iconClassName="bg-indigo-50 text-indigo-700" shadowClassName="shadow-[0_10px_28px_rgba(99,102,241,0.18)] hover:shadow-[0_14px_34px_rgba(99,102,241,0.24)]" testId={`supplier-esg-questionnaire-${questionnaire.questionnaire_id}`} action={actionLabel ? <Button variant="outline" onClick={() => navigate(`/supplier-assessment/questionnaire/${questionnaire.questionnaire_id}`)} data-testid={`supplier-esg-open-${questionnaire.questionnaire_id}`}>{actionLabel}<ArrowRight className="ml-2 h-4 w-4" /></Button> : null}>
        <div className="space-y-5">
          <div><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span data-testid={`supplier-esg-progress-${questionnaire.questionnaire_id}`}>{Math.round(questionnaire.completion_percent || 0)}% complete</span>{questionnaire.due_date && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Due {new Date(questionnaire.due_date).toLocaleDateString()}</span>}</div><Progress value={questionnaire.completion_percent || 0} className="mt-2 h-2" data-testid={`supplier-esg-progress-bar-${questionnaire.questionnaire_id}`} /></div>
          <div className="divide-y divide-slate-100 border-y border-slate-100" data-testid={`supplier-esg-questions-${questionnaire.questionnaire_id}`}>{(questionnaire.questions || []).map((question, index) => { const answered = question.answer !== undefined && question.answer !== null && question.answer !== ''; const files = question.evidence_files || []; return <div className={`flex gap-3 py-3 ${question.parent_question_id ? 'ml-4 border-l-2 border-l-emerald-200 pl-3' : ''}`} key={question.id} data-testid={`supplier-esg-question-${questionnaire.questionnaire_id}-${question.id}`}>{answered ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center"><p className="text-sm text-slate-800" data-testid={`supplier-esg-question-text-${questionnaire.questionnaire_id}-${index + 1}`}>{question.parent_question_id && <span className="mr-2 text-xs font-medium text-emerald-700" data-testid={`supplier-esg-subquestion-label-${questionnaire.questionnaire_id}-${question.id}`}>Follow-up</span>}{question.question_text}</p>{questionReviewStatus(question)}</div>{answered ? <p className="mt-1 break-words text-sm text-slate-600" data-testid={`supplier-esg-answer-${questionnaire.questionnaire_id}-${index + 1}`}>{formatAnswer(question.answer)}</p> : <span className="mt-1 block text-sm text-slate-400" data-testid={`supplier-esg-answer-pending-${questionnaire.questionnaire_id}-${index + 1}`}>Pending response</span>}{files.length > 0 && <div className="mt-2 space-y-1" data-testid={`supplier-esg-evidence-list-${questionnaire.questionnaire_id}-${question.id}`}>{files.map((file) => <div key={file.id} className="flex flex-wrap items-center gap-1 text-xs text-slate-700"><Paperclip className="h-3.5 w-3.5 text-slate-500" /><span className="max-w-[18rem] truncate" data-testid={`supplier-esg-evidence-name-${questionnaire.questionnaire_id}-${question.id}-${file.id}`}>{file.original_filename}</span><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`View ${file.original_filename}`} disabled={openingEvidenceKey === `${question.id}-${file.id}-view`} onClick={() => openEvidence(questionnaire.questionnaire_id, question.id, file)} data-testid={`view-supplier-esg-evidence-${questionnaire.questionnaire_id}-${question.id}-${file.id}`}><Eye className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Download ${file.original_filename}`} disabled={openingEvidenceKey === `${question.id}-${file.id}-download`} onClick={() => openEvidence(questionnaire.questionnaire_id, question.id, file, true)} data-testid={`download-supplier-esg-evidence-${questionnaire.questionnaire_id}-${question.id}-${file.id}`}><Download className="h-3.5 w-3.5" /></Button></div>)}</div>}</div></div>; })}</div>
        </div>
      </SupplierModulePanel>; })}
    </div>}
  </div>;
}