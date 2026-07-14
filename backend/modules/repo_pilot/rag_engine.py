"""
RAG Engine for Repo Pilot.
Adapted from original rag.py — same prompts/logic, MongoDB vector store.
"""
import os
import re
import json
import logging
from openai import OpenAI
import anthropic

logger = logging.getLogger(__name__)

openai_client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
anthropic_client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """You are an expert Environmental, Social, and Governance (ESG) Chatbot Assistant.
Your primary role is to answer questions based strictly on the provided document context.

GUARDRAILS:
1. You may ONLY answer questions related to ESG topics, corporate policies, sustainability, or the contents of the uploaded documents.
2. If a user asks a question that is entirely unrelated to ESG or the documents, you must strictly decline to answer and state: "I am an ESG expert assistant. I can only help you with questions related to Environmental, Social, and Governance topics and your uploaded documents."
3. READ ALL PROVIDED CHUNKS COMPLETELY before deciding if the answer is missing. Do not prematurely state you cannot find the answer if it appears later in the context. Only if the answer is truly missing across ALL chunks, state: "I cannot find the answer to this in the provided documents." Do not hallucinate or guess.

CITATION RULES:
When synthesizing your answer, you MUST cite the specific context chunks you used by including their number in brackets, e.g., [1] or [2], [4]. Do not cite chunks you did not use.

FORMATTING RULES:
1. Always use a clear, uniform markdown structure for all responses.
2. Use bold headings (###) to separate key concepts or themes.
3. Use bullet points for any lists, data points, or multiple items to ensure high readability.
4. Keep paragraphs short and concise. Avoid dense walls of text.
5. DO NOT generate a "Sources:" or "References:" section at the end of your text. Only use the inline brackets (e.g. [1]). The UI handles displaying the source documents automatically.

AGENTIC INSTRUCTIONS:
If the retrieved context implies the answer is on a different page (e.g. an index table stating "refer to page 18" or "Pg 18"), you MUST output EXACTLY this XML tag and nothing else: <FETCH_PAGE>DOCUMENT_ID,PAGE_NUMBER</FETCH_PAGE>
Where DOCUMENT_ID is the Source document ID of the chunk that contains the reference, and PAGE_NUMBER is the requested page number.
Do NOT output this tag unless the answer is explicitly stated to be on another page.

CHART GENERATION:
PROACTIVELY generate multiple charts whenever you detect several related numerical data points. Output EXACTLY this XML tag with valid JSON inside:
<RENDER_CHART>
{"type": "bar", "title": "Emissions over 3 Years", "stack": true, "data": {"2022": {"Scope 1": 100, "Scope 2": 50}, "2023": {"Scope 1": 120, "Scope 2": 60}}}
</RENDER_CHART>
Valid types are: "bar", "line", "area", "scatter", "pie".

When answering, synthesize the information clearly and professionally. Do NOT use <thought>, <thinking>, or any hidden XML tags for your internal reasoning.
"""


