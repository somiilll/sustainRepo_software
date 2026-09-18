import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { deriveGhgFields } from '../ghg/config/deriveGhgFields';
import { getOcrFactorOptions, getOcrFormConfig } from './ocrApi';

const emptyValues = { scope: 'scope1', category: '', ef_method: 'activity', quantity: '', cost: '', reporting_period: '', remember_override: false };
const taxonomyMatchValue = (value) => String(value || '').replace(/\s*\((?:non_renewable|renewable|landfill|recycling|composting|combustion)\)\s*$/i, '');
const normalize = (value) => taxonomyMatchValue(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (value) => {
  const tokens = taxonomyMatchValue(value)
    .toLowerCase()
    .replace(/^\s*\d{2,6}\s*[-–—:]\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 1 && !['and', 'the', 'of', 'for', 'to', 'in', 'a', 'an'].includes(word));
  const expanded = new Set(tokens);
  if (expanded.has('wastewater')) expanded.add('waste').add('water');
  if (tokens.some((word, index) => word === 'waste' && tokens[index + 1] === 'water')) expanded.add('wastewater');
  return [...expanded];
};
const variants = (value) => {
  const withoutCode = String(value || '').replace(/^\s*\d{2,6}\s*[-–—:]\s*/, '').trim();
  const suffix = withoutCode.includes(':') ? withoutCode.split(':').slice(1).join(':').trim() : '';
  return [...new Set([normalize(withoutCode), normalize(suffix)].filter(Boolean))];
};
const similarity = (left, right) => {
  const leftWords = new Set(words(left));
  const rightWords = new Set(words(right));
  if (!leftWords.size || !rightWords.size) return 0;
  const common = [...leftWords].filter((word) => rightWords.has(word)).length;
  const containment = common / Math.min(leftWords.size, rightWords.size);
  const dice = (2 * common) / (leftWords.size + rightWords.size);
  return (containment * 0.65) + (dice * 0.35);
};
const closestFactor = (options, candidates) => {
  const values = candidates.filter(Boolean);
  const exact = options.filter((option) => values.some((candidate) => variants(candidate).some((left) => variants(option.value).includes(left))));
  if (exact.length === 1) return exact[0];
  const contains = options.filter((option) => values.some((candidate) => variants(candidate).some((left) => variants(option.value).some((right) => left.length >= 4 && right.length >= 4 && (left.includes(right) || right.includes(left))))));
  if (contains.length === 1) return contains[0];
  const ranked = options
    .map((option) => ({ option, score: Math.max(...values.map((candidate) => similarity(candidate, option.value)), 0) }))
    .sort((left, right) => right.score - left.score);
  if (ranked[0]?.score >= 0.75 && (!ranked[1] || ranked[0].score - ranked[1].score >= 0.1)) return ranked[0].option;
  return null;
};
const preferredFactor = (options, candidates, scope, category, saveRules) => {
  const scopeRules = saveRules?.[scope];
  if (!scopeRules?.enabled) return null;
  const normalizedValues = new Set(candidates.filter(Boolean).map(normalize));
  for (const [genericName, preferredName] of Object.entries(scopeRules.generic_activity_preferences || {})) {
    if (!normalizedValues.has(normalize(genericName))) continue;
    const preferred = options.find((option) => normalize(option.value) === normalize(preferredName));
    if (preferred) return preferred;
  }
  const candidateTokens = new Set(candidates.flatMap((candidate) => words(candidate)));
  const categoryKey = normalize(category);
  for (const preference of scopeRules.fuzzy_activity_preferences || []) {
    if (!categoryKey.startsWith(preference.category_prefix || '')) continue;
    if (!preference.token_groups?.every((group) => group.some((token) => candidateTokens.has(token)))) continue;
    const preferred = options.find((option) => normalize(option.value) === normalize(preference.activity));
    if (preferred) return preferred;
  }
  return null;
};
const matchingUnit = (factor, value) => (factor?.allowed_units || []).find((unit) => {
  const aliases = factor?.unit_aliases?.[unit] || [unit];
  return aliases.some((alias) => normalize(alias) === normalize(value));
}) || factor?.allowed_units?.[0] || '';
const reportingPeriodFromDate = (value) => {
  const raw = String(value || '').trim();
  const isoMatch = raw.match(/^(\d{4})[-/](0[1-9]|1[0-2])/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;
  const namedMatch = raw.match(/^([a-z]+)[,\s-]+(\d{4})$/i);
  const month = namedMatch ? {
    jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03', apr: '04', april: '04',
    may: '05', jun: '06', june: '06', jul: '07', july: '07', aug: '08', august: '08', sep: '09', september: '09',
    oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12',
  }[namedMatch[1].toLowerCase()] : '';
  return month ? `${namedMatch[2]}-${month}` : '';
};
const reportingPeriodLabel = (value) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value || '')) return 'Select month';
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' })
    .format(new Date(`${value}-01T12:00:00`));
};
const scope3Method = (method) => ({ activity: 'activity_basis', spend: 'spend_basis', supplier: 'supplier_basis' }[method] || method || '');
const dynamicValue = (values, variable) => {
  const value = values.dynamic_field_values?.[variable];
  return value && typeof value === 'object' ? value.value : values[variable] ?? '';
};

