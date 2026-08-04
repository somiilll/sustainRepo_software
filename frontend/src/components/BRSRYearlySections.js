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
import { Switch } from './ui/switch';
import { toast } from 'sonner';
import { 
  Users, 
  UserCheck,
  Building,
  Building2,
  TrendingDown,
  Plus, 
  Trash2, 
  History,
  Loader2,
  Save,
  ChevronDown,
  ChevronRight,
  IndianRupee,
  MessageSquareWarning,
  AlertTriangle
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
import { Textarea } from './ui/textarea';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Generate reporting year options
const generateReportingYears = () => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = 0; i < 5; i++) {
    const startYear = currentYear - i;
    years.push(`FY ${startYear}-${startYear + 1}`);
  }
  return years;
};

// Calculate previous FY from current (handles "FY 2025-2026" format)
const getPreviousFY = (currentFY) => {
  const match = currentFY.match(/(\d{4})-(\d{4})/);
  if (match) {
    const startYear = parseInt(match[1]);
    return `FY ${startYear - 1}-${startYear}`;
  }
  return currentFY;
};

// Default structures
const DEFAULT_EMPLOYEE_DETAILS = {
  permanent_male_employees: 0, permanent_female_employees: 0,
  other_than_permanent_male_employees: 0, other_than_permanent_female_employees: 0,
  diff_abled_permanent_male_employees: 0, diff_abled_permanent_female_employees: 0,
  diff_abled_other_permanent_male_employees: 0, diff_abled_other_permanent_female_employees: 0,
  permanent_male_workers: 0, permanent_female_workers: 0,
  other_than_permanent_male_workers: 0, other_than_permanent_female_workers: 0,
  diff_abled_permanent_male_workers: 0, diff_abled_permanent_female_workers: 0,
  diff_abled_other_permanent_male_workers: 0, diff_abled_other_permanent_female_workers: 0,
};

const DEFAULT_CSR = { is_applicable: false, turnover_inr: 0, net_worth_inr: 0 };

const DEFAULT_TURNOVER_RATE = {
  permanent_employees_male: 0, permanent_employees_female: 0,
  permanent_workers_male: 0, permanent_workers_female: 0,
};

const CATEGORIES_WOMEN = ["Board of Directors", "Key Management Personnel"];
const ENTITY_TYPES = ["Holding Company", "Subsidiary", "Associate Company", "Joint Venture"];

// Complaints/Grievances fixed categories
const GRIEVANCE_CATEGORIES = [
  "Communities",
  "Investors (other than shareholders)",
  "Shareholders",
  "Employees and workers",
  "Customers",
  "Value Chain Partners",
  "Other"
];

const DEFAULT_GRIEVANCE_ROW = {
  category: "Communities",
  has_grievance_mechanism: false,
  policy_weblink: "",
  current_fy_filed: 0,
  current_fy_pending: 0,
  current_fy_remarks: "",
  previous_fy_filed: 0,
  previous_fy_pending: 0,
  previous_fy_remarks: ""
};

const DEFAULT_MATERIAL_ISSUE_ROW = {
  issue_identified: "",
  risk_or_opportunity: "Risk",
  rationale: "",
  mitigation_approach: "",
  financial_implication: "Neutral",
  financial_details: ""
};

const formatINR = (num) => num ? '₹' + num.toLocaleString('en-IN') : '₹0';

