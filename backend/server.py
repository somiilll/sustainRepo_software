from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
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
import asyncio
import resend
import anthropic
from audit_logger import AuditLogger, AuditAction, AuditModule, init_audit_logger, get_audit_logger

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Set Playwright browsers path BEFORE any playwright imports
os.environ['PLAYWRIGHT_BROWSERS_PATH'] = '/app/.playwright'

# Anthropic Claude API for AI Reports
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')

# MongoDB connection - auto-detect SSL for Atlas vs local
import certifi
mongo_url = os.environ['MONGO_URL']
# Use SSL certificates only for mongodb+srv (Atlas) connections
if mongo_url.startswith('mongodb+srv://'):
    client = AsyncIOMotorClient(mongo_url, tlsCAFile=certifi.where())
else:
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

# Initialize Audit Logger
audit_logger = init_audit_logger(db)

# Temporary storage for downloadable reports (in-memory cache with expiry)
# Key: download_token, Value: {"buffer": BytesIO, "filename": str, "created_at": datetime}
pending_downloads: Dict[str, Dict[str, Any]] = {}

# Resend Email configuration
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'noreply@sustainrepo.com')

# Initialize Resend
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# NOTE: Hardcoded emission factors removed. All standard factors are now managed by Super Admin in database.
# Admin/User can only use standard factors or create custom factors with justification.

# Helper functions
def generate_random_password(length=12):
    characters = string.ascii_letters + string.digits + string.punctuation
    return ''.join(secrets.choice(characters) for _ in range(length))

async def send_email(to_email: str, subject: str, body: str):
    """Send email using Resend"""
    if not RESEND_API_KEY:
        logging.warning("Resend API key not configured, skipping email")
        return False
    
    try:
        params = {
            "from": SENDER_EMAIL,
            "to": [to_email],
            "subject": subject,
            "html": body
        }
        
        # Run sync SDK in thread to keep FastAPI non-blocking
        email = await asyncio.to_thread(resend.Emails.send, params)
        logging.info(f"Email sent to {to_email}, ID: {email.get('id')}")
        return True
    except Exception as e:
        logging.error(f"Failed to send email: {str(e)}")
        return False


def compute_field_changes(old_values: dict, new_values: dict, fields_to_track: list = None) -> list:
    """
    Compute field-level changes between old and new values.
    Returns a list of change objects with field, old_value, new_value.
    
    Args:
        old_values: Dictionary of old field values
        new_values: Dictionary of new field values
        fields_to_track: Optional list of field names to track. If None, tracks all fields.
    
    Returns:
        List of dicts: [{"field": "field_name", "old_value": x, "new_value": y}, ...]
    """
    changes = []
    
    # Default fields to track for emissions - all important fields
    if fields_to_track is None:
        fields_to_track = [
            # Core identifiers
            "facility_id", "scope", "category", "subcategory",
            # Activity & Method
            "activity", "scope3_activity", "scope3_activity_type", "calculation_method_scope3",
            "scope3_ef_id", "fuel_type", "fuel_name", "fuel_id",
            # Quantities & Units
            "quantity", "unit", "reporting_period",
            # Emission factors
            "emission_factor", "emission_factor_co2", "emission_factor_ch4", "emission_factor_n2o",
            "ef_unit", "ef_source",
            # Outputs
            "co2_emissions", "ch4_emissions", "n2o_emissions", "co2e_emissions", "total_emissions",
            # Supplier data
            "supplier_name", "supplier_code", "supplier_emission_factor", "supplier_ef_unit",
            # Optional inputs
            "spend_amount", "distance_travelled", "passengers_travelled", "working_days",
            "working_hours", "inflation_rate", "purchase_power_value",
            # Person responsible
            "responsible_person", "responsible_person_designation", "responsible_person_contact",
            # Process info
            "process_name", "process_description",
            # Notes
            "notes", "justification",
            # Override justification (#17)
            "override_justification",
            "override_calorific_value", "override_density", "override_emission_factor_heat",
            # Dynamic fields
            "dynamic_field_values", "inputs", "outputs",
            # C7 specific
            "employees", "monthly_totals", "yearly_total",
        ]
    
    for field in fields_to_track:
        old_val = old_values.get(field)
        new_val = new_values.get(field)
        
        # Handle nested dicts/lists comparison
        if isinstance(old_val, (dict, list)) or isinstance(new_val, (dict, list)):
            # Convert to JSON string for comparison
            import json
            old_str = json.dumps(old_val, sort_keys=True, default=str) if old_val else None
            new_str = json.dumps(new_val, sort_keys=True, default=str) if new_val else None
            if old_str != new_str:
                changes.append({
                    "field": field,
                    "old_value": old_val,
                    "new_value": new_val,
                    "field_type": "complex"
                })
        elif old_val != new_val:
            # Only record if there's an actual change
            # Handle None vs empty string equivalence
            if not (old_val in (None, '', 0) and new_val in (None, '', 0)):
                changes.append({
                    "field": field,
                    "old_value": old_val,
                    "new_value": new_val,
                    "field_type": "simple"
                })
    
    return changes



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
    
    # Check if user is deleted
    if user.get("is_deleted"):
        raise HTTPException(status_code=403, detail="Your account has been deleted. Please contact your administrator.")
    
    # Check if user is active
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Your account has been deactivated. Please contact your administrator.")
    
    # For non-super admin users, check if their organization is active and subscription valid
    if user.get("role") != "super_admin" and user.get("organization_id"):
        org = await db.organizations.find_one({"id": user["organization_id"]}, {"_id": 0})
        
        # Check if organization is active
        if org and (org.get("is_deleted") or not org.get("is_active", True)):
            raise HTTPException(status_code=403, detail="Your organization has been deactivated. Please contact your administrator.")
        
        # Check if subscription has expired
        if org and org.get("subscription_expires_at"):
            try:
                expires_str = org["subscription_expires_at"]
                now = datetime.now(timezone.utc)
                
                # Handle different date formats
                if 'T' in str(expires_str):
                    expires_at = datetime.fromisoformat(expires_str.replace('Z', '+00:00'))
                    is_expired = expires_at < now
                else:
                    expires_date = datetime.strptime(str(expires_str), '%Y-%m-%d').date()
                    is_expired = expires_date < now.date()
                
                if is_expired:
                    raise HTTPException(status_code=403, detail="Your organization's subscription has expired. Please contact your administrator to renew.")
            except (ValueError, TypeError) as e:
                print(f"Subscription date parse error: {e}")
                pass  # If date parsing fails, allow access
    
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

class ProfileUpdate(BaseModel):
    full_name: str

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
    corporate_address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    pincode: Optional[str] = None
    general_description: Optional[str] = None
    mission: Optional[str] = None
    vision: Optional[str] = None
    process_description: Optional[str] = None
    reporting_frequency: Optional[str] = "yearly"
    reporting_year_type: Optional[str] = None  # "financial_year" or "calendar_year"
    # Organization Boundaries - Control Approach or Equity Share Approach
    org_boundaries_approach: Optional[str] = None  # "control" or "equity_share"
    org_boundaries_equity_percentage: Optional[float] = None  # Legacy field - percentage now set per facility
    org_boundaries: Optional[str] = None  # Legacy field for additional notes
    equity_share_reported_data_type: Optional[str] = None  # "org_share" or "total_facility" - what the reported data represents
    base_year: Optional[int] = None
    attachments: Optional[List[dict]] = None
    other_information: Optional[str] = None  # Renamed from remarks
    # New fields
    person_responsible: Optional[str] = None
    person_responsible_designation: Optional[str] = None
    person_responsible_contact: Optional[str] = None
    report_purpose: Optional[str] = None
    ghg_reduction_initiatives: Optional[str] = None
    internal_performance_tracking: Optional[str] = None
    max_facilities: Optional[int] = 10
    max_admins: Optional[int] = 5
    max_users: Optional[int] = 20
    subscription_expires_at: Optional[str] = None  # ISO date string, org auto-deactivates after this date (Required for SuperAdmin creation)
    # Control type selections (multi-select)
    control_financial: Optional[bool] = False
    control_operational: Optional[bool] = False
    # Uncertainty Assessment selections (multi-select)
    uncertainty_assessment: Optional[List[str]] = None
    # Report Access Control - which report templates org can access
    # Options: 'scope1_2' (current), 'scope1_2_3' (future), 'scope3_only' (future), 'cbam' (future)
    enabled_access: Optional[List[str]] = None  # Default will be ['scope1_2'] if None
    
    # ===== SuperAdmin-only Internal Fields =====
    # These fields are only visible/editable by SuperAdmin
    date_of_joining: Optional[str] = None  # ISO date string - when the org was onboarded
    selected_plan: Optional[str] = None  # Subscription plan name
    trial_period_end_date: Optional[str] = None  # ISO date string
    organization_size: Optional[str] = None  # Number of employees range
    payment_status: Optional[str] = None  # "Active", "Pending", "Overdue"
    internal_notes: Optional[str] = None  # Internal remarks for SuperAdmin
    lead_source: Optional[str] = None  # "Referral", "Website", "Partner", "Event"
    # Primary Contact (POC)
    poc_name: Optional[str] = None
    poc_designation: Optional[str] = None
    poc_phone: Optional[str] = None
    poc_email: Optional[str] = None
    # Secondary Contact
    secondary_contact_name: Optional[str] = None
    secondary_contact_phone: Optional[str] = None
    secondary_contact_email: Optional[str] = None
    # Payment Ledger - list of payment entries
    payment_ledger: Optional[List[dict]] = None  # [{date, amount, description, status}]
    # Invoice History - list of invoice attachments
    invoice_history: Optional[List[dict]] = None  # [{date, filename, url, amount}]
    
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
    reporting_year_type: Optional[str] = None  # "financial_year" or "calendar_year"
    # Organization Boundaries
    org_boundaries_approach: Optional[str] = None
    org_boundaries_equity_percentage: Optional[float] = None  # Legacy field
    org_boundaries: Optional[str] = None
    equity_share_reported_data_type: Optional[str] = None  # "org_share" or "total_facility"
    base_year: Optional[int] = None
    attachments: Optional[List[dict]] = None
    other_information: Optional[str] = None  # Renamed from remarks
    remarks: Optional[str] = None  # Keep for backward compatibility
    # New fields
    person_responsible: Optional[str] = None
    person_responsible_designation: Optional[str] = None
    person_responsible_contact: Optional[str] = None
    report_purpose: Optional[str] = None
    ghg_reduction_initiatives: Optional[str] = None
    internal_performance_tracking: Optional[str] = None
    is_deleted: bool = False
    is_active: bool = True
    subscription_expires_at: Optional[str] = None
    created_at: str
    max_facilities: Optional[int] = 10
    max_admins: Optional[int] = 5
    max_users: Optional[int] = 20
    # Control type selections (multi-select)
    control_financial: Optional[bool] = False
    control_operational: Optional[bool] = False
    # Uncertainty Assessment selections (multi-select)
    uncertainty_assessment: Optional[List[str]] = None
    # Report Access Control - which report templates org can access
    enabled_access: Optional[List[str]] = None  # e.g., ['scope1_2', 'scope1_2_3', 'cbam']
    
    # ===== SuperAdmin-only Internal Fields =====
    date_of_joining: Optional[str] = None
    selected_plan: Optional[str] = None
    trial_period_end_date: Optional[str] = None
    organization_size: Optional[str] = None
    payment_status: Optional[str] = None
    internal_notes: Optional[str] = None
    lead_source: Optional[str] = None
    poc_name: Optional[str] = None
    poc_designation: Optional[str] = None
    poc_phone: Optional[str] = None
    poc_email: Optional[str] = None
    secondary_contact_name: Optional[str] = None
    secondary_contact_phone: Optional[str] = None
    secondary_contact_email: Optional[str] = None
    payment_ledger: Optional[List[dict]] = None
    invoice_history: Optional[List[dict]] = None

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
    sub_sector: Optional[str] = None  # New field for sub-sector
    responsible_person: Optional[str] = None
    responsible_person_designation: Optional[str] = None
    responsible_person_contact: Optional[str] = None
    monitoring_frequency: str = "monthly"
    reporting_frequency: str = "monthly"
    attachments: Optional[List[dict]] = None  # [{type, name, url}]
    other_information: Optional[str] = None  # Renamed from remarks
    is_active: bool = True  # Soft delete flag
    equity_share_percentage: Optional[float] = 100.0  # Percentage of equity in this facility (for equity share approach)
    
    @field_validator('pincode')
    @classmethod
    def validate_pincode(cls, v):
        if v is not None and v != '':
            v = v.strip()
            if not v.isdigit() or len(v) != 6:
                raise ValueError('Pincode must be exactly 6 digits')
        return v
    
    @field_validator('equity_share_percentage')
    @classmethod
    def validate_equity_percentage(cls, v):
        if v is not None:
            if v <= 0 or v > 100:
                raise ValueError('Equity share percentage must be between 0 and 100')
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
    sub_sector: Optional[str] = None  # New field for sub-sector
    responsible_person: Optional[str] = None
    responsible_person_designation: Optional[str] = None
    responsible_person_contact: Optional[str] = None
    monitoring_frequency: Optional[str] = "monthly"
    reporting_frequency: Optional[str] = "monthly"
    organization_id: Optional[str] = None
    attachments: Optional[List[dict]] = None
    other_information: Optional[str] = None  # Renamed from remarks
    remarks: Optional[str] = None  # Keep for backward compatibility
    is_active: bool = True  # Soft delete flag
    equity_share_percentage: Optional[float] = 100.0  # Percentage of equity in this facility
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
    emission_factor_co2: Optional[float] = None  # kg CO2/TJ (basis heating value) - optional
    emission_factor_ch4: Optional[float] = None  # kg CH4/TJ (optional)
    emission_factor_n2o: Optional[float] = None  # kg N2O/TJ (optional)
    emission_factor_basis_quantity: Optional[float] = None  # Basis quantity for emission factor (e.g., per kWh)
    emission_factor_basis_unit: Optional[str] = None  # Unit for basis quantity (kWh, MWh, GWh)
    gwp_fugitives: Optional[float] = None  # GWP value for fugitive emissions
    density: Optional[float] = None  # kg/L (optional, for liquid fuels)
    density_unit: Optional[str] = "kg/L"
    conversion_factor: float = 1.0  # For unit conversions
    conversion_unit: Optional[str] = None  # Description of conversion
    source: Optional[str] = None  # Data source (e.g., IPCC, EPA)
    references: Optional[str] = None
    region: Optional[str] = "Global"  # Country/Region specificity
    notes: Optional[str] = None
    allowed_units: Optional[List[str]] = None  # Units allowed for this fuel (e.g., ["kg", "g", "tonne", "L", "kWh"])
    year_applicable: Optional[int] = None  # Year when this data is applicable (optional)

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
    gwp_fugitives: Optional[float] = None  # GWP value for fugitive emissions
    density: Optional[float] = None
    density_unit: Optional[str] = None
    conversion_factor: float = 1.0
    conversion_unit: Optional[str] = None
    source: Optional[str] = None
    references: Optional[str] = None
    region: Optional[str] = None
    notes: Optional[str] = None
    allowed_units: Optional[List[str]] = None
    year_applicable: Optional[int] = None  # Year when this data is applicable
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None


# ============== SCOPE 3 EMISSION FACTORS ==============

class Scope3EFCreate(BaseModel):
    scope: str  # Scope 3 category (e.g., "Scope 3.1", "Scope 3.2", etc.)
    category: str  # Category within scope
    activity: str  # Activity description (mandatory)
    method: str  # "spend" or "activity"
    industry_sectors: Optional[List[str]] = []  # Multiple industries
    region: Optional[str] = "Global"
    year_applicable: Optional[int] = None
    emission_factor: float  # Numeric value >= 0 (mandatory)
    unit: str  # Unit for the emission factor
    allowed_units: Optional[List[str]] = []  # Units allowed for activity value (e.g., ["kg", "tonne", "INR"])
    default_unit: Optional[str] = None  # Default unit for activity value - input will be auto-converted to this unit
    source: Optional[str] = None
    notes: Optional[str] = None
    references: Optional[str] = None
    activity_type: Optional[str] = None  # Activity type for C6/C7 (e.g., "hotel_stay", "air_travel")
    subcategory: Optional[str] = None  # Subcategory for C8/C10/C11/C13/C14 (e.g., "stationary_combustion", "mobile_combustion", "electricity")
    sub_scope: Optional[str] = None  # Sub-scope for fuel type (e.g., "biogenic", "fossil")

class Scope3EFResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    scope: str
    category: str
    activity: str
    method: str
    industry_sectors: Optional[List[str]] = []
    region: Optional[str] = "Global"
    year_applicable: Optional[int] = None
    emission_factor: float
    unit: str
    allowed_units: Optional[List[str]] = []  # Units allowed for activity value
    default_unit: Optional[str] = None  # Default unit for activity value - input will be auto-converted to this unit
    source: Optional[str] = None
    notes: Optional[str] = None
    references: Optional[str] = None
    activity_type: Optional[str] = None  # Activity type for C6/C7 (e.g., "hotel_stay", "air_travel")
    subcategory: Optional[str] = None  # Subcategory for C8/C10/C11/C13/C14
    sub_scope: Optional[str] = None  # Sub-scope for fuel type (e.g., "biogenic", "fossil")
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None

# GWP Constants (IPCC AR6 100-year values) - These are defaults, actual values come from DB
GWP_VALUES = {
    "CO2": 1,
    "CH4": 27.9,  # AR6 value (was 28 in AR5)
    "N2O": 273    # AR6 value (same as AR5)
}

# Default GWP source info
GWP_DEFAULT_SOURCE = "IPCC AR6"

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

class DynamicFieldValue(BaseModel):
    """Single dynamic field value with unit and override status"""
    value: Optional[float] = None
    unit: Optional[str] = None
    is_override: Optional[bool] = False
    justification: Optional[str] = None


class EmissionRecordCreate(BaseModel):
    facility_id: str
    organization_id: Optional[str] = None  # Will be set from facility if not provided
    reporting_period: str  # Monthly: "2025-03", Yearly: "CY2025" or "FY 2025-2026"
    frequency_type: Optional[str] = "monthly"  # "monthly" or "yearly" - locked once saved
    scope: str
    category: str
    sub_category: str
    fuel_type: Optional[str] = None
    
    # Scope 3 specific fields
    calculation_method_scope3: Optional[str] = None  # spend_basis, activity_basis, supplier_basis
    scope3_ef_id: Optional[str] = None  # Reference to scope3_ef table
    scope3_activity: Optional[str] = None  # Activity name from scope3_ef
    formula_id: Optional[str] = None  # Reference to ce_formulas - the formula used for calculation
    
    # Biogenic specific fields
    biogenic_scope_selection: Optional[str] = None  # 'scope1' or 'scope3' for biogenic emissions
    
    # Scope 3 Supplier Info (optional, applicable to all Scope 3 categories)
    supplier_name: Optional[str] = None
    supplier_code: Optional[str] = None
    
    # Scope 3 Employee Commuting specific fields (optional) - for single employee backward compat
    employee_name: Optional[str] = None
    employee_id: Optional[str] = None
    
    # Multi-Employee Data Structure (for C7 Employee Commuting)
    # Structure: [{ "name": "Employee A", "employee_id": "E001", "department": "IT", 
    #              "monthly_data": { "jan": { "km_travelled": 120, "emissions": { "co2e": 10.5 } }, ... } }]
    employees: Optional[List[Dict[str, Any]]] = None
    # Monthly aggregated totals: { "jan": { "co2e": 18.7 }, "feb": { "co2e": 20.1 }, ... }
    monthly_totals: Optional[Dict[str, Dict[str, float]]] = None
    # Yearly aggregated total
    yearly_total: Optional[Dict[str, float]] = None
    
    # DYNAMIC FIELD VALUES - stores all input values keyed by variable name
    # Example: {"qty": {"value": 1000, "unit": "kg"}, "cv": {"value": 45.5, "unit": "MJ/kg", "is_override": true}}
    dynamic_field_values: Optional[Dict[str, Dict[str, Any]]] = {}
    
    # Calculated emission outputs
    outputs: Optional[Dict[str, Dict[str, Any]]] = {}  # {"co2": {"value": 3.2, "unit": "tCO2"}, ...}
    
    # Metadata
    fuel_database_id: Optional[str] = None  # Reference to fuel database entry
    source_of_information: Optional[str] = None
    notes: Optional[str] = None
    justification: Optional[str] = None
    evidence_url: Optional[str] = None
    responsible_person: Optional[str] = None
    responsible_person_designation: Optional[str] = None
    responsible_person_contact: Optional[str] = None
    
    # Process names (multiple)
    process_names: Optional[List[str]] = []
    # Process descriptions (name + description pairs)
    process_descriptions: Optional[List[Dict[str, str]]] = []

class EmissionRecordResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    facility_id: str
    reporting_period: Optional[str] = None  # Monthly: "2025-03", Yearly: "CY2025" or "FY 2025-2026"
    frequency_type: Optional[str] = "monthly"  # "monthly" or "yearly" - locked once saved
    scope: str
    category: str
    sub_category: Optional[str] = None
    fuel_type: Optional[str] = None
    
    # Scope 3 specific fields
    calculation_method_scope3: Optional[str] = None
    scope3_ef_id: Optional[str] = None
    scope3_activity: Optional[str] = None
    formula_id: Optional[str] = None  # Reference to ce_formulas - the formula used for calculation
    
    # Biogenic specific fields
    biogenic_scope_selection: Optional[str] = None  # 'scope1' or 'scope3' for biogenic emissions
    
    # Scope 3 Supplier Info (optional, applicable to all Scope 3 categories)
    supplier_name: Optional[str] = None
    supplier_code: Optional[str] = None
    
    # Scope 3 Employee Commuting specific fields (optional) - for single employee backward compat
    employee_name: Optional[str] = None
    employee_id: Optional[str] = None
    
    # Multi-Employee Data Structure (for C7 Employee Commuting)
    employees: Optional[List[Dict[str, Any]]] = None
    monthly_totals: Optional[Dict[str, Dict[str, float]]] = None
    yearly_total: Optional[Dict[str, float]] = None
    
    # DYNAMIC FIELD VALUES - stores all input values keyed by variable name
    dynamic_field_values: Optional[Dict[str, Dict[str, Any]]] = {}
    
    # Calculated emission outputs
    outputs: Optional[Dict[str, Dict[str, Any]]] = {}
    
    # Convenience accessors for common outputs (derived from outputs dict)
    co2_emissions: Optional[float] = None
    ch4_emissions: Optional[float] = None
    n2o_emissions: Optional[float] = None
    co2e_emissions: Optional[float] = None
    total_emissions: Optional[float] = None  # Same as co2e_emissions
    
    # Metadata
    fuel_database_id: Optional[str] = None
    source_of_information: Optional[str] = None
    notes: Optional[str] = None
    justification: Optional[str] = None
    evidence_url: Optional[str] = None
    responsible_person: Optional[str] = None
    responsible_person_designation: Optional[str] = None
    responsible_person_contact: Optional[str] = None
    
    # Source tracking (e.g., "bulk_upload", "manual")
    source: Optional[str] = None
    bulk_upload_id: Optional[str] = None
    
    # Emission factor tracking
    emission_factor_used: Optional[float] = None
    emission_factor_unit: Optional[str] = None
    unit_conversion_applied: Optional[bool] = None
    
    # Process names
    process_names: Optional[List[str]] = []
    process_descriptions: Optional[List[Dict[str, str]]] = []
    
    # Audit fields
    created_by: Optional[str] = None
    created_by_email: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: str
    updated_by: Optional[str] = None
    updated_by_email: Optional[str] = None
    updated_by_name: Optional[str] = None
    updated_at: Optional[str] = None

class EmissionHistoryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    emission_id: str
    changed_by: str
    changed_by_email: Optional[str] = None
    changed_by_name: Optional[str] = None
    changed_at: str
    version: Optional[int] = None
    scope: Optional[str] = None
    category: Optional[str] = None
    field_changes: Optional[List[Dict[str, Any]]] = None  # Field-level changes
    changes_summary: Optional[str] = None  # Summary like "5 field(s) changed"
    changes: Dict[str, Any]

class DashboardStats(BaseModel):
    total_facilities: int
    total_emissions: float
    scope1_emissions: float
    scope2_emissions: float
    scope3_emissions: float = 0  # NEW: Scope 3 emissions
    biogenic_emissions: float
    recent_records: List[EmissionRecordResponse]
    emissions_by_facility: List[Dict[str, Any]]
    emissions_trend: List[Dict[str, Any]]
    emissions_by_category: List[Dict[str, Any]]  # Category analysis
    emissions_by_fuel: List[Dict[str, Any]]  # Fuel analysis
    yearly_fuel_analysis: List[Dict[str, Any]]  # Year-wise fuel analysis
    yearly_facility_analysis: List[Dict[str, Any]]  # Year-wise facility analysis
    monthly_comparison: List[Dict[str, Any]]  # Month-over-month comparison
    sinks_total: float = 0  # Total carbon sinks
    sinks_by_facility: List[Dict[str, Any]] = []  # Sinks breakdown by facility
    # NEW: Scope 3 specific analytics
    scope3_by_category: List[Dict[str, Any]] = []  # Scope 3 emissions breakdown by category
    scope3_by_methodology: List[Dict[str, Any]] = []  # Scope 3 methodology split (activity/spend/supplier)
    scope3_categories_reported: int = 0  # Number of Scope 3 categories with data
    # NEW: Year-over-year comparison
    previous_year_emissions: Optional[Dict[str, float]] = None  # Previous year totals for YoY comparison
    # NEW: Base year comparison
    base_year_comparison: Optional[Dict[str, Any]] = None  # Base year data for comparison

# Sink Models
class SinkCreate(BaseModel):
    facility_id: str
    reporting_year: str
    reporting_month: int  # 0-11 (Jan=0, Dec=11)
    total_emissions_reduced: float
    description: Optional[str] = None
    evidence_urls: Optional[List[str]] = None
    evidence_files: Optional[List[Dict[str, str]]] = None  # [{name, url, file_id}]
    # Legacy fields kept for backward compat
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    evidence_url: Optional[str] = None
    monthly_data: Optional[Dict[str, Any]] = None

class SinkResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    facility_id: str
    organization_id: Optional[str] = None
    reporting_year: Optional[str] = None
    reporting_month: Optional[int] = None
    total_emissions_reduced: float
    description: Optional[str] = None
    evidence_urls: Optional[List[str]] = None
    evidence_files: Optional[List[Dict[str, str]]] = None
    created_at: str
    updated_at: Optional[str] = None
    # Legacy fields
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    evidence_url: Optional[str] = None
    monthly_data: Optional[Dict[str, Any]] = None
    period_type: Optional[str] = None
    reporting_period: Optional[str] = None

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


# Process Template Models
class ProcessTemplateInputField(BaseModel):
    key: str  # unique key for the field
    label: str
    unit: str
    data_type: str = "number"  # number, text, percentage
    is_optional: bool = False
    default_value: Optional[str] = None  # default if user doesn't provide

class ProcessTemplatePredefinedInput(BaseModel):
    key: str  # unique key
    label: str
    unit: str
    data_type: str = "number"
    value: str  # the predefined value
    can_override: bool = True  # whether user can override

class ProcessTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    sub_industry: Optional[str] = None
    formula: str  # formula expression using input keys
    input_fields: List[Dict[str, Any]] = []  # required input fields
    predefined_inputs: List[Dict[str, Any]] = []  # predefined inputs with values
    is_active: bool = True

class ProcessTemplateResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: Optional[str] = None
    sub_industry: Optional[str] = None
    formula: str
    input_fields: List[Dict[str, Any]] = []
    predefined_inputs: List[Dict[str, Any]] = []
    is_active: bool = True
    created_at: str
    updated_at: Optional[str] = None


# ===== Base Year Emissions Models =====
class BaseYearEmissionEntry(BaseModel):
    """Single emission entry for base year"""
    scope: str
    category: str
    subcategory: Optional[str] = None
    tco2e: float

class BaseYearEmissionsCreate(BaseModel):
    """Create base year emissions record"""
    organization_id: str
    facility_id: Optional[str] = None  # None for org-level
    scope_group: str = "scope12"  # "scope12" for Scope 1&2, "scope3" for Scope 3
    base_year: str  # "2023-2024" for FY or "2024" for calendar year
    base_year_type: str  # "financial_year" or "calendar_year"
    is_oldest_year: bool = False  # True if auto-selected as oldest year
    emissions_data: List[BaseYearEmissionEntry] = []
    sinks_data: Optional[List[Dict[str, Any]]] = None  # Sinks data for base year
    justification: str  # MANDATORY: Justification for selecting this base year
    notes: Optional[str] = None  # Additional notes

class BaseYearEmissionsUpdate(BaseModel):
    """Update base year emissions record"""
    base_year: Optional[str] = None
    base_year_type: Optional[str] = None
    is_oldest_year: Optional[bool] = None
    emissions_data: Optional[List[BaseYearEmissionEntry]] = None
    sinks_data: Optional[List[Dict[str, Any]]] = None  # Sinks data for base year
    justification: Optional[str] = None  # Updated justification
    notes: Optional[str] = None  # Additional notes

class BaseYearChangeRequest(BaseModel):
    """Request model for changing base year"""
    new_base_year: str
    new_base_year_type: str
    change_reason: str  # MANDATORY: Reason for changing the base year
    recalculate_emissions: bool = False  # Whether to recalculate emissions for new year

