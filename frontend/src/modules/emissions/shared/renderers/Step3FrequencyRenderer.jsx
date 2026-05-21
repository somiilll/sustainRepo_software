/**
 * Step 3 Renderer Adapter
 *
 * Thin re-export adapter that points the new module-architecture registry
 * at the existing `Step3YearMonthlyData` component used by
 * `EmissionEntryForm.js`. Keeps the file location of the underlying
 * implementation untouched (1140-line component lives in
 * `/modules/ghg/emissions/shared/components/steps/Step3YearMonthlyData.js`)
 * while exposing it as a registry-attachable renderer for CREATE flows.
 *
 * Module authors who want a different Step 3 experience for their
 * category (e.g. multi-employee grid for C7, wizard for CBAM) simply
 * assign a different component to `module.Step3Renderer` in
 * `initializeCategoryModules()`. The host page (EmissionEntryForm)
 * uses `activeModule.Step3Renderer` when present, otherwise falls back
 * to the default below.
 */

import { Step3YearMonthlyData } from '../../../ghg/emissions/shared/components/steps/Step3YearMonthlyData';

export const Step3FrequencyRenderer = Step3YearMonthlyData;
export default Step3FrequencyRenderer;
