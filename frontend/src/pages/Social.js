import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Users2, Edit2, Eye, Info, Save } from 'lucide-react';
import ESGQuestionnaire from '../components/ESGQuestionnaire';
import ESGRecordsModule from '../components/ESGRecordsModule';
import HRWorkforce from './HRWorkforce';
import FrameworkTabs from '../components/FrameworkTabs';
import GRIQuestionnaire from '../components/GRIQuestionnaire';
import WorkforceDataTable from '../components/WorkforceDataTable';
import {
  ALL_WORKFORCE_CONFIGS,
} from '../config/workforceTableConfigs';

const API = process.env.REACT_APP_BACKEND_URL;

function WorkforceTables({ isEditing }) {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const [fieldValues, setFieldValues] = useState({});
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/esg-records?section=social&category=Social&subcategory=Workforce`, { headers });
      const records = res.data?.records || res.data || [];
      const merged = {};
      (Array.isArray(records) ? records : []).forEach(r => {
        Object.assign(merged, r.field_values || {});
      });
      setFieldValues(merged);
    } catch (e) {
      try {
        const res2 = await axios.get(`${API}/api/esg-records?section=social`, { headers });
        const records2 = res2.data?.records || res2.data || [];
        const merged2 = {};
        (Array.isArray(records2) ? records2 : []).forEach(r => {
          if (r.category === 'Social') Object.assign(merged2, r.field_values || {});
        });
        setFieldValues(merged2);
      } catch (err) { /* silent */ }
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.post(`${API}/api/esg-records`, {
        section: 'social', category: 'Social', subcategory: 'Workforce', field_values: fieldValues,
      }, { headers });
      toast.success('Workforce data saved');
    } catch (e) { toast.error('Failed to save'); }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {ALL_WORKFORCE_CONFIGS.map(config => (
        <WorkforceDataTable key={config.key} config={config} fieldValues={fieldValues} onChange={setFieldValues} isEditing={isEditing} />
      ))}
      {isEditing && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 gap-1">
            <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Workforce Data'}
          </Button>
        </div>
      )}
    </div>
  );
}

function SocialRecordsContent() {
  return <ESGRecordsModule section="social" />;
}

export default function Social() {
  const [isEditing, setIsEditing] = useState(false);

  const renderFrameworkContent = (framework) => {
    if (framework === 'BRSR') {
      return (
        <Tabs defaultValue="hr-workforce" className="w-full">
          <TabsList className="mb-4 w-full overflow-x-auto whitespace-nowrap flex-nowrap justify-start">
            <TabsTrigger value="hr-workforce">HR & Workforce</TabsTrigger>
            <TabsTrigger value="stakeholder">Stakeholder</TabsTrigger>
            <TabsTrigger value="diversity">Diversity, Accessibility & Inclusion</TabsTrigger>
            <TabsTrigger value="ohs">Occupational Health, Safety & Well-being</TabsTrigger>
            <TabsTrigger value="labor-hr">Labor Practices & Human Rights</TabsTrigger>
            <TabsTrigger value="csr">Community & Inclusive Growth (CSR)</TabsTrigger>
          </TabsList>
          
          <TabsContent value="hr-workforce">
            <HRWorkforce embedded={true} />
          </TabsContent>

          <TabsContent value="stakeholder">
            <Card className="p-4 bg-blue-50/50 border-blue-100 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800">
                  <strong>Stakeholder Responsiveness (P4):</strong> Covers stakeholder engagement, grievance mechanisms, community relations, and intellectual property matters.
                </p>
              </div>
            </Card>
            <Card className="p-6">
              <ESGQuestionnaire framework="BRSR" section="social" isEditing={isEditing} filterPrinciples={["P4"]} />
            </Card>
          </TabsContent>

          <TabsContent value="diversity">
            <Card className="p-4 bg-blue-50/50 border-blue-100 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800">
                  <strong>Diversity, Accessibility & Inclusion:</strong> Enter workforce demographics in the tables below. Totals are auto-calculated. Data maps to individual KPIs for targets and dashboards.
                </p>
              </div>
            </Card>
            <WorkforceTables isEditing={isEditing} />
          </TabsContent>

          <TabsContent value="ohs">
            <Card className="p-4 bg-blue-50/50 border-blue-100 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800">
                  <strong>Occupational Health, Safety & Well-being:</strong> Covers OHS management systems, hazard identification, worker safety reporting, healthcare access, and life insurance provisions.
                </p>
              </div>
            </Card>
            <Card className="p-6">
              <ESGQuestionnaire framework="BRSR" section="social" isEditing={isEditing} filterPrinciples={["P_OHS"]} />
            </Card>
          </TabsContent>

          <TabsContent value="labor-hr">
            <Card className="p-4 bg-blue-50/50 border-blue-100 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800">
                  <strong>Labor Practices & Human Rights:</strong> Covers human rights focal point, grievance mechanisms, discrimination prevention, due diligence, and wage distribution.
                </p>
              </div>
            </Card>
            <Card className="p-6">
              <ESGQuestionnaire framework="BRSR" section="social" isEditing={isEditing} filterPrinciples={["P_LABOR_HR"]} />
            </Card>
          </TabsContent>

          <TabsContent value="csr">
            <Card className="p-4 bg-blue-50/50 border-blue-100 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800">
                  <strong>Community & Inclusive Growth (CSR):</strong> Covers CSR projects, Social Impact Assessments (SIA), MSME/local sourcing, beneficiaries, and Rehabilitation & Resettlement (R&R) projects.
                </p>
              </div>
            </Card>
            <Card className="p-6">
              <ESGQuestionnaire framework="BRSR" section="social" isEditing={isEditing} filterPrinciples={["P_CSR"]} />
            </Card>
          </TabsContent>
        </Tabs>
      );
    }
    
    // GRI Framework - uses GRIQuestionnaire component
    if (framework === 'GRI') {
      return <GRIQuestionnaire section="social" isEditing={isEditing} />;
    }
    
    return <Card className="p-6"><p className="text-sm text-text-muted">{framework} framework content coming soon.</p></Card>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <Users2 className="w-5 h-5 text-blue-600" />
          </div>
          <h1 className="text-2xl font-heading font-bold text-text-primary">Social</h1>
        </div>
      </div>
      <FrameworkTabs moduleType="social" recordsContent={<SocialRecordsContent />} renderFrameworkContent={renderFrameworkContent} />
    </div>
  );
}