const ExtractedValue = ({ label, value, field }) => (
  <p className="text-xs text-slate-500" data-testid={`ocr-edit-extracted-${field}`}>
    Extracted {label.toLowerCase()}: <span className="font-medium text-slate-700">{value || 'Not available'}</span>
  </p>
);

export const OcrEditDialog = ({ item, open, onOpenChange, configuration, onSave, onAutoMatch, saving, getAuthHeaders, requiredFields = [] }) => {
  const [values, setValues] = useState(emptyValues);
  const [factors, setFactors] = useState([]);
  const [factorLoading, setFactorLoading] = useState(false);
  const [factorError, setFactorError] = useState('');
  const [formConfig, setFormConfig] = useState(null);
  const [formConfigLoading, setFormConfigLoading] = useState(false);
  const automaticMatchRef = useRef('');
  const original = item?.original_values || {};

  useEffect(() => { automaticMatchRef.current = ''; }, [item?.id]);

  useEffect(() => {
    if (item) {
      const current = { ...emptyValues, ...(item.current_values || {}) };
      const matchingFacility = configuration.facilities?.find((facility) => (
        facility.id === current.facility_id || facility.name === current.location
      ));
      if (current.scope === 'water') current.ef_method = 'activity';
      setValues({
        ...current,
        facility_id: current.facility_id || matchingFacility?.id || '',
        reporting_period: reportingPeriodFromDate(current.reporting_period)
          || reportingPeriodFromDate(current.billing_period_start)
          || reportingPeriodFromDate(current.billing_period_end)
          || reportingPeriodFromDate(current.date)
          || reportingPeriodFromDate(current.billing_period_text)
          || reportingPeriodFromDate(item.original_values?.billing_period_start)
          || reportingPeriodFromDate(item.original_values?.billing_period_end)
          || reportingPeriodFromDate(item.original_values?.date),
      });
    }
  }, [item]);

  useEffect(() => {
    if (!item || !configuration.facilities?.length) return;
    setValues((current) => {
      if (current.facility_id) return current;
      const matchingFacility = configuration.facilities.find((facility) => facility.name === current.location);
      return matchingFacility ? { ...current, facility_id: matchingFacility.id } : current;
    });
  }, [configuration.facilities, item]);

  const resolvedFacilityId = useMemo(() => (
    values.facility_id
    || configuration.facilities?.find((facility) => facility.name === values.location)?.id
    || ''
  ), [configuration.facilities, values.facility_id, values.location]);

  const categories = useMemo(
    () => configuration.categories.filter((option) => option.scope === values.scope),
    [configuration.categories, values.scope],
  );
  const categoryOption = useMemo(
    () => categories.find((category) => category.value === values.category),
    [categories, values.category],
  );

  useEffect(() => {
    if (!open || values.scope !== 'scope3' || !categoryOption?.id) {
      setFormConfig(null);
      return undefined;
    }
    let active = true;
    setFormConfigLoading(true);
    getOcrFormConfig(categoryOption.id, 'scope3', getAuthHeaders())
      .then(({ data }) => { if (active) setFormConfig(data); })
      .catch(() => { if (active) setFormConfig(null); })
      .finally(() => { if (active) setFormConfigLoading(false); });
    return () => { active = false; };
  }, [open, values.scope, categoryOption?.id, getAuthHeaders]);

  useEffect(() => {
    const scope1NeedsFacility = values.scope === 'scope1';
    const factorFacilityId = scope1NeedsFacility ? resolvedFacilityId : values.facility_id;
    if (!open || !values.scope || !values.category || !values.ef_method || (scope1NeedsFacility && !factorFacilityId)) {
      setFactors([]);
      setFactorLoading(false);
      return undefined;
    }
    let active = true;
    setFactorLoading(true);
    setFactorError('');
    getOcrFactorOptions(values.scope, values.category, values.ef_method, factorFacilityId, getAuthHeaders())
      .then(({ data }) => {
        if (!active) return;
        const options = data.factors || [];
        setFactors(options);
        if (options.length === 1 && !values.factor_id) {
          const selected = options[0];
          const isSpendMethod = values.ef_method === 'spend';
          const matchedInput = matchingUnit(selected, isSpendMethod ? values.currency : values.unit);
          const nextValues = {
            ...values,
            facility_id: values.facility_id || factorFacilityId,
            factor_id: selected.id,
            fuel_id: selected.collection === 'fuel_database' ? selected.id : '',
            scope3_ef_id: selected.collection === 'scope3_ef' ? selected.id : '',
            subcategory: selected.value,
            fuel_name: selected.value,
            ef_lookup_key: selected.value,
            ef_database: selected.database,
            naics_code: selected.naics_code || (selected.method === 'spend' ? values.naics_code : ''),
            naics_label: selected.naics_label || (selected.method === 'spend' ? values.naics_label : ''),
            scope3_activity_type: selected.activity_type || values.scope3_activity_type || '',
            ...(isSpendMethod ? { currency: matchedInput || '' } : { unit: matchedInput || '' }),
          };
          setValues(nextValues);
          const automaticMatchKey = `${item?.id}:${factorFacilityId}:${selected.id}`;
          if (onAutoMatch && automaticMatchRef.current !== automaticMatchKey) {
            automaticMatchRef.current = automaticMatchKey;
            onAutoMatch(nextValues).catch(() => {
              if (active) setFactorError('The matched factor could not be saved. Select it and save changes manually.');
            });
          }
          return;
        }
        setValues((current) => {
          const storedFactor = options.find((option) => option.id === current.factor_id);
          const automaticFactor = storedFactor
            ? null
            : options.length === 1
              ? options[0]
              : (() => {
                const candidates = [
                  current.ef_lookup_key, current.subcategory, current.fuel_name, current.item_description,
                  original.ef_lookup_key, original.subcategory, original.fuel_name, original.item_description,
                ];
                return closestFactor(options, candidates)
                  || preferredFactor(options, candidates, current.scope, current.category, configuration.save_rules);
              })();
          const selected = storedFactor || automaticFactor;
          if (!selected) {
            return {
              ...current,
              factor_id: '', fuel_id: '', scope3_ef_id: '', subcategory: '', fuel_name: '', ef_lookup_key: '', ef_database: '',
              ...(current.ef_method === 'spend' ? { currency: '' } : { unit: '' }),
            };
          }
          const isSpend = current.ef_method === 'spend';
          const matchedInput = matchingUnit(selected, isSpend ? (current.currency || original.currency) : (current.unit || original.unit));
          const nextValues = {
            ...current,
            facility_id: current.facility_id || factorFacilityId,
            factor_id: selected.id,
            fuel_id: selected.collection === 'fuel_database' ? selected.id : '',
            scope3_ef_id: selected.collection === 'scope3_ef' ? selected.id : '',
            subcategory: selected.value,
            fuel_name: selected.value,
            ef_lookup_key: selected.value,
            ef_database: selected.database,
            naics_code: selected.naics_code || (selected.method === 'spend' ? current.naics_code : ''),
            naics_label: selected.naics_label || (selected.method === 'spend' ? current.naics_label : ''),
            scope3_activity_type: selected.activity_type || current.scope3_activity_type || '',
            ...(isSpend ? { currency: matchedInput || '' } : { unit: matchedInput || '' }),
          };
          const automaticMatchKey = automaticFactor ? `${item?.id}:${factorFacilityId}:${automaticFactor.id}` : '';
          if (automaticFactor && onAutoMatch && automaticMatchRef.current !== automaticMatchKey) {
            automaticMatchRef.current = automaticMatchKey;
            onAutoMatch(nextValues).catch(() => {
              if (active) setFactorError('The matched factor could not be saved. Select it and save changes manually.');
            });
          }
          return nextValues;
        });
      })
      .catch(() => {
        if (active) {
          setFactors([]);
          setFactorError('Factor options could not be loaded.');
        }
      })
      .finally(() => { if (active) setFactorLoading(false); });
    return () => { active = false; };
  }, [open, values.scope, values.category, values.ef_method, values.facility_id, resolvedFacilityId, getAuthHeaders, onAutoMatch, original.ef_lookup_key, original.subcategory, original.fuel_name, original.item_description, original.unit, original.currency]);

  const selectedFactor = useMemo(
    () => factors.find((factor) => factor.id === values.factor_id),
    [factors, values.factor_id],
  );
  const allowedUnits = selectedFactor?.allowed_units || [];
  const isSpend = values.ef_method === 'spend';
  const isRequiredForGhgSave = (...fields) => fields.some((field) => requiredFields.includes(field));
  const requiredClassName = (...fields) => isRequiredForGhgSave(...fields) ? 'border-red-500 ring-1 ring-red-200' : '';
  const set = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (['facility_id', 'unit', 'currency'].includes(field)) setFactorError('');
  };
  const resetFactor = (current, patch) => ({ ...current, ...patch, factor_id: '', fuel_id: '', scope3_ef_id: '', ef_database: '', naics_code: '', naics_label: '' });

  const changeScope = (scope) => {
    setFactorError('');
    setValues((current) => resetFactor(current, {
      scope, category: '', category_key: '', category_code: '', ef_method: scope === 'water' ? 'activity' : current.ef_method,
    }));
  };
  const changeCategory = (category) => {
    const option = categories.find((entry) => entry.value === category);
    setFactorError('');
    setValues((current) => resetFactor(current, { category, category_key: option?.key || '', category_code: option?.code || '' }));
  };
  const changeMethod = (ef_method) => {
    setFactorError('');
    setValues((current) => resetFactor(current, { ef_method }));
  };
  const changeFactor = (factorId) => {
    const factor = factors.find((option) => option.id === factorId);
    if (!factor) return;
    setFactorError('');
    const matchedInput = matchingUnit(factor, isSpend ? values.currency : values.unit);
    setValues((current) => ({
      ...current,
      factor_id: factor.id,
      fuel_id: factor.collection === 'fuel_database' ? factor.id : '',
      scope3_ef_id: factor.collection === 'scope3_ef' ? factor.id : '',
      subcategory: factor.value,
      fuel_name: factor.value,
      ef_lookup_key: factor.value,
      ef_database: factor.database,
      naics_code: factor.naics_code || '',
      naics_label: factor.naics_label || '',
      scope3_activity_type: factor.activity_type || current.scope3_activity_type || '',
      ...(isSpend ? { currency: matchedInput || '' } : { unit: matchedInput || '' }),
    }));
  };

  useEffect(() => {
    if (!open || values.factor_id || factors.length !== 1) return;
    const factor = factors[0];
    const factorFacilityId = values.scope === 'scope1' ? resolvedFacilityId : values.facility_id;
    if (values.scope === 'scope1' && !factorFacilityId) return;
    const matchedInput = matchingUnit(factor, isSpend ? values.currency : values.unit);
    const nextValues = {
      ...values,
      facility_id: values.facility_id || factorFacilityId,
      factor_id: factor.id,
      fuel_id: factor.collection === 'fuel_database' ? factor.id : '',
      scope3_ef_id: factor.collection === 'scope3_ef' ? factor.id : '',
      subcategory: factor.value,
      fuel_name: factor.value,
      ef_lookup_key: factor.value,
      ef_database: factor.database,
      scope3_activity_type: factor.activity_type || values.scope3_activity_type || '',
      ...(isSpend ? { currency: matchedInput || '' } : { unit: matchedInput || '' }),
    };
    const automaticMatchKey = `${item?.id}:${factorFacilityId}:${factor.id}`;
    automaticMatchRef.current = automaticMatchKey;
    setValues(nextValues);
    onAutoMatch?.(nextValues).catch(() => {
      setFactorError('The matched factor could not be saved. Select it and save changes manually.');
    });
  }, [open, values, factors, isSpend, resolvedFacilityId, item?.id, onAutoMatch]);

  const dynamicFields = useMemo(() => {
    if (values.scope !== 'scope3' || !formConfig) return [];
    return deriveGhgFields({
      formConfig,
      context: {
        scope: 'scope3',
        isScope3Like: true,
        categoryId: categoryOption?.id,
        categoryDefinition: { code: values.category_code },
        scope3Method: scope3Method(values.ef_method),
        scopeId: formConfig.category?.scope_id,
        scope3ActivityType: selectedFactor?.activity_type || values.scope3_activity_type || '',
        scope3Subcategory: values.scope3_subcategory || '',
        decisionFieldValues: { calculation_method_scope3: scope3Method(values.ef_method) },
        selectedFuel: selectedFactor,
      },
    }).fields.filter((field) => !field.presentationOnly);
  }, [categoryOption?.id, formConfig, selectedFactor, values.category_code, values.ef_method, values.scope, values.scope3_activity_type, values.scope3_subcategory]);
  useEffect(() => {
    const isC6 = /^(c6|cat_6)\b/i.test(values.category_code || values.category_key || values.category || '');
    const daysField = dynamicFields.find((field) => field.variable === 'qty_days_travelled');
    if (!open || !isC6 || !daysField) return;
    setValues((current) => {
      const currentDays = current.dynamic_field_values?.qty_days_travelled;
      if (currentDays?.value !== undefined && currentDays?.value !== null && currentDays?.value !== '') return current;
      return {
        ...current,
        dynamic_field_values: {
          ...(current.dynamic_field_values || {}),
          qty_days_travelled: {
            ...currentDays,
            value: 1,
            unit: currentDays?.unit || daysField.expectedUnit || '',
          },
        },
      };
    });
  }, [dynamicFields, open, values.category, values.category_code, values.category_key]);
  const updateDynamicValue = (field, value, unit) => {
    setValues((current) => ({
      ...current,
      dynamic_field_values: {
        ...(current.dynamic_field_values || {}),
        [field.variable]: {
          ...(current.dynamic_field_values?.[field.variable] || {}),
          value,
          unit: unit ?? current.dynamic_field_values?.[field.variable]?.unit ?? field.expectedUnit ?? '',
        },
      },
    }));
  };
  const dynamicFieldsComplete = dynamicFields.every((field) => !field.required || dynamicValue(values, field.variable) !== '');
  const hasStructuredScope3Inputs = values.scope === 'scope3'
    && /^(c4|c6|c9)\b/i.test(values.category_code || values.category_key || values.category || '')
    && dynamicFields.some((field) => ['qty_travelled', 'km_travelled', 'qty_passenger', 'qty_days_travelled', 'qty_room', 'qty_nights'].includes(field.variable));

  const factorInputComplete = hasStructuredScope3Inputs || Boolean(isSpend ? values.currency : values.unit);
  const selectionComplete = Boolean(values.category && selectedFactor && values.subcategory && factorInputComplete && dynamicFieldsComplete && !factorError);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" data-testid="ocr-edit-dialog">
        <DialogHeader>
          <DialogTitle>Edit activity classification</DialogTitle>
          <DialogDescription>The source extraction stays preserved for audit history.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-3 sm:grid-cols-2">
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2" data-testid="ocr-edit-primary-row">
            <div className="space-y-2">
              <Label data-testid="ocr-edit-facility-label">Facility</Label>
              <Select value={values.facility_id || ''} onValueChange={(facilityId) => set('facility_id', facilityId)}>
                <SelectTrigger className={requiredClassName('facility_id')} data-testid="ocr-edit-facility-select"><SelectValue placeholder="Select facility" /></SelectTrigger>
                <SelectContent>{(configuration.facilities || []).map((facility) => <SelectItem key={facility.id} value={facility.id} data-testid={`ocr-edit-facility-${facility.id}`}>{facility.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ocr-reporting-period">Reporting period</Label>
              <div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-700" aria-hidden="true" /><Input id="ocr-reporting-period" type="month" value={values.reporting_period || ''} onChange={(event) => set('reporting_period', event.target.value)} className={`pl-10 ${requiredClassName('reporting_period')}`} aria-label={`Reporting period: ${reportingPeriodLabel(values.reporting_period)}`} data-testid="ocr-edit-reporting-period-input" /></div>
            </div>
          </div>
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2" data-testid="ocr-edit-method-scope-row">
            <div className="space-y-2">
              <Label>Calculation method</Label>
              <Select value={values.ef_method || 'activity'} onValueChange={changeMethod} disabled={values.scope === 'water'}>
                <SelectTrigger data-testid="ocr-edit-method-select"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="activity" data-testid="ocr-edit-method-activity">Activity</SelectItem><SelectItem value="spend" data-testid="ocr-edit-method-spend">Spend</SelectItem><SelectItem value="supplier" data-testid="ocr-edit-method-supplier">Supplier</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select value={values.scope} onValueChange={changeScope}>
                <SelectTrigger data-testid="ocr-edit-scope-select"><SelectValue /></SelectTrigger>
                <SelectContent>{configuration.enabled_scopes.map((scope) => <SelectItem key={scope} value={scope} data-testid={`ocr-edit-scope-${scope}`}>{scope === 'water' ? 'Water' : scope.replace('scope', 'Scope ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2" data-testid="ocr-edit-category-subcategory-row">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={values.category || ''} onValueChange={changeCategory}>
                <SelectTrigger data-testid="ocr-edit-category-select"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{categories.map((category) => <SelectItem key={category.value} value={category.value} data-testid={`ocr-edit-category-${category.code}`}>{category.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subcategory / lookup</Label>
              <Select value={values.factor_id || ''} onValueChange={changeFactor} disabled={factorLoading || factors.length === 0}>
                <SelectTrigger className={requiredClassName('factor_id')} data-testid="ocr-edit-subcategory-select"><SelectValue placeholder={factorLoading ? 'Loading factors…' : 'Select a subcategory'} /></SelectTrigger>
                <SelectContent>{factors.map((factor, index) => <SelectItem key={`${factor.id}-${factor.value}`} value={factor.id} data-testid={`ocr-edit-factor-option-${index}`}>{factor.label} · {factor.database}</SelectItem>)}</SelectContent>
              </Select>
              <ExtractedValue label="subcategory" value={original.ef_lookup_key || original.subcategory} field="subcategory" />
            </div>
          </div>
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2" data-testid="ocr-edit-description-database-row">
            <div className="space-y-2"><Label htmlFor="ocr-item-description">Item description</Label><Input id="ocr-item-description" value={values.item_description ?? ''} onChange={(event) => set('item_description', event.target.value)} data-testid="ocr-edit-item-description-input" /></div>
            <div className="space-y-2"><Label htmlFor="ocr-ef-database">Factor database</Label><Input id="ocr-ef-database" value={values.ef_database || ''} readOnly data-testid="ocr-edit-ef-database-input" /></div>
          </div>
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2" data-testid="ocr-edit-invoice-vendor-row">
            <div className="space-y-2"><Label htmlFor="ocr-invoice-number">Invoice number</Label><Input id="ocr-invoice-number" value={values.invoice_number ?? ''} onChange={(event) => set('invoice_number', event.target.value)} data-testid="ocr-edit-invoice-number-input" /></div>
            <div className="space-y-2"><Label htmlFor="ocr-vendor-name">Vendor</Label><Input id="ocr-vendor-name" value={values.vendor_name ?? ''} onChange={(event) => set('vendor_name', event.target.value)} data-testid="ocr-edit-vendor-name-input" /></div>
          </div>
          {!hasStructuredScope3Inputs && <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2" data-testid="ocr-edit-quantity-unit-row">
            <div className="space-y-2">
              <Label htmlFor="ocr-quantity">Quantity</Label>
              <Input id="ocr-quantity" type="number" value={values.quantity ?? ''} onChange={(event) => set('quantity', event.target.value === '' ? '' : Number(event.target.value))} className={requiredClassName('quantity')} data-testid="ocr-edit-quantity-input" />
            </div>
            <div className="space-y-2">
              <Label htmlFor={isSpend ? 'ocr-quantity-unit' : undefined}>Unit of quantity</Label>
              {isSpend ? (
                <Input id="ocr-quantity-unit" value={values.unit || ''} onChange={(event) => set('unit', event.target.value)} className={requiredClassName('unit')} data-testid="ocr-edit-quantity-unit-input" />
              ) : (
                <Select value={values.unit || ''} onValueChange={(unit) => set('unit', unit)} disabled={!selectedFactor || allowedUnits.length === 0}>
                  <SelectTrigger className={requiredClassName('unit')} data-testid="ocr-edit-unit-select"><SelectValue placeholder="Select a unit" /></SelectTrigger>
                  <SelectContent>{allowedUnits.map((unit, index) => <SelectItem key={unit} value={unit} data-testid={`ocr-edit-unit-option-${index}`}>{unit}</SelectItem>)}</SelectContent>
                </Select>
              )}
              <ExtractedValue label="unit" value={original.unit} field="unit" />
            </div>
          </div>
          }
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2" data-testid="ocr-edit-cost-currency-row">
            <div className="space-y-2">
              <Label htmlFor="ocr-cost">Cost</Label>
              <Input id="ocr-cost" type="number" value={values.cost ?? ''} onChange={(event) => set('cost', event.target.value === '' ? '' : Number(event.target.value))} className={requiredClassName('cost')} data-testid="ocr-edit-cost-input" />
            </div>
            <div className="space-y-2">
              <Label htmlFor={isSpend ? undefined : 'ocr-currency'}>Currency</Label>
              {isSpend ? (
                <Select value={values.currency || ''} onValueChange={(currency) => set('currency', currency)} disabled={!selectedFactor || allowedUnits.length === 0}>
                  <SelectTrigger className={requiredClassName('currency')} data-testid="ocr-edit-currency-select"><SelectValue placeholder="Select a currency" /></SelectTrigger>
                  <SelectContent>{allowedUnits.map((currency, index) => <SelectItem key={currency} value={currency} data-testid={`ocr-edit-currency-option-${index}`}>{currency}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <Input id="ocr-currency" value={values.currency || ''} onChange={(event) => set('currency', event.target.value)} className={requiredClassName('currency')} data-testid="ocr-edit-currency-input" />
              )}
              <ExtractedValue label="currency" value={original.currency} field="currency" />
            </div>
          </div>
          {values.scope === 'scope3' && (formConfigLoading || dynamicFields.length > 0) && (
            formConfigLoading ? (
              <p className="text-sm text-slate-600 sm:col-span-2" data-testid="ocr-edit-dynamic-activity-loading">Loading activity inputs…</p>
            ) : (
              <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2" data-testid="ocr-edit-dynamic-activity-fields">
                {dynamicFields.map((field) => {
                  const fieldValue = dynamicValue(values, field.variable);
                  const fieldUnit = values.dynamic_field_values?.[field.variable]?.unit || field.expectedUnit || field.allowedUnits?.[0] || '';
                  const hasUnitSelector = field.unitSource !== 'none' && field.allowedUnits?.length > 1;
                  return (
                    <div key={field.id || field.variable} className="space-y-2">
                      <Label htmlFor={`ocr-dynamic-${field.variable}`} data-testid={`ocr-edit-dynamic-${field.variable}-label`}>
                        {field.label}{field.required && <span className="ml-1 text-red-500">*</span>}
                      </Label>
                      <div className={hasUnitSelector ? 'flex overflow-hidden rounded-md border border-slate-200 bg-white' : ''}>
                        <Input
                          id={`ocr-dynamic-${field.variable}`}
                          type={field.fieldType === 'text' ? 'text' : 'number'}
                          min={field.fieldType === 'text' ? undefined : '0'}
                          step={field.unitSource === 'none' ? '1' : 'any'}
                          value={fieldValue}
                          placeholder={field.placeholder}
                          onChange={(event) => updateDynamicValue(field, field.fieldType === 'text' ? event.target.value : (event.target.value === '' ? '' : Number(event.target.value)))}
                          className={hasUnitSelector ? 'rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0' : ''}
                          data-testid={`ocr-edit-dynamic-${field.variable}-input`}
                        />
                        {hasUnitSelector && (
                          <select
                            value={fieldUnit}
                            onChange={(event) => updateDynamicValue(field, fieldValue, event.target.value)}
                            className="min-w-20 border-l border-slate-200 bg-white px-2 text-sm outline-none"
                            data-testid={`ocr-edit-dynamic-${field.variable}-unit-select`}
                          >
                            {field.allowedUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                          </select>
                        )}
                        {!hasUnitSelector && field.unitSource !== 'none' && fieldUnit && <span className="flex items-center border-l border-slate-200 px-3 text-sm text-slate-600" data-testid={`ocr-edit-dynamic-${field.variable}-unit`}>{fieldUnit}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
          {hasStructuredScope3Inputs && (
            <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2" data-testid="ocr-edit-route-inputs">
              <div className="space-y-2">
                <Label htmlFor="ocr-origin" data-testid="ocr-edit-origin-label">From location</Label>
                <Input id="ocr-origin" value={values.origin || ''} onChange={(event) => set('origin', event.target.value)} data-testid="ocr-edit-origin-input" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ocr-destination" data-testid="ocr-edit-destination-label">To location</Label>
                <Input id="ocr-destination" value={values.destination || ''} onChange={(event) => set('destination', event.target.value)} data-testid="ocr-edit-destination-input" />
              </div>
            </div>
          )}
          <div className="space-y-2 sm:col-span-2">
            {requiredFields.length > 0 && <p className="text-sm font-medium text-red-700" role="alert" data-testid="ocr-edit-ghg-required-fields-alert">Complete the highlighted fields before saving this row to GHG.</p>}
            {factorLoading && <p className="text-sm text-slate-600" data-testid="ocr-edit-factor-loading">Loading factor options…</p>}
            {!factorLoading && !factorError && values.category && factors.length === 0 && <p className="text-sm text-amber-700" data-testid="ocr-edit-no-factors">No factors are configured for this category and method. Choose another method or contact the factor administrator.</p>}
            {factorError && <p className="text-sm text-red-700" data-testid="ocr-edit-factor-error">{factorError}</p>}
            {!selectionComplete && factors.length > 0 && <p className="text-sm text-amber-700" data-testid="ocr-edit-selection-required">Select a subcategory{hasStructuredScope3Inputs ? '' : `, ${isSpend ? 'one of its supported currencies' : 'one of its allowed quantity units'}`}, and complete required activity inputs before saving.</p>}
          </div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="ocr-rationale">Accounting rationale</Label><Textarea id="ocr-rationale" value={values.accounting_rationale || ''} onChange={(event) => set('accounting_rationale', event.target.value)} rows={3} data-testid="ocr-edit-rationale-input" /></div>
          <label className="flex items-start gap-3 border border-slate-200 bg-slate-50 p-3 sm:col-span-2" data-testid="ocr-remember-override-control">
            <Checkbox checked={Boolean(values.remember_override)} onCheckedChange={(checked) => set('remember_override', checked === true)} data-testid="ocr-remember-override-checkbox" />
            <span><span className="block text-sm font-medium text-slate-900">Remember this vendor classification</span><span className="mt-1 block text-xs text-slate-600">Future matching rows in this organization reuse the verified mapping.</span></span>
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="ocr-edit-cancel-button">Cancel</Button>
          <Button type="button" onClick={() => onSave(values)} disabled={saving || factorLoading || !selectionComplete} data-testid="ocr-edit-save-button">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};