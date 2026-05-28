# Test Credentials

## SuperAdmin
- **Email:** superadmin@ecotrack.com
- **Password:** SuperAdmin123!
- **Role:** super_admin
- **Access:** Full platform access, all SuperAdmin features

## OILES INDIA PVT. LTD. (Primary Test Org)
- **Email:** goyalsomil@hotmail.com
- **Password:** Test123!
- **Role:** admin
- **Organization:** OILES INDIA PVT. LTD.
- **Facilities:** Facility A, B, C, D, E

## Test Org 2 (Secondary)
- **Email:** goyalsomil2@hotmail.com
- **Password:** Test123!
- **Role:** admin
- **Organization:** test-org-2

## ORG1 — Regular User (for Approval Workflow V2 testing)
- **Email:** ruthvikanchuri3123@gmail.com
- **Password:** Test123!
- **Role:** user
- **Organization:** ORG1 (approval_workflow_enabled=True)
- **Assigned Facilities:** 0f882e69-1be4-44d2-a1ec-cc7af296ab8b, 39ecd9be-9417-4df6-93c4-e583abf49260, 8735e369-70f9-4c12-a0b2-d8fbf194cd4d
- **Admin counterpart:** goyalsomil@hotmail.com (admin of ORG1, same org)
- **Notes:** Use this pair to test V2 approval workflow E2E. All 13 V2 flow tests pass with these creds.

## Notes
- All passwords follow the pattern: minimum 8 characters with uppercase, lowercase, and numbers
- SuperAdmin can manage all organizations, users, and platform configurations
- Admin can manage their assigned organization and facilities
- OILES INDIA is the primary test organization for Scope 3 bulk upload testing
