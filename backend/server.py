from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr, field_validator
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
import shutil
from fastapi.responses import StreamingResponse, FileResponse
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

# Temporary storage for downloadable reports (in-memory cache with expiry)
# Key: download_token, Value: {"buffer": BytesIO, "filename": str, "created_at": datetime}
pending_downloads: Dict[str, Dict[str, Any]] = {}

# Email configuration
SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', 587))
SMTP_USER = os.environ.get('SMTP_USER', '')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
SMTP_FROM = os.environ.get('SMTP_FROM', 'noreply@ecotrack.com')

# NOTE: Hardcoded emission factors removed. All standard factors are now managed by Super Admin in database.
# Admin/User can only use standard factors or create custom factors with justification.

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

class UserCreateRequest(BaseModel):
    email: EmailStr
    full_name: str
    assigned_facilities: List[str] = []

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
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    pincode: Optional[str] = None
    general_description: Optional[str] = None
    mission: Optional[str] = None
    vision: Optional[str] = None
    process_description: Optional[str] = None
    reporting_frequency: Optional[str] = "yearly"
    # Organization Boundaries - Control Approach or Equity Share Approach
    org_boundaries_approach: Optional[str] = None  # "control" or "equity_share"
    org_boundaries_equity_percentage: Optional[float] = None  # Percentage for equity share approach
    org_boundaries: Optional[str] = None  # Legacy field for additional notes
    base_year: Optional[int] = None
    attachments: Optional[List[dict]] = None
    other_information: Optional[str] = None  # Renamed from remarks
    # New fields
    person_responsible: Optional[str] = None
    report_purpose: Optional[str] = None
    ghg_reduction_initiatives: Optional[str] = None
    internal_performance_tracking: Optional[str] = None
    max_facilities: Optional[int] = 10
    max_admins: Optional[int] = 5
    max_users: Optional[int] = 20
    
    @field_validator('pincode')
    @classmethod
    def validate_pincode(cls, v):
        if v is not None and v != '':
            # Remove any spaces
            v = v.strip()
            if not v.isdigit() or len(v) != 6:
                raise ValueError('Pincode must be exactly 6 digits')
        return v

class OrganizationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    logo: Optional[str] = None
    corporate_address: str
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    pincode: Optional[str] = None
    general_description: Optional[str] = None
    mission: Optional[str] = None
    vision: Optional[str] = None
    process_description: Optional[str] = None
    reporting_frequency: Optional[str] = None
    # Organization Boundaries
    org_boundaries_approach: Optional[str] = None
    org_boundaries_equity_percentage: Optional[float] = None
    org_boundaries: Optional[str] = None
    base_year: Optional[int] = None
    attachments: Optional[List[dict]] = None
    other_information: Optional[str] = None  # Renamed from remarks
    remarks: Optional[str] = None  # Keep for backward compatibility
    # New fields
    person_responsible: Optional[str] = None
    report_purpose: Optional[str] = None
    ghg_reduction_initiatives: Optional[str] = None
    internal_performance_tracking: Optional[str] = None
    is_deleted: bool = False
    created_at: str
    max_facilities: Optional[int] = 10
    max_admins: Optional[int] = 5
    max_users: Optional[int] = 20

class FacilityCreate(BaseModel):
    name: str
    address: str
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    pincode: Optional[str] = None
    products_services: Optional[str] = None  # Renamed from products_manufactured
    machinery_equipment: Optional[str] = None  # Renamed from machinery_used
    process_description: Optional[str] = None
    sector: Optional[str] = None
    responsible_person: Optional[str] = None
    monitoring_frequency: str = "monthly"
    reporting_frequency: str = "monthly"
    attachments: Optional[List[dict]] = None  # [{type, name, url}]
    other_information: Optional[str] = None  # Renamed from remarks
    is_active: bool = True  # Soft delete flag
    
    @field_validator('pincode')
    @classmethod
    def validate_pincode(cls, v):
        if v is not None and v != '':
            v = v.strip()
            if not v.isdigit() or len(v) != 6:
                raise ValueError('Pincode must be exactly 6 digits')
        return v

class FacilityResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    address: str
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    pincode: Optional[str] = None
    products_services: Optional[str] = None  # Renamed from products_manufactured
    products_manufactured: Optional[str] = None  # Keep for backward compatibility
    machinery_equipment: Optional[str] = None  # Renamed from machinery_used
    machinery_used: Optional[str] = None  # Keep for backward compatibility
    process_description: Optional[str] = None
    sector: Optional[str] = None
    responsible_person: Optional[str] = None
    monitoring_frequency: Optional[str] = "monthly"
    reporting_frequency: Optional[str] = "monthly"
    organization_id: Optional[str] = None
    attachments: Optional[List[dict]] = None
    other_information: Optional[str] = None  # Renamed from remarks
    remarks: Optional[str] = None  # Keep for backward compatibility
    is_active: bool = True  # Soft delete flag
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
    region: Optional[str] = None  # Country/Region for factors
    justification: Optional[str] = None  # Required for custom factors

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
    region: Optional[str] = None
    is_custom: Optional[bool] = True
    justification: Optional[str] = None
    organization_id: Optional[str] = None  # For custom factors by Admin/User
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None

# ============================================
# UNIT MANAGEMENT MODELS
# Centralized unit definitions for the entire system
# ============================================

class UnitCreate(BaseModel):
    name: str  # Display name (e.g., "Kilogram")
    symbol: str  # Standard symbol (e.g., "kg")
    unit_type: str  # "mass" or "volume"
    aliases: List[str] = []  # Alternative names (e.g., ["kilogram", "kilograms", "KG"])
    is_base_unit: bool = False  # Is this the base unit for its type?
    description: Optional[str] = None
    is_active: bool = True

class UnitResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    symbol: str
    unit_type: str
    aliases: List[str] = []
    is_base_unit: bool = False
    description: Optional[str] = None
    is_active: bool = True
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None

# Default units to seed the database
DEFAULT_UNITS = [
    # Mass units (base: kg)
    {"name": "Kilogram", "symbol": "kg", "unit_type": "mass", "aliases": ["kilogram", "kilograms", "KG", "Kg"], "is_base_unit": True},
    {"name": "Gram", "symbol": "g", "unit_type": "mass", "aliases": ["gram", "grams", "G"], "is_base_unit": False},
    {"name": "Tonne", "symbol": "t", "unit_type": "mass", "aliases": ["tonne", "tonnes", "ton", "tons", "T", "metric ton"], "is_base_unit": False},
    {"name": "Pound", "symbol": "lb", "unit_type": "mass", "aliases": ["pound", "pounds", "lbs", "LB"], "is_base_unit": False},
    # Volume units (base: L)
    {"name": "Litre", "symbol": "L", "unit_type": "volume", "aliases": ["litre", "litres", "liter", "liters", "l"], "is_base_unit": True},
    {"name": "Millilitre", "symbol": "mL", "unit_type": "volume", "aliases": ["millilitre", "millilitres", "milliliter", "milliliters", "ml", "ML"], "is_base_unit": False},
    {"name": "Kilolitre", "symbol": "kL", "unit_type": "volume", "aliases": ["kilolitre", "kilolitres", "kiloliter", "kiloliters", "kl", "KL"], "is_base_unit": False},
    {"name": "Cubic Metre", "symbol": "m³", "unit_type": "volume", "aliases": ["cubic metre", "cubic meter", "cubic metres", "cubic meters", "m3", "M3"], "is_base_unit": False},
    {"name": "Gallon (US)", "symbol": "gal", "unit_type": "volume", "aliases": ["gallon", "gallons", "us gallon", "us gallons", "GAL"], "is_base_unit": False},
    {"name": "Cubic Feet", "symbol": "ft³", "unit_type": "volume", "aliases": ["cubic foot", "cubic feet", "ft3", "FT3"], "is_base_unit": False},
    # Energy units (base: kWh)
    {"name": "Kilowatt-hour", "symbol": "kWh", "unit_type": "energy", "aliases": ["kilowatt-hour", "kilowatt hour", "kwh", "KWH"], "is_base_unit": True},
    {"name": "Megawatt-hour", "symbol": "MWh", "unit_type": "energy", "aliases": ["megawatt-hour", "megawatt hour", "mwh", "MWH"], "is_base_unit": False},
    {"name": "Gigawatt-hour", "symbol": "GWh", "unit_type": "energy", "aliases": ["gigawatt-hour", "gigawatt hour", "gwh", "GWH"], "is_base_unit": False},
    {"name": "Terajoule", "symbol": "TJ", "unit_type": "energy", "aliases": ["terajoule", "terajoules", "tj"], "is_base_unit": False},
    {"name": "Gigajoule", "symbol": "GJ", "unit_type": "energy", "aliases": ["gigajoule", "gigajoules", "gj"], "is_base_unit": False},
    {"name": "Megajoule", "symbol": "MJ", "unit_type": "energy", "aliases": ["megajoule", "megajoules", "mj"], "is_base_unit": False},
]

# Fuel Database Models - Comprehensive fuel parameters for emission calculations
class FuelDatabaseCreate(BaseModel):
    fuel_name: str
    categories: List[str] = []  # Multiple categories (e.g., ["stationary_combustion", "mobile_combustion"])
    category: Optional[str] = None  # Legacy single category (deprecated, use categories)
    industry_sectors: List[str] = []  # Multiple industries (e.g., ["Manufacturing", "Transportation"])
    industry_sector: Optional[str] = None  # Legacy single industry (deprecated, use industry_sectors)
    scope: str = "scope1"  # scope1, scope2, biogenic
    calorific_value: Optional[float] = None  # Net Calorific Value (NCV) - optional
    calorific_value_unit: Optional[str] = "MJ/kg"  # MJ/kg, MJ/L, MJ/m3, etc.
    emission_factor_co2: Optional[float] = None  # kg CO2/TJ (basis heating value) - optional, at least one EF required
    emission_factor_ch4: Optional[float] = None  # kg CH4/TJ (optional)
    emission_factor_n2o: Optional[float] = None  # kg N2O/TJ (optional)
    emission_factor_basis_quantity: Optional[float] = None  # Basis quantity for emission factor (e.g., per kWh)
    emission_factor_basis_unit: Optional[str] = None  # Unit for basis quantity (kWh, MWh, GWh)
    density: Optional[float] = None  # kg/L (optional, for liquid fuels)
    density_unit: Optional[str] = "kg/L"
    conversion_factor: float = 1.0  # For unit conversions
    conversion_unit: Optional[str] = None  # Description of conversion
    source: Optional[str] = None  # Data source (e.g., IPCC, EPA)
    references: Optional[str] = None
    region: Optional[str] = "Global"  # Country/Region specificity
    notes: Optional[str] = None
    allowed_units: Optional[List[str]] = None  # Units allowed for this fuel (e.g., ["kg", "g", "tonne", "L", "kWh"])

class FuelDatabaseResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    fuel_name: str
    categories: Optional[List[str]] = []  # Multiple categories
    category: Optional[str] = None  # Legacy single category (for backwards compatibility)
    industry_sectors: Optional[List[str]] = []  # Multiple industries
    industry_sector: Optional[str] = None  # Legacy single industry (for backwards compatibility)
    scope: str
    calorific_value: Optional[float] = None  # Now optional
    calorific_value_unit: Optional[str] = None
    emission_factor_co2: Optional[float] = None
    emission_factor_ch4: Optional[float] = None
    emission_factor_n2o: Optional[float] = None
    emission_factor_basis_quantity: Optional[float] = None
    emission_factor_basis_unit: Optional[str] = None
    density: Optional[float] = None
    density_unit: Optional[str] = None
    conversion_factor: float = 1.0
    conversion_unit: Optional[str] = None
    source: Optional[str] = None
    references: Optional[str] = None
    region: Optional[str] = None
    notes: Optional[str] = None
    allowed_units: Optional[List[str]] = None
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None

# GWP Constants (IPCC AR5 100-year values)
GWP_VALUES = {
    "CO2": 1,
    "CH4": 28,
    "N2O": 273
}

# ============================================
# UNIT NORMALIZATION SYSTEM (AI-Compatible)
# ============================================

# Unit Classifications
UNIT_CLASSIFICATIONS = {
    "mass_units": ["kg", "g", "tonne", "t", "lb", "ton"],
    "volume_units_liquid": ["litre", "L", "kilolitre", "kL", "millilitre", "mL", "gallon", "gal"],
    "volume_units_cubic": ["m3", "m³", "cm3", "cm³", "ft3", "ft³"]
}

# Quantity to kg Conversion Rules
QUANTITY_TO_KG_CONVERSIONS = {
    # Mass units → kg
    "kg": 1,
    "g": 0.001,
    "tonne": 1000,
    "t": 1000,
    "lb": 0.453592,
    "ton": 907.185,  # US short ton
    # Volume liquid units → requires density (kg/L)
    "litre": "density_kg_per_L",
    "L": "density_kg_per_L",
    "kilolitre": "1000 * density_kg_per_L",
    "kL": "1000 * density_kg_per_L",
    "millilitre": "0.001 * density_kg_per_L",
    "mL": "0.001 * density_kg_per_L",
    "gallon": "3.78541 * density_kg_per_L",
    "gal": "3.78541 * density_kg_per_L",
    # Volume cubic units → requires density (kg/m³)
    "m3": "density_kg_per_m3",
    "m³": "density_kg_per_m3",
    "cm3": "0.000001 * density_kg_per_m3",
    "cm³": "0.000001 * density_kg_per_m3",
    "ft3": "0.0283168 * density_kg_per_m3",
    "ft³": "0.0283168 * density_kg_per_m3"
}

