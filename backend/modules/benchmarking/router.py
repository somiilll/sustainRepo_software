"""
Peer Benchmarking Module Router

Provides endpoints for:
- Fetching internal company ESG data (My Company baseline)
- Extracting ESG metrics from competitor PDF reports
- Generating AI-powered executive summaries
"""

import os
import json
import asyncio
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import httpx

from shared.database.mongo import db
from modules.auth.dependencies import get_current_user
from services.esg_metrics_service import ESGMetricsService, get_benchmarking_metrics

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/benchmarking", tags=["Peer Benchmarking"])

# Use dedicated API keys for Peer Benchmarking
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY_PEER_BENCHMARKING")
LLAMA_CLOUD_API_KEY = os.environ.get("LLAMA_CLOUD_API_KEY_PEER_BENCHMARKING")


class SummaryRequest(BaseModel):
    myCompany: Dict[str, Any]
    competitors: List[Dict[str, Any]]


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
        # Get date range from emission records using reporting_period
        periods = await db.emission_records.distinct(
            "reporting_period",
            {"organization_id": org_id}
        )
        
        # Extract dates from various period formats
        dates = []
        for period in periods:
            if isinstance(period, dict):
                year = period.get("year")
                month = period.get("month", 1)
                if year:
                    try:
                        dates.append(datetime(int(year), int(month) if isinstance(month, int) else 1, 1))
                    except:
                        pass
            elif isinstance(period, str):
                # Try to parse "YYYY-MM" format
                try:
                    if len(period) >= 7 and "-" in period:
                        parts = period.split("-")
                        dates.append(datetime(int(parts[0]), int(parts[1]), 1))
                except:
                    pass
        
        if dates:
            min_date = min(dates)
            max_date = max(dates)
            
    except Exception as e:
        logger.warning(f"Error fetching date range: {e}")

    # Default to reasonable range if no data
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
    Uses the unified ESGMetricsService for all calculations.
    Filters by reporting_period based on start_date and end_date (YYYY-MM-DD format).
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization found")

    # Get organization details
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    org_name = org.get("name", "My Company") if org else "My Company"
    industry = org.get("industry") or org.get("sector") or "Manufacturing"

    # Determine display period
    if start_date and end_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
            reporting_year = f"{start_dt.strftime('%d %b %Y')} - {end_dt.strftime('%d %b %Y')}"
        except:
            reporting_year = f"{start_date} - {end_date}"
    elif start_date:
        reporting_year = f"From {start_date}"
    elif end_date:
        reporting_year = f"Until {end_date}"
    else:
        reporting_year = "All Data"

    # Use the unified ESG Metrics Service
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


@router.post("/extract")
async def extract_metrics(
    report: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Extracts ESG metrics from uploaded PDF report using LlamaParse and OpenAI.
    """
    if not report.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    if not OPENAI_API_KEY or not LLAMA_CLOUD_API_KEY:
        raise HTTPException(
            status_code=500, 
            detail="API keys not configured. Please contact administrator."
        )

    try:
        from openai import OpenAI
        
        content = await report.read()
        openai_client = OpenAI(api_key=OPENAI_API_KEY)

        # 1. Parse PDF with LlamaParse
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

            # Poll job status
            full_markdown_text = ""
            while True:
                await asyncio.sleep(2)

                status_res = await client.get(
                    f"https://api.cloud.llamaindex.ai/api/parsing/job/{job_id}",
                    headers=headers
                )
                status_data = status_res.json()

                if status_data.get("status") == "SUCCESS":
                    # Fetch JSON result to construct page-marked markdown
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
                        # Fallback to markdown endpoint
                        md_res = await client.get(
                            f"https://api.cloud.llamaindex.ai/api/parsing/job/{job_id}/result/markdown",
                            headers=headers
                        )
                        full_markdown_text = md_res.json().get("markdown", "")
                    break
                elif status_data.get("status") == "ERROR":
                    raise HTTPException(status_code=500, detail="LlamaParse job processing failed.")

        logger.info(f"PDF parsed successfully, extracting metrics with OpenAI")

        # 2. Extract structured JSON with OpenAI
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
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": full_markdown_text}
            ],
            response_format=JSON_SCHEMA
        )

        extracted_data = json.loads(completion.choices[0].message.content)
        logger.info(f"Metrics extracted successfully for: {report.filename}")
        
        return {"metrics": extracted_data}

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
    Generates Executive ESG Summary & Strategic Action Roadmap
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
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are an expert ESG Analyst. Return strictly valid JSON."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}
        )

        summary = json.loads(completion.choices[0].message.content)
        return summary
    except Exception as e:
        logger.error(f"Summary generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate summary: {str(e)}")
