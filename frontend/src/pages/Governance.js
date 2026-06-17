import React from 'react';
import { Card } from '../components/ui/card';
import { Shield, Construction } from 'lucide-react';

export default function Governance() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-text-primary">Governance</h1>
          <p className="text-text-muted mt-1">Corporate governance and compliance management</p>
        </div>
      </div>

      <Card className="p-12 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center">
            <Shield className="w-8 h-8 text-violet-600" />
          </div>
          <h2 className="text-xl font-semibold text-text-primary">Governance Module</h2>
          <div className="flex items-center gap-2 text-amber-600">
            <Construction className="w-5 h-5" />
            <span className="text-sm font-medium">Coming Soon</span>
          </div>
          <p className="text-text-muted max-w-md">
            This module will include board composition, ethics & compliance, risk management, 
            transparency & disclosure, anti-corruption policies, and other governance features.
          </p>
        </div>
      </Card>
    </div>
  );
}
