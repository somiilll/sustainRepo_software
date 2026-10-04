import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  clearStoredAccessToken,
  getStoredAccessToken,
  installAuthSessionInterceptors,
  refreshAccessToken,
  storeAccessToken,
} from '../lib/authSession';

const AuthContext = createContext(null);

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Inactivity timeout in milliseconds (15 minutes)
const INACTIVITY_TIMEOUT = 15 * 60 * 1000;
const ACCESS_TOKEN_REFRESH_BUFFER = 5 * 60 * 1000;

const getAccessExpiry = (accessToken) => {
  try {
    const [, payload] = accessToken.split('.');
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(getStoredAccessToken());
  const [loading, setLoading] = useState(true);
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);
  const [subscriptionExpiryDate, setSubscriptionExpiryDate] = useState(null);
  const inactivityTimerRef = useRef(null);
  const tokenRefreshTimerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());

  // Logout function
  const logout = useCallback((reason = null) => {
    clearStoredAccessToken();
    void axios.post(`${API}/auth/logout`, {}, { withCredentials: true, skipAuthRefresh: true }).catch(() => null);
    setToken(null);
    setUser(null);
    setSubscriptionExpired(false);
    setSubscriptionExpiryDate(null);
    
    // Clear inactivity timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (tokenRefreshTimerRef.current) {
      clearTimeout(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = null;
    }
    
    if (reason === 'inactivity') {
      toast.warning('You have been logged out due to inactivity.');
    } else if (reason === 'subscription_required') {
      toast.error('Subscription is required. Please contact your administrator.');
    }
  }, []);

  useEffect(() => installAuthSessionInterceptors({
    onToken: (nextToken, nextUser) => {
      setToken(nextToken);
      if (nextUser) setUser(nextUser);
    },
    onSessionExpired: () => logout(),
  }), [logout]);

  useEffect(() => {
    if (!token) return undefined;
    const expiry = getAccessExpiry(token);
    const delay = Math.max(0, (expiry || Date.now()) - Date.now() - ACCESS_TOKEN_REFRESH_BUFFER);
    tokenRefreshTimerRef.current = setTimeout(() => {
      void refreshAccessToken().catch(() => logout());
    }, delay);
    return () => clearTimeout(tokenRefreshTimerRef.current);
  }, [token, logout]);

  // Reset inactivity timer on user activity
  const resetInactivityTimer = useCallback(() => {
    if (!token || !user) return;
    
    lastActivityRef.current = Date.now();
    
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    
    inactivityTimerRef.current = setTimeout(() => {
      logout('inactivity');
    }, INACTIVITY_TIMEOUT);
  }, [token, user, logout]);

  // Set up activity listeners
  useEffect(() => {
    if (!token || !user) return;

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      resetInactivityTimer();
    };

    // Add event listeners
    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Start the initial timer
    resetInactivityTimer();

    // Cleanup
    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [token, user, resetInactivityTimer]);

  const checkSubscriptionStatus = useCallback(async (authToken, userData) => {
    // Super admin doesn't need subscription check
    if (userData?.role === 'super_admin') {
      return true;
    }
    
    try {
      const response = await axios.get(`${API}/organizations/my`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const org = response.data;
      
      // Only check subscription if it's set
      if (org.subscription_expires_at) {
        const expiryDate = new Date(org.subscription_expires_at);
        const today = new Date();
        const isExpired = expiryDate <= today;
        
        setSubscriptionExpiryDate(expiryDate);
        setSubscriptionExpired(isExpired);
        
        return !isExpired;
      } else {
        // No subscription set - allow access (subscription not configured)
        setSubscriptionExpired(false);
        setSubscriptionExpiryDate(null);
        return true;
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
      // If we can't check subscription, assume it's valid to not lock out users
      return true;
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      let storedToken = getStoredAccessToken();
      if (!storedToken) {
        try {
          storedToken = await refreshAccessToken();
          setToken(storedToken);
        } catch {
          storedToken = null;
        }
      }
      if (storedToken) {
        try {
          const response = await axios.get(`${API}/auth/me`, {
            headers: { Authorization: `Bearer ${storedToken}` }
          });
          const userData = response.data;
          
          // Fetch org_type for non-super_admin users
          if (userData.role !== 'super_admin' && userData.organization_id) {
            try {
              const orgRes = await axios.get(`${API}/organizations/my`, {
                headers: { Authorization: `Bearer ${storedToken}` }
              });
              userData.org_type = orgRes.data?.org_type || 'customer';
            } catch {
              userData.org_type = 'customer';
            }
          }
          
          setUser(userData);
          setToken(storedToken);
          
          // Check subscription status for admin/user (mandatory)
          if (userData.role === 'admin' || userData.role === 'user') {
            await checkSubscriptionStatus(storedToken, userData);
          }
        } catch (error) {
          console.error('Auth init failed:', error);
          clearStoredAccessToken();
          setToken(null);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, [checkSubscriptionStatus]);

  const login = async (email, password) => {
    const response = await axios.post(`${API}/auth/login`, { email, password }, { withCredentials: true, skipAuthRefresh: true });
    const { access_token, user: userData } = response.data;
    storeAccessToken(access_token);
    setToken(access_token);
    
    // Fetch org_type for non-super_admin users
    if (userData.role !== 'super_admin' && userData.organization_id) {
      try {
        const orgRes = await axios.get(`${API}/organizations/my`, {
          headers: { Authorization: `Bearer ${access_token}` }
        });
        userData.org_type = orgRes.data?.org_type || 'customer';
      } catch {
        userData.org_type = 'customer';
      }
    }
    
    setUser(userData);
    
    // Check subscription for admin/user after login (mandatory)
    if (userData.role === 'admin' || userData.role === 'user') {
      await checkSubscriptionStatus(access_token, userData);
    }
    
    return userData;
  };

  const signup = async (email, password, full_name, role = 'user') => {
    const response = await axios.post(`${API}/auth/signup`, {
      email,
      password,
      full_name,
      role
    }, { withCredentials: true, skipAuthRefresh: true });
    const { access_token, user: userData } = response.data;
    storeAccessToken(access_token);
    setToken(access_token);
    setUser(userData);
    return userData;
  };

  const getAuthHeader = () => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const refreshUser = async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login, signup, logout, loading, getAuthHeader, refreshUser, subscriptionExpired, subscriptionExpiryDate }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};