import React from 'react';
import { useLocation } from 'react-router-dom';
import { Construction } from 'lucide-react';

export default function PlaceholderPage({ title }) {
  const location = useLocation();
  const displayTitle = title || location.pathname.split('/').filter(Boolean).map(s => s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(' > ');

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-stone-500" data-testid="placeholder-page">
      <Construction className="h-12 w-12 text-stone-300" />
      <h1 className="text-xl font-semibold text-stone-700">{displayTitle}</h1>
      <p className="text-sm">This module is coming soon.</p>
    </div>
  );
}
