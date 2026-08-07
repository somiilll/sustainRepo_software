"""
Embedding service — Pre-computes and queries embeddings for semantic entity resolution.
Uses text-embedding-3-large for matching user queries to DB entities.
"""
import os
import logging
from typing import List
from openai import OpenAI

logger = logging.getLogger(__name__)

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
EMBED_MODEL = "text-embedding-3-large"


def _cosine_sim(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(x * x for x in b) ** 0.5
    return dot / (na * nb) if na and nb else 0


def embed_texts(texts: List[str]) -> List[List[float]]:
    """Embed a batch of texts using text-embedding-3-large."""
    if not texts:
        return []
    try:
        resp = client.embeddings.create(input=texts, model=EMBED_MODEL)
        return [item.embedding for item in resp.data]
    except Exception as e:
        logger.error(f"Embedding failed: {e}")
        return []


def embed_single(text: str) -> List[float]:
    """Embed a single text."""
    result = embed_texts([text])
    return result[0] if result else []


async def find_similar_entities(query: str, org_id: str, db, top_k: int = 5) -> dict:
    """Find entities most similar to the user query using pre-computed embeddings.

    Uses a streaming min-heap to avoid loading all embeddings into memory.
    Only top_k results are kept at any time — peak memory is O(top_k), not O(N).
    """
    import heapq

    query_embedding = embed_single(query)
    if not query_embedding:
        return {"matches": []}

    cursor = db.internal_ai_embeddings.find(
        {"organization_id": {"$in": [org_id, "__global__"]}},
        {"_id": 0}
    )

    # Min-heap of (score, index, match_data) — keeps only top_k best
    heap: list = []
    idx = 0
    has_any = False

    async for c in cursor:
        has_any = True
        emb = c.get("embedding")
        if not emb:
            continue
        score = _cosine_sim(query_embedding, emb)
        item = (score, idx, {
            "text": c.get("text"),
            "entity_type": c.get("entity_type"),
            "entity_id": c.get("entity_id"),
            "metadata": c.get("metadata"),
        })
        if len(heap) < top_k:
            heapq.heappush(heap, item)
        elif score > heap[0][0]:
            heapq.heapreplace(heap, item)
        idx += 1

    if not has_any:
        return {"matches": [], "note": "No pre-computed embeddings. Run /api/internal-ai/embed to initialize."}

    # Sort descending by score, add rounded score to output
    top = sorted(heap, key=lambda x: x[0], reverse=True)
    return {"matches": [{**m, "score": round(s, 4)} for s, _, m in top]}


async def precompute_embeddings(org_id: str, db) -> dict:
    """Pre-compute embeddings for key entities in the organization."""
    entries = []

    # 1. Facilities
    facilities = await db.facilities.find({"organization_id": org_id}, {"_id": 0, "id": 1, "name": 1, "address": 1, "sector": 1}).to_list(100)
    for f in facilities:
        text = f"Facility: {f.get('name')} at {f.get('address', '')} sector {f.get('sector', '')}"
        entries.append({"text": text, "entity_type": "facility", "entity_id": f["id"], "organization_id": org_id, "metadata": {"name": f.get("name")}})

    # 2. Emission categories
    categories = await db.emission_categories.find({"is_active": True}, {"_id": 0}).to_list(50)
    for c in categories:
        text = f"Emission category: {c.get('name')} - {c.get('description', '')} (Scope {c.get('scope_id', '')})"
        entries.append({"text": text, "entity_type": "emission_category", "entity_id": c["id"], "organization_id": "__global__", "metadata": {"name": c.get("name")}})

    # 3. Fuel database (top entries)
    fuels = await db.fuel_database.find({}, {"_id": 0, "fuel_name": 1, "category": 1, "scope": 1}).to_list(500)
    for f in fuels:
        text = f"Fuel: {f.get('fuel_name')} category {f.get('category', '')} scope {f.get('scope', '')}"
        entries.append({"text": text, "entity_type": "fuel", "entity_id": f.get("fuel_name"), "organization_id": "__global__", "metadata": {"fuel_name": f.get("fuel_name"), "category": f.get("category")}})

    # 4. ESG KPI definitions
    kpis = await db.esg_kpi_definitions.find({}, {"_id": 0, "id": 1, "metric_name": 1, "short_name": 1, "section": 1, "category_name": 1}).to_list(400)
    for k in kpis:
        text = f"KPI: {k.get('metric_name') or k.get('short_name')} section {k.get('section', '')} category {k.get('category_name', '')}"
        entries.append({"text": text, "entity_type": "kpi", "entity_id": k.get("id"), "organization_id": "__global__", "metadata": {"name": k.get("metric_name")}})

    # 5. Targets
    targets = await db.esg_targets.find({"organization_id": org_id}, {"_id": 0, "id": 1, "target_name": 1, "section": 1, "category": 1}).to_list(50)
    for t in targets:
        text = f"Target: {t.get('target_name')} section {t.get('section', '')} category {t.get('category', '')}"
        entries.append({"text": text, "entity_type": "target", "entity_id": t["id"], "organization_id": org_id, "metadata": {"name": t.get("target_name")}})

    if not entries:
        return {"status": "no_data", "count": 0}

    # Batch embed
    texts = [e["text"] for e in entries]
    batch_size = 100
    all_embeddings = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        embs = embed_texts(batch)
        all_embeddings.extend(embs)

    # Store in DB
    await db.internal_ai_embeddings.delete_many({"organization_id": {"$in": [org_id, "__global__"]}})
    docs = []
    for entry, emb in zip(entries, all_embeddings):
        if emb:
            entry["embedding"] = emb
            docs.append(entry)

    if docs:
        await db.internal_ai_embeddings.insert_many(docs)

    return {"status": "ok", "count": len(docs), "entity_types": list(set(e["entity_type"] for e in entries))}
