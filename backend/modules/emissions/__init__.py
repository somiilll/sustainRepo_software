"""
Emissions domain — emission record CRUD + per-category modules.

Future phase B10: per-category modules (Scope1Module, Scope2Module,
C1PurchasedGoodsModule, …, C7EmployeeCommutingModule, …, C15Module)
each owning validators, calculators, payload transformers, normalizers,
audit context, report formatting, upload parsing, and EF resolution —
mirroring the frontend's `categoryRegistry`.
"""
