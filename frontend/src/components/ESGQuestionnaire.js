import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
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
  HelpCircle
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Generate reporting year options
const generateReportingYears = () => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = 0; i < 5; i++) {
    const startYear = currentYear - i;
    years.push(`${startYear}-${(startYear + 1).toString().slice(-2)}`);
  }
  return years;
};

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

// Individual Question Renderer
function QuestionRenderer({ config, value, onChange, isEditing, allResponses = {} }) {
  const { type, question, description, placeholder, options, table_columns, required, conditional } = config;

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

  const renderInput = () => {
    switch (type) {
      case 'text':
        return isEditing ? (
          <Input
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || 'Enter response'}
            className="mt-2"
          />
        ) : (
          <p className="text-sm text-text-secondary mt-2">{value || '-'}</p>
        );

      case 'textarea':
        return isEditing ? (
          <Textarea
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || 'Enter detailed response'}
            rows={3}
            className="mt-2"
          />
        ) : (
          <p className="text-sm text-text-secondary mt-2 whitespace-pre-wrap">{value || '-'}</p>
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

      default:
        return <p className="text-sm text-red-500 mt-2">Unknown question type: {type}</p>;
    }
  };

  return (
    <div className="py-4 border-b border-stone-100 last:border-b-0">
      <div className="flex items-start gap-2">
        <Label className="text-sm font-medium text-text-primary">
          {question}
          {required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        {description && (
          <HelpCircle className="w-4 h-4 text-text-muted flex-shrink-0" title={description} />
        )}
      </div>
      {description && <p className="text-xs text-text-muted mt-1">{description}</p>}
      {renderInput()}
    </div>
  );
}

