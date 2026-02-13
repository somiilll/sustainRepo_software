import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Building } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function OrganizationDetails() {
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const { getAuthHeader } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    corporate_address: '',
    logo: '',
    general_description: '',
    mission: '',
    vision: '',
    process_description: '',
    reporting_frequency: 'yearly',
    org_boundaries: '',
    base_year: new Date().getFullYear()
  });

  useEffect(() => {
    fetchOrganization();
  }, []);

  const fetchOrganization = async () => {
    try {
      const response = await axios.get(`${API}/organizations/my`, {
        headers: getAuthHeader()
      });
      setOrganization(response.data);
      setFormData({
        name: response.data.name,
        corporate_address: response.data.corporate_address,
        logo: response.data.logo || '',
        general_description: response.data.general_description || '',
        mission: response.data.mission || '',
        vision: response.data.vision || '',
        process_description: response.data.process_description || '',
        reporting_frequency: response.data.reporting_frequency || 'yearly',
        org_boundaries: response.data.org_boundaries || '',
        base_year: response.data.base_year || new Date().getFullYear()
      });
    } catch (error) {
      toast.error('Failed to load organization');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API}/organizations/my`, formData, {
        headers: getAuthHeader()
      });
      toast.success('Organization updated successfully');
      setEditing(false);
      fetchOrganization();
    } catch (error) {
      toast.error('Failed to update organization');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Organization Details</h1>
          <p className="text-text-secondary">Manage your organization information</p>
        </div>
        {!editing && (
          <Button onClick={() => setEditing(true)} className="bg-primary hover:bg-primary/90 text-white rounded-full px-6">
            Edit Details
          </Button>
        )}
      </div>

      {editing ? (
        <Card className="p-6 border border-stone-200 rounded-xl bg-white">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Organization Name (Read-only)</Label>
                <Input value={formData.name} disabled className="bg-stone-100" />
              </div>
              <div className="space-y-2">
                <Label>Corporate Address (Read-only)</Label>
                <Input value={formData.corporate_address} disabled className="bg-stone-100" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Logo URL (Read-only)</Label>
              <Input value={formData.logo} disabled className="bg-stone-100" placeholder="Set by super admin" />
              <p className="text-xs text-text-muted">Logo can only be changed by super admin</p>
            </div>

            <div className="space-y-2">
              <Label>General Description</Label>
              <textarea value={formData.general_description} onChange={(e) => setFormData({ ...formData, general_description: e.target.value })} rows={3} className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mission</Label>
                <textarea value={formData.mission} onChange={(e) => setFormData({ ...formData, mission: e.target.value })} rows={2} className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2" />
              </div>
              <div className="space-y-2">
                <Label>Vision</Label>
                <textarea value={formData.vision} onChange={(e) => setFormData({ ...formData, vision: e.target.value })} rows={2} className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Process Description</Label>
              <textarea value={formData.process_description} onChange={(e) => setFormData({ ...formData, process_description: e.target.value })} rows={3} className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2" />
            </div>

            <div className="space-y-2">
              <Label>Organizational Boundaries</Label>
              <textarea value={formData.org_boundaries} onChange={(e) => setFormData({ ...formData, org_boundaries: e.target.value })} rows={2} className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2" placeholder="Define the operational and organizational boundaries" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Reporting Frequency</Label>
                <select value={formData.reporting_frequency} onChange={(e) => setFormData({ ...formData, reporting_frequency: e.target.value })} className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3">
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Base Year</Label>
                <Input type="number" value={formData.base_year} onChange={(e) => setFormData({ ...formData, base_year: parseInt(e.target.value) })} className="bg-stone-50" />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-white">Save Changes</Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card className="p-6 border border-stone-200 rounded-xl bg-white">
          <div className="space-y-6">
            <div className="flex items-start gap-4 mb-4">
              {organization?.logo && (
                <img src={organization.logo} alt={organization.name} className="w-20 h-20 object-contain rounded-lg border border-stone-200" onError={(e) => { e.target.style.display = 'none'; }} />
              )}
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-3 rounded-lg"><Building className="w-6 h-6 text-primary" /></div>
                <div>
                  <h2 className="text-2xl font-heading font-bold text-text-primary">{organization?.name}</h2>
                  <p className="text-sm text-text-muted">{organization?.corporate_address}</p>
                </div>
              </div>
            </div>

            {organization?.general_description && (
              <div>
                <h3 className="text-sm font-medium text-text-muted mb-1">General Description</h3>
                <p className="text-text-primary">{organization.general_description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              {organization?.mission && (
                <div>
                  <h3 className="text-sm font-medium text-text-muted mb-1">Mission</h3>
                  <p className="text-text-primary">{organization.mission}</p>
                </div>
              )}
              {organization?.vision && (
                <div>
                  <h3 className="text-sm font-medium text-text-muted mb-1">Vision</h3>
                  <p className="text-text-primary">{organization.vision}</p>
                </div>
              )}
            </div>

            {organization?.process_description && (
              <div>
                <h3 className="text-sm font-medium text-text-muted mb-1">Process Description</h3>
                <p className="text-text-primary">{organization.process_description}</p>
              </div>
            )}

            {organization?.org_boundaries && (
              <div>
                <h3 className="text-sm font-medium text-text-muted mb-1">Organizational Boundaries</h3>
                <p className="text-text-primary">{organization.org_boundaries}</p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-stone-200">
              <div>
                <h3 className="text-sm font-medium text-text-muted mb-1">Reporting Frequency</h3>
                <p className="text-text-primary capitalize">{organization?.reporting_frequency}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-text-muted mb-1">Base Year</h3>
                <p className="text-text-primary">{organization?.base_year}</p>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}