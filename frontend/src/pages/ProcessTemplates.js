import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Plus, Edit, Trash2, FileCode2, ChevronDown, ChevronUp, X, Copy } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DATA_TYPES = ['number', 'text', 'percentage'];

const emptyInputField = () => ({ key: '', label: '', unit: '', data_type: 'number', is_optional: false, default_value: '' });
const emptyPredefinedInput = () => ({ key: '', label: '', unit: '', data_type: 'number', value: '', can_override: true });

export default function ProcessTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const { getAuthHeader } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sub_industry: '',
    formula: '',
    is_active: true
  });
  const [inputFields, setInputFields] = useState([emptyInputField()]);
  const [predefinedInputs, setPredefinedInputs] = useState([]);

  useEffect(() => { fetchTemplates(); }, []);

  const fetchTemplates = async () => {
    try {
      const res = await axios.get(`${API}/super-admin/process-templates`, { headers: getAuthHeader() });
      setTemplates(res.data);
    } catch (err) {
      toast.error('Failed to load process templates');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', description: '', sub_industry: '', formula: '', is_active: true });
    setInputFields([emptyInputField()]);
    setPredefinedInputs([]);
    setEditing(null);
  };

  const handleEdit = (t) => {
    setEditing(t);
    setFormData({ name: t.name, description: t.description || '', sub_industry: t.sub_industry || '', formula: t.formula, is_active: t.is_active });
    setInputFields(t.input_fields.length > 0 ? t.input_fields.map(f => ({ ...emptyInputField(), ...f })) : [emptyInputField()]);
    setPredefinedInputs(t.predefined_inputs.length > 0 ? t.predefined_inputs.map(f => ({ ...emptyPredefinedInput(), ...f })) : []);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this process template?')) return;
    try {
      await axios.delete(`${API}/super-admin/process-templates/${id}`, { headers: getAuthHeader() });
      toast.success('Template deleted');
      fetchTemplates();
    } catch (err) {
      toast.error('Failed to delete template');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.formula) {
      toast.error('Name and Formula are required');
      return;
    }

    // Validate input fields have key and label
    const validInputs = inputFields.filter(f => f.key && f.label);
    const validPredefined = predefinedInputs.filter(f => f.key && f.label && f.value);

    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        input_fields: validInputs,
        predefined_inputs: validPredefined
      };

      if (editing) {
        await axios.put(`${API}/super-admin/process-templates/${editing.id}`, payload, { headers: getAuthHeader() });
        toast.success('Template updated');
      } else {
        await axios.post(`${API}/super-admin/process-templates`, payload, { headers: getAuthHeader() });
        toast.success('Template created');
      }
      setDialogOpen(false);
      resetForm();
      fetchTemplates();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save template');
    } finally {
      setSubmitting(false);
    }
  };

  // Input field helpers
  const updateInputField = (idx, field, value) => {
    setInputFields(prev => prev.map((f, i) => {
      if (i !== idx) return f;
      const updated = { ...f, [field]: value };
      // Auto-generate key from label
      if (field === 'label') updated.key = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      return updated;
    }));
  };

  const addInputField = () => setInputFields(prev => [...prev, emptyInputField()]);
  const removeInputField = (idx) => setInputFields(prev => prev.filter((_, i) => i !== idx));

  // Predefined input helpers
  const updatePredefinedInput = (idx, field, value) => {
    setPredefinedInputs(prev => prev.map((f, i) => {
      if (i !== idx) return f;
      const updated = { ...f, [field]: value };
      if (field === 'label') updated.key = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      return updated;
    }));
  };

  const addPredefinedInput = () => setPredefinedInputs(prev => [...prev, emptyPredefinedInput()]);
  const removePredefinedInput = (idx) => setPredefinedInputs(prev => prev.filter((_, i) => i !== idx));

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="space-y-6" data-testid="process-templates-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Process Templates</h1>
          <p className="text-text-secondary">Configure reusable templates for process emission calculations</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-white" onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="add-template-btn">
          <Plus className="w-4 h-4 mr-2" />Add Template
        </Button>
      </div>

      {/* Templates List */}
      {templates.length > 0 ? (
        <div className="space-y-3">
          {templates.map((t) => {
            const isExpanded = expandedId === t.id;
            return (
              <Card key={t.id} className="border border-stone-200 rounded-xl bg-white overflow-hidden" data-testid={`template-card-${t.id}`}>
                <div className="p-5 flex items-start justify-between cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : t.id)}>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <FileCode2 className="w-5 h-5 text-primary" />
                      <h3 className="text-lg font-heading font-bold text-text-primary">{t.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${t.is_active ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                        {t.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {t.sub_industry && <p className="text-xs text-primary/70 ml-8 mb-1">{t.sub_industry}</p>}
                    {t.description && <p className="text-sm text-text-secondary ml-8">{t.description}</p>}
                    <div className="flex gap-4 ml-8 mt-2 text-xs text-text-muted">
                      <span>{t.input_fields.length} input field{t.input_fields.length !== 1 ? 's' : ''}</span>
                      <span>{t.predefined_inputs.length} predefined value{t.predefined_inputs.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleEdit(t); }} className="text-primary" data-testid={`edit-template-${t.id}`}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} className="text-red-500" data-testid={`delete-template-${t.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-stone-200 px-5 py-4 bg-stone-50 space-y-4">
                    {/* Formula */}
                    <div>
                      <Label className="text-xs text-text-muted font-semibold uppercase tracking-wider">Formula</Label>
                      <code className="block mt-1 p-3 bg-white rounded border border-stone-200 text-sm font-mono text-text-primary">{t.formula}</code>
                    </div>

                    {/* Required Input Fields */}
                    {t.input_fields.length > 0 && (
                      <div>
                        <Label className="text-xs text-text-muted font-semibold uppercase tracking-wider">Required Input Fields</Label>
                        <div className="mt-2 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead><tr className="border-b border-stone-200">
                              <th className="text-left py-2 px-3 text-text-muted font-medium">Key</th>
                              <th className="text-left py-2 px-3 text-text-muted font-medium">Label</th>
                              <th className="text-left py-2 px-3 text-text-muted font-medium">Unit</th>
                              <th className="text-left py-2 px-3 text-text-muted font-medium">Type</th>
                              <th className="text-left py-2 px-3 text-text-muted font-medium">Optional</th>
                              <th className="text-left py-2 px-3 text-text-muted font-medium">Default</th>
                            </tr></thead>
                            <tbody>
                              {t.input_fields.map((f, i) => (
                                <tr key={i} className="border-b border-stone-100">
                                  <td className="py-2 px-3 font-mono text-xs text-primary">{f.key}</td>
                                  <td className="py-2 px-3">{f.label}</td>
                                  <td className="py-2 px-3 text-text-muted">{f.unit || '-'}</td>
                                  <td className="py-2 px-3 text-text-muted">{f.data_type}</td>
                                  <td className="py-2 px-3">{f.is_optional ? 'Yes' : 'No'}</td>
                                  <td className="py-2 px-3 text-text-muted">{f.default_value || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Predefined Inputs */}
                    {t.predefined_inputs.length > 0 && (
                      <div>
                        <Label className="text-xs text-text-muted font-semibold uppercase tracking-wider">Predefined Inputs</Label>
                        <div className="mt-2 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead><tr className="border-b border-stone-200">
                              <th className="text-left py-2 px-3 text-text-muted font-medium">Key</th>
                              <th className="text-left py-2 px-3 text-text-muted font-medium">Label</th>
                              <th className="text-left py-2 px-3 text-text-muted font-medium">Value</th>
                              <th className="text-left py-2 px-3 text-text-muted font-medium">Unit</th>
                              <th className="text-left py-2 px-3 text-text-muted font-medium">Override</th>
                            </tr></thead>
                            <tbody>
                              {t.predefined_inputs.map((f, i) => (
                                <tr key={i} className="border-b border-stone-100">
                                  <td className="py-2 px-3 font-mono text-xs text-primary">{f.key}</td>
                                  <td className="py-2 px-3">{f.label}</td>
                                  <td className="py-2 px-3 font-semibold">{f.value}</td>
                                  <td className="py-2 px-3 text-text-muted">{f.unit || '-'}</td>
                                  <td className="py-2 px-3">{f.can_override ? <span className="text-green-600">Yes</span> : <span className="text-red-500">Locked</span>}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-12 border border-stone-200 rounded-xl bg-white text-center">
          <FileCode2 className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-xl font-heading font-bold text-text-primary mb-2">No Process Templates</h3>
          <p className="text-text-secondary mb-4">Create your first process template to define calculation methods for process emissions.</p>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="bg-primary hover:bg-primary/90 text-white" data-testid="add-first-template-btn">
            <Plus className="w-4 h-4 mr-2" />Create First Template
          </Button>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-heading">{editing ? 'Edit Process Template' : 'Create Process Template'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5 py-2">
            {/* Basic Info */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-text-primary border-b pb-1">Basic Information</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Name *</Label>
                  <Input value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Cement - Clinker Production" className="bg-stone-50" data-testid="template-name" />
                </div>
                <div className="space-y-1">
                  <Label>Sub-Industry</Label>
                  <Input value={formData.sub_industry} onChange={(e) => setFormData(p => ({ ...p, sub_industry: e.target.value }))} placeholder="e.g., Cement, Steel, Aluminum" className="bg-stone-50" data-testid="template-sub-industry" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input value={formData.description} onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="Brief description of this calculation method" className="bg-stone-50" data-testid="template-description" />
              </div>
              <div className="space-y-1">
                <Label>Formula Definition *</Label>
                <Input value={formData.formula} onChange={(e) => setFormData(p => ({ ...p, formula: e.target.value }))} placeholder="e.g., clinker_produced * ef_clinker * (1 - ite_calcium_carbonate / 100)" className="bg-stone-50 font-mono text-sm" data-testid="template-formula" />
                <p className="text-xs text-text-muted">Use input field keys as variables. Operators: +, -, *, /, (), ^</p>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={formData.is_active} onCheckedChange={(v) => setFormData(p => ({ ...p, is_active: v }))} data-testid="template-active-toggle" />
                <Label className="text-sm">Active</Label>
              </div>
            </div>

            {/* Required Input Fields */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b pb-1">
                <h4 className="text-sm font-semibold text-text-primary">Required Input Fields</h4>
                <Button type="button" size="sm" variant="outline" onClick={addInputField} data-testid="add-input-field-btn">
                  <Plus className="w-3 h-3 mr-1" />Add Field
                </Button>
              </div>
              {inputFields.map((field, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end p-3 bg-stone-50 rounded-lg border border-stone-200" data-testid={`input-field-${idx}`}>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-xs">Label *</Label>
                    <Input value={field.label} onChange={(e) => updateInputField(idx, 'label', e.target.value)} placeholder="Clinker Produced" className="bg-white text-sm" data-testid={`input-label-${idx}`} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Key</Label>
                    <Input value={field.key} readOnly className="bg-stone-100 text-xs font-mono" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Unit</Label>
                    <Input value={field.unit} onChange={(e) => updateInputField(idx, 'unit', e.target.value)} placeholder="tonnes" className="bg-white text-sm" data-testid={`input-unit-${idx}`} />
                  </div>
                  <div className="col-span-1 space-y-1">
                    <Label className="text-xs">Type</Label>
                    <Select value={field.data_type} onValueChange={(v) => updateInputField(idx, 'data_type', v)}>
                      <SelectTrigger className="bg-white text-xs h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{DATA_TYPES.map(dt => <SelectItem key={dt} value={dt}>{dt}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Default Value</Label>
                    <Input value={field.default_value} onChange={(e) => updateInputField(idx, 'default_value', e.target.value)} placeholder="-" className="bg-white text-sm" data-testid={`input-default-${idx}`} />
                  </div>
                  <div className="col-span-1 flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Switch checked={field.is_optional} onCheckedChange={(v) => updateInputField(idx, 'is_optional', v)} />
                      <span className="text-xs text-text-muted">Opt</span>
                    </div>
                    {inputFields.length > 1 && (
                      <button type="button" onClick={() => removeInputField(idx)} className="text-red-400 hover:text-red-600 p-1" data-testid={`remove-input-${idx}`}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Predefined Inputs */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b pb-1">
                <h4 className="text-sm font-semibold text-text-primary">Predefined Inputs</h4>
                <Button type="button" size="sm" variant="outline" onClick={addPredefinedInput} data-testid="add-predefined-btn">
                  <Plus className="w-3 h-3 mr-1" />Add Predefined
                </Button>
              </div>
              {predefinedInputs.length === 0 && (
                <p className="text-sm text-text-muted py-2 text-center">No predefined inputs. Click "Add Predefined" to add constants or default values.</p>
              )}
              {predefinedInputs.map((field, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end p-3 bg-blue-50 rounded-lg border border-blue-200" data-testid={`predefined-field-${idx}`}>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-xs">Label *</Label>
                    <Input value={field.label} onChange={(e) => updatePredefinedInput(idx, 'label', e.target.value)} placeholder="Emission Factor" className="bg-white text-sm" data-testid={`predefined-label-${idx}`} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Key</Label>
                    <Input value={field.key} readOnly className="bg-stone-100 text-xs font-mono" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Value *</Label>
                    <Input value={field.value} onChange={(e) => updatePredefinedInput(idx, 'value', e.target.value)} placeholder="0.525" className="bg-white text-sm font-semibold" data-testid={`predefined-value-${idx}`} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Unit</Label>
                    <Input value={field.unit} onChange={(e) => updatePredefinedInput(idx, 'unit', e.target.value)} placeholder="tCO2/t" className="bg-white text-sm" data-testid={`predefined-unit-${idx}`} />
                  </div>
                  <div className="col-span-1 space-y-1">
                    <Label className="text-xs">Type</Label>
                    <Select value={field.data_type} onValueChange={(v) => updatePredefinedInput(idx, 'data_type', v)}>
                      <SelectTrigger className="bg-white text-xs h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{DATA_TYPES.map(dt => <SelectItem key={dt} value={dt}>{dt}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Switch checked={field.can_override} onCheckedChange={(v) => updatePredefinedInput(idx, 'can_override', v)} />
                      <span className="text-xs text-text-muted">{field.can_override ? 'Override' : 'Locked'}</span>
                    </div>
                    <button type="button" onClick={() => removePredefinedInput(idx)} className="text-red-400 hover:text-red-600 p-1" data-testid={`remove-predefined-${idx}`}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} className="flex-1" data-testid="template-cancel-btn">Cancel</Button>
              <Button type="submit" disabled={submitting} className="flex-1 bg-primary hover:bg-primary/90 text-white" data-testid="template-save-btn">
                {submitting ? 'Saving...' : editing ? 'Update Template' : 'Create Template'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
