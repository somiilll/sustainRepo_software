/**
 * Notes Section Component
 * Handles notes, responsible person, and evidence upload
 */

import React, { useRef, useState } from 'react';
import { Input } from '../../../../../components/ui/input';
import { Label } from '../../../../../components/ui/label';
import { Button } from '../../../../../components/ui/button';
import { Upload, X, Eye, FileText, Loader2 } from 'lucide-react';

/**
 * Notes section with optional responsible person and evidence
 * @param {Object} props
 * @param {string} props.notes - Notes text
 * @param {Function} props.onNotesChange - Notes change handler
 * @param {string} props.responsiblePerson - Responsible person name
 * @param {Function} props.onResponsiblePersonChange - Responsible person change handler
 * @param {string} props.responsiblePersonDesignation - Designation
 * @param {Function} props.onResponsiblePersonDesignationChange - Designation change handler
 * @param {string} props.responsiblePersonContact - Contact info
 * @param {Function} props.onResponsiblePersonContactChange - Contact change handler
 * @param {string} props.evidenceUrl - Uploaded evidence URL
 * @param {string} props.evidenceFileName - Uploaded evidence file name
 * @param {Function} props.onEvidenceUpload - Evidence upload handler (file)
 * @param {Function} props.onEvidenceRemove - Evidence remove handler
 * @param {boolean} props.isUploadingEvidence - Whether evidence is being uploaded
 * @param {boolean} props.showResponsiblePerson - Whether to show responsible person fields
 * @param {boolean} props.showEvidence - Whether to show evidence upload
 * @param {boolean} props.disabled - Whether fields are disabled
 * @param {string} props.className - Additional CSS classes
 */
export const NotesSection = ({
  notes,
  onNotesChange,
  responsiblePerson,
  onResponsiblePersonChange,
  responsiblePersonDesignation,
  onResponsiblePersonDesignationChange,
  responsiblePersonContact,
  onResponsiblePersonContactChange,
  evidenceUrl,
  evidenceFileName,
  onEvidenceUpload,
  onEvidenceRemove,
  isUploadingEvidence = false,
  showResponsiblePerson = true,
  showEvidence = true,
  disabled = false,
  className = '',
}) => {
  const fileInputRef = useRef(null);
  
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file && onEvidenceUpload) {
      onEvidenceUpload(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Notes */}
      <div className="space-y-2">
        <Label>Notes</Label>
        <textarea
          value={notes || ''}
          onChange={(e) => onNotesChange && onNotesChange(e.target.value)}
          placeholder="Add any additional notes..."
          disabled={disabled}
          className={`
            w-full min-h-[100px] bg-stone-50 border border-stone-200 rounded-lg px-3 py-2
            focus:outline-none focus:ring-2 focus:ring-primary
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          data-testid="emission-notes"
        />
      </div>
      
      {/* Responsible Person */}
      {showResponsiblePerson && (
        <div className="space-y-4 p-4 bg-stone-50 rounded-lg border border-stone-200">
          <Label className="text-stone-700 font-medium">Responsible Person (Optional)</Label>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-sm text-stone-500">Name</Label>
              <Input
                value={responsiblePerson || ''}
                onChange={(e) => onResponsiblePersonChange && onResponsiblePersonChange(e.target.value)}
                placeholder="Full name"
                disabled={disabled}
                className="bg-white"
                data-testid="responsible-person-name"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-stone-500">Designation</Label>
              <Input
                value={responsiblePersonDesignation || ''}
                onChange={(e) => onResponsiblePersonDesignationChange && onResponsiblePersonDesignationChange(e.target.value)}
                placeholder="Job title"
                disabled={disabled}
                className="bg-white"
                data-testid="responsible-person-designation"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-stone-500">Contact</Label>
              <Input
                value={responsiblePersonContact || ''}
                onChange={(e) => onResponsiblePersonContactChange && onResponsiblePersonContactChange(e.target.value)}
                placeholder="Email or phone"
                disabled={disabled}
                className="bg-white"
                data-testid="responsible-person-contact"
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Evidence Upload */}
      {showEvidence && (
        <div className="space-y-2">
          <Label>Supporting Evidence (Optional)</Label>
          
          {evidenceUrl ? (
            <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <FileText className="h-5 w-5 text-emerald-600" />
              <span className="flex-1 text-sm text-emerald-800 truncate">
                {evidenceFileName || 'Uploaded file'}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => window.open(evidenceUrl, '_blank')}
                className="text-emerald-600 hover:text-emerald-700"
              >
                <Eye className="h-4 w-4 mr-1" />
                View
              </Button>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onEvidenceRemove && onEvidenceRemove()}
                  className="text-red-600 hover:text-red-700"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isUploadingEvidence}
                className="flex items-center gap-2"
              >
                {isUploadingEvidence ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Upload Evidence
                  </>
                )}
              </Button>
              <p className="text-xs text-stone-400 flex items-center">
                PDF, Word, Excel, or images (max 10MB)
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotesSection;
