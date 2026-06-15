import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { 
  Package, 
  Plus, 
  Edit2, 
  Trash2, 
  History, 
  Building2, 
  Building,
  Loader2,
  X
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ProductionQuantityModal({ 
  open, 
  onOpenChange, 
  facilities = [],
  getAuthHeader 
}) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyRecordId, setHistoryRecordId] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  
  // Filter state
  const [filterLevel, setFilterLevel] = useState('all'); // 'all', 'organization', 'facility'
  const [filterFacility, setFilterFacility] = useState('all');
  
  // Form state
  const [formData, setFormData] = useState({
    facility_id: '',  // Empty string means organization-level
    reporting_period: '',
    quantity: '',
    unit: '',
    notes: ''
  });
  const [periodType, setPeriodType] = useState('monthly'); // 'monthly', 'fy', 'cy'
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [periodMonth, setPeriodMonth] = useState(new Date().getMonth() + 1);

  const fetchRecords = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      let url = `${API}/production-quantities`;
      if (filterFacility && filterFacility !== 'all') {
        url += `?facility_id=${filterFacility}`;
      }
      const response = await axios.get(url, { headers: getAuthHeader() });
      let data = response.data || [];
      
      // Apply level filter
      if (filterLevel === 'organization') {
        data = data.filter(r => !r.facility_id);
      } else if (filterLevel === 'facility') {
        data = data.filter(r => r.facility_id);
      }
      
      setRecords(data);
    } catch (error) {
      console.error('Error fetching production quantities:', error);
      toast.error('Failed to load production quantities');
    } finally {
      setLoading(false);
    }
  }, [open, filterFacility, filterLevel, getAuthHeader]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const resetForm = useCallback(() => {
    setFormData({
      facility_id: '',
      reporting_period: '',
      quantity: '',
      unit: '',
      notes: ''
    });
    setPeriodType('monthly');
    setPeriodYear(new Date().getFullYear());
    setPeriodMonth(new Date().getMonth() + 1);
    setEditingRecord(null);
  }, []);

  const formatPeriod = () => {
    if (periodType === 'monthly') {
      return `${periodYear}-${String(periodMonth).padStart(2, '0')}`;
    } else if (periodType === 'fy') {
      return `FY ${periodYear}-${String(periodYear + 1).slice(-2)}`;
    } else {
      return `CY ${periodYear}`;
    }
  };

  const parsePeriod = (period) => {
    if (!period) return { type: 'monthly', year: new Date().getFullYear(), month: 1 };
    
    // FY format
    const fyMatch = period.match(/^FY\s*(\d{4})/i);
    if (fyMatch) {
      return { type: 'fy', year: parseInt(fyMatch[1]), month: 4 };
    }
    
    // CY format
    const cyMatch = period.match(/^CY\s*(\d{4})/i);
    if (cyMatch) {
      return { type: 'cy', year: parseInt(cyMatch[1]), month: 1 };
    }
    
    // Monthly format
    const monthlyMatch = period.match(/^(\d{4})-(\d{2})$/);
    if (monthlyMatch) {
      return { type: 'monthly', year: parseInt(monthlyMatch[1]), month: parseInt(monthlyMatch[2]) };
    }
    
    return { type: 'monthly', year: new Date().getFullYear(), month: 1 };
  };

  const handleEdit = (record) => {
    const parsed = parsePeriod(record.reporting_period);
    setPeriodType(parsed.type);
    setPeriodYear(parsed.year);
    setPeriodMonth(parsed.month);
    setFormData({
      facility_id: record.facility_id || '',
      reporting_period: record.reporting_period,
      quantity: record.quantity.toString(),
      unit: record.unit,
      notes: record.notes || ''
    });
    setEditingRecord(record);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const period = formatPeriod();
    const quantity = parseFloat(formData.quantity);
    
    if (!quantity || quantity <= 0) {
      toast.error('Please enter a valid quantity greater than 0');
      return;
    }
    if (!formData.unit.trim()) {
      toast.error('Please enter a unit');
      return;
    }
    
    setSaving(true);
    try {
      const payload = {
        facility_id: formData.facility_id || null,
        reporting_period: period,
        quantity: quantity,
        unit: formData.unit.trim(),
        notes: formData.notes.trim() || null
      };
      
      if (editingRecord) {
        await axios.put(
          `${API}/production-quantities/${editingRecord.id}`,
          { quantity: payload.quantity, unit: payload.unit, notes: payload.notes },
          { headers: getAuthHeader() }
        );
        toast.success('Production quantity updated');
      } else {
        await axios.post(
          `${API}/production-quantities`,
          payload,
          { headers: getAuthHeader() }
        );
        toast.success('Production quantity created');
      }
      
      resetForm();
      setShowForm(false);
      fetchRecords();
    } catch (error) {
      console.error('Error saving production quantity:', error);
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to save production quantity');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (recordId) => {
    if (!window.confirm('Are you sure you want to delete this production quantity record?')) {
      return;
    }
    
    setDeleting(recordId);
    try {
      await axios.delete(`${API}/production-quantities/${recordId}`, {
        headers: getAuthHeader()
      });
      toast.success('Production quantity deleted');
      fetchRecords();
    } catch (error) {
      console.error('Error deleting production quantity:', error);
      toast.error('Failed to delete production quantity');
    } finally {
      setDeleting(null);
    }
  };

  const handleViewHistory = async (recordId) => {
    setHistoryRecordId(recordId);
    setHistoryLoading(true);
    setShowHistory(true);
    
    try {
      const response = await axios.get(
        `${API}/production-quantities/${recordId}/history`,
        { headers: getAuthHeader() }
      );
      setHistory(response.data || []);
    } catch (error) {
      console.error('Error fetching history:', error);
      toast.error('Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);
  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-heading flex items-center gap-2">
            <Package className="w-5 h-5 text-green-600" />
            Production Quantity Management
          </DialogTitle>
        </DialogHeader>

        {/* Form Section */}
        {showForm ? (
          <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-stone-50 rounded-lg border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-lg">
                {editingRecord ? 'Edit Production Quantity' : 'Add New Production Quantity'}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { resetForm(); setShowForm(false); }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Level Selection */}
              <div className="space-y-2">
                <Label>Level *</Label>
                <Select
                  value={formData.facility_id || 'organization'}
                  onValueChange={(val) => setFormData(prev => ({ 
                    ...prev, 
                    facility_id: val === 'organization' ? '' : val 
                  }))}
                  disabled={!!editingRecord}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="organization">
                      <span className="flex items-center gap-2">
                        <Building className="w-4 h-4" />
                        Organization Level
                      </span>
                    </SelectItem>
                    {facilities.map(f => (
                      <SelectItem key={f.id} value={f.id}>
                        <span className="flex items-center gap-2">
                          <Building2 className="w-4 h-4" />
                          {f.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Period Type */}
              <div className="space-y-2">
                <Label>Period Type *</Label>
                <Select
                  value={periodType}
                  onValueChange={setPeriodType}
                  disabled={!!editingRecord}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="fy">Financial Year (FY)</SelectItem>
                    <SelectItem value="cy">Calendar Year (CY)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Year */}
              <div className="space-y-2">
                <Label>Year *</Label>
                <Select
                  value={periodYear.toString()}
                  onValueChange={(val) => setPeriodYear(parseInt(val))}
                  disabled={!!editingRecord}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(y => (
                      <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Month (only for monthly) */}
              {periodType === 'monthly' && (
                <div className="space-y-2">
                  <Label>Month *</Label>
                  <Select
                    value={periodMonth.toString()}
                    onValueChange={(val) => setPeriodMonth(parseInt(val))}
                    disabled={!!editingRecord}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map(m => (
                        <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Quantity */}
              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.quantity}
                  onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
                  placeholder="Enter production quantity"
                  required
                />
              </div>

              {/* Unit */}
              <div className="space-y-2">
                <Label>Unit *</Label>
                <Input
                  type="text"
                  value={formData.unit}
                  onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))}
                  placeholder="e.g., tonnes, kg, units, pieces"
                  required
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Add any additional notes..."
                rows={2}
              />
            </div>

            {/* Period Preview */}
            <div className="text-sm text-text-muted">
              Period: <strong>{formatPeriod()}</strong>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => { resetForm(); setShowForm(false); }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingRecord ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            {/* Filters and Add Button */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Select value={filterLevel} onValueChange={setFilterLevel}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="organization">Organization Only</SelectItem>
                    <SelectItem value="facility">Facilities Only</SelectItem>
                  </SelectContent>
                </Select>
                
                {filterLevel !== 'organization' && (
                  <Select value={filterFacility} onValueChange={setFilterFacility}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="All Facilities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Facilities</SelectItem>
                      {facilities.map(f => (
                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              
              <Button onClick={() => { resetForm(); setShowForm(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Add Production Quantity
              </Button>
            </div>

            {/* Records Table */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
              </div>
            ) : records.length === 0 ? (
              <div className="text-center py-12 text-text-muted">
                <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No production quantity records found.</p>
                <p className="text-sm mt-2">Click &quot;Add Production Quantity&quot; to create one.</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-stone-50">
                      <TableHead>Level</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {record.facility_id ? (
                              <>
                                <Building2 className="w-4 h-4 text-blue-500" />
                                <span>{record.facility_name || 'Facility'}</span>
                              </>
                            ) : (
                              <>
                                <Building className="w-4 h-4 text-green-600" />
                                <span className="font-medium">Organization</span>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">{record.reporting_period}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {record.quantity.toLocaleString()}
                        </TableCell>
                        <TableCell>{record.unit}</TableCell>
                        <TableCell className="text-sm text-text-muted">
                          {record.updated_at 
                            ? formatDateTime(record.updated_at)
                            : formatDateTime(record.created_at)
                          }
                          <br />
                          <span className="text-xs">
                            by {record.updated_by_name || record.created_by_name || 'Unknown'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewHistory(record.id)}
                              title="View History"
                            >
                              <History className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(record)}
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(record.id)}
                              disabled={deleting === record.id}
                              title="Delete"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              {deleting === record.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {/* History Dialog */}
        <Dialog open={showHistory} onOpenChange={setShowHistory}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Edit History
              </DialogTitle>
            </DialogHeader>
            
            {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <p className="text-center py-8 text-text-muted">No history records found.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-sm">
                          {formatDateTime(entry.changed_at)}
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            entry.change_type === 'create' ? 'bg-green-100 text-green-700' :
                            entry.change_type === 'update' ? 'bg-blue-100 text-blue-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {entry.change_type}
                          </span>
                        </TableCell>
                        <TableCell>{entry.quantity?.toLocaleString()}</TableCell>
                        <TableCell>{entry.unit}</TableCell>
                        <TableCell className="text-sm text-text-muted">
                          {entry.changed_by_name || 'Unknown'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
