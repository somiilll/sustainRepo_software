from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
from passlib.context import CryptContext
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io
import base64
from fastapi.responses import StreamingResponse

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 43200

security = HTTPBearer()

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Standard GHG emission factors (kg CO2e per unit)
STANDARD_EMISSION_FACTORS = {
    "scope1": {
        "stationary_combustion": {
            "natural_gas": {"factor": 2.03, "unit": "kg CO2e/m³"},
            "diesel": {"factor": 2.68, "unit": "kg CO2e/liter"},
            "coal": {"factor": 2.42, "unit": "kg CO2e/kg"},
            "lpg": {"factor": 1.51, "unit": "kg CO2e/liter"}
        },
        "mobile_combustion": {
            "petrol": {"factor": 2.31, "unit": "kg CO2e/liter"},
            "diesel": {"factor": 2.68, "unit": "kg CO2e/liter"},
            "cng": {"factor": 1.88, "unit": "kg CO2e/m³"}
        },
        "fugitive": {
            "r134a": {"factor": 1430, "unit": "kg CO2e/kg"},
            "r410a": {"factor": 2088, "unit": "kg CO2e/kg"},
            "methane": {"factor": 25, "unit": "kg CO2e/kg"}
        },
        "process": {
            "cement": {"factor": 0.52, "unit": "kg CO2e/kg"},
            "steel": {"factor": 1.85, "unit": "kg CO2e/kg"}
        }
    },
    "scope2": {
        "electricity": {
            "grid": {"factor": 0.82, "unit": "kg CO2e/kWh"},
            "renewable": {"factor": 0.0, "unit": "kg CO2e/kWh"}
        }
    }
}

# Models
class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "user"

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    full_name: str
    role: str
    assigned_facilities: List[str] = []
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class OrganizationCreate(BaseModel):
    name: str
    logo: Optional[str] = None
    address: str
    mission: Optional[str] = None
    vision: Optional[str] = None
    description: Optional[str] = None
    reporting_frequency: str
    base_year: int

class OrganizationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    logo: Optional[str] = None
    address: str
    mission: Optional[str] = None
    vision: Optional[str] = None
    description: Optional[str] = None
    reporting_frequency: str
    base_year: int
    user_id: str
    created_at: str

class FacilityCreate(BaseModel):
    name: str
    address: str
    products_manufactured: Optional[str] = None
    machinery_used: Optional[str] = None
    sector: Optional[str] = None
    responsible_person: Optional[str] = None
    reporting_frequency: str = "monthly"

class FacilityResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    address: str
    products_manufactured: Optional[str] = None
    machinery_used: Optional[str] = None
    sector: Optional[str] = None
    responsible_person: Optional[str] = None
    reporting_frequency: str
    user_id: str
    created_at: str

class EmissionFactorCreate(BaseModel):
    name: str
    scope: str
    category: str
    sub_category: str
    factor: float
    unit: str
    source: Optional[str] = None
    is_custom: bool = True

class EmissionFactorResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    scope: str
    category: str
    sub_category: str
    factor: float
    unit: str
    source: Optional[str] = None
    is_custom: bool
    user_id: str
    created_at: str

class EmissionRecordCreate(BaseModel):
    facility_id: str
    reporting_period: str
    scope: str
    category: str
    sub_category: str
    fuel_type: Optional[str] = None
    quantity: float
    emission_factor: float
    unit: str
    source_of_information: Optional[str] = None
    notes: Optional[str] = None
    is_custom_factor: bool = False

class EmissionRecordResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    facility_id: str
    reporting_period: str
    scope: str
    category: str
    sub_category: str
    fuel_type: Optional[str] = None
    quantity: float
    emission_factor: float
    unit: str
    total_emissions: float
    source_of_information: Optional[str] = None
    notes: Optional[str] = None
    is_custom_factor: bool
    user_id: str
    created_at: str

