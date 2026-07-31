/**
 * ApprovalTable — table view for approval requests across all status tabs.
 *
 * Shared between Pending / Approved / Rejected tabs. Caller controls:
 *   - which actions to render in the row (perRowActions prop)
 *   - whether to show selection checkboxes (selectable prop)
 *   - empty state copy
 *
 * Multi-Proposal Support:
 *   - Rows with _isGrouped=true show multiple proposals side-by-side
 *   - Each proposal displays its own qty/emissions and actions
 *   - Grouped rows show a badge indicating "X proposals"
 */
import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { Card } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Search, ChevronLeft, ChevronRight, Inbox, Users } from 'lucide-react';
import {
  getRequestType,
  getScope,
  getCategory,
  getFacilityId,
  getSnapshot,
  getRejectionReason,
} from '../utils/approvalSchema';

const PAGE_SIZE = 20;

/**
 * Extract the proposed quantity value from a pending record.
 * GHG emissions store different quantity fields depending on scope/category:
 * - Scope 1: qty, fuel_qty
 * - Scope 2: qty_energy
 * - Scope 3: activity_value
 * - Biogenic: activity_value
 */
function getProposedQty(record) {
  const dfv = record?.dynamic_field_values || {};
  
  // Try common field names for quantity in priority order
  const candidates = [
    dfv.qty,
    dfv.quantity,
    dfv.fuel_qty,
    dfv.qty_energy,
    dfv.activity_value,
    dfv.electricity_consumption,
  ];
  
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      if (typeof candidate === 'object' && candidate.value !== undefined) {
        return { value: candidate.value, unit: candidate.unit || '' };
      }
      if (typeof candidate === 'number' || typeof candidate === 'string') {
        return { value: candidate, unit: '' };
      }
    }
  }
  return null;
}

/**
 * Extract the emissions value (tCO2e) from a pending record.
 */
function getProposedEmissions(record) {
  const snap = getSnapshot(record);
  return snap.total_emissions ?? snap.co2e_emissions ?? 0;
}


