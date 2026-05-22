"""
Uploads domain — bulk upload parsers, validators, normalizers, processors.

Currently:
  - `bulk_upload.py` (734 lines, monolithic Scope 3 entry point)
  - `bulk_upload_scope3/` (already partially modularized)

Phase B6 will:
  1. Promote `bulk_upload_scope3/` into `modules/uploads/scope3/`.
  2. Add `modules/uploads/scope1/` and `modules/uploads/scope2/`
     skeletons matching the frontend `Scope1Module` / `Scope2Module`
     placeholders.
"""
