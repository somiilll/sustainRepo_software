/**
 * Reporting Module Page
 * 
 * Contains framework-specific reporting modules:
 * - BRSR
 * - GRI
 * - (Future: CSRD, CDP, SASB, etc.)
 * 
 * Each framework has its own tracking for disclosures.
 * Access: Users with enabled_frameworks
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Loader2, FileText, BookOpen, ScrollText } from 'lucide-react';
import BRSRModule from '../components/BRSRModule';
import GRIModule from '../components/GRIModule';
import { ModulePageHeader } from '../components/ModulePageHeader';

const API = process.env.REACT_APP_BACKEND_URL;

// Framework metadata
const FRAMEWORK_META = {
  BRSR: { 
    label: 'BRSR', 
    icon: ScrollText, 
    description: 'Business Responsibility & Sustainability Reporting',
    color: 'bg-blue-100 text-blue-700'
  },
  GRI: { 
    label: 'GRI', 
    icon: BookOpen, 
    description: 'Global Reporting Initiative Standards',
    color: 'bg-green-100 text-green-700'
  },
  CSRD: { 
    label: 'CSRD', 
    icon: FileText, 
    description: 'Corporate Sustainability Reporting Directive',
    color: 'bg-purple-100 text-purple-700'
  },
  CDP: { 
    label: 'CDP', 
    icon: FileText, 
    description: 'Carbon Disclosure Project',
    color: 'bg-orange-100 text-orange-700'
  },
};

export default function Reporting() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [enabledFrameworks, setEnabledFrameworks] = useState([]);
  const [activeFramework, setActiveFramework] = useState(null);

  // Fetch enabled frameworks
  useEffect(() => {
    const fetchFrameworks = async () => {
      try {
        const res = await axios.get(`${API}/api/organizations/my`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        const frameworks = res.data.esg_frameworks_enabled || [];
        setEnabledFrameworks(frameworks);
        
        // Set first framework as active
        if (frameworks.length > 0) {
          setActiveFramework(frameworks[0]);
        }
      } catch (error) {
        console.error('Failed to fetch frameworks:', error);
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchFrameworks();
    }
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (enabledFrameworks.length === 0) {
    return (
      <div className="space-y-7">
        <ModulePageHeader title="Reporting" icon={FileText} iconClassName="border-teal-200 bg-teal-50 text-teal-700" testId="reporting" />
        
        <Card className="p-12 text-center">
          <FileText className="w-16 h-16 text-stone-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-text-primary mb-2">
            No Frameworks Enabled
          </h3>
          <p className="text-text-muted max-w-md mx-auto">
            Contact your administrator to enable reporting frameworks like BRSR, GRI, or CSRD for your organization.
          </p>
        </Card>
      </div>
    );
  }

  // Render framework content
  const renderFrameworkContent = (framework) => {
    switch (framework) {
      case 'BRSR':
        return <BRSRModule />;
      case 'GRI':
        return <GRIModule />;
      default:
        return (
          <Card className="p-12 text-center">
            <FileText className="w-16 h-16 text-stone-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-text-primary mb-2">
              {framework} Module
            </h3>
            <p className="text-text-muted">
              This framework module is coming soon.
            </p>
          </Card>
        );
    }
  };

  return (
    <div className="space-y-7">
      <ModulePageHeader
        title="Reporting"
        icon={FileText}
        iconClassName="border-teal-200 bg-teal-50 text-teal-700"
        testId="reporting"
        aside={<div className="flex items-center gap-2">
          {enabledFrameworks.map(fw => {
            const meta = FRAMEWORK_META[fw] || {};
            return (
              <Badge key={fw} className={meta.color || 'bg-stone-100 text-stone-700'}>
                {meta.label || fw}
              </Badge>
            );
          })}
        </div>}
      />

      {/* Framework Tabs */}
      <Tabs value={activeFramework} onValueChange={setActiveFramework}>
        <TabsList className="bg-white border">
          {enabledFrameworks.map(fw => {
            const meta = FRAMEWORK_META[fw] || {};
            const Icon = meta.icon || FileText;
            return (
              <TabsTrigger 
                key={fw} 
                value={fw}
                className="gap-2 data-[state=active]:bg-emerald-50"
                data-testid={`reporting-tab-${fw.toLowerCase()}`}
              >
                <Icon className="w-4 h-4" />
                {meta.label || fw}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Framework Content */}
        {enabledFrameworks.map(fw => (
          <TabsContent key={fw} value={fw} className="mt-6">
            {renderFrameworkContent(fw)}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
