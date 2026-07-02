import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Badge } from './ui/badge';
import { Loader2, FileText, ClipboardList, BarChart3 } from 'lucide-react';
import ESGTrackingTab from './ESGTrackingTab';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Framework metadata for UI display
const FRAMEWORK_META = {
  BRSR: { label: 'BRSR', icon: ClipboardList, color: 'emerald' },
  GRI: { label: 'GRI', icon: FileText, color: 'blue' },
  SBTi: { label: 'SBTi', icon: FileText, color: 'violet' },
  CDP: { label: 'CDP', icon: FileText, color: 'orange' },
  TCFD: { label: 'TCFD', icon: FileText, color: 'cyan' },
};

/**
 * Reusable FrameworkTabs component for ESG modules
 * 
 * @param {string} moduleType - 'environment' | 'social' | 'governance'
 * @param {React.ReactNode} recordsContent - Content for Records tab
 * @param {function} renderFrameworkContent - Function to render framework-specific content (framework) => ReactNode
 */
export default function FrameworkTabs({ 
  moduleType, 
  recordsContent, 
  renderFrameworkContent 
}) {
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState('records');
  const [enabledFrameworks, setEnabledFrameworks] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Check if user is admin
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  useEffect(() => {
    fetchEnabledFrameworks();
  }, []);

  const fetchEnabledFrameworks = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/organizations/my/framework-details`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEnabledFrameworks(res.data.enabled_frameworks || []);
    } catch (error) {
      console.error('Failed to fetch enabled frameworks:', error);
      setEnabledFrameworks([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  // Build tabs: Records + Tracking (admin only) + enabled frameworks
  const tabs = [
    { key: 'records', label: 'Records', icon: FileText },
    // Add Tracking tab for admins only
    ...(isAdmin ? [{ key: 'tracking', label: 'Tracking', icon: BarChart3, isTracking: true }] : []),
    ...enabledFrameworks.map(fw => ({
      key: fw.toLowerCase(),
      label: FRAMEWORK_META[fw]?.label || fw,
      icon: FRAMEWORK_META[fw]?.icon || FileText,
      framework: fw
    }))
  ];

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="bg-stone-100 p-1 rounded-lg mb-6">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <TabsTrigger
              key={tab.key}
              value={tab.key}
              className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.framework && (
                <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0">
                  Framework
                </Badge>
              )}
              {tab.isTracking && (
                <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0 border-emerald-300 text-emerald-600">
                  Admin
                </Badge>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {/* Records Tab */}
      <TabsContent value="records" className="mt-0">
        {recordsContent}
      </TabsContent>
      
      {/* Tracking Tab (Admin Only) */}
      {isAdmin && (
        <TabsContent value="tracking" className="mt-0">
          <ESGTrackingTab domain={moduleType} />
        </TabsContent>
      )}

      {/* Framework Tabs */}
      {enabledFrameworks.map(fw => (
        <TabsContent key={fw.toLowerCase()} value={fw.toLowerCase()} className="mt-0">
          {renderFrameworkContent(fw)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
