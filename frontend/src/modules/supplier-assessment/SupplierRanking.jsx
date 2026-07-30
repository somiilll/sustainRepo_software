import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Trophy, TrendingUp, Award, Medal } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusColors = {
  not_started: 'bg-stone-100 text-stone-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
};

export default function SupplierRanking() {
  const { getAuthHeader } = useAuth();
  const [rankings, setRankings] = useState([]);
  const [stats, setStats] = useState({ total: 0, ranked: 0 });
  const [loading, setLoading] = useState(true);

  const fetchRankings = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/supplier-assessment/rankings`, {
        headers: getAuthHeader(),
      });
      setRankings(res.data.rankings || []);
      setStats({
        total: res.data.total_suppliers || 0,
        ranked: res.data.ranked_suppliers || 0,
      });
    } catch (err) {
      toast.error('Failed to load rankings');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

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
    if (score === null) return 'text-stone-400';
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-blue-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6" data-testid="supplier-ranking">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Supplier Rankings</h1>
        <p className="text-sm text-stone-500 mt-1">
          Compare supplier performance based on ESG and GHG scores
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-stone-900">{stats.total}</div>
            <div className="text-sm text-stone-500">Total Suppliers</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-emerald-600">{stats.ranked}</div>
            <div className="text-sm text-stone-500">Ranked Suppliers</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-blue-600">
              {stats.total - stats.ranked}
            </div>
            <div className="text-sm text-stone-500">Pending Assessment</div>
          </CardContent>
        </Card>
      </div>

      {/* Rankings Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
            Performance Rankings
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-stone-500">Loading rankings...</div>
          ) : rankings.length === 0 ? (
            <div className="text-center py-8 text-stone-500">
              No suppliers have completed their assessments yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Rank</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-center">ESG Score</TableHead>
                  <TableHead className="text-center">GHG Score</TableHead>
                  <TableHead className="text-center">Overall Score</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankings.map((supplier) => (
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
                      <span className={`font-semibold ${getScoreColor(supplier.esg_score)}`}>
                        {supplier.esg_score !== null ? supplier.esg_score : '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-semibold ${getScoreColor(supplier.ghg_score)}`}>
                        {supplier.ghg_score !== null ? supplier.ghg_score : '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className={`text-lg font-bold ${getScoreColor(supplier.overall_score)}`}>
                          {supplier.overall_score !== null ? supplier.overall_score : '-'}
                        </span>
                        {supplier.overall_score !== null && (
                          <span className="text-xs text-stone-400">/100</span>
                        )}
                      </div>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
