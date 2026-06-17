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
  initialData = null 
}) {
  const { getAuthHeader } = useAuth();
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [missingFields, setMissingFields] = useState([]);
  
  // BRSR Form Data
  const [formData, setFormData] = useState({
    // Basic Information
    cin: '',
    listed_entity_name: '',
    year_of_incorporation: new Date().getFullYear(),
    corporate_address: '',
    city: '',
    state: '',
    country: 'India',
    pincode: '',
    email: '',
    telephone: '',
    website: '',
    paid_up_capital: 0,
    assurance_provider: '',
    assurance_type: '',
    export_contribution_percentage: 0,
    customer_types_brief: '',
    
    // Radio fields
    stock_exchange: 'BSE',
    reporting_boundary: 'Standalone',
    
    // Dynamic tables
    business_activities: [{ ...EMPTY_BUSINESS_ACTIVITY }],
    products_services: [{ ...EMPTY_PRODUCT_SERVICE }],
    plants_offices: [{ ...EMPTY_PLANT_OFFICE }],
    markets_served: [{ ...EMPTY_MARKET_SERVED }],
  });

  useEffect(() => {
    fetchBRSRDetails();
  }, []);

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

  const fetchBRSRDetails = async () => {
    try {
      const res = await axios.get(`${API}/organizations/my/framework-details/brsr`, {
        headers: getAuthHeader()
      });
      
      if (res.data.details) {
        const details = res.data.details;
        setFormData(prev => ({
          ...prev,
          ...details,
          business_activities: details.business_activities?.length > 0 
            ? details.business_activities 
            : [{ ...EMPTY_BUSINESS_ACTIVITY }],
          products_services: details.products_services?.length > 0 
            ? details.products_services 
            : [{ ...EMPTY_PRODUCT_SERVICE }],
          plants_offices: details.plants_offices?.length > 0 
            ? details.plants_offices 
            : [{ ...EMPTY_PLANT_OFFICE }],
          markets_served: details.markets_served?.length > 0 
            ? details.markets_served 
            : [{ ...EMPTY_MARKET_SERVED }],
        }));
      }
      setIsComplete(res.data.is_complete);
      setMissingFields(res.data.missing_fields || []);
    } catch (error) {
      if (error.response?.status !== 400) {
        console.error('Failed to fetch BRSR details:', error);
      }
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
      const res = await axios.put(
        `${API}/organizations/my/framework-details/brsr`,
        formData,
        { headers: getAuthHeader() }
      );
      setIsComplete(res.data.is_complete);
      setMissingFields(res.data.missing_fields || []);
      toast.success('BRSR details saved successfully');
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
        <div className="p-6 space-y-8 border-t">
          {/* Basic Information Section */}
          <div>
            <h4 className="text-sm font-semibold text-text-primary mb-4 pb-2 border-b">
              Basic Information
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
              
              <div className="space-y-2 md:col-span-2">
                <Label>Corporate Address *</Label>
                {isEditing ? (
                  <Input
                    value={formData.corporate_address}
                    onChange={(e) => handleInputChange('corporate_address', e.target.value)}
                    placeholder="Enter corporate address"
                    data-testid="brsr-corporate-address"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.corporate_address || '-'}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>City *</Label>
                {isEditing ? (
                  <Input
                    value={formData.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                    placeholder="Enter city"
                    data-testid="brsr-city"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.city || '-'}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>State *</Label>
                {isEditing ? (
                  <Input
                    value={formData.state}
                    onChange={(e) => handleInputChange('state', e.target.value)}
                    placeholder="Enter state"
                    data-testid="brsr-state"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.state || '-'}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Country *</Label>
                {isEditing ? (
                  <Input
                    value={formData.country}
                    onChange={(e) => handleInputChange('country', e.target.value)}
                    placeholder="Enter country"
                    data-testid="brsr-country"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.country || '-'}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>PIN Code *</Label>
                {isEditing ? (
                  <Input
                    value={formData.pincode}
                    onChange={(e) => handleInputChange('pincode', e.target.value)}
                    placeholder="6-digit PIN"
                    maxLength={6}
                    data-testid="brsr-pincode"
                  />
                ) : (
                  <p className="text-sm text-text-secondary py-2">{formData.pincode || '-'}</p>
                )}
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
        </div>
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
