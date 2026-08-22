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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { 
  Building2, 
  ClipboardList, 
  Cloud, 
  Percent, 
  Calendar,
  CheckCircle,
  Clock,
  ArrowRight,
  DollarSign,
  AlertCircle,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Common currency options
const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
];

export default function SupplierDashboard() {
  const { getAuthHeader, user } = useAuth();
  const [assessment, setAssessment] = useState(null);
  const [questionnaires, setQuestionnaires] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revenuePercentage, setRevenuePercentage] = useState('');
  const [revenueAmount, setRevenueAmount] = useState('');
  const [revenueCurrency, setRevenueCurrency] = useState('USD');
  const [saving, setSaving] = useState(false);

  const fetchAssessment = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/supplier-assessment/my-assessment`, {
        headers: getAuthHeader(),
      });
      setAssessment(res.data);
      const rel = res.data.relationship;
      if (rel?.revenue_percentage !== null && rel?.revenue_percentage !== undefined) {
        setRevenuePercentage(rel.revenue_percentage.toString());
      }
      if (rel?.revenue_amount !== null && rel?.revenue_amount !== undefined) {
        setRevenueAmount(rel.revenue_amount.toString());
      }
      if (rel?.revenue_currency) {
        setRevenueCurrency(rel.revenue_currency);
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
    const percentage = revenuePercentage ? parseFloat(revenuePercentage) : null;
    const amount = revenueAmount ? parseFloat(revenueAmount) : null;
    
    if (percentage !== null && (isNaN(percentage) || percentage < 0 || percentage > 100)) {
      toast.error('Please enter a valid percentage (0-100)');
      return;
    }
    
    if (amount !== null && (isNaN(amount) || amount < 0)) {
      toast.error('Please enter a valid amount');
      return;
    }

    setSaving(true);
    try {
      await axios.put(
        `${API}/supplier-assessment/my-assessment/revenue`,
        { 
          revenue_percentage: percentage,
          revenue_amount: amount,
          revenue_currency: revenueCurrency,
        },
        { headers: getAuthHeader() }
      );
      toast.success('Revenue information saved');
      fetchAssessment();
    } catch (err) {
      toast.error('Failed to save revenue information');
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
  const assessmentModules = assessment.assessment_modules || [];
  const configuredModules = new Map(assessmentModules.map((module) => [module.code, module]));
  const esgModule = configuredModules.get('esg');
  const ghgModule = configuredModules.get('ghg');

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
            
            <div className="grid gap-4 pt-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className={`text-center p-4 rounded-lg ${
                relationship.revenue_percentage !== null && relationship.revenue_amount !== null 
                  ? 'bg-green-50' 
                  : 'bg-amber-50'
              }`}>
                <DollarSign className={`h-6 w-6 mx-auto mb-2 ${
                  relationship.revenue_percentage !== null && relationship.revenue_amount !== null 
                    ? 'text-green-500' 
                    : 'text-amber-500'
                }`} />
                <div className="text-lg font-semibold">
                  {relationship.revenue_percentage !== null && relationship.revenue_amount !== null 
                    ? <CheckCircle className="h-5 w-5 mx-auto text-green-500" />
                    : <AlertCircle className="h-5 w-5 mx-auto text-amber-500" />
                  }
                </div>
                <div className="text-xs text-stone-500">Revenue Info</div>
              </div>
              {assessmentModules.map((module) => <div className="text-center p-4 bg-stone-50 rounded-lg" key={module.code} data-testid={`supplier-module-summary-${module.code}`}>
                <ClipboardList className="h-6 w-6 mx-auto text-emerald-600 mb-2" />
                <div className="text-lg font-semibold">{Math.round(module.completion_percent || 0)}%</div>
                <div className="text-xs text-stone-500">{module.display_name}</div>
              </div>)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Revenue Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-blue-500" />
            Revenue Information
            <Badge variant="outline" className="ml-2 text-xs">Required</Badge>
          </CardTitle>
          <CardDescription>
            Provide your revenue relationship with {customer_name}. This information is required before submitting your assessment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Warning if not filled */}
            {(relationship.revenue_percentage === null || relationship.revenue_amount === null) && (
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Revenue information required</p>
                  <p className="text-sm text-amber-700 mt-1">
                    Please complete both the revenue percentage and amount to proceed with your assessment.
                  </p>
                </div>
              </div>
            )}
            
            <div className="grid md:grid-cols-2 gap-6">
              {/* Revenue Percentage */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-stone-500" />
                  Revenue Percentage from {customer_name} *
                </Label>
                <p className="text-xs text-stone-500 mb-2">
                  What percentage of your total annual revenue comes from this customer?
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={revenuePercentage}
                    onChange={(e) => setRevenuePercentage(e.target.value)}
                    placeholder="e.g., 15.5"
                    className="max-w-[150px]"
                    data-testid="revenue-percentage-input"
                  />
                  <span className="text-stone-500 font-medium">%</span>
                </div>
              </div>
              
              {/* Revenue Amount */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-stone-500" />
                  Annual Revenue Amount from {customer_name} *
                </Label>
                <p className="text-xs text-stone-500 mb-2">
                  What is the total annual revenue you receive from this customer?
                </p>
                <div className="flex items-center gap-2">
                  <Select value={revenueCurrency} onValueChange={setRevenueCurrency}>
                    <SelectTrigger className="w-[100px]" data-testid="revenue-currency-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.symbol} {c.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="0"
                    step="1000"
                    value={revenueAmount}
                    onChange={(e) => setRevenueAmount(e.target.value)}
                    placeholder="e.g., 500000"
                    className="flex-1"
                    data-testid="revenue-amount-input"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveRevenue} disabled={saving} data-testid="save-revenue-btn">
                {saving ? 'Saving...' : 'Save Revenue Information'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Questionnaires */}
      {esgModule && <Card data-testid="supplier-esg-module-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-emerald-500" />
            {esgModule.display_name}
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
      </Card>}

      {/* GHG Emissions */}
      {ghgModule && <Card data-testid="supplier-ghg-module-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-purple-500" />
            {ghgModule.display_name}
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
      </Card>}
    </div>
  );
}
