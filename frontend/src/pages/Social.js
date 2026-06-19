import React, { useState } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Users2, Edit2, Eye, Info, Database } from 'lucide-react';
import ESGQuestionnaire from '../components/ESGQuestionnaire';
import FrameworkTabs from '../components/FrameworkTabs';

export default function Social() {
  const [isEditing, setIsEditing] = useState(false);

  // Records tab content
  const RecordsContent = () => (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <Database className="w-5 h-5 text-stone-500" />
        <h3 className="font-semibold text-text-primary">Social Records Ledger</h3>
      </div>
      <p className="text-sm text-text-muted">
        Social data records and ledger entries will be displayed here. 
        This includes employee data, training records, safety incidents, and community engagement metrics.
      </p>
      <div className="mt-4 p-4 bg-stone-50 rounded-lg border border-dashed border-stone-300">
        <p className="text-xs text-stone-500 text-center">Records ledger coming soon</p>
      </div>
    </Card>
  );

  // Framework content renderer
  const renderFrameworkContent = (framework) => {
    if (framework === 'BRSR') {
      return (
        <>
          {/* Info Card */}
          <Card className="p-4 bg-blue-50/50 border-blue-100 mb-4">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-800">
                <strong>Social Principles:</strong> Covers P3 (Employee Wellbeing), P5 (Human Rights), and P8 (Inclusive Growth). 
                This section includes workforce diversity, employee health & safety, human rights due diligence, 
                community engagement, and inclusive business practices.
              </p>
            </div>
          </Card>

          {/* ESG Questionnaire */}
          <Card className="p-6">
            <ESGQuestionnaire 
              framework="BRSR" 
              section="social" 
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
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Users2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-heading font-bold text-text-primary">Social</h1>
              <p className="text-text-muted text-sm">Social Disclosures & Records</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant={isEditing ? "default" : "outline"}
            onClick={() => setIsEditing(!isEditing)}
            className={isEditing ? "bg-blue-600 hover:bg-blue-700" : ""}
            data-testid="social-edit-toggle"
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
        moduleType="social"
        recordsContent={<RecordsContent />}
        renderFrameworkContent={renderFrameworkContent}
      />
    </div>
  );
}
