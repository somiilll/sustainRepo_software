"""Approvals module — per-org approval workflow extension.

Future-proof payload shape (multi-stage / multi-approver) is in `contracts.py`.
The current MVP enforces a single Admin-review stage, but the data model
already accepts multiple stages so v2 can expand without migration.
"""
