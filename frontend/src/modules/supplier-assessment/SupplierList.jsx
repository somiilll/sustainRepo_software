import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSupplierAssessmentPeriod } from '../../contexts/SupplierAssessmentPeriodContext';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Checkbox } from '../../components/ui/checkbox';
import { SupplierResponseReviewDialog } from './components/SupplierResponseReviewDialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { 
  Plus, 
  Search, 
  Mail, 
  Eye, 
  Edit2, 
  Trash2,
  Building2,
  User,
  Calendar,
  TrendingUp,
  Percent,
  Leaf,
  Factory,
  FileText,
  GraduationCap,
  ClipboardCheck,
  CalendarDays,
  Info,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusColors = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  accepted: 'border-blue-200 bg-blue-50 text-blue-700',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

const groupAvailableDocuments = (requirements) => Object.values((requirements || []).reduce((groups, requirement) => {
  const key = requirement.document_version_id || requirement.id;
  if (!groups[key]) groups[key] = requirement;
  return groups;
}, {}));

const RequirementDeadline = ({ dueDate, testId }) => {
  if (!dueDate) return null;
  const datePart = String(dueDate).slice(0, 10);
  const deadline = new Date(`${datePart}T23:59:59`);
  if (Number.isNaN(deadline.getTime())) return null;
  const isPastDue = deadline.getTime() < Date.now();
  return <span className="flex flex-wrap items-center gap-1.5 text-xs text-stone-500" data-testid={`${testId}-due-date`}><span>Due {new Date(`${datePart}T12:00:00`).toLocaleDateString()}</span>{isPastDue && <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700" data-testid={`${testId}-deadline-passed`}>Deadline passed</Badge>}</span>;
};

const createSupplierForm = (reportingPeriod) => ({
  company_name: '',
  contact_person: '',
  email: '',
  contact_number: '',
  due_date: '',
  reporting_period: reportingPeriod,
  modules_enabled: ['esg', 'ghg'],
  ghg_scopes_enabled: ['scope1', 'scope2'],
  ghg_submission_frequency: 'yearly',
  revenue_required: false,
  questionnaire_ids: [],
  document_requirement_ids: [],
  training_requirement_ids: [],
});

const FieldInfo = ({ label, testId }) => (
  <TooltipProvider delayDuration={150}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex h-5 w-5 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" aria-label={label} data-testid={testId}>
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 bg-stone-900 text-center text-white" data-testid={`${testId}-content`}>{label}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

const ViewSupplierProgress = ({ supplier, submissionStatus }) => {
  if (!submissionStatus) return <div className="border-t pt-4 text-sm text-stone-500" data-testid="supplier-module-progress-loading">Loading assigned module progress…</div>;
  const visibility = submissionStatus.module_visibility || {};
  const modules = [
    { code: 'esg', label: 'ESG Questionnaire', value: supplier.esg_completion_percent, tone: 'bg-blue-500' },
    { code: 'ghg', label: 'GHG Emissions', value: supplier.ghg_completion_percent, tone: 'bg-emerald-500' },
    { code: 'documents', label: 'Documents', value: supplier.documents_completion_percent, tone: 'bg-teal-500' },
    { code: 'training', label: 'Training', value: supplier.training_completion_percent, tone: 'bg-amber-500' },
  ].filter((module) => visibility[module.code]);
  return <div className="border-t pt-4" data-testid="supplier-module-progress"><Label className="text-stone-500">Completion Progress</Label><div className="mt-3 grid gap-4 sm:grid-cols-2">{modules.map((module) => { const progress = Math.round(module.value || 0); return <div key={module.code} data-testid={`supplier-${module.code}-progress`}><div className="flex items-center justify-between gap-3 text-sm"><span>{module.label}</span><span className="font-medium" data-testid={`supplier-${module.code}-progress-percent`}>{progress}%</span></div><div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-stone-200" data-testid={`supplier-${module.code}-progress-track`}><div className={`h-2 rounded-full transition-[width] duration-500 ${module.tone}`} style={{ width: `${progress}%` }} data-testid={`supplier-${module.code}-progress-bar`} /></div></div>; })}</div></div>;
};

const ViewSupplierScores = ({ supplier }) => {
  const snapshot = supplier.canonical_score_snapshot || {};
  const scores = [
    { code: 'esg', label: 'ESG Score', value: supplier.esg_score ?? snapshot.esg_score },
    { code: 'environment', label: 'Environment Score', value: snapshot.environment_score },
    { code: 'social', label: 'Social Score', value: snapshot.social_score },
    { code: 'governance', label: 'Governance Score', value: snapshot.governance_score },
  ];
  return <div className="border-t pt-4" data-testid="supplier-score-breakdown"><Label className="text-stone-500">ESG Score Breakdown</Label><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{scores.map((score) => <div key={score.code} className="border-l-2 border-emerald-400 bg-stone-50 px-3 py-2" data-testid={`supplier-${score.code}-score-summary`}><p className="text-xs text-stone-500">{score.label}</p><p className="mt-1 text-lg font-semibold text-stone-900" data-testid={`supplier-${score.code}-score-value`}>{score.value ?? 'Pending'}</p></div>)}</div></div>;
};

export default function SupplierList() {
  const { getAuthHeader } = useAuth();
  const { reportingPeriod, periods, setReportingPeriod } = useSupplierAssessmentPeriod();
  const location = useLocation();
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [formData, setFormData] = useState(() => createSupplierForm(reportingPeriod));
  const [submitting, setSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState(null);
  const [unlockingQuestionnaireId, setUnlockingQuestionnaireId] = useState('');
  const [documents, setDocuments] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [questionnaires, setQuestionnaires] = useState([]);
  const [questionnaireAssignmentsLoaded, setQuestionnaireAssignmentsLoaded] = useState(false);
  const [reminderTarget, setReminderTarget] = useState(null);
  const [reminderModules, setReminderModules] = useState(['all']);
  const [pendingReminderModules, setPendingReminderModules] = useState([]);
  const [reminderModulesLoading, setReminderModulesLoading] = useState(false);
  const [reviewResponse, setReviewResponse] = useState(null);
  const resetAddSupplierForm = useCallback(() => setFormData(createSupplierForm(reportingPeriod)), [reportingPeriod]);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, page_size: pageSize, reporting_period: reportingPeriod });
      if (search) params.append('search', search);
      
      const res = await axios.get(`${API}/supplier-assessment/suppliers?${params}`, {
        headers: getAuthHeader(),
      });
      setSuppliers(res.data.suppliers || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      toast.error('Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader, page, search, reportingPeriod]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  useEffect(() => {
    if (!showAddDialog) return;
    setFormData((current) => ({ ...current, reporting_period: reportingPeriod }));
    Promise.all([
      axios.get(`${API}/supplier-assessment/documents?reporting_period=${encodeURIComponent(reportingPeriod)}`, { headers: getAuthHeader() }),
      axios.get(`${API}/supplier-assessment/trainings`, { headers: getAuthHeader() }),
      axios.get(`${API}/supplier-assessment/questionnaires`, { headers: getAuthHeader() }),
    ]).then(([documentResponse, trainingResponse, questionnaireResponse]) => {
      const availableDocuments = groupAvailableDocuments(documentResponse.data);
      const availableTrainings = (trainingResponse.data || []).filter((training) => training.is_active !== false && !training.is_deleted);
      setDocuments(availableDocuments);
      setTrainings(availableTrainings);
      const availableQuestionnaires = (questionnaireResponse.data || []).filter((questionnaire) => questionnaire.is_active !== false && !questionnaire.is_deleted);
      setQuestionnaires(availableQuestionnaires);
      setFormData((current) => ({
        ...current,
        modules_enabled: current.modules_enabled.filter((module) => module !== 'esg' || availableQuestionnaires.length > 0),
        questionnaire_ids: current.questionnaire_ids.length ? current.questionnaire_ids : availableQuestionnaires.map((questionnaire) => questionnaire.id),
        document_requirement_ids: availableDocuments.map((document) => document.id),
        training_requirement_ids: availableTrainings.map((training) => training.id),
      }));
    }).catch(() => toast.error('Could not load existing assignments'));
  }, [showAddDialog, getAuthHeader, reportingPeriod]);

  useEffect(() => {
    if (!showEditDialog || !selectedSupplier) return;
    setQuestionnaireAssignmentsLoaded(false);
    Promise.all([
      axios.get(`${API}/supplier-assessment/documents?reporting_period=${encodeURIComponent(selectedSupplier.reporting_period || reportingPeriod)}`, { headers: getAuthHeader() }),
      axios.get(`${API}/supplier-assessment/trainings?reporting_period=${encodeURIComponent(selectedSupplier.reporting_period || reportingPeriod)}`, { headers: getAuthHeader() }),
      axios.get(`${API}/supplier-assessment/questionnaires`, { headers: getAuthHeader() }),
      axios.get(`${API}/supplier-assessment/suppliers/${selectedSupplier.id}/submission-status`, { headers: getAuthHeader() }),
    ]).then(([documentResponse, trainingResponse, questionnaireResponse, statusResponse]) => {
      const availableDocuments = groupAvailableDocuments(documentResponse.data);
      const availableTrainings = (trainingResponse.data || []).filter((training) => training.is_active !== false && !training.is_deleted);
      setDocuments(availableDocuments);
      setTrainings(availableTrainings);
      const selectedDocumentIds = availableDocuments.filter((document) => selectedSupplier.document_requirement_ids?.includes(document.id) || document.supplier_relationship_ids?.includes(selectedSupplier.id)).map((document) => document.id);
      const selectedTrainingIds = availableTrainings.filter((training) => selectedSupplier.training_requirement_ids?.includes(training.id) || training.supplier_relationship_ids?.includes(selectedSupplier.id)).map((training) => training.id);
      setFormData((current) => ({ ...current, document_requirement_ids: selectedDocumentIds, training_requirement_ids: selectedTrainingIds }));
      const availableQuestionnaires = (questionnaireResponse.data || []).filter((questionnaire) => questionnaire.is_active !== false && !questionnaire.is_deleted);
      setQuestionnaires(availableQuestionnaires);
      setSubmissionStatus(statusResponse.data);
      if (selectedSupplier.questionnaire_assignment_is_implicit) {
        setFormData((current) => ({ ...current, questionnaire_ids: availableQuestionnaires.map((questionnaire) => questionnaire.id) }));
      }
      setQuestionnaireAssignmentsLoaded(true);
    }).catch(() => toast.error('Could not load questionnaire assignments'));
  }, [showEditDialog, selectedSupplier, getAuthHeader]);

  const handleAdd = async () => {
    if (!formData.company_name || !formData.contact_person || !formData.email) {
      toast.error('Please fill required fields');
      return;
    }
    if (formData.modules_enabled?.includes('esg') && questionnaires.length > 0 && formData.questionnaire_ids.length === 0) {
      toast.error('Select at least one ESG questionnaire');
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/supplier-assessment/suppliers`, {
        ...formData,
        reporting_period: reportingPeriod,
      }, {
        headers: getAuthHeader(),
      });
      toast.success('Supplier added and invitation sent');
      setShowAddDialog(false);
      resetAddSupplierForm();
      fetchSuppliers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add supplier');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedSupplier) return;
    
    setSubmitting(true);
    try {
      const { questionnaire_ids, ...supplierDetails } = formData;
      await axios.put(`${API}/supplier-assessment/suppliers/${selectedSupplier.id}`, questionnaireAssignmentsLoaded ? formData : supplierDetails, {
        headers: getAuthHeader(),
      });
      toast.success('Supplier updated');
      setShowEditDialog(false);
      fetchSuppliers();
    } catch (err) {
      toast.error('Failed to update supplier');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (supplier) => {
    if (!window.confirm(`Deactivate supplier "${supplier.company_name}"?`)) return;
    
    try {
      await axios.delete(`${API}/supplier-assessment/suppliers/${supplier.id}`, {
        headers: getAuthHeader(),
      });
      toast.success('Supplier deactivated');
      fetchSuppliers();
    } catch (err) {
      toast.error('Failed to deactivate supplier');
    }
  };

  const handleReminder = async () => {
    if (!reminderTarget) return;
    try {
      await axios.post(`${API}/supplier-assessment/suppliers/${reminderTarget.id}/remind`, { modules: reminderModules, reporting_period: reminderTarget.reporting_period }, {
        headers: getAuthHeader(),
      });
      toast.success('Reminder sent');
      setReminderTarget(null);
      fetchSuppliers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send reminder');
    }
  };

  const openEditDialog = (supplier) => {
    setSelectedSupplier(supplier);
    setQuestionnaireAssignmentsLoaded(false);
    setFormData({
      company_name: supplier.company_name,
      contact_person: supplier.contact_person,
      email: supplier.contact_email,
      contact_number: supplier.contact_number || '',
      due_date: supplier.due_date || '',
      reporting_period: supplier.reporting_period || `CY${new Date().getFullYear()}`,
      modules_enabled: supplier.modules_enabled || ['esg', 'ghg'],
      ghg_scopes_enabled: supplier.ghg_scopes_enabled || ['scope1', 'scope2'],
      ghg_submission_frequency: supplier.ghg_submission_frequency || 'yearly',
      revenue_required: supplier.revenue_required === true,
      questionnaire_ids: supplier.questionnaire_ids || [],
      document_requirement_ids: supplier.document_requirement_ids || [],
      training_requirement_ids: supplier.training_requirement_ids || [],
    });
    setShowEditDialog(true);
  };

  const openViewDialog = (supplier) => {
    setSelectedSupplier(supplier);
    setSubmissionStatus(null);
    setShowViewDialog(true);
    axios.get(`${API}/supplier-assessment/suppliers/${supplier.id}/submission-status`, { headers: getAuthHeader() })
      .then((response) => setSubmissionStatus(response.data))
      .catch(() => toast.error('Could not load submission status'));
  };

  useEffect(() => {
    const supplierId = location.state?.selectedSupplierId;
    const supplier = suppliers.find((item) => item.id === supplierId);
    if (supplier) {
      openViewDialog(supplier);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate, suppliers]);

  const unlockQuestionnaire = async (questionnaireId) => {
    if (!selectedSupplier || !window.confirm('Unlock this ESG questionnaire for resubmission? The current submitted answers stay visible until the supplier resubmits.')) return;
    setUnlockingQuestionnaireId(questionnaireId);
    try {
      await axios.post(`${API}/supplier-assessment/suppliers/${selectedSupplier.id}/questionnaires/${questionnaireId}/reopen`, {}, { headers: getAuthHeader() });
      toast.success('Questionnaire unlocked for resubmission');
      setSubmissionStatus((current) => ({ ...current, esg: (current?.esg || []).filter((item) => item.questionnaire_id !== questionnaireId) }));
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not unlock questionnaire');
    } finally {
      setUnlockingQuestionnaireId('');
    }
  };

  const openReview = async (questionnaireId) => {
    if (!selectedSupplier) return;
    try {
      const response = await axios.get(`${API}/supplier-assessment/suppliers/${selectedSupplier.id}/questionnaires/${questionnaireId}/responses`, { headers: getAuthHeader() });
      setReviewResponse(response.data);
    } catch (error) { toast.error(error.response?.data?.detail || 'Could not load submitted response'); }
  };

  // Toggle module in modules_enabled array
  const toggleModule = (module) => {
    setFormData(prev => {
      const current = prev.modules_enabled || [];
      if (current.includes(module)) {
        // Don't allow removing all modules
        if (current.length === 1) {
          toast.error('At least one module must be enabled');
          return prev;
        }
        return { ...prev, modules_enabled: current.filter(m => m !== module) };
      } else {
        return { ...prev, modules_enabled: [...current, module] };
      }
    });
  };

  // Toggle scope in ghg_scopes_enabled array
  const toggleScope = (scope) => {
    setFormData(prev => {
      const current = prev.ghg_scopes_enabled || [];
      if (current.includes(scope)) {
        // Don't allow removing all scopes if GHG is enabled
        if (current.length === 1 && prev.modules_enabled?.includes('ghg')) {
          toast.error('At least one scope must be enabled for GHG');
          return prev;
        }
        return { ...prev, ghg_scopes_enabled: current.filter(s => s !== scope) };
      } else {
        return { ...prev, ghg_scopes_enabled: [...current, scope] };
      }
    });
  };

  const toggleQuestionnaire = (questionnaireId) => {
    setFormData((current) => ({
      ...current,
      questionnaire_ids: current.questionnaire_ids.includes(questionnaireId)
        ? current.questionnaire_ids.filter((id) => id !== questionnaireId)
        : [...current.questionnaire_ids, questionnaireId],
    }));
  };

  return (
    <div className="space-y-7" data-testid="supplier-list">
      {/* Header */}
      <div className="border-b border-stone-200 pb-5" data-testid="supplier-list-header">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm" data-testid="supplier-list-heading-icon">
            <Building2 className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-emerald-950" data-testid="supplier-list-heading">Suppliers</h1>
          </div>
        </div>
      </div>

      {/* Supplier controls */}
      <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-[0_4px_18px_rgba(28,55,43,0.06)] md:flex-row md:flex-wrap md:items-center lg:flex-nowrap" data-testid="supplier-list-controls">
        <div className="relative w-full md:w-[min(430px,100%)] md:flex-none">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
          <Input
            placeholder="Search suppliers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 border-stone-200 bg-white pl-10 shadow-none transition-[border-color,box-shadow] focus-visible:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-100"
            aria-label="Search suppliers"
            data-testid="supplier-search"
          />
        </div>
        <Button className="h-10 shrink-0 bg-emerald-800 px-4 text-white shadow-sm transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-emerald-900 hover:shadow-md" onClick={() => setShowAddDialog(true)} data-testid="add-supplier-btn">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Supplier
        </Button>
        <div className="flex w-full flex-col gap-2 md:ml-auto md:w-auto md:flex-row md:items-center md:gap-3" data-testid="supplier-list-period-control">
          <Label htmlFor="supplier-list-reporting-period" className="flex shrink-0 items-center gap-2 text-sm font-medium text-stone-600" data-testid="supplier-list-reporting-period-label">
            <CalendarDays className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            Reporting period
          </Label>
          <Select value={reportingPeriod} onValueChange={setReportingPeriod}>
            <SelectTrigger id="supplier-list-reporting-period" className="h-10 w-full border-stone-200 bg-stone-50 font-medium text-stone-800 shadow-none transition-[border-color,box-shadow] focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 md:w-44" data-testid="supplier-list-reporting-period-selector"><SelectValue /></SelectTrigger>
            <SelectContent data-testid="supplier-list-reporting-period-menu">{periods.map((period) => <SelectItem key={period} value={period} data-testid={`supplier-list-period-option-${period}`}>{period}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[0_5px_22px_rgba(28,55,43,0.06)]" data-testid="supplier-table-card">
        <Table data-testid="supplier-table">
          <TableHeader className="bg-emerald-50/60">
            <TableRow className="border-emerald-100 hover:bg-emerald-50/60">
              <TableHead className="h-12 px-4 font-semibold text-stone-700" data-testid="supplier-company-header">Company</TableHead>
              <TableHead className="h-12 px-4 font-semibold text-stone-700" data-testid="supplier-contact-header">Contact</TableHead>
              <TableHead className="h-12 px-4 font-semibold text-stone-700" data-testid="supplier-due-date-header">Due Date</TableHead>
              <TableHead className="h-12 px-4 font-semibold text-stone-700" data-testid="supplier-ledger-login-status-header">Login Status</TableHead>
              <TableHead className="h-12 px-4 font-semibold text-stone-700" data-testid="supplier-progress-header">Progress</TableHead>
              <TableHead className="h-12 px-4 font-semibold text-stone-700" data-testid="supplier-score-header">Score</TableHead>
              <TableHead className="h-12 px-4 font-semibold text-stone-700" data-testid="supplier-last-reminder-header">Last Reminder</TableHead>
              <TableHead className="h-12 px-4 text-right font-semibold text-stone-700" data-testid="supplier-actions-header">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-stone-500" data-testid="supplier-table-loading">
                  Loading...
                </TableCell>
              </TableRow>
            ) : suppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-stone-500" data-testid="supplier-table-empty-state">
                  No suppliers found. Add your first supplier to get started.
                </TableCell>
              </TableRow>
            ) : (
              suppliers.map((supplier) => (
                <TableRow key={supplier.id} className="border-stone-100 hover:bg-emerald-50/30" data-testid={`supplier-row-${supplier.id}`}>
                  <TableCell className="px-4 py-4">
                    <div className="flex items-center gap-2.5">
                      <Building2 className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                      <span className="font-semibold text-stone-900" data-testid={`supplier-company-${supplier.id}`}>{supplier.company_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <div className="text-sm">
                      <div className="flex items-center gap-1.5 font-medium text-stone-700" data-testid={`supplier-contact-person-${supplier.id}`}>
                        <User className="h-3.5 w-3.5 text-stone-400" aria-hidden="true" />
                        <span>{supplier.contact_person}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-stone-500" data-testid={`supplier-contact-email-${supplier.id}`}>{supplier.contact_email}</div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-4" data-testid={`supplier-due-date-${supplier.id}`}>
                    {supplier.due_date ? (
                      <div className="flex items-center gap-1.5 text-sm text-stone-600">
                        <Calendar className="h-3.5 w-3.5 text-stone-400" aria-hidden="true" />
                        {new Date(supplier.due_date).toLocaleDateString()}
                      </div>
                    ) : (
                      <span className="text-stone-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <Badge variant="outline" className={`rounded-full px-2.5 py-1 text-xs font-medium shadow-none ${statusColors[supplier.invitation_status] || 'border-stone-200 bg-stone-50 text-stone-700'}`} data-testid={`supplier-login-status-${supplier.id}`}>
                      {supplier.invitation_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-stone-200" data-testid={`supplier-progress-track-${supplier.id}`}>
                        <div
                          className="h-2 rounded-full bg-emerald-600 transition-[width] duration-500"
                          style={{ width: `${supplier.overall_completion_percent || 0}%` }}
                          data-testid={`supplier-progress-bar-${supplier.id}`}
                        />
                      </div>
                      <span className="min-w-9 text-sm font-semibold text-stone-700" data-testid={`supplier-progress-percent-${supplier.id}`}>
                        {Math.round(supplier.overall_completion_percent || 0)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-4" data-testid={`supplier-score-${supplier.id}`}>
                    {supplier.overall_score !== null ? (
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        <span className="font-semibold text-stone-800">{supplier.overall_score}</span>
                      </div>
                    ) : (
                      <span className="text-stone-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-4" data-testid={`supplier-last-reminder-${supplier.id}`}>
                    {supplier.last_reminder_sent ? (
                      <div className="text-sm text-stone-500">
                        {new Date(supplier.last_reminder_sent).toLocaleDateString()}
                        <span className="text-xs ml-1">({supplier.reminder_count})</span>
                      </div>
                    ) : (
                      <span className="text-stone-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-4 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-stone-600 transition-[background-color,color] hover:bg-emerald-50 hover:text-emerald-800"
                        onClick={() => openViewDialog(supplier)}
                        aria-label={`View ${supplier.company_name}`}
                        title="View supplier"
                        data-testid={`view-supplier-${supplier.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-stone-600 transition-[background-color,color] hover:bg-stone-100 hover:text-stone-900"
                        onClick={() => openEditDialog(supplier)}
                        aria-label={`Edit ${supplier.company_name}`}
                        title="Edit supplier"
                        data-testid={`edit-supplier-${supplier.id}`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-stone-600 transition-[background-color,color] hover:bg-blue-50 hover:text-blue-700"
                        onClick={() => { setReminderTarget(supplier); setReminderModules(['all']); setPendingReminderModules([]); setReminderModulesLoading(true); axios.get(`${API}/supplier-assessment/suppliers/${supplier.id}/reminder-pending`, { headers: getAuthHeader() }).then((response) => setPendingReminderModules(response.data.modules || [])).catch(() => toast.error('Could not load pending reminder items')).finally(() => setReminderModulesLoading(false)); }}
                        aria-label={`Send reminder to ${supplier.company_name}`}
                        title="Send Reminder"
                        data-testid={`remind-supplier-${supplier.id}`}
                      >
                        <Mail className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-red-600 transition-[background-color,color] hover:bg-red-50 hover:text-red-700"
                        onClick={() => handleDeactivate(supplier)}
                        aria-label={`Delete ${supplier.company_name}`}
                        title="Delete supplier"
                        data-testid={`delete-supplier-${supplier.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3" data-testid="supplier-pagination">
            <div className="text-sm text-stone-500" data-testid="supplier-pagination-summary">
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                data-testid="supplier-pagination-previous"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page * pageSize >= total}
                onClick={() => setPage(p => p + 1)}
                data-testid="supplier-pagination-next"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add Supplier Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { setShowAddDialog(open); if (!open) resetAddSupplierForm(); }}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden bg-white p-0 sm:max-w-4xl" data-testid="add-supplier-dialog">
          <DialogHeader className="shrink-0 border-b border-stone-200 bg-white px-7 py-5">
            <DialogTitle className="text-xl">Add Supplier</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-7 py-5" data-testid="add-supplier-form-scroll-area">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Company Name *</Label>
                <Input value={formData.company_name} onChange={(e) => setFormData({ ...formData, company_name: e.target.value })} placeholder="Enter company name" data-testid="supplier-company-name" />
              </div>
              <div className="space-y-2">
                <Label>Contact Person *</Label>
                <Input value={formData.contact_person} onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} placeholder="Enter contact person name" data-testid="supplier-contact-person" />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Enter email address"
                  data-testid="supplier-email"
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Number</Label>
                <Input
                  value={formData.contact_number}
                  onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                  placeholder="Enter phone number"
                  data-testid="supplier-phone"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label>Due Date</Label>
                  <FieldInfo label="After this date, the supplier assessment will be locked for the supplier." testId="supplier-due-date-info" />
                </div>
                <Input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} data-testid="supplier-due-date" />
              </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>Is Annual Revenue required?</Label>
                <FieldInfo label="Annual revenue is required for intensity calculations." testId="annual-revenue-info" />
              </div>
              <RadioGroup value={formData.revenue_required ? 'required' : 'optional'} onValueChange={(value) => setFormData({ ...formData, revenue_required: value === 'required' })} className="flex flex-wrap gap-5" data-testid="annual-revenue-required-control">
                <label className="flex cursor-pointer items-center gap-2 text-sm" htmlFor="annual-revenue-optional">
                  <RadioGroupItem id="annual-revenue-optional" value="optional" data-testid="annual-revenue-optional-radio" />
                  Optional
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm" htmlFor="annual-revenue-required">
                  <RadioGroupItem id="annual-revenue-required" value="required" data-testid="annual-revenue-required-radio" />
                  Required
                </label>
              </RadioGroup>
            </div>
            </div>
            
            {/* Module Selection */}
            <div className="space-y-3 border-t pt-2">
              <Label className="text-base font-medium">Assessment Modules *</Label>
              <p className="text-sm text-stone-500">Select which modules the supplier needs to complete</p>
              <div className={`grid gap-4 ${questionnaires.length > 0 ? 'md:grid-cols-2' : ''}`}>
                {questionnaires.length > 0 && <div className="space-y-3 rounded-lg border border-purple-200 bg-white p-3 shadow-[0_2px_10px_rgba(168,85,247,0.08)]">
                  <div className="flex items-center gap-2">
                  <Checkbox
                    id="module-esg"
                    checked={formData.modules_enabled?.includes('esg')}
                    onCheckedChange={() => toggleModule('esg')}
                    data-testid="module-esg-checkbox"
                  />
                  <label htmlFor="module-esg" className="flex items-center gap-2 text-sm cursor-pointer">
                    <Leaf className="h-4 w-4 text-emerald-600" />
                    ESG Questionnaire
                  </label>
                  </div>
                  {formData.modules_enabled?.includes('esg') && questionnaires.length > 0 && (
                    <div className="space-y-3 border-t border-stone-100 pt-3" data-testid="supplier-questionnaire-assignment-options">
                      <Label className="text-sm font-medium">Assign ESG questionnaire(s)</Label>
                      <p className="text-xs text-stone-500">Select the questionnaires this supplier must complete.</p>
                      <div className="space-y-2">
                        {questionnaires.map((questionnaire) => (
                          <label key={questionnaire.id} className="flex items-start gap-2 text-sm">
                            <Checkbox
                              checked={formData.questionnaire_ids.includes(questionnaire.id)}
                              onCheckedChange={() => toggleQuestionnaire(questionnaire.id)}
                              data-testid={`new-supplier-questionnaire-${questionnaire.id}`}
                            />
                            <span className="min-w-0"><span className="block font-medium text-stone-800" data-testid={`new-supplier-questionnaire-name-${questionnaire.id}`}>{questionnaire.name}</span><RequirementDeadline dueDate={questionnaire.due_date} testId={`new-supplier-questionnaire-${questionnaire.id}`} /></span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>}
                <div className="space-y-3 rounded-lg border border-blue-200 bg-white p-3 shadow-[0_2px_10px_rgba(59,130,246,0.08)]">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="module-ghg"
                      checked={formData.modules_enabled?.includes('ghg')}
                      onCheckedChange={() => toggleModule('ghg')}
                      data-testid="module-ghg-checkbox"
                    />
                    <label htmlFor="module-ghg" className="flex items-center gap-2 text-sm cursor-pointer">
                      <Factory className="h-4 w-4 text-blue-600" />
                      GHG Emissions
                    </label>
                  </div>
                  {formData.modules_enabled?.includes('ghg') && (
                    <div className="space-y-3 border-t border-stone-100 pt-3" data-testid="supplier-ghg-scope-options">
                      <Label className="text-sm font-medium">GHG Scopes</Label>
                      <p className="text-xs text-stone-500">Select which scopes the supplier should report</p>
                      <div className="flex flex-wrap gap-x-5 gap-y-2">
                        <div className="flex items-center gap-2">
                    <Checkbox
                      id="scope-1"
                      checked={formData.ghg_scopes_enabled?.includes('scope1')}
                      onCheckedChange={() => toggleScope('scope1')}
                      data-testid="scope1-checkbox"
                    />
                    <label htmlFor="scope-1" className="text-sm cursor-pointer">
                      Scope 1 (Direct Emissions)
                    </label>
                        </div>
                        <div className="flex items-center gap-2">
                    <Checkbox
                      id="scope-2"
                      checked={formData.ghg_scopes_enabled?.includes('scope2')}
                      onCheckedChange={() => toggleScope('scope2')}
                      data-testid="scope2-checkbox"
                    />
                    <label htmlFor="scope-2" className="text-sm cursor-pointer">
                      Scope 2 (Indirect Emissions)
                    </label>
                        </div>
                      </div>
                      <div className="space-y-2 border-t border-stone-100 pt-3" data-testid="supplier-ghg-submission-frequency-options">
                        <Label className="text-sm font-medium">GHG submission frequency</Label>
                        <RadioGroup value={formData.ghg_submission_frequency} onValueChange={(value) => setFormData((current) => ({ ...current, ghg_submission_frequency: value }))} className="flex flex-wrap gap-4" data-testid="supplier-ghg-submission-frequency-control">
                          <label className="flex cursor-pointer items-center gap-2 text-sm" htmlFor="new-supplier-ghg-monthly"><RadioGroupItem id="new-supplier-ghg-monthly" value="monthly" data-testid="new-supplier-ghg-monthly-radio" />Monthly</label>
                          <label className="flex cursor-pointer items-center gap-2 text-sm" htmlFor="new-supplier-ghg-quarterly"><RadioGroupItem id="new-supplier-ghg-quarterly" value="quarterly" data-testid="new-supplier-ghg-quarterly-radio" />Quarterly</label>
                          <label className="flex cursor-pointer items-center gap-2 text-sm" htmlFor="new-supplier-ghg-yearly"><RadioGroupItem id="new-supplier-ghg-yearly" value="yearly" data-testid="new-supplier-ghg-yearly-radio" />Yearly</label>
                        </RadioGroup>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {(documents.length > 0 || trainings.length > 0) && (
              <div className="grid gap-4 border-t pt-4 md:grid-cols-2 [&>div:first-child]:!border-teal-300 [&>div:first-child]:!shadow-[0_4px_16px_rgba(20,184,166,0.18)] [&>div:last-child]:!border-amber-300 [&>div:last-child]:!shadow-[0_4px_16px_rgba(245,158,11,0.18)]" data-testid="supplier-existing-assignment-options">
                {documents.length > 0 && <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-3"><span className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-stone-600" />Documents</span>{documents.map((document) => <label key={document.id} className="flex items-start gap-2 text-sm"><Checkbox checked={formData.document_requirement_ids.includes(document.id)} onCheckedChange={(checked) => setFormData((current) => ({ ...current, document_requirement_ids: checked ? [...current.document_requirement_ids, document.id] : current.document_requirement_ids.filter((id) => id !== document.id) }))} data-testid={`new-supplier-document-${document.id}`} /><span className="min-w-0"><span className="block font-medium text-stone-800" data-testid={`new-supplier-document-name-${document.id}`}>{document.title}</span><RequirementDeadline dueDate={document.due_date} testId={`new-supplier-document-${document.id}`} /></span></label>)}</div>}
                {trainings.length > 0 && <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-3"><span className="flex items-center gap-2 text-sm font-semibold"><GraduationCap className="h-4 w-4 text-stone-600" />Training</span>{trainings.map((training) => <label key={training.id} className="flex items-start gap-2 text-sm"><Checkbox checked={formData.training_requirement_ids.includes(training.id)} onCheckedChange={(checked) => setFormData((current) => ({ ...current, training_requirement_ids: checked ? [...current.training_requirement_ids, training.id] : current.training_requirement_ids.filter((id) => id !== training.id) }))} data-testid={`new-supplier-training-${training.id}`} /><span className="min-w-0"><span className="block font-medium text-stone-800" data-testid={`new-supplier-training-name-${training.id}`}>{training.title}</span><RequirementDeadline dueDate={training.due_date} testId={`new-supplier-training-${training.id}`} /></span></label>)}</div>}
              </div>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t bg-white px-6 py-4">
            <Button variant="outline" onClick={() => { resetAddSupplierForm(); setShowAddDialog(false); }} data-testid="cancel-add-supplier-button">
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={submitting} data-testid="submit-supplier">
              {submitting ? 'Adding...' : 'Add Supplier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Supplier Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden bg-white p-0 sm:max-w-4xl" data-testid="edit-supplier-dialog">
          <DialogHeader className="shrink-0 border-b border-stone-200 bg-white px-7 py-5">
            <DialogTitle>Edit Supplier</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-white px-7 py-5" data-testid="edit-supplier-form-scroll-area">
            <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Contact Person</Label>
              <Input
                value={formData.contact_person}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={selectedSupplier?.contact_email || formData.email || ''} disabled className="bg-stone-100 text-stone-500" data-testid="edit-supplier-email-locked" />
            </div>
            <div className="space-y-2">
              <Label>Contact Number</Label>
              <Input
                value={formData.contact_number}
                onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              />
            </div>
            <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-3">
              <Label>Is Annual Revenue required?</Label>
              <RadioGroup value={formData.revenue_required ? 'required' : 'optional'} onValueChange={(value) => setFormData({ ...formData, revenue_required: value === 'required' })} className="flex flex-wrap gap-4" data-testid="edit-annual-revenue-required-control"><label className="flex items-center gap-2 text-sm"><RadioGroupItem value="optional" data-testid="edit-annual-revenue-optional-radio" />Optional</label><label className="flex items-center gap-2 text-sm"><RadioGroupItem value="required" data-testid="edit-annual-revenue-required-radio" />Required</label></RadioGroup>
            </div>
            </div>
            
            {/* Module Selection */}
            <div className="space-y-3 pt-2 border-t">
              <Label className="text-base font-medium">Assessment Modules</Label>
              
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-module-esg"
                    checked={formData.modules_enabled?.includes('esg')}
                    onCheckedChange={() => toggleModule('esg')}
                  />
                  <label htmlFor="edit-module-esg" className="flex items-center gap-2 text-sm cursor-pointer">
                    <Leaf className="h-4 w-4 text-emerald-600" />
                    ESG Questionnaire
                  </label>
                </div>
                
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-module-ghg"
                    checked={formData.modules_enabled?.includes('ghg')}
                    onCheckedChange={() => toggleModule('ghg')}
                  />
                  <label htmlFor="edit-module-ghg" className="flex items-center gap-2 text-sm cursor-pointer">
                    <Factory className="h-4 w-4 text-blue-600" />
                    GHG Emissions
                  </label>
                </div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2" data-testid="edit-supplier-module-cards">
            {formData.modules_enabled?.includes('esg') && questionnaires.length > 0 && (
              <div className="space-y-3 rounded-lg border border-purple-200 bg-white p-4 shadow-[0_2px_10px_rgba(168,85,247,0.08)]" data-testid="edit-supplier-questionnaire-assignments">
                <Label className="text-sm font-medium">Assigned ESG questionnaires</Label>
                <p className="text-xs text-stone-500">Submitted questionnaires remain assigned to preserve the supplier’s assessment history.</p>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                  {questionnaires.map((questionnaire) => {
                    const isSubmitted = (submissionStatus?.esg || []).some((submission) => submission.questionnaire_id === questionnaire.id);
                    return (
                      <label key={questionnaire.id} className={`flex items-center gap-2 text-sm ${isSubmitted ? 'text-stone-500' : ''}`}>
                        <Checkbox
                          checked={formData.questionnaire_ids.includes(questionnaire.id)}
                          disabled={isSubmitted}
                          onCheckedChange={() => toggleQuestionnaire(questionnaire.id)}
                          data-testid={`edit-supplier-questionnaire-${questionnaire.id}`}
                        />
                        <span>{questionnaire.name}</span>
                        {isSubmitted && <Badge variant="outline" className="ml-auto text-xs" data-testid={`submitted-questionnaire-lock-${questionnaire.id}`}>Submitted</Badge>}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* GHG Scope Selection */}
            {formData.modules_enabled?.includes('ghg') && (
              <div className="space-y-3 rounded-lg border border-blue-200 bg-white p-4 shadow-[0_2px_10px_rgba(59,130,246,0.08)]">
                <Label className="text-sm font-medium">GHG Scopes</Label>
                
                <div className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="edit-scope-1"
                      checked={formData.ghg_scopes_enabled?.includes('scope1')}
                      onCheckedChange={() => toggleScope('scope1')}
                    />
                    <label htmlFor="edit-scope-1" className="text-sm cursor-pointer">
                      Scope 1 (Direct)
                    </label>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="edit-scope-2"
                      checked={formData.ghg_scopes_enabled?.includes('scope2')}
                      onCheckedChange={() => toggleScope('scope2')}
                    />
                    <label htmlFor="edit-scope-2" className="text-sm cursor-pointer">
                      Scope 2 (Indirect)
                    </label>
                  </div>
                </div>
                <div className="space-y-2 border-t border-stone-100 pt-3" data-testid="edit-supplier-ghg-submission-frequency-options">
                  <Label className="text-sm font-medium">GHG submission frequency</Label>
                  <RadioGroup value={formData.ghg_submission_frequency} onValueChange={(value) => setFormData((current) => ({ ...current, ghg_submission_frequency: value }))} className="flex flex-wrap gap-4" data-testid="edit-supplier-ghg-submission-frequency-control">
                    <label className="flex cursor-pointer items-center gap-2 text-sm" htmlFor="edit-supplier-ghg-monthly"><RadioGroupItem id="edit-supplier-ghg-monthly" value="monthly" data-testid="edit-supplier-ghg-monthly-radio" />Monthly</label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm" htmlFor="edit-supplier-ghg-quarterly"><RadioGroupItem id="edit-supplier-ghg-quarterly" value="quarterly" data-testid="edit-supplier-ghg-quarterly-radio" />Quarterly</label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm" htmlFor="edit-supplier-ghg-yearly"><RadioGroupItem id="edit-supplier-ghg-yearly" value="yearly" data-testid="edit-supplier-ghg-yearly-radio" />Yearly</label>
                  </RadioGroup>
                </div>
              </div>
            )}
            </div>
            {(documents.length > 0 || trainings.length > 0) && (
              <div className="grid gap-4 border-t border-stone-200 pt-4 md:grid-cols-2" data-testid="edit-supplier-assignment-summary">
                {documents.length > 0 && <div className="rounded-lg border border-teal-200 bg-white p-3 shadow-[0_2px_10px_rgba(20,184,166,0.08)]" data-testid="edit-supplier-documents-summary"><p className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-teal-700" />Documents</p><p className="mt-1 text-xs text-stone-500">Select the agreements this supplier should receive.</p><div className="mt-2 space-y-2 text-sm">{documents.map((document) => <label key={document.id} className="flex items-center gap-2" data-testid={`edit-supplier-document-${document.id}`}><Checkbox checked={formData.document_requirement_ids.includes(document.id)} onCheckedChange={(checked) => setFormData((current) => ({ ...current, document_requirement_ids: checked ? [...current.document_requirement_ids, document.id] : current.document_requirement_ids.filter((id) => id !== document.id) }))} data-testid={`edit-supplier-document-checkbox-${document.id}`} />{document.title}</label>)}</div></div>}
                {trainings.length > 0 && <div className="rounded-lg border border-amber-200 bg-white p-3 shadow-[0_2px_10px_rgba(245,158,11,0.08)]" data-testid="edit-supplier-trainings-summary"><p className="flex items-center gap-2 text-sm font-semibold"><GraduationCap className="h-4 w-4 text-amber-700" />Training</p><p className="mt-1 text-xs text-stone-500">Select the training this supplier should receive.</p><div className="mt-2 space-y-2 text-sm">{trainings.map((training) => <label key={training.id} className="flex items-center gap-2" data-testid={`edit-supplier-training-${training.id}`}><Checkbox checked={formData.training_requirement_ids.includes(training.id)} onCheckedChange={(checked) => setFormData((current) => ({ ...current, training_requirement_ids: checked ? [...current.training_requirement_ids, training.id] : current.training_requirement_ids.filter((id) => id !== training.id) }))} data-testid={`edit-supplier-training-checkbox-${training.id}`} />{training.title}</label>)}</div></div>}
              </div>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t bg-white px-6 py-4">
            <Button variant="outline" onClick={() => setShowEditDialog(false)} data-testid="cancel-edit-supplier-button">
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={submitting} data-testid="submit-edit-supplier-button">
              {submitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Supplier Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden bg-white p-0 sm:max-w-2xl" data-testid="view-supplier-dialog">
          <DialogHeader className="shrink-0 border-b border-stone-200 px-7 py-5">
            <DialogTitle>{selectedSupplier?.company_name}</DialogTitle>
          </DialogHeader>
          {selectedSupplier && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-7 py-5" data-testid="view-supplier-scroll-area">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-stone-500">Contact Person</Label>
                  <p className="font-medium">{selectedSupplier.contact_person}</p>
                </div>
                <div>
                  <Label className="text-stone-500">Email</Label>
                  <p className="font-medium">{selectedSupplier.contact_email}</p>
                </div>
                <div>
                  <Label className="text-stone-500">Phone</Label>
                  <p className="font-medium">{selectedSupplier.contact_number || '-'}</p>
                </div>
                <div>
                  <Label className="text-stone-500">Status</Label>
                  <div className="mt-1" data-testid="view-supplier-status">
                    <Badge className={statusColors[selectedSupplier.invitation_status]} data-testid="view-supplier-status-badge">
                      {selectedSupplier.invitation_status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-stone-500">Revenue %</Label>
                  <p className="font-medium flex items-center gap-1">
                    <Percent className="h-3 w-3" />
                    {selectedSupplier.revenue_percentage !== null 
                      ? `${selectedSupplier.revenue_percentage}%` 
                      : 'Not provided'}
                  </p>
                </div>
                <div>
                  <Label className="text-stone-500">Revenue Amount</Label>
                  <p className="font-medium">
                    {selectedSupplier.revenue_amount !== null && selectedSupplier.revenue_amount !== undefined
                      ? `${selectedSupplier.revenue_currency || 'USD'} ${selectedSupplier.revenue_amount.toLocaleString()}`
                      : 'Not provided'}
                  </p>
                </div>
                <div>
                  <Label className="text-stone-500">Due Date</Label>
                  <p className="font-medium">
                    {selectedSupplier.due_date 
                      ? new Date(selectedSupplier.due_date).toLocaleDateString() 
                      : '-'}
                  </p>
                </div>
              </div>
              
              <ViewSupplierProgress supplier={selectedSupplier} submissionStatus={submissionStatus} />
              {submissionStatus?.esg?.length > 0 && <div className="border-t pt-4" data-testid="supplier-esg-submission-controls">
                <Label className="text-stone-500">Locked ESG submissions</Label>
                <div className="mt-2 space-y-2">{submissionStatus.esg.map((submission) => <div key={submission.questionnaire_id} className="flex items-center justify-between gap-3 rounded-md border p-2" data-testid={`supplier-esg-submission-${submission.questionnaire_id}`}><span className="text-sm">Submitted {submission.submitted_at ? new Date(submission.submitted_at).toLocaleDateString() : ''}</span><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => openReview(submission.questionnaire_id)} data-testid={`review-supplier-questionnaire-${submission.questionnaire_id}`}><ClipboardCheck className="mr-1 h-4 w-4" />Review</Button><Button variant="outline" size="sm" disabled={unlockingQuestionnaireId === submission.questionnaire_id} onClick={() => unlockQuestionnaire(submission.questionnaire_id)} data-testid={`unlock-supplier-questionnaire-${submission.questionnaire_id}`}>{unlockingQuestionnaireId === submission.questionnaire_id ? 'Unlocking…' : 'Unlock'}</Button></div></div>)}</div>
              </div>
              }
              
              <ViewSupplierScores supplier={selectedSupplier} />
            </div>
          )}
          <DialogFooter className="shrink-0 border-t border-stone-200 bg-white px-7 py-4">
            <Button variant="outline" onClick={() => setShowViewDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(reminderTarget)} onOpenChange={(open) => !open && setReminderTarget(null)}>
        <DialogContent data-testid="supplier-reminder-dialog"><DialogHeader><DialogTitle>Send assessment reminder</DialogTitle></DialogHeader>
          <div className="space-y-3"><p className="text-sm text-stone-600" data-testid="supplier-reminder-period">Reporting period: {reminderTarget?.reporting_period || 'Current period'}</p>{reminderModulesLoading ? <p className="text-sm text-stone-500" data-testid="supplier-reminder-loading">Checking incomplete modules…</p> : pendingReminderModules.length ? <><label className="flex items-center gap-2 text-sm"><Checkbox checked={reminderModules.includes('all')} onCheckedChange={(checked) => setReminderModules(checked ? ['all'] : [])} data-testid="supplier-reminder-module-all" />All pending modules</label>{pendingReminderModules.map((module) => <label key={module.code} className="flex items-center gap-2 text-sm"><Checkbox checked={reminderModules.includes('all') || reminderModules.includes(module.code)} onCheckedChange={(checked) => setReminderModules((current) => { const withoutAll = current.filter((item) => item !== 'all'); return checked ? [...new Set([...withoutAll, module.code])] : withoutAll.filter((item) => item !== module.code); })} data-testid={`supplier-reminder-module-${module.code}`} />{module.label}</label>)}</> : <p className="text-sm text-stone-500" data-testid="supplier-reminder-empty">No incomplete modules need a reminder.</p>}</div>
          <DialogFooter><Button variant="outline" onClick={() => setReminderTarget(null)} data-testid="cancel-supplier-reminder-button">Cancel</Button><Button onClick={handleReminder} disabled={reminderModulesLoading || pendingReminderModules.length === 0 || reminderModules.length === 0} data-testid="send-supplier-reminder-button">Send reminder</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <SupplierResponseReviewDialog open={Boolean(reviewResponse)} onOpenChange={(open) => !open && setReviewResponse(null)} response={reviewResponse} supplierId={selectedSupplier?.id} getAuthHeader={getAuthHeader} onScoreSaved={() => { fetchSuppliers(); openReview(reviewResponse.id); }} />
    </div>
  );
}
