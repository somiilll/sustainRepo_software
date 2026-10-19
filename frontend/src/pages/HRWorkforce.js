import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
  Users, Save, Loader2, ChevronDown, ChevronRight, Building2,
  UserCheck, Shield, Heart, RotateCcw, Users2, Wallet
} from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Section configurations
const SECTIONS = [
  { id: 'demographics', title: 'Workforce Demographics & Diversity', icon: Users, color: 'blue' },
  { id: 'turnover', title: 'Employee & Worker Turnover', icon: RotateCcw, color: 'orange' },
  { id: 'benefits', title: 'Social Security & Employee Benefits', icon: Shield, color: 'green' },
  { id: 'statutory', title: 'Statutory Compliance & Social Security Coverage', icon: UserCheck, color: 'purple' },
  { id: 'wellbeing', title: 'Employee Well-being & Welfare', icon: Heart, color: 'pink' },
  { id: 'retention', title: 'Return to Work & Retention after Parental Leave', icon: RotateCcw, color: 'teal' },
  { id: 'union', title: 'Freedom of Association & Union Participation', icon: Users2, color: 'indigo' },
  { id: 'wages', title: 'Wage & Remuneration Structure', icon: Wallet, color: 'amber' },
];

// Generate FY options - "FY 2025-2026" format
const generateFYOptions = () => {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => {
    const startYear = currentYear - i;
    return `FY ${startYear}-${startYear + 1}`;
  });
};

// Get FY labels for multi-year tables (current, previous, prior-to-previous)
const getFYLabels = (selectedFY) => {
  // Parse selected FY (e.g., "FY 2025-2026" -> startYear = 2025)
  const match = selectedFY.match(/FY (\d{4})-(\d{4})/);
  if (!match) return { current: selectedFY, previous: '', priorToPrevious: '' };
  
  const startYear = parseInt(match[1]);
  return {
    current: `FY ${startYear}-${startYear + 1}`,
    previous: `FY ${startYear - 1}-${startYear}`,
    priorToPrevious: `FY ${startYear - 2}-${startYear - 1}`
  };
};

