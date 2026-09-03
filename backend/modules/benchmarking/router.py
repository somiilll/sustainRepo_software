"""
Peer Benchmarking Module Router

Provides endpoints for:
- Fetching internal company ESG data (My Company baseline)
- Extracting ESG metrics from competitor PDF reports (with R2 storage + MongoDB persistence)
- Generating AI-powered executive summaries
- Managing saved competitor benchmarks

Storage:
- PDFs: Cloudflare R2 (direct boto3 integration)
- Metrics: MongoDB (competitor_benchmarks collection)

AI Model: gpt-5.6-luna for ESG metric parsing and executive summaries
"""

import os
import json
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import httpx
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv()

from shared.database.mongo import db
from modules.auth.dependencies import get_current_user
from modules.benchmarking.peer_benchmarking_service import get_benchmarking_metrics
from shared.utils.emission_records import eligible_ghg_record_filter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/benchmarking", tags=["Peer Benchmarking"])

# API Keys
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY_PEER_BENCHMARKING")
LLAMA_CLOUD_API_KEY = os.environ.get("LLAMA_CLOUD_API_KEY_PEER_BENCHMARKING")

# Cloudflare R2 Storage Configuration (Direct boto3)
R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY")
R2_ENDPOINT_URL = os.environ.get("R2_ENDPOINT_URL")
R2_BUCKET_PEER_BENCHMARKING = os.environ.get("R2_BUCKET_PEER_BENCHMARKING", "peer-benchmarking-dev")

# Lazy-initialized S3 client for R2
_s3_client = None


