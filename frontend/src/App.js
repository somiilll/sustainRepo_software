import React from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { OrganizationProvider } from './contexts/OrganizationContext';
import { Toaster } from './components/ui/sonner';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Facilities from './pages/Facilities';
import Emissions from './pages/Emissions';
import Sinks from './pages/Sinks';
import BaseYearEmissions from './pages/BaseYearEmissions';
import BaseYearAndTargets from './pages/BaseYearAndTargets';
import Reports from './pages/Reports';
import MISReports from './pages/MISReports';
import UserManagement from './pages/UserManagement';
import OrganizationDetails from './pages/OrganizationDetails';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import OrganizationManagement from './pages/OrganizationManagement';
import AdminManagement from './pages/AdminManagement';
import EmissionFactors from './pages/EmissionFactors';
import FuelDatabase from './pages/FuelDatabase';
import Units from './pages/Units';
import Sectors from './pages/Sectors';
import GWPConfiguration from './pages/GWPConfiguration';
import CurrencyConversion from './pages/CurrencyConversion';
import ProcessTemplates from './pages/ProcessTemplates';
import ScopeCategoryManagement from './pages/ScopeCategoryManagement';
import CalculationSandbox from './pages/CalculationSandbox';
import VariableRegistry from './pages/VariableRegistry';
import PropertySourceMapping from './pages/PropertySourceMapping';
import FormulaBuilder from './pages/FormulaBuilder';
import DecisionTreeEditor from './pages/DecisionTreeEditor';
import CalcEngineUnits from './pages/CalcEngineUnits';
import InputFieldMapping from './pages/InputFieldMapping';
import DynamicEmissionsTest from './pages/DynamicEmissionsTest';
import Profile from './pages/Profile';
import Scope3EF from './pages/Scope3EF';
import AuditTrails from './pages/AuditTrails';
import BulkUpload from './pages/BulkUpload';
import Environment from './pages/Environment';
import OrgEnvironmentKPI from './pages/OrgEnvironmentKPI';
import OrgSectionKPI from './pages/OrgSectionKPI';
import Social from './pages/Social';
import HRWorkforce from './pages/HRWorkforce';
import SBTiTargets from './pages/SBTiTargets';
import RepoPilot from './pages/RepoPilot';
import Governance from './pages/Governance';
import ESGConfig from './pages/ESGConfig';
import KPIDefinitions from './pages/KPIDefinitions';
import Reporting from './pages/Reporting';
import BRSRModule from './components/BRSRModule';
import GRIModule from './components/GRIModule';
import Layout from './components/Layout';
import PasswordChangeModal from './components/PasswordChangeModal';
import ApproverQueue from './components/ApproverQueue';
import MyAssignments from './pages/MyAssignments';
import PlaceholderPage from './pages/PlaceholderPage';
import GHGAnalysis from './pages/GHGAnalysis';
import EnvironmentAnalysis from './pages/EnvironmentAnalysis';
import EnergyAnalysis from './pages/EnergyAnalysis';
import WaterAnalysis from './pages/WaterAnalysis';
import WasteAnalysis from './pages/WasteAnalysis';
import SocialAnalysis from './pages/SocialAnalysis';
import GovernanceAnalysis from './pages/GovernanceAnalysis';
import MaterialityAssessment from './pages/MaterialityAssessment';
import ESGTargetsTab from './components/ESGTargetsTab';
import WorkflowApproverQueue from './pages/WorkflowApproverQueue';
import WorkflowTracker from './pages/WorkflowTracker';
import WorkflowMyTask from './pages/WorkflowMyTask';
import PeerBenchmarking from './pages/PeerBenchmarking';
import SupplierAssessmentSuppliers from './pages/SupplierAssessmentSuppliers';
import SupplierAssessmentESG from './pages/SupplierAssessmentESG';
import SupplierAssessmentGHG from './pages/SupplierAssessmentGHG';
import SupplierAssessmentRanking from './pages/SupplierAssessmentRanking';
import SupplierDocumentsAdmin from './modules/supplier-assessment/SupplierDocumentsAdmin';
import SupplierDocuments from './modules/supplier-assessment/SupplierDocuments';
import SupplierTrainingAdmin from './modules/supplier-assessment/SupplierTrainingAdmin';
import SupplierTraining from './modules/supplier-assessment/SupplierTraining';
import SupplierGHGSubmission from './modules/supplier-assessment/SupplierGHGSubmission';
import SupplierAssessmentAdminLayout from './modules/supplier-assessment/SupplierAssessmentAdminLayout';
import SupplierPortalDashboard from './pages/SupplierPortalDashboard';
import SupplierPortalESG from './pages/SupplierPortalESG';
import SupplierPortalQuestionnaire from './pages/SupplierPortalQuestionnaire';
import SupplierFacilitySetup from './modules/supplier-assessment/SupplierFacilitySetup';
// SupplierPortalEmissions removed - suppliers use main GHG Emissions flow
import OCRInvoice from './pages/OCRInvoice';
import SustainabilityConfig from './pages/SustainabilityConfig';
import { OCRProvider } from './contexts/OCRContext';
import { SupplierAssessmentPeriodProvider } from './contexts/SupplierAssessmentPeriodContext';
import { initializeCategoryModules } from './modules/emissions';

