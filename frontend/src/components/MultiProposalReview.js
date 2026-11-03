import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { formatDateTime as formatDateTimeUtil } from '../utils/dateTimeUtils';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { 
  User, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Edit2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Calendar,
  Paperclip,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import EvidenceFileLink from './EvidenceFileLink';
import { createDraftEvidence, draftEvidence, persistedEvidence, revokeDraftEvidences, toEvidencePayload, uploadDraftEvidences } from '../lib/draftEvidence';
import CategoryFieldsForm, { hasCategoryForm } from './CategoryFieldsForm';

const API = process.env.REACT_APP_BACKEND_URL;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 
                'July', 'August', 'September', 'October', 'November', 'December'];

function ProposalAttachments({ source, notes, evidence, editing, onChange, onFiles }) {
  const none = <span className="text-stone-400">-</span>;
  return (
    <div className="space-y-3 rounded-lg border border-stone-200 p-4 text-sm" data-testid="proposal-attachments">
      <div>
        <p className="mb-1 text-xs text-stone-500">Source of information</p>
        {editing
          ? <Input value={source || ''} onChange={(e) => onChange({ source: e.target.value })} placeholder="e.g., Utility Bill, Vendor Invoice..." data-testid="proposal-source-input" />
          : <p className="font-medium text-stone-900" data-testid="proposal-source">{source || none}</p>}
      </div>
      <div>
        <p className="mb-1 text-xs text-stone-500">Notes</p>
        {editing
          ? <Textarea value={notes || ''} onChange={(e) => onChange({ notes: e.target.value })} rows={3} placeholder="Additional notes..." data-testid="proposal-notes-input" />
          : <p className="whitespace-pre-wrap text-stone-900" data-testid="proposal-notes">{notes || none}</p>}
      </div>
      <div>
        <p className="mb-1 flex items-center gap-1 text-xs text-stone-500"><Paperclip className="h-3.5 w-3.5" />Evidence files</p>
        {evidence.length === 0 && <p className="text-stone-400">No evidence files</p>}
        <ul className="space-y-1">
          {evidence.map((ev, i) => (
            <li key={ev.id || i} className="flex items-center gap-3 rounded-md bg-stone-50 px-2 py-1.5" data-testid="proposal-evidence-item">
              <span className="flex-1 truncate text-stone-900">{ev.filename || ev.name || 'File'}</span>
              {ev.file_size ? <span className="text-xs text-stone-400">{(ev.file_size / 1024).toFixed(0)}KB</span> : null}
              <EvidenceFileLink evidence={ev} testId={`proposal-evidence-view-${ev.id || i}`} />
              {editing && (
                <button type="button" className="text-red-400 hover:text-red-600" aria-label="Remove evidence"
                        onClick={() => onChange({ evidence: evidence.filter((_, idx) => idx !== i) })} data-testid={`proposal-evidence-remove-${ev.id || i}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {editing && (
          <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50">
            <Upload className="h-3.5 w-3.5" />Add evidence
            <input type="file" multiple className="hidden" data-testid="proposal-evidence-upload"
                   onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          </label>
        )}
      </div>
    </div>
  );
}

/**
 * MultiProposalReview - Card-based component for reviewing multiple proposals
 * 
 * Features:
 * - Fetches KPI field config for human-readable field labels
 * - Displays each proposal as a card with field values and actions
 * - Shows reporting period info
 * - Approve/Reject/Edit buttons below each card
 */
export default function MultiProposalReview({ 
  recordId, 
  entityType = 'esg_record',
  section = 'environment',
  onClose,
  onActionComplete,
}) {
  const { getAuthHeader, user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [proposals, setProposals] = useState([]);
  const [approvedRecord, setApprovedRecord] = useState(null);
  const [fieldConfig, setFieldConfig] = useState(null);
  const [actionComment, setActionComment] = useState('');
  
  // Edit dialog state
  const [editingProposal, setEditingProposal] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [inlineEdit, setInlineEdit] = useState(null);
  const setInlineValues = (updater) => setInlineEdit((cur) => (
    cur && { ...cur, values: typeof updater === 'function' ? updater(cur.values) : updater }
  ));

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    return formatDateTimeUtil(dateStr);
  };

  // Get human-readable field label from config
  const getFieldLabel = useCallback((fieldKey) => {
    if (!fieldConfig?.fields) return fieldKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const field = fieldConfig.fields.find(f => f.field_key === fieldKey);
    return field?.label || fieldKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }, [fieldConfig]);

  const getDisplayFieldEntries = useCallback((fieldValues = {}) => {
    if (entityType !== 'esg_record' || !fieldConfig?.fields?.length) {
      return Object.entries(fieldValues);
    }

    const configuredKeys = new Set(fieldConfig.fields.map(field => field.field_key));
    const configuredEntries = fieldConfig.fields.map(field => [
      field.field_key,
      Object.prototype.hasOwnProperty.call(fieldValues, field.field_key)
        ? fieldValues[field.field_key]
        : (field.default_value ?? null),
    ]);
    const extraEntries = Object.entries(fieldValues).filter(([key]) => !configuredKeys.has(key));
    return [...configuredEntries, ...extraEntries];
  }, [entityType, fieldConfig]);

  // Format reporting period for display
  const formatReportingPeriod = (reportingPeriod) => {
    if (!reportingPeriod) return '-';
    const { year, month, quarter, reporting_type } = reportingPeriod;
    
    if (reporting_type === 'quarterly' && quarter) {
      return `Q${quarter} ${year}`;
    } else if (month) {
      const monthName = MONTHS[Number(month) - 1] || month;
      return `${monthName} ${year}`;
    } else if (year) {
      return String(year);
    }
    return '-';
  };

  // Fetch proposals and record data
  const fetchProposals = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getAuthHeader();
      
      // Fetch pending proposals for this record
      const proposalsRes = await axios.get(
        `${API}/api/proposals/record/${entityType}/${recordId}`,
        { headers }
      );
      setProposals(proposalsRes.data.proposals || []);
      setApprovedRecord(proposalsRes.data.current_record || null);
      
      // Fetch KPI field config for human-readable labels
      if (proposalsRes.data.current_record?.category_id) {
        try {
          const configRes = await axios.get(
            `${API}/api/esg-records/categories/${section}/${proposalsRes.data.current_record.category_id}`,
            { headers }
          );
          setFieldConfig(configRes.data);
        } catch (err) {
          console.error('Failed to fetch field config:', err);
        }
      }
    } catch (err) {
      console.error('Failed to fetch proposals:', err);
      toast.error('Failed to load proposals');
    } finally {
      setLoading(false);
    }
  }, [recordId, entityType, section, getAuthHeader]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  // Approve a proposal
  const handleApprove = async (proposalId) => {
    setProcessing(true);
    try {
      await axios.post(
        `${API}/api/proposals/${proposalId}/approve`,
        { comment: actionComment || 'Approved' },
        { headers: getAuthHeader() }
      );
      toast.success('Proposal approved successfully');
      setActionComment('');
      onActionComplete?.();
    } catch (err) {
      console.error('Failed to approve:', err);
      toast.error(err.response?.data?.detail || 'Failed to approve proposal');
    } finally {
      setProcessing(false);
    }
  };

  // Reject a proposal
  const handleReject = async (proposalId) => {
    if (!actionComment.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    setProcessing(true);
    try {
      await axios.post(
        `${API}/api/proposals/${proposalId}/reject`,
        { reason: actionComment },
        { headers: getAuthHeader() }
      );
      toast.success('Proposal rejected');
      setActionComment('');
      fetchProposals();
    } catch (err) {
      console.error('Failed to reject:', err);
      toast.error(err.response?.data?.detail || 'Failed to reject proposal');
    } finally {
      setProcessing(false);
    }
  };

  // Open edit dialog
  const openEditDialog = (proposal) => {
    setEditingProposal(proposal);
    // For emission records, use dynamic_field_values or proposed_changes.inputs
    const snapshot = proposal.entity_snapshot || {};
    let initialValues = snapshot.field_values || {};
    
    if (entityType === 'emission_record') {
      // Check proposed_changes.inputs first (for edit proposals)
      if (snapshot.proposed_changes?.inputs && Object.keys(snapshot.proposed_changes.inputs).length > 0) {
        initialValues = snapshot.proposed_changes.inputs;
      } else if (snapshot.dynamic_field_values && Object.keys(snapshot.dynamic_field_values).length > 0) {
        initialValues = snapshot.dynamic_field_values;
      } else if (snapshot.inputs && Object.keys(snapshot.inputs).length > 0) {
        initialValues = snapshot.inputs;
      }
    }
    
    // Flatten object values (e.g., {value: 123, unit: 'kg'} -> 123)
    const flattenedValues = {};
    Object.entries(initialValues).forEach(([key, val]) => {
      if (val && typeof val === 'object' && val.value !== undefined) {
        flattenedValues[key] = val.value;
      } else {
        flattenedValues[key] = val;
      }
    });
    
    setEditValues(flattenedValues);
  };

  const patchInline = (patch) => setInlineEdit((cur) => cur && { ...cur, ...patch });

  const addInlineFiles = (files) => {
    const added = [];
    Array.from(files || []).forEach((file) => {
      if (file.size > 5 * 1024 * 1024) toast.error(`${file.name} exceeds 5MB limit`);
      else added.push(createDraftEvidence(file));
    });
    if (added.length) setInlineEdit((cur) => cur && { ...cur, evidence: [...cur.evidence, ...added] });
  };

  const cancelInline = () => {
    revokeDraftEvidences(inlineEdit?.evidence);
    setInlineEdit(null);
  };

  const handleSaveInline = async () => {
    setProcessing(true);
    try {
      const headers = getAuthHeader();
      const uploadResult = await uploadDraftEvidences({
        items: draftEvidence(inlineEdit.evidence),
        uploadUrl: `${API}/api/upload/evidence?bucket_type=esg_metrics&folder=${section}`,
        headers,
        mapUploaded: (uploaded, draft) => ({
          id: uploaded.file_id,
          file_id: uploaded.file_id,
          filename: draft.filename,
          file_type: draft.file_type,
          file_size: draft.file_size,
          upload_url: uploaded.url,
          uploaded_at: new Date().toISOString(),
          uploaded_by: user?.id || '',
        }),
      });
      if (uploadResult.failed.length) toast.error(`${uploadResult.failed.length} evidence file(s) could not be uploaded`);
      await axios.put(`${API}/api/proposals/${inlineEdit.id}`, {
        field_values: inlineEdit.values,
        source_of_information: inlineEdit.source,
        notes: inlineEdit.notes,
        evidence_files: [...persistedEvidence(inlineEdit.evidence).map(toEvidencePayload), ...uploadResult.uploaded],
      }, { headers });
      toast.success('Proposal updated');
      revokeDraftEvidences(inlineEdit.evidence);
      setInlineEdit(null);
      fetchProposals();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update proposal');
    } finally {
      setProcessing(false);
    }
  };

  // Save edited proposal
  const handleSaveEdit = async () => {
    if (!editingProposal) return;
    setProcessing(true);
    try {
      await axios.put(
        `${API}/api/proposals/${editingProposal.id}`,
        { field_values: editValues },
        { headers: getAuthHeader() }
      );
      toast.success('Proposal updated');
      setEditingProposal(null);
      fetchProposals();
    } catch (err) {
      console.error('Failed to update proposal:', err);
      toast.error(err.response?.data?.detail || 'Failed to update proposal');
    } finally {
      setProcessing(false);
    }
  };

  // A first submission is itself the pending record, so there is nothing approved to compare against yet
  const hasApprovedValues = !!approvedRecord && !(entityType === 'esg_record'
    && ['pending_approval', 'rejected', 'draft'].includes(approvedRecord.approval_status));
  const useFormLayout = entityType === 'esg_record' && hasCategoryForm(fieldConfig?.subcategory, fieldConfig?.fields);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (proposals.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 className="w-12 h-12 text-green-300 mx-auto mb-3" />
        <p className="text-stone-600">No pending proposals for this record.</p>
        <Button variant="outline" className="mt-4" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-stone-500">
            {proposals.length} pending proposal{proposals.length !== 1 ? 's' : ''} for this record
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchProposals} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Alert for multiple proposals */}
      {proposals.length > 1 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-amber-800">Multiple Proposals</p>
            <p className="text-sm text-amber-700">
              When you approve one proposal, all other pending proposals will be automatically 
              rejected with the reason: &quot;Another proposal was approved.&quot;
            </p>
          </div>
        </div>
      )}

      {/* Current Approved Record Card */}
      {hasApprovedValues && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Current Approved Values
            </CardTitle>
            {approvedRecord.reporting_period && (
              <div className="flex items-center gap-2 text-sm text-stone-600 mt-1">
                <Calendar className="w-4 h-4" />
                {formatReportingPeriod(approvedRecord.reporting_period)}
              </div>
            )}
            {/* Show emission-specific summary for approved record */}
            {entityType === 'emission_record' && (
              <div className="flex flex-wrap gap-3 mt-2 text-sm">
                {approvedRecord.scope && (
                  <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded capitalize">
                    {approvedRecord.scope}
                  </span>
                )}
                {approvedRecord.category && (
                  <span className="text-stone-600">{approvedRecord.category}</span>
                )}
                {approvedRecord.co2e_emissions !== undefined && (
                  <span className="font-medium text-green-700">
                    {Number(approvedRecord.co2e_emissions).toFixed(2)} tCO₂e
                  </span>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {(() => {
              // For emission records, use dynamic_field_values or inputs
              const displayValues = entityType === 'emission_record'
                ? (approvedRecord.dynamic_field_values || approvedRecord.inputs || approvedRecord.field_values || {})
                : (approvedRecord.field_values || {});
              
              // Format value for display
              const formatVal = (val) => {
                if (val === null || val === undefined) return '-';
                if (typeof val === 'object' && val.value !== undefined) {
                  return `${val.value}${val.unit ? ` ${val.unit}` : ''}`;
                }
                return String(val);
              };
              
              return useFormLayout ? (
                <CategoryFieldsForm subcategory={fieldConfig.subcategory} fields={fieldConfig.fields} values={displayValues} onChange={() => {}} readOnly testIdPrefix="approved-field" />
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {getDisplayFieldEntries(displayValues).map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <p className="text-xs text-stone-500">{getFieldLabel(key)}</p>
                      <p className="font-medium text-stone-900">
                        {formatVal(value)}
                      </p>
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Proposal Cards */}
      <div className="space-y-4">
        {proposals.map((proposal, idx) => {
          const snapshot = proposal.entity_snapshot || {};
          // For ESG records: field_values
          // For emission records: dynamic_field_values, proposed_changes.inputs, or inputs
          let fieldValues = snapshot.field_values || {};
          let proposedInputs = null;
          
          // Handle emission_record type - extract proposed values from different locations
          if (entityType === 'emission_record') {
            // First check proposed_changes.inputs (for edit proposals)
            if (snapshot.proposed_changes?.inputs) {
              proposedInputs = snapshot.proposed_changes.inputs;
            }
            // Then check dynamic_field_values
            if (snapshot.dynamic_field_values && Object.keys(snapshot.dynamic_field_values).length > 0) {
              fieldValues = snapshot.dynamic_field_values;
            }
            // Fallback to inputs
            if (snapshot.inputs && Object.keys(snapshot.inputs).length > 0 && Object.keys(fieldValues).length === 0) {
              fieldValues = snapshot.inputs;
            }
            // If we have proposedInputs, merge them to show as the proposed values
            if (proposedInputs) {
              fieldValues = { ...fieldValues, ...proposedInputs };
            }
          }
          
          const reportingPeriod = snapshot.reporting_period;
          const fromRecord = (key) => (key in snapshot ? snapshot[key] : approvedRecord?.[key]);
          const attachmentValues = {
            source: fromRecord('source_of_information') || '',
            notes: fromRecord('notes') || '',
            evidence: fromRecord('evidence_files') || [],
          };
          
          // Get the comparison values for emission records
          const getApprovedFieldValue = (key) => {
            if (!hasApprovedValues) return undefined;
            if (entityType === 'emission_record') {
              return approvedRecord?.dynamic_field_values?.[key] 
                || approvedRecord?.inputs?.[key]
                || approvedRecord?.field_values?.[key];
            }
            return approvedRecord?.field_values?.[key];
          };
          
          // Format value for display (handles {value, unit} objects)
          const formatFieldValue = (val) => {
            if (val === null || val === undefined) return '-';
            if (typeof val === 'object' && val.value !== undefined) {
              return `${val.value}${val.unit ? ` ${val.unit}` : ''}`;
            }
            return String(val);
          };
          
          return (
            <Card key={proposal.id} className="border-blue-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="w-5 h-5 text-blue-600" />
                    Proposal by {proposal.submitted_by_name || `User ${idx + 1}`}
                  </CardTitle>
                  <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-stone-500 mt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {formatDateTime(proposal.submitted_at)}
                  </span>
                  {reportingPeriod && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {formatReportingPeriod(reportingPeriod)}
                    </span>
                  )}
                </div>
                {/* Show emission-specific summary info */}
                {entityType === 'emission_record' && (
                  <div className="flex flex-wrap gap-3 mt-2 text-sm">
                    {snapshot.scope && (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded capitalize">
                        {snapshot.scope}
                      </span>
                    )}
                    {snapshot.category && (
                      <span className="text-stone-600">{snapshot.category}</span>
                    )}
                    {snapshot.co2e_emissions !== undefined && (
                      <span className="font-medium text-primary">
                        {Number(snapshot.co2e_emissions).toFixed(2)} tCO₂e
                      </span>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Field Values */}
                {useFormLayout ? (
                  <div className="p-4 bg-stone-50 rounded-lg">
                    <CategoryFieldsForm
                      subcategory={fieldConfig.subcategory}
                      fields={fieldConfig.fields}
                      values={inlineEdit?.id === proposal.id ? inlineEdit.values : fieldValues}
                      onChange={inlineEdit?.id === proposal.id ? setInlineValues : () => {}}
                      readOnly={inlineEdit?.id !== proposal.id}
                      testIdPrefix={`proposal-field-${proposal.id}`}
                    />
                  </div>
                ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-stone-50 rounded-lg">
                  {getDisplayFieldEntries(fieldValues).map(([key, value]) => {
                    const approvedValue = getApprovedFieldValue(key);
                    const formattedValue = formatFieldValue(value);
                    const formattedApproved = formatFieldValue(approvedValue);
                    const isChanged = formattedValue !== formattedApproved;
                    
                    return (
                      <div key={key} className="space-y-1">
                        <p className="text-xs text-stone-500">{getFieldLabel(key)}</p>
                        <p className={`font-medium ${isChanged ? 'text-blue-700' : 'text-stone-900'}`}>
                          {formattedValue}
                          {isChanged && approvedValue !== undefined && (
                            <span className="text-xs text-stone-400 ml-2">
                              (was: {formattedApproved})
                            </span>
                          )}
                        </p>
                      </div>
                    );
                  })}
                </div>
                )}

                <ProposalAttachments
                  editing={inlineEdit?.id === proposal.id}
                  source={inlineEdit?.id === proposal.id ? inlineEdit.source : attachmentValues.source}
                  notes={inlineEdit?.id === proposal.id ? inlineEdit.notes : attachmentValues.notes}
                  evidence={inlineEdit?.id === proposal.id ? inlineEdit.evidence : attachmentValues.evidence}
                  onChange={patchInline}
                  onFiles={addInlineFiles}
                />

                {/* Action Buttons */}
                <div className="flex items-center gap-3 pt-2 border-t">
                  {inlineEdit?.id === proposal.id ? (
                    <>
                      <Button variant="outline" size="sm" onClick={cancelInline} disabled={processing} data-testid={`cancel-edit-${proposal.id}`}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSaveInline} disabled={processing} data-testid={`save-edit-${proposal.id}`}>
                        {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Save changes
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => (useFormLayout ? setInlineEdit({ id: proposal.id, values: { ...fieldValues }, ...attachmentValues }) : openEditDialog(proposal))}
                      disabled={processing || !!inlineEdit}
                      data-testid={`edit-proposal-${proposal.id}`}
                    >
                      <Edit2 className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                  )}
                  <div className="flex-1" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => handleReject(proposal.id)}
                    disabled={processing || !!inlineEdit}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => handleApprove(proposal.id)}
                    disabled={processing || !!inlineEdit}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Comment input for actions */}
      <div className="space-y-2">
        <Label>Comment (required for rejection)</Label>
        <Textarea
          value={actionComment}
          onChange={(e) => setActionComment(e.target.value)}
          placeholder="Enter comment or rejection reason..."
          rows={2}
          data-testid="proposal-action-comment"
        />
      </div>

      {/* Edit Proposal Dialog */}
      <Dialog open={!!editingProposal} onOpenChange={() => setEditingProposal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Proposal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {editingProposal && (() => {
              // Get the field keys to edit based on entity type
              const snapshot = editingProposal.entity_snapshot || {};
              let editableFields = snapshot.field_values || {};
              
              if (entityType === 'emission_record') {
                // Check proposed_changes.inputs first
                if (snapshot.proposed_changes?.inputs && Object.keys(snapshot.proposed_changes.inputs).length > 0) {
                  editableFields = snapshot.proposed_changes.inputs;
                } else if (snapshot.dynamic_field_values && Object.keys(snapshot.dynamic_field_values).length > 0) {
                  editableFields = snapshot.dynamic_field_values;
                } else if (snapshot.inputs && Object.keys(snapshot.inputs).length > 0) {
                  editableFields = snapshot.inputs;
                }
              }
              
              return Object.entries(editableFields).map(([key, originalValue]) => {
                // Get unit if the original value has one
                const unit = (originalValue && typeof originalValue === 'object' && originalValue.unit) 
                  ? originalValue.unit 
                  : '';
                
                return (
                  <div key={key} className="space-y-2">
                    <Label>{getFieldLabel(key)}{unit ? ` (${unit})` : ''}</Label>
                    <Input
                      value={editValues[key] ?? ''}
                      onChange={(e) => setEditValues(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder={`Enter ${getFieldLabel(key).toLowerCase()}`}
                    />
                  </div>
                );
              });
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProposal(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={processing}>
              {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