class DashboardStats(BaseModel):
    total_facilities: int
    total_emissions: float
    scope1_emissions: float
    scope2_emissions: float
    recent_records: List[EmissionRecordResponse]
    emissions_by_facility: List[Dict[str, Any]]
    emissions_trend: List[Dict[str, Any]]

# Helper functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def get_admin_user(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not authorized. Admin access required.")
    return current_user

# Auth endpoints
@api_router.post("/auth/signup", response_model=TokenResponse)
async def signup(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_dict = {
        "id": str(uuid.uuid4()),
        "email": user_data.email,
        "full_name": user_data.full_name,
        "role": user_data.role,
        "password_hash": get_password_hash(user_data.password),
        "assigned_facilities": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_dict)
    
    access_token = create_access_token(data={"sub": user_dict["id"]})
    user_response = UserResponse(**{k: v for k, v in user_dict.items() if k != "password_hash"})
    
    return TokenResponse(access_token=access_token, token_type="bearer", user=user_response)

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    access_token = create_access_token(data={"sub": user["id"]})
    user_response = UserResponse(**{k: v for k, v in user.items() if k != "password_hash"})
    
    return TokenResponse(access_token=access_token, token_type="bearer", user=user_response)

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(**current_user)

# Organization endpoints
@api_router.post("/organizations", response_model=OrganizationResponse)
async def create_organization(org_data: OrganizationCreate, current_user: dict = Depends(get_current_user)):
    org_dict = org_data.model_dump()
    org_dict["id"] = str(uuid.uuid4())
    org_dict["user_id"] = current_user["id"]
    org_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.organizations.insert_one(org_dict)
    return OrganizationResponse(**org_dict)

@api_router.get("/organizations", response_model=List[OrganizationResponse])
async def get_organizations(current_user: dict = Depends(get_current_user)):
    orgs = await db.organizations.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(100)
    return [OrganizationResponse(**org) for org in orgs]

@api_router.get("/organizations/{org_id}", response_model=OrganizationResponse)
async def get_organization(org_id: str, current_user: dict = Depends(get_current_user)):
    org = await db.organizations.find_one({"id": org_id, "user_id": current_user["id"]}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return OrganizationResponse(**org)

@api_router.put("/organizations/{org_id}", response_model=OrganizationResponse)
async def update_organization(org_id: str, org_data: OrganizationCreate, current_user: dict = Depends(get_current_user)):
    existing = await db.organizations.find_one({"id": org_id, "user_id": current_user["id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    update_dict = org_data.model_dump()
    await db.organizations.update_one({"id": org_id}, {"$set": update_dict})
    
    updated = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    return OrganizationResponse(**updated)

# Facility endpoints
@api_router.post("/facilities", response_model=FacilityResponse)
async def create_facility(facility_data: FacilityCreate, current_user: dict = Depends(get_current_user)):
    facility_dict = facility_data.model_dump()
    facility_dict["id"] = str(uuid.uuid4())
    facility_dict["user_id"] = current_user["id"]
    facility_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.facilities.insert_one(facility_dict)
    return FacilityResponse(**facility_dict)

@api_router.get("/facilities", response_model=List[FacilityResponse])
async def get_facilities(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "admin":
        facilities = await db.facilities.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(1000)
    else:
        assigned = current_user.get("assigned_facilities", [])
        facilities = await db.facilities.find({"id": {"$in": assigned}}, {"_id": 0}).to_list(1000)
    return [FacilityResponse(**f) for f in facilities]

@api_router.get("/facilities/{facility_id}", response_model=FacilityResponse)
async def get_facility(facility_id: str, current_user: dict = Depends(get_current_user)):
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    if current_user["role"] != "admin" and facility_id not in current_user.get("assigned_facilities", []):
        raise HTTPException(status_code=403, detail="Not authorized to access this facility")
    
    return FacilityResponse(**facility)

@api_router.put("/facilities/{facility_id}", response_model=FacilityResponse)
async def update_facility(facility_id: str, facility_data: FacilityCreate, current_user: dict = Depends(get_current_user)):
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    if current_user["role"] != "admin" and facility_id not in current_user.get("assigned_facilities", []):
        raise HTTPException(status_code=403, detail="Not authorized to update this facility")
    
    update_dict = facility_data.model_dump()
    await db.facilities.update_one({"id": facility_id}, {"$set": update_dict})
    
    updated = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    return FacilityResponse(**updated)

@api_router.delete("/facilities/{facility_id}")
async def delete_facility(facility_id: str, current_user: dict = Depends(get_admin_user)):
    result = await db.facilities.delete_one({"id": facility_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Facility not found")
    return {"message": "Facility deleted successfully"}

# Emission factors endpoints
@api_router.get("/emission-factors/standard")
async def get_standard_factors():
    return STANDARD_EMISSION_FACTORS

@api_router.post("/emission-factors", response_model=EmissionFactorResponse)
async def create_emission_factor(factor_data: EmissionFactorCreate, current_user: dict = Depends(get_current_user)):
    factor_dict = factor_data.model_dump()
    factor_dict["id"] = str(uuid.uuid4())
    factor_dict["user_id"] = current_user["id"]
    factor_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.emission_factors.insert_one(factor_dict)
    return EmissionFactorResponse(**factor_dict)

@api_router.get("/emission-factors", response_model=List[EmissionFactorResponse])
async def get_emission_factors(current_user: dict = Depends(get_current_user)):
    factors = await db.emission_factors.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(1000)
    return [EmissionFactorResponse(**f) for f in factors]

# Emission records endpoints
@api_router.post("/emissions", response_model=EmissionRecordResponse)
async def create_emission_record(record_data: EmissionRecordCreate, current_user: dict = Depends(get_current_user)):
    facility = await db.facilities.find_one({"id": record_data.facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    if current_user["role"] != "admin" and record_data.facility_id not in current_user.get("assigned_facilities", []):
        raise HTTPException(status_code=403, detail="Not authorized to add emissions for this facility")
    
    record_dict = record_data.model_dump()
    record_dict["id"] = str(uuid.uuid4())
    record_dict["user_id"] = current_user["id"]
    record_dict["total_emissions"] = record_data.quantity * record_data.emission_factor
    record_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.emission_records.insert_one(record_dict)
    return EmissionRecordResponse(**record_dict)

@api_router.get("/emissions", response_model=List[EmissionRecordResponse])
async def get_emission_records(
    facility_id: Optional[str] = None,
    reporting_period: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    
    if current_user["role"] == "admin":
        query["user_id"] = current_user["id"]
    else:
        assigned = current_user.get("assigned_facilities", [])
        query["facility_id"] = {"$in": assigned}
    
    if facility_id:
        query["facility_id"] = facility_id
    if reporting_period:
        query["reporting_period"] = reporting_period
    
    records = await db.emission_records.find(query, {"_id": 0}).to_list(1000)
    return [EmissionRecordResponse(**r) for r in records]

@api_router.put("/emissions/{record_id}", response_model=EmissionRecordResponse)
async def update_emission_record(record_id: str, record_data: EmissionRecordCreate, current_user: dict = Depends(get_current_user)):
    existing = await db.emission_records.find_one({"id": record_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Emission record not found")
    
    update_dict = record_data.model_dump()
    update_dict["total_emissions"] = record_data.quantity * record_data.emission_factor
    
    await db.emission_records.update_one({"id": record_id}, {"$set": update_dict})
    updated = await db.emission_records.find_one({"id": record_id}, {"_id": 0})
    return EmissionRecordResponse(**updated)

@api_router.delete("/emissions/{record_id}")
async def delete_emission_record(record_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.emission_records.delete_one({"id": record_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Emission record not found")
    return {"message": "Emission record deleted successfully"}

# Dashboard endpoints
@api_router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "admin":
        facilities = await db.facilities.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(1000)
        facility_ids = [f["id"] for f in facilities]
        emissions_query = {"facility_id": {"$in": facility_ids}}
    else:
        assigned = current_user.get("assigned_facilities", [])
        facilities = await db.facilities.find({"id": {"$in": assigned}}, {"_id": 0}).to_list(1000)
        emissions_query = {"facility_id": {"$in": assigned}}
    
    all_emissions = await db.emission_records.find(emissions_query, {"_id": 0}).to_list(10000)
    
    total_emissions = sum(e["total_emissions"] for e in all_emissions)
    scope1_emissions = sum(e["total_emissions"] for e in all_emissions if e["scope"] == "scope1")
    scope2_emissions = sum(e["total_emissions"] for e in all_emissions if e["scope"] == "scope2")
    
    recent_records = sorted(all_emissions, key=lambda x: x["created_at"], reverse=True)[:5]
    
    emissions_by_facility = []
    for facility in facilities:
        facility_emissions = [e for e in all_emissions if e["facility_id"] == facility["id"]]
        total = sum(e["total_emissions"] for e in facility_emissions)
        scope1 = sum(e["total_emissions"] for e in facility_emissions if e["scope"] == "scope1")
        scope2 = sum(e["total_emissions"] for e in facility_emissions if e["scope"] == "scope2")
        emissions_by_facility.append({
            "facility_id": facility["id"],
            "facility_name": facility["name"],
            "total_emissions": round(total, 2),
            "scope1_emissions": round(scope1, 2),
            "scope2_emissions": round(scope2, 2)
        })
    
    period_map = {}
    for emission in all_emissions:
        period = emission["reporting_period"]
        if period not in period_map:
            period_map[period] = {"period": period, "scope1": 0, "scope2": 0, "total": 0}
        period_map[period]["scope1"] += emission["total_emissions"] if emission["scope"] == "scope1" else 0
        period_map[period]["scope2"] += emission["total_emissions"] if emission["scope"] == "scope2" else 0
        period_map[period]["total"] += emission["total_emissions"]
    
    emissions_trend = sorted(period_map.values(), key=lambda x: x["period"])
    
    return DashboardStats(
        total_facilities=len(facilities),
        total_emissions=round(total_emissions, 2),
        scope1_emissions=round(scope1_emissions, 2),
        scope2_emissions=round(scope2_emissions, 2),
        recent_records=[EmissionRecordResponse(**r) for r in recent_records],
        emissions_by_facility=emissions_by_facility,
        emissions_trend=emissions_trend
    )

# Report generation endpoint
@api_router.get("/reports/facility/{facility_id}")
async def generate_facility_report(facility_id: str, current_user: dict = Depends(get_current_user)):
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    if current_user["role"] != "admin" and facility_id not in current_user.get("assigned_facilities", []):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    emissions = await db.emission_records.find({"facility_id": facility_id}, {"_id": 0}).to_list(10000)
    
    doc = Document()
    
    # Title
    title = doc.add_heading('GHG Emissions Report', 0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    # Facility details
    doc.add_heading('Facility Information', 1)
    doc.add_paragraph(f"Name: {facility['name']}")
    doc.add_paragraph(f"Address: {facility['address']}")
    if facility.get('sector'):
        doc.add_paragraph(f"Sector: {facility['sector']}")
    if facility.get('responsible_person'):
        doc.add_paragraph(f"Responsible Person: {facility['responsible_person']}")
    
    doc.add_paragraph()
    
    # Summary
    doc.add_heading('Emissions Summary', 1)
    total_emissions = sum(e["total_emissions"] for e in emissions)
    scope1_total = sum(e["total_emissions"] for e in emissions if e["scope"] == "scope1")
    scope2_total = sum(e["total_emissions"] for e in emissions if e["scope"] == "scope2")
    
    doc.add_paragraph(f"Total Emissions: {round(total_emissions, 2)} kg CO2e")
    doc.add_paragraph(f"Scope 1 Emissions: {round(scope1_total, 2)} kg CO2e ({round(scope1_total/total_emissions*100 if total_emissions > 0 else 0, 1)}%)")
    doc.add_paragraph(f"Scope 2 Emissions: {round(scope2_total, 2)} kg CO2e ({round(scope2_total/total_emissions*100 if total_emissions > 0 else 0, 1)}%)")
    
    # Chart
    if emissions:
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))
        
        # Pie chart
        labels = ['Scope 1', 'Scope 2']
        sizes = [scope1_total, scope2_total]
        colors = ['#1A4D2E', '#4F6F52']
        ax1.pie(sizes, labels=labels, colors=colors, autopct='%1.1f%%', startangle=90)
        ax1.set_title('Emissions by Scope')
        
        # Bar chart by period
        period_map = {}
        for e in emissions:
            period = e["reporting_period"]
            if period not in period_map:
                period_map[period] = {"scope1": 0, "scope2": 0}
            if e["scope"] == "scope1":
                period_map[period]["scope1"] += e["total_emissions"]
            else:
                period_map[period]["scope2"] += e["total_emissions"]
        
        periods = sorted(period_map.keys())
        scope1_data = [period_map[p]["scope1"] for p in periods]
        scope2_data = [period_map[p]["scope2"] for p in periods]
        
        x = range(len(periods))
        width = 0.35
        ax2.bar([i - width/2 for i in x], scope1_data, width, label='Scope 1', color='#1A4D2E')
        ax2.bar([i + width/2 for i in x], scope2_data, width, label='Scope 2', color='#4F6F52')
        ax2.set_xlabel('Reporting Period')
        ax2.set_ylabel('Emissions (kg CO2e)')
        ax2.set_title('Emissions Trend')
        ax2.set_xticks(x)
        ax2.set_xticklabels(periods, rotation=45, ha='right')
        ax2.legend()
        
        plt.tight_layout()
        
        img_buffer = io.BytesIO()
        plt.savefig(img_buffer, format='png', dpi=100, bbox_inches='tight')
        img_buffer.seek(0)
        plt.close()
        
        doc.add_picture(img_buffer, width=Inches(6))
    
    doc.add_page_break()
    
    # Detailed records
    doc.add_heading('Detailed Emission Records', 1)
    
    table = doc.add_table(rows=1, cols=6)
    table.style = 'Light Grid Accent 1'
    hdr_cells = table.rows[0].cells
    hdr_cells[0].text = 'Period'
    hdr_cells[1].text = 'Scope'
    hdr_cells[2].text = 'Category'
    hdr_cells[3].text = 'Quantity'
    hdr_cells[4].text = 'Factor'
    hdr_cells[5].text = 'Total (kg CO2e)'
    
    for emission in sorted(emissions, key=lambda x: x["reporting_period"]):
        row_cells = table.add_row().cells
        row_cells[0].text = emission["reporting_period"]
        row_cells[1].text = emission["scope"].upper().replace("SCOPE", "Scope ")
        row_cells[2].text = emission["category"]
        row_cells[3].text = str(emission["quantity"])
        row_cells[4].text = str(emission["emission_factor"])
        row_cells[5].text = str(round(emission["total_emissions"], 2))
    
    # Save to buffer
    doc_buffer = io.BytesIO()
    doc.save(doc_buffer)
    doc_buffer.seek(0)
    
    return StreamingResponse(
        doc_buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename=GHG_Report_{facility['name'].replace(' ', '_')}.docx"}
    )

# Admin user management endpoints
@api_router.get("/admin/users", response_model=List[UserResponse])
async def get_all_users(current_user: dict = Depends(get_admin_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return [UserResponse(**u) for u in users]

@api_router.put("/admin/users/{user_id}/assign-facilities")
async def assign_facilities(user_id: str, facility_ids: List[str], current_user: dict = Depends(get_admin_user)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one({"id": user_id}, {"$set": {"assigned_facilities": facility_ids}})
    return {"message": "Facilities assigned successfully"}

@api_router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_admin_user)):
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted successfully"}

# Health check
@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()