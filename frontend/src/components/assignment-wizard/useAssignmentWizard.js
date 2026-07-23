/**
 * Assignment Wizard Hook
 * Manages all state and logic for the assignment wizard
 */

import React, { useState, useCallback, useMemo } from 'react';

const INITIAL_FORM_STATE = {
  // Step 1: Level
  assignment_level: 'organization',
  
  // Step 2: Users
  assigned_user_ids: [],
  facility_assignments: {}, // { [facilityId]: { user_ids: [], approver_id: '', requires_approval: false, facility_name: '' } }
  
  // Step 3: Schedule
  start_date: '',
  end_date: '',
  filling_frequency: 'monthly',
  due_time: '17:00',
  timezone: 'Asia/Kolkata',
  due_day_of_month: 15,
  due_day_of_week: 'friday',
  
  // Step 3: Options
  reminder_enabled: false,
  reminder_frequency: 'weekly',
  requires_approval: false,
  approver_id: '',
  approval_chain: [],
};

export const STEPS = [
  { id: 'level', title: 'Select Level', description: 'Choose assignment scope' },
  { id: 'users', title: 'Assign Users', description: 'Select assignees' },
  { id: 'schedule', title: 'Schedule', description: 'Set timeline & reminders' },
  { id: 'review', title: 'Review', description: 'Confirm assignment' },
];

export const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'IST (India)' },
  { value: 'America/New_York', label: 'EST (New York)' },
  { value: 'America/Los_Angeles', label: 'PST (Los Angeles)' },
  { value: 'Europe/London', label: 'GMT (London)' },
  { value: 'Europe/Paris', label: 'CET (Paris)' },
  { value: 'Asia/Singapore', label: 'SGT (Singapore)' },
  { value: 'Asia/Tokyo', label: 'JST (Tokyo)' },
  { value: 'Australia/Sydney', label: 'AEST (Sydney)' },
  { value: 'UTC', label: 'UTC' },
];

export const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half Yearly' },
  { value: 'yearly', label: 'Yearly' },
];

export const DAYS_OF_WEEK = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

