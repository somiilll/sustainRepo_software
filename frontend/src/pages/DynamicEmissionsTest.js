/**
 * Dynamic Emissions Test Page
 * 
 * A test page to demonstrate the new DynamicEmissionForm component
 * that uses the backend form-config API to dynamically render input fields.
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import DynamicEmissionForm from '../components/DynamicEmissionForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function DynamicEmissionsTest() {
  const { getAuthHeader, user } = useAuth();
  const navigate = useNavigate();
  
  const [scopes, setScopes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submittedData, setSubmittedData] = useState(null);
  
  // Fetch reference data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [scopesRes, categoriesRes, facilitiesRes] = await Promise.all([
          axios.get(`${API}/scopes`, { headers: getAuthHeader() }),
          axios.get(`${API}/categories`, { headers: getAuthHeader() }),
          axios.get(`${API}/facilities`, { headers: getAuthHeader() })
        ]);
        
        setScopes(scopesRes.data || []);
        setCategories(categoriesRes.data || []);
        setFacilities(facilitiesRes.data || []);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load reference data');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [getAuthHeader]);
  
  const handleSubmit = (emissionData) => {
    console.log('Emission data submitted:', emissionData);
    setSubmittedData(emissionData);
    toast.success('Emission calculated successfully!');
  };
  
  const handleCancel = () => {
    navigate('/emissions');
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-6">
        <Button variant="ghost" onClick={() => navigate('/emissions')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Emissions
        </Button>
        
        <div className="flex items-center gap-3">
          <Sparkles className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Dynamic Emission Form</h1>
            <p className="text-muted-foreground">
              This form dynamically renders input fields based on the formula requirements
            </p>
          </div>
        </div>
      </div>
      
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>How it works</CardTitle>
          <CardDescription>
            The dynamic form system automatically:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
            <li>Fetches form configuration from <code>/api/calc-engine/form-config/&#123;category_id&#125;</code></li>
            <li>Shows only applicable fuels for the selected scope + category</li>
            <li>Displays decision tree questions if multiple formulas are possible</li>
            <li>Renders only the input fields required by the active formula</li>
            <li>Pre-fills values from the selected fuel (e.g., calorific value, density)</li>
            <li>Allows users to override default values when needed</li>
            <li>Executes calculation via the backend calc engine</li>
          </ul>
        </CardContent>
      </Card>
      
      <DynamicEmissionForm
        scopes={scopes}
        categories={categories}
        facilities={facilities}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        mode="create"
      />
      
      {/* Show submitted data for debugging */}
      {submittedData && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Submitted Data (Debug)</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-lg overflow-auto text-xs">
              {JSON.stringify(submittedData, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