def get_s3_client():
    """Get or initialize the S3 client for Cloudflare R2."""
    global _s3_client
    if _s3_client:
        return _s3_client
    
    if not all([R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT_URL]):
        raise Exception("Cloudflare R2 credentials not configured (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT_URL)")
    
    _s3_client = boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT_URL,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=Config(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"}
        )
    )
    logger.info("Cloudflare R2 S3 client initialized successfully")
    return _s3_client


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload file to Cloudflare R2 storage."""
    client = get_s3_client()
    try:
        client.put_object(
            Bucket=R2_BUCKET_PEER_BENCHMARKING,
            Key=path,
            Body=data,
            ContentType=content_type
        )
        logger.info(f"File uploaded to R2: {R2_BUCKET_PEER_BENCHMARKING}/{path}")
        return {
            "path": path,
            "bucket": R2_BUCKET_PEER_BENCHMARKING,
            "size": len(data)
        }
    except ClientError as e:
        logger.error(f"R2 upload error: {e}")
        raise Exception(f"Failed to upload to R2: {str(e)}")


def delete_object(path: str) -> None:
    if not path:
        return
    get_s3_client().delete_object(Bucket=R2_BUCKET_PEER_BENCHMARKING, Key=path)


def get_object(path: str) -> tuple:
    """Download file from Cloudflare R2 storage. Returns (content_bytes, content_type)."""
    client = get_s3_client()
    try:
        response = client.get_object(
            Bucket=R2_BUCKET_PEER_BENCHMARKING,
            Key=path
        )
        content = response["Body"].read()
        content_type = response.get("ContentType", "application/octet-stream")
        return content, content_type
    except ClientError as e:
        logger.error(f"R2 download error: {e}")
        raise Exception(f"Failed to download from R2: {str(e)}")


class SummaryRequest(BaseModel):
    myCompany: Dict[str, Any]
    competitors: List[Dict[str, Any]]


class CompetitorCreate(BaseModel):
    name: str
    industry: Optional[str] = None
    year: Optional[str] = None


# Define JSON Schema for Structured Metric Extraction
METRIC_SCHEMA_NUMBER = {
    "type": "object",
    "properties": {
        "rawTextFound": {"type": ["string", "null"], "description": "The exact raw text/snippet found in the report."},
        "reasoning": {"type": ["string", "null"], "description": "Step-by-step reasoning for how you derived the value."},
        "extractedValue": {"type": ["number", "null"], "description": "The raw extracted numerical value."},
        "reportedUnit": {"type": ["string", "null"], "description": "The exact unit used in the report."},
        "normalizedValue": {"type": ["number", "null"], "description": "The final normalized value."},
        "normalizedUnit": {"type": ["string", "null"], "description": "The unit of the normalizedValue."},
        "page": {"type": ["number", "null"]}
    },
    "required": ["rawTextFound", "reasoning", "extractedValue", "reportedUnit", "normalizedValue", "normalizedUnit", "page"],
    "additionalProperties": False
}

METRIC_SCHEMA_BOOLEAN = {
    "type": "object",
    "properties": {
        "rawTextFound": {"type": ["string", "null"]},
        "reasoning": {"type": ["string", "null"]},
        "extractedValue": {"type": ["boolean", "null"]},
        "reportedUnit": {"type": ["string", "null"]},
        "normalizedValue": {"type": ["boolean", "null"]},
        "normalizedUnit": {"type": ["string", "null"]},
        "page": {"type": ["number", "null"]}
    },
    "required": ["rawTextFound", "reasoning", "extractedValue", "reportedUnit", "normalizedValue", "normalizedUnit", "page"],
    "additionalProperties": False
}

JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "esg_metrics_extraction",
        "schema": {
            "type": "object",
            "properties": {
                "scope1": {**METRIC_SCHEMA_NUMBER, "description": "Total Scope 1 GHG emissions in tCO2e."},
                "scope2": {**METRIC_SCHEMA_NUMBER, "description": "Total Scope 2 GHG emissions in tCO2e."},
                "emissionIntensityPerTurnover": {**METRIC_SCHEMA_NUMBER, "description": "Scope 1 & 2 emission intensity per rupee turnover."},
                "treatedWaterDischarged": {**METRIC_SCHEMA_NUMBER, "description": "Percentage of treated water discharged."},
                "renewableEnergy": {**METRIC_SCHEMA_NUMBER, "description": "Renewable energy as percentage of total energy consumption."},
                "wasteRecycled": {**METRIC_SCHEMA_NUMBER, "description": "Percentage of total waste recycled."},
                "hazardousWaste": {**METRIC_SCHEMA_NUMBER, "description": "Total hazardous waste generated."},
                "wasteIntensity": {**METRIC_SCHEMA_NUMBER, "description": "Waste intensity metric."},
                "ltirEmployee": {**METRIC_SCHEMA_NUMBER, "description": "Lost Time Injury Frequency Rate (LTIFR) for employees."},
                "ltirWorker": {**METRIC_SCHEMA_NUMBER, "description": "Lost Time Injury Frequency Rate (LTIFR) for workers."},
                "dataPrivacyPolicy": {**METRIC_SCHEMA_BOOLEAN, "description": "Does the company have a public Data Privacy Policy?"},
                "disciplinaryAction": {**METRIC_SCHEMA_NUMBER, "description": "Number of disciplinary actions taken by authorities."},
                "daysAccountsPayable": {**METRIC_SCHEMA_NUMBER, "description": "Days payable outstanding (DPO)."}
            },
            "required": [
                "scope1", "scope2", "emissionIntensityPerTurnover", "treatedWaterDischarged", "renewableEnergy",
                "wasteRecycled", "hazardousWaste", "wasteIntensity", "ltirEmployee", "ltirWorker",
                "dataPrivacyPolicy", "disciplinaryAction", "daysAccountsPayable"
            ],
            "additionalProperties": False
        },
        "strict": True
    }
}


@router.get("/date-range")
async def get_date_range(
    current_user: dict = Depends(get_current_user),
):
    """
    Returns the min and max dates available in the organization's emission data.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization found")

    min_date = None
    max_date = None
    
    try:
        periods = await db.emission_records.distinct(
            "reporting_period",
            {"organization_id": org_id, **eligible_ghg_record_filter()}
        )
        
        dates = []
        for period in periods:
            if isinstance(period, dict):
                year = period.get("year")
                month = period.get("month", 1)
                if year:
                    try:
                        dates.append(datetime(int(year), int(month) if isinstance(month, int) else 1, 1))
                    except (ValueError, TypeError):
                        pass
            elif isinstance(period, str):
                try:
                    if len(period) >= 7 and "-" in period:
                        parts = period.split("-")
                        dates.append(datetime(int(parts[0]), int(parts[1]), 1))
                except (ValueError, TypeError):
                    pass
        
        if dates:
            min_date = min(dates)
            max_date = max(dates)
            
    except Exception as e:
        logger.warning(f"Error fetching date range: {e}")

    if not min_date:
        min_date = datetime(datetime.now().year - 2, 4, 1)
    if not max_date:
        max_date = datetime.now()

    return {
        "min_date": min_date.strftime("%Y-%m-%d"),
        "max_date": max_date.strftime("%Y-%m-%d")
    }


