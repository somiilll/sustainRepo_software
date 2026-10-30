import React from 'react';
import { ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { Badge } from './ui/badge';

export const topicSlug = (name) => (name || 'general').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const GRITopicCard = ({ topic, answered, total, showMaterial, open, onToggle, children }) => {
  const percent = total ? Math.round((answered / total) * 100) : 0;
  return (
    <section id={`brsr-group-${topic.slug}`} className="rounded-3xl border border-stone-200 bg-white shadow-sm overflow-hidden" data-testid={`gri-topic-${topic.slug}`}>
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-4 p-5 text-left hover:bg-stone-50 transition-colors" data-testid={`gri-topic-toggle-${topic.slug}`}>
        <div className="w-12 h-12 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
          <Layers className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold text-text-primary">{topic.name}</h3>
            {showMaterial && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Material</Badge>}
          </div>
          <p className="text-sm text-text-muted">
            {topic.standard ? `GRI ${topic.standard}: ${topic.name} · ` : ''}{topic.disclosures.length} disclosures · {total} questions
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          <span className="text-sm text-text-muted tabular-nums" data-testid={`gri-topic-count-${topic.slug}`}>{answered}/{total}</span>
          <div className="w-32 h-1.5 rounded-full bg-stone-200 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${percent}%` }} /></div>
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-stone-400 shrink-0" /> : <ChevronDown className="w-5 h-5 text-stone-400 shrink-0" />}
      </button>
      {open && <div className="border-t border-stone-100 p-3 sm:p-5 space-y-4 bg-stone-50/50">{children}</div>}
    </section>
  );
};
