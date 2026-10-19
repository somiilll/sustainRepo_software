/**
 * OCR Context - Manages state for OCR Invoice to Emission Entry workflow.
 * Allows passing accepted line item data to the Emission Form.
 */
import React, { createContext, useContext, useState, useCallback } from 'react';

const OCRContext = createContext(null);

export function OCRProvider({ children }) {
  // Prefill data from accepted OCR line item
  const [ocrPrefillData, setOcrPrefillData] = useState(null);
  
  // Track if we're in OCR import flow
  const [isOcrImportFlow, setIsOcrImportFlow] = useState(false);

  /**
   * Set prefill data from an accepted OCR line item
   * Called when user clicks "Accept" on an OCR line item
   */
  const setOcrAcceptedData = useCallback((prefillData) => {
    setOcrPrefillData(prefillData);
    setIsOcrImportFlow(true);
  }, []);

  /**
   * Clear OCR prefill data
   * Called after emission is saved or user cancels
   */
  const clearOcrData = useCallback(() => {
    setOcrPrefillData(null);
    setIsOcrImportFlow(false);
  }, []);

  /**
   * Get prefill data and clear it (one-time use)
   */
  const consumeOcrData = useCallback(() => {
    const data = ocrPrefillData;
    // Don't clear immediately - clear after save
    return data;
  }, [ocrPrefillData]);

  const value = {
    ocrPrefillData,
    isOcrImportFlow,
    setOcrAcceptedData,
    clearOcrData,
    consumeOcrData
  };

  return (
    <OCRContext.Provider value={value}>
      {children}
    </OCRContext.Provider>
  );
}

export function useOCR() {
  const context = useContext(OCRContext);
  if (!context) {
    throw new Error('useOCR must be used within an OCRProvider');
  }
  return context;
}

export default OCRContext;
