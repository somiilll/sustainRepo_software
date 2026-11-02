/**
 * Cross-framework answer links (BRSR <-> GRI).
 * - Shows a "From <framework question>" tag on answers that were auto-filled from the other framework.
 * - After a save, asks whether the same response should also be saved in the linked framework(s).
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Link2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { useAuth } from '../../contexts/AuthContext';

const API = process.env.REACT_APP_BACKEND_URL;
const FRAMEWORK_NAMES = { BRSR: 'BRSR', GRI: 'GRI' };
const NOOP = { map: {}, promptAfterSave: async () => {}, refresh: async () => {} };
const LinkedFrameworksContext = createContext(NOOP);

export const useLinkedFrameworks = () => useContext(LinkedFrameworksContext);

const shorten = (value) => {
  const text = value == null || value === '' ? '(empty)' : String(value);
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
};

export function LinkedFrameworksProvider({ framework, reportingPeriod, syncKey, children }) {
  const { getAuthHeader } = useAuth();
  const [map, setMap] = useState({});
  const [targets, setTargets] = useState([]);
  const [selected, setSelected] = useState({});
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!reportingPeriod) return;
    try {
      const res = await axios.get(`${API}/api/framework-links/autofilled`, { params: { framework, reporting_period: reportingPeriod }, headers: getAuthHeader() });
      setMap(res.data.questions || {});
    } catch (error) {
      setMap({});
    }
  }, [framework, reportingPeriod, getAuthHeader]);

  useEffect(() => { refresh(); }, [refresh, syncKey]);

  const promptAfterSave = useCallback(async (keys) => {
    if (!reportingPeriod || !keys?.length) return;
    try {
      const res = await axios.post(`${API}/api/framework-links/check`, { framework, question_keys: keys, reporting_period: reportingPeriod }, { headers: getAuthHeader() });
      const found = res.data.targets || [];
      if (found.length) {
        setSelected(Object.fromEntries(found.map((t) => [`${t.framework}:${t.question_key}:${t.source_key}`, true])));
        setTargets(found);
      }
    } catch (error) {
      console.error('Linked framework check failed:', error);
    }
    refresh();
  }, [framework, reportingPeriod, getAuthHeader, refresh]);

  const close = () => setTargets([]);

  const apply = async () => {
    const chosen = targets.filter((t) => selected[`${t.framework}:${t.question_key}:${t.source_key}`]);
    setSaving(true);
    try {
      await axios.post(`${API}/api/framework-links/push`, {
        framework, reporting_period: reportingPeriod,
        targets: chosen.map((t) => ({ framework: t.framework, question_key: t.question_key, source_key: t.source_key })),
      }, { headers: getAuthHeader() });
      toast.success(`Response also saved in ${[...new Set(chosen.map((t) => FRAMEWORK_NAMES[t.framework] || t.framework))].join(', ')}`);
      close();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not update the linked response');
    } finally {
      setSaving(false);
    }
  };

  const value = useMemo(() => ({ map, promptAfterSave, refresh }), [map, promptAfterSave, refresh]);
  const anySelected = Object.values(selected).some(Boolean);

  return (
    <LinkedFrameworksContext.Provider value={value}>
      {children}
      <Dialog open={targets.length > 0} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-2xl" data-testid="linked-save-dialog">
          <DialogHeader>
            <DialogTitle>Save the same response in the linked framework?</DialogTitle>
            <DialogDescription>This answer is linked to the questions below. Choose where to save it as well.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-3 overflow-y-auto">
            {targets.map((t) => {
              const id = `${t.framework}:${t.question_key}:${t.source_key}`;
              return (
                <label key={id} className="flex cursor-pointer gap-3 rounded-lg border border-stone-200 p-3" data-testid={`linked-target-${t.question_key}`}>
                  <Checkbox checked={!!selected[id]} onCheckedChange={(checked) => setSelected((prev) => ({ ...prev, [id]: !!checked }))} className="mt-1" />
                  <span className="min-w-0 text-sm">
                    <span className="block font-semibold text-stone-900">{FRAMEWORK_NAMES[t.framework] || t.framework}: {t.label}</span>
                    <span className="mt-1 block text-stone-500">Now: {shorten(t.current_value)}</span>
                    <span className="block text-stone-800">New: {shorten(t.new_value)}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={saving} data-testid="linked-save-no">No, keep as is</Button>
            <Button onClick={apply} disabled={saving || !anySelected} data-testid="linked-save-yes">Yes, save in linked framework</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LinkedFrameworksContext.Provider>
  );
}

export function LinkedFromTag({ questionKey }) {
  const source = useLinkedFrameworks().map[questionKey];
  if (!source) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700" title={source.label} data-testid={`linked-from-${questionKey}`}>
      <Link2 className="h-3 w-3" /> From {FRAMEWORK_NAMES[source.framework] || source.framework}
    </span>
  );
}
