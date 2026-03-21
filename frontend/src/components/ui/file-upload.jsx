import React, { useRef, useState } from 'react';
import { Upload, X, FileText, Image, File, Loader2, CheckCircle } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../lib/utils';

const ALLOWED_TYPES = {
  'application/pdf': { icon: FileText, label: 'PDF' },
  'image/jpeg': { icon: Image, label: 'JPEG' },
  'image/jpg': { icon: Image, label: 'JPG' },
  'image/png': { icon: Image, label: 'PNG' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { icon: FileText, label: 'Excel' },
  'application/vnd.ms-excel': { icon: FileText, label: 'Excel' },
  'text/csv': { icon: FileText, label: 'CSV' },
  'application/msword': { icon: FileText, label: 'Word' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { icon: FileText, label: 'Word' },
};

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function FileUpload({ 
  onUpload, 
  onRemove,
  uploadedFile,
  className,
  disabled = false,
  label = "Upload Evidence Document",
  multiple = false
}) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  const validateFile = (file) => {
    if (!ALLOWED_TYPES[file.type]) {
      return 'File type not supported. Please upload PDF, Image, Excel, CSV, or Word files.';
    }
    if (file.size > MAX_SIZE) {
      return 'File size exceeds 10MB limit.';
    }
    return null;
  };

  const handleFile = async (file) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      await onUpload(file);
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleMultipleFiles = async (files) => {
    setError(null);
    setIsUploading(true);
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const validationError = validateFile(file);
        if (validationError) {
          setError(validationError);
          continue;
        }
        await onUpload(file);
      }
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (disabled || isUploading) return;
    
    const files = Array.from(e.dataTransfer.files);
    if (multiple && files.length > 1) {
      handleMultipleFiles(files);
    } else if (files[0]) {
      handleFile(files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!disabled && !isUploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleInputChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (multiple && files.length > 1) {
      handleMultipleFiles(files);
    } else if (files[0]) {
      handleFile(files[0]);
    }
    e.target.value = '';
  };

  const handleRemove = () => {
    if (onRemove) {
      onRemove();
    }
    setError(null);
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  // Get icon for file type
  const getFileIcon = (contentType) => {
    const typeInfo = ALLOWED_TYPES[contentType];
    return typeInfo ? typeInfo.icon : File;
  };

  if (uploadedFile) {
    const FileIcon = getFileIcon(uploadedFile.content_type);
    return (
      <div className={cn("space-y-2", className)}>
        <label className="text-sm font-medium text-text-primary">{label}</label>
        <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="bg-green-100 p-2 rounded-lg">
            <FileIcon className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-800 truncate">
              {uploadedFile.filename}
            </p>
            <p className="text-xs text-green-600">
              {formatFileSize(uploadedFile.size)} • Uploaded successfully
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleRemove}
              className="text-green-700 hover:text-red-600 hover:bg-red-50"
              data-testid="remove-file-btn"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <label className="text-sm font-medium text-text-primary">{label}</label>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
          isDragging && "border-primary bg-primary/5",
          !isDragging && "border-stone-300 hover:border-primary/50 hover:bg-stone-50",
          disabled && "opacity-50 cursor-not-allowed",
          error && "border-red-300 bg-red-50"
        )}
        onClick={() => !disabled && !isUploading && inputRef.current?.click()}
        data-testid="file-upload-dropzone"
      >
        <input
          ref={inputRef}
          type="file"
          onChange={handleInputChange}
          accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.xlsx,.xls,.csv,.doc,.docx"
          className="hidden"
          disabled={disabled || isUploading}
          multiple={multiple}
          data-testid="file-upload-input"
        />
        
        {isUploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-text-secondary">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className={cn(
              "w-8 h-8",
              error ? "text-red-400" : "text-stone-400"
            )} />
            <div>
              <p className="text-sm font-medium text-text-primary">
                Drop file here or click to upload
              </p>
              <p className="text-xs text-text-muted mt-1">
                PDF, Images, Excel, CSV, Word (Max 10MB)
              </p>
            </div>
          </div>
        )}
      </div>
      
      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <X className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
}

export default FileUpload;
