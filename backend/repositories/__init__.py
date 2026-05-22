"""
Repositories — DB access abstraction.

Routes/services should NEVER call `db.collection.find_one(...)` directly.
Each domain owns a repository module under this package that exposes
typed methods (e.g., `users_repository.find_by_email(email)`).

Phase B1 status: package skeleton created. Each subsequent phase will
populate the corresponding repository as that domain is extracted.
"""
