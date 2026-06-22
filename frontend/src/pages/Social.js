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
          <TabsList className="mb-4">
            <TabsTrigger value="hr-workforce">HR & Workforce</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
          </TabsList>
          
          <TabsContent value="hr-workforce">
            <HRWorkforce embedded={true} />
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
              <ESGQuestionnaire framework="BRSR" section="social" isEditing={isEditing} />
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
