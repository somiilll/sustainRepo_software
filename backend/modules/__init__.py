"""
Domain modules. Each subpackage owns a single domain's:
  - router (FastAPI routes)
  - service (orchestration)
  - validators
  - repository (DB access)
  - contracts (request/response schemas)

Phase B1 status: skeletons created. Future phases will progressively
move routes from `server.py` into these modules without altering API
contracts or business logic.
"""
