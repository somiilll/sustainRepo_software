import React from 'react';
import { motion } from 'framer-motion';
import { BrainCircuit, Sparkles, Zap } from 'lucide-react';

const MODE_CONTENT = {
  fast: { icon: Zap, title: 'Fast' },
  think: { icon: BrainCircuit, title: 'Think' },
};

export const ExtractionModeSelector = ({ modes, value, onChange, disabled, compact = false }) => (
  <section className={compact ? '' : 'space-y-3'} aria-labelledby={compact ? undefined : 'ocr-mode-heading'} aria-label={compact ? 'Extraction mode' : undefined} data-testid="ocr-mode-section">
    {!compact && (
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-emerald-700" aria-hidden="true" />
        <h2 id="ocr-mode-heading" className="text-sm font-semibold text-slate-900">Extraction mode</h2>
      </div>
    )}
    <div className={compact ? 'relative flex w-[140px] rounded-full border border-slate-200 bg-white p-1 shadow-sm' : 'grid gap-3 sm:grid-cols-2'} role="radiogroup" aria-label="Extraction mode">
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
              ? `relative z-0 flex flex-1 items-center justify-center gap-1 overflow-hidden rounded-full px-1.5 py-1.5 text-xs font-semibold transition-[color,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${active ? 'bg-transparent text-primary-foreground shadow-none' : 'text-slate-600 hover:text-primary'}`
              : `flex min-h-20 items-center gap-3 border p-4 text-left transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${active ? 'border-emerald-600 bg-emerald-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-400'}`
            }
            data-testid={`ocr-mode-${mode.key}-button`}
          >
            {compact && active && <motion.span layoutId="ocr-extraction-mode-active-indicator" className="pointer-events-none absolute inset-0 rounded-full bg-primary shadow-sm" transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.55 }} aria-hidden="true" />}
            <span className={`relative z-10 grid h-5 w-5 shrink-0 place-items-center rounded-full ${active ? 'bg-white/15 text-white' : 'bg-teal-50 text-teal-700'}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className={`relative z-10 ${compact ? '' : 'text-slate-950'}`}>{content.title}</span>
          </button>
        );
      })}
    </div>
  </section>
);