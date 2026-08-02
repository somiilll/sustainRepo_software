/**
 * SupplierEmissionsForm - Full GHG Emissions form for Supplier Assessment
 * 
 * This component embeds the same EmissionEntryForm used in the main GHG module,
 * but replaces facility selection with the supplier organization.
 * 
 * Features:
 * - Full multi-step emission entry wizard
 * - Fuel database integration with emission factors
 * - CalcEngine integration for calculations
 * - Scope 1 and Scope 2 support (no Scope 3 for suppliers)
 * - Monthly/Yearly data entry
 * - Edit with live recalculation
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Plus, Cloud, Loader2, Edit2, Trash2, AlertCircle } from 'lucide-react';
import EmissionEntryForm from '../../components/EmissionEntryForm';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SupplierEmissionsForm() {
  const { getAuthHeader, user } = useAuth();
  
  // Assessment and relationship data
  const [assessment, setAssessment] = useState(null);
  const [supplierOrg, setSupplierOrg] = useState(null);
  
  // Core emissions data (same as main GHG module)
  const [fuelDatabase, setFuelDatabase] = useState([]);
  const [formulaDefinitions, setFormulaDefinitions] = useState([]);
  const [formulaParameters, setFormulaParameters] = useState([]);
  const [emissionConfigurations, setEmissionConfigurations] = useState([]);
  const [centralizedUnits, setCentralizedUnits] = useState([]);
  const [gwpConfig, setGwpConfig] = useState(null);
  const [processTemplates, setProcessTemplates] = useState([]);
  const [dynamicScopes, setDynamicScopes] = useState([]);
  const [dynamicCategories, setDynamicCategories] = useState([]);
  const [configLabels, setConfigLabels] = useState({
    calculation_methods: {},
    calculation_methods_short: {},
    subcategories: {},
    product_types: {},
    scopes: {}
  });
  
  // Emissions records
  const [emissions, setEmissions] = useState([]);
  
  // UI State
  const [loading, setLoading] = useState(true);
  const [coreDataLoading, setCoreDataLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmission, setEditingEmission] = useState(null);
  const [formKey, setFormKey] = useState(0); // Key to force form remount on edit
  
  // Allowed scopes based on supplier relationship config
  const [allowedScopes, setAllowedScopes] = useState(['scope1', 'scope2']);

  // Fetch supplier assessment info
  const fetchAssessment = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/supplier-assessment/my-assessment`, {
        headers: getAuthHeader(),
      });
      setAssessment(res.data);
      
      // Extract allowed scopes from relationship config
      const rel = res.data.relationship;
      if (rel?.ghg_scopes_enabled) {
        setAllowedScopes(rel.ghg_scopes_enabled);
      }
      
      // Get supplier org info
      const orgRes = await axios.get(`${API}/organizations/my`, {
        headers: getAuthHeader(),
      });
      setSupplierOrg(orgRes.data);
      
    } catch (err) {
      if (err.response?.status !== 404) {
        toast.error('Failed to load assessment');
      }
    }
  }, [getAuthHeader]);

  // Fetch emissions records
  const fetchEmissions = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/supplier-assessment/my-assessment/emissions`, {
        headers: getAuthHeader(),
      });
      setEmissions(res.data || []);
    } catch (err) {
      console.error('Failed to fetch emissions:', err);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  // Fetch core emissions data (fuel database, formulas, units, etc.)
  const fetchCoreData = useCallback(async () => {
    setCoreDataLoading(true);
    try {
      const headers = { headers: getAuthHeader() };
      
      const [
        fuelDbRes, formulasRes, paramsRes, unitsRes, 
        configsRes, gwpRes, templatesRes, scopesRes, 
        catsRes, labelsRes
      ] = await Promise.all([
        axios.get(`${API}/fuel-database`, headers),
        axios.get(`${API}/formula-definitions`, headers).catch(() => ({ data: [] })),
        axios.get(`${API}/formula-parameters`, headers).catch(() => ({ data: [] })),
        axios.get(`${API}/calc-engine/units`, headers).catch(() => ({ data: { simple: [], compound: [] } })),
        axios.get(`${API}/emission-configurations`, headers).catch(() => ({ data: [] })),
        axios.get(`${API}/gwp-config`, headers).catch(() => ({ data: null })),
        axios.get(`${API}/process-templates`, headers).catch(() => ({ data: [] })),
        axios.get(`${API}/scopes`, headers).catch(() => ({ data: [] })),
        axios.get(`${API}/categories`, headers).catch(() => ({ data: [] })),
        axios.get(`${API}/config/labels`, headers).catch(() => ({ data: null })),
      ]);

      setFuelDatabase(fuelDbRes.data || []);
      setFormulaDefinitions(formulasRes.data || []);
      setFormulaParameters(paramsRes.data || []);
      setCentralizedUnits([...(unitsRes.data?.simple || []), ...(unitsRes.data?.compound || [])]);
      setEmissionConfigurations(configsRes.data || []);
      setGwpConfig(gwpRes.data || null);
      setProcessTemplates(templatesRes.data || []);
      
      // Store ALL scopes and categories - don't filter here
      // The UI will limit to allowed scopes, but the data structures need to be complete
      // for field mapping to work correctly
      setDynamicScopes(scopesRes.data || []);
      setDynamicCategories(catsRes.data || []);
      
      if (labelsRes.data) {
        setConfigLabels(labelsRes.data);
      }
      
    } catch (err) {
      console.error('Failed to fetch core emissions data:', err);
      toast.error('Failed to load emissions configuration');
    } finally {
      setCoreDataLoading(false);
    }
  }, [getAuthHeader]);

  useEffect(() => {
    fetchAssessment();
    fetchCoreData();
    fetchEmissions();
  }, [fetchAssessment, fetchCoreData, fetchEmissions]);

  // Create a virtual "facility" from the supplier org for the EmissionEntryForm
  const virtualFacilities = useMemo(() => {
    if (!supplierOrg) return [];
    return [{
      id: supplierOrg.id,
      name: supplierOrg.name || 'Supplier Organization',
      organization_id: supplierOrg.id,
      // Add other facility-like properties
      is_supplier_org: true,
    }];
  }, [supplierOrg]);

  // Handle clicking edit - fetch full emission record for proper hydration
  const handleEditClick = async (emission) => {
    try {
      // Fetch the full emission record to ensure we have all data
      const res = await axios.get(`${API}/emissions/${emission.id}`, {
        headers: getAuthHeader(),
      });
      const fullEmission = res.data;
      
      // Set the editing emission and increment form key to force remount
      setEditingEmission(fullEmission);
      setFormKey(prev => prev + 1);
      setDialogOpen(true);
    } catch (err) {
      console.error('Failed to fetch emission for editing:', err);
      // Fall back to using the emission from the list
      setEditingEmission(emission);
      setFormKey(prev => prev + 1);
      setDialogOpen(true);
    }
  };

  // Handle successful emission creation/update
  const handleEmissionSuccess = async () => {
    setDialogOpen(false);
    setEditingEmission(null);
    await fetchEmissions();
    toast.success('Emission record saved successfully');
  };

  // Handle closing dialog
  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingEmission(null);
  };

  // Calculate totals
  const totalScope1 = emissions
    .filter(e => e.scope === 'scope1')
    .reduce((sum, e) => sum + (e.co2e_emissions || e.total_emissions || 0), 0);
  const totalScope2 = emissions
    .filter(e => e.scope === 'scope2')
    .reduce((sum, e) => sum + (e.co2e_emissions || e.total_emissions || 0), 0);

  // Check if GHG is enabled for this supplier
  const ghgEnabled = assessment?.relationship?.modules_enabled?.includes('ghg');

  if (loading || coreDataLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-stone-500">Loading emissions data...</span>
      </div>
    );
  }

  if (!ghgEnabled) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-amber-600" />
            <div>
              <p className="font-medium text-amber-800">GHG Emissions not enabled</p>
              <p className="text-sm text-amber-700">
                GHG emissions tracking is not enabled for your supplier assessment. 
                Contact your customer if you believe this is an error.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="supplier-emissions-form">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">GHG Emissions</h1>
          <p className="text-sm text-stone-500 mt-1">
            Report your greenhouse gas emissions for {allowedScopes.includes('scope1') && 'Scope 1'}
            {allowedScopes.includes('scope1') && allowedScopes.includes('scope2') && ' and '}
            {allowedScopes.includes('scope2') && 'Scope 2'}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="add-emission-btn">
          <Plus className="h-4 w-4 mr-2" />
          Add Emission
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        {allowedScopes.includes('scope1') && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-stone-500 mb-2">
                <Cloud className="h-4 w-4" />
                <span className="text-sm">Scope 1 (Direct)</span>
              </div>
              <div className="text-2xl font-bold text-blue-600">
                {totalScope1.toFixed(2)}
                <span className="text-sm font-normal text-stone-500 ml-1">tCO₂e</span>
              </div>
            </CardContent>
          </Card>
        )}
        {allowedScopes.includes('scope2') && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-stone-500 mb-2">
                <Cloud className="h-4 w-4" />
                <span className="text-sm">Scope 2 (Indirect)</span>
              </div>
              <div className="text-2xl font-bold text-emerald-600">
                {totalScope2.toFixed(2)}
                <span className="text-sm font-normal text-stone-500 ml-1">tCO₂e</span>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-stone-500 mb-2">
              <Cloud className="h-4 w-4" />
              <span className="text-sm">Total Emissions</span>
            </div>
            <div className="text-2xl font-bold text-purple-600">
              {(totalScope1 + totalScope2).toFixed(2)}
              <span className="text-sm font-normal text-stone-500 ml-1">tCO₂e</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Emissions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Emission Records</CardTitle>
          <CardDescription>All your reported emissions in one place</CardDescription>
        </CardHeader>
        <CardContent>
          {emissions.length === 0 ? (
            <div className="text-center py-12 text-stone-500">
              <Cloud className="h-12 w-12 mx-auto text-stone-300 mb-4" />
              <p className="text-lg font-medium">No emissions recorded yet</p>
              <p className="text-sm mt-1">Click &quot;Add Emission&quot; to report your first emission record.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Fuel/Activity</TableHead>
                  <TableHead className="text-right">Emissions (tCO₂e)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emissions.map((emission) => (
                  <TableRow key={emission.id}>
                    <TableCell>{emission.reporting_period}</TableCell>
                    <TableCell>
                      <Badge variant={emission.scope === 'scope1' ? 'default' : 'secondary'}>
                        {emission.scope === 'scope1' ? 'Scope 1' : 'Scope 2'}
                      </Badge>
                    </TableCell>
                    <TableCell>{emission.category}</TableCell>
                    <TableCell>{emission.fuel_type || emission.sub_category || '-'}</TableCell>
                    <TableCell className="text-right font-mono">
                      {(emission.co2e_emissions || emission.total_emissions || 0).toFixed(4)}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={emission.approval_status === 'approved' ? 'default' : 'outline'}
                        className={emission.approval_status === 'approved' ? 'bg-green-100 text-green-800' : ''}
                      >
                        {emission.approval_status || emission.status || 'draft'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditClick(emission)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Emission Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        if (!open) handleCloseDialog();
        else setDialogOpen(open);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingEmission ? 'Edit Emission Record' : 'Add Emission Record'}
            </DialogTitle>
          </DialogHeader>
          
          {virtualFacilities.length > 0 && dialogOpen && (
            <EmissionEntryForm
              key={formKey}
              facilities={virtualFacilities}
              fuelDatabase={fuelDatabase}
              centralizedUnits={centralizedUnits}
              formulaDefinitions={formulaDefinitions}
              formulaParameters={formulaParameters}
              emissionConfigurations={emissionConfigurations}
              gwpConfig={gwpConfig}
              processTemplates={processTemplates}
              dynamicScopes={dynamicScopes}
              dynamicCategories={dynamicCategories}
              hasScope3Access={false}
              getAuthHeader={getAuthHeader}
              configLabels={configLabels}
              organization={supplierOrg}
              editingEmission={editingEmission}
              // Simplified KPI access - suppliers have full access to their allowed scopes
              hasFullKPIAccess={true}
              kpiAllowedScopes={allowedScopes}
              // Supplier context - routes API calls to supplier-assessment endpoint
              supplierContext={{
                relationshipId: assessment?.relationship?.id,
                customerOrgId: assessment?.relationship?.customer_org_id,
                supplierOrgId: supplierOrg?.id,
              }}
              onSuccess={handleEmissionSuccess}
              onCancel={handleCloseDialog}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
