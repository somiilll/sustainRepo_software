"""
Peer Benchmarking Module Router

Provides endpoints for:
- Extracting ESG metrics from PDF reports
- Generating AI-powered executive summaries
"""

import os
import json
from fastapi import APIRouter, File, UploadFile, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List

router = APIRouter(prefix="/benchmarking", tags=["Peer Benchmarking"])

# Check for OpenAI API key
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
LLAMA_CLOUD_API_KEY = os.environ.get("LLAMA_CLOUD_API_KEY")


class SummaryRequest(BaseModel):
    myCompany: Dict[str, Any]
    competitors: List[Dict[str, Any]]


@router.post("/extract")
async def extract_metrics(report: UploadFile = File(...)):
    """
    Extracts ESG metrics from uploaded PDF report.
    Falls back to mock data if API keys are not configured.
    """
    if not report.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        content = await report.read()
        
        # If OpenAI key not configured, return mock data
        if not OPENAI_API_KEY or not LLAMA_CLOUD_API_KEY:
            return {"metrics": generate_mock_metrics()}
        
        # Import OpenAI only if key is available
        from openai import OpenAI
        import httpx
        import asyncio
        
        openai_client = OpenAI(api_key=OPENAI_API_KEY)
        
        # Parse PDF with LlamaParse
        headers = {"Authorization": f"Bearer {LLAMA_CLOUD_API_KEY}"}
        parsing_instruction = (
            "Pay special attention to tables, infographics, metric callout boxes, and charts throughout the document.\n"
            "1. TABLES: Extract all tabular data cleanly into markdown tables. Preserve all numbers, decimal places, and thousands separators without dropping digits.\n"
            "2. INFOGRAPHICS & CALLOUT BOXES: Do not skip infographics, visual stat cards, or key-highlight boxes. Convert all text, numbers, and units inside visual infographics into clear markdown text."
        )

        files = {"file": (report.filename, content, report.content_type or "application/pdf")}
        data = {"parsing_instruction": parsing_instruction}

        async with httpx.AsyncClient(timeout=300.0) as client:
            upload_res = await client.post(
                "https://api.cloud.llamaindex.ai/api/parsing/upload",
                headers=headers,
                files=files,
                data=data
            )

            if upload_res.status_code != 200:
                raise HTTPException(status_code=500, detail=f"LlamaParse upload failed: {upload_res.text}")

            job_id = upload_res.json().get("id")

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
                    md_res = await client.get(
                        f"https://api.cloud.llamaindex.ai/api/parsing/job/{job_id}/result/markdown",
                        headers=headers
                    )
                    full_markdown_text = md_res.json().get("markdown", "")
                    break
                elif status_data.get("status") == "ERROR":
                    raise HTTPException(status_code=500, detail="LlamaParse job processing failed.")

        # Extract with OpenAI
        system_prompt = (
            "You are an expert ESG and Sustainability data analyst.\n"
            "Extract the exact requested metrics from the provided document markdown.\n"
            "Return JSON with these fields: scope1, scope2, emissionIntensityPerTurnover, treatedWaterDischarged, "
            "renewableEnergy, wasteRecycled, hazardousWaste, wasteIntensity, ltirEmployee, ltirWorker, "
            "dataPrivacyPolicy, disciplinaryAction, daysAccountsPayable.\n"
            "Each field should have: rawTextFound, reasoning, extractedValue, reportedUnit, normalizedValue, normalizedUnit, page."
        )

        completion = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": full_markdown_text}
            ],
            response_format={"type": "json_object"}
        )

        extracted_data = json.loads(completion.choices[0].message.content)
        return {"metrics": extracted_data}

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Extraction error: {e}")
        # Return mock data on any error
        return {"metrics": generate_mock_metrics()}


@router.post("/generate-summary")
async def generate_summary(req: SummaryRequest):
    """
    Generates Executive ESG Summary & Strategic Action Roadmap
    """
    if not OPENAI_API_KEY:
        # Return mock summary if no API key
        return {
            "headline": "Your company shows strong environmental performance with opportunities for social metric improvements.",
            "strengths": [
                "Leading renewable energy adoption at 45% vs peer average of 35%",
                "Zero disciplinary actions indicating strong governance practices",
                "Lower emission intensity compared to industry peers"
            ],
            "gaps": [
                "LTIR rates higher than top performers in the sector",
                "Waste recycling rate below peer benchmark",
                "Days accounts payable could be optimized"
            ],
            "recommendations": [
                "Implement enhanced workplace safety programs to reduce LTIR by 20%",
                "Invest in circular economy initiatives to boost waste recycling to 80%",
                "Review supply chain payment terms for better working capital efficiency"
            ]
        }

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
        raise HTTPException(status_code=500, detail=f"Failed to generate summary: {str(e)}")


def generate_mock_metrics():
    """Generate mock ESG metrics for testing without API keys"""
    import random
    
    def mock_metric(val, unit):
        return {
            "rawTextFound": str(val),
            "reasoning": "Mock data generated for testing",
            "extractedValue": val,
            "reportedUnit": unit,
            "normalizedValue": val,
            "normalizedUnit": unit,
            "page": random.randint(5, 50)
        }
    
    return {
        "scope1": mock_metric(random.randint(8000, 20000), "tCO2e"),
        "scope2": mock_metric(random.randint(3000, 8000), "tCO2e"),
        "emissionIntensityPerTurnover": mock_metric(round(random.uniform(0.03, 0.1), 4), "tCO2e/INR"),
        "treatedWaterDischarged": mock_metric(random.randint(70, 95), "%"),
        "renewableEnergy": mock_metric(random.randint(25, 60), "%"),
        "wasteRecycled": mock_metric(random.randint(50, 85), "%"),
        "hazardousWaste": mock_metric(random.randint(80, 200), "tons"),
        "wasteIntensity": mock_metric(round(random.uniform(1.5, 4), 2), "tons/INR"),
        "ltirEmployee": mock_metric(round(random.uniform(0.5, 2.5), 2), "rate"),
        "ltirWorker": mock_metric(round(random.uniform(1, 3.5), 2), "rate"),
        "dataPrivacyPolicy": mock_metric(random.choice([True, True, True, False]), None),
        "disciplinaryAction": mock_metric(random.randint(0, 3), "count"),
        "daysAccountsPayable": mock_metric(random.randint(30, 60), "days")
    }
