/**
 * OrgEnvironmentKPI — Environment KPI page for org-specific custom modules
 *
 * Used by catch-all routes like /environment/:moduleCode and /environment/:moduleCode/:subcatCode
 * Renders the ESGRecordsModule with the correct category/subcategory from the URL.
 * The backend /api/esg-records/categories/environment returns org-resolved categories,
 * so the existing ESGRecordsDataEntry renders org-specific fields automatically.
 */

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import ESGRecordsModule from '../components/ESGRecordsModule';
import { Sprout, Loader2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function OrgEnvironmentKPI() {
  const { moduleCode, subcatCode } = useParams();
  const { token } = useAuth();
  const [resolvedNames, setResolvedNames] = useState({ module: '', subcat: '' });

  // Fetch categories to get the exact display names (preserves casing like "DG Sets")
  useEffect(() => {
    if (!token || !moduleCode) return;
    axios.get(`${API}/esg-records/categories/environment`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => {
      const cats = res.data?.categories || [];
      // Find matching module by code
      const matching = cats.find(c =>
        (c.module_code === moduleCode || c.category?.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') === moduleCode)
      );
      const moduleName = matching?.category || moduleCode.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

      let subcatName = '';
      if (subcatCode) {
        const subcatMatch = cats.find(c =>
          (c.category_code === subcatCode || c.subcategory?.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') === subcatCode)
          && (c.module_code === moduleCode || c.category?.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') === moduleCode)
        );
        subcatName = subcatMatch?.subcategory || subcatCode.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      }

      setResolvedNames({ module: moduleName, subcat: subcatName });
    }).catch(() => {
      setResolvedNames({
        module: moduleCode.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        subcat: subcatCode ? subcatCode.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '',
      });
    });
  }, [token, moduleCode, subcatCode]);

  if (!resolvedNames.module) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>;
  }

  return (
    <div className="space-y-6" data-testid={`org-env-kpi-${moduleCode}`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
          <Sprout className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-heading font-bold text-text-primary">
            <span className="text-stone-400">Environment</span>
            <span className="text-stone-300 mx-2">→</span>
            {resolvedNames.module}
          </h1>
          {resolvedNames.subcat && <p className="text-sm text-stone-500">{resolvedNames.subcat}</p>}
        </div>
      </div>

      <ESGRecordsModule
        section="environment"
        preFilterCategory={resolvedNames.module}
        preFilterSubcategory={resolvedNames.subcat}
      />
    </div>
  );
}
