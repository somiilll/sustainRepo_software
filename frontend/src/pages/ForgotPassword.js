import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Mail } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const LOGO_URL = 'https://customer-assets.emergentagent.com/job_d67b5362-a184-47b7-81eb-abb9d39b89dd/artifacts/qllw2r8k_Logo_v3.png';
const BG_IMAGE = 'https://customer-assets.emergentagent.com/job_d67b5362-a184-47b7-81eb-abb9d39b89dd/artifacts/oemf5qmw_Gemini_Generated_Image_pd3pitpd3pitpd3p.png';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await axios.post(`${API}/auth/forgot-password`, {
        email,
        recovery_contact: email
      });
      setSent(true);
      toast.success('Password reset instructions sent!');
    } catch (error) {
      toast.error('Failed to send reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundImage: `url(${BG_IMAGE})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Card className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/20">
            <div className="flex items-center justify-center mb-6">
              <img src={LOGO_URL} alt="SustainRepo Logo" className="w-16 h-16 rounded-full" />
            </div>
            
            <h1 className="text-3xl font-heading font-bold text-center mb-2 text-text-primary">Forgot Password</h1>
            <p className="text-center text-text-secondary mb-8">Enter your email to receive reset instructions</p>
            
            {!sent ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 bg-stone-50"
                  />
                </div>
                
                <Button
                  type="submit"
                  className="w-full h-12 bg-primary hover:bg-primary/90 text-white rounded-full transition-all active:scale-95"
                  disabled={loading}
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </Button>

                <div className="text-center">
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Login
                  </Link>
                </div>
              </form>
            ) : (
              <div className="text-center space-y-4">
                <div className="bg-green-50 p-4 rounded-lg">
                  <Mail className="w-12 h-12 text-green-600 mx-auto mb-3" />
                  <p className="text-green-800 font-medium mb-2">Check your email</p>
                  <p className="text-sm text-green-700">
                    If an account exists for {email}, you will receive password reset instructions.
                  </p>
                </div>
                
                <div className="pt-4">
                  <p className="text-xs text-text-muted mb-4">
                    Didn't receive the email? Check your spam folder or contact your administrator.
                  </p>
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Login
                  </Link>
                </div>
              </div>
            )}

            <div className="mt-6 p-4 bg-green-50 rounded-lg">
              <p className="text-xs text-green-800">
                <strong>Tip:</strong> Make sure to check your spam folder if you don't see the email in your inbox.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}