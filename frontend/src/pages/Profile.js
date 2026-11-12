import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { User, Mail, Edit2, Check, X } from 'lucide-react';
import { ModulePageHeader } from '../components/ModulePageHeader';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Profile() {
  const { user, getAuthHeader, refreshUser } = useAuth();
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const handleNameEdit = () => {
    setNewName(user?.full_name || '');
    setEditingName(true);
  };

  const handleNameCancel = () => {
    setEditingName(false);
    setNewName('');
  };

  const handleNameSave = async () => {
    if (!newName || newName.trim().length < 2) {
      toast.error('Name must be at least 2 characters');
      return;
    }

    setSavingName(true);
    try {
      await axios.put(
        `${API}/auth/profile`,
        { full_name: newName.trim() },
        { headers: getAuthHeader() }
      );
      toast.success('Name updated successfully');
      setEditingName(false);
      // Refresh user data in context
      if (refreshUser) {
        await refreshUser();
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update name');
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="space-y-7">
      <ModulePageHeader title="Profile" icon={User} iconClassName="border-rose-200 bg-rose-50 text-rose-700" testId="profile" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6 border border-stone-200 rounded-xl bg-white">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-primary/10 p-3 rounded-lg">
              <User className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-heading font-bold text-text-primary">Personal Information</h3>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-xs text-text-muted">Full Name</Label>
              {editingName ? (
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="flex-1 bg-stone-50"
                    placeholder="Enter your name"
                    autoFocus
                    data-testid="name-input"
                  />
                  <Button
                    size="sm"
                    onClick={handleNameSave}
                    disabled={savingName}
                    className="bg-primary hover:bg-primary/90 text-white"
                    data-testid="save-name-btn"
                  >
                    {savingName ? '...' : <Check className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleNameCancel}
                    disabled={savingName}
                    data-testid="cancel-name-btn"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-text-primary font-medium">{user?.full_name}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleNameEdit}
                    className="text-primary hover:text-primary/80 p-1 h-auto"
                    data-testid="edit-name-btn"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs text-text-muted">Email Address</Label>
              <div className="flex items-center gap-2 mt-1">
                <Mail className="w-4 h-4 text-text-muted" />
                <p className="text-text-primary font-medium">{user?.email}</p>
              </div>
            </div>
            <div>
              <Label className="text-xs text-text-muted">Role</Label>
              <div className="mt-1">
                <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-sm font-medium rounded-full capitalize" data-testid="profile-role-value">
                  {user?.user_type === 'supplier' || user?.org_type === 'supplier' ? 'Supplier' : user?.role?.replace('_', ' ')}
                </span>
              </div>
            </div>
            {user?.organization_id && (
              <div>
                <Label className="text-xs text-text-muted">Organization</Label>
                <p className="text-text-primary font-medium mt-1">Assigned</p>
              </div>
            )}
            {user?.assigned_facilities && user.assigned_facilities.length > 0 && (
              <div>
                <Label className="text-xs text-text-muted">Assigned Facilities</Label>
                <p className="text-text-primary font-medium mt-1">{user.assigned_facilities.length} facilities</p>
              </div>
            )}
          </div>

          <div className="mt-6 p-4 bg-stone-50 rounded-lg">
            <p className="text-xs text-text-muted">
              Click the edit icon next to your name to update it.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
