import React, { useState } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Shield, Edit2, Eye } from 'lucide-react';
import ESGQuestionnaire from '../components/ESGQuestionnaire';

export default function Governance() {
  const [isEditing, setIsEditing] = useState(false);

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
              <p className="text-text-muted text-sm">BRSR Section C - Management & Process Disclosures</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">
            BRSR Framework
          </Badge>
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

      {/* Info Card */}
      <Card className="p-4 bg-violet-50/50 border-violet-100">
        <p className="text-sm text-violet-800">
          <strong>Section C:</strong> This section covers policy and management disclosures for the NGRBC Principles (P1-P9). 
          Each question applies across all nine principles relating to Ethics, Product Safety, Employee Wellbeing, 
          Stakeholder Engagement, Human Rights, Environment, Policy Advocacy, Inclusive Growth, and Customer Value.
        </p>
      </Card>

      {/* ESG Questionnaire */}
      <Card className="p-6">
        <ESGQuestionnaire 
          framework="BRSR" 
          section="governance" 
          isEditing={isEditing} 
        />
      </Card>
    </div>
  );
}
