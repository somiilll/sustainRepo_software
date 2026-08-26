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
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
};

const groupAvailableDocuments = (requirements) => Object.values((requirements || []).reduce((groups, requirement) => {
  const key = requirement.document_version_id || requirement.id;
  if (!groups[key]) groups[key] = requirement;
  return groups;
}, {}));

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
  const [formData, setFormData] = useState({
    company_name: '',
    contact_person: '',
    email: '',
    contact_number: '',
    due_date: '',
    reporting_period: reportingPeriod,
    modules_enabled: ['esg', 'ghg'],
    ghg_scopes_enabled: ['scope1', 'scope2'],
    revenue_required: false,
    questionnaire_ids: [],
    document_requirement_ids: [],
    training_requirement_ids: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState(null);
  const [unlockingQuestionnaireId, setUnlockingQuestionnaireId] = useState('');
  const [documents, setDocuments] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [questionnaires, setQuestionnaires] = useState([]);
  const [questionnaireAssignmentsLoaded, setQuestionnaireAssignmentsLoaded] = useState(false);
  const [reminderTarget, setReminderTarget] = useState(null);
  const [reminderModules, setReminderModules] = useState(['all']);
  const [reviewResponse, setReviewResponse] = useState(null);

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
      const availableTrainings = trainingResponse.data || [];
      setDocuments(availableDocuments);
      setTrainings(availableTrainings);
      const availableQuestionnaires = questionnaireResponse.data || [];
      setQuestionnaires(availableQuestionnaires);
      setFormData((current) => ({
        ...current,
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
      setDocuments(groupAvailableDocuments(documentResponse.data));
      setTrainings(trainingResponse.data || []);
      const availableQuestionnaires = questionnaireResponse.data || [];
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
      setFormData({ 
        company_name: '', 
        contact_person: '', 
        email: '', 
        contact_number: '', 
        due_date: '',
        reporting_period: reportingPeriod,
        modules_enabled: ['esg', 'ghg'],
        ghg_scopes_enabled: ['scope1', 'scope2'],
        questionnaire_ids: [],
        document_requirement_ids: [],
        training_requirement_ids: [],
      });
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
    <div className="space-y-6" data-testid="supplier-list">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-stone-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-4">
          <div>
          <h1 className="text-2xl font-semibold text-stone-900">Suppliers</h1>
          <p className="text-sm text-stone-500 mt-1">Manage your supplier assessments</p>
          </div>
          <div className="w-44" data-testid="supplier-list-period-control">
            <Label htmlFor="supplier-list-reporting-period" className="mb-1 flex items-center gap-1 text-xs font-medium text-stone-600"><CalendarDays className="h-3.5 w-3.5 text-emerald-700" />Reporting period</Label>
            <Select value={reportingPeriod} onValueChange={setReportingPeriod}>
              <SelectTrigger id="supplier-list-reporting-period" className="h-9 bg-white" data-testid="supplier-list-reporting-period-selector"><SelectValue /></SelectTrigger>
              <SelectContent data-testid="supplier-list-reporting-period-menu">{periods.map((period) => <SelectItem key={period} value={period} data-testid={`supplier-list-period-option-${period}`}>{period}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={() => setShowAddDialog(true)} data-testid="add-supplier-btn">
          <Plus className="h-4 w-4 mr-2" />
          Add Supplier
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <Input
            placeholder="Search suppliers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="supplier-search"
          />
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead data-testid="supplier-ledger-login-status-header">Login Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Last Reminder</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-stone-500">
                  Loading...
                </TableCell>
              </TableRow>
            ) : suppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-stone-500">
                  No suppliers found. Add your first supplier to get started.
                </TableCell>
              </TableRow>
            ) : (
              suppliers.map((supplier) => (
                <TableRow key={supplier.id} data-testid={`supplier-row-${supplier.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-stone-400" />
                      <span className="font-medium">{supplier.company_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3 text-stone-400" />
                        {supplier.contact_person}
                      </div>
                      <div className="text-stone-500">{supplier.contact_email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {supplier.due_date ? (
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3 text-stone-400" />
                        {new Date(supplier.due_date).toLocaleDateString()}
                      </div>
                    ) : (
                      <span className="text-stone-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[supplier.invitation_status] || 'bg-stone-100'}>
                      {supplier.invitation_status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-stone-200 rounded-full h-2">
                        <div
                          className="bg-emerald-500 h-2 rounded-full"
                          style={{ width: `${supplier.overall_completion_percent || 0}%` }}
                        />
                      </div>
                      <span className="text-sm text-stone-600">
                        {Math.round(supplier.overall_completion_percent || 0)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {supplier.overall_score !== null ? (
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-emerald-500" />
                        <span className="font-medium">{supplier.overall_score}</span>
                      </div>
                    ) : (
                      <span className="text-stone-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {supplier.last_reminder_sent ? (
                      <div className="text-sm text-stone-500">
                        {new Date(supplier.last_reminder_sent).toLocaleDateString()}
                        <span className="text-xs ml-1">({supplier.reminder_count})</span>
                      </div>
                    ) : (
                      <span className="text-stone-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openViewDialog(supplier)}
                        data-testid={`view-supplier-${supplier.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(supplier)}
                        data-testid={`edit-supplier-${supplier.id}`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setReminderTarget(supplier); setReminderModules(['all']); }}
                        data-testid={`remind-supplier-${supplier.id}`}
                      >
                        <Mail className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDeactivate(supplier)}
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
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-sm text-stone-500">
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page * pageSize >= total}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add Supplier Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
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
                <Label>Due Date</Label>
                <Input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} data-testid="supplier-due-date" />
              </div>
            <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-3">
              <Label>Is Annual Revenue required?</Label>
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
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-3">
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
                          <label key={questionnaire.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={formData.questionnaire_ids.includes(questionnaire.id)}
                              onCheckedChange={() => toggleQuestionnaire(questionnaire.id)}
                              data-testid={`new-supplier-questionnaire-${questionnaire.id}`}
                            />
                            {questionnaire.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-3">
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
                    </div>
                  )}
                </div>
              </div>
            </div>
            {(documents.length > 0 || trainings.length > 0) && (
              <div className="grid gap-4 border-t pt-4 md:grid-cols-2" data-testid="supplier-existing-assignment-options">
                {documents.length > 0 && <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-3"><span className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-stone-600" />Documents</span><p className="text-xs text-stone-500">Selected by default. Uncheck any document this supplier should not receive.</p>{documents.map((document) => <label key={document.id} className="flex items-center gap-2 text-sm"><Checkbox checked={formData.document_requirement_ids.includes(document.id)} onCheckedChange={(checked) => setFormData((current) => ({ ...current, document_requirement_ids: checked ? [...current.document_requirement_ids, document.id] : current.document_requirement_ids.filter((id) => id !== document.id) }))} data-testid={`new-supplier-document-${document.id}`} />{document.title}</label>)}</div>}
                {trainings.length > 0 && <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-3"><span className="flex items-center gap-2 text-sm font-semibold"><GraduationCap className="h-4 w-4 text-stone-600" />Training</span><p className="text-xs text-stone-500">Selected by default. Uncheck any training this supplier should not receive.</p>{trainings.map((training) => <label key={training.id} className="flex items-center gap-2 text-sm"><Checkbox checked={formData.training_requirement_ids.includes(training.id)} onCheckedChange={(checked) => setFormData((current) => ({ ...current, training_requirement_ids: checked ? [...current.document_requirement_ids, training.id] : current.training_requirement_ids.filter((id) => id !== training.id) }))} data-testid={`new-supplier-training-${training.id}`} />{training.title}</label>)}</div>}
              </div>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t bg-white px-6 py-4">
            <Button variant="outline" onClick={() => setShowAddDialog(false)} data-testid="cancel-add-supplier-button">
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
            {formData.modules_enabled?.includes('esg') && questionnaires.length > 0 && (
              <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4" data-testid="edit-supplier-questionnaire-assignments">
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
              <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
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
              </div>
            )}
            {(documents.length > 0 || trainings.length > 0) && (
              <div className="grid gap-4 border-t border-stone-200 pt-4 md:grid-cols-2" data-testid="edit-supplier-assignment-summary">
                {documents.length > 0 && <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-3" data-testid="edit-supplier-documents-summary"><p className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-sky-800" />Documents</p><p className="mt-1 text-xs text-stone-500">Document assignments are managed from Documents.</p><div className="mt-2 space-y-1 text-sm">{documents.map((document) => <p key={document.id} data-testid={`edit-supplier-document-${document.id}`}>{document.title}</p>)}</div></div>}
                {trainings.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3" data-testid="edit-supplier-trainings-summary"><p className="flex items-center gap-2 text-sm font-semibold"><GraduationCap className="h-4 w-4 text-amber-800" />Training</p><p className="mt-1 text-xs text-stone-500">Training assignments are managed from Trainings.</p><div className="mt-2 space-y-1 text-sm">{trainings.map((training) => <p key={training.id} data-testid={`edit-supplier-training-${training.id}`}>{training.title}</p>)}</div></div>}
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
                  <Badge className={statusColors[selectedSupplier.invitation_status]}>
                    {selectedSupplier.invitation_status}
                  </Badge>
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
              
              <div className="border-t pt-4">
                <Label className="text-stone-500">Completion Progress</Label>
                <div className="space-y-2 mt-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>ESG Questionnaire</span>
                    <span>{Math.round(selectedSupplier.esg_completion_percent || 0)}%</span>
                  </div>
                  <div className="w-full bg-stone-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${selectedSupplier.esg_completion_percent || 0}%` }}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between text-sm mt-3">
                    <span>GHG Emissions</span>
                    <span>{Math.round(selectedSupplier.ghg_completion_percent || 0)}%</span>
                  </div>
                  <div className="w-full bg-stone-200 rounded-full h-2">
                    <div
                      className="bg-emerald-500 h-2 rounded-full"
                      style={{ width: `${selectedSupplier.ghg_completion_percent || 0}%` }}
                    />
                  </div>
                </div>
              </div>
              {submissionStatus?.esg?.length > 0 && <div className="border-t pt-4" data-testid="supplier-esg-submission-controls">
                <Label className="text-stone-500">Locked ESG submissions</Label>
                <div className="mt-2 space-y-2">{submissionStatus.esg.map((submission) => <div key={submission.questionnaire_id} className="flex items-center justify-between gap-3 rounded-md border p-2" data-testid={`supplier-esg-submission-${submission.questionnaire_id}`}><span className="text-sm">Submitted {submission.submitted_at ? new Date(submission.submitted_at).toLocaleDateString() : ''}</span><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => openReview(submission.questionnaire_id)} data-testid={`review-supplier-questionnaire-${submission.questionnaire_id}`}><ClipboardCheck className="mr-1 h-4 w-4" />Review</Button><Button variant="outline" size="sm" disabled={unlockingQuestionnaireId === submission.questionnaire_id} onClick={() => unlockQuestionnaire(submission.questionnaire_id)} data-testid={`unlock-supplier-questionnaire-${submission.questionnaire_id}`}>{unlockingQuestionnaireId === submission.questionnaire_id ? 'Unlocking…' : 'Unlock'}</Button></div></div>)}</div>
              </div>
              }
              
              {(selectedSupplier.esg_score || selectedSupplier.ghg_score) && (
                <div className="border-t pt-4">
                  <Label className="text-stone-500">Scores</Label>
                  <div className="grid grid-cols-3 gap-4 mt-2">
                    <div className="text-center p-3 bg-stone-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">
                        {selectedSupplier.esg_score || '-'}
                      </div>
                      <div className="text-xs text-stone-500">ESG Score</div>
                    </div>
                    <div className="text-center p-3 bg-stone-50 rounded-lg">
                      <div className="text-2xl font-bold text-emerald-600">
                        {selectedSupplier.ghg_score || '-'}
                      </div>
                      <div className="text-xs text-stone-500">GHG Score</div>
                    </div>
                    <div className="text-center p-3 bg-stone-50 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">
                        {selectedSupplier.overall_score || '-'}
                      </div>
                      <div className="text-xs text-stone-500">Overall</div>
                    </div>
                  </div>
                </div>
              )}
              {selectedSupplier.canonical_score_snapshot && (
                <div className="border-t pt-4" data-testid="supplier-canonical-score-breakdown">
                  <Label className="text-stone-500">Submitted score breakdown</Label>
                  <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-stone-500">Environment</span><p className="font-medium">{selectedSupplier.canonical_score_snapshot.environment_score ?? 'Pending'}</p></div>
                    <div><span className="text-stone-500">Social</span><p className="font-medium">{selectedSupplier.canonical_score_snapshot.social_score ?? 'Pending'}</p></div>
                    <div><span className="text-stone-500">Governance</span><p className="font-medium">{selectedSupplier.canonical_score_snapshot.governance_score ?? 'Pending'}</p></div>
                    <div><span className="text-stone-500">GHG intensity</span><p className="font-medium" data-testid="supplier-ghg-intensity">{selectedSupplier.canonical_score_snapshot.ghg_intensity_tco2e_per_million_revenue == null ? 'Pending' : `${selectedSupplier.canonical_score_snapshot.ghg_intensity_tco2e_per_million_revenue} tCO₂e / revenue million`}</p></div>
                  </div>
                  {!selectedSupplier.canonical_score_snapshot.is_complete && <p className="mt-3 text-xs text-stone-500" data-testid="supplier-canonical-score-pending">Overall score will appear after all weighted components are submitted.</p>}
                </div>
              )}
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
          <div className="space-y-3"><p className="text-sm text-stone-600" data-testid="supplier-reminder-period">Reporting period: {reminderTarget?.reporting_period || 'Current period'}</p>{['all', 'esg', 'ghg', 'documents', 'training', 'revenue'].map((module) => <label key={module} className="flex items-center gap-2 text-sm"><Checkbox checked={reminderModules.includes(module)} onCheckedChange={(checked) => setReminderModules(checked ? [...new Set([...reminderModules, module])] : reminderModules.filter((item) => item !== module))} data-testid={`supplier-reminder-module-${module}`} />{module === 'all' ? 'All pending modules' : module[0].toUpperCase() + module.slice(1)}</label>)}</div>
          <DialogFooter><Button variant="outline" onClick={() => setReminderTarget(null)} data-testid="cancel-supplier-reminder-button">Cancel</Button><Button onClick={handleReminder} data-testid="send-supplier-reminder-button">Send reminder</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <SupplierResponseReviewDialog open={Boolean(reviewResponse)} onOpenChange={(open) => !open && setReviewResponse(null)} response={reviewResponse} supplierId={selectedSupplier?.id} getAuthHeader={getAuthHeader} onScoreSaved={() => { fetchSuppliers(); openReview(reviewResponse.id); }} />
    </div>
  );
}
