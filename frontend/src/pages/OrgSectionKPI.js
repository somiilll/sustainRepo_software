/**
 * OrgSectionKPI — Generic KPI page for org-specific custom modules
 *
 * Works for all ESG sections: environment, social, governance.
 * Used by catch-all routes like /:section/:moduleCode and /:section/:moduleCode/:subcatCode
 * Renders ESGRecordsModule with the correct category/subcategory from the URL.
 * The backend returns org-resolved categories automatically.
 */

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import ESGRecordsModule from '../components/ESGRecordsModule';
import { Sprout, Users2, Shield, Loader2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SECTION_ICONS = {
  environment: Sprout,
  social: Users2,
  governance: Shield,
};

export default function OrgSectionKPI({ section = 'environment' }) {
  const { moduleCode, subcatCode } = useParams();
  const { token } = useAuth();
  const [resolvedNames, setResolvedNames] = useState({ module: '', subcat: '' });

  useEffect(() => {
    if (!token || !moduleCode) return;
    axios.get(`${API}/esg-records/categories/${section}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => {
      const cats = res.data?.categories || [];
      const toCode = n => (n || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const matching = cats.find(c =>
        c.module_code === moduleCode || toCode(c.category) === moduleCode
      );
      const moduleName = matching?.category || moduleCode.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

      let subcatName = '';
      if (subcatCode) {
        const subcatMatch = cats.find(c =>
          (c.category_code === subcatCode || toCode(c.subcategory) === subcatCode)
          && (c.module_code === moduleCode || toCode(c.category) === moduleCode)
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
  }, [token, moduleCode, subcatCode, section]);

  if (!resolvedNames.module) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>;
  }

  const Icon = SECTION_ICONS[section] || Sprout;

  return (
    <div className="space-y-6" data-testid={`org-${section}-kpi-${moduleCode}`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
          <Icon className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-heading font-bold text-text-primary">{resolvedNames.module}</h1>
          {resolvedNames.subcat && <p className="text-sm text-stone-500">{resolvedNames.subcat}</p>}
        </div>
      </div>
      <ESGRecordsModule
        section={section}
        preFilterCategory={resolvedNames.module}
        preFilterSubcategory={resolvedNames.subcat}
      />
    </div>
  );
}
