from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Query
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
import secrets
import string
from fastapi.responses import StreamingResponse
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

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

# Email configuration
SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', 587))
SMTP_USER = os.environ.get('SMTP_USER', '')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
SMTP_FROM = os.environ.get('SMTP_FROM', 'noreply@ecotrack.com')

# Standard GHG emission factors (kg CO2e per unit)
STANDARD_EMISSION_FACTORS = {
    "scope1": {
        "stationary_combustion": {
            "natural_gas": {"factor": 2.03, "unit": "kg CO2e/m³", "source": "GHG Protocol"},
            "diesel": {"factor": 2.68, "unit": "kg CO2e/liter", "source": "GHG Protocol"},
            "coal": {"factor": 2.42, "unit": "kg CO2e/kg", "source": "GHG Protocol"},
            "lpg": {"factor": 1.51, "unit": "kg CO2e/liter", "source": "GHG Protocol"}
        },
        "mobile_combustion": {
            "petrol": {"factor": 2.31, "unit": "kg CO2e/liter", "source": "GHG Protocol"},
            "diesel": {"factor": 2.68, "unit": "kg CO2e/liter", "source": "GHG Protocol"},
            "cng": {"factor": 1.88, "unit": "kg CO2e/m³", "source": "GHG Protocol"}
        },
        "fugitive": {
            "r134a": {"factor": 1430, "unit": "kg CO2e/kg", "source": "IPCC"},
            "r410a": {"factor": 2088, "unit": "kg CO2e/kg", "source": "IPCC"},
            "methane": {"factor": 25, "unit": "kg CO2e/kg", "source": "IPCC"}
        },
        "process": {
            "cement": {"factor": 0.52, "unit": "kg CO2e/kg", "source": "GHG Protocol"},
            "steel": {"factor": 1.85, "unit": "kg CO2e/kg", "source": "GHG Protocol"}
        }
    },
    "scope2": {
        "electricity": {
            "grid": {"factor": 0.82, "unit": "kg CO2e/kWh", "source": "GHG Protocol"},
            "renewable": {"factor": 0.0, "unit": "kg CO2e/kWh", "source": "GHG Protocol"}
        }
    },
    "biogenic": {
        "biomass": {
            "wood": {"factor": 0.0, "unit": "kg CO2e/kg", "source": "GHG Protocol"},
            "biogas": {"factor": 0.0, "unit": "kg CO2e/m³", "source": "GHG Protocol"}
        }
    }
}

# Helper functions
def generate_random_password(length=12):
    characters = string.ascii_letters + string.digits + string.punctuation
    return ''.join(secrets.choice(characters) for _ in range(length))

async def send_email(to_email: str, subject: str, body: str):
    """Send email notification"""
    if not SMTP_USER or not SMTP_PASSWORD:
        logging.warning("SMTP not configured, skipping email")
        return
    
    try:
        message = MIMEMultipart()
        message['From'] = SMTP_FROM
        message['To'] = to_email
        message['Subject'] = subject
        message.attach(MIMEText(body, 'html'))
        
        await aiosmtplib.send(
            message,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USER,
            password=SMTP_PASSWORD,
            start_tls=True
        )
        logging.info(f"Email sent to {to_email}")
    except Exception as e:
        logging.error(f"Failed to send email: {str(e)}")

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