// Initialize the emissions Category Registry once at app boot.
// Pure registration step — does not alter any existing business logic.
initializeCategoryModules();

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
        <Route path="/login" element={user ? <Navigate to={user.role === 'super_admin' ? '/super-admin' : user.org_type === 'supplier' ? '/supplier-assessment/supplier' : '/dashboard'} replace /> : <Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/" element={user ? <Navigate to={user.role === 'super_admin' ? '/super-admin' : user.org_type === 'supplier' ? '/supplier-assessment/supplier' : '/dashboard'} replace /> : <Navigate to="/login" replace />} />
        
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
            <Route path="fuel-database" element={
              <SuperAdminRoute>
                <FuelDatabase />
              </SuperAdminRoute>
            } />
            <Route path="scope3-ef" element={
              <SuperAdminRoute>
                <Scope3EF />
              </SuperAdminRoute>
            } />
            <Route path="units" element={
              <SuperAdminRoute>
                <Units />
              </SuperAdminRoute>
            } />
            <Route path="sectors" element={
              <SuperAdminRoute>
                <Sectors />
              </SuperAdminRoute>
            } />
            <Route path="gwp-config" element={
              <SuperAdminRoute>
                <GWPConfiguration />
              </SuperAdminRoute>
            } />
            <Route path="currency-conversion" element={
              <SuperAdminRoute>
                <CurrencyConversion />
              </SuperAdminRoute>
            } />
            <Route path="process-templates" element={
              <SuperAdminRoute>
                <ProcessTemplates />
              </SuperAdminRoute>
            } />
            <Route path="scopes-categories" element={
              <SuperAdminRoute>
                <ScopeCategoryManagement />
              </SuperAdminRoute>
            } />
            <Route path="calc-sandbox" element={
              <SuperAdminRoute>
                <CalculationSandbox />
              </SuperAdminRoute>
            } />
            <Route path="variable-registry" element={
              <SuperAdminRoute>
                <VariableRegistry />
              </SuperAdminRoute>
            } />
            <Route path="property-sources" element={
              <SuperAdminRoute>
                <PropertySourceMapping />
              </SuperAdminRoute>
            } />
            <Route path="formula-builder" element={
              <SuperAdminRoute>
                <FormulaBuilder />
              </SuperAdminRoute>
            } />
            <Route path="decision-trees" element={
              <SuperAdminRoute>
                <DecisionTreeEditor />
              </SuperAdminRoute>
            } />
            <Route path="calc-engine-units" element={
              <SuperAdminRoute>
                <CalcEngineUnits />
              </SuperAdminRoute>
            } />
            <Route path="input-field-mapping" element={
              <SuperAdminRoute>
                <InputFieldMapping />
              </SuperAdminRoute>
            } />
            <Route path="esg-config" element={
              <SuperAdminRoute>
                <ESGConfig />
              </SuperAdminRoute>
            } />
            <Route path="kpi-definitions" element={
              <SuperAdminRoute>
                <KPIDefinitions />
              </SuperAdminRoute>
            } />
            <Route path="org-config" element={
              <SuperAdminRoute>
                <SustainabilityConfig />
              </SuperAdminRoute>
            } />
          </Route>
          
          {/* Admin & User Routes */}
          <Route path="organization" element={<OrganizationDetails />} />
          <Route path="facilities" element={<Facilities />} />
          <Route path="emissions" element={<Navigate to="/ghg/scope1" replace />} />
          <Route path="ghg" element={<Emissions />} />
          <Route path="ghg/scope1" element={<Emissions />} />
          <Route path="ghg/scope2" element={<Emissions />} />
          <Route path="ghg/scope3" element={<Emissions />} />
          <Route path="ghg/biogenic" element={<Emissions />} />
          <Route path="emissions/dynamic" element={<DynamicEmissionsTest />} />
          <Route path="bulk-upload" element={<BulkUpload />} />
          <Route path="ghg/analysis" element={<GHGAnalysis />} />
          <Route path="sinks" element={<Sinks />} />
          <Route path="base-year-emissions" element={<BaseYearAndTargets />} />
          <Route path="environment" element={<Environment />} />
          <Route path="environment/energy" element={<Environment preFilterCategory="Energy" />} />
          <Route path="environment/water" element={<Environment preFilterCategory="Water" />} />
          <Route path="environment/waste" element={<Environment preFilterCategory="Waste" />} />
          <Route path="environment/biodiversity" element={<Environment preFilterCategory="Biodiversity" />} />
          <Route path="environment/others" element={<Environment preFilterCategory="Others" />} />
          <Route path="environment/analysis" element={<EnvironmentAnalysis />} />
          <Route path="environment/energy/analysis" element={<EnergyAnalysis />} />
          <Route path="environment/water/analysis" element={<WaterAnalysis />} />
          <Route path="environment/waste/analysis" element={<WasteAnalysis />} />
          {/* Catch-all for org-specific environment modules (Power, Steam, etc.) */}
          <Route path="environment/:moduleCode/:subcatCode" element={<OrgEnvironmentKPI />} />
          <Route path="environment/:moduleCode" element={<OrgEnvironmentKPI />} />
          <Route path="social" element={<Social />} />
          <Route path="social/analysis" element={<SocialAnalysis />} />
          {/* Catch-all for org-specific social modules */}
          <Route path="social/:moduleCode/:subcatCode" element={<OrgSectionKPI section="social" />} />
          <Route path="social/:moduleCode" element={<OrgSectionKPI section="social" />} />
          <Route path="hr-workforce" element={<HRWorkforce />} />
          <Route path="governance" element={<Governance />} />
          <Route path="governance/analysis" element={<GovernanceAnalysis />} />
          {/* Catch-all for org-specific governance modules */}
          <Route path="governance/:moduleCode/:subcatCode" element={<OrgSectionKPI section="governance" />} />
          <Route path="governance/:moduleCode" element={<OrgSectionKPI section="governance" />} />
          <Route path="reporting" element={<Reporting />} />
          <Route path="reporting/brsr" element={<BRSRModule />} />
          <Route path="reporting/gri" element={<GRIModule />} />
          <Route path="reporting/materiality" element={<PlaceholderPage title="Materiality Assessment" />} />
          <Route path="materiality" element={<MaterialityAssessment />} />
          <Route path="workflow/tracker" element={<WorkflowTracker />} />
          <Route path="workflow/my-task" element={<WorkflowMyTask />} />
          <Route path="workflow/approver-queue" element={<WorkflowApproverQueue />} />
          <Route path="uploads/ghg-entry" element={<Emissions />} />
          <Route path="ghg/base-year" element={<BaseYearEmissions />} />
          <Route path="uploads/bulk" element={<BulkUpload />} />
          <Route path="uploads/ocr" element={<OCRInvoice />} />
          <Route path="uploads/kpi-metrics" element={<PlaceholderPage title="KPI Metrics" />} />
          <Route path="targets/voluntary/environment" element={<ESGTargetsTab section="environment" />} />
          <Route path="targets/voluntary/social" element={<ESGTargetsTab section="social" />} />
          <Route path="targets/voluntary/governance" element={<ESGTargetsTab section="governance" />} />
          <Route path="targets/sbti" element={<SBTiTargets />} />
          <Route path="repo-pilot" element={<RepoPilot />} />
          <Route path="my-assignments" element={<Navigate to="/workflow/my-task" replace />} />
          <Route path="approver-queue" element={<Navigate to="/workflow/approver-queue" replace />} />
          <Route path="bulk-upload" element={<Navigate to="/uploads/bulk" replace />} />
          <Route path="base-year-emissions" element={<Navigate to="/targets/voluntary/environment" replace />} />
          <Route path="targets/voluntary/ghg" element={<Navigate to="/targets/voluntary/environment" replace />} />
          <Route path="reports" element={<Reports />} />
          <Route path="mis-reports" element={<MISReports />} />
          <Route path="peer-benchmarking" element={<PeerBenchmarking />} />
          
          {/* Supplier Assessment Routes (Customer Admin) */}
          <Route path="supplier-assessment" element={<AdminRoute><SupplierAssessmentPeriodProvider><SupplierAssessmentAdminLayout /></SupplierAssessmentPeriodProvider></AdminRoute>}>
            <Route path="suppliers" element={<SupplierAssessmentSuppliers />} />
            <Route path="esg" element={<SupplierAssessmentESG />} />
            <Route path="ghg" element={<SupplierAssessmentGHG />} />
            <Route path="ranking" element={<SupplierAssessmentRanking />} />
            <Route path="documents" element={<SupplierDocumentsAdmin />} />
            <Route path="trainings" element={<SupplierTrainingAdmin />} />
          </Route>
          
          {/* Supplier Portal Routes (Supplier Users) */}
          <Route path="supplier-assessment/supplier" element={<SupplierPortalDashboard />} />
          <Route path="supplier-assessment/supplier/facility" element={<SupplierFacilitySetup />} />
          <Route path="supplier-assessment/supplier/esg" element={<SupplierPortalESG />} />
          <Route path="supplier-assessment/questionnaire/:questionnaireId" element={<SupplierPortalQuestionnaire />} />
          <Route path="supplier-assessment/documents/review" element={<SupplierDocuments />} />
          <Route path="supplier-assessment/training" element={<SupplierTraining />} />
          <Route path="supplier-assessment/emissions" element={<SupplierGHGSubmission />} />
          
          <Route path="users" element={
            <AdminRoute>
              <UserManagement />
            </AdminRoute>
          } />
          <Route path="audit-trails" element={
            <AdminRoute>
              <AuditTrails />
            </AdminRoute>
          } />
          <Route path="sustainability-config" element={
            <SuperAdminRoute>
              <SustainabilityConfig />
            </SuperAdminRoute>
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
      <OrganizationProvider>
        <OCRProvider>
          <BrowserRouter>
            <div className="App">
              <AppRoutes />
              <Toaster position="top-right" />
            </div>
          </BrowserRouter>
        </OCRProvider>
      </OrganizationProvider>
    </AuthProvider>
  );
}

export default App;