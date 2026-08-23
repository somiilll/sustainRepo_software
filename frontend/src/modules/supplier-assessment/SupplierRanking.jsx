import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useSupplierAssessmentPeriod } from '../../contexts/SupplierAssessmentPeriodContext';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { 
  Trophy, 
  TrendingUp, 
  Award, 
  Medal,
  Leaf,
  Users,
  Shield,
  Factory,
  BarChart3,
  PieChart as PieChartIcon,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  LineChart,
  Line,
} from 'recharts';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusColors = {
  not_started: 'bg-stone-100 text-stone-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
};

const COLORS = {
  environment: '#10b981',
  social: '#3b82f6',
  governance: '#8b5cf6',
  scope1: '#ef4444',
  scope2: '#f59e0b',
  excellent: '#22c55e',
  good: '#3b82f6',
  average: '#f59e0b',
  poor: '#ef4444',
};

const PIE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444'];

export default function SupplierRanking() {
  const { getAuthHeader } = useAuth();
  const { reportingPeriod } = useSupplierAssessmentPeriod();
  const [rankings, setRankings] = useState([]);
  const [stats, setStats] = useState({ 
    total: 0, 
    ranked: 0,
    score_distribution: {},
    averages: {},
    emissions_by_scope: {},
  });
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('overall');
  const [activeTab, setActiveTab] = useState('overview');

  const fetchRankings = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/supplier-assessment/rankings?reporting_period=${encodeURIComponent(reportingPeriod)}`, {
        headers: getAuthHeader(),
      });
      setRankings(res.data.rankings || []);
      setStats({
        total: res.data.total_suppliers || 0,
        ranked: res.data.ranked_suppliers || 0,
        score_distribution: res.data.score_distribution || {},
        averages: res.data.averages || {},
        emissions_by_scope: res.data.emissions_by_scope || {},
      });
    } catch (err) {
      toast.error('Failed to load rankings');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader, reportingPeriod]);

  useEffect(() => {
    fetchRankings();
  }, [fetchRankings]);

  const getRankIcon = (rank) => {
    if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-stone-400" />;
    if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
    return <span className="text-stone-400 font-medium">#{rank}</span>;
  };

  const getScoreColor = (score) => {
    if (score === null || score === undefined) return 'text-stone-400';
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-blue-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score) => {
    if (score === null || score === undefined) return 'bg-stone-100';
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-blue-100';
    if (score >= 40) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  // Sort rankings based on selected criteria
  const sortedRankings = [...rankings].sort((a, b) => {
    const scoreKey = sortBy === 'overall' ? 'overall_score' : 
                     sortBy === 'esg' ? 'esg_score' :
                     sortBy === 'environment' ? 'environment_score' :
                     sortBy === 'social' ? 'social_score' :
                     sortBy === 'governance' ? 'governance_score' :
                     sortBy === 'ghg' ? 'ghg_score' : 'overall_score';
    
    const aScore = a[scoreKey] ?? -1;
    const bScore = b[scoreKey] ?? -1;
    return bScore - aScore;
  });

  // Prepare chart data
  const scoreDistributionData = [
    { name: 'Excellent (80+)', value: stats.score_distribution.excellent || 0, color: COLORS.excellent },
    { name: 'Good (60-79)', value: stats.score_distribution.good || 0, color: COLORS.good },
    { name: 'Average (40-59)', value: stats.score_distribution.average || 0, color: COLORS.average },
    { name: 'Poor (<40)', value: stats.score_distribution.poor || 0, color: COLORS.poor },
  ].filter(d => d.value > 0);

  const esgBreakdownData = [
    { name: 'Environment', value: stats.averages.environment || 0, fullMark: 100 },
    { name: 'Social', value: stats.averages.social || 0, fullMark: 100 },
    { name: 'Governance', value: stats.averages.governance || 0, fullMark: 100 },
  ];

  const emissionsByScopeData = [
    { name: 'Scope 1', value: stats.emissions_by_scope.scope1 || 0, color: COLORS.scope1 },
    { name: 'Scope 2', value: stats.emissions_by_scope.scope2 || 0, color: COLORS.scope2 },
  ];

  // Top 10 suppliers for bar chart
  const top10Suppliers = sortedRankings.slice(0, 10).map(s => ({
    name: s.company_name.length > 15 ? s.company_name.substring(0, 15) + '...' : s.company_name,
    fullName: s.company_name,
    overall: s.overall_score || 0,
    esg: s.esg_score || 0,
    ghg: s.ghg_score || 0,
    environment: s.environment_score || 0,
    social: s.social_score || 0,
    governance: s.governance_score || 0,
  }));

  // Supplier comparison data for radar chart
  const radarData = sortedRankings.slice(0, 5).map(s => ({
    supplier: s.company_name.length > 12 ? s.company_name.substring(0, 12) + '...' : s.company_name,
    Environment: s.environment_score || 0,
    Social: s.social_score || 0,
    Governance: s.governance_score || 0,
    GHG: s.ghg_score || 0,
  }));

  const radarChartData = [
    { subject: 'Environment', fullMark: 100 },
    { subject: 'Social', fullMark: 100 },
    { subject: 'Governance', fullMark: 100 },
    { subject: 'GHG', fullMark: 100 },
  ].map(item => {
    const entry = { ...item };
    sortedRankings.slice(0, 5).forEach((s, idx) => {
      entry[`supplier${idx}`] = item.subject === 'Environment' ? s.environment_score || 0 :
                                item.subject === 'Social' ? s.social_score || 0 :
                                item.subject === 'Governance' ? s.governance_score || 0 :
                                s.ghg_score || 0;
    });
    return entry;
  });

  const RADAR_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

  return (
    <div className="space-y-6" data-testid="supplier-ranking">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Supplier Rankings</h1>
          <p className="text-sm text-stone-500 mt-1">
            Compare submitted supplier score snapshots across ESG and GHG intensity
          </p>
        </div>
        <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-48" data-testid="supplier-ranking-sort-select">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="overall">Overall Score</SelectItem>
            <SelectItem value="esg">ESG Score</SelectItem>
            <SelectItem value="environment">Environment</SelectItem>
            <SelectItem value="social">Social</SelectItem>
            <SelectItem value="governance">Governance</SelectItem>
            <SelectItem value="ghg">GHG Intensity Score</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-stone-100">
                <Users className="h-5 w-5 text-stone-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-stone-900">{stats.total}</div>
                <div className="text-xs text-stone-500">Total Suppliers</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-emerald-600">{stats.ranked}</div>
                <div className="text-xs text-stone-500">Ranked Suppliers</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <BarChart3 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">{stats.averages.esg || '-'}</div>
                <div className="text-xs text-stone-500">Avg ESG Score</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <Factory className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-600">
                  {stats.emissions_by_scope.total ? `${stats.emissions_by_scope.total.toLocaleString()}` : '-'}
                </div>
                <div className="text-xs text-stone-500">Total tCO2e</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different views */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 max-w-lg">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="esg">ESG Analysis</TabsTrigger>
          <TabsTrigger value="emissions">Emissions</TabsTrigger>
          <TabsTrigger value="table">Detailed Table</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Score Distribution Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PieChartIcon className="h-5 w-5 text-emerald-500" />
                  Score Distribution
                </CardTitle>
                <CardDescription>Supplier performance breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                {scoreDistributionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={scoreDistributionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, value }) => `${value}`}
                      >
                        {scoreDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-stone-400">
                    No ranking data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top 10 Suppliers Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  Top Performing Suppliers
                </CardTitle>
                <CardDescription>Overall score comparison</CardDescription>
              </CardHeader>
              <CardContent>
                {top10Suppliers.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={top10Suppliers} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                      <XAxis type="number" domain={[0, 100]} />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                      <Tooltip 
                        formatter={(value) => [`${value}`, 'Score']}
                        labelFormatter={(label) => top10Suppliers.find(s => s.name === label)?.fullName || label}
                      />
                      <Bar dataKey="overall" fill="#10b981" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-stone-400">
                    No ranking data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Supplier Comparison Radar */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-5 w-5 text-blue-500" />
                Top 5 Supplier Comparison
              </CardTitle>
              <CardDescription>Multi-dimensional performance comparison</CardDescription>
            </CardHeader>
            <CardContent>
              {sortedRankings.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <RadarChart data={radarChartData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} />
                    {sortedRankings.slice(0, 5).map((s, idx) => (
                      <Radar
                        key={s.supplier_id}
                        name={s.company_name.length > 15 ? s.company_name.substring(0, 15) + '...' : s.company_name}
                        dataKey={`supplier${idx}`}
                        stroke={RADAR_COLORS[idx]}
                        fill={RADAR_COLORS[idx]}
                        fillOpacity={0.1}
                      />
                    ))}
                    <Legend />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[350px] flex items-center justify-center text-stone-400">
                  No ranking data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ESG Analysis Tab */}
        <TabsContent value="esg" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Average ESG Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Average ESG Scores</CardTitle>
                <CardDescription>Across all ranked suppliers</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Leaf className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm font-medium">Environment</span>
                    </div>
                    <span className={`font-bold ${getScoreColor(stats.averages.environment)}`}>
                      {stats.averages.environment || '-'}
                    </span>
                  </div>
                  <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${stats.averages.environment || 0}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium">Social</span>
                    </div>
                    <span className={`font-bold ${getScoreColor(stats.averages.social)}`}>
                      {stats.averages.social || '-'}
                    </span>
                  </div>
                  <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${stats.averages.social || 0}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-purple-500" />
                      <span className="text-sm font-medium">Governance</span>
                    </div>
                    <span className={`font-bold ${getScoreColor(stats.averages.governance)}`}>
                      {stats.averages.governance || '-'}
                    </span>
                  </div>
                  <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-500 rounded-full transition-all"
                      style={{ width: `${stats.averages.governance || 0}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ESG Score Comparison */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">ESG Score by Supplier</CardTitle>
                <CardDescription>Environment, Social, Governance breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                {top10Suppliers.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={top10Suppliers}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} />
                      <Tooltip 
                        labelFormatter={(label) => top10Suppliers.find(s => s.name === label)?.fullName || label}
                      />
                      <Legend />
                      <Bar dataKey="environment" name="Environment" fill={COLORS.environment} />
                      <Bar dataKey="social" name="Social" fill={COLORS.social} />
                      <Bar dataKey="governance" name="Governance" fill={COLORS.governance} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-stone-400">
                    No ESG data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Emissions Tab */}
        <TabsContent value="emissions" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Emissions by Scope Pie */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Factory className="h-5 w-5 text-amber-500" />
                  Emissions by Scope
                </CardTitle>
                <CardDescription>Total supplier emissions breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.emissions_by_scope.total > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={emissionsByScopeData}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value.toLocaleString()}`}
                      >
                        {emissionsByScopeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value.toLocaleString()} tCO2e`, 'Emissions']} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-stone-400">
                    No emissions data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Scope Summary Cards */}
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-red-100">
                        <Factory className="h-5 w-5 text-red-600" />
                      </div>
                      <div>
                        <div className="text-sm text-stone-500">Scope 1 (Direct)</div>
                        <div className="text-xl font-bold text-red-600">
                          {(stats.emissions_by_scope.scope1 || 0).toLocaleString()} tCO2e
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-stone-400">
                        {stats.emissions_by_scope.total > 0 
                          ? `${((stats.emissions_by_scope.scope1 / stats.emissions_by_scope.total) * 100).toFixed(1)}%`
                          : '-'}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-amber-100">
                        <Factory className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <div className="text-sm text-stone-500">Scope 2 (Indirect - Energy)</div>
                        <div className="text-xl font-bold text-amber-600">
                          {(stats.emissions_by_scope.scope2 || 0).toLocaleString()} tCO2e
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-stone-400">
                        {stats.emissions_by_scope.total > 0 
                          ? `${((stats.emissions_by_scope.scope2 / stats.emissions_by_scope.total) * 100).toFixed(1)}%`
                          : '-'}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Emissions by Supplier */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Emissions by Supplier</CardTitle>
              <CardDescription>Scope-wise breakdown per supplier</CardDescription>
            </CardHeader>
            <CardContent>
              {sortedRankings.filter(s => s.total_emissions > 0).length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart 
                    data={sortedRankings
                      .filter(s => s.total_emissions > 0)
                      .slice(0, 10)
                      .map(s => ({
                        name: s.company_name.length > 15 ? s.company_name.substring(0, 15) + '...' : s.company_name,
                        fullName: s.company_name,
                        scope1: s.scope1_emissions,
                        scope2: s.scope2_emissions,
                      }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip 
                      formatter={(value) => [`${value.toLocaleString()} tCO2e`]}
                      labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                    />
                    <Legend />
                    <Bar dataKey="scope1" name="Scope 1" stackId="a" fill={COLORS.scope1} />
                    <Bar dataKey="scope2" name="Scope 2" stackId="a" fill={COLORS.scope2} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-stone-400">
                  No emissions data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Detailed Table Tab */}
        <TabsContent value="table">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
                Detailed Performance Rankings
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-stone-500">Loading rankings...</div>
              ) : sortedRankings.length === 0 ? (
                <div className="text-center py-8 text-stone-500">
                  No suppliers have completed their assessments yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Rank</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="text-center">Overall</TableHead>
                        <TableHead className="text-center">ESG</TableHead>
                        <TableHead className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Leaf className="h-3 w-3 text-emerald-500" />
                            Env
                          </div>
                        </TableHead>
                        <TableHead className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Users className="h-3 w-3 text-blue-500" />
                            Social
                          </div>
                        </TableHead>
                        <TableHead className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Shield className="h-3 w-3 text-purple-500" />
                            Gov
                          </div>
                        </TableHead>
                        <TableHead className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Factory className="h-3 w-3 text-amber-500" />
                            GHG intensity
                          </div>
                        </TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedRankings.map((supplier, idx) => (
                        <TableRow key={supplier.supplier_id} data-testid={`ranking-${supplier.supplier_id}`}>
                          <TableCell>
                            <div className="flex items-center justify-center w-8 h-8">
                              {supplier.rank ? getRankIcon(supplier.rank) : '-'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{supplier.company_name}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`px-2 py-1 rounded-full text-sm font-bold ${getScoreBgColor(supplier.overall_score)} ${getScoreColor(supplier.overall_score)}`}>
                              {supplier.overall_score !== null ? supplier.overall_score : '-'}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`font-semibold ${getScoreColor(supplier.esg_score)}`}>
                              {supplier.esg_score !== null ? supplier.esg_score : '-'}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`font-semibold ${getScoreColor(supplier.environment_score)}`}>
                              {supplier.environment_score !== null ? supplier.environment_score : '-'}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`font-semibold ${getScoreColor(supplier.social_score)}`}>
                              {supplier.social_score !== null ? supplier.social_score : '-'}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`font-semibold ${getScoreColor(supplier.governance_score)}`}>
                              {supplier.governance_score !== null ? supplier.governance_score : '-'}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`font-semibold ${getScoreColor(supplier.ghg_score)}`}>
                              {supplier.ghg_score !== null ? supplier.ghg_score : '-'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColors[supplier.completion_status]}>
                              {supplier.completion_status.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
