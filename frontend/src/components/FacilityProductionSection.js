import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Package, Calendar, Loader2, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

// Generate FY options (last 5 years)
const generateFYOptions = () => {
  const options = [];
  const now = new Date();
  const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  
  for (let i = 0; i < 5; i++) {
    const startYear = currentYear - i;
    const endYear = startYear + 1;
    options.push(`${startYear}-${String(endYear).slice(-2)}`);
  }
  return options;
};

export default function FacilityProductionSection({ facilityId, facilityName, readOnly = false }) {
  const { getAuthHeader, subscriptionExpired } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [selectedYear, setSelectedYear] = useState(() => {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${year}-${String(year + 1).slice(-2)}`;
  });
  
  const [inputType, setInputType] = useState('yearly'); // 'yearly' or 'monthly'
  const [yearlyQuantity, setYearlyQuantity] = useState('');
  const [unit, setUnit] = useState('MT');
  const [monthlyData, setMonthlyData] = useState({});
  
  const fyOptions = generateFYOptions();

  const fetchProductionData = useCallback(async () => {
    if (!facilityId || !selectedYear) return;
    
    setLoading(true);
    try {
      const response = await axios.get(
        `${API}/facilities/${facilityId}/production/${selectedYear}`,
        { headers: getAuthHeader() }
      );
      
      if (response.data) {
        setInputType(response.data.input_type || 'yearly');
        setYearlyQuantity(response.data.quantity ? String(response.data.quantity) : '');
        setUnit(response.data.unit || 'MT');
        
        // Convert monthly data format
        const monthly = {};
        if (response.data.monthly_data) {
          Object.entries(response.data.monthly_data).forEach(([month, data]) => {
            monthly[month] = typeof data === 'object' ? String(data.quantity || '') : String(data || '');
          });
        }
        setMonthlyData(monthly);
      }
    } catch (error) {
      console.log('No production data found for', selectedYear);
      setInputType('yearly');
      setYearlyQuantity('');
      setMonthlyData({});
    } finally {
      setLoading(false);
    }
  }, [facilityId, selectedYear, getAuthHeader]);

  useEffect(() => {
    if (expanded) {
      fetchProductionData();
    }
  }, [expanded, fetchProductionData]);

  const handleSave = async () => {
    if (subscriptionExpired) {
      toast.error('Subscription expired. Cannot save data.');
      return;
    }
    
    setSaving(true);
    try {
      const payload = {
        input_type: inputType,
        unit: unit
      };
      
      if (inputType === 'monthly') {
        const monthlyPayload = {};
        MONTHS.forEach(month => {
          const val = monthlyData[month];
          if (val !== undefined && val !== '') {
            monthlyPayload[month] = { quantity: parseFloat(val) || 0, unit };
          }
        });
        payload.monthly_data = monthlyPayload;
      } else {
        payload.quantity = parseFloat(yearlyQuantity) || 0;
      }
      
      await axios.post(
        `${API}/facilities/${facilityId}/production/${selectedYear}`,
        payload,
        { headers: getAuthHeader() }
      );
      
      toast.success(`Production data saved for FY ${selectedYear}`);
    } catch (error) {
      toast.error('Failed to save production data');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleMonthlyChange = (month, value) => {
    setMonthlyData(prev => ({
      ...prev,
      [month]: value
    }));
  };

  const calculateTotal = () => {
    if (inputType === 'yearly') {
      return parseFloat(yearlyQuantity) || 0;
    }
    return MONTHS.reduce((sum, month) => sum + (parseFloat(monthlyData[month]) || 0), 0);
  };

  const isDisabled = readOnly || subscriptionExpired;

  return (
    <Card className="border border-stone-200 rounded-lg overflow-hidden" data-testid={`facility-production-${facilityId}`}>
      {/* Header - Always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 bg-stone-50 hover:bg-stone-100 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="bg-emerald-100 p-2 rounded-lg">
            <Package className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h4 className="font-medium text-text-primary">Production Quantity</h4>
            <p className="text-xs text-text-muted">Track production output for this facility</p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-text-muted" />
        ) : (
          <ChevronDown className="w-5 h-5 text-text-muted" />
        )}
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-4 space-y-4 border-t border-stone-200">
          {/* Year and Input Type Selection */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-text-muted" />
              <Label className="text-sm">Financial Year:</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear} disabled={isDisabled}>
                <SelectTrigger className="w-32 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fyOptions.map(fy => (
                    <SelectItem key={fy} value={fy}>FY {fy}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-sm">Input Type:</Label>
              <div className="flex bg-stone-100 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => !isDisabled && setInputType('yearly')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    inputType === 'yearly' 
                      ? 'bg-white text-emerald-700 shadow-sm' 
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                  disabled={isDisabled}
                >
                  Yearly
                </button>
                <button
                  type="button"
                  onClick={() => !isDisabled && setInputType('monthly')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    inputType === 'monthly' 
                      ? 'bg-white text-emerald-700 shadow-sm' 
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                  disabled={isDisabled}
                >
                  Monthly
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-sm">Unit:</Label>
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-24 bg-white"
                placeholder="MT"
                disabled={isDisabled}
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            </div>
          ) : (
            <>
              {/* Input Fields */}
              {inputType === 'yearly' ? (
                <div className="space-y-2">
                  <Label>Total Production for FY {selectedYear}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={yearlyQuantity}
                      onChange={(e) => setYearlyQuantity(e.target.value)}
                      placeholder="Enter total production quantity"
                      className="max-w-xs bg-white"
                      disabled={isDisabled}
                    />
                    <span className="text-text-muted">{unit}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Label>Monthly Production for FY {selectedYear}</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {MONTHS.map(month => (
                      <div key={month} className="space-y-1">
                        <Label className="text-xs text-text-muted">{month}</Label>
                        <Input
                          type="number"
                          value={monthlyData[month] || ''}
                          onChange={(e) => handleMonthlyChange(month, e.target.value)}
                          placeholder="0"
                          className="bg-white"
                          disabled={isDisabled}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Total and Save */}
              <div className="flex items-center justify-between pt-4 border-t border-stone-100">
                <div className="text-sm">
                  <span className="text-text-muted">Total: </span>
                  <span className="font-semibold text-emerald-700">
                    {calculateTotal().toLocaleString()} {unit}
                  </span>
                </div>
                
                {!readOnly && (
                  <Button
                    onClick={handleSave}
                    disabled={saving || subscriptionExpired}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </>
                    )}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
