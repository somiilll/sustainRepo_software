import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;
const LOGO_FALLBACK = '/sustainrepo-logo.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      toast.success('Login successful!');
      // Redirect based on user role
      if (userData.role === 'super_admin') {
        navigate('/super-admin');
      } else if (userData.user_type === 'supplier' || userData.org_type === 'supplier') {
        navigate('/supplier-assessment/supplier');
      } else {
        navigate('/dashboard');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed');
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

      <section className="flex items-center justify-center bg-[#ccefe8] px-6 py-12 sm:px-10 lg:min-h-screen lg:px-14" data-testid="login-form-panel">
        <div className="w-full max-w-md" data-testid="login-form-container">
          <div className="border border-[#d9e6e0] bg-white p-6 shadow-[0_18px_45px_rgba(19,87,87,0.13)] sm:p-9" data-testid="login-card">
            <div className="mb-8 flex flex-col items-center text-center" data-testid="login-brand-block">
              <img src={logoUrl} alt="SustainRepo Logo" className="w-16 h-16 rounded-full" data-testid="login-logo" />
              <h1 className="mb-2 mt-5 text-4xl font-heading font-bold text-text-primary" data-testid="login-title">SustainRepo</h1>
              <p className="text-sm text-text-secondary" data-testid="login-subtitle">Carbon Emissions Management Platform</p>
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
                  className="h-12 border-[#b9dada] bg-white/90"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="login-password" data-testid="login-password-label">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="login-password-input"
                  className="h-12 border-[#b9dada] bg-white/90"
                />
              </div>
              
              <Button
                type="submit"
                className="h-12 w-full rounded-lg bg-primary text-white transition-colors hover:bg-primary/90"
                disabled={loading}
                data-testid="login-submit-button"
              >
                {loading ? 'Logging in...' : 'Login'}
              </Button>
            </form>
            
            <div className="mt-6 space-y-3 text-left" data-testid="login-account-links">
              <Link to="/forgot-password" className="block text-sm text-primary transition-colors hover:text-primary/80" data-testid="login-forgot-password-link">
                Forgot your password?
              </Link>
              <p className="text-sm text-text-muted" data-testid="login-contact-signup-text">
                Haven&apos;t registered yet? Contact us to sign up{' '}
                <a 
                  href="https://sustainrepo.com/contact"
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 font-medium underline"
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