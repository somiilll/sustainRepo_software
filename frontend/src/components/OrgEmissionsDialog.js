import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { BarChart3, Building2, Flame, Activity } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SCOPE_COLOURS = {
  scope1: '#10B981', // emerald
  scope2: '#3B82F6', // blue
  scope3: '#8B5CF6', // violet
  biogenic: '#F59E0B', // amber
};

const fallbackColour = (i) => ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#14B8A6'][i % 6];

const fmt = (n) => {
  const v = Number(n || 0);
  if (v === 0) return '0';
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(2)}k`;
  return v.toFixed(2);
};

export default function OrgEmissionsDialog({ org, open, onOpenChange }) {
  const { getAuthHeader } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !org?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(
          `${API}/super-admin/organizations/${org.id}/emissions-distribution`,
          { headers: getAuthHeader() },
        );
        if (!cancelled) setData(res.data);
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.detail || 'Failed to load emissions');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, org?.id, getAuthHeader]);

  const scopeChartData = useMemo(
    () =>
      (data?.by_scope || []).map((s, i) => ({
        name: s.scope_name,
        value: Number(s.total_co2e) || 0,
        count: s.record_count,
        fill: SCOPE_COLOURS[s.scope_code] || fallbackColour(i),
        code: s.scope_code,
      })),
    [data],
  );

  const facilityChartData = useMemo(() => {
    if (!data) return [];
    return data.by_facility.map((f) => {
      const row = { name: f.facility_name, total: f.total_co2e };
      data.scopes_meta.forEach((s) => {
        row[s.code] = f.by_scope[s.code] || 0;
      });
      return row;
    });
  }, [data]);

  const totalForPct = Math.max(Number(data?.totals?.total_co2e) || 0, 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl max-h-[92vh] overflow-y-auto"
        data-testid="org-emissions-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Emissions Distribution — {org?.name}
          </DialogTitle>
          <DialogDescription>
            Scope-wise and facility-wise CO₂e breakdown for this organisation.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
          </div>
        )}

        {error && !loading && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-6">
            {/* Totals */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="p-4 border-primary/30">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-lg">
                    <Flame className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Total CO₂e</p>
                    <p className="text-xl font-heading font-bold text-text-primary">
                      {fmt(data.totals.total_co2e)}{' '}
                      <span className="text-xs text-text-muted font-normal">tCO₂e</span>
                    </p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-50 p-2 rounded-lg">
                    <Activity className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Emission Records</p>
                    <p className="text-xl font-heading font-bold text-text-primary">
                      {data.totals.record_count}
                    </p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="bg-amber-50 p-2 rounded-lg">
                    <Building2 className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Facilities</p>
                    <p className="text-xl font-heading font-bold text-text-primary">
                      {data.by_facility.length}
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Scope-wise */}
            <div>
              <h3 className="text-lg font-heading font-bold text-text-primary mb-3">
                Scope-wise Distribution
              </h3>
              {data.totals.total_co2e === 0 ? (
                <Card className="p-8 text-center text-text-muted border-dashed">
                  No emissions recorded yet for this organisation.
                </Card>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card className="p-4">
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={scopeChartData.filter((s) => s.value > 0)}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={2}
                          label={(d) => `${d.name}: ${((d.value / totalForPct) * 100).toFixed(1)}%`}
                        >
                          {scopeChartData.map((entry) => (
                            <Cell key={entry.code} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v) => [`${fmt(v)} tCO₂e`, 'Emissions']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </Card>
                  <Card className="p-4 overflow-x-auto">
                    <table className="w-full text-sm" data-testid="scope-breakdown-table">
                      <thead className="text-left text-text-muted border-b border-stone-200">
                        <tr>
                          <th className="py-2 pr-3">Scope</th>
                          <th className="py-2 pr-3 text-right">CO₂e (t)</th>
                          <th className="py-2 pr-3 text-right">Share</th>
                          <th className="py-2 pr-3 text-right">Records</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scopeChartData.map((s) => (
                          <tr
                            key={s.code}
                            className="border-b border-stone-100 last:border-b-0"
                            data-testid={`scope-row-${s.code}`}
                          >
                            <td className="py-2 pr-3">
                              <span className="flex items-center gap-2">
                                <span
                                  className="w-3 h-3 rounded-sm"
                                  style={{ backgroundColor: s.fill }}
                                />
                                {s.name}
                              </span>
                            </td>
                            <td className="py-2 pr-3 text-right font-mono">{fmt(s.value)}</td>
                            <td className="py-2 pr-3 text-right text-text-muted">
                              {((s.value / totalForPct) * 100).toFixed(1)}%
                            </td>
                            <td className="py-2 pr-3 text-right">
                              <Badge variant="secondary">{s.count}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                </div>
              )}
            </div>

            {/* Facility-wise */}
            <div>
              <h3 className="text-lg font-heading font-bold text-text-primary mb-3">
                Facility-wise Distribution
              </h3>
              {data.by_facility.length === 0 ? (
                <Card className="p-8 text-center text-text-muted border-dashed">
                  No facilities under this organisation.
                </Card>
              ) : (
                <div className="space-y-4">
                  {data.totals.total_co2e > 0 && (
                    <Card className="p-4">
                      <ResponsiveContainer width="100%" height={Math.max(60 + data.by_facility.length * 32, 220)}>
                        <BarChart
                          data={facilityChartData}
                          layout="vertical"
                          margin={{ top: 8, right: 24, bottom: 8, left: 24 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                          <XAxis type="number" tickFormatter={fmt} />
                          <YAxis type="category" dataKey="name" width={140} />
                          <Tooltip formatter={(v) => `${fmt(v)} tCO₂e`} />
                          <Legend />
                          {data.scopes_meta.map((s, i) => (
                            <Bar
                              key={s.code}
                              dataKey={s.code}
                              stackId="scopes"
                              fill={SCOPE_COLOURS[s.code] || fallbackColour(i)}
                              name={s.name}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </Card>
                  )}
                  <Card className="p-4 overflow-x-auto">
                    <table className="w-full text-sm" data-testid="facility-breakdown-table">
                      <thead className="text-left text-text-muted border-b border-stone-200">
                        <tr>
                          <th className="py-2 pr-3">Facility</th>
                          {data.scopes_meta.map((s) => (
                            <th key={s.code} className="py-2 pr-3 text-right">{s.name}</th>
                          ))}
                          <th className="py-2 pr-3 text-right">Total</th>
                          <th className="py-2 pr-3 text-right">Records</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.by_facility.map((f) => (
                          <tr
                            key={f.facility_id}
                            className="border-b border-stone-100 last:border-b-0"
                            data-testid={`facility-row-${f.facility_id}`}
                          >
                            <td className="py-2 pr-3 font-medium">{f.facility_name}</td>
                            {data.scopes_meta.map((s) => (
                              <td key={s.code} className="py-2 pr-3 text-right font-mono text-text-muted">
                                {fmt(f.by_scope[s.code] || 0)}
                              </td>
                            ))}
                            <td className="py-2 pr-3 text-right font-mono font-semibold">
                              {fmt(f.total_co2e)}
                            </td>
                            <td className="py-2 pr-3 text-right">
                              <Badge variant="secondary">{f.record_count}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
