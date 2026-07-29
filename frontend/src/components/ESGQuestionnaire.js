import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

// FY normalization utility - normalize once at response boundary
import { normalizeAllResponses } from './ESGQuestionnaire/utils/fyNormalization';

// Modular renderer imports
import {
  DynamicTableRenderer,
  FYComparisonTableRenderer,
  FixedRowTableRenderer,
  GroupedMatrixTableRenderer,
  ConditionalYesNoTextRenderer,
  YesNoWithDescriptionRenderer,
  LongTextResponseRenderer,
  HistoricalMaterialPercentageTableRenderer,
  HistoricalReclaimPercentageTableRenderer,
  HistoricalWasteManagementMatrixRenderer
} from './ESGQuestionnaire/renderers';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
import { toast } from 'sonner';
import { 
  Loader2, 
  Save, 
  ChevronDown, 
  ChevronRight,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock
} from 'lucide-react';
import { 
  generateReportingYears, 
  getCurrentReportingYear,
  getEffectiveYearType
} from '../utils/reportingYearUtils';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// NGRBC Principles (P1-P9)
const NGRBC_PRINCIPLES = [
  { key: "P1", name: "Ethics, Transparency and Accountability" },
  { key: "P2", name: "Sustainable and Safe Products/Services" },
  { key: "P3", name: "Employee Wellbeing" },
  { key: "P4", name: "Stakeholder Responsiveness" },
  { key: "P5", name: "Human Rights" },
  { key: "P6", name: "Environment Protection" },
  { key: "P7", name: "Policy Advocacy" },
  { key: "P8", name: "Inclusive Growth" },
  { key: "P9", name: "Customer Value" },
];

