import React from 'react';
import { Card } from '../components/ui/card';
import { Users2, Construction } from 'lucide-react';

export default function Social() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-text-primary">Social</h1>
          <p className="text-text-muted mt-1">Social responsibility and stakeholder engagement</p>
        </div>
      </div>

      <Card className="p-12 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
            <Users2 className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-semibold text-text-primary">Social Module</h2>
          <div className="flex items-center gap-2 text-amber-600">
            <Construction className="w-5 h-5" />
            <span className="text-sm font-medium">Coming Soon</span>
          </div>
          <p className="text-text-muted max-w-md">
            This module will include labor practices, human rights, community engagement, 
            diversity & inclusion metrics, health & safety, and other social sustainability features.
          </p>
        </div>
      </Card>
    </div>
  );
}
