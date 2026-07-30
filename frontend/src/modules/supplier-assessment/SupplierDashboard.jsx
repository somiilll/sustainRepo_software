import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Progress } from '../../components/ui/progress';
import { Label } from '../../components/ui/label';
import { 
  Building2, 
  ClipboardList, 
  Cloud, 
  Percent, 
  Calendar,
  CheckCircle,
  Clock,
  ArrowRight,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SupplierDashboard() {
  const { getAuthHeader, user } = useAuth();
  const [assessment, setAssessment] = useState(null);
  const [questionnaires, setQuestionnaires] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revenueValue, setRevenueValue] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchAssessment = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/supplier-assessment/my-assessment`, {
        headers: getAuthHeader(),
      });
      setAssessment(res.data);
      if (res.data.relationship?.revenue_percentage !== null) {
        setRevenueValue(res.data.relationship.revenue_percentage.toString());
      }
    } catch (err) {
      if (err.response?.status !== 404) {
        toast.error('Failed to load assessment');
      }
    }
  }, [getAuthHeader]);

  const fetchQuestionnaires = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/supplier-assessment/my-assessment/questionnaires`, {
        headers: getAuthHeader(),
      });
      setQuestionnaires(res.data || []);
    } catch (err) {
      console.error('Failed to load questionnaires');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  useEffect(() => {
    fetchAssessment();
    fetchQuestionnaires();
  }, [fetchAssessment, fetchQuestionnaires]);

  const handleSaveRevenue = async () => {
    const value = parseFloat(revenueValue);
    if (isNaN(value) || value < 0 || value > 100) {
      toast.error('Please enter a valid percentage (0-100)');
      return;
    }

    setSaving(true);
    try {
      await axios.put(
        `${API}/supplier-assessment/my-assessment/revenue`,
        { revenue_percentage: value },
        { headers: getAuthHeader() }
      );
      toast.success('Revenue percentage saved');
      fetchAssessment();
    } catch (err) {
      toast.error('Failed to save revenue percentage');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-stone-500">Loading...</div>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Building2 className="h-12 w-12 mx-auto text-stone-300 mb-4" />
          <h2 className="text-xl font-semibold text-stone-700">No Active Assessment</h2>
          <p className="text-stone-500 mt-2">
            You don&apos;t have any active supplier assessments assigned.
          </p>
        </div>
      </div>
    );
  }

  const { relationship, customer_name } = assessment;

  return (
    <div className="space-y-6" data-testid="supplier-dashboard">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl p-6 text-white">
        <h1 className="text-2xl font-semibold">Supplier Assessment</h1>
        <p className="text-emerald-100 mt-1">
          Complete your assessment for <span className="font-semibold">{customer_name}</span>
        </p>
        {relationship.due_date && (
          <div className="flex items-center gap-2 mt-4 text-emerald-100">
            <Calendar className="h-4 w-4" />
            <span>Due: {new Date(relationship.due_date).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Assessment Progress</CardTitle>
          <CardDescription>Track your completion across all assessment areas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Progress</span>
                <span className="text-sm text-stone-500">
                  {Math.round(relationship.overall_completion_percent || 0)}%
                </span>
              </div>
              <Progress value={relationship.overall_completion_percent || 0} className="h-3" />
            </div>
            
            <div className="grid grid-cols-3 gap-4 pt-4">
              <div className="text-center p-4 bg-stone-50 rounded-lg">
                <Percent className="h-6 w-6 mx-auto text-blue-500 mb-2" />
                <div className="text-lg font-semibold">
                  {relationship.revenue_percentage !== null ? `${relationship.revenue_percentage}%` : '-'}
                </div>
                <div className="text-xs text-stone-500">Revenue Info</div>
              </div>
              <div className="text-center p-4 bg-stone-50 rounded-lg">
                <ClipboardList className="h-6 w-6 mx-auto text-emerald-500 mb-2" />
                <div className="text-lg font-semibold">
                  {Math.round(relationship.esg_completion_percent || 0)}%
                </div>
                <div className="text-xs text-stone-500">ESG Questionnaire</div>
              </div>
              <div className="text-center p-4 bg-stone-50 rounded-lg">
                <Cloud className="h-6 w-6 mx-auto text-purple-500 mb-2" />
                <div className="text-lg font-semibold">
                  {Math.round(relationship.ghg_completion_percent || 0)}%
                </div>
                <div className="text-xs text-stone-500">GHG Emissions</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Revenue Percentage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5 text-blue-500" />
            Revenue Information
          </CardTitle>
          <CardDescription>
            What percentage of your company&apos;s annual revenue comes from {customer_name}?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-xs">
              <Label>Revenue Percentage</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={revenueValue}
                  onChange={(e) => setRevenueValue(e.target.value)}
                  placeholder="Enter percentage"
                  data-testid="revenue-input"
                />
                <span className="text-stone-500">%</span>
              </div>
            </div>
            <Button onClick={handleSaveRevenue} disabled={saving} data-testid="save-revenue-btn">
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Questionnaires */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-emerald-500" />
            ESG Questionnaires
          </CardTitle>
          <CardDescription>Complete the assigned questionnaires</CardDescription>
        </CardHeader>
        <CardContent>
          {questionnaires.length === 0 ? (
            <div className="text-center py-8 text-stone-500">
              No questionnaires assigned yet.
            </div>
          ) : (
            <div className="space-y-4">
              {questionnaires.map((q) => (
                <div
                  key={q.questionnaire_id}
                  className="border rounded-lg p-4 hover:shadow-sm transition-shadow"
                  data-testid={`questionnaire-card-${q.questionnaire_id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-stone-900">{q.questionnaire_name}</h3>
                      <div className="flex items-center gap-4 mt-2 text-sm text-stone-500">
                        <span>{q.answered_count}/{q.total_questions} answered</span>
                        {q.due_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Due: {new Date(q.due_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="mt-3">
                        <Progress value={q.completion_percent} className="h-2" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      {q.status === 'submitted' ? (
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Submitted
                        </Badge>
                      ) : q.status === 'in_progress' ? (
                        <Badge className="bg-blue-100 text-blue-800">
                          <Clock className="h-3 w-3 mr-1" />
                          In Progress
                        </Badge>
                      ) : (
                        <Badge className="bg-stone-100 text-stone-800">Not Started</Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.location.href = `/supplier-assessment/questionnaire/${q.questionnaire_id}`}
                      >
                        {q.status === 'submitted' ? 'View' : 'Continue'}
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* GHG Emissions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-purple-500" />
            GHG Emissions
          </CardTitle>
          <CardDescription>Report your Scope 1 and Scope 2 emissions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-stone-600">
                Enter your organization&apos;s greenhouse gas emissions data for Scope 1 (direct emissions)
                and Scope 2 (purchased energy).
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => window.location.href = '/supplier-assessment/emissions'}
            >
              Manage Emissions
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
