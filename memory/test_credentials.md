# Test Credentials

## ESG Platform Authentication

**IMPORTANT:** This ESG platform fork uses the `users_esg` MongoDB collection for authentication.
The legacy `users` collection is no longer used for login.

---

## ESG Super Admin (PRIMARY LOGIN)
- **Email:** esg-superadmin@sustainrepo.com
- **Password:** ESGAdmin123!
- **Role:** super_admin
- **Access:** Full ESG platform access, all SuperAdmin features
- **Collection:** users_esg

---

## Legacy Credentials (NO LONGER WORK)
The following credentials are from the legacy `users` collection and will NOT work for login:
- ~~superadmin@ecotrack.com~~ (Legacy GHG platform)
- ~~goyalsomil@hotmail.com~~ (Legacy admin)
- ~~goyalsomil2@hotmail.com~~ (Legacy admin)
- ~~ruthvikanchuri3123@gmail.com~~ (Legacy user)

**To create new admins/users:** Use the ESG Super Admin account to create new organization admins via the platform UI.

---

## Notes
- ESG Platform uses `users_esg` collection for all authentication
- All passwords follow the pattern: minimum 8 characters with uppercase, lowercase, and numbers
- Super Admin can manage all organizations, users, and ESG configurations
- ESG Frameworks can be enabled per organization (BRSR, GRI, SBTi)
