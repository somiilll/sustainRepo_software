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
    """Find top_k most similar chunks using cosine similarity."""
    query = {"organization_id": org_id}
    if doc_filters:
        query["doc_id"] = {"$in": doc_filters}

    cursor = db[COLLECTION].find(query, {"_id": 0})
    all_chunks = await cursor.to_list(50000)

    if not all_chunks:
        return {"documents": [], "metadatas": []}

    # Compute cosine similarity
    q_vec = np.array(query_embedding, dtype=np.float32)
    q_norm = np.linalg.norm(q_vec)
    if q_norm == 0:
        return {"documents": [], "metadatas": []}

    scored = []
    for chunk in all_chunks:
        emb = chunk.get("embedding")
        if not emb:
            continue
        c_vec = np.array(emb, dtype=np.float32)
        c_norm = np.linalg.norm(c_vec)
        if c_norm == 0:
            continue
        sim = float(np.dot(q_vec, c_vec) / (q_norm * c_norm))
        scored.append((sim, chunk))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:top_k]

    return {
        "documents": [c["text"] for _, c in top],
        "metadatas": [{"doc_id": c["doc_id"], "page_num": c["page_num"]} for _, c in top],
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
