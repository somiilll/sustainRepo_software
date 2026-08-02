import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { 
  Plus, 
  Search, 
  Mail, 
  Eye, 
  Edit2, 
  Trash2,
  Building2,
  User,
  Calendar,
  TrendingUp,
  Percent,
  Leaf,
  Factory,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
};

export default function SupplierList() {
  const { getAuthHeader } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [formData, setFormData] = useState({
    company_name: '',
    contact_person: '',
    email: '',
    contact_number: '',
    due_date: '',
    modules_enabled: ['esg', 'ghg'],
    ghg_scopes_enabled: ['scope1', 'scope2'],
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, page_size: pageSize });
      if (search) params.append('search', search);
      
      const res = await axios.get(`${API}/supplier-assessment/suppliers?${params}`, {
        headers: getAuthHeader(),
      });
      setSuppliers(res.data.suppliers || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      toast.error('Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader, page, search]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const handleAdd = async () => {
    if (!formData.company_name || !formData.contact_person || !formData.email) {
      toast.error('Please fill required fields');
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/supplier-assessment/suppliers`, formData, {
        headers: getAuthHeader(),
      });
      toast.success('Supplier added and invitation sent');
      setShowAddDialog(false);
      setFormData({ 
        company_name: '', 
        contact_person: '', 
        email: '', 
        contact_number: '', 
        due_date: '',
        modules_enabled: ['esg', 'ghg'],
        ghg_scopes_enabled: ['scope1', 'scope2'],
      });
      fetchSuppliers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add supplier');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedSupplier) return;
    
    setSubmitting(true);
    try {
      await axios.put(`${API}/supplier-assessment/suppliers/${selectedSupplier.id}`, formData, {
        headers: getAuthHeader(),
      });
      toast.success('Supplier updated');
      setShowEditDialog(false);
      fetchSuppliers();
    } catch (err) {
      toast.error('Failed to update supplier');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (supplier) => {
    if (!window.confirm(`Deactivate supplier "${supplier.company_name}"?`)) return;
    
    try {
      await axios.delete(`${API}/supplier-assessment/suppliers/${supplier.id}`, {
        headers: getAuthHeader(),
      });
      toast.success('Supplier deactivated');
      fetchSuppliers();
    } catch (err) {
      toast.error('Failed to deactivate supplier');
    }
  };

  const handleReminder = async (supplier) => {
    try {
      await axios.post(`${API}/supplier-assessment/suppliers/${supplier.id}/remind`, {}, {
        headers: getAuthHeader(),
      });
      toast.success('Reminder sent');
      fetchSuppliers();
    } catch (err) {
      toast.error('Failed to send reminder');
    }
  };

  const openEditDialog = (supplier) => {
    setSelectedSupplier(supplier);
    setFormData({
      company_name: supplier.company_name,
      contact_person: supplier.contact_person,
      email: supplier.contact_email,
      contact_number: supplier.contact_number || '',
      due_date: supplier.due_date || '',
      modules_enabled: supplier.modules_enabled || ['esg', 'ghg'],
      ghg_scopes_enabled: supplier.ghg_scopes_enabled || ['scope1', 'scope2'],
    });
    setShowEditDialog(true);
  };

  const openViewDialog = (supplier) => {
    setSelectedSupplier(supplier);
    setShowViewDialog(true);
  };

  // Toggle module in modules_enabled array
  const toggleModule = (module) => {
    setFormData(prev => {
      const current = prev.modules_enabled || [];
      if (current.includes(module)) {
        // Don't allow removing all modules
        if (current.length === 1) {
          toast.error('At least one module must be enabled');
          return prev;
        }
        return { ...prev, modules_enabled: current.filter(m => m !== module) };
      } else {
        return { ...prev, modules_enabled: [...current, module] };
      }
    });
  };

  // Toggle scope in ghg_scopes_enabled array
  const toggleScope = (scope) => {
    setFormData(prev => {
      const current = prev.ghg_scopes_enabled || [];
      if (current.includes(scope)) {
        // Don't allow removing all scopes if GHG is enabled
        if (current.length === 1 && prev.modules_enabled?.includes('ghg')) {
          toast.error('At least one scope must be enabled for GHG');
          return prev;
        }
        return { ...prev, ghg_scopes_enabled: current.filter(s => s !== scope) };
      } else {
        return { ...prev, ghg_scopes_enabled: [...current, scope] };
      }
    });
  };

  return (
    <div className="space-y-6" data-testid="supplier-list">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Suppliers</h1>
          <p className="text-sm text-stone-500 mt-1">Manage your supplier assessments</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} data-testid="add-supplier-btn">
          <Plus className="h-4 w-4 mr-2" />
          Add Supplier
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <Input
            placeholder="Search suppliers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="supplier-search"
          />
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Last Reminder</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-stone-500">
                  Loading...
                </TableCell>
              </TableRow>
            ) : suppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-stone-500">
                  No suppliers found. Add your first supplier to get started.
                </TableCell>
              </TableRow>
            ) : (
              suppliers.map((supplier) => (
                <TableRow key={supplier.id} data-testid={`supplier-row-${supplier.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-stone-400" />
                      <span className="font-medium">{supplier.company_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3 text-stone-400" />
                        {supplier.contact_person}
                      </div>
                      <div className="text-stone-500">{supplier.contact_email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {supplier.due_date ? (
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3 text-stone-400" />
                        {new Date(supplier.due_date).toLocaleDateString()}
                      </div>
                    ) : (
                      <span className="text-stone-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[supplier.invitation_status] || 'bg-stone-100'}>
                      {supplier.invitation_status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-stone-200 rounded-full h-2">
                        <div
                          className="bg-emerald-500 h-2 rounded-full"
                          style={{ width: `${supplier.overall_completion_percent || 0}%` }}
                        />
                      </div>
                      <span className="text-sm text-stone-600">
                        {Math.round(supplier.overall_completion_percent || 0)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {supplier.overall_score !== null ? (
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-emerald-500" />
                        <span className="font-medium">{supplier.overall_score}</span>
                      </div>
                    ) : (
                      <span className="text-stone-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {supplier.last_reminder_sent ? (
                      <div className="text-sm text-stone-500">
                        {new Date(supplier.last_reminder_sent).toLocaleDateString()}
                        <span className="text-xs ml-1">({supplier.reminder_count})</span>
                      </div>
                    ) : (
                      <span className="text-stone-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openViewDialog(supplier)}
                        data-testid={`view-supplier-${supplier.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(supplier)}
                        data-testid={`edit-supplier-${supplier.id}`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReminder(supplier)}
                        data-testid={`remind-supplier-${supplier.id}`}
                      >
                        <Mail className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDeactivate(supplier)}
                        data-testid={`delete-supplier-${supplier.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-sm text-stone-500">
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page * pageSize >= total}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add Supplier Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                placeholder="Enter company name"
                data-testid="supplier-company-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Contact Person *</Label>
              <Input
                value={formData.contact_person}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                placeholder="Enter contact person name"
                data-testid="supplier-contact-person"
              />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Enter email address"
                data-testid="supplier-email"
              />
            </div>
            <div className="space-y-2">
              <Label>Contact Number</Label>
              <Input
                value={formData.contact_number}
                onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                placeholder="Enter phone number"
                data-testid="supplier-phone"
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                data-testid="supplier-due-date"
              />
            </div>
            
            {/* Module Selection */}
            <div className="space-y-3 pt-2 border-t">
              <Label className="text-base font-medium">Assessment Modules *</Label>
              <p className="text-sm text-stone-500">Select which modules the supplier needs to complete</p>
              
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="module-esg"
                    checked={formData.modules_enabled?.includes('esg')}
                    onCheckedChange={() => toggleModule('esg')}
                    data-testid="module-esg-checkbox"
                  />
                  <label htmlFor="module-esg" className="flex items-center gap-2 text-sm cursor-pointer">
                    <Leaf className="h-4 w-4 text-emerald-600" />
                    ESG Questionnaire
                  </label>
                </div>
                
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="module-ghg"
                    checked={formData.modules_enabled?.includes('ghg')}
                    onCheckedChange={() => toggleModule('ghg')}
                    data-testid="module-ghg-checkbox"
                  />
                  <label htmlFor="module-ghg" className="flex items-center gap-2 text-sm cursor-pointer">
                    <Factory className="h-4 w-4 text-blue-600" />
                    GHG Emissions
                  </label>
                </div>
              </div>
            </div>
            
            {/* GHG Scope Selection - Only shown if GHG is enabled */}
            {formData.modules_enabled?.includes('ghg') && (
              <div className="space-y-3 pl-4 border-l-2 border-blue-200 ml-2">
                <Label className="text-sm font-medium">GHG Scopes</Label>
                <p className="text-xs text-stone-500">Select which scopes the supplier should report</p>
                
                <div className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="scope-1"
                      checked={formData.ghg_scopes_enabled?.includes('scope1')}
                      onCheckedChange={() => toggleScope('scope1')}
                      data-testid="scope1-checkbox"
                    />
                    <label htmlFor="scope-1" className="text-sm cursor-pointer">
                      Scope 1 (Direct Emissions)
                    </label>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="scope-2"
                      checked={formData.ghg_scopes_enabled?.includes('scope2')}
                      onCheckedChange={() => toggleScope('scope2')}
                      data-testid="scope2-checkbox"
                    />
                    <label htmlFor="scope-2" className="text-sm cursor-pointer">
                      Scope 2 (Indirect Emissions)
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={submitting} data-testid="submit-supplier">
              {submitting ? 'Adding...' : 'Add Supplier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Supplier Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Contact Person</Label>
              <Input
                value={formData.contact_person}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Contact Number</Label>
              <Input
                value={formData.contact_number}
                onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              />
            </div>
            
            {/* Module Selection */}
            <div className="space-y-3 pt-2 border-t">
              <Label className="text-base font-medium">Assessment Modules</Label>
              
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-module-esg"
                    checked={formData.modules_enabled?.includes('esg')}
                    onCheckedChange={() => toggleModule('esg')}
                  />
                  <label htmlFor="edit-module-esg" className="flex items-center gap-2 text-sm cursor-pointer">
                    <Leaf className="h-4 w-4 text-emerald-600" />
                    ESG Questionnaire
                  </label>
                </div>
                
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-module-ghg"
                    checked={formData.modules_enabled?.includes('ghg')}
                    onCheckedChange={() => toggleModule('ghg')}
                  />
                  <label htmlFor="edit-module-ghg" className="flex items-center gap-2 text-sm cursor-pointer">
                    <Factory className="h-4 w-4 text-blue-600" />
                    GHG Emissions
                  </label>
                </div>
              </div>
            </div>
            
            {/* GHG Scope Selection */}
            {formData.modules_enabled?.includes('ghg') && (
              <div className="space-y-3 pl-4 border-l-2 border-blue-200 ml-2">
                <Label className="text-sm font-medium">GHG Scopes</Label>
                
                <div className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="edit-scope-1"
                      checked={formData.ghg_scopes_enabled?.includes('scope1')}
                      onCheckedChange={() => toggleScope('scope1')}
                    />
                    <label htmlFor="edit-scope-1" className="text-sm cursor-pointer">
                      Scope 1 (Direct)
                    </label>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="edit-scope-2"
                      checked={formData.ghg_scopes_enabled?.includes('scope2')}
                      onCheckedChange={() => toggleScope('scope2')}
                    />
                    <label htmlFor="edit-scope-2" className="text-sm cursor-pointer">
                      Scope 2 (Indirect)
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Supplier Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedSupplier?.company_name}</DialogTitle>
          </DialogHeader>
          {selectedSupplier && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-stone-500">Contact Person</Label>
                  <p className="font-medium">{selectedSupplier.contact_person}</p>
                </div>
                <div>
                  <Label className="text-stone-500">Email</Label>
                  <p className="font-medium">{selectedSupplier.contact_email}</p>
                </div>
                <div>
                  <Label className="text-stone-500">Phone</Label>
                  <p className="font-medium">{selectedSupplier.contact_number || '-'}</p>
                </div>
                <div>
                  <Label className="text-stone-500">Status</Label>
                  <Badge className={statusColors[selectedSupplier.invitation_status]}>
                    {selectedSupplier.invitation_status}
                  </Badge>
                </div>
                <div>
                  <Label className="text-stone-500">Revenue %</Label>
                  <p className="font-medium flex items-center gap-1">
                    <Percent className="h-3 w-3" />
                    {selectedSupplier.revenue_percentage !== null 
                      ? `${selectedSupplier.revenue_percentage}%` 
                      : 'Not provided'}
                  </p>
                </div>
                <div>
                  <Label className="text-stone-500">Revenue Amount</Label>
                  <p className="font-medium">
                    {selectedSupplier.revenue_amount !== null && selectedSupplier.revenue_amount !== undefined
                      ? `${selectedSupplier.revenue_currency || 'USD'} ${selectedSupplier.revenue_amount.toLocaleString()}`
                      : 'Not provided'}
                  </p>
                </div>
                <div>
                  <Label className="text-stone-500">Due Date</Label>
                  <p className="font-medium">
                    {selectedSupplier.due_date 
                      ? new Date(selectedSupplier.due_date).toLocaleDateString() 
                      : '-'}
                  </p>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <Label className="text-stone-500">Completion Progress</Label>
                <div className="space-y-2 mt-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>ESG Questionnaire</span>
                    <span>{Math.round(selectedSupplier.esg_completion_percent || 0)}%</span>
                  </div>
                  <div className="w-full bg-stone-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${selectedSupplier.esg_completion_percent || 0}%` }}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between text-sm mt-3">
                    <span>GHG Emissions</span>
                    <span>{Math.round(selectedSupplier.ghg_completion_percent || 0)}%</span>
                  </div>
                  <div className="w-full bg-stone-200 rounded-full h-2">
                    <div
                      className="bg-emerald-500 h-2 rounded-full"
                      style={{ width: `${selectedSupplier.ghg_completion_percent || 0}%` }}
                    />
                  </div>
                </div>
              </div>
              
              {(selectedSupplier.esg_score || selectedSupplier.ghg_score) && (
                <div className="border-t pt-4">
                  <Label className="text-stone-500">Scores</Label>
                  <div className="grid grid-cols-3 gap-4 mt-2">
                    <div className="text-center p-3 bg-stone-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">
                        {selectedSupplier.esg_score || '-'}
                      </div>
                      <div className="text-xs text-stone-500">ESG Score</div>
                    </div>
                    <div className="text-center p-3 bg-stone-50 rounded-lg">
                      <div className="text-2xl font-bold text-emerald-600">
                        {selectedSupplier.ghg_score || '-'}
                      </div>
                      <div className="text-xs text-stone-500">GHG Score</div>
                    </div>
                    <div className="text-center p-3 bg-stone-50 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">
                        {selectedSupplier.overall_score || '-'}
                      </div>
                      <div className="text-xs text-stone-500">Overall</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowViewDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
