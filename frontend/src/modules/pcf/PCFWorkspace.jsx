import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { PackageSearch } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { buildPcfWorkspaceDocument } from './pcfWorkspaceAdapter';
import { PCFWorkspaceHeader } from './PCFWorkspaceHeader';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const PCFWorkspace = () => {
  const { getAuthHeader } = useAuth();
  const [context, setContext] = useState(null);
  const [template, setTemplate] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [reportingPeriod, setReportingPeriod] = useState(() => {
    const now = new Date();
    const year = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
    return `FY ${year}-${year + 1}`;
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const frameRef = useRef(null);
  const initialReportingPeriodRef = useRef(reportingPeriod);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [contextResponse, templateResponse] = await Promise.all([
        axios.get(`${API}/pcf/context`, { headers: getAuthHeader() }),
        axios.get(`${API}/pcf/workspace`, { headers: getAuthHeader(), responseType: 'text' }),
      ]);
      setContext(contextResponse.data);
      setTemplate(templateResponse.data);
    } catch (loadError) {
      setError(loadError.response?.data?.detail || 'PCF Studio could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);

  const selectedFacility = context?.facilities?.find((facility) => facility.id === facilityId) || null;
  const workspaceDocument = useMemo(() => (
    template ? buildPcfWorkspaceDocument(template, { organization: context?.organization || null, facility: null, reportingPeriod: initialReportingPeriodRef.current }) : ''
  ), [context?.organization, template]);

  useEffect(() => {
    if (!frameRef.current?.contentWindow || !context) return;
    frameRef.current.contentWindow.postMessage(
      { type: 'sustainrepo-pcf-context', context: { organization: context.organization, facility: selectedFacility, reportingPeriod } },
      window.location.origin,
    );
  }, [context, reportingPeriod, selectedFacility]);

  if (loading) return <main className="flex min-h-[60vh] items-center justify-center" data-testid="pcf-workspace-loading"><PackageSearch className="h-7 w-7 animate-pulse text-emerald-700" aria-hidden="true" /></main>;
  if (error) return <main className="mx-auto max-w-2xl px-4 py-12" data-testid="pcf-workspace-error"><p className="text-sm text-red-700" role="alert" data-testid="pcf-workspace-error-message">{error}</p><Button className="mt-4" onClick={loadWorkspace} data-testid="pcf-workspace-retry-button">Retry</Button></main>;

  return (
    <main className="space-y-7" data-testid="pcf-workspace-page">
      <section className="space-y-7" data-testid="pcf-workspace-shell">
        <PCFWorkspaceHeader facilities={context.facilities} facilityId={facilityId} onFacilityChange={setFacilityId} reportingPeriod={reportingPeriod} onReportingPeriodChange={setReportingPeriod} />
        <div data-testid="pcf-workspace-frame-container"><iframe ref={frameRef} title="Product Carbon Footprint Studio" srcDoc={workspaceDocument} className="h-[calc(100vh-10rem)] min-h-[720px] w-full border-0" data-testid="pcf-workspace-frame" /></div>
      </section>
    </main>
  );
};