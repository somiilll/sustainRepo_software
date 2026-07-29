import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from './ui/dialog';
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  User, 
  Clock,
  Edit2,
  AlertCircle,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * SubmissionReviewPanel - Clean approver UI for GRI submissions
 * 
 * Features:
 * - Shows full question text at top
 * - Shows submitter info (who and when)
 * - Shows response once with edit capability
 * - Approve / Edit & Approve / Reject actions
 */
export default function SubmissionReviewPanel({ 
  questionKey, 
  reportingPeriod,
  onClose,
  onApproved 
}) {
  const { getAuthHeader } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState(null);
  const [questionConfig, setQuestionConfig] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedValue, setEditedValue] = useState('');
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Fetch submission and question config
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch submissions for this question
        const submissionsRes = await axios.get(
          `${API}/api/esg-questionnaire/submissions/${questionKey}`,
          {
            headers: getAuthHeader(),
            params: { reporting_period: reportingPeriod }
          }
        );
        
        const submissions = submissionsRes.data.submissions || [];
        if (submissions.length > 0) {
          // Use the latest submission
          const latestSubmission = submissions[0];
          setSubmission(latestSubmission);
          // Handle both string and object values
          const val = latestSubmission.value;
          setEditedValue(typeof val === 'object' ? val : (val || ''));
        }
        
        // Try to fetch question config for display
        try {
          const configRes = await axios.get(
            `${API}/api/esg-questionnaire/config/${questionKey}`,
            { headers: getAuthHeader() }
          );
          setQuestionConfig(configRes.data);
        } catch (configErr) {
          console.warn('Could not fetch question config:', configErr);
        }
        
      } catch (error) {
        console.error('Failed to fetch submission:', error);
        toast.error('Failed to load submission');
      } finally {
        setLoading(false);
      }
    };

    if (questionKey && reportingPeriod) {
      fetchData();
    }
  }, [questionKey, reportingPeriod, getAuthHeader]);

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Format value for display - handles objects, arrays, and primitives
  const formatValueForDisplay = (val) => {
    if (val === null || val === undefined) return <span className="italic text-stone-400">No response provided</span>;
    if (typeof val === 'string') return val || <span className="italic text-stone-400">No response provided</span>;
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'number') return String(val);
    
    // Handle arrays
    if (Array.isArray(val)) {
      if (val.length === 0) return <span className="italic text-stone-400">No data</span>;
      const firstItem = val[0];
      if (typeof firstItem === 'object' && firstItem !== null) {
        const columns = Object.keys(firstItem);
        return (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="bg-stone-100">
                  {columns.map(col => (
                    <th key={col} className="border border-stone-200 px-3 py-2 text-left font-medium text-stone-700">
                      {col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {val.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-stone-50'}>
                    {columns.map(col => (
                      <td key={col} className="border border-stone-200 px-3 py-2">
                        {typeof row[col] === 'object' ? JSON.stringify(row[col]) : (row[col] ?? '-')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      return val.join(', ');
    }
    
    // Handle objects
    if (typeof val === 'object') {
      const keys = Object.keys(val);
      if (keys.length === 0) return <span className="italic text-stone-400">No data</span>;
      
      // Check if values are nested objects (like FY comparison: {category: {current_fy, previous_fy}})
      const hasNestedObjects = keys.some(k => typeof val[k] === 'object' && val[k] !== null && !Array.isArray(val[k]));
      
      if (hasNestedObjects) {
        const innerKeys = new Set();
        keys.forEach(k => {
          if (typeof val[k] === 'object' && val[k] !== null) {
            Object.keys(val[k]).forEach(ik => innerKeys.add(ik));
          }
        });
        const innerKeysArr = Array.from(innerKeys);
        
        return (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="bg-stone-100">
                  <th className="border border-stone-200 px-3 py-2 text-left font-medium text-stone-700">Category</th>
                  {innerKeysArr.map(ik => (
                    <th key={ik} className="border border-stone-200 px-3 py-2 text-left font-medium text-stone-700">
                      {ik.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.map((k, idx) => (
                  <tr key={k} className={idx % 2 === 0 ? 'bg-white' : 'bg-stone-50'}>
                    <td className="border border-stone-200 px-3 py-2 font-medium text-stone-700">
                      {k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </td>
                    {innerKeysArr.map(ik => (
                      <td key={ik} className="border border-stone-200 px-3 py-2">
                        {typeof val[k] === 'object' && val[k] !== null ? (val[k][ik] ?? '-') : '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      
      // Simple key-value object (like {mode, all_description, all_enabled})
      return (
        <div className="space-y-2">
          {keys.map(k => (
            <div key={k} className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-stone-500">
                {k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </span>
              <span className="text-stone-800">
                {typeof val[k] === 'boolean' ? (val[k] ? 'Yes' : 'No') : (val[k] ?? '-')}
              </span>
            </div>
          ))}
        </div>
      );
    }
    
    return String(val);
  };

  // Get the question display text
  const getQuestionText = () => {
    if (questionConfig) {
      return questionConfig.description || questionConfig.label || questionConfig.question || questionKey;
    }
    return questionKey;
  };

  // Check if response was edited (handles both strings and objects)
  const hasEdits = submission && (() => {
    const originalValue = submission.value;
    if (typeof editedValue === 'object' && typeof originalValue === 'object') {
      return JSON.stringify(editedValue) !== JSON.stringify(originalValue);
    }
    return editedValue !== (originalValue || '');
  })();

  // Approve submission
  const handleApprove = async () => {
    if (!submission) return;
    
    setApproving(true);
    try {
      const payload = {
        submission_id: submission.id,
      };
      
      // If value was edited, include the edited value
      if (hasEdits) {
        payload.merged_value = editedValue;
      }

      await axios.post(
        `${API}/api/esg-questionnaire/submissions/approve`,
        payload,
        { headers: getAuthHeader() }
      );

      toast.success(hasEdits ? 'Response approved with edits' : 'Response approved');
      onApproved?.();
      onClose?.();
    } catch (error) {
      console.error('Failed to approve submission:', error);
      toast.error(error.response?.data?.detail || 'Failed to approve submission');
    } finally {
      setApproving(false);
    }
  };

  // Reject submission
  const handleReject = async () => {
    if (!submission) return;
    if (!rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    setRejecting(true);
    try {
      await axios.post(
        `${API}/api/esg-questionnaire/submissions/reject/${submission.id}`,
        { rejection_reason: rejectionReason },
        { headers: getAuthHeader() }
      );

      toast.success('Submission rejected');
      setShowRejectDialog(false);
      onApproved?.();
      onClose?.();
    } catch (error) {
      console.error('Failed to reject submission:', error);
      toast.error('Failed to reject submission');
    } finally {
      setRejecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-text-muted">Loading submission...</span>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="w-12 h-12 text-stone-300 mx-auto mb-3" />
        <p className="text-text-muted">No pending submission for this question</p>
        <Button variant="outline" onClick={onClose} className="mt-4">
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Question Text - Full formatted question */}
      <Card className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 border-purple-100">
        <div className="flex items-start gap-2 mb-2">
          <Badge variant="outline" className="shrink-0 bg-cyan-100 text-cyan-800">GRI</Badge>
        </div>
        <p className="text-stone-800 font-medium leading-relaxed">
          {getQuestionText()}
        </p>
      </Card>

      {/* Submitter Info - Compact single row */}
      <div className="flex items-center gap-6 text-sm px-1">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div>
            <span className="text-stone-500">Submitted by </span>
            <span className="font-medium text-stone-800">
              {submission.submitted_by_user_name || submission.submitted_by_user_email || 'Unknown'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-stone-500">
          <Clock className="w-3.5 h-3.5" />
          <span>{formatDate(submission.submitted_at)}</span>
        </div>
      </div>

      {/* Response - Single display with edit toggle */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium text-stone-700">Response</Label>
          <Button
            variant={isEditing ? "default" : "outline"}
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
            className="h-7 text-xs gap-1"
          >
            <Edit2 className="w-3 h-3" />
            {isEditing ? 'Editing' : 'Edit'}
          </Button>
        </div>
        
        {isEditing ? (
          <Textarea
            value={typeof editedValue === 'string' ? editedValue : JSON.stringify(editedValue, null, 2)}
            onChange={(e) => {
              try {
                setEditedValue(JSON.parse(e.target.value));
              } catch {
                setEditedValue(e.target.value);
              }
            }}
            className="min-h-[150px] font-mono text-sm"
            placeholder="Enter response..."
          />
        ) : (
          <Card className="p-4 bg-white border-stone-200">
            <div className="text-stone-700 text-sm leading-relaxed">
              {formatValueForDisplay(submission.value)}
            </div>
          </Card>
        )}
        
        {hasEdits && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Response has been modified
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-4 border-t justify-end">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={approving || rejecting}
        >
          Cancel
        </Button>
        
        <Button
          variant="destructive"
          onClick={() => setShowRejectDialog(true)}
          disabled={approving || rejecting}
          className="gap-1.5"
        >
          <XCircle className="w-4 h-4" />
          Reject
        </Button>
        
        <Button
          onClick={handleApprove}
          disabled={approving || rejecting}
          className="gap-1.5 bg-green-600 hover:bg-green-700"
        >
          {approving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          {hasEdits ? 'Approve with Edits' : 'Approve'}
        </Button>
      </div>

      {/* Rejection Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Reject Submission
            </DialogTitle>
            <DialogDescription>
              The assignee will be notified and can resubmit after addressing your feedback.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-red-600">Rejection Reason *</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this submission is being rejected..."
                className="min-h-[120px]"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRejectDialog(false)}
              disabled={rejecting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejecting || !rejectionReason.trim()}
              className="gap-2"
            >
              {rejecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
