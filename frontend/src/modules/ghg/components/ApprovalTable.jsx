/**
 * ApprovalTable — table view for approval requests across all status tabs.
 *
 * Shared between Pending / Approved / Rejected tabs. Caller controls:
 *   - which actions to render in the row (perRowActions prop)
 *   - whether to show selection checkboxes (selectable prop)
 *   - empty state copy
 *
 * Designed to be reused for future enhancements (multi-stage chains, etc.).
 */
import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { Card } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Search, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import {
  getRequestType,
  getScope,
  getCategory,
  getFacilityId,
  getSnapshot,
  getRejectionReason,
} from '../utils/approvalSchema';

const PAGE_SIZE = 20;


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
      const haystack = [
        r.submitted_by_email,
        r.submitted_by_name,
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

  const allSelected =
    selectable &&
    pageRows.length > 0 &&
    pageRows.every((r) => selectedIds.includes(r.id));

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

        <div className="w-40">Submitter</div>
        <div className="w-36">Facility</div>
        <div className="w-20">Scope</div>
        <div className="flex-1 min-w-[140px]">Category</div>
        <div className="w-28">Period</div>
        <div className="w-24 text-right">tCO₂e</div>

        {activeTab === 'rejected' && (
          <div className="w-72">
            Rejection Reason
          </div>
        )}

        <div className="w-28">Submitted</div>

         {activeTab === 'pending' && (
         <div className="w-32 text-right">Actions</div>
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
            const requestType = getRequestType(r);

            const total =
              snap.total_emissions ??
              snap.co2e_emissions ??
              0;
            const rejectionReason = getRejectionReason(r) || '—';

            return (
              <div
                key={r.id}
                className="px-4 py-3 flex items-center gap-3 hover:bg-stone-50 transition-colors"
              >
                {selectable && (
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(r.id)}
                    onChange={(e) =>
                      onToggleSelect?.(
                        r.id,
                        e.target.checked
                      )
                    }
                    className="w-4 h-4"
                  />
                )}

                {/* SUBMITTER */}
                <div className="w-40">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {r.submitted_by_name ||
                      r.submitted_by_email ||
                      '—'}
                  </p>

                  <p className="text-xs text-text-muted truncate">
                    {requestType}
                  </p>
                </div>

                {/* FACILITY */}
                <div className="w-36 text-sm text-text-secondary truncate">
                  {facilityMap[facilityId] || '—'}
                </div>

                {/* SCOPE */}
                <div className="w-20 text-sm capitalize">
                  {scope || '—'}
                </div>

                {/* CATEGORY */}
                <div className="flex-1 min-w-[140px] text-sm text-text-primary truncate">
                  {category || '—'}
                </div>

                {/* PERIOD */}
                <div className="w-28 text-sm text-text-secondary truncate">
                  {snap.reporting_period || '—'}
                </div>

                {/* EMISSIONS */}
                <div className="w-24 text-sm font-semibold text-primary text-right">
                  {Number(total).toFixed(2)}
                </div>

                {/* REJECTION REASON */}
                {activeTab === 'rejected' && (
                  <div className="w-72 text-sm text-red-700 whitespace-pre-wrap break-words">
                    {rejectionReason}
                  </div>
                )}

                {/* SUBMITTED */}
                <div className="w-28 text-xs text-text-secondary truncate">
                  {(() => {
                    const t =
                      r.last_edited_at ||
                      r.submitted_at;

                    return t
                      ? format(
                          new Date(t),
                          'd MMM, HH:mm'
                        )
                      : '—';
                  })()}
                </div>

                {/* ACTIONS */}
                {activeTab === 'pending' && (
                <div className="w-32 flex items-center justify-end gap-1">
                  {perRowActions
                    ? perRowActions(r)
                    : null}
                </div>
                )}
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
