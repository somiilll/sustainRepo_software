import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { User, Lock, Mail, Phone, Calendar, AlertTriangle, Edit2, Check, X, Eye, EyeOff } from 'lucide-react';
import { ModulePageHeader } from '../components/ModulePageHeader';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Profile() {
  const { user, getAuthHeader, refreshUser } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (user && (user.role === 'admin' || user.role === 'user')) {
      fetchSubscriptionInfo();
    }
  }, [user]);

  const fetchSubscriptionInfo = async () => {
    try {
      const response = await axios.get(`${API}/organizations/my`, {
        headers: getAuthHeader()
      });
      const org = response.data;
      if (org.subscription_expires_at) {
        const expiryDate = new Date(org.subscription_expires_at);
        const today = new Date();
        const daysRemaining = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        setSubscriptionInfo({
          expiryDate: expiryDate.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          }),
          daysRemaining,
          isExpired: daysRemaining <= 0,
          isExpiringSoon: daysRemaining > 0 && daysRemaining <= 30
        });
      }
    } catch (error) {
      console.error('Error fetching subscription info:', error);
    }
  };

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
              Click the edit icon next to your name to update it.
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

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-medium text-blue-800 mb-2">Password Requirements:</p>
                <ul className="text-xs text-blue-700 space-y-1 ml-4">
                  <li>• Minimum 8 characters</li>
                  <li>• At least one uppercase letter</li>
                  <li>• At least one lowercase letter</li>
                  <li>• At least one number</li>
                  <li>• At least one special character (!@#$%^&amp;*()_+-=[]{}|;:,.&lt;&gt;?)</li>
                </ul>
              </div>
            </div>
          ) : (
            <form onSubmit={handlePasswordChange} className="space-y-4">
              {/* Password Requirements - Shown upfront */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-800 mb-2">Password Requirements:</p>
                <ul className="text-sm text-blue-700 space-y-1 ml-4">
                  <li className={`flex items-center gap-2 ${newPassword.length >= 8 ? 'text-green-600' : ''}`}>
                    {newPassword.length >= 8 ? <Check className="w-3 h-3" /> : <span className="w-3 h-3 rounded-full border border-blue-400 inline-block" />}
                    Minimum 8 characters
                  </li>
                  <li className={`flex items-center gap-2 ${/[A-Z]/.test(newPassword) ? 'text-green-600' : ''}`}>
                    {/[A-Z]/.test(newPassword) ? <Check className="w-3 h-3" /> : <span className="w-3 h-3 rounded-full border border-blue-400 inline-block" />}
                    At least one uppercase letter
                  </li>
                  <li className={`flex items-center gap-2 ${/[a-z]/.test(newPassword) ? 'text-green-600' : ''}`}>
                    {/[a-z]/.test(newPassword) ? <Check className="w-3 h-3" /> : <span className="w-3 h-3 rounded-full border border-blue-400 inline-block" />}
                    At least one lowercase letter
                  </li>
                  <li className={`flex items-center gap-2 ${/[0-9]/.test(newPassword) ? 'text-green-600' : ''}`}>
                    {/[0-9]/.test(newPassword) ? <Check className="w-3 h-3" /> : <span className="w-3 h-3 rounded-full border border-blue-400 inline-block" />}
                    At least one number
                  </li>
                  <li className={`flex items-center gap-2 ${/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(newPassword) ? 'text-green-600' : ''}`}>
                    {/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(newPassword) ? <Check className="w-3 h-3" /> : <span className="w-3 h-3 rounded-full border border-blue-400 inline-block" />}
                    At least one special character (!@#$%^&amp;*()_+-=[]{}|;:,.&lt;&gt;?)
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <Label htmlFor="old-password">Current Password *</Label>
                <div className="relative">
                  <Input
                    id="old-password"
                    type={showOldPassword ? 'text' : 'password'}
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    required
                    className="bg-stone-50 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPassword(!showOldPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                    tabIndex={-1}
                  >
                    {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password *</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    className="bg-stone-50 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password *</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className="bg-stone-50 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-red-500">Passwords do not match</p>
                )}
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
                    setShowOldPassword(false);
                    setShowNewPassword(false);
                    setShowConfirmPassword(false);
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

      {/* Subscription Info - Only for Admin/User */}
      {subscriptionInfo && (user?.role === 'admin' || user?.role === 'user') && (
        <Card className={`p-6 border rounded-xl ${
          subscriptionInfo.isExpired 
            ? 'border-red-300 bg-red-50' 
            : subscriptionInfo.isExpiringSoon 
              ? 'border-yellow-300 bg-yellow-50' 
              : 'border-stone-200 bg-white'
        }`}>
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-3 rounded-lg ${
              subscriptionInfo.isExpired 
                ? 'bg-red-100' 
                : subscriptionInfo.isExpiringSoon 
                  ? 'bg-yellow-100' 
                  : 'bg-green-100'
            }`}>
              {subscriptionInfo.isExpired || subscriptionInfo.isExpiringSoon ? (
                <AlertTriangle className={`w-6 h-6 ${subscriptionInfo.isExpired ? 'text-red-600' : 'text-yellow-600'}`} />
              ) : (
                <Calendar className="w-6 h-6 text-green-600" />
              )}
            </div>
            <h3 className="text-lg font-heading font-bold text-text-primary">Platform Subscription</h3>
          </div>
          
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-text-muted">Subscription Expiry Date</Label>
              <p className={`text-lg font-semibold mt-1 ${
                subscriptionInfo.isExpired 
                  ? 'text-red-600' 
                  : subscriptionInfo.isExpiringSoon 
                    ? 'text-yellow-700' 
                    : 'text-green-600'
              }`}>
                {subscriptionInfo.expiryDate}
              </p>
            </div>
            
            <div>
              <Label className="text-xs text-text-muted">Status</Label>
              <p className={`font-medium mt-1 ${
                subscriptionInfo.isExpired 
                  ? 'text-red-600' 
                  : subscriptionInfo.isExpiringSoon 
                    ? 'text-yellow-700' 
                    : 'text-green-600'
              }`}>
                {subscriptionInfo.isExpired 
                  ? 'Expired' 
                  : `${subscriptionInfo.daysRemaining} days remaining`
                }
              </p>
            </div>

            {(subscriptionInfo.isExpired || subscriptionInfo.isExpiringSoon) && (
              <div className={`mt-4 p-3 rounded-lg ${subscriptionInfo.isExpired ? 'bg-red-100' : 'bg-yellow-100'}`}>
                <p className={`text-sm ${subscriptionInfo.isExpired ? 'text-red-700' : 'text-yellow-700'}`}>
                  {subscriptionInfo.isExpired 
                    ? 'Your subscription has expired. Please contact your administrator to renew access.'
                    : 'Your subscription is expiring soon. Please contact your administrator to ensure uninterrupted access.'
                  }
                </p>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}