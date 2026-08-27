"""
One-off script: Ingest AMNS_SR_25_26.pdf into sustainrepo_staging repo_pilot.
Full pipeline: Parse (LlamaParse) → Chunk → Embed (OpenAI) → Store → Page Images → R2 Upload → GRI Index.
"""
import os
import sys
import re
import json
import uuid
import tempfile
import logging
import time

# Ensure backend modules are importable
sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

import fitz  # PyMuPDF
from openai import OpenAI
from pymongo import MongoClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ── Config ──────────────────────────────────────────────────────────────
TARGET_MONGO_URL = os.environ.get("TARGET_MONGO_URL")
TARGET_DB_NAME = os.environ.get("TARGET_DB_NAME")
ORG_ID = "9067d872-8a3a-4ed9-8494-e3ef04952f7c"
ORG_NAME = "ORG1"

PDF_URL = "https://customer-assets-4nw71qhi.emergentagent.net/job_d773143f-03c6-4fbd-8487-cb2c5110c4c5/artifacts/xffvwpt4_AMNS_SR_25_26.pdf"
PDF_FILENAME = "AMNS_SR_25_26.pdf"
DOC_ID = "AMNS_SR_25_26"
SPLIT_2UP = False

CHUNK_COLLECTION = "repo_pilot_chunks"
DOCS_COLLECTION = "repo_pilot_documents"

openai_client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# ── Helpers (from ingest.py) ────────────────────────────────────────────

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


# ── Main pipeline ───────────────────────────────────────────────────────

def download_pdf(url, dest):
    import httpx
    logger.info(f"Downloading PDF from {url}")
    with httpx.Client(timeout=120) as client:
        resp = client.get(url)
        resp.raise_for_status()
        with open(dest, "wb") as f:
            f.write(resp.content)
    size_mb = os.path.getsize(dest) / (1024 * 1024)
    logger.info(f"Downloaded {size_mb:.1f} MB to {dest}")
    return dest


def normalize_pdf(pdf_path, doc_id, split_2up=False):
    """Normalize and optionally split 2-up pages. Returns (norm_path, mapping, page_images)."""
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

    # Generate page images from original
    page_images = {}
    for pg in range(len(original_doc)):
        page = original_doc.load_page(pg)
        mat = fitz.Matrix(2, 2)
        pix = page.get_pixmap(matrix=mat)
        page_images[pg + 1] = pix.tobytes("jpeg")
    original_doc.close()

    logger.info(f"Normalized PDF: {norm_count - 1} pages, {len(page_images)} page images generated")
    return norm_path, normalized_to_original, page_images


def parse_with_llamaparse(norm_path, normalized_to_original):
    """Parse normalized PDF with LlamaParse. Returns list of {page, md}."""
    from llama_parse import LlamaParse
    parser = LlamaParse(
        api_key=os.environ.get("LLAMA_CLOUD_API_KEY"),
        result_type="markdown",
        verbose=False
    )

    pages = []
    norm_doc = fitz.open(norm_path)
    logger.info(f"Sending to LlamaParse ({len(norm_doc)} normalized pages)...")
    t0 = time.time()
    res = parser.get_json_result(norm_path)
    logger.info(f"LlamaParse returned in {time.time() - t0:.1f}s")

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
    pages.sort(key=lambda x: x.get("page", 1))
    logger.info(f"Parsed {len(pages)} pages from LlamaParse")
    return pages


def chunk_and_embed(pages, doc_id):
    """Chunk pages and generate embeddings. Returns (docs_to_insert, metadatas, embeddings, ids)."""
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

    logger.info(f"Created {len(docs_to_insert)} chunks, generating embeddings...")

    embeddings = []
    batch_size = 100
    for i in range(0, len(docs_to_insert), batch_size):
        batch = docs_to_insert[i:i + batch_size]
        try:
            resp = openai_client.embeddings.create(input=batch, model="text-embedding-3-large")
            embeddings.extend([d.embedding for d in resp.data])
            logger.info(f"  Embedded batch {i // batch_size + 1}/{(len(docs_to_insert) + batch_size - 1) // batch_size}")
        except Exception as e:
            logger.error(f"Embedding error on batch {i}: {e}")
            raise

    if len(embeddings) != len(docs_to_insert):
        raise RuntimeError(f"Embedding count mismatch: {len(embeddings)} vs {len(docs_to_insert)}")

    logger.info(f"All {len(embeddings)} embeddings generated")
    return docs_to_insert, metadatas, embeddings, ids


