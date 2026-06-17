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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { toast } from 'sonner';
import { 
  UserCheck, 
  Plus, 
  Trash2, 
  History,
  Loader2,
  Save,
  ChevronDown,
  ChevronRight
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

const CATEGORIES = ["Board of Directors", "Key Management Personnel"];
const DEFAULT_ROW = { category: "Board of Directors", total: 0, number_of_females: 0 };

export default function BRSRWomenRepresentationSection({ 
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
  
  const [rows, setRows] = useState([{ ...DEFAULT_ROW }]);

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
      
      if (res.data.data?.women_representation?.length > 0) {
        setRows(res.data.data.women_representation);
      } else {
        setRows([{ ...DEFAULT_ROW }]);
      }
    } catch (error) {
      if (error.response?.status !== 404) {
        console.error('Failed to fetch women representation:', error);
      }
      setRows([{ ...DEFAULT_ROW }]);
    } finally {
      setLoading(false);
    }
  };

  const handleRowChange = (index, field, value) => {
    const updated = [...rows];
    if (field === 'total' || field === 'number_of_females') {
      updated[index][field] = parseInt(value) || 0;
    } else {
      updated[index][field] = value;
    }
    setRows(updated);
    if (onDataChange) onDataChange({ women_representation: updated });
  };

  const addRow = () => {
    setRows([...rows, { ...DEFAULT_ROW }]);
  };

  const removeRow = (index) => {
    if (rows.length <= 1) {
      toast.error('At least one row is required');
      return;
    }
    const updated = rows.filter((_, i) => i !== index);
    setRows(updated);
    if (onDataChange) onDataChange({ women_representation: updated });
  };

  const saveData = async () => {
    setSaving(true);
    try {
      await axios.patch(
        `${API}/organizations/my/framework-details/brsr/yearly/${reportingYear}`,
        { women_representation: rows },
        { headers: getAuthHeader() }
      );
      toast.success(`Women representation data for ${reportingYear} saved`);
    } catch (error) {
      if (error.response?.status === 404) {
        try {
          await axios.put(
            `${API}/organizations/my/framework-details/brsr/yearly/${reportingYear}`,
            { women_representation: rows },
            { headers: getAuthHeader() }
          );
          toast.success(`Women representation data for ${reportingYear} saved`);
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

  const getTotalFemales = () => rows.reduce((sum, r) => sum + (r.number_of_females || 0), 0);

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
            <UserCheck className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">Representation of Women on Board & KMP</span>
          </div>
          <Badge variant="outline" className="text-xs">{getTotalFemales()} Women</Badge>
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
            <div className="flex gap-2">
              {isEditing && (
                <Button type="button" variant="outline" size="sm" onClick={addRow}>
                  <Plus className="w-3 h-3 mr-1" /> Add Row
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { fetchHistoricalData(); setShowHistoryModal(true); }}
              >
                <History className="w-3 h-3 mr-1" /> History
              </Button>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50">
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs text-center">Total</TableHead>
                  <TableHead className="text-xs text-center">No. of Females</TableHead>
                  {isEditing && <TableHead className="text-xs w-16">Action</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      {isEditing ? (
                        <Select value={row.category} onValueChange={(v) => handleRowChange(index, 'category', v)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map(cat => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs">{row.category}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          value={row.total}
                          onChange={(e) => handleRowChange(index, 'total', e.target.value)}
                          className="h-7 text-xs text-center"
                        />
                      ) : (
                        <span className="text-xs">{row.total}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          value={row.number_of_females}
                          onChange={(e) => handleRowChange(index, 'number_of_females', e.target.value)}
                          className="h-7 text-xs text-center"
                        />
                      ) : (
                        <span className="text-xs">{row.number_of_females}</span>
                      )}
                    </TableCell>
                    {isEditing && (
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRow(index)}
                          className="text-red-500 hover:text-red-700 h-7 w-7 p-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
                Save
              </Button>
            </div>
          )}
        </div>
      </CollapsibleContent>

      <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historical Women Representation Data</DialogTitle>
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
                  {yearData.women_representation?.map((row, idx) => (
                    <div key={idx} className="text-xs bg-stone-50 p-2 rounded mb-1">
                      {row.category}: {row.number_of_females}/{row.total} females
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
}
