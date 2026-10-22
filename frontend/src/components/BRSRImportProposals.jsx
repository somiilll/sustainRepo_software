import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { DatabaseZap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '../contexts/AuthContext';
import { Badge } from './ui/badge';
import { BRSRImportProposalCard } from './BRSRImportProposalCard';


const API = process.env.REACT_APP_BACKEND_URL;


export const BRSRImportProposals = ({ reportingPeriod, isEditing, onResponseUpdated }) => {
  const { getAuthHeader } = useAuth();
  const [proposals, setProposals] = useState([]);
  const [counts, setCounts] = useState({ total: 0, pending: 0, stale: 0, accepted: 0 });
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const loadProposals = useCallback(async () => {
    if (!reportingPeriod) return;
    setLoading(true);
    try {
      const response = await axios.get(`${API}/api/brsr-report/import-proposals`, {
        params: { reporting_period: reportingPeriod },
        headers: getAuthHeader(),
      });
      setProposals(response.data.proposals || []);
      setCounts(response.data.counts || {});
    } catch (error) {
      console.error('Failed to load BRSR import proposals:', error);
      toast.error(error.response?.data?.detail || 'Failed to load KPI import proposals');
    } finally {
      setLoading(false);
    }
  }, [reportingPeriod, getAuthHeader]);

  useEffect(() => { loadProposals(); }, [loadProposals]);

  const decide = async (proposal, action, editedValue = null) => {
    setBusyId(proposal.mapping_id);
    try {
      await axios.post(
        `${API}/api/brsr-report/import-proposals/${proposal.mapping_id}/decision`,
        {
          action,
          source_fingerprint: proposal.source_fingerprint,
          edited_value: editedValue,
        },
        { params: { reporting_period: reportingPeriod }, headers: getAuthHeader() },
      );
      toast.success(action === 'reject' ? 'Proposal rejected' : 'BRSR response updated');
      await loadProposals();
      if (action !== 'reject') onResponseUpdated?.();
      return true;
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not review this proposal');
      if (error.response?.status === 409) await loadProposals();
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const actionableCount = useMemo(() => (counts.pending || 0) + (counts.stale || 0), [counts]);

  return (
    <section className="overflow-hidden border-y border-stone-200 bg-stone-50/70" data-testid="brsr-import-proposals-section">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="border border-emerald-200 bg-emerald-50 p-2 text-emerald-800">
            <DatabaseZap className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-stone-950" data-testid="brsr-import-proposals-title">KPI import proposals</h2>
              <Badge variant="outline" data-testid="brsr-import-proposals-period">{reportingPeriod}</Badge>
            </div>
            <p className="mt-1 text-xs text-stone-500" data-testid="brsr-import-proposals-summary">
              {actionableCount} awaiting review · {counts.accepted || 0} accepted
            </p>
          </div>
        </div>
        {!isEditing && actionableCount > 0 && (
          <Badge className="bg-amber-100 text-amber-800" data-testid="brsr-import-edit-mode-notice">Enable Edit to review</Badge>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center border-t border-stone-200 py-8" data-testid="brsr-import-proposals-loading">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-emerald-700" />
          <span className="text-sm text-stone-600">Loading KPI proposals...</span>
        </div>
      ) : proposals.length === 0 ? (
        <div className="border-t border-stone-200 px-4 py-6 text-sm text-stone-500" data-testid="brsr-import-proposals-empty">
          No KPI proposals are available for this reporting period.
        </div>
      ) : (
        <div className="grid gap-3 border-t border-stone-200 p-3 lg:grid-cols-2" data-testid="brsr-import-proposals-list">
          {proposals.map((proposal) => (
            <BRSRImportProposalCard
              key={proposal.mapping_id}
              proposal={proposal}
              isEditing={isEditing}
              busy={busyId === proposal.mapping_id}
              onDecision={decide}
            />
          ))}
        </div>
      )}
    </section>
  );
};