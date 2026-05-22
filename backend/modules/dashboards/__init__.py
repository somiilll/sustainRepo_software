"""
Dashboards domain — `get_dashboard_stats` aggregation pipelines.

Phase B7 will extract the dashboard stats query into testable
aggregation builders. This will also fix the P1 'no data after
toggling org access' bug, currently caused by the inline query in
`server.py` not refreshing scope-aware permissions.
"""