export function useAssignmentWizard({ 
  category, 
  subcategory, 
  subSubcategory,
  facilities = [],
  users = [],
  reportingPeriod = '',
  approvalWorkflowEnabled = false,
  multiLevelApprovalEnabled = false,
  initialData = null,
  onSubmit,
  onClose,
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedFacilities, setExpandedFacilities] = useState({});

  // Initialize form with initial data when provided
  React.useEffect(() => {
    if (initialData) {
      setForm({
        ...INITIAL_FORM_STATE,
        ...initialData,
      });
      // If editing existing assignment with facility assignments, expand first few
      if (initialData.assignment_level === 'facility' && initialData.facility_assignments) {
        const expanded = {};
        Object.keys(initialData.facility_assignments).slice(0, 3).forEach(fid => {
          expanded[fid] = true;
        });
        setExpandedFacilities(expanded);
      }
    } else {
      setForm(INITIAL_FORM_STATE);
      setExpandedFacilities({});
    }
    setCurrentStep(0);
  }, [initialData]);

  // Reset form
  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM_STATE);
    setCurrentStep(0);
    setExpandedFacilities({});
  }, []);

  // Update form field
  const updateForm = useCallback((updates) => {
    setForm(prev => ({ ...prev, ...updates }));
  }, []);

  // Update facility assignment
  const updateFacilityAssignment = useCallback((facilityId, facilityName, updates) => {
    setForm(prev => ({
      ...prev,
      facility_assignments: {
        ...prev.facility_assignments,
        [facilityId]: {
          ...prev.facility_assignments[facilityId],
          facility_name: facilityName,
          ...updates,
        },
      },
    }));
  }, []);

  // Add user to facility
  const addUserToFacility = useCallback((facilityId, facilityName, userId) => {
    setForm(prev => {
      const current = prev.facility_assignments[facilityId]?.user_ids || [];
      if (current.includes(userId)) return prev;
      return {
        ...prev,
        facility_assignments: {
          ...prev.facility_assignments,
          [facilityId]: {
            ...prev.facility_assignments[facilityId],
            facility_name: facilityName,
            user_ids: [...current, userId],
          },
        },
      };
    });
  }, []);

  // Remove user from facility
  const removeUserFromFacility = useCallback((facilityId, userId) => {
    setForm(prev => ({
      ...prev,
      facility_assignments: {
        ...prev.facility_assignments,
        [facilityId]: {
          ...prev.facility_assignments[facilityId],
          user_ids: (prev.facility_assignments[facilityId]?.user_ids || []).filter(id => id !== userId),
        },
      },
    }));
  }, []);

  // Add user to org-level assignment
  const addUser = useCallback((userId) => {
    setForm(prev => {
      if (prev.assigned_user_ids.includes(userId)) return prev;
      return { ...prev, assigned_user_ids: [...prev.assigned_user_ids, userId] };
    });
  }, []);

  // Remove user from org-level assignment
  const removeUser = useCallback((userId) => {
    setForm(prev => ({
      ...prev,
      assigned_user_ids: prev.assigned_user_ids.filter(id => id !== userId),
    }));
  }, []);

  // Add approver to chain
  const addApprover = useCallback((userId) => {
    setForm(prev => {
      if (prev.approval_chain.includes(userId)) return prev;
      return { ...prev, approval_chain: [...prev.approval_chain, userId] };
    });
  }, []);

  // Remove approver from chain
  const removeApprover = useCallback((index) => {
    setForm(prev => ({
      ...prev,
      approval_chain: prev.approval_chain.filter((_, i) => i !== index),
    }));
  }, []);

  // Toggle facility expansion
  const toggleFacility = useCallback((facilityId) => {
    setExpandedFacilities(prev => ({
      ...prev,
      [facilityId]: !prev[facilityId],
    }));
  }, []);

  // Bulk assign to all facilities
  const bulkAssignToFacilities = useCallback((userId) => {
    if (!userId) return;
    setForm(prev => {
      const newAssignments = { ...prev.facility_assignments };
      facilities.forEach(fac => {
        const current = newAssignments[fac.id]?.user_ids || [];
        if (!current.includes(userId)) {
          newAssignments[fac.id] = {
            ...newAssignments[fac.id],
            facility_name: fac.name,
            user_ids: [...current, userId],
          };
        }
      });
      return { ...prev, facility_assignments: newAssignments };
    });
  }, [facilities]);

  // Bulk enable approval for all facilities
  const bulkEnableApproval = useCallback((enabled) => {
    setForm(prev => {
      const newAssignments = { ...prev.facility_assignments };
      facilities.forEach(fac => {
        newAssignments[fac.id] = {
          ...newAssignments[fac.id],
          facility_name: fac.name,
          requires_approval: enabled,
        };
      });
      return { ...prev, facility_assignments: newAssignments };
    });
  }, [facilities]);

  // Computed: Summary stats
  const summary = useMemo(() => {
    const isFacilityLevel = form.assignment_level === 'facility';
    
    let assignedFacilities = 0;
    let totalUsers = 0;
    let facilitiesWithApproval = 0;
    let facilitiesWithoutAssignee = [];

    if (isFacilityLevel) {
      facilities.forEach(fac => {
        const facAssign = form.facility_assignments[fac.id];
        const userCount = facAssign?.user_ids?.length || 0;
        if (userCount > 0) {
          assignedFacilities++;
          totalUsers += userCount;
        } else {
          facilitiesWithoutAssignee.push(fac.name);
        }
        if (facAssign?.requires_approval) {
          facilitiesWithApproval++;
        }
      });
    } else {
      totalUsers = form.assigned_user_ids.length;
      assignedFacilities = facilities.length;
    }

    // Calculate expected tasks
    const monthsBetween = calculateMonthsBetween(form.start_date, form.end_date);
    const periodsCount = calculatePeriods(form.filling_frequency, monthsBetween);
    const expectedTasks = isFacilityLevel 
      ? assignedFacilities * periodsCount 
      : periodsCount;

    return {
      category,
      subcategory,
      subSubcategory,
      isFacilityLevel,
      assignedFacilities,
      totalFacilities: facilities.length,
      totalUsers,
      facilitiesWithApproval,
      facilitiesWithoutAssignee,
      periodsCount,
      expectedTasks,
      hasReminders: form.reminder_enabled,
      hasApproval: form.requires_approval || facilitiesWithApproval > 0,
    };
  }, [form, facilities, category, subcategory, subSubcategory]);

  // Validation for each step
  const stepValidation = useMemo(() => {
    const step1Valid = true; // Level selection always has a default
    
    // Step 2 validation: has assignees AND (if approval enabled, must have approver)
    let step2Valid = false;
    if (form.assignment_level === 'facility') {
      // At least one facility has assignees
      const hasAssignees = Object.values(form.facility_assignments).some(fa => fa?.user_ids?.length > 0);
      // If any facility has approval enabled, it must have an approver
      const facilitiesWithApprovalIssue = Object.values(form.facility_assignments).filter(
        fa => fa?.requires_approval && !fa?.approver_id
      );
      step2Valid = hasAssignees && facilitiesWithApprovalIssue.length === 0;
    } else {
      // Org level: has assignees AND (if approval enabled, must have approver or chain)
      const hasAssignees = form.assigned_user_ids.length > 0;
      const approvalOk = !form.requires_approval || 
        (multiLevelApprovalEnabled ? form.approval_chain.length > 0 : !!form.approver_id);
      step2Valid = hasAssignees && approvalOk;
    }
    
    const step3Valid = form.start_date && form.filling_frequency;
    
    const step4Valid = step1Valid && step2Valid && step3Valid;

    return {
      0: step1Valid,
      1: step2Valid,
      2: step3Valid,
      3: step4Valid,
    };
  }, [form, multiLevelApprovalEnabled]);

  // Navigation
  const canGoNext = stepValidation[currentStep];
  const canGoPrev = currentStep > 0;
  const isLastStep = currentStep === STEPS.length - 1;

  const goNext = useCallback(() => {
    if (canGoNext && currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  }, [canGoNext, currentStep]);

  const goPrev = useCallback(() => {
    if (canGoPrev) {
      setCurrentStep(prev => prev - 1);
    }
  }, [canGoPrev]);

  const goToStep = useCallback((stepIndex) => {
    // Allow going back to any step, but only forward if all previous steps are valid
    if (stepIndex < currentStep) {
      setCurrentStep(stepIndex);
    } else {
      // Check all steps up to the target are valid
      let canGo = true;
      for (let i = 0; i < stepIndex; i++) {
        if (!stepValidation[i]) {
          canGo = false;
          break;
        }
      }
      if (canGo) {
        setCurrentStep(stepIndex);
      }
    }
  }, [currentStep, stepValidation]);

  // Submit handler
  const handleSubmit = useCallback(async () => {
    if (!stepValidation[3]) return;
    
    setIsSubmitting(true);
    try {
      await onSubmit(form);
      resetForm();
      onClose();
    } catch (error) {
      console.error('Assignment failed:', error);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }, [form, onSubmit, onClose, resetForm, stepValidation]);

  return {
    // State
    currentStep,
    form,
    isSubmitting,
    expandedFacilities,
    
    // Computed
    summary,
    stepValidation,
    canGoNext,
    canGoPrev,
    isLastStep,
    
    // Actions
    updateForm,
    updateFacilityAssignment,
    addUserToFacility,
    removeUserFromFacility,
    addUser,
    removeUser,
    addApprover,
    removeApprover,
    toggleFacility,
    bulkAssignToFacilities,
    bulkEnableApproval,
    
    // Navigation
    goNext,
    goPrev,
    goToStep,
    
    // Submit
    handleSubmit,
    resetForm,
    
    // Config
    approvalWorkflowEnabled,
    multiLevelApprovalEnabled,
    
    // Data
    facilities,
    users,
    reportingPeriod,
  };
}

// Helper: Calculate months between two dates
function calculateMonthsBetween(startDate, endDate) {
  if (!startDate || !endDate) return 1;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  return Math.max(1, months);
}

// Helper: Calculate number of periods based on frequency
function calculatePeriods(frequency, months) {
  switch (frequency) {
    case 'daily': return months * 30;
    case 'weekly': return months * 4;
    case 'monthly': return months;
    case 'quarterly': return Math.ceil(months / 3);
    case 'half_yearly': return Math.ceil(months / 6);
    case 'yearly': return Math.ceil(months / 12);
    default: return months;
  }
}
