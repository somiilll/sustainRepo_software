# GHG Add Form — Single-Page UX Change Report

**Completed:** 2026-08-18

## Scope

Simplified the **Add Emission** experience only. The Create form now presents one continuous, responsive layout instead of the former four-step wizard.

## UI changes

1. **Primary information** — retains the existing facility, scope, category, fuel/activity, and capability-driven selection fields.
2. **Reporting frequency** — isolates reporting-year type, reporting year, and monthly/yearly choice.
3. **Activity data** — preserves the existing configuration-driven renderer:
   - Monthly mode remains a compact expandable month list.
   - Yearly mode remains the existing annual entry form.
   - C6 flight details, C7 multi-employee entry, custom fuels, process fields, evidence, dynamic fields, and capability paths continue to render through their existing components.
4. **Optional fields** — is collapsed initially and contains the former process/responsibility fields plus notes and review summary.
5. Replaced wizard navigation with a single Cancel action and one Save action.

## Implementation structure

- Added `EmissionFormSection.js` for consistently styled regular/collapsible sections.
- Added `ReportingPeriodControls.js`, shared by the standalone reporting section and the legacy-capable data renderer.
- `Step3YearMonthlyData` accepts `showReportingControls` so its data-entry behavior is reused without duplicating period controls.
- Save now runs the existing step validations in their original order before submission. No validation rules, payloads, calculation logic, API calls, or persistence behavior were changed.

## Compatibility and safeguards

- `EmissionEditForm.jsx` was not modified.
- Backend calculation engine, GHG configuration derivation/capabilities, payload adapters, schemas, and database collections were not modified.
- Replaced Add-form Radix selects with native controls and safely rendered dynamic option markup to eliminate the known preview DOM-nesting warning.
- Fixed a dashboard chart key-prop spread warning surfaced by the UI verification.

## Verification

- Frontend regression: **1,223 passed**, **63 snapshots passed**.
- Backend golden regression: **506 passed**, **9 skipped**.
- Authenticated browser verification: single-page sections present; no wizard navigation; optional section collapses/expands; yearly mode works; Save/Cancel actions present.
- Final browser console check: **0 relevant DOM-nesting or key-spread warnings**.
- No emission records were created during verification. **MOCKED APIs: NONE.**