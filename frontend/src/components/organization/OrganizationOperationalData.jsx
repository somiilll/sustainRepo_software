import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { BarChart3, Loader2, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { YearlyMetricEditor } from './YearlyMetricEditor';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const emptyYearData = () => ({
  turnover: '',
  turnover_frequency: 'yearly',
  turnover_monthly: {},
  turnover_currency: 'INR',
  production_quantity: '',
  production_quantity_frequency: 'yearly',
  production_quantity_monthly: {},
  production_unit: 'MT',
});

const normalizeYearData = (data) => ({
  ...emptyYearData(),
  ...(data || {}),
  turnover_monthly: data?.turnover_monthly || {},
  production_quantity_monthly: data?.production_quantity_monthly || {},
});

const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';

const hasMetricData = (data, metric) => {
  const yearlyValue = metric === 'revenue' ? data?.turnover : data?.production_quantity;
  const monthlyValues = metric === 'revenue' ? data?.turnover_monthly : data?.production_quantity_monthly;
  return hasValue(yearlyValue) || Object.values(monthlyValues || {}).some(hasValue);
};

export const OrganizationOperationalData = ({
  activeTab,
  canEdit,
  getAuthHeader,
  isEditing,
  onCancel,
  organization,
  subscriptionExpired,
}) => {
  const [dataByYear, setDataByYear] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedYears, setSelectedYears] = useState([]);
  const isCalendarYear = organization?.reporting_year_type === 'calendar_year';
  const metric = activeTab === 'revenue' ? 'revenue' : 'production';
  const isEditable = isEditing && canEdit && !subscriptionExpired;

  const availableYears = useMemo(() => {
    if (!organization) return [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentPeriodStart = isCalendarYear || now.getMonth() >= 3 ? currentYear : currentYear - 1;
    return Array.from({ length: 5 }, (_, index) => {
      const year = currentPeriodStart - index;
      return isCalendarYear ? String(year) : `${year}-${String(year + 1).slice(-2)}`;
    });
  }, [isCalendarYear, organization]);

  const months = isCalendarYear
    ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    : ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

  const loadAllYears = useCallback(async () => {
    if (!availableYears.length) return;
    setLoading(true);
    const results = await Promise.all(availableYears.map(async (period) => {
      try {
        const response = await axios.get(`${API}/organization/yearly-data/${period}`, { headers: getAuthHeader() });
        return [period, normalizeYearData(response.data)];
      } catch (error) {
        console.error(`Failed to load organization data for ${period}:`, error);
        return [period, emptyYearData()];
      }
    }));
    const nextData = Object.fromEntries(results);
    setDataByYear(nextData);
    setSelectedYears(availableYears.filter((period) => hasMetricData(nextData[period], metric)));
    setLoading(false);
  }, [availableYears, getAuthHeader, metric]);

  useEffect(() => {
    loadAllYears();
  }, [loadAllYears]);

  const updateYear = (period, patch) => {
    setDataByYear((current) => ({
      ...current,
      [period]: { ...(current[period] || emptyYearData()), ...patch },
    }));
  };

  const addYear = (period) => {
    setSelectedYears((current) => availableYears.filter((year) => current.includes(year) || year === period));
  };

  const saveChanges = async () => {
    if (!selectedYears.length) return;
    setSaving(true);
    try {
      await Promise.all(selectedYears.map((period) => axios.post(
        `${API}/organization/yearly-data/${period}`,
        dataByYear[period] || emptyYearData(),
        { headers: getAuthHeader() },
      )));
      toast.success('Operational data saved successfully');
      await loadAllYears();
    } catch (error) {
      toast.error('Failed to save operational data');
    } finally {
      setSaving(false);
    }
  };

  const cancelChanges = async () => {
    await loadAllYears();
    onCancel();
  };

  if (!['production', 'revenue'].includes(activeTab)) return null;

  const periodPrefix = isCalendarYear ? 'CY' : 'FY';
  const currentYear = availableYears[0];
  const previousYear = availableYears[1];

  return (
    <div className="mt-6" data-testid={`organization-${metric}-all-years`}>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-emerald-100 p-2 text-emerald-700">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{metric === 'revenue' ? 'Revenue Data' : 'Production Data'}</h2>
            <p className="mt-1 text-sm text-text-muted">Saved reporting years are shown below.</p>
          </div>
        </div>
        {isEditable && (
          <div className="flex flex-wrap gap-2" data-testid={`organization-${metric}-add-year-actions`}>
            {!selectedYears.includes(currentYear) && (
              <Button type="button" variant="outline" onClick={() => addYear(currentYear)} data-testid={`organization-${metric}-add-current-year-button`}>
                <Plus className="mr-2 h-4 w-4" />Add current {periodPrefix}
              </Button>
            )}
            {!selectedYears.includes(previousYear) && (
              <Button type="button" variant="outline" onClick={() => addYear(previousYear)} data-testid={`organization-${metric}-add-previous-year-button`}>
                <Plus className="mr-2 h-4 w-4" />Add previous {periodPrefix}
              </Button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16" data-testid={`organization-${metric}-loading`}>
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          {selectedYears.map((period) => (
            <YearlyMetricEditor
              key={period}
              data={dataByYear[period] || emptyYearData()}
              disabled={!isEditable}
              metric={metric}
              months={months}
              onChange={(patch) => updateYear(period, patch)}
              period={period}
              periodLabel={`${periodPrefix} ${period}`}
            />
          ))}
          {!selectedYears.length && (
            <p className="py-8 text-center text-sm text-text-muted" data-testid={`organization-${metric}-empty-state`}>No reporting years have data yet.</p>
          )}
        </div>
      )}

      {isEditable && !loading && (
        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-stone-200 pt-4" data-testid={`organization-${metric}-edit-actions`}>
          <Button type="button" variant="outline" onClick={cancelChanges} disabled={saving} data-testid={`organization-${metric}-cancel-button`}>Cancel</Button>
          <Button type="button" onClick={saveChanges} disabled={saving || !selectedYears.length} data-testid={`organization-${metric}-save-changes-button`}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving' : 'Save Changes'}
          </Button>
        </div>
      )}
    </div>
  );
};