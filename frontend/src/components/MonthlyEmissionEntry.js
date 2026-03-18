import React, { useState } from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { FileUpload } from './ui/file-upload';
import { Upload, X, ChevronDown, Check } from 'lucide-react';

const MONTHS = [
  { key: '01', name: 'January' },
  { key: '02', name: 'February' },
  { key: '03', name: 'March' },
  { key: '04', name: 'April' },
  { key: '05', name: 'May' },
  { key: '06', name: 'June' },
  { key: '07', name: 'July' },
  { key: '08', name: 'August' },
  { key: '09', name: 'September' },
  { key: '10', name: 'October' },
  { key: '11', name: 'November' },
  { key: '12', name: 'December' }
];

export default function MonthlyEmissionEntry({
  year,
  scope,
  monthlyData,
  setMonthlyData,
  allowedUnits = ['kg', 'litre', 'kWh'],
  defaultUnit = 'kg',
  fuelData = null,
  centralizedUnits = [],
  getAuthHeader,
  API
}) {
  const [expandedMonths, setExpandedMonths] = useState([]);

  const handleMonthDataChange = (monthKey, field, value) => {
    setMonthlyData(prev => ({
      ...prev,
      [monthKey]: {
        ...prev[monthKey],
        [field]: value
      }
    }));
  };

  const handleEvidenceUpload = async (monthKey, file) => {
    if (!file) return;
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${API}/upload-evidence`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: formData
      });
      
      if (response.ok) {
        const data = await response.json();
        const currentEvidences = monthlyData[monthKey]?.evidences || [];
        handleMonthDataChange(monthKey, 'evidences', [...currentEvidences, {
          url: data.url,
          filename: file.name,
          uploaded_at: new Date().toISOString()
        }]);
      }
    } catch (error) {
      console.error('Evidence upload failed:', error);
    }
  };

  const removeEvidence = (monthKey, evidenceIndex) => {
    const currentEvidences = monthlyData[monthKey]?.evidences || [];
    handleMonthDataChange(monthKey, 'evidences', 
      currentEvidences.filter((_, idx) => idx !== evidenceIndex)
    );
  };

  const getMonthStatus = (monthKey) => {
    const data = monthlyData[monthKey];
    if (!data || !data.quantity) return 'empty';
    return 'filled';
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <Label className="text-base font-semibold">Monthly Data Entry for {year}</Label>
        <span className="text-xs text-text-muted">
          {Object.values(monthlyData).filter(m => m?.quantity).length} / 12 months filled
        </span>
      </div>
      
      <Accordion type="multiple" value={expandedMonths} onValueChange={setExpandedMonths}>
        {MONTHS.map(month => {
          const monthKey = month.key;
          const status = getMonthStatus(monthKey);
          const data = monthlyData[monthKey] || {};
          
          return (
            <AccordionItem key={monthKey} value={monthKey} className="border rounded-lg mb-2">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${
                      status === 'filled' ? 'bg-green-500' : 'bg-stone-300'
                    }`} />
                    <span className="font-medium">{month.name} {year}</span>
                  </div>
                  {status === 'filled' && (
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <Check className="w-4 h-4" />
                      {data.quantity} {data.unit || defaultUnit}
                    </span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-4">
                  {/* Quantity and Unit */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Enter quantity"
                        value={data.quantity || ''}
                        onChange={(e) => handleMonthDataChange(monthKey, 'quantity', e.target.value)}
                        className="bg-stone-50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Unit</Label>
                      <select
                        value={data.unit || defaultUnit}
                        onChange={(e) => handleMonthDataChange(monthKey, 'unit', e.target.value)}
                        className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                      >
                        {allowedUnits.map(unit => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Evidence Upload */}
                  <div className="space-y-2">
                    <Label>Evidence(s)</Label>
                    <div className="border-2 border-dashed border-stone-200 rounded-lg p-4">
                      <input
                        type="file"
                        id={`evidence-${monthKey}`}
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            handleEvidenceUpload(monthKey, e.target.files[0]);
                            e.target.value = '';
                          }
                        }}
                        accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx"
                      />
                      <label 
                        htmlFor={`evidence-${monthKey}`}
                        className="flex flex-col items-center gap-2 cursor-pointer"
                      >
                        <Upload className="w-8 h-8 text-stone-400" />
                        <span className="text-sm text-stone-500">Click to upload evidence</span>
                        <span className="text-xs text-stone-400">PDF, Images, Excel, Word</span>
                      </label>
                    </div>
                    
                    {/* Uploaded Evidences List */}
                    {data.evidences && data.evidences.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {data.evidences.map((evidence, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-green-50 rounded-lg">
                            <span className="text-sm text-green-700 truncate flex-1">
                              {evidence.filename}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeEvidence(monthKey, idx)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Override Options based on Scope */}
                  {scope === 'scope1' && (
                    <div className="space-y-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <Label className="text-amber-800 font-medium">Override Default Values (Optional)</Label>
                      
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`override-cv-${monthKey}`}
                          checked={data.overrideCalorificValue || false}
                          onChange={(e) => handleMonthDataChange(monthKey, 'overrideCalorificValue', e.target.checked)}
                        />
                        <label htmlFor={`override-cv-${monthKey}`} className="text-sm">
                          Override Calorific Value
                        </label>
                      </div>
                      
                      {data.overrideCalorificValue && (
                        <div className="grid grid-cols-2 gap-2 ml-6">
                          <Input
                            type="number"
                            step="0.001"
                            placeholder="Calorific Value"
                            value={data.calorificValue || ''}
                            onChange={(e) => handleMonthDataChange(monthKey, 'calorificValue', e.target.value)}
                            className="bg-white"
                          />
                          <Input
                            placeholder="Justification"
                            value={data.calorificValueJustification || ''}
                            onChange={(e) => handleMonthDataChange(monthKey, 'calorificValueJustification', e.target.value)}
                            className="bg-white"
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`override-density-${monthKey}`}
                          checked={data.overrideDensity || false}
                          onChange={(e) => handleMonthDataChange(monthKey, 'overrideDensity', e.target.checked)}
                        />
                        <label htmlFor={`override-density-${monthKey}`} className="text-sm">
                          Override Density
                        </label>
                      </div>
                      
                      {data.overrideDensity && (
                        <div className="grid grid-cols-2 gap-2 ml-6">
                          <Input
                            type="number"
                            step="0.001"
                            placeholder="Density"
                            value={data.density || ''}
                            onChange={(e) => handleMonthDataChange(monthKey, 'density', e.target.value)}
                            className="bg-white"
                          />
                          <Input
                            placeholder="Justification"
                            value={data.densityJustification || ''}
                            onChange={(e) => handleMonthDataChange(monthKey, 'densityJustification', e.target.value)}
                            className="bg-white"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {scope === 'scope2' && (
                    <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`custom-ef-${monthKey}`}
                          checked={data.useCustomEmissionFactor || false}
                          onChange={(e) => handleMonthDataChange(monthKey, 'useCustomEmissionFactor', e.target.checked)}
                        />
                        <label htmlFor={`custom-ef-${monthKey}`} className="text-sm text-blue-800 font-medium">
                          Use Custom Emission Factor
                        </label>
                      </div>
                      
                      {data.useCustomEmissionFactor && (
                        <div className="grid grid-cols-2 gap-2 ml-6">
                          <Input
                            type="number"
                            step="0.0001"
                            placeholder="Emission Factor (tCO2/unit)"
                            value={data.customEmissionFactor || ''}
                            onChange={(e) => handleMonthDataChange(monthKey, 'customEmissionFactor', e.target.value)}
                            className="bg-white"
                          />
                          <Input
                            placeholder="Source / Justification"
                            value={data.customEmissionFactorSource || ''}
                            onChange={(e) => handleMonthDataChange(monthKey, 'customEmissionFactorSource', e.target.value)}
                            className="bg-white"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
