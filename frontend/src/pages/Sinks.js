import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Plus, TreeDeciduous, Trash2, Edit2, Calendar, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Sinks() {
  const [sinks, setSinks] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSink, setEditingSink] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { getAuthHeader, user } = useAuth();

  const [formData, setFormData] = useState({
    facility_id: '',
    reporting_period: '',
    total_emissions_reduced: '',
    description: ''
  });

  useEffect(() => {
    fetchSinks();
    fetchFacilities();
  }, []);

  const fetchSinks = async () => {
    try {
      const response = await axios.get(`${API}/sinks`, {
        headers: getAuthHeader()
      });
      setSinks(response.data);
    } catch (error) {
      console.error('Error fetching sinks:', error);
      toast.error('Failed to load sinks data');
    } finally {
      setLoading(false);
    }
  };

  const fetchFacilities = async () => {
    try {
      const response = await axios.get(`${API}/facilities`, {
        headers: getAuthHeader()
      });
      setFacilities(response.data.filter(f => f.is_active !== false));
    } catch (error) {
      console.error('Error fetching facilities:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.facility_id || !formData.reporting_period || !formData.total_emissions_reduced) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        total_emissions_reduced: parseFloat(formData.total_emissions_reduced)
      };

      if (editingSink) {
        await axios.put(`${API}/sinks/${editingSink.id}`, payload, {
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }
        });
        toast.success('Sink record updated successfully');
      } else {
        await axios.post(`${API}/sinks`, payload, {
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }
        });
        toast.success('Sink record added successfully');
      }

      setDialogOpen(false);
      resetForm();
      fetchSinks();
    } catch (error) {
      console.error('Error saving sink:', error);
      toast.error(error.response?.data?.detail || 'Failed to save sink record');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (sinkId) => {
    if (!window.confirm('Are you sure you want to delete this sink record?')) return;

    try {
      await axios.delete(`${API}/sinks/${sinkId}`, {
        headers: getAuthHeader()
      });
      toast.success('Sink record deleted');
      fetchSinks();
    } catch (error) {
      console.error('Error deleting sink:', error);
      toast.error('Failed to delete sink record');
    }
  };

  const handleEdit = (sink) => {
    setEditingSink(sink);
    setFormData({
      facility_id: sink.facility_id,
      reporting_period: sink.reporting_period,
      total_emissions_reduced: sink.total_emissions_reduced.toString(),
      description: sink.description || ''
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      facility_id: '',
      reporting_period: '',
      total_emissions_reduced: '',
      description: ''
    });
    setEditingSink(null);
  };

  const getFacilityName = (facilityId) => {
    const facility = facilities.find(f => f.id === facilityId);
    return facility ? facility.name : 'Unknown Facility';
  };

  const formatPeriod = (period) => {
    try {
      const [year, month] = period.split('-');
      const date = new Date(year, parseInt(month) - 1);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    } catch {
      return period;
    }
  };

  const totalSinksReduction = sinks.reduce((sum, s) => sum + s.total_emissions_reduced, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="sinks-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Carbon Sinks</h1>
          <p className="text-text-secondary">Track emissions reduced or captured through carbon removal activities</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white" data-testid="add-sink-btn">
              <Plus className="w-4 h-4 mr-2" />
              Add Sink Record
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-xl font-heading">
                {editingSink ? 'Edit Sink Record' : 'Add New Sink Record'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="facility_id">Facility *</Label>
                <Select
                  value={formData.facility_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, facility_id: value }))}
                >
                  <SelectTrigger className="bg-stone-50">
                    <SelectValue placeholder="Select a facility" />
                  </SelectTrigger>
                  <SelectContent>
                    {facilities.map((facility) => (
                      <SelectItem key={facility.id} value={facility.id}>
                        {facility.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reporting_period">Reporting Month *</Label>
                <Input
                  id="reporting_period"
                  type="month"
                  value={formData.reporting_period}
                  onChange={(e) => setFormData(prev => ({ ...prev, reporting_period: e.target.value }))}
                  className="bg-stone-50"
                  required
                  data-testid="reporting-period-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="total_emissions_reduced">Total Emissions Reduced/Captured (tCO₂e) *</Label>
                <Input
                  id="total_emissions_reduced"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.total_emissions_reduced}
                  onChange={(e) => setFormData(prev => ({ ...prev, total_emissions_reduced: e.target.value }))}
                  placeholder="Enter amount in tCO₂e"
                  className="bg-stone-50"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="e.g., Tree plantation, Carbon capture project"
                  className="bg-stone-50"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} className="flex-1 bg-primary hover:bg-primary/90 text-white">
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    editingSink ? 'Update Record' : 'Add Record'
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Card */}
      <Card className="p-6 border-2 border-green-200 rounded-xl bg-gradient-to-br from-green-50 to-white">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-green-100 rounded-xl">
            <TreeDeciduous className="w-10 h-10 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-text-muted">Total Carbon Offset</p>
            <h2 className="text-3xl font-heading font-bold text-green-600">
              {totalSinksReduction.toFixed(2)} <span className="text-lg font-normal">tCO₂e</span>
            </h2>
            <p className="text-xs text-text-muted mt-1">{sinks.length} sink record(s)</p>
          </div>
        </div>
      </Card>

      {/* Sinks Table */}
      {sinks.length > 0 ? (
        <Card className="border border-stone-200 rounded-xl bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="sinks-table">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-text-primary">Facility</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-text-primary">Period</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-text-primary">Emissions Reduced (tCO₂e)</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-text-primary">Description</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-text-primary">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {sinks.map((sink) => (
                  <tr key={sink.id} className="hover:bg-stone-50 transition-colors" data-testid={`sink-row-${sink.id}`}>
                    <td className="px-6 py-4">
                      <p className="font-medium text-text-primary">{getFacilityName(sink.facility_id)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-text-muted" />
                        <span className="text-text-secondary">{formatPeriod(sink.reporting_period)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-lg font-semibold text-green-600">
                        {sink.total_emissions_reduced.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-text-secondary">{sink.description || '-'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEdit(sink)}
                          className="text-primary hover:text-primary/80"
                          data-testid={`edit-sink-${sink.id}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(sink.id)}
                          className="text-red-500 hover:text-red-600"
                          data-testid={`delete-sink-${sink.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="p-12 border border-stone-200 rounded-xl bg-white text-center">
          <TreeDeciduous className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-xl font-heading font-bold text-text-primary mb-2">No Sink Records</h3>
          <p className="text-text-secondary mb-4">
            Start tracking your carbon offset activities by adding sink records.
          </p>
          <Button onClick={() => setDialogOpen(true)} className="bg-primary hover:bg-primary/90 text-white">
            <Plus className="w-4 h-4 mr-2" />
            Add First Sink Record
          </Button>
        </Card>
      )}

      {/* Info Card */}
      <Card className="p-6 border border-stone-200 rounded-xl bg-white">
        <h3 className="text-lg font-heading font-bold text-text-primary mb-3">About Carbon Sinks</h3>
        <ul className="space-y-2 text-sm text-text-secondary">
          <li className="flex items-start gap-2">
            <span className="text-green-600 mt-0.5">•</span>
            <span>Carbon sinks are natural or artificial reservoirs that absorb and store carbon dioxide from the atmosphere</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600 mt-0.5">•</span>
            <span>Examples include forests, soil carbon sequestration, and carbon capture technologies</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600 mt-0.5">•</span>
            <span>Sink records will be automatically deducted from your total emissions in GHG reports</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600 mt-0.5">•</span>
            <span>Track your carbon offset progress on the dashboard analytics</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
