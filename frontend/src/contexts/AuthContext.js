import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);
  const [subscriptionExpiryDate, setSubscriptionExpiryDate] = useState(null);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        try {
          const response = await axios.get(`${API}/auth/me`, {
            headers: { Authorization: `Bearer ${storedToken}` }
          });
          setUser(response.data);
          setToken(storedToken);
          
          // Check subscription status for admin/user
          if (response.data.role === 'admin' || response.data.role === 'user') {
            checkSubscriptionStatus(storedToken);
          }
        } catch (error) {
          console.error('Auth init failed:', error);
          localStorage.removeItem('token');
          setToken(null);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const checkSubscriptionStatus = async (authToken) => {
    try {
      const response = await axios.get(`${API}/organizations/my`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const org = response.data;
      if (org.subscription_expires_at) {
        const expiryDate = new Date(org.subscription_expires_at);
        const today = new Date();
        setSubscriptionExpiryDate(expiryDate);
        setSubscriptionExpired(expiryDate <= today);
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  };

  const login = async (email, password) => {
    const response = await axios.post(`${API}/auth/login`, { email, password });
    const { access_token, user: userData } = response.data;
    localStorage.setItem('token', access_token);
    setToken(access_token);
    setUser(userData);
    
    // Check subscription for admin/user after login
    if (userData.role === 'admin' || userData.role === 'user') {
      checkSubscriptionStatus(access_token);
    }
    
    return userData;
  };

  const signup = async (email, password, full_name, role = 'user') => {
    const response = await axios.post(`${API}/auth/signup`, {
      email,
      password,
      full_name,
      role
    });
    const { access_token, user: userData } = response.data;
    localStorage.setItem('token', access_token);
    setToken(access_token);
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const getAuthHeader = () => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  return (
    <AuthContext.Provider value={{ user, token, login, signup, logout, loading, getAuthHeader, subscriptionExpired, subscriptionExpiryDate }}>
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