# Future Architecture: Dynamic ESG Disclosure Engine

**Status:** PLANNED (Not Started)
**Priority:** Future Milestone
**Estimated Effort:** 11-16 weeks

---

## Overview

Build a fully metadata-driven, schema-driven ESG Disclosure Engine that supports:
- BRSR, GRI, CSRD, SASB, TCFD, and future frameworks
- Dynamic UI rendering from database metadata
- No hardcoded questions, sections, or answer types
- Super Admin framework builder (no-code)

---

## Core Principle

**SEPARATE:**
1. Disclosure Configuration (what should be asked)
2. Organization Responses (what organization answered)

---

## Backend Module Structure

```
/backend/modules/esg_framework_engine/
├── router.py
├── service.py
├── repository.py
├── renderer_service.py
├── validation_engine.py
├── visibility_engine.py
├── dependency_engine.py
└── schema_parser.py
```

---

## Database Collections

### 1. esg_frameworks
- id, framework_key, framework_name, framework_version
- description, is_active, created_at, updated_at

### 2. esg_framework_sections
- id, framework_id, parent_section_id (nullable)
- section_key, section_name, section_description
- display_order, icon, is_active
- Supports: nested sections, subtabs, subsection hierarchy

### 3. esg_disclosures
- id, framework_id, section_id, subsection_id
- disclosure_key, title, description, guidance
- **input_type** (text, textarea, number, table, yes_no, etc.)
- **response_mode** (atomic, fy_comparison, cy_comparison, periodic)
- **answer_schema** (JSON - drives entire frontend rendering)
- validation_rules, visibility_conditions, dependencies
- applicability_rules, calculation_rules
- default_value, unit, display_order
- is_required, is_kpi, is_active, version

### 4. esg_responses (enhanced)
- id, organization_id, framework_id, disclosure_id
- reporting_period_type, reporting_period_value
- response_data (JSON), response_status, version
- submitted_by, last_response_updated_at

---

## Supported Input Types

- text, textarea, number, percentage, currency
- yes_no, yes_no_with_text, yes_no_with_description, yes_no_with_nested_details
- single_select, multi_select, radio, checkbox
- url, file_upload, date, year
- table, multi_table, nested_table, dynamic_rows
- conditional_group, kpi_reference, calculated_field

---

## Example answer_schema

### Table
```json
{
  "type": "table",
  "columns": [
    { "key": "base_year", "label": "Base Year", "type": "number", "required": true },
    { "key": "target_year", "label": "Target Year", "type": "number" },
    { "key": "indicator", "label": "Indicator", "type": "text" }
  ]
}
```

### Conditional
```json
{
  "type": "yes_no",
  "children": [
    {
      "show_if": { "equals": "yes" },
      "type": "textarea",
      "label": "Provide details"
    }
  ]
}
```

---

## Frontend Structure

```
/frontend/src/modules/esg-framework-engine/
├── DisclosureRenderer.jsx
├── SchemaRenderer.jsx
├── DynamicTableRenderer.jsx
├── ConditionalRenderer.jsx
├── ValidationRenderer.jsx
├── SectionRenderer.jsx
└── KPIRenderer.jsx
```

Use **component registry pattern** - no switch-case explosion.

---

## Engines to Build

1. **Visibility Engine** - show/hide based on conditions
2. **Validation Engine** - dynamic validations (required, min, max, regex)
3. **Dependency Engine** - cross-disclosure dependencies
4. **Applicability Engine** - framework/sector/geography-based applicability

---

## Super Admin Features

- Framework Management
- Section Management (nested)
- Disclosure Builder (visual schema editor)
- Validation Rules Builder
- Conditional Logic Builder
- Applicability Rules

---

## Migration Notes

Current system data is **fully migratable**:
- Keep `legacy_question_key` field for mapping
- Transform `response_data` JSON structure
- One-time migration scripts (~1-2 weeks per framework)

---

## Implementation Phases

| Phase | Description | Weeks |
|-------|-------------|-------|
| 1 | DB Schema + Basic CRUD APIs | 2-3 |
| 2 | Rendering Engine (text, number, table) | 2-3 |
| 3 | Visibility + Validation Engines | 2-3 |
| 4 | Super Admin Builder UI | 2-3 |
| 5 | BRSR Migration + Testing | 2-3 |

---

## Long-Term Support

This architecture will support:
- AI-assisted disclosure mapping
- Automated reporting
- Cross-framework mapping
- Dynamic dashboards
- Multilingual disclosures
- PDF report generation
- Audit/reviewer/approver workflows
- Evidence uploads
- Disclosure scoring

---

**Document Created:** July 2025
**To Be Implemented:** TBD
