"""
Audit domain — calc audit trail orchestration.

Currently lives in `audit_logger.py` (346 lines). Phase B5 will integrate
it into the centralized audit pipeline:
    validate → normalize → calculate → persist → audit → emit → respond.
Audit persistence MUST never be optional or route-specific.
"""
