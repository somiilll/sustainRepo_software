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

## Supplier Account Revocation Checks

1. Sign in with an active supplier account and retain the access and refresh tokens.
2. As the parent organization, call `DELETE /api/supplier-assessment/suppliers/{supplier_id}`.
3. Confirm the linked supplier user has `is_active: false`, a revocation timestamp, and the deactivating relationship ID.
4. Confirm subsequent supplier login and authenticated `/api/auth/me` requests return HTTP 403; the prior bearer token must be rejected immediately.
5. Confirm the supplier relationship and related assessment documents remain in MongoDB; the relationship is inactive while the supplier user account is revoked.

## Supplier First-Login Invitation Status Checks

1. Sign in with an active supplier whose relationship status is `pending`.
2. Confirm their active pending relationship becomes `accepted` and receives `accepted_at` after the successful login.
3. Confirm later supplier API calls preserve `accepted` while completion is below 100%, and preserve `completed` when it is complete.
4. Confirm an invalid login does not update supplier relationship status.