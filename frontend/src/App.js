import React from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Toaster } from './components/ui/sonner';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Facilities from './pages/Facilities';
import Emissions from './pages/Emissions';
import Reports from './pages/Reports';
import UserManagement from './pages/UserManagement';
import OrganizationDetails from './pages/OrganizationDetails';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import OrganizationManagement from './pages/OrganizationManagement';
import AdminManagement from './pages/AdminManagement';
import EmissionFactors from './pages/EmissionFactors';
import Profile from './pages/Profile';
import Layout from './components/Layout';
import PasswordChangeModal from './components/PasswordChangeModal';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const SuperAdminRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user || !['admin', 'super_admin'].includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

const AppRoutes = () => {
  const { user } = useAuth();

  return (
    <>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />} />
        
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="profile" element={<Profile />} />
          
          {/* Super Admin Routes */}
          <Route path="super-admin">
            <Route index element={
              <SuperAdminRoute>
                <SuperAdminDashboard />
              </SuperAdminRoute>
            } />
            <Route path="organizations" element={
              <SuperAdminRoute>
                <OrganizationManagement />
              </SuperAdminRoute>
            } />
            <Route path="admins" element={
              <SuperAdminRoute>
                <AdminManagement />
              </SuperAdminRoute>
            } />
            <Route path="emission-factors" element={
              <SuperAdminRoute>
                <EmissionFactors />
              </SuperAdminRoute>
            } />
          </Route>
          
          {/* Admin & User Routes */}
          <Route path="organization" element={
            <AdminRoute>
              <OrganizationDetails />
            </AdminRoute>
          } />
          <Route path="facilities" element={<Facilities />} />
          <Route path="emissions" element={<Emissions />} />
          <Route path="reports" element={<Reports />} />
          <Route path="users" element={
            <AdminRoute>
              <UserManagement />
            </AdminRoute>
          } />
        </Route>
      </Routes>
      <PasswordChangeModal />
    </>
  );
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="App">
          <AppRoutes />
          <Toaster position="top-right" />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;