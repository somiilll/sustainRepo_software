import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import axios from 'axios';
import { Eye, EyeOff } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;
const LOGO_FALLBACK = '/sustainrepo-logo.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState(LOGO_FALLBACK);
  const [backgroundUrl, setBackgroundUrl] = useState('');

  useEffect(() => {
    const getSoftwareAssetUrl = async (assetName) => {
      const { data } = await axios.get(`${API}/api/software-assets/${assetName}`);
      const url = data?.url;
      if (url?.startsWith(API)) return url;
      if (url?.startsWith('/')) return `${API}${url}`;
      return url || '';
    };

    getSoftwareAssetUrl('logo').then((url) => url && setLogoUrl(url)).catch(() => null);
    getSoftwareAssetUrl('login-background').then((url) => url && setBackgroundUrl(url)).catch(() => null);
  }, []);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const userData = await login(email, password);
      toast.success('Sign in successful!');
      // Redirect based on user role
      if (userData.role === 'super_admin') {
        navigate('/super-admin');
      } else if (userData.user_type === 'supplier' || userData.org_type === 'supplier') {
        navigate('/supplier-assessment/supplier');
      } else {
        navigate('/dashboard');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7fbf9] lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(25rem,0.85fr)]" data-testid="login-page">
      <section className="flex min-h-[42vh] items-center justify-center overflow-hidden bg-[#ccefe8] p-5 sm:p-8 lg:min-h-screen lg:p-12" data-testid="login-visual-panel">
        {backgroundUrl ? (
          <img
            src={backgroundUrl}
            alt="Platform for Smarter Sustainability Management"
            className="h-auto w-full max-w-4xl object-contain"
            data-testid="login-sustainability-image"
          />
        ) : (
          <div className="h-full min-h-[16rem] w-full bg-[linear-gradient(135deg,#f9fffd_0%,#c7efea_55%,#8dd9b2_100%)]" data-testid="login-image-loading-placeholder" />
        )}
      </section>

      <section className="relative flex items-center justify-center overflow-hidden bg-[linear-gradient(145deg,#dff7ed_0%,#cbeee8_45%,#c8e7f0_100%)] px-6 py-12 sm:px-10 lg:min-h-screen lg:px-14" data-testid="login-form-panel">
        <div className="relative w-full max-w-md animate-in fade-in slide-in-from-bottom-3 duration-700" data-testid="login-form-container">
          <div className="rounded-lg border border-white/80 bg-white/95 p-6 shadow-[0_24px_54px_rgba(15,103,105,0.16)] backdrop-blur-sm sm:p-9" data-testid="login-card">
            <div className="mb-9 flex flex-col items-center text-center" data-testid="login-brand-block">
              <img src={logoUrl} alt="SustainRepo Logo" className="h-16 w-16 rounded-full ring-4 ring-[#e4f6f0]" data-testid="login-logo" />
              <h1 className="mb-2 mt-5 text-4xl font-heading font-bold tracking-normal text-text-primary" data-testid="login-title">SustainRepo</h1>
              <p className="max-w-xs text-sm leading-6 text-text-secondary" data-testid="login-subtitle">Carbon Emissions Management Platform</p>
            </div>
            
            <form onSubmit={handleLogin} className="space-y-5" data-testid="login-form">
              <div className="space-y-2">
                <Label htmlFor="login-email" data-testid="login-email-label">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="login-email-input"
                  className="h-12 border-[#b9dada] bg-white/90 transition-[border-color,box-shadow] duration-200 placeholder:text-[#7e9997] hover:border-[#78bcb5] focus-visible:border-[#21867a] focus-visible:ring-[#21867a]/25"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="login-password" data-testid="login-password-label">Password</Label>
                <div className="relative" data-testid="login-password-field">
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    data-testid="login-password-input"
                    className="h-12 border-[#b9dada] bg-white/90 pr-12 transition-[border-color,box-shadow] duration-200 placeholder:text-[#7e9997] hover:border-[#78bcb5] focus-visible:border-[#21867a] focus-visible:ring-[#21867a]/25"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-[#5c7d7b] transition-[color,background-color] duration-200 hover:text-[#16796f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#21867a]/40"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    data-testid="login-password-visibility-toggle"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                  </button>
                </div>
              </div>
              
              <Button
                type="submit"
                className="h-12 w-full rounded-lg bg-primary text-white shadow-[0_8px_18px_rgba(26,133,120,0.24)] transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[0_11px_22px_rgba(26,133,120,0.3)] focus-visible:ring-primary/30"
                disabled={loading}
                data-testid="login-submit-button"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>
            
            <div className="mt-7 border-t border-[#e5efec] pt-5 text-center" data-testid="login-account-links">
              <Link to="/forgot-password" className="text-sm font-medium text-primary transition-colors duration-200 hover:text-primary/80 hover:underline hover:underline-offset-4" data-testid="login-forgot-password-link">
                Forgot your password?
              </Link>
              <p className="mt-3 text-sm leading-6 text-text-muted" data-testid="login-contact-signup-text">
                Haven&apos;t registered yet? Contact us to sign up{' '}
                <a 
                  href="https://sustainrepo.com/contact"
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="font-medium text-primary underline transition-colors duration-200 hover:text-primary/80"
                  data-testid="login-contact-signup-link"
                >
                  here
                </a>.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}