async def query_esg(org_id: str, user_query: str, top_k: int = 15, length: str = "Medium", doc_filters=None):
    """Main RAG query function — same logic as original, using MongoDB vector store."""
    from . import vector_store

    # 1. Embed query
    res = openai_client.embeddings.create(input=user_query, model="text-embedding-3-large")
    query_embedding = res.data[0].embedding

    # 2. Retrieve chunks
    results = await vector_store.query_similar(org_id, query_embedding, top_k, doc_filters)

    if not results["documents"]:
        return {"answer": "No relevant documents found. Please upload an ESG report first.", "sources": [], "charts": []}

    retrieved_chunks = results["documents"]
    retrieved_metadata = results["metadatas"]

    # 3. Build context
    context_str = ""
    chunk_mapping = {}

    # GRI/SASB interception
    gri_match = re.search(r'(GRI|SASB)\s*([A-Za-z0-9\-]+)', user_query, re.IGNORECASE)
    deterministic_context_added = False
    if gri_match:
        normalized_id = f"{gri_match.group(1).upper()} {gri_match.group(2).upper()}"
        docs_to_search = doc_filters if doc_filters else await vector_store.get_active_documents(org_id)
        for d_id in docs_to_search:
            # Check for GRI index in DB metadata collection
            gri_doc = await vector_store.db[vector_store.COLLECTION].find_one(
                {"organization_id": org_id, "doc_id": d_id, "chunk_id": f"{d_id}_gri_index"},
                {"_id": 0}
            )
            if gri_doc and gri_doc.get("text"):
                try:
                    gri_index = json.loads(gri_doc["text"])
                    matched_entry = None
                    for k, v in gri_index.items():
                        if normalized_id in k.upper().replace("-", " ").replace(" ", "") or normalized_id in k.upper():
                            matched_entry = v
                            break
                    if matched_entry and "pages" in matched_entry:
                        context_str += f"\n--- DETERMINISTIC EXACT MATCH FOR {normalized_id}: {matched_entry.get('name', '')} ---\n"
                        for p_num in matched_entry["pages"]:
                            p_results = await vector_store.get_by_filter(org_id, {"doc_id": d_id, "page_num": int(p_num)})
                            if p_results["documents"]:
                                for chunk, meta in zip(p_results["documents"], p_results["metadatas"]):
                                    chunk_idx = len(chunk_mapping) + 1
                                    context_str += f"\n--- Chunk {chunk_idx} (Source: {meta['doc_id']}, Page: {meta['page_num']}) ---\n{chunk}\n"
                                    chunk_mapping[str(chunk_idx)] = {"doc_id": meta["doc_id"], "page_num": meta["page_num"]}
                        deterministic_context_added = True
                except Exception as e:
                    logger.warning(f"GRI interception error: {e}")

    # Add semantic chunks
    for chunk, meta in zip(retrieved_chunks, retrieved_metadata):
        if chunk in context_str and deterministic_context_added:
            continue
        chunk_idx = len(chunk_mapping) + 1
        context_str += f"\n--- Chunk {chunk_idx} (Source: {meta['doc_id']}, Page: {meta['page_num']}) ---\n{chunk}\n"
        chunk_mapping[str(chunk_idx)] = {"doc_id": meta["doc_id"], "page_num": meta["page_num"]}

    # Length instruction
    length_map = {
        "Short & Concise": "Keep your response extremely brief.",
        "Medium": "Provide a balanced response covering the main points.",
        "Detailed & Comprehensive": "Provide a highly detailed, comprehensive response.",
    }
    length_instruction = length_map.get(length, length_map["Medium"])

    prompt = f"""
Here is the retrieved context from the user's documents:
<context>
{context_str}
</context>

User Query: {user_query}

Response Length Requirement: {length_instruction}

IMPORTANT AGENTIC INSTRUCTION:
If the context explicitly states that the answer is on a different page, you MUST output EXACTLY this tag: <FETCH_PAGE>DOCUMENT_ID,PAGE_NUMBER</FETCH_PAGE>
If no page fetch is needed, provide your final response based ONLY on the context above.
"""

    # 4. Agentic loop
    max_loops = 2
    loop_count = 0
    answer_text = ""
    current_system_prompt = SYSTEM_PROMPT

    while loop_count < max_loops:
        loop_count += 1
        try:
            message = anthropic_client.messages.create(
                model="claude-haiku-4-5",
                max_tokens=1000,
                system=current_system_prompt,
                messages=[{"role": "user", "content": prompt}],
            )
            answer_text = message.content[0].text

            fetch_match = re.search(r'<FETCH_PAGE>(.*?)</FETCH_PAGE>', answer_text)
            if fetch_match:
                parts = fetch_match.group(1).strip().split(',')
                if len(parts) == 2:
                    doc_id = parts[0].strip()
                    page_numbers = re.findall(r'\d+', parts[1].strip())
                    if page_numbers:
                        page_num = int(page_numbers[0])
                        page_results = await vector_store.get_by_filter(org_id, {"doc_id": doc_id, "page_num": page_num})
                        if page_results["documents"]:
                            new_context = f"\n\n--- AGENTICALLY FETCHED FROM PAGE {page_num} ---\n"
                            start_idx = len(chunk_mapping) + 1
                            for i, (chunk, meta) in enumerate(zip(page_results["documents"], page_results["metadatas"])):
                                ci = start_idx + i
                                new_context += f"\n--- Chunk {ci} (Source: {meta['doc_id']}, Page: {meta['page_num']}) ---\n{chunk}\n"
                                chunk_mapping[str(ci)] = {"doc_id": meta["doc_id"], "page_num": meta["page_num"]}
                            prompt = prompt.replace("</context>", f"{new_context}\n</context>")
                            current_system_prompt = current_system_prompt.replace(
                                'you MUST output EXACTLY this XML tag and nothing else: <FETCH_PAGE>',
                                'You have already fetched the required page. DO NOT output the <FETCH_PAGE> tag again. <FETCH_PAGE>'
                            )
                            continue
                break
            else:
                break
        except Exception as e:
            logger.error(f"RAG agentic loop error: {e}")
            break

    # 5. Extract charts
    charts = []
    for match in re.finditer(r'<RENDER_CHART>\s*(.*?)\s*</RENDER_CHART>', answer_text, re.DOTALL):
        try:
            charts.append(json.loads(match.group(1).strip()))
        except Exception:
            pass
    answer_text = re.sub(r'<RENDER_CHART>.*?</RENDER_CHART>', '', answer_text, flags=re.DOTALL).strip()

    # 6. Map citations
    citations = re.findall(r'\[(\d+)\]', answer_text)
    used_sources = []
    seen = {}
    new_cit_id = 1
    chunk_to_ui = {}

    for cit in citations:
        if cit in chunk_mapping:
            info = chunk_mapping[cit]
            key = f"{info['doc_id']}_{info['page_num']}"
            if key not in seen:
                seen[key] = str(new_cit_id)
                used_sources.append({**info, "citation_id": str(new_cit_id)})
                new_cit_id += 1
            chunk_to_ui[cit] = seen[key]

    def replace_cit(m):
        old = m.group(1)
        return f"[{chunk_to_ui[old]}]" if old in chunk_to_ui else m.group(0)

    answer_text = re.sub(r'\[(\d+)\]', replace_cit, answer_text)

    return {"answer": answer_text, "sources": used_sources, "charts": charts}