async def get_super_admin_user(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required")
    return current_user

async def get_admin_user(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

# Models
class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "user"

class UserCreate(UserBase):
    password: str
    organization_id: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class PasswordChange(BaseModel):
    old_password: str
    new_password: str

class PasswordReset(BaseModel):
    email: EmailStr
    recovery_contact: str  # mobile or recovery email

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    full_name: str
    role: str
    organization_id: Optional[str] = None
    assigned_facilities: List[str] = []
    requires_password_change: bool = False
    recovery_email: Optional[str] = None
    recovery_mobile: Optional[str] = None
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class OrganizationCreate(BaseModel):
    name: str
    logo: Optional[str] = None
    corporate_address: str
    general_description: Optional[str] = None
    mission: Optional[str] = None
    vision: Optional[str] = None
    process_description: Optional[str] = None
    reporting_frequency: Optional[str] = "yearly"
    org_boundaries: Optional[str] = None
    base_year: Optional[int] = None

class OrganizationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    logo: Optional[str] = None
    corporate_address: str
    general_description: Optional[str] = None
    mission: Optional[str] = None
    vision: Optional[str] = None
    process_description: Optional[str] = None
    reporting_frequency: Optional[str] = None
    org_boundaries: Optional[str] = None
    base_year: Optional[int] = None
    is_deleted: bool = False
    created_at: str

class FacilityCreate(BaseModel):
    name: str
    address: str
    products_manufactured: Optional[str] = None
    product_quantity: Optional[str] = None
    machinery_used: Optional[str] = None
    sector: Optional[str] = None
    responsible_person: Optional[str] = None
    monitoring_frequency: str = "monthly"
    reporting_frequency: str = "monthly"

class FacilityResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    address: str
    products_manufactured: Optional[str] = None
    product_quantity: Optional[str] = None
    machinery_used: Optional[str] = None
    sector: Optional[str] = None
    responsible_person: Optional[str] = None
    monitoring_frequency: str
    reporting_frequency: str
    organization_id: str
    created_at: str

class EmissionFactorCreate(BaseModel):
    name: str
    scope: str
    category: str
    sub_category: str
    factor: float
    unit: str
    source: Optional[str] = None
    references: Optional[str] = None
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
    references: Optional[str] = None
    is_custom: bool
    created_by: str
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
    calorific_value: Optional[float] = None
    source_of_information: Optional[str] = None
    notes: Optional[str] = None
    justification: Optional[str] = None
    evidence_url: Optional[str] = None
    responsible_person: Optional[str] = None
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
    calorific_value: Optional[float] = None
    total_emissions: float
    source_of_information: Optional[str] = None
    notes: Optional[str] = None
    justification: Optional[str] = None
    evidence_url: Optional[str] = None
    responsible_person: Optional[str] = None
    is_custom_factor: bool
    created_by: str
    created_at: str
    updated_at: Optional[str] = None

class EmissionHistoryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    emission_id: str
    changed_by: str
    changed_at: str
    changes: Dict[str, Any]

class DashboardStats(BaseModel):
    total_facilities: int
    total_emissions: float
    scope1_emissions: float
    scope2_emissions: float
    biogenic_emissions: float
    recent_records: List[EmissionRecordResponse]
    emissions_by_facility: List[Dict[str, Any]]
    emissions_trend: List[Dict[str, Any]]

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
        "organization_id": user_data.organization_id,
        "assigned_facilities": [],
        "requires_password_change": False,
        "recovery_email": None,
        "recovery_mobile": None,
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

@api_router.post("/auth/change-password")
async def change_password(password_data: PasswordChange, current_user: dict = Depends(get_current_user)):
    if not verify_password(password_data.old_password, current_user["password_hash"]):
        raise HTTPException(status_code=400, detail="Incorrect old password")
    
    new_hash = get_password_hash(password_data.new_password)
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"password_hash": new_hash, "requires_password_change": False}}
    )
    return {"message": "Password changed successfully"}

@api_router.post("/auth/forgot-password")
async def forgot_password(reset_data: PasswordReset):
    user = await db.users.find_one({"email": reset_data.email}, {"_id": 0})
    if not user:
        # Don't reveal if user exists
        return {"message": "If the email exists, recovery instructions will be sent"}
    
    # Generate reset token
    reset_token = str(uuid.uuid4())
    await db.password_resets.insert_one({
        "id": reset_token,
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    })
    
    # Send email with reset link
    reset_link = f"https://your-app.com/reset-password?token={reset_token}"
    await send_email(
        user["email"],
        "Password Reset Request",
        f"<p>Click <a href='{reset_link}'>here</a> to reset your password. This link expires in 24 hours.</p>"
    )
    
    return {"message": "If the email exists, recovery instructions will be sent"}

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(**current_user)

# Super Admin - Organization endpoints
@api_router.post("/super-admin/organizations", response_model=OrganizationResponse)
async def create_organization(org_data: OrganizationCreate, current_user: dict = Depends(get_super_admin_user)):
    org_dict = org_data.model_dump()
    org_dict["id"] = str(uuid.uuid4())
    org_dict["is_deleted"] = False
    org_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.organizations.insert_one(org_dict)
    return OrganizationResponse(**org_dict)

