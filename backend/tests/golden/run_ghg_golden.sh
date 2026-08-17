#!/usr/bin/env bash
# Phase 0 GHG golden safety net — full run.
#
# READ-ONLY: every calculation replay uses dry_run=true; no emission record,
# audit log or reference-data document is created, updated or deleted.
#
#   bash /app/backend/tests/golden/run_ghg_golden.sh
set -euo pipefail

echo "=== Backend golden suite ==="
cd /app/backend
python3 -m pytest tests/golden -q

echo
echo "=== Frontend golden suite ==="
cd /app/frontend
CI=true npx react-scripts test --watchAll=false --testPathPattern="golden"
