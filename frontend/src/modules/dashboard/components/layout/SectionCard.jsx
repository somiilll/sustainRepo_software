/**
 * SectionCard — premium card frame for dashboard chart sections.
 * Subtle border + soft shadow + optional gradient stripe.
 */
import React from 'react';

export default function SectionCard({ title, subtitle, action, children, className = '', accent = '#10B981', testId }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-stone-200/70 bg-white/70 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 ${className}`}
      data-testid={testId}
    >
      <div
        className="absolute inset-x-0 top-0 h-[2px] opacity-70"
        style={{ background: `linear-gradient(90deg, ${accent}00 0%, ${accent} 50%, ${accent}00 100%)` }}
      />
      <div className="p-5">
        {(title || action) && (
          <div className="flex items-start justify-between mb-3">
            <div>
              {title && <h3 className="text-sm font-semibold text-stone-800">{title}</h3>}
              {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
            </div>
            {action}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
