import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Loader2, PlayCircle, ChevronRight, ChevronDown, Beaker } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function CalculationSandbox() {
  const { getAuthHeader } = useAuth();
  const [formulas, setFormulas] = useState([]);
  const [selectedFormulaId, setSelectedFormulaId] = useState('');
  const [selectedFormula, setSelectedFormula] = useState(null);

  // Runtime state
  const [inputs, setInputs] = useState({});          // { qty: {value, unit} }
  const [overrides, setOverrides] = useState({});    // { ef_q_co2: {value, unit} }
  const [overrideEnabled, setOverrideEnabled] = useState({});
  const [context, setContext] = useState({ fuel_code: '', region: '', year: '' });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [auditExpanded, setAuditExpanded] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/calc-engine/formulas`, { headers: getAuthHeader() });
        setFormulas(res.data || []);
      } catch (err) {
        console.error(err);
        toast.error('Could not load formulas');
      }
    })();
  }, [getAuthHeader]);

  useEffect(() => {
    if (!selectedFormulaId) {
      setSelectedFormula(null);
      return;
    }
    const f = formulas.find((x) => x.id === selectedFormulaId);
    setSelectedFormula(f);
    // Initialise inputs with default unit
    const next = {};
    (f?.definition?.inputs || []).forEach((i) => {
      next[i.variable] = { value: '', unit: i.expected_unit };
    });
    setInputs(next);
    setOverrides({});
    setOverrideEnabled({});
    setResult(null);
  }, [selectedFormulaId, formulas]);

  const run = async () => {
    if (!selectedFormula) return;
    setRunning(true);
    setResult(null);
    try {
      const parsedInputs = {};
      for (const [k, v] of Object.entries(inputs)) {
        if (v.value === '' || v.value === null) continue;
        const num = Number(v.value);
        if (!Number.isFinite(num)) {
          toast.error(`Input '${k}' must be a number`);
          setRunning(false);
          return;
        }
        parsedInputs[k] = { value: num, unit: v.unit };
      }
      const userOverrides = {};
      Object.entries(overrides).forEach(([k, v]) => {
        if (overrideEnabled[k] && v.value !== '' && Number.isFinite(Number(v.value))) {
          userOverrides[k] = { value: Number(v.value), unit: v.unit };
        }
      });
      const ctx = Object.fromEntries(
        Object.entries(context).filter(([, v]) => v !== '' && v !== null),
      );
      const res = await axios.post(
        `${API}/super-admin/calc-engine/execute`,
        {
          formula_id: selectedFormula.id,
          inputs: parsedInputs,
          context: ctx,
          user_overrides: userOverrides,
          dry_run: true,
        },
        { headers: getAuthHeader() },
      );
      setResult(res.data);
    } catch (err) {
      const detail = err.response?.data?.detail || err.message;
      toast.error(typeof detail === 'string' ? detail : 'Calculation failed');
      setResult({ ok: false, error: detail });
    } finally {
      setRunning(false);
    }
  };

  const def = selectedFormula?.definition;

  return (
    <div className="space-y-6" data-testid="calc-sandbox-page">
      <div>
        <h1 className="text-4xl font-heading font-bold text-text-primary mb-2 flex items-center gap-3">
          <Beaker className="w-8 h-8 text-primary" />
          Calculation Sandbox
        </h1>
        <p className="text-text-secondary">
          Pick a formula, feed it inputs and context, and see a step-by-step dry-run with the full audit trail. Nothing is persisted.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column — inputs */}
        <div className="space-y-4">
          <Card className="p-5 border border-stone-200 rounded-xl">
            <Label className="mb-2 block">Formula</Label>
            <Select value={selectedFormulaId} onValueChange={setSelectedFormulaId}>
              <SelectTrigger className="w-full" data-testid="formula-picker">
                <SelectValue placeholder="Pick a formula…" />
              </SelectTrigger>
              <SelectContent>
                {formulas.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {def && (
              <div className="mt-3 text-sm text-text-muted">
                <p>{selectedFormula.description || <span className="italic">No description.</span>}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {def.outputs.map((o) => (
                    <Badge key={o.variable} className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      → {o.variable} ({o.unit})
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {def && (
            <>
              <Card className="p-5 border border-stone-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading font-bold text-text-primary">Inputs</h3>
                  <Badge variant="secondary" className="text-xs">{def.inputs.length}</Badge>
                </div>
                {def.inputs.map((inp) => (
                  <div key={inp.variable} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <Label className="text-sm">{inp.variable}{inp.required && <span className="text-red-500"> *</span>}</Label>
                    <Input
                      type="number"
                      placeholder="value"
                      value={inputs[inp.variable]?.value ?? ''}
                      onChange={(e) => setInputs((p) => ({
                        ...p,
                        [inp.variable]: { ...(p[inp.variable] || {}), value: e.target.value },
                      }))}
                      className="bg-stone-50"
                      data-testid={`input-value-${inp.variable}`}
                    />
                    <Input
                      className="w-24 bg-stone-50 font-mono text-xs"
                      value={inputs[inp.variable]?.unit ?? inp.expected_unit}
                      onChange={(e) => setInputs((p) => ({
                        ...p,
                        [inp.variable]: { ...(p[inp.variable] || {}), unit: e.target.value },
                      }))}
                      data-testid={`input-unit-${inp.variable}`}
                    />
                  </div>
                ))}
              </Card>

              <Card className="p-5 border border-stone-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading font-bold text-text-primary">Context</h3>
                  <span className="text-xs text-text-muted">Used to resolve properties</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {['fuel_code', 'region', 'year'].map((k) => (
                    <Input
                      key={k}
                      placeholder={k}
                      value={context[k] ?? ''}
                      onChange={(e) => setContext((p) => ({ ...p, [k]: e.target.value }))}
                      className="bg-stone-50"
                      data-testid={`context-${k}`}
                    />
                  ))}
                </div>
              </Card>

              {def.properties?.length > 0 && (
                <Card className="p-5 border border-stone-200 rounded-xl space-y-3">
                  <h3 className="font-heading font-bold text-text-primary">User Overrides (optional)</h3>
                  <p className="text-xs text-text-muted">Override any auto-resolved property with a specific value.</p>
                  {def.properties.map((p) => (
                    <div key={p.variable} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center">
                      <input
                        type="checkbox"
                        checked={!!overrideEnabled[p.variable]}
                        onChange={(e) => setOverrideEnabled((prev) => ({ ...prev, [p.variable]: e.target.checked }))}
                        data-testid={`override-toggle-${p.variable}`}
                      />
                      <Label className="text-sm">{p.variable}</Label>
                      <Input
                        type="number"
                        placeholder="value"
                        value={overrides[p.variable]?.value ?? ''}
                        disabled={!overrideEnabled[p.variable]}
                        onChange={(e) => setOverrides((prev) => ({
                          ...prev,
                          [p.variable]: { ...(prev[p.variable] || { unit: p.expected_unit }), value: e.target.value },
                        }))}
                        className="bg-stone-50"
                      />
                      <Input
                        className="w-24 bg-stone-50 font-mono text-xs"
                        value={overrides[p.variable]?.unit ?? p.expected_unit}
                        disabled={!overrideEnabled[p.variable]}
                        onChange={(e) => setOverrides((prev) => ({
                          ...prev,
                          [p.variable]: { ...(prev[p.variable] || { value: '' }), unit: e.target.value },
                        }))}
                      />
                    </div>
                  ))}
                </Card>
              )}

              <Button
                onClick={run}
                disabled={running}
                className="w-full bg-primary hover:bg-primary/90 text-white rounded-full"
                data-testid="run-sandbox-btn"
              >
                {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
                Run calculation
              </Button>
            </>
          )}
        </div>

        {/* Right column — output */}
        <div className="space-y-4">
          {!result && (
            <Card className="p-12 border-dashed text-center text-text-muted">
              <Beaker className="w-10 h-10 mx-auto mb-3 text-stone-300" />
              <p>Outputs and step-by-step audit log will appear here.</p>
            </Card>
          )}
          {result?.ok === false && (
            <Card className="p-5 border border-red-300 bg-red-50 rounded-xl">
              <p className="font-medium text-red-700 mb-1">Calculation error</p>
              <pre className="text-sm text-red-800 whitespace-pre-wrap">{String(result.error)}</pre>
            </Card>
          )}
          {result?.outputs && (
            <>
              <Card className="p-5 border border-emerald-200 rounded-xl bg-emerald-50/30">
                <h3 className="font-heading font-bold text-text-primary mb-3">Outputs</h3>
                <div className="space-y-2">
                  {Object.entries(result.outputs).map(([k, v]) => (
                    <div key={k} className="flex justify-between items-baseline gap-4" data-testid={`output-${k}`}>
                      <span className="font-mono text-sm text-text-secondary">{k}</span>
                      <span className="font-heading font-bold text-xl text-text-primary">
                        {Number(v.value).toLocaleString(undefined, { maximumFractionDigits: 6 })}{' '}
                        <span className="text-xs text-text-muted font-normal">{v.unit}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5 border border-stone-200 rounded-xl">
                <button
                  onClick={() => setAuditExpanded(!auditExpanded)}
                  className="flex items-center gap-2 font-heading font-bold text-text-primary w-full text-left"
                  data-testid="toggle-audit-log"
                >
                  {auditExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  Audit log ({result.audit_log?.length || 0} steps)
                </button>
                {auditExpanded && (
                  <div className="mt-3 space-y-1 max-h-[500px] overflow-y-auto font-mono text-xs">
                    {(result.audit_log || []).map((entry, i) => (
                      <AuditRow key={i} entry={entry} />
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AuditRow({ entry }) {
  const stepColour = {
    convert: 'bg-blue-50 border-blue-200 text-blue-900',
    transformation: 'bg-purple-50 border-purple-200 text-purple-900',
    'transformation.apply': 'bg-purple-50 border-purple-200 text-purple-900',
    resolve_property: 'bg-amber-50 border-amber-200 text-amber-900',
    formula_step: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    validate_formula: 'bg-stone-50 border-stone-200 text-stone-700',
    input: 'bg-stone-50 border-stone-200 text-stone-700',
    outputs: 'bg-emerald-100 border-emerald-300 text-emerald-900 font-semibold',
  };
  const cls = stepColour[entry.step] || 'bg-white border-stone-200';
  return (
    <div className={`px-2 py-1.5 rounded border ${cls}`}>
      <div className="font-semibold">{entry.step}{entry.name ? ` · ${entry.name}` : ''}</div>
      <pre className="mt-0.5 whitespace-pre-wrap break-all text-[11px] leading-snug">
        {JSON.stringify(
          Object.fromEntries(Object.entries(entry).filter(([k]) => !['step', 'name'].includes(k))),
          null, 2,
        )}
      </pre>
    </div>
  );
}
