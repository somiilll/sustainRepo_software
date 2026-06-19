import React, { useState } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Sprout, Edit2, Eye, Info, Database } from 'lucide-react';
import ESGQuestionnaire from '../components/ESGQuestionnaire';
import FrameworkTabs from '../components/FrameworkTabs';
import ESGRecords from '../components/ESGRecords';

export default function Environment() {
  const [isEditing, setIsEditing] = useState(false);

  // Records tab content - ESG Records module
  const RecordsContent = () => (
    <ESGRecords section="environment" framework="BRSR" />
  );

  // Framework content renderer
  const renderFrameworkContent = (framework) => {
    if (framework === 'BRSR') {
      return (
        <>
          {/* Info Card */}
          <Card className="p-4 bg-emerald-50/50 border-emerald-100 mb-4">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-emerald-800">
                <strong>Principle 6 (P6):</strong> Businesses should respect and make efforts to protect and restore the environment. 
                This section covers energy consumption, water management, air emissions, waste management, biodiversity, and environmental compliance.
              </p>
            </div>
          </Card>

          {/* ESG Questionnaire */}
          <Card className="p-6">
            <ESGQuestionnaire 
              framework="BRSR" 
              section="environment" 
              isEditing={isEditing} 
            />
          </Card>
        </>
      );
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
