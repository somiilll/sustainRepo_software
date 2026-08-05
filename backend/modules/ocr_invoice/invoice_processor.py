import os
import argparse
import base64
import json
import difflib
from io import BytesIO

import pandas as pd
from PIL import Image
import fitz  # PyMuPDF
from anthropic import Anthropic

# Models
MODELS = {
    "sonnet5": "claude-sonnet-5",
    "haiku4.5": "claude-haiku-4-5"
}

def load_fuel_categories(excel_path):
    df = pd.read_excel(excel_path)
    df.columns = df.columns.str.strip()
    
    fuel_records = []
    for _, row in df.iterrows():
        aliases_str = str(row.get('5 Common Aliases', '')).strip()
        if aliases_str and aliases_str != 'nan':
            aliases = [a.strip().lower() for a in aliases_str.split(',')]
        else:
            aliases = []
            
        fuel_records.append({
            'search_name': str(row['Fuel name']).strip().lower(),
            'original_name': str(row['Fuel name']).strip(),
            'category': str(row['category']).strip(),
            'scope': str(row['scope']).strip(),
            'aliases': aliases
        })
    return fuel_records

def disambiguate_fuel(raw_name, raw_context, fuel_records, client, model_id="claude-haiku-4-5"):
    # Create a concise taxonomy list (using original name + category)
    taxonomy = []
    for r in fuel_records:
        taxonomy.append(f"{r['original_name']} | Category: {r['category']} | Scope: {r['scope']}")
    taxonomy = list(set(taxonomy))
    taxonomy_str = "\n".join(taxonomy)

    prompt = f"""You are an expert ESG emissions data analyst.
We extracted the following fuel item from an invoice:
Fuel Name: {raw_name}
Context/Description: {raw_context}

Below is our strict, official corporate taxonomy of valid fuels.
You must map the extracted fuel to EXACTLY one of the valid fuels based on context.
If it is a generic electricity bill from a utility grid without explicit "Green" or "Renewable" text, map it to mapped_fuel: "Electricity" and mapped_category: "Non-Renewable".
If it is a stationary backup generator fuel, map it to a stationary category.

Official Taxonomy:
{taxonomy_str}

Return a JSON object with exactly two keys:
{{
    "mapped_fuel": "The exact original name from the taxonomy (or Unknown)",
    "mapped_category": "The exact category from the taxonomy (or Unknown)"
}}
Output ONLY the raw JSON object. Do not include markdown blocks.
"""
    try:
        response = client.messages.create(
            model=model_id,
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}]
        )
        
        raw_text = ""
        for block in response.content:
            if getattr(block, 'type', '') == 'text' and hasattr(block, 'text'):
                raw_text = block.text.strip()
                break
                
        if raw_text.startswith("```json"):
            raw_text = raw_text.replace("```json", "").replace("```", "").strip()
        if raw_text.startswith("```"):
            raw_text = raw_text.replace("```", "").strip()
            
        data = json.loads(raw_text)
        return data.get("mapped_fuel", "Unknown"), data.get("mapped_category", "Unknown")
    except Exception as e:
        print(f"Disambiguation error: {e}")
        return "Unknown", "Unknown"

def encode_image(img):
    if img.mode in ('RGBA', 'P', 'LA'):
        img = img.convert('RGB')
    buffered = BytesIO()
    img.save(buffered, format="JPEG")
    return base64.b64encode(buffered.getvalue()).decode("utf-8")

