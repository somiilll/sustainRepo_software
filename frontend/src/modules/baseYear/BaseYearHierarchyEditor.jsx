import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, LockKeyhole, Trash2 } from 'lucide-react';
import { Input } from '../../components/ui/input';

const keyFor = (scope, category = '', subcategory = '', level = 'subcategory') => `${level}|${scope}|${category}|${subcategory}`;
const inferLevel = (entry) => entry.entry_level || (!entry.category ? 'scope' : !entry.subcategory ? 'category' : 'subcategory');

export const BaseYearHierarchyEditor = ({ sourceEntries = [], entries = [], entryLevel, onValueChange, onDeleteEntry }) => {
  const [expanded, setExpanded] = useState({});
  const tree = useMemo(() => {
    const scopes = new Map();
    [...sourceEntries, ...entries].filter((entry) => entry.scope && String(entry.scope || '').toLowerCase() !== 'biogenic (direct)').forEach((entry) => {
      if (!scopes.has(entry.scope)) scopes.set(entry.scope, new Map());
      if (entry.category) {
        const categories = scopes.get(entry.scope);
        if (!categories.has(entry.category)) categories.set(entry.category, new Set());
        if (entry.subcategory) categories.get(entry.category).add(entry.subcategory);
      }
    });
    return [...scopes.entries()].map(([scope, categories]) => ({ scope, categories: [...categories.entries()].map(([category, subcategories]) => ({ category, subcategories: [...subcategories] })) }));
  }, [entries, sourceEntries]);
  const byKey = useMemo(() => new Map(entries.map((entry) => [keyFor(entry.scope, entry.category || '', entry.subcategory || '', inferLevel(entry)), entry])), [entries]);
  const input = (scope, category, subcategory, level) => {
    const own = byKey.get(keyFor(scope, category, subcategory, level));
    const conflict = entries.find((entry) => entry.scope === scope && inferLevel(entry) !== level && (level === 'scope' || entry.category === category));
    if (entryLevel !== level) return <span className="text-xs text-slate-400">—</span>;
    if (conflict) return <span className="inline-flex items-center gap-1 text-xs text-amber-700"><LockKeyhole className="h-3 w-3" />Entered at another level</span>;
    return <div className="flex items-center gap-1"><Input type="number" step="any" min="0" value={own?.tco2e ?? ''} onChange={(event) => onValueChange({ scope, category, subcategory, entry_level: level }, event.target.value)} className="h-8 w-32 text-right" data-testid={`tree-node-input-${level}-${scope}-${category || 'root'}-${subcategory || 'root'}`} />{own && <button type="button" onClick={() => onDeleteEntry?.(own)} className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${scope} ${category} ${subcategory}`.trim()} data-testid={`tree-node-delete-${level}-${scope}-${category || 'root'}-${subcategory || 'root'}`}><Trash2 className="h-3.5 w-3.5" /></button>}</div>;
  };
  return <div className="overflow-hidden rounded-lg border border-slate-200" data-testid="base-year-hierarchy-tree">
    {tree.map(({ scope, categories }) => {
      const scopeOpen = expanded[`scope-${scope}`] !== false;
      return <div key={scope} data-testid={`tree-node-${scope}`}>
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3">{entryLevel !== 'scope' && <button type="button" onClick={() => setExpanded((state) => ({ ...state, [`scope-${scope}`]: !scopeOpen }))} aria-expanded={scopeOpen} data-testid={`tree-node-expand-toggle-${scope}`}><>{scopeOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</></button>}<span className="flex-1 text-sm font-bold uppercase text-slate-800">{scope.replace(/(scope)(\d)/i, 'Scope $2')}</span>{input(scope, '', '', 'scope')}<span className="text-xs text-slate-500">tCO₂e</span></div>
        {scopeOpen && entryLevel !== 'scope' && categories.map(({ category, subcategories }) => <div key={category}>
          <div className="flex items-center gap-2 border-b border-slate-100 bg-white px-3 py-2.5 pl-10"><span className="flex-1 text-sm font-semibold text-slate-700">{category}</span>{input(scope, category, '', 'category')}<span className="text-xs text-slate-500">tCO₂e</span></div>
          {entryLevel === 'subcategory' && subcategories.map((subcategory) => <div key={subcategory} className="flex items-center gap-2 border-b border-slate-50 bg-slate-50/40 px-3 py-2 pl-16"><span className="flex-1 text-xs text-slate-600">{subcategory}</span>{input(scope, category, subcategory, 'subcategory')}<span className="text-xs text-slate-500">tCO₂e</span></div>)}
        </div>)}
      </div>;
    })}
  </div>;
};