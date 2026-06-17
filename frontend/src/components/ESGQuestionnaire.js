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
function QuestionRenderer({ config, value, onChange, isEditing }) {
  const { type, question, description, placeholder, options, table_columns, required } = config;

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
        return <PrincipleToggleRenderer value={value} onChange={onChange} isEditing={isEditing} />;

      case 'principle_text':
        return <PrincipleTextRenderer value={value} onChange={onChange} isEditing={isEditing} config={config} />;

      case 'conditional_yes_no_table':
        return <ConditionalYesNoTableRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

      case 'principle_mode_table':
        return <PrincipleModeTableRenderer config={config} value={value} onChange={onChange} isEditing={isEditing} />;

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

// P1-P9 Principle Toggle Renderer
function PrincipleToggleRenderer({ value, onChange, isEditing }) {
  const data = value || { mode: 'all_together', all_enabled: null, all_description: '', principles: {} };

  const handleModeChange = (newMode) => {
    onChange({ ...data, mode: newMode });
  };

  const handleAllChange = (field, val) => {
    onChange({ ...data, [field]: val });
  };

  const handlePrincipleChange = (key, field, val) => {
    const principles = { ...data.principles };
    if (!principles[key]) principles[key] = { enabled: false, description: '' };
    principles[key][field] = val;
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
            <p className="text-sm"><strong>Applicable:</strong> {data.all_enabled ? 'Yes' : 'No'}</p>
            <p className="text-sm"><strong>Description:</strong> {data.all_description || '-'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {NGRBC_PRINCIPLES.map((p) => (
              <div key={p.key} className="bg-stone-50 p-2 rounded text-sm">
                <strong>{p.key}:</strong> {data.principles?.[p.key]?.enabled ? 'Yes' : 'No'} 
                {data.principles?.[p.key]?.description && ` - ${data.principles[p.key].description}`}
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
          {NGRBC_PRINCIPLES.map((p) => (
            <div key={p.key} className="bg-stone-50 p-3 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-medium text-sm">{p.key}</span>
                  <span className="text-xs text-text-muted ml-2">{p.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={data.principles?.[p.key]?.enabled || false}
                    onCheckedChange={(v) => handlePrincipleChange(p.key, 'enabled', v)}
                  />
                  <span className="text-xs">{data.principles?.[p.key]?.enabled ? 'Yes' : 'No'}</span>
                </div>
              </div>
              <Textarea
                value={data.principles?.[p.key]?.description || ''}
                onChange={(e) => handlePrincipleChange(p.key, 'description', e.target.value)}
                placeholder={`Description for ${p.key}...`}
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
