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
  Loader2 
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
  const { getAuthHeader } = useAuth();
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [missingFields, setMissingFields] = useState([]);
  
  // BRSR Form Data - Section A: General Disclosures
  const [formData, setFormData] = useState({
    // I. Details of the Listed Entity (Q1-15)
    cin: '',                              // Q1: Corporate Identity Number
    listed_entity_name: '',               // Q2: Name of the Listed Entity
    year_of_incorporation: new Date().getFullYear(), // Q3: Year of incorporation
    registered_address: '',               // Q4: Registered office address
    registered_city: '',
    registered_state: '',
    registered_country: 'India',
    registered_pincode: '',
    corporate_address: '',                // Q5: Corporate address (NEW)
    corporate_city: '',
    corporate_state: '',
    corporate_country: 'India',
    corporate_pincode: '',
    email: '',                            // Q6: E-mail
    telephone: '',                        // Q7: Telephone
    website: '',                          // Q8: Website
    // Q9: Financial year - handled by reporting_period
    stock_exchange: 'BSE',                // Q10: Name of Stock Exchange(s)
    paid_up_capital: 0,                   // Q11: Paid-up Capital
    // Q12: BRSR Contact Person
    brsr_contact_name: '',
    brsr_contact_telephone: '',
    brsr_contact_email: '',
    reporting_boundary: 'Standalone',     // Q13: Reporting boundary
    assurance_provider: '',               // Q14: Name of assurance provider
    assurance_type: '',                   // Q15: Type of assurance obtained
    
    // II. Products/Services (Q16-17)
    business_activities: [{ ...EMPTY_BUSINESS_ACTIVITY }],  // Q16
    products_services: [{ ...EMPTY_PRODUCT_SERVICE }],      // Q17
    
    // III. Operations (Q18-19)
    plants_offices: [{ ...EMPTY_PLANT_OFFICE }],            // Q18
    markets_served: [{ ...EMPTY_MARKET_SERVED }],           // Q19a
    export_contribution_percentage: 0,                       // Q19b
    customer_types_brief: '',                                // Q19c
    
    // Reporting period for year-specific data
    reporting_period: '',
  });

  useEffect(() => {
    if (reportingPeriod) {
      fetchBRSRDetails();
    }
  }, [reportingPeriod]);

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
    
    // Markets served composite
    if (responses.brsr_a_markets_served) {
      const markets = responses.brsr_a_markets_served;
      if (markets.locations) mapped.markets_served = markets.locations;
      if (markets.export_contribution_percentage !== undefined) mapped.export_contribution_percentage = markets.export_contribution_percentage;
      if (markets.customer_types_brief) mapped.customer_types_brief = markets.customer_types_brief;
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
      brsr_a_markets_served: {
        locations: formData.markets_served,
        export_contribution_percentage: formData.export_contribution_percentage,
        customer_types_brief: formData.customer_types_brief,
      },
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

  const handleInputChange = (field, value) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
  };

  // Dynamic table handlers
  const handleTableRowChange = (tableName, index, field, value) => {
    const updated = { ...formData };
    updated[tableName] = [...formData[tableName]];
    updated[tableName][index] = { ...updated[tableName][index], [field]: value };
    setFormData(updated);
  };

  const addTableRow = (tableName, emptyTemplate) => {
    const updated = { ...formData };
    updated[tableName] = [...formData[tableName], { ...emptyTemplate }];
    setFormData(updated);
  };

  const removeTableRow = (tableName, index) => {
    if (formData[tableName].length <= 1) {
      toast.error('At least one row is required');
      return;
    }
    const updated = { ...formData };
    updated[tableName] = formData[tableName].filter((_, i) => i !== index);
    setFormData(updated);
  };

  // Notify parent of data changes via useEffect (avoids setState-in-render)
  useEffect(() => {
    if (onDataChange && !loading) {
      onDataChange(formData);
    }
  }, [formData, loading]);

  const saveBRSRDetails = async () => {
    setSaving(true);
    try {
      // Convert form data to ESG Questionnaire responses format
      const responses = mapFormDataToResponses();
      
      // Save via ESG Questionnaire API (unified storage with task/approval workflow)
      await axios.put(
        `${API}/esg-questionnaire/responses/BRSR/section_a/${encodeURIComponent(reportingPeriod)}`,
        { responses },
        { headers: getAuthHeader() }
      );
      
      // Check completeness based on required fields
      const missing = [];
      if (!formData.cin) missing.push('cin');
      if (!formData.listed_entity_name) missing.push('listed_entity_name');
      if (!formData.email) missing.push('email');
      setMissingFields(missing);
      setIsComplete(missing.length === 0);
      
      toast.success('BRSR Section A details saved successfully');
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
      {/* Basic Information Section */}
      <div>
        <h4 className="text-sm font-semibold text-text-primary mb-4 pb-2 border-b">
              I. Details of the Listed Entity
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Corporate Identity Number (CIN) *</Label>
                {isEditing ? (
                  <Input
                    value={formData.cin}
                    onChange={(e) => handleInputChange('cin', e.target.value)}
                    placeholder="Enter CIN"
                    data-testid="brsr-cin"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.cin || '-'}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Name of the Listed Entity *</Label>
                {isEditing ? (
                  <Input
                    value={formData.listed_entity_name}
                    onChange={(e) => handleInputChange('listed_entity_name', e.target.value)}
                    placeholder="Enter entity name"
                    data-testid="brsr-listed-entity-name"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.listed_entity_name || '-'}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Year of Incorporation *</Label>
                {isEditing ? (
                  <Input
                    type="number"
                    value={formData.year_of_incorporation}
                    onChange={(e) => handleInputChange('year_of_incorporation', parseInt(e.target.value) || 0)}
                    placeholder="YYYY"
                    min="1800"
                    max="2100"
                    data-testid="brsr-year-of-incorporation"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.year_of_incorporation || '-'}</p>
                )}
              </div>
              
              {/* Q4: Registered Office Address - Grouped Box */}
              <div className="md:col-span-2 lg:col-span-3 border rounded-lg p-4 bg-stone-50">
                <h5 className="text-sm font-medium text-text-primary mb-3">Registered Office Address</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2 lg:col-span-2">
                    <Label>Address *</Label>
                    {isEditing ? (
                      <Input
                        value={formData.registered_address}
                        onChange={(e) => handleInputChange('registered_address', e.target.value)}
                        placeholder="Enter street address, building, area"
                        data-testid="brsr-registered-address"
                      />
                    ) : (
                      <p className="text-sm text-text-secondary py-2">{formData.registered_address || '-'}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>City *</Label>
                    {isEditing ? (
                      <Input
                        value={formData.registered_city}
                        onChange={(e) => handleInputChange('registered_city', e.target.value)}
                        placeholder="Enter city"
                        data-testid="brsr-registered-city"
                      />
                    ) : (
                      <p className="text-sm text-text-secondary py-2">{formData.registered_city || '-'}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>State *</Label>
                    {isEditing ? (
                      <Input
                        value={formData.registered_state}
                        onChange={(e) => handleInputChange('registered_state', e.target.value)}
                        placeholder="Enter state"
                        data-testid="brsr-registered-state"
                      />
                    ) : (
                      <p className="text-sm text-text-secondary py-2">{formData.registered_state || '-'}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Country *</Label>
                    {isEditing ? (
                      <Select value={formData.registered_country} onValueChange={(v) => handleInputChange('registered_country', v)}>
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
                    {isEditing ? (
                      <Input
                        value={formData.registered_pincode}
                        onChange={(e) => handleInputChange('registered_pincode', e.target.value)}
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
              
              {/* Q5: Corporate Address - Grouped Box */}
              <div className="md:col-span-2 lg:col-span-3 border rounded-lg p-4 bg-stone-50">
                <h5 className="text-sm font-medium text-text-primary mb-3">Corporate Address</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2 lg:col-span-2">
                    <Label>Address</Label>
                    {isEditing ? (
                      <Input
                        value={formData.corporate_address}
                        onChange={(e) => handleInputChange('corporate_address', e.target.value)}
                        placeholder="Enter corporate address (if different from registered)"
                        data-testid="brsr-corporate-address"
                      />
                    ) : (
                      <p className="text-sm text-text-secondary py-2">{formData.corporate_address || '-'}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>City</Label>
                    {isEditing ? (
                      <Input
                        value={formData.corporate_city}
                        onChange={(e) => handleInputChange('corporate_city', e.target.value)}
                        placeholder="Enter city"
                        data-testid="brsr-corporate-city"
                      />
                    ) : (
                      <p className="text-sm text-text-secondary py-2">{formData.corporate_city || '-'}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>State</Label>
                    {isEditing ? (
                      <Input
                        value={formData.corporate_state}
                        onChange={(e) => handleInputChange('corporate_state', e.target.value)}
                        placeholder="Enter state"
                        data-testid="brsr-corporate-state"
                      />
                    ) : (
                      <p className="text-sm text-text-secondary py-2">{formData.corporate_state || '-'}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Country</Label>
                    {isEditing ? (
                      <Select value={formData.corporate_country} onValueChange={(v) => handleInputChange('corporate_country', v)}>
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
                    {isEditing ? (
                      <Input
                        value={formData.corporate_pincode}
                        onChange={(e) => handleInputChange('corporate_pincode', e.target.value)}
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
              
              <div className="space-y-2">
                <Label>E-mail *</Label>
                {isEditing ? (
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="Enter email"
                    data-testid="brsr-email"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.email || '-'}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Telephone *</Label>
                {isEditing ? (
                  <Input
                    value={formData.telephone}
                    onChange={(e) => handleInputChange('telephone', e.target.value)}
                    placeholder="Enter telephone"
                    data-testid="brsr-telephone"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.telephone || '-'}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Website *</Label>
                {isEditing ? (
                  <Input
                    value={formData.website}
                    onChange={(e) => handleInputChange('website', e.target.value)}
                    placeholder="https://example.com"
                    data-testid="brsr-website"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.website || '-'}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Paid-up Capital (INR) *</Label>
                {isEditing ? (
                  <Input
                    type="number"
                    value={formData.paid_up_capital}
                    onChange={(e) => handleInputChange('paid_up_capital', parseFloat(e.target.value) || 0)}
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
              
              <div className="space-y-2">
                <Label>Name of Assurance Provider *</Label>
                {isEditing ? (
                  <Input
                    value={formData.assurance_provider}
                    onChange={(e) => handleInputChange('assurance_provider', e.target.value)}
                    placeholder="Enter provider name"
                    data-testid="brsr-assurance-provider"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.assurance_provider || '-'}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Type of Assurance Obtained *</Label>
                {isEditing ? (
                  <Input
                    value={formData.assurance_type}
                    onChange={(e) => handleInputChange('assurance_type', e.target.value)}
                    placeholder="Enter assurance type"
                    data-testid="brsr-assurance-type"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.assurance_type || '-'}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Export Contribution (% of Turnover) *</Label>
                {isEditing ? (
                  <Input
                    type="number"
                    value={formData.export_contribution_percentage}
                    onChange={(e) => handleInputChange('export_contribution_percentage', parseFloat(e.target.value) || 0)}
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
              
              <div className="space-y-2 md:col-span-2 lg:col-span-3">
                <Label>Brief on Types of Customers *</Label>
                {isEditing ? (
                  <Textarea
                    value={formData.customer_types_brief}
                    onChange={(e) => handleInputChange('customer_types_brief', e.target.value)}
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
            </div>
          </div>

          {/* BRSR Contact Person Section */}
          <div>
            <h4 className="text-sm font-semibold text-text-primary mb-4 pb-2 border-b">
              BRSR Report Contact Person
            </h4>
            <p className="text-xs text-text-muted mb-4">
              Name and contact details (telephone, email address) of the person who may be contacted in case of any queries on the BRSR report
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Contact Person Name *</Label>
                {isEditing ? (
                  <Input
                    value={formData.brsr_contact_name}
                    onChange={(e) => handleInputChange('brsr_contact_name', e.target.value)}
                    placeholder="Enter full name"
                    data-testid="brsr-contact-name"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.brsr_contact_name || '-'}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Contact Telephone *</Label>
                {isEditing ? (
                  <Input
                    value={formData.brsr_contact_telephone}
                    onChange={(e) => handleInputChange('brsr_contact_telephone', e.target.value)}
                    placeholder="+91 XXXXXXXXXX"
                    data-testid="brsr-contact-telephone"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.brsr_contact_telephone || '-'}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Contact Email Address *</Label>
                {isEditing ? (
                  <Input
                    type="email"
                    value={formData.brsr_contact_email}
                    onChange={(e) => handleInputChange('brsr_contact_email', e.target.value)}
                    placeholder="email@company.com"
                    data-testid="brsr-contact-email"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.brsr_contact_email || '-'}</p>
                )}
              </div>
            </div>
          </div>

          {/* Radio Button Sections */}
          <div>
            <h4 className="text-sm font-semibold text-text-primary mb-4 pb-2 border-b">
              Listing & Reporting Information
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label>Stock Exchange(s) where shares are listed *</Label>
                {isEditing ? (
                  <RadioGroup
                    value={formData.stock_exchange}
                    onValueChange={(value) => handleInputChange('stock_exchange', value)}
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
              
              <div className="space-y-3">
                <Label>Reporting Boundary *</Label>
                {isEditing ? (
                  <RadioGroup
                    value={formData.reporting_boundary}
                    onValueChange={(value) => handleInputChange('reporting_boundary', value)}
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
            </div>
          </div>

          {/* Dynamic Tables Section */}
          <div className="space-y-6">
            {/* Business Activities Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-text-primary">
                  Business Activities Accounting for 90% of Turnover *
                </h4>
                {isEditing && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addTableRow('business_activities', EMPTY_BUSINESS_ACTIVITY)}
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
                      {isEditing && <TableHead className="w-[10%]">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formData.business_activities.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              value={row.description}
                              onChange={(e) => handleTableRowChange('business_activities', index, 'description', e.target.value)}
                              placeholder="Description"
                              className="h-8"
                            />
                          ) : (
                            <span className="text-sm">{row.description || '-'}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              value={row.main_activity}
                              onChange={(e) => handleTableRowChange('business_activities', index, 'main_activity', e.target.value)}
                              placeholder="Main activity"
                              className="h-8"
                            />
                          ) : (
                            <span className="text-sm">{row.main_activity || '-'}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              type="number"
                              value={row.turnover_percentage}
                              onChange={(e) => handleTableRowChange('business_activities', index, 'turnover_percentage', parseFloat(e.target.value) || 0)}
                              placeholder="%"
                              min="0"
                              max="100"
                              className="h-8"
                            />
                          ) : (
                            <span className="text-sm">{row.turnover_percentage}%</span>
                          )}
                        </TableCell>
                        {isEditing && (
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeTableRow('business_activities', index)}
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

            {/* Products/Services Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-text-primary">
                  Products/Services Accounting for 90% of Turnover *
                </h4>
                {isEditing && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addTableRow('products_services', EMPTY_PRODUCT_SERVICE)}
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
                      {isEditing && <TableHead className="w-[10%]">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formData.products_services.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              value={row.product_service}
                              onChange={(e) => handleTableRowChange('products_services', index, 'product_service', e.target.value)}
                              placeholder="Product/Service"
                              className="h-8"
                            />
                          ) : (
                            <span className="text-sm">{row.product_service || '-'}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              value={row.nic_code}
                              onChange={(e) => handleTableRowChange('products_services', index, 'nic_code', e.target.value)}
                              placeholder="NIC Code"
                              className="h-8"
                            />
                          ) : (
                            <span className="text-sm">{row.nic_code || '-'}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              type="number"
                              value={row.turnover_percentage}
                              onChange={(e) => handleTableRowChange('products_services', index, 'turnover_percentage', parseFloat(e.target.value) || 0)}
                              placeholder="%"
                              min="0"
                              max="100"
                              className="h-8"
                            />
                          ) : (
                            <span className="text-sm">{row.turnover_percentage}%</span>
                          )}
                        </TableCell>
                        {isEditing && (
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeTableRow('products_services', index)}
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

            {/* Plants and Offices Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-text-primary">
                  Plants and Offices Operated *
                </h4>
                {isEditing && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addTableRow('plants_offices', EMPTY_PLANT_OFFICE)}
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
                      {isEditing && <TableHead className="w-[10%]">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formData.plants_offices.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {isEditing ? (
                            <Select
                              value={row.location_type}
                              onValueChange={(value) => handleTableRowChange('plants_offices', index, 'location_type', value)}
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
                          {isEditing ? (
                            <Input
                              type="number"
                              value={row.num_plants}
                              onChange={(e) => handleTableRowChange('plants_offices', index, 'num_plants', parseInt(e.target.value) || 0)}
                              placeholder="0"
                              min="0"
                              className="h-8"
                            />
                          ) : (
                            <span className="text-sm">{row.num_plants}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              type="number"
                              value={row.num_offices}
                              onChange={(e) => handleTableRowChange('plants_offices', index, 'num_offices', parseInt(e.target.value) || 0)}
                              placeholder="0"
                              min="0"
                              className="h-8"
                            />
                          ) : (
                            <span className="text-sm">{row.num_offices}</span>
                          )}
                        </TableCell>
                        {isEditing && (
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeTableRow('plants_offices', index)}
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

            {/* Markets Served Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-text-primary">
                  Markets Served by Entity *
                </h4>
                {isEditing && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addTableRow('markets_served', EMPTY_MARKET_SERVED)}
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
                      {isEditing && <TableHead className="w-[10%]">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formData.markets_served.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {isEditing ? (
                            <Select
                              value={row.location_type}
                              onValueChange={(value) => handleTableRowChange('markets_served', index, 'location_type', value)}
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
                          {isEditing ? (
                            <Input
                              type="number"
                              value={row.number}
                              onChange={(e) => handleTableRowChange('markets_served', index, 'number', parseInt(e.target.value) || 0)}
                              placeholder="0"
                              min="0"
                              className="h-8"
                            />
                          ) : (
                            <span className="text-sm">{row.number}</span>
                          )}
                        </TableCell>
                        {isEditing && (
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeTableRow('markets_served', index)}
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