def process_file(file_path, client, model_id, fuel_records, vendor_cache):
    print(f"Processing: {file_path} using {model_id}...")
    
    image_contents = []
    
    try:
        if file_path.lower().endswith(('.pdf')):
            doc = fitz.open(file_path)
            num_pages = min(len(doc), 5) # Max 5 pages limit
            for i in range(num_pages):
                page = doc.load_page(i)
                pix = page.get_pixmap(dpi=150)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                img_b64 = encode_image(img)
                image_contents.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": img_b64,
                    },
                })
        else:
            img = Image.open(file_path)
            img_b64 = encode_image(img)
            image_contents.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": img_b64,
                },
            })
    except Exception as e:
        print(f"Error reading file {file_path}: {str(e)}")
        return None
        
    image_contents.append({
        "type": "text",
        "text": "Extract the data into JSON."
    })
    
    system_prompt = """You are a highly accurate invoice data extraction assistant.
You must extract the following information from the provided invoice image(s).
Return ONLY a valid JSON object with the exact keys below. Do not include markdown code blocks (like ```json), just the raw JSON.

{
    "invoice_number": "The unique invoice or receipt number (or null)",
    "date": "YYYY-MM-DD (billing date, or null)",
    "vendor_name": "The name of the company issuing the invoice (or null)",
    "location": "The service address or location of the facility (or null)",
    "line_items": [
        {
            "fuel_name": "The exact printed fuel, energy type, or refrigerant being billed",
            "translated_fuel_name": "If fuel_name is not English, translate to English. Otherwise, repeat fuel_name (or null)",
            "quantity": <float value of the amount billed (or null)>,
            "unit": "The unit of measurement (e.g., kWh, Liters, Gallons, kg) (or null)",
            "money_spent": <float value of the total cost (or null)>,
            "currency": "The 3-letter currency code (e.g., USD, INR, EUR) (or null)",
            "hsn_sac_code": "Tax or product code if present (or null)",
            "combustion_context": "Based on vendor and details, is this fuel used for 'Mobile Combustion' (vehicles) or 'Stationary Combustion' (generators/boilers)? Output exactly 'Mobile Combustion', 'Stationary Combustion', or 'Unknown'.",
            "raw_item_context": "Any other descriptive text for this line item",
            "confidence_score": "Evaluate your extraction certainty as an integer between 0 and 100",
            "low_confidence_fields": ["List the JSON keys of any fields where you are not completely certain of the extraction (e.g. 'quantity', 'fuel_name')", "or empty array if all are certain"]
        }
    ]
}"""

    response = client.messages.create(
        model=model_id,
        max_tokens=2000,
        system=system_prompt,
        messages=[
            {
                "role": "user",
                "content": image_contents,
            }
        ],
    )
    
    raw_text = ""
    for block in response.content:
        if getattr(block, 'type', '') == 'text' and hasattr(block, 'text'):
            raw_text = block.text.strip()
            break
            
    # clean up in case of markdown
    if raw_text.startswith("```json"):
        raw_text = raw_text.replace("```json", "").replace("```", "").strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.replace("```", "").strip()
        
    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError:
        print(f"Error parsing JSON from Claude for {file_path}: {raw_text}")
        return None

    vendor_name = str(data.get("vendor_name", "")).strip()
    invoice_number = data.get("invoice_number")
    date = data.get("date")
    location = data.get("location")
    
    line_items = data.get("line_items", [])
    if not isinstance(line_items, list):
        line_items = []
        
    extracted_rows = []
    
    for item in line_items:
        extracted_fuel_original = str(item.get("fuel_name", "")).strip().lower()
        translated_fuel = str(item.get("translated_fuel_name", "")).strip().lower()
        
        extracted_fuel = translated_fuel if translated_fuel and translated_fuel != 'none' and translated_fuel != 'null' else extracted_fuel_original
        extracted_context = str(item.get("combustion_context", "")).strip().lower()
        
        mapped_category = "Unknown"
        mapped_scope = "Unknown"
        mapped_fuel = item.get("fuel_name")
        needs_review = True # Default to True unless an exact match is found
        
        cache_key = f"{vendor_name}::{extracted_fuel}"
        
        if cache_key in vendor_cache:
            cached_data = vendor_cache[cache_key]
            mapped_category = cached_data['category']
            mapped_scope = cached_data['scope']
            mapped_fuel = cached_data['mapped_fuel']
            needs_review = False
        elif extracted_fuel and extracted_fuel != 'none' and extracted_fuel != 'null':
            exact_matches = []
            matches = []
            
            # 1. Exact match on main name
            for r in fuel_records:
                if r['search_name'] == extracted_fuel:
                    exact_matches.append(r)
                    
            # 2. Exact match on any alias
            if not exact_matches:
                for r in fuel_records:
                    if extracted_fuel in r['aliases']:
                        exact_matches.append(r)
                        
            # 3. Fuzzy match on main names and aliases
            if not exact_matches:
                all_possible_names = []
                for r in fuel_records:
                    all_possible_names.append(r['search_name'])
                    all_possible_names.extend(r['aliases'])
                all_possible_names = list(set(all_possible_names))
                
                matches = difflib.get_close_matches(extracted_fuel, all_possible_names, n=1, cutoff=0.6)
                if matches:
                    best_fuzzy = matches[0]
                    needs_review = True # Flag for human review because fuzzy match was used
                    for r in fuel_records:
                        if r['search_name'] == best_fuzzy or best_fuzzy in r['aliases']:
                            exact_matches.append(r)
                            
            if len(exact_matches) == 1 and not matches:
                # Single unambiguous exact match — resolved instantly
                best_record = exact_matches[0]
                mapped_category = best_record['category']
                mapped_scope = best_record['scope']
                mapped_fuel = best_record['original_name']
                needs_review = False
                
                vendor_cache[cache_key] = {
                    'category': mapped_category,
                    'scope': mapped_scope,
                    'mapped_fuel': mapped_fuel
                }
            elif len(exact_matches) == 1 and matches:
                # Single match but via fuzzy — use it but flag for review
                best_record = exact_matches[0]
                mapped_category = best_record['category']
                mapped_scope = best_record['scope']
                mapped_fuel = best_record['original_name']
                needs_review = True
            else:
                # Multiple exact matches (ambiguous) OR zero matches — ask Haiku
                raw_ctx = f"Vendor: {vendor_name}. " + str(item.get("raw_item_context", "")) + " " + str(item.get("combustion_context", ""))
                llm_fuel, llm_cat = disambiguate_fuel(extracted_fuel_original, raw_ctx, fuel_records, client)
                
                if llm_fuel != "Unknown" and llm_cat != "Unknown":
                    # Verify it exists in our records
                    for r in fuel_records:
                        if r['original_name'] == llm_fuel and r['category'] == llm_cat:
                            mapped_category = r['category']
                            mapped_scope = r['scope']
                            mapped_fuel = r['original_name']
                            needs_review = False
                            
                            # Cache the LLM finding
                            vendor_cache[cache_key] = {
                                'category': mapped_category,
                                'scope': mapped_scope,
                                'mapped_fuel': mapped_fuel
                            }
                            break
                    
        row_data = {
            'file': os.path.basename(file_path),
            'invoice_number': invoice_number,
            'date': date,
            'vendor_name': vendor_name,
            'location': location,
            'fuel_name': item.get("fuel_name"),
            'translated_fuel_name': item.get("translated_fuel_name"),
            'combustion_context': item.get("combustion_context"),
            'mapped_fuel': mapped_fuel,
            'category': mapped_category,
            'scope': mapped_scope,
            'quantity': item.get("quantity"),
            'unit': item.get("unit"),
            'money_spent': item.get("money_spent"),
            'currency': item.get("currency"),
            'hsn_sac_code': item.get("hsn_sac_code"),
            'confidence_score': item.get("confidence_score"),
            'low_confidence_fields': item.get("low_confidence_fields", []),
            'needs_review': needs_review
        }
        extracted_rows.append(row_data)
        
    return extracted_rows

