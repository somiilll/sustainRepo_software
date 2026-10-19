import React, { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Minus } from 'lucide-react';
import { CONTENT_TREE } from './misConstants';

const childIds = (node) => node.children ? node.children.flatMap(childIds) : [node.id];

function SelectionMark({ state }) {
  if (state === 'all') return <Check className="h-4 w-4" />;
  if (state === 'partial') return <Minus className="h-4 w-4" />;
  return null;
}

export default function MISContentTree({ selected, onChange }) {
  const [expanded, setExpanded] = useState(() => new Set(['environment', 'targets', 'voluntary']));
  const updateNode = (node) => {
    const ids = childIds(node);
    const isFull = ids.every((id) => selected.includes(id));
    onChange(isFull ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])]);
  };
  const toggleExpand = (id) => setExpanded((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const renderNode = (node, depth = 0) => {
    const ids = childIds(node); const selectedCount = ids.filter((id) => selected.includes(id)).length;
    const state = selectedCount === ids.length ? 'all' : selectedCount ? 'partial' : 'none'; const isOpen = expanded.has(node.id);
    return <div key={node.id} className={depth ? 'border-l border-emerald-900/15 pl-4' : 'py-2'} data-testid={`mis-content-node-${node.id}`}>
      <div className="flex items-center gap-3">
        {node.children ? <button type="button" onClick={() => toggleExpand(node.id)} className="flex h-8 w-8 shrink-0 items-center justify-center text-stone-500 transition-colors hover:bg-emerald-50 hover:text-emerald-900" data-testid={`mis-content-expand-${node.id}`} aria-label={`Expand ${node.label}`}>{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button> : <span className="w-8 shrink-0" />}
        <button type="button" onClick={() => updateNode(node)} aria-pressed={state !== 'none'} className={`flex h-8 w-8 shrink-0 items-center justify-center border transition-colors ${state === 'none' ? 'border-stone-300 bg-white text-transparent hover:border-emerald-700' : 'border-emerald-900 bg-emerald-900 text-white'}`} data-testid={`mis-content-select-${node.id}`}><SelectionMark state={state} /></button>
        <button type="button" onClick={() => node.children ? toggleExpand(node.id) : updateNode(node)} className="flex flex-1 items-center justify-between gap-3 py-2 text-left" data-testid={`mis-content-label-${node.id}`}><span className="font-medium text-stone-900">{node.label}</span><span className={`shrink-0 text-xs font-medium ${state === 'all' ? 'text-emerald-800' : state === 'partial' ? 'text-amber-700' : 'text-stone-400'}`} data-testid={`mis-content-status-${node.id}`}>{state === 'all' ? 'All selected' : state === 'partial' ? 'Partially selected' : 'None selected'}</span></button>
      </div>
      {node.children && isOpen && <div className="ml-11 mt-1 space-y-1">{node.children.map((child) => renderNode(child, depth + 1))}</div>}
    </div>;
  };
  return <section className="space-y-3" data-testid="mis-content-tree">
    <div className="flex items-baseline justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Report content</p><h2 className="mt-1 text-lg font-semibold text-stone-950">Choose the ESG view your recipients need</h2></div><span className="text-sm text-stone-500" data-testid="mis-content-selection-count">{selected.length} sections selected</span></div>
    <div className="divide-y divide-emerald-950/10 border-y border-emerald-950/10" data-testid="mis-content-tree-items">
      {CONTENT_TREE.map((node) => renderNode(node))}
    </div>
  </section>;
}