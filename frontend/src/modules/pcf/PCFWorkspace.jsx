import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Factory, PackageSearch } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { buildPcfWorkspaceDocument } from './pcfWorkspaceAdapter';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const PCFWorkspace = () => {
  const { getAuthHeader } = useAuth();
  const [context, setContext] = useState(null);
  const [template, setTemplate] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const frameRef = useRef(null);

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
    template ? buildPcfWorkspaceDocument(template, { organization: context?.organization || null, facility: null }) : ''
  ), [context?.organization, template]);

  useEffect(() => {
    if (!frameRef.current?.contentWindow || !context) return;
    frameRef.current.contentWindow.postMessage(
      { type: 'sustainrepo-pcf-context', context: { organization: context.organization, facility: selectedFacility } },
      window.location.origin,
    );
  }, [context, selectedFacility]);

  if (loading) return <main className="flex min-h-[60vh] items-center justify-center" data-testid="pcf-workspace-loading"><PackageSearch className="h-7 w-7 animate-pulse text-emerald-700" aria-hidden="true" /></main>;
  if (error) return <main className="mx-auto max-w-2xl px-4 py-12" data-testid="pcf-workspace-error"><p className="text-sm text-red-700" role="alert" data-testid="pcf-workspace-error-message">{error}</p><Button className="mt-4" onClick={loadWorkspace} data-testid="pcf-workspace-retry-button">Retry</Button></main>;

  return (
    <main className="min-w-0 bg-slate-50 px-4 py-6 sm:px-6" data-testid="pcf-workspace-page">
      <section className="mx-auto max-w-[1600px]" data-testid="pcf-workspace-shell">
        <header className="mb-5 flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between" data-testid="pcf-workspace-header">
          <div><p className="text-xs font-semibold uppercase text-emerald-700" data-testid="pcf-workspace-eyebrow">PCF</p><h1 className="mt-1 text-3xl font-bold text-slate-950 sm:text-4xl" data-testid="pcf-workspace-title">Product Carbon Footprint Studio</h1><p className="mt-2 text-sm text-slate-600" data-testid="pcf-organization-context">{context.organization.name}</p></div>
          <label className="grid gap-1 text-sm font-medium text-slate-700" data-testid="pcf-facility-selector-label"><span className="flex items-center gap-2"><Factory className="h-4 w-4" aria-hidden="true" />Facility context</span><select value={facilityId} onChange={(event) => setFacilityId(event.target.value)} className="h-10 min-w-[240px] border border-slate-300 bg-white px-3 text-sm text-slate-900" data-testid="pcf-facility-selector"><option value="">Organization level</option>{context.facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}{facility.country ? ` · ${facility.country}` : ''}</option>)}</select></label>
        </header>
        <div className="overflow-hidden border border-slate-200 bg-white shadow-sm" data-testid="pcf-workspace-frame-container"><iframe ref={frameRef} title="Product Carbon Footprint Studio" srcDoc={workspaceDocument} className="h-[calc(100vh-14rem)] min-h-[720px] w-full border-0" data-testid="pcf-workspace-frame" /></div>
      </section>
    </main>
  );
};