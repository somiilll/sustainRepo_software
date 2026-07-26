/**
 * QuestionnaireApprovalPanel - V2 Questionnaire Response Approval UI
 * 
 * Features:
 * - Displays the question and submitted response
 * - Allows approver to view/edit response before approving
 * - Approve with optional comment
 * - Reject with required reason
 * - Uses same renderers as ESGQuestionnaire for consistent display
 */
import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
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
  const [editedResponse, setEditedResponse] = useState(item.response_data);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [approvalComment, setApprovalComment] = useState('');

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

  // Approve the response
  const handleApprove = async () => {
    setApproving(true);
    try {
      const payload = {
        comment: approvalComment || undefined,
      };
      
      // If response was edited, include the updated response
      if (isEditing && JSON.stringify(editedResponse) !== JSON.stringify(item.response_data)) {
        payload.updated_response = editedResponse;
      }

      await axios.post(
        `${API}/api/approval-workflows/questionnaire/${item._response_id}/approve`,
        payload,
        { headers: getAuthHeader() }
      );

      toast.success('Response approved successfully');
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

  // Render the response data based on question type
  const renderResponseValue = (value) => {
    if (value === null || value === undefined) {
      return <span className="text-stone-400 italic">No response</span>;
    }
    
    if (typeof value === 'object') {
      // For complex objects, render as formatted JSON or structured view
      return (
        <pre className="bg-stone-50 p-4 rounded-lg text-sm overflow-auto max-h-[400px] whitespace-pre-wrap">
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    }
    
    return <p className="text-stone-700 whitespace-pre-wrap">{String(value)}</p>;
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-600" />
            Review Questionnaire Response
          </DialogTitle>
          <DialogDescription>
            Review and approve or reject this submission
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Question Info */}
          <Card className="p-4 bg-stone-50">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{item.framework?.toUpperCase() || 'BRSR'}</Badge>
                <Badge variant="outline" className="bg-blue-50">{item.section_id?.replace('_', ' ').toUpperCase()}</Badge>
              </div>
              <h3 className="font-medium text-stone-900">{item.disclosure_name}</h3>
              <p className="text-sm text-stone-500 font-mono">{item.question_key}</p>
            </div>
          </Card>

          {/* Submission Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-stone-400" />
              <span className="text-stone-600">Submitted by:</span>
              <span className="font-medium">{item.submitted_by_name || item.submitted_by_email || 'Unknown'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-stone-400" />
              <span className="text-stone-600">Submitted:</span>
              <span className="font-medium">{formatDate(item.submitted_at)}</span>
            </div>
          </div>

          {/* Response Content */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Response</Label>
              <div className="flex items-center gap-2">
                <Switch
                  id="edit-mode"
                  checked={isEditing}
                  onCheckedChange={setIsEditing}
                />
                <Label htmlFor="edit-mode" className="text-sm cursor-pointer flex items-center gap-1">
                  <Edit2 className="w-3 h-3" />
                  Edit Mode
                </Label>
              </div>
            </div>
            
            {isEditing ? (
              <Textarea
                value={typeof editedResponse === 'object' ? JSON.stringify(editedResponse, null, 2) : editedResponse}
                onChange={(e) => {
                  try {
                    setEditedResponse(JSON.parse(e.target.value));
                  } catch {
                    setEditedResponse(e.target.value);
                  }
                }}
                className="min-h-[200px] font-mono text-sm"
                placeholder="Edit the response..."
              />
            ) : (
              <Card className="p-4">
                {renderResponseValue(item.response_data)}
              </Card>
            )}
          </div>

          {/* Approval Comment */}
          <div className="space-y-2">
            <Label>Approval Comment (optional)</Label>
            <Textarea
              value={approvalComment}
              onChange={(e) => setApprovalComment(e.target.value)}
              placeholder="Add any notes about this approval..."
              className="min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
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
            className="gap-2"
          >
            <XCircle className="w-4 h-4" />
            Reject
          </Button>
          
          <Button
            onClick={handleApprove}
            disabled={approving || rejecting}
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            {approving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Rejection Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Reject Response
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
