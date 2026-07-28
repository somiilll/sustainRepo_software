/**
 * EmissionApprovalForm - Reuses the emission edit form for approval workflow
 * 
 * This component wraps the emission form to allow approvers to:
 * 1. View the submitted emission data in the familiar edit form format
 * 2. Make modifications to inputs and overrides
 * 3. Recalculate emissions
 * 4. Approve with tracked modifications or reject
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Calculator,
  FileText,
  Download,
  Info,
  Clock,
  User,
  AlertTriangle,
  BarChart3
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * Scope-specific form components
 */
function Scope1Form({ data, editedData, onChange, fuelDatabase, centralizedUnits, readOnly }) {
  const inputs = editedData.inputs || data.inputs || data.dynamic_field_values || {};
  
  // Find the quantity field (usually 'qty' or 'qty_energy')
  const qtyField = inputs.qty || inputs.qty_energy || {};
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-sm text-stone-600">Facility</Label>
          <p className="font-medium">{data.facility_name || data.facility_id || '-'}</p>
        </div>
        <div>
          <Label className="text-sm text-stone-600">Reporting Period</Label>
          <p className="font-medium">{data.reporting_period || '-'}</p>
        </div>
        <div>
          <Label className="text-sm text-stone-600">Category</Label>
          <p className="font-medium">{data.category || '-'}</p>
        </div>
        <div>
          <Label className="text-sm text-stone-600">Sub-category / Fuel</Label>
          <p className="font-medium">{data.sub_category || data.fuel_type || '-'}</p>
        </div>
      </div>
      
      {/* Dynamic Input Fields */}
      <div className="border rounded-lg p-4 space-y-3">
        <h4 className="font-medium text-sm text-stone-700">Input Data</h4>
        {Object.entries(inputs).map(([key, field]) => (
          <div key={key} className="flex items-center gap-3">
            <Label className="w-40 text-sm capitalize">{key.replace(/_/g, ' ')}</Label>
            {readOnly ? (
              <p className="font-medium">{field?.value || 0} {field?.unit || ''}</p>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={editedData.inputs?.[key]?.value ?? field?.value ?? ''}
                  onChange={(e) => onChange('inputs', key, { ...field, value: parseFloat(e.target.value) || 0 })}
                  className="w-32"
                  data-testid={`input-${key}`}
                />
                <span className="text-sm text-stone-500">{field?.unit || ''}</span>
              </div>
            )}
          </div>
        ))}
        {Object.keys(inputs).length === 0 && (
          <p className="text-stone-400 text-sm">No input fields recorded</p>
        )}
      </div>
      
      {/* Override Section */}
      <div className="border rounded-lg p-4 space-y-3">
        <h4 className="font-medium text-sm text-stone-700">Emission Factor Override</h4>
        <div className="flex items-center gap-3">
          <Checkbox
            id="override-ef"
            checked={editedData.has_custom_ef ?? data.has_custom_ef ?? false}
            onCheckedChange={(checked) => onChange('has_custom_ef', null, checked)}
            disabled={readOnly}
            data-testid="override-checkbox"
          />
          <Label htmlFor="override-ef" className="text-sm">Use Custom Emission Factor</Label>
        </div>
        {(editedData.has_custom_ef ?? data.has_custom_ef) && (
          <div className="flex items-center gap-3 pl-6">
            <Label className="text-sm">Custom EF:</Label>
            {readOnly ? (
              <p className="font-medium">{editedData.emission_factor_used ?? data.emission_factor_used ?? '-'}</p>
            ) : (
              <Input
                type="number"
                value={editedData.emission_factor_used ?? data.emission_factor_used ?? ''}
                onChange={(e) => onChange('emission_factor_used', null, parseFloat(e.target.value) || 0)}
                className="w-32"
                data-testid="custom-ef-input"
              />
            )}
            <span className="text-sm text-stone-500">kgCO2/unit</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Scope2Form({ data, editedData, onChange, readOnly }) {
  const inputs = editedData.inputs || data.inputs || data.dynamic_field_values || {};
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-sm text-stone-600">Facility</Label>
          <p className="font-medium">{data.facility_name || data.facility_id || '-'}</p>
        </div>
        <div>
          <Label className="text-sm text-stone-600">Reporting Period</Label>
          <p className="font-medium">{data.reporting_period || '-'}</p>
        </div>
        <div>
          <Label className="text-sm text-stone-600">Category</Label>
          <p className="font-medium">{data.category || '-'}</p>
        </div>
        <div>
          <Label className="text-sm text-stone-600">Sub-category</Label>
          <p className="font-medium">{data.sub_category || '-'}</p>
        </div>
      </div>
      
      {/* Dynamic Input Fields */}
      <div className="border rounded-lg p-4 space-y-3">
        <h4 className="font-medium text-sm text-stone-700">Input Data</h4>
        {Object.entries(inputs).map(([key, field]) => (
          <div key={key} className="flex items-center gap-3">
            <Label className="w-40 text-sm capitalize">{key.replace(/_/g, ' ')}</Label>
            {readOnly ? (
              <p className="font-medium">{field?.value || 0} {field?.unit || ''}</p>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={editedData.inputs?.[key]?.value ?? field?.value ?? ''}
                  onChange={(e) => onChange('inputs', key, { ...field, value: parseFloat(e.target.value) || 0 })}
                  className="w-32"
                  data-testid={`input-${key}`}
                />
                <span className="text-sm text-stone-500">{field?.unit || ''}</span>
              </div>
            )}
          </div>
        ))}
        {Object.keys(inputs).length === 0 && (
          <p className="text-stone-400 text-sm">No input fields recorded</p>
        )}
      </div>
      
      {/* Override Section */}
      <div className="border rounded-lg p-4 space-y-3">
        <h4 className="font-medium text-sm text-stone-700">Emission Factor Override</h4>
        <div className="flex items-center gap-3">
          <Checkbox
            id="override-ef"
            checked={editedData.has_custom_ef ?? data.has_custom_ef ?? false}
            onCheckedChange={(checked) => onChange('has_custom_ef', null, checked)}
            disabled={readOnly}
            data-testid="override-checkbox"
          />
          <Label htmlFor="override-ef" className="text-sm">Use Custom Emission Factor</Label>
        </div>
        {(editedData.has_custom_ef ?? data.has_custom_ef) && (
          <div className="flex items-center gap-3 pl-6">
            <Label className="text-sm">Custom EF:</Label>
            {readOnly ? (
              <p className="font-medium">{editedData.emission_factor_used ?? data.emission_factor_used ?? '-'}</p>
            ) : (
              <Input
                type="number"
                value={editedData.emission_factor_used ?? data.emission_factor_used ?? ''}
                onChange={(e) => onChange('emission_factor_used', null, parseFloat(e.target.value) || 0)}
                className="w-32"
                data-testid="custom-ef-input"
              />
            )}
            <span className="text-sm text-stone-500">kgCO2/kWh</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Scope3Form({ data, editedData, onChange, readOnly }) {
  const inputs = editedData.inputs || data.inputs || data.dynamic_field_values || {};
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-sm text-stone-600">Facility</Label>
          <p className="font-medium">{data.facility_name || data.facility_id || '-'}</p>
        </div>
        <div>
          <Label className="text-sm text-stone-600">Reporting Period</Label>
          <p className="font-medium">{data.reporting_period || '-'}</p>
        </div>
        <div>
          <Label className="text-sm text-stone-600">Category</Label>
          <p className="font-medium">{data.category || '-'}</p>
        </div>
        <div>
          <Label className="text-sm text-stone-600">Calculation Method</Label>
          <p className="font-medium">{data.calculation_method_scope3 || '-'}</p>
        </div>
        <div>
          <Label className="text-sm text-stone-600">Activity</Label>
          <p className="font-medium">{data.scope3_activity || data.sub_category || '-'}</p>
        </div>
      </div>
      
      {/* Dynamic Input Fields */}
      <div className="border rounded-lg p-4 space-y-3">
        <h4 className="font-medium text-sm text-stone-700">Input Data</h4>
        {Object.entries(inputs).map(([key, field]) => (
          <div key={key} className="flex items-center gap-3">
            <Label className="w-40 text-sm capitalize">{key.replace(/_/g, ' ')}</Label>
            {readOnly ? (
              <p className="font-medium">{field?.value || 0} {field?.unit || ''}</p>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={editedData.inputs?.[key]?.value ?? field?.value ?? ''}
                  onChange={(e) => onChange('inputs', key, { ...field, value: parseFloat(e.target.value) || 0 })}
                  className="w-32"
                  data-testid={`input-${key}`}
                />
                <span className="text-sm text-stone-500">{field?.unit || ''}</span>
              </div>
            )}
          </div>
        ))}
        {Object.keys(inputs).length === 0 && (
          <p className="text-stone-400 text-sm">No input fields recorded</p>
        )}
      </div>
      
      {/* Override Section */}
      <div className="border rounded-lg p-4 space-y-3">
        <h4 className="font-medium text-sm text-stone-700">Emission Factor Override</h4>
        <div className="flex items-center gap-3">
          <Checkbox
            id="override-ef"
            checked={editedData.has_custom_ef ?? data.has_custom_ef ?? false}
            onCheckedChange={(checked) => onChange('has_custom_ef', null, checked)}
            disabled={readOnly}
            data-testid="override-checkbox"
          />
          <Label htmlFor="override-ef" className="text-sm">Use Custom Emission Factor</Label>
        </div>
        {(editedData.has_custom_ef ?? data.has_custom_ef) && (
          <div className="flex items-center gap-3 pl-6">
            <Label className="text-sm">Custom EF:</Label>
            {readOnly ? (
              <p className="font-medium">{editedData.emission_factor_used ?? data.emission_factor_used ?? '-'}</p>
            ) : (
              <Input
                type="number"
                value={editedData.emission_factor_used ?? data.emission_factor_used ?? ''}
                onChange={(e) => onChange('emission_factor_used', null, parseFloat(e.target.value) || 0)}
                className="w-32"
                data-testid="custom-ef-input"
              />
            )}
            <span className="text-sm text-stone-500">kgCO2e/unit</span>
          </div>
        )}
      </div>
    </div>
  );
}

function BiogenicForm({ data, editedData, onChange, readOnly }) {
  const inputs = editedData.inputs || data.inputs || data.dynamic_field_values || {};
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-sm text-stone-600">Facility</Label>
          <p className="font-medium">{data.facility_name || data.facility_id || '-'}</p>
        </div>
        <div>
          <Label className="text-sm text-stone-600">Reporting Period</Label>
          <p className="font-medium">{data.reporting_period || '-'}</p>
        </div>
        <div>
          <Label className="text-sm text-stone-600">Type</Label>
          <p className="font-medium">{data.biogenic_scope_selection === 'scope1' ? 'Direct' : 'Indirect'}</p>
        </div>
        <div>
          <Label className="text-sm text-stone-600">Category</Label>
          <p className="font-medium">{data.category || '-'}</p>
        </div>
        <div>
          <Label className="text-sm text-stone-600">Fuel / Activity</Label>
          <p className="font-medium">{data.fuel_type || data.sub_category || data.scope3_activity || '-'}</p>
        </div>
      </div>
      
      {/* Dynamic Input Fields */}
      <div className="border rounded-lg p-4 space-y-3">
        <h4 className="font-medium text-sm text-stone-700">Input Data</h4>
        {Object.entries(inputs).map(([key, field]) => (
          <div key={key} className="flex items-center gap-3">
            <Label className="w-40 text-sm capitalize">{key.replace(/_/g, ' ')}</Label>
            {readOnly ? (
              <p className="font-medium">{field?.value || 0} {field?.unit || ''}</p>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={editedData.inputs?.[key]?.value ?? field?.value ?? ''}
                  onChange={(e) => onChange('inputs', key, { ...field, value: parseFloat(e.target.value) || 0 })}
                  className="w-32"
                  data-testid={`input-${key}`}
                />
                <span className="text-sm text-stone-500">{field?.unit || ''}</span>
              </div>
            )}
          </div>
        ))}
        {Object.keys(inputs).length === 0 && (
          <p className="text-stone-400 text-sm">No input fields recorded</p>
        )}
      </div>
      
      {/* Override Section */}
      <div className="border rounded-lg p-4 space-y-3">
        <h4 className="font-medium text-sm text-stone-700">Emission Factor Override</h4>
        <div className="flex items-center gap-3">
          <Checkbox
            id="override-ef"
            checked={editedData.has_custom_ef ?? data.has_custom_ef ?? false}
            onCheckedChange={(checked) => onChange('has_custom_ef', null, checked)}
            disabled={readOnly}
            data-testid="override-checkbox"
          />
          <Label htmlFor="override-ef" className="text-sm">Use Custom Emission Factor</Label>
        </div>
        {(editedData.has_custom_ef ?? data.has_custom_ef) && (
          <div className="flex items-center gap-3 pl-6">
            <Label className="text-sm">Custom EF:</Label>
            {readOnly ? (
              <p className="font-medium">{editedData.emission_factor_used ?? data.emission_factor_used ?? '-'}</p>
            ) : (
              <Input
                type="number"
                value={editedData.emission_factor_used ?? data.emission_factor_used ?? ''}
                onChange={(e) => onChange('emission_factor_used', null, parseFloat(e.target.value) || 0)}
                className="w-32"
                data-testid="custom-ef-input"
              />
            )}
            <span className="text-sm text-stone-500">kgCO2/unit</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Main EmissionApprovalForm component
 */
export default function EmissionApprovalForm({ 
  item, 
  onClose, 
  onApproved, 
  getAuthHeader 
}) {
  const [processing, setProcessing] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [comment, setComment] = useState('');
  const [activeTab, setActiveTab] = useState('form');
  const [readOnly, setReadOnly] = useState(true);
  
  // Get snapshot data
  const snapshot = item.entity_snapshot || {};
  const requestType = item.request_type || snapshot.edit_type || 'create';
  const isUpdate = requestType === 'update';
  const scope = snapshot.scope || 'scope1';
  
  // Original data for comparison
  const originalData = useMemo(() => ({
    inputs: snapshot.inputs || snapshot.dynamic_field_values || {},
    has_custom_ef: snapshot.has_custom_ef || false,
    emission_factor_used: snapshot.emission_factor_used || null,
    co2_emissions: snapshot.co2_emissions,
    ch4_emissions: snapshot.ch4_emissions,
    n2o_emissions: snapshot.n2o_emissions,
    total_emissions: snapshot.total_emissions || snapshot.co2e_emissions,
  }), [snapshot]);
  
  // Edited data state
  const [editedData, setEditedData] = useState({
    inputs: { ...originalData.inputs },
    has_custom_ef: originalData.has_custom_ef,
    emission_factor_used: originalData.emission_factor_used,
    co2_emissions: originalData.co2_emissions,
    ch4_emissions: originalData.ch4_emissions,
    n2o_emissions: originalData.n2o_emissions,
    total_emissions: originalData.total_emissions,
  });
  
  // Track modifications
  const hasModifications = useMemo(() => {
    // Check inputs
    const origInputs = originalData.inputs || {};
    const editInputs = editedData.inputs || {};
    
    for (const key of Object.keys(editInputs)) {
      if (editInputs[key]?.value !== origInputs[key]?.value) {
        return true;
      }
    }
    
    // Check override
    if (editedData.has_custom_ef !== originalData.has_custom_ef) return true;
    if (editedData.has_custom_ef && editedData.emission_factor_used !== originalData.emission_factor_used) return true;
    
    return false;
  }, [editedData, originalData]);
  
  // Build modification audit trail
  const getModificationAudit = useCallback(() => {
    const modifications = [];
    const origInputs = originalData.inputs || {};
    const editInputs = editedData.inputs || {};
    
    // Input changes
    for (const key of Object.keys(editInputs)) {
      const oldVal = origInputs[key]?.value;
      const newVal = editInputs[key]?.value;
      if (oldVal !== newVal) {
        modifications.push({
          field: key,
          old_value: oldVal,
          new_value: newVal,
          unit: editInputs[key]?.unit
        });
      }
    }
    
    // Override changes
    if (editedData.has_custom_ef !== originalData.has_custom_ef) {
      modifications.push({
        field: 'emission_factor_override',
        old_value: originalData.has_custom_ef ? 'Enabled' : 'Disabled',
        new_value: editedData.has_custom_ef ? 'Enabled' : 'Disabled'
      });
    }
    if (editedData.has_custom_ef && editedData.emission_factor_used !== originalData.emission_factor_used) {
      modifications.push({
        field: 'custom_emission_factor',
        old_value: originalData.emission_factor_used || 'N/A',
        new_value: editedData.emission_factor_used
      });
    }
    
    return modifications;
  }, [editedData, originalData]);
  
  // Handle field change
  const handleChange = useCallback((field, subKey, value) => {
    setEditedData(prev => {
      if (field === 'inputs' && subKey) {
        return {
          ...prev,
          inputs: { ...prev.inputs, [subKey]: value }
        };
      }
      return { ...prev, [field]: value };
    });
  }, []);
  
  // Reset to original
  const handleReset = useCallback(() => {
    setEditedData({
      inputs: { ...originalData.inputs },
      has_custom_ef: originalData.has_custom_ef,
      emission_factor_used: originalData.emission_factor_used,
      co2_emissions: originalData.co2_emissions,
      ch4_emissions: originalData.ch4_emissions,
      n2o_emissions: originalData.n2o_emissions,
      total_emissions: originalData.total_emissions,
    });
    toast.info('Reset to original values');
  }, [originalData]);
  
  // Recalculate emissions
  const handleRecalculate = async () => {
    setCalculating(true);
    try {
      const response = await axios.post(
        `${API}/api/calc-engine/execute-by-category`,
        {
          category_id: snapshot.category_id,
          inputs: editedData.inputs,
          context: {
            scope: snapshot.scope,
            category: snapshot.category,
            fuel_name: snapshot.fuel_type || snapshot.sub_category
          },
          user_overrides: editedData.has_custom_ef && editedData.emission_factor_used ? {
            ef: { value: parseFloat(editedData.emission_factor_used), unit: 'kgCO2/unit' }
          } : {},
          dry_run: true
        },
        { headers: getAuthHeader() }
      );
      
      if (response.data.ok) {
        const outputs = response.data.outputs || {};
        setEditedData(prev => ({
          ...prev,
          co2_emissions: outputs.co2?.value || 0,
          ch4_emissions: outputs.ch4?.value || 0,
          n2o_emissions: outputs.n2o?.value || 0,
          total_emissions: outputs.co2e?.value || 0,
        }));
        toast.success('Emissions recalculated');
      } else {
        toast.error('Calculation failed');
      }
    } catch (e) {
      console.error('Recalculate error:', e);
      toast.error(e.response?.data?.detail || 'Failed to recalculate');
    }
    setCalculating(false);
  };
  
  // Approve
  const handleApprove = async () => {
    setProcessing(true);
    try {
      const updatedData = hasModifications ? {
        inputs: editedData.inputs,
        emission_factor_override: editedData.has_custom_ef ? {
          enabled: true,
          value: parseFloat(editedData.emission_factor_used) || null
        } : { enabled: false },
        calculated_emissions: {
          co2: editedData.co2_emissions,
          ch4: editedData.ch4_emissions,
          n2o: editedData.n2o_emissions,
          total: editedData.total_emissions,
        },
        approver_modifications: getModificationAudit()
      } : null;
      
      await axios.post(
        `${API}/api/approval-workflows/requests/${item._approval_request_id}/decide`,
        { 
          action: 'approve', 
          comment: comment || (hasModifications ? 'Approved with modifications' : 'Approved'),
          updated_data: updatedData
        },
        { headers: getAuthHeader() }
      );
      toast.success(hasModifications ? 'Approved with modifications' : 'Approved');
      onApproved?.();
      onClose?.();
    } catch (e) {
      console.error('Approve error:', e);
      toast.error(e.response?.data?.detail || 'Failed to approve');
    }
    setProcessing(false);
  };
  
  // Reject
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
    } catch (e) {
      console.error('Reject error:', e);
      toast.error(e.response?.data?.detail || 'Failed to reject');
    }
    setProcessing(false);
  };
  
  // Format emission value
  const formatEmission = (value) => {
    if (value === null || value === undefined) return '-';
    return typeof value === 'number' ? value.toFixed(4) : value;
  };
  
  // Evidence files
  const evidenceFiles = snapshot.evidence_files || [];
  
  // Render scope-specific form
  const renderForm = () => {
    const formProps = {
      data: snapshot,
      editedData,
      onChange: handleChange,
      readOnly,
    };
    
    switch (scope) {
      case 'scope1':
        return <Scope1Form {...formProps} />;
      case 'scope2':
        return <Scope2Form {...formProps} />;
      case 'scope3':
        return <Scope3Form {...formProps} />;
      case 'biogenic':
        return <BiogenicForm {...formProps} />;
      default:
        return <Scope1Form {...formProps} />;
    }
  };
  
  return (
    <div className="space-y-4" data-testid="emission-approval-form">
      {/* Header */}
      <div className="bg-stone-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-teal-600" />
            {isUpdate ? 'Update Request' : 'New Submission'} - {scope.toUpperCase()}
          </h3>
          <div className="flex items-center gap-2">
            {hasModifications && (
              <Badge className="bg-violet-100 text-violet-700">Modified</Badge>
            )}
            <Badge variant={isUpdate ? 'secondary' : 'default'}>
              {requestType.toUpperCase()}
            </Badge>
          </div>
        </div>
        
        <div className="flex items-center gap-4 text-sm text-stone-600">
          <span className="flex items-center gap-1">
            <User className="w-4 h-4" />
            {item.submitted_by_name || item.submitted_by_email}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {item.submitted_at && new Date(item.submitted_at).toLocaleDateString()}
          </span>
        </div>
      </div>
      
      {/* Edit Mode Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            id="edit-mode"
            checked={!readOnly}
            onCheckedChange={(checked) => setReadOnly(!checked)}
            data-testid="edit-mode-toggle"
          />
          <Label htmlFor="edit-mode" className="text-sm font-medium">
            Enable editing (make modifications as approver)
          </Label>
        </div>
        {hasModifications && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-xs"
            data-testid="reset-btn"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Reset to Original
          </Button>
        )}
      </div>
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="form">Form Data</TabsTrigger>
          <TabsTrigger value="emissions">Emissions</TabsTrigger>
          <TabsTrigger value="evidence">Evidence ({evidenceFiles.length})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="form" className="mt-4">
          {renderForm()}
        </TabsContent>
        
        <TabsContent value="emissions" className="mt-4">
          <div className="space-y-4">
            {/* Recalculate Button */}
            {hasModifications && (
              <Alert>
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span>You have made modifications. Recalculate to update emissions.</span>
                  <Button
                    onClick={handleRecalculate}
                    disabled={calculating}
                    size="sm"
                    variant="outline"
                    data-testid="recalculate-btn"
                  >
                    {calculating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Calculator className="w-4 h-4 mr-1" />}
                    Recalculate
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            
            {/* Emissions Display */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Calculated Emissions (tCO2e)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-stone-600">CO2</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatEmission(editedData.co2_emissions)}</span>
                      {editedData.co2_emissions !== originalData.co2_emissions && (
                        <span className="text-stone-400 text-xs line-through">{formatEmission(originalData.co2_emissions)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-stone-600">CH4</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatEmission(editedData.ch4_emissions)}</span>
                      {editedData.ch4_emissions !== originalData.ch4_emissions && (
                        <span className="text-stone-400 text-xs line-through">{formatEmission(originalData.ch4_emissions)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-stone-600">N2O</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatEmission(editedData.n2o_emissions)}</span>
                      {editedData.n2o_emissions !== originalData.n2o_emissions && (
                        <span className="text-stone-400 text-xs line-through">{formatEmission(originalData.n2o_emissions)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-2 font-semibold">
                    <span>Total CO2e</span>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-600">{formatEmission(editedData.total_emissions)}</span>
                      {editedData.total_emissions !== originalData.total_emissions && (
                        <span className="text-stone-400 text-xs line-through">{formatEmission(originalData.total_emissions)}</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="evidence" className="mt-4">
          {evidenceFiles.length > 0 ? (
            <div className="space-y-2">
              {evidenceFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-stone-500" />
                    <span className="text-sm">{file.name || file.filename || `File ${idx + 1}`}</span>
                  </div>
                  <a 
                    href={file.url || file.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-stone-400">
              <FileText className="w-8 h-8 mx-auto mb-2" />
              <p>No evidence files attached</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
      
      {/* Notes */}
      {snapshot.notes && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="text-sm font-medium text-blue-800 mb-1 flex items-center gap-1">
            <Info className="w-4 h-4" />
            Notes from Submitter
          </div>
          <p className="text-sm text-blue-700">{snapshot.notes}</p>
        </div>
      )}
      
      {/* Modification Summary */}
      {hasModifications && (
        <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
          <div className="text-sm font-medium text-violet-800 mb-2 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" />
            Your Modifications (will be recorded in audit trail)
          </div>
          <div className="space-y-1">
            {getModificationAudit().map((mod, idx) => (
              <div key={idx} className="text-sm text-violet-700">
                • <span className="capitalize">{mod.field.replace(/_/g, ' ')}</span>: {mod.old_value} → <span className="font-medium">{mod.new_value}</span> {mod.unit || ''}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Comment */}
      <div>
        <Label className="text-sm font-medium">
          Comment {hasModifications ? '(describe your modifications)' : '(required for rejection)'}
        </Label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={hasModifications ? "Explain your modifications..." : "Add a comment..."}
          className="mt-1 w-full px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          data-testid="approval-comment"
        />
      </div>
      
      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t">
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
          className={hasModifications ? "bg-violet-600 hover:bg-violet-700" : "bg-green-600 hover:bg-green-700"}
          data-testid="approve-btn"
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          {hasModifications ? 'Approve with Modifications' : 'Approve'}
        </Button>
      </div>
    </div>
  );
}
