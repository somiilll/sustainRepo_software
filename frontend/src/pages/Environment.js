import React from 'react';
import { Card } from '../components/ui/card';
import { Sprout, Construction } from 'lucide-react';

export default function Environment() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-text-primary">Environment</h1>
          <p className="text-text-muted mt-1">Environmental management and sustainability tracking</p>
        </div>
      </div>

      <Card className="p-12 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
            <Sprout className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-semibold text-text-primary">Environment Module</h2>
          <div className="flex items-center gap-2 text-amber-600">
            <Construction className="w-5 h-5" />
            <span className="text-sm font-medium">Coming Soon</span>
          </div>
          <p className="text-text-muted max-w-md">
            This module will include environmental impact tracking, biodiversity management, 
            water stewardship, waste management, and other environmental sustainability features.
          </p>
        </div>
      </Card>
    </div>
  );
}
