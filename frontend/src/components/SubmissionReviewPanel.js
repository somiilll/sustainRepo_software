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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  User, 
  Clock,
  GitMerge,
  Copy,
  Check,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * SubmissionReviewPanel - Approver UI for reviewing multiple submissions
 * 
 * Features:
 * - Side-by-side comparison of submissions
 * - Select one submission to approve
 * - Merge/edit submissions before approving
 * - Reject individual submissions with reason
 */
export default function SubmissionReviewPanel({ 
  questionKey, 
  reportingPeriod,
  onClose,
  onApproved 
}) {
  const { getAuthHeader } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState([]);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [mergedValue, setMergedValue] = useState('');
  const [isMergeMode, setIsMergeMode] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Fetch submissions for this question
  useEffect(() => {
    const fetchSubmissions = async () => {
      try {
        setLoading(true);
        const res = await axios.get(
          `${API}/api/esg-questionnaire/submissions/${questionKey}`,
          {
            headers: getAuthHeader(),
            params: { reporting_period: reportingPeriod }
          }
        );
        setSubmissions(res.data.submissions || []);
        
        // Auto-select if only one submission
        if (res.data.submissions?.length === 1) {
          setSelectedSubmission(res.data.submissions[0]);
          setMergedValue(res.data.submissions[0].value || '');
        }
      } catch (error) {
        console.error('Failed to fetch submissions:', error);
        toast.error('Failed to load submissions');
      } finally {
        setLoading(false);
      }
    };

    if (questionKey && reportingPeriod) {
      fetchSubmissions();
    }
  }, [questionKey, reportingPeriod, getAuthHeader]);

  // Handle selecting a submission
  const handleSelectSubmission = (submission) => {
    setSelectedSubmission(submission);
    if (!isMergeMode) {
      setMergedValue(submission.value || '');
    }
  };

  // Copy submission value to merge editor
  const copyToMerge = (value) => {
    if (isMergeMode) {
      setMergedValue(prev => prev ? `${prev}\n\n---\n\n${value}` : value);
      toast.success('Added to merge editor');
    } else {
      setMergedValue(value);
      toast.success('Copied to editor');
    }
  };

  // Approve selected submission
  const handleApprove = async () => {
    if (!selectedSubmission && !isMergeMode) {
      toast.error('Please select a submission to approve');
      return;
    }

    setApproving(true);
    try {
      const payload = {
        submission_id: selectedSubmission?.id,
      };
      
      // If merge mode or value was edited, include merged_value
      if (isMergeMode || mergedValue !== selectedSubmission?.value) {
        payload.merged_value = mergedValue;
      }

      await axios.post(
        `${API}/api/esg-questionnaire/submissions/approve`,
        payload,
        { headers: getAuthHeader() }
      );

      toast.success('Submission approved successfully');
      onApproved?.();
      onClose?.();
    } catch (error) {
      console.error('Failed to approve submission:', error);
      toast.error(error.response?.data?.detail || 'Failed to approve submission');
    } finally {
      setApproving(false);
    }
  };

  // Reject a submission
  const handleReject = async (submissionId) => {
    setRejecting(submissionId);
    try {
      await axios.post(
        `${API}/api/esg-questionnaire/submissions/reject/${submissionId}`,
        { rejection_reason: rejectionReason },
        { headers: getAuthHeader() }
      );

      toast.success('Submission rejected');
      setRejectionReason('');
      
      // Refresh submissions
      const res = await axios.get(
        `${API}/api/esg-questionnaire/submissions/${questionKey}`,
        {
          headers: getAuthHeader(),
          params: { reporting_period: reportingPeriod }
        }
      );
      setSubmissions(res.data.submissions || []);
      
      // Clear selection if rejected submission was selected
      if (selectedSubmission?.id === submissionId) {
        setSelectedSubmission(null);
        setMergedValue('');
      }
    } catch (error) {
      console.error('Failed to reject submission:', error);
      toast.error('Failed to reject submission');
    } finally {
      setRejecting(null);
    }
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-text-muted">Loading submissions...</span>
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="w-12 h-12 text-stone-300 mx-auto mb-3" />
        <p className="text-text-muted">No pending submissions for this question</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with mode toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">
            Review Submissions
          </h3>
          <p className="text-sm text-text-muted">
            {submissions.length} submission(s) pending approval
          </p>
        </div>
        <Button
          variant={isMergeMode ? "default" : "outline"}
          size="sm"
          onClick={() => setIsMergeMode(!isMergeMode)}
          className="gap-2"
        >
          <GitMerge className="w-4 h-4" />
          {isMergeMode ? 'Merge Mode ON' : 'Enable Merge'}
        </Button>
      </div>

      {/* Submissions comparison grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto">
        {submissions.map((submission) => (
          <Card 
            key={submission.id}
            className={`p-4 cursor-pointer transition-all ${
              selectedSubmission?.id === submission.id 
                ? 'ring-2 ring-blue-500 bg-blue-50' 
                : 'hover:bg-stone-50'
            }`}
            onClick={() => handleSelectSubmission(submission)}
            data-testid={`submission-card-${submission.id}`}
          >
            {/* Submission header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <User className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {submission.submitted_by_user_name}
                  </p>
                  <p className="text-xs text-text-muted">
                    {submission.submitted_by_user_email}
                  </p>
                </div>
              </div>
              {selectedSubmission?.id === submission.id && (
                <Badge className="bg-blue-100 text-blue-800">
                  <Check className="w-3 h-3 mr-1" /> Selected
                </Badge>
              )}
            </div>

            {/* Timestamp */}
            <div className="flex items-center gap-1 text-xs text-text-muted mb-3">
              <Clock className="w-3 h-3" />
              {formatDate(submission.submitted_at)}
            </div>

            {/* Submission content */}
            <div className="bg-white border border-stone-200 rounded-lg p-3 mb-3 max-h-[150px] overflow-y-auto">
              <p className="text-sm text-text-primary whitespace-pre-wrap">
                {submission.value || <span className="italic text-text-muted">Empty response</span>}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  copyToMerge(submission.value);
                }}
                className="text-xs"
                data-testid={`copy-submission-${submission.id}`}
              >
                <Copy className="w-3 h-3 mr-1" />
                {isMergeMode ? 'Add to Merge' : 'Copy'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  setRejecting(submission.id);
                }}
                className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                data-testid={`reject-submission-${submission.id}`}
              >
                <XCircle className="w-3 h-3 mr-1" />
                Reject
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Merge/Edit area */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          {isMergeMode ? 'Merged Response (Edit as needed)' : 'Final Response'}
        </Label>
        <Textarea
          value={mergedValue}
          onChange={(e) => setMergedValue(e.target.value)}
          placeholder={isMergeMode 
            ? "Click 'Add to Merge' on submissions to combine them here..." 
            : "Select a submission or type your own response..."
          }
          rows={6}
          className="bg-white"
          data-testid="merged-value-textarea"
        />
        <p className="text-xs text-text-muted">
          {isMergeMode 
            ? "You can combine multiple submissions and edit the final text before approving."
            : "This value will be saved as the approved response."
          }
        </p>
      </div>

      {/* Approval actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button
          variant="outline"
          onClick={onClose}
          data-testid="cancel-review-btn"
        >
          Cancel
        </Button>
        <Button
          onClick={handleApprove}
          disabled={approving || (!mergedValue.trim() && !selectedSubmission)}
          className="bg-green-600 hover:bg-green-700"
          data-testid="approve-submission-btn"
        >
          {approving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <CheckCircle2 className="w-4 h-4 mr-2" />
          )}
          Approve & Save
        </Button>
      </div>

      {/* Rejection Dialog */}
      <Dialog open={rejecting !== null} onOpenChange={() => setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Submission</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this submission. The user will be notified and can revise their response.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Rejection Reason (optional)</Label>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Explain why this submission is being rejected..."
              rows={3}
              className="mt-2"
              data-testid="rejection-reason-textarea"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleReject(rejecting)}
              data-testid="confirm-reject-btn"
            >
              Reject Submission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
