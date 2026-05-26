/**
 * ApprovalSection — admin-only Approvals & Rejections workspace.
 *
 * Three tabs: Pending | Approved | Rejected. Reuses ApprovalTable for all
 * three. Pending tab adds bulk-action toolbar via ApprovalActions.
 */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../../components/ui/tabs';
import { Button } from '../../../components/ui/button';
import { CheckCircle2, XCircle, Edit as EditIcon } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import useGHGPermissions from '../hooks/useGHGPermissions';
import usePendingApprovals from '../hooks/usePendingApprovals';
import useApprovalActions from '../hooks/useApprovalActions';
import ApprovalTable from '../components/ApprovalTable';
import ApprovalActions from '../components/ApprovalActions';
import ViewApprovalDialog from '../components/ViewApprovalDialog';
import { getRequestType, getScope } from '../utils/approvalSchema';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ApprovalSection() {
  const navigate = useNavigate();
  const perms = useGHGPermissions();
  const { getAuthHeader } = useAuth();
  const [activeTab, setActiveTab] = useState('pending');
  const [facilities, setFacilities] = useState([]);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState('');
  const [facilityFilter, setFacilityFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [viewing, setViewing] = useState(null);

  const pending = usePendingApprovals({ enabled: perms.canViewApprovals, status: 'pending' });
  const rejected = usePendingApprovals({ enabled: perms.canViewApprovals, status: 'rejected' });

  const refetchAll = async () => {
    setSelectedIds([]);
    await Promise.all([pending.refetch(), rejected.refetch()]);
  };

  const actions = useApprovalActions({ onSettled: refetchAll });

  useEffect(() => {
    if (!perms.canViewApprovals) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/facilities`, { headers: getAuthHeader() });
        if (!cancelled) setFacilities(data || []);
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [perms.canViewApprovals, getAuthHeader]);

  // Reset selection when switching tabs.
  useEffect(() => { setSelectedIds([]); }, [activeTab]);

  const tabRows = useMemo(() => {
    if (activeTab === 'pending') return pending.items;
    return rejected.items;
  }, [activeTab, pending.items, rejected.items]);

  const onToggleSelect = (id, checked) => {
    setSelectedIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  };
  const onToggleSelectAll = (rows, checked) => {
    setSelectedIds((prev) => {
      const ids = rows.map((r) => r.id);
      return checked
        ? [...new Set([...prev, ...ids])]
        : prev.filter((x) => !ids.includes(x));
    });
  };

  if (perms.loading) {
    return <div className="p-8 text-text-muted">Loading…</div>;
  }
  if (!perms.canViewApprovals) {
    return (
      <div className="p-8">
        <h2 className="text-2xl font-heading font-bold mb-2">Approvals</h2>
        <p className="text-text-muted">
          Approval workflow is not enabled for your organization, or you don't have permission to view this page.
        </p>
      </div>
    );
  }

  const targetIds = selectedIds.length
    ? selectedIds
    : (activeTab === 'pending' ? pending.items.map((r) => r.id) : []);

  // Map a request's scope to the workspace route that hosts its edit dialog.
  const scopeToRoute = (scope) => {
    if (scope === 'scope2') return '/ghg/scope2';
    if (scope === 'scope3') return '/ghg/scope3';
    if (scope === 'biogenic') return '/ghg/biogenic';
    return '/ghg/scope1';
  };

  // Per-row actions render.
  const renderRowActions = (r) => {
    const requestType = getRequestType(r);
    const isDeleteRequest = requestType === 'delete';
    const scope = getScope(r);
    return (
    <>
      {activeTab === 'pending' && (
        isDeleteRequest ? (
          // For delete requests, show View button instead of Edit
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-blue-600 hover:text-blue-700"
            title="View details"
            onClick={() => setViewing(r)}
            data-testid={`approval-view-${r.id}`}
          >
            View
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            title="Edit & approve"
            onClick={() => navigate(`${scopeToRoute(scope)}?edit=${r.id}`)}
            data-testid={`approval-edit-${r.id}`}
          >
            <EditIcon className="w-3.5 h-3.5 text-stone-600" />
          </Button>
        )
      )}
      {activeTab === 'pending' && (
        <>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700"
            title="Approve"
            onClick={() => actions.approveOne(r.id, null)}
            disabled={actions.busy}
            data-testid={`approval-approve-${r.id}`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
            title="Reject"
            onClick={() => setViewing({ ...r, _quickReject: true })}
            disabled={actions.busy}
            data-testid={`approval-reject-${r.id}`}
          >
            <XCircle className="w-3.5 h-3.5" />
          </Button>
        </>
      )}
    </>
  );
  };

  return (
    <div className="space-y-6" data-testid="approvals-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Approvals</h1>
          <p className="text-text-secondary">Review and decide on emission record submissions.</p>
        </div>
        {activeTab === 'pending' && (
          <ApprovalActions
            selectedIds={targetIds}
            busy={actions.busy}
            onApproveSelected={(comment) => actions.approveMany(targetIds, comment)}
            onRejectSelected={(comment) => actions.rejectMany(targetIds, comment)}
          />
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="pending" data-testid="approvals-tab-pending">
            Pending {pending.count > 0 ? `(${pending.count})` : ''}
          </TabsTrigger>
          <TabsTrigger value="rejected" data-testid="approvals-tab-rejected">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <ApprovalTable
            activeTab={activeTab}
            rows={tabRows}
            facilities={facilities}
            selectable={activeTab === 'pending'}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            onToggleSelectAll={onToggleSelectAll}
            perRowActions={renderRowActions}
            emptyText={
              activeTab === 'pending' ? 'No pending requests' : 'No rejected requests'
            }
            searchValue={search}
            onSearchChange={setSearch}
            scopeFilter={scopeFilter}
            onScopeFilterChange={setScopeFilter}
            facilityFilter={facilityFilter}
            onFacilityFilterChange={setFacilityFilter}
          />
        </TabsContent>
      </Tabs>

      <ViewApprovalDialog
        request={viewing}
        facilities={facilities}
        onClose={() => setViewing(null)}
        onApprove={async (id) => { await actions.approveOne(id, null); setViewing(null); }}
        onReject={async (id, comment) => { await actions.rejectOne(id, comment); setViewing(null); }}
        busy={actions.busy}
        canDecide={activeTab === 'pending' && perms.canApprove}
        defaultMode={viewing?._quickReject ? 'reject' : 'view'}
      />
    </div>
  );
}