@router.get("/my-company")
async def get_my_company_data(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Fetches internal ESG data for the user's organization to use as 'My Company' baseline.
    Uses the PeerBenchmarkingService which reuses existing dashboard services for consistency.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization found")

    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    org_name = org.get("name", "My Company") if org else "My Company"
    industry = org.get("industry") or org.get("sector") or "Manufacturing"

    if start_date and end_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
            reporting_year = f"{start_dt.strftime('%d %b %Y')} - {end_dt.strftime('%d %b %Y')}"
        except ValueError:
            reporting_year = f"{start_date} - {end_date}"
    elif start_date:
        reporting_year = f"From {start_date}"
    elif end_date:
        reporting_year = f"Until {end_date}"
    else:
        reporting_year = "All Data"

    metrics = await get_benchmarking_metrics(
        org_id=org_id,
        start_date=start_date,
        end_date=end_date
    )

    return {
        "id": "my-company",
        "name": org_name,
        "industry": industry,
        "year": reporting_year,
        "fileName": "Internal ESG Data",
        "metrics": metrics,
        "data_source": "internal"
    }


@router.get("/competitors")
async def list_competitors(
    current_user: dict = Depends(get_current_user),
):
    """
    List all saved competitor benchmarks for the organization.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization found")

    competitors = await db.competitor_benchmarks.find(
        {"org_id": org_id, "is_deleted": {"$ne": True}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)

    return {"competitors": competitors}


@router.get("/competitors/{competitor_id}")
async def get_competitor(
    competitor_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Get a specific saved competitor benchmark.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization found")

    competitor = await db.competitor_benchmarks.find_one(
        {"id": competitor_id, "org_id": org_id, "is_deleted": {"$ne": True}},
        {"_id": 0}
    )

    if not competitor:
        raise HTTPException(status_code=404, detail="Competitor not found")

    return competitor


@router.delete("/competitors/{competitor_id}")
async def delete_competitor(
    competitor_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Soft-delete a competitor benchmark.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization found")

    competitor = await db.competitor_benchmarks.find_one(
        {"id": competitor_id, "org_id": org_id, "is_deleted": {"$ne": True}},
        {"_id": 0, "storage_path": 1},
    )
    if not competitor:
        raise HTTPException(status_code=404, detail="Competitor not found")
    try:
        delete_object(competitor.get("storage_path") or "")
    except Exception as error:
        raise HTTPException(status_code=502, detail="Could not remove the benchmark file from storage. The benchmark was not deleted.") from error

    result = await db.competitor_benchmarks.update_one(
        {"id": competitor_id, "org_id": org_id},
        {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat()}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Competitor not found")

    return {"message": "Competitor deleted successfully"}


@router.post("/extract")
async def extract_metrics(
    report: UploadFile = File(...),
    competitor_name: str = Query(..., description="Name of the competitor company"),
    competitor_industry: Optional[str] = Query(None, description="Industry of the competitor"),
    reporting_year: Optional[str] = Query(None, description="Reporting year of the document"),
    current_user: dict = Depends(get_current_user),
):
    """
    Extracts ESG metrics from uploaded PDF report using LlamaParse and gpt-5.6-luna.
    
    Stores:
    - PDF file in R2 storage (peer-benchmarking-dev bucket)
    - Extracted metrics in MongoDB (competitor_benchmarks collection)
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization found")

    if not report.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=500, 
            detail="OpenAI API key not configured. Please contact administrator."
        )
    
    if not LLAMA_CLOUD_API_KEY:
        raise HTTPException(
            status_code=500, 
            detail="LlamaParse API key not configured. Please contact administrator."
        )

    # Fetch organization name for storage path
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "name": 1})
    org_name = org.get("name", org_id) if org else org_id
    # Sanitize org name for use in file path (replace spaces and special chars)
    org_name_safe = "".join(c if c.isalnum() or c in ('-', '_') else '_' for c in org_name)

    try:
        from openai import OpenAI
        
        content = await report.read()
        competitor_id = str(uuid.uuid4())
        openai_client = OpenAI(api_key=OPENAI_API_KEY)
        
        # 1. Store PDF in R2 storage
        storage_path = f"{org_name_safe}/competitors/{competitor_id}.pdf"
        try:
            storage_result = put_object(storage_path, content, "application/pdf")
            logger.info(f"PDF stored in R2: {R2_BUCKET_PEER_BENCHMARKING}/{storage_result.get('path')}")
        except Exception as e:
            logger.error(f"R2 storage error: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to store PDF: {str(e)}")

        # 2. Parse PDF with LlamaParse
        headers = {"Authorization": f"Bearer {LLAMA_CLOUD_API_KEY}"}
        parsing_instruction = (
            "Pay special attention to tables, infographics, metric callout boxes, and charts throughout the document.\n"
            "1. TABLES: Extract all tabular data cleanly into markdown tables. Preserve all numbers, decimal places, and thousands separators without dropping digits. Keep table notes and column units attached to the table.\n"
            "2. INFOGRAPHICS & CALLOUT BOXES: Do not skip infographics, visual stat cards, or key-highlight boxes. Convert all text, numbers, and units inside visual infographics into clear markdown text or bullet points so no visual metric is missed."
        )

        files = {"file": (report.filename, content, report.content_type or "application/pdf")}
        data = {"parsing_instruction": parsing_instruction}

        logger.info(f"Starting PDF extraction for: {report.filename}")

        async with httpx.AsyncClient(timeout=300.0) as client:
            upload_res = await client.post(
                "https://api.cloud.llamaindex.ai/api/parsing/upload",
                headers=headers,
                files=files,
                data=data
            )

            if upload_res.status_code != 200:
                logger.error(f"LlamaParse upload failed: {upload_res.text}")
                raise HTTPException(status_code=500, detail=f"LlamaParse upload failed: {upload_res.text}")

            job_id = upload_res.json().get("id")
            logger.info(f"LlamaParse job created: {job_id}")

            full_markdown_text = ""
            while True:
                await asyncio.sleep(2)

                status_res = await client.get(
                    f"https://api.cloud.llamaindex.ai/api/parsing/job/{job_id}",
                    headers=headers
                )
                status_data = status_res.json()

                if status_data.get("status") == "SUCCESS":
                    try:
                        json_res = await client.get(
                            f"https://api.cloud.llamaindex.ai/api/parsing/job/{job_id}/result/json",
                            headers=headers
                        )
                        json_result = json_res.json()
                        pages = json_result.get("pages", [])
                        if pages:
                            full_markdown_text = "\n\n".join([
                                f"--- PAGE BREAK (Page {p.get('page', i+1)}) ---\n{p.get('md') or p.get('text') or ''}"
                                for i, p in enumerate(pages)
                            ])
                        else:
                            raise Exception("No pages found in JSON result")
                    except Exception:
                        md_res = await client.get(
                            f"https://api.cloud.llamaindex.ai/api/parsing/job/{job_id}/result/markdown",
                            headers=headers
                        )
                        full_markdown_text = md_res.json().get("markdown", "")
                    break
                elif status_data.get("status") == "ERROR":
                    raise HTTPException(status_code=500, detail="LlamaParse job processing failed.")

        logger.info(f"PDF parsed successfully, extracting metrics with gpt-5.6-luna")

        # 3. Extract structured JSON with gpt-5.6-luna using OpenAI SDK directly
        system_prompt = (
            "You are an expert ESG and Sustainability data analyst.\n"
            "Extract the exact requested metrics from the provided document markdown.\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "1. REASONING FIRST: Extract the raw text snippet first. Then, write out your reasoning before outputting final values.\n"
            "2. TEMPORAL & BOUNDARY DISAMBIGUATION: Always extract data for the MOST RECENT reporting year. Always extract Consolidated data if available.\n"
            "3. MISSING vs ZERO: If a table explicitly uses '-', 'Nil', 'None', or 'NA', determine if it implies 0 or 'Not Tracked'. If 0, output 0. If Not Tracked, output null.\n"
            "4. NORMALIZATION: Output normalizedValue alongside raw extractedValue (GHG to 'tCO2e', Financials to 'Absolute INR', Water to 'kL').\n"
            "5. CALCULATION: If not explicitly stated but underlying data exists, CALCULATE it.\n"
            "6. PAGE: Provide the approximate page number based on ---PAGE BREAK--- markers."
        )

        completion = openai_client.chat.completions.create(
            model="gpt-5.6-luna",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": full_markdown_text}
            ],
            response_format=JSON_SCHEMA
        )

        extracted_data = json.loads(completion.choices[0].message.content)

        logger.info(f"Metrics extracted successfully for: {report.filename}")

        # 4. Store in MongoDB
        competitor_record = {
            "id": competitor_id,
            "org_id": org_id,
            "name": competitor_name,
            "industry": competitor_industry,
            "year": reporting_year or "Unknown",
            "fileName": report.filename,
            "storage_path": storage_result.get("path", storage_path),
            "file_size": storage_result.get("size", len(content)),
            "metrics": extracted_data,
            "data_source": "pdf_extraction",
            "extraction_model": "gpt-5.6-luna",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user.get("id"),
            "is_deleted": False
        }

        await db.competitor_benchmarks.insert_one(competitor_record)
        logger.info(f"Competitor benchmark saved to MongoDB: {competitor_id}")

        # Remove MongoDB _id before returning
        competitor_record.pop("_id", None)
        
        return competitor_record

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Extraction error: {e}")
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


