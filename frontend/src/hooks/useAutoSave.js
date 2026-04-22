import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Auto-save hook that triggers save after specified inactivity period
 * 
 * @param {Object} options
 * @param {Function} options.onSave - Function to call when auto-saving (receives formData)
 * @param {Function} options.validate - Function to validate if form is ready to save (returns boolean)
 * @param {Object} options.formData - Current form data
 * @param {boolean} options.enabled - Whether auto-save is enabled
 * @param {number} options.inactivityMs - Milliseconds of inactivity before auto-save (default: 5 minutes)
 * @param {boolean} options.isEditing - Whether this is an edit (PUT) or create (POST) operation
 * @param {string} options.existingId - ID of existing record (for edit mode)
 * 
 * @returns {Object} { saveStatus, lastSavedAt, triggerSave, resetAutoSave }
 */
export function useAutoSave({
  onSave,
  validate,
  formData,
  enabled = true,
  inactivityMs = 5 * 60 * 1000, // 5 minutes default
  isEditing = false,
  existingId = null
}) {
  // Save status: 'idle' | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  
  // Refs to track activity and timers
  const inactivityTimerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const formDataRef = useRef(formData);
  const savedFormDataRef = useRef(null);
  const hasSavedOnceRef = useRef(isEditing); // If editing, we already have a record
  const createdIdRef = useRef(existingId);
  
  // Update formData ref when it changes
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // Update existingId ref
  useEffect(() => {
    createdIdRef.current = existingId;
    if (existingId) {
      hasSavedOnceRef.current = true;
    }
  }, [existingId]);

  // Check if form data has changed since last save
  const hasChanges = useCallback(() => {
    if (!savedFormDataRef.current) return true;
    return JSON.stringify(formDataRef.current) !== JSON.stringify(savedFormDataRef.current);
  }, []);

  // Perform the save operation
  const performSave = useCallback(async () => {
    // Don't save if validation fails
    if (validate && !validate(formDataRef.current)) {
      return;
    }

    // Don't save if no changes since last save
    if (!hasChanges()) {
      return;
    }

    setSaveStatus('saving');
    setErrorMessage(null);

    try {
      // Determine if this is a create or update operation
      const isUpdate = hasSavedOnceRef.current && createdIdRef.current;
      
      const result = await onSave(formDataRef.current, isUpdate, createdIdRef.current);
      
      // If create returned an ID, store it for future updates
      if (result?.id && !createdIdRef.current) {
        createdIdRef.current = result.id;
        hasSavedOnceRef.current = true;
      }
      
      savedFormDataRef.current = { ...formDataRef.current };
      setLastSavedAt(new Date());
      setSaveStatus('saved');
      
      // Reset to idle after 3 seconds
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
      
    } catch (error) {
      console.error('Auto-save failed:', error);
      setSaveStatus('error');
      setErrorMessage(error.message || 'Auto-save failed');
      
      // Reset to idle after 5 seconds
      setTimeout(() => {
        setSaveStatus('idle');
      }, 5000);
    }
  }, [onSave, validate, hasChanges]);

  // Reset activity timer on any form interaction
  const resetActivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    // Clear existing timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    
    // Only set timer if enabled and validation passes
    if (enabled && validate && validate(formDataRef.current)) {
      inactivityTimerRef.current = setTimeout(() => {
        performSave();
      }, inactivityMs);
    }
  }, [enabled, inactivityMs, performSave, validate]);

  // Track form data changes to reset inactivity timer
  useEffect(() => {
    if (enabled) {
      resetActivityTimer();
    }
    
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [formData, enabled, resetActivityTimer]);

  // Manual trigger for immediate save
  const triggerSave = useCallback(async () => {
    // Clear auto-save timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    
    await performSave();
  }, [performSave]);

  // Reset auto-save state (useful when form is reset)
  const resetAutoSave = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    setSaveStatus('idle');
    setLastSavedAt(null);
    setErrorMessage(null);
    savedFormDataRef.current = null;
    hasSavedOnceRef.current = isEditing;
    createdIdRef.current = existingId;
  }, [isEditing, existingId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, []);

  return {
    saveStatus,
    lastSavedAt,
    errorMessage,
    triggerSave,
    resetAutoSave,
    createdId: createdIdRef.current
  };
}

/**
 * Auto-save status indicator component
 */
export function AutoSaveStatus({ status, lastSavedAt, errorMessage }) {
  if (status === 'idle' && !lastSavedAt) return null;
  
  const statusConfig = {
    idle: {
      text: lastSavedAt ? `Last saved ${formatTimeAgo(lastSavedAt)}` : '',
      className: 'text-text-muted'
    },
    saving: {
      text: 'Saving...',
      className: 'text-amber-600'
    },
    saved: {
      text: 'Saved',
      className: 'text-green-600'
    },
    error: {
      text: errorMessage || 'Error - retry',
      className: 'text-red-600'
    }
  };
  
  const config = statusConfig[status] || statusConfig.idle;
  
  return (
    <div className={`flex items-center gap-2 text-xs ${config.className}`}>
      {status === 'saving' && (
        <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {status === 'saved' && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
      {status === 'error' && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
      <span>{config.text}</span>
    </div>
  );
}

// Helper to format time ago
function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 120) return '1 minute ago';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 7200) return '1 hour ago';
  
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default useAutoSave;
