"""Targets domain — multi-target management per organization.

Stores reduction targets in MongoDB collection `emission_targets`.
Each target belongs to an organization and has one of three modes:
  - "total"     — single org-wide reduction target
  - "scope"     — per-scope (scope1/scope2/scope3/biogenic) targets
  - "category"  — per scope+category targets (with NA support)

Architecture is forward-compatible with future modes (net-zero,
science-based, intensity-based, milestones) — the `target_mode` and
`target_configuration` shape are intentionally generic.
"""
