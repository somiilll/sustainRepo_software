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
  { id: 'retention', title: 'Return to Work & Retention', icon: RotateCcw, color: 'teal' },
  { id: 'union', title: 'Freedom of Association & Union Participation', icon: Users2, color: 'indigo' },
  { id: 'wages', title: 'Wage & Remuneration Structure', icon: Wallet, color: 'amber' },
];

// Generate FY options
const generateFYOptions = () => {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => {
    const startYear = currentYear - i;
    return `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
  });
};

export default function HRWorkforce() {
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

  const renderDemographicsSection = () => (
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Male</TableHead>
                    <TableHead>Female</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {['Permanent', 'Non-Permanent/Temporary'].map(category => (
                    <TableRow key={category}>
                      <TableCell className="font-medium">{category}</TableCell>
                      {['male', 'female'].map(gender => (
                        <TableCell key={gender}>
                          <Input
                            type="number"
                            className="w-24"
                            value={data.demographics?.[type]?.[`${category.toLowerCase().replace(/[^a-z]/g, '_')}_${gender}`] || ''}
                            onChange={(e) => updateValue('demographics', type, `${category.toLowerCase().replace(/[^a-z]/g, '_')}_${gender}`, e.target.value)}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="font-semibold text-stone-600">
                        {['male', 'female'].reduce((sum, g) => 
                          sum + (parseInt(data.demographics?.[type]?.[`${category.toLowerCase().replace(/[^a-z]/g, '_')}_${g}`]) || 0), 0
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Differently Abled Sub-section */}
            <div>
              <h4 className="text-sm font-medium text-stone-700 mb-2">Differently Abled</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Male</TableHead>
                    <TableHead>Female</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {['Permanent', 'Non-Permanent/Temporary'].map(category => (
                    <TableRow key={category}>
                      <TableCell className="font-medium">{category}</TableCell>
                      {['male', 'female'].map(gender => (
                        <TableCell key={gender}>
                          <Input
                            type="number"
                            className="w-24"
                            value={data.demographics?.[type]?.[`differently_abled_${category.toLowerCase().replace(/[^a-z]/g, '_')}_${gender}`] || ''}
                            onChange={(e) => updateValue('demographics', type, `differently_abled_${category.toLowerCase().replace(/[^a-z]/g, '_')}_${gender}`, e.target.value)}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="font-semibold text-stone-600">
                        {['male', 'female'].reduce((sum, g) => 
                          sum + (parseInt(data.demographics?.[type]?.[`differently_abled_${category.toLowerCase().replace(/[^a-z]/g, '_')}_${g}`]) || 0), 0
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );

  const renderTurnoverSection = () => (
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
                <TableHead>Male (%)</TableHead>
                <TableHead>Female (%)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Turnover Rate</TableCell>
                {['male', 'female'].map(gender => (
                  <TableCell key={gender}>
                    <Input
                      type="number"
                      step="0.01"
                      className="w-24"
                      value={data.turnover?.[type]?.[`turnover_rate_${gender}`] || ''}
                      onChange={(e) => updateValue('turnover', type, `turnover_rate_${gender}`, e.target.value)}
                    />
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </TabsContent>
      ))}
    </Tabs>
  );

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
    
    return (
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
                  <TableHead>Scheme</TableHead>
                  <TableHead>Covered (No.)</TableHead>
                  <TableHead>Deposited (INR)</TableHead>
                  <TableHead>Deducted & Deposited with Authority</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schemes.map(scheme => {
                  const key = scheme.toLowerCase().replace(/[^a-z]/g, '_');
                  return (
                    <TableRow key={scheme}>
                      <TableCell className="font-medium">{scheme}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="w-24"
                          value={data.statutory?.[type]?.[`${key}_covered`] || ''}
                          onChange={(e) => updateValue('statutory', type, `${key}_covered`, e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="w-28"
                          value={data.statutory?.[type]?.[`${key}_deposited`] || ''}
                          onChange={(e) => updateValue('statutory', type, `${key}_deposited`, e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={data.statutory?.[type]?.[`${key}_deposited_status`] || ''}
                          onValueChange={(v) => updateValue('statutory', type, `${key}_deposited_status`, v)}
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="yes">Yes</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                            <SelectItem value="na">NA</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {/* Other Statutory Schemes with name field */}
                <TableRow>
                  <TableCell className="font-medium">
                    <div className="space-y-1">
                      <span>Other Statutory Schemes</span>
                      <Input
                        type="text"
                        placeholder="Specify scheme name"
                        className="w-40 text-xs"
                        value={data.statutory?.[type]?.other_scheme_name || ''}
                        onChange={(e) => updateValue('statutory', type, 'other_scheme_name', e.target.value)}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      className="w-24"
                      value={data.statutory?.[type]?.other_covered || ''}
                      onChange={(e) => updateValue('statutory', type, 'other_covered', e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      className="w-28"
                      value={data.statutory?.[type]?.other_deposited || ''}
                      onChange={(e) => updateValue('statutory', type, 'other_deposited', e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={data.statutory?.[type]?.other_deposited_status || ''}
                      onValueChange={(v) => updateValue('statutory', type, 'other_deposited_status', v)}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="na">NA</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TabsContent>
        ))}
      </Tabs>
    );
  };

  const renderWellbeingSection = () => (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <Label>Well-being Cost as % of Revenue</Label>
        <Input
          type="number"
          step="0.01"
          value={data.wellbeing?.cost_percent || ''}
          onChange={(e) => setData(prev => ({ ...prev, wellbeing: { ...prev.wellbeing, cost_percent: e.target.value } }))}
        />
      </div>
      <div>
        <Label>Total Well-being Spend (INR)</Label>
        <Input
          type="number"
          value={data.wellbeing?.total_spend || ''}
          onChange={(e) => setData(prev => ({ ...prev, wellbeing: { ...prev.wellbeing, total_spend: e.target.value } }))}
        />
      </div>
    </div>
  );

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

  const renderUnionSection = () => (
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead>Male</TableHead>
                <TableHead>Female</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {['Union Members', 'Covered by Collective Bargaining'].map(metric => (
                <TableRow key={metric}>
                  <TableCell className="font-medium">{metric}</TableCell>
                  {['male', 'female'].map(gender => (
                    <TableCell key={gender}>
                      <Input
                        type="number"
                        className="w-24"
                        value={data.union?.[type]?.[`${metric.toLowerCase().replace(/[^a-z]/g, '_')}_${gender}`] || ''}
                        onChange={(e) => updateValue('union', type, `${metric.toLowerCase().replace(/[^a-z]/g, '_')}_${gender}`, e.target.value)}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="font-semibold text-stone-600">
                    {['male', 'female'].reduce((sum, g) => 
                      sum + (parseInt(data.union?.[type]?.[`${metric.toLowerCase().replace(/[^a-z]/g, '_')}_${g}`]) || 0), 0
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      ))}
    </Tabs>
  );

  const renderWagesSection = () => {
    const metrics = ['Equal to Minimum Wage', 'More than Minimum Wage', 'Median Remuneration / Salary / Wages (INR)'];
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
                        <TableHead>Category</TableHead>
                        <TableHead>Male</TableHead>
                        <TableHead>Female</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {metrics.map(metric => {
                        const key = `${empType}_${metric.toLowerCase().replace(/[^a-z]/g, '_')}`;
                        return (
                          <TableRow key={metric}>
                            <TableCell className="font-medium">{metric}</TableCell>
                            {['male', 'female'].map(gender => (
                              <TableCell key={gender}>
                                <Input
                                  type="number"
                                  className="w-28"
                                  value={data.wages?.[type]?.[`${key}_${gender}`] || ''}
                                  onChange={(e) => updateValue('wages', type, `${key}_${gender}`, e.target.value)}
                                />
                              </TableCell>
                            ))}
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
      {/* Header */}
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