// P1-P9 Principle Toggle Renderer (with optional inline reasons when No)
function PrincipleToggleRenderer({ value, onChange, isEditing, config = {} }) {
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
function FixedRowTableRenderer({ config, value, onChange, isEditing }) {
  const tableConfig = config.table_config || {};
  const columns = tableConfig.columns || [];
  const fixedRows = tableConfig.fixed_rows || [];
  const data = value || {};

  const handleCellChange = (rowKey, colKey, val) => {
    const newData = { ...data };
    if (!newData[rowKey]) newData[rowKey] = {};
    newData[rowKey][colKey] = val;
    onChange(newData);
  };

  const renderCell = (col, rowKey, cellValue) => {
    if (!isEditing) return <span className="text-sm">{cellValue ?? '-'}</span>;
    
    if (col.type === 'number' || col.type === 'percentage') {
      return (
        <Input
          type="number"
          value={cellValue ?? ''}
          onChange={(e) => handleCellChange(rowKey, col.key, e.target.value)}
          placeholder={col.type === 'percentage' ? '%' : '0'}
          className="h-8 text-sm"
        />
      );
    }
    if (col.type === 'textarea') {
      return (
        <Textarea
          value={cellValue ?? ''}
          onChange={(e) => handleCellChange(rowKey, col.key, e.target.value)}
          placeholder={col.label}
          rows={2}
          className="text-sm"
        />
      );
    }
    return (
      <Input
        value={cellValue ?? ''}
        onChange={(e) => handleCellChange(rowKey, col.key, e.target.value)}
        placeholder={col.label}
        className="h-8 text-sm"
      />
    );
  };

  return (
    <div className="mt-2 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-stone-50">
            <TableHead className="text-xs font-medium w-40">Segment</TableHead>
            {columns.map(col => (
              <TableHead key={col.key} className="text-xs font-medium">{col.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {fixedRows.map(row => (
            <TableRow key={row.key}>
              <TableCell className="font-medium text-sm">{row.label}</TableCell>
              {columns.map(col => (
                <TableCell key={col.key} className="p-1">
                  {renderCell(col, row.key, data[row.key]?.[col.key])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

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
function ConditionalYesNoTextRenderer({ config, value, onChange, isEditing }) {
  const data = value || { has_value: false, fields: {} };
  const fields = config.conditional_fields || [{ key: 'details', label: 'Details', type: 'textarea' }];

  const handleToggle = (val) => {
    onChange({ ...data, has_value: val });
  };

  const handleFieldChange = (key, val) => {
    onChange({ ...data, fields: { ...data.fields, [key]: val } });
  };

  if (!isEditing) {
    return (
      <div className="mt-2 space-y-2">
        <Badge variant="outline" className={data.has_value ? 'bg-green-50 text-green-700' : ''}>{data.has_value ? 'Yes' : 'No'}</Badge>
        {data.has_value && fields.map(f => (
          <div key={f.key} className="text-sm">
            <span className="text-text-muted">{f.label}:</span> {data.fields?.[f.key] || '-'}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <RadioGroup value={data.has_value ? 'yes' : 'no'} onValueChange={(v) => handleToggle(v === 'yes')} className="flex gap-4">
        <div className="flex items-center gap-2">
          <RadioGroupItem value="yes" id={`${config.question_key}-yes`} />
          <Label htmlFor={`${config.question_key}-yes`} className="text-sm">Yes</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="no" id={`${config.question_key}-no`} />
          <Label htmlFor={`${config.question_key}-no`} className="text-sm">No</Label>
        </div>
      </RadioGroup>
      {data.has_value && (
        <div className="bg-stone-50 p-4 rounded-lg space-y-3">
          {fields.map(f => (
            <div key={f.key}>
              <Label className="text-sm mb-1 block">{f.label}</Label>
              {f.type === 'url' ? (
                <Input type="url" value={data.fields?.[f.key] || ''} onChange={(e) => handleFieldChange(f.key, e.target.value)} placeholder="https://..." className="text-sm" />
              ) : (
                <Textarea value={data.fields?.[f.key] || ''} onChange={(e) => handleFieldChange(f.key, e.target.value)} placeholder={f.label} rows={2} className="text-sm" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// FY Comparison Table Renderer (Current/Previous FY with fixed rows)
function FYComparisonTableRenderer({ config, value, onChange, isEditing }) {
  const tableConfig = config.table_config || {};
  const fixedRows = tableConfig.fixed_rows || [];
  const columns = tableConfig.columns || [
    { key: 'current_fy', label: 'Current FY', type: 'number' },
    { key: 'previous_fy', label: 'Previous FY', type: 'number' }
  ];
  const data = value || {};

  const handleCellChange = (rowKey, colKey, val) => {
    const newData = { ...data };
    if (!newData[rowKey]) newData[rowKey] = {};
    newData[rowKey][colKey] = val;
    onChange(newData);
  };

  // Simple single-row mode (no fixed rows)
  if (fixedRows.length === 0) {
    return (
      <div className="mt-2 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-stone-50">
              {columns.map(col => (
                <TableHead key={col.key} className="text-xs font-medium">{col.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              {columns.map(col => (
                <TableCell key={col.key} className="p-1">
                  {!isEditing ? (
                    <span className="text-sm">{data[col.key] ?? '-'}</span>
                  ) : (
                    <Input
                      type="number"
                      value={data[col.key] ?? ''}
                      onChange={(e) => onChange({ ...data, [col.key]: e.target.value })}
                      className="h-8 text-sm"
                    />
                  )}
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
          <TableRow className="bg-stone-50">
            <TableHead className="text-xs font-medium w-48">Category</TableHead>
            {columns.map(col => (
              <TableHead key={col.key} className="text-xs font-medium">{col.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {fixedRows.map(row => (
            <TableRow key={row.key}>
              <TableCell className="font-medium text-sm">{row.label}</TableCell>
              {columns.map(col => (
                <TableCell key={col.key} className="p-1">
                  {!isEditing ? (
                    <span className="text-sm">{data[row.key]?.[col.key] ?? '-'}</span>
                  ) : col.type === 'textarea' ? (
                    <Textarea value={data[row.key]?.[col.key] ?? ''} onChange={(e) => handleCellChange(row.key, col.key, e.target.value)} rows={1} className="text-sm" />
                  ) : (
                    <Input
                      type={col.type === 'number' ? 'number' : 'text'}
                      value={data[row.key]?.[col.key] ?? ''}
                      onChange={(e) => handleCellChange(row.key, col.key, e.target.value)}
                      className="h-8 text-sm"
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

// Grouped Matrix Table Renderer (grouped rows with FY columns)
function GroupedMatrixTableRenderer({ config, value, onChange, isEditing }) {
  const tableConfig = config.table_config || {};
  const groups = tableConfig.groups || [];
  const columns = tableConfig.columns || [
    { key: 'current_fy', label: 'Current FY' },
    { key: 'previous_fy', label: 'Previous FY' }
  ];
  const data = value || {};

  const handleCellChange = (groupKey, rowKey, colKey, val) => {
    const newData = { ...data };
    if (!newData[groupKey]) newData[groupKey] = {};
    if (!newData[groupKey][rowKey]) newData[groupKey][rowKey] = {};
    newData[groupKey][rowKey][colKey] = val;
    onChange(newData);
  };

  return (
    <div className="mt-2 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-stone-50">
            <TableHead className="text-xs font-medium w-64">Parameter</TableHead>
            <TableHead className="text-xs font-medium w-80">Metrics</TableHead>
            {columns.map(col => (
              <TableHead key={col.key} className="text-xs font-medium">{col.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map(group => (
            group.rows.map((row, rowIdx) => (
              <TableRow key={`${group.key}-${row.key}`} className={rowIdx === 0 ? 'border-t-2' : ''}>
                {rowIdx === 0 && (
                  <TableCell rowSpan={group.rows.length} className="font-medium text-sm align-top bg-stone-50/50">
                    {group.label}
                  </TableCell>
                )}
                <TableCell className="text-sm">{row.label}</TableCell>
                {columns.map(col => (
                  <TableCell key={col.key} className="p-1">
                    {!isEditing ? (
                      <span className="text-sm">{data[group.key]?.[row.key]?.[col.key] ?? '-'}</span>
                    ) : (
                      <Input
                        type="text"
                        value={data[group.key]?.[row.key]?.[col.key] ?? ''}
                        onChange={(e) => handleCellChange(group.key, row.key, col.key, e.target.value)}
                        className="h-8 text-sm"
                      />
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

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

// Main ESG Questionnaire Component
export default function ESGQuestionnaire({ 
  framework = 'BRSR', 
  section, 
  isEditing = false 
}) {
  const { getAuthHeader } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reportingYear, setReportingYear] = useState(generateReportingYears()[0]);
  const [configs, setConfigs] = useState([]);
  const [responses, setResponses] = useState({});
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    fetchData();
  }, [framework, section, reportingYear]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch question configs
      const configsRes = await axios.get(
        `${API}/esg-questionnaire/configs`,
        { params: { framework, section }, headers: getAuthHeader() }
      );
      setConfigs(configsRes.data.configs || []);

      // Fetch existing responses
      const responsesRes = await axios.get(
        `${API}/esg-questionnaire/responses/${framework}/${section}/${reportingYear}`,
        { headers: getAuthHeader() }
      );
      setResponses(responsesRes.data.responses || {});

      // Fetch summary
      const summaryRes = await axios.get(
        `${API}/esg-questionnaire/responses/${framework}/${section}/${reportingYear}/summary`,
        { headers: getAuthHeader() }
      );
      setSummary(summaryRes.data);
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
            <Label className="text-sm">Reporting Year:</Label>
            {isEditing ? (
              <Select value={reportingYear} onValueChange={setReportingYear}>
                <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {generateReportingYears().map(year => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline">{reportingYear}</Badge>
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
                    allResponses={responses}
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
