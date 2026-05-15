import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

const LOGO_URL = 'https://customer-assets.emergentagent.com/job_d67b5362-a184-47b7-81eb-abb9d39b89dd/artifacts/qllw2r8k_Logo_v3.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
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
    <div className="min-h-screen flex" style={{ backgroundImage: 'url(https://customer-assets.emergentagent.com/job_d67b5362-a184-47b7-81eb-abb9d39b89dd/artifacts/oemf5qmw_Gemini_Generated_Image_pd3pitpd3pitpd3p.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/20">
            <div className="flex items-center justify-center mb-6">
              <img src={LOGO_URL} alt="SustainRepo Logo" className="w-16 h-16 rounded-full" />
            </div>
            
            <h1 className="text-3xl font-heading font-bold text-center mb-2 text-text-primary">SustainRepo</h1>
            <p className="text-center text-text-secondary mb-8">Carbon Emissions Management Platform</p>
            
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="login-email-input"
                  className="h-12 bg-stone-50"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="login-password-input"
                  className="h-12 bg-stone-50"
                />
              </div>
              
              <Button
                type="submit"
                className="w-full h-12 bg-primary hover:bg-primary/90 text-white rounded-full transition-all active:scale-95"
                disabled={loading}
                data-testid="login-submit-button"
              >
                {loading ? 'Logging in...' : 'Login'}
              </Button>
            </form>
            
            <div className="mt-6 text-center space-y-3">
              <Link to="/forgot-password" className="text-sm text-primary hover:text-primary/80 transition-colors block">
                Forgot your password?
              </Link>
              <p className="text-sm text-text-muted">
                Haven't registered yet? Contact us to sign up{' '}
                <a 
                  href="https://sustainrepo.com/contact" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 font-medium underline"
                >
                  here
                </a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}