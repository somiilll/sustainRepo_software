"""Cross-framework answer links (e.g. BRSR <-> GRI): autofill gaps, and push a saved answer to the linked questions."""
import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from shared.audit_trail.diff import PathChange
from shared.audit_trail.models import AuditAction, AuditActor, AuditSource
from shared.audit_trail.service import audit_trail_service
from shared.database.mongo import db

SCALAR_TYPES = {"text", "textarea", "number", "url", "email", "date", "select", "yes_no"}
UNSUPPORTED = object()


def _empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, dict):
        return all(_empty(v) for v in value.values())
    if isinstance(value, list):
        return all(_empty(v) for v in value)
    return False


def _sha(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()


def _get_path(value: Any, path: Optional[str]) -> Any:
    for part in [p for p in (path or "").split(".") if p]:
        value = value.get(part) if isinstance(value, dict) else None
    return value


def _flatten_text(value: Any) -> str:
    if isinstance(value, dict):
        value = list(value.values())
    if isinstance(value, list):
        return ", ".join(t for t in (_flatten_text(v) for v in value) if t)
    return "" if value is None else str(value).strip()


def convert(src_value: Any, src_path: Optional[str], tgt_path: Optional[str], tgt_type: Optional[str], tgt_existing: Any) -> Any:
    """Value the target should hold, or UNSUPPORTED when the shapes cannot be mapped."""
    value = _get_path(src_value, src_path)
    if tgt_path:
        base = dict(tgt_existing) if isinstance(tgt_existing, dict) else {}
        node = base
        parts = [p for p in tgt_path.split(".") if p]
        for part in parts[:-1]:
            node[part] = dict(node.get(part) or {})
            node = node[part]
        node[parts[-1]] = _flatten_text(value) if isinstance(value, (dict, list)) else value
        return base
    if tgt_type not in SCALAR_TYPES:
        return UNSUPPORTED
    return _flatten_text(value) if isinstance(value, (dict, list)) else value


async def _config(framework: str, key: str) -> Dict[str, Any]:
    doc = await db.esg_question_configs.find_one(
        {"question_key": key, "$or": [{"framework": framework}, {"frameworks": framework}]}, {"_id": 0})
    if doc:
        return doc
    # GRI sub-question answers are stored as "<question>_<sub_key>"
    parent = key.rsplit("_", 1)[0]
    return await db.esg_question_configs.find_one(
        {"question_key": parent, "$or": [{"framework": framework}, {"frameworks": framework}]}, {"_id": 0}) or {}


def _label(config: Dict[str, Any], key: str) -> str:
    text = config.get("question") or config.get("description") or key
    prefix = f"GRI {config['disclosure_id']} · " if config.get("disclosure_id") else ""
    return (prefix + text)[:200]


def _type(config: Dict[str, Any]) -> Optional[str]:
    return None if config.get("sub_questions") else (config.get("type") or config.get("input_type"))


async def _directions() -> List[Dict[str, Any]]:
    out = []
    async for link in db.framework_question_links.find({"active": {"$ne": False}}, {"_id": 0}):
        out.append({"id": link["id"], "src_fw": link["framework_a"], "src_key": link["key_a"], "src_path": link.get("path_a"),
                    "tgt_fw": link["framework_b"], "tgt_key": link["key_b"], "tgt_path": link.get("path_b")})
        out.append({"id": link["id"], "src_fw": link["framework_b"], "src_key": link["key_b"], "src_path": link.get("path_b"),
                    "tgt_fw": link["framework_a"], "tgt_key": link["key_a"], "tgt_path": link.get("path_a")})
    return out


async def _doc(org_id: str, framework: str, key: str, period: str) -> Optional[Dict[str, Any]]:
    return await db.organization_esg_responses.find_one(
        {"org_id": org_id, "framework": framework, "question_key": key, "reporting_year": period}, {"_id": 0})


def _is_auto(doc: Optional[Dict[str, Any]]) -> bool:
    link = (doc or {}).get("linked_from")
    return bool(link) and link.get("value_sha") == _sha(doc.get("value"))


async def _write(org_id: str, period: str, direction: Dict[str, Any], new_value: Any, old_doc: Optional[Dict[str, Any]],
                 actor: AuditActor, user_id: Optional[str], auto: bool, config: Dict[str, Any]) -> None:
    now = datetime.now(timezone.utc).isoformat()
    old_value = (old_doc or {}).get("value")
    fields = {"value": new_value, "status": "saved" if not _empty(new_value) else "pending", "organization_id": org_id,
              "section": config.get("section"), "updated_at": now}
    if user_id:
        fields["updated_by"] = user_id
    unset = {}
    if auto:
        fields["linked_from"] = {"framework": direction["src_fw"], "question_key": direction["src_key"], "value_sha": _sha(new_value)}
    else:
        unset["linked_from"] = ""
    update = {"$set": fields, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}}
    if unset:
        update["$unset"] = unset
    await db.organization_esg_responses.update_one(
        {"org_id": org_id, "framework": direction["tgt_fw"], "question_key": direction["tgt_key"], "reporting_year": period}, update, upsert=True)
    await audit_trail_service.record_system_changes(
        framework=direction["tgt_fw"], organization_id=org_id, reporting_period=period, question_key=direction["tgt_key"],
        changes=[PathChange(path="value", old=old_value, new=new_value)], scalar=True, state_token=_sha([old_value, new_value, now]),
        source=AuditSource(type="framework_link", source_tags=[f"{direction['src_fw']}:{direction['src_key']}"], triggered_by_user_id=user_id),
        action=AuditAction.FRAMEWORK_LINKED, actor=actor)


