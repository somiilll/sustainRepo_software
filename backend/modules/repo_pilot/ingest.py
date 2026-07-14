"""
Document Ingest for Repo Pilot.
Adapted from original ingest.py — same logic, MongoDB storage + R2 for images.
"""
import os
import re
import json
import uuid
import logging
import tempfile
import fitz  # PyMuPDF
from openai import OpenAI
from shared.database.mongo import db

logger = logging.getLogger(__name__)
openai_client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

CHUNK_COLLECTION = "repo_pilot_chunks"


def semantic_markdown_chunker(text, max_words=600):
    sections = re.split(r'\n(?=#{1,6}\s)', text)
    chunks = []
    for section in sections:
        section = section.strip()
        if not section:
            continue
        words = section.split()
        if len(words) > max_words:
            current = []
            for word in words:
                current.append(word)
                if len(current) >= max_words:
                    chunks.append(" ".join(current))
                    current = []
            if current:
                chunks.append(" ".join(current))
        else:
            chunks.append(section)
    return chunks


def count_digits(text):
    return len(re.findall(r'\d', text))


def reconstruct_page_text(fitz_page):
    try:
        blocks = fitz_page.get_text("blocks")
        text_blocks = [b for b in blocks if b[-1] == 0]
        text_blocks.sort(key=lambda b: (round(b[1] / 10) * 10, b[0]))
        return "\n\n".join([b[4].strip() for b in text_blocks])
    except Exception:
        return ""


async def process_pdf(pdf_path: str, org_id: str, doc_id: str, split_2up: bool = False):
    """Process a PDF: parse, chunk, embed, store in MongoDB. Returns page images as bytes dict."""
    logger.info(f"Processing {pdf_path} for org {org_id}, doc {doc_id}")

    # 1. Normalize PDF
    original_doc = fitz.open(pdf_path)
    normalized_doc = fitz.open()
    normalized_to_original = {}
    norm_count = 1

    for idx in range(len(original_doc)):
        page = original_doc.load_page(idx)
        if split_2up and page.rect.width > page.rect.height:
            r1 = fitz.Rect(page.rect.tl, fitz.Point(page.rect.width / 2, page.rect.height))
            p1 = normalized_doc.new_page(width=r1.width, height=r1.height)
            p1.show_pdf_page(p1.rect, original_doc, idx, clip=r1)
            normalized_to_original[norm_count] = idx + 1
            norm_count += 1
            r2 = fitz.Rect(fitz.Point(page.rect.width / 2, 0), page.rect.br)
            p2 = normalized_doc.new_page(width=r2.width, height=r2.height)
            p2.show_pdf_page(p2.rect, original_doc, idx, clip=r2)
            normalized_to_original[norm_count] = idx + 1
            norm_count += 1
        else:
            normalized_doc.insert_pdf(original_doc, from_page=idx, to_page=idx)
            normalized_to_original[norm_count] = idx + 1
            norm_count += 1

    norm_path = os.path.join(tempfile.gettempdir(), f"norm_{doc_id}.pdf")
    normalized_doc.save(norm_path)
    normalized_doc.close()

    # 2. Generate page images
    page_images = {}
    for pg in range(len(original_doc)):
        page = original_doc.load_page(pg)
        mat = fitz.Matrix(2, 2)
        pix = page.get_pixmap(matrix=mat)
        page_images[pg + 1] = pix.tobytes("jpeg")
    original_doc.close()

    # 3. Parse with LlamaParse
    from llama_parse import LlamaParse
    parser = LlamaParse(api_key=os.environ.get("LLAMA_CLOUD_API_KEY"), result_type="markdown", verbose=False)

    pages = []
    try:
        norm_doc = fitz.open(norm_path)
        res = parser.get_json_result(norm_path)

        if res and isinstance(res, list):
            parsed_pages = res[0].get("pages", [])
            for p in parsed_pages:
                norm_pnum = p.get("page", 1)
                orig_pnum = normalized_to_original.get(norm_pnum, norm_pnum)
                md_text = p.get("md", "")

                # Heuristic data-loss detection
                try:
                    fitz_page = norm_doc.load_page(norm_pnum - 1)
                    pymupdf_text = reconstruct_page_text(fitz_page)
                    if count_digits(pymupdf_text) > count_digits(md_text) * 1.3 and (count_digits(pymupdf_text) - count_digits(md_text)) > 20:
                        md_text += "\n\n--- [HEURISTIC RECOVERY] ---\n" + pymupdf_text
                except Exception:
                    pass

                pages.append({"page": orig_pnum, "md": md_text})
        norm_doc.close()
    except Exception as e:
        logger.error(f"LlamaParse error: {e}")

    # Cleanup
    try:
        os.remove(norm_path)
    except Exception:
        pass

    pages.sort(key=lambda x: x.get("page", 1))

    # 4. Chunk, embed, store
    docs_to_insert = []
    metadatas = []
    ids = []
    chunk_counter = 0

    for page in pages:
        pnum = page.get("page", 1)
        md = page.get("md", "")
        if not md.strip():
            continue
        for chunk in semantic_markdown_chunker(md):
            docs_to_insert.append(chunk)
            metadatas.append({"doc_id": doc_id, "page_num": pnum})
            ids.append(f"{doc_id}_{pnum}_{chunk_counter}")
            chunk_counter += 1

    embeddings = []
    if docs_to_insert:
        for i in range(0, len(docs_to_insert), 100):
            batch = docs_to_insert[i:i + 100]
            try:
                resp = openai_client.embeddings.create(input=batch, model="text-embedding-3-large")
                embeddings.extend([d.embedding for d in resp.data])
            except Exception as e:
                logger.error(f"Embedding error: {e}")

    if len(embeddings) == len(docs_to_insert):
        from . import vector_store
        await vector_store.add_chunks(org_id, doc_id, docs_to_insert, metadatas, embeddings, ids)
        logger.info(f"Added {len(docs_to_insert)} chunks for {doc_id}")

    # 5. Extract GRI index
    try:
        full_text = "\n\n".join([f"--- PAGE {p['page']} ---\n{p['md']}" for p in pages])
        gri_prompt = """Scan this ESG report and find GRI, SASB, or TCFD Content Index tables.
Extract every disclosure/indicator and page numbers. Return ONLY raw JSON dict.
Example: {"GRI 305-1": {"name": "Direct GHG emissions", "pages": [34, 35]}}
If no index found, return {}."""

        gri_resp = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": gri_prompt}, {"role": "user", "content": full_text[:300000]}],
            temperature=0,
            response_format={"type": "json_object"},
        )
        gri_index = json.loads(gri_resp.choices[0].message.content)
        if gri_index:
            # Store GRI index as a special chunk
            await db[CHUNK_COLLECTION].insert_one({
                "chunk_id": f"{doc_id}_gri_index",
                "organization_id": org_id,
                "doc_id": doc_id,
                "page_num": 0,
                "text": json.dumps(gri_index),
                "embedding": [],
            })
            logger.info(f"Extracted {len(gri_index)} GRI index entries")
    except Exception as e:
        logger.error(f"GRI extraction error: {e}")

    return {
        "doc_id": doc_id,
        "chunks": len(docs_to_insert),
        "pages": len(pages),
        "page_images": page_images,
    }
