"""Single source of truth for approval chains and where an approver enters them.

An assignment stores its chain as `approval_chain` (user ids, or dicts with `approver_id`) and,
for older single-approver assignments, `approver_id`. Levels are 1-based.
"""
from typing import Any, Dict, Iterable, List, Optional, Tuple, Union

DIRECT = "direct"  # the user is the final approver: their own data changes need no further approval

EntryLevel = Union[int, str, None]  # next level to approve at, DIRECT, or None when not an approver


def normalize_chain(assignment: Optional[Dict[str, Any]]) -> List[str]:
    """Ordered approver user ids for an assignment (falls back to its single approver_id)."""
    if not assignment:
        return []
    ids = [c if isinstance(c, str) else (c or {}).get("approver_id") for c in assignment.get("approval_chain") or []]
    ids = [c for c in ids if c]
    return ids or ([assignment["approver_id"]] if assignment.get("approver_id") else [])


def clamp_level(chain: List[str], level: int) -> int:
    return max(1, min(level, len(chain)))


def approvers_at_level(chain: List[str], level: int = 1) -> List[str]:
    return [chain[clamp_level(chain, level) - 1]] if chain else []


def entry_level(chain: List[str], user_id: str, *, require_membership: bool = False) -> EntryLevel:
    """Where a change made by this approver enters the chain: the next level, or DIRECT for the final approver.

    A user matched on approver_id but absent from the chain is treated as final unless require_membership."""
    if user_id not in chain:
        return None if require_membership or not chain else DIRECT
    index = chain.index(user_id)
    return DIRECT if index + 1 >= len(chain) else index + 2


def best_entry(assignments: Iterable[Dict[str, Any]], user_id: str) -> Tuple[EntryLevel, Optional[Dict[str, Any]]]:
    """Most permissive entry across assignments: DIRECT wins, otherwise the lowest next level."""
    best: Tuple[EntryLevel, Optional[Dict[str, Any]]] = (None, None)
    for assignment in assignments:
        level = entry_level(normalize_chain(assignment), user_id)
        if level == DIRECT:
            return DIRECT, assignment
        if isinstance(level, int) and (best[0] is None or level < best[0]):
            best = (level, assignment)
    return best
