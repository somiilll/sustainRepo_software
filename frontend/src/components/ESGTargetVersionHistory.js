/**
 * ESGTargetVersionHistory - Display version history for a target
 * Uses the shared version_utils pattern with field_diffs
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { History, User, Clock } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function ESGTargetVersionHistory({ targetId }) {
  const { token } = useAuth();
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchVersions = async () => {
      if (!targetId) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const res = await axios.get(
          `${API}/api/esg-targets/${targetId}/versions`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setVersions(res.data?.versions || []);
      } catch (err) {
        console.error('Failed to fetch versions:', err);
        setError('Failed to load version history');
      } finally {
        setLoading(false);
      }
    };
    
    fetchVersions();
  }, [targetId, token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        {error}
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted">
        <History className="w-12 h-12 mx-auto mb-2 text-stone-300" />
        <p>No version history available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="target-version-history">
      {versions.map((version, idx) => (
        <Card key={version.id} className="p-4 border border-stone-200">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${version.change_type === 'created' ? 'bg-green-100' : 'bg-blue-100'}`}>
              <History className={`w-4 h-4 ${version.change_type === 'created' ? 'text-green-600' : 'text-blue-600'}`} />
            </div>
            
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge className={version.change_type === 'created' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}>
                    {version.change_type === 'created' ? 'Created' : 'Updated'}
                  </Badge>
                  <span className="text-sm font-medium text-text-secondary">v{version.version}</span>
                </div>
                <span className="text-xs text-text-muted flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(version.created_at).toLocaleString()}
                </span>
              </div>
              
              <p className="text-sm text-text-secondary flex items-center gap-1">
                <User className="w-3 h-3" />
                {version.created_by_name || 'Unknown'}
              </p>
              
              {/* Field Diffs */}
              {version.field_diffs && version.field_diffs.length > 0 && (
                <div className="mt-3 pt-3 border-t border-stone-200">
                  <p className="text-xs font-semibold text-text-muted uppercase mb-2">Changes Made</p>
                  <div className="space-y-2">
                    {version.field_diffs.map((diff, dIdx) => (
                      <div key={dIdx} className="bg-stone-50 rounded-lg p-2 text-sm">
                        <p className="font-medium text-text-primary mb-1">{diff.display_name}</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-red-50 p-2 rounded border border-red-100">
                            <span className="text-red-600 font-medium block mb-1">Old</span>
                            <span className="text-red-800 break-words">
                              {formatValue(diff.old_value)}
                            </span>
                          </div>
                          <div className="bg-green-50 p-2 rounded border border-green-100">
                            <span className="text-green-600 font-medium block mb-1">New</span>
                            <span className="text-green-800 break-words">
                              {formatValue(diff.new_value)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function formatValue(value) {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}