async def sync_linked_values(org_id: str, period: str, triggered_by: Optional[str] = None) -> Dict[str, Any]:
    """Fill linked questions that have no answer of their own, and keep still-untouched auto-filled answers current."""
    actor = AuditActor(name="Framework link (System)")
    updated = 0
    for d in await _directions():
        src, tgt = await _doc(org_id, d["src_fw"], d["src_key"], period), await _doc(org_id, d["tgt_fw"], d["tgt_key"], period)
        tgt_manual = tgt is not None and not _empty(tgt.get("value")) and not _is_auto(tgt)
        if tgt_manual:
            continue
        config = await _config(d["tgt_fw"], d["tgt_key"])
        src_has = src is not None and src.get("status") in ("saved", "approved") and not _empty(_get_path(src.get("value"), d["src_path"]))
        if not src_has:
            if _is_auto(tgt) and (tgt.get("linked_from") or {}).get("question_key") == d["src_key"]:
                await _write(org_id, period, d, "", tgt, actor, triggered_by, False, config)
                updated += 1
            continue
        new_value = convert(src["value"], d["src_path"], d["tgt_path"], _type(config), (tgt or {}).get("value"))
        if new_value is UNSUPPORTED or (tgt is not None and tgt.get("value") == new_value):
            continue
        await _write(org_id, period, d, new_value, tgt, actor, triggered_by, True, config)
        updated += 1
    return {"reporting_period": period, "updated": updated}


async def check_targets(org_id: str, framework: str, keys: List[str], period: str) -> List[Dict[str, Any]]:
    """Linked questions whose answer differs from what was just saved (for the 'save in other framework too?' prompt)."""
    out = []
    for d in await _directions():
        if d["src_fw"] != framework or d["src_key"] not in keys:
            continue
        src, tgt = await _doc(org_id, framework, d["src_key"], period), await _doc(org_id, d["tgt_fw"], d["tgt_key"], period)
        if src is None or _empty(_get_path(src.get("value"), d["src_path"])):
            continue
        config = await _config(d["tgt_fw"], d["tgt_key"])
        new_value = convert(src["value"], d["src_path"], d["tgt_path"], _type(config), (tgt or {}).get("value"))
        current = (tgt or {}).get("value")
        if new_value is UNSUPPORTED or new_value == current:
            continue
        out.append({"framework": d["tgt_fw"], "question_key": d["tgt_key"], "source_key": d["src_key"], "label": _label(config, d["tgt_key"]),
                    "current_value": _flatten_text(current) if isinstance(current, (dict, list)) else current,
                    "new_value": _flatten_text(new_value) if isinstance(new_value, (dict, list)) else new_value})
    return out


async def push_values(org_id: str, user: Dict[str, Any], framework: str, period: str, targets: List[Dict[str, str]]) -> int:
    """Copy the current saved answer into the chosen linked questions (values are recomputed server-side)."""
    actor = AuditActor(name=user.get("full_name") or user.get("name") or user.get("email") or "User", type="user", user_id=user.get("id"))
    wanted = {(t["framework"], t["question_key"], t["source_key"]) for t in targets}
    pushed = 0
    for d in await _directions():
        if d["src_fw"] != framework or (d["tgt_fw"], d["tgt_key"], d["src_key"]) not in wanted:
            continue
        src, tgt = await _doc(org_id, framework, d["src_key"], period), await _doc(org_id, d["tgt_fw"], d["tgt_key"], period)
        if src is None or _empty(_get_path(src.get("value"), d["src_path"])):
            continue
        config = await _config(d["tgt_fw"], d["tgt_key"])
        new_value = convert(src["value"], d["src_path"], d["tgt_path"], _type(config), (tgt or {}).get("value"))
        if new_value is UNSUPPORTED or (tgt is not None and tgt.get("value") == new_value):
            continue
        await _write(org_id, period, d, new_value, tgt, actor, user.get("id"), False, config)
        pushed += 1
    return pushed


async def autofilled_map(org_id: str, framework: str, period: str) -> Dict[str, Any]:
    """Questions whose answer is still the untouched auto-filled value, with the question it came from."""
    out = {}
    async for doc in db.organization_esg_responses.find(
            {"org_id": org_id, "framework": framework, "reporting_year": period, "linked_from": {"$exists": True}},
            {"_id": 0, "question_key": 1, "value": 1, "linked_from": 1}):
        if _is_auto(doc):
            link = doc["linked_from"]
            config = await _config(link["framework"], link["question_key"])
            out[doc["question_key"]] = {"framework": link["framework"], "question_key": link["question_key"], "label": _label(config, link["question_key"])}
    return out
