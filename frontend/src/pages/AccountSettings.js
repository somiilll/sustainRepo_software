import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ArrowRight, Calendar, Check, Eye, EyeOff, LifeBuoy, Lock, Settings } from 'lucide-react';
import { ModulePageHeader } from '../components/ModulePageHeader';
import { toast } from 'sonner';
import { ContactSalesDialog } from '../components/ContactSalesDialog';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AccountSettings() {
  const { user, getAuthHeader } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
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
          startDate: new Date(expiryDate.getFullYear() - 1, expiryDate.getMonth(), expiryDate.getDate() + 1).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
          endDate: expiryDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
          percentLeft: Math.max(0, Math.min(100, Math.round((daysRemaining / 365) * 100))),
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

  const sub = subscriptionInfo;
  const showSub = sub && (user?.role === 'admin' || user?.role === 'user');
  const tone = sub?.isExpired ? { text: 'text-red-700', bar: 'bg-red-500', badge: 'border-red-200 bg-red-50 text-red-700', dot: 'bg-red-500', label: 'Expired' }
    : sub?.isExpiringSoon ? { text: 'text-amber-700', bar: 'bg-amber-500', badge: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500', label: 'Expiring soon' }
    : { text: 'text-emerald-800', bar: 'bg-gradient-to-r from-emerald-700 to-emerald-400', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-600', label: 'Active' };

  return (
    <div className="space-y-7" data-testid="account-settings-page">
      <ModulePageHeader title="Account Settings" subtitle="Manage your password, account recovery and subscription" icon={Settings} iconClassName="border-sky-200 bg-sky-50 text-sky-700" testId="account-settings" />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <section className="rounded-2xl border border-stone-200 bg-white shadow-sm p-6" data-testid="account-security-card">
            <div className="mb-5 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-slate-700"><Lock className="h-5 w-5" /></div>
              <div>
                <h3 className="text-lg font-semibold text-stone-900">Security</h3>
                <p className="text-sm text-stone-500">Keep your account protected with a strong password</p>
              </div>
            </div>
            {!changingPassword ? (
              <>
                <div className="flex items-center justify-between gap-4 rounded-xl border border-stone-100 bg-stone-50 px-5 py-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">Password</div>
                    <div className="mt-1 text-lg tracking-widest text-stone-900">••••••••</div>
                  </div>
                  <Button onClick={() => setChangingPassword(true)} className="rounded-lg bg-slate-900 px-5 text-white hover:bg-slate-800" data-testid="account-change-password-button">Change password</Button>
                </div>
                <p className="mt-5 text-sm text-stone-500">Use at least 8 characters with upper and lower case letters, a number and a special character.</p>
              </>
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
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white shadow-sm flex flex-wrap items-center gap-4 p-6" data-testid="account-recovery-card">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><LifeBuoy className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold text-stone-900">Account recovery</h3>
              <p className="text-sm text-stone-500">If you forget your password, you can request a password reset link by email.</p>
            </div>
            <Button variant="outline" className="rounded-lg" onClick={() => window.location.href = '/forgot-password'} data-testid="account-password-reset-button">Go to password reset<ArrowRight className="ml-2 h-4 w-4" /></Button>
          </section>
        </div>

        {showSub && (
          <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden lg:col-span-2" data-testid="account-subscription-card">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Calendar className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold text-stone-900">Platform subscription</h3>
                  <p className="text-sm text-stone-500">Your SustainRepo plan</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${tone.badge}`} data-testid="account-subscription-status"><span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />{tone.label}</span>
              </div>
              <div className="mt-6 text-xs font-semibold uppercase tracking-wider text-stone-500">Subscription expiry date</div>
              <div className={`mt-1 text-3xl font-bold ${tone.text}`} data-testid="account-subscription-expiry">{sub.expiryDate}</div>
              <div className="mt-6 flex items-baseline gap-2">
                <span className="text-3xl font-semibold text-stone-900" data-testid="account-subscription-days">{Math.max(sub.daysRemaining, 0)}</span>
                <span className="text-stone-500">days remaining</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200"><div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${sub.percentLeft}%` }} /></div>
              <div className="mt-3 flex justify-between text-sm text-stone-500"><span>{sub.startDate}</span><span>{sub.endDate}</span></div>
            </div>
            <div className="flex flex-wrap items-center gap-4 border-t border-stone-100 bg-stone-50 px-6 py-4">
              <Button className="rounded-lg bg-emerald-700 text-white hover:bg-emerald-800" onClick={() => setContactOpen(true)} data-testid="account-renew-button">Renew subscription</Button>
              <button type="button" className="text-sm font-medium text-emerald-700 hover:underline" onClick={() => setContactOpen(true)} data-testid="account-contact-support">Contact support</button>
            </div>
          </section>
        )}
      </div>
      <ContactSalesDialog open={contactOpen} onOpenChange={setContactOpen} user={user} getAuthHeader={getAuthHeader} />
    </div>
  );
}
