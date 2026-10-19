import React, { useMemo, useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const SECTIONS = ['environment', 'social', 'governance'];

export function AIQueryAliasesTab({ orgConfig, allDefaultModules, onSave, saving }) {
  const [rules, setRules] = useState(orgConfig?.ai_query_aliases || []);
  const [draft, setDraft] = useState({ section: 'governance', category: '', subcategory: '', field_key: '', aliases: '' });
  const modules = allDefaultModules[draft.section] || [];
  const selectedModule = modules.find(module => module.module_name === draft.category);
  const subcategories = selectedModule?.subcategories || [];
  const selectedSubcategory = subcategories.find(subcategory => subcategory.subcategory_name === draft.subcategory);
  const fields = selectedSubcategory?.fields || [];

  const ruleLabel = useMemo(() => (rule) => [rule.section, rule.category, rule.subcategory, rule.field_key].filter(Boolean).join(' → '), []);

  const addRule = () => {
    const aliases = draft.aliases.split(',').map(value => value.trim()).filter(Boolean);
    if (!draft.category || aliases.length === 0) {
      toast.error('Choose a category and enter at least one alias');
      return;
    }
    const rule = { ...draft, aliases };
    delete rule.aliasesText;
    setRules(previous => [...previous.filter(item => !(item.section === rule.section && item.category === rule.category && item.subcategory === rule.subcategory && item.field_key === rule.field_key)), rule]);
    setDraft(previous => ({ ...previous, aliases: '' }));
  };

  return (
    <Card className="p-6" data-testid="ai-query-aliases-tab">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">AI Query Aliases</h2>
        <p className="text-sm text-stone-500 mt-1">Map organization language to a configured category, subcategory, or field. Organization aliases take priority over standard naming.</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <div>
          <Label>Section</Label>
          <Select value={draft.section} onValueChange={section => setDraft({ section, category: '', subcategory: '', field_key: '', aliases: '' })}>
            <SelectTrigger data-testid="alias-section-select"><SelectValue /></SelectTrigger>
            <SelectContent>{SECTIONS.map(section => <SelectItem key={section} value={section}>{section[0].toUpperCase() + section.slice(1)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Category</Label>
          <Select value={draft.category} onValueChange={category => setDraft(previous => ({ ...previous, category, subcategory: '', field_key: '' }))}>
            <SelectTrigger data-testid="alias-category-select"><SelectValue placeholder="Choose category" /></SelectTrigger>
            <SelectContent>{modules.map(module => <SelectItem key={module.module_code} value={module.module_name}>{module.module_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Subcategory <span className="text-stone-400">optional</span></Label>
          <Select value={draft.subcategory || '__category__'} onValueChange={subcategory => setDraft(previous => ({ ...previous, subcategory: subcategory === '__category__' ? '' : subcategory, field_key: '' }))} disabled={!draft.category}>
            <SelectTrigger data-testid="alias-subcategory-select"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="__category__">Category only</SelectItem>{subcategories.map(subcategory => <SelectItem key={subcategory.subcategory_code} value={subcategory.subcategory_name}>{subcategory.subcategory_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Field <span className="text-stone-400">optional</span></Label>
          <Select value={draft.field_key || '__subcategory__'} onValueChange={field_key => setDraft(previous => ({ ...previous, field_key: field_key === '__subcategory__' ? '' : field_key }))} disabled={!draft.subcategory}>
            <SelectTrigger data-testid="alias-field-select"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="__subcategory__">Subcategory only</SelectItem>{fields.map(field => <SelectItem key={field.field_key || field.field_code} value={field.field_key || field.field_code}>{field.label || field.field_key || field.field_code}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Aliases</Label>
          <div className="flex gap-2">
            <Input value={draft.aliases} onChange={event => setDraft(previous => ({ ...previous, aliases: event.target.value }))} placeholder="board, directors" data-testid="alias-values-input" />
            <Button onClick={addRule} size="icon" data-testid="add-alias-rule-button"><Plus className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-2" data-testid="alias-rules-list">
        {rules.length === 0 ? <p className="text-sm text-stone-400 py-3">No organization-specific AI aliases yet.</p> : rules.map((rule, index) => (
          <div key={`${ruleLabel(rule)}-${index}`} className="flex items-center justify-between gap-3 border rounded-md p-3">
            <div className="min-w-0"><p className="text-sm font-medium truncate">{ruleLabel(rule)}</p><div className="flex flex-wrap gap-1 mt-1">{rule.aliases.map(alias => <Badge key={alias} variant="secondary" className="text-xs">{alias}</Badge>)}</div></div>
            <Button variant="ghost" size="icon" className="text-red-600" onClick={() => setRules(previous => previous.filter((_, ruleIndex) => ruleIndex !== index))} data-testid={`delete-alias-rule-${index}`}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-end"><Button onClick={() => onSave({ ai_query_aliases: rules })} disabled={saving} data-testid="save-ai-query-aliases-button"><Save className="h-4 w-4 mr-2" />Save Aliases</Button></div>
    </Card>
  );
}