def store_chunks(db, org_id, doc_id, docs_to_insert, metadatas, embeddings, ids):
    """Store chunks + embeddings in MongoDB."""
    # Remove existing chunks for this doc first
    deleted = db[CHUNK_COLLECTION].delete_many({"organization_id": org_id, "doc_id": doc_id})
    if deleted.deleted_count:
        logger.info(f"Removed {deleted.deleted_count} existing chunks for {doc_id}")

    bulk_docs = []
    for text, meta, emb, chunk_id in zip(docs_to_insert, metadatas, embeddings, ids):
        bulk_docs.append({
            "chunk_id": chunk_id,
            "organization_id": org_id,
            "doc_id": doc_id,
            "page_num": meta.get("page_num", 1),
            "text": text,
            "embedding": emb,
        })

    if bulk_docs:
        db[CHUNK_COLLECTION].insert_many(bulk_docs)
    logger.info(f"Stored {len(bulk_docs)} chunks in {CHUNK_COLLECTION}")
    return len(bulk_docs)


def extract_gri_index(db, org_id, doc_id, pages):
    """Extract GRI/SASB/TCFD index from parsed pages."""
    full_text = "\n\n".join([f"--- PAGE {p['page']} ---\n{p['md']}" for p in pages])
    gri_prompt = """Scan this ESG report and find GRI, SASB, or TCFD Content Index tables.
Extract every disclosure/indicator and page numbers. Return ONLY raw JSON dict.
Example: {"GRI 305-1": {"name": "Direct GHG emissions", "pages": [34, 35]}}
If no index found, return {}."""

    try:
        gri_resp = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": gri_prompt}, {"role": "user", "content": full_text[:300000]}],
            temperature=0,
            response_format={"type": "json_object"},
        )
        gri_index = json.loads(gri_resp.choices[0].message.content)
        if gri_index:
            # Remove existing GRI index
            db[CHUNK_COLLECTION].delete_one({
                "organization_id": org_id,
                "doc_id": doc_id,
                "chunk_id": f"{doc_id}_gri_index"
            })
            db[CHUNK_COLLECTION].insert_one({
                "chunk_id": f"{doc_id}_gri_index",
                "organization_id": org_id,
                "doc_id": doc_id,
                "page_num": 0,
                "text": json.dumps(gri_index),
                "embedding": [],
            })
            logger.info(f"Extracted {len(gri_index)} GRI/SASB/TCFD index entries")
            return gri_index
    except Exception as e:
        logger.error(f"GRI extraction error: {e}")
    return {}


def upload_images_to_r2(page_images, org_id, doc_id):
    """Upload page images to R2 and return URL/key mappings."""
    from r2_storage import R2Storage
    r2 = R2Storage()

    image_urls = {}
    image_keys = {}
    folder = f"{ORG_NAME}/{doc_id}/pages"

    logger.info(f"Uploading {len(page_images)} page images to R2...")
    for page_num, img_bytes in page_images.items():
        try:
            bucket = r2.buckets["repo_pilot"]
            key = r2._generate_unique_key(f"page_{page_num}.jpg", folder)

            r2.client.put_object(
                Bucket=bucket,
                Key=key,
                Body=img_bytes,
                ContentType="image/jpeg"
            )
            url = r2.client.generate_presigned_url(
                'get_object',
                Params={'Bucket': bucket, 'Key': key},
                ExpiresIn=604800,
            )
            image_urls[str(page_num)] = url
            image_keys[str(page_num)] = key
        except Exception as e:
            logger.warning(f"R2 upload failed for page {page_num}: {e}")

        if page_num % 20 == 0:
            logger.info(f"  Uploaded {page_num}/{len(page_images)} images")

    logger.info(f"Uploaded {len(image_urls)} images to R2")
    return image_urls, image_keys


