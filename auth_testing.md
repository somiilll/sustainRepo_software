# Dashboard Authorization Regression Checks

1. Sign in with the admin and restricted user accounts in `/app/memory/test_credentials.md`.
2. Request `GET /api/esg-records/dashboard-metrics?start_date=2026-04&end_date=2027-03` with each bearer token.
3. Confirm the restricted response has no Scope 2 electricity and its total does not exceed the admin total.
4. Repeat with an unauthorized `facility_ids` query value; confirm it does not broaden the restricted user's data scope.

## Login and CORS Regression Checks

1. Confirm a valid admin login returns HTTP 200 and a bearer access token.
2. Submit five invalid passwords for an unused valid-format email; the next attempt must return HTTP 429.
3. Confirm a valid admin login still succeeds after the unrelated lockout check.
4. Send an OPTIONS request to `/api/auth/login` from the configured frontend origin; it must return that explicit origin.
5. Send the same request from an untrusted origin; it must not return an `Access-Control-Allow-Origin` header.

## Supplier Soft-Deactivation Checks

1. Sign in with an active supplier account and retain the access and refresh tokens.
2. As the parent organization, call `DELETE /api/supplier-assessment/suppliers/{supplier_id}`.
3. Confirm subsequent supplier login, `POST /api/auth/refresh`, and authenticated `/api/auth/me` requests return HTTP 403 with the supplier-access deactivation message.
4. Confirm the supplier relationship and all related assessment documents remain in MongoDB; only `supplier_relationships.is_active` is set to `false`.