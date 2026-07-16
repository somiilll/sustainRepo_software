import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import ESGRecordsDataEntry from './ESGRecordsDataEntry';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * ESG Records Module — Logs-only view for Environment, Social, Governance sections.
 * My Tasks, Tracker, and Add Metric have moved to Workflow and Uploads respectively.
 */
export default function ESGRecordsModule({ section = 'environment', framework = 'BRSR', preFilterCategory = '' }) {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const [reportingPeriod, setReportingPeriod] = useState('');
  const [reportingYears, setReportingYears] = useState([]);

  const category = preFilterCategory || searchParams.get('category') || '';
  const preFilterSubcategory = searchParams.get('subcategory') || '';

  useEffect(() => {
    if (!token) return;
    axios.get(`${API}/esg-records/reporting-years/${section}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => {
      const years = res.data || [];
      setReportingYears(years);
      if (years.length > 0 && !reportingPeriod) {
        setReportingPeriod(years[0]);
      }
    }).catch(() => null);
  }, [token, section]);

  return (
    <div className="space-y-4" data-testid={`esg-records-module-${section}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold capitalize text-stone-800">{section} Records</h2>
        {reportingYears.length > 0 && (
          <Select value={reportingPeriod} onValueChange={setReportingPeriod}>
            <SelectTrigger className="w-48" data-testid="reporting-period-select">
              <SelectValue placeholder="Reporting Period" />
            </SelectTrigger>
            <SelectContent>
              {reportingYears.map(year => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <ESGRecordsDataEntry
        section={section}
        framework={framework}
        mode="list"
        preFilterCategory={category}
        preFilterSubcategory={preFilterSubcategory}
      />
    </div>
  );
}
