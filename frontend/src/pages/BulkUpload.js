/**
 * BulkUpload Page — thin orchestrator over the modular bulk-upload system.
 *
 *   - Loads organization to compute available scope modules.
 *   - Renders ScopeTabSelector to switch between Scope 1 / 2 / 3.
 *   - Delegates state + API to `useBulkUpload(activeModule)`.
 *   - Composes presentational components from `/modules/bulkUpload/components/`.
 *
 * All scope-specific logic (endpoints, payload shape, response transformer,
 * file validation, template/error filenames) lives in the per-scope module
 * files under `/modules/bulkUpload/scopes/`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { History, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Module system — importing the barrel boots all scope modules into the registry.
import bulkUploadRegistry, { MODULE_STATUS } from '../modules/bulkUpload';
import { useBulkUpload } from '../modules/bulkUpload/hooks/useBulkUpload';

// Components
import ScopeTabSelector from '../modules/bulkUpload/components/ScopeTabSelector';
import UploadHistoryPanel from '../modules/bulkUpload/components/UploadHistoryPanel';
import UploadDropzone from '../modules/bulkUpload/components/UploadDropzone';
import ValidationResultsCard from '../modules/bulkUpload/components/ValidationResultsCard';
import ValidationResultsTable from '../modules/bulkUpload/components/ValidationResultsTable';
import EmptyState from '../modules/bulkUpload/components/EmptyState';
import AccessDenied from '../modules/bulkUpload/components/AccessDenied';

const API = process.env.REACT_APP_BACKEND_URL;

export default function BulkUpload() {
  const { getAuthHeader } = useAuth();
  const [organization, setOrganization] = useState(null);
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [activeScopeId, setActiveScopeId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const fetchOrg = async () => {
      try {
        const res = await axios.get(`${API}/api/organizations/my`, { headers: getAuthHeader() });
        setOrganization(res.data);
      } catch (error) {
        console.error('Failed to load organization:', error);
      } finally {
        setLoadingOrg(false);
      }
    };
    fetchOrg();
  }, [getAuthHeader]);

  const allModules = useMemo(
    () => (organization ? bulkUploadRegistry.list(organization) : []),
    [organization]
  );
  const firstAvailable = useMemo(
    () => (organization ? bulkUploadRegistry.firstAvailable(organization) : null),
    [organization]
  );

  // Default-select the first available module once org loads.
  useEffect(() => {
    if (!activeScopeId && firstAvailable) setActiveScopeId(firstAvailable.id);
  }, [firstAvailable, activeScopeId]);

  const activeModule = useMemo(
    () => allModules.find((m) => m.id === activeScopeId) || null,
    [allModules, activeScopeId]
  );

  const bu = useBulkUpload(activeModule);

  if (loadingOrg) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // No scope module is available for this org.
  const anyAvailable = allModules.some((m) => m.status === MODULE_STATUS.AVAILABLE);
  if (!anyAvailable) return <AccessDenied />;

  return (
    <div className="space-y-6" data-testid="bulk-upload-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-text-primary">Bulk Upload</h1>
          <p className="text-text-muted mt-1">
            {activeModule?.description || 'Upload GHG emissions data in bulk using Excel'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowHistory(!showHistory)} data-testid="toggle-history-btn">
            <History className="w-4 h-4 mr-2" />
            {showHistory ? 'Hide History' : 'Upload History'}
          </Button>
        </div>
      </div>

      {/* Scope Tabs */}
      <ScopeTabSelector modules={allModules} activeId={activeScopeId} onSelect={setActiveScopeId} />

      {/* Upload History */}
      {showHistory && <UploadHistoryPanel sessions={bu.sessions} />}

      {/* Upload */}
      <UploadDropzone
        activeModule={activeModule}
        uploading={bu.uploading}
        onUpload={bu.handleFileUpload}
      />

      {/* Validation Results */}
      {bu.validationResult && (
        <Card className="p-6" data-testid="validation-results">
          <ValidationResultsCard
            validationResult={bu.validationResult}
            savingRows={bu.savingRows}
            downloadingErrors={bu.downloadingErrors}
            onSave={bu.handleSaveValidRows}
            onDownloadErrors={bu.handleDownloadErrorReport}
            onDiscard={bu.handleDiscardAndUploadNew}
          />
          <ValidationResultsTable
            rows={bu.validationResult.rows}
            expandedRows={bu.expandedRows}
            onToggleExpand={bu.toggleRowExpansion}
          />
        </Card>
      )}

      {/* Empty State */}
      {!bu.validationResult && <EmptyState />}
    </div>
  );
}
