import React from 'react';
import { BrainCircuit, Gauge, Sparkles } from 'lucide-react';

const MODE_COPY = {
  fast: {
    icon: Gauge,
    title: 'Fast',
    summary: 'Rapid extraction and classification',
  },
  think: {
    icon: BrainCircuit,
    title: 'Think',
    summary: 'Deeper reasoning for complex documents',
  },
};

export const ExtractionModeSelector = ({ modes, value, onChange, disabled }) => (
  <section className="space-y-3" aria-labelledby="ocr-mode-heading" data-testid="ocr-mode-section">
    <div className="flex items-center gap-2">
      <Sparkles className="h-4 w-4 text-emerald-700" aria-hidden="true" />
      <h2 id="ocr-mode-heading" className="text-sm font-semibold text-slate-900">Extraction mode</h2>
    </div>
    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Extraction mode">
      {modes.map((mode) => {
        const content = MODE_COPY[mode.key] || MODE_COPY.fast;
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
            className={`group min-h-24 border p-4 text-left transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${
              active ? 'border-emerald-600 bg-emerald-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-400'
            }`}
            data-testid={`ocr-mode-${mode.key}-button`}
          >
            <span className="flex items-start gap-3">
              <span className={`grid h-9 w-9 shrink-0 place-items-center ${active ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-950">{content.title}</span>
                <span className="mt-1 block text-xs text-slate-600">{content.summary}</span>
                <span className="mt-2 block truncate text-xs font-medium text-slate-500">
                  {mode.vision_model}{mode.reasoning_model !== mode.vision_model ? ` + ${mode.reasoning_model}` : ''}
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  </section>
);
