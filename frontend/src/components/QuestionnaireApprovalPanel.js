/**
 * QuestionnaireApprovalPanel - V2 Questionnaire Response Approval UI
 * 
 * Features:
 * - Displays the full question text
 * - Shows submitter info (who and when)
 * - Shows the response once with edit capability
 * - Approve / Edit & Approve / Reject actions
 */
import React, { useState } from 'react';
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

export default function QuestionnaireApprovalPanel({ 
  item, // The queue item from questionnaire/queue endpoint
  onClose,
  onApproved 
}) {
  const { getAuthHeader } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editedResponse, setEditedResponse] = useState(
    typeof item.response_data === 'string' ? item.response_data : JSON.stringify(item.response_data || '', null, 2)
  );
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

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

  // Get the original response value for comparison
  const getOriginalValue = () => {
    if (typeof item.response_data === 'string') return item.response_data;
    return JSON.stringify(item.response_data || '', null, 2);
  };

  // Check if response was edited
  const hasEdits = editedResponse !== getOriginalValue();

  // Approve the response
  const handleApprove = async () => {
    setApproving(true);
    try {
      const payload = {};
      
      // If response was edited, include the updated response
      if (hasEdits) {
        // Try to parse as JSON if it looks like JSON
        let finalValue = editedResponse;
        if (editedResponse.trim().startsWith('{') || editedResponse.trim().startsWith('[')) {
          try {
            finalValue = JSON.parse(editedResponse);
          } catch {
            // Keep as string if not valid JSON
          }
        }
        payload.updated_response = finalValue;
      }

      await axios.post(
        `${API}/api/approval-workflows/questionnaire/${item._response_id}/approve`,
        payload,
        { headers: getAuthHeader() }
      );

      toast.success(hasEdits ? 'Response approved with edits' : 'Response approved');
      onApproved?.();
      onClose?.();
    } catch (error) {
      console.error('Failed to approve response:', error);
      toast.error(error.response?.data?.detail || 'Failed to approve response');
    } finally {
      setApproving(false);
    }
  };

  // Reject the response
  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    setRejecting(true);
    try {
      await axios.post(
        `${API}/api/approval-workflows/questionnaire/${item._response_id}/reject`,
        { reason: rejectionReason },
        { headers: getAuthHeader() }
      );

      toast.success('Response rejected');
      setShowRejectDialog(false);
      onApproved?.();
      onClose?.();
    } catch (error) {
      console.error('Failed to reject response:', error);
      toast.error(error.response?.data?.detail || 'Failed to reject response');
    } finally {
      setRejecting(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-600" />
            Review Submission
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Question Text - Full formatted question */}
          <Card className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 border-purple-100">
            <div className="flex items-start gap-2 mb-2">
              <Badge variant="outline" className="shrink-0">{item.framework?.toUpperCase() || 'GRI'}</Badge>
            </div>
            <p className="text-stone-800 font-medium leading-relaxed">
              {item.disclosure_name || item.question_name || item.question_key}
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
                <span className="font-medium text-stone-800">{item.submitted_by_name || item.submitted_by_email || 'Unknown'}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-stone-500">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatDate(item.submitted_at)}</span>
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
                value={editedResponse}
                onChange={(e) => setEditedResponse(e.target.value)}
                className="min-h-[150px] font-mono text-sm"
                placeholder="Enter response..."
              />
            ) : (
              <Card className="p-4 bg-white border-stone-200">
                <p className="text-stone-700 whitespace-pre-wrap text-sm leading-relaxed">
                  {item.response_data || <span className="italic text-stone-400">No response provided</span>}
                </p>
              </Card>
            )}
            
            {hasEdits && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Response has been modified
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2 border-t pt-4">
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
        </DialogFooter>
      </DialogContent>

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
                placeholder="Explain why this response is being rejected..."
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
    </Dialog>
  );
}
