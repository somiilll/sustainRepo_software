"""
Application bootstrap layer.

This package owns all "wire-up" responsibilities that happen exactly once
per process boot — environment loading, logger configuration, FastAPI
app construction, and the module-contract verifier.

Phase B1 status: skeleton placed, contract verifier wired into FastAPI
startup. Future phases will move the full app construction into
`app/bootstrap/app_factory.py`.
"""
