import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Switch } from './ui/switch';
import { toast } from 'sonner';
import { 
  Building2, 
  History,
  Loader2,
  Save,
  ChevronDown,
  ChevronRight,
  IndianRupee
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const generateReportingYears = () => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = 0; i < 5; i++) {
    const startYear = currentYear - i;
    years.push(`${startYear}-${(startYear + 1).toString().slice(-2)}`);
  }
  return years;
};

const DEFAULT_CSR = {
  is_applicable: false,
  turnover_inr: 0,
  net_worth_inr: 0,
};

// Format number to Indian currency format
const formatINR = (num) => {
  if (!num) return '₹0';
  return '₹' + num.toLocaleString('en-IN');
};

export default function BRSRCSRApplicabilitySection({ 
  isEditing = false,
  onDataChange = null
}) {
  const { getAuthHeader } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reportingYear, setReportingYear] = useState(generateReportingYears()[0]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historicalData, setHistoricalData] = useState([]);
  
  const [formData, setFormData] = useState({ ...DEFAULT_CSR });

  useEffect(() => {
    fetchYearlyData();
  }, [reportingYear]);

  const fetchYearlyData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `${API}/organizations/my/framework-details/brsr/yearly/${reportingYear}`,
        { headers: getAuthHeader() }
      );
      
      if (res.data.data?.csr_applicability) {
        setFormData({ ...DEFAULT_CSR, ...res.data.data.csr_applicability });
      } else {
        setFormData({ ...DEFAULT_CSR });
      }
    } catch (error) {
      if (error.response?.status !== 404) {
        console.error('Failed to fetch CSR data:', error);
      }
      setFormData({ ...DEFAULT_CSR });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
    if (onDataChange) onDataChange({ csr_applicability: updated });
  };

  const saveData = async () => {
    setSaving(true);
    try {
      await axios.patch(
        `${API}/organizations/my/framework-details/brsr/yearly/${reportingYear}`,
        { csr_applicability: formData },
        { headers: getAuthHeader() }
      );
      toast.success(`CSR data for ${reportingYear} saved`);
    } catch (error) {
      if (error.response?.status === 404) {
        try {
          await axios.put(
            `${API}/organizations/my/framework-details/brsr/yearly/${reportingYear}`,
            { csr_applicability: formData },
            { headers: getAuthHeader() }
          );
          toast.success(`CSR data for ${reportingYear} saved`);
        } catch (err) {
          toast.error('Failed to save data');
        }
      } else {
        toast.error('Failed to save data');
      }
    } finally {
      setSaving(false);
    }
  };

  const fetchHistoricalData = async () => {
    try {
      const res = await axios.get(
        `${API}/organizations/my/framework-details/brsr/yearly`,
        { headers: getAuthHeader() }
      );
      setHistoricalData(res.data.yearly_data || []);
    } catch (error) {
      console.error('Failed to fetch historical data:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-lg bg-white">
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between p-4 hover:bg-stone-50 transition-colors">
          <div className="flex items-center gap-3">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Building2 className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">CSR Applicability</span>
          </div>
          <Badge 
            variant="outline" 
            className={`text-xs ${formData.is_applicable ? 'bg-green-50 text-green-700' : 'bg-stone-50'}`}
          >
            {formData.is_applicable ? 'Applicable' : 'Not Applicable'}
          </Badge>
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <div className="p-4 pt-0 space-y-4 border-t">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Label className="text-sm">Reporting Year:</Label>
              {isEditing ? (
                <Select value={reportingYear} onValueChange={setReportingYear}>
                  <SelectTrigger className="w-32 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {generateReportingYears().map(year => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm font-medium">{reportingYear}</span>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { fetchHistoricalData(); setShowHistoryModal(true); }}
            >
              <History className="w-3 h-3 mr-1" /> History
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* CSR Applicable Switch */}
            <div className="space-y-2 p-4 border rounded-lg bg-stone-50">
              <Label className="text-sm font-medium">CSR applicable under Section 135?</Label>
              {isEditing ? (
                <div className="flex items-center gap-2 mt-2">
                  <Switch
                    checked={formData.is_applicable}
                    onCheckedChange={(checked) => handleChange('is_applicable', checked)}
                    data-testid="csr-applicable-switch"
                  />
                  <span className="text-sm">{formData.is_applicable ? 'Yes' : 'No'}</span>
                </div>
              ) : (
                <p className="text-sm font-medium mt-2">{formData.is_applicable ? 'Yes' : 'No'}</p>
              )}
            </div>

            {/* Turnover */}
            <div className="space-y-2 p-4 border rounded-lg">
              <Label className="text-sm font-medium flex items-center gap-1">
                <IndianRupee className="w-3 h-3" /> Turnover (INR)
              </Label>
              {isEditing ? (
                <Input
                  type="number"
                  min="0"
                  value={formData.turnover_inr}
                  onChange={(e) => handleChange('turnover_inr', parseFloat(e.target.value) || 0)}
                  className="h-9"
                  placeholder="Enter turnover amount"
                  data-testid="csr-turnover"
                />
              ) : (
                <p className="text-sm font-medium">{formatINR(formData.turnover_inr)}</p>
              )}
            </div>

            {/* Net Worth */}
            <div className="space-y-2 p-4 border rounded-lg">
              <Label className="text-sm font-medium flex items-center gap-1">
                <IndianRupee className="w-3 h-3" /> Net Worth (INR)
              </Label>
              {isEditing ? (
                <Input
                  type="number"
                  min="0"
                  value={formData.net_worth_inr}
                  onChange={(e) => handleChange('net_worth_inr', parseFloat(e.target.value) || 0)}
                  className="h-9"
                  placeholder="Enter net worth amount"
                  data-testid="csr-net-worth"
                />
              ) : (
                <p className="text-sm font-medium">{formatINR(formData.net_worth_inr)}</p>
              )}
            </div>
          </div>

          {isEditing && (
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                onClick={saveData}
                disabled={saving}
                size="sm"
                className="bg-primary hover:bg-primary/90 text-white"
              >
                {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                Save CSR Data
              </Button>
            </div>
          )}
        </div>
      </CollapsibleContent>

      <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historical CSR Data</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {historicalData.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-8">No historical data</p>
            ) : (
              historicalData.map((yearData) => (
                <div key={yearData.reporting_year} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">{yearData.reporting_year}</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setReportingYear(yearData.reporting_year); setShowHistoryModal(false); }}
                    >
                      Edit
                    </Button>
                  </div>
                  {yearData.csr_applicability && (
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-stone-50 p-2 rounded">
                        <span className="text-text-muted">Applicable:</span>
                        <span className="ml-1 font-medium">{yearData.csr_applicability.is_applicable ? 'Yes' : 'No'}</span>
                      </div>
                      <div className="bg-stone-50 p-2 rounded">
                        <span className="text-text-muted">Turnover:</span>
                        <span className="ml-1 font-medium">{formatINR(yearData.csr_applicability.turnover_inr)}</span>
                      </div>
                      <div className="bg-stone-50 p-2 rounded">
                        <span className="text-text-muted">Net Worth:</span>
                        <span className="ml-1 font-medium">{formatINR(yearData.csr_applicability.net_worth_inr)}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
}
