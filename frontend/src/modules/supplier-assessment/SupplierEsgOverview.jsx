import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowRight, Calendar, CheckCircle, Circle, ClipboardList } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Progress } from '../../components/ui/progress';
import { SupplierModulePanel } from './components/SupplierModuleAccordion';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatAnswer = (answer) => {
  if (typeof answer === 'boolean') return answer ? 'Yes' : 'No';
  if (Array.isArray(answer)) return answer.join(', ');
  if (typeof answer === 'object' && answer !== null) return JSON.stringify(answer);
  return String(answer);
};

const questionnaireStatus = (questionnaire) => questionnaire.status === 'submitted'
  ? <Badge className="bg-emerald-100 text-emerald-800" data-testid={`supplier-esg-status-${questionnaire.questionnaire_id}`}><CheckCircle className="mr-1 h-3 w-3" />Submitted</Badge>
  : <Badge className={questionnaire.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'} data-testid={`supplier-esg-status-${questionnaire.questionnaire_id}`}>{questionnaire.status === 'in_progress' ? 'In progress' : 'Not started'}</Badge>;

export default function SupplierEsgOverview() {
  const { getAuthHeader } = useAuth();
  const navigate = useNavigate();
  const [questionnaires, setQuestionnaires] = useState([]);
  const [loading, setLoading] = useState(true);

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
  if (loading) return <p className="py-16 text-center text-sm text-slate-500" data-testid="supplier-esg-overview-loading">Loading ESG questionnaires…</p>;

  return <div className="mx-auto max-w-5xl space-y-7 pb-10" data-testid="supplier-esg-overview">
    <header className="border-b border-slate-200 pb-6"><p className="text-xs font-semibold uppercase text-indigo-700">Assigned ESG</p><h1 className="mt-2 text-3xl font-semibold text-slate-900">ESG Questionnaires</h1><p className="mt-2 text-sm text-slate-600">Open each questionnaire to review its progress and continue your response.</p></header>
    {questionnaires.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 shadow-[0_8px_28px_rgba(15,23,42,0.07)]" data-testid="supplier-esg-overview-empty">No ESG questionnaires are assigned.</div> : <div className="space-y-4" data-testid="supplier-esg-questionnaire-panels">
      {questionnaires.map((questionnaire) => <SupplierModulePanel key={questionnaire.questionnaire_id} title={questionnaire.questionnaire_name} description={questionnaire.due_date ? `Due ${new Date(questionnaire.due_date).toLocaleDateString()}` : 'Assigned ESG questionnaire'} progress={questionnaire.completion_percent} status={questionnaireStatus(questionnaire)} icon={ClipboardList} iconClassName="bg-indigo-50 text-indigo-700" testId={`supplier-esg-questionnaire-${questionnaire.questionnaire_id}`}>
        <div className="space-y-5">
          <div><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span data-testid={`supplier-esg-progress-${questionnaire.questionnaire_id}`}>{Math.round(questionnaire.completion_percent || 0)}% complete</span>{questionnaire.due_date && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Due {new Date(questionnaire.due_date).toLocaleDateString()}</span>}</div><Progress value={questionnaire.completion_percent || 0} className="mt-2 h-2" data-testid={`supplier-esg-progress-bar-${questionnaire.questionnaire_id}`} /></div>
          <div className="divide-y divide-slate-100 border-y border-slate-100" data-testid={`supplier-esg-questions-${questionnaire.questionnaire_id}`}>{(questionnaire.questions || []).map((question, index) => { const answered = question.answer !== undefined && question.answer !== null && question.answer !== ''; return <div className="flex gap-3 py-3" key={question.id} data-testid={`supplier-esg-question-${questionnaire.questionnaire_id}-${question.id}`}>{answered ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}<div className="min-w-0"><p className="text-sm text-slate-800" data-testid={`supplier-esg-question-text-${questionnaire.questionnaire_id}-${index + 1}`}>{question.question_text}</p>{answered ? <p className="mt-1 break-words text-sm text-slate-600" data-testid={`supplier-esg-answer-${questionnaire.questionnaire_id}-${index + 1}`}>{formatAnswer(question.answer)}</p> : <span className="mt-1 block text-sm text-slate-400" data-testid={`supplier-esg-answer-pending-${questionnaire.questionnaire_id}-${index + 1}`}>Pending response</span>}</div></div>; })}</div>
          <Button variant="outline" onClick={() => navigate(`/supplier-assessment/questionnaire/${questionnaire.questionnaire_id}`)} data-testid={`supplier-esg-open-${questionnaire.questionnaire_id}`}>{questionnaire.status === 'submitted' ? 'View response' : 'Continue questionnaire'}<ArrowRight className="ml-2 h-4 w-4" /></Button>
        </div>
      </SupplierModulePanel>)}
    </div>}
  </div>;
}