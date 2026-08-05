/**
 * EmissionApprovalWrapper - Simple approval form for GHG emission records
 * 
 * Displays snapshot data in editable fields:
 * - Name of Process(es)
 * - Dynamic input fields (quantity, emission factor, etc.)
 * - Person Responsible, Designation, Contact
 * - Source of Information
 * - Evidence Documents
 */

import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  User,
  Clock,
  FileText,
  Download,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

export default function EmissionApprovalWrapper({ item, onClose, onApproved }) {
  const { getAuthHeader } = useAuth();
  const [processing, setProcessing] = useState(false);
  const [comment, setComment] = useState('');
  const [formValues, setFormValues] = useState({});
  const [originalValues, setOriginalValues] = useState({});
  const [initialized, setInitialized] = useState(false);
  const [formConfig, setFormConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Extract snapshot data
  const snapshot = item?.entity_snapshot || {};
  const requestType = item?.request_type || 'create';
  const isUpdate = requestType === 'update';
  const evidenceFiles = snapshot.evidence_files || [];
  const dynamicInputs = snapshot.inputs || snapshot.dynamic_field_values || {};

  // Fetch form config for allowed units
  useEffect(() => {
    const fetchFormConfig = async () => {
      if (!snapshot.category_id && !snapshot.category) {
        setLoadingConfig(false);
        return;
      }

      try {
        let categoryId = snapshot.category_id;
        
        // If no category_id, try to fetch categories and find it
        if (!categoryId && snapshot.category) {
          const catsRes = await axios.get(`${API}/api/categories`, { headers: getAuthHeader() });
          const categories = catsRes.data || [];
          const cat = categories.find(c => c.name === snapshot.category && c.scope_code === snapshot.scope);
          categoryId = cat?.id;
        }

        if (categoryId) {
          const res = await axios.get(
            `${API}/api/calc-engine/form-config/${categoryId}?scope=${snapshot.scope}`,
            { headers: getAuthHeader() }
          );
          setFormConfig(res.data);
        }
      } catch (err) {
        console.error('Failed to fetch form config:', err);
      } finally {
        setLoadingConfig(false);
      }
    };

    fetchFormConfig();
  }, [snapshot.category_id, snapshot.category, snapshot.scope, getAuthHeader]);

  // Get allowed units for a field from form config
  const getAllowedUnits = (fieldKey) => {
    if (!formConfig?.input_field_mappings) return [];
    const mapping = formConfig.input_field_mappings.find(
      m => m.maps_to_variable === fieldKey || m.field_key === fieldKey
    );
    return mapping?.allowed_units || [];
  };

  // Initialize form values from snapshot
  useEffect(() => {
    if (!initialized && snapshot && Object.keys(snapshot).length > 0) {
      const initial = {
        process_name: snapshot.process_names?.[0] || '',
        process_description: snapshot.process_descriptions?.[0]?.description || '',
        responsible_person: snapshot.responsible_person || '',
        designation: snapshot.responsible_person_designation || '',
        contact: snapshot.responsible_person_contact || '',
        source_of_information: snapshot.source_of_information || '',
        notes: snapshot.notes || '',
      };

      // Add dynamic input fields
      Object.entries(dynamicInputs).forEach(([key, val]) => {
        if (val && typeof val === 'object' && 'value' in val) {
          initial[key] = val.value ?? '';
          initial[`${key}_unit`] = val.unit || '';
        } else {
          initial[key] = val ?? '';
        }
      });

      setFormValues(initial);
      setOriginalValues(initial);
      setInitialized(true);
    }
  }, [snapshot, dynamicInputs, initialized]);

  // Check if any values were modified
  const hasModifications = useMemo(() => {
    if (!initialized) return false;
    return Object.keys(formValues).some(key => formValues[key] !== originalValues[key]);
  }, [formValues, originalValues, initialized]);

  // Get list of modified fields for audit
  const getModifications = () => {
    const mods = [];
    Object.keys(formValues).forEach(key => {
      if (formValues[key] !== originalValues[key] && !key.endsWith('_unit')) {
        mods.push({
          field: key,
          old_value: originalValues[key],
          new_value: formValues[key]
        });
      }
    });
    return mods;
  };

  // Handle field change
  const handleChange = (field, value) => {
    setFormValues(prev => ({ ...prev, [field]: value }));
  };

  // Handle approve
  const handleApprove = async () => {
    setProcessing(true);
    try {
      const payload = {
        action: 'approve',
        comment: comment || (hasModifications ? 'Approved with modifications' : 'Approved'),
      };

      if (hasModifications) {
        payload.updated_data = {
          inputs: {},
          approver_modifications: getModifications()
        };
        
        // Rebuild inputs in the expected format
        Object.entries(dynamicInputs).forEach(([key]) => {
          payload.updated_data.inputs[key] = {
            value: formValues[key],
            unit: formValues[`${key}_unit`] || dynamicInputs[key]?.unit || ''
          };
        });
      }

      await axios.post(
        `${API}/api/approval-workflows/requests/${item._approval_request_id}/decide`,
        payload,
        { headers: getAuthHeader() }
      );

      toast.success(hasModifications ? 'Approved with modifications' : 'Approved successfully');
      onApproved?.();
      onClose?.();
    } catch (err) {
      console.error('Approve error:', err);
      toast.error(err.response?.data?.detail || 'Failed to approve');
    } finally {
      setProcessing(false);
    }
  };

  // Handle reject
  const handleReject = async () => {
    if (!comment.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    setProcessing(true);
    try {
      await axios.post(
        `${API}/api/approval-workflows/requests/${item._approval_request_id}/decide`,
        { action: 'reject', comment },
        { headers: getAuthHeader() }
      );
      toast.success('Rejected');
      onApproved?.();
      onClose?.();
    } catch (err) {
      console.error('Reject error:', err);
      toast.error(err.response?.data?.detail || 'Failed to reject');
    } finally {
      setProcessing(false);
    }
  };

  // Safety check for entity type
  if (!item || item.entity_type !== 'emission_record') {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <p className="text-stone-600">Invalid record type: {item?.entity_type || 'unknown'}</p>
        <Button variant="outline" className="mt-4" onClick={onClose}>Close</Button>
      </div>
    );
  }

  // Loading state
  if (!initialized || loadingConfig) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-stone-600">Loading...</span>
      </div>
    );
  }

  // Get dynamic field labels
  const getFieldLabel = (key) => {
    const labels = {
      qty: 'Quantity',
      qty_energy: 'Energy Consumed',
      ef: 'Emission Factor',
      ef_quantity_electricity_co2: 'Emission Factor (CO2)',
      cv: 'Calorific Value',
      density: 'Density',
      distance: 'Distance',
      weight: 'Weight',
      spend_amount: 'Spend Amount',
      ppp: 'Purchase Power Value',
      inflation_rate: 'Inflation Rate'
    };
    return labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div className="space-y-5" data-testid="emission-approval-wrapper">
      {/* Header */}
      <div className="bg-stone-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-lg text-stone-800">
            {isUpdate ? 'Update Request' : 'New Submission'} - {snapshot.scope?.toUpperCase()}
          </h3>
          <div className="flex items-center gap-2">
            {hasModifications && (
              <Badge className="bg-amber-100 text-amber-700">Modified</Badge>
            )}
            <Badge variant={isUpdate ? 'secondary' : 'default'}>
              {requestType.toUpperCase()}
            </Badge>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 text-sm text-stone-500">
          <span className="flex items-center gap-1">
            <User className="w-4 h-4" />
            {item.submitted_by_name || item.submitted_by_email || 'Unknown'}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : 'N/A'}
          </span>
          <span className="text-stone-400">|</span>
          <span><strong>Category:</strong> {snapshot.category}</span>
          <span><strong>Facility:</strong> {snapshot.facility_name || snapshot.facility_id}</span>
        </div>
      </div>

      {/* Form Fields */}
      <div className="space-y-4">
        {/* Process Name */}
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Name of Process(es)
          </label>
          <Input
            value={formValues.process_name || ''}
            onChange={(e) => handleChange('process_name', e.target.value)}
            placeholder="Process name"
            disabled={processing}
          />
        </div>

        {/* Dynamic Input Fields */}
        {Object.entries(dynamicInputs).map(([key, val]) => {
          if (!val || typeof val !== 'object') return null;
          const currentUnit = formValues[`${key}_unit`] || val.unit || '';
          const allowedUnits = getAllowedUnits(key);
          const hasUnitOptions = allowedUnits.length > 0;
          
          return (
            <div key={key}>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                {getFieldLabel(key)} {currentUnit && <span className="text-stone-400">({currentUnit})</span>}
              </label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="any"
                  value={formValues[key] ?? ''}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder={`Enter ${getFieldLabel(key).toLowerCase()}`}
                  disabled={processing}
                  className="flex-1"
                />
                {hasUnitOptions ? (
                  <Select
                    value={currentUnit}
                    onValueChange={(value) => handleChange(`${key}_unit`, value)}
                    disabled={processing}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedUnits.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={currentUnit}
                    onChange={(e) => handleChange(`${key}_unit`, e.target.value)}
                    placeholder="Unit"
                    disabled={processing}
                    className="w-28"
                  />
                )}
              </div>
            </div>
          );
        })}

        {/* Person Responsible */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Person Responsible
            </label>
            <Input
              value={formValues.responsible_person || ''}
              onChange={(e) => handleChange('responsible_person', e.target.value)}
              placeholder="Name"
              disabled={processing}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Designation
            </label>
            <Input
              value={formValues.designation || ''}
              onChange={(e) => handleChange('designation', e.target.value)}
              placeholder="e.g., Environmental Manager"
              disabled={processing}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Contact
            </label>
            <Input
              value={formValues.contact || ''}
              onChange={(e) => handleChange('contact', e.target.value)}
              placeholder="Email or phone"
              disabled={processing}
            />
          </div>
        </div>

        {/* Source of Information */}
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Source of Information
          </label>
          <Input
            value={formValues.source_of_information || ''}
            onChange={(e) => handleChange('source_of_information', e.target.value)}
            placeholder="e.g., Invoice #4521, meter reading"
            disabled={processing}
          />
        </div>

        {/* Evidence Documents */}
        {evidenceFiles.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Evidence Documents ({evidenceFiles.length})
            </label>
            <div className="space-y-2">
              {evidenceFiles.map((file, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center justify-between p-3 bg-stone-50 rounded-lg border"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-stone-500" />
                    <span className="text-sm text-stone-700">
                      {file.name || file.filename || `Evidence ${idx + 1}`}
                    </span>
                  </div>
                  <a
                    href={file.url || file.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modifications Summary */}
        {hasModifications && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm font-medium text-amber-800 mb-2">
              Your modifications will be recorded:
            </p>
            <ul className="text-sm text-amber-700 space-y-1">
              {getModifications().map((mod, idx) => (
                <li key={idx}>
                  • <strong>{getFieldLabel(mod.field)}:</strong>{' '}
                  {mod.old_value || '(empty)'} → {mod.new_value || '(empty)'}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Comment */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Comment {!hasModifications && '(required for rejection)'}
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={hasModifications ? 'Explain your modifications...' : 'Add a comment...'}
          className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          disabled={processing}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-3 border-t">
        <Button variant="outline" onClick={onClose} disabled={processing}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={handleReject}
          disabled={processing}
          data-testid="reject-btn"
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
          Reject
        </Button>
        <Button
          onClick={handleApprove}
          disabled={processing}
          className={hasModifications ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}
          data-testid="approve-btn"
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          {hasModifications ? 'Approve with Changes' : 'Approve'}
        </Button>
      </div>
    </div>
  );
}
