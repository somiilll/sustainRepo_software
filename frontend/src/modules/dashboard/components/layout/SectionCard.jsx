/**
 * SectionCard — premium card frame for dashboard chart sections.
 * Subtle border + soft shadow + optional gradient stripe.
 */
import React from 'react';

export default function SectionCard({ title, subtitle, action, children, className = '', accent = '#10B981', testId, contentClassName = '', header }) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm transition-[box-shadow,border-color] duration-200 hover:border-stone-300 hover:shadow-md ${className}`}
      data-testid={testId}
    >
      <div className={`p-4 sm:p-5 ${contentClassName}`}>
        {(title || action || header) && (
          <div className="mb-3">
            {header ? (
              header
            ) : (
              <div className="flex items-start justify-between">
                <div>
                  {title && (
                    <h3 className="font-heading text-base font-bold text-stone-900">
                      {title}
                    </h3>
                  )}

                  {subtitle && (
                    <p className="mt-1 text-xs font-medium text-stone-500">
                      {subtitle}
                    </p>
                  )}
                </div>

                {action}
              </div>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