export default function ApprovalTable({
  activeTab,
  rows,
  facilities = [],
  selectable = false,
  selectedIds = [],
  onToggleSelect,
  onToggleSelectAll,
  perRowActions,
  emptyText = 'No requests',
  searchValue,
  onSearchChange,
  scopeFilter,
  onScopeFilterChange,
  facilityFilter,
  onFacilityFilterChange,
}) {
  const [page, setPage] = React.useState(0);

  React.useEffect(() => {
    setPage(0);
  }, [searchValue, scopeFilter, facilityFilter, rows.length]);

  const facilityMap = useMemo(() => {
    const m = {};
    for (const f of facilities) {
      m[f.id] = f.name;
    }
    return m;
  }, [facilities]);

  const filtered = useMemo(() => {
    const q = (searchValue || '').trim().toLowerCase();

    return (rows || []).filter((r) => {
      if (scopeFilter && getScope(r) !== scopeFilter) {
        return false;
      }

      if (
        facilityFilter &&
        getFacilityId(r) !== facilityFilter
      ) {
        return false;
      }

      if (!q) return true;

      const snap = getSnapshot(r);
      // For grouped rows, also search in submitter names
      const submitters = r._submitters ? r._submitters.join(' ') : '';
      const haystack = [
        r.submitted_by_email,
        r.submitted_by_name,
        submitters,
        getScope(r),
        getCategory(r),
        snap?.reporting_period,
        facilityMap[getFacilityId(r)],
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [
    rows,
    searchValue,
    scopeFilter,
    facilityFilter,
    facilityMap,
  ]);

  const pageRows = filtered.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE
  );

  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / PAGE_SIZE)
  );

  // For grouped rows, check if all proposals within the group are selected
  const allSelected =
    selectable &&
    pageRows.length > 0 &&
    pageRows.every((r) => {
      if (r._proposals && r._proposals.length > 0) {
        return r._proposals.every(p => selectedIds.includes(p.id));
      }
      return selectedIds.includes(r.id);
    });

  return (
    <Card className="p-0 overflow-hidden border-stone-200">
      
      {/* FILTER BAR */}
      <div className="px-4 py-3 bg-stone-50 border-b border-stone-200 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />

          <Input
            value={searchValue || ''}
            onChange={(e) =>
              onSearchChange?.(e.target.value)
            }
            placeholder="Search submitter, facility, category…"
            className="pl-9 bg-white"
          />
        </div>

        <select
          value={scopeFilter || ''}
          onChange={(e) =>
            onScopeFilterChange?.(e.target.value)
          }
          className="px-3 py-2 text-sm border border-stone-300 rounded-md bg-white"
        >
          <option value="">All scopes</option>
          <option value="scope1">Scope 1</option>
          <option value="scope2">Scope 2</option>
          <option value="scope3">Scope 3</option>
          <option value="biogenic">Biogenic</option>
        </select>

        <select
          value={facilityFilter || ''}
          onChange={(e) =>
            onFacilityFilterChange?.(e.target.value)
          }
          className="px-3 py-2 text-sm border border-stone-300 rounded-md bg-white"
        >
          <option value="">All facilities</option>

          {facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      {/* HEADER */}
      <div className="px-4 py-2 bg-white border-b border-stone-200 flex items-center gap-3 text-xs font-semibold text-stone-600 uppercase tracking-wider">
        
        {selectable && (
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) =>
              onToggleSelectAll?.(
                pageRows,
                e.target.checked
              )
            }
            className="w-4 h-4"
          />
        )}

        <div className="w-36">Facility</div>
        <div className="w-20">Scope</div>
        <div className="flex-1 min-w-[120px]">Category</div>
        <div className="w-24">Period</div>
        <div className="w-auto min-w-[280px]">Proposals</div>

        {activeTab === 'rejected' && (
          <div className="w-48">
            Rejection Reason
          </div>
        )}

      </div>

      {/* BODY */}
      {pageRows.length === 0 ? (
        <div className="py-16 text-center">
          <Inbox className="w-12 h-12 mx-auto text-stone-300 mb-2" />

          <p className="text-sm text-text-muted">
            {emptyText}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-stone-100">
          {pageRows.map((r) => {
            const snap = getSnapshot(r);
            const scope = getScope(r);
            const category = getCategory(r);
            const facilityId = getFacilityId(r);
            const isGrouped = r._isGrouped && r._proposals && r._proposals.length > 1;
            const proposals = r._proposals || [r];
            const rejectionReason = getRejectionReason(r) || '—';

            return (
              <div
                key={r._groupKey || r.id}
                className={`px-4 py-3 hover:bg-stone-50 transition-colors ${isGrouped ? 'bg-blue-50/30' : ''}`}
                data-testid={`approval-row-${r._groupKey || r.id}`}
              >
                <div className="flex items-start gap-3">
                  {selectable && (
                    <div className="pt-1">
                      <input
                        type="checkbox"
                        checked={proposals.every(p => selectedIds.includes(p.id))}
                        onChange={(e) => {
                          proposals.forEach(p => onToggleSelect?.(p.id, e.target.checked));
                        }}
                        className="w-4 h-4"
                      />
                    </div>
                  )}

                  {/* FACILITY */}
                  <div className="w-36 text-sm text-text-secondary truncate pt-1">
                    {facilityMap[facilityId] || '—'}
                  </div>

                  {/* SCOPE */}
                  <div className="w-20 text-sm capitalize pt-1">
                    {scope || '—'}
                  </div>

                  {/* CATEGORY */}
                  <div className="flex-1 min-w-[120px] pt-1">
                    <p className="text-sm text-text-primary truncate">
                      {category || '—'}
                    </p>
                    {isGrouped && (
                      <Badge className="mt-1 bg-blue-100 text-blue-800 text-xs">
                        <Users className="w-3 h-3 mr-1" />
                        {proposals.length} proposals
                      </Badge>
                    )}
                  </div>

                  {/* PERIOD */}
                  <div className="w-24 text-sm text-text-secondary truncate pt-1">
                    {snap.reporting_period || '—'}
                  </div>

                  {/* PROPOSALS SECTION - Side by side display */}
                  <div className="w-auto min-w-[280px] flex-shrink-0">
                    {proposals.map((proposal, idx) => {
                      const proposalQty = getProposedQty(proposal);
                      const proposalEmissions = getProposedEmissions(proposal);
                      const proposalRequestType = getRequestType(proposal);
                      
                      return (
                        <div 
                          key={proposal.id}
                          className={`flex items-center gap-2 p-2 rounded-md ${idx > 0 ? 'mt-2 border-t border-stone-200 pt-3' : ''} ${isGrouped ? 'bg-white shadow-sm border border-stone-200' : ''}`}
                          data-testid={`proposal-${proposal.id}`}
                        >
                          {/* Submitter Info */}
                          <div className="w-28 flex-shrink-0">
                            <p className="text-sm font-medium text-text-primary truncate">
                              {proposal.submitted_by_name || proposal.submitted_by_email || '—'}
                            </p>
                            <p className="text-xs text-text-muted truncate">
                              {proposalRequestType}
                            </p>
                          </div>

                          {/* Qty Value */}
                          <div className="w-24 flex-shrink-0 text-center">
                            <p className="text-xs text-text-muted">Qty</p>
                            <p className="text-sm font-medium text-text-primary">
                              {proposalQty !== null 
                                ? `${Number(proposalQty.value).toLocaleString()}${proposalQty.unit ? ` ${proposalQty.unit}` : ''}`
                                : '—'}
                            </p>
                          </div>

                          {/* Emissions */}
                          <div className="w-20 flex-shrink-0 text-center">
                            <p className="text-xs text-text-muted">tCO₂e</p>
                            <p className="text-sm font-semibold text-primary">
                              {Number(proposalEmissions).toFixed(2)}
                            </p>
                          </div>

                          {/* Submitted Time */}
                          <div className="w-20 flex-shrink-0 text-center">
                            <p className="text-xs text-text-muted">
                              {proposal.submitted_at
                                ? format(new Date(proposal.submitted_at), 'd MMM')
                                : '—'}
                            </p>
                          </div>

                          {/* Actions for this proposal */}
                          {activeTab === 'pending' && (
                            <div className="flex items-center gap-1 ml-auto">
                              {perRowActions ? perRowActions(r, proposal) : null}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* REJECTION REASON */}
                  {activeTab === 'rejected' && (
                    <div className="w-48 text-sm text-red-700 whitespace-pre-wrap break-words pt-1">
                      {rejectionReason}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FOOTER */}
      <div className="px-4 py-2 border-t border-stone-200 flex items-center justify-between bg-stone-50 text-xs text-text-muted">
        
        <span>
          {filtered.length} record
          {filtered.length === 1 ? '' : 's'}
        </span>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={page === 0}
            onClick={() =>
              setPage((p) => Math.max(0, p - 1))
            }
            className="h-7 px-2"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>

          <span>
            {page + 1} / {totalPages}
          </span>

          <Button
            size="sm"
            variant="ghost"
            disabled={page >= totalPages - 1}
            onClick={() =>
              setPage((p) =>
                Math.min(totalPages - 1, p + 1)
              )
            }
            className="h-7 px-2"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