def main():
    parser = argparse.ArgumentParser(description="Extract and categorize invoice data.")
    parser.add_argument("path", help="Path to a PDF/Image file or directory containing invoices.")
    parser.add_argument("--model", choices=["sonnet5", "haiku4.5"], default="sonnet5", help="Model to use (default: sonnet5)")
    parser.add_argument("--excel", default="Fuel_categorization_with_aliases.xlsx", help="Path to the Excel file with categories.")
    
    args = parser.parse_args()
    
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("Error: ANTHROPIC_API_KEY environment variable not set. Please set it using: set ANTHROPIC_API_KEY=your_key")
        return
        
    client = Anthropic(api_key=api_key)
    model_id = MODELS[args.model]
    
    if not os.path.exists(args.excel):
        print(f"Error: {args.excel} not found.")
        return
        
    print("Loading fuel categories...")
    fuel_records = load_fuel_categories(args.excel)
    print(f"Loaded {len(fuel_records)} fuel records.")
    
    vendor_cache_file = "vendor_cache.json"
    vendor_cache = {}
    if os.path.exists(vendor_cache_file):
        try:
            with open(vendor_cache_file, "r") as f:
                vendor_cache = json.load(f)
        except json.JSONDecodeError:
            print("Warning: vendor_cache.json is corrupted. Starting fresh.")
    
    results = []
    
    if os.path.isdir(args.path):
        for filename in os.listdir(args.path):
            if filename.lower().endswith(('.pdf', '.png', '.jpg', '.jpeg', '.avif')):
                filepath = os.path.join(args.path, filename)
                res = process_file(filepath, client, model_id, fuel_records, vendor_cache)
                if res:
                    results.extend(res)
    elif os.path.isfile(args.path):
        res = process_file(args.path, client, model_id, fuel_records, vendor_cache)
        if res:
            results.extend(res)
    else:
        print(f"Error: {args.path} is not a valid file or directory.")
        return
        
    # Save cache
    with open(vendor_cache_file, "w") as f:
        json.dump(vendor_cache, f, indent=4)
        
    if results:
        df = pd.DataFrame(results)
        # Reorder columns with the new extraction fields
        cols = ['file', 'invoice_number', 'date', 'vendor_name', 'location', 
                'fuel_name', 'translated_fuel_name', 'combustion_context', 
                'mapped_fuel', 'category', 'scope', 
                'quantity', 'unit', 'money_spent', 'currency', 'hsn_sac_code', 'confidence_score', 'low_confidence_fields', 'needs_review']
        cols = [c for c in cols if c in df.columns]
        df = df[cols]
        
        print("\n=== EXTRACTED & CATEGORIZED DATA ===")
        try:
            import tabulate
            print(df.to_markdown(index=False))
        except ImportError:
            print(df.to_string(index=False))
            
        output_csv = "extracted_invoices.csv"
        df.to_csv(output_csv, index=False)
        print(f"\nData successfully saved to {output_csv}")
    else:
        print("No data extracted.")

if __name__ == "__main__":
    main()
