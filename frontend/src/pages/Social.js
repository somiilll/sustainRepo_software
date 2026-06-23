import React, { useState } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Users2, Edit2, Eye, Info } from 'lucide-react';
import ESGQuestionnaire from '../components/ESGQuestionnaire';
import ESGRecords from '../components/ESGRecords';
import HRWorkforce from './HRWorkforce';
import FrameworkTabs from '../components/FrameworkTabs';

export default function Social() {
  const [isEditing, setIsEditing] = useState(false);

  const RecordsContent = () => (
    <ESGRecords section="social" framework="BRSR" />
  );

  const renderFrameworkContent = (framework) => {
    if (framework === 'BRSR') {
      return (
        <Tabs defaultValue="hr-workforce" className="w-full">
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="hr-workforce">HR & Workforce</TabsTrigger>
            <TabsTrigger value="stakeholder">Stakeholder</TabsTrigger>
            <TabsTrigger value="diversity">Diversity, Accessibility & Inclusion</TabsTrigger>
            <TabsTrigger value="ohs">Occupational Health, Safety & Well-being</TabsTrigger>
            <TabsTrigger value="labor-hr">Labor Practices & Human Rights</TabsTrigger>
            <TabsTrigger value="csr">Community & Inclusive Growth (CSR)</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
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
                  <strong>Diversity, Accessibility & Inclusion:</strong> Covers equal opportunity policies, accessibility for differently abled employees, workers and visitors as per the Rights of Persons with Disabilities Act, 2016.
                </p>
              </div>
            </Card>
            <Card className="p-6">
              <ESGQuestionnaire framework="BRSR" section="social" isEditing={isEditing} filterPrinciples={["P_DIVERSITY"]} />
            </Card>
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
          
          <TabsContent value="general">
            <Card className="p-4 bg-blue-50/50 border-blue-100 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800">
                  <strong>Social Principles:</strong> Covers P3 (Employee Wellbeing), P5 (Human Rights), and P8 (Inclusive Growth).
                </p>
              </div>
            </Card>
            <Card className="p-6">
              <ESGQuestionnaire framework="BRSR" section="social" isEditing={isEditing} excludePrinciples={["P4", "P_DIVERSITY", "P_OHS", "P_CSR", "P_HR_EXCLUDE", "P_LABOR_HR"]} />
            </Card>
          </TabsContent>
        </Tabs>
      );
    }
    return <Card className="p-6"><p className="text-sm text-text-muted">{framework} framework content coming soon.</p></Card>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <Users2 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold text-text-primary">Social</h1>
            <p className="text-text-muted text-sm">Social Disclosures & Records</p>
          </div>
        </div>
        <Button
          variant={isEditing ? "default" : "outline"}
          onClick={() => setIsEditing(!isEditing)}
          className={isEditing ? "bg-blue-600 hover:bg-blue-700" : ""}
          data-testid="social-edit-toggle"
        >
          {isEditing ? <><Eye className="w-4 h-4 mr-2" /> View Mode</> : <><Edit2 className="w-4 h-4 mr-2" /> Edit Mode</>}
        </Button>
      </div>
      <FrameworkTabs moduleType="social" recordsContent={<RecordsContent />} renderFrameworkContent={renderFrameworkContent} />
    </div>
  );
}
