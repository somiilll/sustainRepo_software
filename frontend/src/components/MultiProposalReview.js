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
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 
                'July', 'August', 'September', 'October', 'November', 'December'];

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
  const { getAuthHeader } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [proposals, setProposals] = useState([]);
  const [approvedRecord, setApprovedRecord] = useState(null);
  const [fieldConfig, setFieldConfig] = useState(null);
  const [actionComment, setActionComment] = useState('');
  
  // Edit dialog state
  const [editingProposal, setEditingProposal] = useState(null);
  const [editValues, setEditValues] = useState({});

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
    setEditValues(proposal.entity_snapshot?.field_values || {});
  };

  // Save edited proposal
  const handleSaveEdit = async () => {
    if (!editingProposal) return;
    setProcessing(true);
    try {
      await axios.put(
        `${API}/api/proposals/${editingProposal.id}/edit`,
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
      {approvedRecord && (
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
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(approvedRecord.field_values || {}).map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <p className="text-xs text-stone-500">{getFieldLabel(key)}</p>
                  <p className="font-medium text-stone-900">
                    {value === null || value === undefined ? '-' : String(value)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comment input for actions */}
      <div className="space-y-2">
        <Label>Comment (required for rejection)</Label>
        <Textarea
          value={actionComment}
          onChange={(e) => setActionComment(e.target.value)}
          placeholder="Enter comment or rejection reason..."
          rows={2}
        />
      </div>

      {/* Proposal Cards */}
      <div className="space-y-4">
        {proposals.map((proposal, idx) => {
          const snapshot = proposal.entity_snapshot || {};
          const fieldValues = snapshot.field_values || {};
          const reportingPeriod = snapshot.reporting_period;
          
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
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Field Values */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-stone-50 rounded-lg">
                  {Object.entries(fieldValues).map(([key, value]) => {
                    const approvedValue = approvedRecord?.field_values?.[key];
                    const isChanged = JSON.stringify(value) !== JSON.stringify(approvedValue);
                    
                    return (
                      <div key={key} className="space-y-1">
                        <p className="text-xs text-stone-500">{getFieldLabel(key)}</p>
                        <p className={`font-medium ${isChanged ? 'text-blue-700' : 'text-stone-900'}`}>
                          {value === null || value === undefined ? '-' : String(value)}
                          {isChanged && approvedValue !== undefined && (
                            <span className="text-xs text-stone-400 ml-2">
                              (was: {String(approvedValue)})
                            </span>
                          )}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(proposal)}
                    disabled={processing}
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => handleReject(proposal.id)}
                    disabled={processing}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => handleApprove(proposal.id)}
                    disabled={processing}
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

      {/* Edit Proposal Dialog */}
      <Dialog open={!!editingProposal} onOpenChange={() => setEditingProposal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Proposal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {editingProposal && Object.entries(editingProposal.entity_snapshot?.field_values || {}).map(([key, _]) => (
              <div key={key} className="space-y-2">
                <Label>{getFieldLabel(key)}</Label>
                <Input
                  value={editValues[key] || ''}
                  onChange={(e) => setEditValues(prev => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
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
