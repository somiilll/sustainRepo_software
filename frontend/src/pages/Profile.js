import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { User, Lock, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Profile() {
  const { user, getAuthHeader } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await axios.post(
        `${API}/auth/change-password`,
        {
          old_password: oldPassword,
          new_password: newPassword
        },
        { headers: getAuthHeader() }
      );
      toast.success('Password changed successfully');
      setChangingPassword(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Profile</h1>
        <p className="text-text-secondary">Manage your account settings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              <p className="text-text-primary font-medium mt-1">{user?.full_name}</p>
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
                <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-sm font-medium rounded-full capitalize">
                  {user?.role?.replace('_', ' ')}
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
              To update your personal information, please contact your administrator.
            </p>
          </div>
        </Card>

        <Card className="p-6 border border-stone-200 rounded-xl bg-white">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-secondary/10 p-3 rounded-lg">
              <Lock className="w-6 h-6 text-secondary" />
            </div>
            <h3 className="text-lg font-heading font-bold text-text-primary">Security</h3>
          </div>

          {!changingPassword ? (
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-text-muted">Password</Label>
                <p className="text-text-primary font-medium mt-1">••••••••</p>
              </div>
              <Button
                onClick={() => setChangingPassword(true)}
                className="w-full bg-secondary hover:bg-secondary/90 text-white rounded-full"
              >
                Change Password
              </Button>

              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <p className="text-xs font-medium text-blue-800 mb-1">Password Requirements:</p>
                <ul className="text-xs text-blue-700 space-y-1 ml-4">
                  <li>• Minimum 8 characters</li>
                  <li>• Mix of letters and numbers recommended</li>
                  <li>• Special characters recommended</li>
                </ul>
              </div>
            </div>
          ) : (
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="old-password">Current Password *</Label>
                <Input
                  id="old-password"
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  required
                  className="bg-stone-50"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password *</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="bg-stone-50"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password *</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="bg-stone-50"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setChangingPassword(false);
                    setOldPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-secondary hover:bg-secondary/90 text-white"
                >
                  {loading ? 'Updating...' : 'Update Password'}
                </Button>
              </div>
            </form>
          )}
        </Card>
      </div>

      <Card className="p-6 border border-stone-200 rounded-xl bg-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-accent/10 p-3 rounded-lg">
            <Phone className="w-6 h-6 text-accent" />
          </div>
          <h3 className="text-lg font-heading font-bold text-text-primary">Account Recovery</h3>
        </div>
        <p className="text-sm text-text-secondary mb-4">
          If you forget your password, you can request a password reset link.
        </p>
        <Button
          onClick={() => window.location.href = '/forgot-password'}
          variant="outline"
          className="rounded-full"
        >
          Go to Password Reset
        </Button>
      </Card>
    </div>
  );
}