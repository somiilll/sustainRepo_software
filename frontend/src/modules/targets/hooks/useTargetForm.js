/**
 * useTargetForm — local form state for create/edit target dialog.
 *
 * Critical: handles the empty↔value transitions in BOTH directions.
 * When a value is cleared, the resulting payload omits the field (or sets
 * it to null) so the backend's "store as null/empty" contract holds.
 *
 * Internally we store the configuration as a plain JS object keyed by
 * scope (or `<scope>:<categoryId>` for category mode). Each entry is
 * `{ target_year, target_type, value }` or absent (=NA).
 */
import { useCallback, useMemo, useState } from 'react';

const EMPTY_TOTAL = () => ({ target_year: '', target_type: 'percentage', value: '' });

export default function useTargetForm(initial) {
  const [name, setName] = useState(initial?.name || '');
  const [mode, setMode] = useState(initial?.target_mode || 'total');
  const [config, setConfig] = useState(() => initial?.target_configuration || {});

  // Ensure total mode has a single config object on first switch.
  const totalConfig = useMemo(() => {
    if (mode !== 'total') return EMPTY_TOTAL();
    if (config && typeof config === 'object' && 'value' in config) return { ...EMPTY_TOTAL(), ...config };
    return EMPTY_TOTAL();
  }, [mode, config]);

  const setTotalField = useCallback((field, val) => {
    setConfig((prev) => ({ ...EMPTY_TOTAL(), ...prev, [field]: val }));
  }, []);

  // Set or clear a per-key entry (scope or scope:category).
  const setEntryField = useCallback((key, field, val) => {
    setConfig((prev) => {
      const next = { ...(prev || {}) };
      const existing = next[key] || { target_year: '', target_type: 'percentage', value: '' };
      const updated = { ...existing, [field]: val };
      // If all three fields are empty/null → drop entry entirely (NA).
      const isEmpty =
        (updated.target_year === '' || updated.target_year == null) &&
        (updated.value === '' || updated.value == null);
      if (isEmpty) {
        delete next[key];
      } else {
        next[key] = updated;
      }
      return next;
    });
  }, []);

  const clearEntry = useCallback((key) => {
    setConfig((prev) => {
      const next = { ...(prev || {}) };
      delete next[key];
      return next;
    });
  }, []);

  // Build the final payload, normalizing empty inputs to null and dropping
  // unconfigured entries (NA semantics).
  const buildPayload = useCallback(() => {
    const cfg = (() => {
      if (mode === 'total') {
        const t = totalConfig;
        const v = t.value === '' || t.value == null ? null : Number(t.value);
        return {
          target_year: t.target_year || null,
          target_type: t.target_type || 'percentage',
          value: v,
        };
      }
      // scope / category modes: keep only entries with at least one filled field.
      const out = {};
      Object.entries(config || {}).forEach(([key, entry]) => {
        if (!entry) return;
        const v = entry.value === '' || entry.value == null ? null : Number(entry.value);
        const hasYear = !!entry.target_year;
        const hasValue = v != null && !Number.isNaN(v);
        if (!hasYear && !hasValue) return; // NA → skip
        out[key] = {
          target_year: entry.target_year || null,
          target_type: entry.target_type || 'percentage',
          value: hasValue ? v : null,
        };
      });
      return out;
    })();

    return {
      name: name.trim(),
      target_mode: mode,
      target_configuration: cfg,
    };
  }, [name, mode, config, totalConfig]);

  // Validation: name + at-least-one-target rule, sane percentages, no negatives.
  const validate = useCallback(() => {
    const errors = [];
    if (!name.trim()) errors.push('Target name is required');

    if (mode === 'total') {
      const t = totalConfig;
      if (!t.target_year) errors.push('Target year is required');
      if (t.value === '' || t.value == null || Number.isNaN(Number(t.value))) {
        errors.push('Target value is required');
      } else {
        const num = Number(t.value);
        if (num < 0) errors.push('Target value cannot be negative');
        if (t.target_type === 'percentage' && num > 100) {
          errors.push('Percentage cannot exceed 100');
        }
      }
    } else {
      // scope / category — require at least one configured entry.
      const entries = Object.entries(config || {});
      const filled = entries.filter(([, e]) => e && (e.target_year || (e.value !== '' && e.value != null)));
      if (filled.length === 0) {
        errors.push('Configure at least one target (others can remain NA)');
      }
      filled.forEach(([key, e]) => {
        if (!e.target_year) errors.push(`${key}: target year is required when value is set`);
        if (e.value === '' || e.value == null || Number.isNaN(Number(e.value))) {
          errors.push(`${key}: value is required when year is set`);
        } else {
          const num = Number(e.value);
          if (num < 0) errors.push(`${key}: value cannot be negative`);
          if (e.target_type === 'percentage' && num > 100) {
            errors.push(`${key}: percentage cannot exceed 100`);
          }
        }
      });
    }

    return errors;
  }, [name, mode, config, totalConfig]);

  return {
    // state
    name, mode, config, totalConfig,
    // setters
    setName, setMode, setConfig,
    setTotalField, setEntryField, clearEntry,
    // helpers
    buildPayload, validate,
  };
}
