/**
 * DashboardESGGHG — Combined dashboard for orgs with both ESG and GHG modules enabled.
 * Extends the GHG dashboard with ESG-specific summary cards.
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import BaseExecutiveDashboard from './BaseExecutiveDashboard';
import { Card } from '../../components/ui/card';
import { Leaf, Users, Shield, TrendingUp, FileCheck } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function ESGSummaryCards() {
  const { getAuthHeader } = useAuth();
  const [esgStats, setEsgStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchESGStats = async () => {
      try {
        const response = await axios.get(`${API}/esg-records/summary`, {
          headers: getAuthHeader()
        });
        setEsgStats(response.data);
      } catch (error) {
        console.error('ESG stats fetch error:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchESGStats();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[1, 2, 3].map(i => (
          <Card key={i} className="p-4 animate-pulse bg-stone-100 h-24" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: 'Environment',
      icon: Leaf,
      value: esgStats?.environment_records || 0,
      label: 'Records',
      color: 'text-green-600',
      bg: 'bg-green-50',
      border: 'border-green-200'
    },
    {
      title: 'Social',
      icon: Users,
      value: esgStats?.social_records || 0,
      label: 'Records',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-200'
    },
    {
      title: 'Governance',
      icon: Shield,
      value: esgStats?.governance_records || 0,
      label: 'Records',
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      border: 'border-purple-200'
    }
  ];

  return (
    <div className="mb-6" data-testid="esg-summary-section">
      <div className="flex items-center gap-2 mb-3">
        <FileCheck className="w-5 h-5 text-emerald-600" />
        <h3 className="text-lg font-semibold text-text-primary">ESG Overview</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Card 
            key={card.title} 
            className={`p-4 ${card.bg} ${card.border} border`}
            data-testid={`esg-card-${card.title.toLowerCase()}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-secondary">{card.title}</p>
                <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                <p className="text-xs text-text-muted">{card.label}</p>
              </div>
              <card.icon className={`w-10 h-10 ${card.color} opacity-50`} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function DashboardESGGHG({ data }) {
  const hasScope3 = data.hasScope3Access;
  
  return (
    <div data-testid="dashboard-esg-ghg">
      {/* ESG Summary Cards at top */}
      <ESGSummaryCards />
      
      {/* Full GHG Dashboard below */}
      <BaseExecutiveDashboard data={data} hasScope3={hasScope3} />
    </div>
  );
}
