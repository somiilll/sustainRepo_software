import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { toast } from 'sonner';
import { Leaf, ArrowLeft, Mail } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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
    <div className="min-h-screen flex" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1748966006043-3df544d90770?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODl8MHwxfHNlYXJjaHwxfHx3aW5kJTIwdHVyYmluZXMlMjBncmVlbiUyMGdyYXNzfGVufDB8fHx8MTc3MDg3OTU0Mnww&ixlib=rb-4.1.0&q=85)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Card className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/20">
            <div className="flex items-center justify-center mb-6">
              <div className="bg-primary p-3 rounded-full">
                <Leaf className="w-8 h-8 text-white" />
              </div>
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

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-800">
                <strong>Note:</strong> Email notifications require SMTP configuration. If you don't receive an email, please contact your system administrator.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}