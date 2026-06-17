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
  DialogTrigger,
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
  Users, 
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

// Helper to generate reporting year options
const generateReportingYears = () => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = 0; i < 5; i++) {
    const startYear = currentYear - i;
    years.push(`${startYear}-${(startYear + 1).toString().slice(-2)}`);
  }
  return years;
};

// Default employee/worker details structure
const DEFAULT_EMPLOYEE_DETAILS = {
  permanent_male_employees: 0,
  permanent_female_employees: 0,
  other_than_permanent_male_employees: 0,
  other_than_permanent_female_employees: 0,
  diff_abled_permanent_male_employees: 0,
  diff_abled_permanent_female_employees: 0,
  diff_abled_other_permanent_male_employees: 0,
  diff_abled_other_permanent_female_employees: 0,
  permanent_male_workers: 0,
  permanent_female_workers: 0,
  other_than_permanent_male_workers: 0,
  other_than_permanent_female_workers: 0,
  diff_abled_permanent_male_workers: 0,
  diff_abled_permanent_female_workers: 0,
  diff_abled_other_permanent_male_workers: 0,
  diff_abled_other_permanent_female_workers: 0,
};

export default function BRSREmployeeDetailsSection({ 
  isEditing = false,
  onDataChange = null
}) {
  const { getAuthHeader } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reportingYear, setReportingYear] = useState(generateReportingYears()[0]);
  const [availableYears, setAvailableYears] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historicalData, setHistoricalData] = useState([]);
  
  const [formData, setFormData] = useState({ ...DEFAULT_EMPLOYEE_DETAILS });

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
      
      if (res.data.data?.employee_worker_details) {
        setFormData({ ...DEFAULT_EMPLOYEE_DETAILS, ...res.data.data.employee_worker_details });
      } else {
        setFormData({ ...DEFAULT_EMPLOYEE_DETAILS });
      }
      
      // Fetch available years for history
      const yearsRes = await axios.get(
        `${API}/organizations/my/framework-details/brsr/yearly`,
        { headers: getAuthHeader() }
      );
      setAvailableYears(yearsRes.data.available_years || []);
    } catch (error) {
      if (error.response?.status !== 404) {
        console.error('Failed to fetch employee details:', error);
      }
      setFormData({ ...DEFAULT_EMPLOYEE_DETAILS });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    const numValue = parseInt(value) || 0;
    const updated = { ...formData, [field]: numValue };
    setFormData(updated);
    if (onDataChange) onDataChange({ employee_worker_details: updated });
  };

  const saveData = async () => {
    setSaving(true);
    try {
      await axios.patch(
        `${API}/organizations/my/framework-details/brsr/yearly/${reportingYear}`,
        { employee_worker_details: formData },
        { headers: getAuthHeader() }
      );
      toast.success(`Employee details for ${reportingYear} saved successfully`);
    } catch (error) {
      // If no yearly record exists, create one
      if (error.response?.status === 404) {
        try {
          await axios.put(
            `${API}/organizations/my/framework-details/brsr/yearly/${reportingYear}`,
            { employee_worker_details: formData },
            { headers: getAuthHeader() }
          );
          toast.success(`Employee details for ${reportingYear} saved successfully`);
        } catch (err) {
          toast.error('Failed to save employee details');
        }
      } else {
        toast.error('Failed to save employee details');
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

  const openHistoryModal = () => {
    fetchHistoricalData();
    setShowHistoryModal(true);
  };

  const getTotalEmployees = () => {
    return formData.permanent_male_employees + formData.permanent_female_employees +
           formData.other_than_permanent_male_employees + formData.other_than_permanent_female_employees;
  };

  const getTotalWorkers = () => {
    return formData.permanent_male_workers + formData.permanent_female_workers +
           formData.other_than_permanent_male_workers + formData.other_than_permanent_female_workers;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="ml-2 text-sm text-text-muted">Loading...</span>
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-lg bg-white">
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between p-4 hover:bg-stone-50 transition-colors">
          <div className="flex items-center gap-3">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Users className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">Details of Employees and Workers</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {getTotalEmployees()} Employees | {getTotalWorkers()} Workers
            </Badge>
          </div>
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <div className="p-4 pt-0 space-y-4 border-t">
          {/* Reporting Year Selector */}
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
              onClick={openHistoryModal}
              className="text-xs"
            >
              <History className="w-3 h-3 mr-1" />
              View History
            </Button>
          </div>

          {/* Employees Section */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-stone-100 px-3 py-2 text-sm font-medium">Employees</div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-stone-50">
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs text-center">Male</TableHead>
                    <TableHead className="text-xs text-center">Female</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-xs">Permanent</TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          value={formData.permanent_male_employees}
                          onChange={(e) => handleInputChange('permanent_male_employees', e.target.value)}
                          className="h-7 text-xs text-center"
                          data-testid="perm-male-emp"
                        />
                      ) : (
                        <span className="text-xs">{formData.permanent_male_employees}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          value={formData.permanent_female_employees}
                          onChange={(e) => handleInputChange('permanent_female_employees', e.target.value)}
                          className="h-7 text-xs text-center"
                          data-testid="perm-female-emp"
                        />
                      ) : (
                        <span className="text-xs">{formData.permanent_female_employees}</span>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs">Other than Permanent</TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          value={formData.other_than_permanent_male_employees}
                          onChange={(e) => handleInputChange('other_than_permanent_male_employees', e.target.value)}
                          className="h-7 text-xs text-center"
                        />
                      ) : (
                        <span className="text-xs">{formData.other_than_permanent_male_employees}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          value={formData.other_than_permanent_female_employees}
                          onChange={(e) => handleInputChange('other_than_permanent_female_employees', e.target.value)}
                          className="h-7 text-xs text-center"
                        />
                      ) : (
                        <span className="text-xs">{formData.other_than_permanent_female_employees}</span>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-blue-50">
                    <TableCell className="text-xs">Differently Abled - Permanent</TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          value={formData.diff_abled_permanent_male_employees}
                          onChange={(e) => handleInputChange('diff_abled_permanent_male_employees', e.target.value)}
                          className="h-7 text-xs text-center"
                        />
                      ) : (
                        <span className="text-xs">{formData.diff_abled_permanent_male_employees}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          value={formData.diff_abled_permanent_female_employees}
                          onChange={(e) => handleInputChange('diff_abled_permanent_female_employees', e.target.value)}
                          className="h-7 text-xs text-center"
                        />
                      ) : (
                        <span className="text-xs">{formData.diff_abled_permanent_female_employees}</span>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-blue-50">
                    <TableCell className="text-xs">Differently Abled - Other</TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          value={formData.diff_abled_other_permanent_male_employees}
                          onChange={(e) => handleInputChange('diff_abled_other_permanent_male_employees', e.target.value)}
                          className="h-7 text-xs text-center"
                        />
                      ) : (
                        <span className="text-xs">{formData.diff_abled_other_permanent_male_employees}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          value={formData.diff_abled_other_permanent_female_employees}
                          onChange={(e) => handleInputChange('diff_abled_other_permanent_female_employees', e.target.value)}
                          className="h-7 text-xs text-center"
                        />
                      ) : (
                        <span className="text-xs">{formData.diff_abled_other_permanent_female_employees}</span>
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Workers Section */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-stone-100 px-3 py-2 text-sm font-medium">Workers</div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-stone-50">
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs text-center">Male</TableHead>
                    <TableHead className="text-xs text-center">Female</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-xs">Permanent</TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          value={formData.permanent_male_workers}
                          onChange={(e) => handleInputChange('permanent_male_workers', e.target.value)}
                          className="h-7 text-xs text-center"
                          data-testid="perm-male-worker"
                        />
                      ) : (
                        <span className="text-xs">{formData.permanent_male_workers}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          value={formData.permanent_female_workers}
                          onChange={(e) => handleInputChange('permanent_female_workers', e.target.value)}
                          className="h-7 text-xs text-center"
                          data-testid="perm-female-worker"
                        />
                      ) : (
                        <span className="text-xs">{formData.permanent_female_workers}</span>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs">Other than Permanent</TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          value={formData.other_than_permanent_male_workers}
                          onChange={(e) => handleInputChange('other_than_permanent_male_workers', e.target.value)}
                          className="h-7 text-xs text-center"
                        />
                      ) : (
                        <span className="text-xs">{formData.other_than_permanent_male_workers}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          value={formData.other_than_permanent_female_workers}
                          onChange={(e) => handleInputChange('other_than_permanent_female_workers', e.target.value)}
                          className="h-7 text-xs text-center"
                        />
                      ) : (
                        <span className="text-xs">{formData.other_than_permanent_female_workers}</span>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-blue-50">
                    <TableCell className="text-xs">Differently Abled - Permanent</TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          value={formData.diff_abled_permanent_male_workers}
                          onChange={(e) => handleInputChange('diff_abled_permanent_male_workers', e.target.value)}
                          className="h-7 text-xs text-center"
                        />
                      ) : (
                        <span className="text-xs">{formData.diff_abled_permanent_male_workers}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          value={formData.diff_abled_permanent_female_workers}
                          onChange={(e) => handleInputChange('diff_abled_permanent_female_workers', e.target.value)}
                          className="h-7 text-xs text-center"
                        />
                      ) : (
                        <span className="text-xs">{formData.diff_abled_permanent_female_workers}</span>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-blue-50">
                    <TableCell className="text-xs">Differently Abled - Other</TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          value={formData.diff_abled_other_permanent_male_workers}
                          onChange={(e) => handleInputChange('diff_abled_other_permanent_male_workers', e.target.value)}
                          className="h-7 text-xs text-center"
                        />
                      ) : (
                        <span className="text-xs">{formData.diff_abled_other_permanent_male_workers}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          value={formData.diff_abled_other_permanent_female_workers}
                          onChange={(e) => handleInputChange('diff_abled_other_permanent_female_workers', e.target.value)}
                          className="h-7 text-xs text-center"
                        />
                      ) : (
                        <span className="text-xs">{formData.diff_abled_other_permanent_female_workers}</span>
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Save Button */}
          {isEditing && (
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                onClick={saveData}
                disabled={saving}
                size="sm"
                className="bg-primary hover:bg-primary/90 text-white"
                data-testid="save-employee-details-btn"
              >
                {saving ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Saving...</>
                ) : (
                  <><Save className="w-3 h-3 mr-1" /> Save Employee Details</>
                )}
              </Button>
            </div>
          )}
        </div>
      </CollapsibleContent>

      {/* History Modal */}
      <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historical Employee & Worker Data</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {historicalData.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-8">No historical data available</p>
            ) : (
              historicalData.map((yearData) => (
                <div key={yearData.reporting_year} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">{yearData.reporting_year}</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setReportingYear(yearData.reporting_year);
                        setShowHistoryModal(false);
                      }}
                    >
                      Edit
                    </Button>
                  </div>
                  {yearData.employee_worker_details && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="bg-stone-50 p-2 rounded">
                        <span className="text-text-muted">Perm. Male Emp:</span>
                        <span className="ml-1 font-medium">{yearData.employee_worker_details.permanent_male_employees || 0}</span>
                      </div>
                      <div className="bg-stone-50 p-2 rounded">
                        <span className="text-text-muted">Perm. Female Emp:</span>
                        <span className="ml-1 font-medium">{yearData.employee_worker_details.permanent_female_employees || 0}</span>
                      </div>
                      <div className="bg-stone-50 p-2 rounded">
                        <span className="text-text-muted">Perm. Male Workers:</span>
                        <span className="ml-1 font-medium">{yearData.employee_worker_details.permanent_male_workers || 0}</span>
                      </div>
                      <div className="bg-stone-50 p-2 rounded">
                        <span className="text-text-muted">Perm. Female Workers:</span>
                        <span className="ml-1 font-medium">{yearData.employee_worker_details.permanent_female_workers || 0}</span>
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
