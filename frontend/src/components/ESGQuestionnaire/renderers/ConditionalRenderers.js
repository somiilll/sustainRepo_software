import React from 'react';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import { RadioGroup, RadioGroupItem } from '../../ui/radio-group';

export function ConditionalYesNoTextRenderer({ config, value, onChange, isEditing }) {
  const data = value || { has_value: null, fields: {} };
  const fields = config.conditional_fields || [{ key: 'details', label: 'Details', type: 'textarea' }];

  const handleToggle = (val) => {
    onChange({ ...data, has_value: val });
  };

  const handleFieldChange = (key, val) => {
    onChange({ ...data, fields: { ...data.fields, [key]: val } });
  };

  const getVisibleFields = () => {
    const answer = data.has_value === true ? 'yes' : data.has_value === false ? 'no' : null;
    return fields.filter(f => {
      if (!f.show_when || f.show_when === 'always') return true;
      return f.show_when === answer;
    });
  };

  const visibleFields = getVisibleFields();

  if (!isEditing) {
    return (
      <div className="mt-2 space-y-2">
        <Badge variant="outline" className={data.has_value ? 'bg-green-50 text-green-700' : data.has_value === false ? 'bg-red-50 text-red-700' : ''}>{data.has_value === true ? 'Yes' : data.has_value === false ? 'No' : 'Not answered'}</Badge>
        {visibleFields.map(f => (
          <div key={f.key} className="text-sm">
            <span className="text-text-muted">{f.label}:</span> {data.fields?.[f.key] || '-'}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <RadioGroup value={data.has_value === true ? 'yes' : data.has_value === false ? 'no' : ''} onValueChange={(v) => handleToggle(v === 'yes')} className="flex gap-4">
        <div className="flex items-center gap-2">
          <RadioGroupItem value="yes" id={`${config.question_key}-yes`} />
          <Label htmlFor={`${config.question_key}-yes`} className="text-sm">Yes</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="no" id={`${config.question_key}-no`} />
          <Label htmlFor={`${config.question_key}-no`} className="text-sm">No</Label>
        </div>
      </RadioGroup>
      {visibleFields.length > 0 && data.has_value !== null && (
        <div className="bg-stone-50 p-4 rounded-lg space-y-3">
          {visibleFields.map(f => (
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

export function YesNoWithDescriptionRenderer({ config, value, onChange, isEditing }) {
  const data = value || { answer: null, description: '' };

  if (!isEditing) {
    return (
      <div className="mt-2 space-y-2">
        <Badge variant="outline" className={data.answer === 'yes' ? 'bg-green-50 text-green-700' : data.answer === 'no' ? 'bg-red-50 text-red-700' : ''}>
          {data.answer === 'yes' ? 'Yes' : data.answer === 'no' ? 'No' : 'Not answered'}
        </Badge>
        {data.description && <p className="text-sm text-stone-600">{data.description}</p>}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <RadioGroup value={data.answer || ''} onValueChange={(v) => onChange({ ...data, answer: v })} className="flex gap-4">
        <div className="flex items-center gap-2">
          <RadioGroupItem value="yes" id={`${config.question_key}-yes`} />
          <Label htmlFor={`${config.question_key}-yes`} className="text-sm">Yes</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="no" id={`${config.question_key}-no`} />
          <Label htmlFor={`${config.question_key}-no`} className="text-sm">No</Label>
        </div>
      </RadioGroup>
      <Textarea
        value={data.description || ''}
        onChange={(e) => onChange({ ...data, description: e.target.value })}
        placeholder="Additional details..."
        rows={3}
        className="text-sm"
      />
    </div>
  );
}

export function LongTextResponseRenderer({ config, value, onChange, isEditing }) {
  if (!isEditing) {
    return (
      <div className="mt-2">
        <p className="text-sm text-stone-700 whitespace-pre-wrap">{value || '-'}</p>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <Textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={config.placeholder || 'Enter your response...'}
        rows={6}
        className="text-sm"
      />
    </div>
  );
}