@router.post("/generate-summary")
async def generate_summary(
    req: SummaryRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Generates Executive ESG Summary & Strategic Action Roadmap using gpt-5.6-luna.
    """
    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=500, 
            detail="OpenAI API key not configured. Please contact administrator."
        )

    try:
        from openai import OpenAI
        openai_client = OpenAI(api_key=OPENAI_API_KEY)

        prompt = f"""You are a Senior ESG & Sustainability Consultant preparing an Executive Briefing.
Compare 'My Company' against its peers based on the provided normalized ESG metrics data.

My Company Data:
{json.dumps(req.myCompany, indent=2)}

Competitors Data:
{json.dumps(req.competitors, indent=2)}

Produce a JSON response with the following exact structure:
{{
  "headline": "A compelling 1-line executive summary headline highlighting overall positioning.",
  "strengths": ["List 2-3 key areas where My Company outpaces peers with exact metrics/data points"],
  "gaps": ["List 2-3 critical lag areas or risks where competitors lead"],
  "recommendations": ["List 3 actionable strategic initiatives My Company should prioritize in the next 12-24 months"]
}}"""

        completion = openai_client.chat.completions.create(
            model="gpt-5.6-luna",
            messages=[
                {"role": "system", "content": "You are an expert ESG Analyst. Return strictly valid JSON."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}
        )

        summary = json.loads(completion.choices[0].message.content)
        return summary

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Summary generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate summary: {str(e)}")
