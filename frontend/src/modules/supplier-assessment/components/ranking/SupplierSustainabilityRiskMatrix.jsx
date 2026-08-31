import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../../components/ui/tooltip';

const GROUPS = {
  critical: { label: 'Critical suppliers', detail: 'High emissions · Low ESG', zoneClass: 'bg-rose-100/70', pointClass: 'bg-rose-700' },
  priority: { label: 'Priority improvement', detail: 'High emissions · High ESG', zoneClass: 'bg-orange-100/70', pointClass: 'bg-orange-700' },
  developing: { label: 'Developing suppliers', detail: 'Low emissions · Low ESG', zoneClass: 'bg-amber-100/55', pointClass: 'bg-amber-700' },
  strategic: { label: 'Strategic suppliers', detail: 'Low emissions · High ESG', zoneClass: 'bg-emerald-100/60', pointClass: 'bg-emerald-700' },
};

const pointPosition = (row, maxEmissions) => ({
  left: `${Math.max(4, Math.min(96, row.esg_score))}%`,
  bottom: `${8 + ((row.attributed_emissions / maxEmissions) * 84)}%`,
});

const SupplierPoint = ({ row, maxEmissions }) => <Tooltip><TooltipTrigger asChild><span className={`absolute z-20 h-3.5 w-3.5 -translate-x-1/2 translate-y-1/2 cursor-pointer rounded-full border-2 border-white shadow-sm ${GROUPS[row.group].pointClass}`} style={pointPosition(row, maxEmissions)} role="img" tabIndex={0} aria-label={`Supplier ${row.company_name}`} data-testid={`supplier-risk-matrix-point-${row.supplier_id}`} /></TooltipTrigger><TooltipContent data-testid={`supplier-risk-matrix-point-tooltip-${row.supplier_id}`}><p className="font-semibold">{row.company_name}</p><p className="text-xs">ESG score: {row.esg_score}</p><p className="text-xs">Attributed emissions: {row.attributed_emissions.toFixed(2)} tCO₂e</p></TooltipContent></Tooltip>;

export const SupplierSustainabilityRiskMatrix = ({ matrix }) => {
  if (!matrix.rows.length) return <Card className="rounded-lg border-stone-200 bg-white shadow-none" data-testid="supplier-risk-matrix-card"><CardHeader className="border-b border-stone-100 pb-4"><CardTitle className="text-base text-stone-900">Supplier sustainability risk matrix</CardTitle></CardHeader><CardContent><p className="py-16 text-center text-sm text-stone-500" data-testid="supplier-risk-matrix-empty">No supplier ESG scores are available yet.</p></CardContent></Card>;
  return <Card className="rounded-lg border-stone-200 bg-white shadow-none" data-testid="supplier-risk-matrix-card"><CardHeader className="border-b border-stone-100 pb-4"><CardTitle className="text-base text-stone-900">Supplier sustainability risk matrix</CardTitle><p className="mt-1 text-xs text-stone-500">Supplier ESG score against attributed emissions. High emissions are relative to the portfolio median.</p></CardHeader><CardContent className="pt-5"><div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_13rem]"><div className="relative h-[340px] w-full" data-testid="supplier-risk-matrix-chart">
    <span className="absolute left-4 top-4 text-[10px] font-semibold text-stone-600" data-testid="supplier-risk-matrix-high-emissions">HIGH EMISSIONS</span><span className="absolute bottom-4 left-4 text-[10px] font-semibold text-stone-600" data-testid="supplier-risk-matrix-low-emissions">LOW EMISSIONS</span>
    <div className="absolute inset-x-14 inset-y-10 overflow-hidden border-b-2 border-l-2 border-stone-500"><div className={`absolute left-0 top-0 flex h-1/2 w-1/2 items-center justify-center p-8 text-center ${GROUPS.critical.zoneClass}`} data-testid="supplier-risk-group-critical"><p className="text-sm font-semibold uppercase text-stone-700">{GROUPS.critical.label}<span className="block pt-1 text-xs font-normal normal-case text-stone-500">{matrix.groupCounts.critical}</span></p></div>
      <div className={`absolute right-0 top-0 flex h-1/2 w-1/2 items-center justify-center p-8 text-center ${GROUPS.priority.zoneClass}`} data-testid="supplier-risk-group-priority"><p className="text-sm font-semibold uppercase text-stone-700">{GROUPS.priority.label}<span className="block pt-1 text-xs font-normal normal-case text-stone-500">{matrix.groupCounts.priority}</span></p></div>
      <div className={`absolute bottom-0 left-0 flex h-1/2 w-1/2 items-center justify-center p-8 text-center ${GROUPS.developing.zoneClass}`} data-testid="supplier-risk-group-developing"><p className="text-sm font-semibold uppercase text-stone-700">{GROUPS.developing.label}<span className="block pt-1 text-xs font-normal normal-case text-stone-500">{matrix.groupCounts.developing}</span></p></div>
      <div className={`absolute bottom-0 right-0 flex h-1/2 w-1/2 items-center justify-center p-8 text-center ${GROUPS.strategic.zoneClass}`} data-testid="supplier-risk-group-strategic"><p className="text-sm font-semibold uppercase text-stone-700">{GROUPS.strategic.label}<span className="block pt-1 text-xs font-normal normal-case text-stone-500">{matrix.groupCounts.strategic}</span></p></div>
      <div className="absolute z-10 left-1/2 top-0 h-full border-l border-stone-500" /><div className="absolute z-10 left-0 top-1/2 w-full border-t border-stone-500" />
      {matrix.rows.map((row) => <SupplierPoint key={row.supplier_id} row={row} maxEmissions={matrix.maxEmissions} />)}
    </div>
    <span className="absolute bottom-0 left-14 text-[10px] font-semibold text-stone-600" data-testid="supplier-risk-matrix-low-esg">LOW ESG</span><span className="absolute bottom-0 right-14 text-[10px] font-semibold text-stone-600" data-testid="supplier-risk-matrix-high-esg">HIGH ESG</span>
  </div><aside className="border-l border-stone-200 pl-5" data-testid="supplier-risk-matrix-legend"><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Supplier groups</p><div className="mt-4 space-y-4">{Object.entries(GROUPS).map(([key, group]) => <div key={key} className="flex gap-2.5" data-testid={`supplier-risk-legend-${key}`}><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${group.pointClass}`} /><div><p className="text-sm font-semibold text-stone-800">{group.label}</p><p className="text-xs leading-5 text-stone-500">{group.detail}</p></div></div>)}</div></aside></div></CardContent></Card>;
};