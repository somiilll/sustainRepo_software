import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useOrganization } from '../contexts/OrganizationContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Building2, Users, Trash2, Plus } from 'lucide-react';
import { ModulePageHeader } from '../components/ModulePageHeader';
import { toast } from 'sonner';
import { LoadErrorState } from '../components/LoadErrorState';
import { getUserFriendlyError } from '../lib/userFriendlyError';
import { FacilityAssignmentPicker } from '../components/FacilityAssignmentPicker';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [facilityUser, setFacilityUser] = useState(null);
  const [facilityDialogOpen, setFacilityDialogOpen] = useState(false);
  const [selectedFacilityIds, setSelectedFacilityIds] = useState([]);
  const [newUserData, setNewUserData] = useState({
    email: '',
    full_name: '',
    assigned_facilities: [],
  });
  const { getAuthHeader, user: currentUser } = useAuth();
  const { moduleConfig } = useOrganization();
  const workflowEnabled = Boolean(moduleConfig?.approval_workflow_enabled);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [usersRes, facilitiesRes] = await Promise.all([
        axios.get(`${API}/admin/users`, { headers: getAuthHeader() }),
        axios.get(`${API}/facilities`, { headers: getAuthHeader() }),
      ]);
      setUsers(usersRes.data);
      setFacilities(facilitiesRes.data);
    } catch (error) {
      console.error('User management fetch error:', error);
      setLoadError(getUserFriendlyError(error, 'Unable to load users. Please try again.', { preferFallback: true }));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await axios.put(
        `${API}/admin/users`,
        {
          email: newUserData.email,
          full_name: newUserData.full_name,
          assigned_facilities: workflowEnabled ? [] : newUserData.assigned_facilities,
        },
        { headers: getAuthHeader() }
      );
      toast.success('User created! Login credentials have been sent to their email.', { duration: 5000 });
      setCreateDialogOpen(false);
      setNewUserData({ email: '', full_name: '', assigned_facilities: [] });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create user');
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      await axios.delete(`${API}/admin/users/${userId}`, {
        headers: getAuthHeader()
      });
      toast.success('User deleted successfully. They can no longer log in.');
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Delete failed');
    }
  };

  const confirmDeleteUser = (user) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const openFacilityAssignments = (user) => {
    setFacilityUser(user);
    setSelectedFacilityIds(user.assigned_facilities || []);
    setFacilityDialogOpen(true);
  };

  const saveFacilityAssignments = async () => {
    if (!facilityUser || selectedFacilityIds.length === 0) {
      toast.error('Select at least one facility');
      return;
    }
    try {
      await axios.post(
        `${API}/admin/users/${facilityUser.id}/assign-facilities`,
        selectedFacilityIds,
        { headers: getAuthHeader() }
      );
      toast.success('Facility access updated');
      setFacilityDialogOpen(false);
      setFacilityUser(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update facility access');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" data-testid="user-management-loading"></div>
      </div>
    );
  }

  return (
    <div className="space-y-7" data-testid="user-management-page">
      <ModulePageHeader
        title="User Management"
        icon={Users}
        iconClassName="border-blue-200 bg-blue-50 text-blue-700"
        testId="user-management"
        aside={<Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="add-user-button">
              <Plus className="w-4 h-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg" data-testid="create-user-dialog">
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="user-full-name">Full Name *</Label>
                <Input
                  id="user-full-name"
                  value={newUserData.full_name}
                  onChange={(e) => setNewUserData({ ...newUserData, full_name: e.target.value })}
                  required
                  className="bg-stone-50"
                  data-testid="create-user-full-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-email">Email *</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={newUserData.email}
                  onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
                  required
                  className="bg-stone-50"
                  data-testid="create-user-email-input"
                />
              </div>
              {!workflowEnabled && (
                <FacilityAssignmentPicker
                  facilities={facilities}
                  selectedIds={newUserData.assigned_facilities}
                  onChange={(assigned_facilities) => setNewUserData({ ...newUserData, assigned_facilities })}
                  testIdPrefix="create-user"
                />
              )}
              <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
                <p className="font-medium mb-1">Note:</p>
                <ul className="text-xs space-y-1 ml-4 list-disc">
                  <li>Login credentials will be sent to their email</li>
                  <li>Email notification will be sent (if SMTP configured)</li>
                  <li>User must change password on first login</li>
                  <li>{workflowEnabled ? 'Access is controlled by workflow assignments' : 'Access is limited to the selected facilities'}</li>
                </ul>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)} data-testid="create-user-cancel-button">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-primary hover:bg-primary/90 text-white"
                  disabled={!workflowEnabled && newUserData.assigned_facilities.length === 0}
                  data-testid="create-user-submit-button"
                >
                  Create User
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>}
      />

      {loadError ? <LoadErrorState title="Unable to load users" message={loadError} onRetry={fetchData} testId="user-management-load-error" /> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.map((user) => (
          <Card key={user.id} className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow" data-testid={`user-card-${user.id}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="bg-primary/10 p-3 rounded-lg">
                <Users className="w-6 h-6 text-primary" />
              </div>
              {/* Only show delete for non-admin users and not for self */}
              {user.id !== currentUser?.id && user.role !== 'admin' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => confirmDeleteUser(user)}
                  className="text-accent hover:text-accent"
                  data-testid={`delete-user-${user.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
            <h3 className="text-xl font-heading font-bold text-text-primary mb-1" data-testid={`user-${user.id}-name`}>{user.full_name}</h3>
            <p className="text-sm text-text-muted mb-2" data-testid={`user-${user.id}-email`}>{user.email}</p>
            <div className={`inline-block px-3 py-1 text-xs font-medium rounded-full capitalize ${
              user.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary'
            }`}>
              {user.role}
            </div>
            {user.role === 'admin' && user.id !== currentUser?.id && (
              <p className="text-xs text-amber-600 mt-3">Admin user (view only)</p>
            )}
            {!workflowEnabled && user.role === 'user' && (
              <div className="mt-5 border-t border-stone-100 pt-4">
                <p className="mb-3 text-sm text-stone-600" data-testid={`user-${user.id}-facility-count`}>
                  {user.assigned_facilities?.length || 0} facilities assigned
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openFacilityAssignments(user)}
                  data-testid={`manage-user-${user.id}-facilities-button`}
                >
                  <Building2 className="mr-2 h-4 w-4" /> Manage facilities
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>}

      {!loadError && users.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-xl font-heading font-bold text-text-primary mb-2">No users yet</h3>
          <p className="text-text-secondary mb-4">Users will appear here once they sign up</p>
        </div>
      )}

      {/* Delete User Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{userToDelete?.full_name}</strong>?
              <br /><br />
              This action will:
              <ul className="list-disc ml-4 mt-2">
                <li>Prevent the user from logging in</li>
                <li>Remove them from the user list</li>
              </ul>
              <br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteDialogOpen(false); setUserToDelete(null); }} data-testid="delete-user-cancel-button">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDeleteUser(userToDelete?.id)}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="delete-user-confirm-button"
            >
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={facilityDialogOpen} onOpenChange={setFacilityDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="manage-user-facilities-dialog">
          <DialogHeader>
            <DialogTitle>Facility access for {facilityUser?.full_name}</DialogTitle>
          </DialogHeader>
          <FacilityAssignmentPicker
            facilities={facilities}
            selectedIds={selectedFacilityIds}
            onChange={setSelectedFacilityIds}
            testIdPrefix="manage-user"
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setFacilityDialogOpen(false)} data-testid="manage-user-facilities-cancel-button">
              Cancel
            </Button>
            <Button type="button" onClick={saveFacilityAssignments} disabled={selectedFacilityIds.length === 0} data-testid="manage-user-facilities-save-button">
              Save access
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}