"""
Internal Data AI Router — Chat endpoint + embedding admin endpoint.
"""
import logging
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from shared.database.mongo import db
from modules.auth.dependencies import get_current_user
from modules.internal_data_ai.intent_detector import detect_intent
from modules.internal_data_ai.planner import plan_service_calls
from modules.internal_data_ai.executor import execute_plan
from modules.internal_data_ai.response_builder import build_response
from modules.internal_data_ai.embedding_service import find_similar_entities, precompute_embeddings
from modules.internal_data_ai.reporting_periods import extract_explicit_period

logger = logging.getLogger(__name__)

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    session_id: str
    answer: str
    highlights: list = []
    suggestion: Optional[str] = None
    response_type: str = "text"
    raw_data: Optional[dict] = None
    chart: Optional[dict] = None
    evidence: Optional[list] = None
    intent: Optional[str] = None


@router.post("/internal-ai/chat", response_model=ChatResponse)
async def internal_ai_chat(
    request: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
    """Main chat endpoint for Internal Data AI."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization")

    # Get user's assigned facilities for permission filtering
    assigned_facilities = current_user.get("assigned_facilities")
    facility_ids = list(assigned_facilities) if assigned_facilities else None
    session_id = request.session_id or str(uuid.uuid4())

    # 1. Auto-precompute embeddings if missing
    emb_count = await db.internal_ai_embeddings.count_documents({"organization_id": {"$in": [org_id, "__global__"]}})
    if emb_count == 0:
        try:
            await precompute_embeddings(org_id, db)
            logger.info(f"Auto-precomputed embeddings for org {org_id}")
        except Exception as e:
            logger.warning(f"Auto-embed failed: {e}")

    # 2. Semantic entity resolution via embeddings
    entity_matches = await find_similar_entities(request.message, org_id, db, top_k=3)
    matched_entities = entity_matches.get("matches", [])

    # Build org context for intent detection
    org_context = {
        "org_id": org_id,
        "matched_entities": [
            {"type": m["entity_type"], "name": m.get("metadata", {}).get("name", m["text"]), "score": m["score"]}
            for m in matched_entities if m["score"] > 0.3
        ],
    }

    organization = await db.organizations.find_one(
        {"id": org_id},
        {"_id": 0, "reporting_year_type": 1, "financial_year_start_month": 1},
    )

    # 2. Intent detection
    intent_result = await detect_intent(request.message, org_context)
    intent_name = intent_result.get("intent", "summary")
    response_type = intent_result.get("response_type", "text")

    # Enrich entities from embedding matches
    entities = intent_result.get("entities", {})
    explicit_period = extract_explicit_period(request.message, organization)
    # The parser is authoritative: an LLM cannot invent a reporting period.
    entities["period"] = explicit_period.as_dict() if explicit_period else None
    for match in matched_entities:
        if match["score"] > 0.5:
            if match["entity_type"] == "facility" and not entities.get("facility"):
                entities["facility"] = match.get("metadata", {}).get("name")
            elif match["entity_type"] == "fuel" and not entities.get("fuel_type"):
                entities["fuel_type"] = match.get("metadata", {}).get("fuel_name")
    intent_result["entities"] = entities

    # 3. Plan service calls
    plan = plan_service_calls(intent_result)

    # 4. Execute plan
    service_data = await execute_plan(plan, org_id, facility_ids if facility_ids else None)

    # 5. Build response
    formatted = await build_response(
        question=request.message,
        intent=intent_result,
        service_data=service_data,
        response_type=response_type,
    )

    # 6. Save to conversation history
    await db.internal_ai_conversations.insert_one({
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "organization_id": org_id,
        "user_id": current_user.get("id"),
        "message": request.message,
        "intent": intent_name,
        "response": formatted.get("answer", ""),
        "response_type": response_type,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # Extract evidence files if present
    evidence_files = None
    if intent_name == "evidence_retrieval":
        ev_data = service_data.get("evidence", {})
        files = ev_data.get("files", [])
        if files:
            evidence_files = files

    return ChatResponse(
        session_id=session_id,
        answer=formatted.get("answer", ""),
        highlights=formatted.get("highlights", []),
        suggestion=formatted.get("suggestion"),
        response_type=formatted.get("response_type", response_type),
        raw_data=formatted.get("raw_data"),
        chart=formatted.get("chart"),
        evidence=evidence_files,
        intent=intent_name,
    )


@router.post("/internal-ai/embed")
async def initialize_embeddings(
    current_user: dict = Depends(get_current_user),
):
    """Pre-compute embeddings for the organization. Admin only."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization")

    result = await precompute_embeddings(org_id, db)
    return result


@router.get("/internal-ai/sessions")
async def get_sessions(
    current_user: dict = Depends(get_current_user),
):
    """Get conversation sessions for the current user."""
    user_id = current_user.get("id")
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {
            "_id": "$session_id",
            "last_message": {"$last": "$message"},
            "last_at": {"$last": "$created_at"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"last_at": -1}},
        {"$limit": 20},
    ]
    sessions = await db.internal_ai_conversations.aggregate(pipeline).to_list(20)
    return {
        "sessions": [
            {"session_id": s["_id"], "last_message": s["last_message"], "last_at": s["last_at"], "message_count": s["count"]}
            for s in sessions
        ]
    }


@router.get("/internal-ai/history/{session_id}")
async def get_session_history(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get conversation history for a session."""
    user_id = current_user.get("id")
    messages = await db.internal_ai_conversations.find(
        {"session_id": session_id, "user_id": user_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    return {"messages": messages}
