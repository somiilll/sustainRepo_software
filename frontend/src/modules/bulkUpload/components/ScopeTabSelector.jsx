/**
 * ScopeTabSelector — pill-style tabs to pick a bulk-upload scope module.
 * Disabled tabs (notImplemented or restricted) get a tooltip + "Coming soon"
 * or "Access required" badge.
 */
import React from 'react';
import { Badge } from '../../../components/ui/badge';
import { MODULE_STATUS } from '../core/bulkUploadConstants';

export default function ScopeTabSelector({ modules, activeId, onSelect }) {
  if (!modules?.length) return null;
  // Only render scopes that are actually available — hide NOT_IMPLEMENTED
  // and RESTRICTED entirely instead of showing disabled placeholder pills.
  const visible = modules.filter((m) => m.status === MODULE_STATUS.AVAILABLE);
  if (!visible.length) return null;
  return (
    <div className="flex flex-wrap gap-2" data-testid="bulk-upload-scope-tabs">
      {visible.map((mod) => {
        const isActive = mod.id === activeId;
        const baseClass =
          'px-4 py-2 rounded-full text-sm font-medium border transition-all flex items-center gap-2';
        const stateClass = isActive
          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
          : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50 hover:border-primary/40';
        return (
          <button
            key={mod.id}
            onClick={() => onSelect(mod.id)}
            className={`${baseClass} ${stateClass}`}
            data-testid={`scope-tab-${mod.id}`}
          >
            <span>{mod.label}</span>
          </button>
        );
      })}
    </div>
  );
}
