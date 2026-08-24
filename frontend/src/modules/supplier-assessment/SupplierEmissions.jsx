import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Plus, Cloud, Trash2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SupplierEmissions() {
  const { getAuthHeader } = useAuth();
  const [emissions, setEmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [program, setProgram] = useState({ reporting_period: '', enabled_scopes: ['scope1', 'scope2'], categories: {} });
  
  const [formData, setFormData] = useState({
    reporting_period: '',
    scope: 'scope1',
    category: '',
    category_id: null,
    sub_category: '',
    notes: '',
    dynamic_field_values: {
      qty: { value: '', unit: 'kg' },
    },
  });

  const fetchEmissions = useCallback(async () => {
    try {
      const [emissionsResponse, configResponse] = await Promise.all([
        axios.get(`${API}/supplier-assessment/my-assessment/emissions`, { headers: getAuthHeader() }),
        axios.get(`${API}/supplier-assessment/my-assessment/emissions/config`, { headers: getAuthHeader() }),
      ]);
      setEmissions(emissionsResponse.data || []);
      const nextProgram = configResponse.data || {};
      setProgram(nextProgram);
      setFormData((current) => ({ ...current, reporting_period: nextProgram.reporting_period || '', scope: nextProgram.enabled_scopes?.includes(current.scope) ? current.scope : (nextProgram.enabled_scopes?.[0] || 'scope1') }));
    } catch (err) {
      toast.error('Failed to load emissions');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  useEffect(() => {
    fetchEmissions();
  }, [fetchEmissions]);

  const resetForm = () => {
    setFormData({
      reporting_period: program.reporting_period || '',
      scope: program.enabled_scopes?.[0] || 'scope1',
      category: '',
      category_id: null,
      sub_category: '',
      notes: '',
      dynamic_field_values: {
        qty: { value: '', unit: 'kg' },
      },
    });
  };

  const handleCreate = async () => {
    if (!formData.reporting_period || !formData.category) {
      toast.error('Please fill required fields');
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/supplier-assessment/my-assessment/emissions`, formData, {
        headers: getAuthHeader(),
      });
      toast.success('Emission record created');
      setShowDialog(false);
      resetForm();
      fetchEmissions();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create emission');
    } finally {
      setSubmitting(false);
    }
  };

  const totalScope1 = emissions.filter(e => e.scope === 'scope1').reduce((sum, e) => sum + (e.total_emissions || 0), 0);
  const totalScope2 = emissions.filter(e => e.scope === 'scope2').reduce((sum, e) => sum + (e.total_emissions || 0), 0);
  const categoryOptions = useMemo(() => program.categories?.[formData.scope] || [], [program.categories, formData.scope]);

  return (
    <div className="space-y-6" data-testid="supplier-emissions">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">GHG Emissions</h1>
          <p className="text-sm text-stone-500 mt-1">
            Report your Scope 1 and Scope 2 greenhouse gas emissions
          </p>
        </div>
        <Button onClick={() => setShowDialog(true)} data-testid="add-emission-btn">
          <Plus className="h-4 w-4 mr-2" />
          Add Emission
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-stone-500 mb-2">
              <Cloud className="h-4 w-4" />
              <span className="text-sm">Scope 1</span>
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {totalScope1.toFixed(2)}
              <span className="text-sm font-normal text-stone-500 ml-1">tCO2e</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-stone-500 mb-2">
              <Cloud className="h-4 w-4" />
              <span className="text-sm">Scope 2</span>
            </div>
            <div className="text-2xl font-bold text-emerald-600">
              {totalScope2.toFixed(2)}
              <span className="text-sm font-normal text-stone-500 ml-1">tCO2e</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-stone-500 mb-2">
              <Cloud className="h-4 w-4" />
              <span className="text-sm">Total</span>
            </div>
            <div className="text-2xl font-bold text-purple-600">
              {(totalScope1 + totalScope2).toFixed(2)}
              <span className="text-sm font-normal text-stone-500 ml-1">tCO2e</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Emissions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Emission Records</CardTitle>
          <CardDescription>All your reported emissions in one place</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-stone-500">Loading...</div>
          ) : emissions.length === 0 ? (
            <div className="text-center py-8 text-stone-500">
              <Cloud className="h-12 w-12 mx-auto text-stone-300 mb-4" />
              <p>No emissions recorded yet. Add your first emission record.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Sub-Category</TableHead>
                  <TableHead className="text-right">Emissions (tCO2e)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emissions.map((emission) => (
                  <TableRow key={emission.id}>
                    <TableCell>{emission.reporting_period}</TableCell>
                    <TableCell>
                      <Badge variant={emission.scope === 'scope1' ? 'default' : 'secondary'}>
                        {emission.scope === 'scope1' ? 'Scope 1' : 'Scope 2'}
                      </Badge>
                    </TableCell>
                    <TableCell>{emission.category}</TableCell>
                    <TableCell>{emission.sub_category || '-'}</TableCell>
                    <TableCell className="text-right font-mono">
                      {(emission.total_emissions || 0).toFixed(4)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={emission.status === 'submitted' ? 'default' : 'outline'}>
                        {emission.status || 'draft'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Emission Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Emission Record</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reporting Period *</Label>
              <Input value={formData.reporting_period} readOnly data-testid="emission-period" />
            </div>
            
            <div className="space-y-2">
              <Label>Scope *</Label>
              <Select
                value={formData.scope}
                onValueChange={(v) => setFormData({ ...formData, scope: v, category: '', category_id: null, sub_category: '' })}
              >
                <SelectTrigger data-testid="emission-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(program.enabled_scopes || []).map((scope) => <SelectItem key={scope} value={scope}>{scope === 'scope1' ? 'Scope 1 - Direct Emissions' : 'Scope 2 - Purchased Energy'}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select
                value={formData.category}
                onValueChange={(v) => { const category = categoryOptions.find((option) => option.value === v); setFormData({ ...formData, category: v, category_id: category?.category_id || null }); }}
                disabled={!categoryOptions.length}
              >
                <SelectTrigger data-testid="emission-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!categoryOptions.length && <p className="text-xs text-stone-500" data-testid="emission-category-config-empty">Your customer has not configured a category for this scope.</p>}
            </div>
            
            <div className="space-y-2">
              <Label>Sub-Category</Label>
              <Input
                value={formData.sub_category}
                onChange={(e) => setFormData({ ...formData, sub_category: e.target.value })}
                placeholder="e.g., Natural Gas, Diesel"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={formData.dynamic_field_values.qty.value}
                  onChange={(e) => setFormData({
                    ...formData,
                    dynamic_field_values: {
                      ...formData.dynamic_field_values,
                      qty: { ...formData.dynamic_field_values.qty, value: e.target.value },
                    },
                  })}
                  placeholder="Enter quantity"
                />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select
                  value={formData.dynamic_field_values.qty.unit}
                  onValueChange={(v) => setFormData({
                    ...formData,
                    dynamic_field_values: {
                      ...formData.dynamic_field_values,
                      qty: { ...formData.dynamic_field_values.qty, unit: v },
                    },
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="tonne">tonne</SelectItem>
                    <SelectItem value="L">Litre</SelectItem>
                    <SelectItem value="kWh">kWh</SelectItem>
                    <SelectItem value="MWh">MWh</SelectItem>
                    <SelectItem value="m3">m³</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting || !categoryOptions.length} data-testid="save-emission-btn">
              {submitting ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