class BaseYearVersionHistory(BaseModel):
    """Version history entry with detailed change tracking"""
    version: int
    change_type: str  # "created", "updated", "year_changed"
    previous_base_year: Optional[str] = None
    new_base_year: Optional[str] = None
    emissions_data: List[BaseYearEmissionEntry]
    changed_fields: Optional[List[str]] = None  # List of fields that changed
    change_reason: Optional[str] = None
    justification: Optional[str] = None
    changed_by: str
    changed_by_email: Optional[str] = None
    changed_by_name: Optional[str] = None
    changed_at: str

class BaseYearEmissionsResponse(BaseModel):
    """Response model for base year emissions"""
    model_config = ConfigDict(extra="ignore")
    id: str
    organization_id: str
    facility_id: Optional[str] = None
    scope_group: str = "scope12"  # "scope12" for Scope 1&2, "scope3" for Scope 3
    base_year: str
    base_year_type: str
    is_oldest_year: bool = False
    emissions_data: List[Dict[str, Any]] = []
    sinks_data: Optional[List[Dict[str, Any]]] = None  # Sinks data for base year
    justification: Optional[str] = None  # Justification for base year selection
    notes: Optional[str] = None  # Additional notes
    status: str = "configured"  # "configured", "incomplete", "modified"
    version: int = 1
    version_history: List[Dict[str, Any]] = []
    created_by: str
    created_by_email: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_by_email: Optional[str] = None
    updated_by_name: Optional[str] = None


# ============================================================================
# Configuration / Label Mappings Endpoint
# Provides centralized labels for calculation methods, activity types, etc.
# ============================================================================
@api_router.get("/config/labels")
async def get_config_labels():
    """
    Returns centralized display labels for enum values.
    Frontend should use these labels instead of hardcoding.
    """
    # Fetch from ce_input_field_mappings if available, otherwise use defaults
    method_mapping = await db.ce_input_field_mappings.find_one(
        {"variable_name": "calculation_method_scope3"},
        {"_id": 0}
    )
    
    # Default labels (can be overridden by DB config)
    calculation_method_labels = {
        "activity_basis": "Average Data Based",
        "spend_basis": "Spend Based", 
        "supplier_basis": "Supplier Based"
    }
    
    # Override with DB values if available
    if method_mapping and method_mapping.get("options"):
        for opt in method_mapping.get("options", []):
            if opt.get("value") and opt.get("label"):
                calculation_method_labels[opt["value"]] = opt["label"]
    
    # Short labels for compact displays (tables/grids)
    calculation_method_short_labels = {
        "activity_basis": "Average",
        "spend_basis": "Spend",
        "supplier_basis": "Supplier"
    }
    
    return {
        "calculation_methods": calculation_method_labels,
        "calculation_methods_short": calculation_method_short_labels,
        "scopes": {
            "scope1": "Scope 1",
            "scope2": "Scope 2", 
            "scope3": "Scope 3",
            "biogenic": "Biogenic"
        }
    }


# Auth endpoints
@api_router.post("/auth/signup", response_model=TokenResponse)
async def signup(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email, "is_deleted": {"$ne": True}}, {"_id": 0})
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
        
        # Check if subscription has expired
        if org and org.get("subscription_expires_at"):
            from datetime import datetime, date
            try:
                expires_str = org["subscription_expires_at"]
                now = datetime.now(timezone.utc)
                
                # Handle different date formats
                if 'T' in str(expires_str):
                    # Full ISO format with time
                    expires_at = datetime.fromisoformat(expires_str.replace('Z', '+00:00'))
                    is_expired = expires_at < now
                else:
                    # Date only format (YYYY-MM-DD) - consider expired at end of that day
                    expires_date = datetime.strptime(str(expires_str), '%Y-%m-%d').date()
                    is_expired = expires_date < now.date()
                
                if is_expired:
                    raise HTTPException(status_code=403, detail="Your organization's subscription has expired. Please contact your administrator to renew.")
            except (ValueError, TypeError) as e:
                print(f"Subscription date parse error: {e}")
                pass  # If date parsing fails, allow login
    
    access_token = create_access_token(data={"sub": user["id"]})
    user_response = UserResponse(**{k: v for k, v in user.items() if k != "password_hash"})
    
    return TokenResponse(access_token=access_token, token_type="bearer", user=user_response)

