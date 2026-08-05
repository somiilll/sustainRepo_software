/**
 * OCR Invoice Extractor Page - AI-Assisted Emission Entry Workflow
 * 
 * Workflow:
 * 1. Upload Invoice(s) → 2. OCR Processing → 3. AI Data Extraction
 * 4. Review Line Items → 5. Edit (Optional) → 6. Accept
 * 7. Open Add Emission Form (Pre-filled) → 8. Save Emission Record
 * 9. Invoice stored as Evidence
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useOCR } from '../contexts/OCRContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { 
  Upload, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  Edit3,
  Check,
  X,
  Trash2,
  FileWarning,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

// Status badge configurations
const STATUS_CONFIG = {
  pending_review: { label: 'Pending Review', color: 'bg-yellow-100 text-yellow-700', icon: FileWarning },
  edited: { label: 'Edited', color: 'bg-blue-100 text-blue-700', icon: Edit3 },
  accepted: { label: 'Accepted', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  imported: { label: 'Imported', color: 'bg-gray-100 text-gray-600', icon: Check }
};

export default function OCRInvoice() {
  const { getAuthHeader } = useAuth();
  const { setOcrAcceptedData } = useOCR();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Upload state
  const [isDragActive, setIsDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Results state
  const [currentUploadId, setCurrentUploadId] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Accept confirmation state
  const [acceptModalOpen, setAcceptModalOpen] = useState(false);
  const [acceptingItem, setAcceptingItem] = useState(null);
  const [isAccepting, setIsAccepting] = useState(false);

  // ============================================================================
  // Drag & Drop Handlers
  // ============================================================================
  
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
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFiles(files);
    }
  }, []);

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
  };

  // ============================================================================
  // File Upload Handler
  // ============================================================================

  const handleFiles = async (files) => {
    // Filter valid files
    const validFiles = files.filter(file => {
      const ext = file.name.toLowerCase();
      return ext.endsWith('.pdf') || ext.endsWith('.png') || 
             ext.endsWith('.jpg') || ext.endsWith('.jpeg');
    });

    if (validFiles.length === 0) {
      toast.error('Please upload PDF or image files (PNG, JPG)');
      return;
    }

    setError(null);
    setIsUploading(true);
    setUploadProgress(10);

    const formData = new FormData();
    validFiles.forEach(file => {
      formData.append('files', file);
    });

    try {
      setUploadProgress(30);
      
      const response = await axios.post(`${API}/api/ocr-invoice/upload`, formData, {
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 50) / progressEvent.total) + 30;
          setUploadProgress(Math.min(progress, 80));
        }
      });

      setUploadProgress(100);

      if (response.data.line_items) {
        setCurrentUploadId(response.data.upload_id);
        setLineItems(response.data.line_items);
        toast.success(`Extracted ${response.data.total_line_items} line items from ${response.data.file_count} file(s)`);
      } else {
        toast.warning('No data extracted from the invoice(s)');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to process invoice';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // ============================================================================
  // Edit Handlers
  // ============================================================================

  const openEditModal = (item) => {
    setEditingItem(item);
    setEditFormData({
      invoice_number: item.current_values?.invoice_number || '',
      vendor_name: item.current_values?.vendor_name || '',
      scope: item.current_values?.scope || 'scope1',
      category: item.current_values?.category || '',
      subcategory: item.current_values?.subcategory || '',
      fuel_name: item.current_values?.fuel_name || '',
      quantity: item.current_values?.quantity || '',
      unit: item.current_values?.unit || '',
      cost: item.current_values?.cost || '',
      currency: item.current_values?.currency || '',
      billing_period_start: item.current_values?.billing_period_start || '',
      billing_period_end: item.current_values?.billing_period_end || '',
      billing_period_text: item.current_values?.billing_period_text || ''
    });
    setEditModalOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingItem) return;
    
    setIsSavingEdit(true);
    try {
      const response = await axios.put(
        `${API}/api/ocr-invoice/line-items/${editingItem.id}`,
        editFormData,
        { headers: getAuthHeader() }
      );

      // Update local state
      setLineItems(prev => prev.map(item => 
        item.id === editingItem.id ? response.data.line_item : item
      ));

      toast.success('Line item updated');
      setEditModalOpen(false);
      setEditingItem(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save changes');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // ============================================================================
  // Accept Handlers
  // ============================================================================

  const handleAccept = async (item) => {
    setAcceptingItem(item);
    setIsAccepting(true);

    try {
      const response = await axios.post(
        `${API}/api/ocr-invoice/line-items/${item.id}/accept`,
        {},
        { headers: getAuthHeader() }
      );

      const prefillData = response.data.prefill_data;

      // Update local state
      setLineItems(prev => prev.map(li => 
        li.id === item.id ? { ...li, status: 'accepted' } : li
      ));

      // Store in OCR context for emission form
      setOcrAcceptedData(prefillData);

      toast.success('Line item accepted. Opening emission form...');

      // Navigate to GHG emissions page with correct scope route
      const scopeRoute = prefillData.scope || 'scope1';
      setTimeout(() => {
        navigate(`/ghg/${scopeRoute}`, { state: { openAddForm: true, ocrPrefill: prefillData } });
      }, 500);

    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to accept line item');
    } finally {
      setIsAccepting(false);
      setAcceptingItem(null);
    }
  };

  // ============================================================================
  // Delete Upload Handler
  // ============================================================================

  const handleDeleteUpload = async () => {
    if (!currentUploadId) return;

    try {
      await axios.delete(
        `${API}/api/ocr-invoice/uploads/${currentUploadId}`,
        { headers: getAuthHeader() }
      );

      setCurrentUploadId(null);
      setLineItems([]);
      toast.success('Upload deleted');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete upload');
    }
  };

  // ============================================================================
  // Render Helpers
  // ============================================================================

  const formatPeriod = (item) => {
    const cv = item.current_values || {};
    if (cv.billing_period_text) return cv.billing_period_text;
    if (cv.billing_period_start && cv.billing_period_end) {
      return `${cv.billing_period_start} - ${cv.billing_period_end}`;
    }
    if (cv.billing_period_start) return cv.billing_period_start;
    return 'N/A';
  };

  const renderStatusBadge = (status) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending_review;
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-6" data-testid="ocr-invoice-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-text-primary">
            AI Invoice Extractor
          </h1>
          <p className="text-text-muted mt-1">
            Upload invoices to auto-fill emission entries. Review, edit, and import with confidence.
          </p>
        </div>
        {lineItems.length > 0 && (
          <Button 
            variant="outline" 
            onClick={handleDeleteUpload}
            className="text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear All
          </Button>
        )}
      </div>

      {/* Upload Zone - Show when no results */}
      {!isUploading && lineItems.length === 0 && (
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
              Drag & Drop your invoices here
            </h2>
            <p className="text-text-muted text-sm mb-4">
              Supports multiple files: PDF, PNG, JPG (Max 20MB each)
            </p>
            <input 
              type="file" 
              ref={fileInputRef}
              className="hidden" 
              accept=".pdf,.png,.jpg,.jpeg"
              multiple
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
            <Button variant="outline" size="sm" onClick={() => setError(null)}>
              Dismiss
            </Button>
          </div>
        </Card>
      )}

      {/* Uploading State */}
      {isUploading && (
        <Card className="p-12">
          <div className="flex flex-col items-center text-center">
            <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
            <p className="text-text-primary font-medium">Processing invoices with AI...</p>
            <p className="text-text-muted text-sm mt-1">This may take a few moments</p>
            <div className="w-64 h-2 bg-gray-200 rounded-full mt-4 overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Results Table */}
      {lineItems.length > 0 && (
        <Card className="overflow-hidden" data-testid="ocr-results">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                Extracted Line Items
              </h2>
              <p className="text-sm text-text-muted">
                {lineItems.length} item{lineItems.length !== 1 ? 's' : ''} • 
                {lineItems.filter(i => i.status === 'pending_review' || i.status === 'edited').length} pending • 
                {lineItems.filter(i => i.status === 'accepted').length} accepted • 
                {lineItems.filter(i => i.status === 'imported').length} imported
              </p>
            </div>
            <Button 
              variant="outline" 
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              Add More
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Invoice #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Fuel</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Scope</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Quantity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Period</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Confidence</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lineItems.map((item) => {
                  const cv = item.current_values || {};
                  const isImported = item.status === 'imported';
                  
                  return (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-gray-50 ${item.needs_review && item.status !== 'imported' ? 'bg-yellow-50/50' : ''}`}
                    >
                      <td className="px-4 py-3 text-sm">{cv.invoice_number || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm">{cv.vendor_name || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm font-medium">{cv.fuel_name || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm">{cv.category || 'Unknown'}</td>
                      <td className="px-4 py-3 text-sm capitalize">{cv.scope?.replace('scope', 'Scope ') || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm">
                        {cv.quantity ? `${cv.quantity} ${cv.unit || ''}` : 'N/A'}
                        {!cv.unit_matched && cv.unit && (
                          <span className="block text-xs text-orange-600">Unit needs mapping</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">{formatPeriod(item)}</td>
                      <td className="px-4 py-3 text-sm">
                        {item.confidence_score ? `${item.confidence_score}%` : 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        {renderStatusBadge(item.status)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {!isImported && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditModal(item)}
                                data-testid={`edit-btn-${item.id}`}
                              >
                                <Edit3 className="w-3 h-3 mr-1" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleAccept(item)}
                                disabled={isAccepting && acceptingItem?.id === item.id}
                                data-testid={`accept-btn-${item.id}`}
                              >
                                {isAccepting && acceptingItem?.id === item.id ? (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                ) : (
                                  <Check className="w-3 h-3 mr-1" />
                                )}
                                Accept
                              </Button>
                            </>
                          )}
                          {isImported && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => navigate('/emissions')}
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              View
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="p-4 border-t border-border bg-gray-50 flex gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
              <span className="text-text-muted">Pending Review</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-400"></span>
              <span className="text-text-muted">Edited</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500"></span>
              <span className="text-text-muted">Accepted</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-gray-400"></span>
              <span className="text-text-muted">Imported</span>
            </div>
          </div>
        </Card>
      )}

      {/* Edit Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Line Item</DialogTitle>
            <DialogDescription>
              Update the extracted values. Original OCR data is preserved for audit.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invoice_number">Invoice Number</Label>
              <Input
                id="invoice_number"
                value={editFormData.invoice_number}
                onChange={(e) => setEditFormData(prev => ({ ...prev, invoice_number: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor_name">Vendor</Label>
              <Input
                id="vendor_name"
                value={editFormData.vendor_name}
                onChange={(e) => setEditFormData(prev => ({ ...prev, vendor_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scope">Scope</Label>
              <Select
                value={editFormData.scope}
                onValueChange={(value) => setEditFormData(prev => ({ ...prev, scope: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scope1">Scope 1</SelectItem>
                  <SelectItem value="scope2">Scope 2</SelectItem>
                  <SelectItem value="scope3">Scope 3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={editFormData.category}
                onChange={(e) => setEditFormData(prev => ({ ...prev, category: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subcategory">Subcategory</Label>
              <Input
                id="subcategory"
                value={editFormData.subcategory}
                onChange={(e) => setEditFormData(prev => ({ ...prev, subcategory: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fuel_name">Fuel Name</Label>
              <Input
                id="fuel_name"
                value={editFormData.fuel_name}
                onChange={(e) => setEditFormData(prev => ({ ...prev, fuel_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                step="any"
                value={editFormData.quantity}
                onChange={(e) => setEditFormData(prev => ({ ...prev, quantity: parseFloat(e.target.value) || '' }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                value={editFormData.unit}
                onChange={(e) => setEditFormData(prev => ({ ...prev, unit: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billing_period_start">Period Start</Label>
              <Input
                id="billing_period_start"
                type="date"
                value={editFormData.billing_period_start}
                onChange={(e) => setEditFormData(prev => ({ ...prev, billing_period_start: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billing_period_end">Period End</Label>
              <Input
                id="billing_period_end"
                type="date"
                value={editFormData.billing_period_end}
                onChange={(e) => setEditFormData(prev => ({ ...prev, billing_period_end: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="billing_period_text">Period Text (Optional)</Label>
              <Input
                id="billing_period_text"
                placeholder="e.g., Q1 2024, FY 2023-24"
                value={editFormData.billing_period_text}
                onChange={(e) => setEditFormData(prev => ({ ...prev, billing_period_text: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={isSavingEdit}>
              {isSavingEdit && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
