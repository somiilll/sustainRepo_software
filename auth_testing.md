# Dashboard Authorization Regression Checks

1. Sign in with the admin and restricted user accounts in `/app/memory/test_credentials.md`.
2. Request `GET /api/esg-records/dashboard-metrics?start_date=2026-04&end_date=2027-03` with each bearer token.
3. Confirm the restricted response has no Scope 2 electricity and its total does not exceed the admin total.
4. Repeat with an unauthorized `facility_ids` query value; confirm it does not broaden the restricted user's data scope.