/**
 * AirportSearchInput — searchable autocomplete for airport selection.
 *
 * Queries GET /api/airports/search?q=<term> and renders a dropdown.
 * Displays: IATA — Airport Name, City, Country
 *
 * Props:
 *   value       — selected airport object (or null)
 *   onChange     — (airport | null) => void
 *   placeholder  — input placeholder text
 *   disabled     — disable the input
 *   dataTestId   — data-testid for the wrapper
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Plane } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const AirportSearchInput = ({
  value,
  onChange,
  placeholder = 'Search airport...',
  disabled = false,
  dataTestId = 'airport-search',
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef(null);
  const debounceRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchAirports = useCallback(async (q) => {
    if (!q || q.length < 1) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/airports/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setIsOpen(true);

    // Clear selection if user edits
    if (value) onChange(null);

    // Debounce search
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchAirports(val), 200);
  };

  const handleSelect = (airport) => {
    onChange(airport);
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
    setResults([]);
  };

  // Display text for selected airport
  const displayText = value
    ? `${value.iata_code} — ${value.airport_name}`
    : '';

  return (
    <div ref={wrapperRef} className="relative" data-testid={dataTestId}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
        <input
          type="text"
          value={value ? displayText : query}
          onChange={handleInputChange}
          onFocus={() => { if (query || results.length) setIsOpen(true); }}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full h-10 pl-9 pr-8 text-sm rounded-md border border-stone-200 bg-stone-50 
            focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            ${value ? 'text-stone-900 font-medium' : 'text-stone-600'}`}
          data-testid={`${dataTestId}-input`}
        />
        {(value || query) && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            data-testid={`${dataTestId}-clear`}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && !value && (query.length >= 1) && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-stone-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-sm text-stone-500">Searching...</div>
          )}
          {!loading && results.length === 0 && query.length >= 2 && (
            <div className="px-3 py-2 text-sm text-stone-400">No airports found</div>
          )}
          {results.map((apt) => (
            <button
              key={apt.iata_code}
              type="button"
              onClick={() => handleSelect(apt)}
              className="w-full text-left px-3 py-2.5 hover:bg-stone-50 border-b border-stone-100 last:border-b-0 transition-colors"
              data-testid={`${dataTestId}-option-${apt.iata_code}`}
            >
              <div className="flex items-center gap-2">
                <Plane className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                <span className="font-semibold text-sm text-stone-800">{apt.iata_code}</span>
                <span className="text-sm text-stone-500">—</span>
                <span className="text-sm text-stone-700 truncate">{apt.airport_name}</span>
              </div>
              <div className="ml-5.5 pl-1 text-xs text-stone-400 mt-0.5">
                {[apt.city, apt.country].filter(Boolean).join(', ')}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AirportSearchInput;
