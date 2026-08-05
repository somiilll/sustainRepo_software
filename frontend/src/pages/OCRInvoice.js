/**
 * OCR Invoice Extractor Page
 * Extracts Scope 1 & 2 emissions data from utility invoices using AI.
 * 
 * This component integrates the standalone OCR extractor into the ESG platform.
 */
import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function OCRInvoice() {
  const { getAuthHeader } = useAuth();
  const [isDragActive, setIsDragActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragOut = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, []);

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (file) => {
    if (!file.type.match('image.*') && file.type !== 'application/pdf') {
      setError('Please upload an image or PDF file.');
      return;
    }

    setError(null);
    setIsLoading(true);
    setResults(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API}/api/ocr-invoice/upload`, formData, {
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.data) {
        setResults(response.data.data);
      } else {
        setError('No data extracted from the invoice.');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to process invoice';
      setError(`Error processing invoice: ${errorMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadAnother = () => {
    setResults(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatBillingPeriod = (billingPeriod) => {
    if (!billingPeriod) return 'N/A';
    
    // If we have period_text, use it
    if (billingPeriod.period_text) {
      return billingPeriod.period_text;
    }
    
    // Otherwise format from dates
    if (billingPeriod.start_date && billingPeriod.end_date) {
      return `${billingPeriod.start_date} to ${billingPeriod.end_date}`;
    }
    
    if (billingPeriod.start_date) {
      return billingPeriod.start_date;
    }
    
    return 'N/A';
  };

  const renderResults = () => {
    if (!results || results.length === 0) {
      return (
        <tr>
          <td colSpan="10" className="text-center py-8 text-text-muted">
            No valid data extracted from the invoice.
          </td>
        </tr>
      );
    }

    return results.map((row, index) => (
      <tr 
        key={index} 
        className={`border-b border-border hover:bg-gray-50 ${row.needs_review ? 'bg-orange-50 border-l-4 border-l-accent' : ''}`}
      >
        <td className="px-4 py-3 text-sm">{row.invoice_number || 'N/A'}</td>
        <td className="px-4 py-3 text-sm">{formatBillingPeriod(row.billing_period)}</td>
        <td className="px-4 py-3 text-sm">{row.vendor_name || 'N/A'}</td>
        <td className="px-4 py-3 text-sm">{row.fuel_name || 'N/A'}</td>
        <td className="px-4 py-3 text-sm font-medium">{row.category || 'Unknown'}</td>
        <td className="px-4 py-3 text-sm">{row.scope || 'Unknown'}</td>
        <td className="px-4 py-3 text-sm">
          {row.quantity ? `${row.quantity} ${row.unit || ''}` : 'N/A'}
        </td>
        <td className="px-4 py-3 text-sm">
          {row.money_spent ? `${row.currency || '$'} ${row.money_spent}` : 'N/A'}
        </td>
        <td className="px-4 py-3 text-sm">{row.confidence_score || 'N/A'}</td>
        <td className="px-4 py-3">
          {row.needs_review ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-orange-100 text-accent">
              <AlertCircle className="w-3 h-3" />
              Review
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700">
              <CheckCircle2 className="w-3 h-3" />
              Auto-mapped
            </span>
          )}
          {row.needs_review && row.low_confidence_fields && row.low_confidence_fields.length > 0 && (
            <div className="text-xs text-text-muted mt-1">
              Flagged: {row.low_confidence_fields.join(', ')}
            </div>
          )}
        </td>
      </tr>
    ));
  };

  return (
    <div className="space-y-6" data-testid="ocr-invoice-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-text-primary">
          OCR Invoice Extractor
        </h1>
        <p className="text-text-muted mt-1">
          Upload your utility invoices. Let AI classify your Scope 1 & 2 emissions instantly.
        </p>
      </div>

      {/* Upload Zone */}
      {!isLoading && !results && (
        <Card 
          className={`p-12 border-2 border-dashed transition-all cursor-pointer ${
            isDragActive 
              ? 'border-primary bg-primary/5' 
              : 'border-border hover:border-primary/50 hover:bg-gray-50'
          }`}
          data-testid="ocr-drop-zone"
          onDragEnter={handleDragIn}
          onDragLeave={handleDragOut}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex flex-col items-center text-center">
            <div className={`p-4 rounded-full mb-4 ${isDragActive ? 'bg-primary/10' : 'bg-gray-100'}`}>
              <Upload className={`w-10 h-10 ${isDragActive ? 'text-primary' : 'text-text-muted'}`} />
            </div>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              Drag & Drop your invoice here
            </h2>
            <p className="text-text-muted text-sm mb-4">
              Supports PDF, PNG, JPG (Max 5 pages)
            </p>
            <input 
              type="file" 
              ref={fileInputRef}
              className="hidden" 
              accept=".pdf,.png,.jpg,.jpeg,.avif"
              onChange={handleFileInput}
              data-testid="ocr-file-input"
            />
            <Button data-testid="ocr-browse-btn">
              <FileText className="w-4 h-4 mr-2" />
              Browse Files
            </Button>
          </div>
        </Card>
      )}

      {/* Error Message */}
      {error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-red-700 text-sm flex-1">{error}</p>
            <Button variant="outline" size="sm" onClick={handleUploadAnother}>
              Try Again
            </Button>
          </div>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <Card className="p-12">
          <div className="flex flex-col items-center text-center">
            <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
            <p className="text-text-muted">Processing invoice with AI...</p>
            <p className="text-text-muted text-sm mt-1">This may take a few moments</p>
          </div>
        </Card>
      )}

      {/* Results */}
      {results && (
        <Card className="overflow-hidden" data-testid="ocr-results">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                Extracted Line Items
              </h2>
              <p className="text-sm text-text-muted">
                {results.length} item{results.length !== 1 ? 's' : ''} extracted • 
                {results.filter(r => r.needs_review).length} need{results.filter(r => r.needs_review).length !== 1 ? '' : 's'} review
              </p>
            </div>
            <Button 
              variant="outline" 
              onClick={handleUploadAnother}
              data-testid="ocr-upload-another-btn"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Another
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Invoice #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Period</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Fuel Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Scope</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Quantity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Cost</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Confidence</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {renderResults()}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="p-4 border-t border-border bg-gray-50 flex gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500"></span>
              <span className="text-text-muted">Auto-mapped</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-accent"></span>
              <span className="text-text-muted">Needs Review</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