# NCV Unit Conversions to TJ/kg
NCV_TO_TJ_PER_KG = {
    "TJ/Gg": 0.001,      # 1 TJ/Gg = 0.001 TJ/kg (since 1 Gg = 1000 t = 1,000,000 kg)
    "TJ/kg": 1,
    "GJ/t": 0.001,       # 1 GJ/t = 0.001 TJ/kg
    "GJ/kg": 0.001,
    "MJ/kg": 0.000001,   # 1 MJ/kg = 0.000001 TJ/kg
    "MJ/L": "0.000001 / density_kg_per_L",  # Needs density
    "kJ/kg": 0.000000001,
    "BTU/lb": 0.000000001055 / 0.453592  # Convert BTU to TJ and lb to kg
}

# Emission Factor Unit Conversions to kg/TJ
EF_TO_KG_PER_TJ = {
    "kg/TJ": 1,
    "kg/GJ": 1000,       # 1 kg/GJ = 1000 kg/TJ
    "g/MJ": 1,           # 1 g/MJ = 1 kg/TJ (1000g/1000MJ)
    "t/TJ": 1000,        # 1 t/TJ = 1000 kg/TJ
    "kg CO2/TJ": 1,
    "kg CH4/TJ": 1,
    "kg N2O/TJ": 1
}

# Density Unit Conversions
DENSITY_CONVERSIONS = {
    "kg/L": {"to_kg_per_L": 1, "to_kg_per_m3": 1000},
    "kg/m3": {"to_kg_per_L": 0.001, "to_kg_per_m3": 1},
    "kg/m³": {"to_kg_per_L": 0.001, "to_kg_per_m3": 1},
    "g/mL": {"to_kg_per_L": 1, "to_kg_per_m3": 1000},
    "g/cm3": {"to_kg_per_L": 1, "to_kg_per_m3": 1000},
    "g/cm³": {"to_kg_per_L": 1, "to_kg_per_m3": 1000},
    "lb/gal": {"to_kg_per_L": 0.119826, "to_kg_per_m3": 119.826},
    "t/m3": {"to_kg_per_L": 1, "to_kg_per_m3": 1000},
    "t/m³": {"to_kg_per_L": 1, "to_kg_per_m3": 1000}
}

# Unit Configuration Model for SuperAdmin
class UnitConfig(BaseModel):
    unit_name: str
    unit_symbol: str
    unit_type: str  # "mass", "volume_liquid", "volume_cubic", "ncv", "emission_factor", "density"
    conversion_to_standard: float  # Multiplier to convert to standard unit
    requires_density: bool = False
    density_unit_type: Optional[str] = None  # "kg_per_L" or "kg_per_m3"
    is_standard: bool = False

class UnitConfigResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    unit_name: str
    unit_symbol: str
    unit_type: str
    conversion_to_standard: float
    requires_density: bool
    density_unit_type: Optional[str] = None
    is_standard: bool
    created_at: Optional[str] = None

# Formula Parameter with Unit Validation
class FormulaParameterCreate(BaseModel):
    parameter_name: str  # e.g., "Quantity", "NCV", "Emission Factor CO2"
    parameter_key: str   # e.g., "quantity", "ncv", "ef_co2"
    description: Optional[str] = None
    unit_conversions: List[dict] = []  # Conversion rules: [{from_unit, to_unit, multiplier}]
    requires_user_input: bool = True  # True = user input, False = predefined
    predefined_source: Optional[str] = None  # e.g., "fuel_database.calorific_value", "gwp.ch4"
    is_optional: bool = False
    display_order: int = 0
    applicable_categories: Optional[List[str]] = None
    applicable_industries: Optional[List[str]] = None
    default_value: Optional[float] = None  # For predefined values like GWP (e.g., 28 for CH4, 273 for N2O)

class FormulaParameterResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    parameter_name: str
    parameter_key: str
    description: Optional[str] = None
    unit_conversions: List[dict] = []
    requires_user_input: bool = True
    predefined_source: Optional[str] = None
    is_optional: bool = False
    display_order: int = 0
    applicable_categories: Optional[List[str]] = None
    applicable_industries: Optional[List[str]] = None
    default_value: Optional[float] = None  # For predefined values like GWP
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None

# Formula Definition Models (the actual formulas/equations)
class FormulaDefinitionCreate(BaseModel):
    formula_name: str  # e.g., "CO2 Emission Calculation"
    formula_key: str   # e.g., "co2_emission"
    description: Optional[str] = None
    output_name: str   # e.g., "CO₂ Emissions"
    output_unit: str   # e.g., "kg CO₂"
    components: List[dict] = []  # [{parameter_key, parameter_name, operation, condition}]
    # condition format: { "apply_when": "volume_units" } or { "apply_when": "mass_units" } or { "apply_when": "always" }
    formula_expression: str = ""  # Human readable: "Quantity × Calorific Value × CO₂ EF"
    applies_gwp: bool = False
    gwp_gas: Optional[str] = None  # "CO2", "CH4", "N2O"
    applicable_scopes: Optional[List[str]] = None  # ["Scope 1", "Scope 2", "Biogenic"]
    applicable_categories: Optional[List[str]] = None
    applicable_industries: Optional[List[str]] = None
    is_active: bool = True
    display_order: int = 0
    # Unit type definitions for conditional logic
    mass_units: Optional[List[str]] = None  # Units classified as mass (e.g., ["kg", "g", "tonne"])
    volume_units: Optional[List[str]] = None  # Units classified as volume (e.g., ["L", "kL", "m3"])
    # Input field mappings - defines where each parameter value comes from (per-formula)
    # Each mapping: {parameter_key, source_type, source_field, label, required, default_value}
    # source_type: "user_input" | "fuel_database" | "formula_parameter" | "constant"
    input_mappings: Optional[List[dict]] = None

class FormulaDefinitionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    formula_name: str
    formula_key: str
    description: Optional[str] = None
    output_name: str
    output_unit: str
    components: List[dict] = []
    formula_expression: str = ""
    applies_gwp: bool = False
    gwp_gas: Optional[str] = None
    applicable_scopes: Optional[List[str]] = None  # ["Scope 1", "Scope 2", "Biogenic"]
    applicable_categories: Optional[List[str]] = None
    applicable_industries: Optional[List[str]] = None
    is_active: bool = True
    display_order: int = 0
    mass_units: Optional[List[str]] = None
    volume_units: Optional[List[str]] = None
    input_mappings: Optional[List[dict]] = None  # Per-formula input field mappings
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None

# Emission Configuration - Maps scopes/categories to formulas (SuperAdmin configurable)
class EmissionConfigurationCreate(BaseModel):
    name: str  # e.g., "Scope 1 Standard Calculation", "Scope 2 Electricity"
    description: Optional[str] = None
    scope: str  # "scope1", "scope2", "scope3", "biogenic"
    category: Optional[str] = None  # Legacy: single category (kept for backward compatibility)
    categories: Optional[List[str]] = None  # New: multiple categories
    formula_id: str  # Reference to formula_definitions
    is_active: bool = True
    priority: int = 0  # For ordering when multiple configs match (higher priority wins)

class EmissionConfigurationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: Optional[str] = None
    scope: str
    category: Optional[str] = None  # Legacy: kept for backward compatibility
    categories: Optional[List[str]] = None  # New: multiple categories
    formula_id: str
    formula_name: Optional[str] = None  # Populated from formula_definitions
    is_active: bool = True
    priority: int = 0
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None

class EmissionRecordCreate(BaseModel):
    facility_id: str
    reporting_period: str
    scope: str
    category: str
    sub_category: str
    fuel_type: Optional[str] = None
    quantity: float
    quantity_unit: Optional[str] = 'kg'  # The unit user selected (kg, kL, etc.)
    emission_factor: float  # CO2 emission factor (kg CO2/TJ)
    unit: str
    calorific_value: Optional[float] = None  # NCV in MJ/unit
    source_of_information: Optional[str] = None
    notes: Optional[str] = None
    justification: Optional[str] = None
    evidence_url: Optional[str] = None
    responsible_person: Optional[str] = None
    is_custom_factor: bool = False
    # New fields for enhanced calculation
    fuel_database_id: Optional[str] = None  # Reference to fuel database entry
    emission_factor_ch4: Optional[float] = None  # CH4 emission factor (kg CH4/TJ)
    emission_factor_n2o: Optional[float] = None  # N2O emission factor (kg N2O/TJ)
    density: Optional[float] = None  # Density (kg/L for liquid fuels)
    conversion_factor: Optional[float] = 1.0  # Unit conversion factor
    # Override flags - whether user manually overrode default values
    override_calorific_value: Optional[bool] = False
    override_density: Optional[bool] = False
    # Override justifications
    calorific_value_justification: Optional[str] = None
    density_justification: Optional[str] = None
    # Pre-calculated emission values from frontend
    calculated_co2: Optional[float] = None
    calculated_ch4: Optional[float] = None
    calculated_n2o: Optional[float] = None
    calculated_co2e: Optional[float] = None
    # Output units for display
    co2_unit: Optional[str] = None
    ch4_unit: Optional[str] = None
    n2o_unit: Optional[str] = None
    co2e_unit: Optional[str] = None
    # Process names (multiple)
    process_names: Optional[List[str]] = []

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
    quantity_unit: Optional[str] = 'kg'  # The unit user selected
    emission_factor: float
    unit: Optional[str] = None
    calorific_value: Optional[float] = None
    # Individual emission outputs
    co2_emissions: Optional[float] = None
    ch4_emissions: Optional[float] = None
    n2o_emissions: Optional[float] = None
    co2e_emissions: Optional[float] = None
    total_emissions: float  # Kept for backward compatibility (same as co2e_emissions)
    source_of_information: Optional[str] = None
    notes: Optional[str] = None
    justification: Optional[str] = None
    evidence_url: Optional[str] = None
    responsible_person: Optional[str] = None
    is_custom_factor: Optional[bool] = False
    fuel_database_id: Optional[str] = None
    emission_factor_ch4: Optional[float] = None
    emission_factor_n2o: Optional[float] = None
    density: Optional[float] = None
    conversion_factor: Optional[float] = None
    # Override flags
    override_calorific_value: Optional[bool] = False
    override_density: Optional[bool] = False
    # Override justifications
    calorific_value_justification: Optional[str] = None
    density_justification: Optional[str] = None
    # Output units
    co2_unit: Optional[str] = None
    ch4_unit: Optional[str] = None
    n2o_unit: Optional[str] = None
    co2e_unit: Optional[str] = None
    # Process names
    process_names: Optional[List[str]] = []
    created_by: Optional[str] = None
    created_by_email: Optional[str] = None
    created_at: str
    updated_by: Optional[str] = None
    updated_by_email: Optional[str] = None
    updated_at: Optional[str] = None

class EmissionHistoryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    emission_id: str
    changed_by: str
    changed_by_email: Optional[str] = None
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

# Calculation Formula Models
class CalculationFormulaCreate(BaseModel):
    name: str
    scope: str  # scope1, scope2, biogenic
    description: Optional[str] = None
    formula_expression: str  # e.g., "quantity * emission_factor"
    input_fields: List[Dict[str, Any]]  # [{name, label, type, unit, required}]
    output_unit: str = "kg CO2e"
    is_active: bool = True
    conversion_rules: Optional[List[Dict[str, Any]]] = None  # [{unit, multiplier, formula}]

class CalculationFormulaResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    scope: str
    description: Optional[str] = None
    formula_expression: str
    input_fields: List[Dict[str, Any]]
    output_unit: str
    is_active: bool
    conversion_rules: Optional[List[Dict[str, Any]]] = None
    created_at: str
    updated_at: Optional[str] = None

# Sector model for predefined sectors
class SectorCreate(BaseModel):
    name: str
    description: Optional[str] = None

class SectorResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: Optional[str] = None
    created_at: str

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
    
    # Check if user is deleted
    if user.get("is_deleted", False):
        raise HTTPException(status_code=403, detail="Your account has been deleted. Please contact your administrator.")
    
    # Check if user is active
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Your account has been deactivated. Please contact your administrator.")
    
    # For non-super admin users, check if their organization is active
    if user.get("role") != "super_admin" and user.get("organization_id"):
        org = await db.organizations.find_one({"id": user["organization_id"]}, {"_id": 0})
        if org and (org.get("is_deleted") or not org.get("is_active", True)):
            raise HTTPException(status_code=403, detail="Your organization has been deactivated. Please contact your administrator.")
    
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
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Mark organization as deleted/inactive
    await db.organizations.update_one(
        {"id": org_id},
        {"$set": {"is_deleted": True, "is_active": False}}
    )
    
    # Mark all users of this organization as inactive (prevents login)
    await db.users.update_many(
        {"organization_id": org_id},
        {"$set": {"is_active": False}}
    )
    
    return {"message": "Organization deactivated successfully. All associated users have been blocked from login."}

# Super Admin - Reactivate organization
@api_router.put("/super-admin/organizations/{org_id}/reactivate")
async def reactivate_organization(org_id: str, current_user: dict = Depends(get_super_admin_user)):
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Mark organization as active
    await db.organizations.update_one(
        {"id": org_id},
        {"$set": {"is_deleted": False, "is_active": True}}
    )
    
    # Reactivate all users of this organization
    await db.users.update_many(
        {"organization_id": org_id},
        {"$set": {"is_active": True}}
    )
    
    return {"message": "Organization reactivated successfully. All associated users can now login."}

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
    
    # Check max_admins limit
    max_admins = org.get("max_admins", 5)
    current_admin_count = await db.users.count_documents({
        "organization_id": organization_id,
        "role": "admin"
    })
    if current_admin_count >= max_admins:
        raise HTTPException(
            status_code=400, 
            detail=f"Maximum admin limit ({max_admins}) reached for this organization"
        )
    
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