// NGRBC Policy Matrix Renderer
function NGRBCPolicyMatrixRenderer({ config, value, onChange, isEditing }) {
  // Default values for state
  const defaultAllTogether = { covered: null, board_approved: null, web_link: '', reasons: {} };
  const defaultPrincipleWise = {};
  
  // Local state - initialized with defaults, synced via useEffect when value changes
  const [mode, setMode] = useState('together');
  const [allTogether, setAllTogether] = useState(defaultAllTogether);
  const [principleWise, setPrincipleWise] = useState(defaultPrincipleWise);
  const [initialized, setInitialized] = useState(false);

  // Sync state when value prop changes (handles async data loading)
  useEffect(() => {
    if (value) {
      setMode(value.mode || 'together');
      setAllTogether(value.all_together || defaultAllTogether);
      setPrincipleWise(value.principle_wise || defaultPrincipleWise);
      setInitialized(true);
    }
  }, [value]);

  const noReasons = [
    { key: 'not_material', label: 'The entity does not consider the Principles material to its business' },
    { key: 'not_ready', label: 'The entity is not at a stage where it is in a position to formulate and implement the policies on specified principles' },
    { key: 'no_resources', label: 'The entity does not have the financial or/human and technical resources available for the task' },
    { key: 'planned_next_fy', label: 'It is planned to be done in the next financial year' },
    { key: 'other', label: 'Any other reason (please specify)', hasText: true }
  ];

  // Push state changes back to parent (only after initial sync)
  useEffect(() => {
    if (initialized) {
      onChange({ mode, all_together: allTogether, principle_wise: principleWise });
    }
  }, [mode, allTogether, principleWise, initialized]);

  const handleModeChange = (newMode) => {
    setMode(newMode);
  };

  const handleAllTogetherChange = (field, val) => {
    setAllTogether(prev => ({ ...prev, [field]: val }));
  };

  const handleAllTogetherReasonChange = (reasonKey, checked, textVal = '') => {
    setAllTogether(prev => ({
      ...prev,
      reasons: {
        ...prev.reasons,
        [reasonKey]: checked ? (reasonKey === 'other' ? textVal || true : true) : false
      }
    }));
  };

  const handlePrincipleChange = (principle, field, val) => {
    setPrincipleWise(prev => ({
      ...prev,
      [principle]: { ...prev[principle], [field]: val }
    }));
  };

  const handlePrincipleReasonChange = (principle, reasonKey, checked, textVal = '') => {
    setPrincipleWise(prev => ({
      ...prev,
      [principle]: {
        ...prev[principle],
        reasons: {
          ...prev[principle]?.reasons,
          [reasonKey]: checked ? (reasonKey === 'other' ? textVal || true : true) : false
        }
      }
    }));
  };

  if (!isEditing) {
    // View mode
    return (
      <div className="mt-2 space-y-3">
        <p className="text-sm"><strong>Mode:</strong> {mode === 'together' ? 'Fill All Principles Together' : 'Fill Principle-wise Separately'}</p>
        {mode === 'together' ? (
          <div className="pl-4 border-l-2 border-stone-200">
            <p className="text-sm"><strong>Policies cover NGRBCs:</strong> {allTogether.covered === true ? 'Yes' : allTogether.covered === false ? 'No' : '-'}</p>
            {allTogether.covered === true && (
              <>
                <p className="text-sm"><strong>Board Approved:</strong> {allTogether.board_approved === true ? 'Yes' : allTogether.board_approved === false ? 'No' : '-'}</p>
                <p className="text-sm"><strong>Web Link:</strong> {allTogether.web_link || '-'}</p>
              </>
            )}
            {allTogether.covered === false && (
              <div className="text-sm">
                <strong>Reasons:</strong>
                <ul className="list-disc pl-5">
                  {noReasons.filter(r => allTogether.reasons?.[r.key]).map(r => (
                    <li key={r.key}>{r.label}{r.key === 'other' && typeof allTogether.reasons?.other === 'string' ? `: ${allTogether.reasons.other}` : ''}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {NGRBC_PRINCIPLES.map(p => (
              <div key={p.key} className="pl-4 border-l-2 border-stone-200 py-1">
                <p className="text-sm font-medium">{p.key}: {p.name}</p>
                <p className="text-sm"><strong>Covered:</strong> {principleWise[p.key]?.covered === true ? 'Yes' : principleWise[p.key]?.covered === false ? 'No' : '-'}</p>
                {principleWise[p.key]?.covered === true && (
                  <>
                    <p className="text-sm"><strong>Board Approved:</strong> {principleWise[p.key]?.board_approved === true ? 'Yes' : principleWise[p.key]?.board_approved === false ? 'No' : '-'}</p>
                    <p className="text-sm"><strong>Web Link:</strong> {principleWise[p.key]?.web_link || '-'}</p>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Edit mode
  return (
    <div className="mt-3 space-y-4">
      {/* Mode Selection */}
      <div className="p-3 bg-stone-50 rounded-lg">
        <Label className="text-sm font-medium">Mode</Label>
        <RadioGroup value={mode} onValueChange={handleModeChange} className="mt-2 flex gap-4">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="together" id="mode-together" />
            <Label htmlFor="mode-together" className="text-sm cursor-pointer">Fill All Principles Together</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="separate" id="mode-separate" />
            <Label htmlFor="mode-separate" className="text-sm cursor-pointer">Fill Principle-wise Separately</Label>
          </div>
        </RadioGroup>
      </div>

      {/* All Together Mode */}
      {mode === 'together' && (
        <div className="p-4 border rounded-lg space-y-4">
          <div>
            <Label className="text-sm font-medium">Do your policies cover all NGRBC principles?</Label>
            <RadioGroup 
              value={allTogether.covered === true ? 'yes' : allTogether.covered === false ? 'no' : ''} 
              onValueChange={(v) => handleAllTogetherChange('covered', v === 'yes')}
              className="mt-2 flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="yes" id="all-yes" />
                <Label htmlFor="all-yes" className="text-sm cursor-pointer">Yes</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="no" id="all-no" />
                <Label htmlFor="all-no" className="text-sm cursor-pointer">No</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Yes follow-up */}
          {allTogether.covered === true && (
            <div className="pl-4 border-l-2 border-green-300 space-y-3">
              <div>
                <Label className="text-sm font-medium">Has the policy been approved by the Board?</Label>
                <RadioGroup 
                  value={allTogether.board_approved === true ? 'yes' : allTogether.board_approved === false ? 'no' : ''} 
                  onValueChange={(v) => handleAllTogetherChange('board_approved', v === 'yes')}
                  className="mt-1 flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="board-yes" />
                    <Label htmlFor="board-yes" className="text-sm cursor-pointer">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="board-no" />
                    <Label htmlFor="board-no" className="text-sm cursor-pointer">No</Label>
                  </div>
                </RadioGroup>
              </div>
              <div>
                <Label className="text-sm font-medium">Web Link of the Policies, if available</Label>
                <Input
                  value={allTogether.web_link || ''}
                  onChange={(e) => handleAllTogetherChange('web_link', e.target.value)}
                  placeholder="https://..."
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {/* No follow-up - Reasons */}
          {allTogether.covered === false && (
            <div className="pl-4 border-l-2 border-red-300 space-y-2">
              <Label className="text-sm font-medium">If No, please provide reasons:</Label>
              {noReasons.map(reason => (
                <div key={reason.key} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id={`reason-all-${reason.key}`}
                    checked={!!allTogether.reasons?.[reason.key]}
                    onChange={(e) => handleAllTogetherReasonChange(reason.key, e.target.checked)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <Label htmlFor={`reason-all-${reason.key}`} className="text-sm cursor-pointer">{reason.label}</Label>
                    {reason.hasText && allTogether.reasons?.[reason.key] && (
                      <Input
                        value={typeof allTogether.reasons?.other === 'string' ? allTogether.reasons.other : ''}
                        onChange={(e) => handleAllTogetherReasonChange('other', true, e.target.value)}
                        placeholder="Please specify..."
                        className="mt-1"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Principle-wise Mode */}
      {mode === 'separate' && (
        <div className="space-y-3">
          {NGRBC_PRINCIPLES.map(p => (
            <div key={p.key} className="p-3 border rounded-lg">
              <Label className="text-sm font-semibold text-violet-700">{p.key}: {p.name}</Label>
              
              <div className="mt-2">
                <Label className="text-xs text-stone-600">Does policy cover this principle?</Label>
                <RadioGroup 
                  value={principleWise[p.key]?.covered === true ? 'yes' : principleWise[p.key]?.covered === false ? 'no' : ''} 
                  onValueChange={(v) => handlePrincipleChange(p.key, 'covered', v === 'yes')}
                  className="mt-1 flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id={`${p.key}-yes`} />
                    <Label htmlFor={`${p.key}-yes`} className="text-sm cursor-pointer">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id={`${p.key}-no`} />
                    <Label htmlFor={`${p.key}-no`} className="text-sm cursor-pointer">No</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Yes follow-up for this principle */}
              {principleWise[p.key]?.covered === true && (
                <div className="mt-2 pl-3 border-l-2 border-green-300 space-y-2">
                  <div>
                    <Label className="text-xs text-stone-600">Board Approved?</Label>
                    <RadioGroup 
                      value={principleWise[p.key]?.board_approved === true ? 'yes' : principleWise[p.key]?.board_approved === false ? 'no' : ''} 
                      onValueChange={(v) => handlePrincipleChange(p.key, 'board_approved', v === 'yes')}
                      className="mt-1 flex gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id={`${p.key}-board-yes`} />
                        <Label htmlFor={`${p.key}-board-yes`} className="text-xs cursor-pointer">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id={`${p.key}-board-no`} />
                        <Label htmlFor={`${p.key}-board-no`} className="text-xs cursor-pointer">No</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div>
                    <Label className="text-xs text-stone-600">Web Link</Label>
                    <Input
                      value={principleWise[p.key]?.web_link || ''}
                      onChange={(e) => handlePrincipleChange(p.key, 'web_link', e.target.value)}
                      placeholder="https://..."
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                </div>
              )}

              {/* No follow-up - Reasons for this principle */}
              {principleWise[p.key]?.covered === false && (
                <div className="mt-2 pl-3 border-l-2 border-red-300 space-y-1">
                  <Label className="text-xs text-stone-600">Reasons:</Label>
                  {noReasons.map(reason => (
                    <div key={reason.key} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        id={`reason-${p.key}-${reason.key}`}
                        checked={!!principleWise[p.key]?.reasons?.[reason.key]}
                        onChange={(e) => handlePrincipleReasonChange(p.key, reason.key, e.target.checked)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <Label htmlFor={`reason-${p.key}-${reason.key}`} className="text-xs cursor-pointer">{reason.label}</Label>
                        {reason.hasText && principleWise[p.key]?.reasons?.[reason.key] && (
                          <Input
                            value={typeof principleWise[p.key]?.reasons?.other === 'string' ? principleWise[p.key].reasons.other : ''}
                            onChange={(e) => handlePrincipleReasonChange(p.key, 'other', true, e.target.value)}
                            placeholder="Please specify..."
                            className="mt-1 h-7 text-xs"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Individual Question Renderer
export function QuestionRenderer({ config, value, onChange, isEditing, allResponses = {}, historicalData = null, approvalStatus = null, versionHistory = null, onSaveQuestion = null, onFetchVersionHistory = null }) {
  const { type, question, description, placeholder, options, table_columns, required, conditional, visible_if } = config;
  const [showVersions, setShowVersions] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Check if question should be hidden based on conditional logic
  if (conditional?.depends_on && conditional?.show_when === 'has_no_answer') {
    const dependsOnValue = allResponses[conditional.depends_on];
    if (!dependsOnValue) return null;
    
    // Check if any principle has "No" or all_enabled is false
    const hasNo = dependsOnValue.mode === 'all_together' 
      ? dependsOnValue.all_enabled === false
      : Object.values(dependsOnValue.principles || {}).some(p => p.enabled === false);
    
    if (!hasNo) return null;
  }

  // Check visible_if conditions (e.g., has_rows)
  if (visible_if) {
    const depResponse = allResponses[visible_if.question_key];
    if (visible_if.condition === 'has_rows') {
      // Check if dependent question has at least 1 row
      const hasRows = Array.isArray(depResponse) && depResponse.length > 0 && 
        depResponse.some(row => Object.values(row || {}).some(v => v !== '' && v !== null && v !== undefined));
      if (!hasRows) return null;
    }
    if (visible_if.condition === 'equals' && depResponse !== visible_if.value) return null;
    if (visible_if.condition === 'not_equals' && depResponse === visible_if.value) return null;
  }

  // Helper to render complex object/array data as a formatted table (for view mode)
  const renderObjectAsTable = (data) => {
    if (!data || typeof data !== 'object') return <span className="text-sm">{data ?? '-'}</span>;
    
    // If it's an array of objects, render as a standard table
    if (Array.isArray(data)) {
      if (data.length === 0) return <span className="text-sm text-text-muted">-</span>;
      const firstItem = data[0];
      if (typeof firstItem === 'object' && firstItem !== null) {
        const columns = Object.keys(firstItem);
        return (
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="bg-stone-50">
                {columns.map(col => (
                  <TableHead key={col} className="text-xs font-medium">
                    {col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, idx) => (
                <TableRow key={idx}>
                  {columns.map(col => (
                    <TableCell key={col} className="text-xs">
                      {typeof row[col] === 'object' 
                        ? JSON.stringify(row[col]) 
                        : (row[col] ?? '-')}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        );
      }
      return <span className="text-sm">{data.join(', ')}</span>;
    }
    
    // If it's an object with nested objects (like {bod: {total: 87, trained: 23}})
    const keys = Object.keys(data);
    if (keys.length === 0) return <span className="text-sm text-text-muted">-</span>;
    
    // Check if values are objects (nested structure)
    const hasNestedObjects = keys.some(k => typeof data[k] === 'object' && data[k] !== null && !Array.isArray(data[k]));
    
    if (hasNestedObjects) {
      // Get all unique inner keys
      const innerKeys = new Set();
      keys.forEach(k => {
        if (typeof data[k] === 'object' && data[k] !== null) {
          Object.keys(data[k]).forEach(ik => innerKeys.add(ik));
        }
      });
      const innerKeysArr = Array.from(innerKeys);
      
      return (
        <Table className="text-sm">
          <TableHeader>
            <TableRow className="bg-stone-50">
              <TableHead className="text-xs font-medium">Category</TableHead>
              {innerKeysArr.map(ik => (
                <TableHead key={ik} className="text-xs font-medium">
                  {ik.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map(k => (
              <TableRow key={k}>
                <TableCell className="text-xs font-medium">
                  {k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </TableCell>
                {innerKeysArr.map(ik => (
                  <TableCell key={ik} className="text-xs">
                    {typeof data[k] === 'object' && data[k] !== null 
                      ? (data[k][ik] ?? '-')
                      : '-'}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }
    
    // Simple key-value object
    return (
      <div className="space-y-1 mt-2">
        {keys.map(k => (
          <div key={k} className="flex gap-2 text-sm">
            <span className="font-medium text-text-muted">
              {k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}:
            </span>
            <span>{data[k] ?? '-'}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderInput = () => {
    switch (type) {
      case 'text':
        return isEditing ? (
          <Input
            value={typeof value === 'string' ? value : (value || '')}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || 'Enter response'}
            className="mt-2"
          />
        ) : (
          typeof value === 'object' && value !== null 
            ? <div className="mt-2">{renderObjectAsTable(value)}</div>
            : <p className="text-sm text-text-secondary mt-2">{value || '-'}</p>
        );

      case 'textarea':
        return isEditing ? (
          <Textarea
            value={typeof value === 'string' ? value : (value || '')}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || 'Enter detailed response'}
            rows={3}
            className="mt-2"
          />
        ) : (
          typeof value === 'object' && value !== null 
            ? <div className="mt-2">{renderObjectAsTable(value)}</div>
            : <p className="text-sm text-text-secondary mt-2 whitespace-pre-wrap">{value || '-'}</p>
        );

      case 'yes_no':
        return isEditing ? (
          <div className="flex items-center gap-4 mt-2">
            <RadioGroup value={value || ''} onValueChange={onChange} className="flex gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="yes" id={`${config.question_key}-yes`} />
                <Label htmlFor={`${config.question_key}-yes`}>Yes</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="no" id={`${config.question_key}-no`} />
                <Label htmlFor={`${config.question_key}-no`}>No</Label>
              </div>
            </RadioGroup>
          </div>
        ) : (
          <Badge variant="outline" className={`mt-2 ${value === 'yes' ? 'bg-green-50 text-green-700' : value === 'no' ? 'bg-red-50 text-red-700' : ''}`}>
            {value === 'yes' ? 'Yes' : value === 'no' ? 'No' : '-'}
          </Badge>
        );

      case 'yes_no_with_text':
        const yesNoVal = typeof value === 'object' ? value : { answer: value || '', text: '' };
        return isEditing ? (
          <div className="space-y-3 mt-2">
            <RadioGroup value={yesNoVal.answer || ''} onValueChange={(v) => onChange({ ...yesNoVal, answer: v })} className="flex gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="yes" id={`${config.question_key}-yes`} />
                <Label htmlFor={`${config.question_key}-yes`}>Yes</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="no" id={`${config.question_key}-no`} />
                <Label htmlFor={`${config.question_key}-no`}>No</Label>
              </div>
            </RadioGroup>
            {yesNoVal.answer === 'yes' && (
              <div>
                <Label className="text-sm text-stone-600">{config.conditional_field_label || 'Please specify'}</Label>
                <Input
                  value={yesNoVal.text || ''}
                  onChange={(e) => onChange({ ...yesNoVal, text: e.target.value })}
                  placeholder={config.conditional_field_label || 'Enter details...'}
                  className="mt-1"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2">
            <Badge variant="outline" className={`${yesNoVal.answer === 'yes' ? 'bg-green-50 text-green-700' : yesNoVal.answer === 'no' ? 'bg-red-50 text-red-700' : ''}`}>
              {yesNoVal.answer === 'yes' ? 'Yes' : yesNoVal.answer === 'no' ? 'No' : '-'}
            </Badge>
            {yesNoVal.answer === 'yes' && yesNoVal.text && (
              <p className="text-sm text-stone-600 mt-1">{config.conditional_field_label}: {yesNoVal.text}</p>
            )}
          </div>
        );

      case 'url':
        return isEditing ? (
          <Input
            type="url"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || 'https://example.com'}
            className="mt-2"
          />
        ) : (
          value ? (
            <a href={value} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline mt-2 block">
              {value}
            </a>
          ) : <p className="text-sm text-text-secondary mt-2">-</p>
        );

      case 'number':
        return isEditing ? (
          <Input
            type="number"
            value={value || ''}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            placeholder={placeholder || '0'}
            className="mt-2 w-40"
          />
        ) : (
          <p className="text-sm text-text-secondary mt-2">{value ?? '-'}</p>
        );

      case 'select':
        return isEditing ? (
          <Select value={value || ''} onValueChange={onChange}>
            <SelectTrigger className="mt-2 w-64">
              <SelectValue placeholder={placeholder || 'Select option'} />
            </SelectTrigger>
            <SelectContent>
              {options?.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm text-text-secondary mt-2">{value || '-'}</p>
        );

      case 'multi_select':
        const selectedValues = Array.isArray(value) ? value : [];
        return isEditing ? (
          <div className="flex flex-wrap gap-2 mt-2">
            {options?.map((opt) => (
              <Button
                key={opt}
                type="button"
                variant={selectedValues.includes(opt) ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  if (selectedValues.includes(opt)) {
                    onChange(selectedValues.filter(v => v !== opt));
                  } else {
                    onChange([...selectedValues, opt]);
                  }
                }}
              >
                {opt}
              </Button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1 mt-2">
            {selectedValues.length > 0 ? selectedValues.map((v) => (
              <Badge key={v} variant="outline">{v}</Badge>
            )) : <span className="text-sm text-text-secondary">-</span>}
          </div>
        );

      case 'date':
        return isEditing ? (
          <Input
            type="date"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="mt-2 w-48"
          />
        ) : (
          <p className="text-sm text-text-secondary mt-2">{value || '-'}</p>
        );

      case 'principle_toggle_with_description':
        return <PrincipleToggleRenderer value={value} onChange={onChange} isEditing={isEditing} config={config} />;

      case 'principle_text':
        return <PrincipleTextRenderer value={value} onChange={onChange} isEditing={isEditing} config={config} />;

      case 'conditional_yes_no_table':
        return <ConditionalYesNoTableRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      case 'principle_mode_table':
        return <PrincipleModeTableRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      case 'reasons_checklist':
        return <ReasonsChecklistRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} allResponses={allResponses} />;

      case 'fixed_row_table':
        return <FixedRowTableRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      case 'multi_table':
        return <MultiTableRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      case 'conditional_yes_no_text':
        return <ConditionalYesNoTextRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      case 'fy_comparison_table':
        return <FYComparisonTableRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} allResponses={allResponses} />;

      case 'grouped_matrix_table':
        return <GroupedMatrixTableRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} allResponses={allResponses} />;

      case 'structured_group':
        return <StructuredGroupRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      case 'comparison_table':
        return <ComparisonTableRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      case 'yes_no_detail_matrix':
        return <YesNoDetailMatrixRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      case 'dual_conditional_yes_no':
        return <DualConditionalYesNoRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      case 'table':
        return <TableRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      // Environment Q70-74 Renderer Types
      case 'yes_no_with_dynamic_table':
        return <YesNoWithDynamicTableRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      case 'historical_material_percentage_table':
        return <HistoricalMaterialPercentageTableRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} historicalData={historicalData} allResponses={allResponses} />;

      case 'historical_reclaim_percentage_table':
        return <HistoricalReclaimPercentageTableRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} historicalData={historicalData} allResponses={allResponses} />;

      case 'historical_waste_management_matrix':
        return <HistoricalWasteManagementMatrixRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} historicalData={historicalData} allResponses={allResponses} />;

      // Environment Q75-94 Renderer Types (Resource Management, Emissions & Compliance)
      case 'historical_environmental_metrics_matrix':
        return <HistoricalEnvironmentalMetricsMatrixRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} historicalData={historicalData} />;

      case 'yes_no_with_nested_details':
        return <YesNoWithNestedDetailsRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      case 'historical_water_metrics_matrix':
        return <HistoricalWaterMetricsMatrixRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} historicalData={historicalData} />;

      case 'historical_water_discharge_matrix':
        return <HistoricalWaterDischargeMatrixRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} historicalData={historicalData} />;

      case 'yes_no_with_description':
        return <YesNoWithDescriptionRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      case 'historical_emissions_table':
        return <HistoricalEmissionsTableRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} historicalData={historicalData} />;

      case 'linked_ghg_metrics_matrix':
        return <LinkedGHGMetricsMatrixRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      case 'historical_waste_management_master_matrix':
        return <HistoricalWasteManagementMasterMatrixRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} historicalData={historicalData} />;

      case 'long_text_response':
        return <LongTextResponseRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      case 'dynamic_table':
        return <DynamicTableRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      case 'historical_water_stress_matrix':
        return <HistoricalWaterStressMatrixRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} historicalData={historicalData} />;

      case 'linked_scope3_metrics_matrix':
        return <LinkedScope3MetricsMatrixRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      case 'text_with_optional_weblink':
        return <TextWithOptionalWeblinkRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      case 'percentage_with_description':
        return <PercentageWithDescriptionRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      case 'ngrbc_policy_matrix':
        return <NGRBCPolicyMatrixRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      default:
        // For unknown types, try to render object data as a table in view mode
        if (!isEditing && value && typeof value === 'object') {
          return <div className="mt-2">{renderObjectAsTable(value)}</div>;
        }
        return <p className="text-sm text-red-500 mt-2">Unknown question type: {type}</p>;
    }
  };

  // Helper to render approval status badge
  const renderStatusBadge = () => {
    if (!approvalStatus) return null;
    
    // Support both approval_status and status fields
    const status = approvalStatus.approval_status || approvalStatus.status;
    if (!status) return null;
    
    const statusConfig = {
      pending_approval: { label: 'Awaiting Approval', className: 'bg-amber-100 text-amber-800' },
      approved: { label: 'Approved', className: 'bg-green-100 text-green-800' },
      rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800' },
      draft: { label: 'Draft', className: 'bg-blue-100 text-blue-800' },
      saved: { label: 'Saved', className: 'bg-slate-100 text-slate-700' },
      pending: { label: 'Pending', className: 'bg-stone-100 text-stone-600' },
    };
    
    const cfg = statusConfig[status];
    if (!cfg) return null;
    
    return (
      <Badge className={`text-xs ${cfg.className}`}>
        {cfg.label}
      </Badge>
    );
  };

  // Helper to render version history - detailed view with old/new values, approvals, rejections
  const renderVersionHistory = () => {
    const hasHistory = versionHistory && versionHistory.length > 0;
    
    // Format complex values into human-readable text with conditional field handling
    const formatValue = (val) => {
      if (val === null || val === undefined) return '-';
      if (typeof val === 'string') return val || '-';
      if (typeof val === 'boolean') return val ? 'Yes' : 'No';
      if (typeof val === 'number') return String(val);
      
      if (typeof val === 'object') {
        const lines = [];
        
        // Handle mode-based responses (principle toggles, etc.)
        if (val.mode) {
          const modeLabels = {
            'all_together': 'Report all principles together',
            'combined': 'Report all principles together',
            'individual': 'Report by individual principle',
            'per_principle': 'Report by individual principle',
          };
          lines.push(`Mode: ${modeLabels[val.mode] || val.mode}`);
          
          // Handle all_together/combined mode
          if (val.all_enabled !== undefined) {
            lines.push(`Enabled: ${val.all_enabled ? 'Yes' : 'No'}`);
          }
          if (val.all_description) {
            lines.push(`Description: ${val.all_description.slice(0, 100)}${val.all_description.length > 100 ? '...' : ''}`);
          }
          if (val.combined) {
            // First pass: identify control fields (boolean fields that control visibility)
            const controlFields = {};
            Object.entries(val.combined).forEach(([k, v]) => {
              if (typeof v === 'boolean') {
                controlFields[k] = v;
              } else if (typeof v === 'string') {
                const lower = v.toLowerCase();
                if (lower === 'yes' || lower === 'true') controlFields[k] = true;
                else if (lower === 'no' || lower === 'false') controlFields[k] = false;
              }
            });
            
            // Second pass: show fields conditionally
            Object.entries(val.combined).forEach(([k, v]) => {
              // Skip empty values
              if (v === null || v === undefined || v === '') return;
              
              // Check if this field depends on a control field
              // Pattern: if field is like "agency_name" and "assessment_done" is false, skip it
              const fieldBase = k.replace(/_name$|_details$|_description$|_reason$|_value$/, '');
              const possibleControls = [
                `${fieldBase}_done`, `${fieldBase}_conducted`, `${fieldBase}_enabled`,
                `${fieldBase.replace(/_/g, '')}_done`, 'assessment_done', 'enabled'
              ];
              
              const shouldSkip = possibleControls.some(ctrl => 
                controlFields[ctrl] === false && k !== ctrl
              );
              
              if (shouldSkip && typeof v !== 'boolean' && !['yes','no','true','false'].includes(String(v).toLowerCase())) return;
              
              const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              const displayVal = typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v;
              lines.push(`${label}: ${displayVal}`);
            });
          }
          
          // Handle per-principle mode
          if (val.principles && Object.keys(val.principles).length > 0) {
            const enabledPrinciples = Object.entries(val.principles)
              .filter(([_, p]) => p?.enabled)
              .map(([k]) => k.toUpperCase());
            if (enabledPrinciples.length > 0) {
              lines.push(`Enabled Principles: ${enabledPrinciples.join(', ')}`);
            }
          }
        }
        // Handle table data (arrays)
        else if (Array.isArray(val)) {
          lines.push(`${val.length} row(s)`);
          if (val.length > 0 && typeof val[0] === 'object') {
            const firstRow = Object.entries(val[0]).slice(0, 3)
              .map(([k, v]) => `${k}: ${v || '-'}`)
              .join(', ');
            lines.push(`First row: ${firstRow}${Object.keys(val[0]).length > 3 ? '...' : ''}`);
          }
        }
        // Handle simple key-value objects
        else {
          // First pass: identify control fields
          const controlFields = {};
          Object.entries(val).forEach(([k, v]) => {
            if (typeof v === 'boolean') {
              controlFields[k] = v;
            } else if (typeof v === 'string') {
              const lower = v.toLowerCase();
              if (lower === 'yes' || lower === 'true') controlFields[k] = true;
              else if (lower === 'no' || lower === 'false') controlFields[k] = false;
            }
          });
          
          Object.entries(val).slice(0, 8).forEach(([k, v]) => {
            if (k.startsWith('_')) return; // Skip internal fields
            if (v === null || v === undefined || v === '') return; // Skip empty
            
            // Check conditional visibility
            const fieldBase = k.replace(/_name$|_details$|_description$|_reason$|_value$/, '');
            const possibleControls = [`${fieldBase}_done`, `${fieldBase}_conducted`, `${fieldBase}_enabled`, 'assessment_done'];
            const shouldSkip = possibleControls.some(ctrl => controlFields[ctrl] === false && k !== ctrl);
            if (shouldSkip && typeof v !== 'boolean' && !['yes','no','true','false'].includes(String(v).toLowerCase())) return;
            
            const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const displayVal = typeof v === 'boolean' ? (v ? 'Yes' : 'No') : 
                              typeof v === 'object' ? JSON.stringify(v).slice(0, 30) : 
                              String(v || '-').slice(0, 50);
            lines.push(`${label}: ${displayVal}`);
          });
        }
        
        return lines.length > 0 ? lines : ['-'];
      }
      
      return [String(val)];
    };

    const getActionBadge = (action) => {
      const badges = {
        'created': 'bg-green-100 text-green-700',
        'updated': 'bg-blue-100 text-blue-700',
        'approved': 'bg-emerald-100 text-emerald-700',
        'rejected': 'bg-red-100 text-red-700',
        'submitted': 'bg-amber-100 text-amber-700',
      };
      return badges[action] || 'bg-stone-100 text-stone-700';
    };

    if (!hasHistory) return null;
    
    return (
      <>
        {showVersions && (
          <div className="bg-stone-50 rounded-md p-3 space-y-3 text-xs mt-2 border">
            <div className="font-medium text-stone-700 border-b pb-1 mb-2">Version History</div>
            {versionHistory.slice(0, 10).map((v, i) => {
              const oldLines = formatValue(v.old_value);
              const newLines = formatValue(v.new_value);
              
              return (
                <div key={i} className="border-b border-stone-200 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getActionBadge(v.change_type)}`}>
                      {v.change_type || 'Updated'}
                    </span>
                    <span className="text-stone-500">
                      {v.created_at ? new Date(v.created_at).toLocaleString() : '-'}
                    </span>
                  </div>
                  {v.created_by && (
                    <div className="text-stone-600 mb-2">
                      <span className="font-medium">By:</span> {v.created_by}
                    </div>
                  )}
                  {v.change_type === 'rejected' && v.rejection_reason && (
                    <div className="text-red-600 mb-2">
                      <span className="font-medium">Reason:</span> {v.rejection_reason}
                    </div>
                  )}
                  {(v.old_value !== undefined || v.new_value !== undefined) && (
                    <div className="grid grid-cols-2 gap-3 text-stone-600">
                      <div className="bg-red-50 p-2 rounded">
                        <div className="font-medium text-red-700 mb-1">Previous Value:</div>
                        {Array.isArray(oldLines) ? oldLines.map((line, j) => (
                          <div key={j} className="text-stone-600">{line}</div>
                        )) : <div>{oldLines}</div>}
                      </div>
                      <div className="bg-green-50 p-2 rounded">
                        <div className="font-medium text-green-700 mb-1">New Value:</div>
                        {Array.isArray(newLines) ? newLines.map((line, j) => (
                          <div key={j} className="text-stone-600">{line}</div>
                        )) : <div>{newLines}</div>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  };

  // Version history button for header
  const renderVersionHistoryButton = () => {
    const hasHistory = versionHistory && versionHistory.length > 0;
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggleVersions}
        className={`h-7 px-2 text-xs ${!hasHistory && !onFetchVersionHistory ? 'opacity-50' : ''}`}
        title={hasHistory ? `${versionHistory.length} version(s)` : 'View history'}
      >
        <Clock className="w-3 h-3" />
      </Button>
    );
  };

  // Handle question-level save
  const handleSaveQuestion = async (status = 'saved') => {
    if (!onSaveQuestion) return;
    if (status === 'draft') {
      setSavingDraft(true);
    } else {
      setSavingQuestion(true);
    }
    try {
      await onSaveQuestion(config.question_key, value, status);
    } finally {
      setSavingDraft(false);
      setSavingQuestion(false);
    }
  };

  // Handle version history fetch and toggle
  const handleToggleVersions = async () => {
    if (!showVersions && onFetchVersionHistory && (!versionHistory || versionHistory.length === 0)) {
      await onFetchVersionHistory();
    }
    setShowVersions(!showVersions);
  };

  return (
    <div className="py-4 border-b border-stone-100 last:border-b-0" data-testid={`question-${config.question_key}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1">
          <Label className="text-sm font-medium text-text-primary">
            {question}
            {required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          {description && (
            <HelpCircle className="w-4 h-4 text-text-muted flex-shrink-0" title={description} />
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {renderStatusBadge()}
          {renderVersionHistoryButton()}
        </div>
      </div>
      {description && <p className="text-xs text-text-muted mt-1">{description}</p>}
      {renderInput()}
      
      {/* Question-level Save Draft and Submit buttons */}
      {isEditing && onSaveQuestion && (
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-stone-100">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSaveQuestion('draft')}
            disabled={savingDraft || savingQuestion}
            className="h-7 px-3 text-xs"
            data-testid={`save-draft-${config.question_key}`}
          >
            {savingDraft ? (
              <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Saving...</>
            ) : (
              <><Save className="w-3 h-3 mr-1" /> Save Draft</>
            )}
          </Button>
          <Button
            size="sm"
            onClick={() => handleSaveQuestion('saved')}
            disabled={savingDraft || savingQuestion}
            className="h-7 px-3 text-xs bg-primary hover:bg-primary/90"
            data-testid={`submit-${config.question_key}`}
          >
            {savingQuestion ? (
              <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Submitting...</>
            ) : (
              <><CheckCircle2 className="w-3 h-3 mr-1" /> Submit</>
            )}
          </Button>
        </div>
      )}
      
      {renderVersionHistory()}
    </div>
  );
}

// P1-P9 Principle Toggle Renderer (with optional inline reasons when No)
function PrincipleToggleRenderer({ value, onChange, isEditing, config = {} }) {
  // Data is already normalized at the response boundary (ESGQuestionnaire.fetchData)
  const data = value || { mode: 'all_together', all_enabled: null, all_description: '', principles: {} };
  const inlineReasons = config.inline_reasons_config?.items || [];
  const hasInlineReasons = inlineReasons.length > 0;

  const handleModeChange = (newMode) => {
    onChange({ ...data, mode: newMode });
  };

  const handleAllChange = (field, val) => {
    onChange({ ...data, [field]: val });
  };

  const handlePrincipleChange = (key, field, val) => {
    const principles = { ...data.principles };
    if (!principles[key]) principles[key] = { enabled: false, description: '', reasons: {}, other_reason: '' };
    principles[key][field] = val;
    onChange({ ...data, principles });
  };

  const handlePrincipleReasonChange = (pKey, reasonKey, val) => {
    const principles = { ...data.principles };
    if (!principles[pKey]) principles[pKey] = { enabled: false, description: '', reasons: {}, other_reason: '' };
    if (!principles[pKey].reasons) principles[pKey].reasons = {};
    principles[pKey].reasons[reasonKey] = val;
    onChange({ ...data, principles });
  };

  const handlePrincipleOtherReason = (pKey, val) => {
    const principles = { ...data.principles };
    if (!principles[pKey]) principles[pKey] = { enabled: false, description: '', reasons: {}, other_reason: '' };
    principles[pKey].other_reason = val;
    onChange({ ...data, principles });
  };

  // Inline reasons sub-component
  const InlineReasonsForm = ({ pKey, pData }) => (
    <div className="mt-3 ml-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <p className="text-xs font-medium text-amber-800 mb-2">If No, please provide reasons:</p>
      <div className="space-y-2">
        {inlineReasons.map(r => (
          <div key={r.key} className="flex items-center justify-between py-1">
            <Label className="text-xs flex-1 pr-2">{r.label}</Label>
            <RadioGroup 
              value={pData.reasons?.[r.key] || ''} 
              onValueChange={(v) => handlePrincipleReasonChange(pKey, r.key, v)}
              className="flex gap-2"
            >
              <div className="flex items-center gap-1">
                <RadioGroupItem value="Yes" id={`${pKey}-${r.key}-yes`} className="h-3 w-3" />
                <Label htmlFor={`${pKey}-${r.key}-yes`} className="text-xs">Yes</Label>
              </div>
              <div className="flex items-center gap-1">
                <RadioGroupItem value="No" id={`${pKey}-${r.key}-no`} className="h-3 w-3" />
                <Label htmlFor={`${pKey}-${r.key}-no`} className="text-xs">No</Label>
              </div>
            </RadioGroup>
          </div>
        ))}
        {config.inline_reasons_config?.has_other !== false && (
          <div className="pt-1">
            <Label className="text-xs block mb-1">Any other reason (please specify)</Label>
            <Textarea
              value={pData.other_reason || ''}
              onChange={(e) => handlePrincipleOtherReason(pKey, e.target.value)}
              placeholder="Please specify..."
              rows={1}
              className="text-xs"
            />
          </div>
        )}
      </div>
    </div>
  );

  if (!isEditing) {
    return (
      <div className="mt-2 space-y-2">
        <Badge variant="outline" className="mb-2">
          Mode: {data.mode === 'all_together' ? 'All Principles Together' : 'Principle-wise'}
        </Badge>
        {data.mode === 'all_together' ? (
          <div className="bg-stone-50 p-3 rounded">
            <p className="text-sm"><strong>Applicable:</strong> {data.all_enabled ? 'Yes' : 'No'}</p>
            <p className="text-sm"><strong>Description:</strong> {data.all_description || '-'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {NGRBC_PRINCIPLES.map((p) => {
              const pData = data.principles?.[p.key] || {};
              const selectedReasons = hasInlineReasons && pData.enabled === false 
                ? inlineReasons.filter(r => pData.reasons?.[r.key] === 'Yes') 
                : [];
              return (
                <div key={p.key} className="bg-stone-50 p-2 rounded text-sm">
                  <strong>{p.key}:</strong> {pData.enabled ? 'Yes' : 'No'} 
                  {pData.description && ` - ${pData.description}`}
                  {selectedReasons.length > 0 && (
                    <div className="ml-4 mt-1 text-xs text-amber-700">
                      Reasons: {selectedReasons.map(r => r.label).join('; ')}
                      {pData.other_reason && `; Other: ${pData.other_reason}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-4">
      <div className="flex items-center gap-4">
        <Label className="text-sm">Mode:</Label>
        <RadioGroup value={data.mode} onValueChange={handleModeChange} className="flex gap-4">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="all_together" id="mode-all" />
            <Label htmlFor="mode-all" className="text-sm">Fill All Principles Together</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="principle_wise" id="mode-wise" />
            <Label htmlFor="mode-wise" className="text-sm">Fill Principle-wise Separately</Label>
          </div>
        </RadioGroup>
      </div>

      {data.mode === 'all_together' ? (
        <div className="bg-stone-50 p-4 rounded-lg space-y-3">
          <div className="flex items-center gap-3">
            <Label className="text-sm">Applicable to all principles?</Label>
            <Switch
              checked={data.all_enabled || false}
              onCheckedChange={(v) => handleAllChange('all_enabled', v)}
            />
            <span className="text-sm">{data.all_enabled ? 'Yes' : 'No'}</span>
          </div>
          <div>
            <Label className="text-sm">Description / Justification</Label>
            <Textarea
              value={data.all_description || ''}
              onChange={(e) => handleAllChange('all_description', e.target.value)}
              placeholder="Describe how your policies cover all NGRBC principles..."
              rows={3}
              className="mt-1"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {NGRBC_PRINCIPLES.map((p) => {
            const pData = data.principles?.[p.key] || { enabled: false, description: '', reasons: {}, other_reason: '' };
            return (
              <div key={p.key} className="bg-stone-50 p-3 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-medium text-sm">{p.key}</span>
                    <span className="text-xs text-text-muted ml-2">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={pData.enabled || false}
                      onCheckedChange={(v) => handlePrincipleChange(p.key, 'enabled', v)}
                    />
                    <span className="text-xs">{pData.enabled ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                <Textarea
                  value={pData.description || ''}
                  onChange={(e) => handlePrincipleChange(p.key, 'description', e.target.value)}
                  placeholder={`Description for ${p.key}...`}
                  rows={2}
                  className="text-sm"
                />
                {/* Inline reasons when No is selected */}
                {hasInlineReasons && pData.enabled === false && (
                  <InlineReasonsForm pKey={p.key} pData={pData} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// P1-P9 Principle Text Renderer (text input per principle, no toggle)
function PrincipleTextRenderer({ value, onChange, isEditing, config }) {
  // Data is already normalized at the response boundary (ESGQuestionnaire.fetchData)
  const data = value || { mode: 'all_together', all_text: '', principles: {} };

  const handleModeChange = (newMode) => {
    onChange({ ...data, mode: newMode });
  };

  const handleAllTextChange = (val) => {
    onChange({ ...data, all_text: val });
  };

  const handlePrincipleTextChange = (key, val) => {
    const principles = { ...data.principles };
    principles[key] = val;
    onChange({ ...data, principles });
  };

  if (!isEditing) {
    return (
      <div className="mt-2 space-y-2">
        <Badge variant="outline" className="mb-2">
          Mode: {data.mode === 'all_together' ? 'All Principles Together' : 'Principle-wise'}
        </Badge>
        {data.mode === 'all_together' ? (
          <div className="bg-stone-50 p-3 rounded">
            <p className="text-sm whitespace-pre-wrap">{data.all_text || '-'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {NGRBC_PRINCIPLES.map((p) => (
              <div key={p.key} className="bg-stone-50 p-2 rounded text-sm">
                <strong>{p.key}:</strong> {data.principles?.[p.key] || '-'}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-4">
      <div className="flex items-center gap-4">
        <Label className="text-sm">Mode:</Label>
        <RadioGroup value={data.mode} onValueChange={handleModeChange} className="flex gap-4">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="all_together" id={`${config.question_key}-mode-all`} />
            <Label htmlFor={`${config.question_key}-mode-all`} className="text-sm">Fill All Principles Together</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="principle_wise" id={`${config.question_key}-mode-wise`} />
            <Label htmlFor={`${config.question_key}-mode-wise`} className="text-sm">Fill Principle-wise Separately</Label>
          </div>
        </RadioGroup>
      </div>

      {data.mode === 'all_together' ? (
        <div className="bg-stone-50 p-4 rounded-lg">
          <Textarea
            value={data.all_text || ''}
            onChange={(e) => handleAllTextChange(e.target.value)}
            placeholder={config.placeholder || "Enter response applicable to all principles..."}
            rows={3}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {NGRBC_PRINCIPLES.map((p) => (
            <div key={p.key} className="bg-stone-50 p-3 rounded-lg">
              <div className="mb-2">
                <span className="font-medium text-sm">{p.key}</span>
                <span className="text-xs text-text-muted ml-2">{p.name}</span>
              </div>
              <Textarea
                value={data.principles?.[p.key] || ''}
                onChange={(e) => handlePrincipleTextChange(p.key, e.target.value)}
                placeholder={`Enter response for ${p.key}...`}
                rows={2}
                className="text-sm"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Conditional Yes/No Table Renderer (reusable pattern)
function ConditionalYesNoTableRenderer({ config, value, onChange, isEditing }) {
  // Data is already normalized at the response boundary (ESGQuestionnaire.fetchData)
  const data = value || { has_value: false, members: [{}] };
  const tableConfig = config.table_config || {};
  const columns = tableConfig.columns || ['name', 'din', 'designation', 'role'];
  
  // Column labels (can be customized via table_config.column_labels)
  const columnLabels = tableConfig.column_labels || {
    name: 'Name',
    din: 'DIN',
    designation: 'Designation',
    role: 'Role'
  };

  const handleToggle = (val) => {
    onChange({ ...data, has_value: val, members: val ? (data.members?.length ? data.members : [{}]) : [] });
  };

  const handleCellChange = (rowIndex, colKey, cellValue) => {
    const newMembers = [...(data.members || [{}])];
    if (!newMembers[rowIndex]) newMembers[rowIndex] = {};
    newMembers[rowIndex][colKey] = cellValue;
    onChange({ ...data, members: newMembers });
  };

  const addRow = () => {
    onChange({ ...data, members: [...(data.members || []), {}] });
  };

  const removeRow = (index) => {
    const newMembers = (data.members || []).filter((_, i) => i !== index);
    onChange({ ...data, members: newMembers.length ? newMembers : [{}] });
  };

  if (!isEditing) {
    return (
      <div className="mt-2 space-y-3">
        <Badge variant="outline" className={data.has_value ? 'bg-green-50 text-green-700' : 'bg-stone-50'}>
          {data.has_value ? 'Yes' : 'No'}
        </Badge>
        {data.has_value && data.members?.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50">
                  {columns.map((col) => (
                    <TableHead key={col} className="text-xs font-medium">{columnLabels[col] || col}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.members.map((row, idx) => (
                  <TableRow key={idx}>
                    {columns.map((col) => (
                      <TableCell key={col} className="text-sm">{row[col] || '-'}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-4">
      {/* Yes/No Toggle */}
      <div className="flex items-center gap-4">
        <RadioGroup 
          value={data.has_value ? 'yes' : 'no'} 
          onValueChange={(v) => handleToggle(v === 'yes')} 
          className="flex gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="yes" id={`${config.question_key}-yes`} />
            <Label htmlFor={`${config.question_key}-yes`} className="text-sm">Yes</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="no" id={`${config.question_key}-no`} />
            <Label htmlFor={`${config.question_key}-no`} className="text-sm">No</Label>
          </div>
        </RadioGroup>
      </div>

      {/* Conditional Table */}
      {data.has_value && (
        <div className="space-y-3 bg-stone-50 p-4 rounded-lg">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead key={col} className="text-xs font-medium">{columnLabels[col] || col}</TableHead>
                  ))}
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.members || [{}]).map((row, rowIdx) => (
                  <TableRow key={rowIdx}>
                    {columns.map((col) => (
                      <TableCell key={col} className="p-1">
                        <Input
                          value={row[col] || ''}
                          onChange={(e) => handleCellChange(rowIdx, col, e.target.value)}
                          placeholder={columnLabels[col] || col}
                          className="h-9 text-sm"
                        />
                      </TableCell>
                    ))}
                    <TableCell className="p-1">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => removeRow(rowIdx)} 
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="w-4 h-4 mr-1" /> Add Row
          </Button>
        </div>
      )}
    </div>
  );
}

// Principle Mode Table Renderer (Combined or Principle-wise reporting)
function PrincipleModeTableRenderer({ config, value, onChange, isEditing }) {
  // Data is already normalized at the response boundary (ESGQuestionnaire.fetchData)
  const data = value || { mode: 'combined', combined: {}, principles: {} };
  const fieldConfig = config.field_config || {};
  const fields = fieldConfig.fields || [];

  const handleModeChange = (newMode) => {
    onChange({ ...data, mode: newMode });
  };

  const handleCombinedChange = (fieldKey, val) => {
    onChange({ ...data, combined: { ...data.combined, [fieldKey]: val } });
  };

  const handlePrincipleChange = (principle, fieldKey, val) => {
    const principles = { ...data.principles };
    if (!principles[principle]) principles[principle] = {};
    principles[principle][fieldKey] = val;
    onChange({ ...data, principles });
  };

  // Render a single field based on its type
  const renderField = (field, value, onChangeField, prefix = '') => {
    const { key, label, type, options, conditional_on } = field;
    const fieldValue = value || '';

    if (type === 'select') {
      return (
        <Select value={fieldValue} onValueChange={onChangeField}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder={`Select ${label}`} />
          </SelectTrigger>
          <SelectContent>
            {(options || []).map(opt => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (type === 'textarea') {
      return (
        <Textarea
          value={fieldValue}
          onChange={(e) => onChangeField(e.target.value)}
          placeholder={label}
          rows={2}
          className="text-sm"
        />
      );
    }
    return (
      <Input
        value={fieldValue}
        onChange={(e) => onChangeField(e.target.value)}
        placeholder={label}
        className="h-9 text-sm"
      />
    );
  };

  // Check if conditional field should show
  const shouldShowField = (field, rowData) => {
    if (!field.conditional_on) return true;
    const { field: depField, value: depValue } = field.conditional_on;
    return rowData[depField] === depValue;
  };

  if (!isEditing) {
    return (
      <div className="mt-2 space-y-3">
        <Badge variant="outline" className="mb-2">
          {data.mode === 'combined' ? 'All Principles Together' : 'Principle-wise'}
        </Badge>
        {data.mode === 'combined' ? (
          <div className="bg-stone-50 p-3 rounded space-y-2">
            {fields.filter(f => !f.conditional_on || shouldShowField(f, data.combined)).map(f => (
              <div key={f.key}>
                <span className="text-xs text-text-muted">{f.label}:</span>
                <p className="text-sm">{data.combined?.[f.key] || '-'}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50">
                  <TableHead className="text-xs w-16">Principle</TableHead>
                  {fields.filter(f => !f.conditional_on).map(f => (
                    <TableHead key={f.key} className="text-xs">{f.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {NGRBC_PRINCIPLES.map(p => (
                  <TableRow key={p.key}>
                    <TableCell className="font-medium text-sm">{p.key}</TableCell>
                    {fields.filter(f => !f.conditional_on).map(f => (
                      <TableCell key={f.key} className="text-sm">
                        {data.principles?.[p.key]?.[f.key] || '-'}
                        {f.key === 'frequency' && data.principles?.[p.key]?.frequency === 'Any Other' && 
                          data.principles?.[p.key]?.frequency_other && 
                          ` (${data.principles[p.key].frequency_other})`}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-4">
      {/* Mode Selection */}
      <div className="flex items-center gap-4">
        <Label className="text-sm">Mode:</Label>
        <RadioGroup value={data.mode} onValueChange={handleModeChange} className="flex gap-4">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="combined" id={`${config.question_key}-combined`} />
            <Label htmlFor={`${config.question_key}-combined`} className="text-sm">Report All Principles Together</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="principle_wise" id={`${config.question_key}-wise`} />
            <Label htmlFor={`${config.question_key}-wise`} className="text-sm">Report Principle-wise Separately</Label>
          </div>
        </RadioGroup>
      </div>

      {/* Combined Mode */}
      {data.mode === 'combined' && (
        <div className="bg-stone-50 p-4 rounded-lg space-y-4">
          {fields.map(f => (
            shouldShowField(f, data.combined) && (
              <div key={f.key}>
                <Label className="text-sm mb-1 block">{f.label}</Label>
                {renderField(f, data.combined?.[f.key], (val) => handleCombinedChange(f.key, val))}
              </div>
            )
          ))}
        </div>
      )}

      {/* Principle-wise Mode */}
      {data.mode === 'principle_wise' && (
        <div className="overflow-x-auto bg-stone-50 p-4 rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-20 sticky left-0 bg-stone-100">Principle</TableHead>
                {fields.map(f => (
                  <TableHead key={f.key} className="text-xs min-w-[140px]">{f.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {NGRBC_PRINCIPLES.map(p => (
                <TableRow key={p.key}>
                  <TableCell className="font-medium text-sm sticky left-0 bg-stone-50">
                    <div>{p.key}</div>
                    <div className="text-xs text-text-muted font-normal">{p.name.slice(0, 20)}...</div>
                  </TableCell>
                  {fields.map(f => (
                    <TableCell key={f.key} className="p-1">
                      {shouldShowField(f, data.principles?.[p.key] || {}) && 
                        renderField(f, data.principles?.[p.key]?.[f.key], (val) => handlePrincipleChange(p.key, f.key, val))}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// Reasons Checklist Renderer (Yes/No items with optional "other" text, principle-aware)
function ReasonsChecklistRenderer({ config, value, onChange, isEditing, allResponses = {} }) {
  // Data is already normalized at the response boundary (ESGQuestionnaire.fetchData)
  const data = value || { principles: {} };
  const reasonsConfig = config.reasons_config || {};
  const reasons = reasonsConfig.items || [];
  const hasOther = reasonsConfig.has_other !== false;
  const conditional = config.conditional || {};

  // Get principles that need reasons (where dependent question answered "No")
  const getPrinciplesNeedingReasons = () => {
    if (!conditional.depends_on) return [];
    const dependsOnValue = allResponses[conditional.depends_on];
    if (!dependsOnValue) return [];

    if (dependsOnValue.mode === 'all_together') {
      // If combined mode and all_enabled is false, show for all principles
      return dependsOnValue.all_enabled === false ? NGRBC_PRINCIPLES.map(p => p.key) : [];
    } else {
      // Principle-wise: return only principles where enabled === false
      return NGRBC_PRINCIPLES
        .filter(p => dependsOnValue.principles?.[p.key]?.enabled === false)
        .map(p => p.key);
    }
  };

  const principlesNeedingReasons = getPrinciplesNeedingReasons();

  const handlePrincipleReasonChange = (principle, reasonKey, val) => {
    const principles = { ...data.principles };
    if (!principles[principle]) principles[principle] = { reasons: {}, other_reason: '' };
    principles[principle].reasons = { ...principles[principle].reasons, [reasonKey]: val };
    onChange({ ...data, principles });
  };

  const handlePrincipleOtherChange = (principle, val) => {
    const principles = { ...data.principles };
    if (!principles[principle]) principles[principle] = { reasons: {}, other_reason: '' };
    principles[principle].other_reason = val;
    onChange({ ...data, principles });
  };

  if (principlesNeedingReasons.length === 0) {
    return null; // Don't render if no principles need reasons
  }

  if (!isEditing) {
    return (
      <div className="mt-2 space-y-4">
        {principlesNeedingReasons.map(pKey => {
          const pData = data.principles?.[pKey] || {};
          const selectedReasons = reasons.filter(r => pData.reasons?.[r.key] === 'Yes');
          const pInfo = NGRBC_PRINCIPLES.find(p => p.key === pKey);
          return (
            <div key={pKey} className="bg-stone-50 p-3 rounded">
              <div className="font-medium text-sm mb-2">{pKey} - {pInfo?.name}</div>
              {selectedReasons.length > 0 ? (
                <div className="space-y-1 ml-4">
                  {selectedReasons.map(r => (
                    <div key={r.key} className="flex items-start gap-2 text-sm">
                      <span className="text-green-600">✓</span>
                      <span>{r.label}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted ml-4">No reasons selected</p>
              )}
              {hasOther && pData.other_reason && (
                <div className="text-sm mt-2 ml-4">
                  <span className="text-text-muted">Other:</span> {pData.other_reason}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-4">
      {principlesNeedingReasons.map(pKey => {
        const pData = data.principles?.[pKey] || { reasons: {}, other_reason: '' };
        const pInfo = NGRBC_PRINCIPLES.find(p => p.key === pKey);
        return (
          <div key={pKey} className="bg-stone-50 p-4 rounded-lg">
            <div className="font-medium text-sm mb-3 pb-2 border-b border-stone-200">
              {pKey} - {pInfo?.name}
            </div>
            <div className="space-y-2">
              {reasons.map(r => (
                <div key={r.key} className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0">
                  <Label className="text-sm flex-1 pr-4">{r.label}</Label>
                  <RadioGroup 
                    value={pData.reasons?.[r.key] || ''} 
                    onValueChange={(v) => handlePrincipleReasonChange(pKey, r.key, v)}
                    className="flex gap-3"
                  >
                    <div className="flex items-center gap-1">
                      <RadioGroupItem value="Yes" id={`${config.question_key}-${pKey}-${r.key}-yes`} />
                      <Label htmlFor={`${config.question_key}-${pKey}-${r.key}-yes`} className="text-sm">Yes</Label>
                    </div>
                    <div className="flex items-center gap-1">
                      <RadioGroupItem value="No" id={`${config.question_key}-${pKey}-${r.key}-no`} />
                      <Label htmlFor={`${config.question_key}-${pKey}-${r.key}-no`} className="text-sm">No</Label>
                    </div>
                  </RadioGroup>
                </div>
              ))}
              {hasOther && (
                <div className="pt-2">
                  <Label className="text-sm block mb-2">Any other reason (please specify)</Label>
                  <Textarea
                    value={pData.other_reason || ''}
                    onChange={(e) => handlePrincipleOtherChange(pKey, e.target.value)}
                    placeholder="Please specify other reasons..."
                    rows={2}
                    className="text-sm"
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Fixed Row Table Renderer (predefined rows like BoD, KMP, Employees, Workers)
// Multi Table Renderer (multiple tables in one question - supports both dynamic and fixed rows)
function MultiTableRenderer({ config, value, onChange, isEditing }) {
  const tables = config.tables_config || [];
  const data = value || {};

  const handleTableChange = (tableKey, newTableData) => {
    onChange({ ...data, [tableKey]: newTableData });
  };

  const renderTable = (tableConfig) => {
    const { key, label, columns, has_add_row = true, fixed_rows } = tableConfig;
    const isFixedRows = fixed_rows && fixed_rows.length > 0;
    const tableData = data[key] || (isFixedRows ? {} : [{}]);

    // For fixed rows
    const handleFixedCellChange = (rowKey, colKey, val) => {
      const newData = { ...tableData };
      if (!newData[rowKey]) newData[rowKey] = {};
      newData[rowKey][colKey] = val;
      handleTableChange(key, newData);
    };

    // For dynamic rows
    const handleDynamicCellChange = (rowIdx, colKey, val) => {
      const newRows = [...(Array.isArray(tableData) ? tableData : [{}])];
      if (!newRows[rowIdx]) newRows[rowIdx] = {};
      newRows[rowIdx][colKey] = val;
      handleTableChange(key, newRows);
    };

    const addRow = () => handleTableChange(key, [...(Array.isArray(tableData) ? tableData : []), {}]);
    const removeRow = (idx) => handleTableChange(key, (Array.isArray(tableData) ? tableData : []).filter((_, i) => i !== idx));

    const renderCellInput = (col, cellValue, onCellChange) => {
      if (!isEditing) return <span className="text-sm">{cellValue ?? '-'}</span>;
      
      if (col.type === 'select') {
        return (
          <Select value={cellValue || ''} onValueChange={onCellChange}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {(col.options || []).map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      }
      if (col.type === 'yes_no') {
        return (
          <Select value={cellValue || ''} onValueChange={onCellChange}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="-" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Yes">Yes</SelectItem>
              <SelectItem value="No">No</SelectItem>
            </SelectContent>
          </Select>
        );
      }
      return (
        <Input 
          type={col.type === 'number' ? 'number' : 'text'} 
          value={cellValue ?? ''} 
          onChange={(e) => onCellChange(e.target.value)} 
          className="h-8 text-xs" 
          placeholder={col.type === 'number' ? '0' : col.label}
        />
      );
    };

    return (
      <div key={key} className="mb-6">
        <h4 className="text-sm font-semibold mb-2 text-text-primary">{label}</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-stone-50">
                {isFixedRows && <TableHead className="text-xs font-medium w-48 sticky left-0 bg-stone-50">Category</TableHead>}
                {columns.map(col => (
                  <TableHead key={col.key} className="text-xs font-medium min-w-[80px]">{col.label}</TableHead>
                ))}
                {isEditing && !isFixedRows && has_add_row && <TableHead className="w-10"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isFixedRows ? (
                fixed_rows.map(row => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium text-sm sticky left-0 bg-white">{row.label}</TableCell>
                    {columns.map(col => (
                      <TableCell key={col.key} className="p-1">
                        {renderCellInput(col, tableData[row.key]?.[col.key], (val) => handleFixedCellChange(row.key, col.key, val))}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                (Array.isArray(tableData) ? tableData : [{}]).map((row, rowIdx) => (
                  <TableRow key={rowIdx}>
                    {columns.map(col => (
                      <TableCell key={col.key} className="p-1">
                        {renderCellInput(col, row[col.key], (val) => handleDynamicCellChange(rowIdx, col.key, val))}
                      </TableCell>
                    ))}
                    {isEditing && has_add_row && (
                      <TableCell className="p-1">
                        <Button variant="ghost" size="sm" onClick={() => removeRow(rowIdx)} className="h-6 w-6 p-0 text-red-500">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {isEditing && !isFixedRows && has_add_row && (
          <Button variant="outline" size="sm" onClick={addRow} className="mt-2">
            <Plus className="w-3 h-3 mr-1" /> Add Row
          </Button>
        )}
      </div>
    );
  };

  return <div className="mt-2 space-y-4">{tables.map(renderTable)}</div>;
}

// Conditional Yes/No Text Renderer
// Grouped Matrix Table Renderer (grouped rows with FY columns)

// Structured Group Renderer (multiple fields in a single question)
function StructuredGroupRenderer({ config, value, onChange, isEditing }) {
  const fields = config.fields_config || [];
  const data = value || {};

  const handleFieldChange = (key, val) => {
    onChange({ ...data, [key]: val });
  };

  if (!isEditing) {
    return (
      <div className="mt-2 space-y-2">
        {fields.map(f => (
          <div key={f.key} className="flex gap-2">
            <span className="text-sm text-text-muted">{f.label}:</span>
            <span className="text-sm">{data[f.key] ?? '-'}{f.type === 'percentage' && data[f.key] ? '%' : ''}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-4 bg-stone-50 p-4 rounded-lg">
      {fields.map(f => (
        <div key={f.key}>
          <Label className="text-sm mb-1 block">{f.label}</Label>
          {f.type === 'textarea' ? (
            <Textarea
              value={data[f.key] ?? ''}
              onChange={(e) => handleFieldChange(f.key, e.target.value)}
              placeholder={f.label}
              rows={2}
              className="text-sm"
            />
          ) : f.type === 'number' || f.type === 'percentage' ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={data[f.key] ?? ''}
                onChange={(e) => handleFieldChange(f.key, e.target.value)}
                placeholder="0"
                className="h-9 text-sm w-32"
              />
              {f.type === 'percentage' && <span className="text-sm text-text-muted">%</span>}
            </div>
          ) : (
            <Input
              value={data[f.key] ?? ''}
              onChange={(e) => handleFieldChange(f.key, e.target.value)}
              placeholder={f.label}
              className="h-9 text-sm"
            />
          )}
        </div>
      ))}
    </div>
  );
}

// Comparison Table Renderer (FY comparison with fixed rows and multiple column groups)
function ComparisonTableRenderer({ config, value, onChange, isEditing }) {
  const tableConfig = config.table_config || {};
  const fixedRows = tableConfig.fixed_rows || [];
  const columnGroups = tableConfig.column_groups || [];
  const data = value || {};

  const handleCellChange = (rowKey, colKey, val) => {
    const newData = { ...data };
    if (!newData[rowKey]) newData[rowKey] = {};
    newData[rowKey][colKey] = val;
    onChange(newData);
  };

  const renderCell = (col, rowKey) => {
    const cellValue = data[rowKey]?.[col.key];
    if (!isEditing) return <span className="text-sm">{cellValue ?? '-'}</span>;
    
    if (col.type === 'select') {
      return (
        <Select value={cellValue || ''} onValueChange={(v) => handleCellChange(rowKey, col.key, v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="-" /></SelectTrigger>
          <SelectContent>
            {(col.options || []).map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        type={col.type === 'number' || col.type === 'percentage' ? 'number' : 'text'}
        value={cellValue ?? ''}
        onChange={(e) => handleCellChange(rowKey, col.key, e.target.value)}
        className="h-8 text-xs"
        placeholder={col.type === 'percentage' ? '%' : ''}
      />
    );
  };

  return (
    <div className="mt-2 overflow-x-auto">
      <Table>
        <TableHeader>
          {columnGroups.length > 0 && (
            <TableRow className="bg-stone-100">
              <TableHead rowSpan={2} className="text-xs font-medium w-32 border-r">Benefits</TableHead>
              {columnGroups.map(group => (
                <TableHead key={group.key} colSpan={group.columns.length} className="text-xs font-medium text-center border-r last:border-r-0">
                  {group.label}
                </TableHead>
              ))}
            </TableRow>
          )}
          <TableRow className="bg-stone-50">
            {columnGroups.map(group => 
              group.columns.map(col => (
                <TableHead key={col.key} className="text-xs font-medium">{col.label}</TableHead>
              ))
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {fixedRows.map(row => (
            <TableRow key={row.key}>
              <TableCell className="font-medium text-sm border-r">{row.label}</TableCell>
              {columnGroups.map(group => 
                group.columns.map(col => (
                  <TableCell key={col.key} className="p-1">{renderCell(col, row.key)}</TableCell>
                ))
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Yes/No Detail Matrix Renderer (fixed rows with Yes/No and conditional details)
function YesNoDetailMatrixRenderer({ config, value, onChange, isEditing }) {
  const tableConfig = config.table_config || {};
  const fixedRows = tableConfig.fixed_rows || [];
  const data = value || {};

  const handleChange = (rowKey, field, val) => {
    const newData = { ...data };
    if (!newData[rowKey]) newData[rowKey] = { available: '', details: '' };
    newData[rowKey][field] = val;
    onChange(newData);
  };

  if (!isEditing) {
    return (
      <div className="mt-2 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-stone-50">
              <TableHead className="text-xs font-medium w-48">Category</TableHead>
              <TableHead className="text-xs font-medium w-24">Mechanism Available</TableHead>
              <TableHead className="text-xs font-medium">Brief Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fixedRows.map(row => (
              <TableRow key={row.key}>
                <TableCell className="font-medium text-sm">{row.label}</TableCell>
                <TableCell className="text-sm">{data[row.key]?.available || '-'}</TableCell>
                <TableCell className="text-sm">{data[row.key]?.details || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="mt-2 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-stone-50">
            <TableHead className="text-xs font-medium w-48">Category</TableHead>
            <TableHead className="text-xs font-medium w-28">Mechanism Available</TableHead>
            <TableHead className="text-xs font-medium">Brief Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fixedRows.map(row => (
            <TableRow key={row.key}>
              <TableCell className="font-medium text-sm">{row.label}</TableCell>
              <TableCell className="p-1">
                <Select value={data[row.key]?.available || ''} onValueChange={(v) => handleChange(row.key, 'available', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="-" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="p-1">
                <Textarea
                  value={data[row.key]?.details || ''}
                  onChange={(e) => handleChange(row.key, 'details', e.target.value)}
                  placeholder={data[row.key]?.available === 'Yes' ? 'Required when Yes' : 'Details...'}
                  rows={1}
                  className="text-xs"
                  disabled={data[row.key]?.available !== 'Yes'}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Dual Conditional Yes/No Renderer (two categories with Yes/No + details)
function DualConditionalYesNoRenderer({ config, value, onChange, isEditing }) {
  const categories = config.categories || [{ key: 'employees', label: 'Employees' }, { key: 'workers', label: 'Workers' }];
  const data = value || {};

  const handleChange = (catKey, field, val) => {
    const newData = { ...data };
    if (!newData[catKey]) newData[catKey] = { has_value: false, details: '' };
    newData[catKey][field] = val;
    onChange(newData);
  };

  if (!isEditing) {
    return (
      <div className="mt-2 space-y-2">
        {categories.map(cat => (
          <div key={cat.key} className="bg-stone-50 p-3 rounded">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{cat.label}:</span>
              <Badge variant="outline" className={data[cat.key]?.has_value ? 'bg-green-50 text-green-700' : ''}>
                {data[cat.key]?.has_value ? 'Yes' : 'No'}
              </Badge>
            </div>
            {data[cat.key]?.has_value && data[cat.key]?.details && (
              <p className="text-sm mt-1 ml-4">{data[cat.key].details}</p>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-4">
      {categories.map(cat => (
        <div key={cat.key} className="bg-stone-50 p-4 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-medium">{cat.label}</Label>
            <RadioGroup 
              value={data[cat.key]?.has_value ? 'yes' : 'no'} 
              onValueChange={(v) => handleChange(cat.key, 'has_value', v === 'yes')}
              className="flex gap-3"
            >
              <div className="flex items-center gap-1">
                <RadioGroupItem value="yes" id={`${config.question_key}-${cat.key}-yes`} />
                <Label htmlFor={`${config.question_key}-${cat.key}-yes`} className="text-sm">Yes</Label>
              </div>
              <div className="flex items-center gap-1">
                <RadioGroupItem value="no" id={`${config.question_key}-${cat.key}-no`} />
                <Label htmlFor={`${config.question_key}-${cat.key}-no`} className="text-sm">No</Label>
              </div>
            </RadioGroup>
          </div>
          {data[cat.key]?.has_value && (
            <Textarea
              value={data[cat.key]?.details || ''}
              onChange={(e) => handleChange(cat.key, 'details', e.target.value)}
              placeholder="Provide details..."
              rows={2}
              className="text-sm"
            />
          )}
        </div>
      ))}
    </div>
  );
}

// Table Renderer
function TableRenderer({ config, value, onChange, isEditing }) {
  const columns = config.table_columns || [];
  const rows = Array.isArray(value) ? value : [{}];

  const handleCellChange = (rowIndex, colKey, cellValue) => {
    const newRows = [...rows];
    if (!newRows[rowIndex]) newRows[rowIndex] = {};
    newRows[rowIndex][colKey] = cellValue;
    onChange(newRows);
  };

  const addRow = () => onChange([...rows, {}]);
  const removeRow = (index) => {
    if (rows.length > 1) onChange(rows.filter((_, i) => i !== index));
  };

  if (!isEditing) {
    return (
      <div className="mt-2 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-stone-50">
              {columns.map((col) => (
                <TableHead key={col.key} className="text-xs">{col.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow key={idx}>
                {columns.map((col) => (
                  <TableCell key={col.key} className="text-xs">{row[col.key] ?? '-'}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-stone-50">
              {columns.map((col) => (
                <TableHead key={col.key} className="text-xs" style={{ width: col.width }}>{col.label}</TableHead>
              ))}
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIdx) => (
              <TableRow key={rowIdx}>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    {col.type === 'yes_no' ? (
                      <Select value={row[col.key] || ''} onValueChange={(v) => handleCellChange(rowIdx, col.key, v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="-" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : col.type === 'select' ? (
                      <Select value={row[col.key] || ''} onValueChange={(v) => handleCellChange(rowIdx, col.key, v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="-" /></SelectTrigger>
                        <SelectContent>
                          {col.options?.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : col.type === 'number' ? (
                      <Input
                        type="number"
                        value={row[col.key] ?? ''}
                        onChange={(e) => handleCellChange(rowIdx, col.key, parseFloat(e.target.value) || 0)}
                        className="h-8 text-xs"
                      />
                    ) : (
                      <Input
                        value={row[col.key] || ''}
                        onChange={(e) => handleCellChange(rowIdx, col.key, e.target.value)}
                        className="h-8 text-xs"
                      />
                    )}
                  </TableCell>
                ))}
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => removeRow(rowIdx)} className="h-6 w-6 p-0 text-red-500">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button variant="outline" size="sm" onClick={addRow}>
        <Plus className="w-3 h-3 mr-1" /> Add Row
      </Button>
    </div>
  );
}

// =============================================================================
// Environment Q70-74 Renderers (Life Cycle Assessment & Circular Economy)
// =============================================================================

// Yes/No with Conditional Dynamic Table (Q70 - Life Cycle Assessment)
function YesNoWithDynamicTableRenderer({ config, value, onChange, isEditing }) {
  const tableConfig = config.table_config || {};
  const conditionalField = tableConfig.conditional_field || 'has_value';
  const showTableWhen = tableConfig.show_table_when || 'yes';
  const columns = tableConfig.columns || [];
  
  const data = value || { [conditionalField]: '', rows: [{}] };
  const showTable = data[conditionalField] === showTableWhen;
  
  const handleToggleChange = (val) => {
    onChange({ ...data, [conditionalField]: val });
  };
  
  const handleCellChange = (rowIndex, colKey, cellValue) => {
    const newRows = [...(data.rows || [{}])];
    if (!newRows[rowIndex]) newRows[rowIndex] = {};
    newRows[rowIndex][colKey] = cellValue;
    onChange({ ...data, rows: newRows });
  };
  
  const addRow = () => {
    onChange({ ...data, rows: [...(data.rows || [{}]), {}] });
  };
  
  const removeRow = (index) => {
    const newRows = (data.rows || []).filter((_, i) => i !== index);
    onChange({ ...data, rows: newRows.length > 0 ? newRows : [{}] });
  };
  
  if (!isEditing) {
    return (
      <div className="mt-2 space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={data[conditionalField] === 'yes' ? 'bg-green-50 text-green-700' : data[conditionalField] === 'no' ? 'bg-red-50 text-red-700' : ''}>
            {data[conditionalField] === 'yes' ? 'Yes' : data[conditionalField] === 'no' ? 'No' : 'Not answered'}
          </Badge>
        </div>
        {showTable && (data.rows || []).length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50">
                  {columns.map((col) => (
                    <TableHead key={col.key} className="text-xs font-medium">{col.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.rows || []).map((row, idx) => (
                  <TableRow key={idx}>
                    {columns.map((col) => (
                      <TableCell key={col.key} className="text-xs">
                        {col.type === 'yes_no' 
                          ? (row[col.key] === 'yes' ? 'Yes' : row[col.key] === 'no' ? 'No' : '-')
                          : col.suffix 
                            ? `${row[col.key] ?? '-'}${row[col.key] ? col.suffix : ''}`
                            : row[col.key] ?? '-'
                        }
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div className="mt-2 space-y-4">
      <div className="flex items-center gap-4">
        <RadioGroup value={data[conditionalField] || ''} onValueChange={handleToggleChange} className="flex gap-4">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="yes" id={`${config.question_key}-yes`} />
            <Label htmlFor={`${config.question_key}-yes`}>Yes</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="no" id={`${config.question_key}-no`} />
            <Label htmlFor={`${config.question_key}-no`}>No</Label>
          </div>
        </RadioGroup>
      </div>
      
      {showTable && (
        <div className="space-y-2 border-l-2 border-emerald-200 pl-4">
          <p className="text-xs text-text-muted mb-2">Provide details for each product/service assessed:</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-emerald-50">
                  {columns.map((col) => (
                    <TableHead key={col.key} className="text-xs font-medium" style={{ width: col.width }}>{col.label}</TableHead>
                  ))}
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.rows || [{}]).map((row, rowIdx) => (
                  <TableRow key={rowIdx}>
                    {columns.map((col) => (
                      <TableCell key={col.key} className="p-1">
                        {col.type === 'yes_no' ? (
                          <Select value={row[col.key] || ''} onValueChange={(v) => handleCellChange(rowIdx, col.key, v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="-" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="yes">Yes</SelectItem>
                              <SelectItem value="no">No</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : col.type === 'select' ? (
                          <Select value={row[col.key] || ''} onValueChange={(v) => handleCellChange(rowIdx, col.key, v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>
                              {col.options?.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : col.type === 'number' ? (
                          <div className="flex items-center">
                            <Input
                              type="number"
                              value={row[col.key] ?? ''}
                              onChange={(e) => handleCellChange(rowIdx, col.key, parseFloat(e.target.value) || 0)}
                              className="h-8 text-xs"
                              step="0.01"
                            />
                            {col.suffix && <span className="ml-1 text-xs text-text-muted">{col.suffix}</span>}
                          </div>
                        ) : (
                          <Input
                            value={row[col.key] || ''}
                            onChange={(e) => handleCellChange(rowIdx, col.key, e.target.value)}
                            className="h-8 text-xs"
                            placeholder={col.label}
                          />
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="p-1">
                      <Button variant="ghost" size="sm" onClick={() => removeRow(rowIdx)} className="h-6 w-6 p-0 text-red-500 hover:text-red-700">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {tableConfig.allow_add_row !== false && (
            <Button variant="outline" size="sm" onClick={addRow} className="mt-2">
              <Plus className="w-3 h-3 mr-1" /> Add Product/Service
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Historical Material Percentage Table (Q72 - Recycled Input Material)

// Historical Reclaim Percentage Table (Q73 - Reclaimed Products)
// Historical Waste Management Matrix (Q74 - Waste Management)

// =============================================================================
// Environment Q75-94 Renderers (Resource Management, Emissions & Compliance)
// =============================================================================

// Q75 - Historical Environmental Metrics Matrix (Energy)
function HistoricalEnvironmentalMetricsMatrixRenderer({ config, value, onChange, isEditing, historicalData = null }) {
  const tableConfig = config.table_config || {};
  const sections = tableConfig.sections || [];
  const columns = tableConfig.columns || [];
  const hasAssurance = tableConfig.has_assurance_field;
  const assuranceConfig = tableConfig.assurance_config || {};
  
  const data = value || { metrics: {}, assurance: { conducted: '', details: '', weblink: '' } };
  
  const handleMetricChange = (rowKey, colKey, val) => {
    const newMetrics = { ...data.metrics };
    if (!newMetrics[rowKey]) newMetrics[rowKey] = {};
    newMetrics[rowKey][colKey] = val;
    onChange({ ...data, metrics: newMetrics });
  };
  
  const handleAssuranceChange = (field, val) => {
    onChange({ ...data, assurance: { ...data.assurance, [field]: val } });
  };
  
  if (!isEditing) {
    return (
      <div className="mt-2 space-y-4">
        {sections.map((section) => (
          <div key={section.title} className="overflow-x-auto">
            <h4 className="text-xs font-semibold text-stone-600 mb-2">{section.title}</h4>
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50">
                  <TableHead className="text-xs font-medium">Parameter</TableHead>
                  {columns.map((col) => (
                    <TableHead key={col.key} className="text-xs font-medium text-center">{col.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {section.rows.map((row) => (
                  <TableRow key={row.key} className={row.is_total ? 'bg-stone-100 font-semibold' : ''}>
                    <TableCell className="text-xs">{row.label}</TableCell>
                    {columns.map((col) => (
                      <TableCell key={col.key} className="text-xs text-center">
                        {data.metrics?.[row.key]?.[col.key] ?? '-'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
        {hasAssurance && (
          <div className="mt-4 p-3 bg-stone-50 rounded">
            <p className="text-xs"><strong>Independent assurance conducted:</strong> {data.assurance?.conducted === 'yes' ? 'Yes' : data.assurance?.conducted === 'no' ? 'No' : '-'}</p>
            {data.assurance?.conducted === 'yes' && (
              <>
                <p className="text-xs mt-1"><strong>Details:</strong> {data.assurance?.details || '-'}</p>
                {data.assurance?.weblink && <p className="text-xs mt-1"><strong>Web Link:</strong> <a href={data.assurance.weblink} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{data.assurance.weblink}</a></p>}
              </>
            )}
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div className="mt-2 space-y-4">
      {sections.map((section) => (
        <div key={section.title} className="overflow-x-auto">
          <h4 className="text-xs font-semibold text-emerald-700 mb-2 bg-emerald-50 p-2 rounded">{section.title}</h4>
          <Table>
            <TableHeader>
              <TableRow className="bg-emerald-50">
                <TableHead className="text-xs font-medium">Parameter</TableHead>
                {columns.map((col) => (
                  <TableHead key={col.key} className={`text-xs font-medium text-center ${col.historical_autofill ? 'bg-amber-50' : ''}`}>
                    {col.label}
                    {col.historical_autofill && <Badge variant="outline" className="ml-1 text-[9px] bg-amber-100 text-amber-700">Prev FY</Badge>}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {section.rows.map((row) => (
                <TableRow key={row.key} className={row.is_total ? 'bg-emerald-100' : ''}>
                  <TableCell className="text-xs font-medium">{row.label}</TableCell>
                  {columns.map((col) => (
                    <TableCell key={col.key} className="p-1">
                      <Input
                        type="number"
                        value={data.metrics?.[row.key]?.[col.key] ?? ''}
                        onChange={(e) => handleMetricChange(row.key, col.key, parseFloat(e.target.value) || 0)}
                        className={`h-8 text-xs text-center ${col.historical_autofill ? 'bg-amber-50' : ''}`}
                        step="0.01"
                        min="0"
                        disabled={col.historical_autofill}
                        placeholder={col.historical_autofill ? 'Auto' : '0'}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
      
      {hasAssurance && (
        <div className="mt-4 p-4 border border-stone-200 rounded-lg">
          <Label className="text-sm font-medium">{assuranceConfig.question}</Label>
          <RadioGroup 
            value={data.assurance?.conducted || ''} 
            onValueChange={(v) => handleAssuranceChange('conducted', v)} 
            className="flex gap-4 mt-2"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="yes" id="assurance-yes" />
              <Label htmlFor="assurance-yes">Yes</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="no" id="assurance-no" />
              <Label htmlFor="assurance-no">No</Label>
            </div>
          </RadioGroup>
          {data.assurance?.conducted === 'yes' && (
            <div className="mt-3 space-y-3 border-l-2 border-emerald-200 pl-4">
              <div>
                <Label className="text-xs">Assurance Details</Label>
                <Textarea
                  value={data.assurance?.details || ''}
                  onChange={(e) => handleAssuranceChange('details', e.target.value)}
                  placeholder="Provide assurance details..."
                  rows={2}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Web Link (optional)</Label>
                <Input
                  type="url"
                  value={data.assurance?.weblink || ''}
                  onChange={(e) => handleAssuranceChange('weblink', e.target.value)}
                  placeholder="https://..."
                  className="mt-1"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Q76 - Yes/No with Nested Details (PAT Scheme)
function YesNoWithNestedDetailsRenderer({ config, value, onChange, isEditing }) {
  const nestedConfig = config.nested_config || {};
  const subQuestions = nestedConfig.sub_questions || [];
  const showWhen = nestedConfig.show_when || 'yes';
  
  const data = value || { main_answer: '', sub_answers: {} };
  
  const handleMainChange = (val) => {
    onChange({ ...data, main_answer: val });
  };
  
  const handleSubChange = (key, val) => {
    onChange({ ...data, sub_answers: { ...data.sub_answers, [key]: val } });
  };
  
  const shouldShowSubQuestion = (sq) => {
    if (!sq.visible_when) return true;
    return data.sub_answers?.[sq.visible_when.field] === sq.visible_when.value;
  };
  
  if (!isEditing) {
    return (
      <div className="mt-2 space-y-2">
        <Badge variant="outline" className={data.main_answer === 'yes' ? 'bg-green-50 text-green-700' : data.main_answer === 'no' ? 'bg-red-50 text-red-700' : ''}>
          {data.main_answer === 'yes' ? 'Yes' : data.main_answer === 'no' ? 'No' : 'Not answered'}
        </Badge>
        {data.main_answer === showWhen && (
          <div className="ml-4 space-y-2 border-l-2 border-stone-200 pl-4">
            {subQuestions.filter(shouldShowSubQuestion).map((sq) => (
              <div key={sq.key}>
                <p className="text-xs font-medium">{sq.question}</p>
                <p className="text-xs text-text-muted">{data.sub_answers?.[sq.key] || '-'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div className="mt-2 space-y-3">
      <RadioGroup value={data.main_answer || ''} onValueChange={handleMainChange} className="flex gap-4">
        <div className="flex items-center gap-2">
          <RadioGroupItem value="yes" id={`${config.question_key}-main-yes`} />
          <Label htmlFor={`${config.question_key}-main-yes`}>Yes</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="no" id={`${config.question_key}-main-no`} />
          <Label htmlFor={`${config.question_key}-main-no`}>No</Label>
        </div>
      </RadioGroup>
      
      {data.main_answer === showWhen && (
        <div className="ml-4 space-y-3 border-l-2 border-emerald-200 pl-4">
          {subQuestions.filter(shouldShowSubQuestion).map((sq) => (
            <div key={sq.key}>
              <Label className="text-xs font-medium">{sq.question}{sq.required && <span className="text-red-500 ml-1">*</span>}</Label>
              {sq.type === 'yes_no' ? (
                <RadioGroup 
                  value={data.sub_answers?.[sq.key] || ''} 
                  onValueChange={(v) => handleSubChange(sq.key, v)} 
                  className="flex gap-4 mt-1"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="yes" id={`${sq.key}-yes`} />
                    <Label htmlFor={`${sq.key}-yes`}>Yes</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="no" id={`${sq.key}-no`} />
                    <Label htmlFor={`${sq.key}-no`}>No</Label>
                  </div>
                </RadioGroup>
              ) : (
                <Textarea
                  value={data.sub_answers?.[sq.key] || ''}
                  onChange={(e) => handleSubChange(sq.key, e.target.value)}
                  placeholder={sq.question}
                  rows={2}
                  className="mt-1"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Q77 - Historical Water Metrics Matrix
function HistoricalWaterMetricsMatrixRenderer({ config, value, onChange, isEditing, historicalData = null }) {
  const tableConfig = config.table_config || {};
  const sections = tableConfig.sections || [];
  const columns = tableConfig.columns || [];
  
  const data = value || {};
  
  const handleChange = (rowKey, colKey, val) => {
    const newData = { ...data };
    if (!newData[rowKey]) newData[rowKey] = {};
    newData[rowKey][colKey] = val;
    onChange(newData);
  };
  
  const renderTable = (section, bgClass = 'bg-blue-50') => (
    <div key={section.title} className="overflow-x-auto">
      <h4 className={`text-xs font-semibold text-blue-700 mb-2 ${bgClass} p-2 rounded`}>{section.title}</h4>
      <Table>
        <TableHeader>
          <TableRow className={bgClass}>
            <TableHead className="text-xs font-medium">Parameter</TableHead>
            {columns.map((col) => (
              <TableHead key={col.key} className={`text-xs font-medium text-center ${col.historical_autofill ? 'bg-amber-50' : ''}`}>
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {section.rows.map((row) => (
            <TableRow key={row.key} className={row.is_total ? 'bg-blue-100 font-semibold' : ''}>
              <TableCell className="text-xs">{row.label}</TableCell>
              {columns.map((col) => (
                <TableCell key={col.key} className="p-1">
                  {isEditing ? (
                    <Input
                      type="number"
                      value={data[row.key]?.[col.key] ?? ''}
                      onChange={(e) => handleChange(row.key, col.key, parseFloat(e.target.value) || 0)}
                      className={`h-8 text-xs text-center ${col.historical_autofill ? 'bg-amber-50' : ''}`}
                      step="0.01"
                      min="0"
                      disabled={col.historical_autofill}
                    />
                  ) : (
                    <span className="text-xs">{data[row.key]?.[col.key] ?? '-'}</span>
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
  
  return <div className="mt-2 space-y-4">{sections.map((s) => renderTable(s))}</div>;
}

// Q78 - Historical Water Discharge Matrix
function HistoricalWaterDischargeMatrixRenderer({ config, value, onChange, isEditing, historicalData = null }) {
  const tableConfig = config.table_config || {};
  const destinations = tableConfig.destinations || [];
  const treatmentTypes = tableConfig.treatment_types || [];
  const totalRow = tableConfig.total_row || {};
  const columns = tableConfig.columns || [];
  
  const data = value || {};
  
  const handleChange = (destKey, treatmentKey, colKey, val) => {
    const key = `${destKey}_${treatmentKey}`;
    const newData = { ...data };
    if (!newData[key]) newData[key] = {};
    newData[key][colKey] = val;
    onChange(newData);
  };
  
  const handleTreatmentLevelChange = (destKey, val) => {
    const key = `${destKey}_treatment_level`;
    onChange({ ...data, [key]: val });
  };
  
  if (!isEditing) {
    return (
      <div className="mt-2 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-blue-50">
              <TableHead className="text-xs font-medium">Destination</TableHead>
              <TableHead className="text-xs font-medium">Treatment</TableHead>
              {columns.map((col) => (
                <TableHead key={col.key} className="text-xs font-medium text-center">{col.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {destinations.map((dest) => (
              treatmentTypes.map((tt, idx) => (
                <TableRow key={`${dest.key}_${tt.key}`}>
                  {idx === 0 && <TableCell rowSpan={treatmentTypes.length} className="text-xs font-medium border-r">{dest.label}</TableCell>}
                  <TableCell className="text-xs">
                    {tt.label}
                    {tt.has_text_input && data[`${dest.key}_treatment_level`] && ` (${data[`${dest.key}_treatment_level`]})`}
                  </TableCell>
                  {columns.map((col) => (
                    <TableCell key={col.key} className="text-xs text-center">
                      {data[`${dest.key}_${tt.key}`]?.[col.key] ?? '-'}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ))}
            <TableRow className="bg-blue-100 font-semibold">
              <TableCell colSpan={2} className="text-xs">{totalRow.label}</TableCell>
              {columns.map((col) => (
                <TableCell key={col.key} className="text-xs text-center">
                  {data[totalRow.key]?.[col.key] ?? '-'}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }
  
  return (
    <div className="mt-2 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-blue-50">
            <TableHead className="text-xs font-medium">Destination</TableHead>
            <TableHead className="text-xs font-medium">Treatment</TableHead>
            {columns.map((col) => (
              <TableHead key={col.key} className={`text-xs font-medium text-center ${col.historical_autofill ? 'bg-amber-50' : ''}`}>{col.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {destinations.map((dest) => (
            treatmentTypes.map((tt, idx) => (
              <TableRow key={`${dest.key}_${tt.key}`}>
                {idx === 0 && <TableCell rowSpan={treatmentTypes.length} className="text-xs font-medium border-r bg-stone-50">{dest.label}</TableCell>}
                <TableCell className="text-xs">
                  {tt.label}
                  {tt.has_text_input && (
                    <Input
                      value={data[`${dest.key}_treatment_level`] || ''}
                      onChange={(e) => handleTreatmentLevelChange(dest.key, e.target.value)}
                      placeholder="Specify level"
                      className="h-6 text-xs mt-1"
                    />
                  )}
                </TableCell>
                {columns.map((col) => (
                  <TableCell key={col.key} className="p-1">
                    <Input
                      type="number"
                      value={data[`${dest.key}_${tt.key}`]?.[col.key] ?? ''}
                      onChange={(e) => handleChange(dest.key, tt.key, col.key, parseFloat(e.target.value) || 0)}
                      className={`h-8 text-xs text-center ${col.historical_autofill ? 'bg-amber-50' : ''}`}
                      min="0"
                      disabled={col.historical_autofill}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ))}
          <TableRow className="bg-blue-100">
            <TableCell colSpan={2} className="text-xs font-semibold">{totalRow.label}</TableCell>
            {columns.map((col) => (
              <TableCell key={col.key} className="p-1">
                <Input
                  type="number"
                  value={data[totalRow.key]?.[col.key] ?? ''}
                  onChange={(e) => {
                    const newData = { ...data };
                    if (!newData[totalRow.key]) newData[totalRow.key] = {};
                    newData[totalRow.key][col.key] = parseFloat(e.target.value) || 0;
                    onChange(newData);
                  }}
                  className={`h-8 text-xs text-center font-semibold ${col.historical_autofill ? 'bg-amber-50' : ''}`}
                  min="0"
                  disabled={col.historical_autofill}
                />
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

// Q79, Q82 - Yes/No with Description

// Q80 - Historical Emissions Table (Air Emissions)
function HistoricalEmissionsTableRenderer({ config, value, onChange, isEditing, historicalData = null }) {
  const tableConfig = config.table_config || {};
  const rows = tableConfig.rows || [];
  const columns = tableConfig.columns || [];
  
  const data = value || {};
  
  const handleChange = (rowKey, colKey, val) => {
    const newData = { ...data };
    if (!newData[rowKey]) newData[rowKey] = {};
    newData[rowKey][colKey] = val;
    onChange(newData);
  };
  
  const handleSpecifyChange = (rowKey, val) => {
    onChange({ ...data, [`${rowKey}_specify`]: val });
  };
  
  if (!isEditing) {
    return (
      <div className="mt-2 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-stone-50">
              <TableHead className="text-xs font-medium">Parameter</TableHead>
              {columns.map((col) => (
                <TableHead key={col.key} className="text-xs font-medium text-center">{col.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="text-xs">
                  {row.label}
                  {row.has_specify_field && data[`${row.key}_specify`] && ` (${data[`${row.key}_specify`]})`}
                </TableCell>
                {columns.map((col) => (
                  <TableCell key={col.key} className="text-xs text-center">
                    {data[row.key]?.[col.key] ?? '-'}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }
  
  return (
    <div className="mt-2 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-violet-50">
            <TableHead className="text-xs font-medium">Parameter</TableHead>
            {columns.map((col) => (
              <TableHead key={col.key} className={`text-xs font-medium text-center ${col.historical_autofill ? 'bg-amber-50' : ''}`}>{col.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="text-xs">
                {row.label}
                {row.has_specify_field && (
                  <Input
                    value={data[`${row.key}_specify`] || ''}
                    onChange={(e) => handleSpecifyChange(row.key, e.target.value)}
                    placeholder="Specify parameter"
                    className="h-6 text-xs mt-1"
                  />
                )}
              </TableCell>
              {columns.map((col) => (
                <TableCell key={col.key} className="p-1">
                  {col.type === 'text' ? (
                    <Input
                      value={data[row.key]?.[col.key] || ''}
                      onChange={(e) => handleChange(row.key, col.key, e.target.value)}
                      className="h-8 text-xs"
                      placeholder="Unit"
                    />
                  ) : (
                    <Input
                      type="number"
                      value={data[row.key]?.[col.key] ?? ''}
                      onChange={(e) => handleChange(row.key, col.key, parseFloat(e.target.value) || 0)}
                      className={`h-8 text-xs text-center ${col.historical_autofill ? 'bg-amber-50' : ''}`}
                      min="0"
                      disabled={col.historical_autofill}
                    />
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Q81 - Linked GHG Metrics Matrix (Read-only, synced with GHG module)
function LinkedGHGMetricsMatrixRenderer({ config, value, onChange, isEditing }) {
  const linkedConfig = config.linked_config || {};
  const rows = linkedConfig.rows || [];
  const columns = linkedConfig.columns || [];
  const isReadOnly = linkedConfig.read_only;
  
  const data = value || {};
  
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 mb-2 p-2 bg-blue-50 rounded text-xs text-blue-700">
        <AlertCircle className="w-4 h-4" />
        <span>Data linked from GHG Emissions module. {isReadOnly ? 'Values are read-only.' : ''}</span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-blue-50">
              <TableHead className="text-xs font-medium">Parameter</TableHead>
              {columns.map((col) => (
                <TableHead key={col.key} className="text-xs font-medium text-center">{col.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key} className={row.source === 'manual' ? '' : 'bg-blue-50/50'}>
                <TableCell className="text-xs font-medium">{row.label}</TableCell>
                {columns.map((col) => (
                  <TableCell key={col.key} className="p-1">
                    {isEditing && row.source === 'manual' ? (
                      <Input
                        type={col.type === 'text' ? 'text' : 'number'}
                        value={data[row.key]?.[col.key] ?? ''}
                        onChange={(e) => {
                          const newData = { ...data };
                          if (!newData[row.key]) newData[row.key] = {};
                          newData[row.key][col.key] = col.type === 'text' ? e.target.value : parseFloat(e.target.value) || 0;
                          onChange(newData);
                        }}
                        className="h-8 text-xs text-center"
                      />
                    ) : (
                      <span className="text-xs text-center block">{data[row.key]?.[col.key] ?? (row.source !== 'manual' ? 'Linked' : '-')}</span>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Q83 - Historical Waste Management Master Matrix
function HistoricalWasteManagementMasterMatrixRenderer({ config, value, onChange, isEditing, historicalData = null }) {
  const tableConfig = config.table_config || {};
  const sections = tableConfig.sections || [];
  const columns = tableConfig.columns || [];
  
  const data = value || {};
  
  const handleChange = (sectionKey, rowKey, colKey, val) => {
    const key = `${sectionKey}_${rowKey}`;
    const newData = { ...data };
    if (!newData[key]) newData[key] = {};
    newData[key][colKey] = val;
    onChange(newData);
  };
  
  const handleCategoryChange = (sectionKey, rowKey, val) => {
    onChange({ ...data, [`${sectionKey}_${rowKey}_category`]: val });
  };
  
  const renderSection = (section) => (
    <div key={section.key} className="mb-4">
      <h4 className="text-xs font-semibold text-orange-700 mb-2 bg-orange-50 p-2 rounded">{section.title}</h4>
      <Table>
        <TableHeader>
          <TableRow className="bg-orange-50">
            <TableHead className="text-xs font-medium">Parameter</TableHead>
            {section.rows.some(r => r.has_category) && <TableHead className="text-xs font-medium">Category</TableHead>}
            {columns.map((col) => (
              <TableHead key={col.key} className={`text-xs font-medium text-center ${col.historical_autofill ? 'bg-amber-50' : ''}`}>{col.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {section.rows.map((row) => (
            <TableRow key={row.key} className={row.is_total ? 'bg-orange-100 font-semibold' : ''}>
              <TableCell className="text-xs">{row.label}</TableCell>
              {section.rows.some(r => r.has_category) && (
                <TableCell className="p-1">
                  {row.has_category && isEditing ? (
                    <Input
                      value={data[`${section.key}_${row.key}_category`] || ''}
                      onChange={(e) => handleCategoryChange(section.key, row.key, e.target.value)}
                      placeholder="Category"
                      className="h-8 text-xs"
                    />
                  ) : row.has_category ? (
                    <span className="text-xs">{data[`${section.key}_${row.key}_category`] || '-'}</span>
                  ) : null}
                </TableCell>
              )}
              {columns.map((col) => (
                <TableCell key={col.key} className="p-1">
                  {isEditing ? (
                    <Input
                      type="number"
                      value={data[`${section.key}_${row.key}`]?.[col.key] ?? ''}
                      onChange={(e) => handleChange(section.key, row.key, col.key, parseFloat(e.target.value) || 0)}
                      className={`h-8 text-xs text-center ${col.historical_autofill ? 'bg-amber-50' : ''}`}
                      min="0"
                      disabled={col.historical_autofill}
                    />
                  ) : (
                    <span className="text-xs text-center block">{data[`${section.key}_${row.key}`]?.[col.key] ?? '-'}</span>
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
  
  return <div className="mt-2 space-y-4">{sections.map(renderSection)}</div>;
}

// Q84, Q90, Q93 - Long Text Response

// Q88 - Historical Water Stress Matrix (reuses water metrics)
function HistoricalWaterStressMatrixRenderer({ config, value, onChange, isEditing, historicalData = null }) {
  return <HistoricalWaterMetricsMatrixRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} historicalData={historicalData} />;
}

// Q89 - Linked Scope 3 Metrics Matrix (reuses GHG matrix)
function LinkedScope3MetricsMatrixRenderer({ config, value, onChange, isEditing }) {
  return <LinkedGHGMetricsMatrixRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;
}

// Q92 - Text with Optional Weblink
function TextWithOptionalWeblinkRenderer({ config, value, onChange, isEditing }) {
  const textConfig = config.text_config || {};
  const data = value || { text: '', weblink: '' };
  
  if (!isEditing) {
    return (
      <div className="mt-2 space-y-2">
        <p className="text-sm text-text-secondary whitespace-pre-wrap">{data.text || '-'}</p>
        {data.weblink && (
          <a href={data.weblink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline block">
            {data.weblink}
          </a>
        )}
      </div>
    );
  }
  
  return (
    <div className="mt-2 space-y-3">
      <div>
        <Textarea
          value={data.text || ''}
          onChange={(e) => onChange({ ...data, text: e.target.value })}
          placeholder={textConfig.placeholder || 'Enter response...'}
          rows={3}
        />
        {textConfig.max_words && <p className="text-xs text-text-muted mt-1">Max {textConfig.max_words} words</p>}
      </div>
      {textConfig.weblink_optional && (
        <div>
          <Label className="text-xs">{textConfig.weblink_label || 'Web Link (optional)'}</Label>
          <Input
            type="url"
            value={data.weblink || ''}
            onChange={(e) => onChange({ ...data, weblink: e.target.value })}
            placeholder="https://..."
            className="mt-1"
          />
        </div>
      )}
    </div>
  );
}

// Q94 - Percentage with Description
function PercentageWithDescriptionRenderer({ config, value, onChange, isEditing }) {
  const percentageConfig = config.percentage_config || {};
  const descField = percentageConfig.description_field || {};
  const data = value || { percentage: '', description: '' };
  
  if (!isEditing) {
    return (
      <div className="mt-2 space-y-2">
        <p className="text-sm font-medium">{data.percentage !== '' ? `${data.percentage}%` : '-'}</p>
        {descField.key && (
          <div>
            <p className="text-xs font-medium text-text-muted">{descField.label}</p>
            <p className="text-xs text-text-secondary">{data.description || '-'}</p>
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div className="mt-2 space-y-3">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={data.percentage ?? ''}
          onChange={(e) => onChange({ ...data, percentage: parseFloat(e.target.value) || 0 })}
          min={percentageConfig.min || 0}
          max={percentageConfig.max || 100}
          step="0.1"
          className="w-24"
          placeholder="0"
        />
        <span className="text-sm">{percentageConfig.suffix || '%'}</span>
      </div>
      {descField.key && (
        <div>
          <Label className="text-xs">{descField.label}{descField.required && <span className="text-red-500 ml-1">*</span>}</Label>
          <Textarea
            value={data.description || ''}
            onChange={(e) => onChange({ ...data, description: e.target.value })}
            placeholder={descField.label}
            rows={2}
            className="mt-1"
          />
        </div>
      )}
    </div>
  );
}

// Main ESG Questionnaire Component
export default function ESGQuestionnaire({ 
  framework = 'BRSR', 
  section, 
  isEditing = false,
  reportingYear: externalReportingYear = null,
  filterPrinciples = null,
  excludePrinciples = null,
  yearType = 'financial_year'  // Organization's reporting year type
}) {
  const { getAuthHeader } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Determine effective year type (BRSR forces FY unless explicitly configured otherwise)
  const effectiveYearType = getEffectiveYearType(yearType, framework);
  
  // Generate year options based on effective year type
  const yearOptions = generateReportingYears(effectiveYearType, 5);
  
  // Use external reporting year if provided, otherwise manage internally
  const [internalReportingYear, setInternalReportingYear] = useState(() => getCurrentReportingYear(effectiveYearType));
  const reportingYear = externalReportingYear || internalReportingYear;
  const setReportingYear = setInternalReportingYear;
  const [configs, setConfigs] = useState([]);
  const [responses, setResponses] = useState({});
  const [summary, setSummary] = useState(null);
  const [historicalData, setHistoricalData] = useState(null);
  const [questionStatuses, setQuestionStatuses] = useState({});
  const [questionVersions, setQuestionVersions] = useState({});

  useEffect(() => {
    fetchData();
  }, [framework, section, reportingYear, filterPrinciples, excludePrinciples]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch question configs
      const configsRes = await axios.get(
        `${API}/esg-questionnaire/configs`,
        { params: { framework, section }, headers: getAuthHeader() }
      );
      let fetchedConfigs = configsRes.data.configs || [];
      
      // Filter by principles if specified
      if (filterPrinciples && filterPrinciples.length > 0) {
        fetchedConfigs = fetchedConfigs.filter(c => filterPrinciples.includes(c.principle));
      }
      // Exclude principles if specified
      if (excludePrinciples && excludePrinciples.length > 0) {
        fetchedConfigs = fetchedConfigs.filter(c => !excludePrinciples.includes(c.principle));
      }
      
      setConfigs(fetchedConfigs);

      // Fetch existing responses
      const responsesRes = await axios.get(
        `${API}/esg-questionnaire/responses/${framework}/${section}/${reportingYear}`,
        { headers: getAuthHeader() }
      );
      // Normalize responses at the boundary - strip FY suffixes so renderers get clean data
      const rawResponses = responsesRes.data.responses || {};
      const allResponses = normalizeAllResponses(rawResponses);
      setResponses(allResponses);

      // Fetch question statuses (approval status + version history)
      try {
        const statusesRes = await axios.get(
          `${API}/esg-questionnaire/responses/${framework}/${section}/${reportingYear}/statuses`,
          { headers: getAuthHeader() }
        );
        setQuestionStatuses(statusesRes.data.statuses || {});
        setQuestionVersions(statusesRes.data.versions || {});
      } catch (err) {
        console.warn('Failed to fetch question statuses:', err);
        setQuestionStatuses({});
        setQuestionVersions({});
      }

      // Calculate filtered summary based on filtered configs
      const filteredQuestionIds = fetchedConfigs.map(c => c.question_key);
      const answeredCount = filteredQuestionIds.filter(qid => allResponses[qid] !== undefined && allResponses[qid] !== null && allResponses[qid] !== '').length;
      setSummary({
        total_questions: fetchedConfigs.length,
        answered_questions: answeredCount,
        completion_percentage: fetchedConfigs.length > 0 ? Math.round((answeredCount / fetchedConfigs.length) * 100) : 0
      });

      // Fetch historical data for autofill (includes previous year AND next year for backward fill)
      try {
        const historicalRes = await axios.get(
          `${API}/esg-questionnaire/responses/${framework}/${section}/${reportingYear}/multi-year`,
          { headers: getAuthHeader() }
        );
        // Transform multi-year response to historicalData format expected by renderers
        setHistoricalData({
          previous_year: historicalRes.data.previous_year,
          previous_responses: historicalRes.data.previous_year_data,
          next_year: historicalRes.data.next_year,
          next_year_data: historicalRes.data.next_year_data,
          has_previous_data: historicalRes.data.has_previous_data,
          has_next_year_data: historicalRes.data.has_next_year_data,
        });
      } catch (err) {
        console.log('No historical data available:', err.message);
        setHistoricalData(null);
      }
    } catch (error) {
      console.error('Failed to fetch ESG data:', error);
      setConfigs([]);
      setResponses({});
    } finally {
      setLoading(false);
    }
  };

  const handleResponseChange = (questionKey, value) => {
    setResponses(prev => ({ ...prev, [questionKey]: value }));
  };

  // Question-level save (saves only the specified question)
  const saveQuestion = async (questionKey, value, status = 'saved') => {
    try {
      await axios.post(
        `${API}/esg-questionnaire/response`,
        { 
          question_key: questionKey, 
          value, 
          reporting_period: reportingYear,
          status 
        },
        { headers: getAuthHeader() }
      );
      toast.success(status === 'draft' ? 'Draft saved' : 'Question saved');
      // Refresh statuses after save
      try {
        const statusesRes = await axios.get(
          `${API}/esg-questionnaire/responses/${framework}/${section}/${reportingYear}/statuses`,
          { headers: getAuthHeader() }
        );
        setQuestionStatuses(statusesRes.data.statuses || {});
        setQuestionVersions(statusesRes.data.versions || {});
      } catch (err) {
        console.warn('Failed to refresh statuses:', err);
      }
    } catch (error) {
      console.error('Save question error:', error);
      toast.error('Failed to save question');
    }
  };

  // Fetch version history for a specific question
  const fetchVersionHistory = async (questionKey) => {
    try {
      const res = await axios.get(
        `${API}/esg-questionnaire/history/${questionKey}`,
        { 
          params: { reporting_period: reportingYear },
          headers: getAuthHeader() 
        }
      );
      setQuestionVersions(prev => ({
        ...prev,
        [questionKey]: res.data.history || []
      }));
      return res.data.history || [];
    } catch (error) {
      console.error('Failed to fetch version history:', error);
      return [];
    }
  };

  const saveResponses = async () => {
    setSaving(true);
    try {
      await axios.put(
        `${API}/esg-questionnaire/responses/${framework}/${section}/${reportingYear}`,
        { responses },
        { headers: getAuthHeader() }
      );
      toast.success(`${section} responses saved for ${reportingYear}`);
      fetchData();
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save responses');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-text-muted">Loading questionnaire...</span>
      </div>
    );
  }

  // Group questions by 'group' field
  const groupedQuestions = configs.reduce((acc, config) => {
    const group = config.group || 'General';
    if (!acc[group]) acc[group] = [];
    acc[group].push(config);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-stone-50 rounded-lg border">
        <div className="flex items-center gap-4">
          <div>
            <Badge variant="outline" className="mb-1">{framework}</Badge>
            <p className="text-sm text-text-muted">
              {configs.length} questions in {section}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!externalReportingYear && (
              <>
                <Label className="text-sm">Reporting Year:</Label>
                {isEditing ? (
                  <Select value={reportingYear} onValueChange={setReportingYear}>
                    <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {yearOptions.map(year => (
                        <SelectItem key={year} value={year}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline">{reportingYear}</Badge>
                )}
              </>
            )}
          </div>
        </div>
        {summary && (
          <div className="flex items-center gap-2">
            {summary.completion_percentage === 100 ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-500" />
            )}
            <span className="text-sm font-medium">
              {summary.answered_questions}/{summary.total_questions} answered ({summary.completion_percentage}%)
            </span>
          </div>
        )}
      </div>

      {/* Questions */}
      {configs.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <p>No questions configured for {framework} / {section}</p>
          <p className="text-sm mt-1">Questions can be added via the API</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedQuestions).map(([group, questions]) => (
            <div key={group} className="border rounded-lg bg-white">
              {group !== 'General' && (
                <div className="px-4 py-3 bg-stone-50 border-b rounded-t-lg">
                  <h3 className="font-medium text-sm">{group}</h3>
                </div>
              )}
              <div className="p-4">
                {questions.map((config) => (
                  <QuestionRenderer
                    key={config.question_key}
                    config={config}
                    value={responses[config.question_key]}
                    onChange={(val) => handleResponseChange(config.question_key, val)}
                    isEditing={isEditing}
                    allResponses={{ 
                      ...responses, 
                      reporting_year: reportingYear,
                      year_type: effectiveYearType,
                      framework: framework
                    }}
                    historicalData={historicalData}
                    approvalStatus={questionStatuses[config.question_key]}
                    versionHistory={questionVersions[config.question_key]}
                    onSaveQuestion={saveQuestion}
                    onFetchVersionHistory={() => fetchVersionHistory(config.question_key)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save Button */}
      {isEditing && configs.length > 0 && (
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={saveResponses} disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : <><Save className="w-4 h-4 mr-2" /> Save Responses</>}
          </Button>
        </div>
      )}
    </div>
  );
}
