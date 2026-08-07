"""
MongoDB Vector Store for Repo Pilot.
Replaces ChromaDB with MongoDB — stores embeddings as arrays,
computes cosine similarity in Python via numpy.
"""
import numpy as np
from typing import Any, Dict, List, Optional
from shared.database.mongo import db

COLLECTION = "repo_pilot_chunks"


async def add_chunks(
    org_id: str, doc_id: str,
    documents: List[str], metadatas: List[Dict], embeddings: List[List[float]], ids: List[str],
):
    """Insert chunks with embeddings into MongoDB."""
    docs = []
    for i, (text, meta, emb, chunk_id) in enumerate(zip(documents, metadatas, embeddings, ids)):
        docs.append({
            "chunk_id": chunk_id,
            "organization_id": org_id,
            "doc_id": doc_id,
            "page_num": meta.get("page_num", 1),
            "text": text,
            "embedding": emb,
        })
    if docs:
        await db[COLLECTION].insert_many(docs)
    return len(docs)


async def query_similar(
    org_id: str, query_embedding: List[float], top_k: int = 15,
    doc_filters: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Find top_k most similar chunks using cosine similarity.

    Uses a streaming min-heap to avoid loading all embeddings into memory.
    Only top_k results are kept at any time — peak memory is O(top_k), not O(N).
    """
    import heapq

    query = {"organization_id": org_id}
    if doc_filters:
        query["doc_id"] = {"$in": doc_filters}

    q_vec = np.array(query_embedding, dtype=np.float32)
    q_norm = np.linalg.norm(q_vec)
    if q_norm == 0:
        return {"documents": [], "metadatas": []}

    # Min-heap of (score, index, chunk_data) — keeps only top_k best
    heap: list = []
    idx = 0

    cursor = db[COLLECTION].find(query, {"_id": 0})
    async for chunk in cursor:
        emb = chunk.get("embedding")
        if not emb:
            continue
        c_vec = np.array(emb, dtype=np.float32)
        c_norm = np.linalg.norm(c_vec)
        if c_norm == 0:
            continue
        sim = float(np.dot(q_vec, c_vec) / (q_norm * c_norm))
        # Store minimal data to keep heap small
        item = (sim, idx, {"text": chunk["text"], "doc_id": chunk["doc_id"], "page_num": chunk["page_num"]})
        if len(heap) < top_k:
            heapq.heappush(heap, item)
        elif sim > heap[0][0]:
            heapq.heapreplace(heap, item)
        idx += 1

    if not heap:
        return {"documents": [], "metadatas": []}

    # Sort descending by score
    top = sorted(heap, key=lambda x: x[0], reverse=True)
    return {
        "documents": [c["text"] for _, _, c in top],
        "metadatas": [{"doc_id": c["doc_id"], "page_num": c["page_num"]} for _, _, c in top],
    }


async def get_by_filter(org_id: str, filters: Dict) -> Dict[str, Any]:
    """Get chunks by exact filter (for page fetch)."""
    query = {"organization_id": org_id, **filters}
    chunks = await db[COLLECTION].find(query, {"_id": 0, "embedding": 0}).to_list(1000)
    return {
        "documents": [c["text"] for c in chunks],
        "metadatas": [{"doc_id": c["doc_id"], "page_num": c["page_num"]} for c in chunks],
    }


async def get_active_documents(org_id: str) -> List[str]:
    """Get unique doc_ids for an org."""
    return await db[COLLECTION].distinct("doc_id", {"organization_id": org_id})


async def delete_document(org_id: str, doc_id: str) -> int:
    """Delete all chunks for a document."""
    result = await db[COLLECTION].delete_many({"organization_id": org_id, "doc_id": doc_id})
    return result.deleted_count
