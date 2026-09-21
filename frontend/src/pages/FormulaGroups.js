import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Copy, GitBranch, ShieldCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function FormulaGroups() {
  const { getAuthHeader } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cloneSource, setCloneSource] = useState(null);
  const [targetGroup, setTargetGroup] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/super-admin/calc-engine/formula-groups`, { headers: getAuthHeader() });
      setGroups(response.data || []);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Unable to load formula groups');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  useEffect(() => { load(); }, [load]);

  const targetOptions = useMemo(() => groups.filter((group) => group.id !== cloneSource?.groupId), [groups, cloneSource]);

  const cloneFormula = async () => {
    if (!cloneSource || !targetGroup) return;
    try {
      await axios.post(`${API}/super-admin/calc-engine/formula-groups/${targetGroup}/clone-formula`, {
        formula_id: cloneSource.formula.id,
      }, { headers: getAuthHeader() });
      toast.success('Independent clone created. Rebind a decision-tree branch when ready.');
      setCloneSource(null);
      setTargetGroup('');
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Formula clone failed');
    }
  };

  if (loading) return <div className="flex min-h-80 items-center justify-center" data-testid="formula-groups-loading"><div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;

  return (
    <div className="space-y-7" data-testid="formula-groups-page">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700"><ShieldCheck className="h-4 w-4" /> Scope 3 activity basis</div>
          <h1 className="text-4xl font-heading font-bold text-text-primary">Formula Groups</h1>
        </div>
        <p className="max-w-xl text-sm text-text-secondary">A formula or field configuration belongs to one group. Clone before adapting logic for another group.</p>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map((group) => (
          <Card key={group.id} className="border-stone-200 p-5" data-testid={`formula-group-${group.id}`}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-heading font-bold text-text-primary">{group.id.replace('scope3_activity_', '').replaceAll('_', ' / ').toUpperCase()}</h2>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {group.categories.map((category) => <Badge key={category.id} variant="outline" data-testid={`formula-group-category-${category.id}`}>{category.code?.toUpperCase() || category.name}</Badge>)}
                </div>
              </div>
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100" data-testid={`formula-group-status-${group.id}`}>Isolated</Badge>
            </div>
            <div className="grid grid-cols-3 gap-3 border-y border-stone-100 py-3 text-sm">
              <div><div className="text-text-muted">Formulas</div><strong data-testid={`formula-group-formula-count-${group.id}`}>{group.formulas.length}</strong></div>
              <div><div className="text-text-muted">Fields</div><strong data-testid={`formula-group-mapping-count-${group.id}`}>{group.mappings.length}</strong></div>
              <div><div className="text-text-muted">Branches</div><strong data-testid={`formula-group-impact-count-${group.id}`}>{group.impacts.length}</strong></div>
            </div>
            <div className="mt-4 space-y-2">
              {group.formulas.map((formula) => (
                <div key={formula.id} className="flex items-center justify-between gap-3 text-sm" data-testid={`formula-group-formula-${formula.id}`}>
                  <span className="min-w-0 truncate font-medium text-text-primary">{formula.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => setCloneSource({ formula, groupId: group.id })} data-testid={`clone-formula-${formula.id}`}>
                    <Copy className="mr-1 h-3.5 w-3.5" /> Clone
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={Boolean(cloneSource)} onOpenChange={(open) => !open && setCloneSource(null)}>
        <DialogContent data-testid="formula-clone-dialog">
          <DialogHeader><DialogTitle>Create an independent formula clone</DialogTitle><DialogDescription>The decision tree remains unchanged until you intentionally rebind a branch.</DialogDescription></DialogHeader>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />This prevents a formula edit in one group from affecting another.</div>
          <Select value={targetGroup} onValueChange={setTargetGroup}>
            <SelectTrigger data-testid="clone-target-group-select"><SelectValue placeholder="Select target group" /></SelectTrigger>
            <SelectContent>{targetOptions.map((group) => <SelectItem key={group.id} value={group.id}>{group.id.replace('scope3_activity_', '').replaceAll('_', ' / ').toUpperCase()}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={cloneFormula} disabled={!targetGroup} data-testid="confirm-formula-clone-button"><GitBranch className="mr-2 h-4 w-4" />Create independent clone</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}