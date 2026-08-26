import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Plus, Trash2, Edit2, Info, Loader2, DollarSign, TrendingUp, Calendar, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Common currencies
const CURRENCIES = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'SAR', name: 'Saudi Riyal' },
];

// Data sources
const DATA_SOURCES = [
  'World Bank',
  'IMF',
  'OECD',
  'Federal Reserve',
  'Custom'
];

export default function CurrencyConversion() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState(null);
  const [filterCurrency, setFilterCurrency] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const { getAuthHeader } = useAuth();

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 30 }, (_, i) => currentYear - i);

  const [formData, setFormData] = useState({
    source_currency: 'INR',
    target_currency: 'USD',
    year_applicable: currentYear,
    month_applicable: '',
    conversion_method: 'ppp_inflation',
    purchase_parity: '',
    inflation_factor: '',
    exchange_rate: '',
    source: '',
    notes: '',
    is_active: true
  });

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/super-admin/currency-conversions`, { headers: getAuthHeader() });
      setConfigs(response.data);
    } catch (error) {
      console.error('Error fetching currency conversions:', error);
      toast.error('Failed to load currency conversion configurations');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const payload = {
      ...formData,
      purchase_parity: formData.purchase_parity ? parseFloat(formData.purchase_parity) : null,
      inflation_factor: formData.inflation_factor ? parseFloat(formData.inflation_factor) : null,
      exchange_rate: formData.exchange_rate ? parseFloat(formData.exchange_rate) : null,
      year_applicable: parseInt(formData.year_applicable),
      month_applicable: formData.month_applicable ? parseInt(formData.month_applicable) : null,
    };

    try {
      if (editingConfig) {
        await axios.put(
          `${API}/super-admin/currency-conversion/${editingConfig.id}`,
          payload,
          { headers: getAuthHeader() }
        );
        toast.success('Currency conversion updated successfully');
      } else {
        await axios.post(
          `${API}/super-admin/currency-conversion`,
          payload,
          { headers: getAuthHeader() }
        );
        toast.success('Currency conversion created successfully');
      }
      
      setDialogOpen(false);
      setEditingConfig(null);
      resetForm();
      fetchConfigs();
    } catch (error) {
      console.error('Error saving currency conversion:', error);
      toast.error(error.response?.data?.detail || 'Failed to save currency conversion');
    }
  };

  const handleEdit = (config) => {
    setEditingConfig(config);
    setFormData({
      source_currency: config.source_currency,
      target_currency: config.target_currency,
      year_applicable: config.year_applicable,
      month_applicable: config.month_applicable?.toString() || '',
      conversion_method: config.conversion_method || 'ppp_inflation',
      purchase_parity: config.purchase_parity?.toString() || '',
      inflation_factor: config.inflation_factor?.toString() || '',
      exchange_rate: config.exchange_rate?.toString() || '',
      source: config.source,
      notes: config.notes || '',
      is_active: config.is_active
    });
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!configToDelete) return;
    
    try {
      await axios.delete(
        `${API}/super-admin/currency-conversion/${configToDelete.id}`,
        { headers: getAuthHeader() }
      );
      toast.success('Currency conversion deleted successfully');
      setDeleteDialogOpen(false);
      setConfigToDelete(null);
      fetchConfigs();
    } catch (error) {
      console.error('Error deleting currency conversion:', error);
      toast.error(error.response?.data?.detail || 'Failed to delete currency conversion');
    }
  };

  const resetForm = () => {
    setFormData({
      source_currency: 'INR',
      target_currency: 'USD',
      year_applicable: currentYear,
      month_applicable: '',
      conversion_method: 'ppp_inflation',
      purchase_parity: '',
      inflation_factor: '',
      exchange_rate: '',
      source: '',
      notes: '',
      is_active: true
    });
  };

  const openCreateDialog = () => {
    resetForm();
    setEditingConfig(null);
    setDialogOpen(true);
  };

  // Filter configs
  const filteredConfigs = configs.filter(config => {
    if (filterCurrency && config.source_currency !== filterCurrency) return false;
    if (filterYear && config.year_applicable !== parseInt(filterYear)) return false;
    if (filterMethod && (config.conversion_method || 'ppp_inflation') !== filterMethod) return false;
    return true;
  });

  // Group configs by currency
  const groupedConfigs = filteredConfigs.reduce((acc, config) => {
    const key = config.source_currency;
    if (!acc[key]) acc[key] = [];
    acc[key].push(config);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="currency-conversion-page">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Currency Conversion</h1>
          <p className="text-slate-500 mt-1">
            Manage monthly or annual market rates, PPP, and inflation for spend-based calculations
          </p>
        </div>
        <Button onClick={openCreateDialog} className="bg-emerald-600 hover:bg-emerald-700" data-testid="add-currency-btn">
          <Plus className="h-4 w-4 mr-2" />
          Add Currency Conversion
        </Button>
      </div>

      {/* Info Card */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">About Currency Conversion Factors</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li><strong>Purchase Parity (PPP):</strong> Converts local currency to USD equivalent based on purchasing power</li>
              <li><strong>Inflation Factor:</strong> Adjusts for inflation between the base year and calculation year</li>
              <li><strong>Standard Conversion:</strong> Uses the market rate effective for the reporting month.</li>
              <li><strong>PPP &amp; Inflation:</strong> Uses annual PPP and inflation adjustment, including legacy records.</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex gap-4 items-end">
          <div className="w-48">
            <Label className="text-sm text-slate-600 mb-1">Filter by Currency</Label>
            <Select value={filterCurrency || "all"} onValueChange={(v) => setFilterCurrency(v === "all" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="All Currencies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Currencies</SelectItem>
                {[...new Set(configs.map(c => c.source_currency))].sort().map(currency => (
                  <SelectItem key={currency} value={currency}>{currency}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-36">
            <Label className="text-sm text-slate-600 mb-1">Filter by Year</Label>
            <Select value={filterYear || "all"} onValueChange={(v) => setFilterYear(v === "all" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="All Years" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {[...new Set(configs.map(c => c.year_applicable))].sort((a, b) => b - a).map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-48">
            <Label className="text-sm text-slate-600 mb-1">Filter by Method</Label>
            <Select value={filterMethod || "all"} onValueChange={(v) => setFilterMethod(v === "all" ? "" : v)}>
              <SelectTrigger data-testid="currency-method-filter"><SelectValue placeholder="All Methods" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="standard">Standard Currency Conversion</SelectItem>
                <SelectItem value="ppp_inflation">PPP and Inflation Rate</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-slate-500">
            Showing {filteredConfigs.length} of {configs.length} configurations
          </div>
        </div>
      </Card>

      {/* Currency Conversion Table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="font-semibold">Source Currency</TableHead>
              <TableHead className="font-semibold">Target Currency</TableHead>
              <TableHead className="font-semibold">Year</TableHead>
              <TableHead className="font-semibold">Effective Period</TableHead>
              <TableHead className="font-semibold">Method</TableHead>
              <TableHead className="font-semibold">Purchase Parity (PPP)</TableHead>
              <TableHead className="font-semibold">Inflation Factor</TableHead>
              <TableHead className="font-semibold">Exchange Rate</TableHead>
              <TableHead className="font-semibold">Source</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredConfigs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-slate-500">
                  No currency conversion configurations found. Click &quot;Add Currency Conversion&quot; to create one.
                </TableCell>
              </TableRow>
            ) : (
              filteredConfigs.map((config) => (
                <TableRow key={config.id} className="hover:bg-slate-50">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-emerald-600" />
                      {config.source_currency}
                    </div>
                  </TableCell>
                  <TableCell>{config.target_currency}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      {config.year_applicable}
                    </div>
                  </TableCell>
                  <TableCell data-testid={`currency-effective-period-${config.id}`}>
                    {config.effective_from || (config.month_applicable ? `${config.year_applicable}-${String(config.month_applicable).padStart(2, '0')}` : config.year_applicable)}
                  </TableCell>
                  <TableCell data-testid={`currency-method-${config.id}`}>
                    {(config.conversion_method || 'ppp_inflation') === 'standard' ? 'Standard' : 'PPP & Inflation'}
                  </TableCell>
                  <TableCell className="font-mono">{config.purchase_parity?.toFixed(4)}</TableCell>
                  <TableCell className="font-mono">
                    {config.inflation_factor ? config.inflation_factor.toFixed(4) : '-'}
                  </TableCell>
                  <TableCell className="font-mono">
                    {config.exchange_rate ? config.exchange_rate.toFixed(4) : '-'}
                  </TableCell>
                  <TableCell className="text-slate-600">{config.source}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      config.is_active 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {config.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(config)}
                        data-testid={`edit-currency-${config.id}`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setConfigToDelete(config);
                          setDeleteDialogOpen(true);
                        }}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        data-testid={`delete-currency-${config.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingConfig ? 'Edit Currency Conversion' : 'Add Currency Conversion'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Conversion Method *</Label>
                <Select value={formData.conversion_method} onValueChange={(value) => setFormData({ ...formData, conversion_method: value })}>
                  <SelectTrigger data-testid="currency-conversion-method-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard Currency Conversion</SelectItem>
                    <SelectItem value="ppp_inflation">PPP and Inflation Rate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium">Source Currency *</Label>
                <Select 
                  value={formData.source_currency} 
                  onValueChange={(value) => setFormData({...formData, source_currency: value})}
                >
                  <SelectTrigger data-testid="source-currency-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code} - {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium">Month Applicable</Label>
                <Select value={formData.month_applicable || 'annual'} onValueChange={(value) => setFormData({ ...formData, month_applicable: value === 'annual' ? '' : value })}>
                  <SelectTrigger data-testid="currency-month-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual">Annual rate</SelectItem>
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                      <SelectItem key={month} value={String(month)}>{new Date(2000, month - 1, 1).toLocaleString('en', { month: 'long' })}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium">Target Currency *</Label>
                <Select 
                  value={formData.target_currency} 
                  onValueChange={(value) => setFormData({...formData, target_currency: value})}
                >
                  <SelectTrigger data-testid="target-currency-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code} - {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Year Applicable *</Label>
                <Select 
                  value={formData.year_applicable.toString()} 
                  onValueChange={(value) => setFormData({...formData, year_applicable: parseInt(value)})}
                >
                  <SelectTrigger data-testid="year-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(year => (
                      <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium">Data Source *</Label>
                <Input
                  value={formData.source}
                  onChange={(e) => setFormData({...formData, source: e.target.value})}
                  placeholder="e.g., World Bank, IMF, OECD"
                  required
                  data-testid="data-source-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {formData.conversion_method === 'ppp_inflation' && <>
              <div>
                <Label className="text-sm font-medium">Purchase Parity (PPP) *</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={formData.purchase_parity}
                  onChange={(e) => setFormData({...formData, purchase_parity: e.target.value})}
                  placeholder="e.g., 22.5"
                  required={formData.conversion_method === 'ppp_inflation'}
                  data-testid="ppp-input"
                />
                <p className="text-xs text-slate-500 mt-1">PPP conversion factor</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Inflation Factor</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={formData.inflation_factor}
                  onChange={(e) => setFormData({...formData, inflation_factor: e.target.value})}
                  placeholder="e.g., 1.05"
                  data-testid="inflation-input"
                />
                <p className="text-xs text-slate-500 mt-1">Inflation adjustment</p>
              </div>
              </>}
              <div>
                <Label className="text-sm font-medium">Exchange Rate {formData.conversion_method === 'standard' ? '*' : ''}</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={formData.exchange_rate}
                  onChange={(e) => setFormData({...formData, exchange_rate: e.target.value})}
                  placeholder="e.g., 83.5"
                  required={formData.conversion_method === 'standard'}
                  data-testid="exchange-rate-input"
                />
                <p className="text-xs text-slate-500 mt-1">Source-currency units per target-currency unit</p>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder="Additional notes about this conversion factor..."
                rows={2}
                data-testid="notes-input"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
                data-testid="is-active-switch"
              />
              <Label className="text-sm">Active</Label>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" data-testid="save-currency-btn">
                {editingConfig ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Currency Conversion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this currency conversion configuration for{' '}
              <strong>{configToDelete?.source_currency}/{configToDelete?.target_currency}</strong> ({configToDelete?.year_applicable})?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-delete-btn"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
