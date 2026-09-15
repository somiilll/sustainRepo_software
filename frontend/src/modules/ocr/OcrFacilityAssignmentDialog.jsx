import React, { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Eye, EyeOff, FileText, Loader2, MapPin } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';

const fileKey = (file) => `${file.upload_id}-${file.file_index}`;

export const OcrFacilityAssignmentDialog = ({ files, facilities, open, saving, onSave, onPreview, onHidePreview, onManageFacilities, previewFile, previewUrl, previewLoading }) => {
  const [assignments, setAssignments] = useState({});
  const [applyToAll, setApplyToAll] = useState(false);
  const [sharedFacilityId, setSharedFacilityId] = useState('');
  const facilityById = useMemo(() => new Map(facilities.map((facility) => [facility.id, facility])), [facilities]);
  const allAssigned = files.length > 0 && files.every((file) => Boolean(assignments[fileKey(file)]));

  useEffect(() => {
    if (!open) return;
    setAssignments((current) => Object.fromEntries(files.map((file) => [
      fileKey(file),
      current[fileKey(file)] || file.facility_id || '',
    ])));
    setApplyToAll(false);
    setSharedFacilityId('');
  }, [files, open]);

  const selectFacility = (file, facilityId) => {
    setApplyToAll(false);
    setAssignments((current) => ({ ...current, [fileKey(file)]: facilityId }));
  };
  const selectSharedFacility = (facilityId) => {
    setSharedFacilityId(facilityId);
    setAssignments(Object.fromEntries(files.map((file) => [fileKey(file), facilityId])));
  };
  const submit = () => onSave(files.map((file) => ({
    upload_id: file.upload_id,
    file_index: file.file_index,
    facility_id: assignments[fileKey(file)],
    facility_name: facilityById.get(assignments[fileKey(file)])?.name || '',
  })));

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto" hideCloseButton onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()} data-testid="ocr-facility-assignment-dialog">
        <DialogHeader>
          <DialogTitle data-testid="ocr-facility-assignment-title">Assign invoice facilities</DialogTitle>
          <DialogDescription data-testid="ocr-facility-assignment-description">Choose the facility for every extracted invoice or bill before reviewing its activity rows.</DialogDescription>
        </DialogHeader>
        {facilities.length > 0 ? (
          <div className="space-y-5 py-2">
            <div className="grid gap-3 border border-emerald-200 bg-emerald-50/60 p-4 md:grid-cols-[minmax(0,1fr)_17rem] md:items-end" data-testid="ocr-facility-assign-all-control">
              <label className="flex items-start gap-3" data-testid="ocr-facility-assign-all-toggle">
                <Checkbox checked={applyToAll} onCheckedChange={(checked) => setApplyToAll(checked === true)} data-testid="ocr-facility-assign-all-checkbox" />
                <span><span className="block text-sm font-semibold text-slate-950">Mark the same facility for every invoice</span><span className="mt-1 block text-xs text-slate-600">You can change an individual invoice below afterwards.</span></span>
              </label>
              <div className="space-y-2">
                <Label data-testid="ocr-facility-assign-all-label">Facility</Label>
                <Select value={sharedFacilityId} onValueChange={selectSharedFacility} disabled={!applyToAll}>
                  <SelectTrigger data-testid="ocr-facility-assign-all-select"><SelectValue placeholder="Select facility" /></SelectTrigger>
                  <SelectContent>{facilities.map((facility) => <SelectItem key={facility.id} value={facility.id} data-testid={`ocr-facility-assign-all-option-${facility.id}`}>{facility.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="divide-y divide-slate-200 border border-slate-200" data-testid="ocr-facility-assignment-file-list">
              {files.map((file, index) => {
                const key = fileKey(file);
                const viewingThisFile = previewFile && fileKey(previewFile) === key;
                const isPdf = file.content_type === 'application/pdf' || file.filename.toLowerCase().endsWith('.pdf');
                return (
                  <div key={key} className="bg-white p-4" data-testid={`ocr-facility-assignment-file-${index}`}>
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_15rem_auto] md:items-end">
                      <div className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-semibold text-slate-950" data-testid={`ocr-facility-assignment-file-name-${index}`}><FileText className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />{file.filename}</span>
                        <span className="mt-1 block text-xs text-slate-500" data-testid={`ocr-facility-assignment-file-status-${index}`}>{file.line_item_count || 0} extracted activity rows</span>
                      </div>
                      <div className="space-y-2">
                        <Label data-testid={`ocr-facility-assignment-label-${index}`}>Facility</Label>
                        <Select value={assignments[key] || ''} onValueChange={(facilityId) => selectFacility(file, facilityId)}>
                          <SelectTrigger data-testid={`ocr-facility-assignment-select-${index}`}><SelectValue placeholder="Select facility" /></SelectTrigger>
                          <SelectContent>{facilities.map((facility) => <SelectItem key={facility.id} value={facility.id} data-testid={`ocr-facility-assignment-option-${index}-${facility.id}`}>{facility.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" onClick={() => onPreview(file)} disabled={previewLoading && viewingThisFile} data-testid={`ocr-facility-assignment-preview-${index}`}>
                          {previewLoading && viewingThisFile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}Preview
                        </Button>
                        {viewingThisFile && <Button type="button" variant="ghost" onClick={onHidePreview} data-testid={`ocr-facility-assignment-hide-preview-${index}`}><EyeOff className="mr-2 h-4 w-4" />Hide</Button>}
                      </div>
                    </div>
                    {viewingThisFile && (
                      <div className="mt-4 overflow-hidden border border-slate-200 bg-slate-50" data-testid={`ocr-facility-assignment-preview-panel-${index}`}>
                        {previewLoading ? <div className="grid min-h-48 place-items-center text-sm text-slate-600" data-testid="ocr-facility-assignment-preview-loading">Loading secure preview…</div>
                          : previewUrl && (isPdf ? <iframe src={previewUrl} title={`Preview of ${file.filename}`} className="h-[28rem] w-full" data-testid="ocr-facility-assignment-pdf-preview" /> : <img src={previewUrl} alt={`Preview of ${file.filename}`} className="max-h-[28rem] w-full object-contain" data-testid="ocr-facility-assignment-image-preview" />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : <div className="flex flex-col gap-3 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between" data-testid="ocr-facility-assignment-empty-state"><span data-testid="ocr-facility-assignment-empty-message">Create an active facility before assigning these invoices.</span><Button type="button" variant="outline" onClick={onManageFacilities} data-testid="ocr-facility-assignment-manage-facilities-button"><MapPin className="mr-2 h-4 w-4" />Manage facilities</Button></div>}
        <DialogFooter>
          <Button type="button" onClick={submit} disabled={!allAssigned || saving} data-testid="ocr-facility-assignment-save-button">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckSquare className="mr-2 h-4 w-4" />}Continue to review</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};