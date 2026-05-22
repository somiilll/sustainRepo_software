import React from 'react';
import { Button } from '../../../components/ui/button';
import { Activity, FileText, Edit, History, Trash2 } from 'lucide-react';

/**
 * EmissionDataGrid
 *
 * Renders the enterprise data grid for the Emissions page (header row, data rows, empty state).
 * Pure presentational component extracted from Emissions.js (Phase E6) — behavior is
 * byte-identical to the original inline JSX. No business logic changes.
 */
export default function EmissionDataGrid({
  activeScope,
  filteredEmissions,
  facilities,
  filteredScope3Activities,
  getMethodLabel,
  isRegularUser,
  handleEdit,
  fetchHistory,
  openDeleteConfirm,
  showFilters,
  filterFacility,
  filterDateRange,
  filterCategory,
  filterFrequency,
}) {
  return (
    <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
      {/* Fixed Header Row */}
      <div className="bg-stone-50 border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 text-xs font-semibold text-stone-600 uppercase tracking-wider">
          {/* Scope 3 Headers */}
          {activeScope === 'scope3' && (
            <>
              <div className="w-36 flex-shrink-0">Facility</div>
              <div className="w-24 flex-shrink-0">Period</div>
              <div className="w-52 flex-shrink-0">Category</div>
              <div className="flex-1 min-w-[120px] pl-2">Activity</div>
              <div className="w-20 flex-shrink-0 text-center">Method</div>
              <div className="w-28 flex-shrink-0 text-right normal-case">tCO₂e</div>
              <div className="w-28 flex-shrink-0 text-center">Actions</div>
            </>
          )}
          {/* Scope 1 & 2 Headers */}
          {(activeScope === 'scope1' || activeScope === 'scope2') && (
            <>
              <div className="w-36 flex-shrink-0">Facility</div>
              <div className="w-24 flex-shrink-0">Period</div>
              <div className="w-44 flex-shrink-0">Category</div>
              <div className="flex-1 min-w-[140px]">Sub-category</div>
              <div className="w-32 flex-shrink-0 text-right">Quantity</div>
              <div className="w-28 flex-shrink-0 text-right normal-case">tCO₂e</div>
              <div className="w-28 flex-shrink-0 text-center">Actions</div>
            </>
          )}
          {/* Biogenic Headers */}
          {activeScope === 'biogenic' && (
            <>
              <div className="w-36 flex-shrink-0">Facility</div>
              <div className="w-24 flex-shrink-0">Period</div>
              <div className="w-20 flex-shrink-0">Type</div>
              <div className="w-36 flex-shrink-0">Category</div>
              <div className="flex-1 min-w-[120px]">Activity / Fuel</div>
              <div className="w-20 flex-shrink-0 text-center">Method</div>
              <div className="w-28 flex-shrink-0 text-right normal-case">tCO₂e</div>
              <div className="w-28 flex-shrink-0 text-center">Actions</div>
            </>
          )}
        </div>
      </div>

      {/* Data Rows */}
      <div className="divide-y divide-stone-100">
        {filteredEmissions.map((emission) => {
          const facility = facilities.find(f => f.id === emission.facility_id);
          const dfv = emission.dynamic_field_values || {};
          const hasOverride = Object.values(dfv).some(field => field?.is_override === true);
          const calcMethod = emission.calculation_method_scope3 || dfv.calculation_method_scope3;
          const totalEmissions = emission.outputs?.co2e?.value || emission.co2e_emissions || emission.total_emissions || 0;

          // Approval-status badge meta (rendered next to Custom badge in every scope row).
          const approvalStatus = emission.approval_status;
          const approvalBadge = (() => {
            switch (approvalStatus) {
              case 'pending_create': return { text: 'Pending for approval', cls: 'bg-amber-100 text-amber-700' };
              case 'pending_update': return { text: 'Pending update', cls: 'bg-amber-100 text-amber-700' };
              case 'pending_delete': return { text: 'Pending delete', cls: 'bg-amber-100 text-amber-700' };
              case 'rejected_create':
              case 'rejected_update':
              case 'rejected_delete': return { text: 'Rejected', cls: 'bg-red-100 text-red-700' };
              default: return null;
            }
          })();
          const ApprovalBadge = approvalBadge ? (
            <span
              className={`px-1.5 py-0.5 text-[9px] font-semibold rounded flex-shrink-0 ${approvalBadge.cls}`}
              data-testid={`approval-badge-${emission.id}`}
            >
              {approvalBadge.text}
            </span>
          ) : null;

          // Get activity/sub-category display
          // For Scope 3 OR Biogenic Scope 3, look up the activity label using scope3_ef_id
          let activityDisplay = '-';
          const isBiogenicScope3 = emission.scope === 'biogenic' &&
            (emission.biogenic_scope_selection === 'scope3' || dfv.biogenic_scope_selection?.value === 'scope3');

          if (emission.scope === 'scope3' || isBiogenicScope3) {
            // First try to find the label by scope3_ef_id
            if (emission.scope3_ef_id) {
              const matchedEf = filteredScope3Activities.find(a => a.id === emission.scope3_ef_id);
              if (matchedEf) {
                activityDisplay = matchedEf.activity || matchedEf.fuel_name || emission.scope3_activity || '-';
              } else {
                // Fallback to stored scope3_activity if no match found
                activityDisplay = emission.scope3_activity || dfv.scope3_activity || emission.sub_category || '-';
              }
            } else {
              // No scope3_ef_id - use scope3_activity (common for supplier_basis with custom activity)
              activityDisplay = emission.scope3_activity || dfv.scope3_activity || emission.sub_category || '-';
            }
          } else {
            activityDisplay = emission.sub_category || emission.fuel_type || '-';
          }

          // Get calculation method display using centralized labels
          const methodDisplay = getMethodLabel(calcMethod, true);

          // Get quantity display for Scope 1/2
          const getQuantityDisplay = () => {
            let qtyField = dfv.qty || dfv.qty_energy;
            if (qtyField?.value !== null && qtyField?.value !== undefined) {
              return `${qtyField.value} ${qtyField.unit || 'kg'}`;
            }
            return `${emission.quantity || 0} ${emission.quantity_unit || 'kg'}`;
          };

          // Extract year from reporting period
          const reportingYear = emission.reporting_period?.match(/\d{4}/)?.[0] || emission.reporting_year || '-';

          // Biogenic scope type
          const biogenicScope = emission.biogenic_scope_selection ||
            (dfv.biogenic_scope_selection?.value) ||
            (emission.scope === 'biogenic' ? 'Direct' : '-');

          return (
            <div
              key={emission.id}
              className="px-4 py-3 flex items-center gap-3 hover:bg-green-50/50 transition-colors cursor-pointer group"
              data-testid={`emission-row-${emission.id}`}
            >
              {/* Scope 3 Row */}
              {activeScope === 'scope3' && (
                <>
                  <div className="w-36 flex-shrink-0">
                    <p className="text-sm font-medium text-text-primary truncate" title={facility?.name}>
                      {facility?.name || 'Unknown'}
                    </p>
                  </div>
                  <div className="w-24 flex-shrink-0 text-sm text-text-secondary truncate flex items-center gap-1" title={emission.reporting_period}>
                    {emission.reporting_period || reportingYear}
                  </div>
                  <div className="w-52 flex-shrink-0">
                    <p className="text-sm text-text-primary truncate" title={emission.category}>
                      {emission.category}
                    </p>
                  </div>
                  <div className="flex-1 min-w-[120px] pl-2 flex items-center gap-2">
                    <p className="text-sm text-text-primary truncate" title={activityDisplay}>
                      {activityDisplay}
                    </p>
                    {hasOverride && (
                      <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 text-[9px] font-semibold rounded flex-shrink-0">
                        Custom
                      </span>
                    )}
                    {ApprovalBadge}
                    {emission.evidence_url && (
                      <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" title="Has Evidence" />
                    )}
                  </div>
                  <div className="w-20 flex-shrink-0 text-center">
                    <span className="inline-flex px-2 py-0.5 bg-stone-100 text-stone-700 text-xs font-medium rounded">
                      {methodDisplay}
                    </span>
                  </div>
                  <div className="w-28 flex-shrink-0 text-right">
                    <span className="text-sm font-semibold text-primary">
                      {totalEmissions.toFixed(4)}
                    </span>
                  </div>
                </>
              )}

              {/* Scope 1 & 2 Row */}
              {(activeScope === 'scope1' || activeScope === 'scope2') && (
                <>
                  <div className="w-36 flex-shrink-0">
                    <p className="text-sm font-medium text-text-primary truncate" title={facility?.name}>
                      {facility?.name || 'Unknown'}
                    </p>
                  </div>
                  <div className="w-24 flex-shrink-0 text-sm text-text-secondary truncate flex items-center gap-1" title={emission.reporting_period}>
                    {emission.reporting_period || reportingYear}
                  </div>
                  <div className="w-44 flex-shrink-0">
                    <p className="text-sm text-text-primary truncate" title={emission.category}>
                      {emission.category}
                    </p>
                  </div>
                  <div className="flex-1 min-w-[140px] flex items-center gap-2">
                    <p className="text-sm text-text-primary truncate" title={activityDisplay}>
                      {activityDisplay}
                    </p>
                    {hasOverride && (
                      <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 text-[9px] font-semibold rounded flex-shrink-0">
                        Custom
                      </span>
                    )}
                    {ApprovalBadge}
                    {emission.evidence_url && (
                      <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" title="Has Evidence" />
                    )}
                  </div>
                  <div className="w-32 flex-shrink-0 text-right text-sm text-text-secondary">
                    {getQuantityDisplay()}
                  </div>
                  <div className="w-28 flex-shrink-0 text-right">
                    <span className="text-sm font-semibold text-primary">
                      {totalEmissions.toFixed(4)}
                    </span>
                  </div>
                </>
              )}

              {/* Biogenic Row */}
              {activeScope === 'biogenic' && (
                <>
                  <div className="w-36 flex-shrink-0">
                    <p className="text-sm font-medium text-text-primary truncate" title={facility?.name}>
                      {facility?.name || 'Unknown'}
                    </p>
                  </div>
                  <div className="w-24 flex-shrink-0 text-sm text-text-secondary truncate flex items-center gap-1" title={emission.reporting_period}>
                    {emission.reporting_period || reportingYear}
                  </div>
                  <div className="w-20 flex-shrink-0">
                    <span className="inline-flex px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                      {biogenicScope === 'scope1' ? 'Direct' : biogenicScope === 'scope3' ? 'Indirect' : biogenicScope}
                    </span>
                  </div>
                  <div className="w-36 flex-shrink-0">
                    <p className="text-sm text-text-primary truncate" title={emission.category}>
                      {emission.category}
                    </p>
                  </div>
                  <div className="flex-1 min-w-[120px] flex items-center gap-2">
                    <p className="text-sm text-text-primary truncate" title={
                      biogenicScope === 'scope3'
                        ? activityDisplay
                        : (emission.fuel_type || emission.sub_category || activityDisplay || '-')
                    }>
                      {biogenicScope === 'scope3'
                        ? activityDisplay
                        : (emission.fuel_type || emission.sub_category || activityDisplay || '-')}
                    </p>
                    {hasOverride && (
                      <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 text-[9px] font-semibold rounded flex-shrink-0">
                        Custom
                      </span>
                    )}
                    {ApprovalBadge}
                    {emission.evidence_url && (
                      <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" title="Has Evidence" />
                    )}
                  </div>
                  <div className="w-20 flex-shrink-0 text-center">
                    {biogenicScope === 'scope3' ? (
                      <span className="inline-flex px-2 py-0.5 bg-stone-100 text-stone-700 text-xs font-medium rounded">
                        {methodDisplay}
                      </span>
                    ) : (
                      <span className="text-xs text-stone-400">-</span>
                    )}
                  </div>
                  <div className="w-28 flex-shrink-0 text-right">
                    <span className="text-sm font-semibold text-primary">
                      {totalEmissions.toFixed(4)}
                    </span>
                  </div>
                </>
              )}

              {/* Action Buttons - Common for all scopes */}
              <div className="w-28 flex-shrink-0 flex items-center justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => { e.stopPropagation(); handleEdit(emission); }}
                  title="Edit"
                  className="h-7 w-7 p-0"
                  data-testid={`edit-emission-${emission.id}`}
                >
                  <Edit className="w-3.5 h-3.5 text-stone-600" />
                </Button>
                {!isRegularUser && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); fetchHistory(emission.id); }}
                    title="History"
                    className="h-7 w-7 p-0"
                    data-testid={`history-emission-${emission.id}`}
                  >
                    <History className="w-3.5 h-3.5 text-stone-600" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => { e.stopPropagation(); openDeleteConfirm(emission); }}
                  title="Delete"
                  className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                  data-testid={`delete-emission-${emission.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredEmissions.length === 0 && (
        <div className="text-center py-12 border-t border-stone-100">
          <Activity className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-xl font-heading font-bold text-text-primary mb-2">
            No {activeScope === 'biogenic' ? 'Biogenic' : `Scope ${activeScope.slice(-1)}`} emissions
          </h3>
          <p className="text-text-secondary mb-4">
            {showFilters && (filterFacility || filterDateRange.from || filterDateRange.to || filterCategory || filterFrequency)
              ? 'Try adjusting your filters'
              : 'Add your first emission record'}
          </p>
        </div>
      )}
    </div>
  );
}