export default function BRSRYearlySections({ isEditing = false, hideSections = [], reportingYear: propReportingYear = '' }) {
  const { getAuthHeader } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Use prop if provided, otherwise use default
  const [reportingYear, setReportingYear] = useState(propReportingYear || generateReportingYears()[0]);
  const [availableYears, setAvailableYears] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historicalData, setHistoricalData] = useState([]);
  
  // Update reportingYear when prop changes
  useEffect(() => {
    if (propReportingYear && propReportingYear !== reportingYear) {
      setReportingYear(propReportingYear);
    }
  }, [propReportingYear]);
  
  // Section open states
  const [openSections, setOpenSections] = useState({
    employees: false, women: false, csr: false, holding: false, turnover: false, complaints: false, materialIssues: false
  });

  // Form data
  const [employeeDetails, setEmployeeDetails] = useState({ ...DEFAULT_EMPLOYEE_DETAILS });
  const [womenRepresentation, setWomenRepresentation] = useState([
    { category: "Board of Directors", total: 0, number_of_females: 0 }
  ]);
  const [csrApplicability, setCSRApplicability] = useState({ ...DEFAULT_CSR });
  const [holdingEntities, setHoldingEntities] = useState([
    { name_of_entity: "", type_of_entity: "Subsidiary", shares_held_percentage: 0, participates_in_br_initiatives: false }
  ]);
  // Turnover rate - current year only (we fetch previous years separately for display)
  const [turnoverRate, setTurnoverRate] = useState({ ...DEFAULT_TURNOVER_RATE });
  // Editable data for previous years (fetched from their own documents, saved back to them)
  const [prevYearTurnover, setPrevYearTurnover] = useState({ ...DEFAULT_TURNOVER_RATE });
  const [priorYearTurnover, setPriorYearTurnover] = useState({ ...DEFAULT_TURNOVER_RATE });
  // Complaints/Grievances - initialize with all fixed categories
  const [complaintsGrievances, setComplaintsGrievances] = useState(
    GRIEVANCE_CATEGORIES.map(cat => ({ ...DEFAULT_GRIEVANCE_ROW, category: cat }))
  );
  // Material Issues
  const [materialIssues, setMaterialIssues] = useState([{ ...DEFAULT_MATERIAL_ISSUE_ROW }]);

  useEffect(() => {
    fetchYearlyData();
  }, [reportingYear]);

  // Map ESG responses to yearly section form data
  const mapResponsesToFormData = (responses) => {
    // Employee/worker details
    if (responses.brsr_a_employees_workers) {
      const ew = responses.brsr_a_employees_workers;
      setEmployeeDetails({
        permanent_male_employees: ew.employees?.permanent?.male || 0,
        permanent_female_employees: ew.employees?.permanent?.female || 0,
        other_than_permanent_male_employees: ew.employees?.other_than_permanent?.male || 0,
        other_than_permanent_female_employees: ew.employees?.other_than_permanent?.female || 0,
        permanent_male_workers: ew.workers?.permanent?.male || 0,
        permanent_female_workers: ew.workers?.permanent?.female || 0,
        other_than_permanent_male_workers: ew.workers?.other_than_permanent?.male || 0,
        other_than_permanent_female_workers: ew.workers?.other_than_permanent?.female || 0,
        diff_abled_permanent_male_employees: 0,
        diff_abled_permanent_female_employees: 0,
        diff_abled_other_permanent_male_employees: 0,
        diff_abled_other_permanent_female_employees: 0,
        diff_abled_permanent_male_workers: 0,
        diff_abled_permanent_female_workers: 0,
        diff_abled_other_permanent_male_workers: 0,
        diff_abled_other_permanent_female_workers: 0,
      });
    }
    
    // Differently abled
    if (responses.brsr_a_differently_abled) {
      const da = responses.brsr_a_differently_abled;
      setEmployeeDetails(prev => ({
        ...prev,
        diff_abled_permanent_male_employees: da.employees?.permanent?.male || 0,
        diff_abled_permanent_female_employees: da.employees?.permanent?.female || 0,
        diff_abled_other_permanent_male_employees: da.employees?.other_than_permanent?.male || 0,
        diff_abled_other_permanent_female_employees: da.employees?.other_than_permanent?.female || 0,
        diff_abled_permanent_male_workers: da.workers?.permanent?.male || 0,
        diff_abled_permanent_female_workers: da.workers?.permanent?.female || 0,
        diff_abled_other_permanent_male_workers: da.workers?.other_than_permanent?.male || 0,
        diff_abled_other_permanent_female_workers: da.workers?.other_than_permanent?.female || 0,
      }));
    }
    
    // Women representation
    if (responses.brsr_a_women_representation?.length > 0) {
      setWomenRepresentation(responses.brsr_a_women_representation);
    } else {
      setWomenRepresentation([{ category: "Board of Directors", total: 0, number_of_females: 0 }]);
    }
    
    // CSR
    if (responses.brsr_a_csr_applicability) {
      setCSRApplicability(responses.brsr_a_csr_applicability);
    } else {
      setCSRApplicability({ ...DEFAULT_CSR });
    }
    
    // Holding entities
    if (responses.brsr_a_holding_subsidiary?.length > 0) {
      setHoldingEntities(responses.brsr_a_holding_subsidiary);
    } else {
      setHoldingEntities([{ name_of_entity: "", type_of_entity: "Subsidiary", shares_held_percentage: 0, participates_in_br_initiatives: false }]);
    }
    
    // Turnover rate
    if (responses.brsr_a_turnover_rate) {
      const tr = responses.brsr_a_turnover_rate;
      setTurnoverRate({
        permanent_employees_male: tr.current_fy?.permanent_employees?.male || 0,
        permanent_employees_female: tr.current_fy?.permanent_employees?.female || 0,
        permanent_workers_male: tr.current_fy?.permanent_workers?.male || 0,
        permanent_workers_female: tr.current_fy?.permanent_workers?.female || 0,
      });
    } else {
      setTurnoverRate({ ...DEFAULT_TURNOVER_RATE });
    }
    
    // Complaints/Grievances
    if (responses.brsr_a_complaints_grievances?.length > 0) {
      const merged = GRIEVANCE_CATEGORIES.map(cat => {
        const existing = responses.brsr_a_complaints_grievances.find(c => c.category === cat);
        return existing || { ...DEFAULT_GRIEVANCE_ROW, category: cat };
      });
      setComplaintsGrievances(merged);
    } else {
      setComplaintsGrievances(GRIEVANCE_CATEGORIES.map(cat => ({ ...DEFAULT_GRIEVANCE_ROW, category: cat })));
    }
    
    // Material Issues
    if (responses.brsr_a_material_issues?.length > 0) {
      setMaterialIssues(responses.brsr_a_material_issues);
    } else {
      setMaterialIssues([{ ...DEFAULT_MATERIAL_ISSUE_ROW }]);
    }
  };

  // Map form data to ESG responses format
  const mapFormDataToResponses = () => {
    return {
      brsr_a_employees_workers: {
        employees: {
          permanent: {
            male: employeeDetails.permanent_male_employees,
            female: employeeDetails.permanent_female_employees,
            total: employeeDetails.permanent_male_employees + employeeDetails.permanent_female_employees,
          },
          other_than_permanent: {
            male: employeeDetails.other_than_permanent_male_employees,
            female: employeeDetails.other_than_permanent_female_employees,
            total: employeeDetails.other_than_permanent_male_employees + employeeDetails.other_than_permanent_female_employees,
          },
        },
        workers: {
          permanent: {
            male: employeeDetails.permanent_male_workers,
            female: employeeDetails.permanent_female_workers,
            total: employeeDetails.permanent_male_workers + employeeDetails.permanent_female_workers,
          },
          other_than_permanent: {
            male: employeeDetails.other_than_permanent_male_workers,
            female: employeeDetails.other_than_permanent_female_workers,
            total: employeeDetails.other_than_permanent_male_workers + employeeDetails.other_than_permanent_female_workers,
          },
        },
      },
      brsr_a_differently_abled: {
        employees: {
          permanent: {
            male: employeeDetails.diff_abled_permanent_male_employees,
            female: employeeDetails.diff_abled_permanent_female_employees,
            total: employeeDetails.diff_abled_permanent_male_employees + employeeDetails.diff_abled_permanent_female_employees,
          },
          other_than_permanent: {
            male: employeeDetails.diff_abled_other_permanent_male_employees,
            female: employeeDetails.diff_abled_other_permanent_female_employees,
            total: employeeDetails.diff_abled_other_permanent_male_employees + employeeDetails.diff_abled_other_permanent_female_employees,
          },
        },
        workers: {
          permanent: {
            male: employeeDetails.diff_abled_permanent_male_workers,
            female: employeeDetails.diff_abled_permanent_female_workers,
            total: employeeDetails.diff_abled_permanent_male_workers + employeeDetails.diff_abled_permanent_female_workers,
          },
          other_than_permanent: {
            male: employeeDetails.diff_abled_other_permanent_male_workers,
            female: employeeDetails.diff_abled_other_permanent_female_workers,
            total: employeeDetails.diff_abled_other_permanent_male_workers + employeeDetails.diff_abled_other_permanent_female_workers,
          },
        },
      },
      brsr_a_women_representation: womenRepresentation,
      brsr_a_csr_applicability: csrApplicability,
      brsr_a_holding_subsidiary: holdingEntities,
      brsr_a_turnover_rate: {
        current_fy: {
          permanent_employees: {
            male: turnoverRate.permanent_employees_male,
            female: turnoverRate.permanent_employees_female,
            total: turnoverRate.permanent_employees_male + turnoverRate.permanent_employees_female,
          },
          permanent_workers: {
            male: turnoverRate.permanent_workers_male,
            female: turnoverRate.permanent_workers_female,
            total: turnoverRate.permanent_workers_male + turnoverRate.permanent_workers_female,
          },
        },
      },
      brsr_a_complaints_grievances: complaintsGrievances,
      brsr_a_material_issues: materialIssues,
    };
  };

  const fetchYearlyData = async () => {
    setLoading(true);
    try {
      // Fetch from ESG Questionnaire API (unified storage)
      const res = await axios.get(
        `${API}/esg-questionnaire/responses/BRSR/section_a/${encodeURIComponent(reportingYear)}`,
        { headers: getAuthHeader() }
      );
      
      if (res.data.responses && Object.keys(res.data.responses).length > 0) {
        mapResponsesToFormData(res.data.responses);
      } else {
        resetToDefaults();
      }
      
      // Fetch available years (keep using old endpoint for now, will refactor later)
      try {
        const yearsRes = await axios.get(`${API}/organizations/my/framework-details/brsr/yearly`, { headers: getAuthHeader() });
        setAvailableYears(yearsRes.data.available_years || []);
      } catch (e) {
        setAvailableYears(generateReportingYears());
      }
      
      // Fetch previous years' turnover data for display
      await fetchPreviousYearsTurnover();
    } catch (error) {
      if (error.response?.status !== 404) console.error('Fetch error:', error);
      resetToDefaults();
    } finally {
      setLoading(false);
    }
  };

  const resetToDefaults = () => {
    setEmployeeDetails({ ...DEFAULT_EMPLOYEE_DETAILS });
    setWomenRepresentation([{ category: "Board of Directors", total: 0, number_of_females: 0 }]);
    setCSRApplicability({ ...DEFAULT_CSR });
    setHoldingEntities([{ name_of_entity: "", type_of_entity: "Subsidiary", shares_held_percentage: 0, participates_in_br_initiatives: false }]);
    setTurnoverRate({ ...DEFAULT_TURNOVER_RATE });
    setPrevYearTurnover({ ...DEFAULT_TURNOVER_RATE });
    setPriorYearTurnover({ ...DEFAULT_TURNOVER_RATE });
    setComplaintsGrievances(GRIEVANCE_CATEGORIES.map(cat => ({ ...DEFAULT_GRIEVANCE_ROW, category: cat })));
    setMaterialIssues([{ ...DEFAULT_MATERIAL_ISSUE_ROW }]);
  };

  // Fetch previous years' documents for display-only in turnover matrix
  const fetchPreviousYearsTurnover = async () => {
    const prevFY = getPreviousFY(reportingYear);
    const priorFY = getPreviousFY(prevFY);
    
    try {
      const [prevRes, priorRes] = await Promise.all([
        axios.get(`${API}/esg-questionnaire/responses/BRSR/section_a/${encodeURIComponent(prevFY)}`, { headers: getAuthHeader() }).catch(() => null),
        axios.get(`${API}/esg-questionnaire/responses/BRSR/section_a/${encodeURIComponent(priorFY)}`, { headers: getAuthHeader() }).catch(() => null)
      ]);

      const prevTurnover = prevRes?.data?.responses?.brsr_a_turnover_rate?.current_fy;
      const priorTurnover = priorRes?.data?.responses?.brsr_a_turnover_rate?.current_fy;
      
      setPrevYearTurnover(prevTurnover ? {
        permanent_employees_male: prevTurnover.permanent_employees?.male || 0,
        permanent_employees_female: prevTurnover.permanent_employees?.female || 0,
        permanent_workers_male: prevTurnover.permanent_workers?.male || 0,
        permanent_workers_female: prevTurnover.permanent_workers?.female || 0,
      } : { ...DEFAULT_TURNOVER_RATE });
      
      setPriorYearTurnover(priorTurnover ? {
        permanent_employees_male: priorTurnover.permanent_employees?.male || 0,
        permanent_employees_female: priorTurnover.permanent_employees?.female || 0,
        permanent_workers_male: priorTurnover.permanent_workers?.male || 0,
        permanent_workers_female: priorTurnover.permanent_workers?.female || 0,
      } : { ...DEFAULT_TURNOVER_RATE });
    } catch (e) {
      // Silent fail
    }
  };

  const saveAllYearlyData = async () => {
    setSaving(true);
    const prevFY = getPreviousFY(reportingYear);
    const priorFY = getPreviousFY(prevFY);
    
    try {
      // Convert form data to ESG responses format
      const currentResponses = mapFormDataToResponses();

      // Save current year data via ESG Questionnaire API
      await axios.put(
        `${API}/esg-questionnaire/responses/BRSR/section_a/${encodeURIComponent(reportingYear)}`,
        { responses: currentResponses },
        { headers: getAuthHeader() }
      );
      
      // Save previous years' turnover data (only if changed)
      const prevYearResponses = {
        brsr_a_turnover_rate: {
          current_fy: {
            permanent_employees: {
              male: prevYearTurnover.permanent_employees_male,
              female: prevYearTurnover.permanent_employees_female,
              total: prevYearTurnover.permanent_employees_male + prevYearTurnover.permanent_employees_female,
            },
            permanent_workers: {
              male: prevYearTurnover.permanent_workers_male,
              female: prevYearTurnover.permanent_workers_female,
              total: prevYearTurnover.permanent_workers_male + prevYearTurnover.permanent_workers_female,
            },
          },
        },
      };
      
      const priorYearResponses = {
        brsr_a_turnover_rate: {
          current_fy: {
            permanent_employees: {
              male: priorYearTurnover.permanent_employees_male,
              female: priorYearTurnover.permanent_employees_female,
              total: priorYearTurnover.permanent_employees_male + priorYearTurnover.permanent_employees_female,
            },
            permanent_workers: {
              male: priorYearTurnover.permanent_workers_male,
              female: priorYearTurnover.permanent_workers_female,
              total: priorYearTurnover.permanent_workers_male + priorYearTurnover.permanent_workers_female,
            },
          },
        },
      };
      
      await Promise.all([
        axios.put(
          `${API}/esg-questionnaire/responses/BRSR/section_a/${encodeURIComponent(prevFY)}`,
          { responses: prevYearResponses },
          { headers: getAuthHeader() }
        ),
        axios.put(
          `${API}/esg-questionnaire/responses/BRSR/section_a/${encodeURIComponent(priorFY)}`,
          { responses: priorYearResponses },
          { headers: getAuthHeader() }
        )
      ]);

      toast.success(`Section A data saved for ${reportingYear}, ${prevFY}, and ${priorFY}`);
      fetchYearlyData();
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save yearly data');
    } finally {
      setSaving(false);
    }
  };

  const fetchHistoricalData = async () => {
    try {
      const res = await axios.get(`${API}/organizations/my/framework-details/brsr/yearly`, { headers: getAuthHeader() });
      setHistoricalData(res.data.yearly_data || []);
    } catch (error) {
      console.error('History fetch error:', error);
    }
  };

  const toggleSection = (section) => setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  const prevFY = getPreviousFY(reportingYear);
  const priorFY = getPreviousFY(prevFY);

  return (
    <div className="space-y-4">
      {/* 1. Employee & Worker Details */}
      {!hideSections.includes('employees_workers') && (
      <Collapsible open={openSections.employees} onOpenChange={() => toggleSection('employees')} className="border rounded-lg bg-white">
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-3 hover:bg-stone-50">
            <div className="flex items-center gap-2">
              {openSections.employees ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <Users className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">Details of Employees and Workers (including differently abled)</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {(employeeDetails.permanent_male_employees || 0) + (employeeDetails.permanent_female_employees || 0) + 
               (employeeDetails.other_than_permanent_male_employees || 0) + (employeeDetails.other_than_permanent_female_employees || 0) +
               (employeeDetails.permanent_male_workers || 0) + (employeeDetails.permanent_female_workers || 0) +
               (employeeDetails.other_than_permanent_male_workers || 0) + (employeeDetails.other_than_permanent_female_workers || 0)} Total
            </Badge>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 pt-0 border-t">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Employees */}
            <div className="border rounded p-3">
              <h5 className="text-xs font-semibold mb-3 text-stone-600 border-b pb-2">Employees</h5>
              <div className="space-y-2">
                {[
                  ['Permanent Male Employees', 'permanent_male_employees'],
                  ['Permanent Female Employees', 'permanent_female_employees'],
                  ['Other than Permanent Male Employees', 'other_than_permanent_male_employees'],
                  ['Other than Permanent Female Employees', 'other_than_permanent_female_employees'],
                ].map(([label, field]) => (
                  <div key={field} className="flex items-center justify-between">
                    <span className="text-xs">{label}</span>
                    {isEditing ? (
                      <Input type="number" min="0" value={employeeDetails[field]} 
                        onChange={(e) => setEmployeeDetails(p => ({ ...p, [field]: parseInt(e.target.value) || 0 }))}
                        className="w-20 h-7 text-xs text-center" />
                    ) : <span className="text-xs font-medium">{employeeDetails[field]}</span>}
                  </div>
                ))}
              </div>
              <h6 className="text-xs font-semibold mt-3 mb-2 text-blue-600">Differently Abled Employees</h6>
              <div className="space-y-2 bg-blue-50 p-2 rounded">
                {[
                  ['Differently Abled Permanent Male Employees', 'diff_abled_permanent_male_employees'],
                  ['Differently Abled Permanent Female Employees', 'diff_abled_permanent_female_employees'],
                  ['Differently Abled Other than Permanent Male Employees', 'diff_abled_other_permanent_male_employees'],
                  ['Differently Abled Other than Permanent Female Employees', 'diff_abled_other_permanent_female_employees'],
                ].map(([label, field]) => (
                  <div key={field} className="flex items-center justify-between">
                    <span className="text-xs">{label}</span>
                    {isEditing ? (
                      <Input type="number" min="0" value={employeeDetails[field]} 
                        onChange={(e) => setEmployeeDetails(p => ({ ...p, [field]: parseInt(e.target.value) || 0 }))}
                        className="w-20 h-7 text-xs text-center" />
                    ) : <span className="text-xs font-medium">{employeeDetails[field]}</span>}
                  </div>
                ))}
              </div>
            </div>
            {/* Workers */}
            <div className="border rounded p-3">
              <h5 className="text-xs font-semibold mb-3 text-stone-600 border-b pb-2">Workers</h5>
              <div className="space-y-2">
                {[
                  ['Permanent Male Workers', 'permanent_male_workers'],
                  ['Permanent Female Workers', 'permanent_female_workers'],
                  ['Other than Permanent Male Workers', 'other_than_permanent_male_workers'],
                  ['Other than Permanent Female Workers', 'other_than_permanent_female_workers'],
                ].map(([label, field]) => (
                  <div key={field} className="flex items-center justify-between">
                    <span className="text-xs">{label}</span>
                    {isEditing ? (
                      <Input type="number" min="0" value={employeeDetails[field]}
                        onChange={(e) => setEmployeeDetails(p => ({ ...p, [field]: parseInt(e.target.value) || 0 }))}
                        className="w-20 h-7 text-xs text-center" />
                    ) : <span className="text-xs font-medium">{employeeDetails[field]}</span>}
                  </div>
                ))}
              </div>
              <h6 className="text-xs font-semibold mt-3 mb-2 text-blue-600">Differently Abled Workers</h6>
              <div className="space-y-2 bg-blue-50 p-2 rounded">
                {[
                  ['Differently Abled Permanent Male Workers', 'diff_abled_permanent_male_workers'],
                  ['Differently Abled Permanent Female Workers', 'diff_abled_permanent_female_workers'],
                  ['Differently Abled Other than Permanent Male Workers', 'diff_abled_other_permanent_male_workers'],
                  ['Differently Abled Other than Permanent Female Workers', 'diff_abled_other_permanent_female_workers'],
                ].map(([label, field]) => (
                  <div key={field} className="flex items-center justify-between">
                    <span className="text-xs">{label}</span>
                    {isEditing ? (
                      <Input type="number" min="0" value={employeeDetails[field]}
                        onChange={(e) => setEmployeeDetails(p => ({ ...p, [field]: parseInt(e.target.value) || 0 }))}
                        className="w-20 h-7 text-xs text-center" />
                    ) : <span className="text-xs font-medium">{employeeDetails[field]}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
      )}

      {/* 2. Women Representation */}
      {!hideSections.includes('women_representation') && (
      <Collapsible open={openSections.women} onOpenChange={() => toggleSection('women')} className="border rounded-lg bg-white">
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-3 hover:bg-stone-50">
            <div className="flex items-center gap-2">
              {openSections.women ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <UserCheck className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">Women Representation on Board & KMP</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {womenRepresentation.reduce((sum, row) => sum + (row.number_of_females || 0), 0)} Women
            </Badge>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 pt-0 border-t">
          <Table>
            <TableHeader>
              <TableRow className="bg-stone-50">
                <TableHead className="text-xs">Category</TableHead>
                <TableHead className="text-xs text-center">Total</TableHead>
                <TableHead className="text-xs text-center">No. of Females</TableHead>
                {isEditing && <TableHead className="text-xs w-12"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {womenRepresentation.map((row, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    {isEditing ? (
                      <Select value={row.category} onValueChange={(v) => {
                        const updated = [...womenRepresentation]; updated[idx].category = v; setWomenRepresentation(updated);
                      }}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{CATEGORIES_WOMEN.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : <span className="text-xs">{row.category}</span>}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input type="number" min="0" value={row.total} onChange={(e) => {
                        const updated = [...womenRepresentation]; updated[idx].total = parseInt(e.target.value) || 0; setWomenRepresentation(updated);
                      }} className="h-7 text-xs text-center" />
                    ) : <span className="text-xs">{row.total}</span>}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input type="number" min="0" value={row.number_of_females} onChange={(e) => {
                        const updated = [...womenRepresentation]; updated[idx].number_of_females = parseInt(e.target.value) || 0; setWomenRepresentation(updated);
                      }} className="h-7 text-xs text-center" />
                    ) : <span className="text-xs">{row.number_of_females}</span>}
                  </TableCell>
                  {isEditing && (
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => {
                        if (womenRepresentation.length > 1) setWomenRepresentation(womenRepresentation.filter((_, i) => i !== idx));
                      }} className="h-6 w-6 p-0 text-red-500"><Trash2 className="w-3 h-3" /></Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {isEditing && (
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setWomenRepresentation([...womenRepresentation, { category: "Board of Directors", total: 0, number_of_females: 0 }])}>
              <Plus className="w-3 h-3 mr-1" /> Add Row
            </Button>
          )}
        </CollapsibleContent>
      </Collapsible>
      )}

      {/* 3. CSR Applicability */}
      <Collapsible open={openSections.csr} onOpenChange={() => toggleSection('csr')} className="border rounded-lg bg-white">
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-3 hover:bg-stone-50">
            <div className="flex items-center gap-2">
              {openSections.csr ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <Building2 className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">CSR Applicability</span>
            </div>
            <Badge variant="outline" className={`text-xs ${csrApplicability.is_applicable ? 'bg-green-50 text-green-700' : ''}`}>
              {csrApplicability.is_applicable ? 'Applicable' : 'Not Applicable'}
            </Badge>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 pt-0 border-t">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 border rounded bg-stone-50">
              <Label className="text-xs">CSR under Section 135?</Label>
              {isEditing ? (
                <div className="flex items-center gap-2 mt-2">
                  <Switch checked={csrApplicability.is_applicable} onCheckedChange={(v) => setCSRApplicability(p => ({ ...p, is_applicable: v }))} />
                  <span className="text-xs">{csrApplicability.is_applicable ? 'Yes' : 'No'}</span>
                </div>
              ) : <p className="text-sm font-medium mt-1">{csrApplicability.is_applicable ? 'Yes' : 'No'}</p>}
            </div>
            <div className="p-3 border rounded">
              <Label className="text-xs flex items-center gap-1"><IndianRupee className="w-3 h-3" /> Net Worth</Label>
              {isEditing ? (
                <Input type="number" min="0" value={csrApplicability.net_worth_inr} onChange={(e) => setCSRApplicability(p => ({ ...p, net_worth_inr: parseFloat(e.target.value) || 0 }))} className="h-8 mt-1" />
              ) : <p className="text-sm font-medium mt-1">{formatINR(csrApplicability.net_worth_inr)}</p>}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* 4. Holding/Subsidiary Companies */}
      <Collapsible open={openSections.holding} onOpenChange={() => toggleSection('holding')} className="border rounded-lg bg-white">
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-3 hover:bg-stone-50">
            <div className="flex items-center gap-2">
              {openSections.holding ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <Building className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">Holding, Subsidiary & Associate Companies</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {holdingEntities.filter(e => e.name_of_entity).length} Entities
            </Badge>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 pt-0 border-t">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50">
                  <TableHead className="text-xs min-w-[150px]">Entity Name</TableHead>
                  <TableHead className="text-xs min-w-[120px]">Type</TableHead>
                  <TableHead className="text-xs text-center">% Shares</TableHead>
                  <TableHead className="text-xs text-center">BR Participation</TableHead>
                  {isEditing && <TableHead className="text-xs w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdingEntities.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      {isEditing ? (
                        <Input value={row.name_of_entity} onChange={(e) => {
                          const updated = [...holdingEntities]; updated[idx].name_of_entity = e.target.value; setHoldingEntities(updated);
                        }} className="h-7 text-xs" placeholder="Entity name" />
                      ) : <span className="text-xs">{row.name_of_entity || '-'}</span>}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Select value={row.type_of_entity} onValueChange={(v) => {
                          const updated = [...holdingEntities]; updated[idx].type_of_entity = v; setHoldingEntities(updated);
                        }}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{ENTITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : <span className="text-xs">{row.type_of_entity}</span>}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input type="number" min="0" max="100" value={row.shares_held_percentage} onChange={(e) => {
                          const updated = [...holdingEntities]; updated[idx].shares_held_percentage = parseFloat(e.target.value) || 0; setHoldingEntities(updated);
                        }} className="h-7 text-xs text-center" />
                      ) : <span className="text-xs">{row.shares_held_percentage}%</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {isEditing ? (
                        <Switch checked={row.participates_in_br_initiatives} onCheckedChange={(v) => {
                          const updated = [...holdingEntities]; updated[idx].participates_in_br_initiatives = v; setHoldingEntities(updated);
                        }} />
                      ) : <Badge variant="outline" className={`text-xs ${row.participates_in_br_initiatives ? 'bg-green-50 text-green-700' : ''}`}>{row.participates_in_br_initiatives ? 'Yes' : 'No'}</Badge>}
                    </TableCell>
                    {isEditing && (
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => {
                          if (holdingEntities.length > 1) setHoldingEntities(holdingEntities.filter((_, i) => i !== idx));
                        }} className="h-6 w-6 p-0 text-red-500"><Trash2 className="w-3 h-3" /></Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {isEditing && (
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setHoldingEntities([...holdingEntities, { name_of_entity: "", type_of_entity: "Subsidiary", shares_held_percentage: 0, participates_in_br_initiatives: false }])}>
              <Plus className="w-3 h-3 mr-1" /> Add Entity
            </Button>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* 5. Turnover Rate Matrix */}
      {!hideSections.includes('turnover_rate') && (
      <Collapsible open={openSections.turnover} onOpenChange={() => toggleSection('turnover')} className="border rounded-lg bg-white">
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-3 hover:bg-stone-50">
            <div className="flex items-center gap-2">
              {openSections.turnover ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <TrendingDown className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">Turnover Rate (%) - Last 3 Financial Years</span>
            </div>
            <Badge variant="outline" className="text-xs">3 Years</Badge>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 pt-0 border-t">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-100">
                  <TableHead className="text-xs font-semibold" rowSpan={2}>Category</TableHead>
                  <TableHead className="text-xs text-center font-semibold border-l" colSpan={2}>Current FY ({reportingYear})</TableHead>
                  <TableHead className="text-xs text-center font-semibold border-l" colSpan={2}>Previous FY ({prevFY})</TableHead>
                  <TableHead className="text-xs text-center font-semibold border-l" colSpan={2}>Prior FY ({priorFY})</TableHead>
                </TableRow>
                <TableRow className="bg-stone-50">
                  <TableHead className="text-xs text-center border-l">Male</TableHead>
                  <TableHead className="text-xs text-center">Female</TableHead>
                  <TableHead className="text-xs text-center border-l">Male</TableHead>
                  <TableHead className="text-xs text-center">Female</TableHead>
                  <TableHead className="text-xs text-center border-l">Male</TableHead>
                  <TableHead className="text-xs text-center">Female</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Permanent Employees Row */}
                <TableRow>
                  <TableCell className="text-xs font-medium">Permanent Employees</TableCell>
                  {/* Current - Editable */}
                  <TableCell className="border-l">
                    {isEditing ? (
                      <Input type="number" min="0" max="100" step="0.1" value={turnoverRate.permanent_employees_male}
                        onChange={(e) => setTurnoverRate(p => ({ ...p, permanent_employees_male: parseFloat(e.target.value) || 0 }))}
                        className="h-7 text-xs text-center w-16" />
                    ) : <span className="text-xs">{turnoverRate.permanent_employees_male}%</span>}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input type="number" min="0" max="100" step="0.1" value={turnoverRate.permanent_employees_female}
                        onChange={(e) => setTurnoverRate(p => ({ ...p, permanent_employees_female: parseFloat(e.target.value) || 0 }))}
                        className="h-7 text-xs text-center w-16" />
                    ) : <span className="text-xs">{turnoverRate.permanent_employees_female}%</span>}
                  </TableCell>
                  {/* Previous - Editable */}
                  <TableCell className="border-l bg-stone-50">
                    {isEditing ? (
                      <Input type="number" min="0" max="100" step="0.1" value={prevYearTurnover.permanent_employees_male}
                        onChange={(e) => setPrevYearTurnover(p => ({ ...p, permanent_employees_male: parseFloat(e.target.value) || 0 }))}
                        className="h-7 text-xs text-center w-16" />
                    ) : <span className="text-xs">{prevYearTurnover.permanent_employees_male}%</span>}
                  </TableCell>
                  <TableCell className="bg-stone-50">
                    {isEditing ? (
                      <Input type="number" min="0" max="100" step="0.1" value={prevYearTurnover.permanent_employees_female}
                        onChange={(e) => setPrevYearTurnover(p => ({ ...p, permanent_employees_female: parseFloat(e.target.value) || 0 }))}
                        className="h-7 text-xs text-center w-16" />
                    ) : <span className="text-xs">{prevYearTurnover.permanent_employees_female}%</span>}
                  </TableCell>
                  {/* Prior - Editable */}
                  <TableCell className="border-l bg-stone-100">
                    {isEditing ? (
                      <Input type="number" min="0" max="100" step="0.1" value={priorYearTurnover.permanent_employees_male}
                        onChange={(e) => setPriorYearTurnover(p => ({ ...p, permanent_employees_male: parseFloat(e.target.value) || 0 }))}
                        className="h-7 text-xs text-center w-16" />
                    ) : <span className="text-xs">{priorYearTurnover.permanent_employees_male}%</span>}
                  </TableCell>
                  <TableCell className="bg-stone-100">
                    {isEditing ? (
                      <Input type="number" min="0" max="100" step="0.1" value={priorYearTurnover.permanent_employees_female}
                        onChange={(e) => setPriorYearTurnover(p => ({ ...p, permanent_employees_female: parseFloat(e.target.value) || 0 }))}
                        className="h-7 text-xs text-center w-16" />
                    ) : <span className="text-xs">{priorYearTurnover.permanent_employees_female}%</span>}
                  </TableCell>
                </TableRow>
                {/* Permanent Workers Row */}
                <TableRow>
                  <TableCell className="text-xs font-medium">Permanent Workers</TableCell>
                  {/* Current - Editable */}
                  <TableCell className="border-l">
                    {isEditing ? (
                      <Input type="number" min="0" max="100" step="0.1" value={turnoverRate.permanent_workers_male}
                        onChange={(e) => setTurnoverRate(p => ({ ...p, permanent_workers_male: parseFloat(e.target.value) || 0 }))}
                        className="h-7 text-xs text-center w-16" />
                    ) : <span className="text-xs">{turnoverRate.permanent_workers_male}%</span>}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input type="number" min="0" max="100" step="0.1" value={turnoverRate.permanent_workers_female}
                        onChange={(e) => setTurnoverRate(p => ({ ...p, permanent_workers_female: parseFloat(e.target.value) || 0 }))}
                        className="h-7 text-xs text-center w-16" />
                    ) : <span className="text-xs">{turnoverRate.permanent_workers_female}%</span>}
                  </TableCell>
                  {/* Previous - Editable */}
                  <TableCell className="border-l bg-stone-50">
                    {isEditing ? (
                      <Input type="number" min="0" max="100" step="0.1" value={prevYearTurnover.permanent_workers_male}
                        onChange={(e) => setPrevYearTurnover(p => ({ ...p, permanent_workers_male: parseFloat(e.target.value) || 0 }))}
                        className="h-7 text-xs text-center w-16" />
                    ) : <span className="text-xs">{prevYearTurnover.permanent_workers_male}%</span>}
                  </TableCell>
                  <TableCell className="bg-stone-50">
                    {isEditing ? (
                      <Input type="number" min="0" max="100" step="0.1" value={prevYearTurnover.permanent_workers_female}
                        onChange={(e) => setPrevYearTurnover(p => ({ ...p, permanent_workers_female: parseFloat(e.target.value) || 0 }))}
                        className="h-7 text-xs text-center w-16" />
                    ) : <span className="text-xs">{prevYearTurnover.permanent_workers_female}%</span>}
                  </TableCell>
                  {/* Prior - Editable */}
                  <TableCell className="border-l bg-stone-100">
                    {isEditing ? (
                      <Input type="number" min="0" max="100" step="0.1" value={priorYearTurnover.permanent_workers_male}
                        onChange={(e) => setPriorYearTurnover(p => ({ ...p, permanent_workers_male: parseFloat(e.target.value) || 0 }))}
                        className="h-7 text-xs text-center w-16" />
                    ) : <span className="text-xs">{priorYearTurnover.permanent_workers_male}%</span>}
                  </TableCell>
                  <TableCell className="bg-stone-100">
                    {isEditing ? (
                      <Input type="number" min="0" max="100" step="0.1" value={priorYearTurnover.permanent_workers_female}
                        onChange={(e) => setPriorYearTurnover(p => ({ ...p, permanent_workers_female: parseFloat(e.target.value) || 0 }))}
                        className="h-7 text-xs text-center w-16" />
                    ) : <span className="text-xs">{priorYearTurnover.permanent_workers_female}%</span>}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-text-muted mt-2">* All 3 years are editable. Saving will update each year&apos;s document separately.</p>
        </CollapsibleContent>
      </Collapsible>
      )}

      {/* 6. Complaints & Grievances */}
      {!hideSections.includes('complaints_grievances') && (
      <Collapsible open={openSections.complaints} onOpenChange={() => toggleSection('complaints')} className="border rounded-lg bg-white">
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-3 hover:bg-stone-50">
            <div className="flex items-center gap-2">
              {openSections.complaints ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <MessageSquareWarning className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">Complaints & Grievances</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {complaintsGrievances.reduce((sum, c) => sum + (c.current_fy_filed || 0), 0)} Filed
            </Badge>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 pt-0 border-t">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50">
                  <TableHead className="text-xs min-w-[150px]">Category</TableHead>
                  <TableHead className="text-xs text-center min-w-[80px]">Mechanism</TableHead>
                  <TableHead className="text-xs min-w-[150px]">Policy Web-link</TableHead>
                  <TableHead className="text-xs text-center">Filed</TableHead>
                  <TableHead className="text-xs text-center">Pending</TableHead>
                  <TableHead className="text-xs min-w-[120px]">Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {complaintsGrievances.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-xs font-medium">{row.category}</TableCell>
                    <TableCell className="text-center">
                      {isEditing ? (
                        <Switch
                          checked={row.has_grievance_mechanism}
                          onCheckedChange={(v) => {
                            const updated = [...complaintsGrievances];
                            updated[idx].has_grievance_mechanism = v;
                            if (!v) updated[idx].policy_weblink = "";
                            setComplaintsGrievances(updated);
                          }}
                        />
                      ) : (
                        <Badge variant="outline" className={`text-xs ${row.has_grievance_mechanism ? 'bg-green-50 text-green-700' : ''}`}>
                          {row.has_grievance_mechanism ? 'Yes' : 'No'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={row.policy_weblink}
                          onChange={(e) => {
                            const updated = [...complaintsGrievances];
                            updated[idx].policy_weblink = e.target.value;
                            setComplaintsGrievances(updated);
                          }}
                          placeholder={row.has_grievance_mechanism ? "Required" : "N/A"}
                          disabled={!row.has_grievance_mechanism}
                          className={`h-7 text-xs ${row.has_grievance_mechanism && !row.policy_weblink ? 'border-red-300' : ''}`}
                        />
                      ) : (
                        <span className="text-xs text-blue-600 underline">{row.policy_weblink || '-'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input type="number" min="0" value={row.current_fy_filed}
                          onChange={(e) => {
                            const updated = [...complaintsGrievances];
                            updated[idx].current_fy_filed = parseInt(e.target.value) || 0;
                            setComplaintsGrievances(updated);
                          }}
                          className="h-7 text-xs text-center w-16" />
                      ) : <span className="text-xs">{row.current_fy_filed}</span>}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input type="number" min="0" value={row.current_fy_pending}
                          onChange={(e) => {
                            const updated = [...complaintsGrievances];
                            updated[idx].current_fy_pending = parseInt(e.target.value) || 0;
                            setComplaintsGrievances(updated);
                          }}
                          className="h-7 text-xs text-center w-16" />
                      ) : <span className="text-xs">{row.current_fy_pending}</span>}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input value={row.current_fy_remarks}
                          onChange={(e) => {
                            const updated = [...complaintsGrievances];
                            updated[idx].current_fy_remarks = e.target.value;
                            setComplaintsGrievances(updated);
                          }}
                          className="h-7 text-xs" placeholder="Remarks" />
                      ) : <span className="text-xs">{row.current_fy_remarks || '-'}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-text-muted mt-2">* Web-link is mandatory when Grievance Mechanism is enabled</p>
        </CollapsibleContent>
      </Collapsible>
      )}

      {/* 7. Material Responsible Business Conduct Issues */}
      <Collapsible open={openSections.materialIssues} onOpenChange={() => toggleSection('materialIssues')} className="border rounded-lg bg-white">
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-3 hover:bg-stone-50">
            <div className="flex items-center gap-2">
              {openSections.materialIssues ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <AlertTriangle className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">Material Business Conduct Issues</span>
            </div>
            <Badge variant="outline" className="text-xs">{materialIssues.filter(i => i.issue_identified).length} Issues</Badge>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 pt-0 border-t">
          <div className="space-y-3">
            {materialIssues.map((issue, idx) => (
              <div key={idx} className="border rounded-lg p-3 bg-stone-50">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-medium text-stone-500">Issue #{idx + 1}</span>
                  {isEditing && materialIssues.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => setMaterialIssues(materialIssues.filter((_, i) => i !== idx))}
                      className="h-6 w-6 p-0 text-red-500"><Trash2 className="w-3 h-3" /></Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Material Issue Identified</Label>
                    {isEditing ? (
                      <Textarea value={issue.issue_identified} onChange={(e) => {
                        const updated = [...materialIssues]; updated[idx].issue_identified = e.target.value; setMaterialIssues(updated);
                      }} className="text-xs mt-1" rows={2} placeholder="Describe the material issue" />
                    ) : <p className="text-xs mt-1">{issue.issue_identified || '-'}</p>}
                  </div>
                  <div>
                    <Label className="text-xs">Risk or Opportunity</Label>
                    {isEditing ? (
                      <Select value={issue.risk_or_opportunity} onValueChange={(v) => {
                        const updated = [...materialIssues]; updated[idx].risk_or_opportunity = v; setMaterialIssues(updated);
                      }}>
                        <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Risk">Risk</SelectItem>
                          <SelectItem value="Opportunity">Opportunity</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className={`text-xs mt-1 ${issue.risk_or_opportunity === 'Risk' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                        {issue.risk_or_opportunity}
                      </Badge>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Rationale for Identification</Label>
                    {isEditing ? (
                      <Textarea value={issue.rationale} onChange={(e) => {
                        const updated = [...materialIssues]; updated[idx].rationale = e.target.value; setMaterialIssues(updated);
                      }} className="text-xs mt-1" rows={2} placeholder="Why was this identified?" />
                    ) : <p className="text-xs mt-1">{issue.rationale || '-'}</p>}
                  </div>
                  <div>
                    <Label className="text-xs">Mitigation Approach {issue.risk_or_opportunity === 'Risk' && <span className="text-red-500">*</span>}</Label>
                    {isEditing ? (
                      <Textarea value={issue.mitigation_approach} onChange={(e) => {
                        const updated = [...materialIssues]; updated[idx].mitigation_approach = e.target.value; setMaterialIssues(updated);
                      }} className="text-xs mt-1" rows={2} placeholder={issue.risk_or_opportunity === 'Risk' ? 'Required for risks' : 'Optional'} />
                    ) : <p className="text-xs mt-1">{issue.mitigation_approach || '-'}</p>}
                  </div>
                  <div>
                    <Label className="text-xs">Financial Implication</Label>
                    {isEditing ? (
                      <Select value={issue.financial_implication} onValueChange={(v) => {
                        const updated = [...materialIssues]; updated[idx].financial_implication = v; setMaterialIssues(updated);
                      }}>
                        <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Positive">Positive</SelectItem>
                          <SelectItem value="Negative">Negative</SelectItem>
                          <SelectItem value="Neutral">Neutral</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className={`text-xs mt-1 ${issue.financial_implication === 'Positive' ? 'bg-green-50 text-green-700' : issue.financial_implication === 'Negative' ? 'bg-red-50 text-red-700' : ''}`}>
                        {issue.financial_implication}
                      </Badge>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Financial Details</Label>
                    {isEditing ? (
                      <Textarea value={issue.financial_details} onChange={(e) => {
                        const updated = [...materialIssues]; updated[idx].financial_details = e.target.value; setMaterialIssues(updated);
                      }} className="text-xs mt-1" rows={2} placeholder="Describe financial implications" />
                    ) : <p className="text-xs mt-1">{issue.financial_details || '-'}</p>}
                  </div>
                </div>
              </div>
            ))}
            {isEditing && (
              <Button variant="outline" size="sm" onClick={() => setMaterialIssues([...materialIssues, { ...DEFAULT_MATERIAL_ISSUE_ROW }])}>
                <Plus className="w-3 h-3 mr-1" /> Add Issue
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Single Save Button for All Sections */}
      {isEditing && (
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={saveAllYearlyData} disabled={saving} className="bg-primary hover:bg-primary/90 text-white" data-testid="save-all-yearly-btn">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : <><Save className="w-4 h-4 mr-2" /> Save All Yearly Data</>}
          </Button>
        </div>
      )}

      {/* History Modal */}
      <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Historical Yearly Data</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {historicalData.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-8">No historical data available</p>
            ) : (
              historicalData.map((yearData) => (
                <div key={yearData.reporting_year} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">{yearData.reporting_year}</h4>
                    <Button variant="outline" size="sm" onClick={() => { setReportingYear(yearData.reporting_year); setShowHistoryModal(false); }}>
                      Load & Edit
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div className="bg-stone-50 p-2 rounded">Employees: {(yearData.employee_worker_details?.permanent_male_employees || 0) + (yearData.employee_worker_details?.permanent_female_employees || 0)}</div>
                    <div className="bg-stone-50 p-2 rounded">CSR: {yearData.csr_applicability?.is_applicable ? 'Yes' : 'No'}</div>
                    <div className="bg-stone-50 p-2 rounded">Entities: {yearData.holding_subsidiary_entities?.length || 0}</div>
                    <div className="bg-stone-50 p-2 rounded">Women on Board: {yearData.women_representation?.reduce((s, r) => s + (r.number_of_females || 0), 0) || 0}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
