// Shared helpers for file uploads so every page surfaces the same,
// user-friendly error messages (backend caps files at 5MB).

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // keep in sync with backend

export function formatFileSize(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

// Pre-upload validation. Returns an error message or null.
export function validateFileSize(file, maxBytes = MAX_UPLOAD_BYTES) {
  if (!file) return null;
  if (file.size > maxBytes) {
    return `File size exceeded — "${file.name}" is ${formatFileSize(file.size)}. Maximum allowed is ${formatFileSize(maxBytes)}.`;
  }
  return null;
}

// Extract a usable message from an Axios upload error.
// Surfaces backend detail, handles 413 "request entity too large", and falls back
// to a generic message.
export function getUploadErrorMessage(error, file) {
  const fileLabel = file?.name ? ` "${file.name}"` : '';
  const status = error?.response?.status;
  const detail = error?.response?.data?.detail;

  if (status === 413) {
    return `File size exceeded${fileLabel}. Maximum allowed is ${formatFileSize(MAX_UPLOAD_BYTES)}.`;
  }

  if (typeof detail === 'string') {
    // Backend 400 with descriptive detail (file size too large, type not allowed, etc.)
    if (/size too large|too large|exceed/i.test(detail)) {
      return `File size exceeded${fileLabel}. Maximum allowed is ${formatFileSize(MAX_UPLOAD_BYTES)}.`;
    }
    return detail;
  }

  if (error?.message) return `Upload failed${fileLabel}: ${error.message}`;
  return `Upload failed${fileLabel}.`;
}
