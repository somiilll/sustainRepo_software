import React from 'react';
import { ColourfulEmissionSummary } from './ColourfulEmissionSummary';

const valueFromOutput = (result, outputName, legacyName) => (
  result?.outputs?.[outputName]?.value ?? result?.[legacyName] ?? 0
);

const unitFromOutput = (result, outputName, fallback) => (
  result?.outputs?.[outputName]?.unit || fallback
);

export const CustomFuelLiveCalculation = ({ result, isCalculating = false }) => {
  if (!result) return null;

  const auditLog = result.audit_log || result.auditLog || [];
  const calculation = {
    co2Emissions: valueFromOutput(result, 'co2', 'co2_emissions') || result.co2Emissions,
    ch4Emissions: valueFromOutput(result, 'ch4', 'ch4_emissions') || result.ch4Emissions,
    n2oEmissions: valueFromOutput(result, 'n2o', 'n2o_emissions') || result.n2oEmissions,
    co2eEmissions: valueFromOutput(result, 'co2e', 'co2e_emissions') || result.co2eEmissions,
    co2OutputUnit: unitFromOutput(result, 'co2', result.co2OutputUnit || 'tCO2'),
    ch4OutputUnit: unitFromOutput(result, 'ch4', result.ch4OutputUnit || 'tCH4'),
    n2oOutputUnit: unitFromOutput(result, 'n2o', result.n2oOutputUnit || 'tN2O'),
    co2eOutputUnit: unitFromOutput(result, 'co2e', result.co2eOutputUnit || 'tCO2e'),
    auditLog,
  };

  return (
    <section data-testid="custom-fuel-live-calculation">
      <ColourfulEmissionSummary calculation={calculation} isCalculating={isCalculating} isScope3Like={false} />
    </section>
  );
};