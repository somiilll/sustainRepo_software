import React from 'react';
import { BrainCircuit, Gauge, Sparkles } from 'lucide-react';

const MODE_CONTENT = {
  fast: { icon: Gauge, title: 'Fast' },
  think: { icon: BrainCircuit, title: 'Think' },
};

export const ExtractionModeSelector = ({ modes, value, onChange, disabled, compact = false }) => (
  <section className={compact ? '' : 'space-y-3'} aria-labelledby="ocr-mode-heading" data-testid="ocr-mode-section">
    {!compact && (
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-emerald-700" aria-hidden="true" />
        <h2 id="ocr-mode-heading" className="text-sm font-semibold text-slate-900">Extraction mode</h2>
      </div>
    )}
    <div className={compact ? 'flex rounded-md border border-slate-200 bg-slate-50 p-1' : 'grid gap-3 sm:grid-cols-2'} role="radiogroup" aria-label="Extraction mode">
      {modes.map((mode) => {
        const content = MODE_CONTENT[mode.key] || MODE_CONTENT.fast;
        const Icon = content.icon;
        const active = mode.key === value;
        return (
          <button
            key={mode.key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(mode.key)}
            className={compact
              ? `flex items-center gap-2 rounded px-3 py-2 text-sm font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${active ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-700 hover:bg-white'}`
              : `flex min-h-20 items-center gap-3 border p-4 text-left transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${active ? 'border-emerald-600 bg-emerald-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-400'}`
            }
            data-testid={`ocr-mode-${mode.key}-button`}
          >
            <span className={`grid h-7 w-7 shrink-0 place-items-center ${active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className={compact ? '' : 'text-slate-950'}>{content.title}</span>
          </button>
        );
      })}
    </div>
  </section>
);