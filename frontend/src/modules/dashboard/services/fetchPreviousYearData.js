import { useEffect, useState } from 'react';
import axios from 'axios';
import { format } from 'date-fns';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function usePreviousYearData({
  dateRange,
  selectedFacilities,
  getAuthHeader,
}) {
  const [previousYearData, setPreviousYearData] = useState({ status: 'idle', totals: null, window: null });

  useEffect(() => {
    const fetchPreviousYearData = async () => {
      try {
        if (!dateRange?.from || !dateRange?.to) return;
        setPreviousYearData({ status: 'loading', totals: null, window: null });

        const fromDate = new Date(dateRange.from);
        const toDate = new Date(dateRange.to);

        // shift 1 year back
        const prevFrom = new Date(fromDate);
        prevFrom.setFullYear(prevFrom.getFullYear() - 1);

        const prevTo = new Date(toDate);
        prevTo.setFullYear(prevTo.getFullYear() - 1);

        const params = new URLSearchParams({
          start_period: format(prevFrom, 'yyyy-MM'),
          end_period: format(prevTo, 'yyyy-MM'),
        });
        selectedFacilities?.forEach((facilityId) => params.append('facility_id', facilityId));
        const res = await axios.get(`${API}/dashboard/stats?${params.toString()}`, {
          headers: getAuthHeader(),
        });
        const totals = {
          totalEmissions: res.data?.total_emissions || 0,
          totalSinks: res.data?.sinks_total || 0,
          scope1: res.data?.scope1_emissions || 0,
          scope2: res.data?.scope2_emissions || 0,
          scope3: res.data?.scope3_emissions || 0,
          recordCount: res.data?.record_count || 0,
        };
        setPreviousYearData({
          status: totals.recordCount > 0 ? 'available' : 'no-data',
          totals,
          window: { from: prevFrom, to: prevTo },
        });
      } catch (err) {
        console.error('Failed to fetch previous FY totals', err);
        setPreviousYearData({ status: 'error', totals: null, window: null });
      }
    };

    fetchPreviousYearData();
  }, [dateRange, selectedFacilities, getAuthHeader]);

  return previousYearData;
}