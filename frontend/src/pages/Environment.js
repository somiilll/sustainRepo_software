import React, { useState } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Sprout, Edit2, Eye, Info, Database } from 'lucide-react';
import ESGQuestionnaire from '../components/ESGQuestionnaire';
import FrameworkTabs from '../components/FrameworkTabs';
import ESGRecordsModule from '../components/ESGRecordsModule';
import GRIQuestionnaire from '../components/GRIQuestionnaire';

export default function Environment() {
  const [isEditing, setIsEditing] = useState(false);

  // Records tab content - ESG Records Module (with Tracker, Data Entry, Targets, Add)
  const RecordsContent = () => (
    <ESGRecordsModule section="environment" />
  );

  // Framework content renderer
  const renderFrameworkContent = (framework) => {
    if (framework === 'BRSR') {
      return (
        <Tabs defaultValue="lifecycle" className="w-full">
          <TabsList className="mb-4 w-full overflow-x-auto whitespace-nowrap flex-nowrap justify-start">
            <TabsTrigger value="lifecycle">Product Lifecycle & Circularity</TabsTrigger>
            <TabsTrigger value="impact">Impact Assessments & Projects</TabsTrigger>
            <TabsTrigger value="env-mgmt">Environmental Management & Value Chain</TabsTrigger>
            <TabsTrigger value="assurance">Assurance</TabsTrigger>
          </TabsList>

          <TabsContent value="lifecycle">
            <Card className="p-4 bg-emerald-50/50 border-emerald-100 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-emerald-800">
                  <strong>Product Lifecycle & Circularity:</strong> Covers Life Cycle Assessments (LCA), Extended Producer Responsibility (EPR), and product/packaging reclamation processes.
                </p>
              </div>
            </Card>
            <Card className="p-6">
              <ESGQuestionnaire framework="BRSR" section="environment" isEditing={isEditing} filterPrinciples={["P_LIFECYCLE"]} />
            </Card>
          </TabsContent>

          <TabsContent value="impact">
            <Card className="p-4 bg-emerald-50/50 border-emerald-100 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-emerald-800">
                  <strong>Impact Assessments & Projects:</strong> Covers Environmental Impact Assessments (EIA), Clean Development Mechanism (CDM) projects, and environmental mitigation investments.
                </p>
              </div>
            </Card>
            <Card className="p-6">
              <ESGQuestionnaire framework="BRSR" section="environment" isEditing={isEditing} filterPrinciples={["P_IMPACT"]} />
            </Card>
          </TabsContent>

          <TabsContent value="env-mgmt">
            <Card className="p-4 bg-emerald-50/50 border-emerald-100 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-emerald-800">
                  <strong>Environmental Management & Value Chain:</strong> Covers Zero Liquid Discharge, PAT Scheme compliance, business continuity, and value chain environmental assessments.
                </p>
              </div>
            </Card>
            <Card className="p-6">
              <ESGQuestionnaire framework="BRSR" section="environment" isEditing={isEditing} filterPrinciples={["P_ENV_MGMT"]} />
            </Card>
          </TabsContent>

          <TabsContent value="assurance">
            <Card className="p-4 bg-emerald-50/50 border-emerald-100 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-emerald-800">
                  <strong>Assurance:</strong> Track external audit status for environmental data including energy, water, air emissions, GHG emissions, and waste management.
                </p>
              </div>
            </Card>
            <Card className="p-6">
              <ESGQuestionnaire framework="BRSR" section="environment" isEditing={isEditing} filterPrinciples={["P_ASSURANCE"]} />
            </Card>
          </TabsContent>
        </Tabs>
      );
    }
    
    // GRI Framework - uses GRIQuestionnaire component
    if (framework === 'GRI') {
      return <GRIQuestionnaire section="environment" isEditing={isEditing} />;
    }
    
    // Placeholder for future frameworks
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
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Sprout className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-2xl font-heading font-bold text-text-primary">Environment</h1>
              <p className="text-text-muted text-sm">Environmental Disclosures & Records</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant={isEditing ? "default" : "outline"}
            onClick={() => setIsEditing(!isEditing)}
            className={isEditing ? "bg-emerald-600 hover:bg-emerald-700" : ""}
            data-testid="environment-edit-toggle"
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
        moduleType="environment"
        recordsContent={<RecordsContent />}
        renderFrameworkContent={renderFrameworkContent}
      />
    </div>
  );
}
