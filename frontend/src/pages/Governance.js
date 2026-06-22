import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Shield, Edit2, Eye, Info, Save, Loader2, Users, UserCog } from 'lucide-react';
import ESGQuestionnaire from '../components/ESGQuestionnaire';
import ESGRecords from '../components/ESGRecords';
import FrameworkTabs from '../components/FrameworkTabs';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function Governance() {
  const { token } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [bodKmpData, setBodKmpData] = useState({});
  const [saving, setSaving] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchBodKmpData();
  }, []);

  const fetchBodKmpData = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/governance/bod-kmp`, { headers });
      setBodKmpData(res.data.data || {});
    } catch (error) {
      console.error('Failed to fetch BOD/KMP data:', error);
    }
  };

  const saveBodKmpData = async () => {
    setSaving(true);
    try {
      await axios.post(`${BACKEND_URL}/api/governance/bod-kmp`, { data: bodKmpData }, { headers });
      toast.success('BOD & KMP data saved');
    } catch (error) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field, value) => {
    setBodKmpData(prev => ({ ...prev, [field]: value }));
  };

  // BOD & KMP Section Component
  const BodKmpSection = () => (
    <Card className="p-6 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-text-primary">Board of Directors & Key Management Personnel</h3>
        <Button size="sm" onClick={saveBodKmpData} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save
        </Button>
      </div>
      
      <div className="grid grid-cols-2 gap-6">
        {/* BOD Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-violet-600" />
            <h4 className="font-medium text-sm">Board of Directors (BOD)</h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Total Board of Directors</Label>
              <Input type="number" value={bodKmpData.bod_total || ''} onChange={(e) => updateField('bod_total', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Female Board of Directors</Label>
              <Input type="number" value={bodKmpData.bod_female || ''} onChange={(e) => updateField('bod_female', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Median Remuneration - Male Directors (INR)</Label>
              <Input type="number" value={bodKmpData.bod_median_male || ''} onChange={(e) => updateField('bod_median_male', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Median Remuneration - Female Directors (INR)</Label>
              <Input type="number" value={bodKmpData.bod_median_female || ''} onChange={(e) => updateField('bod_median_female', e.target.value)} />
            </div>
          </div>
        </div>

        {/* KMP Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <UserCog className="w-4 h-4 text-violet-600" />
            <h4 className="font-medium text-sm">Key Management Personnel (KMP)</h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Total Key Management Personnel</Label>
              <Input type="number" value={bodKmpData.kmp_total || ''} onChange={(e) => updateField('kmp_total', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Female Key Management Personnel</Label>
              <Input type="number" value={bodKmpData.kmp_female || ''} onChange={(e) => updateField('kmp_female', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Median Remuneration - Male KMP (INR)</Label>
              <Input type="number" value={bodKmpData.kmp_median_male || ''} onChange={(e) => updateField('kmp_median_male', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Median Remuneration - Female KMP (INR)</Label>
              <Input type="number" value={bodKmpData.kmp_median_female || ''} onChange={(e) => updateField('kmp_median_female', e.target.value)} />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );

  // Records tab content - now uses ESGRecords component
  const RecordsContent = () => (
    <ESGRecords section="governance" framework="BRSR" />
  );

  // Framework content renderer
  const renderFrameworkContent = (framework) => {
    if (framework === 'BRSR') {
      return (
        <>
          {/* BOD & KMP Section at top */}
          <BodKmpSection />

          {/* Info Card */}
          <Card className="p-4 bg-violet-50/50 border-violet-100 mb-4">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-violet-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-violet-800">
                <strong>Governance Principles:</strong> Covers P1 (Ethics & Transparency), P2 (Sustainable Products), 
                P7 (Policy Advocacy), and P9 (Consumer Value). This section includes business ethics, anti-corruption policies, 
                stakeholder engagement, and responsible product practices.
              </p>
            </div>
          </Card>

          {/* ESG Questionnaire */}
          <Card className="p-6">
            <ESGQuestionnaire 
              framework="BRSR" 
              section="governance" 
              isEditing={isEditing} 
            />
          </Card>
        </>
      );
    }
    
    return (
      <Card className="p-6">
        <p className="text-sm text-text-muted">{framework} framework content coming soon.</p>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
              <Shield className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-2xl font-heading font-bold text-text-primary">Governance</h1>
              <p className="text-text-muted text-sm">Governance Disclosures & Records</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant={isEditing ? "default" : "outline"}
            onClick={() => setIsEditing(!isEditing)}
            className={isEditing ? "bg-violet-600 hover:bg-violet-700" : ""}
            data-testid="governance-edit-toggle"
          >
            {isEditing ? (
              <><Eye className="w-4 h-4 mr-2" /> View Mode</>
            ) : (
              <><Edit2 className="w-4 h-4 mr-2" /> Edit Mode</>
            )}
          </Button>
        </div>
      </div>

      {/* Framework Tabs */}
      <FrameworkTabs
        moduleType="governance"
        recordsContent={<RecordsContent />}
        renderFrameworkContent={renderFrameworkContent}
      />
    </div>
  );
}
