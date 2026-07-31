import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useOrganization } from '../contexts/OrganizationContext';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from './ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { 
  User, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Edit2,
  AlertCircle,
  FileText,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * MultiProposalReview - Component for reviewing multiple proposals for the same record
 * 
 * Shows:
 * - Current approved value
 * - All pending proposals in a comparison table
 * - Ability to edit a proposal before approving
 * - Approve/Reject actions for each proposal
 * 
 * When one proposal is approved, all others are auto-rejected
 */
export default function MultiProposalReview({ 
  recordId, 
  entityType = 'esg_record',
  section,
  onClose,
  onActionComplete,
}) {
  const { getAuthHeader } = useAuth();
  const { timezone } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState([]);
  const [approvedRecord, setApprovedRecord] = useState(null);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editedFields, setEditedFields] = useState({});
  const [actionComment, setActionComment] = useState('');
  const [processing, setProcessing] = useState(false);

  const formatDateTime = (dateStr) => formatDateTimeUtil(dateStr, timezone);

  // Fetch proposals for this record
  const fetchProposals = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(
        `${API}/api/proposals/record/${entityType}/${recordId}`,
        { headers: getAuthHeader() }
      );
      setProposals(res.data.proposals || []);
      
      // Also fetch the approved record
      if (section) {
        const recordRes = await axios.get(
          `${API}/api/esg-records/records/${section}/${recordId}`,
          { headers: getAuthHeader() }
        );
        setApprovedRecord(recordRes.data);
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

  // Handle approver editing a proposal
  const handleEditProposal = async () => {
    if (!selectedProposal) return;
    
    try {
      setProcessing(true);
      await axios.put(
        `${API}/api/proposals/${selectedProposal.id}`,
        { field_values: editedFields },
        { headers: getAuthHeader() }
      );
      toast.success('Proposal updated');
      setEditMode(false);
      fetchProposals();
    } catch (err) {
      toast.error('Failed to update proposal');
    } finally {
      setProcessing(false);
    }
  };

  // Handle approve
  const handleApprove = async (proposalId) => {
    try {
      setProcessing(true);
      await axios.post(
        `${API}/api/proposals/${proposalId}/approve`,
        { comment: actionComment || 'Approved' },
        { headers: getAuthHeader() }
      );
      toast.success('Proposal approved. Other pending proposals were auto-rejected.');
      setActionComment('');
      onActionComplete?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to approve');
    } finally {
      setProcessing(false);
    }
  };

  // Handle reject
  const handleReject = async (proposalId) => {
    if (!actionComment.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    
    try {
      setProcessing(true);
      await axios.post(
        `${API}/api/proposals/${proposalId}/reject`,
        { reason: actionComment },
        { headers: getAuthHeader() }
      );
      toast.success('Proposal rejected');
      setActionComment('');
      fetchProposals();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to reject');
    } finally {
      setProcessing(false);
    }
  };

  // Open edit dialog for a proposal
  const openEditDialog = (proposal) => {
    setSelectedProposal(proposal);
    setEditedFields(proposal.entity_snapshot?.field_values || {});
    setEditMode(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2">Loading proposals...</span>
      </div>
    );
  }

  if (proposals.length === 0) {
    return (
      <Card className="p-8 text-center">
        <AlertCircle className="w-12 h-12 mx-auto text-stone-300 mb-4" />
        <h3 className="text-lg font-medium text-stone-700">No Pending Proposals</h3>
        <p className="text-stone-500 mt-2">
          There are no pending proposals for this record.
        </p>
      </Card>
    );
  }

  // If only one proposal, show simpler view
  if (proposals.length === 1) {
    const proposal = proposals[0];
    const snapshot = proposal.entity_snapshot || {};
    
    return (
      <div className="space-y-6">
        {/* Single proposal view */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Pending Proposal
              </CardTitle>
              <Badge className="bg-yellow-100 text-yellow-800">Pending Approval</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm text-stone-600">
                <span className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  {proposal.submitted_by_name || 'Unknown'}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {formatDateTime(proposal.submitted_at)}
                </span>
              </div>
              
              {/* Field values */}
              <div className="border rounded-lg p-4 bg-stone-50">
                <h4 className="font-medium mb-3">Proposed Values</h4>
                <div className="space-y-2">
                  {Object.entries(snapshot.field_values || {}).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-stone-600">{key}</span>
                      <span className="font-medium">{JSON.stringify(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Approver modified indicator */}
              {proposal.approver_modified && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                  <span className="font-medium text-blue-800">Edited by Approver</span>
                  <p className="text-blue-600 mt-1">
                    Modified by {proposal.approver_modifications?.modified_by_name}
                  </p>
                </div>
              )}
              
              {/* Comment input */}
              <div className="space-y-2">
                <Label>Comment (required for rejection)</Label>
                <Textarea
                  value={actionComment}
                  onChange={(e) => setActionComment(e.target.value)}
                  placeholder="Enter comment..."
                  rows={2}
                />
              </div>
              
              {/* Actions */}
              <div className="flex items-center gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => openEditDialog(proposal)}
                  disabled={processing}
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit Before Approval
                </Button>
                <div className="flex-1" />
                <Button
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => handleReject(proposal.id)}
                  disabled={processing}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => handleApprove(proposal.id)}
                  disabled={processing}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Approve
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Multiple proposals - show comparison view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-stone-900">
            {proposals.length} Pending Proposals
          </h3>
          <p className="text-sm text-stone-500">
            Compare and approve one proposal. Others will be auto-rejected.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchProposals}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Alert about auto-rejection */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-amber-800">Multiple Proposals</h4>
            <p className="text-sm text-amber-700 mt-1">
              When you approve one proposal, all other pending proposals for this record 
              will be automatically rejected with the reason: &quot;Another proposal was approved.&quot;
            </p>
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle>Comparison View</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">Field</TableHead>
                  <TableHead className="bg-green-50">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      Approved
                    </div>
                  </TableHead>
                  {proposals.map((p, idx) => (
                    <TableHead key={p.id} className="bg-blue-50">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-blue-600" />
                          {p.submitted_by_name || `User ${idx + 1}`}
                        </div>
                        <div className="text-xs text-stone-500">
                          {formatDateTime(p.submitted_at)}
                        </div>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Get all unique field keys */}
                {(() => {
                  const allKeys = new Set();
                  if (approvedRecord?.field_values) {
                    Object.keys(approvedRecord.field_values).forEach(k => allKeys.add(k));
                  }
                  proposals.forEach(p => {
                    const fv = p.entity_snapshot?.field_values || {};
                    Object.keys(fv).forEach(k => allKeys.add(k));
                  });
                  
                  return Array.from(allKeys).map(key => (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{key}</TableCell>
                      <TableCell className="bg-green-50/50">
                        {approvedRecord?.field_values?.[key] !== undefined 
                          ? JSON.stringify(approvedRecord.field_values[key])
                          : '-'}
                      </TableCell>
                      {proposals.map(p => {
                        const value = p.entity_snapshot?.field_values?.[key];
                        const approvedValue = approvedRecord?.field_values?.[key];
                        const isChanged = JSON.stringify(value) !== JSON.stringify(approvedValue);
                        
                        return (
                          <TableCell 
                            key={p.id} 
                            className={`bg-blue-50/50 ${isChanged ? 'font-semibold text-blue-700' : ''}`}
                          >
                            {value !== undefined ? JSON.stringify(value) : '-'}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ));
                })()}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Individual proposal cards with actions */}
      <div className="grid gap-4">
        {proposals.map((proposal, idx) => (
          <Card key={proposal.id} className="border-l-4 border-l-blue-500">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <Badge className="bg-blue-100 text-blue-800">
                      Proposal {idx + 1}
                    </Badge>
                    {proposal.approver_modified && (
                      <Badge className="bg-purple-100 text-purple-800">
                        Edited by Approver
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-stone-600">
                    <span className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      {proposal.submitted_by_name || 'Unknown'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {formatDateTime(proposal.submitted_at)}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(proposal)}
                    disabled={processing}
                  >
                    <Edit2 className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-200"
                    onClick={() => {
                      setSelectedProposal(proposal);
                      setActionComment('');
                    }}
                    disabled={processing}
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => handleApprove(proposal.id)}
                    disabled={processing}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Approve
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editMode} onOpenChange={setEditMode}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Proposal Before Approval</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedProposal && Object.entries(editedFields).map(([key, value]) => (
              <div key={key} className="space-y-2">
                <Label>{key}</Label>
                <Input
                  value={typeof value === 'object' ? JSON.stringify(value) : value}
                  onChange={(e) => setEditedFields({
                    ...editedFields,
                    [key]: e.target.value,
                  })}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMode(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditProposal} disabled={processing}>
              {processing ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog 
        open={selectedProposal && !editMode} 
        onOpenChange={() => setSelectedProposal(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Proposal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-stone-600">
              Please provide a reason for rejecting this proposal.
            </p>
            <Textarea
              value={actionComment}
              onChange={(e) => setActionComment(e.target.value)}
              placeholder="Enter rejection reason..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedProposal(null)}>
              Cancel
            </Button>
            <Button 
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                handleReject(selectedProposal.id);
                setSelectedProposal(null);
              }}
              disabled={processing || !actionComment.trim()}
            >
              Reject Proposal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