# Super Admin - Get all admins
@api_router.get("/super-admin/admins")
async def get_all_admins(current_user: dict = Depends(get_super_admin_user)):
    admins = await db.users.find({"role": "admin"}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return [UserResponse(**a) for a in admins]

# Super Admin - Delete admin
@api_router.delete("/super-admin/admins/{admin_id}")
async def delete_admin(admin_id: str, current_user: dict = Depends(get_super_admin_user)):
    admin = await db.users.find_one({"id": admin_id, "role": "admin"}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # Delete the admin user
    result = await db.users.delete_one({"id": admin_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    return {"message": "Admin deleted successfully"}

# Super Admin - Emission Factors Management
@api_router.post("/super-admin/emission-factors", response_model=EmissionFactorResponse)
async def create_global_emission_factor(
    factor_data: EmissionFactorCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    # Check for duplicate by Category + Subcategory + Region (unique combination for standard factors)
    existing = await db.emission_factors.find_one({
        "scope": factor_data.scope,
        "category": factor_data.category,
        "sub_category": factor_data.sub_category,
        "region": factor_data.region or "Global (All Regions)",
        "is_custom": False  # Only check against other standard factors
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"A standard emission factor already exists for {factor_data.category} / {factor_data.sub_category} in {factor_data.region or 'Global (All Regions)'}. Please edit the existing factor instead."
        )
    
    factor_dict = factor_data.model_dump()
    factor_dict["id"] = str(uuid.uuid4())
    factor_dict["created_by"] = current_user["id"]
    factor_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    factor_dict["is_custom"] = False  # Super Admin factors are always Standard
    factor_dict["region"] = factor_data.region or "Global (All Regions)"
    
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
    
    # Check for duplicate by Category + Subcategory + Region (excluding current factor)
    duplicate = await db.emission_factors.find_one({
        "id": {"$ne": factor_id},  # Exclude current factor
        "scope": factor_data.scope,
        "category": factor_data.category,
        "sub_category": factor_data.sub_category,
        "region": factor_data.region or "Global (All Regions)",
        "is_custom": False  # Only check against other standard factors
    })
    if duplicate:
        raise HTTPException(
            status_code=400, 
            detail=f"A standard emission factor already exists for {factor_data.category} / {factor_data.sub_category} in {factor_data.region or 'Global (All Regions)'}."
        )
    
    update_dict = factor_data.model_dump()
    update_dict["is_custom"] = False  # Super Admin factors remain Standard even after edit
    update_dict["region"] = factor_data.region or "Global (All Regions)"
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.emission_factors.update_one({"id": factor_id}, {"$set": update_dict})
    
    updated = await db.emission_factors.find_one({"id": factor_id}, {"_id": 0})
    return EmissionFactorResponse(**updated)

@api_router.delete("/super-admin/emission-factors/{factor_id}")
async def delete_emission_factor(factor_id: str, current_user: dict = Depends(get_super_admin_user)):
    result = await db.emission_factors.delete_one({"id": factor_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Emission factor not found")
    return {"message": "Emission factor deleted successfully"}

# ============================================
# UNIT MANAGEMENT ENDPOINTS
# ============================================

@api_router.get("/units", response_model=List[UnitResponse])
async def get_all_units(current_user: dict = Depends(get_current_user)):
    """Get all units (available to all authenticated users)"""
    units = await db.units.find({"is_active": True}, {"_id": 0}).to_list(1000)
    return [UnitResponse(**u) for u in units]

@api_router.get("/units/by-type/{unit_type}", response_model=List[UnitResponse])
async def get_units_by_type(unit_type: str, current_user: dict = Depends(get_current_user)):
    """Get units filtered by type (mass or volume)"""
    units = await db.units.find({"unit_type": unit_type, "is_active": True}, {"_id": 0}).to_list(1000)
    return [UnitResponse(**u) for u in units]

@api_router.post("/units", response_model=UnitResponse)
async def create_unit(
    unit_data: UnitCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Create a new unit (Super Admin only)"""
    # Check if symbol already exists
    existing = await db.units.find_one({"symbol": unit_data.symbol})
    if existing:
        raise HTTPException(status_code=400, detail=f"Unit with symbol '{unit_data.symbol}' already exists")
    
    unit_dict = unit_data.model_dump()
    unit_dict["id"] = str(uuid.uuid4())
    unit_dict["created_by"] = current_user["id"]
    unit_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.units.insert_one(unit_dict)
    return UnitResponse(**unit_dict)

@api_router.put("/units/{unit_id}", response_model=UnitResponse)
async def update_unit(
    unit_id: str,
    unit_data: UnitCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Update a unit (Super Admin only)"""
    existing = await db.units.find_one({"id": unit_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    update_dict = unit_data.model_dump()
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.units.update_one({"id": unit_id}, {"$set": update_dict})
    updated = await db.units.find_one({"id": unit_id}, {"_id": 0})
    return UnitResponse(**updated)

@api_router.delete("/units/{unit_id}")
async def delete_unit(unit_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Delete a unit (Super Admin only)"""
    result = await db.units.delete_one({"id": unit_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Unit not found")
    return {"message": "Unit deleted successfully"}

@api_router.post("/units/seed-defaults")
async def seed_default_units(current_user: dict = Depends(get_super_admin_user)):
    """Seed the database with default units (Super Admin only)"""
    seeded = []
    for unit in DEFAULT_UNITS:
        existing = await db.units.find_one({"symbol": unit["symbol"]})
        if not existing:
            unit_dict = unit.copy()
            unit_dict["id"] = str(uuid.uuid4())
            unit_dict["created_by"] = current_user["id"]
            unit_dict["created_at"] = datetime.now(timezone.utc).isoformat()
            unit_dict["is_active"] = True
            await db.units.insert_one(unit_dict)
            seeded.append(unit["symbol"])
    
    return {"message": f"Seeded {len(seeded)} units", "units": seeded}

# Super Admin - Fuel Database Management
@api_router.get("/super-admin/fuel-database", response_model=List[FuelDatabaseResponse])
async def get_all_fuels(current_user: dict = Depends(get_super_admin_user)):
    """Get all fuels in the database"""
    fuels = await db.fuel_database.find({}, {"_id": 0}).to_list(10000)
    return [FuelDatabaseResponse(**f) for f in fuels]

@api_router.post("/super-admin/fuel-database", response_model=FuelDatabaseResponse)
async def create_fuel(
    fuel_data: FuelDatabaseCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Create a new fuel entry in the database"""
    # Check for duplicate by fuel_name + category + industry_sector + region
    existing = await db.fuel_database.find_one({
        "fuel_name": fuel_data.fuel_name,
        "category": fuel_data.category,
        "industry_sector": fuel_data.industry_sector,
        "region": fuel_data.region or "Global"
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"A fuel entry already exists for '{fuel_data.fuel_name}' in {fuel_data.category} / {fuel_data.industry_sector} ({fuel_data.region or 'Global'}). Please use a different combination."
        )
    
    fuel_dict = fuel_data.model_dump()
    fuel_dict["id"] = str(uuid.uuid4())
    fuel_dict["created_by"] = current_user["id"]
    fuel_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    fuel_dict["region"] = fuel_data.region or "Global"
    
    await db.fuel_database.insert_one(fuel_dict)
    return FuelDatabaseResponse(**fuel_dict)

@api_router.put("/super-admin/fuel-database/{fuel_id}", response_model=FuelDatabaseResponse)
async def update_fuel(
    fuel_id: str,
    fuel_data: FuelDatabaseCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Update an existing fuel entry"""
    existing = await db.fuel_database.find_one({"id": fuel_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Fuel not found")
    
    # Check for duplicate by fuel_name + category + industry_sector + region (excluding current fuel)
    duplicate = await db.fuel_database.find_one({
        "id": {"$ne": fuel_id},
        "fuel_name": fuel_data.fuel_name,
        "category": fuel_data.category,
        "industry_sector": fuel_data.industry_sector,
        "region": fuel_data.region or "Global"
    })
    if duplicate:
        raise HTTPException(
            status_code=400, 
            detail=f"A fuel entry already exists for '{fuel_data.fuel_name}' in {fuel_data.category} / {fuel_data.industry_sector} ({fuel_data.region or 'Global'})."
        )
    
    update_dict = fuel_data.model_dump()
    update_dict["region"] = fuel_data.region or "Global"
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.fuel_database.update_one({"id": fuel_id}, {"$set": update_dict})
    
    updated = await db.fuel_database.find_one({"id": fuel_id}, {"_id": 0})
    return FuelDatabaseResponse(**updated)

@api_router.delete("/super-admin/fuel-database/{fuel_id}")
async def delete_fuel(fuel_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Delete a fuel entry"""
    result = await db.fuel_database.delete_one({"id": fuel_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Fuel not found")
    return {"message": "Fuel deleted successfully"}

# Public endpoint to get fuels for Admin/User (read-only)
@api_router.get("/fuel-database", response_model=List[FuelDatabaseResponse])
async def get_fuels_for_users(current_user: dict = Depends(get_current_user)):
    """Get all fuels (for Admin/User to select when adding emissions)"""
    fuels = await db.fuel_database.find({}, {"_id": 0}).to_list(10000)
    return [FuelDatabaseResponse(**f) for f in fuels]

@api_router.get("/fuel-database/{fuel_id}", response_model=FuelDatabaseResponse)
async def get_fuel_by_id(fuel_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific fuel by ID"""
    fuel = await db.fuel_database.find_one({"id": fuel_id}, {"_id": 0})
    if not fuel:
        raise HTTPException(status_code=404, detail="Fuel not found")
    return FuelDatabaseResponse(**fuel)

# Get GWP values - now fetches from formula_parameters if defined, otherwise returns defaults
@api_router.get("/gwp-values")
async def get_gwp_values():
    """Get GWP values (from Super Admin parameters or IPCC AR5 defaults)"""
    gwp_ch4_param = await db.formula_parameters.find_one({"parameter_key": "gwp_ch4"}, {"_id": 0})
    gwp_n2o_param = await db.formula_parameters.find_one({"parameter_key": "gwp_n2o"}, {"_id": 0})
    
    return {
        "CO2": 1,
        "CH4": gwp_ch4_param.get("default_value", GWP_VALUES["CH4"]) if gwp_ch4_param else GWP_VALUES["CH4"],
        "N2O": gwp_n2o_param.get("default_value", GWP_VALUES["N2O"]) if gwp_n2o_param else GWP_VALUES["N2O"],
        "source": "custom" if (gwp_ch4_param or gwp_n2o_param) else "IPCC AR5 defaults"
    }

# Seed default GWP parameters for CO2e formula customization
@api_router.post("/super-admin/seed-gwp-parameters")
async def seed_gwp_parameters(current_user: dict = Depends(get_super_admin_user)):
    """Seed GWP parameters for CO2e formula customization"""
    gwp_params = [
        {
            "parameter_name": "GWP CH4",
            "parameter_key": "gwp_ch4",
            "description": "Global Warming Potential for CH4 (Methane). Used in CO2e calculation: CO2e = CO2 + (CH4 × GWP_CH4) + (N2O × GWP_N2O). Default is 28 (IPCC AR5).",
            "value_type": "predefined",
            "default_value": 28,
            "unit": "kg CO2e/kg CH4",
            "predefined_source": "IPCC AR5",
            "is_optional": False,
            "is_active": True
        },
        {
            "parameter_name": "GWP N2O",
            "parameter_key": "gwp_n2o",
            "description": "Global Warming Potential for N2O (Nitrous Oxide). Used in CO2e calculation: CO2e = CO2 + (CH4 × GWP_CH4) + (N2O × GWP_N2O). Default is 273 (IPCC AR5).",
            "value_type": "predefined",
            "default_value": 273,
            "unit": "kg CO2e/kg N2O",
            "predefined_source": "IPCC AR5",
            "is_optional": False,
            "is_active": True
        }
    ]
    
    created_count = 0
    for param in gwp_params:
        existing = await db.formula_parameters.find_one({"parameter_key": param["parameter_key"]})
        if not existing:
            param["id"] = str(uuid.uuid4())
            param["created_by"] = current_user["id"]
            param["created_at"] = datetime.now(timezone.utc).isoformat()
            param["updated_by"] = None
            param["updated_at"] = None
            param["unit_conversions"] = []
            await db.formula_parameters.insert_one(param)
            created_count += 1
    
    return {"message": f"Created {created_count} GWP parameters", "total_gwp_params": 2}

# Super Admin - Formula Parameters Management
@api_router.get("/super-admin/formula-parameters", response_model=List[FormulaParameterResponse])
async def get_all_formula_parameters(current_user: dict = Depends(get_super_admin_user)):
    """Get all formula parameters"""
    params = await db.formula_parameters.find({}, {"_id": 0}).to_list(1000)
    return [FormulaParameterResponse(**p) for p in params]

@api_router.post("/super-admin/formula-parameters", response_model=FormulaParameterResponse)
async def create_formula_parameter(
    param_data: FormulaParameterCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Create a new formula parameter"""
    # Check for duplicate by parameter_key
    existing = await db.formula_parameters.find_one({"parameter_key": param_data.parameter_key})
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"A parameter with key '{param_data.parameter_key}' already exists."
        )
    
    param_dict = param_data.model_dump()
    param_dict["id"] = str(uuid.uuid4())
    param_dict["created_by"] = current_user["id"]
    param_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    param_dict["updated_by"] = None
    param_dict["updated_at"] = None
    
    await db.formula_parameters.insert_one(param_dict)
    return FormulaParameterResponse(**param_dict)

@api_router.put("/super-admin/formula-parameters/{param_id}", response_model=FormulaParameterResponse)
async def update_formula_parameter(
    param_id: str,
    param_data: FormulaParameterCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Update a formula parameter"""
    existing = await db.formula_parameters.find_one({"id": param_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Parameter not found")
    
    # Check for duplicate key (excluding current)
    duplicate = await db.formula_parameters.find_one({
        "id": {"$ne": param_id},
        "parameter_key": param_data.parameter_key
    })
    if duplicate:
        raise HTTPException(
            status_code=400, 
            detail=f"A parameter with key '{param_data.parameter_key}' already exists."
        )
    
    update_dict = param_data.model_dump()
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.formula_parameters.update_one({"id": param_id}, {"$set": update_dict})
    updated = await db.formula_parameters.find_one({"id": param_id}, {"_id": 0})
    return FormulaParameterResponse(**updated)

@api_router.delete("/super-admin/formula-parameters/{param_id}")
async def delete_formula_parameter(param_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Delete a formula parameter"""
    result = await db.formula_parameters.delete_one({"id": param_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Parameter not found")
    return {"message": "Parameter deleted successfully"}

# Public endpoint to get formula parameters (for calculation)
@api_router.get("/formula-parameters", response_model=List[FormulaParameterResponse])
async def get_formula_parameters_for_users(current_user: dict = Depends(get_current_user)):
    """Get all formula parameters for calculation forms"""
    params = await db.formula_parameters.find({}, {"_id": 0}).sort("display_order", 1).to_list(1000)
    return [FormulaParameterResponse(**p) for p in params]

# Super Admin - Formula Definitions (the actual formulas/equations)
@api_router.get("/super-admin/formula-definitions", response_model=List[FormulaDefinitionResponse])
async def get_all_formula_definitions(current_user: dict = Depends(get_super_admin_user)):
    """Get all formula definitions"""
    formulas = await db.formula_definitions.find({}, {"_id": 0}).sort("display_order", 1).to_list(1000)
    return [FormulaDefinitionResponse(**f) for f in formulas]

@api_router.post("/super-admin/formula-definitions", response_model=FormulaDefinitionResponse)
async def create_formula_definition(
    formula_data: FormulaDefinitionCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Create a new formula definition"""
    # Check for duplicate by formula_key
    existing = await db.formula_definitions.find_one({"formula_key": formula_data.formula_key})
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"A formula with key '{formula_data.formula_key}' already exists."
        )
    
    formula_dict = formula_data.model_dump()
    formula_dict["id"] = str(uuid.uuid4())
    formula_dict["created_by"] = current_user["id"]
    formula_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    formula_dict["updated_by"] = None
    formula_dict["updated_at"] = None
    
    await db.formula_definitions.insert_one(formula_dict)
    return FormulaDefinitionResponse(**formula_dict)

@api_router.put("/super-admin/formula-definitions/{formula_id}", response_model=FormulaDefinitionResponse)
async def update_formula_definition(
    formula_id: str,
    formula_data: FormulaDefinitionCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Update a formula definition"""
    existing = await db.formula_definitions.find_one({"id": formula_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Formula not found")
    
    # Check for duplicate key (excluding current)
    duplicate = await db.formula_definitions.find_one({
        "id": {"$ne": formula_id},
        "formula_key": formula_data.formula_key
    })
    if duplicate:
        raise HTTPException(
            status_code=400, 
            detail=f"A formula with key '{formula_data.formula_key}' already exists."
        )
    
    update_dict = formula_data.model_dump()
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.formula_definitions.update_one({"id": formula_id}, {"$set": update_dict})
    updated = await db.formula_definitions.find_one({"id": formula_id}, {"_id": 0})
    return FormulaDefinitionResponse(**updated)

@api_router.delete("/super-admin/formula-definitions/{formula_id}")
async def delete_formula_definition(formula_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Delete a formula definition"""
    result = await db.formula_definitions.delete_one({"id": formula_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Formula not found")
    return {"message": "Formula deleted successfully"}

# Public endpoint to get formula definitions (for calculation)
@api_router.get("/formula-definitions", response_model=List[FormulaDefinitionResponse])
async def get_formula_definitions_for_users(current_user: dict = Depends(get_current_user)):
    """Get all active formula definitions for calculation"""
    formulas = await db.formula_definitions.find({"is_active": True}, {"_id": 0}).sort("display_order", 1).to_list(1000)
    return [FormulaDefinitionResponse(**f) for f in formulas]

# ====================== EMISSION CONFIGURATIONS ======================
# SuperAdmin can map scopes/categories to formulas dynamically

@api_router.get("/super-admin/emission-configurations", response_model=List[EmissionConfigurationResponse])
async def get_all_emission_configurations(current_user: dict = Depends(get_super_admin_user)):
    """Get all emission configurations (SuperAdmin only)"""
    configs = await db.emission_configurations.find({}, {"_id": 0}).sort("priority", -1).to_list(1000)
    
    # Populate formula_name for each config
    result = []
    for config in configs:
        formula = await db.formula_definitions.find_one({"id": config.get("formula_id")}, {"_id": 0})
        config["formula_name"] = formula.get("formula_name") if formula else "Unknown"
        result.append(EmissionConfigurationResponse(**config))
    
    return result

@api_router.post("/super-admin/emission-configurations", response_model=EmissionConfigurationResponse)
async def create_emission_configuration(config_data: EmissionConfigurationCreate, current_user: dict = Depends(get_super_admin_user)):
    """Create a new emission configuration (SuperAdmin only)"""
    # Verify formula exists
    formula = await db.formula_definitions.find_one({"id": config_data.formula_id}, {"_id": 0})
    if not formula:
        raise HTTPException(status_code=400, detail="Formula not found")
    
    config_dict = config_data.model_dump()
    config_dict["id"] = str(uuid.uuid4())
    config_dict["created_by"] = current_user["id"]
    config_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.emission_configurations.insert_one(config_dict)
    config_dict["formula_name"] = formula.get("formula_name")
    return EmissionConfigurationResponse(**config_dict)

@api_router.put("/super-admin/emission-configurations/{config_id}", response_model=EmissionConfigurationResponse)
async def update_emission_configuration(config_id: str, config_data: EmissionConfigurationCreate, current_user: dict = Depends(get_super_admin_user)):
    """Update an emission configuration (SuperAdmin only)"""
    existing = await db.emission_configurations.find_one({"id": config_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Configuration not found")
    
    # Verify formula exists
    formula = await db.formula_definitions.find_one({"id": config_data.formula_id}, {"_id": 0})
    if not formula:
        raise HTTPException(status_code=400, detail="Formula not found")
    
    update_dict = config_data.model_dump()
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.emission_configurations.update_one({"id": config_id}, {"$set": update_dict})
    updated = await db.emission_configurations.find_one({"id": config_id}, {"_id": 0})
    updated["formula_name"] = formula.get("formula_name")
    return EmissionConfigurationResponse(**updated)

@api_router.delete("/super-admin/emission-configurations/{config_id}")
async def delete_emission_configuration(config_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Delete an emission configuration (SuperAdmin only)"""
    result = await db.emission_configurations.delete_one({"id": config_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Configuration not found")
    return {"message": "Configuration deleted successfully"}

# Public endpoint to get emission configurations (for Admin/User calculation)
@api_router.get("/emission-configurations", response_model=List[EmissionConfigurationResponse])
async def get_emission_configurations_for_users(current_user: dict = Depends(get_current_user)):
    """Get active emission configurations for calculation"""
    configs = await db.emission_configurations.find({"is_active": True}, {"_id": 0}).sort("priority", -1).to_list(1000)
    
    # Populate formula_name and full formula data for each config
    result = []
    for config in configs:
        formula = await db.formula_definitions.find_one({"id": config.get("formula_id")}, {"_id": 0})
        config["formula_name"] = formula.get("formula_name") if formula else "Unknown"
        result.append(EmissionConfigurationResponse(**config))
    
    return result

# Super Admin Dashboard
@api_router.get("/super-admin/dashboard")
async def get_super_admin_dashboard(current_user: dict = Depends(get_super_admin_user)):
    # Include all orgs (active and inactive) for dashboard view
    orgs = await db.organizations.find({}, {"_id": 0}).to_list(1000)
    all_facilities = await db.facilities.find({}, {"_id": 0}).to_list(10000)
    all_users = await db.users.find({"role": {"$in": ["admin", "user"]}}, {"_id": 0}).to_list(10000)
    
    org_stats = []
    total_admins = 0
    total_users = 0
    
    for org in orgs:
        org_facilities = [f for f in all_facilities if f.get("organization_id") == org["id"]]
        org_admins = [u for u in all_users if u.get("organization_id") == org["id"] and u.get("role") == "admin"]
        org_users_list = [u for u in all_users if u.get("organization_id") == org["id"] and u.get("role") == "user"]
        
        total_admins += len(org_admins)
        total_users += len(org_users_list)
        
        org_stats.append({
            "organization_id": org["id"],
            "organization_name": org["name"],
            "is_active": org.get("is_active", True) and not org.get("is_deleted", False),
            "is_deleted": org.get("is_deleted", False),
            "total_facilities": len(org_facilities),
            "total_admins": len(org_admins),
            "total_users": len(org_users_list),
            "max_facilities": org.get("max_facilities", 10),
            "max_admins": org.get("max_admins", 5),
            "max_users": org.get("max_users", 20)
        })
    
    return {
        "total_organizations": len(orgs),
        "total_facilities": len(all_facilities),
        "total_admins": total_admins,
        "total_users": total_users,
        "organization_stats": org_stats
    }

# Organization endpoints (Admin access + User read-only)
@api_router.get("/organizations/my", response_model=OrganizationResponse)
async def get_my_organization(current_user: dict = Depends(get_current_user)):
    """Get organization details - Admin can edit, User can only view"""
    if current_user["role"] == "super_admin":
        raise HTTPException(status_code=400, detail="Super Admin does not belong to an organization")
    
    if not current_user.get("organization_id"):
        raise HTTPException(status_code=404, detail="No organization assigned")
    
    org = await db.organizations.find_one({"id": current_user["organization_id"]}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return OrganizationResponse(**org)

@api_router.put("/organizations/my", response_model=OrganizationResponse)
async def update_my_organization(org_data: OrganizationCreate, current_user: dict = Depends(get_admin_user)):
    """Update organization - Admin only"""
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
    
    org_id = current_user["organization_id"]
    
    # Check max_facilities limit
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if org:
        max_facilities = org.get("max_facilities", 10)
        current_facility_count = await db.facilities.count_documents({"organization_id": org_id})
        if current_facility_count >= max_facilities:
            raise HTTPException(
                status_code=400, 
                detail=f"Maximum facility limit ({max_facilities}) reached for your organization"
            )
    
    # Check for duplicate facility name within the organization
    existing = await db.facilities.find_one({
        "name": facility_data.name,
        "organization_id": org_id
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"A facility with the name '{facility_data.name}' already exists in your organization")
    
    facility_dict = facility_data.model_dump()
    facility_dict["id"] = str(uuid.uuid4())
    facility_dict["organization_id"] = org_id
    facility_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.facilities.insert_one(facility_dict)
    return FacilityResponse(**facility_dict)

@api_router.get("/facilities", response_model=List[FacilityResponse])
async def get_facilities(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "super_admin":
        facilities = await db.facilities.find({}, {"_id": 0}).to_list(1000)
    elif current_user["role"] == "admin":
        org_id = current_user.get("organization_id")
        if not org_id:
            return []  # Admin without organization has no facilities
        facilities = await db.facilities.find(
            {"organization_id": org_id},
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

@api_router.patch("/facilities/{facility_id}/toggle-active")
async def toggle_facility_active(facility_id: str, current_user: dict = Depends(get_admin_user)):
    """Toggle facility active status (soft delete/restore)"""
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    if current_user["role"] == "admin" and facility["organization_id"] != current_user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    new_status = not facility.get("is_active", True)
    await db.facilities.update_one(
        {"id": facility_id}, 
        {"$set": {"is_active": new_status}}
    )
    
    action = "activated" if new_status else "deactivated"
    return {"message": f"Facility {action} successfully", "is_active": new_status}

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
# NOTE: Standard factors endpoint removed - all standard factors now come from database via /emission-factors

@api_router.get("/emission-factors/standard")
async def get_standard_factors():
    # Return standard factors from DB (created by Super Admin with is_custom=false)
    factors = await db.emission_factors.find({"is_custom": False}, {"_id": 0}).to_list(1000)
    return [EmissionFactorResponse(**f) for f in factors]

@api_router.get("/emission-factors", response_model=List[EmissionFactorResponse])
async def get_emission_factors(current_user: dict = Depends(get_current_user)):
    # Get all standard factors (is_custom=false) for everyone
    standard_factors = await db.emission_factors.find({"is_custom": False}, {"_id": 0}).to_list(1000)
    
    # Get custom factors based on role
    custom_factors = []
    if current_user["role"] == "super_admin":
        # Super Admin sees all factors
        custom_factors = await db.emission_factors.find({"is_custom": True}, {"_id": 0}).to_list(1000)
    elif current_user["role"] in ["admin", "user"]:
        # Admin/User sees custom factors from their organization
        org_id = current_user.get("organization_id")
        if org_id:
            custom_factors = await db.emission_factors.find({
                "is_custom": True,
                "organization_id": org_id
            }, {"_id": 0}).to_list(1000)
    
    all_factors = standard_factors + custom_factors
    return [EmissionFactorResponse(**f) for f in all_factors]

# Custom Emission Factor endpoints for Admin/User
@api_router.post("/custom-emission-factors", response_model=EmissionFactorResponse)
async def create_custom_emission_factor(
    factor_data: EmissionFactorCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a custom emission factor (Admin/User only)"""
    if current_user["role"] == "super_admin":
        raise HTTPException(status_code=400, detail="Super Admin should use /super-admin/emission-factors for standard factors")
    
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    # Require justification for custom factors
    if not factor_data.justification:
        raise HTTPException(status_code=400, detail="Justification is required for custom emission factors")
    
    # Check for duplicate within organization
    existing = await db.emission_factors.find_one({
        "organization_id": org_id,
        "scope": factor_data.scope,
        "category": factor_data.category,
        "sub_category": factor_data.sub_category,
        "is_custom": True
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"A custom factor already exists for {factor_data.category} / {factor_data.sub_category}")
    
    factor_dict = factor_data.model_dump()
    factor_dict["id"] = str(uuid.uuid4())
    factor_dict["is_custom"] = True
    factor_dict["organization_id"] = org_id
    factor_dict["created_by"] = current_user["id"]
    factor_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    factor_dict["region"] = factor_data.region or "Global (All Regions)"
    
    await db.emission_factors.insert_one(factor_dict)
    return EmissionFactorResponse(**factor_dict)

@api_router.put("/custom-emission-factors/{factor_id}", response_model=EmissionFactorResponse)
async def update_custom_emission_factor(
    factor_id: str,
    factor_data: EmissionFactorCreate,
    current_user: dict = Depends(get_current_user)
):
    """Update a custom emission factor (Admin/User only)"""
    if current_user["role"] == "super_admin":
        raise HTTPException(status_code=400, detail="Super Admin should use /super-admin/emission-factors")
    
    existing = await db.emission_factors.find_one({"id": factor_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Emission factor not found")
    
    # Only allow editing custom factors from own organization
    if not existing.get("is_custom"):
        raise HTTPException(status_code=403, detail="Cannot edit standard emission factors")
    
    org_id = current_user.get("organization_id")
    if existing.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this factor")
    
    if not factor_data.justification:
        raise HTTPException(status_code=400, detail="Justification is required for custom emission factors")
    
    update_dict = factor_data.model_dump()
    update_dict["is_custom"] = True
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.emission_factors.update_one({"id": factor_id}, {"$set": update_dict})
    updated = await db.emission_factors.find_one({"id": factor_id}, {"_id": 0})
    return EmissionFactorResponse(**updated)

@api_router.delete("/custom-emission-factors/{factor_id}")
async def delete_custom_emission_factor(
    factor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a custom emission factor (Admin/User only)"""
    if current_user["role"] == "super_admin":
        raise HTTPException(status_code=400, detail="Super Admin should use /super-admin/emission-factors")
    
    existing = await db.emission_factors.find_one({"id": factor_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Emission factor not found")
    
    if not existing.get("is_custom"):
        raise HTTPException(status_code=403, detail="Cannot delete standard emission factors")
    
    org_id = current_user.get("organization_id")
    if existing.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this factor")
    
    await db.emission_factors.delete_one({"id": factor_id})
    return {"message": "Custom emission factor deleted successfully"}

# Calculation Formulas CRUD (Super Admin only)
@api_router.post("/calculation-formulas", response_model=CalculationFormulaResponse)
async def create_calculation_formula(formula_data: CalculationFormulaCreate, current_user: dict = Depends(get_super_admin_user)):
    """Create a new calculation formula (Super Admin only)"""
    # Check for duplicate name
    existing = await db.calculation_formulas.find_one({"name": formula_data.name}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Formula with this name already exists")
    
    formula_dict = formula_data.model_dump()
    formula_dict["id"] = str(uuid.uuid4())
    formula_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    formula_dict["updated_at"] = None
    
    await db.calculation_formulas.insert_one(formula_dict)
    return CalculationFormulaResponse(**formula_dict)

@api_router.get("/calculation-formulas", response_model=List[CalculationFormulaResponse])
async def get_calculation_formulas(
    scope: Optional[str] = None,
    active_only: bool = True,
    current_user: dict = Depends(get_current_user)
):
    """Get all calculation formulas"""
    query = {}
    if scope:
        query["scope"] = scope
    if active_only:
        query["is_active"] = True
    
    formulas = await db.calculation_formulas.find(query, {"_id": 0}).to_list(1000)
    return [CalculationFormulaResponse(**f) for f in formulas]

@api_router.get("/calculation-formulas/{formula_id}", response_model=CalculationFormulaResponse)
async def get_calculation_formula(formula_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific calculation formula"""
    formula = await db.calculation_formulas.find_one({"id": formula_id}, {"_id": 0})
    if not formula:
        raise HTTPException(status_code=404, detail="Formula not found")
    return CalculationFormulaResponse(**formula)

@api_router.put("/calculation-formulas/{formula_id}", response_model=CalculationFormulaResponse)
async def update_calculation_formula(
    formula_id: str,
    formula_data: CalculationFormulaCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Update a calculation formula (Super Admin only)"""
    existing = await db.calculation_formulas.find_one({"id": formula_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Formula not found")
    
    # Check for duplicate name (excluding current formula)
    duplicate = await db.calculation_formulas.find_one({
        "name": formula_data.name,
        "id": {"$ne": formula_id}
    }, {"_id": 0})
    if duplicate:
        raise HTTPException(status_code=400, detail="Another formula with this name already exists")
    
    update_dict = formula_data.model_dump()
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.calculation_formulas.update_one({"id": formula_id}, {"$set": update_dict})
    updated = await db.calculation_formulas.find_one({"id": formula_id}, {"_id": 0})
    return CalculationFormulaResponse(**updated)

@api_router.delete("/calculation-formulas/{formula_id}")
async def delete_calculation_formula(formula_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Delete a calculation formula (Super Admin only)"""
    existing = await db.calculation_formulas.find_one({"id": formula_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Formula not found")
    
    await db.calculation_formulas.delete_one({"id": formula_id})
    return {"message": "Calculation formula deleted successfully"}

# Sector management endpoints (Super Admin)
@api_router.post("/super-admin/sectors", response_model=SectorResponse)
async def create_sector(sector_data: SectorCreate, current_user: dict = Depends(get_super_admin_user)):
    """Create a new sector (Super Admin only)"""
    existing = await db.sectors.find_one({"name": sector_data.name}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Sector with this name already exists")
    
    # If this is the first sector being added, seed the defaults first
    sectors_count = await db.sectors.count_documents({})
    if sectors_count == 0:
        default_sectors = [
            {"id": "default-1", "name": "Manufacturing", "description": "Manufacturing and production facilities", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-2", "name": "Transportation", "description": "Transportation and logistics", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-3", "name": "Energy", "description": "Energy production and distribution", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-4", "name": "Agriculture", "description": "Agricultural operations", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-5", "name": "Construction", "description": "Construction and real estate", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-6", "name": "Retail", "description": "Retail and consumer goods", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-7", "name": "Healthcare", "description": "Healthcare and pharmaceuticals", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-8", "name": "Technology", "description": "Technology and IT services", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-9", "name": "Finance", "description": "Financial services", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-10", "name": "Other", "description": "Other industries", "created_at": datetime.now(timezone.utc).isoformat()}
        ]
        # Check if the new sector name matches any default - if so, skip that default
        defaults_to_insert = [s for s in default_sectors if s["name"] != sector_data.name]
        if defaults_to_insert:
            await db.sectors.insert_many(defaults_to_insert)
    
    sector_dict = sector_data.model_dump()
    sector_dict["id"] = str(uuid.uuid4())
    sector_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.sectors.insert_one(sector_dict)
    return SectorResponse(**sector_dict)

@api_router.get("/sectors", response_model=List[SectorResponse])
async def get_sectors(current_user: dict = Depends(get_current_user)):
    """Get all sectors"""
    sectors = await db.sectors.find({}, {"_id": 0}).to_list(1000)
    
    # If no custom sectors exist, return default sectors
    if not sectors:
        default_sectors = [
            {"id": "default-1", "name": "Manufacturing", "description": "Manufacturing and production facilities", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-2", "name": "Transportation", "description": "Transportation and logistics", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-3", "name": "Energy", "description": "Energy production and distribution", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-4", "name": "Agriculture", "description": "Agricultural operations", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-5", "name": "Construction", "description": "Construction and real estate", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-6", "name": "Retail", "description": "Retail and consumer goods", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-7", "name": "Healthcare", "description": "Healthcare and pharmaceuticals", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-8", "name": "Technology", "description": "Technology and IT services", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-9", "name": "Finance", "description": "Financial services", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-10", "name": "Other", "description": "Other industries", "created_at": datetime.now(timezone.utc).isoformat()}
        ]
        return [SectorResponse(**s) for s in default_sectors]
    
    return [SectorResponse(**s) for s in sectors]

@api_router.put("/super-admin/sectors/{sector_id}", response_model=SectorResponse)
async def update_sector(sector_id: str, sector_data: SectorCreate, current_user: dict = Depends(get_super_admin_user)):
    """Update a sector (Super Admin only)"""
    existing = await db.sectors.find_one({"id": sector_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Sector not found")
    
    # Check for duplicate name
    duplicate = await db.sectors.find_one({"name": sector_data.name, "id": {"$ne": sector_id}}, {"_id": 0})
    if duplicate:
        raise HTTPException(status_code=400, detail="Another sector with this name already exists")
    
    update_dict = sector_data.model_dump()
    await db.sectors.update_one({"id": sector_id}, {"$set": update_dict})
    updated = await db.sectors.find_one({"id": sector_id}, {"_id": 0})
    return SectorResponse(**updated)

@api_router.delete("/super-admin/sectors/{sector_id}")
async def delete_sector(sector_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Delete a sector (Super Admin only)"""
    existing = await db.sectors.find_one({"id": sector_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Sector not found")
    
    await db.sectors.delete_one({"id": sector_id})
    return {"message": "Sector deleted successfully"}

@api_router.post("/super-admin/sectors/seed-defaults")
async def seed_default_sectors(current_user: dict = Depends(get_super_admin_user)):
    """Seed default sectors into the database (Super Admin only)"""
    default_sectors = [
        {"id": "default-1", "name": "Manufacturing", "description": "Manufacturing and production facilities"},
        {"id": "default-2", "name": "Transportation", "description": "Transportation and logistics"},
        {"id": "default-3", "name": "Energy", "description": "Energy production and distribution"},
        {"id": "default-4", "name": "Agriculture", "description": "Agricultural operations"},
        {"id": "default-5", "name": "Construction", "description": "Construction and real estate"},
        {"id": "default-6", "name": "Retail", "description": "Retail and consumer goods"},
        {"id": "default-7", "name": "Healthcare", "description": "Healthcare and pharmaceuticals"},
        {"id": "default-8", "name": "Technology", "description": "Technology and IT services"},
        {"id": "default-9", "name": "Finance", "description": "Financial services"},
        {"id": "default-10", "name": "Other", "description": "Other industries"}
    ]
    
    added_count = 0
    for sector in default_sectors:
        # Only add if doesn't exist
        existing = await db.sectors.find_one({"name": sector["name"]}, {"_id": 0})
        if not existing:
            sector["created_at"] = datetime.now(timezone.utc).isoformat()
            await db.sectors.insert_one(sector)
            added_count += 1
    
    return {"message": f"Seeded {added_count} default sectors", "added": added_count}

# Emission records endpoints

# ============================================
# CANONICAL EMISSION CALCULATION ENGINE
# ============================================
# All calculations resolve to kg-based energy input
# Formula: Base Emissions (kg gas) = quantity_kg × NCV_TJ_per_kg × EF_kg_gas_per_TJ
# ============================================

def get_unit_type(unit: str) -> str:
    """Identify the type of unit"""
    unit_lower = unit.lower().strip()
    for unit_type, units in UNIT_CLASSIFICATIONS.items():
        if unit_lower in [u.lower() for u in units]:
            return unit_type
    return "unknown"

def convert_quantity_to_kg(quantity: float, unit: str, density_kg_per_L: Optional[float] = None, 
                           density_kg_per_m3: Optional[float] = None) -> dict:
    """
    Step 2: Convert Quantity to kg (Mandatory)
    Returns: {"quantity_kg": float, "error": str or None}
    """
    unit_type = get_unit_type(unit)
    
    # Mass units → direct conversion
    if unit_type == "mass_units":
        multiplier = QUANTITY_TO_KG_CONVERSIONS.get(unit, QUANTITY_TO_KG_CONVERSIONS.get(unit.lower()))
        if multiplier and isinstance(multiplier, (int, float)):
            return {"quantity_kg": quantity * multiplier, "error": None}
    
    # Volume liquid units → requires density in kg/L
    if unit_type == "volume_units_liquid":
        if density_kg_per_L is None:
            return {"quantity_kg": None, "error": f"Density (kg/L) required for volume unit '{unit}'"}
        
        volume_to_litre = {
            "litre": 1, "L": 1,
            "kilolitre": 1000, "kL": 1000,
            "millilitre": 0.001, "mL": 0.001,
            "gallon": 3.78541, "gal": 3.78541
        }
        multiplier = volume_to_litre.get(unit, volume_to_litre.get(unit.lower(), 1))
        quantity_kg = quantity * multiplier * density_kg_per_L
        return {"quantity_kg": quantity_kg, "error": None}
    
    # Volume cubic units → requires density in kg/m³
    if unit_type == "volume_units_cubic":
        if density_kg_per_m3 is None:
            return {"quantity_kg": None, "error": f"Density (kg/m³) required for volume unit '{unit}'"}
        
        volume_to_m3 = {
            "m3": 1, "m³": 1,
            "cm3": 0.000001, "cm³": 0.000001,
            "ft3": 0.0283168, "ft³": 0.0283168
        }
        multiplier = volume_to_m3.get(unit, volume_to_m3.get(unit.lower(), 1))
        quantity_kg = quantity * multiplier * density_kg_per_m3
        return {"quantity_kg": quantity_kg, "error": None}
    
    # Unknown unit - assume kg
    return {"quantity_kg": quantity, "error": None}

def convert_ncv_to_tj_per_kg(ncv_value: float, ncv_unit: str, density_kg_per_L: Optional[float] = None) -> dict:
    """
    Convert NCV to TJ/kg (standard unit)
    Returns: {"ncv_tj_per_kg": float, "error": str or None}
    """
    conversion = NCV_TO_TJ_PER_KG.get(ncv_unit)
    
    if conversion is None:
        return {"ncv_tj_per_kg": None, "error": f"Unknown NCV unit: {ncv_unit}"}
    
    if isinstance(conversion, str):
        # Needs density
        if "density_kg_per_L" in conversion and density_kg_per_L is None:
            return {"ncv_tj_per_kg": None, "error": f"Density required for NCV unit '{ncv_unit}'"}
        # Parse expression (simplified)
        if density_kg_per_L:
            ncv_tj_per_kg = 0.000001 / density_kg_per_L * ncv_value  # For MJ/L
            return {"ncv_tj_per_kg": ncv_tj_per_kg, "error": None}
    
    return {"ncv_tj_per_kg": ncv_value * conversion, "error": None}

def convert_ef_to_kg_per_tj(ef_value: float, ef_unit: str) -> dict:
    """
    Convert Emission Factor to kg/TJ (standard unit)
    Returns: {"ef_kg_per_tj": float, "error": str or None}
    """
    conversion = EF_TO_KG_PER_TJ.get(ef_unit, EF_TO_KG_PER_TJ.get(ef_unit.split()[0], 1))
    return {"ef_kg_per_tj": ef_value * conversion, "error": None}

def convert_density_for_calculation(density_value: float, density_unit: str, target: str = "kg_per_L") -> dict:
    """
    Convert density to required unit type
    target: "kg_per_L" or "kg_per_m3"
    """
    conversion = DENSITY_CONVERSIONS.get(density_unit)
    if conversion is None:
        return {"density": density_value, "error": f"Unknown density unit: {density_unit}"}
    
    if target == "kg_per_L":
        return {"density": density_value * conversion["to_kg_per_L"], "error": None}
    else:
        return {"density": density_value * conversion["to_kg_per_m3"], "error": None}

async def calculate_emissions(record_data: EmissionRecordCreate) -> dict:
    """
    CANONICAL EMISSION CALCULATION
    
    Formula: Base Emissions (kg gas) = quantity_kg × NCV_TJ_per_kg × EF_kg_gas_per_TJ
    
    Step 1: Convert quantity to kg (with unit normalization)
    Step 2: Convert NCV to TJ/kg
    Step 3: Calculate gas-wise emissions
    Step 4: Calculate CO2e (post-processing with GWP - values from Super Admin parameters)
    
    Returns: {
        "co2_emissions": kg,
        "ch4_emissions": kg,
        "n2o_emissions": kg,
        "co2e_emissions": kg
    }
    """
    # Custom factor - simple calculation
    if record_data.is_custom_factor:
        total = record_data.quantity * record_data.emission_factor
        
        # Fetch dynamic GWP values for custom factor as well
        gwp_ch4_param = await db.formula_parameters.find_one({"parameter_key": "gwp_ch4"}, {"_id": 0})
        gwp_n2o_param = await db.formula_parameters.find_one({"parameter_key": "gwp_n2o"}, {"_id": 0})
        gwp_ch4 = gwp_ch4_param.get("default_value", GWP_VALUES["CH4"]) if gwp_ch4_param else GWP_VALUES["CH4"]
        gwp_n2o = gwp_n2o_param.get("default_value", GWP_VALUES["N2O"]) if gwp_n2o_param else GWP_VALUES["N2O"]
        
        return {
            "co2_emissions": total,
            "ch4_emissions": 0,
            "n2o_emissions": 0,
            "co2e_emissions": total,
            "calculation_error": None
        }
    
    # Get input values
    quantity = record_data.quantity
    quantity_unit = record_data.unit or "kg"
    calorific_value = record_data.calorific_value or 0
    ncv_unit = "TJ/Gg"  # Default NCV unit from fuel database
    density = record_data.density
    density_unit = "kg/L"  # Default density unit
    
    # Emission factors (assumed in kg/TJ from fuel database)
    ef_co2 = record_data.emission_factor or 0  # kg CO2/TJ
    ef_ch4 = record_data.emission_factor_ch4 or 0  # kg CH4/TJ
    ef_n2o = record_data.emission_factor_n2o or 0  # kg N2O/TJ
    
    # If no calorific value, fall back to simple calculation
    if not calorific_value:
        total = quantity * ef_co2
        return {
            "co2_emissions": total,
            "ch4_emissions": 0,
            "n2o_emissions": 0,
            "co2e_emissions": total,
            "calculation_error": "No NCV provided - using simple calculation"
        }
    
    # ============================================
    # STEP 1: Convert Quantity to kg
    # ============================================
    density_kg_per_L = None
    density_kg_per_m3 = None
    
    if density:
        density_result = convert_density_for_calculation(density, density_unit, "kg_per_L")
        if density_result["error"]:
            return {
                "co2_emissions": 0, "ch4_emissions": 0, "n2o_emissions": 0, 
                "co2e_emissions": 0, "calculation_error": density_result["error"]
            }
        density_kg_per_L = density_result["density"]
        density_kg_per_m3 = density_kg_per_L * 1000
    
    qty_result = convert_quantity_to_kg(quantity, quantity_unit, density_kg_per_L, density_kg_per_m3)
    if qty_result["error"]:
        return {
            "co2_emissions": 0, "ch4_emissions": 0, "n2o_emissions": 0, 
            "co2e_emissions": 0, "calculation_error": qty_result["error"]
        }
    quantity_kg = qty_result["quantity_kg"]
    
    # ============================================
    # STEP 2: Convert NCV to TJ/kg
    # ============================================
    ncv_result = convert_ncv_to_tj_per_kg(calorific_value, ncv_unit, density_kg_per_L)
    if ncv_result["error"]:
        return {
            "co2_emissions": 0, "ch4_emissions": 0, "n2o_emissions": 0, 
            "co2e_emissions": 0, "calculation_error": ncv_result["error"]
        }
    ncv_tj_per_kg = ncv_result["ncv_tj_per_kg"]
    
    # ============================================
    # STEP 3: Gas-wise Emission Computation
    # Formula: emissions_gas_kg = quantity_kg × NCV_TJ_per_kg × EF_kg_gas_per_TJ
    # ============================================
    co2_emissions_kg = quantity_kg * ncv_tj_per_kg * ef_co2
    ch4_emissions_kg = quantity_kg * ncv_tj_per_kg * ef_ch4
    n2o_emissions_kg = quantity_kg * ncv_tj_per_kg * ef_n2o
    
    # ============================================
    # STEP 4: CO2e Calculation (Post-Processing)
    # CO2e = CO2 + (CH4 × GWP_CH4) + (N2O × GWP_N2O)
    # Note: GWP is applied AFTER mass calculation, not before
    # GWP values can be customized by Super Admin via formula_parameters
    # ============================================
    
    # Fetch dynamic GWP values from formula_parameters (or use defaults)
    gwp_ch4_param = await db.formula_parameters.find_one({"parameter_key": "gwp_ch4"}, {"_id": 0})
    gwp_n2o_param = await db.formula_parameters.find_one({"parameter_key": "gwp_n2o"}, {"_id": 0})
    
    gwp_ch4 = gwp_ch4_param.get("default_value", GWP_VALUES["CH4"]) if gwp_ch4_param else GWP_VALUES["CH4"]
    gwp_n2o = gwp_n2o_param.get("default_value", GWP_VALUES["N2O"]) if gwp_n2o_param else GWP_VALUES["N2O"]
    
    co2e_kg = co2_emissions_kg + (ch4_emissions_kg * gwp_ch4) + (n2o_emissions_kg * gwp_n2o)
    
    return {
        "co2_emissions": co2_emissions_kg,
        "ch4_emissions": ch4_emissions_kg,
        "n2o_emissions": n2o_emissions_kg,
        "co2e_emissions": co2e_kg,
        "gwp_ch4_used": gwp_ch4,
        "gwp_n2o_used": gwp_n2o,
        "calculation_error": None
    }

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
    record_id = str(uuid.uuid4())
    record_dict["id"] = record_id
    record_dict["created_by"] = current_user["id"]
    record_dict["created_by_email"] = current_user.get("email", "")
    
    # ALWAYS use pre-calculated emission values from frontend
    # The frontend does all calculation with proper formula execution
    # Backend just stores what the frontend calculated
    record_dict["co2_emissions"] = record_data.calculated_co2 if record_data.calculated_co2 is not None else 0
    record_dict["ch4_emissions"] = record_data.calculated_ch4 if record_data.calculated_ch4 is not None else 0
    record_dict["n2o_emissions"] = record_data.calculated_n2o if record_data.calculated_n2o is not None else 0
    record_dict["co2e_emissions"] = record_data.calculated_co2e if record_data.calculated_co2e is not None else 0
    record_dict["total_emissions"] = record_dict["co2e_emissions"]  # For backward compatibility
    
    created_at = datetime.now(timezone.utc).isoformat()
    record_dict["created_at"] = created_at
    record_dict["updated_at"] = None
    record_dict["updated_by"] = None
    record_dict["updated_by_email"] = None
    
    await db.emission_records.insert_one(record_dict)
    
    # Create initial version history entry for creation
    creation_history = {
        "id": str(uuid.uuid4()),
        "emission_id": record_id,
        "changed_by": current_user["id"],
        "changed_at": created_at,
        "changes": {
            "action": "created",
            "old_values": None,
            "new_values": record_data.model_dump()
        }
    }
    await db.emission_history.insert_one(creation_history)
    
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
        org_id = current_user.get("organization_id")
        if not org_id:
            return []  # Admin without organization has no emissions
        facilities = await db.facilities.find(
            {"organization_id": org_id},
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
    
    # Save version history entry for this update
    history_dict = {
        "id": str(uuid.uuid4()),
        "emission_id": record_id,
        "changed_by": current_user["id"],
        "changed_at": datetime.now(timezone.utc).isoformat(),
        "changes": {
            "action": "updated",
            "old_values": existing,
            "new_values": record_data.model_dump()
        }
    }
    await db.emission_history.insert_one(history_dict)
    
    update_dict = record_data.model_dump()
    
    # ALWAYS use pre-calculated emission values from frontend
    # The frontend does all calculation with proper formula execution
    # Backend just stores what the frontend calculated
    update_dict["co2_emissions"] = record_data.calculated_co2 if record_data.calculated_co2 is not None else 0
    update_dict["ch4_emissions"] = record_data.calculated_ch4 if record_data.calculated_ch4 is not None else 0
    update_dict["n2o_emissions"] = record_data.calculated_n2o if record_data.calculated_n2o is not None else 0
    update_dict["co2e_emissions"] = record_data.calculated_co2e if record_data.calculated_co2e is not None else 0
    update_dict["total_emissions"] = update_dict["co2e_emissions"]  # For backward compatibility
    
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_by_email"] = current_user.get("email", "")
    
    await db.emission_records.update_one({"id": record_id}, {"$set": update_dict})
    updated = await db.emission_records.find_one({"id": record_id}, {"_id": 0})
    return EmissionRecordResponse(**updated)

@api_router.get("/emissions/{record_id}/history", response_model=List[EmissionHistoryResponse])
async def get_emission_history(record_id: str, current_user: dict = Depends(get_current_user)):
    # Sort by changed_at ascending so creation entry appears first
    history = await db.emission_history.find(
        {"emission_id": record_id}, 
        {"_id": 0}
    ).sort("changed_at", 1).to_list(1000)
    
    # Populate changed_by_email for each history entry
    for entry in history:
        if entry.get("changed_by"):
            user = await db.users.find_one({"id": entry["changed_by"]}, {"_id": 0, "email": 1})
            entry["changed_by_email"] = user.get("email") if user else "Unknown User"
        else:
            entry["changed_by_email"] = "Unknown User"
    
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
        org_id = current_user.get("organization_id")
        if not org_id:
            # Admin without organization - return empty stats
            return {
                "total_facilities": 0,
                "total_emissions": 0,
                "scope1_emissions": 0,
                "scope2_emissions": 0,
                "biogenic_emissions": 0,
                "recent_records": [],
                "emissions_by_facility": [],
                "emissions_trend": []
            }
        facilities = await db.facilities.find(
            {"organization_id": org_id},
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

# Report generation endpoint with year-wise breakdown
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
    
    # Add period info
    if start_period and end_period:
        period_para = doc.add_paragraph(f'Reporting Period: {start_period} to {end_period}')
        period_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        period_para.runs[0].font.size = Pt(12)
    
    doc.add_paragraph()
    
    # Facility details
    doc.add_heading('Facility Information', 1)
    doc.add_paragraph(f"Name: {facility['name']}")
    doc.add_paragraph(f"Address: {facility['address']}")
    if facility.get('sector'):
        doc.add_paragraph(f"Sector: {facility['sector']}")
    if facility.get('responsible_person'):
        doc.add_paragraph(f"Responsible Person: {facility['responsible_person']}")
    
    doc.add_paragraph()
    
    # Overall Summary
    doc.add_heading('Overall Emissions Summary', 1)
    total_emissions = sum(e["total_emissions"] for e in emissions)
    scope1_total = sum(e["total_emissions"] for e in emissions if e["scope"] == "scope1")
    scope2_total = sum(e["total_emissions"] for e in emissions if e["scope"] == "scope2")
    biogenic_total = sum(e["total_emissions"] for e in emissions if e["scope"] == "biogenic")
    
    doc.add_paragraph(f"Total Emissions: {round(total_emissions, 2)} kg CO2e")
    doc.add_paragraph(f"Scope 1 Emissions: {round(scope1_total, 2)} kg CO2e ({round(scope1_total/total_emissions*100 if total_emissions > 0 else 0, 1)}%)")
    doc.add_paragraph(f"Scope 2 Emissions: {round(scope2_total, 2)} kg CO2e ({round(scope2_total/total_emissions*100 if total_emissions > 0 else 0, 1)}%)")
    doc.add_paragraph(f"Biogenic Emissions: {round(biogenic_total, 2)} kg CO2e ({round(biogenic_total/total_emissions*100 if total_emissions > 0 else 0, 1)}%)")
    
    # Chart
    if emissions:
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))
        
        # Pie chart
        labels = ['Scope 1', 'Scope 2', 'Biogenic']
        sizes = [scope1_total, scope2_total, biogenic_total]
        colors = ['#1A4D2E', '#4F6F52', '#E85C0D']
        non_zero = [(label, size, color) for label, size, color in zip(labels, sizes, colors) if size > 0]
        if non_zero:
            labels_nz, sizes_nz, colors_nz = zip(*non_zero)
            ax1.pie(sizes_nz, labels=labels_nz, colors=colors_nz, autopct='%1.1f%%', startangle=90)
        ax1.set_title('Overall Emissions by Scope')
        
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
    
    # Year-wise breakdown
    doc.add_heading('Year-wise Emissions Breakdown', 1)
    
    # Group emissions by year
    year_emissions = {}
    for emission in emissions:
        year = emission["reporting_period"].split('-')[0]
        if year not in year_emissions:
            year_emissions[year] = []
        year_emissions[year].append(emission)
    
    # Sort years in descending order (most recent first)
    for year in sorted(year_emissions.keys(), reverse=True):
        year_data = year_emissions[year]
        
        # Year heading
        doc.add_heading(f'Calendar Year {year}', 2)
        
        # Year summary
        year_total = sum(e["total_emissions"] for e in year_data)
        year_scope1 = sum(e["total_emissions"] for e in year_data if e["scope"] == "scope1")
        year_scope2 = sum(e["total_emissions"] for e in year_data if e["scope"] == "scope2")
        year_biogenic = sum(e["total_emissions"] for e in year_data if e["scope"] == "biogenic")
        
        summary_para = doc.add_paragraph()
        summary_para.add_run(f"Year {year} Total: ").bold = True
        summary_para.add_run(f"{round(year_total, 2)} kg CO2e\n")
        summary_para.add_run(f"  • Scope 1: {round(year_scope1, 2)} kg CO2e\n")
        summary_para.add_run(f"  • Scope 2: {round(year_scope2, 2)} kg CO2e\n")
        summary_para.add_run(f"  • Biogenic: {round(year_biogenic, 2)} kg CO2e")
        
        doc.add_paragraph()
        
        # Year table
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
        
        for emission in sorted(year_data, key=lambda x: x["reporting_period"]):
            row_cells = table.add_row().cells
            row_cells[0].text = emission["reporting_period"]
            row_cells[1].text = emission["scope"].upper().replace("SCOPE", "Scope ").replace("BIOGENIC", "Biogenic")
            row_cells[2].text = emission["category"]
            row_cells[3].text = emission["sub_category"]
            row_cells[4].text = str(emission["quantity"])
            row_cells[5].text = str(emission["emission_factor"])
            row_cells[6].text = str(round(emission["total_emissions"], 2))
        
        doc.add_paragraph()
    
    # Save to buffer
    doc_buffer = io.BytesIO()
    doc.save(doc_buffer)
    doc_buffer.seek(0)
    
    # Generate download token and store report
    download_token = str(uuid.uuid4())
    filename = f"GHG_Report_{facility['name'].replace(' ', '_')}_{start_period or 'all'}_{end_period or 'all'}.docx"
    
    # Clean up old downloads (older than 5 minutes)
    current_time = datetime.now(timezone.utc)
    expired_tokens = [
        token for token, data in pending_downloads.items()
        if (current_time - data["created_at"]).total_seconds() > 300
    ]
    for token in expired_tokens:
        del pending_downloads[token]
    
    pending_downloads[download_token] = {
        "buffer": doc_buffer.read(),
        "filename": filename,
        "created_at": current_time
    }
    
    return {"download_token": download_token, "filename": filename}

# Combined Report for multiple facilities
@api_router.post("/reports/combined")
async def generate_combined_report(
    facility_ids: List[str],
    start_period: Optional[str] = None,
    end_period: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    if not facility_ids:
        raise HTTPException(status_code=400, detail="No facilities selected")
    
    # Get organization details
    organization = None
    if current_user.get("organization_id"):
        organization = await db.organizations.find_one(
            {"id": current_user["organization_id"]}, 
            {"_id": 0}
        )
    
    # Get all selected facilities
    facilities_data = []
    for fid in facility_ids:
        facility = await db.facilities.find_one({"id": fid}, {"_id": 0})
        if facility:
            # Check access
            if current_user["role"] == "user" and fid not in current_user.get("assigned_facilities", []):
                continue
            if current_user["role"] == "admin" and facility.get("organization_id") != current_user.get("organization_id"):
                continue
            
            query = {"facility_id": fid}
            if start_period and end_period:
                query["reporting_period"] = {"$gte": start_period, "$lte": end_period}
            
            emissions = await db.emission_records.find(query, {"_id": 0}).to_list(10000)
            facilities_data.append({"facility": facility, "emissions": emissions})
    
    if not facilities_data:
        raise HTTPException(status_code=404, detail="No accessible facilities found")
    
    doc = Document()
    
    # Title
    title = doc.add_heading('Combined GHG Emissions Report', 0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    if start_period and end_period:
        period_para = doc.add_paragraph(f'Reporting Period: {start_period} to {end_period}')
        period_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    doc.add_paragraph()
    
    # Organization Details (if available)
    if organization:
        doc.add_heading('Organization Information', 1)
        doc.add_paragraph(f"Name: {organization.get('name', 'N/A')}")
        
        address_parts = [organization.get('corporate_address', '')]
        if organization.get('city'):
            address_parts.append(organization['city'])
        if organization.get('state'):
            address_parts.append(organization['state'])
        if organization.get('country'):
            address_parts.append(organization['country'])
        if organization.get('pincode'):
            address_parts.append(f"({organization['pincode']})")
        
        doc.add_paragraph(f"Address: {', '.join(filter(None, address_parts))}")
        
        if organization.get('general_description'):
            doc.add_paragraph(f"Description: {organization['general_description']}")
        if organization.get('mission'):
            doc.add_paragraph(f"Mission: {organization['mission']}")
        if organization.get('vision'):
            doc.add_paragraph(f"Vision: {organization['vision']}")
        
        doc.add_paragraph()
    
    # Overall Summary across all facilities
    doc.add_heading('Overall Summary', 1)
    all_emissions = []
    for fd in facilities_data:
        all_emissions.extend(fd["emissions"])
    
    total_emissions = sum(e["total_emissions"] for e in all_emissions)
    scope1_total = sum(e["total_emissions"] for e in all_emissions if e["scope"] == "scope1")
    scope2_total = sum(e["total_emissions"] for e in all_emissions if e["scope"] == "scope2")
    biogenic_total = sum(e["total_emissions"] for e in all_emissions if e["scope"] == "biogenic")
    
    doc.add_paragraph(f"Total Facilities Included: {len(facilities_data)}")
    doc.add_paragraph(f"Total Emissions: {round(total_emissions, 2)} kg CO2e")
    doc.add_paragraph(f"Scope 1 Emissions: {round(scope1_total, 2)} kg CO2e ({round(scope1_total/total_emissions*100 if total_emissions > 0 else 0, 1)}%)")
    doc.add_paragraph(f"Scope 2 Emissions: {round(scope2_total, 2)} kg CO2e ({round(scope2_total/total_emissions*100 if total_emissions > 0 else 0, 1)}%)")
    doc.add_paragraph(f"Biogenic Emissions: {round(biogenic_total, 2)} kg CO2e ({round(biogenic_total/total_emissions*100 if total_emissions > 0 else 0, 1)}%)")
    
    doc.add_page_break()
    
    # Year-wise breakdown across all facilities
    doc.add_heading('Year-wise Emissions Breakdown', 1)
    
    year_emissions = {}
    for emission in all_emissions:
        year = emission["reporting_period"].split('-')[0]
        if year not in year_emissions:
            year_emissions[year] = {"emissions": [], "by_facility": {}}
        year_emissions[year]["emissions"].append(emission)
        
        fac_id = emission["facility_id"]
        if fac_id not in year_emissions[year]["by_facility"]:
            year_emissions[year]["by_facility"][fac_id] = []
        year_emissions[year]["by_facility"][fac_id].append(emission)
    
    for year in sorted(year_emissions.keys(), reverse=True):
        year_data = year_emissions[year]["emissions"]
        
        doc.add_heading(f'Calendar Year {year}', 2)
        
        year_total = sum(e["total_emissions"] for e in year_data)
        year_scope1 = sum(e["total_emissions"] for e in year_data if e["scope"] == "scope1")
        year_scope2 = sum(e["total_emissions"] for e in year_data if e["scope"] == "scope2")
        year_biogenic = sum(e["total_emissions"] for e in year_data if e["scope"] == "biogenic")
        
        summary_para = doc.add_paragraph()
        summary_para.add_run(f"Year {year} Total: ").bold = True
        summary_para.add_run(f"{round(year_total, 2)} kg CO2e\n")
        summary_para.add_run(f"  • Scope 1: {round(year_scope1, 2)} kg CO2e\n")
        summary_para.add_run(f"  • Scope 2: {round(year_scope2, 2)} kg CO2e\n")
        summary_para.add_run(f"  • Biogenic: {round(year_biogenic, 2)} kg CO2e")
        
        doc.add_paragraph()
    
    doc.add_page_break()
    
    # Details for each facility
    for idx, fd in enumerate(facilities_data):
        facility = fd["facility"]
        emissions = fd["emissions"]
        
        doc.add_heading(f'Facility {idx + 1}: {facility["name"]}', 1)
        
        # Facility info
        doc.add_paragraph(f"Address: {facility.get('address', 'N/A')}")
        if facility.get('city') or facility.get('state') or facility.get('country'):
            location_parts = [facility.get('city'), facility.get('state'), facility.get('country')]
            doc.add_paragraph(f"Location: {', '.join(filter(None, location_parts))}")
        if facility.get('sector'):
            doc.add_paragraph(f"Sector: {facility['sector']}")
        if facility.get('responsible_person'):
            doc.add_paragraph(f"Responsible Person: {facility['responsible_person']}")
        
        # Facility emissions summary
        fac_total = sum(e["total_emissions"] for e in emissions)
        fac_scope1 = sum(e["total_emissions"] for e in emissions if e["scope"] == "scope1")
        fac_scope2 = sum(e["total_emissions"] for e in emissions if e["scope"] == "scope2")
        fac_biogenic = sum(e["total_emissions"] for e in emissions if e["scope"] == "biogenic")
        
        doc.add_paragraph()
        doc.add_paragraph(f"Total Emissions: {round(fac_total, 2)} kg CO2e")
        doc.add_paragraph(f"Scope 1: {round(fac_scope1, 2)} kg CO2e | Scope 2: {round(fac_scope2, 2)} kg CO2e | Biogenic: {round(fac_biogenic, 2)} kg CO2e")
        
        # Emission records table
        if emissions:
            doc.add_paragraph()
            table = doc.add_table(rows=1, cols=6)
            table.style = 'Light Grid Accent 1'
            hdr = table.rows[0].cells
            hdr[0].text = 'Period'
            hdr[1].text = 'Scope'
            hdr[2].text = 'Category'
            hdr[3].text = 'Quantity'
            hdr[4].text = 'Factor'
            hdr[5].text = 'Emissions (kg)'
            
            for em in sorted(emissions, key=lambda x: x["reporting_period"], reverse=True):
                row = table.add_row().cells
                row[0].text = em["reporting_period"]
                row[1].text = em["scope"].replace("scope", "Scope ")
                row[2].text = em.get("category", "")
                row[3].text = str(em["quantity"])
                row[4].text = str(em["emission_factor"])
                row[5].text = str(round(em["total_emissions"], 2))
        
        if idx < len(facilities_data) - 1:
            doc.add_page_break()
    
    # Save to buffer
    doc_buffer = io.BytesIO()
    doc.save(doc_buffer)
    doc_buffer.seek(0)
    
    # Generate download token and store report
    download_token = str(uuid.uuid4())
    filename = f"Combined_GHG_Report_{start_period or 'all'}_{end_period or 'all'}.docx"
    
    # Clean up old downloads (older than 5 minutes)
    current_time = datetime.now(timezone.utc)
    expired_tokens = [
        token for token, data in pending_downloads.items()
        if (current_time - data["created_at"]).total_seconds() > 300
    ]
    for token in expired_tokens:
        del pending_downloads[token]
    
    pending_downloads[download_token] = {
        "buffer": doc_buffer.read(),
        "filename": filename,
        "created_at": current_time
    }
    
    return {"download_token": download_token, "filename": filename}

# GHG Inventory Report Generation
class GHGReportRequest(BaseModel):
    facility_ids: List[str]
    reporting_period_start: str  # Format: YYYY-MM
    reporting_period_end: str    # Format: YYYY-MM
    description_of_change: Optional[str] = ""
    include_previous_years: bool = False
    organization_id: Optional[str] = None  # For SuperAdmin to specify organization

@api_router.post("/reports/ghg-inventory")
async def generate_ghg_inventory_report(
    request: GHGReportRequest,
    current_user: dict = Depends(get_current_user)
):
    """Generate GHG Inventory Report based on template"""
    from report_generator import GHGReportGenerator
    
    if not request.facility_ids:
        raise HTTPException(status_code=400, detail="No facilities selected")
    
    # Get organization details - handle SuperAdmin case
    organization = None
    org_id = current_user.get("organization_id")
    
    # SuperAdmin can specify organization_id, or we get it from the first facility
    if current_user.get("role") == "super_admin":
        if request.organization_id:
            org_id = request.organization_id
        else:
            # Get organization from first facility
            first_facility = await db.facilities.find_one({"id": request.facility_ids[0]}, {"_id": 0})
            if first_facility:
                org_id = first_facility.get("organization_id")
    
    if org_id:
        organization = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    
    # If still no organization, create a default one
    if not organization:
        organization = {
            "name": "Organization",
            "address": "Not Available",
            "city": "Not Available",
            "state": "Not Available",
            "country": "Not Available",
            "description": "Not Available"
        }
    
    # Get all selected facilities
    facilities_data = []
    for fid in request.facility_ids:
        facility = await db.facilities.find_one({"id": fid}, {"_id": 0})
        if facility:
            # Check access based on role
            if current_user.get("role") == "super_admin":
                facilities_data.append(facility)
            elif current_user.get("role") == "user" and fid not in current_user.get("assigned_facilities", []):
                continue
            elif current_user.get("role") == "admin" and facility.get("organization_id") != current_user.get("organization_id"):
                continue
            else:
                facilities_data.append(facility)
    
    if not facilities_data:
        raise HTTPException(status_code=404, detail="No accessible facilities found")
    
    # Get emissions within reporting period
    emissions_data = []
    for facility in facilities_data:
        query = {
            "facility_id": facility["id"],
            "reporting_period": {
                "$gte": request.reporting_period_start,
                "$lte": request.reporting_period_end
            }
        }
        cursor = db.emission_records.find(query, {"_id": 0})
        facility_emissions = await cursor.to_list(length=1000)
        emissions_data.extend(facility_emissions)
    
    # Get previous years data if requested
    previous_years_data = None
    if request.include_previous_years:
        previous_years_data = []
        for facility in facilities_data:
            query = {
                "facility_id": facility["id"],
                "reporting_period": {"$lt": request.reporting_period_start}
            }
            cursor = db.emission_records.find(query, {"_id": 0})
            prev_emissions = await cursor.to_list(length=1000)
            previous_years_data.extend(prev_emissions)
        # Add previous years data to emissions_data for the generator to process
        emissions_data.extend(previous_years_data)
    
    # Generate report - pass backend URL for internal file access
    generator = GHGReportGenerator(backend_base_url='http://localhost:8001')
    report_buffer = generator.generate_report(
        organization=organization,
        facilities=facilities_data,
        emissions=emissions_data,
        reporting_period_start=request.reporting_period_start,
        reporting_period_end=request.reporting_period_end,
        description_of_change=request.description_of_change,
        include_previous_years=request.include_previous_years
    )
    
    # Generate filename
    org_name = organization.get('name', 'Organization').replace(' ', '_')
    filename = f"GHG_Inventory_Report_{org_name}_{request.reporting_period_start}_{request.reporting_period_end}.docx"
    
    # Generate download token and store report
    download_token = str(uuid.uuid4())
    
    # Clean up old downloads (older than 5 minutes)
    current_time = datetime.now(timezone.utc)
    expired_tokens = [
        token for token, data in pending_downloads.items()
        if (current_time - data["created_at"]).total_seconds() > 300
    ]
    for token in expired_tokens:
        del pending_downloads[token]
    
    # Store new download
    report_buffer.seek(0)
    pending_downloads[download_token] = {
        "buffer": report_buffer.read(),
        "filename": filename,
        "created_at": current_time
    }
    
    return {"download_token": download_token, "filename": filename}


@api_router.get("/reports/download/{download_token}")
async def download_report(download_token: str):
    """Download a generated report using token"""
    if download_token not in pending_downloads:
        raise HTTPException(status_code=404, detail="Download link expired or invalid")
    
    download_data = pending_downloads[download_token]
    
    # Create a new BytesIO from the stored bytes
    buffer = io.BytesIO(download_data["buffer"])
    buffer.seek(0)
    
    # Remove from pending downloads after retrieval
    del pending_downloads[download_token]
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename={download_data['filename']}"}
    )

# File upload endpoint for evidence documents
@api_router.post("/upload/evidence")
async def upload_evidence_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    # Validate file type
    allowed_types = [
        'application/pdf',
        'image/jpeg', 'image/jpg', 'image/png',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  # xlsx
        'application/vnd.ms-excel',  # xls
        'text/csv',
        'application/msword',  # doc
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'  # docx
    ]
    
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400, 
            detail="File type not allowed. Supported types: PDF, Images (JPG, PNG), Excel (XLS, XLSX), CSV, Word (DOC, DOCX)"
        )
    
    # Validate file size (max 10MB)
    max_size = 10 * 1024 * 1024  # 10MB
    file_content = await file.read()
    if len(file_content) > max_size:
        raise HTTPException(status_code=400, detail="File size too large. Maximum size is 10MB")
    
    # Create uploads directory if it doesn't exist
    upload_dir = Path("/app/uploads")
    upload_dir.mkdir(exist_ok=True)
    
    # Generate unique filename
    file_extension = Path(file.filename).suffix
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = upload_dir / unique_filename
    
    # Save file
    with open(file_path, "wb") as f:
        f.write(file_content)
    
    # Store file metadata in database
    file_record = {
        "id": str(uuid.uuid4()),
        "original_filename": file.filename,
        "stored_filename": unique_filename,
        "file_path": str(file_path),
        "file_size": len(file_content),
        "content_type": file.content_type,
        "uploaded_by": current_user["id"],
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.uploaded_files.insert_one(file_record)
    
    return {
        "file_id": file_record["id"],
        "filename": file.filename,
        "size": len(file_content),
        "url": f"/api/files/{file_record['id']}"
    }

# File download endpoint
@api_router.get("/files/{file_id}")
async def download_file(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    file_record = await db.uploaded_files.find_one({"id": file_id}, {"_id": 0})
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_path = Path(file_record["file_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    # Sanitize filename for Content-Disposition header (latin-1 safe)
    original_filename = file_record.get('original_filename', 'download')
    # Replace non-ASCII characters with underscores
    safe_filename = ''.join(c if c.isascii() and c.isprintable() else '_' for c in original_filename)
    # Ensure filename isn't empty after sanitization
    if not safe_filename or safe_filename.strip('_') == '':
        safe_filename = f"file{Path(original_filename).suffix}" if Path(original_filename).suffix else "download"
    
    return StreamingResponse(
        open(file_path, "rb"),
        media_type=file_record["content_type"],
        headers={"Content-Disposition": f"attachment; filename={safe_filename}"}
    )

# Public file view endpoint (for logos, images and PDFs - no authentication required)
@api_router.get("/files/{file_id}/view")
async def view_file_public(file_id: str):
    """Public endpoint to view files (used for logo previews in img tags and PDF viewing)"""
    file_record = await db.uploaded_files.find_one({"id": file_id}, {"_id": 0})
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_path = Path(file_record["file_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    # Allow image files and PDFs to be viewed publicly
    content_type = file_record.get("content_type", "")
    allowed_view_types = ["image/", "application/pdf"]
    is_allowed = any(content_type.startswith(t) if t.endswith("/") else content_type == t for t in allowed_view_types)
    
    if not is_allowed:
        raise HTTPException(status_code=403, detail="Only image and PDF files can be viewed publicly")
    
    # For PDFs, set Content-Disposition to inline so browser displays it
    headers = {}
    if content_type == "application/pdf":
        original_filename = file_record.get('original_filename', 'document.pdf')
        safe_filename = ''.join(c if c.isascii() and c.isprintable() else '_' for c in original_filename)
        headers["Content-Disposition"] = f"inline; filename={safe_filename}"
    
    return StreamingResponse(
        open(file_path, "rb"),
        media_type=file_record["content_type"],
        headers=headers
    )

# Download endpoint - forces file download for any file type
@api_router.get("/files/{file_id}/download")
async def download_file_public(file_id: str):
    """Public endpoint to download any file as attachment"""
    file_record = await db.uploaded_files.find_one({"id": file_id}, {"_id": 0})
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_path = Path(file_record["file_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    original_filename = file_record.get('original_filename', 'file')
    safe_filename = ''.join(c if c.isascii() and c.isprintable() else '_' for c in original_filename)
    
    return StreamingResponse(
        open(file_path, "rb"),
        media_type=file_record["content_type"],
        headers={"Content-Disposition": f"attachment; filename={safe_filename}"}
    )

# List uploaded files
@api_router.get("/files")
async def list_files(current_user: dict = Depends(get_current_user)):
    query = {}
    if current_user["role"] == "user":
        query["uploaded_by"] = current_user["id"]
    elif current_user["role"] == "admin":
        # Get all users in the same organization
        org_id = current_user.get("organization_id")
        if not org_id:
            return []  # Admin without organization has no files to see
        org_users = await db.users.find(
            {"organization_id": org_id},
            {"_id": 0, "id": 1}
        ).to_list(1000)
        user_ids = [u["id"] for u in org_users]
        query["uploaded_by"] = {"$in": user_ids}
    # Super admin can see all files (no query filter)
    
    files = await db.uploaded_files.find(query, {"_id": 0}).to_list(1000)
    
    # Add uploader info
    for file_record in files:
        uploader = await db.users.find_one(
            {"id": file_record["uploaded_by"]}, 
            {"_id": 0, "full_name": 1, "email": 1}
        )
        file_record["uploader"] = uploader
    
    return files

# Delete file
@api_router.delete("/files/{file_id}")
async def delete_file(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    file_record = await db.uploaded_files.find_one({"id": file_id}, {"_id": 0})
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Check permissions
    if current_user["role"] == "user" and file_record["uploaded_by"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete this file")
    elif current_user["role"] == "admin":
        # Check if file was uploaded by someone in the same organization
        uploader = await db.users.find_one({"id": file_record["uploaded_by"]}, {"_id": 0})
        if uploader and uploader.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Not authorized to delete this file")
    
    # Delete file from disk
    file_path = Path(file_record["file_path"])
    if file_path.exists():
        file_path.unlink()
    
    # Delete record from database
    await db.uploaded_files.delete_one({"id": file_id})
    
    return {"message": "File deleted successfully"}
# Admin user management endpoints
@api_router.post("/admin/users")
async def create_user(
    user_data: UserCreateRequest,
    current_user: dict = Depends(get_admin_user)
):
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    # Check max_users limit
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if org:
        max_users = org.get("max_users", 20)
        current_user_count = await db.users.count_documents({
            "organization_id": org_id,
            "role": "user"
        })
        if current_user_count >= max_users:
            raise HTTPException(
                status_code=400, 
                detail=f"Maximum user limit ({max_users}) reached for your organization"
            )
    
    existing = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    temp_password = generate_random_password()
    
    user_dict = {
        "id": str(uuid.uuid4()),
        "email": user_data.email,
        "full_name": user_data.full_name,
        "role": "user",
        "password_hash": get_password_hash(temp_password),
        "organization_id": org_id,
        "assigned_facilities": user_data.assigned_facilities,
        "requires_password_change": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_dict)
    
    # Send welcome email
    await send_email(
        user_data.email,
        "Welcome to EcoTrack GHG Platform",
        f"""<html><body>
        <h2>Welcome to EcoTrack GHG Platform</h2>
        <p>You have been added as a User.</p>
        <p><strong>Login Credentials:</strong></p>
        <p>Email: {user_data.email}</p>
        <p>Temporary Password: {temp_password}</p>
        <p>Please change your password upon first login.</p>
        </body></html>"""
    )
    
    return {"message": "User created and email sent", "temp_password": temp_password}

@api_router.get("/admin/users", response_model=List[UserResponse])
async def get_all_users(current_user: dict = Depends(get_admin_user)):
    org_id = current_user.get("organization_id")
    if not org_id:
        return []  # Admin without organization has no users to manage
    # Exclude deleted users from the list
    query = {"organization_id": org_id, "role": "user", "is_deleted": {"$ne": True}}
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
    
    # Verify user exists and belongs to the same organization
    user_to_delete = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Admin can only delete users from their own organization
    if current_user["role"] == "admin":
        if user_to_delete.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Not authorized to delete users from other organizations")
    
    # Soft delete: mark user as deleted and inactive (prevents login)
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_deleted": True, "is_active": False}}
    )
    
    return {"message": "User deleted successfully. User can no longer log in."}

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
    expose_headers=["Content-Disposition", "Content-Type", "Content-Length"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()