@api_router.post("/auth/change-password")
async def change_password(password_data: PasswordChange, current_user: dict = Depends(get_current_user)):
    if not verify_password(password_data.old_password, current_user["password_hash"]):
        raise HTTPException(status_code=400, detail="Incorrect old password")
    
    # Validate new password is different from current
    if password_data.old_password == password_data.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password")
    
    # Validate password strength
    if len(password_data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
    if not any(c.isupper() for c in password_data.new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter")
    if not any(c.islower() for c in password_data.new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one lowercase letter")
    if not any(c.isdigit() for c in password_data.new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one number")
    if not any(c in '!@#$%^&*()_+-=[]{}|;:,.<>?' for c in password_data.new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)")
    
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
        "email": user["email"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
        "used": False
    })
    
    # Get frontend URL from environment or use default
    frontend_url = os.environ.get('FRONTEND_URL', 'https://sustainrepo-preview-1.preview.emergentagent.com')
    reset_link = f"{frontend_url}/reset-password?token={reset_token}"
    
    # Send email with beautiful template
    logo_url = "https://customer-assets.emergentagent.com/job_d67b5362-a184-47b7-81eb-abb9d39b89dd/artifacts/qllw2r8k_Logo_v3.png"
    email_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8f9fa; padding: 40px 20px;">
            <tr>
                <td align="center">
                    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                        <!-- Header -->
                        <tr>
                            <td style="background-color: #ffffff; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; border-bottom: 1px solid #e5e7eb;">
                                <img src="{logo_url}" alt="SustainRepo Logo" style="width: 60px; height: 60px; border-radius: 8px; margin-bottom: 10px;">
                                <h1 style="color: #1f2937; margin: 10px 0 0 0; font-size: 24px; font-weight: 600;">SustainRepo</h1>
                                <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 14px;">Carbon Accounting Platform</p>
                            </td>
                        </tr>
                        <!-- Content -->
                        <tr>
                            <td style="padding: 40px 30px;">
                                <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 20px;">Password Reset Request</h2>
                                <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                                    Hello <strong style="color: #2eb67d;">{user.get('full_name', 'User')}</strong>,
                                </p>
                                <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 25px 0;">
                                    We received a request to reset your password. Click the button below to create a new password:
                                </p>
                                <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto 25px auto;">
                                    <tr>
                                        <td style="background-color: #2eb67d; border-radius: 8px;">
                                            <a href="{reset_link}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600;">Reset Password</a>
                                        </td>
                                    </tr>
                                </table>
                                <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 0 0 15px 0;">
                                    If the button doesn't work, copy and paste this link into your browser:
                                </p>
                                <p style="color: #2eb67d; font-size: 13px; word-break: break-all; margin: 0 0 25px 0;">
                                    {reset_link}
                                </p>
                                <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px;">
                                    <p style="color: #92400e; font-size: 13px; margin: 0;">
                                        <strong>Important:</strong> This link will expire in 24 hours. If you didn't request a password reset, please ignore this email.
                                    </p>
                                </div>
                            </td>
                        </tr>
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #f9fafb; padding: 20px 30px; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                                <p style="color: #6b7280; font-size: 12px; margin: 0; text-align: center;">
                                    &copy; 2026 SustainRepo. All rights reserved.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    await send_email(user["email"], "Reset Your SustainRepo Password", email_body)
    
    return {"message": "If the email exists, recovery instructions will be sent"}

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

@api_router.post("/auth/reset-password")
async def reset_password(reset_data: ResetPasswordRequest):
    """Reset password using token from email"""
    # Find the reset token
    reset_record = await db.password_resets.find_one({
        "id": reset_data.token,
        "used": False
    }, {"_id": 0})
    
    if not reset_record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    # Check if token has expired
    expires_at = datetime.fromisoformat(reset_record["expires_at"].replace('Z', '+00:00'))
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Reset token has expired")
    
    # Validate password strength
    if len(reset_data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
    if not any(c.isupper() for c in reset_data.new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter")
    if not any(c.islower() for c in reset_data.new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one lowercase letter")
    if not any(c.isdigit() for c in reset_data.new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one number")
    if not any(c in '!@#$%^&*()_+-=[]{}|;:,.<>?' for c in reset_data.new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)")
    
    # Update user's password
    new_hash = get_password_hash(reset_data.new_password)
    await db.users.update_one(
        {"id": reset_record["user_id"]},
        {"$set": {"password_hash": new_hash, "requires_password_change": False}}
    )
    
    # Mark token as used
    await db.password_resets.update_one(
        {"id": reset_data.token},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Password reset successfully. You can now login with your new password."}

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(**current_user)

@api_router.put("/auth/profile", response_model=UserResponse)
async def update_profile(profile_data: ProfileUpdate, current_user: dict = Depends(get_current_user)):
    """Update current user's profile (name)"""
    # Validate name
    if not profile_data.full_name or len(profile_data.full_name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Name must be at least 2 characters")
    
    # Update user in database
    update_dict = {
        "full_name": profile_data.full_name.strip(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.update_one({"id": current_user["id"]}, {"$set": update_dict})
    
    # Fetch and return updated user
    updated_user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    return UserResponse(**updated_user)

# Super Admin - Organization endpoints
@api_router.post("/super-admin/organizations", response_model=OrganizationResponse)
async def create_organization(org_data: OrganizationCreate, current_user: dict = Depends(get_super_admin_user)):
    # Subscription expiry is mandatory when creating organization
    if not org_data.subscription_expires_at:
        raise HTTPException(status_code=400, detail="Subscription expiry date is mandatory when creating an organization")
    
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
    
    # Only update provided fields, preserve existing data for unset fields
    update_dict = org_data.model_dump(exclude_unset=True)
    
    # Remove fields that shouldn't be overwritten during edit
    fields_to_preserve = ['id', 'is_active', 'is_deleted', 'industry_sectors', 'organizational_boundary']
    for field in fields_to_preserve:
        if field in update_dict and field in existing:
            # Keep the existing value unless explicitly provided
            update_dict.pop(field, None)
    
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

# Super Admin - Permanently delete organization and ALL related data (incl. R2 files)
@api_router.delete("/super-admin/organizations/{org_id}/permanent")
async def permanent_delete_organization(org_id: str, current_user: dict = Depends(get_super_admin_user)):
    from cascade_delete import cascade_delete_organization
    from r2_storage import get_r2_storage
    r2 = get_r2_storage()
    result = await cascade_delete_organization(db, r2, org_id)
    if not result.get("found"):
        raise HTTPException(status_code=404, detail="Organization not found")
    return {
        "message": f"Organization '{result.get('organization')}' and all related data permanently deleted",
        "deleted_counts": result["deleted_counts"],
    }

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

# Super Admin - Emissions distribution for a specific organization (scope-wise + facility-wise)
@api_router.get("/super-admin/organizations/{org_id}/emissions-distribution")
async def get_org_emissions_distribution(
    org_id: str,
    current_user: dict = Depends(get_super_admin_user),
):
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    facilities = await db.facilities.find({"organization_id": org_id}, {"_id": 0}).to_list(10000)
    facility_ids = [f["id"] for f in facilities]
    facility_map = {f["id"]: f for f in facilities}

    # Dynamic scopes — includes any user-defined scopes, ordered by display_order
    scopes = await db.scopes.find(
        {"is_active": {"$ne": False}}, {"_id": 0}
    ).sort("display_order", 1).to_list(1000)

    if not facility_ids:
        return {
            "organization": {"id": org["id"], "name": org.get("name")},
            "totals": {"total_co2e": 0, "record_count": 0},
            "by_scope": [{
                "scope_code": s["code"], "scope_name": s["name"],
                "total_co2e": 0, "record_count": 0,
            } for s in scopes],
            "by_facility": [],
        }

    emissions = await db.emission_records.find(
        {"facility_id": {"$in": facility_ids}}, {"_id": 0}
    ).to_list(100000)

    # Equity share adjustment (matches dashboard logic at lines 4344-4366)
    use_equity_share = org.get("org_boundaries_approach") == "equity_share"
    reported_data_type = org.get("equity_share_reported_data_type", "total_facility")
    facility_equity_map = {}
    if use_equity_share and reported_data_type == "total_facility":
        for f in facilities:
            eq = f.get("equity_share_percentage", 100.0)
            facility_equity_map[f["id"]] = (eq / 100.0) if eq is not None else 1.0

    def adjusted(rec):
        if use_equity_share and reported_data_type == "total_facility":
            factor = facility_equity_map.get(rec.get("facility_id"), 1.0)
            return (rec.get("total_emissions") or 0) * factor
        return rec.get("total_emissions") or 0

    # Aggregate by scope
    by_scope = []
    total_co2e = 0.0
    for s in scopes:
        scope_recs = [r for r in emissions if r.get("scope") == s["code"]]
        scope_total = sum(adjusted(r) for r in scope_recs)
        total_co2e += scope_total
        by_scope.append({
            "scope_code": s["code"],
            "scope_name": s["name"],
            "total_co2e": round(scope_total, 4),
            "record_count": len(scope_recs),
        })

    # Aggregate by facility with scope breakdown
    by_facility = []
    for f in facilities:
        f_recs = [r for r in emissions if r.get("facility_id") == f["id"]]
        f_total = sum(adjusted(r) for r in f_recs)
        scope_breakdown = {}
        for s in scopes:
            scope_breakdown[s["code"]] = round(
                sum(adjusted(r) for r in f_recs if r.get("scope") == s["code"]), 4
            )
        by_facility.append({
            "facility_id": f["id"],
            "facility_name": f.get("name"),
            "total_co2e": round(f_total, 4),
            "record_count": len(f_recs),
            "by_scope": scope_breakdown,
            "equity_share_percentage": round(
                facility_equity_map.get(f["id"], 1.0) * 100, 1
            ) if use_equity_share else 100.0,
        })
    by_facility.sort(key=lambda x: x["total_co2e"], reverse=True)

    return {
        "organization": {"id": org["id"], "name": org.get("name")},
        "totals": {
            "total_co2e": round(total_co2e, 4),
            "record_count": len(emissions),
        },
        "scopes_meta": [{"code": s["code"], "name": s["name"]} for s in scopes],
        "by_scope": by_scope,
        "by_facility": by_facility,
        "equity_share_applied": use_equity_share,
    }


# Super Admin - Admin management
@api_router.post("/super-admin/admins")
async def create_admin(
    email: EmailStr,
    full_name: str,
    organization_id: str,
    current_user: dict = Depends(get_super_admin_user)
):
    existing = await db.users.find_one({"email": email, "is_deleted": {"$ne": True}}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    org = await db.organizations.find_one({"id": organization_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Check max_admins limit
    max_admins = org.get("max_admins", 5)
    current_admin_count = await db.users.count_documents({
        "organization_id": organization_id,
        "role": "admin",
        "is_deleted": {"$ne": True}
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
    
    # Get frontend URL
    frontend_url = os.environ.get('FRONTEND_URL', 'https://sustainrepo-preview-1.preview.emergentagent.com')
    
    # Send welcome email with beautiful template
    email_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8f9fa; padding: 40px 20px;">
            <tr>
                <td align="center">
                    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                        <!-- Header -->
                        <tr>
                            <td style="background-color: #ffffff; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; border-bottom: 1px solid #e5e7eb;">
                                <img src="https://customer-assets.emergentagent.com/job_d67b5362-a184-47b7-81eb-abb9d39b89dd/artifacts/qllw2r8k_Logo_v3.png" alt="SustainRepo Logo" style="width: 60px; height: 60px; border-radius: 8px; margin-bottom: 10px;">
                                <h1 style="color: #1f2937; margin: 10px 0 0 0; font-size: 24px; font-weight: 600;">SustainRepo</h1>
                                <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 14px;">Carbon Accounting Platform</p>
                            </td>
                        </tr>
                        <!-- Content -->
                        <tr>
                            <td style="padding: 40px 30px;">
                                <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 20px;">Welcome to SustainRepo!</h2>
                                <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                                    Hello <strong style="color: #2eb67d;">{full_name}</strong>,
                                </p>
                                <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 25px 0;">
                                    You have been added as an <strong style="color: #1f2937;">Admin</strong> for <strong style="color: #2eb67d;">{org['name']}</strong>. Below are your login credentials:
                                </p>
                                <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                        <tr>
                                            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                                                <span style="color: #6b7280; font-size: 13px; display: block; margin-bottom: 4px;">Email</span>
                                                <strong style="color: #1f2937; font-size: 15px;">{email}</strong>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 10px 0;">
                                                <span style="color: #6b7280; font-size: 13px; display: block; margin-bottom: 4px;">Temporary Password</span>
                                                <div style="background-color: #ffffff; padding: 14px 20px; border-radius: 8px; border: 2px solid #2eb67d; display: inline-block;">
                                                    <code style="color: #000000; font-size: 20px; font-family: 'Courier New', Courier, monospace; letter-spacing: 3px; font-weight: bold;">{temp_password}</code>
                                                </div>
                                            </td>
                                        </tr>
                                    </table>
                                </div>
                                <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto 25px auto;">
                                    <tr>
                                        <td style="background-color: #2eb67d; border-radius: 8px;">
                                            <a href="{frontend_url}/login" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600;">Login to SustainRepo</a>
                                        </td>
                                    </tr>
                                </table>
                                <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px;">
                                    <p style="color: #92400e; font-size: 13px; margin: 0;">
                                        <strong>Important:</strong> Please change your password upon first login for security purposes.
                                    </p>
                                </div>
                            </td>
                        </tr>
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #f9fafb; padding: 20px 30px; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                                <p style="color: #6b7280; font-size: 12px; margin: 0; text-align: center;">
                                    &copy; 2026 SustainRepo. All rights reserved.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    await send_email(email, "Welcome to SustainRepo - Your Account is Ready!", email_body)
    
    # Don't return temp_password - it's sent via email only
    return {"message": "Admin created and email sent"}

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


# ============================================
# SCOPE 3 EMISSION FACTORS
# ============================================

@api_router.get("/super-admin/scope3-ef")
async def get_all_scope3_ef(
    current_user: dict = Depends(get_super_admin_user),
    page: int = 1,
    limit: int = 50,
    search: Optional[str] = None,
    category: Optional[str] = None,
    method: Optional[str] = None,
    region: Optional[str] = None,
    year: Optional[int] = None,
    source: Optional[str] = None,
    sub_scope: Optional[str] = None,
    subcategory: Optional[str] = None
):
    """Get paginated Scope 3 emission factors with optional filters"""
    # Build query
    query = {}
    
    if search:
        query["$or"] = [
            {"activity": {"$regex": search, "$options": "i"}},
            {"category": {"$regex": search, "$options": "i"}},
            {"source": {"$regex": search, "$options": "i"}}
        ]
    
    if category:
        query["category"] = {"$regex": category, "$options": "i"}
    
    if method:
        query["method"] = method
    
    if region:
        query["region"] = region
    
    if year:
        query["year_applicable"] = year
    
    if source:
        query["source"] = {"$regex": source, "$options": "i"}
    
    if sub_scope:
        query["sub_scope"] = sub_scope
    
    if subcategory:
        query["subcategory"] = subcategory
    
    # Get total count for pagination
    total = await db.scope3_ef.count_documents(query)
    
    # Calculate skip
    skip = (page - 1) * limit
    
    # Fetch paginated results
    factors = await db.scope3_ef.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    
    return {
        "data": [Scope3EFResponse(**f) for f in factors],
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit
    }

@api_router.post("/super-admin/scope3-ef", response_model=Scope3EFResponse)
async def create_scope3_ef(
    ef_data: Scope3EFCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Create a new Scope 3 emission factor entry"""
    # Validate emission_factor >= 0
    if ef_data.emission_factor < 0:
        raise HTTPException(status_code=400, detail="Emission factor must be greater than or equal to 0")
    
    # Normalize industry_sectors for storage (sort for consistent ordering)
    industry_sectors_sorted = sorted(ef_data.industry_sectors) if ef_data.industry_sectors else []
    
    # Check for duplicate by core identifying fields (excluding industry_sectors to avoid array ordering issues)
    existing = await db.scope3_ef.find_one({
        "category": ef_data.category,
        "method": ef_data.method,
        "activity": ef_data.activity,
        "region": ef_data.region or "Global",
        "year_applicable": ef_data.year_applicable,
        "source": ef_data.source
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail="A duplicate entry already exists with the same combination of category, method, activity, region, year, and source"
        )
    
    ef_dict = ef_data.model_dump()
    ef_dict["id"] = str(uuid.uuid4())
    ef_dict["created_by"] = current_user["id"]
    ef_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    ef_dict["region"] = ef_data.region or "Global"
    ef_dict["industry_sectors"] = industry_sectors_sorted
    
    await db.scope3_ef.insert_one(ef_dict)
    return Scope3EFResponse(**ef_dict)

@api_router.put("/super-admin/scope3-ef/{ef_id}", response_model=Scope3EFResponse)
async def update_scope3_ef(
    ef_id: str,
    ef_data: Scope3EFCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Update an existing Scope 3 emission factor entry"""
    existing = await db.scope3_ef.find_one({"id": ef_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Scope 3 EF entry not found")
    
    # Validate emission_factor >= 0
    if ef_data.emission_factor < 0:
        raise HTTPException(status_code=400, detail="Emission factor must be greater than or equal to 0")
    
    # Normalize industry_sectors for storage
    industry_sectors_sorted = sorted(ef_data.industry_sectors) if ef_data.industry_sectors else []
    
    # Check for duplicate (excluding current entry) - use simpler check without industry_sectors array comparison
    # Only check core identifying fields to avoid array ordering issues
    duplicate = await db.scope3_ef.find_one({
        "id": {"$ne": ef_id},
        "category": ef_data.category,
        "method": ef_data.method,
        "activity": ef_data.activity,
        "region": ef_data.region or "Global",
        "year_applicable": ef_data.year_applicable,
        "source": ef_data.source
    })
    if duplicate:
        raise HTTPException(
            status_code=400, 
            detail="A duplicate entry already exists with the same combination of category, method, activity, region, year, and source"
        )
    
    update_dict = ef_data.model_dump()
    update_dict["region"] = ef_data.region or "Global"
    update_dict["industry_sectors"] = industry_sectors_sorted
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.scope3_ef.update_one({"id": ef_id}, {"$set": update_dict})
    
    updated = await db.scope3_ef.find_one({"id": ef_id}, {"_id": 0})
    return Scope3EFResponse(**updated)

@api_router.delete("/super-admin/scope3-ef/{ef_id}")
async def delete_scope3_ef(ef_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Delete a Scope 3 emission factor entry"""
    result = await db.scope3_ef.delete_one({"id": ef_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Scope 3 EF entry not found")
    return {"message": "Scope 3 EF entry deleted successfully"}

@api_router.get("/scope3-ef")
async def get_scope3_ef_for_users(
    current_user: dict = Depends(get_current_user),
    page: int = 1,
    limit: int = 50,
    search: Optional[str] = None,
    category: Optional[str] = None,
    method: Optional[str] = None,
    region: Optional[str] = None,
    year: Optional[int] = None,
    sub_scope: Optional[str] = None,
    subcategory: Optional[str] = None
):
    """Get paginated Scope 3 emission factors (for Admin/User)"""
    # Build query
    query = {}
    
    if search:
        query["$or"] = [
            {"activity": {"$regex": search, "$options": "i"}},
            {"category": {"$regex": search, "$options": "i"}}
        ]
    
    if category:
        query["category"] = {"$regex": category, "$options": "i"}
    
    if method:
        query["method"] = method
    
    if region:
        query["region"] = region
    
    if year:
        query["year_applicable"] = year
    
    if sub_scope:
        query["sub_scope"] = sub_scope
    
    if subcategory:
        query["subcategory"] = subcategory
    
    # Get total count
    total = await db.scope3_ef.count_documents(query)
    
    # Calculate skip
    skip = (page - 1) * limit
    
    # Fetch paginated results
    factors = await db.scope3_ef.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    
    return {
        "data": [Scope3EFResponse(**f) for f in factors],
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit
    }

@api_router.get("/scope3-ef/categories-by-sub-scope")
async def get_categories_by_sub_scope(
    sub_scope: str,
    current_user: dict = Depends(get_current_user)
):
    """Get distinct categories that have entries with the specified sub_scope (e.g., 'biogenic')"""
    # Use aggregation to get distinct categories with the specified sub_scope
    pipeline = [
        {"$match": {"sub_scope": sub_scope, "is_active": {"$ne": False}}},
        {"$group": {"_id": "$category"}},
        {"$sort": {"_id": 1}}
    ]
    
    result = await db.scope3_ef.aggregate(pipeline).to_list(100)
    categories = [doc["_id"] for doc in result if doc["_id"]]
    
    return {
        "sub_scope": sub_scope,
        "categories": categories,
        "count": len(categories)
    }

# ============================================
# GWP (Global Warming Potential) CONFIGURATION
# ============================================

class GWPConfigCreate(BaseModel):
    source_name: str  # e.g., "IPCC AR6", "IPCC AR5", "Custom"
    source_year: Optional[int] = None  # e.g., 2021 for AR6
    time_horizon: str = "100-year"  # "20-year", "100-year", "500-year"
    co2_gwp: float = 1
    ch4_fossil_gwp: float  # CH4 from fossil sources
    ch4_non_fossil_gwp: float  # CH4 from non-fossil/biogenic sources
    n2o_gwp: float
    notes: Optional[str] = None
    is_active: bool = True

class GWPConfigUpdate(BaseModel):
    source_name: Optional[str] = None
    source_year: Optional[int] = None
    time_horizon: Optional[str] = None
    co2_gwp: Optional[float] = None
    ch4_fossil_gwp: Optional[float] = None  # CH4 from fossil sources
    ch4_non_fossil_gwp: Optional[float] = None  # CH4 from non-fossil/biogenic sources
    n2o_gwp: Optional[float] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

# Get active GWP configuration
@api_router.get("/gwp-config")
async def get_active_gwp_config():
    """Get the currently active GWP configuration"""
    config = await db.gwp_config.find_one({"is_active": True}, {"_id": 0})
    
    if not config:
        # Return AR6 defaults if no config exists
        return {
            "id": None,
            "source_name": GWP_DEFAULT_SOURCE,
            "source_year": 2021,
            "time_horizon": "100-year",
            "co2_gwp": GWP_VALUES["CO2"],
            "ch4_fossil_gwp": 29.8,  # AR6 100-year GWP for fossil CH4
            "ch4_non_fossil_gwp": 27.0,  # AR6 100-year GWP for non-fossil CH4
            "n2o_gwp": GWP_VALUES["N2O"],
            "notes": "Default IPCC AR6 values (100-year GWP)",
            "is_active": True,
            "is_default": True
        }
    
    config["is_default"] = False
    return config

# Get all GWP configurations (for history/reference)
@api_router.get("/super-admin/gwp-configs")
async def get_all_gwp_configs(current_user: dict = Depends(get_super_admin_user)):
    """Get all GWP configurations including historical ones"""
    configs = await db.gwp_config.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return configs

# Create new GWP configuration
@api_router.post("/super-admin/gwp-config")
async def create_gwp_config(config: GWPConfigCreate, current_user: dict = Depends(get_super_admin_user)):
    """Create a new GWP configuration (SuperAdmin only)"""
    
    # If this is set as active, deactivate all others
    if config.is_active:
        await db.gwp_config.update_many({}, {"$set": {"is_active": False}})
    
    new_config = {
        "id": str(uuid.uuid4()),
        "source_name": config.source_name,
        "source_year": config.source_year,
        "time_horizon": config.time_horizon,
        "co2_gwp": config.co2_gwp,
        "ch4_fossil_gwp": config.ch4_fossil_gwp,
        "ch4_non_fossil_gwp": config.ch4_non_fossil_gwp,
        "n2o_gwp": config.n2o_gwp,
        "notes": config.notes,
        "is_active": config.is_active,
        "created_by": current_user["id"],
        "created_by_email": current_user["email"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": None
    }
    
    await db.gwp_config.insert_one(new_config)
    if "_id" in new_config:
        del new_config["_id"]
    
    return {"message": "GWP configuration created successfully", "config": new_config}

# Update GWP configuration
@api_router.put("/super-admin/gwp-config/{config_id}")
async def update_gwp_config(config_id: str, config: GWPConfigUpdate, current_user: dict = Depends(get_super_admin_user)):
    """Update an existing GWP configuration (SuperAdmin only)"""
    
    existing = await db.gwp_config.find_one({"id": config_id})
    if not existing:
        raise HTTPException(status_code=404, detail="GWP configuration not found")
    
    update_data = {k: v for k, v in config.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = current_user["id"]
    update_data["updated_by_email"] = current_user["email"]
    
    # If setting this as active, deactivate all others
    if update_data.get("is_active"):
        await db.gwp_config.update_many({"id": {"$ne": config_id}}, {"$set": {"is_active": False}})
    
    await db.gwp_config.update_one({"id": config_id}, {"$set": update_data})
    
    updated = await db.gwp_config.find_one({"id": config_id}, {"_id": 0})
    return {"message": "GWP configuration updated successfully", "config": updated}

# Delete GWP configuration
@api_router.delete("/super-admin/gwp-config/{config_id}")
async def delete_gwp_config(config_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Delete a GWP configuration (SuperAdmin only). Cannot delete the active config."""
    
    existing = await db.gwp_config.find_one({"id": config_id})
    if not existing:
        raise HTTPException(status_code=404, detail="GWP configuration not found")
    
    if existing.get("is_active"):
        raise HTTPException(status_code=400, detail="Cannot delete the active GWP configuration. Set another as active first.")
    
    await db.gwp_config.delete_one({"id": config_id})
    return {"message": "GWP configuration deleted successfully"}

# Set a config as active
@api_router.post("/super-admin/gwp-config/{config_id}/activate")
async def activate_gwp_config(config_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Set a GWP configuration as the active one (SuperAdmin only)"""
    
    existing = await db.gwp_config.find_one({"id": config_id})
    if not existing:
        raise HTTPException(status_code=404, detail="GWP configuration not found")
    
    # Deactivate all others
    await db.gwp_config.update_many({}, {"$set": {"is_active": False}})
    
    # Activate this one
    await db.gwp_config.update_one(
        {"id": config_id}, 
        {"$set": {
            "is_active": True,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user["id"]
        }}
    )
    
    return {"message": "GWP configuration activated successfully"}

# Seed default GWP configurations (AR5 and AR6)
@api_router.post("/super-admin/seed-gwp-configs")
async def seed_gwp_configs(current_user: dict = Depends(get_super_admin_user)):
    """Seed default GWP configurations for AR5 and AR6 (SuperAdmin only)"""
    
    default_configs = [
        {
            "id": str(uuid.uuid4()),
            "source_name": "IPCC AR6",
            "source_year": 2021,
            "time_horizon": "100-year",
            "co2_gwp": 1,
            "ch4_fossil_gwp": 29.8,
            "ch4_non_fossil_gwp": 27.0,
            "n2o_gwp": 273,
            "notes": "IPCC Sixth Assessment Report (AR6, 2021) - 100-year Global Warming Potential values. CH4 fossil includes climate-carbon feedback.",
            "is_active": True,
            "created_by": current_user["id"],
            "created_by_email": current_user["email"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": None
        },
        {
            "id": str(uuid.uuid4()),
            "source_name": "IPCC AR5",
            "source_year": 2014,
            "time_horizon": "100-year",
            "co2_gwp": 1,
            "ch4_fossil_gwp": 30,
            "ch4_non_fossil_gwp": 28,
            "n2o_gwp": 265,
            "notes": "IPCC Fifth Assessment Report (AR5, 2014) - 100-year Global Warming Potential values. Legacy reference.",
            "is_active": False,
            "created_by": current_user["id"],
            "created_by_email": current_user["email"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": None
        }
    ]
    
    created_count = 0
    for config in default_configs:
        existing = await db.gwp_config.find_one({"source_name": config["source_name"], "time_horizon": config["time_horizon"]})
        if not existing:
            await db.gwp_config.insert_one(config)
            created_count += 1
    
    return {"message": f"Created {created_count} GWP configurations", "total": len(default_configs)}

# Legacy endpoint for backwards compatibility
@api_router.get("/gwp-values")
async def get_gwp_values():
    """Get GWP values (from active config or defaults) - Legacy endpoint"""
    config = await db.gwp_config.find_one({"is_active": True}, {"_id": 0})
    
    if config:
        return {
            "CO2": config.get("co2_gwp", 1),
            "CH4": config.get("ch4_gwp", GWP_VALUES["CH4"]),
            "N2O": config.get("n2o_gwp", GWP_VALUES["N2O"]),
            "source": config.get("source_name", "Custom"),
            "time_horizon": config.get("time_horizon", "100-year")
        }
    
    return {
        "CO2": GWP_VALUES["CO2"],
        "CH4": GWP_VALUES["CH4"],
        "N2O": GWP_VALUES["N2O"],
        "source": GWP_DEFAULT_SOURCE,
        "time_horizon": "100-year"
    }

# ============================================
# CURRENCY CONVERSION CONFIGURATION
# ============================================

class CurrencyConversionCreate(BaseModel):
    source_currency: str  # e.g., "USD", "EUR", "INR"
    target_currency: str = "USD"  # Default target is USD
    year_applicable: int  # Year for which this conversion is applicable
    purchase_parity: float  # PPP (Purchasing Power Parity) factor
    inflation_factor: Optional[float] = None  # Inflation adjustment factor
    exchange_rate: Optional[float] = None  # Optional: market exchange rate
    source: str  # e.g., "World Bank", "IMF", "OECD"
    notes: Optional[str] = None
    is_active: bool = True

class CurrencyConversionUpdate(BaseModel):
    source_currency: Optional[str] = None
    target_currency: Optional[str] = None
    year_applicable: Optional[int] = None
    purchase_parity: Optional[float] = None
    inflation_factor: Optional[float] = None
    exchange_rate: Optional[float] = None
    source: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

# Get active currency conversion config for a specific currency pair and year
@api_router.get("/currency-conversion")
async def get_currency_conversions(
    source_currency: Optional[str] = None,
    year: Optional[int] = None
):
    """Get currency conversion configurations, optionally filtered by currency and year"""
    query = {}
    if source_currency:
        query["source_currency"] = source_currency.upper()
    if year:
        query["year_applicable"] = year
    
    configs = await db.currency_conversion.find(query, {"_id": 0}).sort([("source_currency", 1), ("year_applicable", -1)]).to_list(500)
    return configs

# Get active currency conversion for a specific currency/year
@api_router.get("/currency-conversion/active")
async def get_active_currency_conversion(source_currency: str, year: Optional[int] = None):
    """Get the active currency conversion for a specific source currency"""
    query = {"source_currency": source_currency.upper(), "is_active": True}
    if year:
        query["year_applicable"] = year
    
    config = await db.currency_conversion.find_one(query, {"_id": 0})
    if not config:
        return {"message": "No active currency conversion found for this currency", "data": None}
    return config

# Get all currency conversions (SuperAdmin)
@api_router.get("/super-admin/currency-conversions")
async def get_all_currency_conversions(current_user: dict = Depends(get_super_admin_user)):
    """Get all currency conversion configurations (SuperAdmin only)"""
    configs = await db.currency_conversion.find({}, {"_id": 0}).sort([("source_currency", 1), ("year_applicable", -1)]).to_list(1000)
    return configs

# Create new currency conversion
@api_router.post("/super-admin/currency-conversion")
async def create_currency_conversion(config: CurrencyConversionCreate, current_user: dict = Depends(get_super_admin_user)):
    """Create a new currency conversion configuration (SuperAdmin only)"""
    
    # Check if a config already exists for this currency pair and year
    existing = await db.currency_conversion.find_one({
        "source_currency": config.source_currency.upper(),
        "target_currency": config.target_currency.upper(),
        "year_applicable": config.year_applicable
    })
    
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"Currency conversion for {config.source_currency}/{config.target_currency} for year {config.year_applicable} already exists"
        )
    
    new_config = {
        "id": str(uuid.uuid4()),
        "source_currency": config.source_currency.upper(),
        "target_currency": config.target_currency.upper(),
        "year_applicable": config.year_applicable,
        "purchase_parity": config.purchase_parity,
        "inflation_factor": config.inflation_factor,
        "exchange_rate": config.exchange_rate,
        "source": config.source,
        "notes": config.notes,
        "is_active": config.is_active,
        "created_by": current_user["id"],
        "created_by_email": current_user["email"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": None
    }
    
    await db.currency_conversion.insert_one(new_config)
    if "_id" in new_config:
        del new_config["_id"]
    
    return {"message": "Currency conversion configuration created successfully", "config": new_config}

# Update currency conversion
@api_router.put("/super-admin/currency-conversion/{config_id}")
async def update_currency_conversion(config_id: str, config: CurrencyConversionUpdate, current_user: dict = Depends(get_super_admin_user)):
    """Update an existing currency conversion configuration (SuperAdmin only)"""
    
    existing = await db.currency_conversion.find_one({"id": config_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Currency conversion configuration not found")
    
    update_data = {k: v for k, v in config.dict().items() if v is not None}
    
    # Convert currencies to uppercase if provided
    if "source_currency" in update_data:
        update_data["source_currency"] = update_data["source_currency"].upper()
    if "target_currency" in update_data:
        update_data["target_currency"] = update_data["target_currency"].upper()
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = current_user["id"]
    update_data["updated_by_email"] = current_user["email"]
    
    await db.currency_conversion.update_one({"id": config_id}, {"$set": update_data})
    
    updated = await db.currency_conversion.find_one({"id": config_id}, {"_id": 0})
    return {"message": "Currency conversion configuration updated successfully", "config": updated}

# Delete currency conversion
@api_router.delete("/super-admin/currency-conversion/{config_id}")
async def delete_currency_conversion(config_id: str, current_user: dict = Depends(get_super_admin_user)):
    """Delete a currency conversion configuration (SuperAdmin only)"""
    
    existing = await db.currency_conversion.find_one({"id": config_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Currency conversion configuration not found")
    
    await db.currency_conversion.delete_one({"id": config_id})
    return {"message": "Currency conversion configuration deleted successfully"}

# Bulk import currency conversions
@api_router.post("/super-admin/currency-conversion/bulk")
async def bulk_create_currency_conversions(
    configs: List[CurrencyConversionCreate], 
    current_user: dict = Depends(get_super_admin_user)
):
    """Bulk import currency conversion configurations (SuperAdmin only)"""
    created_count = 0
    updated_count = 0
    
    for config in configs:
        existing = await db.currency_conversion.find_one({
            "source_currency": config.source_currency.upper(),
            "target_currency": config.target_currency.upper(),
            "year_applicable": config.year_applicable
        })
        
        if existing:
            # Update existing
            update_data = {
                "purchase_parity": config.purchase_parity,
                "inflation_factor": config.inflation_factor,
                "exchange_rate": config.exchange_rate,
                "source": config.source,
                "notes": config.notes,
                "is_active": config.is_active,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": current_user["id"]
            }
            await db.currency_conversion.update_one({"id": existing["id"]}, {"$set": update_data})
            updated_count += 1
        else:
            # Create new
            new_config = {
                "id": str(uuid.uuid4()),
                "source_currency": config.source_currency.upper(),
                "target_currency": config.target_currency.upper(),
                "year_applicable": config.year_applicable,
                "purchase_parity": config.purchase_parity,
                "inflation_factor": config.inflation_factor,
                "exchange_rate": config.exchange_rate,
                "source": config.source,
                "notes": config.notes,
                "is_active": config.is_active,
                "created_by": current_user["id"],
                "created_by_email": current_user["email"],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": None
            }
            await db.currency_conversion.insert_one(new_config)
            created_count += 1
    
    return {"message": f"Bulk import complete: {created_count} created, {updated_count} updated"}

# Get distinct currencies available
@api_router.get("/currency-conversion/currencies")
async def get_available_currencies():
    """Get list of available source currencies"""
    currencies = await db.currency_conversion.distinct("source_currency")
    return sorted(currencies)

# Get distinct years available for a currency
@api_router.get("/currency-conversion/years/{source_currency}")
async def get_available_years(source_currency: str):
    """Get list of available years for a specific currency"""
    years = await db.currency_conversion.distinct("year_applicable", {"source_currency": source_currency.upper()})
    return sorted(years, reverse=True)


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
            "max_users": org.get("max_users", 20),
            "subscription_expires_at": org.get("subscription_expires_at"),
            "payment_status": org.get("payment_status"),
            "selected_plan": org.get("selected_plan"),
            "country": org.get("country"),
            "date_of_joining": org.get("date_of_joining"),
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
    
    existing = await db.organizations.find_one({"id": current_user["organization_id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Only update provided fields, preserve existing data for unset fields
    update_dict = org_data.model_dump(exclude_unset=True)
    
    # Remove fields that shouldn't be overwritten during edit by admin
    fields_to_preserve = ['id', 'is_active', 'is_deleted', 'max_facilities', 'max_admins', 'max_users', 'subscription_expires_at']
    for field in fields_to_preserve:
        update_dict.pop(field, None)
    
    await db.organizations.update_one(
        {"id": current_user["organization_id"]},
        {"$set": update_dict}
    )
    
    updated = await db.organizations.find_one({"id": current_user["organization_id"]}, {"_id": 0})
    
    # Audit log
    await audit_logger.log(
        action=AuditAction.UPDATE,
        module=AuditModule.ORGANIZATION,
        user_id=current_user["id"],
        user_email=current_user["email"],
        user_role=current_user.get("role", "admin"),
        organization_id=current_user["organization_id"],
        resource_id=current_user["organization_id"],
        resource_name=existing.get("name", "Organization"),
        description=f"Updated organization '{existing.get('name', 'Unknown')}'",
        old_values=existing,
        new_values=update_dict
    )
    
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
                detail=f"Maximum facility limit ({max_facilities}) reached for your organization. Contact your administrator."
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
    
    # Audit log
    await audit_logger.log(
        action=AuditAction.CREATE,
        module=AuditModule.FACILITY,
        user_id=current_user["id"],
        user_email=current_user["email"],
        user_role=current_user.get("role", "admin"),
        organization_id=org_id,
        resource_id=facility_dict["id"],
        resource_name=facility_data.name,
        description=f"Created facility '{facility_data.name}'",
        new_values=facility_dict
    )
    
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
    
    old_values = dict(facility)
    update_dict = facility_data.model_dump()
    await db.facilities.update_one({"id": facility_id}, {"$set": update_dict})
    
    updated = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    
    # Audit log
    await audit_logger.log(
        action=AuditAction.UPDATE,
        module=AuditModule.FACILITY,
        user_id=current_user["id"],
        user_email=current_user["email"],
        user_role=current_user.get("role", "user"),
        organization_id=facility.get("organization_id"),
        resource_id=facility_id,
        resource_name=facility_data.name,
        description=f"Updated facility '{facility_data.name}'",
        old_values=old_values,
        new_values=update_dict
    )
    
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
    
    from cascade_delete import cascade_delete_facility
    from r2_storage import get_r2_storage
    r2 = get_r2_storage()
    result = await cascade_delete_facility(db, r2, facility_id)
    if not result.get("found"):
        raise HTTPException(status_code=404, detail="Facility not found")
    
    return {
        "message": f"Facility '{result.get('facility')}' and all related data deleted successfully",
        "deleted_counts": result["deleted_counts"],
    }

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
            {"id": "default-3", "name": "Energy", "description": "Energy production and distribution", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-4", "name": "Agriculture", "description": "Agricultural operations", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-5", "name": "Construction", "description": "Construction and real estate", "created_at": datetime.now(timezone.utc).isoformat()}
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
            {"id": "default-3", "name": "Energy", "description": "Energy production and distribution", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-4", "name": "Agriculture", "description": "Agricultural operations", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "default-5", "name": "Construction", "description": "Construction and real estate", "created_at": datetime.now(timezone.utc).isoformat()}
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
        {"id": "default-3", "name": "Energy", "description": "Energy production and distribution"},
        {"id": "default-4", "name": "Agriculture", "description": "Agricultural operations"},
        {"id": "default-5", "name": "Construction", "description": "Construction and real estate"}
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


# Process Template CRUD endpoints
@api_router.get("/super-admin/process-templates", response_model=List[ProcessTemplateResponse])
async def get_process_templates(current_user: dict = Depends(get_super_admin_user)):
    templates = await db.process_templates.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [ProcessTemplateResponse(**t) for t in templates]

@api_router.post("/super-admin/process-templates", response_model=ProcessTemplateResponse)
async def create_process_template(data: ProcessTemplateCreate, current_user: dict = Depends(get_super_admin_user)):
    template_dict = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "description": data.description,
        "sub_industry": data.sub_industry,
        "formula": data.formula,
        "input_fields": data.input_fields,
        "predefined_inputs": data.predefined_inputs,
        "is_active": data.is_active,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": None
    }
    await db.process_templates.insert_one(template_dict)
    return ProcessTemplateResponse(**template_dict)

@api_router.put("/super-admin/process-templates/{template_id}", response_model=ProcessTemplateResponse)
async def update_process_template(template_id: str, data: ProcessTemplateCreate, current_user: dict = Depends(get_super_admin_user)):
    existing = await db.process_templates.find_one({"id": template_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Process template not found")
    
    update_dict = {
        "name": data.name,
        "description": data.description,
        "sub_industry": data.sub_industry,
        "formula": data.formula,
        "input_fields": data.input_fields,
        "predefined_inputs": data.predefined_inputs,
        "is_active": data.is_active,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.process_templates.update_one({"id": template_id}, {"$set": update_dict})
    updated = await db.process_templates.find_one({"id": template_id}, {"_id": 0})
    return ProcessTemplateResponse(**updated)

@api_router.delete("/super-admin/process-templates/{template_id}")
async def delete_process_template(template_id: str, current_user: dict = Depends(get_super_admin_user)):
    result = await db.process_templates.delete_one({"id": template_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Process template not found")
    return {"message": "Process template deleted successfully"}

# Public endpoint for admins/users to fetch active templates
@api_router.get("/process-templates", response_model=List[ProcessTemplateResponse])
async def get_active_process_templates(current_user: dict = Depends(get_current_user)):
    templates = await db.process_templates.find({"is_active": True}, {"_id": 0}).sort("name", 1).to_list(1000)
    return [ProcessTemplateResponse(**t) for t in templates]


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
    
    # Validate frequency_type
    frequency_type = record_data.frequency_type or "monthly"
    if frequency_type not in ["monthly", "yearly"]:
        raise HTTPException(status_code=400, detail="frequency_type must be 'monthly' or 'yearly'")
    
    # Validate reporting_period format based on frequency_type
    reporting_period = record_data.reporting_period
    if frequency_type == "yearly":
        # Yearly format: "CY2025" or "FY 2025-2026"
        if not (reporting_period.startswith("CY") or reporting_period.startswith("FY ")):
            raise HTTPException(
                status_code=400, 
                detail="For yearly frequency, reporting_period must be in format 'CY2025' or 'FY 2025-2026'"
            )
        
        # Check for duplicate yearly record (same scope/category/subcategory/year)
        duplicate_query = {
            "facility_id": record_data.facility_id,
            "scope": record_data.scope,
            "category": record_data.category,
            "sub_category": record_data.sub_category,
            "reporting_period": reporting_period,
            "frequency_type": "yearly"
        }
        existing_yearly = await db.emission_records.find_one(duplicate_query, {"_id": 0, "id": 1})
        if existing_yearly:
            raise HTTPException(
                status_code=400,
                detail=f"A yearly record already exists for {record_data.category}/{record_data.sub_category} in {reporting_period}. Edit the existing record instead."
            )
    else:
        # Monthly format: "2025-03"
        import re
        if not re.match(r'^\d{4}-\d{2}$', reporting_period):
            raise HTTPException(
                status_code=400,
                detail="For monthly frequency, reporting_period must be in format 'YYYY-MM' (e.g., '2025-03')"
            )
    
    # Check organization's enabled_access for emissions
    organization = await db.organizations.find_one({"id": facility["organization_id"]}, {"_id": 0})
    if organization:
        enabled_access = organization.get("enabled_access")
        # If enabled_access is None, default to scope1_2. If it's an empty list, no access.
        if enabled_access is None:
            enabled_access = ["scope1_2"]
        # Check if organization has access to create emissions (scope1_2 or scope1_2_3 allows Scope 1, 2, biogenic)
        has_emission_access = any(access in enabled_access for access in ["scope1_2", "scope1_2_3"])
        if not has_emission_access:
            raise HTTPException(
                status_code=403, 
                detail="Your organization does not have access to add emissions. Please contact your administrator."
            )
    
    record_dict = record_data.model_dump()
    record_id = str(uuid.uuid4())
    record_dict["id"] = record_id
    record_dict["created_by"] = current_user["id"]
    record_dict["created_by_email"] = current_user.get("email", "")
    record_dict["created_by_name"] = current_user.get("full_name", "")
    
    # For Scope 3 emissions: sync sub_category with scope3_activity
    if record_data.scope and 'scope3' in record_data.scope.lower():
        # Check if scope3_activity is provided (either directly or in dynamic_field_values)
        scope3_activity = record_data.scope3_activity
        if not scope3_activity and record_data.dynamic_field_values:
            scope3_act_field = record_data.dynamic_field_values.get('scope3_activity', {})
            if isinstance(scope3_act_field, dict):
                scope3_activity = scope3_act_field.get('value')
        
        # Update sub_category to match scope3_activity if activity is set
        if scope3_activity:
            record_dict["sub_category"] = scope3_activity
    
    # ALWAYS ensure organization_id is set (from facility if not provided)
    if not record_dict.get("organization_id"):
        facility = await db.facilities.find_one({"id": record_data.facility_id}, {"_id": 0, "organization_id": 1})
        if facility and facility.get("organization_id"):
            record_dict["organization_id"] = facility["organization_id"]
        else:
            record_dict["organization_id"] = current_user.get("organization_id")
    
    # Extract emission values from outputs dict for convenience accessors
    outputs = record_data.outputs or {}
    record_dict["co2_emissions"] = outputs.get("co2", {}).get("value", 0) or 0
    record_dict["ch4_emissions"] = outputs.get("ch4", {}).get("value", 0) or 0
    record_dict["n2o_emissions"] = outputs.get("n2o", {}).get("value", 0) or 0
    record_dict["co2e_emissions"] = outputs.get("co2e", {}).get("value", 0) or 0
    record_dict["total_emissions"] = record_dict["co2e_emissions"]
    
    created_at = datetime.now(timezone.utc).isoformat()
    record_dict["created_at"] = created_at
    record_dict["updated_at"] = None
    record_dict["updated_by"] = None
    record_dict["updated_by_email"] = None
    record_dict["updated_by_name"] = None
    
    await db.emission_records.insert_one(record_dict)
    
    # Create initial version history entry for creation
    # Include both input data and calculated emission values for proper history display
    history_new_values = record_data.model_dump()
    # Add the calculated/stored emission fields that the frontend expects in history
    history_new_values["co2_emissions"] = record_dict["co2_emissions"]
    history_new_values["ch4_emissions"] = record_dict["ch4_emissions"]
    history_new_values["n2o_emissions"] = record_dict["n2o_emissions"]
    history_new_values["co2e_emissions"] = record_dict["co2e_emissions"]
    history_new_values["total_emissions"] = record_dict["total_emissions"]
    
    creation_history = {
        "id": str(uuid.uuid4()),
        "emission_id": record_id,
        "facility_id": record_data.facility_id,
        "organization_id": record_dict["organization_id"],
        "changed_by": current_user["id"],
        "changed_by_email": current_user.get("email", ""),
        "changed_by_name": current_user.get("full_name", ""),
        "changed_at": created_at,
        "changes": {
            "action": "created",
            "old_values": None,
            "new_values": history_new_values
        }
    }
    await db.emission_history.insert_one(creation_history)
    
    # Audit log
    await audit_logger.log(
        action=AuditAction.CREATE,
        module=AuditModule.EMISSION,
        user_id=current_user["id"],
        user_email=current_user["email"],
        user_role=current_user.get("role", "user"),
        organization_id=record_dict["organization_id"],
        resource_id=record_id,
        resource_name=f"{record_data.scope} - {record_data.category} ({record_data.reporting_period})",
        description=f"Created emission record for {record_data.category}",
        new_values=record_dict,
        metadata={
            "scope": record_data.scope,
            "category": record_data.category,
            "facility_id": record_data.facility_id,
            "total_emissions": record_dict["total_emissions"]
        }
    )
    
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
    
    # Collect all unique user IDs for batch lookup
    user_ids = set()
    for r in records:
        if r.get("created_by"):
            user_ids.add(r["created_by"])
        if r.get("updated_by"):
            user_ids.add(r["updated_by"])
    
    # Fetch user names in batch
    user_map = {}
    if user_ids:
        users = await db.users.find({"id": {"$in": list(user_ids)}}, {"_id": 0, "id": 1, "full_name": 1, "email": 1}).to_list(1000)
        user_map = {u["id"]: u for u in users}
    
    # Populate names for records that don't have them
    for r in records:
        if r.get("created_by") and not r.get("created_by_name"):
            user = user_map.get(r["created_by"])
            if user:
                r["created_by_name"] = user.get("full_name", "")
                if not r.get("created_by_email"):
                    r["created_by_email"] = user.get("email", "")
        if r.get("updated_by") and not r.get("updated_by_name"):
            user = user_map.get(r["updated_by"])
            if user:
                r["updated_by_name"] = user.get("full_name", "")
                if not r.get("updated_by_email"):
                    r["updated_by_email"] = user.get("email", "")
    
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
    
    # Prevent changing frequency_type once saved
    existing_frequency = existing.get("frequency_type", "monthly")
    new_frequency = record_data.frequency_type or "monthly"
    if existing_frequency != new_frequency:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot change frequency_type from '{existing_frequency}' to '{new_frequency}'. Delete and recreate the record if needed."
        )
    
    update_dict = record_data.model_dump()
    # Ensure frequency_type is preserved
    update_dict["frequency_type"] = existing_frequency
    
    # For Scope 3 emissions: sync sub_category with scope3_activity when activity changes
    if record_data.scope and 'scope3' in record_data.scope.lower():
        # Check if scope3_activity is provided (either directly or in dynamic_field_values)
        scope3_activity = record_data.scope3_activity
        if not scope3_activity and record_data.dynamic_field_values:
            scope3_act_field = record_data.dynamic_field_values.get('scope3_activity', {})
            if isinstance(scope3_act_field, dict):
                scope3_activity = scope3_act_field.get('value')
        
        # Update sub_category to match scope3_activity if activity is set
        if scope3_activity:
            update_dict["sub_category"] = scope3_activity
    
    # Extract emission values from outputs dict for convenience accessors
    outputs = record_data.outputs or {}
    update_dict["co2_emissions"] = outputs.get("co2", {}).get("value", 0) or 0
    update_dict["ch4_emissions"] = outputs.get("ch4", {}).get("value", 0) or 0
    update_dict["n2o_emissions"] = outputs.get("n2o", {}).get("value", 0) or 0
    update_dict["co2e_emissions"] = outputs.get("co2e", {}).get("value", 0) or 0
    update_dict["total_emissions"] = update_dict["co2e_emissions"]
    
    # Prepare new_values for history with proper emission field names
    history_new_values = record_data.model_dump()
    history_new_values["co2_emissions"] = update_dict["co2_emissions"]
    history_new_values["ch4_emissions"] = update_dict["ch4_emissions"]
    history_new_values["n2o_emissions"] = update_dict["n2o_emissions"]
    history_new_values["co2e_emissions"] = update_dict["co2e_emissions"]
    history_new_values["total_emissions"] = update_dict["total_emissions"]
    
    # Compute field-level changes for better tracking (#3 - Version History)
    field_changes = compute_field_changes(existing, history_new_values)
    
    # Save version history entry for this update with detailed field changes
    history_dict = {
        "id": str(uuid.uuid4()),
        "emission_id": record_id,
        "facility_id": existing.get("facility_id"),
        "organization_id": existing.get("organization_id"),
        "scope": existing.get("scope"),
        "category": existing.get("category"),
        "changed_by": current_user["id"],
        "changed_by_email": current_user.get("email", ""),
        "changed_by_name": current_user.get("full_name", ""),
        "changed_at": datetime.now(timezone.utc).isoformat(),
        "version": existing.get("version", 0) + 1,
        "field_changes": field_changes,  # New: detailed field-level changes
        "changes_summary": f"{len(field_changes)} field(s) changed",
        "changes": {
            "action": "updated",
            "old_values": existing,
            "new_values": history_new_values
        }
    }
    await db.emission_history.insert_one(history_dict)
    
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_dict["updated_by"] = current_user["id"]
    update_dict["updated_by_email"] = current_user.get("email", "")
    update_dict["updated_by_name"] = current_user.get("full_name", "")
    update_dict["version"] = existing.get("version", 0) + 1  # Increment version
    
    await db.emission_records.update_one({"id": record_id}, {"$set": update_dict})
    updated = await db.emission_records.find_one({"id": record_id}, {"_id": 0})
    
    # Audit log
    await audit_logger.log(
        action=AuditAction.UPDATE,
        module=AuditModule.EMISSION,
        user_id=current_user["id"],
        user_email=current_user["email"],
        user_role=current_user.get("role", "user"),
        organization_id=existing.get("organization_id"),
        resource_id=record_id,
        resource_name=f"{record_data.scope} - {record_data.category} ({record_data.reporting_period})",
        description=f"Updated emission record for {record_data.category}",
        old_values=existing,
        new_values=update_dict,
        metadata={
            "scope": record_data.scope,
            "category": record_data.category,
            "facility_id": record_data.facility_id,
            "total_emissions": update_dict["total_emissions"]
        }
    )
    
    return EmissionRecordResponse(**updated)

@api_router.get("/emissions/{record_id}/history", response_model=List[EmissionHistoryResponse])
async def get_emission_history(record_id: str, current_user: dict = Depends(get_current_user)):
    # Sort by changed_at ascending so creation entry appears first
    history = await db.emission_history.find(
        {"emission_id": record_id}, 
        {"_id": 0}
    ).sort("changed_at", 1).to_list(1000)
    
    # Populate changed_by_email and changed_by_name for each history entry
    for entry in history:
        if entry.get("changed_by"):
            user = await db.users.find_one({"id": entry["changed_by"]}, {"_id": 0, "email": 1, "full_name": 1})
            if user:
                entry["changed_by_email"] = user.get("email", "Unknown User")
                entry["changed_by_name"] = user.get("full_name", "")
            else:
                entry["changed_by_email"] = "Unknown User"
                entry["changed_by_name"] = ""
        else:
            entry["changed_by_email"] = "Unknown User"
            entry["changed_by_name"] = ""
    
    return [EmissionHistoryResponse(**h) for h in history]

@api_router.delete("/emissions/{record_id}")
async def delete_emission_record(record_id: str, current_user: dict = Depends(get_current_user)):
    # Get existing record before deletion for audit
    existing = await db.emission_records.find_one({"id": record_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Emission record not found")
    
    result = await db.emission_records.delete_one({"id": record_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Emission record not found")
    
    # Audit log
    await audit_logger.log(
        action=AuditAction.DELETE,
        module=AuditModule.EMISSION,
        user_id=current_user["id"],
        user_email=current_user["email"],
        user_role=current_user.get("role", "user"),
        organization_id=existing.get("organization_id"),
        resource_id=record_id,
        resource_name=f"{existing.get('scope', '')} - {existing.get('category', '')} ({existing.get('reporting_period', '')})",
        description=f"Deleted emission record for {existing.get('category', 'Unknown')}",
        old_values=existing,
        metadata={
            "scope": existing.get("scope"),
            "category": existing.get("category"),
            "total_emissions": existing.get("total_emissions")
        }
    )
    
    return {"message": "Emission record deleted successfully"}

# Sinks (Carbon Removal) endpoints
@api_router.post("/sinks", response_model=SinkResponse)
async def create_sink(sink_data: SinkCreate, current_user: dict = Depends(get_current_user)):
    # Verify facility access
    facility = await db.facilities.find_one({"id": sink_data.facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    # Check access
    if current_user["role"] == "user":
        if sink_data.facility_id not in current_user.get("assigned_facilities", []):
            raise HTTPException(status_code=403, detail="Not authorized for this facility")
    elif current_user["role"] == "admin":
        if facility.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Not authorized for this facility")
    
    # Check organization's enabled_access for sinks
    organization = await db.organizations.find_one({"id": facility.get("organization_id")}, {"_id": 0})
    if organization:
        enabled_access = organization.get("enabled_access")
        # If enabled_access is None, default to scope1_2. If it's an empty list, no access.
        if enabled_access is None:
            enabled_access = ["scope1_2"]
        # Check if organization has access to create sinks (scope1_2 or scope1_2_3 allows sinks)
        has_sink_access = any(access in enabled_access for access in ["scope1_2", "scope1_2_3"])
        if not has_sink_access:
            raise HTTPException(
                status_code=403, 
                detail="Your organization does not have access to add carbon sinks. Please contact your administrator."
            )
    
    sink_dict = {
        "id": str(uuid.uuid4()),
        "facility_id": sink_data.facility_id,
        "organization_id": facility.get("organization_id"),
        "reporting_year": sink_data.reporting_year,
        "reporting_month": sink_data.reporting_month,
        "total_emissions_reduced": sink_data.total_emissions_reduced,
        "description": sink_data.description,
        "evidence_urls": sink_data.evidence_urls or [],
        "evidence_files": sink_data.evidence_files or [],
        "start_date": sink_data.start_date,
        "end_date": sink_data.end_date,
        "monthly_data": sink_data.monthly_data,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": None
    }
    
    await db.sinks.insert_one(sink_dict)
    return SinkResponse(**sink_dict)

@api_router.get("/sinks", response_model=List[SinkResponse])
async def get_sinks(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "super_admin":
        sinks = await db.sinks.find({}, {"_id": 0}).to_list(10000)
    elif current_user["role"] == "admin":
        org_id = current_user.get("organization_id")
        sinks = await db.sinks.find({"organization_id": org_id}, {"_id": 0}).to_list(10000)
    else:
        facility_ids = current_user.get("assigned_facilities", [])
        sinks = await db.sinks.find({"facility_id": {"$in": facility_ids}}, {"_id": 0}).to_list(10000)
    
    return [SinkResponse(**s) for s in sinks]

@api_router.get("/sinks/{sink_id}", response_model=SinkResponse)
async def get_sink(sink_id: str, current_user: dict = Depends(get_current_user)):
    sink = await db.sinks.find_one({"id": sink_id}, {"_id": 0})
    if not sink:
        raise HTTPException(status_code=404, detail="Sink record not found")
    return SinkResponse(**sink)

@api_router.put("/sinks/{sink_id}", response_model=SinkResponse)
async def update_sink(sink_id: str, sink_data: SinkCreate, current_user: dict = Depends(get_current_user)):
    existing = await db.sinks.find_one({"id": sink_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Sink record not found")
    
    update_dict = {
        "facility_id": sink_data.facility_id,
        "reporting_year": sink_data.reporting_year,
        "reporting_month": sink_data.reporting_month,
        "total_emissions_reduced": sink_data.total_emissions_reduced,
        "description": sink_data.description,
        "evidence_urls": sink_data.evidence_urls or [],
        "evidence_files": sink_data.evidence_files or [],
        "start_date": sink_data.start_date,
        "end_date": sink_data.end_date,
        "monthly_data": sink_data.monthly_data,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.sinks.update_one({"id": sink_id}, {"$set": update_dict})
    updated = await db.sinks.find_one({"id": sink_id}, {"_id": 0})
    return SinkResponse(**updated)

@api_router.delete("/sinks/{sink_id}")
async def delete_sink(sink_id: str, current_user: dict = Depends(get_current_user)):
    # First, get the sink to find associated files
    sink = await db.sinks.find_one({"id": sink_id}, {"_id": 0})
    if not sink:
        raise HTTPException(status_code=404, detail="Sink record not found")
    
    # Delete associated files from R2 storage
    evidence_files = sink.get("evidence_files", [])
    if evidence_files:
        try:
            r2 = get_r2_storage()
            for file_info in evidence_files:
                file_id = file_info.get("file_id")
                if file_id:
                    # Get file record to find R2 key
                    file_record = await db.uploaded_files.find_one({"id": file_id}, {"_id": 0})
                    if file_record and file_record.get("r2_key"):
                        # Delete from R2
                        try:
                            await r2.delete_file(
                                bucket_type=file_record.get("bucket_type", "evidence"),
                                key=file_record["r2_key"]
                            )
                        except Exception as e:
                            logging.warning(f"Failed to delete R2 file {file_record['r2_key']}: {e}")
                        
                        # Delete file record from database
                        await db.uploaded_files.delete_one({"id": file_id})
        except Exception as e:
            logging.error(f"Error cleaning up sink files: {e}")
    
    # Delete the sink record
    result = await db.sinks.delete_one({"id": sink_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sink record not found")
    return {"message": "Sink record and associated files deleted successfully"}

# ===== Base Year Emissions Endpoints =====

@api_router.get("/base-year-emissions/oldest-year/{entity_type}/{entity_id}")
async def get_oldest_reporting_year(
    entity_type: str,  # "organization" or "facility"
    entity_id: str,
    current_user: dict = Depends(get_current_user),
    scope_group: Optional[str] = None  # "scope12" or "scope3" - Phase 2 scope filtering
):
    """Get the oldest reporting year with emissions data for an entity, optionally filtered by scope group"""
    if entity_type == "facility":
        query = {"facility_id": entity_id}
    else:  # organization
        # Get all facilities for this org
        facilities = await db.facilities.find(
            {"organization_id": entity_id, "is_active": True}, 
            {"_id": 0, "id": 1}
        ).to_list(1000)
        facility_ids = [f["id"] for f in facilities]
        query = {"facility_id": {"$in": facility_ids}}
    
    # Phase 2: Add scope filter if specified
    if scope_group:
        if scope_group == "scope12":
            # Scope 1&2 includes: scope1, scope2, and biogenic emissions that are NOT scope3-tagged
            query["$or"] = [
                {"scope": {"$in": ["scope1", "scope2"]}},
                {"scope": "biogenic", "biogenic_scope_selection": {"$in": [None, "scope1"]}}
            ]
        elif scope_group == "scope3":
            # Scope 3 includes: scope3 and biogenic emissions tagged as scope3
            query["$or"] = [
                {"scope": "scope3"},
                {"scope": "biogenic", "biogenic_scope_selection": "scope3"}
            ]
    
    # Find oldest emission record - check emission_records collection
    emissions = await db.emission_records.find(query, {"_id": 0, "reporting_period": 1}).to_list(10000)
    
    if not emissions:
        return {"has_emissions": False, "oldest_year": None, "message": "No emissions data found"}
    
    # Get organization's reporting year type first (needed for year calculation)
    if entity_type == "facility":
        facility = await db.facilities.find_one({"id": entity_id}, {"_id": 0, "organization_id": 1})
        org_id = facility.get("organization_id") if facility else None
    else:
        org_id = entity_id
    
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "reporting_year_type": 1})
    reporting_year_type = org.get("reporting_year_type", "calendar_year") if org else "calendar_year"
    is_financial_year = reporting_year_type == "financial_year"
    
    # Helper to get fiscal year from a period
    def get_fiscal_year_from_period(period, is_fy):
        """
        Get the fiscal/calendar year for a reporting period.
        For financial year: April-March cycle
        - April 2025 to March 2026 = FY 2025-2026 -> returns 2025
        - January 2026 (month 1) is in FY 2025-2026 -> returns 2025
        """
        import re
        from calendar import month_name
        
        month = None
        year = None
        
        # Try format: "January 2024"
        for i, m in enumerate(month_name):
            if m and m.lower() in period.lower():
                year_match = re.search(r'20\d{2}', period)
                if year_match:
                    month = i
                    year = int(year_match.group())
                    break
        
        # Try format: "2024-01" or "2024-1"
        if month is None:
            match = re.match(r'(\d{4})-(\d{1,2})', period)
            if match:
                year = int(match.group(1))
                month = int(match.group(2))
        
        if year is None:
            return None
        
        if is_fy and month is not None:
            # For financial year: months 1-3 (Jan-Mar) belong to the previous FY
            # FY starts in April (month 4), so Jan 2026 = FY 2025-2026
            if month >= 1 and month <= 3:
                return year - 1  # Jan-Mar 2026 -> FY 2025
            else:
                return year  # Apr-Dec 2025 -> FY 2025
        else:
            return year
    
    # Parse reporting periods and find the oldest fiscal/calendar year
    fiscal_years = set()
    for em in emissions:
        period = em.get("reporting_period", "")
        fy = get_fiscal_year_from_period(period, is_financial_year)
        if fy:
            fiscal_years.add(fy)
    
    if not fiscal_years:
        return {"has_emissions": False, "oldest_year": None, "message": "Could not determine year from emissions"}
    
    oldest_year = min(fiscal_years)
    
    # Format the year based on type
    if is_financial_year:
        oldest_year_formatted = f"FY {oldest_year}-{oldest_year + 1}"
    else:
        oldest_year_formatted = str(oldest_year)
    
    return {
        "has_emissions": True,
        "oldest_year": oldest_year,
        "oldest_year_formatted": oldest_year_formatted,
        "reporting_year_type": reporting_year_type
    }


@api_router.get("/base-year-emissions/emission-combinations/{entity_type}/{entity_id}")
async def get_emission_combinations(
    entity_type: str,  # "organization" or "facility"
    entity_id: str,
    current_user: dict = Depends(get_current_user),
    year: Optional[int] = None,  # Optional year filter to get actual emissions
    year_type: Optional[str] = None,  # "financial_year" or "calendar_year"
    scope_group: Optional[str] = None  # Phase 2: "scope12" or "scope3" for filtering
):
    """Get unique Scope + Category + Subcategory combinations from emissions data with optional year aggregation"""
    import re
    from calendar import month_name
    
    if entity_type == "facility":
        query = {"facility_id": entity_id}
        # Get org's reporting year type
        facility = await db.facilities.find_one({"id": entity_id}, {"_id": 0, "organization_id": 1})
        org_id = facility.get("organization_id") if facility else None
    else:  # organization - aggregate from all facilities
        org_id = entity_id
        facilities = await db.facilities.find(
            {"organization_id": entity_id, "is_active": True}, 
            {"_id": 0, "id": 1}
        ).to_list(1000)
        facility_ids = [f["id"] for f in facilities]
        query = {"facility_id": {"$in": facility_ids}}
    
    # Phase 2: Add scope filter if specified
    if scope_group:
        if scope_group == "scope12":
            # Scope 1&2 includes: scope1, scope2, and biogenic emissions that are NOT scope3-tagged
            query["$or"] = [
                {"scope": {"$in": ["scope1", "scope2"]}},
                {"scope": "biogenic", "biogenic_scope_selection": {"$in": [None, "scope1"]}}
            ]
        elif scope_group == "scope3":
            # Scope 3 includes: scope3 and biogenic emissions tagged as scope3
            query["$or"] = [
                {"scope": "scope3"},
                {"scope": "biogenic", "biogenic_scope_selection": "scope3"}
            ]
    
    # Get organization's reporting year type if not provided
    if not year_type and org_id:
        org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "reporting_year_type": 1})
        year_type = org.get("reporting_year_type", "calendar_year") if org else "calendar_year"
    
    # Use emission_records collection - get more fields for aggregation
    emissions = await db.emission_records.find(
        query, 
        {"_id": 0, "scope": 1, "category": 1, "sub_category": 1, "reporting_period": 1, "co2e_emissions": 1, "calculated_co2e": 1}
    ).to_list(10000)
    
    # Helper function to parse reporting period and get month/year
    def parse_period(period):
        """Parse reporting period like 'January 2024' or '2024-01' and return (month_num, year)"""
        # Try format: "January 2024"
        for i, m in enumerate(month_name):
            if m and m.lower() in period.lower():
                year_match = re.search(r'20\d{2}', period)
                if year_match:
                    return (i, int(year_match.group()))
        # Try format: "2024-01" or "2024-1"
        match = re.match(r'(\d{4})-(\d{1,2})', period)
        if match:
            return (int(match.group(2)), int(match.group(1)))
        return (None, None)
    
    # Helper to check if a period is within the year range
    def is_in_year_range(period, target_year, is_financial_year):
        month, year = parse_period(period)
        if month is None or year is None:
            return False
        
        if is_financial_year:
            # Financial year: April (4) of target_year to March (3) of target_year+1
            # FY 2024-2025 = April 2024 to March 2025
            if month >= 4 and year == target_year:
                return True
            if month <= 3 and year == target_year + 1:
                return True
            return False
        else:
            # Calendar year: January (1) to December (12) of target_year
            return year == target_year
    
    # If year is specified, filter and aggregate emissions by year
    if year:
        is_financial = year_type == "financial_year"
        
        # Filter emissions for the specified year range
        year_emissions = []
        for em in emissions:
            period = em.get("reporting_period", "")
            if is_in_year_range(period, year, is_financial):
                year_emissions.append(em)
        
        # Aggregate tCO2e by Scope + Category + Subcategory
        aggregated = {}
        for em in year_emissions:
            key = (
                em.get("scope", ""),
                em.get("category", ""),
                em.get("sub_category", "")
            )
            # Get tCO2e value - try multiple field names
            tco2e = em.get("total_emissions") or em.get("co2e_emissions") or em.get("calculated_co2e") or 0
            try:
                tco2e = float(tco2e) if tco2e else 0
            except (ValueError, TypeError):
                tco2e = 0
            
            if key in aggregated:
                aggregated[key] += tco2e
            else:
                aggregated[key] = tco2e
        
        result = [
            {
                "scope": k[0], 
                "category": k[1], 
                "subcategory": k[2],
                "tco2e": round(aggregated[k], 4)
            }
            for k in sorted(aggregated.keys())
        ]
        
        year_label = f"FY {year}-{year+1}" if is_financial else str(year)
        # Only set has_values to True if we actually have results with values > 0
        has_values = len(result) > 0 and any(r["tco2e"] > 0 for r in result)
        return {"combinations": result, "total": len(result), "year": year, "year_label": year_label, "year_type": year_type, "has_values": has_values}
    
    # Without year, just return unique combinations with 0 values
    combinations = set()
    for em in emissions:
        combo = (
            em.get("scope", ""),
            em.get("category", ""),
            em.get("sub_category", "")
        )
        combinations.add(combo)
    
    # Convert to list of dicts
    result = [
        {"scope": c[0], "category": c[1], "subcategory": c[2], "tco2e": 0}
        for c in sorted(combinations)
    ]
    
    return {"combinations": result, "total": len(result), "has_values": False}


@api_router.post("/base-year-emissions", response_model=BaseYearEmissionsResponse)
async def create_base_year_emissions(
    data: BaseYearEmissionsCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create base year emissions record"""
    # Validate justification is provided
    if not data.justification or not data.justification.strip():
        raise HTTPException(status_code=400, detail="Justification for selecting this base year is required")
    
    # Validate no negative values
    for entry in data.emissions_data:
        if entry.tco2e < 0:
            raise HTTPException(status_code=400, detail="Base year emission values cannot be negative")
    
    # Check if base year record already exists for this scope_group
    query = {
        "organization_id": data.organization_id,
        "scope_group": data.scope_group
    }
    if data.facility_id:
        query["facility_id"] = data.facility_id
    else:
        query["facility_id"] = None  # Org-level
    
    existing = await db.base_year_emissions.find_one(query, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail=f"Base year emissions already exist for this entity ({data.scope_group}). Use PUT to update.")
    
    # Verify emissions data exists - with correct biogenic filtering
    if data.scope_group == "scope12":
        # Scope 1&2 includes: scope1, scope2, and biogenic NOT tagged as scope3
        scope_filter = {"$or": [
            {"scope": {"$in": ["scope1", "scope2"]}},
            {"scope": "biogenic", "biogenic_scope_selection": {"$in": [None, "scope1"]}}
        ]}
    else:
        # Scope 3 includes: scope3 and biogenic tagged as scope3
        scope_filter = {"$or": [
            {"scope": "scope3"},
            {"scope": "biogenic", "biogenic_scope_selection": "scope3"}
        ]}
    
    if data.facility_id:
        emissions_count = await db.emission_records.count_documents({
            "facility_id": data.facility_id,
            **scope_filter
        })
    else:
        # For org-level, check all facilities have emissions
        facilities = await db.facilities.find(
            {"organization_id": data.organization_id, "is_active": True}, 
            {"_id": 0, "id": 1}
        ).to_list(1000)
        if not facilities:
            raise HTTPException(status_code=400, detail="No facilities found for this organization")
        
        emissions_count = 0
        for facility in facilities:
            fac_emissions = await db.emission_records.count_documents({
                "facility_id": facility["id"],
                **scope_filter
            })
            emissions_count += fac_emissions
    
    if emissions_count == 0 and data.scope_group == "scope12":
        raise HTTPException(status_code=400, detail="Emissions data must exist before adding base year emissions")
    
    # Determine status based on emissions data
    status = "configured" if len(data.emissions_data) > 0 else "incomplete"
    
    record = {
        "id": str(uuid.uuid4()),
        "organization_id": data.organization_id,
        "facility_id": data.facility_id,
        "scope_group": data.scope_group,
        "base_year": data.base_year,
        "base_year_type": data.base_year_type,
        "is_oldest_year": data.is_oldest_year,
        "emissions_data": [e.model_dump() for e in data.emissions_data],
        "sinks_data": data.sinks_data,
        "justification": data.justification.strip(),
        "notes": data.notes,
        "status": status,
        "version": 1,
        "version_history": [{
            "version": 1,
            "change_type": "created",
            "previous_base_year": None,
            "new_base_year": data.base_year,
            "emissions_data": [e.model_dump() for e in data.emissions_data],
            "changed_fields": ["base_year", "emissions_data", "justification"],
            "change_reason": "Initial base year setup",
            "justification": data.justification.strip(),
            "changed_by": current_user["id"],
            "changed_by_email": current_user.get("email"),
            "changed_by_name": current_user.get("name"),
            "changed_at": datetime.now(timezone.utc).isoformat()
        }],
        "created_by": current_user["id"],
        "created_by_email": current_user.get("email"),
        "created_by_name": current_user.get("name"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": None,
        "updated_by": None,
        "updated_by_email": None,
        "updated_by_name": None
    }
    
    await db.base_year_emissions.insert_one(record)
    record.pop("_id", None)
    return record


@api_router.get("/base-year-emissions", response_model=List[BaseYearEmissionsResponse])
async def get_base_year_emissions(
    current_user: dict = Depends(get_current_user),
    organization_id: Optional[str] = None,
    facility_id: Optional[str] = None,
    scope_group: Optional[str] = None  # "scope12" or "scope3"
):
    """Get base year emissions records"""
    query = {}
    
    if current_user["role"] == "super_admin":
        if organization_id:
            query["organization_id"] = organization_id
        if facility_id:
            query["facility_id"] = facility_id
    elif current_user["role"] == "admin":
        org_id = current_user.get("organization_id")
        if not org_id:
            return []
        query["organization_id"] = org_id
        if facility_id:
            query["facility_id"] = facility_id
    else:  # user
        assigned = current_user.get("assigned_facilities", [])
        if not assigned:
            return []
        if facility_id:
            if facility_id not in assigned:
                raise HTTPException(status_code=403, detail="Not authorized to access this facility")
            query["facility_id"] = facility_id
        else:
            query["facility_id"] = {"$in": assigned}
    
    # Filter by scope_group if provided
    if scope_group:
        query["scope_group"] = scope_group
    
    records = await db.base_year_emissions.find(query, {"_id": 0}).to_list(1000)
    
    # Add default scope_group for legacy records
    for record in records:
        if "scope_group" not in record:
            record["scope_group"] = "scope12"
        if "status" not in record:
            record["status"] = "configured" if record.get("emissions_data") else "incomplete"
        if "justification" not in record:
            record["justification"] = record.get("notes", "")
    
    return records


@api_router.get("/base-year-emissions/{record_id}", response_model=BaseYearEmissionsResponse)
async def get_base_year_emissions_by_id(
    record_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get specific base year emissions record"""
    record = await db.base_year_emissions.find_one({"id": record_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Base year emissions record not found")
    return record


@api_router.put("/base-year-emissions/{record_id}", response_model=BaseYearEmissionsResponse)
async def update_base_year_emissions(
    record_id: str,
    data: BaseYearEmissionsUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update base year emissions record with version history"""
    record = await db.base_year_emissions.find_one({"id": record_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Base year emissions record not found")
    
    # Validate no negative values
    if data.emissions_data is not None:
        for entry in data.emissions_data:
            if entry.tco2e < 0:
                raise HTTPException(status_code=400, detail="Base year emission values cannot be negative")
    
    # Track which fields are being changed
    changed_fields = []
    
    # Calculate changes for version history
    old_emissions = {
        f"{e['scope']}|{e['category']}|{e.get('subcategory', '')}": e.get('tco2e', 0)
        for e in record.get("emissions_data", [])
    }
    
    new_emissions_data = [e.model_dump() for e in data.emissions_data] if data.emissions_data else record.get("emissions_data", [])
    new_emissions = {
        f"{e['scope']}|{e['category']}|{e.get('subcategory', '')}": e.get('tco2e', 0)
        for e in new_emissions_data
    }
    
    # Build detailed change log
    emission_changes = []
    all_keys = set(old_emissions.keys()) | set(new_emissions.keys())
    for key in all_keys:
        old_val = old_emissions.get(key, 0)
        new_val = new_emissions.get(key, 0)
        if old_val != new_val:
            parts = key.split('|')
            emission_changes.append({
                "scope": parts[0],
                "category": parts[1],
                "subcategory": parts[2] if len(parts) > 2 else "",
                "previous_value": old_val,
                "new_value": new_val
            })
            if "emissions_data" not in changed_fields:
                changed_fields.append("emissions_data")
    
    # Track other field changes
    if data.justification and data.justification != record.get("justification"):
        changed_fields.append("justification")
    if data.notes and data.notes != record.get("notes"):
        changed_fields.append("notes")
    if data.sinks_data and data.sinks_data != record.get("sinks_data"):
        changed_fields.append("sinks_data")
    
    # Save current state to version history with detailed changes
    version_entry = {
        "version": record["version"],
        "change_type": "updated",
        "previous_base_year": record.get("base_year"),
        "new_base_year": data.base_year if data.base_year else record.get("base_year"),
        "emissions_data": record["emissions_data"],
        "changed_fields": changed_fields,
        "emission_changes": emission_changes,
        "change_reason": "Updated emissions data",
        "justification": record.get("justification"),
        "changed_by": current_user["id"],
        "changed_by_email": current_user.get("email"),
        "changed_by_name": current_user.get("name"),
        "changed_at": datetime.now(timezone.utc).isoformat()
    }
    
    update_data = {}
    if data.base_year is not None:
        update_data["base_year"] = data.base_year
    if data.base_year_type is not None:
        update_data["base_year_type"] = data.base_year_type
    if data.is_oldest_year is not None:
        update_data["is_oldest_year"] = data.is_oldest_year
    if data.emissions_data is not None:
        update_data["emissions_data"] = new_emissions_data
    if data.justification is not None:
        update_data["justification"] = data.justification
    if data.notes is not None:
        update_data["notes"] = data.notes
    if data.sinks_data is not None:
        update_data["sinks_data"] = data.sinks_data
    
    # Update status based on emissions data
    final_emissions = update_data.get("emissions_data", record.get("emissions_data", []))
    update_data["status"] = "configured" if len(final_emissions) > 0 else "incomplete"
    
    update_data["version"] = record["version"] + 1
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = current_user["id"]
    update_data["updated_by_email"] = current_user.get("email")
    update_data["updated_by_name"] = current_user.get("name")
    
    # Add to version history
    version_history = record.get("version_history", [])
    version_history.append(version_entry)
    update_data["version_history"] = version_history
    
    await db.base_year_emissions.update_one(
        {"id": record_id},
        {"$set": update_data}
    )
    
    updated = await db.base_year_emissions.find_one({"id": record_id}, {"_id": 0})
    
    # Add default values for response
    if "scope_group" not in updated:
        updated["scope_group"] = "scope12"
    
    return updated


@api_router.delete("/base-year-emissions/{record_id}")
async def delete_base_year_emissions(
    record_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete base year emissions record and store deletion in history"""
    # Get the record first to store in deletion history
    record = await db.base_year_emissions.find_one({"id": record_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Base year emissions record not found")
    
    # Store deletion record in a separate collection for audit trail
    deletion_record = {
        "id": str(uuid.uuid4()),
        "deleted_record_id": record_id,
        "organization_id": record.get("organization_id"),
        "facility_id": record.get("facility_id"),
        "base_year": record.get("base_year"),
        "base_year_type": record.get("base_year_type"),
        "emissions_data": record.get("emissions_data", []),
        "version_at_deletion": record.get("version", 1),
        "version_history": record.get("version_history", []),
        "deleted_by": current_user["id"],
        "deleted_by_name": current_user.get("full_name", "Unknown"),
        "deleted_at": datetime.now(timezone.utc).isoformat(),
        "deletion_reason": "User initiated deletion"
    }
    
    await db.base_year_emissions_deletions.insert_one(deletion_record)
    
    # Now delete the actual record
    await db.base_year_emissions.delete_one({"id": record_id})
    
    return {"message": "Base year emissions record deleted successfully", "deletion_id": deletion_record["id"]}


# Endpoint to get deletion history for an entity
@api_router.get("/base-year-emissions/deletion-history/{entity_type}/{entity_id}")
async def get_deletion_history(
    entity_type: str,
    entity_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get deletion history for an entity (organization or facility)"""
    if entity_type == "facility":
        query = {"facility_id": entity_id}
    else:
        query = {"organization_id": entity_id, "facility_id": None}
    
    deletions = await db.base_year_emissions_deletions.find(
        query, {"_id": 0}
    ).sort("deleted_at", -1).to_list(100)
    
    return deletions


# Endpoint to change base year without losing data
@api_router.patch("/base-year-emissions/{record_id}/change-year")
async def change_base_year(
    record_id: str,
    new_base_year: str = Query(..., description="New base year (e.g., '2024' or 'FY 2024-2025')"),
    change_reason: str = Query(..., min_length=20, description="Reason for changing the base year (minimum 20 characters)"),
    current_user: dict = Depends(get_current_user)
):
    """Change the base year for an existing record and update emissions data"""
    from calendar import month_name
    import re
    
    record = await db.base_year_emissions.find_one({"id": record_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Base year emissions record not found")
    
    old_base_year = record.get("base_year")
    entity_type = "facility" if record.get("facility_id") else "organization"
    entity_id = record.get("facility_id") or record.get("organization_id")
    
    # Fetch emissions data for the new year
    org_id = record.get("organization_id")
    
    # Determine year type (financial vs calendar)
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "reporting_year_type": 1})
    year_type = org.get("reporting_year_type", "calendar_year") if org else "calendar_year"
    is_financial = year_type == "financial_year"
    
    # Parse year for querying
    if new_base_year.startswith("FY "):
        # Extract start year from FY format (e.g., "FY 2023-2024" -> 2023)
        year_value = int(new_base_year.replace("FY ", "").split("-")[0])
    else:
        year_value = int(new_base_year)
    
    # Get oldest year to check if new year is oldest
    oldest_year_response = await get_oldest_reporting_year(entity_type, entity_id, current_user)
    is_oldest = new_base_year == oldest_year_response.get("oldest_year_formatted")
    
    # Build query for emissions
    query = {}
    if entity_type == "facility":
        query["facility_id"] = entity_id
    else:
        # For organization, we need to get all facilities
        org_facilities = await db.facilities.find({"organization_id": org_id}, {"_id": 0, "id": 1}).to_list(100)
        facility_ids = [f["id"] for f in org_facilities]
        query["facility_id"] = {"$in": facility_ids}
    
    # Fetch all emissions for the entity
    all_emissions = await db.emission_records.find(query, {"_id": 0}).to_list(10000)
    
    # Helper function to parse reporting period and check if it's in the target year
    def parse_period(period):
        """Parse reporting period like 'January 2024' or '2024-01' and return (month_num, year)"""
        for i, m in enumerate(month_name):
            if m and m.lower() in period.lower():
                year_match = re.search(r'20\d{2}', period)
                if year_match:
                    return (i, int(year_match.group()))
        match = re.match(r'(\d{4})-(\d{1,2})', period)
        if match:
            return (int(match.group(2)), int(match.group(1)))
        return (None, None)
    
    def is_in_year_range(period, target_year, is_fy):
        month, year = parse_period(period)
        if month is None or year is None:
            return False
        
        if is_fy:
            # Financial year: April (4) of target_year to March (3) of target_year+1
            # FY 2025-2026 = April 2025 to March 2026
            # So Jan 2026 (month=1, year=2026) should match target_year=2025
            if month >= 4 and year == target_year:
                return True
            if month <= 3 and year == target_year + 1:
                return True
            return False
        else:
            return year == target_year
    
    # Filter emissions for the target year
    year_emissions = [em for em in all_emissions if is_in_year_range(em.get("reporting_period", ""), year_value, is_financial)]
    
    new_emissions_data = []
    if year_emissions:
        # Aggregate emissions by scope + category + subcategory
        combinations = {}
        for em in year_emissions:
            key = f"{em.get('scope', '')}|{em.get('category', '')}|{em.get('sub_category', '')}"
            if key not in combinations:
                combinations[key] = {
                    "scope": em.get("scope", ""),
                    "category": em.get("category", ""),
                    "subcategory": em.get("sub_category", ""),
                    "tco2e": 0
                }
            combinations[key]["tco2e"] += em.get("total_emissions", 0) or 0
        new_emissions_data = list(combinations.values())
    else:
        # No emissions for this year - keep existing structure with zero values
        new_emissions_data = [{**e, "tco2e": 0} for e in record.get("emissions_data", [])]
    
    # Record the change in version history
    version_entry = {
        "version": record["version"],
        "emissions_data": record["emissions_data"],
        "base_year": old_base_year,
        "changes": [{"type": "base_year_change", "previous_value": old_base_year, "new_value": new_base_year}],
        "changed_by": current_user["id"],
        "changed_by_name": current_user.get("full_name", "Unknown"),
        "changed_at": datetime.now(timezone.utc).isoformat(),
        "change_reason": change_reason  # User-provided mandatory reason
    }
    
    version_history = record.get("version_history", [])
    version_history.append(version_entry)
    
    update_data = {
        "base_year": new_base_year,
        "is_oldest_year": is_oldest,
        "emissions_data": new_emissions_data,
        "version": record["version"] + 1,
        "version_history": version_history,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user["id"]
    }
    
    await db.base_year_emissions.update_one(
        {"id": record_id},
        {"$set": update_data}
    )
    
    updated_record = await db.base_year_emissions.find_one({"id": record_id}, {"_id": 0})
    return updated_record


@api_router.get("/base-year-emissions/check/{entity_type}/{entity_id}")
async def check_base_year_exists(
    entity_type: str,
    entity_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Check if base year emissions exist for an entity"""
    if entity_type == "facility":
        query = {"facility_id": entity_id}
    else:
        query = {"organization_id": entity_id, "facility_id": None}
    
    record = await db.base_year_emissions.find_one(query, {"_id": 0, "id": 1, "base_year": 1})
    
    return {
        "exists": record is not None,
        "record_id": record.get("id") if record else None,
        "base_year": record.get("base_year") if record else None
    }


@api_router.get("/base-year-emissions/validate-for-report")
async def validate_base_year_for_report(
    current_user: dict = Depends(get_current_user),
    facility_ids: List[str] = Query(default=[]),
    include_org_level: bool = False
):
    """Validate that base year data exists for report generation.
    
    If all facilities within an organization are selected, organization-level 
    base year emissions data suffices - separate facility-level data is not required.
    """
    org_id = current_user.get("organization_id")
    
    missing = []
    
    # Check if all facilities are selected (org-level can suffice)
    all_org_facilities = []
    if org_id:
        all_org_facilities = await db.facilities.find(
            {"organization_id": org_id, "is_active": True},
            {"_id": 0, "id": 1}
        ).to_list(1000)
    
    all_facility_ids = {f["id"] for f in all_org_facilities}
    selected_facility_ids = set(facility_ids)
    
    # Check if all facilities are selected
    all_facilities_selected = all_facility_ids and selected_facility_ids == all_facility_ids
    
    if all_facilities_selected:
        # If all facilities selected, check if org-level base year exists
        org_record = await db.base_year_emissions.find_one(
            {"organization_id": org_id, "facility_id": None}, 
            {"_id": 0}
        )
        if org_record:
            # Org-level data exists, no facility-level data required
            return {
                "valid": True,
                "missing": [],
                "message": "Organization-level base year data found (covers all facilities)",
                "org_level_used": True
            }
    
    # Check facility-level base year data
    for fac_id in facility_ids:
        record = await db.base_year_emissions.find_one({"facility_id": fac_id}, {"_id": 0})
        if not record:
            facility = await db.facilities.find_one({"id": fac_id}, {"_id": 0, "name": 1})
            missing.append({
                "type": "facility",
                "id": fac_id,
                "name": facility.get("name", "Unknown") if facility else "Unknown"
            })
    
    # Check org-level if required
    if include_org_level and org_id:
        org_record = await db.base_year_emissions.find_one(
            {"organization_id": org_id, "facility_id": None}, 
            {"_id": 0}
        )
        if not org_record:
            org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "name": 1})
            missing.append({
                "type": "organization",
                "id": org_id,
                "name": org.get("name", "Unknown") if org else "Unknown"
            })
    
    return {
        "valid": len(missing) == 0,
        "missing": missing,
        "message": "Base year emissions data is required before generating the report." if missing else "All base year data present",
        "org_level_used": False
    }


# Dashboard endpoints
@api_router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    current_user: dict = Depends(get_current_user),
    start_period: Optional[str] = None,
    end_period: Optional[str] = None,
    facility_id: List[str] = Query(default=[])
):
    # Track organization for equity share calculations
    organization = None
    use_equity_share = False
    facility_equity_map = {}  # facility_id -> equity percentage (as decimal)
    
    if current_user["role"] == "super_admin":
        facilities = await db.facilities.find({}, {"_id": 0}).to_list(1000)
        facility_ids = [f["id"] for f in facilities]
        emissions_query = {"facility_id": {"$in": facility_ids}}
    elif current_user["role"] == "admin":
        org_id = current_user.get("organization_id")
        if not org_id:
            # Admin without organization - return empty stats
            return DashboardStats(
                total_facilities=0,
                total_emissions=0,
                scope1_emissions=0,
                scope2_emissions=0,
                biogenic_emissions=0,
                recent_records=[],
                emissions_by_facility=[],
                emissions_trend=[],
                emissions_by_category=[],
                emissions_by_fuel=[],
                yearly_fuel_analysis=[],
                yearly_facility_analysis=[],
                monthly_comparison=[],
                sinks_total=0,
                sinks_by_facility=[]
            )
        
        # Get organization to check for equity share approach
        organization = await db.organizations.find_one({"id": org_id}, {"_id": 0})
        if organization and organization.get("org_boundaries_approach") == "equity_share":
            use_equity_share = True
        
        facilities = await db.facilities.find(
            {"organization_id": org_id},
            {"_id": 0}
        ).to_list(1000)
        
        # Build facility equity map
        for f in facilities:
            equity_pct = f.get("equity_share_percentage", 100.0) or 100.0
            facility_equity_map[f["id"]] = equity_pct / 100.0  # Convert to decimal
        
        facility_ids = [f["id"] for f in facilities]
        emissions_query = {"facility_id": {"$in": facility_ids}}
    else:  # user
        assigned = current_user.get("assigned_facilities", [])
        facilities = await db.facilities.find({"id": {"$in": assigned}}, {"_id": 0}).to_list(1000)
        
        # Get organization for user to check equity share approach
        if facilities:
            org_id = facilities[0].get("organization_id")
            if org_id:
                organization = await db.organizations.find_one({"id": org_id}, {"_id": 0})
                if organization and organization.get("org_boundaries_approach") == "equity_share":
                    use_equity_share = True
        
        # Build facility equity map
        for f in facilities:
            equity_pct = f.get("equity_share_percentage", 100.0) or 100.0
            facility_equity_map[f["id"]] = equity_pct / 100.0
        
        facility_ids = assigned  # Set facility_ids for use in sinks query
        emissions_query = {"facility_id": {"$in": assigned}}
    
    # Apply date range filter if provided
    # We need to handle both monthly (YYYY-MM) and yearly (FY YYYY-YY, CY YYYY) formats
    # For MongoDB query, we'll fetch all records first and then filter in Python
    # to properly handle yearly records that fall within the date range
    date_filter_start = start_period  # e.g., "2025-04"
    date_filter_end = end_period      # e.g., "2026-03"
    
    # For MongoDB query, only apply filter for monthly format records
    # Yearly records will be filtered after fetching
    if start_period or end_period:
        # Create an OR condition to include:
        # 1. Monthly records in the date range
        # 2. All yearly records (we'll filter them in Python)
        monthly_filter = {}
        if start_period:
            monthly_filter["$gte"] = start_period
        if end_period:
            monthly_filter["$lte"] = end_period
        
        # Query: (monthly records in range) OR (yearly records - filtered later)
        emissions_query["$or"] = [
            {"reporting_period": monthly_filter},
            {"reporting_period": {"$regex": "^(FY |CY)"}},  # Include all yearly records
        ]
    
    # Apply facility filter if provided (supports multiple facility IDs)
    if facility_id and len(facility_id) > 0:
        emissions_query["facility_id"] = {"$in": facility_id}
        # Also filter the facilities list for the response
        facilities = [f for f in facilities if f["id"] in facility_id]
    
    all_emissions = await db.emission_records.find(emissions_query, {"_id": 0}).to_list(10000)
    
    # ===========================================
    # PHASE 5: Prevent Double Counting for Mixed Frequency Datasets
    # ===========================================
    # When both yearly and monthly records exist for the same facility/category/year,
    # prefer the yearly record and exclude monthly records to prevent double counting.
    # ===========================================
    
    def extract_year_from_period(period: str) -> str:
        """Extract year from reporting_period (handles CY2025, FY 2025-2026, 2025-01, etc.)"""
        if not period:
            return None
        period = period.strip()
        # CY2025 format
        if period.startswith("CY"):
            return period[2:6]
        # FY 2025-2026 format
        if period.startswith("FY ") or period.startswith("FY"):
            parts = period.replace("FY ", "FY").replace("FY", "").split("-")
            return parts[0].strip() if parts else None
        # YYYY-MM format
        if "-" in period and len(period) >= 7:
            return period[:4]
        return period[:4] if len(period) >= 4 else None
    
    def is_yearly_period_in_range(period: str, start: str, end: str) -> bool:
        """Check if a yearly period (FY 2025-26, CY2025) falls within a monthly date range (2025-04, 2026-03)"""
        if not period or not (start or end):
            return True  # No filter, include all
        
        # Extract start and end years from the filter range
        filter_start_year = int(start[:4]) if start else 0
        filter_start_month = int(start[5:7]) if start and len(start) >= 7 else 1
        filter_end_year = int(end[:4]) if end else 9999
        filter_end_month = int(end[5:7]) if end and len(end) >= 7 else 12
        
        period = period.strip()
        
        # Handle FY 2025-26 format (Financial Year April-March)
        if period.startswith("FY "):
            # FY 2025-26 means April 2025 to March 2026
            fy_parts = period[3:].split("-")
            if len(fy_parts) >= 1:
                fy_start_year = int(fy_parts[0].strip())
                fy_end_year = fy_start_year + 1
                # FY covers fy_start_year-04 to fy_end_year-03
                # Check if there's any overlap with the filter range
                fy_start = (fy_start_year, 4)  # April of start year
                fy_end = (fy_end_year, 3)      # March of end year
                filter_range_start = (filter_start_year, filter_start_month)
                filter_range_end = (filter_end_year, filter_end_month)
                # Check overlap: FY overlaps filter if FY_start <= filter_end AND FY_end >= filter_start
                return fy_start <= filter_range_end and fy_end >= filter_range_start
        
        # Handle CY2025 format (Calendar Year Jan-Dec)
        if period.startswith("CY"):
            cy_year = int(period[2:6])
            # CY covers cy_year-01 to cy_year-12
            cy_start = (cy_year, 1)
            cy_end = (cy_year, 12)
            filter_range_start = (filter_start_year, filter_start_month)
            filter_range_end = (filter_end_year, filter_end_month)
            return cy_start <= filter_range_end and cy_end >= filter_range_start
        
        return True  # Unknown format, include by default
    
    # Filter yearly records that fall outside the date range
    if date_filter_start or date_filter_end:
        filtered_emissions = []
        for e in all_emissions:
            period = e.get("reporting_period", "")
            # Monthly records are already filtered by MongoDB query
            if period.startswith("FY ") or period.startswith("CY"):
                if is_yearly_period_in_range(period, date_filter_start, date_filter_end):
                    filtered_emissions.append(e)
            else:
                filtered_emissions.append(e)
        all_emissions = filtered_emissions
    
    # Build a set of yearly record keys: (facility_id, category, scope, year)
    yearly_keys = set()
    for e in all_emissions:
        if e.get("frequency_type") == "yearly":
            year = extract_year_from_period(e.get("reporting_period"))
            if year:
                key = (e.get("facility_id"), e.get("category"), e.get("scope"), year)
                yearly_keys.add(key)
    
    # Filter out monthly records that conflict with yearly records
    def should_include_emission(e):
        """Returns True if emission should be included in aggregations"""
        freq = e.get("frequency_type", "monthly")
        # Always include yearly records
        if freq == "yearly":
            return True
        # For monthly records, check if a yearly record exists for the same combination
        year = extract_year_from_period(e.get("reporting_period"))
        if year:
            key = (e.get("facility_id"), e.get("category"), e.get("scope"), year)
            if key in yearly_keys:
                # Monthly record conflicts with yearly - exclude to prevent double counting
                return False
        return True
    
    # Apply deduplication filter
    deduplicated_emissions = [e for e in all_emissions if should_include_emission(e)]
    
    # Helper function to get equity-adjusted emission value
    def get_adjusted_emission(emission, emission_value):
        """Apply equity share adjustment if applicable"""
        if use_equity_share:
            fac_id = emission.get("facility_id")
            equity_factor = facility_equity_map.get(fac_id, 1.0)
            return emission_value * equity_factor
        return emission_value
    
    # Calculate totals with equity share adjustment (using deduplicated emissions)
    total_emissions = sum(get_adjusted_emission(e, e["total_emissions"]) for e in deduplicated_emissions)
    scope1_emissions = sum(get_adjusted_emission(e, e["total_emissions"]) for e in deduplicated_emissions if e["scope"] == "scope1")
    scope2_emissions = sum(get_adjusted_emission(e, e["total_emissions"]) for e in deduplicated_emissions if e["scope"] == "scope2")
    scope3_emissions = sum(get_adjusted_emission(e, e["total_emissions"]) for e in deduplicated_emissions if e["scope"] == "scope3")
    biogenic_emissions = sum(get_adjusted_emission(e, e["total_emissions"]) for e in deduplicated_emissions if e["scope"] == "biogenic")
    
    # NEW: Scope 3 category breakdown
    scope3_category_map = {}
    scope3_methodology_map = {"activity_basis": 0.0, "spend_basis": 0.0, "supplier_basis": 0.0, "other": 0.0}
    scope3_categories_set = set()
    
    for emission in deduplicated_emissions:
        if emission.get("scope") == "scope3":
            category = emission.get("category", "Unknown")
            adjusted_value = get_adjusted_emission(emission, emission.get("total_emissions", 0))
            
            # Track unique categories
            scope3_categories_set.add(category)
            
            # Category breakdown
            if category not in scope3_category_map:
                scope3_category_map[category] = {"category": category, "total_emissions": 0.0, "record_count": 0}
            scope3_category_map[category]["total_emissions"] += adjusted_value
            scope3_category_map[category]["record_count"] += 1
            
            # Methodology breakdown
            method = (emission.get("calculation_method_scope3") or "other").lower()
            if "activity" in method:
                scope3_methodology_map["activity_basis"] += adjusted_value
            elif "spend" in method:
                scope3_methodology_map["spend_basis"] += adjusted_value
            elif "supplier" in method:
                scope3_methodology_map["supplier_basis"] += adjusted_value
            else:
                scope3_methodology_map["other"] += adjusted_value
    
    # Convert to sorted list
    scope3_by_category = sorted(scope3_category_map.values(), key=lambda x: -x["total_emissions"])
    
    # Add percentage to each category
    if scope3_emissions > 0:
        for cat in scope3_by_category:
            cat["percentage"] = round((cat["total_emissions"] / scope3_emissions) * 100, 1)
    
    # Methodology split with percentages
    scope3_by_methodology = []
    method_labels = {"activity_basis": "Activity-Based", "spend_basis": "Spend-Based", "supplier_basis": "Supplier-Specific", "other": "Other"}
    for method_key, total in scope3_methodology_map.items():
        if total > 0:
            scope3_by_methodology.append({
                "methodology": method_labels[method_key],
                "total_emissions": round(total, 2),
                "percentage": round((total / scope3_emissions) * 100, 1) if scope3_emissions > 0 else 0
            })
    scope3_by_methodology.sort(key=lambda x: -x["total_emissions"])
    
    recent_records = sorted(all_emissions, key=lambda x: x["created_at"], reverse=True)[:5]
    
    emissions_by_facility = []
    for facility in facilities:
        # Use deduplicated emissions for aggregations to prevent double counting
        facility_emissions = [e for e in deduplicated_emissions if e["facility_id"] == facility["id"]]
        
        # Get equity factor for this facility
        equity_factor = facility_equity_map.get(facility["id"], 1.0) if use_equity_share else 1.0
        
        total = sum(e["total_emissions"] for e in facility_emissions) * equity_factor
        scope1 = sum(e["total_emissions"] for e in facility_emissions if e["scope"] == "scope1") * equity_factor
        scope2 = sum(e["total_emissions"] for e in facility_emissions if e["scope"] == "scope2") * equity_factor
        scope3 = sum(e["total_emissions"] for e in facility_emissions if e["scope"] == "scope3") * equity_factor
        biogenic = sum(e["total_emissions"] for e in facility_emissions if e["scope"] == "biogenic") * equity_factor
        
        emissions_by_facility.append({
            "facility_id": facility["id"],
            "facility_name": facility["name"],
            "total_emissions": round(total, 2),
            "scope1_emissions": round(scope1, 2),
            "scope2_emissions": round(scope2, 2),
            "scope3_emissions": round(scope3, 2),
            "biogenic_emissions": round(biogenic, 2),
            "equity_share_percentage": round(equity_factor * 100, 1) if use_equity_share else 100.0
        })
    
    # Emissions trend - use deduplicated emissions
    # Only include monthly (YYYY-MM) periods for trend chart to avoid mixing granularities
    period_map = {}
    for emission in deduplicated_emissions:
        period = emission["reporting_period"]
        # Only include monthly format periods (YYYY-MM) for trend chart
        # Exclude yearly periods (FY, CY) to prevent duplication and mixed granularity
        if not period or not (len(period) == 7 and "-" in period and period[:4].isdigit()):
            continue  # Skip non-monthly periods
        adjusted_value = get_adjusted_emission(emission, emission["total_emissions"])
        if period not in period_map:
            period_map[period] = {"period": period, "scope1": 0, "scope2": 0, "scope3": 0, "biogenic": 0, "total": 0}
        period_map[period]["scope1"] += adjusted_value if emission["scope"] == "scope1" else 0
        period_map[period]["scope2"] += adjusted_value if emission["scope"] == "scope2" else 0
        period_map[period]["scope3"] += adjusted_value if emission["scope"] == "scope3" else 0
        period_map[period]["biogenic"] += adjusted_value if emission["scope"] == "biogenic" else 0
        period_map[period]["total"] += adjusted_value
    
    emissions_trend = sorted(period_map.values(), key=lambda x: x["period"])
    
    # Category analysis (Stationary Combustion vs Mobile Combustion vs Fugitive vs Process)
    # Normalize category names (raw DB names to display names)
    # Use deduplicated emissions for category analysis
    category_display_map = {
        'stationary_combustion': 'Stationary Combustion',
        'mobile_combustion': 'Mobile Combustion',
        'fugitive': 'Fugitive Emissions',
        'fugitive_emissions': 'Fugitive Emissions',
        'process': 'Process Emissions',
        'process_emissions': 'Process Emissions',
        'electricity': 'Purchased Electricity',
        'purchased_electricity': 'Purchased Electricity',
        'biomass': 'Biomass',
    }
    category_map = {}
    for emission in deduplicated_emissions:
        raw_category = emission.get("category", "Unknown")
        category = category_display_map.get(raw_category.lower().replace(' ', '_'), raw_category)
        adjusted_value = get_adjusted_emission(emission, emission["total_emissions"])
        if category not in category_map:
            category_map[category] = {"category": category, "total_emissions": 0, "scope1": 0, "scope2": 0}
        category_map[category]["total_emissions"] += adjusted_value
        if emission["scope"] == "scope1":
            category_map[category]["scope1"] += adjusted_value
        elif emission["scope"] == "scope2":
            category_map[category]["scope2"] += adjusted_value
    emissions_by_category = sorted(category_map.values(), key=lambda x: -x["total_emissions"])
    
    # Fuel analysis - use deduplicated emissions
    fuel_map = {}
    for emission in deduplicated_emissions:
        fuel = emission.get("fuel_type", "Unknown")
        adjusted_value = get_adjusted_emission(emission, emission["total_emissions"])
        if fuel not in fuel_map:
            fuel_map[fuel] = {"fuel_type": fuel, "total_emissions": 0, "count": 0}
        fuel_map[fuel]["total_emissions"] += adjusted_value
        fuel_map[fuel]["count"] += 1
    emissions_by_fuel = sorted(fuel_map.values(), key=lambda x: -x["total_emissions"])
    
    # Year-wise fuel analysis - aggregate by year, show top fuels per year
    # Use deduplicated emissions - store raw periods for later normalization
    yearly_fuel_map = {}
    for emission in deduplicated_emissions:
        period = emission.get("reporting_period", "")
        adjusted_value = get_adjusted_emission(emission, emission["total_emissions"])
        fuel = emission.get("fuel_type", "Unknown") or "Unknown"
        if not fuel.strip():
            fuel = "Unknown"
        # Use period directly as key - will be normalized later
        key = f"{period}_{fuel}"
        if key not in yearly_fuel_map:
            yearly_fuel_map[key] = {"year": period, "fuel_type": fuel, "total_emissions": 0}
        yearly_fuel_map[key]["total_emissions"] += adjusted_value
    
    # Group by year and aggregate fuels into a stacked format
    # First, get org's reporting year type
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "reporting_year_type": 1})
    reporting_year_type = org.get("reporting_year_type", "calendar_year") if org else "calendar_year"
    is_fy_reporting = reporting_year_type == "financial_year"
    
    def normalize_year_label(period: str, is_financial_year: bool) -> str:
        """
        Normalize period to consistent year label for chart display.
        For Financial Year orgs: FY 2025-26, FY 2024-25
        For Calendar Year orgs: CY 2025, CY 2026
        """
        if not period:
            return "Unknown"
        period = period.strip()
        
        # Already yearly format - normalize
        if period.startswith("FY "):
            # FY 2025-26 -> FY 2025-26
            if is_financial_year:
                return period  # Keep as-is for FY orgs
            else:
                # Convert FY to CY (use start year)
                parts = period[3:].split("-")
                if parts:
                    return f"CY {parts[0].strip()}"
        
        if period.startswith("CY"):
            # CY2026 or CY 2026
            cy_year = period.replace("CY", "").strip()
            if is_financial_year:
                # Convert CY to FY - CY 2026 belongs to FY 2025-26 (if Jan-Mar) or FY 2026-27 (if Apr-Dec)
                # For simplicity, map to the FY that contains most of the CY
                return f"FY {cy_year}-{str(int(cy_year)+1)[-2:]}"
            else:
                return f"CY {cy_year}"
        
        # Monthly format YYYY-MM
        if len(period) >= 7 and "-" in period and period[:4].isdigit():
            year = int(period[:4])
            month = int(period[5:7]) if len(period) >= 7 else 1
            if is_financial_year:
                # April onwards = current FY, Jan-Mar = previous FY
                fy_year = year if month >= 4 else year - 1
                return f"FY {fy_year}-{str(fy_year+1)[-2:]}"
            else:
                return f"CY {year}"
        
        # Year only (2025)
        if len(period) == 4 and period.isdigit():
            year = int(period)
            if is_financial_year:
                return f"FY {year}-{str(year+1)[-2:]}"
            else:
                return f"CY {year}"
        
        return "Unknown"
    
    # Aggregate emissions by normalized year
    years_fuel_data = {}
    for item in yearly_fuel_map.values():
        year_label = normalize_year_label(item["year"], is_fy_reporting)
        if year_label == "Unknown":
            continue
        if year_label not in years_fuel_data:
            years_fuel_data[year_label] = {"year": year_label, "fuels": {}, "total": 0}
        years_fuel_data[year_label]["fuels"][item["fuel_type"]] = years_fuel_data[year_label]["fuels"].get(item["fuel_type"], 0) + item["total_emissions"]
        years_fuel_data[year_label]["total"] += item["total_emissions"]
    
    # Sort years properly (FY 2024-25 < FY 2025-26, CY 2024 < CY 2025)
    def sort_year_key(year_label):
        if year_label.startswith("FY "):
            return int(year_label[3:7])  # Extract start year
        elif year_label.startswith("CY "):
            return int(year_label[3:])
        return 0
    
    # Convert to list format with fuel breakdown
    yearly_fuel_analysis = []
    for year_label in sorted(years_fuel_data.keys(), key=sort_year_key):
        data = years_fuel_data[year_label]
        entry = {"year": year_label, "total_emissions": round(data["total"], 2)}
        # Add top fuels as separate fields for stacked bar chart
        sorted_fuels = sorted(data["fuels"].items(), key=lambda x: -x[1])
        for i, (fuel, emissions) in enumerate(sorted_fuels[:5]):  # Top 5 fuels
            entry[fuel] = round(emissions, 2)
        yearly_fuel_analysis.append(entry)
    
    # Year-wise facility analysis - aggregate by year using normalized year labels
    # Use deduplicated emissions
    yearly_facility_map = {}
    facility_name_map = {f["id"]: f["name"] for f in facilities}
    for emission in deduplicated_emissions:
        period = emission.get("reporting_period", "")
        adjusted_value = get_adjusted_emission(emission, emission["total_emissions"])
        year_label = normalize_year_label(period, is_fy_reporting)
        if year_label == "Unknown":
            continue
        fac_id = emission.get("facility_id", "")
        fac_name = facility_name_map.get(fac_id, "Unknown")
        key = f"{year_label}_{fac_id}"
        if key not in yearly_facility_map:
            yearly_facility_map[key] = {"year": year_label, "facility_id": fac_id, "facility_name": fac_name, "total_emissions": 0, "scope1": 0, "scope2": 0, "biogenic": 0}
        yearly_facility_map[key]["total_emissions"] += adjusted_value
        if emission["scope"] == "scope1":
            yearly_facility_map[key]["scope1"] += adjusted_value
        elif emission["scope"] == "scope2":
            yearly_facility_map[key]["scope2"] += adjusted_value
        elif emission["scope"] == "biogenic":
            yearly_facility_map[key]["biogenic"] += adjusted_value
    
    # Group by year for facility analysis
    years_facility_data = {}
    for item in yearly_facility_map.values():
        year_label = item["year"]
        if year_label not in years_facility_data:
            years_facility_data[year_label] = {"year": year_label, "facilities": [], "total": 0, "scope1": 0, "scope2": 0, "biogenic": 0}
        years_facility_data[year_label]["facilities"].append(item)
        years_facility_data[year_label]["total"] += item["total_emissions"]
        years_facility_data[year_label]["scope1"] += item["scope1"]
        years_facility_data[year_label]["scope2"] += item["scope2"]
        years_facility_data[year_label]["biogenic"] += item["biogenic"]
    
    # Convert to list - one entry per year with aggregated data, sorted by year
    yearly_facility_analysis = []
    for year_label in sorted(years_facility_data.keys(), key=sort_year_key):
        data = years_facility_data[year_label]
        yearly_facility_analysis.append({
            "year": year_label,
            "total_emissions": round(data["total"], 2),
            "scope1": round(data["scope1"], 2),
            "scope2": round(data["scope2"], 2),
            "biogenic": round(data["biogenic"], 2),
            "facility_count": len(data["facilities"])
        })
    
    # Monthly comparison (current vs previous month) - only use single month periods (YYYY-MM format)
    monthly_comparison = []
    # Filter to only include single month periods (YYYY-MM format, not ranges)
    single_month_periods = {k: v for k, v in period_map.items() if len(k) == 7 and "-" in k and " to " not in k}
    sorted_periods = sorted(single_month_periods.keys())
    
    if sorted_periods:
        # Fill in missing months between first and last period
        from dateutil.relativedelta import relativedelta
        first = datetime.strptime(sorted_periods[0], "%Y-%m")
        last = datetime.strptime(sorted_periods[-1], "%Y-%m")
        all_months = []
        current_month = first
        while current_month <= last:
            all_months.append(current_month.strftime("%Y-%m"))
            current_month += relativedelta(months=1)
        
        prev_total = 0
        for period in all_months:
            current_total = round(single_month_periods.get(period, {}).get("total", 0), 2)
            change_pct = abs(((current_total - prev_total) / prev_total * 100)) if prev_total > 0 else 0
            monthly_comparison.append({
                "period": period,
                "total": current_total,
                "previous_total": round(prev_total, 2),
                "change_percent": round(change_pct, 2)
            })
            prev_total = current_total
    
    # Sinks analysis - apply same filters
    sinks_query = {}
    if facility_id and len(facility_id) > 0:
        sinks_query["facility_id"] = {"$in": facility_id}
    else:
        sinks_query["facility_id"] = {"$in": facility_ids}
    
    # Apply date filtering to sinks using start_date (YYYY-MM-DD format, present on all sinks)
    if start_period or end_period:
        date_filter = {}
        if start_period:
            date_filter["$gte"] = f"{start_period}-01"
        if end_period:
            date_filter["$lte"] = f"{end_period}-31"
        if date_filter:
            sinks_query["start_date"] = date_filter
    
    all_sinks = await db.sinks.find(sinks_query, {"_id": 0}).to_list(10000)
    
    # Apply equity share adjustment to sinks as well
    sinks_total = 0
    for s in all_sinks:
        sink_value = s.get("total_emissions_reduced", 0)
        if use_equity_share:
            fac_id = s.get("facility_id")
            equity_factor = facility_equity_map.get(fac_id, 1.0)
            sink_value = sink_value * equity_factor
        sinks_total += sink_value
    
    # Sinks by facility
    sinks_by_facility_map = {}
    for sink in all_sinks:
        fac_id = sink.get("facility_id", "")
        fac_name = facility_name_map.get(fac_id, "Unknown")
        sink_value = sink.get("total_emissions_reduced", 0)
        
        # Apply equity share adjustment
        if use_equity_share:
            equity_factor = facility_equity_map.get(fac_id, 1.0)
            sink_value = sink_value * equity_factor
        
        if fac_id not in sinks_by_facility_map:
            sinks_by_facility_map[fac_id] = {"facility_id": fac_id, "facility_name": fac_name, "total_reduced": 0}
        sinks_by_facility_map[fac_id]["total_reduced"] += sink_value
    sinks_by_facility = list(sinks_by_facility_map.values())
    
    return DashboardStats(
        total_facilities=len(facilities),
        total_emissions=round(total_emissions, 2),
        scope1_emissions=round(scope1_emissions, 2),
        scope2_emissions=round(scope2_emissions, 2),
        scope3_emissions=round(scope3_emissions, 2),
        biogenic_emissions=round(biogenic_emissions, 2),
        recent_records=[EmissionRecordResponse(**r) for r in recent_records],
        emissions_by_facility=emissions_by_facility,
        emissions_trend=emissions_trend,
        emissions_by_category=emissions_by_category,
        emissions_by_fuel=emissions_by_fuel,
        yearly_fuel_analysis=yearly_fuel_analysis,
        yearly_facility_analysis=yearly_facility_analysis,
        monthly_comparison=monthly_comparison,
        sinks_total=round(sinks_total, 2),
        sinks_by_facility=sinks_by_facility,
        scope3_by_category=scope3_by_category,
        scope3_by_methodology=scope3_by_methodology,
        scope3_categories_reported=len(scope3_categories_set)
    )


# Supplier Hotspot Heatmap - Scope 3 Analysis
@api_router.get("/dashboard/supplier-hotspots")
async def get_supplier_hotspots(
    current_user: dict = Depends(get_current_user),
    start_period: Optional[str] = None,
    end_period: Optional[str] = None,
    facility_id: List[str] = Query(default=[])
):
    """
    Get aggregated Scope 3 emissions by supplier for heatmap visualization.
    Returns hierarchical data: Category -> Supplier -> Emissions
    """
    # Build base query based on user role
    if current_user["role"] == "super_admin":
        facilities = await db.facilities.find({}, {"_id": 0}).to_list(1000)
        facility_ids = [f["id"] for f in facilities]
    elif current_user["role"] == "admin":
        org_id = current_user.get("organization_id")
        if not org_id:
            return {"categories": [], "suppliers": [], "total_scope3_emissions": 0}
        facilities = await db.facilities.find({"organization_id": org_id}, {"_id": 0}).to_list(1000)
        facility_ids = [f["id"] for f in facilities]
    else:
        assigned = current_user.get("assigned_facilities", [])
        facility_ids = assigned
    
    # Build emissions query for Scope 3 only
    emissions_query = {
        "facility_id": {"$in": facility_ids},
        "scope": "scope3"
    }
    
    # Apply date range filter
    if start_period:
        emissions_query["reporting_period"] = emissions_query.get("reporting_period", {})
        emissions_query["reporting_period"]["$gte"] = start_period
    if end_period:
        emissions_query["reporting_period"] = emissions_query.get("reporting_period", {})
        emissions_query["reporting_period"]["$lte"] = end_period
    
    # Apply facility filter
    if facility_id and len(facility_id) > 0:
        emissions_query["facility_id"] = {"$in": facility_id}
    
    # Get all Scope 3 emissions
    emissions = await db.emission_records.find(emissions_query, {"_id": 0}).to_list(10000)
    
    # Aggregate by category and supplier
    category_data = {}
    supplier_data = {}
    total_scope3 = 0
    
    for emission in emissions:
        category = emission.get("category", "Unknown")
        supplier_name = emission.get("supplier_name") or "Unspecified Supplier"
        supplier_code = emission.get("supplier_code", "")
        
        # Get total emissions (from outputs or legacy fields)
        outputs = emission.get("outputs", {})
        co2e = 0
        if outputs and "total" in outputs:
            co2e = outputs["total"].get("value", 0) or 0
        elif outputs and "co2e" in outputs:
            co2e = outputs["co2e"].get("value", 0) or 0
        else:
            co2e = emission.get("co2e_emissions") or emission.get("total_emissions") or 0
        
        total_scope3 += co2e
        
        # Aggregate by category
        if category not in category_data:
            category_data[category] = {
                "name": category,
                "total_emissions": 0,
                "suppliers": {},
                "record_count": 0
            }
        category_data[category]["total_emissions"] += co2e
        category_data[category]["record_count"] += 1
        
        # Aggregate by supplier within category
        supplier_key = f"{supplier_name}|{supplier_code}"
        if supplier_key not in category_data[category]["suppliers"]:
            category_data[category]["suppliers"][supplier_key] = {
                "name": supplier_name,
                "code": supplier_code,
                "total_emissions": 0,
                "records": [],
                "monthly_trend": {}
            }
        
        category_data[category]["suppliers"][supplier_key]["total_emissions"] += co2e
        category_data[category]["suppliers"][supplier_key]["records"].append({
            "id": emission.get("id"),
            "reporting_period": emission.get("reporting_period"),
            "activity": emission.get("scope3_activity", ""),
            "emissions": round(co2e, 4),
            "facility_id": emission.get("facility_id")
        })
        
        # Build monthly trend
        period = emission.get("reporting_period", "")
        if period:
            month_key = period[:7]  # YYYY-MM
            if month_key not in category_data[category]["suppliers"][supplier_key]["monthly_trend"]:
                category_data[category]["suppliers"][supplier_key]["monthly_trend"][month_key] = 0
            category_data[category]["suppliers"][supplier_key]["monthly_trend"][month_key] += co2e
        
        # Global supplier aggregation
        if supplier_key not in supplier_data:
            supplier_data[supplier_key] = {
                "name": supplier_name,
                "code": supplier_code,
                "total_emissions": 0,
                "categories": set()
            }
        supplier_data[supplier_key]["total_emissions"] += co2e
        supplier_data[supplier_key]["categories"].add(category)
    
    # Format response - convert to lists and sort
    categories_list = []
    for cat_name, cat_data in category_data.items():
        suppliers_list = []
        for sup_key, sup_data in cat_data["suppliers"].items():
            # Convert monthly trend to sorted list
            monthly_trend = [
                {"month": k, "emissions": round(v, 4)}
                for k, v in sorted(sup_data["monthly_trend"].items())
            ]
            suppliers_list.append({
                "name": sup_data["name"],
                "code": sup_data["code"],
                "total_emissions": round(sup_data["total_emissions"], 4),
                "record_count": len(sup_data["records"]),
                "records": sup_data["records"][-10:],  # Last 10 records
                "monthly_trend": monthly_trend
            })
        
        # Sort suppliers by emissions (descending)
        suppliers_list.sort(key=lambda x: x["total_emissions"], reverse=True)
        
        categories_list.append({
            "name": cat_name,
            "total_emissions": round(cat_data["total_emissions"], 4),
            "record_count": cat_data["record_count"],
            "suppliers": suppliers_list
        })
    
    # Sort categories by emissions (descending)
    categories_list.sort(key=lambda x: x["total_emissions"], reverse=True)
    
    # Top suppliers across all categories
    top_suppliers = [
        {
            "name": v["name"],
            "code": v["code"],
            "total_emissions": round(v["total_emissions"], 4),
            "categories": list(v["categories"])
        }
        for k, v in sorted(supplier_data.items(), key=lambda x: x[1]["total_emissions"], reverse=True)
    ][:20]  # Top 20 suppliers
    
    return {
        "categories": categories_list,
        "top_suppliers": top_suppliers,
        "total_scope3_emissions": round(total_scope3, 4)
    }


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
class FacilityProduction(BaseModel):
    quantity: Optional[float] = None
    unit: Optional[str] = None

class GHGReportRequest(BaseModel):
    facility_ids: List[str]
    facility_production: Optional[Dict[str, FacilityProduction]] = None  # {facility_id: {quantity, unit}}
    reporting_period_start: str  # Format: YYYY-MM
    reporting_period_end: str    # Format: YYYY-MM
    include_previous_years: bool = False
    organization_id: Optional[str] = None  # For SuperAdmin to specify organization
    output_format: str = "docx"  # "docx" or "pdf"
    report_type: str = "scope_1_2"  # "scope_1_2" or "scope_1_2_3"

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
    
    # Check if base year emissions data exists for selected facilities
    # First, check if all facilities are selected and org-level data exists
    all_org_facilities = await db.facilities.find(
        {"organization_id": org_id, "is_active": True},
        {"_id": 0, "id": 1}
    ).to_list(1000)
    all_facility_ids = {f["id"] for f in all_org_facilities}
    selected_facility_ids = {f["id"] for f in facilities_data}
    
    # Check if all facilities are selected
    all_facilities_selected = all_facility_ids and selected_facility_ids == all_facility_ids
    
    # Check for org-level base year data
    org_base_year_record = await db.base_year_emissions.find_one(
        {"organization_id": org_id, "facility_id": None},
        {"_id": 0, "id": 1}
    )
    
    # If all facilities selected and org-level data exists, skip facility-level check
    if all_facilities_selected and org_base_year_record:
        pass  # Org-level data suffices
    else:
        # Check individual facility base year data
        missing_base_year = []
        for facility in facilities_data:
            base_year_record = await db.base_year_emissions.find_one(
                {"facility_id": facility["id"]}, 
                {"_id": 0, "id": 1}
            )
            if not base_year_record:
                missing_base_year.append(facility.get("name", facility["id"]))
        
        if missing_base_year:
            raise HTTPException(
                status_code=400, 
                detail=f"Base year emissions data is required before generating the report. Missing for: {', '.join(missing_base_year)}"
            )
    
    # Get emissions within reporting period
    emissions_data = []
    for facility in facilities_data:
        # Fetch monthly records with date range filter
        monthly_query = {
            "facility_id": facility["id"],
            "frequency_type": {"$ne": "yearly"},
            "reporting_period": {
                "$gte": request.reporting_period_start,
                "$lte": request.reporting_period_end
            }
        }
        cursor = db.emission_records.find(monthly_query, {"_id": 0})
        monthly_emissions = await cursor.to_list(length=1000)
        emissions_data.extend(monthly_emissions)
        
        # Fetch yearly records separately (CY/FY format doesn't work with string comparison)
        # These will be filtered by _filter_emissions_by_period in the report generator
        yearly_query = {
            "facility_id": facility["id"],
            "frequency_type": "yearly"
        }
        cursor = db.emission_records.find(yearly_query, {"_id": 0})
        yearly_emissions = await cursor.to_list(length=1000)
        emissions_data.extend(yearly_emissions)
    
    # Get previous years data if requested
    previous_years_data = []
    if request.include_previous_years:
        for facility in facilities_data:
            # Get ONLY emissions BEFORE the reporting period start (not within the period)
            # This prevents double-counting emissions that are already in emissions_data
            query = {
                "facility_id": facility["id"],
                "reporting_period": {"$lt": request.reporting_period_start}
            }
            cursor = db.emission_records.find(query, {"_id": 0})
            prev_facility_emissions = await cursor.to_list(length=1000)
            previous_years_data.extend(prev_facility_emissions)
        # Add ONLY previous years emissions to emissions_data
        emissions_data.extend(previous_years_data)
    
    # Get sinks data within reporting period
    sinks_data = []
    for facility in facilities_data:
        # Filter sinks by start_date (YYYY-MM-DD format, present on all sinks)
        sinks_query = {
            "facility_id": facility["id"],
            "start_date": {
                "$gte": f"{request.reporting_period_start}-01",
                "$lte": f"{request.reporting_period_end}-31"
            }
        }
        cursor = db.sinks.find(sinks_query, {"_id": 0})
        facility_sinks = await cursor.to_list(length=1000)
        sinks_data.extend(facility_sinks)
    
    # Calculate total sinks for this period
    total_sinks = sum(s.get("total_emissions_reduced", 0) for s in sinks_data)
    
    # Filter emissions based on report_type
    # For scope_1_2 report: exclude scope3 emissions, include only biogenic scope1
    # For scope_1_2_3 report: include all emissions
    if request.report_type == "scope_1_2":
        filtered_emissions = []
        for e in emissions_data:
            scope = (e.get("scope") or "").lower()
            # Include scope1 and scope2
            if scope in ["scope1", "scope2"]:
                filtered_emissions.append(e)
            # Include biogenic only if it's scope1 (direct biogenic)
            elif scope == "biogenic":
                biogenic_selection = (e.get("biogenic_scope_selection") or "").lower()
                # Include only direct/scope1 biogenic emissions
                if biogenic_selection in ["scope1", "direct", ""]:
                    filtered_emissions.append(e)
            # Exclude scope3
        emissions_data = filtered_emissions
    # For scope_1_2_3: include everything (no filtering needed)
    
    # Prepare facility production data
    facility_production_data = {}
    if request.facility_production:
        for fid, prod in request.facility_production.items():
            if prod.quantity and prod.unit:
                facility_production_data[fid] = {
                    'quantity': float(prod.quantity),
                    'unit': prod.unit
                }
    
    # Generate report - pass backend URL for internal file access
    generator = GHGReportGenerator(backend_base_url='http://localhost:8001')
    report_buffer = generator.generate_report(
        organization=organization,
        facilities=facilities_data,
        emissions=emissions_data,
        reporting_period_start=request.reporting_period_start,
        reporting_period_end=request.reporting_period_end,
        include_previous_years=request.include_previous_years,
        sinks_total=total_sinks,
        sinks_data=sinks_data,
        facility_production=facility_production_data,
        report_type=request.report_type
    )
    
    # Generate filename based on format
    org_name = organization.get('name', 'Organization').replace(' ', '_')
    file_extension = "pdf" if request.output_format == "pdf" else "docx"
    filename = f"GHG_Inventory_Report_{org_name}_{request.reporting_period_start}_{request.reporting_period_end}.{file_extension}"
    
    # Convert to PDF if requested using Playwright
    if request.output_format == "pdf":
        try:
            import tempfile
            import os
            import mammoth
            
            # Save docx to temp file
            with tempfile.NamedTemporaryFile(suffix='.docx', delete=False) as temp_docx:
                report_buffer.seek(0)
                temp_docx.write(report_buffer.read())
                temp_docx_path = temp_docx.name
            
            # Convert DOCX to HTML using mammoth
            with open(temp_docx_path, 'rb') as docx_file:
                result = mammoth.convert_to_html(docx_file)
                html_content = result.value
            
            # Create styled HTML document
            styled_html = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    @page {{
                        size: A4;
                        margin: 20mm;
                    }}
                    body {{
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        font-size: 11pt;
                        line-height: 1.5;
                        color: #333;
                        max-width: 100%;
                    }}
                    h1 {{ font-size: 18pt; color: #1a5f2a; margin-top: 20px; margin-bottom: 10px; }}
                    h2 {{ font-size: 14pt; color: #2d7d46; margin-top: 16px; margin-bottom: 8px; }}
                    h3 {{ font-size: 12pt; color: #3d9d56; margin-top: 12px; margin-bottom: 6px; }}
                    p {{ margin: 8px 0; text-align: justify; }}
                    table {{
                        width: 100%;
                        border-collapse: collapse;
                        margin: 10px 0;
                        font-size: 10pt;
                    }}
                    th, td {{
                        border: 1px solid #ddd;
                        padding: 6px 8px;
                        text-align: left;
                    }}
                    th {{
                        background-color: #f5f5f5;
                        font-weight: bold;
                    }}
                    img {{
                        max-width: 100%;
                        height: auto;
                        margin: 10px 0;
                    }}
                    .page-break {{
                        page-break-before: always;
                    }}
                </style>
            </head>
            <body>
                {html_content}
            </body>
            </html>
            """
            
            # Save HTML to temp file
            with tempfile.NamedTemporaryFile(suffix='.html', delete=False, mode='w', encoding='utf-8') as temp_html:
                temp_html.write(styled_html)
                temp_html_path = temp_html.name
            
            # Use Playwright async API to generate PDF
            from playwright.async_api import async_playwright
            
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()
                await page.goto(f'file://{temp_html_path}')
                
                pdf_bytes = await page.pdf(
                    format='A4',
                    margin={'top': '20mm', 'bottom': '20mm', 'left': '15mm', 'right': '15mm'},
                    print_background=True
                )
                await browser.close()
            
            report_buffer = io.BytesIO(pdf_bytes)
            report_buffer.seek(0)
            
            # Cleanup temp files
            os.unlink(temp_docx_path)
            os.unlink(temp_html_path)
            
            logger.info("PDF generated successfully using Playwright")
            
        except Exception as e:
            # Fallback to docx if PDF conversion fails
            logger.error(f"PDF conversion error: {str(e)}")
            filename = filename.replace('.pdf', '.docx')
            report_buffer.seek(0)
    
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
    
    # Note: Token is NOT deleted immediately - it will expire after 5 minutes
    # This allows retry if download fails in sandboxed environments
    
    # Determine content type from filename
    filename = download_data['filename']
    if filename.endswith('.pdf'):
        content_type = "application/pdf"
    else:
        content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    
    return StreamingResponse(
        buffer,
        media_type=content_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ============== AI REPORT GENERATION ==============

class AIReportRequest(BaseModel):
    facility_ids: List[str]
    reporting_period_start: str
    reporting_period_end: str

async def aggregate_emissions_for_ai(organization_id: str, facility_ids: List[str], start_period: str, end_period: str) -> dict:
    """Aggregate emission data for AI report generation - applies equity share if applicable"""
    
    # Get organization info
    org = await db.organizations.find_one({"id": organization_id}, {"_id": 0})
    if not org:
        return None
    
    # Check if equity share approach is used
    use_equity_share = org.get("org_boundaries_approach") == "equity_share"
    
    # Get facilities that belong to the organization AND are in the requested list
    facilities = await db.facilities.find({
        "id": {"$in": facility_ids},
        "organization_id": organization_id
    }, {"_id": 0}).to_list(100)
    
    if not facilities:
        return None
    
    # Build facility equity map
    facility_equity_map = {}
    for f in facilities:
        if use_equity_share:
            equity_pct = f.get("equity_share_percentage", 100.0) or 100.0
            facility_equity_map[f['id']] = equity_pct / 100.0
        else:
            facility_equity_map[f['id']] = 1.0
    
    # Use only the facility IDs that actually belong to this org
    valid_facility_ids = [f['id'] for f in facilities]
    
    # Query emission_records (the main emissions collection used by the app)
    emissions = await db.emission_records.find({
        "facility_id": {"$in": valid_facility_ids}
    }, {"_id": 0}).to_list(10000)
    
    # Filter by date range
    def is_in_range(reporting_period: str) -> bool:
        if not reporting_period:
            return False
        period = reporting_period.split(' to ')[0] if ' to ' in reporting_period else reporting_period
        return start_period <= period <= end_period
    
    filtered_emissions = [e for e in emissions if is_in_range(e.get('reporting_period', ''))]
    
    if not filtered_emissions:
        return None
    
    # Helper to get CO2e value with equity share adjustment
    def get_co2e(e):
        raw_value = e.get('calculated_co2e') or e.get('co2e_emissions') or e.get('total_emissions') or 0
        facility_id = e.get('facility_id')
        equity_factor = facility_equity_map.get(facility_id, 1.0)
        return raw_value * equity_factor
    
    # Aggregate by scope (with equity adjustment applied)
    scope1_total = sum(get_co2e(e) for e in filtered_emissions if e.get('scope') == 'scope1')
    scope2_total = sum(get_co2e(e) for e in filtered_emissions if e.get('scope') == 'scope2')
    biogenic_total = sum(get_co2e(e) for e in filtered_emissions if e.get('scope') == 'biogenic')
    
    gross_emissions = scope1_total + scope2_total
    
    # Get sinks data with equity adjustment
    sinks = await db.sinks.find({
        "facility_id": {"$in": valid_facility_ids}
    }, {"_id": 0}).to_list(1000)
    
    # Filter sinks by date range - check multiple date formats
    def is_sink_in_range(s):
        # Try reporting_period first (YYYY-MM format)
        if s.get('reporting_period'):
            period = s['reporting_period']
            return start_period <= period <= end_period
        
        # Try start_date (YYYY-MM-DD format)
        if s.get('start_date'):
            start_str = s['start_date']
            if isinstance(start_str, str) and len(start_str) >= 7:
                period = start_str[:7]  # Get YYYY-MM
                return start_period <= period <= end_period
        
        # Try reporting_year and reporting_month
        if s.get('reporting_year'):
            year = s['reporting_year']
            month = s.get('reporting_month', 0) + 1  # 0-indexed to 1-indexed
            period = f"{year}-{month:02d}"
            return start_period <= period <= end_period
        
        return False
    
    filtered_sinks = [s for s in sinks if is_sink_in_range(s)]
    
    # Calculate total sinks with equity adjustment
    total_sinks = 0
    sinks_breakdown = []
    facility_name_map = {f['id']: f['name'] for f in facilities}
    
    for s in filtered_sinks:
        # Use total_emissions_reduced (the actual field name)
        sink_value = s.get('total_emissions_reduced', 0) or 0
        equity_factor = facility_equity_map.get(s.get('facility_id'), 1.0)
        adjusted_value = sink_value * equity_factor
        total_sinks += adjusted_value
        
        if sink_value > 0:
            sinks_breakdown.append({
                "sink_type": s.get('sink_type') or s.get('type') or 'Carbon Sink',
                "description": s.get('description') or '',
                "emissions_reduced_tco2e": round(adjusted_value, 4),
                "facility": facility_name_map.get(s.get('facility_id'), 'Unknown'),
                "period": s.get('reporting_period') or s.get('start_date', '')[:7] if s.get('start_date') else ''
            })
    
    # Aggregate by category (with equity adjustment)
    category_breakdown = {}
    for e in filtered_emissions:
        cat = e.get('category', 'Unknown')
        if cat not in category_breakdown:
            category_breakdown[cat] = {'co2e': 0, 'count': 0}
        category_breakdown[cat]['co2e'] += get_co2e(e)
        category_breakdown[cat]['count'] += 1
    
    # Sort categories by emissions
    sorted_categories = sorted(category_breakdown.items(), key=lambda x: x[1]['co2e'], reverse=True)
    
    # Aggregate by facility (with equity adjustment)
    facility_breakdown = {}
    for e in filtered_emissions:
        fid = e.get('facility_id')
        if fid not in facility_breakdown:
            facility_breakdown[fid] = {'co2e': 0, 'count': 0, 'equity_pct': facility_equity_map.get(fid, 1.0) * 100}
        facility_breakdown[fid]['co2e'] += get_co2e(e)
        facility_breakdown[fid]['count'] += 1
    
    # Map facility names with equity info
    facility_name_map = {f['id']: f['name'] for f in facilities}
    facility_data = [
        {
            'name': facility_name_map.get(fid, 'Unknown'), 
            'co2e': data['co2e'], 
            'count': data['count'],
            'equity_share_pct': data['equity_pct']
        }
        for fid, data in facility_breakdown.items()
    ]
    facility_data.sort(key=lambda x: x['co2e'], reverse=True)
    
    # Check for custom factors usage
    custom_factor_count = sum(1 for e in filtered_emissions if e.get('is_custom_factor'))
    override_count = sum(1 for e in filtered_emissions if e.get('override_calorific_value') or e.get('override_density'))
    
    # Build aggregated data (safe for AI - no PII)
    aggregated_data = {
        "organization_name": org.get('name', 'Organization'),
        "reporting_period": f"{start_period} to {end_period}",
        "consolidation_approach": "Equity Share" if use_equity_share else "Control (Operational/Financial)",
        "equity_share_applied": use_equity_share,
        "facilities_count": len(facilities),
        "facility_names": [f['name'] for f in facilities],
        "total_emission_records": len(filtered_emissions),
        "emissions_summary": {
            "gross_emissions_tco2e": round(gross_emissions, 4),
            "scope1_tco2e": round(scope1_total, 4),
            "scope2_tco2e": round(scope2_total, 4),
            "biogenic_tco2e": round(biogenic_total, 4),
            "carbon_sinks_tco2e": round(total_sinks, 4),
            "net_emissions_tco2e": round(gross_emissions - total_sinks, 4)
        },
        "scope1_percentage": round((scope1_total / gross_emissions * 100) if gross_emissions > 0 else 0, 1),
        "scope2_percentage": round((scope2_total / gross_emissions * 100) if gross_emissions > 0 else 0, 1),
        "breakdown_by_category": [
            {"category": cat, "co2e_tco2e": round(data['co2e'], 4), "record_count": data['count']}
            for cat, data in sorted_categories[:10]
        ],
        "breakdown_by_facility": facility_data[:10],
        "carbon_sinks_details": {
            "total_sinks_tco2e": round(total_sinks, 4),
            "sinks_count": len(filtered_sinks),
            "breakdown": sinks_breakdown[:10] if sinks_breakdown else []
        },
        "data_quality": {
            "custom_emission_factors_used": custom_factor_count,
            "parameter_overrides_used": override_count,
            "total_records": len(filtered_emissions)
        }
    }
    
    return aggregated_data


async def generate_ai_summary(aggregated_data: dict, mask_org_name: bool = True) -> str:
    """Generate executive summary using Claude AI
    
    Args:
        aggregated_data: The emissions data to analyze
        mask_org_name: If True, masks organization and facility names before sending to AI
    """
    
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    # Store original names and create masking mappings
    original_org_name = aggregated_data.get("organization_name", "Organization")
    masked_org_name = "[THE ORGANIZATION]"
    
    # Create facility name mappings
    facility_name_mapping = {}  # {masked_name: original_name}
    
    # Create a copy of data with masked names for AI
    ai_data = aggregated_data.copy()
    if mask_org_name:
        ai_data["organization_name"] = masked_org_name
        
        # Mask facility names in breakdown_by_facility
        if "breakdown_by_facility" in ai_data:
            masked_facilities = []
            for i, facility in enumerate(ai_data["breakdown_by_facility"]):
                original_name = facility.get("facility_name", f"Facility {i+1}")
                masked_name = f"[FACILITY_{i+1}]"
                facility_name_mapping[masked_name] = original_name
                
                masked_facility = facility.copy()
                masked_facility["facility_name"] = masked_name
                masked_facilities.append(masked_facility)
            ai_data["breakdown_by_facility"] = masked_facilities
        
        # Also mask in sinks_by_facility if present
        if "sinks_by_facility" in ai_data:
            masked_sinks = []
            for sink in ai_data["sinks_by_facility"]:
                original_name = sink.get("facility_name", "Unknown")
                # Find corresponding masked name or create new one
                masked_name = None
                for mname, oname in facility_name_mapping.items():
                    if oname == original_name:
                        masked_name = mname
                        break
                if not masked_name:
                    idx = len(facility_name_mapping) + 1
                    masked_name = f"[FACILITY_{idx}]"
                    facility_name_mapping[masked_name] = original_name
                
                masked_sink = sink.copy()
                masked_sink["facility_name"] = masked_name
                masked_sinks.append(masked_sink)
            ai_data["sinks_by_facility"] = masked_sinks
    
    equity_context = ""
    if aggregated_data.get("equity_share_applied"):
        equity_context = """
IMPORTANT CONTEXT: This organization uses the EQUITY SHARE consolidation approach. All emission figures have been adjusted 
based on each facility's equity share percentage. Mention this in your summary - that emissions are reported 
proportionally based on the organization's equity stake in each facility.
"""
    
    system_prompt = f"""You are an expert Chief Sustainability Officer (CSO) assistant writing an executive summary and strategic action plan for a corporate GHG emissions report.
You will be provided with pre-calculated, verified emissions data in JSON format.
{equity_context}
CORE REPORTING RULES:
1. STRICT DATA INTEGRITY: Do NOT calculate, invent, or estimate any metrics. Use ONLY the exact quantitative values provided in the JSON.
2. Format the output using clear Markdown headings and bullet points for readability.
3. Keep the tone objective, clinical for the data, and strategic for the recommendations.
4. The output of the emissions should always be shown in units tCO2e (tonnes of CO2 equivalent) with exactly 2 decimal places.
5. When referring to the organization, use "{masked_org_name}" exactly as provided - do not use any other name.
6. When referring to facilities, use the facility names exactly as provided in the data (e.g., [FACILITY_1], [FACILITY_2]).
7. All numerical values should be formatted to exactly 2 decimal places.

REQUIRED STRUCTURE:

### 1. Executive Emissions Overview
Provide a detailed summary of total gross emissions, net emissions, and the Scope 1 & 2 breakdown. Mention the reporting period and number of facilities covered. Report Net GHG Emissions first, then mention Biogenic emissions separately if they exist. Note if custom emission factors or overrides were used (critical for audit transparency).

### 2. Primary Emission Drivers
Analyze the 'breakdown_by_category' data. Identify and explain the top sources driving the carbon footprint so stakeholders understand exactly where the emissions are coming from.

### 3. Strategic Decarbonization & Reduction Pathways
Based strictly on the highest emitting categories identified above, provide 3 to 4 tailored, actionable recommendations to reduce emissions. 
- Tailor the advice: If mobile combustion is a primary driver, suggest fleet electrification or logistics optimization. If stationary combustion/electricity is high, suggest renewable energy procurement (PPAs) or HVAC efficiency upgrades.
- Where applicable for hard-to-abate emissions, include brief suggestions on carbon capture technology, transitioning to low-carbon alternative fuels, or investing in verified carbon sinks/offsets.
"""
    
    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1500,
            temperature=0.3,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": json.dumps(ai_data)
                }
            ]
        )
        
        ai_response = message.content[0].text
        
        # Unmask: Replace masked names with original names
        if mask_org_name:
            # Replace organization name
            ai_response = ai_response.replace(masked_org_name, original_org_name)
            ai_response = ai_response.replace("[THE ORGANIZATION]", original_org_name)
            ai_response = ai_response.replace("THE ORGANIZATION", original_org_name)
            ai_response = ai_response.replace("the organization", original_org_name)
            
            # Replace facility names
            for masked_name, original_name in facility_name_mapping.items():
                ai_response = ai_response.replace(masked_name, original_name)
        
        return ai_response
        
    except anthropic.APIError as e:
        logger.error(f"Anthropic API Error: {e}")
        error_msg = str(e)
        if "credit balance" in error_msg.lower() or "billing" in error_msg.lower():
            raise HTTPException(status_code=402, detail="AI service credits exhausted. Please add balance to your Anthropic account.")
        raise HTTPException(status_code=500, detail="Failed to generate AI summary. Please try again later.")


def generate_ai_report_pdf(aggregated_data: dict, ai_summary: str) -> io.BytesIO:
    """Generate a PDF report with AI executive summary"""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Frame, PageTemplate, BaseDocTemplate
    from reportlab.pdfgen import canvas
    
    buffer = io.BytesIO()
    
    # Border color - darker blue (#1E3A5F)
    BORDER_COLOR = colors.HexColor('#1E3A5F')
    
    def add_page_border(canvas_obj, doc):
        """Draw border on each page"""
        canvas_obj.saveState()
        canvas_obj.setStrokeColor(BORDER_COLOR)
        canvas_obj.setLineWidth(2)
        # Draw rectangle with margin from edges
        margin = 20
        canvas_obj.rect(margin, margin, A4[0] - 2*margin, A4[1] - 2*margin)
        canvas_obj.restoreState()
    
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=A4, 
        topMargin=0.75*inch, 
        bottomMargin=0.75*inch,
        leftMargin=0.75*inch,
        rightMargin=0.75*inch
    )
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=20,
        spaceAfter=20,
        textColor=colors.HexColor('#1a365d'),
        alignment=1  # Center
    )
    
    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent=styles['Normal'],
        fontSize=12,
        textColor=colors.HexColor('#4a5568'),
        alignment=1,
        spaceAfter=30
    )
    
    section_style = ParagraphStyle(
        'Section',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#2d3748'),
        spaceBefore=20,
        spaceAfter=10
    )
    
    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#2d3748'),
        spaceAfter=12,
        leading=14
    )
    
    elements = []
    
    # Title
    elements.append(Paragraph("AI Executive Summary Report", title_style))
    elements.append(Paragraph(f"{aggregated_data['organization_name']}", subtitle_style))
    
    # Report metadata
    meta_data = [
        ["Reporting Period:", aggregated_data['reporting_period']],
        ["Consolidation Approach:", aggregated_data.get('consolidation_approach', 'Control')],
        ["Facilities Covered:", str(aggregated_data['facilities_count'])],
        ["Generated:", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")]
    ]
    
    meta_table = Table(meta_data, colWidths=[2*inch, 4*inch])
    meta_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#4a5568')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 20))
    
    # Emissions Summary Section
    elements.append(Paragraph("Emissions Summary", section_style))
    
    emissions = aggregated_data['emissions_summary']
    summary_data = [
        ["Metric", "Value (tCO2e)"],
        ["Gross Emissions (Scope 1 + 2)", f"{emissions['gross_emissions_tco2e']:,.2f}"],
        ["Scope 1 Emissions", f"{emissions['scope1_tco2e']:,.2f}"],
        ["Scope 2 Emissions", f"{emissions['scope2_tco2e']:,.2f}"],
        ["Carbon Sinks", f"{emissions['carbon_sinks_tco2e']:,.2f}"],
        ["Net Emissions", f"{emissions['net_emissions_tco2e']:,.2f}"],
        ["Biogenic Emissions", f"{emissions['biogenic_tco2e']:,.2f}"],
    ]
    
    summary_table = Table(summary_data, colWidths=[3.5*inch, 2.5*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2d3748')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f7fafc')]),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 20))
    
    # AI Executive Summary Section
    elements.append(Paragraph("AI Analysis & Recommendations", section_style))
    
    # Custom styles for markdown rendering
    heading_style = ParagraphStyle(
        'Heading',
        parent=styles['Heading3'],
        fontSize=11,
        textColor=colors.HexColor('#1a365d'),
        spaceBefore=12,
        spaceAfter=6,
        fontName='Helvetica-Bold'
    )
    
    bullet_style = ParagraphStyle(
        'Bullet',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#2d3748'),
        leftIndent=20,
        spaceAfter=4,
        leading=14,
        bulletIndent=10
    )
    
    # Process AI summary with markdown support
    # Clean special characters that don't render in PDF
    def clean_for_pdf(text):
        # Replace subscript/superscript characters with ASCII equivalents
        replacements = {
            '₂': '2', '₃': '3', '₄': '4',
            '²': '2', '³': '3',
            'CO₂': 'CO2', 'tCO₂e': 'tCO2e',
            '–': '-', '—': '-',
            ''': "'", ''': "'",
            '"': '"',  # Left double quote
        }
        # Also replace right double quote (handled separately to avoid dict key collision)
        text = text.replace('"', '"')
        for old, new in replacements.items():
            text = text.replace(old, new)
        # Remove markdown formatting
        text = text.replace('**', '').replace('*', '')
        # Remove markdown heading markers
        text = text.lstrip('#').strip()
        return text
    
    lines = ai_summary.strip().split('\n')
    for line in lines:
        line = line.strip()
        if not line:
            elements.append(Spacer(1, 6))
            continue
        
        # Check if it's a heading (starts with # or ##)
        is_heading = line.startswith('#')
        
        # Clean the line
        line = clean_for_pdf(line)
        
        if not line:
            continue
        
        # Handle headings
        if is_heading:
            elements.append(Paragraph(line, heading_style))
        # Handle bullet points
        elif line.startswith('-') or line.startswith('•'):
            bullet_text = line.lstrip('-•').strip()
            elements.append(Paragraph(f"• {bullet_text}", bullet_style))
        # Regular paragraph
        else:
            elements.append(Paragraph(line, body_style))
    
    elements.append(Spacer(1, 20))
    
    # Category Breakdown
    if aggregated_data.get('breakdown_by_category'):
        elements.append(Paragraph("Emissions by Category", section_style))
        
        cat_data = [["Category", "Emissions (tCO2e)", "Records"]]
        for cat in aggregated_data['breakdown_by_category'][:5]:
            cat_data.append([
                cat['category'],
                f"{cat['co2e_tco2e']:,.2f}",
                str(cat['record_count'])
            ])
        
        cat_table = Table(cat_data, colWidths=[3*inch, 1.75*inch, 1.25*inch])
        cat_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2d3748')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(cat_table)
    
    # Carbon Sinks Section
    sinks_details = aggregated_data.get('carbon_sinks_details', {})
    if sinks_details.get('total_sinks_tco2e', 0) > 0 or sinks_details.get('breakdown'):
        elements.append(Spacer(1, 15))
        elements.append(Paragraph("Carbon Sinks & Offsets", section_style))
        
        if sinks_details.get('breakdown'):
            sinks_data = [["Sink Type", "Description", "CO2 Reduced (tCO2e)", "Facility"]]
            for sink in sinks_details['breakdown'][:5]:
                # Truncate facility name if too long to fit
                facility_name = sink.get('facility', 'Unknown')
                if len(facility_name) > 20:
                    facility_name = facility_name[:18] + '..'
                sinks_data.append([
                    sink.get('sink_type', 'Carbon Sink'),
                    (sink.get('description', '')[:25] + '..' if len(sink.get('description', '')) > 25 else sink.get('description', '')),
                    f"{sink.get('emissions_reduced_tco2e', 0):,.2f}",
                    facility_name
                ])
            
            # Adjusted column widths to fit facility names better
            sinks_table = Table(sinks_data, colWidths=[1.3*inch, 1.8*inch, 1.4*inch, 1.5*inch])
            sinks_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#047857')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),  # Slightly smaller font
                ('ALIGN', (2, 0), (2, -1), 'RIGHT'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1fae5')),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('WORDWRAP', (0, 0), (-1, -1), True),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ]))
            elements.append(sinks_table)
        else:
            elements.append(Paragraph(f"Total Carbon Sinks: {sinks_details.get('total_sinks_tco2e', 0):,.2f} tCO2e", body_style))
    
    # Build PDF with border on each page
    doc.build(elements, onFirstPage=add_page_border, onLaterPages=add_page_border)
    buffer.seek(0)
    return buffer


@api_router.post("/reports/ai-summary")
async def generate_ai_report_summary(
    request: AIReportRequest,
    current_user: dict = Depends(get_current_user)
):
    """Generate AI-powered executive summary PDF for emissions data"""
    
    if not request.facility_ids:
        raise HTTPException(status_code=400, detail="Please select at least one facility")
    
    if not request.reporting_period_start or not request.reporting_period_end:
        raise HTTPException(status_code=400, detail="Please specify reporting period")
    
    # Get organization from user
    organization_id = current_user.get('organization_id')
    if not organization_id:
        raise HTTPException(status_code=400, detail="User not associated with an organization")
    
    # Aggregate emissions data (with equity share applied if applicable)
    aggregated_data = await aggregate_emissions_for_ai(
        organization_id,
        request.facility_ids,
        request.reporting_period_start,
        request.reporting_period_end
    )
    
    if not aggregated_data:
        raise HTTPException(status_code=404, detail="No emission records found for the selected facilities and period")
    
    # Generate AI summary
    ai_summary = await generate_ai_summary(aggregated_data)
    
    # Generate PDF
    pdf_buffer = generate_ai_report_pdf(aggregated_data, ai_summary)
    
    # Create download token
    download_token = str(uuid.uuid4())
    org_name = aggregated_data['organization_name'].replace(' ', '_')
    filename = f"AI_Executive_Summary_{org_name}_{request.reporting_period_start}_to_{request.reporting_period_end}.pdf"
    
    pending_downloads[download_token] = {
        "buffer": pdf_buffer.getvalue(),
        "filename": filename
    }
    
    return {
        "success": True,
        "download_token": download_token,
        "filename": filename,
        "message": "AI Summary PDF generated successfully"
    }


# File upload endpoint for evidence documents
from r2_storage import get_r2_storage, R2Storage

@api_router.post("/upload/evidence")
async def upload_evidence_file(
    file: UploadFile = File(...),
    bucket_type: str = Query(default="emission_evidence", description="Bucket type: emission_evidence, sinks_evidence, org_facility, superadmin"),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload evidence files to Cloudflare R2 storage.
    
    bucket_type options:
    - emission_evidence: For emission record evidence files
    - sinks_evidence: For carbon sinks evidence files  
    - org_facility: For organization/facility attachments (including logos)
    - superadmin: For superadmin uploads (invoice history, etc.)
    """
    # Validate bucket type
    valid_bucket_types = ['emission_evidence', 'sinks_evidence', 'org_facility', 'superadmin']
    if bucket_type not in valid_bucket_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid bucket_type. Valid options: {', '.join(valid_bucket_types)}"
        )
    
    # Restrict superadmin bucket to super_admin users
    if bucket_type == 'superadmin' and current_user.get('role') != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can upload to superadmin bucket")
    
    # Validate file type
    allowed_types = [
        'application/pdf',
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  # xlsx
        'application/vnd.ms-excel',  # xls
        'text/csv',
        'application/msword',  # doc
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'  # docx
    ]
    
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400, 
            detail="File type not allowed. Supported types: PDF, Images (JPG, PNG, GIF, WebP), Excel (XLS, XLSX), CSV, Word (DOC, DOCX)"
        )
    
    # Validate file size (max 5MB)
    max_size = 5 * 1024 * 1024  # 5MB
    file_content = await file.read()
    if len(file_content) > max_size:
        raise HTTPException(status_code=400, detail="File size too large. Maximum size is 5MB")
    
    try:
        # Upload to R2
        r2 = get_r2_storage()
        result = await r2.upload_file(
            file_content=file_content,
            filename=file.filename,
            bucket_type=bucket_type,
            content_type=file.content_type,
            metadata={
                'uploaded_by': current_user["id"],
                'original_filename': file.filename
            }
        )
        
        # Store file metadata in database
        file_record = {
            "id": str(uuid.uuid4()),
            "original_filename": file.filename,
            "stored_filename": result['key'],
            "bucket_name": result['bucket'],
            "bucket_type": bucket_type,
            "r2_key": result['key'],
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
            "bucket_type": bucket_type,
            "url": f"/api/files/{file_record['id']}"
        }
        
    except Exception as e:
        logging.error(f"R2 upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")

# File download endpoint - returns presigned URL for R2 files
@api_router.get("/files/{file_id}")
async def download_file(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    file_record = await db.uploaded_files.find_one({"id": file_id}, {"_id": 0})
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    # R2 file - generate presigned URL
    if not file_record.get("bucket_type") or not file_record.get("r2_key"):
        raise HTTPException(status_code=404, detail="File not found in storage")
    
    try:
        r2 = get_r2_storage()
        
        # Generate presigned URL with content disposition for download
        original_filename = file_record.get('original_filename', 'download')
        safe_filename = ''.join(c if c.isascii() and c.isprintable() else '_' for c in original_filename)
        
        presigned_url = r2.generate_presigned_url(
            bucket_type=file_record["bucket_type"],
            key=file_record["r2_key"],
            expiration=3600,  # 1 hour
            response_content_disposition=f"attachment; filename={safe_filename}"
        )
        
        # Redirect to presigned URL
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=presigned_url, status_code=307)
        
    except Exception as e:
        logging.error(f"R2 download error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate download URL: {str(e)}")

# Public file view endpoint (for logos, images and PDFs - no authentication required)
@api_router.get("/files/{file_id}/view")
async def view_file_public(file_id: str):
    """Public endpoint to view files (used for logo previews in img tags and PDF viewing)"""
    file_record = await db.uploaded_files.find_one({"id": file_id}, {"_id": 0})
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Allow image files and PDFs to be viewed publicly
    content_type = file_record.get("content_type", "")
    allowed_view_types = ["image/", "application/pdf"]
    is_allowed = any(content_type.startswith(t) if t.endswith("/") else content_type == t for t in allowed_view_types)
    
    if not is_allowed:
        raise HTTPException(status_code=403, detail="Only image and PDF files can be viewed publicly")
    
    # R2 file - generate presigned URL for inline viewing
    if not file_record.get("bucket_type") or not file_record.get("r2_key"):
        raise HTTPException(status_code=404, detail="File not found in storage")
    
    try:
        r2 = get_r2_storage()
        
        # For PDFs, set inline disposition
        disposition = None
        if content_type == "application/pdf":
            original_filename = file_record.get('original_filename', 'document.pdf')
            safe_filename = ''.join(c if c.isascii() and c.isprintable() else '_' for c in original_filename)
            disposition = f"inline; filename={safe_filename}"
        
        presigned_url = r2.generate_presigned_url(
            bucket_type=file_record["bucket_type"],
            key=file_record["r2_key"],
            expiration=3600,
            response_content_disposition=disposition
        )
        
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=presigned_url, status_code=307)
        
    except Exception as e:
        logging.error(f"R2 view error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate view URL: {str(e)}")

# Download endpoint - forces file download for any file type
@api_router.get("/files/{file_id}/download")
async def download_file_public(file_id: str):
    """Public endpoint to download any file as attachment - redirects to R2 presigned URL"""
    file_record = await db.uploaded_files.find_one({"id": file_id}, {"_id": 0})
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    if not file_record.get("bucket_type") or not file_record.get("r2_key"):
        raise HTTPException(status_code=404, detail="File not found in storage")
    
    original_filename = file_record.get('original_filename', 'file')
    # Make filename safe for Content-Disposition header
    import urllib.parse
    safe_filename = urllib.parse.quote(original_filename, safe='')
    
    # R2 file - generate presigned URL for download
    try:
        r2 = get_r2_storage()
        
        presigned_url = r2.generate_presigned_url(
            bucket_type=file_record["bucket_type"],
            key=file_record["r2_key"],
            expiration=3600,
            response_content_disposition=f"attachment; filename*=UTF-8''{safe_filename}"
        )
        
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=presigned_url, status_code=302)
        
    except Exception as e:
        logging.error(f"R2 download error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate download URL: {str(e)}")

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
    
    # Delete file from R2 storage
    if file_record.get("bucket_type") and file_record.get("r2_key"):
        try:
            r2 = get_r2_storage()
            await r2.delete_file(
                bucket_type=file_record["bucket_type"],
                key=file_record["r2_key"]
            )
        except Exception as e:
            logging.error(f"R2 delete error: {e}")
            # Continue to delete database record even if R2 delete fails
    
    # Delete record from database
    await db.uploaded_files.delete_one({"id": file_id})
    
    return {"message": "File deleted successfully"}

# Get file info - returns metadata without requiring download
@api_router.get("/files/{file_id}/info")
async def get_file_info(file_id: str):
    """Public endpoint to get file metadata (filename, size, type)"""
    file_record = await db.uploaded_files.find_one({"id": file_id}, {"_id": 0})
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    return {
        "id": file_record.get("id"),
        "filename": file_record.get("original_filename", "Unknown"),
        "content_type": file_record.get("content_type", "application/octet-stream"),
        "size": file_record.get("size", 0),
        "uploaded_at": file_record.get("uploaded_at"),
        "bucket_type": file_record.get("bucket_type")
    }

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
            "role": "user",
            "is_deleted": {"$ne": True}
        })
        if current_user_count >= max_users:
            raise HTTPException(
                status_code=400, 
                detail=f"Maximum user limit ({max_users}) reached for your organization"
            )
    
    # Check if email exists (exclude soft-deleted users to allow email reuse)
    existing = await db.users.find_one({"email": user_data.email, "is_deleted": {"$ne": True}}, {"_id": 0})
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
    
    # Get organization name for the email
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "name": 1})
    org_name = org.get("name", "your organization") if org else "your organization"
    
    # Get frontend URL
    frontend_url = os.environ.get('FRONTEND_URL', 'https://sustainrepo-preview-1.preview.emergentagent.com')
    
    # Send welcome email with beautiful template
    email_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8f9fa; padding: 40px 20px;">
            <tr>
                <td align="center">
                    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                        <!-- Header -->
                        <tr>
                            <td style="background-color: #ffffff; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; border-bottom: 1px solid #e5e7eb;">
                                <img src="https://customer-assets.emergentagent.com/job_d67b5362-a184-47b7-81eb-abb9d39b89dd/artifacts/qllw2r8k_Logo_v3.png" alt="SustainRepo Logo" style="width: 60px; height: 60px; border-radius: 8px; margin-bottom: 10px;">
                                <h1 style="color: #1f2937; margin: 10px 0 0 0; font-size: 24px; font-weight: 600;">SustainRepo</h1>
                                <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 14px;">Carbon Accounting Platform</p>
                            </td>
                        </tr>
                        <!-- Content -->
                        <tr>
                            <td style="padding: 40px 30px;">
                                <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 20px;">Welcome to SustainRepo!</h2>
                                <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                                    Hello <strong style="color: #2eb67d;">{user_data.full_name}</strong>,
                                </p>
                                <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 25px 0;">
                                    You have been invited to join <strong style="color: #2eb67d;">{org_name}</strong> on SustainRepo. Below are your login credentials:
                                </p>
                                <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                        <tr>
                                            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                                                <span style="color: #6b7280; font-size: 13px; display: block; margin-bottom: 4px;">Email</span>
                                                <strong style="color: #1f2937; font-size: 15px;">{user_data.email}</strong>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 10px 0;">
                                                <span style="color: #6b7280; font-size: 13px; display: block; margin-bottom: 4px;">Temporary Password</span>
                                                <div style="background-color: #ffffff; padding: 14px 20px; border-radius: 8px; border: 2px solid #2eb67d; display: inline-block;">
                                                    <code style="color: #000000; font-size: 20px; font-family: 'Courier New', Courier, monospace; letter-spacing: 3px; font-weight: bold;">{temp_password}</code>
                                                </div>
                                            </td>
                                        </tr>
                                    </table>
                                </div>
                                <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto 25px auto;">
                                    <tr>
                                        <td style="background-color: #2eb67d; border-radius: 8px;">
                                            <a href="{frontend_url}/login" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600;">Login to SustainRepo</a>
                                        </td>
                                    </tr>
                                </table>
                                <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px;">
                                    <p style="color: #92400e; font-size: 13px; margin: 0;">
                                        <strong>Important:</strong> Please change your password upon first login for security purposes.
                                    </p>
                                </div>
                            </td>
                        </tr>
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #f9fafb; padding: 20px 30px; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                                <p style="color: #6b7280; font-size: 12px; margin: 0; text-align: center;">
                                    &copy; 2026 SustainRepo. All rights reserved.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    await send_email(user_data.email, "Welcome to SustainRepo - Your Account is Ready!", email_body)
    
    # Don't return temp_password - it's sent via email only
    return {"message": "User created and email sent"}

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
    
    # Hard delete: permanently remove user from database
    await db.users.delete_one({"id": user_id})
    
    return {"message": "User deleted permanently."}

# Health check
@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}

# ----- Audit Trail Endpoints (Admin only) -----

class AuditLogQuery(BaseModel):
    """Query parameters for audit logs"""
    module: Optional[str] = None
    action: Optional[str] = None
    user_id: Optional[str] = None
    resource_id: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = None
    search: Optional[str] = None
    skip: int = 0
    limit: int = 50
    sort_by: str = "timestamp"
    sort_order: str = "desc"

@api_router.get("/audit-logs")
async def get_audit_logs(
    module: Optional[str] = None,
    action: Optional[str] = None,
    user_id: Optional[str] = None,
    resource_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    sort_by: str = "timestamp",
    sort_order: str = "desc",
    current_user: dict = Depends(get_current_user)
):
    """
    Get audit logs with filtering and pagination.
    Only accessible by admin and super_admin.
    """
    # Check if user is admin or super_admin
    if current_user["role"] not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Only admin users can access audit logs")
    
    # Get organization_id for non-super-admins
    organization_id = None if current_user["role"] == "super_admin" else current_user.get("organization_id")
    
    result = await audit_logger.get_logs(
        organization_id=organization_id,
        user_id=user_id,
        module=module,
        action=action,
        resource_id=resource_id,
        start_date=start_date,
        end_date=end_date,
        status=status,
        search=search,
        skip=skip,
        limit=limit,
        sort_by=sort_by,
        sort_order=sort_order
    )
    
    return result

@api_router.get("/audit-logs/summary")
async def get_audit_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get audit activity summary statistics.
    Only accessible by admin and super_admin.
    """
    if current_user["role"] not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Only admin users can access audit logs")
    
    organization_id = None if current_user["role"] == "super_admin" else current_user.get("organization_id")
    
    return await audit_logger.get_activity_summary(
        organization_id=organization_id,
        start_date=start_date,
        end_date=end_date
    )

@api_router.get("/audit-logs/{log_id}")
async def get_audit_log_detail(
    log_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get a single audit log entry by ID.
    Only accessible by admin and super_admin.
    """
    if current_user["role"] not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Only admin users can access audit logs")
    
    log = await audit_logger.get_log_by_id(log_id)
    
    if not log:
        raise HTTPException(status_code=404, detail="Audit log not found")
    
    # For non-super-admins, verify the log belongs to their organization
    if current_user["role"] != "super_admin":
        if log.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    
    return log

@api_router.get("/audit-logs/filters/options")
async def get_audit_filter_options(
    current_user: dict = Depends(get_current_user)
):
    """
    Get available filter options for audit logs (modules, actions, users).
    Only accessible by admin and super_admin.
    """
    if current_user["role"] not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Only admin users can access audit logs")
    
    # Get list of modules (excluding authentication since logins not tracked)
    modules = [
        {"value": "organization", "label": "Organization"},
        {"value": "facility", "label": "Facility"},
        {"value": "user", "label": "User Management"},
        {"value": "ghg_emission", "label": "GHG Emissions"},
        {"value": "ghg_sink", "label": "GHG Sinks"},
        {"value": "fuel_database", "label": "Fuel Database"},
        {"value": "emission_factor", "label": "Emission Factors"},
        {"value": "formula", "label": "Formulas"},
        {"value": "scope_category", "label": "Scopes & Categories"},
        {"value": "sector", "label": "Sectors"},
        {"value": "unit", "label": "Units"},
        {"value": "gwp_config", "label": "GWP Configuration"},
        {"value": "report", "label": "Reports"},
        {"value": "calculation_engine", "label": "Calculation Engine"},
        {"value": "file", "label": "File Operations"},
        {"value": "subscription", "label": "Subscription"},
        {"value": "settings", "label": "Settings"}
    ]
    
    # Get list of actions (excluding login/logout)
    actions = [
        {"value": "create", "label": "Create"},
        {"value": "update", "label": "Update"},
        {"value": "delete", "label": "Delete"},
        {"value": "view", "label": "View"},
        {"value": "calculate", "label": "Calculate"},
        {"value": "recalculate", "label": "Recalculate"},
        {"value": "import", "label": "Import"},
        {"value": "export", "label": "Export"},
        {"value": "upload", "label": "Upload"},
        {"value": "download", "label": "Download"},
        {"value": "activate", "label": "Activate"},
        {"value": "deactivate", "label": "Deactivate"},
        {"value": "approve", "label": "Approve"},
        {"value": "reject", "label": "Reject"},
        {"value": "assign", "label": "Assign"},
        {"value": "unassign", "label": "Unassign"},
        {"value": "configure", "label": "Configure"}
    ]
    
    # Get users in organization (for filtering)
    users = []
    query = {}
    if current_user["role"] != "super_admin":
        query["organization_id"] = current_user.get("organization_id")
    
    user_list = await db.users.find(query, {"_id": 0, "id": 1, "email": 1, "full_name": 1}).to_list(1000)
    users = [{"value": u["id"], "label": u.get("full_name") or u["email"]} for u in user_list]
    
    return {
        "modules": modules,
        "actions": actions,
        "users": users
    }

# ----- Dynamic Scopes & Categories (SuperAdmin-managed) -----
from scopes_module import build_scopes_router, seed_scopes_and_categories
api_router.include_router(build_scopes_router(db, get_current_user, get_super_admin_user))

# ----- Calc Engine (Phase 1: foundations) -----
from calc_engine import build_calc_engine_router, seed_calc_engine
api_router.include_router(build_calc_engine_router(db, get_current_user, get_super_admin_user))

# ----- Scope 3 Bulk Upload Module (Enterprise) -----
from fastapi import APIRouter
from bulk_upload_scope3.template_generator import generate_scope3_template
from bulk_upload_scope3.processors import UploadProcessor
from bulk_upload_scope3.report_generator import ReportGenerator
from bulk_upload_scope3.models import ValidationError, ErrorSeverity, UploadSummary, UploadStatus

scope3_bulk_router = APIRouter(prefix="/bulk-upload/scope3", tags=["Bulk Upload - Scope 3"])

@scope3_bulk_router.get("/template/download")
async def download_scope3_template(current_user: dict = Depends(get_current_user)):
    """Download Scope 3 bulk upload template"""
    organization_id = current_user.get("organization_id")
    if not organization_id:
        raise HTTPException(status_code=400, detail="User must belong to an organization")
    
    template_bytes = await generate_scope3_template(db, organization_id)
    
    return StreamingResponse(
        template_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=scope3_bulk_upload_template.xlsx"
        }
    )

@scope3_bulk_router.post("/upload")
async def upload_scope3_file(
    file: UploadFile = File(...),
    validate_only: bool = Query(True, description="If True, only validate without saving. User must call /save endpoint to save."),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload and validate Scope 3 bulk upload file.
    
    By default, this only validates the file without saving records.
    After validation, the user has 3 options:
    1. Save valid rows - POST /bulk-upload/scope3/jobs/{job_id}/save
    2. Download error report - GET /bulk-upload/scope3/jobs/{job_id}/errors/download
    3. Upload new file - POST /bulk-upload/scope3/upload (with corrected file)
    """
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="File must be an Excel file (.xlsx or .xls)")
    
    file_content = await file.read()
    if len(file_content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 10MB limit")
    
    organization_id = current_user.get("organization_id")
    if not organization_id:
        raise HTTPException(status_code=400, detail="User must belong to an organization")
    
    user_id = current_user.get("id") or current_user.get("user_id")
    
    processor = UploadProcessor(db, organization_id, user_id)
    summary = await processor.process_upload(file_content, file.filename, validate_only=validate_only)
    
    return summary

@scope3_bulk_router.get("/jobs/{job_id}")
async def get_scope3_job_status(job_id: str, current_user: dict = Depends(get_current_user)):
    """Get status of a bulk upload job"""
    organization_id = current_user.get("organization_id")
    job = await db.bulk_upload_jobs.find_one(
        {"id": job_id, "organization_id": organization_id},
        {"_id": 0}
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@scope3_bulk_router.post("/jobs/{job_id}/save")
async def save_scope3_valid_rows(job_id: str, current_user: dict = Depends(get_current_user)):
    """
    Save valid rows from a validated upload job.
    
    Call this after validation to save only the valid emission records.
    Records that failed validation will not be saved.
    """
    organization_id = current_user.get("organization_id")
    
    # Get job
    job = await db.bulk_upload_jobs.find_one(
        {"id": job_id, "organization_id": organization_id},
        {"_id": 0}
    )
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.get("created_emission_ids"):
        raise HTTPException(status_code=400, detail="Records already saved for this job")
    
    if job.get("success_count", 0) == 0:
        raise HTTPException(status_code=400, detail="No valid rows to save")
    
    # Get pending records from temporary storage
    pending_records = await db.bulk_upload_pending_records.find(
        {"job_id": job_id},
        {"_id": 0}
    ).to_list(10000)
    
    if not pending_records:
        raise HTTPException(
            status_code=400, 
            detail="No pending records found. Please re-upload the file with validate_only=false to save directly."
        )
    
    # Clean up records for insertion
    records_to_save = []
    for record in pending_records:
        # Remove the job_id field used for tracking
        record.pop("job_id", None)
        record.pop("_temp_id", None)
        records_to_save.append(record)
    
    # Insert records into emission_records collection (same as manual entry)
    if records_to_save:
        await db.emission_records.insert_many(records_to_save)
        created_ids = [r["id"] for r in records_to_save]
        
        # Update job with saved record IDs
        await db.bulk_upload_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "created_emission_ids": created_ids,
                "status": "completed" if job.get("error_count", 0) == 0 else "partial_success"
            }}
        )
        
        # Clean up pending records
        await db.bulk_upload_pending_records.delete_many({"job_id": job_id})
        
        return {
            "success": True,
            "saved_count": len(created_ids),
            "job_id": job_id,
            "emission_ids": created_ids
        }
    
    return {"success": False, "error": "No records to save"}


@scope3_bulk_router.get("/jobs/{job_id}/errors/download")
async def download_scope3_error_report(job_id: str, current_user: dict = Depends(get_current_user)):
    """Download error report for a bulk upload job"""
    organization_id = current_user.get("organization_id")
    job = await db.bulk_upload_jobs.find_one(
        {"id": job_id, "organization_id": organization_id},
        {"_id": 0}
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    errors = await db.bulk_upload_errors.find({"job_id": job_id}, {"_id": 0}).to_list(10000)
    error_objects = [
        ValidationError(
            sheet=e.get("sheet", ""),
            row=e.get("row", 0),
            column=e.get("column"),
            error_type=e.get("error_type", ""),
            message=e.get("message", ""),
            suggestion=e.get("suggestion"),
            severity=ErrorSeverity(e.get("severity", "error"))
        )
        for e in errors
    ]
    
    summary = UploadSummary(
        job_id=job_id,
        status=UploadStatus(job.get("status", "completed")),
        total_rows=job.get("total_rows", 0),
        success_count=job.get("success_count", 0),
        error_count=job.get("error_count", 0),
        warning_count=job.get("warning_count", 0),
        categories_processed=job.get("categories_processed", []),
        total_emissions_tco2e=job.get("total_emissions_tco2e", 0),
        errors=error_objects
    )
    
    report_bytes = ReportGenerator.generate_error_report(summary)
    return StreamingResponse(
        report_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=bulk_upload_errors_{job_id[:8]}.xlsx"}
    )

@scope3_bulk_router.get("/jobs/{job_id}/results/download")
async def download_scope3_results_report(job_id: str, current_user: dict = Depends(get_current_user)):
    """Download results report for a bulk upload job"""
    organization_id = current_user.get("organization_id")
    job = await db.bulk_upload_jobs.find_one(
        {"id": job_id, "organization_id": organization_id},
        {"_id": 0}
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    emission_ids = job.get("created_emission_ids", [])
    emissions = []
    if emission_ids:
        emissions = await db.emission_records.find(
            {"id": {"$in": emission_ids}},
            {"_id": 0, "id": 1, "category": 1, "facility_name": 1, 
             "reporting_period": 1, "calculation_method_scope3": 1,
             "scope3_activity": 1, "co2e_emissions": 1}
        ).to_list(10000)
    
    summary = UploadSummary(
        job_id=job_id,
        status=UploadStatus(job.get("status", "completed")),
        total_rows=job.get("total_rows", 0),
        success_count=job.get("success_count", 0),
        error_count=job.get("error_count", 0),
        categories_processed=job.get("categories_processed", []),
        total_emissions_tco2e=job.get("total_emissions_tco2e", 0)
    )
    
    report_bytes = ReportGenerator.generate_results_report(summary, emissions)
    return StreamingResponse(
        report_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=bulk_upload_results_{job_id[:8]}.xlsx"}
    )

@scope3_bulk_router.get("/jobs")
async def list_scope3_jobs(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user)
):
    """List bulk upload jobs for the organization"""
    organization_id = current_user.get("organization_id")
    jobs = await db.bulk_upload_jobs.find(
        {"organization_id": organization_id},
        {"_id": 0}
    ).sort("uploaded_at", -1).skip(offset).limit(limit).to_list(limit)
    total = await db.bulk_upload_jobs.count_documents({"organization_id": organization_id})
    return {"jobs": jobs, "total": total, "limit": limit, "offset": offset}

@scope3_bulk_router.delete("/jobs/{job_id}")
async def delete_scope3_job(
    job_id: str,
    delete_emissions: bool = Query(False, description="Also delete created emissions"),
    current_user: dict = Depends(get_current_user)
):
    """Delete a bulk upload job and optionally its created emissions"""
    organization_id = current_user.get("organization_id")
    job = await db.bulk_upload_jobs.find_one(
        {"id": job_id, "organization_id": organization_id},
        {"_id": 0}
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if delete_emissions:
        emission_ids = job.get("created_emission_ids", [])
        if emission_ids:
            await db.emission_records.delete_many({"id": {"$in": emission_ids}})
    
    await db.bulk_upload_errors.delete_many({"job_id": job_id})
    await db.bulk_upload_jobs.delete_one({"id": job_id})
    
    return {"message": "Job deleted successfully", "emissions_deleted": delete_emissions}

api_router.include_router(scope3_bulk_router)

# ==========================================
# C7 Employee Commuting - Monthly Entry Model (#10)
# ==========================================

class C7MonthlyEntryCreate(BaseModel):
    """Create/Update a single month's C7 entry"""
    facility_id: str
    reporting_year: int
    reporting_month: str  # jan, feb, mar, etc.
    calculation_method: str  # activity_basis, supplier_basis
    activity_type: str  # car_travel, bus_travel, etc.
    activity_id: Optional[str] = None
    activity_name: Optional[str] = None
    formula_id: Optional[str] = None  # Formula used for calculation
    formula_name: Optional[str] = None  # Formula name for reference
    employees: List[Dict[str, Any]]  # List of employee data for this month
    notes: Optional[str] = None
    responsible_person: Optional[str] = None
    responsible_person_designation: Optional[str] = None
    responsible_person_contact: Optional[str] = None
    process_names: Optional[List[str]] = []
    process_descriptions: Optional[List[Dict[str, str]]] = []

class C7MonthlyEntryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    facility_id: str
    facility_name: Optional[str] = None
    organization_id: str
    scope: str = "scope3"
    category: str = "C7 - Employee Commuting"
    reporting_year: int
    reporting_month: str
    reporting_period: str  # 2025-01 format
    calculation_method: str
    activity_type: str
    activity_id: Optional[str] = None
    activity_name: Optional[str] = None
    employees: List[Dict[str, Any]]
    monthly_total: Dict[str, Any]  # {co2e: float, employee_count: int}
    notes: Optional[str] = None
    responsible_person: Optional[str] = None
    version: int = 1
    created_at: str
    created_by: str
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None

@api_router.post("/emissions/c7/month", response_model=C7MonthlyEntryResponse)
async def create_or_update_c7_monthly_entry(
    entry_data: C7MonthlyEntryCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create or update a single month's C7 Employee Commuting entry"""
    
    # Verify facility access
    facility = await db.facilities.find_one({"id": entry_data.facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    org_id = facility.get("organization_id")
    if current_user.get("role") != "super_admin" and current_user.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this facility")
    
    # Create reporting_period in YYYY-MM format
    month_to_num = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
        'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    }
    month_num = month_to_num.get(entry_data.reporting_month.lower(), '01')
    reporting_period = f"{entry_data.reporting_year}-{month_num}"
    
    # Check if entry already exists for this facility/year/month
    existing = await db.emission_records.find_one({
        "facility_id": entry_data.facility_id,
        "category": "C7 - Employee Commuting",
        "reporting_year": entry_data.reporting_year,
        "reporting_month": entry_data.reporting_month.lower(),
        "c7_data_model_version": 2
    }, {"_id": 0})
    
    # Calculate monthly total from employees
    total_co2e = 0.0
    for emp in entry_data.employees:
        emissions = emp.get("emissions", {})
        if isinstance(emissions, dict):
            total_co2e += float(emissions.get("co2e", 0) or 0)
        elif isinstance(emissions, (int, float)):
            total_co2e += float(emissions)
    
    monthly_total = {
        "co2e": total_co2e,
        "employee_count": len(entry_data.employees)
    }
    
    now = datetime.now(timezone.utc).isoformat()
    
    if existing:
        # Update existing entry
        old_version = existing.get("version", 0)
        
        # Compute field changes for version history - track all fields being updated
        new_values = {
            "employees": entry_data.employees,
            "monthly_total": monthly_total,
            "activity_type": entry_data.activity_type,
            "calculation_method_scope3": entry_data.calculation_method,
            "scope3_activity": entry_data.activity_name,
            "scope3_ef_id": entry_data.activity_id,
            "formula_id": entry_data.formula_id,
            "formula_name": entry_data.formula_name,
            "notes": entry_data.notes,
            "responsible_person": entry_data.responsible_person,
            "responsible_person_designation": entry_data.responsible_person_designation,
            "responsible_person_contact": entry_data.responsible_person_contact,
            "total_emissions": total_co2e,
        }
        field_changes = compute_field_changes(existing, new_values)
        
        update_dict = {
            "employees": entry_data.employees,
            "monthly_total": monthly_total,
            "co2e_emissions": total_co2e,
            "total_emissions": total_co2e,
            "activity_type": entry_data.activity_type,
            "scope3_activity_type": entry_data.activity_type,
            "calculation_method_scope3": entry_data.calculation_method,
            "scope3_activity": entry_data.activity_name,
            "scope3_ef_id": entry_data.activity_id,
            "formula_id": entry_data.formula_id,
            "formula_name": entry_data.formula_name,
            "notes": entry_data.notes,
            "responsible_person": entry_data.responsible_person,
            "responsible_person_designation": entry_data.responsible_person_designation,
            "responsible_person_contact": entry_data.responsible_person_contact,
            "process_names": entry_data.process_names or [],
            "process_descriptions": entry_data.process_descriptions or [],
            "updated_at": now,
            "updated_by": current_user["id"],
            "updated_by_email": current_user.get("email", ""),
            "updated_by_name": current_user.get("full_name", ""),
            "version": old_version + 1
        }
        
        await db.emission_records.update_one({"id": existing["id"]}, {"$set": update_dict})
        
        # Save version history
        if field_changes:
            history_dict = {
                "id": str(uuid.uuid4()),
                "emission_id": existing["id"],
                "facility_id": entry_data.facility_id,
                "organization_id": org_id,
                "scope": "scope3",
                "category": "C7 - Employee Commuting",
                "reporting_month": entry_data.reporting_month,
                "changed_by": current_user["id"],
                "changed_by_email": current_user.get("email", ""),
                "changed_by_name": current_user.get("full_name", ""),
                "changed_at": now,
                "version": old_version + 1,
                "field_changes": field_changes,
                "changes_summary": f"{len(field_changes)} field(s) changed",
                "changes": {"action": "updated"}
            }
            await db.emission_history.insert_one(history_dict)
        
        result = await db.emission_records.find_one({"id": existing["id"]}, {"_id": 0})
    else:
        # Create new entry
        entry_id = str(uuid.uuid4())
        
        new_entry = {
            "id": entry_id,
            "facility_id": entry_data.facility_id,
            "organization_id": org_id,
            "scope": "scope3",
            "category": "C7 - Employee Commuting",
            "reporting_year": entry_data.reporting_year,
            "reporting_month": entry_data.reporting_month.lower(),
            "reporting_period": reporting_period,
            "c7_data_model_version": 2,  # Mark as new model
            "calculation_method_scope3": entry_data.calculation_method,
            "scope3_activity_type": entry_data.activity_type,
            "activity_type": entry_data.activity_type,
            "scope3_ef_id": entry_data.activity_id,
            "scope3_activity": entry_data.activity_name,
            "formula_id": entry_data.formula_id,
            "formula_name": entry_data.formula_name,
            "employees": entry_data.employees,
            "monthly_total": monthly_total,
            "co2e_emissions": total_co2e,
            "total_emissions": total_co2e,
            "notes": entry_data.notes,
            "responsible_person": entry_data.responsible_person,
            "responsible_person_designation": entry_data.responsible_person_designation,
            "responsible_person_contact": entry_data.responsible_person_contact,
            "process_names": entry_data.process_names or [],
            "process_descriptions": entry_data.process_descriptions or [],
            "version": 1,
            "created_at": now,
            "created_by": current_user["id"],
            "created_by_email": current_user.get("email", ""),
            "created_by_name": current_user.get("full_name", ""),
        }
        
        await db.emission_records.insert_one(new_entry)
        result = new_entry
    
    # Add facility name
    result["facility_name"] = facility.get("name", "")
    result["calculation_method"] = entry_data.calculation_method
    
    return C7MonthlyEntryResponse(**result)

@api_router.get("/emissions/c7/{facility_id}/{year}")
async def get_c7_yearly_summary(
    facility_id: str,
    year: int,
    current_user: dict = Depends(get_current_user)
):
    """Get all C7 monthly entries for a facility/year with aggregated totals"""
    
    # Verify facility access
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    org_id = facility.get("organization_id")
    if current_user.get("role") != "super_admin" and current_user.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get new model entries (v2)
    new_entries = await db.emission_records.find({
        "facility_id": facility_id,
        "category": "C7 - Employee Commuting",
        "reporting_year": year,
        "c7_data_model_version": 2
    }, {"_id": 0}).to_list(100)
    
    # Get old model entries (for backward compatibility)
    old_entries = await db.emission_records.find({
        "facility_id": facility_id,
        "category": "C7 - Employee Commuting",
        "reporting_year": year,
        "c7_data_model_version": {"$exists": False},
        "migrated_to_v2": {"$ne": True}
    }, {"_id": 0}).to_list(100)
    
    # Combine entries for response
    entries = new_entries
    
    # Calculate yearly aggregates
    monthly_totals = {}
    yearly_total = {"co2e": 0, "employee_count": 0}
    
    for entry in entries:
        month = entry.get("reporting_month", "")
        mt = entry.get("monthly_total", {})
        monthly_totals[month] = mt
        yearly_total["co2e"] += mt.get("co2e", 0)
        yearly_total["employee_count"] = max(yearly_total["employee_count"], mt.get("employee_count", 0))
    
    return {
        "facility_id": facility_id,
        "facility_name": facility.get("name", ""),
        "reporting_year": year,
        "entries": entries,
        "monthly_totals": monthly_totals,
        "yearly_total": yearly_total,
        "has_old_model_data": len(old_entries) > 0,
        "old_entries_count": len(old_entries)
    }

@api_router.get("/emissions/c7/{facility_id}/{year}/{month}", response_model=C7MonthlyEntryResponse)
async def get_c7_monthly_entry(
    facility_id: str,
    year: int,
    month: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single C7 monthly entry"""
    
    # Verify facility access
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    org_id = facility.get("organization_id")
    if current_user.get("role") != "super_admin" and current_user.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    entry = await db.emission_records.find_one({
        "facility_id": facility_id,
        "category": "C7 - Employee Commuting",
        "reporting_year": year,
        "reporting_month": month.lower(),
        "c7_data_model_version": 2
    }, {"_id": 0})
    
    if not entry:
        raise HTTPException(status_code=404, detail=f"No C7 entry found for {month} {year}")
    
    entry["facility_name"] = facility.get("name", "")
    entry["calculation_method"] = entry.get("calculation_method_scope3", "")
    return C7MonthlyEntryResponse(**entry)

@api_router.delete("/emissions/c7/{entry_id}")
async def delete_c7_monthly_entry(
    entry_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a C7 monthly entry"""
    
    entry = await db.emission_records.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    # Verify access
    facility = await db.facilities.find_one({"id": entry.get("facility_id")}, {"_id": 0})
    if facility:
        org_id = facility.get("organization_id")
        if current_user.get("role") != "super_admin" and current_user.get("organization_id") != org_id:
            raise HTTPException(status_code=403, detail="Not authorized")
    
    # Save deletion to history
    history_dict = {
        "id": str(uuid.uuid4()),
        "emission_id": entry_id,
        "facility_id": entry.get("facility_id"),
        "organization_id": entry.get("organization_id"),
        "scope": "scope3",
        "category": "C7 - Employee Commuting",
        "reporting_month": entry.get("reporting_month"),
        "changed_by": current_user["id"],
        "changed_by_email": current_user.get("email", ""),
        "changed_by_name": current_user.get("full_name", ""),
        "changed_at": datetime.now(timezone.utc).isoformat(),
        "version": entry.get("version", 0) + 1,
        "field_changes": [{"field": "deleted", "old_value": entry, "new_value": None}],
        "changes_summary": "Entry deleted",
        "changes": {"action": "deleted", "old_values": entry}
    }
    await db.emission_history.insert_one(history_dict)
    
    await db.emission_records.delete_one({"id": entry_id})
    
    return {"message": "Entry deleted successfully", "id": entry_id}

# ==========================================
# C7 Employee Commuting - Yearly Entry Model
# ==========================================

class C7YearlyEntryCreate(BaseModel):
    """Create/Update a yearly C7 entry (one annual value per employee)"""
    facility_id: str
    reporting_year: str  # "CY2025" or "FY 2025-2026"
    calculation_method: str  # activity_basis, supplier_basis
    activity_type: str  # car_travel, bus_travel, etc.
    activity_id: Optional[str] = None
    activity_name: Optional[str] = None
    formula_id: Optional[str] = None
    formula_name: Optional[str] = None
    employees: List[Dict[str, Any]]  # List of employee data with yearly totals
    notes: Optional[str] = None
    responsible_person: Optional[str] = None
    responsible_person_designation: Optional[str] = None
    responsible_person_contact: Optional[str] = None
    process_names: Optional[List[str]] = []
    process_descriptions: Optional[List[Dict[str, str]]] = []

class C7YearlyEntryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    facility_id: str
    facility_name: Optional[str] = None
    organization_id: str
    scope: str = "scope3"
    category: str = "C7 - Employee Commuting"
    frequency_type: str = "yearly"
    reporting_period: str  # "CY2025" or "FY 2025-2026"
    reporting_year: str  # Same as reporting_period for yearly
    calculation_method: str
    activity_type: str
    activity_id: Optional[str] = None
    activity_name: Optional[str] = None
    employees: List[Dict[str, Any]]
    yearly_total: Dict[str, Any]  # {co2e: float, employee_count: int}
    notes: Optional[str] = None
    responsible_person: Optional[str] = None
    version: int = 1
    created_at: str
    created_by: str
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None

@api_router.post("/emissions/c7/yearly", response_model=C7YearlyEntryResponse)
async def create_or_update_c7_yearly_entry(
    entry_data: C7YearlyEntryCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create or update a yearly C7 Employee Commuting entry (per-employee annual totals)"""
    
    # Verify facility access
    facility = await db.facilities.find_one({"id": entry_data.facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    org_id = facility.get("organization_id")
    if current_user.get("role") != "super_admin" and current_user.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this facility")
    
    # Validate reporting_year format (CY2025 or FY 2025-2026)
    reporting_year = entry_data.reporting_year
    if not (reporting_year.startswith("CY") or reporting_year.startswith("FY ")):
        raise HTTPException(
            status_code=400,
            detail="reporting_year must be in format 'CY2025' or 'FY 2025-2026'"
        )
    
    # Check if entry already exists for this facility/year/activity
    existing = await db.emission_records.find_one({
        "facility_id": entry_data.facility_id,
        "category": "C7 - Employee Commuting",
        "reporting_period": reporting_year,
        "frequency_type": "yearly",
        "activity_type": entry_data.activity_type,
        "c7_data_model_version": 2
    }, {"_id": 0})
    
    # Calculate yearly total from employees
    total_co2e = 0.0
    for emp in entry_data.employees:
        emissions = emp.get("emissions", {})
        if isinstance(emissions, dict):
            total_co2e += float(emissions.get("co2e", 0) or 0)
        elif isinstance(emissions, (int, float)):
            total_co2e += float(emissions)
    
    yearly_total = {
        "co2e": total_co2e,
        "employee_count": len(entry_data.employees)
    }
    
    now = datetime.now(timezone.utc).isoformat()
    
    if existing:
        # Update existing entry
        old_version = existing.get("version", 0)
        
        update_dict = {
            "employees": entry_data.employees,
            "yearly_total": yearly_total,
            "co2e_emissions": total_co2e,
            "total_emissions": total_co2e,
            "activity_type": entry_data.activity_type,
            "scope3_activity_type": entry_data.activity_type,
            "calculation_method_scope3": entry_data.calculation_method,
            "scope3_activity": entry_data.activity_name,
            "scope3_ef_id": entry_data.activity_id,
            "formula_id": entry_data.formula_id,
            "formula_name": entry_data.formula_name,
            "notes": entry_data.notes,
            "responsible_person": entry_data.responsible_person,
            "responsible_person_designation": entry_data.responsible_person_designation,
            "responsible_person_contact": entry_data.responsible_person_contact,
            "process_names": entry_data.process_names,
            "process_descriptions": entry_data.process_descriptions,
            "updated_at": now,
            "updated_by": current_user["id"],
            "updated_by_email": current_user.get("email", ""),
            "updated_by_name": current_user.get("full_name", ""),
            "version": old_version + 1
        }
        
        await db.emission_records.update_one({"id": existing["id"]}, {"$set": update_dict})
        updated = await db.emission_records.find_one({"id": existing["id"]}, {"_id": 0})
        updated["facility_name"] = facility.get("name", "")
        updated["calculation_method"] = entry_data.calculation_method
        updated["reporting_year"] = reporting_year
        return C7YearlyEntryResponse(**updated)
    
    else:
        # Create new yearly entry
        record_id = str(uuid.uuid4())
        
        new_record = {
            "id": record_id,
            "facility_id": entry_data.facility_id,
            "organization_id": org_id,
            "scope": "scope3",
            "category": "C7 - Employee Commuting",
            "sub_category": "Employee Commuting",
            "frequency_type": "yearly",
            "reporting_period": reporting_year,
            "reporting_year": reporting_year,
            "c7_data_model_version": 2,
            "calculation_method_scope3": entry_data.calculation_method,
            "activity_type": entry_data.activity_type,
            "scope3_activity_type": entry_data.activity_type,
            "scope3_activity": entry_data.activity_name,
            "scope3_ef_id": entry_data.activity_id,
            "formula_id": entry_data.formula_id,
            "formula_name": entry_data.formula_name,
            "employees": entry_data.employees,
            "yearly_total": yearly_total,
            "co2e_emissions": total_co2e,
            "total_emissions": total_co2e,
            "notes": entry_data.notes,
            "responsible_person": entry_data.responsible_person,
            "responsible_person_designation": entry_data.responsible_person_designation,
            "responsible_person_contact": entry_data.responsible_person_contact,
            "process_names": entry_data.process_names,
            "process_descriptions": entry_data.process_descriptions,
            "version": 1,
            "created_at": now,
            "created_by": current_user["id"],
            "created_by_email": current_user.get("email", ""),
            "created_by_name": current_user.get("full_name", ""),
            "updated_at": None,
            "updated_by": None
        }
        
        await db.emission_records.insert_one(new_record)
        new_record["facility_name"] = facility.get("name", "")
        new_record["calculation_method"] = entry_data.calculation_method
        return C7YearlyEntryResponse(**new_record)

@api_router.get("/emissions/c7/yearly/{facility_id}/{reporting_year}")
async def get_c7_yearly_entry(
    facility_id: str,
    reporting_year: str,
    current_user: dict = Depends(get_current_user)
):
    """Get yearly C7 entry for a facility"""
    
    # Verify facility access
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    org_id = facility.get("organization_id")
    if current_user.get("role") != "super_admin" and current_user.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Find yearly entry
    entry = await db.emission_records.find_one({
        "facility_id": facility_id,
        "category": "C7 - Employee Commuting",
        "reporting_period": reporting_year,
        "frequency_type": "yearly",
        "c7_data_model_version": 2
    }, {"_id": 0})
    
    if not entry:
        return {"message": "No yearly C7 entry found", "facility_id": facility_id, "reporting_year": reporting_year}
    
    entry["facility_name"] = facility.get("name", "")
    entry["calculation_method"] = entry.get("calculation_method_scope3", "")
    return entry

@api_router.post("/emissions/c7/migrate/{facility_id}/{year}")
async def migrate_c7_to_monthly_model(
    facility_id: str,
    year: int,
    current_user: dict = Depends(get_admin_user)
):
    """Migrate old C7 entries to new monthly model (Admin only)"""
    
    # Find old model entries
    old_entries = await db.emission_records.find({
        "facility_id": facility_id,
        "category": "C7 - Employee Commuting",
        "reporting_year": year,
        "c7_data_model_version": {"$exists": False}
    }, {"_id": 0}).to_list(100)
    
    if not old_entries:
        return {"message": "No old model entries found to migrate", "migrated_count": 0}
    
    migrated_count = 0
    
    for old_entry in old_entries:
        employees = old_entry.get("employees", [])
        
        # Group employees by month
        month_employee_map = {}
        
        for emp in employees:
            monthly_data = emp.get("monthly_data", {})
            for month_key, month_data in monthly_data.items():
                if month_key not in month_employee_map:
                    month_employee_map[month_key] = []
                
                # Create employee entry for this month
                emp_month_entry = {
                    "id": emp.get("id"),
                    "name": emp.get("name"),
                    "employee_id": emp.get("employee_id"),
                    "department": emp.get("department"),
                    "activity_type": emp.get("activity_type"),
                    "inputs": month_data.get("inputs", {}),
                    "emissions": month_data.get("emissions", {})
                }
                month_employee_map[month_key].append(emp_month_entry)
        
        # Create new monthly entries
        for month_key, month_employees in month_employee_map.items():
            if not month_employees:
                continue
            
            # Calculate monthly total
            total_co2e = sum(
                emp.get("emissions", {}).get("co2e", 0) or 0 
                for emp in month_employees
            )
            
            month_to_num = {
                'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
                'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
            }
            month_num = month_to_num.get(month_key.lower(), '01')
            
            new_entry = {
                "id": str(uuid.uuid4()),
                "facility_id": facility_id,
                "organization_id": old_entry.get("organization_id"),
                "scope": "scope3",
                "category": "C7 - Employee Commuting",
                "reporting_year": year,
                "reporting_month": month_key.lower(),
                "reporting_period": f"{year}-{month_num}",
                "c7_data_model_version": 2,
                "calculation_method_scope3": old_entry.get("calculation_method_scope3"),
                "scope3_activity_type": old_entry.get("scope3_activity_type"),
                "activity_type": old_entry.get("scope3_activity_type"),
                "scope3_ef_id": old_entry.get("scope3_ef_id"),
                "scope3_activity": old_entry.get("scope3_activity"),
                "employees": month_employees,
                "monthly_total": {"co2e": total_co2e, "employee_count": len(month_employees)},
                "co2e_emissions": total_co2e,
                "total_emissions": total_co2e,
                "notes": old_entry.get("notes"),
                "responsible_person": old_entry.get("responsible_person"),
                "version": 1,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "created_by": current_user["id"],
                "migrated_from": old_entry.get("id")
            }
            
            await db.emission_records.insert_one(new_entry)
            migrated_count += 1
        
        # Mark old entry as migrated (don't delete, keep for reference)
        await db.emission_records.update_one(
            {"id": old_entry["id"]},
            {"$set": {"migrated_to_v2": True, "migrated_at": datetime.now(timezone.utc).isoformat()}}
        )
    
    return {
        "message": "Migration complete",
        "migrated_count": migrated_count,
        "old_entries_processed": len(old_entries)
    }

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

@app.on_event("startup")
async def startup_event():
    """Check and deactivate expired organizations on startup"""
    await check_expired_subscriptions()
    await seed_scopes_and_categories(db)
    await seed_calc_engine(db)

async def check_expired_subscriptions():
    """Deactivate organizations whose subscription has expired"""
    now = datetime.now(timezone.utc).isoformat()
    
    # Find organizations with expired subscriptions that are still active
    expired_orgs = await db.organizations.find({
        "subscription_expires_at": {"$lt": now, "$ne": None},
        "is_active": {"$ne": False}
    }, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    
    for org in expired_orgs:
        await db.organizations.update_one(
            {"id": org["id"]},
            {"$set": {"is_active": False}}
        )
        logger.info(f"Auto-deactivated organization '{org['name']}' due to expired subscription")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()