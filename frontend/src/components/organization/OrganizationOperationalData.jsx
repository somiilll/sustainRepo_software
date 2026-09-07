import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { BarChart3, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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

export const OrganizationOperationalData = ({ activeTab, getAuthHeader, organization, subscriptionExpired }) => {
  const [dataByYear, setDataByYear] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingByYear, setSavingByYear] = useState({});
  const isCalendarYear = organization?.reporting_year_type === 'calendar_year';
  const metric = activeTab === 'revenue' ? 'revenue' : 'production';

  const reportingYears = useMemo(() => {
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

  useEffect(() => {
    if (!reportingYears.length) return undefined;
    let cancelled = false;

    const loadAllYears = async () => {
      setLoading(true);
      const results = await Promise.all(reportingYears.map(async (period) => {
        try {
          const response = await axios.get(`${API}/organization/yearly-data/${period}`, {
            headers: getAuthHeader(),
          });
          return [period, normalizeYearData(response.data)];
        } catch (error) {
          console.error(`Failed to load organization data for ${period}:`, error);
          return [period, emptyYearData()];
        }
      }));

      if (!cancelled) {
        setDataByYear(Object.fromEntries(results));
        setLoading(false);
      }
    };

    loadAllYears();
    return () => { cancelled = true; };
  }, [getAuthHeader, reportingYears]);

  const updateYear = (period, patch) => {
    setDataByYear((current) => ({
      ...current,
      [period]: { ...(current[period] || emptyYearData()), ...patch },
    }));
  };

  const saveYear = async (period) => {
    if (subscriptionExpired) {
      toast.error('Subscription expired. Cannot save data.');
      return;
    }

    setSavingByYear((current) => ({ ...current, [period]: true }));
    try {
      await axios.post(`${API}/organization/yearly-data/${period}`, dataByYear[period], {
        headers: getAuthHeader(),
      });
      toast.success(`Saved data for ${isCalendarYear ? 'CY' : 'FY'} ${period}`);
    } catch (error) {
      toast.error('Failed to save yearly data');
    } finally {
      setSavingByYear((current) => ({ ...current, [period]: false }));
    }
  };

  if (!['production', 'revenue'].includes(activeTab)) return null;

  return (
    <div className="mt-6" data-testid={`organization-${metric}-all-years`}>
      <div className="mb-5 flex items-start gap-3">
        <div className="rounded-md bg-emerald-100 p-2 text-emerald-700">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            {metric === 'revenue' ? 'Revenue Data' : 'Production Data'}
          </h2>
          <p className="mt-1 text-sm text-text-muted">All reporting years are shown together.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16" data-testid={`organization-${metric}-loading`}>
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          {reportingYears.map((period) => (
            <YearlyMetricEditor
              key={period}
              data={dataByYear[period] || emptyYearData()}
              disabled={subscriptionExpired}
              isSaving={Boolean(savingByYear[period])}
              metric={metric}
              months={months}
              onChange={(patch) => updateYear(period, patch)}
              onSave={() => saveYear(period)}
              period={period}
              periodLabel={`${isCalendarYear ? 'CY' : 'FY'} ${period}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};