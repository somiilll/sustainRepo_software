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
  return (
    <div className="flex flex-wrap gap-2" data-testid="bulk-upload-scope-tabs">
      {modules.map((mod) => {
        const isActive = mod.id === activeId;
        const isDisabled = mod.status !== MODULE_STATUS.AVAILABLE;
        const baseClass =
          'px-4 py-2 rounded-full text-sm font-medium border transition-all flex items-center gap-2';
        const stateClass = isActive
          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
          : isDisabled
          ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed'
          : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50 hover:border-primary/40';
        return (
          <button
            key={mod.id}
            onClick={() => !isDisabled && onSelect(mod.id)}
            disabled={isDisabled}
            className={`${baseClass} ${stateClass}`}
            data-testid={`scope-tab-${mod.id}`}
          >
            <span>{mod.label}</span>
            {mod.status === MODULE_STATUS.RESTRICTED && (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-stone-300 text-stone-500 bg-stone-50">
                Access required
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}