@api_router.get("/super-admin/organizations", response_model=List[OrganizationResponse])
async def get_all_organizations(
    include_deleted: bool = False,
    current_user: dict = Depends(get_super_admin_user)
):
    query = {} if include_deleted else {"is_deleted": False}
    orgs = await db.organizations.find(query, {"_id": 0}).to_list(1000)
    return [OrganizationResponse(**org) for org in orgs]

@api_router.put("/super-admin/organizations/{org_id}", response_model=OrganizationResponse)
async def update_organization(
    org_id: str,
    org_data: OrganizationCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    existing = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    update_dict = org_data.model_dump()
    await db.organizations.update_one({"id": org_id}, {"$set": update_dict})
    
    updated = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    return OrganizationResponse(**updated)

@api_router.delete("/super-admin/organizations/{org_id}")
async def soft_delete_organization(org_id: str, current_user: dict = Depends(get_super_admin_user)):
    result = await db.organizations.update_one(
        {"id": org_id},
        {"$set": {"is_deleted": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"message": "Organization deleted successfully"}

# Super Admin - Admin management
@api_router.post("/super-admin/admins")
async def create_admin(
    email: EmailStr,
    full_name: str,
    organization_id: str,
    current_user: dict = Depends(get_super_admin_user)
):
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    org = await db.organizations.find_one({"id": organization_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    temp_password = generate_random_password()
    
    admin_dict = {
        "id": str(uuid.uuid4()),
        "email": email,
        "full_name": full_name,
        "role": "admin",
        "password_hash": get_password_hash(temp_password),
        "organization_id": organization_id,
        "assigned_facilities": [],
        "requires_password_change": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(admin_dict)
    
    # Send welcome email
    await send_email(
        email,
        "Welcome to EcoTrack GHG Platform",
        f"""<html><body>
        <h2>Welcome to EcoTrack GHG Platform</h2>
        <p>You have been added as an Admin for {org['name']}.</p>
        <p><strong>Login Credentials:</strong></p>
        <p>Email: {email}</p>
        <p>Temporary Password: {temp_password}</p>
        <p>Please change your password upon first login.</p>
        </body></html>"""
    )
    
    return {"message": "Admin created and email sent", "temp_password": temp_password}

# Super Admin - Emission Factors Management
@api_router.post("/super-admin/emission-factors", response_model=EmissionFactorResponse)
async def create_global_emission_factor(
    factor_data: EmissionFactorCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    factor_dict = factor_data.model_dump()
    factor_dict["id"] = str(uuid.uuid4())
    factor_dict["created_by"] = current_user["id"]
    factor_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.emission_factors.insert_one(factor_dict)
    return EmissionFactorResponse(**factor_dict)

@api_router.put("/super-admin/emission-factors/{factor_id}", response_model=EmissionFactorResponse)
async def update_emission_factor(
    factor_id: str,
    factor_data: EmissionFactorCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    existing = await db.emission_factors.find_one({"id": factor_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Emission factor not found")
    
    update_dict = factor_data.model_dump()
    await db.emission_factors.update_one({"id": factor_id}, {"$set": update_dict})
    
    updated = await db.emission_factors.find_one({"id": factor_id}, {"_id": 0})
    return EmissionFactorResponse(**updated)

@api_router.delete("/super-admin/emission-factors/{factor_id}")
async def delete_emission_factor(factor_id: str, current_user: dict = Depends(get_super_admin_user)):
    result = await db.emission_factors.delete_one({"id": factor_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Emission factor not found")
    return {"message": "Emission factor deleted successfully"}

# Super Admin Dashboard
@api_router.get("/super-admin/dashboard")
async def get_super_admin_dashboard(current_user: dict = Depends(get_super_admin_user)):
    orgs = await db.organizations.find({"is_deleted": False}, {"_id": 0}).to_list(1000)
    all_facilities = await db.facilities.find({}, {"_id": 0}).to_list(10000)
    all_emissions = await db.emission_records.find({}, {"_id": 0}).to_list(10000)
    
    org_stats = []
    for org in orgs:
        org_facilities = [f for f in all_facilities if f.get("organization_id") == org["id"]]
        facility_ids = [f["id"] for f in org_facilities]
        org_emissions = [e for e in all_emissions if e.get("facility_id") in facility_ids]
        
        total_emissions = sum(e["total_emissions"] for e in org_emissions)
        scope1 = sum(e["total_emissions"] for e in org_emissions if e["scope"] == "scope1")
        scope2 = sum(e["total_emissions"] for e in org_emissions if e["scope"] == "scope2")
        biogenic = sum(e["total_emissions"] for e in org_emissions if e["scope"] == "biogenic")
        
        org_stats.append({
            "organization_id": org["id"],
            "organization_name": org["name"],
            "total_facilities": len(org_facilities),
            "total_emissions": round(total_emissions, 2),
            "scope1_emissions": round(scope1, 2),
            "scope2_emissions": round(scope2, 2),
            "biogenic_emissions": round(biogenic, 2)
        })
    
    return {
        "total_organizations": len(orgs),
        "total_facilities": len(all_facilities),
        "organization_stats": org_stats
    }

# Organization endpoints (Admin access)
@api_router.get("/organizations/my", response_model=OrganizationResponse)
async def get_my_organization(current_user: dict = Depends(get_admin_user)):
    if not current_user.get("organization_id"):
        raise HTTPException(status_code=404, detail="No organization assigned")
    
    org = await db.organizations.find_one({"id": current_user["organization_id"]}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return OrganizationResponse(**org)

@api_router.put("/organizations/my", response_model=OrganizationResponse)
async def update_my_organization(org_data: OrganizationCreate, current_user: dict = Depends(get_admin_user)):
    if not current_user.get("organization_id"):
        raise HTTPException(status_code=404, detail="No organization assigned")
    
    update_dict = org_data.model_dump()
    await db.organizations.update_one(
        {"id": current_user["organization_id"]},
        {"$set": update_dict}
    )
    
    updated = await db.organizations.find_one({"id": current_user["organization_id"]}, {"_id": 0})
    return OrganizationResponse(**updated)

# Facility endpoints
@api_router.post("/facilities", response_model=FacilityResponse)
async def create_facility(facility_data: FacilityCreate, current_user: dict = Depends(get_admin_user)):
    if not current_user.get("organization_id"):
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    facility_dict = facility_data.model_dump()
    facility_dict["id"] = str(uuid.uuid4())
    facility_dict["organization_id"] = current_user["organization_id"]
    facility_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.facilities.insert_one(facility_dict)
    return FacilityResponse(**facility_dict)

@api_router.get("/facilities", response_model=List[FacilityResponse])
async def get_facilities(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "super_admin":
        facilities = await db.facilities.find({}, {"_id": 0}).to_list(1000)
    elif current_user["role"] == "admin":
        facilities = await db.facilities.find(
            {"organization_id": current_user["organization_id"]},
            {"_id": 0}
        ).to_list(1000)
    else:  # user
        assigned = current_user.get("assigned_facilities", [])
        facilities = await db.facilities.find({"id": {"$in": assigned}}, {"_id": 0}).to_list(1000)
    return [FacilityResponse(**f) for f in facilities]

@api_router.get("/facilities/{facility_id}", response_model=FacilityResponse)
async def get_facility(facility_id: str, current_user: dict = Depends(get_current_user)):
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    # Check access
    if current_user["role"] == "user" and facility_id not in current_user.get("assigned_facilities", []):
        raise HTTPException(status_code=403, detail="Not authorized")
    if current_user["role"] == "admin" and facility["organization_id"] != current_user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return FacilityResponse(**facility)

@api_router.put("/facilities/{facility_id}", response_model=FacilityResponse)
async def update_facility(facility_id: str, facility_data: FacilityCreate, current_user: dict = Depends(get_current_user)):
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    # Check access
    if current_user["role"] == "user" and facility_id not in current_user.get("assigned_facilities", []):
        raise HTTPException(status_code=403, detail="Not authorized")
    if current_user["role"] == "admin" and facility["organization_id"] != current_user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_dict = facility_data.model_dump()
    await db.facilities.update_one({"id": facility_id}, {"$set": update_dict})
    
    updated = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    return FacilityResponse(**updated)

@api_router.delete("/facilities/{facility_id}")
async def delete_facility(facility_id: str, current_user: dict = Depends(get_admin_user)):
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    if current_user["role"] == "admin" and facility["organization_id"] != current_user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.facilities.delete_one({"id": facility_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Facility not found")
    return {"message": "Facility deleted successfully"}

# Emission factors endpoints
@api_router.get("/emission-factors/standard")
async def get_standard_factors():
    return STANDARD_EMISSION_FACTORS

@api_router.get("/emission-factors", response_model=List[EmissionFactorResponse])
async def get_emission_factors(current_user: dict = Depends(get_current_user)):
    factors = await db.emission_factors.find({}, {"_id": 0}).to_list(1000)
    return [EmissionFactorResponse(**f) for f in factors]

# Emission records endpoints
@api_router.post("/emissions", response_model=EmissionRecordResponse)
async def create_emission_record(record_data: EmissionRecordCreate, current_user: dict = Depends(get_current_user)):
    facility = await db.facilities.find_one({"id": record_data.facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    # Check access
    if current_user["role"] == "user" and record_data.facility_id not in current_user.get("assigned_facilities", []):
        raise HTTPException(status_code=403, detail="Not authorized")
    if current_user["role"] == "admin" and facility["organization_id"] != current_user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    record_dict = record_data.model_dump()
    record_dict["id"] = str(uuid.uuid4())
    record_dict["created_by"] = current_user["id"]
    record_dict["total_emissions"] = record_data.quantity * record_data.emission_factor
    record_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    record_dict["updated_at"] = None
    
    await db.emission_records.insert_one(record_dict)
    return EmissionRecordResponse(**record_dict)

@api_router.get("/emissions", response_model=List[EmissionRecordResponse])
async def get_emission_records(
    facility_id: Optional[str] = None,
    reporting_period: Optional[str] = None,
    scope: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    
    if current_user["role"] == "super_admin":
        pass  # Can see all
    elif current_user["role"] == "admin":
        # Get all facilities in org
        facilities = await db.facilities.find(
            {"organization_id": current_user["organization_id"]},
            {"_id": 0}
        ).to_list(1000)
        facility_ids = [f["id"] for f in facilities]
        query["facility_id"] = {"$in": facility_ids}
    else:  # user
        assigned = current_user.get("assigned_facilities", [])
        query["facility_id"] = {"$in": assigned}
    
    if facility_id:
        query["facility_id"] = facility_id
    if reporting_period:
        query["reporting_period"] = reporting_period
    if scope:
        query["scope"] = scope
    
    records = await db.emission_records.find(query, {"_id": 0}).to_list(10000)
    return [EmissionRecordResponse(**r) for r in records]

@api_router.put("/emissions/{record_id}", response_model=EmissionRecordResponse)
async def update_emission_record(
    record_id: str,
    record_data: EmissionRecordCreate,
    current_user: dict = Depends(get_current_user)
):
    existing = await db.emission_records.find_one({"id": record_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Emission record not found")
    
    # Save version history
    history_dict = {
        "id": str(uuid.uuid4()),
        "emission_id": record_id,
        "changed_by": current_user["id"],
        "changed_at": datetime.now(timezone.utc).isoformat(),
        "changes": {
            "old_values": existing,
            "new_values": record_data.model_dump()
        }
    }
    await db.emission_history.insert_one(history_dict)
    
    update_dict = record_data.model_dump()
    update_dict["total_emissions"] = record_data.quantity * record_data.emission_factor
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.emission_records.update_one({"id": record_id}, {"$set": update_dict})
    updated = await db.emission_records.find_one({"id": record_id}, {"_id": 0})
    return EmissionRecordResponse(**updated)

@api_router.get("/emissions/{record_id}/history", response_model=List[EmissionHistoryResponse])
async def get_emission_history(record_id: str, current_user: dict = Depends(get_current_user)):
    history = await db.emission_history.find({"emission_id": record_id}, {"_id": 0}).to_list(1000)
    return [EmissionHistoryResponse(**h) for h in history]

@api_router.delete("/emissions/{record_id}")
async def delete_emission_record(record_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.emission_records.delete_one({"id": record_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Emission record not found")
    return {"message": "Emission record deleted successfully"}

# Dashboard endpoints
@api_router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "super_admin":
        facilities = await db.facilities.find({}, {"_id": 0}).to_list(1000)
        facility_ids = [f["id"] for f in facilities]
        emissions_query = {"facility_id": {"$in": facility_ids}}
    elif current_user["role"] == "admin":
        facilities = await db.facilities.find(
            {"organization_id": current_user["organization_id"]},
            {"_id": 0}
        ).to_list(1000)
        facility_ids = [f["id"] for f in facilities]
        emissions_query = {"facility_id": {"$in": facility_ids}}
    else:  # user
        assigned = current_user.get("assigned_facilities", [])
        facilities = await db.facilities.find({"id": {"$in": assigned}}, {"_id": 0}).to_list(1000)
        emissions_query = {"facility_id": {"$in": assigned}}
    
    all_emissions = await db.emission_records.find(emissions_query, {"_id": 0}).to_list(10000)
    
    total_emissions = sum(e["total_emissions"] for e in all_emissions)
    scope1_emissions = sum(e["total_emissions"] for e in all_emissions if e["scope"] == "scope1")
    scope2_emissions = sum(e["total_emissions"] for e in all_emissions if e["scope"] == "scope2")
    biogenic_emissions = sum(e["total_emissions"] for e in all_emissions if e["scope"] == "biogenic")
    
    recent_records = sorted(all_emissions, key=lambda x: x["created_at"], reverse=True)[:5]
    
    emissions_by_facility = []
    for facility in facilities:
        facility_emissions = [e for e in all_emissions if e["facility_id"] == facility["id"]]
        total = sum(e["total_emissions"] for e in facility_emissions)
        scope1 = sum(e["total_emissions"] for e in facility_emissions if e["scope"] == "scope1")
        scope2 = sum(e["total_emissions"] for e in facility_emissions if e["scope"] == "scope2")
        biogenic = sum(e["total_emissions"] for e in facility_emissions if e["scope"] == "biogenic")
        emissions_by_facility.append({
            "facility_id": facility["id"],
            "facility_name": facility["name"],
            "total_emissions": round(total, 2),
            "scope1_emissions": round(scope1, 2),
            "scope2_emissions": round(scope2, 2),
            "biogenic_emissions": round(biogenic, 2)
        })
    
    period_map = {}
    for emission in all_emissions:
        period = emission["reporting_period"]
        if period not in period_map:
            period_map[period] = {"period": period, "scope1": 0, "scope2": 0, "biogenic": 0, "total": 0}
        period_map[period]["scope1"] += emission["total_emissions"] if emission["scope"] == "scope1" else 0
        period_map[period]["scope2"] += emission["total_emissions"] if emission["scope"] == "scope2" else 0
        period_map[period]["biogenic"] += emission["total_emissions"] if emission["scope"] == "biogenic" else 0
        period_map[period]["total"] += emission["total_emissions"]
    
    emissions_trend = sorted(period_map.values(), key=lambda x: x["period"])
    
    return DashboardStats(
        total_facilities=len(facilities),
        total_emissions=round(total_emissions, 2),
        scope1_emissions=round(scope1_emissions, 2),
        scope2_emissions=round(scope2_emissions, 2),
        biogenic_emissions=round(biogenic_emissions, 2),
        recent_records=[EmissionRecordResponse(**r) for r in recent_records],
        emissions_by_facility=emissions_by_facility,
        emissions_trend=emissions_trend
    )

# Report generation endpoint
@api_router.get("/reports/facility/{facility_id}")
async def generate_facility_report(
    facility_id: str,
    start_period: Optional[str] = None,
    end_period: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    # Check access
    if current_user["role"] == "user" and facility_id not in current_user.get("assigned_facilities", []):
        raise HTTPException(status_code=403, detail="Not authorized")
    if current_user["role"] == "admin" and facility["organization_id"] != current_user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = {"facility_id": facility_id}
    if start_period and end_period:
        query["reporting_period"] = {"$gte": start_period, "$lte": end_period}
    
    emissions = await db.emission_records.find(query, {"_id": 0}).to_list(10000)
    
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
    biogenic_total = sum(e["total_emissions"] for e in emissions if e["scope"] == "biogenic")
    
    doc.add_paragraph(f"Total Emissions: {round(total_emissions, 2)} kg CO2e")
    doc.add_paragraph(f"Scope 1 Emissions: {round(scope1_total, 2)} kg CO2e")
    doc.add_paragraph(f"Scope 2 Emissions: {round(scope2_total, 2)} kg CO2e")
    doc.add_paragraph(f"Biogenic Emissions: {round(biogenic_total, 2)} kg CO2e")
    
    # Chart
    if emissions:
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))
        
        # Pie chart
        labels = ['Scope 1', 'Scope 2', 'Biogenic']
        sizes = [scope1_total, scope2_total, biogenic_total]
        colors = ['#1A4D2E', '#4F6F52', '#E85C0D']
        ax1.pie([s for s in sizes if s > 0], labels=[l for l, s in zip(labels, sizes) if s > 0],
                colors=[c for c, s in zip(colors, sizes) if s > 0], autopct='%1.1f%%', startangle=90)
        ax1.set_title('Emissions by Scope')
        
        # Bar chart by period
        period_map = {}
        for e in emissions:
            period = e["reporting_period"]
            if period not in period_map:
                period_map[period] = {"scope1": 0, "scope2": 0, "biogenic": 0}
            if e["scope"] == "scope1":
                period_map[period]["scope1"] += e["total_emissions"]
            elif e["scope"] == "scope2":
                period_map[period]["scope2"] += e["total_emissions"]
            else:
                period_map[period]["biogenic"] += e["total_emissions"]
        
        periods = sorted(period_map.keys())
        scope1_data = [period_map[p]["scope1"] for p in periods]
        scope2_data = [period_map[p]["scope2"] for p in periods]
        biogenic_data = [period_map[p]["biogenic"] for p in periods]
        
        x = range(len(periods))
        width = 0.25
        ax2.bar([i - width for i in x], scope1_data, width, label='Scope 1', color='#1A4D2E')
        ax2.bar(x, scope2_data, width, label='Scope 2', color='#4F6F52')
        ax2.bar([i + width for i in x], biogenic_data, width, label='Biogenic', color='#E85C0D')
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
    
    table = doc.add_table(rows=1, cols=7)
    table.style = 'Light Grid Accent 1'
    hdr_cells = table.rows[0].cells
    hdr_cells[0].text = 'Period'
    hdr_cells[1].text = 'Scope'
    hdr_cells[2].text = 'Category'
    hdr_cells[3].text = 'Sub-category'
    hdr_cells[4].text = 'Quantity'
    hdr_cells[5].text = 'Factor'
    hdr_cells[6].text = 'Total (kg CO2e)'
    
    for emission in sorted(emissions, key=lambda x: x["reporting_period"]):
        row_cells = table.add_row().cells
        row_cells[0].text = emission["reporting_period"]
        row_cells[1].text = emission["scope"].upper().replace("SCOPE", "Scope ")
        row_cells[2].text = emission["category"]
        row_cells[3].text = emission["sub_category"]
        row_cells[4].text = str(emission["quantity"])
        row_cells[5].text = str(emission["emission_factor"])
        row_cells[6].text = str(round(emission["total_emissions"], 2))
    
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
@api_router.post("/admin/users")
async def create_user(
    email: EmailStr,
    full_name: str,
    assigned_facilities: List[str],
    current_user: dict = Depends(get_admin_user)
):
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    temp_password = generate_random_password()
    
    user_dict = {
        "id": str(uuid.uuid4()),
        "email": email,
        "full_name": full_name,
        "role": "user",
        "password_hash": get_password_hash(temp_password),
        "organization_id": current_user["organization_id"],
        "assigned_facilities": assigned_facilities,
        "requires_password_change": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_dict)
    
    # Send welcome email
    await send_email(
        email,
        "Welcome to EcoTrack GHG Platform",
        f"""<html><body>
        <h2>Welcome to EcoTrack GHG Platform</h2>
        <p>You have been added as a User.</p>
        <p><strong>Login Credentials:</strong></p>
        <p>Email: {email}</p>
        <p>Temporary Password: {temp_password}</p>
        <p>Please change your password upon first login.</p>
        </body></html>"""
    )
    
    return {"message": "User created and email sent", "temp_password": temp_password}

@api_router.get("/admin/users", response_model=List[UserResponse])
async def get_all_users(current_user: dict = Depends(get_admin_user)):
    query = {"organization_id": current_user["organization_id"], "role": "user"}
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(1000)
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