def upload_pdf_to_r2(pdf_path):
    """Upload the original PDF to R2."""
    from r2_storage import R2Storage
    r2 = R2Storage()
    bucket = r2.buckets["repo_pilot"]
    folder = f"{ORG_NAME}/documents"
    key = r2._generate_unique_key(PDF_FILENAME, folder)

    with open(pdf_path, "rb") as f:
        content = f.read()

    r2.client.put_object(
        Bucket=bucket,
        Key=key,
        Body=content,
        ContentType="application/pdf"
    )
    url = r2.client.generate_presigned_url(
        'get_object',
        Params={'Bucket': bucket, 'Key': key},
        ExpiresIn=604800,
    )
    logger.info(f"Uploaded PDF to R2: {key}")
    return url, key


def create_document_record(db, org_id, doc_id, num_pages, num_chunks, image_urls, image_keys, r2_url, r2_key):
    """Create or update the document record in repo_pilot_documents."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    document_id = str(uuid.uuid4())

    # Remove existing doc record for this doc_id
    db[DOCS_COLLECTION].delete_many({"organization_id": org_id, "doc_id": doc_id})

    doc_record = {
        "id": document_id,
        "organization_id": org_id,
        "doc_id": doc_id,
        "filename": PDF_FILENAME,
        "r2_url": r2_url,
        "r2_key": r2_key,
        "split_2up": SPLIT_2UP,
        "status": "completed",
        "stage": "COMPLETED",
        "progress": 100,
        "error_message": None,
        "pages": num_pages,
        "chunks": num_chunks,
        "image_urls": image_urls,
        "image_keys": image_keys,
        "uploaded_by": "script_ingest",
        "created_at": now,
        "updated_at": now,
    }
    db[DOCS_COLLECTION].insert_one(doc_record)
    logger.info(f"Created document record: {document_id}")
    return document_id


# ── Main ────────────────────────────────────────────────────────────────

def main():
    t_start = time.time()

    if not TARGET_MONGO_URL or not TARGET_DB_NAME:
        raise RuntimeError("TARGET_MONGO_URL and TARGET_DB_NAME must be set before running this script")

    # Connect to target DB
    client = MongoClient(TARGET_MONGO_URL)
    db = client[TARGET_DB_NAME]
    logger.info(f"Connected to {TARGET_DB_NAME}")

    # 1. Download PDF
    pdf_path = os.path.join(tempfile.gettempdir(), PDF_FILENAME)
    download_pdf(PDF_URL, pdf_path)

    # 2. Upload PDF to R2
    r2_url, r2_key = upload_pdf_to_r2(pdf_path)

    # 3. Normalize PDF + generate page images
    norm_path, norm_mapping, page_images = normalize_pdf(pdf_path, DOC_ID, SPLIT_2UP)

    # 4. Parse with LlamaParse
    pages = parse_with_llamaparse(norm_path, norm_mapping)

    # Cleanup norm file
    try:
        os.remove(norm_path)
    except Exception:
        pass

    # 5. Chunk + Embed
    docs_to_insert, metadatas, embeddings, ids = chunk_and_embed(pages, DOC_ID)

    # 6. Store chunks in MongoDB
    num_chunks = store_chunks(db, ORG_ID, DOC_ID, docs_to_insert, metadatas, embeddings, ids)

    # 7. Extract GRI/SASB index
    gri_index = extract_gri_index(db, ORG_ID, DOC_ID, pages)

    # 8. Upload page images to R2
    image_urls, image_keys = upload_images_to_r2(page_images, ORG_ID, DOC_ID)

    # 9. Create document record
    doc_uuid = create_document_record(
        db, ORG_ID, DOC_ID, len(pages), num_chunks,
        image_urls, image_keys, r2_url, r2_key
    )

    elapsed = time.time() - t_start
    logger.info(f"""
{'='*60}
INGEST COMPLETE
{'='*60}
Document ID:   {doc_uuid}
Doc ID:        {DOC_ID}
Org:           {ORG_NAME} ({ORG_ID})
Database:      {TARGET_DB_NAME}
Pages parsed:  {len(pages)}
Chunks stored: {num_chunks}
GRI entries:   {len(gri_index)}
Page images:   {len(image_urls)}
PDF in R2:     {r2_key}
Time:          {elapsed:.1f}s
{'='*60}
""")

    # Cleanup
    try:
        os.remove(pdf_path)
    except Exception:
        pass

    client.close()


if __name__ == "__main__":
    main()
