"""
Sandboxed expression evaluator.

Phase 1: restricted Python expressions using AST whitelisting.
Allowed:
  - Numeric literals
  - Variable names (only those in the provided env)
  - Arithmetic: + - * / **
  - Unary +/-
  - Comparisons: < <= > >= == !=
  - Boolean: and / or / not
  - Conditional: a if cond else b
  - Function calls: only whitelisted math functions (abs, min, max, round)
  - Parentheses

Rejected: attribute access, subscripting, imports, lambdas, comprehensions,
name binding, dunder names.
"""

from __future__ import annotations

import ast
import math
from typing import Any, Dict, Iterable

ALLOWED_FUNCS: Dict[str, Any] = {
    "abs": abs,
    "min": min,
    "max": max,
    "round": round,
    "pow": pow,
    "sqrt": math.sqrt,
}


class UnsafeExpressionError(ValueError):
    pass


_ALLOWED_NODE_TYPES = (
    ast.Expression,
    ast.BinOp, ast.UnaryOp, ast.BoolOp, ast.Compare, ast.IfExp,
    ast.Load,
    ast.Constant,  # ast.Num/ast.Str deprecated in Python 3.8+, use ast.Constant
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.Pow, ast.FloorDiv,
    ast.USub, ast.UAdd,
    ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.Eq, ast.NotEq,
    ast.And, ast.Or, ast.Not,
    ast.Name, ast.Call,
)


def extract_variable_names(expression: str) -> set[str]:
    """Return the set of bare variable names referenced by a safe expression."""
    tree = ast.parse(expression, mode="eval")
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            if node.id not in ALLOWED_FUNCS:
                names.add(node.id)
    return names


def safe_eval(expression: str, env: Dict[str, Any], allowed_names: Iterable[str]) -> Any:
    """Evaluate `expression` using `env` values."""
    tree = ast.parse(expression, mode="eval")
    allowed_set = set(allowed_names) | set(ALLOWED_FUNCS.keys())

    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_NODE_TYPES):
            raise UnsafeExpressionError(
                f"Disallowed construct {type(node).__name__} in expression: {expression!r}"
            )
        if isinstance(node, ast.Name):
            if node.id.startswith("__"):
                raise UnsafeExpressionError("Dunder names not allowed")
            if node.id not in allowed_set:
                raise UnsafeExpressionError(
                    f"Unknown identifier '{node.id}' in expression: {expression!r}"
                )
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in ALLOWED_FUNCS:
                raise UnsafeExpressionError("Only whitelisted math functions may be called")

    combined_env = {**ALLOWED_FUNCS, **env}
    return eval(compile(tree, "<calc_engine>", "eval"), {"__builtins__": {}}, combined_env)
