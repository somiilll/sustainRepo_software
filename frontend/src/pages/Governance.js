import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Shield, Edit2, Eye, Info, Save, Loader2 } from 'lucide-react';
import ESGQuestionnaire from '../components/ESGQuestionnaire';
import ESGRecords from '../components/ESGRecords';
import FrameworkTabs from '../components/FrameworkTabs';
import GRIQuestionnaire from '../components/GRIQuestionnaire';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function Governance() {
  const { token } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [bodKmpData, setBodKmpData] = useState({});
  const [saving, setSaving] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => { fetchBodKmpData(); }, []);

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

  // BOD & KMP Ledger Table Component
  const BodKmpLedger = () => (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" onClick={saveBodKmpData} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save
        </Button>
      </div>

      {/* BOD Table */}
      <Card className="p-4">
        <h4 className="font-medium text-sm mb-3">Board of Directors (BOD)</h4>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Total Board of Directors</TableCell>
              <TableCell><Input type="number" className="w-32" value={bodKmpData.bod_total || ''} onChange={(e) => updateField('bod_total', e.target.value)} /></TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Female Board of Directors</TableCell>
              <TableCell><Input type="number" className="w-32" value={bodKmpData.bod_female || ''} onChange={(e) => updateField('bod_female', e.target.value)} /></TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Median Remuneration/Salary/Wages - Male Directors (INR)</TableCell>
              <TableCell><Input type="number" className="w-32" value={bodKmpData.bod_median_male || ''} onChange={(e) => updateField('bod_median_male', e.target.value)} /></TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Median Remuneration/Salary/Wages - Female Directors (INR)</TableCell>
              <TableCell><Input type="number" className="w-32" value={bodKmpData.bod_median_female || ''} onChange={(e) => updateField('bod_median_female', e.target.value)} /></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>

      {/* KMP Table */}
      <Card className="p-4">
        <h4 className="font-medium text-sm mb-3">Key Management Personnel (KMP)</h4>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Total Key Management Personnel</TableCell>
              <TableCell><Input type="number" className="w-32" value={bodKmpData.kmp_total || ''} onChange={(e) => updateField('kmp_total', e.target.value)} /></TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Female Key Management Personnel</TableCell>
              <TableCell><Input type="number" className="w-32" value={bodKmpData.kmp_female || ''} onChange={(e) => updateField('kmp_female', e.target.value)} /></TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Median Remuneration/Salary/Wages - Male KMP (INR)</TableCell>
              <TableCell><Input type="number" className="w-32" value={bodKmpData.kmp_median_male || ''} onChange={(e) => updateField('kmp_median_male', e.target.value)} /></TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Median Remuneration/Salary/Wages - Female KMP (INR)</TableCell>
              <TableCell><Input type="number" className="w-32" value={bodKmpData.kmp_median_female || ''} onChange={(e) => updateField('kmp_median_female', e.target.value)} /></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>
    </div>
  );

  const RecordsContent = () => <ESGRecords section="governance" framework="BRSR" />;

  const renderFrameworkContent = (framework) => {
    if (framework === 'BRSR') {
      return (
        <Tabs defaultValue="bod-kmp" className="w-full">
          <TabsList className="mb-4 w-full overflow-x-auto whitespace-nowrap flex-nowrap justify-start">
            <TabsTrigger value="bod-kmp">BoD and KMP</TabsTrigger>
            <TabsTrigger value="policies">Policies, Commitments & Oversight</TabsTrigger>
            <TabsTrigger value="ethics">Ethics</TabsTrigger>
            <TabsTrigger value="compliance">Regulatory Compliance & Fines</TabsTrigger>
            <TabsTrigger value="cyber">Cyber Security & Data Privacy</TabsTrigger>
            <TabsTrigger value="advocacy">Public Policy & Advocacy</TabsTrigger>
            <TabsTrigger value="value-chain">Value Chain Governance</TabsTrigger>
            <TabsTrigger value="supply-chain">Sustainable Procurement & Supply Chain</TabsTrigger>
            <TabsTrigger value="consumer">Consumer Value & Education</TabsTrigger>
          </TabsList>
          
          <TabsContent value="bod-kmp">
            <BodKmpLedger />
          </TabsContent>

          <TabsContent value="policies">
            <Card className="p-4 bg-violet-50/50 border-violet-100 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-violet-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-violet-800">
                  <strong>Policies, Commitments & Oversight:</strong> Covers NGRBC policy coverage, board approvals, sustainability committees, codes/certifications, goals & targets, and external assessments.
                </p>
              </div>
            </Card>
            <Card className="p-6">
              <ESGQuestionnaire framework="BRSR" section="governance" isEditing={isEditing} filterPrinciples={["P_POLICIES"]} />
            </Card>
          </TabsContent>

          <TabsContent value="ethics">
            <Card className="p-4 bg-violet-50/50 border-violet-100 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-violet-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-violet-800">
                  <strong>Ethics:</strong> Covers anti-corruption/anti-bribery policies, corrective actions on corruption and fines, and board conflict of interest management.
                </p>
              </div>
            </Card>
            <Card className="p-6">
              <ESGQuestionnaire framework="BRSR" section="governance" isEditing={isEditing} filterPrinciples={["P_ETHICS"]} />
            </Card>
          </TabsContent>

          <TabsContent value="compliance">
            <Card className="p-4 bg-violet-50/50 border-violet-100 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-violet-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-violet-800">
                  <strong>Regulatory Compliance & Fines:</strong> Covers statutory compliance, fines/penalties/settlements, and anti-competitive conduct corrective actions.
                </p>
              </div>
            </Card>
            <Card className="p-6">
              <ESGQuestionnaire framework="BRSR" section="governance" isEditing={isEditing} filterPrinciples={["P_COMPLIANCE"]} />
            </Card>
          </TabsContent>

          <TabsContent value="cyber">
            <Card className="p-4 bg-violet-50/50 border-violet-100 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-violet-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-violet-800">
                  <strong>Cyber Security & Data Privacy:</strong> Covers cyber security framework/policy and corrective actions on data privacy issues.
                </p>
              </div>
            </Card>
            <Card className="p-6">
              <ESGQuestionnaire framework="BRSR" section="governance" isEditing={isEditing} filterPrinciples={["P_CYBER"]} />
            </Card>
          </TabsContent>

          <TabsContent value="advocacy">
            <Card className="p-4 bg-violet-50/50 border-violet-100 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-violet-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-violet-800">
                  <strong>Public Policy & Advocacy:</strong> Covers trade/industry chamber affiliations, memberships, and public policy positions.
                </p>
              </div>
            </Card>
            <Card className="p-6">
              <ESGQuestionnaire framework="BRSR" section="governance" isEditing={isEditing} filterPrinciples={["P_ADVOCACY"]} />
            </Card>
          </TabsContent>

          <TabsContent value="value-chain">
            <Card className="p-4 bg-violet-50/50 border-violet-100 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-violet-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-violet-800">
                  <strong>Value Chain Governance:</strong> Covers value chain policy extension, openness of business, NGRBC awareness programs, accounts payable, assessments, and statutory dues compliance.
                </p>
              </div>
            </Card>
            <Card className="p-6">
              <ESGQuestionnaire framework="BRSR" section="governance" isEditing={isEditing} filterPrinciples={["P_VALUE_CHAIN"]} />
            </Card>
          </TabsContent>

          <TabsContent value="supply-chain">
            <Card className="p-4 bg-violet-50/50 border-violet-100 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-violet-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-violet-800">
                  <strong>Sustainable Procurement & Supply Chain:</strong> Covers sustainable sourcing procedures and preferential procurement policies for marginalized groups.
                </p>
              </div>
            </Card>
            <Card className="p-6">
              <ESGQuestionnaire framework="BRSR" section="governance" isEditing={isEditing} filterPrinciples={["P_SUPPLY_CHAIN"]} />
            </Card>
          </TabsContent>

          <TabsContent value="consumer">
            <Card className="p-4 bg-violet-50/50 border-violet-100 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-violet-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-violet-800">
                  <strong>Consumer Value & Education:</strong> Covers product information disclosure, consumer satisfaction surveys, safe usage education, and service disruption mechanisms.
                </p>
              </div>
            </Card>
            <Card className="p-6">
              <ESGQuestionnaire framework="BRSR" section="governance" isEditing={isEditing} filterPrinciples={["P_CONSUMER"]} />
            </Card>
          </TabsContent>
        </Tabs>
      );
    }
    
    // GRI Framework - uses GRIQuestionnaire component
    if (framework === 'GRI') {
      return <GRIQuestionnaire section="governance" isEditing={isEditing} />;
    }
    
    return <Card className="p-6"><p className="text-sm text-text-muted">{framework} framework content coming soon.</p></Card>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
            <Shield className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold text-text-primary">Governance</h1>
            <p className="text-text-muted text-sm">Governance Disclosures & Records</p>
          </div>
        </div>
        <Button
          variant={isEditing ? "default" : "outline"}
          onClick={() => setIsEditing(!isEditing)}
          className={isEditing ? "bg-violet-600 hover:bg-violet-700" : ""}
          data-testid="governance-edit-toggle"
        >
          {isEditing ? <><Eye className="w-4 h-4 mr-2" /> View Mode</> : <><Edit2 className="w-4 h-4 mr-2" /> Edit Mode</>}
        </Button>
      </div>
      <FrameworkTabs moduleType="governance" recordsContent={<RecordsContent />} renderFrameworkContent={renderFrameworkContent} />
    </div>
  );
}
