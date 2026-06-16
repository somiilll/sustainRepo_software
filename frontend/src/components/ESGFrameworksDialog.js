import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { toast } from 'sonner';
import { Loader2, FileText, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ESGFrameworksDialog({ open, onOpenChange, organization, onUpdate }) {
  const { getAuthHeader } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [frameworksData, setFrameworksData] = useState(null);
  const [selectedFrameworks, setSelectedFrameworks] = useState([]);

  useEffect(() => {
    if (open && organization) {
      fetchFrameworks();
    }
  }, [open, organization]);

  const fetchFrameworks = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `${API}/super-admin/organizations/${organization.organization_id || organization.id}/esg-frameworks`,
        { headers: getAuthHeader() }
      );
      setFrameworksData(res.data);
      setSelectedFrameworks(res.data.esg_frameworks_enabled || []);
    } catch (error) {
      console.error('Failed to fetch ESG frameworks:', error);
      toast.error('Failed to load ESG frameworks');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFramework = (frameworkId) => {
    setSelectedFrameworks(prev => {
      if (prev.includes(frameworkId)) {
        return prev.filter(f => f !== frameworkId);
      } else {
        return [...prev, frameworkId];
      }
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(
        `${API}/super-admin/organizations/${organization.organization_id || organization.id}/esg-frameworks`,
        selectedFrameworks,
        { headers: getAuthHeader() }
      );
      toast.success('ESG frameworks updated successfully');
      if (onUpdate) onUpdate();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to update ESG frameworks:', error);
      toast.error(error.response?.data?.detail || 'Failed to update ESG frameworks');
    } finally {
      setSaving(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'available':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'coming_soon':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'deprecated':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'available':
        return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Available</Badge>;
      case 'coming_soon':
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Coming Soon</Badge>;
      case 'deprecated':
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Deprecated</Badge>;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            ESG Frameworks
          </DialogTitle>
          <DialogDescription>
            Select the ESG reporting frameworks enabled for{' '}
            <span className="font-semibold text-text-primary">
              {organization?.organization_name || organization?.name}
            </span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : frameworksData ? (
          <div className="space-y-4 py-4">
            <p className="text-sm text-text-muted">
              Enable the frameworks that this organization will use for ESG reporting. 
              Only available frameworks can be enabled.
            </p>
            
            <div className="space-y-3">
              {frameworksData.available_frameworks.map((framework) => {
                const isEnabled = selectedFrameworks.includes(framework.id);
                const isAvailable = framework.status === 'available';
                
                return (
                  <div
                    key={framework.id}
                    className={`p-4 border rounded-lg transition-all ${
                      isEnabled 
                        ? 'border-primary bg-primary/5' 
                        : 'border-stone-200 bg-white'
                    } ${!isAvailable ? 'opacity-60' : 'hover:border-primary/50'}`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={`framework-${framework.id}`}
                        checked={isEnabled}
                        onCheckedChange={() => handleToggleFramework(framework.id)}
                        disabled={!isAvailable}
                        className="mt-1"
                        data-testid={`framework-checkbox-${framework.id}`}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <label
                            htmlFor={`framework-${framework.id}`}
                            className={`font-semibold cursor-pointer ${
                              !isAvailable ? 'text-text-muted' : 'text-text-primary'
                            }`}
                          >
                            {framework.name}
                          </label>
                          {getStatusBadge(framework.status)}
                        </div>
                        <p className="text-sm text-text-muted mb-2">
                          {framework.description}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-text-muted">
                          <span className="flex items-center gap-1">
                            {getStatusIcon(framework.status)}
                            {framework.status === 'available' ? 'Ready to use' : 
                             framework.status === 'coming_soon' ? 'In development' : 'No longer supported'}
                          </span>
                          <span>Version: {framework.version}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedFrameworks.length > 0 && (
              <div className="mt-4 p-3 bg-stone-50 rounded-lg">
                <p className="text-sm font-medium text-text-primary mb-2">
                  Selected Frameworks ({selectedFrameworks.length}):
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedFrameworks.map(fwId => (
                    <Badge key={fwId} variant="outline" className="text-primary border-primary">
                      {fwId}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center text-text-muted">
            No framework data available
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || saving}
            data-testid="save-frameworks-btn"
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
