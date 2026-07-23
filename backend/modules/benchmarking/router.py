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


@router.get("/available-years")
async def get_available_years(
    current_user: dict = Depends(get_current_user),
):
    """
    Returns list of available reporting years/periods from the organization's data.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization found")

    fiscal_years = set()
    calendar_years = set()
    monthly_periods = set()
    
    def extract_year_label(period):
        """Extract and categorize year label from various period formats"""
        if period is None:
            return None, None
        
        # If it's a dict object (nested reporting period)
        if isinstance(period, dict):
            fy = period.get("financial_year")
            if fy:
                return "fy", fy
            cy = period.get("calendar_year")
            if cy:
                return "cy", f"CY {cy}"
            year = period.get("year")
            month = period.get("month")
            if year and month:
                month_num = month if isinstance(month, int) else {
                    'january': 1, 'february': 2, 'march': 3, 'april': 4,
                    'may': 5, 'june': 6, 'july': 7, 'august': 8,
                    'september': 9, 'october': 10, 'november': 11, 'december': 12
                }.get(str(month).lower(), month)
                return "monthly", f"{year}-{str(month_num).zfill(2)}"
            if year:
                return "cy", f"CY {year}"
            return None, None
        
        # If it's a string
        period_str = str(period).strip()
        if not period_str:
            return None, None
            
        # Skip if it looks like a stringified dict
        if period_str.startswith("{") and period_str.endswith("}"):
            return None, None
        
        period_upper = period_str.upper()
        
        # Fiscal Year patterns
        if "FY" in period_upper:
            return "fy", period_str
        
        # Calendar Year patterns
        if period_upper.startswith("CY"):
            return "cy", period_str
            
        # Monthly pattern (YYYY-MM)
        if len(period_str) == 7 and "-" in period_str:
            return "monthly", period_str
            
        return None, None
    
    # Get unique reporting periods from emissions
    try:
        emission_periods = await db.emission_records.distinct(
            "reporting_period",
            {"organization_id": org_id}
        )
        for period in emission_periods:
            category, label = extract_year_label(period)
            if label:
                if category == "fy":
                    fiscal_years.add(label)
                elif category == "cy":
                    calendar_years.add(label)
                elif category == "monthly":
                    monthly_periods.add(label)
    except Exception as e:
        logger.warning(f"Error fetching emission periods: {e}")

    # Get unique reporting periods from environment records
    try:
        env_periods = await db.environment_records.distinct(
            "reporting_period",
            {"org_id": org_id}
        )
        for period in env_periods:
            category, label = extract_year_label(period)
            if label:
                if category == "fy":
                    fiscal_years.add(label)
                elif category == "cy":
                    calendar_years.add(label)
                elif category == "monthly":
                    monthly_periods.add(label)
    except Exception as e:
        logger.warning(f"Error fetching environment periods: {e}")

    # Build final list: FY years (sorted desc) -> CY years (sorted desc) -> Monthly (sorted desc)
    result = ["All Data"]
    
    # Add fiscal years (sorted by year descending)
    fy_sorted = sorted(list(fiscal_years), reverse=True)
    result.extend(fy_sorted)
    
    # Add calendar years (sorted descending)
    cy_sorted = sorted(list(calendar_years), reverse=True)
    result.extend(cy_sorted)
    
    # Add monthly periods (sorted descending)
    monthly_sorted = sorted(list(monthly_periods), reverse=True)
    result.extend(monthly_sorted)
    
    return {"years": result}


@router.get("/my-company")
async def get_my_company_data(
    year: str = "All Data",
    current_user: dict = Depends(get_current_user),
):
    """
    Fetches internal ESG data for the user's organization to use as 'My Company' baseline.
    Aggregates data from emissions, environment, social, and governance records.
    Optionally filters by reporting year/period.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization found")

    # Get organization details
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    org_name = org.get("name", "My Company") if org else "My Company"
    industry = org.get("industry") or org.get("sector") or "Manufacturing"

    # Determine display year
    if year == "All Data":
        current_year = datetime.now().year
        reporting_year = f"All Data (up to {current_year})"
    else:
        reporting_year = year

    # Initialize metrics
    metrics = {
        "scope1": create_empty_metric(),
        "scope2": create_empty_metric(),
        "emissionIntensityPerTurnover": create_empty_metric(),
        "treatedWaterDischarged": create_empty_metric(),
        "renewableEnergy": create_empty_metric(),
        "wasteRecycled": create_empty_metric(),
        "hazardousWaste": create_empty_metric(),
        "wasteIntensity": create_empty_metric(),
        "ltirEmployee": create_empty_metric(),
        "ltirWorker": create_empty_metric(),
        "dataPrivacyPolicy": create_empty_metric(),
        "disciplinaryAction": create_empty_metric(),
        "daysAccountsPayable": create_empty_metric(),
    }

    # Build query filter for year
    def build_year_filter(year_value, period_field="reporting_period"):
        if year_value == "All Data":
            return {}
        # Match exact period or periods containing the year
        return {
            "$or": [
                {period_field: year_value},
                {period_field: {"$regex": year_value.replace("FY ", "").replace("FY", ""), "$options": "i"}}
            ]
        }

    emission_year_filter = build_year_filter(year)
    env_year_filter = build_year_filter(year)

    # 1. Fetch GHG Emissions data (Scope 1 & 2)
    try:
        scope1_total = 0
        scope2_total = 0
        
        query = {"organization_id": org_id}
        if emission_year_filter:
            query.update(emission_year_filter)
        
        emission_records = await db.emission_records.find(
            query,
            {"_id": 0, "scope": 1, "co2e_emissions": 1, "total_emissions": 1}
        ).to_list(1000)

        for record in emission_records:
            scope = str(record.get("scope", "")).lower()
            emissions_val = record.get("co2e_emissions") or record.get("total_emissions") or 0
            if scope == "scope1" or scope == "scope 1" or "1" in scope and "scope" in scope:
                scope1_total += emissions_val
            elif scope == "scope2" or scope == "scope 2" or "2" in scope and "scope" in scope:
                scope2_total += emissions_val

        if scope1_total > 0:
            metrics["scope1"] = create_metric(round(scope1_total, 2), "tCO2e", f"Aggregated from {year} emission records")
        if scope2_total > 0:
            metrics["scope2"] = create_metric(round(scope2_total, 2), "tCO2e", f"Aggregated from {year} emission records")

    except Exception as e:
        logger.warning(f"Error fetching emissions: {e}")

    # 2. Fetch Environment records (Energy, Water, Waste)
    try:
        env_records = await db.environment_records.find(
            {"org_id": org_id},
            {"_id": 0, "category": 1, "subcategory": 1, "field_values": 1}
        ).to_list(500)

        for record in env_records:
            category = (record.get("category") or "").lower()
            subcategory = (record.get("subcategory") or "").lower()
            field_values = record.get("field_values") or {}

            # Renewable Energy
            if "energy" in category and ("renewable" in subcategory or "renewable" in category):
                for key, val in field_values.items():
                    if isinstance(val, (int, float)) and val > 0:
                        metrics["renewableEnergy"] = create_metric(val, "%", f"From {category}/{subcategory}")
                        break

            # Water discharge
            if "water" in category and "discharge" in subcategory:
                for key, val in field_values.items():
                    if isinstance(val, (int, float)) and val > 0:
                        metrics["treatedWaterDischarged"] = create_metric(val, "%", f"From {category}/{subcategory}")
                        break

            # Waste recycled
            if "waste" in category:
                if "recycl" in subcategory or "recover" in subcategory:
                    for key, val in field_values.items():
                        if isinstance(val, (int, float)) and val > 0:
                            metrics["wasteRecycled"] = create_metric(val, "%", f"From {category}/{subcategory}")
                            break
                elif "hazardous" in subcategory:
                    for key, val in field_values.items():
                        if isinstance(val, (int, float)) and val > 0:
                            metrics["hazardousWaste"] = create_metric(val, "tons", f"From {category}/{subcategory}")
                            break

    except Exception as e:
        logger.warning(f"Error fetching environment records: {e}")

    # 3. Fetch Social records (Safety metrics)
    try:
        social_records = await db.social_records.find(
            {"org_id": org_id},
            {"_id": 0, "category": 1, "subcategory": 1, "field_values": 1}
        ).to_list(500)

        for record in social_records:
            category = (record.get("category") or "").lower()
            subcategory = (record.get("subcategory") or "").lower()
            field_values = record.get("field_values") or {}

            # LTIR / Safety metrics
            if "safety" in category or "health" in category or "ltir" in subcategory or "ltifr" in subcategory:
                for key, val in field_values.items():
                    key_lower = key.lower()
                    if isinstance(val, (int, float)):
                        if "employee" in key_lower and val > 0:
                            metrics["ltirEmployee"] = create_metric(val, "rate", f"From {category}/{subcategory}")
                        elif "worker" in key_lower and val > 0:
                            metrics["ltirWorker"] = create_metric(val, "rate", f"From {category}/{subcategory}")

    except Exception as e:
        logger.warning(f"Error fetching social records: {e}")

    # 4. Fetch Governance records
    try:
        gov_records = await db.governance_records.find(
            {"org_id": org_id},
            {"_id": 0, "category": 1, "subcategory": 1, "field_values": 1}
        ).to_list(500)

        for record in gov_records:
            category = (record.get("category") or "").lower()
            subcategory = (record.get("subcategory") or "").lower()
            field_values = record.get("field_values") or {}

            # Data Privacy Policy
            if "privacy" in category or "privacy" in subcategory or "data protection" in subcategory:
                for key, val in field_values.items():
                    if isinstance(val, bool):
                        metrics["dataPrivacyPolicy"] = create_metric(val, None, f"From {category}/{subcategory}")
                        break
                    elif isinstance(val, str) and val.lower() in ["yes", "true", "compliant"]:
                        metrics["dataPrivacyPolicy"] = create_metric(True, None, f"From {category}/{subcategory}")
                        break

            # Disciplinary actions
            if "disciplinary" in category or "disciplinary" in subcategory or "bribery" in subcategory:
                for key, val in field_values.items():
                    if isinstance(val, (int, float)):
                        metrics["disciplinaryAction"] = create_metric(val, "count", f"From {category}/{subcategory}")
                        break

    except Exception as e:
        logger.warning(f"Error fetching governance records: {e}")

    return {
        "id": "my-company",
        "name": org_name,
        "industry": industry,
        "year": reporting_year,
        "fileName": "Internal ESG Data",
        "metrics": metrics,
        "data_source": "internal"
    }


def create_empty_metric():
    return {
        "rawTextFound": None,
        "reasoning": "No data found in internal records",
        "extractedValue": None,
        "reportedUnit": None,
        "normalizedValue": None,
        "normalizedUnit": None,
        "page": None
    }


def create_metric(value, unit, reasoning):
    return {
        "rawTextFound": str(value),
        "reasoning": reasoning,
        "extractedValue": value,
        "reportedUnit": unit,
        "normalizedValue": value,
        "normalizedUnit": unit,
        "page": None
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
