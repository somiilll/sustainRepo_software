/**
 * useMyTasks Hook
 * Custom hook for fetching and managing task data
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { calculateTaskStats, groupTasksByCategory } from './utils';
import { ENTITY_TYPE } from './constants';

const API = process.env.REACT_APP_BACKEND_URL;

export default function useMyTasks({ 
  token, 
  domain, 
  framework, 
  entityType = ENTITY_TYPE.ALL, 
  reportingPeriod,
  includeBackfill = true 
}) {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [stats, setStats] = useState({});
  const [groupedTasks, setGroupedTasks] = useState([]);
  const [hasAssignments, setHasAssignments] = useState(false);  // Track if user has any assignments

  const headers = { Authorization: `Bearer ${token}` };

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch metric tasks
      const tasksRes = await axios.get(`${API}/api/esg-records/tasks/my-tasks`, {
        headers,
        params: { domain, include_backfill: includeBackfill }
      });
      
      const fetchedTasks = tasksRes.data.tasks || [];
      const assignmentCount = tasksRes.data.assignment_count || 0;
      setTasks(fetchedTasks);
      setHasAssignments(assignmentCount > 0);
      
      // Group tasks by category
      const grouped = groupTasksByCategory(fetchedTasks);
      setGroupedTasks(grouped);
      
      // Fetch question assignments (disclosures) - only if reportingPeriod is available
      let fetchedQuestions = [];
      if ((entityType === ENTITY_TYPE.QUESTION || entityType === ENTITY_TYPE.ALL) && reportingPeriod) {
        try {
          const params = { reporting_period: reportingPeriod };
          if (domain && domain !== 'all') params.domain = domain;
          if (framework) params.framework = framework;
          
          const disclosuresRes = await axios.get(`${API}/api/tracking/my-disclosures`, {
            headers, params
          });
          fetchedQuestions = disclosuresRes.data.questions || [];
          
          if (framework && fetchedQuestions.length > 0) {
            fetchedQuestions = fetchedQuestions.filter(
              q => q.framework?.toLowerCase() === framework.toLowerCase()
            );
          }
        } catch (e) {
          console.error('Failed to fetch disclosures:', e);
        }
      }
      setQuestions(fetchedQuestions);
      
      // Calculate stats
      const calculatedStats = calculateTaskStats(fetchedTasks, fetchedQuestions);
      setStats(calculatedStats);
      
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [domain, framework, entityType, reportingPeriod, token, includeBackfill]);

  useEffect(() => {
    if (token) {
      fetchTasks();
    }
  }, [fetchTasks, token]);

  return {
    loading,
    tasks,
    questions,
    stats,
    groupedTasks,
    hasAssignments,
    refresh: fetchTasks,
  };
}
