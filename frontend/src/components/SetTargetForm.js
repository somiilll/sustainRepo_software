/**
 * SetTargetForm — Dedicated Set Target data entry form
 *
 * Same header as Add Metric: Category, Subcategory, Facility, Reporting Period, Financial Year, Month
 * Fields come from target_overrides in organization_config (falls back to defaults).
 * Saves to configured_metric_records collection with feature_type="set_target".
 * Does NOT touch environment_records, workflow tasks, or approval system.
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { toast } from 'sonner';
import { Save, Loader2, Plus, Trash2, FileText, List } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const MONTHS = ['April','May','June','July','August','September','October','November','December','January','February','March'];

function getCurrentFY() {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `FY ${year}-${year + 1}`;
}

export default function SetTargetForm({ section = 'environment', preFilterCategory = '', preFilterSubcategory = '' }) {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [categories, setCategories] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [targetFields, setTargetFields] = useState([]);
  const [fieldSource, setFieldSource] = useState('');
  const [records, setRecords] = useState([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [activeTab, setActiveTab] = useState('form');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form state
  const [selectedCategory, setSelectedCategory] = useState(preFilterCategory);
  const [selectedSubcategory, setSelectedSubcategory] = useState(preFilterSubcategory);
  const [selectedFacility, setSelectedFacility] = useState('org_level');
  const [financialYear, setFinancialYear] = useState(getCurrentFY());
  const [selectedMonth, setSelectedMonth] = useState('');
  const [fieldValues, setFieldValues] = useState({});

  // Fetch categories and facilities
  useEffect(() => {
    if (!token) return;
    Promise.all([
      axios.get(`${API}/esg-records/categories/${section}`, { headers }),
      axios.get(`${API}/facilities`, { headers }).catch(() => ({ data: [] })),
    ]).then(([catRes, facRes]) => {
      setCategories(catRes.data?.categories || []);
      setFacilities(Array.isArray(facRes.data) ? facRes.data : facRes.data?.facilities || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [token, section]);

  // Auto-select category/subcategory from preFilter
  useEffect(() => {
    if (preFilterCategory) setSelectedCategory(preFilterCategory);
    if (preFilterSubcategory) setSelectedSubcategory(preFilterSubcategory);
  }, [preFilterCategory, preFilterSubcategory]);

  // Derive unique categories and subcategories
  const uniqueCategories = [...new Set(categories.map(c => c.category))];
  const filteredSubcats = categories.filter(c => c.category === selectedCategory);

  // Fetch target fields when subcategory changes
  useEffect(() => {
    if (!token || !selectedSubcategory) return;
    const toCode = (n) => (n || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const subCode = toCode(selectedSubcategory);
    axios.get(`${API}/sustainability-config/target-fields/${subCode}`, { headers })
      .then(res => {
        setTargetFields(res.data?.fields || []);
        setFieldSource(res.data?.source || 'default');
        setFieldValues({});
      })
      .catch(() => {
        setTargetFields([]);
        setFieldSource('default');
      });
  }, [token, selectedSubcategory]);

  // Fetch existing target records
  const fetchRecords = useCallback(async () => {
    if (!token) return;
    const params = { feature_type: 'set_target', section };
    if (selectedCategory) params.category = selectedCategory;
    if (selectedSubcategory) params.subcategory = selectedSubcategory;
    try {
      const { data } = await axios.get(`${API}/sustainability-config/configured-records`, { headers, params });
      setRecords(data.records || []);
      setRecordsTotal(data.total || 0);
    } catch { /* ignore */ }
  }, [token, section, selectedCategory, selectedSubcategory]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const handleFieldChange = (code, value) => {
    setFieldValues(prev => ({ ...prev, [code]: value }));
  };

  const handleSubmit = async () => {
    if (!selectedCategory || !selectedMonth) {
      toast.error('Please select category and month');
      return;
    }
    // Validate required fields
    for (const f of targetFields) {
      if (f.required && !fieldValues[f.field_code]) {
        toast.error(`${f.label} is required`);
        return;
      }
    }

    setSaving(true);
    try {
      const toCode = (n) => (n || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      await axios.post(`${API}/sustainability-config/configured-records`, {
        feature_type: 'set_target',
        section,
        category: selectedCategory,
        subcategory: selectedSubcategory || null,
        category_code: toCode(selectedSubcategory || selectedCategory),
        facility_id: selectedFacility === 'org_level' ? null : selectedFacility,
        record_level: selectedFacility === 'org_level' ? 'organization' : 'facility',
        reporting_period: {
          reporting_type: 'monthly',
          financial_year: financialYear,
          month: selectedMonth,
        },
        field_values: fieldValues,
        status: 'completed',
      }, { headers });
      toast.success('Target saved');
      setFieldValues({});
      setSelectedMonth('');
      fetchRecords();
      setActiveTab('log');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save target');
    }
    setSaving(false);
  };

  const deleteRecord = async (id) => {
    if (!window.confirm('Delete this target record?')) return;
    try {
      await axios.delete(`${API}/sustainability-config/configured-records/${id}`, { headers });
      toast.success('Deleted');
      fetchRecords();
    } catch { toast.error('Failed to delete'); }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>;

  return (
    <div className="space-y-4" data-testid="set-target-form">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="form" className="gap-1.5"><Plus className="h-4 w-4" /> Set Target</TabsTrigger>
          <TabsTrigger value="log" className="gap-1.5"><List className="h-4 w-4" /> Target Log</TabsTrigger>
        </TabsList>

        <TabsContent value="form" className="mt-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-stone-800 mb-4">Set Target</h3>

            {/* Standard header — same as Add Metric */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Category */}
              <div>
                <Label>Category</Label>
                <Select value={selectedCategory} onValueChange={(v) => { setSelectedCategory(v); setSelectedSubcategory(''); }} disabled={!!preFilterCategory}>
                  <SelectTrigger data-testid="target-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{uniqueCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {/* Subcategory */}
              <div>
                <Label>Subcategory</Label>
                <Select value={selectedSubcategory} onValueChange={setSelectedSubcategory} disabled={!!preFilterSubcategory}>
                  <SelectTrigger data-testid="target-subcategory"><SelectValue placeholder="Select subcategory" /></SelectTrigger>
                  <SelectContent>{filteredSubcats.map(c => <SelectItem key={c.subcategory || c.category} value={c.subcategory || c.category}>{c.subcategory || c.category}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {/* Facility */}
              <div>
                <Label>Facility</Label>
                <Select value={selectedFacility} onValueChange={setSelectedFacility}>
                  <SelectTrigger data-testid="target-facility"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="org_level">Organization level</SelectItem>
                    {facilities.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Reporting Period */}
              <div>
                <Label>Reporting Period</Label>
                <Input value="Monthly" disabled className="bg-stone-50" />
              </div>

              {/* Financial Year */}
              <div>
                <Label>Financial Year</Label>
                <Input value={financialYear} onChange={e => setFinancialYear(e.target.value)} data-testid="target-fy" />
              </div>

              {/* Month */}
              <div>
                <Label>Month <span className="text-red-500">*</span></Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger data-testid="target-month"><SelectValue placeholder="Select month" /></SelectTrigger>
                  <SelectContent>{MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Target-specific fields */}
            {targetFields.length > 0 && (
              <div className="border-t pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="text-sm font-semibold text-stone-700">Target Fields</h4>
                  <Badge variant="outline" className="text-xs">{fieldSource === 'org_override' ? 'Org-Specific' : 'Default'}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {targetFields.map(f => (
                    <div key={f.field_code}>
                      <Label>
                        {f.label}
                        {f.unit && <span className="text-stone-400 ml-1">({f.unit})</span>}
                        {f.required && <span className="text-red-500 ml-0.5">*</span>}
                      </Label>
                      {f.response_type === 'percentage' ? (
                        <div className="flex items-center gap-2">
                          <Input type="number" min={0} max={100} step="0.01" value={fieldValues[f.field_code] || ''} onChange={e => handleFieldChange(f.field_code, e.target.value ? parseFloat(e.target.value) : '')} data-testid={`target-field-${f.field_code}`} />
                          <span className="text-sm text-stone-500">%</span>
                        </div>
                      ) : f.response_type === 'number' || f.response_type === 'integer' ? (
                        <Input type="number" value={fieldValues[f.field_code] || ''} onChange={e => handleFieldChange(f.field_code, e.target.value ? parseFloat(e.target.value) : '')} data-testid={`target-field-${f.field_code}`} />
                      ) : (
                        <Input value={fieldValues[f.field_code] || ''} onChange={e => handleFieldChange(f.field_code, e.target.value)} data-testid={`target-field-${f.field_code}`} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Submit */}
            <div className="flex gap-3 mt-6">
              <Button onClick={handleSubmit} disabled={saving} data-testid="target-submit">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Save Target
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="log" className="mt-4">
          <Card className="p-4" data-testid="target-log">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-stone-800">Target Records</h3>
              <Badge variant="outline">{recordsTotal} records</Badge>
            </div>
            {records.length === 0 ? (
              <p className="text-center py-8 text-stone-400 text-sm">No target records yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Subcategory</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Facility</TableHead>
                    <TableHead>Values</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-16">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map(rec => (
                    <TableRow key={rec.id}>
                      <TableCell className="text-sm">{rec.category}</TableCell>
                      <TableCell className="text-sm">{rec.subcategory || '—'}</TableCell>
                      <TableCell className="text-sm">{rec.reporting_period?.month} {rec.reporting_period?.financial_year}</TableCell>
                      <TableCell className="text-sm">{rec.facility_id ? 'Facility' : 'Org'}</TableCell>
                      <TableCell className="text-xs font-mono">
                        {Object.entries(rec.field_values || {}).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ')}
                      </TableCell>
                      <TableCell className="text-xs text-stone-500">{rec.created_at ? new Date(rec.created_at).toLocaleDateString() : '—'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="text-red-500" onClick={() => deleteRecord(rec.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
