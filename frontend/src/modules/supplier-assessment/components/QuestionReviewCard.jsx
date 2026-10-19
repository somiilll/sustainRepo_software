import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '../../../components/ui/radio-group';

export const QuestionReviewCard = ({
  question,
  index,
  calculatedScore,
  onReviewSubmit,
  saving,
}) => {
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [needsResubmission, setNeedsResubmission] = useState(true);
  const [reviewerScore, setReviewerScore] = useState('0');
  const [reviewerNote, setReviewerNote] = useState('');

  const review = question.review || {};
  const currentStatus = review.status;
  const isClarification = currentStatus === 'rejected' && review.needs_resubmission;
  const isRejectedFinal = currentStatus === 'rejected' && !review.needs_resubmission;
  const isAccepted = currentStatus === 'accepted';

  const timestamps = question.timestamps || {};
  const submittedAt = timestamps.submitted_at ? new Date(timestamps.submitted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

  const handleAccept = () => {
    onReviewSubmit(question.id, {
      status: 'accepted',
      needs_resubmission: false,
    });
  };

  const handleConfirmReject = () => {
    if (needsResubmission) {
      if (!reviewerNote.trim()) {
        return;
      }
      onReviewSubmit(question.id, {
        status: 'rejected',
        needs_resubmission: true,
        reviewer_note: reviewerNote.trim(),
      });
    } else {
      const scoreVal = Number(reviewerScore);
      if (Number.isNaN(scoreVal) || scoreVal < 0) {
        return;
      }
      if (!reviewerNote.trim()) {
        return;
      }
      onReviewSubmit(question.id, {
        status: 'rejected',
        needs_resubmission: false,
        reviewer_score: scoreVal,
        reviewer_note: reviewerNote.trim(),
      });
    }
    setRejectDialogOpen(false);
  };

  const openRejectModal = () => {
    setNeedsResubmission(review.needs_resubmission ?? true);
    setReviewerScore(review.reviewer_score !== undefined && review.reviewer_score !== null ? String(review.reviewer_score) : '0');
    setReviewerNote(review.reviewer_note || '');
    setRejectDialogOpen(true);
  };

  return (
    <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50/60 p-3" data-testid={`question-review-panel-${question.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200/80 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">Review Status:</span>
          {isAccepted && (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800" data-testid={`question-review-status-badge-${question.id}`}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Accepted
            </span>
          )}
          {isClarification && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800" data-testid={`question-review-status-badge-${question.id}`}>
              <RotateCcw className="h-3.5 w-3.5" /> Clarification Requested (Unlocked)
            </span>
          )}
          {isRejectedFinal && (
            <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800" data-testid={`question-review-status-badge-${question.id}`}>
              <XCircle className="h-3.5 w-3.5" /> Rejected ({review.reviewer_score ?? 0} pts)
            </span>
          )}
          {!currentStatus && (
            <span className="inline-flex items-center gap-1 rounded bg-stone-200 px-2 py-0.5 text-xs font-semibold text-stone-700" data-testid={`question-review-status-badge-${question.id}`}>
              Pending Review
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {submittedAt && (
            <span className="text-[11px] text-stone-500" data-testid={`question-submitted-time-${question.id}`}>
              Submitted: {submittedAt}
            </span>
          )}
          <Button
            size="sm"
            variant={isAccepted ? "secondary" : "outline"}
            className="h-7 text-xs border-emerald-300 text-emerald-800 hover:bg-emerald-50"
            disabled={saving}
            onClick={handleAccept}
            data-testid={`question-accept-button-${question.id}`}
          >
            <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-emerald-600" />
            Accept
          </Button>
          <Button
            size="sm"
            variant={isClarification || isRejectedFinal ? "secondary" : "outline"}
            className="h-7 text-xs border-rose-300 text-rose-800 hover:bg-rose-50"
            disabled={saving}
            onClick={openRejectModal}
            data-testid={`question-reject-button-${question.id}`}
          >
            <XCircle className="mr-1 h-3.5 w-3.5 text-rose-600" />
            Reject
          </Button>
        </div>
      </div>

      {review.reviewer_note && (
        <div className="mt-2 rounded border border-stone-200 bg-white p-2 text-xs text-stone-700" data-testid={`question-reviewer-comment-display-${question.id}`}>
          <span className="font-semibold text-stone-900">Reviewer Note / Feedback: </span>
          {review.reviewer_note}
        </div>
      )}

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-md" data-testid={`reject-question-dialog-${question.id}`}>
          <DialogHeader>
            <DialogTitle data-testid="reject-question-dialog-title">Reject Question Response</DialogTitle>
            <DialogDescription>
              Choose whether to unlock this question for the supplier to submit again or score it directly.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold text-stone-900">
                Does supplier need to submit answer again?
              </Label>
              <RadioGroup
                value={needsResubmission ? 'yes' : 'no'}
                onValueChange={(val) => setNeedsResubmission(val === 'yes')}
                className="mt-2 flex gap-4"
                data-testid="reject-resubmit-choice"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id={`resubmit-yes-${question.id}`} data-testid="reject-resubmit-yes" />
                  <Label htmlFor={`resubmit-yes-${question.id}`} className="cursor-pointer text-xs font-medium">
                    Yes (Unlock question for supplier)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id={`resubmit-no-${question.id}`} data-testid="reject-resubmit-no" />
                  <Label htmlFor={`resubmit-no-${question.id}`} className="cursor-pointer text-xs font-medium">
                    No (Award approved score)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {!needsResubmission && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`reviewer-score-input-${question.id}`} className="text-xs font-semibold text-stone-900">
                    Approved Score (Points)
                  </Label>
                  <span className="text-[11px] text-stone-500">Max: {question.max_points ?? 100} pts</span>
                </div>
                <Input
                  id={`reviewer-score-input-${question.id}`}
                  type="number"
                  min="0"
                  max={question.max_points ?? 100}
                  step="0.1"
                  value={reviewerScore}
                  onChange={(e) => setReviewerScore(e.target.value)}
                  placeholder="0"
                  data-testid="reviewer-approved-score-input"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor={`reviewer-note-input-${question.id}`} className="text-xs font-semibold text-stone-900">
                {needsResubmission ? 'Instructions / Feedback for Supplier *' : 'Review Rationale / Comment *'}
              </Label>
              <Textarea
                id={`reviewer-note-input-${question.id}`}
                rows={3}
                value={reviewerNote}
                onChange={(e) => setReviewerNote(e.target.value)}
                placeholder={needsResubmission ? 'Explain what clarification or evidence is required...' : 'Reason for rejection or score deduction...'}
                data-testid="reviewer-comment-textarea"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRejectDialogOpen(false)} data-testid="cancel-reject-button">
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!reviewerNote.trim()}
              onClick={handleConfirmReject}
              data-testid="confirm-reject-button"
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
