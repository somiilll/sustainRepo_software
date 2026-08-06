import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { toast } from 'sonner';
import { 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  Trash2, 
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  History,
  Save,
  Clock
} from 'lucide-react';

// Import yearly sections component for year-specific data (Employees, CSR, etc.)
import BRSRYearlySections from './BRSRYearlySections';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Empty row templates for dynamic tables
const EMPTY_BUSINESS_ACTIVITY = { description: '', main_activity: '', turnover_percentage: 0 };
const EMPTY_PRODUCT_SERVICE = { product_service: '', nic_code: '', turnover_percentage: 0 };
const EMPTY_PLANT_OFFICE = { location_type: 'National', num_plants: 0, num_offices: 0 };
const EMPTY_MARKET_SERVED = { location_type: 'National', number: 0 };

export default function BRSRDetailsSection({ 
  isEditing = false, 
  onDataChange = null,
  initialData = null,
  isCollapsible = true,
  hideSections = [],
  reportingPeriod = ''
}) {
  const { getAuthHeader, user } = useAuth();
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(null); // Track which question is being saved
  const [isComplete, setIsComplete] = useState(false);
  const [missingFields, setMissingFields] = useState([]);
  
  // Track dirty (changed) question keys for save optimization
  const [dirtyFields, setDirtyFields] = useState(new Set());
  // Store original data to detect changes
  const [originalData, setOriginalData] = useState({});
  // User's assigned question keys (empty = admin can edit all)
  const [assignedQuestionKeys, setAssignedQuestionKeys] = useState(null); // null = loading, [] = none assigned
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  
  // Question statuses and version history (similar to Section B/C)
  const [questionStatuses, setQuestionStatuses] = useState({});
  const [questionHistory, setQuestionHistory] = useState({});
  const [showHistoryFor, setShowHistoryFor] = useState(null); // question_key to show history modal
  
  // BRSR Form Data - Section A: General Disclosures
  const [formData, setFormData] = useState({
    // I. Details of the Listed Entity (Q1-15)
    cin: '',                              // Q1: Corporate Identity Number
    listed_entity_name: '',               // Q2: Name of the Listed Entity
    year_of_incorporation: '',            // Q3: Year of incorporation
    registered_address: '',               // Q4: Registered office address
    registered_city: '',
    registered_state: '',
    registered_country: '',
    registered_pincode: '',
    corporate_address: '',                // Q5: Corporate address (NEW)
    corporate_city: '',
    corporate_state: '',
    corporate_country: '',
    corporate_pincode: '',
    email: '',                            // Q6: E-mail
    telephone: '',                        // Q7: Telephone
    website: '',                          // Q8: Website
    // Q9: Financial year - handled by reporting_period
    stock_exchange: '',                   // Q10: Name of Stock Exchange(s)
    paid_up_capital: '',                  // Q11: Paid-up Capital
    // Q12: BRSR Contact Person
    brsr_contact_name: '',
    brsr_contact_telephone: '',
    brsr_contact_email: '',
    reporting_boundary: '',               // Q13: Reporting boundary
    assurance_provider: '',               // Q14: Name of assurance provider
    assurance_type: '',                   // Q15: Type of assurance obtained
    
    // II. Products/Services (Q16-17)
    business_activities: [{ ...EMPTY_BUSINESS_ACTIVITY }],  // Q16
    products_services: [{ ...EMPTY_PRODUCT_SERVICE }],      // Q17
    
    // III. Operations (Q18-19)
    plants_offices: [{ ...EMPTY_PLANT_OFFICE }],            // Q18
    markets_served: [{ ...EMPTY_MARKET_SERVED }],           // Q19a
    export_contribution_percentage: '',                      // Q19b
    customer_types_brief: '',                                // Q19c
    
    // Reporting period for year-specific data
    reporting_period: '',
  });

  useEffect(() => {
    if (reportingPeriod) {
      fetchBRSRDetails();
      fetchUserAssignments();
      fetchQuestionStatuses();
    }
  }, [reportingPeriod]);

  // Fetch user's assigned Section A question keys
  const fetchUserAssignments = async () => {
    if (isAdmin) {
      // Admins can edit all questions
      setAssignedQuestionKeys([]);
      return;
    }
    
    try {
      const res = await axios.get(
        `${API}/esg-assignments/my-accessible-questions`,
        { 
          headers: getAuthHeader(),
          params: { 
            reporting_period: reportingPeriod,
            section: 'section_a'
          }
        }
      );
      
      // If admin or has full access, allow all
      if (res.data.is_admin || res.data.has_full_access) {
        setAssignedQuestionKeys([]);
        return;
      }
      
      // Filter to only Section A questions (brsr_a_*)
      const sectionAKeys = (res.data.accessible_questions || [])
        .filter(k => k.startsWith('brsr_a_'));
      
      setAssignedQuestionKeys(sectionAKeys);
    } catch (error) {
      console.error('Failed to fetch accessible questions:', error);
      // On error, assume no assignments (will show nothing for non-admins)
      setAssignedQuestionKeys([]);
    }
  };

  // Check if user can edit a specific question
  const canEditQuestion = (questionKey) => {
    if (isAdmin) return true;
    if (assignedQuestionKeys === null) return false; // Still loading
    return assignedQuestionKeys.includes(questionKey);
  };

  // Check if user can see a specific question (same as canEdit for now)
  const canSeeQuestion = (questionKey) => {
    if (isAdmin) return true;
    if (assignedQuestionKeys === null) return false;
    if (assignedQuestionKeys.length === 0) return false; // No assignments
    return assignedQuestionKeys.includes(questionKey);
  };

  // Update reporting_period in formData when prop changes
  useEffect(() => {
    if (reportingPeriod) {
      setFormData(prev => ({
        ...prev,
        reporting_period: reportingPeriod
      }));
    }
  }, [reportingPeriod]);

  useEffect(() => {
    if (initialData) {
      setFormData(prev => ({
        ...prev,
        ...initialData,
        business_activities: initialData.business_activities?.length > 0 
          ? initialData.business_activities 
          : [{ ...EMPTY_BUSINESS_ACTIVITY }],
        products_services: initialData.products_services?.length > 0 
          ? initialData.products_services 
          : [{ ...EMPTY_PRODUCT_SERVICE }],
        plants_offices: initialData.plants_offices?.length > 0 
          ? initialData.plants_offices 
          : [{ ...EMPTY_PLANT_OFFICE }],
        markets_served: initialData.markets_served?.length > 0 
          ? initialData.markets_served 
          : [{ ...EMPTY_MARKET_SERVED }],
      }));
    }
  }, [initialData]);

  // Map question keys to form field names
  const QUESTION_KEY_MAP = {
    'brsr_a_cin': 'cin',
    'brsr_a_entity_name': 'listed_entity_name',
    'brsr_a_year_of_incorporation': 'year_of_incorporation',
    'brsr_a_registered_address': 'registered_address_obj',
    'brsr_a_corporate_address': 'corporate_address_obj',
    'brsr_a_email': 'email',
    'brsr_a_telephone': 'telephone',
    'brsr_a_website': 'website',
    'brsr_a_stock_exchange': 'stock_exchange',
    'brsr_a_paid_up_capital': 'paid_up_capital',
    'brsr_a_contact_person': 'brsr_contact',
    'brsr_a_reporting_boundary': 'reporting_boundary',
    'brsr_a_assurance_provider': 'assurance_provider',
    'brsr_a_assurance_type': 'assurance_type',
    'brsr_a_business_activities': 'business_activities',
    'brsr_a_products_services': 'products_services',
    'brsr_a_plants_offices': 'plants_offices',
    'brsr_a_markets_served': 'markets_served_obj',
  };
  
  // Convert API responses to form data
  const mapResponsesToFormData = (responses) => {
    const mapped = { ...formData };
    
    // Simple field mappings
    if (responses.brsr_a_cin) mapped.cin = responses.brsr_a_cin;
    if (responses.brsr_a_entity_name) mapped.listed_entity_name = responses.brsr_a_entity_name;
    if (responses.brsr_a_year_of_incorporation) mapped.year_of_incorporation = responses.brsr_a_year_of_incorporation;
    if (responses.brsr_a_email) mapped.email = responses.brsr_a_email;
    if (responses.brsr_a_telephone) mapped.telephone = responses.brsr_a_telephone;
    if (responses.brsr_a_website) mapped.website = responses.brsr_a_website;
    if (responses.brsr_a_stock_exchange) mapped.stock_exchange = responses.brsr_a_stock_exchange;
    if (responses.brsr_a_paid_up_capital) mapped.paid_up_capital = responses.brsr_a_paid_up_capital;
    if (responses.brsr_a_reporting_boundary) mapped.reporting_boundary = responses.brsr_a_reporting_boundary;
    if (responses.brsr_a_assurance_provider) mapped.assurance_provider = responses.brsr_a_assurance_provider;
    if (responses.brsr_a_assurance_type) mapped.assurance_type = responses.brsr_a_assurance_type;
    
    // Address objects
    if (responses.brsr_a_registered_address) {
      const addr = responses.brsr_a_registered_address;
      mapped.registered_address = addr.address || '';
      mapped.registered_city = addr.city || '';
      mapped.registered_state = addr.state || '';
      mapped.registered_country = addr.country || 'India';
      mapped.registered_pincode = addr.pincode || '';
    }
    if (responses.brsr_a_corporate_address) {
      const addr = responses.brsr_a_corporate_address;
      mapped.corporate_address = addr.address || '';
      mapped.corporate_city = addr.city || '';
      mapped.corporate_state = addr.state || '';
      mapped.corporate_country = addr.country || 'India';
      mapped.corporate_pincode = addr.pincode || '';
    }
    
    // Contact person
    if (responses.brsr_a_contact_person) {
      const contact = responses.brsr_a_contact_person;
      mapped.brsr_contact_name = contact.name || '';
      mapped.brsr_contact_telephone = contact.telephone || '';
      mapped.brsr_contact_email = contact.email || '';
    }
    
    // Markets served - now separate question keys
    if (responses.brsr_a_markets_served) {
      // Handle both old nested format and new flat format
      const markets = responses.brsr_a_markets_served;
      if (Array.isArray(markets)) {
        // New flat format - just the locations array
        mapped.markets_served = markets;
      } else if (markets.locations) {
        // Old nested format - extract locations
        mapped.markets_served = markets.locations;
      }
    }
    
    // Separate question keys for export contribution and customer types
    if (responses.brsr_a_export_contribution !== undefined) {
      mapped.export_contribution_percentage = responses.brsr_a_export_contribution;
    }
    if (responses.brsr_a_customer_types !== undefined) {
      mapped.customer_types_brief = responses.brsr_a_customer_types;
    }
    
    // Dynamic tables
    if (responses.brsr_a_business_activities?.length > 0) {
      mapped.business_activities = responses.brsr_a_business_activities;
    }
    if (responses.brsr_a_products_services?.length > 0) {
      mapped.products_services = responses.brsr_a_products_services;
    }
    if (responses.brsr_a_plants_offices?.length > 0) {
      mapped.plants_offices = responses.brsr_a_plants_offices;
    }
    
    return mapped;
  };
  
  // Convert form data to API responses format
  const mapFormDataToResponses = () => {
    return {
      brsr_a_cin: formData.cin,
      brsr_a_entity_name: formData.listed_entity_name,
      brsr_a_year_of_incorporation: formData.year_of_incorporation,
      brsr_a_registered_address: {
        address: formData.registered_address,
        city: formData.registered_city,
        state: formData.registered_state,
        country: formData.registered_country,
        pincode: formData.registered_pincode,
      },
      brsr_a_corporate_address: {
        address: formData.corporate_address,
        city: formData.corporate_city,
        state: formData.corporate_state,
        country: formData.corporate_country,
        pincode: formData.corporate_pincode,
      },
      brsr_a_email: formData.email,
      brsr_a_telephone: formData.telephone,
      brsr_a_website: formData.website,
      brsr_a_stock_exchange: formData.stock_exchange,
      brsr_a_paid_up_capital: formData.paid_up_capital,
      brsr_a_contact_person: {
        name: formData.brsr_contact_name,
        telephone: formData.brsr_contact_telephone,
        email: formData.brsr_contact_email,
      },
      brsr_a_reporting_boundary: formData.reporting_boundary,
      brsr_a_assurance_provider: formData.assurance_provider,
      brsr_a_assurance_type: formData.assurance_type,
      brsr_a_business_activities: formData.business_activities,
      brsr_a_products_services: formData.products_services,
      brsr_a_plants_offices: formData.plants_offices,
      brsr_a_markets_served: formData.markets_served,  // Only locations table
      brsr_a_export_contribution: formData.export_contribution_percentage,  // Separate question
      brsr_a_customer_types: formData.customer_types_brief,  // Separate question
    };
  };

  const fetchBRSRDetails = async () => {
    if (!reportingPeriod) return;
    
    try {
      // Fetch from ESG Questionnaire API (unified storage)
      const res = await axios.get(
        `${API}/esg-questionnaire/responses/BRSR/section_a/${encodeURIComponent(reportingPeriod)}`,
        { headers: getAuthHeader() }
      );
      
      if (res.data.responses && Object.keys(res.data.responses).length > 0) {
        const mappedData = mapResponsesToFormData(res.data.responses);
        setFormData(prev => ({
          ...prev,
          ...mappedData,
          reporting_period: reportingPeriod,
        }));
        
        // Store original data for change comparison in Save All
        setOriginalData(res.data.responses);
        
        // Check completeness based on required fields
        const missing = [];
        if (!mappedData.cin) missing.push('cin');
        if (!mappedData.listed_entity_name) missing.push('listed_entity_name');
        if (!mappedData.email) missing.push('email');
        setMissingFields(missing);
        setIsComplete(missing.length === 0);
      } else {
        // Reset to defaults
        setFormData(prev => ({
          ...prev,
          reporting_period: reportingPeriod,
          business_activities: [{ ...EMPTY_BUSINESS_ACTIVITY }],
          products_services: [{ ...EMPTY_PRODUCT_SERVICE }],
          plants_offices: [{ ...EMPTY_PLANT_OFFICE }],
          markets_served: [{ ...EMPTY_MARKET_SERVED }],
        }));
        setOriginalData({});
        setIsComplete(false);
        setMissingFields(['cin', 'listed_entity_name', 'email']);
      }
    } catch (error) {
      if (error.response?.status !== 404) {
        console.error('Failed to fetch BRSR details:', error);
      }
      // Initialize with empty data
      setFormData(prev => ({
        ...prev,
        reporting_period: reportingPeriod,
        business_activities: [{ ...EMPTY_BUSINESS_ACTIVITY }],
        products_services: [{ ...EMPTY_PRODUCT_SERVICE }],
        plants_offices: [{ ...EMPTY_PLANT_OFFICE }],
        markets_served: [{ ...EMPTY_MARKET_SERVED }],
      }));
    } finally {
      setLoading(false);
    }
  };

  // Fetch question statuses for Section A
  const fetchQuestionStatuses = async () => {
    try {
      const res = await axios.get(
        `${API}/esg-questionnaire/responses/BRSR/section_a/${encodeURIComponent(reportingPeriod)}/statuses`,
        { headers: getAuthHeader() }
      );
      setQuestionStatuses(res.data.statuses || {});
    } catch (error) {
      console.warn('Failed to fetch question statuses:', error);
      setQuestionStatuses({});
    }
  };

  // Fetch version history for a specific question
  const fetchQuestionHistory = async (questionKey) => {
    try {
      const res = await axios.get(
        `${API}/esg-questionnaire/history/${questionKey}`,
        { 
          params: { reporting_period: reportingPeriod },
          headers: getAuthHeader() 
        }
      );
      setQuestionHistory(prev => ({
        ...prev,
        [questionKey]: res.data.history || []
      }));
      return res.data.history || [];
    } catch (error) {
      console.error('Failed to fetch question history:', error);
      return [];
    }
  };

  // Save individual question (similar to Section B/C)
  const saveQuestion = async (questionKey, value) => {
    setSavingQuestion(questionKey);
    try {
      await axios.post(
        `${API}/esg-questionnaire/response`,
        { 
          question_key: questionKey, 
          value, 
          reporting_period: reportingPeriod,
          status: 'saved'
        },
        { headers: getAuthHeader() }
      );
      toast.success('Question saved');
      
      // Remove from dirty fields
      setDirtyFields(prev => {
        const newSet = new Set(prev);
        newSet.delete(questionKey);
        return newSet;
      });
      
      // Refresh statuses
      await fetchQuestionStatuses();
    } catch (error) {
      console.error('Save question error:', error);
      toast.error(error.response?.data?.detail || 'Failed to save question');
    } finally {
      setSavingQuestion(null);
    }
  };

  // Render status badge for a question
  const renderQuestionStatus = (questionKey) => {
    const status = questionStatuses[questionKey];
    if (!status) return null;
    
    const approvalState = status.approval_status;
    const saveState = status.status;
    
    // Handle "not_required" as completed without approval
    if (approvalState === 'not_required' || (!approvalState && saveState === 'saved')) {
      return (
        <Badge className="text-xs bg-slate-100 text-slate-700">
          Saved
        </Badge>
      );
    }
    
    const statusConfig = {
      pending_approval: { label: 'Awaiting Approval', className: 'bg-amber-100 text-amber-800' },
      approved: { label: 'Approved', className: 'bg-green-100 text-green-800' },
      rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800' },
      draft: { label: 'Draft', className: 'bg-blue-100 text-blue-800' },
      saved: { label: 'Saved', className: 'bg-slate-100 text-slate-700' },
    };
    
    const cfg = statusConfig[approvalState] || statusConfig[saveState];
    if (!cfg) return null;
    
    return (
      <Badge className={`text-xs ${cfg.className}`}>
        {cfg.label}
      </Badge>
    );
  };

  // Render history button and modal trigger
  const renderHistoryButton = (questionKey) => {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={async () => {
          await fetchQuestionHistory(questionKey);
          setShowHistoryFor(questionKey);
        }}
        title="View history"
      >
        <History className="h-4 w-4 text-gray-500" />
      </Button>
    );
  };

  // Render individual save button for a question
  const renderSaveButton = (questionKey, getValue) => {
    const isDirty = dirtyFields.has(questionKey);
    const isSaving = savingQuestion === questionKey;
    
    if (!isEditing) return null;
    
    // Always show button in edit mode, but disable when not dirty
    return (
      <Button
        variant="outline"
        size="sm"
        className={`h-7 px-2 text-xs ${!isDirty && !isSaving ? 'opacity-50' : ''}`}
        onClick={() => saveQuestion(questionKey, getValue())}
        disabled={isSaving || !isDirty}
      >
        {isSaving ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <>
            <Save className="h-3 w-3 mr-1" />
            Save
          </>
        )}
      </Button>
    );
  };

  // Render question header with status, history, and save button
  const renderQuestionHeader = (label, questionKey, getValue, required = false) => {
    return (
      <div className="flex items-center justify-between mb-1">
        <Label className="flex items-center gap-2">
          {label} {required && <span className="text-red-500">*</span>}
          {renderQuestionStatus(questionKey)}
        </Label>
        <div className="flex items-center gap-1">
          {renderHistoryButton(questionKey)}
          {renderSaveButton(questionKey, getValue)}
        </div>
      </div>
    );
  };

  // History modal component
  const renderHistoryModal = () => {
    if (!showHistoryFor) return null;
    
    const history = questionHistory[showHistoryFor] || [];
    
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowHistoryFor(null)}>
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="font-semibold">Version History: {showHistoryFor.replace(/_/g, ' ').replace('brsr a ', '')}</h3>
            <Button variant="ghost" size="sm" onClick={() => setShowHistoryFor(null)}>×</Button>
          </div>
          <div className="p-4 overflow-y-auto max-h-[60vh]">
            {history.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No history available</p>
            ) : (
              <div className="space-y-3">
                {history.map((entry, idx) => (
                  <div key={idx} className="border rounded p-3 text-sm">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium">{entry.performed_by?.name || 'Unknown'}</span>
                      <span className="text-gray-500 text-xs">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-gray-600">
                      <span className="capitalize">{entry.action}</span>
                      {entry.change_details?.old_value !== undefined && (
                        <div className="mt-1 text-xs">
                          <span className="text-red-600">- {JSON.stringify(entry.change_details.old_value)}</span>
                          <br />
                          <span className="text-green-600">+ {JSON.stringify(entry.change_details.new_value)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const handleInputChange = (field, value, questionKey = null) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
    
    // Track which question key was modified
    if (questionKey) {
      setDirtyFields(prev => new Set([...prev, questionKey]));
    }
  };

  // Dynamic table handlers
  const handleTableRowChange = (tableName, index, field, value, questionKey = null) => {
    const updated = { ...formData };
    updated[tableName] = [...formData[tableName]];
    updated[tableName][index] = { ...updated[tableName][index], [field]: value };
    setFormData(updated);
    
    // Track which question key was modified
    if (questionKey) {
      setDirtyFields(prev => new Set([...prev, questionKey]));
    }
  };

  const addTableRow = (tableName, emptyTemplate, questionKey = null) => {
    const updated = { ...formData };
    updated[tableName] = [...formData[tableName], { ...emptyTemplate }];
    setFormData(updated);
    
    if (questionKey) {
      setDirtyFields(prev => new Set([...prev, questionKey]));
    }
  };

  const removeTableRow = (tableName, index, questionKey = null) => {
    if (formData[tableName].length <= 1) {
      toast.error('At least one row is required');
      return;
    }
    const updated = { ...formData };
    updated[tableName] = formData[tableName].filter((_, i) => i !== index);
    setFormData(updated);
    
    if (questionKey) {
      setDirtyFields(prev => new Set([...prev, questionKey]));
    }
  };

  // Notify parent of data changes via useEffect (avoids setState-in-render)
  useEffect(() => {
    if (onDataChange && !loading) {
      onDataChange(formData);
    }
  }, [formData, loading]);

  // Convert form data to API responses format - compare with original and only return changed
  const mapChangedFieldsToResponses = () => {
    const allResponses = {
      brsr_a_cin: formData.cin,
      brsr_a_entity_name: formData.listed_entity_name,
      brsr_a_year_of_incorporation: formData.year_of_incorporation,
      brsr_a_registered_address: {
        address: formData.registered_address,
        city: formData.registered_city,
        state: formData.registered_state,
        country: formData.registered_country,
        pincode: formData.registered_pincode,
      },
      brsr_a_corporate_address: {
        address: formData.corporate_address,
        city: formData.corporate_city,
        state: formData.corporate_state,
        country: formData.corporate_country,
        pincode: formData.corporate_pincode,
      },
      brsr_a_email: formData.email,
      brsr_a_telephone: formData.telephone,
      brsr_a_website: formData.website,
      brsr_a_stock_exchange: formData.stock_exchange,
      brsr_a_paid_up_capital: formData.paid_up_capital,
      brsr_a_contact_person: {
        name: formData.brsr_contact_name,
        telephone: formData.brsr_contact_telephone,
        email: formData.brsr_contact_email,
      },
      brsr_a_reporting_boundary: formData.reporting_boundary,
      brsr_a_assurance_provider: formData.assurance_provider,
      brsr_a_assurance_type: formData.assurance_type,
      brsr_a_business_activities: formData.business_activities,
      brsr_a_products_services: formData.products_services,
      brsr_a_plants_offices: formData.plants_offices,
      brsr_a_markets_served: formData.markets_served,  // Only locations table
      brsr_a_export_contribution: formData.export_contribution_percentage,  // Separate question
      brsr_a_customer_types: formData.customer_types_brief,  // Separate question
    };
    
    // Compare with original data and only return changed fields
    const changedResponses = {};
    
    for (const [key, newValue] of Object.entries(allResponses)) {
      const oldValue = originalData[key];
      
      // Deep compare for objects/arrays
      const hasChanged = JSON.stringify(oldValue) !== JSON.stringify(newValue);
      
      if (hasChanged) {
        changedResponses[key] = newValue;
      }
    }
    
    return changedResponses;
  };

  // Legacy function - kept for backward compatibility
  const mapDirtyFieldsToResponses = () => {
    return mapChangedFieldsToResponses();
  };

  const saveBRSRDetails = async () => {
    // Get only the changed responses (compare with original)
    const responses = mapChangedFieldsToResponses();
    
    // Check if there's anything to save
    if (Object.keys(responses).length === 0) {
      toast.info('No changes to save');
      return;
    }
    
    setSaving(true);
    try {
      // Save via ESG Questionnaire API (unified storage with task/approval workflow)
      await axios.put(
        `${API}/esg-questionnaire/responses/BRSR/section_a/${encodeURIComponent(reportingPeriod)}`,
        { responses },
        { headers: getAuthHeader() }
      );
      
      // Clear dirty fields after successful save
      setDirtyFields(new Set());
      
      // Update original data with new values to prevent re-saving unchanged data
      setOriginalData(prev => ({ ...prev, ...responses }));
      
      // Refresh statuses after save
      await fetchQuestionStatuses();
      
      // Check completeness based on required fields
      const missing = [];
      if (!formData.cin) missing.push('cin');
      if (!formData.listed_entity_name) missing.push('listed_entity_name');
      if (!formData.email) missing.push('email');
      setMissingFields(missing);
      setIsComplete(missing.length === 0);
      
      toast.success(`BRSR Section A: ${Object.keys(responses).length} question(s) saved`);
    } catch (error) {
      console.error('Failed to save BRSR details:', error);
      toast.error(error.response?.data?.detail || 'Failed to save BRSR details');
    } finally {
      setSaving(false);
    }
  };

  // Get the data for parent component
  const getBRSRData = () => formData;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-text-muted">Loading BRSR details...</span>
      </div>
    );
  }

  const content = (
    <div className={`p-6 space-y-8 ${isCollapsible ? 'border-t' : ''}`}>
      {/* Show message if no questions assigned and not admin */}
      {!isAdmin && assignedQuestionKeys !== null && assignedQuestionKeys.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800">
          <p className="text-sm font-medium">No Section A questions assigned to you.</p>
          <p className="text-xs mt-1">Contact your administrator to get questions assigned.</p>
        </div>
      )}
      
      {/* Basic Information Section */}
      {(isAdmin || (assignedQuestionKeys && assignedQuestionKeys.some(k => 
        ['brsr_a_cin', 'brsr_a_entity_name', 'brsr_a_year_of_incorporation', 
         'brsr_a_registered_address', 'brsr_a_corporate_address', 'brsr_a_email',
         'brsr_a_telephone', 'brsr_a_website', 'brsr_a_stock_exchange', 
         'brsr_a_paid_up_capital', 'brsr_a_contact_person', 'brsr_a_reporting_boundary',
         'brsr_a_assurance_provider', 'brsr_a_assurance_type'].includes(k)
      ))) && (
      <div>
        <h4 className="text-sm font-semibold text-text-primary mb-4 pb-2 border-b">
              I. Details of the Listed Entity
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* CIN */}
              {(isAdmin || canSeeQuestion('brsr_a_cin')) && (
              <div className="space-y-2">
                {renderQuestionHeader('Corporate Identity Number (CIN)', 'brsr_a_cin', () => formData.cin, true)}
                {isEditing && canEditQuestion('brsr_a_cin') ? (
                  <Input
                    value={formData.cin}
                    onChange={(e) => handleInputChange('cin', e.target.value, 'brsr_a_cin')}
                    placeholder="Enter CIN"
                    data-testid="brsr-cin"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.cin || '-'}</p>
                )}
              </div>
              )}
              
              {/* Entity Name */}
              {(isAdmin || canSeeQuestion('brsr_a_entity_name')) && (
              <div className="space-y-2">
                {renderQuestionHeader('Name of the Listed Entity', 'brsr_a_entity_name', () => formData.listed_entity_name, true)}
                {isEditing && canEditQuestion('brsr_a_entity_name') ? (
                  <Input
                    value={formData.listed_entity_name}
                    onChange={(e) => handleInputChange('listed_entity_name', e.target.value, 'brsr_a_entity_name')}
                    placeholder="Enter entity name"
                    data-testid="brsr-listed-entity-name"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.listed_entity_name || '-'}</p>
                )}
              </div>
              )}
              
              {/* Year of Incorporation */}
              {(isAdmin || canSeeQuestion('brsr_a_year_of_incorporation')) && (
              <div className="space-y-2">
                {renderQuestionHeader('Year of Incorporation', 'brsr_a_year_of_incorporation', () => formData.year_of_incorporation, true)}
                {isEditing && canEditQuestion('brsr_a_year_of_incorporation') ? (
                  <Input
                    type="number"
                    value={formData.year_of_incorporation}
                    onChange={(e) => handleInputChange('year_of_incorporation', parseInt(e.target.value) || 0, 'brsr_a_year_of_incorporation')}
                    placeholder="YYYY"
                    min="1800"
                    max="2100"
                    data-testid="brsr-year-of-incorporation"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.year_of_incorporation || '-'}</p>
                )}
              </div>
              )}
              
              {/* Q4: Registered Office Address - Grouped Box */}
              {(isAdmin || canSeeQuestion('brsr_a_registered_address')) && (
              <div className="md:col-span-2 lg:col-span-3 border rounded-lg p-4 bg-stone-50">
                <div className="mb-3">
                  {renderQuestionHeader('Registered Office Address', 'brsr_a_registered_address', () => ({
                    address: formData.registered_address,
                    city: formData.registered_city,
                    state: formData.registered_state,
                    country: formData.registered_country,
                    pincode: formData.registered_pincode,
                  }), true)}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2 lg:col-span-2">
                    <Label>Address *</Label>
                    {isEditing && canEditQuestion('brsr_a_registered_address') ? (
                      <Input
                        value={formData.registered_address}
                        onChange={(e) => handleInputChange('registered_address', e.target.value, 'brsr_a_registered_address')}
                        placeholder="Enter street address, building, area"
                        data-testid="brsr-registered-address"
                      />
                    ) : (
                      <p className="text-sm text-text-secondary py-2">{formData.registered_address || '-'}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>City *</Label>
                    {isEditing && canEditQuestion('brsr_a_registered_address') ? (
                      <Input
                        value={formData.registered_city}
                        onChange={(e) => handleInputChange('registered_city', e.target.value, 'brsr_a_registered_address')}
                        placeholder="Enter city"
                        data-testid="brsr-registered-city"
                      />
                    ) : (
                      <p className="text-sm text-text-secondary py-2">{formData.registered_city || '-'}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>State *</Label>
                    {isEditing && canEditQuestion('brsr_a_registered_address') ? (
                      <Input
                        value={formData.registered_state}
                        onChange={(e) => handleInputChange('registered_state', e.target.value, 'brsr_a_registered_address')}
                        placeholder="Enter state"
                        data-testid="brsr-registered-state"
                      />
                    ) : (
                      <p className="text-sm text-text-secondary py-2">{formData.registered_state || '-'}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Country *</Label>
                    {isEditing && canEditQuestion('brsr_a_registered_address') ? (
                      <Select value={formData.registered_country} onValueChange={(v) => handleInputChange('registered_country', v, 'brsr_a_registered_address')}>
                        <SelectTrigger data-testid="brsr-registered-country">
                          <SelectValue placeholder="Select country" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="India">India</SelectItem>
                          <SelectItem value="United States">United States</SelectItem>
                          <SelectItem value="United Kingdom">United Kingdom</SelectItem>
                          <SelectItem value="Singapore">Singapore</SelectItem>
                          <SelectItem value="UAE">UAE</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm text-text-secondary py-2">{formData.registered_country || '-'}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>PIN Code *</Label>
                    {isEditing && canEditQuestion('brsr_a_registered_address') ? (
                      <Input
                        value={formData.registered_pincode}
                        onChange={(e) => handleInputChange('registered_pincode', e.target.value, 'brsr_a_registered_address')}
                        placeholder="6-digit PIN"
                        maxLength={6}
                        data-testid="brsr-registered-pincode"
                      />
                    ) : (
                      <p className="text-sm text-text-secondary py-2">{formData.registered_pincode || '-'}</p>
                    )}
                  </div>
                </div>
              </div>
              )}
              
              {/* Q5: Corporate Address - Grouped Box */}
              {(isAdmin || canSeeQuestion('brsr_a_corporate_address')) && (
              <div className="md:col-span-2 lg:col-span-3 border rounded-lg p-4 bg-stone-50">
                <div className="mb-3">
                  {renderQuestionHeader('Corporate Address', 'brsr_a_corporate_address', () => ({
                    address: formData.corporate_address,
                    city: formData.corporate_city,
                    state: formData.corporate_state,
                    country: formData.corporate_country,
                    pincode: formData.corporate_pincode,
                  }), false)}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2 lg:col-span-2">
                    <Label>Address</Label>
                    {isEditing && canEditQuestion('brsr_a_corporate_address') ? (
                      <Input
                        value={formData.corporate_address}
                        onChange={(e) => handleInputChange('corporate_address', e.target.value, 'brsr_a_corporate_address')}
                        placeholder="Enter corporate address (if different from registered)"
                        data-testid="brsr-corporate-address"
                      />
                    ) : (
                      <p className="text-sm text-text-secondary py-2">{formData.corporate_address || '-'}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>City</Label>
                    {isEditing && canEditQuestion('brsr_a_corporate_address') ? (
                      <Input
                        value={formData.corporate_city}
                        onChange={(e) => handleInputChange('corporate_city', e.target.value, 'brsr_a_corporate_address')}
                        placeholder="Enter city"
                        data-testid="brsr-corporate-city"
                      />
                    ) : (
                      <p className="text-sm text-text-secondary py-2">{formData.corporate_city || '-'}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>State</Label>
                    {isEditing && canEditQuestion('brsr_a_corporate_address') ? (
                      <Input
                        value={formData.corporate_state}
                        onChange={(e) => handleInputChange('corporate_state', e.target.value, 'brsr_a_corporate_address')}
                        placeholder="Enter state"
                        data-testid="brsr-corporate-state"
                      />
                    ) : (
                      <p className="text-sm text-text-secondary py-2">{formData.corporate_state || '-'}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Country</Label>
                    {isEditing && canEditQuestion('brsr_a_corporate_address') ? (
                      <Select value={formData.corporate_country} onValueChange={(v) => handleInputChange('corporate_country', v, 'brsr_a_corporate_address')}>
                        <SelectTrigger data-testid="brsr-corporate-country">
                          <SelectValue placeholder="Select country" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="India">India</SelectItem>
                          <SelectItem value="United States">United States</SelectItem>
                          <SelectItem value="United Kingdom">United Kingdom</SelectItem>
                          <SelectItem value="Singapore">Singapore</SelectItem>
                          <SelectItem value="UAE">UAE</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm text-text-secondary py-2">{formData.corporate_country || '-'}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>PIN Code</Label>
                    {isEditing && canEditQuestion('brsr_a_corporate_address') ? (
                      <Input
                        value={formData.corporate_pincode}
                        onChange={(e) => handleInputChange('corporate_pincode', e.target.value, 'brsr_a_corporate_address')}
                        placeholder="6-digit PIN"
                        maxLength={6}
                        data-testid="brsr-corporate-pincode"
                      />
                    ) : (
                      <p className="text-sm text-text-secondary py-2">{formData.corporate_pincode || '-'}</p>
                    )}
                  </div>
                </div>
              </div>
              )}
              
              {/* Email */}
              {(isAdmin || canSeeQuestion('brsr_a_email')) && (
              <div className="space-y-2">
                {renderQuestionHeader('E-mail', 'brsr_a_email', () => formData.email, true)}
                {isEditing && canEditQuestion('brsr_a_email') ? (
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value, 'brsr_a_email')}
                    placeholder="Enter email"
                    data-testid="brsr-email"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.email || '-'}</p>
                )}
              </div>
              )}
              
              {/* Telephone */}
              {(isAdmin || canSeeQuestion('brsr_a_telephone')) && (
              <div className="space-y-2">
                {renderQuestionHeader('Telephone', 'brsr_a_telephone', () => formData.telephone, true)}
                {isEditing && canEditQuestion('brsr_a_telephone') ? (
                  <Input
                    value={formData.telephone}
                    onChange={(e) => handleInputChange('telephone', e.target.value, 'brsr_a_telephone')}
                    placeholder="Enter telephone"
                    data-testid="brsr-telephone"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.telephone || '-'}</p>
                )}
              </div>
              )}
              
              {/* Website */}
              {(isAdmin || canSeeQuestion('brsr_a_website')) && (
              <div className="space-y-2">
                {renderQuestionHeader('Website', 'brsr_a_website', () => formData.website, true)}
                {isEditing && canEditQuestion('brsr_a_website') ? (
                  <Input
                    value={formData.website}
                    onChange={(e) => handleInputChange('website', e.target.value, 'brsr_a_website')}
                    placeholder="https://example.com"
                    data-testid="brsr-website"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.website || '-'}</p>
                )}
              </div>
              )}
              
              {/* Paid-up Capital */}
              {(isAdmin || canSeeQuestion('brsr_a_paid_up_capital')) && (
              <div className="space-y-2">
                {renderQuestionHeader('Paid-up Capital (INR)', 'brsr_a_paid_up_capital', () => formData.paid_up_capital, true)}
                {isEditing && canEditQuestion('brsr_a_paid_up_capital') ? (
                  <Input
                    type="number"
                    value={formData.paid_up_capital}
                    onChange={(e) => handleInputChange('paid_up_capital', parseFloat(e.target.value) || 0, 'brsr_a_paid_up_capital')}
                    placeholder="Enter amount"
                    min="0"
                    data-testid="brsr-paid-up-capital"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">
                    {formData.paid_up_capital ? `₹${formData.paid_up_capital.toLocaleString()}` : '-'}
                  </p>
                )}
              </div>
              )}
              
              {/* Assurance Provider */}
              {(isAdmin || canSeeQuestion('brsr_a_assurance_provider')) && (
              <div className="space-y-2">
                {renderQuestionHeader('Name of Assurance Provider', 'brsr_a_assurance_provider', () => formData.assurance_provider, true)}
                {isEditing && canEditQuestion('brsr_a_assurance_provider') ? (
                  <Input
                    value={formData.assurance_provider}
                    onChange={(e) => handleInputChange('assurance_provider', e.target.value, 'brsr_a_assurance_provider')}
                    placeholder="Enter provider name"
                    data-testid="brsr-assurance-provider"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.assurance_provider || '-'}</p>
                )}
              </div>
              )}
              
              {/* Assurance Type */}
              {(isAdmin || canSeeQuestion('brsr_a_assurance_type')) && (
              <div className="space-y-2">
                {renderQuestionHeader('Type of Assurance Obtained', 'brsr_a_assurance_type', () => formData.assurance_type, true)}
                {isEditing && canEditQuestion('brsr_a_assurance_type') ? (
                  <Input
                    value={formData.assurance_type}
                    onChange={(e) => handleInputChange('assurance_type', e.target.value, 'brsr_a_assurance_type')}
                    placeholder="Enter assurance type"
                    data-testid="brsr-assurance-type"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.assurance_type || '-'}</p>
                )}
              </div>
              )}
              
              {/* Export Contribution - separate question key */}
              {(isAdmin || canSeeQuestion('brsr_a_export_contribution')) && (
              <div className="space-y-2">
                {renderQuestionHeader('Export Contribution (% of Turnover)', 'brsr_a_export_contribution', () => formData.export_contribution_percentage, true)}
                {isEditing && canEditQuestion('brsr_a_export_contribution') ? (
                  <Input
                    type="number"
                    value={formData.export_contribution_percentage}
                    onChange={(e) => handleInputChange('export_contribution_percentage', parseFloat(e.target.value) || 0, 'brsr_a_export_contribution')}
                    placeholder="Enter percentage"
                    min="0"
                    max="100"
                    data-testid="brsr-export-contribution"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">
                    {formData.export_contribution_percentage !== undefined ? `${formData.export_contribution_percentage}%` : '-'}
                  </p>
                )}
              </div>
              )}
              
              {/* Customer Types Brief - separate question key */}
              {(isAdmin || canSeeQuestion('brsr_a_customer_types')) && (
              <div className="space-y-2 md:col-span-2 lg:col-span-3">
                {renderQuestionHeader('Brief on Types of Customers', 'brsr_a_customer_types', () => formData.customer_types_brief, true)}
                {isEditing && canEditQuestion('brsr_a_customer_types') ? (
                  <Textarea
                    value={formData.customer_types_brief}
                    onChange={(e) => handleInputChange('customer_types_brief', e.target.value, 'brsr_a_customer_types')}
                    placeholder="Describe the types of customers..."
                    rows={3}
                    data-testid="brsr-customer-types"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2 whitespace-pre-wrap">
                    {formData.customer_types_brief || '-'}
                  </p>
                )}
              </div>
              )}
            </div>
          </div>
      )}

          {/* BRSR Contact Person Section */}
          {(isAdmin || canSeeQuestion('brsr_a_contact_person')) && (
          <div>
            <div className="flex items-center justify-between mb-4 pb-2 border-b">
              {renderQuestionHeader('BRSR Report Contact Person', 'brsr_a_contact_person', () => ({
                name: formData.brsr_contact_name,
                telephone: formData.brsr_contact_telephone,
                email: formData.brsr_contact_email,
              }), true)}
            </div>
            <p className="text-xs text-text-muted mb-4">
              Name and contact details (telephone, email address) of the person who may be contacted in case of any queries on the BRSR report
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Contact Person Name *</Label>
                {isEditing && canEditQuestion('brsr_a_contact_person') ? (
                  <Input
                    value={formData.brsr_contact_name}
                    onChange={(e) => handleInputChange('brsr_contact_name', e.target.value, 'brsr_a_contact_person')}
                    placeholder="Enter full name"
                    data-testid="brsr-contact-name"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.brsr_contact_name || '-'}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Contact Telephone *</Label>
                {isEditing && canEditQuestion('brsr_a_contact_person') ? (
                  <Input
                    value={formData.brsr_contact_telephone}
                    onChange={(e) => handleInputChange('brsr_contact_telephone', e.target.value, 'brsr_a_contact_person')}
                    placeholder="+91 XXXXXXXXXX"
                    data-testid="brsr-contact-telephone"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.brsr_contact_telephone || '-'}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Contact Email Address *</Label>
                {isEditing && canEditQuestion('brsr_a_contact_person') ? (
                  <Input
                    type="email"
                    value={formData.brsr_contact_email}
                    onChange={(e) => handleInputChange('brsr_contact_email', e.target.value, 'brsr_a_contact_person')}
                    placeholder="email@company.com"
                    data-testid="brsr-contact-email"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.brsr_contact_email || '-'}</p>
                )}
              </div>
            </div>
          </div>
          )}

          {/* Radio Button Sections - Stock Exchange & Reporting Boundary */}
          {(isAdmin || canSeeQuestion('brsr_a_stock_exchange') || canSeeQuestion('brsr_a_reporting_boundary')) && (
          <div>
            <h4 className="text-sm font-semibold text-text-primary mb-4 pb-2 border-b">
              Listing & Reporting Information
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(isAdmin || canSeeQuestion('brsr_a_stock_exchange')) && (
              <div className="space-y-3">
                {renderQuestionHeader('Stock Exchange(s) where shares are listed', 'brsr_a_stock_exchange', () => formData.stock_exchange, true)}
                {isEditing && canEditQuestion('brsr_a_stock_exchange') ? (
                  <RadioGroup
                    value={formData.stock_exchange}
                    onValueChange={(value) => handleInputChange('stock_exchange', value, 'brsr_a_stock_exchange')}
                    className="space-y-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="BSE" id="stock-bse" />
                      <Label htmlFor="stock-bse" className="font-normal cursor-pointer">BSE</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="NSE" id="stock-nse" />
                      <Label htmlFor="stock-nse" className="font-normal cursor-pointer">NSE</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="Both NSE & BSE" id="stock-both" />
                      <Label htmlFor="stock-both" className="font-normal cursor-pointer">Both NSE & BSE</Label>
                    </div>
                  </RadioGroup>
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.stock_exchange || '-'}</p>
                )}
              </div>
              )}
              
              {(isAdmin || canSeeQuestion('brsr_a_reporting_boundary')) && (
              <div className="space-y-3">
                {renderQuestionHeader('Reporting Boundary', 'brsr_a_reporting_boundary', () => formData.reporting_boundary, true)}
                {isEditing && canEditQuestion('brsr_a_reporting_boundary') ? (
                  <RadioGroup
                    value={formData.reporting_boundary}
                    onValueChange={(value) => handleInputChange('reporting_boundary', value, 'brsr_a_reporting_boundary')}
                    className="space-y-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="Standalone" id="boundary-standalone" />
                      <Label htmlFor="boundary-standalone" className="font-normal cursor-pointer">Standalone</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="Consolidated" id="boundary-consolidated" />
                      <Label htmlFor="boundary-consolidated" className="font-normal cursor-pointer">Consolidated</Label>
                    </div>
                  </RadioGroup>
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.reporting_boundary || '-'}</p>
                )}
              </div>
              )}
            </div>
          </div>
          )}

          {/* Dynamic Tables Section */}
          <div className="space-y-6">
            {/* Business Activities Table */}
            {(isAdmin || canSeeQuestion('brsr_a_business_activities')) && (
            <div>
              <div className="flex items-center justify-between mb-3">
                {renderQuestionHeader('Business Activities Accounting for 90% of Turnover', 'brsr_a_business_activities', () => formData.business_activities, true)}
                {isEditing && canEditQuestion('brsr_a_business_activities') && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addTableRow('business_activities', EMPTY_BUSINESS_ACTIVITY, 'brsr_a_business_activities')}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Row
                  </Button>
                )}
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-stone-50">
                      <TableHead className="w-[30%]">Description of Activity</TableHead>
                      <TableHead className="w-[40%]">Main Description of Business Activity</TableHead>
                      <TableHead className="w-[20%]">% of Turnover</TableHead>
                      {isEditing && canEditQuestion('brsr_a_business_activities') && <TableHead className="w-[10%]">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formData.business_activities.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {isEditing && canEditQuestion('brsr_a_business_activities') ? (
                            <Input
                              value={row.description}
                              onChange={(e) => handleTableRowChange('business_activities', index, 'description', e.target.value, 'brsr_a_business_activities')}
                              placeholder="Description"
                              className="h-8"
                            />
                          ) : (
                            <span className="text-sm">{row.description || '-'}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing && canEditQuestion('brsr_a_business_activities') ? (
                            <Input
                              value={row.main_activity}
                              onChange={(e) => handleTableRowChange('business_activities', index, 'main_activity', e.target.value, 'brsr_a_business_activities')}
                              placeholder="Main activity"
                              className="h-8"
                            />
                          ) : (
                            <span className="text-sm">{row.main_activity || '-'}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing && canEditQuestion('brsr_a_business_activities') ? (
                            <Input
                              type="number"
                              value={row.turnover_percentage}
                              onChange={(e) => handleTableRowChange('business_activities', index, 'turnover_percentage', parseFloat(e.target.value) || 0, 'brsr_a_business_activities')}
                              placeholder="%"
                              min="0"
                              max="100"
                              className="h-8"
                            />
                          ) : (
                            <span className="text-sm">{row.turnover_percentage}%</span>
                          )}
                        </TableCell>
                        {isEditing && canEditQuestion('brsr_a_business_activities') && (
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeTableRow('business_activities', index, 'brsr_a_business_activities')}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            )}

            {/* Products/Services Table */}
            {(isAdmin || canSeeQuestion('brsr_a_products_services')) && (
            <div>
              <div className="flex items-center justify-between mb-3">
                {renderQuestionHeader('Products/Services Accounting for 90% of Turnover', 'brsr_a_products_services', () => formData.products_services, true)}
                {isEditing && canEditQuestion('brsr_a_products_services') && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addTableRow('products_services', EMPTY_PRODUCT_SERVICE, 'brsr_a_products_services')}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Row
                  </Button>
                )}
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-stone-50">
                      <TableHead className="w-[40%]">Product / Service</TableHead>
                      <TableHead className="w-[30%]">NIC Code</TableHead>
                      <TableHead className="w-[20%]">% of Total Turnover</TableHead>
                      {isEditing && canEditQuestion('brsr_a_products_services') && <TableHead className="w-[10%]">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formData.products_services.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {isEditing && canEditQuestion('brsr_a_products_services') ? (
                            <Input
                              value={row.product_service}
                              onChange={(e) => handleTableRowChange('products_services', index, 'product_service', e.target.value, 'brsr_a_products_services')}
                              placeholder="Product/Service"
                              className="h-8"
                            />
                          ) : (
                            <span className="text-sm">{row.product_service || '-'}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing && canEditQuestion('brsr_a_products_services') ? (
                            <Input
                              value={row.nic_code}
                              onChange={(e) => handleTableRowChange('products_services', index, 'nic_code', e.target.value, 'brsr_a_products_services')}
                              placeholder="NIC Code"
                              className="h-8"
                            />
                          ) : (
                            <span className="text-sm">{row.nic_code || '-'}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing && canEditQuestion('brsr_a_products_services') ? (
                            <Input
                              type="number"
                              value={row.turnover_percentage}
                              onChange={(e) => handleTableRowChange('products_services', index, 'turnover_percentage', parseFloat(e.target.value) || 0, 'brsr_a_products_services')}
                              placeholder="%"
                              min="0"
                              max="100"
                              className="h-8"
                            />
                          ) : (
                            <span className="text-sm">{row.turnover_percentage}%</span>
                          )}
                        </TableCell>
                        {isEditing && canEditQuestion('brsr_a_products_services') && (
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeTableRow('products_services', index, 'brsr_a_products_services')}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            )}

            {/* Plants and Offices Table */}
            {(isAdmin || canSeeQuestion('brsr_a_plants_offices')) && (
            <div>
              <div className="flex items-center justify-between mb-3">
                {renderQuestionHeader('Plants and Offices Operated', 'brsr_a_plants_offices', () => formData.plants_offices, true)}
                {isEditing && canEditQuestion('brsr_a_plants_offices') && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addTableRow('plants_offices', EMPTY_PLANT_OFFICE, 'brsr_a_plants_offices')}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Row
                  </Button>
                )}
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-stone-50">
                      <TableHead className="w-[40%]">Location</TableHead>
                      <TableHead className="w-[25%]">Number of Plants</TableHead>
                      <TableHead className="w-[25%]">Number of Offices</TableHead>
                      {isEditing && canEditQuestion('brsr_a_plants_offices') && <TableHead className="w-[10%]">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formData.plants_offices.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {isEditing && canEditQuestion('brsr_a_plants_offices') ? (
                            <Select
                              value={row.location_type}
                              onValueChange={(value) => handleTableRowChange('plants_offices', index, 'location_type', value, 'brsr_a_plants_offices')}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="National">National</SelectItem>
                                <SelectItem value="International">International</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-sm">{row.location_type}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing && canEditQuestion('brsr_a_plants_offices') ? (
                            <Input
                              type="number"
                              value={row.num_plants}
                              onChange={(e) => handleTableRowChange('plants_offices', index, 'num_plants', parseInt(e.target.value) || 0, 'brsr_a_plants_offices')}
                              placeholder="0"
                              min="0"
                              className="h-8"
                            />
                          ) : (
                            <span className="text-sm">{row.num_plants}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing && canEditQuestion('brsr_a_plants_offices') ? (
                            <Input
                              type="number"
                              value={row.num_offices}
                              onChange={(e) => handleTableRowChange('plants_offices', index, 'num_offices', parseInt(e.target.value) || 0, 'brsr_a_plants_offices')}
                              placeholder="0"
                              min="0"
                              className="h-8"
                            />
                          ) : (
                            <span className="text-sm">{row.num_offices}</span>
                          )}
                        </TableCell>
                        {isEditing && canEditQuestion('brsr_a_plants_offices') && (
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeTableRow('plants_offices', index, 'brsr_a_plants_offices')}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            )}

            {/* Markets Served Table */}
            {(isAdmin || canSeeQuestion('brsr_a_markets_served')) && (
            <div>
              <div className="flex items-center justify-between mb-3">
                {renderQuestionHeader('Markets Served by Entity', 'brsr_a_markets_served', () => formData.markets_served, true)}
                {isEditing && canEditQuestion('brsr_a_markets_served') && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addTableRow('markets_served', EMPTY_MARKET_SERVED, 'brsr_a_markets_served')}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Row
                  </Button>
                )}
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-stone-50">
                      <TableHead className="w-[60%]">Location</TableHead>
                      <TableHead className="w-[30%]">Number (States/Countries)</TableHead>
                      {isEditing && canEditQuestion('brsr_a_markets_served') && <TableHead className="w-[10%]">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formData.markets_served.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {isEditing && canEditQuestion('brsr_a_markets_served') ? (
                            <Select
                              value={row.location_type}
                              onValueChange={(value) => handleTableRowChange('markets_served', index, 'location_type', value, 'brsr_a_markets_served')}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="National">National (No. of States)</SelectItem>
                                <SelectItem value="International">International (No. of Countries)</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-sm">
                              {row.location_type === 'National' ? 'National (States)' : 'International (Countries)'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing && canEditQuestion('brsr_a_markets_served') ? (
                            <Input
                              type="number"
                              value={row.number}
                              onChange={(e) => handleTableRowChange('markets_served', index, 'number', parseInt(e.target.value) || 0, 'brsr_a_markets_served')}
                              placeholder="0"
                              min="0"
                              className="h-8"
                            />
                          ) : (
                            <span className="text-sm">{row.number}</span>
                          )}
                        </TableCell>
                        {isEditing && canEditQuestion('brsr_a_markets_served') && (
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeTableRow('markets_served', index, 'brsr_a_markets_served')}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            )}
          </div>

          {/* Validation Messages */}
          {!isComplete && missingFields.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Missing Required Fields</p>
                  <ul className="text-sm text-amber-700 mt-1 list-disc list-inside">
                    {missingFields.slice(0, 5).map((field, idx) => (
                      <li key={idx}>{field.replace(/_/g, ' ')}</li>
                    ))}
                    {missingFields.length > 5 && (
                      <li>...and {missingFields.length - 5} more</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Save Button - only shown in edit mode */}
          {isEditing && (
            <div className="flex justify-end pt-4 border-t border-stone-200">
              <Button
                type="button"
                onClick={saveBRSRDetails}
                disabled={saving}
                className="bg-primary hover:bg-primary/90 text-white"
                data-testid="save-brsr-details-btn"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save BRSR Details'
                )}
              </Button>
            </div>
          )}

          {/* IV-VII. Year-Specific BRSR Sections (Employees, CSR, Holdings, Complaints) */}
          <div className="pt-6 border-t border-stone-200">
            <BRSRYearlySections 
              isEditing={isEditing} 
              hideSections={hideSections}
              reportingYear={reportingPeriod}
              assignedQuestionKeys={assignedQuestionKeys}
              isAdmin={isAdmin}
            />
          </div>
        </div>
  );

  if (!isCollapsible) {
    return (
      <div className="border rounded-lg bg-white">
        {content}
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-lg">
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between p-4 bg-stone-50 hover:bg-stone-100 transition-colors rounded-t-lg">
          <div className="flex items-center gap-3">
            {isOpen ? (
              <ChevronDown className="w-5 h-5 text-text-muted" />
            ) : (
              <ChevronRight className="w-5 h-5 text-text-muted" />
            )}
            <FileText className="w-5 h-5 text-primary" />
            <span className="font-semibold text-text-primary">BRSR Organization Details</span>
          </div>
          <div className="flex items-center gap-2">
            {isComplete ? (
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Complete
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                <AlertCircle className="w-3 h-3 mr-1" />
                Incomplete
              </Badge>
            )}
          </div>
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        {content}
      </CollapsibleContent>
      
      {/* History Modal */}
      {renderHistoryModal()}
    </Collapsible>
  );
}

// Export a method to get the BRSR data for parent form submission
BRSRDetailsSection.getBRSRData = (ref) => {
  if (ref && ref.current) {
    return ref.current.getBRSRData();
  }
  return null;
};