export default function HRWorkforce({ embedded = false }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState(['demographics']);
  const [selectedFY, setSelectedFY] = useState(generateFYOptions()[0]);
  const [data, setData] = useState({});
  const [facilities, setFacilities] = useState([]);
  const [selectedFacility, setSelectedFacility] = useState('all');

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchFacilities();
    fetchData();
  }, [selectedFY, selectedFacility]);

  const fetchFacilities = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/facilities`, { headers });
      setFacilities(res.data.facilities || res.data || []);
    } catch (error) {
      console.error('Failed to fetch facilities:', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND_URL}/api/hr-workforce/data`, {
        params: { financial_year: selectedFY, facility_id: selectedFacility !== 'all' ? selectedFacility : undefined },
        headers
      });
      setData(res.data.data || {});
    } catch (error) {
      console.error('Failed to fetch HR data:', error);
      setData({});
    } finally {
      setLoading(false);
    }
  };

  const saveData = async () => {
    setSaving(true);
    try {
      await axios.post(`${BACKEND_URL}/api/hr-workforce/data`, {
        financial_year: selectedFY,
        facility_id: selectedFacility !== 'all' ? selectedFacility : null,
        data
      }, { headers });
      toast.success('Data saved successfully');
    } catch (error) {
      toast.error('Failed to save data');
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => 
      prev.includes(sectionId) 
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const updateValue = (section, workerType, field, value) => {
    setData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [workerType]: {
          ...prev[section]?.[workerType],
          [field]: value
        }
      }
    }));
  };

  const renderDemographicsSection = () => {
    const fyLabels = getFYLabels(selectedFY);
    const fyKeys = ['current', 'previous', 'priorToPrevious'];
    
    return (
      <Tabs defaultValue="employees" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="workers">Workers</TabsTrigger>
        </TabsList>
        {['employees', 'workers'].map(type => (
          <TabsContent key={type} value={type}>
            <div className="space-y-6">
              {/* Main Demographics */}
              <div>
                <h4 className="text-sm font-medium text-stone-700 mb-2">General Demographics</h4>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead rowSpan={2} className="align-bottom border-r">Category</TableHead>
                        {fyKeys.map(fyKey => (
                          <TableHead key={fyKey} colSpan={3} className="text-center border-r">{fyLabels[fyKey]}</TableHead>
                        ))}
                      </TableRow>
                      <TableRow>
                        {fyKeys.map(fyKey => (
                          <React.Fragment key={fyKey}>
                            <TableHead className="text-center">Male</TableHead>
                            <TableHead className="text-center">Female</TableHead>
                            <TableHead className="text-center border-r">Total</TableHead>
                          </React.Fragment>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {['Permanent', 'Non-Permanent/Temporary'].map(category => (
                        <TableRow key={category}>
                          <TableCell className="font-medium border-r">{category}</TableCell>
                          {fyKeys.map(fyKey => (
                            <React.Fragment key={fyKey}>
                              {['male', 'female'].map(gender => (
                                <TableCell key={gender} className="text-center">
                                  <Input
                                    type="number"
                                    className="w-20"
                                    value={data.demographics?.[type]?.[`${category.toLowerCase().replace(/[^a-z]/g, '_')}_${gender}_${fyKey}`] || ''}
                                    onChange={(e) => updateValue('demographics', type, `${category.toLowerCase().replace(/[^a-z]/g, '_')}_${gender}_${fyKey}`, e.target.value)}
                                  />
                                </TableCell>
                              ))}
                              <TableCell className="font-semibold text-stone-600 text-center border-r">
                                {['male', 'female'].reduce((sum, g) => 
                                  sum + (parseInt(data.demographics?.[type]?.[`${category.toLowerCase().replace(/[^a-z]/g, '_')}_${g}_${fyKey}`]) || 0), 0
                                )}
                              </TableCell>
                            </React.Fragment>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              {/* Differently Abled Sub-section */}
              <div>
                <h4 className="text-sm font-medium text-stone-700 mb-2">Differently Abled</h4>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead rowSpan={2} className="align-bottom border-r">Category</TableHead>
                        {fyKeys.map(fyKey => (
                          <TableHead key={fyKey} colSpan={3} className="text-center border-r">{fyLabels[fyKey]}</TableHead>
                        ))}
                      </TableRow>
                      <TableRow>
                        {fyKeys.map(fyKey => (
                          <React.Fragment key={fyKey}>
                            <TableHead className="text-center">Male</TableHead>
                            <TableHead className="text-center">Female</TableHead>
                            <TableHead className="text-center border-r">Total</TableHead>
                          </React.Fragment>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {['Permanent', 'Non-Permanent/Temporary'].map(category => (
                        <TableRow key={category}>
                          <TableCell className="font-medium border-r">{category}</TableCell>
                          {fyKeys.map(fyKey => (
                            <React.Fragment key={fyKey}>
                              {['male', 'female'].map(gender => (
                                <TableCell key={gender} className="text-center">
                                  <Input
                                    type="number"
                                    className="w-20"
                                    value={data.demographics?.[type]?.[`differently_abled_${category.toLowerCase().replace(/[^a-z]/g, '_')}_${gender}_${fyKey}`] || ''}
                                    onChange={(e) => updateValue('demographics', type, `differently_abled_${category.toLowerCase().replace(/[^a-z]/g, '_')}_${gender}_${fyKey}`, e.target.value)}
                                  />
                                </TableCell>
                              ))}
                              <TableCell className="font-semibold text-stone-600 text-center border-r">
                                {['male', 'female'].reduce((sum, g) => 
                                  sum + (parseInt(data.demographics?.[type]?.[`differently_abled_${category.toLowerCase().replace(/[^a-z]/g, '_')}_${g}_${fyKey}`]) || 0), 0
                                )}
                              </TableCell>
                            </React.Fragment>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    );
  };

  const renderTurnoverSection = () => {
    const fyLabels = getFYLabels(selectedFY);
    const fyKeys = ['current', 'previous', 'priorToPrevious'];
    
    return (
      <Tabs defaultValue="employees" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="workers">Workers</TabsTrigger>
        </TabsList>
        {['employees', 'workers'].map(type => (
          <TabsContent key={type} value={type}>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className="align-bottom border-r">Metric</TableHead>
                    {fyKeys.map(fyKey => (
                      <TableHead key={fyKey} colSpan={2} className="text-center border-r">{fyLabels[fyKey]}</TableHead>
                    ))}
                  </TableRow>
                  <TableRow>
                    {fyKeys.map(fyKey => (
                      <React.Fragment key={fyKey}>
                        <TableHead className="text-center">Male (%)</TableHead>
                        <TableHead className="text-center border-r">Female (%)</TableHead>
                      </React.Fragment>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium border-r">Turnover Rate</TableCell>
                    {fyKeys.map(fyKey => (
                      <React.Fragment key={fyKey}>
                        {['male', 'female'].map(gender => (
                          <TableCell key={gender} className={`text-center ${gender === 'female' ? 'border-r' : ''}`}>
                            <Input
                              type="number"
                              step="0.01"
                              className="w-20"
                              value={data.turnover?.[type]?.[`turnover_rate_${gender}_${fyKey}`] || ''}
                              onChange={(e) => updateValue('turnover', type, `turnover_rate_${gender}_${fyKey}`, e.target.value)}
                            />
                          </TableCell>
                        ))}
                      </React.Fragment>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    );
  };

  const renderBenefitsSection = () => {
    const benefits = ['Health Insurance', 'Accident Insurance', 'Maternity Benefits', 'Paternity Benefits', 'Day Care Facilities'];
    const empTypes = ['permanent', 'non_permanent'];
    const empTypeLabels = { permanent: 'Permanent', non_permanent: 'Non-Permanent/Temporary' };
    
    return (
      <Tabs defaultValue="employees" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="workers">Workers</TabsTrigger>
        </TabsList>
        {['employees', 'workers'].map(type => (
          <TabsContent key={type} value={type}>
            <div className="space-y-6">
              {empTypes.map(empType => (
                <div key={empType}>
                  <h4 className="text-sm font-medium text-stone-700 mb-2">{empTypeLabels[empType]}</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Benefit</TableHead>
                        <TableHead>Male</TableHead>
                        <TableHead>Female</TableHead>
                        <TableHead>Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {benefits.map(benefit => {
                        const key = `${empType}_${benefit.toLowerCase().replace(/[^a-z]/g, '_')}`;
                        return (
                          <TableRow key={benefit}>
                            <TableCell className="font-medium">{benefit}</TableCell>
                            {['male', 'female'].map(gender => (
                              <TableCell key={gender}>
                                <Input
                                  type="number"
                                  className="w-24"
                                  value={data.benefits?.[type]?.[`${key}_${gender}`] || ''}
                                  onChange={(e) => updateValue('benefits', type, `${key}_${gender}`, e.target.value)}
                                />
                              </TableCell>
                            ))}
                            <TableCell className="font-semibold text-stone-600">
                              {['male', 'female'].reduce((sum, g) => 
                                sum + (parseInt(data.benefits?.[type]?.[`${key}_${g}`]) || 0), 0
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    );
  };

  const renderStatutorySection = () => {
    const schemes = ['PF (Provident Fund)', 'Gratuity', 'ESI'];
    const fyLabels = getFYLabels(selectedFY);
    const fyKeys = ['current', 'previous'];
    
    return (
      <Tabs defaultValue="employees" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="workers">Workers</TabsTrigger>
        </TabsList>
        {['employees', 'workers'].map(type => (
          <TabsContent key={type} value={type}>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className="align-bottom border-r">Scheme</TableHead>
                    {fyKeys.map(fyKey => (
                      <TableHead key={fyKey} colSpan={3} className="text-center border-r">{fyLabels[fyKey]}</TableHead>
                    ))}
                  </TableRow>
                  <TableRow>
                    {fyKeys.map(fyKey => (
                      <React.Fragment key={fyKey}>
                        <TableHead className="text-center">Covered (No.)</TableHead>
                        <TableHead className="text-center">Deposited (INR)</TableHead>
                        <TableHead className="text-center border-r">Deducted & Deposited</TableHead>
                      </React.Fragment>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schemes.map(scheme => {
                    const key = scheme.toLowerCase().replace(/[^a-z]/g, '_');
                    return (
                      <TableRow key={scheme}>
                        <TableCell className="font-medium border-r">{scheme}</TableCell>
                        {fyKeys.map(fyKey => (
                          <React.Fragment key={fyKey}>
                            <TableCell className="text-center">
                              <Input
                                type="number"
                                className="w-20"
                                value={data.statutory?.[type]?.[`${key}_covered_${fyKey}`] || ''}
                                onChange={(e) => updateValue('statutory', type, `${key}_covered_${fyKey}`, e.target.value)}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Input
                                type="number"
                                className="w-24"
                                value={data.statutory?.[type]?.[`${key}_deposited_${fyKey}`] || ''}
                                onChange={(e) => updateValue('statutory', type, `${key}_deposited_${fyKey}`, e.target.value)}
                              />
                            </TableCell>
                            <TableCell className="text-center border-r">
                              <Select
                                value={data.statutory?.[type]?.[`${key}_deposited_status_${fyKey}`] || ''}
                                onValueChange={(v) => updateValue('statutory', type, `${key}_deposited_status_${fyKey}`, v)}
                              >
                                <SelectTrigger className="w-20">
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="yes">Yes</SelectItem>
                                  <SelectItem value="no">No</SelectItem>
                                  <SelectItem value="na">NA</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </React.Fragment>
                        ))}
                      </TableRow>
                    );
                  })}
                  {/* Other Statutory Schemes with name field */}
                  <TableRow>
                    <TableCell className="font-medium border-r">
                      <div className="space-y-1">
                        <span>Other Statutory Schemes</span>
                        <Input
                          type="text"
                          placeholder="Specify scheme name"
                          className="w-36 text-xs"
                          value={data.statutory?.[type]?.other_scheme_name || ''}
                          onChange={(e) => updateValue('statutory', type, 'other_scheme_name', e.target.value)}
                        />
                      </div>
                    </TableCell>
                    {fyKeys.map(fyKey => (
                      <React.Fragment key={fyKey}>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            className="w-20"
                            value={data.statutory?.[type]?.[`other_covered_${fyKey}`] || ''}
                            onChange={(e) => updateValue('statutory', type, `other_covered_${fyKey}`, e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            className="w-24"
                            value={data.statutory?.[type]?.[`other_deposited_${fyKey}`] || ''}
                            onChange={(e) => updateValue('statutory', type, `other_deposited_${fyKey}`, e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="text-center border-r">
                          <Select
                            value={data.statutory?.[type]?.[`other_deposited_status_${fyKey}`] || ''}
                            onValueChange={(v) => updateValue('statutory', type, `other_deposited_status_${fyKey}`, v)}
                          >
                            <SelectTrigger className="w-20">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="yes">Yes</SelectItem>
                              <SelectItem value="no">No</SelectItem>
                              <SelectItem value="na">NA</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </React.Fragment>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    );
  };

  const renderWellbeingSection = () => {
    const fyLabels = getFYLabels(selectedFY);
    
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead className="text-center">{fyLabels.current}</TableHead>
              <TableHead className="text-center">{fyLabels.previous}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Well-being Cost as % of Revenue</TableCell>
              <TableCell className="text-center">
                <Input
                  type="number"
                  step="0.01"
                  className="w-28"
                  value={data.wellbeing?.cost_percent_current || ''}
                  onChange={(e) => setData(prev => ({ ...prev, wellbeing: { ...prev.wellbeing, cost_percent_current: e.target.value } }))}
                />
              </TableCell>
              <TableCell className="text-center">
                <Input
                  type="number"
                  step="0.01"
                  className="w-28"
                  value={data.wellbeing?.cost_percent_previous || ''}
                  onChange={(e) => setData(prev => ({ ...prev, wellbeing: { ...prev.wellbeing, cost_percent_previous: e.target.value } }))}
                />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Total Well-being Spend (INR)</TableCell>
              <TableCell className="text-center">
                <Input
                  type="number"
                  className="w-28"
                  value={data.wellbeing?.total_spend_current || ''}
                  onChange={(e) => setData(prev => ({ ...prev, wellbeing: { ...prev.wellbeing, total_spend_current: e.target.value } }))}
                />
              </TableCell>
              <TableCell className="text-center">
                <Input
                  type="number"
                  className="w-28"
                  value={data.wellbeing?.total_spend_previous || ''}
                  onChange={(e) => setData(prev => ({ ...prev, wellbeing: { ...prev.wellbeing, total_spend_previous: e.target.value } }))}
                />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderRetentionSection = () => (
    <Tabs defaultValue="employees" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="employees">Employees</TabsTrigger>
        <TabsTrigger value="workers">Workers</TabsTrigger>
      </TabsList>
      {['employees', 'workers'].map(type => (
        <TabsContent key={type} value={type}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead>Male</TableHead>
                <TableHead>Female</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {['Return to Work Rate (%)', 'Retention Rate (%)'].map(metric => (
                <TableRow key={metric}>
                  <TableCell className="font-medium">{metric}</TableCell>
                  {['male', 'female'].map(gender => (
                    <TableCell key={gender}>
                      <Input
                        type="number"
                        step="0.01"
                        className="w-24"
                        value={data.retention?.[type]?.[`${metric.toLowerCase().replace(/[^a-z]/g, '_')}_${gender}`] || ''}
                        onChange={(e) => updateValue('retention', type, `${metric.toLowerCase().replace(/[^a-z]/g, '_')}_${gender}`, e.target.value)}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      ))}
    </Tabs>
  );

  const renderUnionSection = () => {
    const fyLabels = getFYLabels(selectedFY);
    const fyKeys = ['current', 'previous'];
    
    return (
      <Tabs defaultValue="employees" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="workers">Workers</TabsTrigger>
        </TabsList>
        {['employees', 'workers'].map(type => (
          <TabsContent key={type} value={type}>
            <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
              <strong>Note:</strong> This section applies only to <strong>Permanent {type === 'employees' ? 'Employees' : 'Workers'}</strong>.
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className="align-bottom border-r">Metric</TableHead>
                    {fyKeys.map(fyKey => (
                      <TableHead key={fyKey} colSpan={3} className="text-center border-r">{fyLabels[fyKey]}</TableHead>
                    ))}
                  </TableRow>
                  <TableRow>
                    {fyKeys.map(fyKey => (
                      <React.Fragment key={fyKey}>
                        <TableHead className="text-center">Male</TableHead>
                        <TableHead className="text-center">Female</TableHead>
                        <TableHead className="text-center border-r">Total</TableHead>
                      </React.Fragment>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {['Union Members'].map(metric => (
                    <TableRow key={metric}>
                      <TableCell className="font-medium border-r">{metric}</TableCell>
                      {fyKeys.map(fyKey => (
                        <React.Fragment key={fyKey}>
                          {['male', 'female'].map(gender => (
                            <TableCell key={gender} className="text-center">
                              <Input
                                type="number"
                                className="w-20"
                                value={data.union?.[type]?.[`${metric.toLowerCase().replace(/[^a-z]/g, '_')}_${gender}_${fyKey}`] || ''}
                                onChange={(e) => updateValue('union', type, `${metric.toLowerCase().replace(/[^a-z]/g, '_')}_${gender}_${fyKey}`, e.target.value)}
                              />
                            </TableCell>
                          ))}
                          <TableCell className="font-semibold text-stone-600 text-center border-r">
                            {['male', 'female'].reduce((sum, g) => 
                              sum + (parseInt(data.union?.[type]?.[`${metric.toLowerCase().replace(/[^a-z]/g, '_')}_${g}_${fyKey}`]) || 0), 0
                            )}
                          </TableCell>
                        </React.Fragment>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    );
  };

  const renderWagesSection = () => {
    const metrics = ['Equal to Minimum Wage', 'More than Minimum Wage', 'Median Remuneration / Salary / Wages (INR)'];
    const empTypes = ['permanent', 'non_permanent'];
    const empTypeLabels = { permanent: 'Permanent', non_permanent: 'Non-Permanent/Temporary' };
    const fyLabels = getFYLabels(selectedFY);
    const fyKeys = ['current', 'previous'];
    
    return (
      <div className="space-y-6">
        {/* Gross wages to females */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-center">{fyLabels.current}</TableHead>
                <TableHead className="text-center">{fyLabels.previous}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Gross wages paid to females as % of total wages</TableCell>
                <TableCell className="text-center">
                  <Input
                    type="number"
                    step="0.01"
                    className="w-28"
                    value={data.wages?.gross_wages_female_percent_current || ''}
                    onChange={(e) => setData(prev => ({ ...prev, wages: { ...prev.wages, gross_wages_female_percent_current: e.target.value } }))}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Input
                    type="number"
                    step="0.01"
                    className="w-28"
                    value={data.wages?.gross_wages_female_percent_previous || ''}
                    onChange={(e) => setData(prev => ({ ...prev, wages: { ...prev.wages, gross_wages_female_percent_previous: e.target.value } }))}
                  />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        
        <Tabs defaultValue="employees" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="employees">Employees</TabsTrigger>
            <TabsTrigger value="workers">Workers</TabsTrigger>
          </TabsList>
          {['employees', 'workers'].map(type => (
            <TabsContent key={type} value={type}>
              <div className="space-y-6">
                {empTypes.map(empType => (
                  <div key={empType}>
                    <h4 className="text-sm font-medium text-stone-700 mb-2">{empTypeLabels[empType]}</h4>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead rowSpan={2} className="align-bottom border-r">Category</TableHead>
                            {fyKeys.map(fyKey => (
                              <TableHead key={fyKey} colSpan={2} className="text-center border-r">{fyLabels[fyKey]}</TableHead>
                            ))}
                          </TableRow>
                          <TableRow>
                            {fyKeys.map(fyKey => (
                              <React.Fragment key={fyKey}>
                                <TableHead className="text-center">Male</TableHead>
                                <TableHead className="text-center border-r">Female</TableHead>
                              </React.Fragment>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {metrics.map(metric => {
                            const key = `${empType}_${metric.toLowerCase().replace(/[^a-z]/g, '_')}`;
                            return (
                              <TableRow key={metric}>
                                <TableCell className="font-medium border-r">{metric}</TableCell>
                                {fyKeys.map(fyKey => (
                                  <React.Fragment key={fyKey}>
                                    {['male', 'female'].map(gender => (
                                      <TableCell key={gender} className={`text-center ${gender === 'female' ? 'border-r' : ''}`}>
                                        <Input
                                          type="number"
                                          className="w-24"
                                          value={data.wages?.[type]?.[`${key}_${gender}_${fyKey}`] || ''}
                                          onChange={(e) => updateValue('wages', type, `${key}_${gender}_${fyKey}`, e.target.value)}
                                        />
                                      </TableCell>
                                    ))}
                                  </React.Fragment>
                                ))}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    );
  };

  const renderSectionContent = (sectionId) => {
    switch (sectionId) {
      case 'demographics': return renderDemographicsSection();
      case 'turnover': return renderTurnoverSection();
      case 'benefits': return renderBenefitsSection();
      case 'statutory': return renderStatutorySection();
      case 'wellbeing': return renderWellbeingSection();
      case 'retention': return renderRetentionSection();
      case 'union': return renderUnionSection();
      case 'wages': return renderWagesSection();
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header - only show if not embedded */}
      {!embedded && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-2xl font-heading font-bold text-text-primary">HR & Workforce</h1>
              <p className="text-text-muted text-sm">Consolidated BRSR Workforce Disclosures</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedFacility} onValueChange={setSelectedFacility}>
              <SelectTrigger className="w-48">
                <Building2 className="w-4 h-4 mr-2" />
                <SelectValue placeholder="All Facilities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Facilities</SelectItem>
                {facilities.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedFY} onValueChange={setSelectedFY}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {generateFYOptions().map(fy => (
                  <SelectItem key={fy} value={fy}>{fy}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={saveData} disabled={saving} data-testid="save-hr-data">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save All
            </Button>
          </div>
        </div>
      )}

      {/* Embedded header with controls */}
      {embedded && (
        <div className="flex items-center justify-end gap-3">
          <Select value={selectedFacility} onValueChange={setSelectedFacility}>
            <SelectTrigger className="w-40">
              <Building2 className="w-4 h-4 mr-2" />
              <SelectValue placeholder="All Facilities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Facilities</SelectItem>
              {facilities.map(f => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedFY} onValueChange={setSelectedFY}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {generateFYOptions().map(fy => (
                <SelectItem key={fy} value={fy}>{fy}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={saveData} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Save
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      ) : (
        <div className="space-y-3">
          {SECTIONS.map(section => (
            <Card key={section.id} className="overflow-hidden">
              <button
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-stone-50 transition-colors"
                onClick={() => toggleSection(section.id)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg bg-${section.color}-100 flex items-center justify-center`}>
                    <section.icon className={`w-4 h-4 text-${section.color}-600`} />
                  </div>
                  <span className="font-medium text-text-primary">{section.title}</span>
                </div>
                {expandedSections.includes(section.id) ? (
                  <ChevronDown className="w-5 h-5 text-stone-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-stone-400" />
                )}
              </button>
              {expandedSections.includes(section.id) && (
                <div className="px-4 pb-4 border-t">
                  <div className="pt-4">
                    {renderSectionContent(section.id)}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
