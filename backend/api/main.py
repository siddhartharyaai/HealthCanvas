"""
HealthCanvas - Backend API
FastAPI Application with PostgreSQL
"""

from fastapi import FastAPI, Depends, HTTPException, status, Query, BackgroundTasks, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime, date, timedelta
from decimal import Decimal
import uuid
import hashlib
import secrets
import jwt
import asyncpg
from contextlib import asynccontextmanager
import os
import io

# ============================================
# Configuration
# ============================================

class Config:
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost:5432/healthcanvas")
    JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")
    JWT_ALGORITHM = "HS256"
    JWT_EXPIRATION_HOURS = 24
    REFRESH_TOKEN_DAYS = 30
    
    # Parse CORS origins from environment variable
    _cors_env = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173")
    CORS_ORIGINS = [origin.strip() for origin in _cors_env.split(",")]

config = Config()

# ============================================
# Database Connection
# ============================================

db_pool = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool
    
    # Handle Neon database connection with SSL
    db_url = config.DATABASE_URL
    
    # For Neon, we need SSL
    ssl_context = None
    if "neon.tech" in db_url:
        import ssl
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        
        # Remove sslmode from URL if present (we handle it separately)
        if "?" in db_url:
            db_url = db_url.split("?")[0]
    
    try:
        db_pool = await asyncpg.create_pool(
            db_url, 
            min_size=2, 
            max_size=10,
            ssl=ssl_context
        )
        print("✅ Database connected successfully")
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        raise
    
    yield
    await db_pool.close()

app = FastAPI(
    title="HealthCanvas API",
    description="Personal Health Tracking Platform",
    version="2.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# Authentication
# ============================================

security = HTTPBearer()

def hash_password(password: str) -> str:
    return hashlib.pbkdf2_hmac('sha256', password.encode(), b'healthcanvas_salt', 100000).hex()

def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed

def create_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.utcnow() + timedelta(hours=config.JWT_EXPIRATION_HOURS),
        "iat": datetime.utcnow(),
        "type": "access"
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.utcnow() + timedelta(days=config.REFRESH_TOKEN_DAYS),
        "iat": datetime.utcnow(),
        "type": "refresh",
        "jti": secrets.token_urlsafe(32)
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(credentials.credentials, config.JWT_SECRET, algorithms=[config.JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        async with db_pool.acquire() as conn:
            user = await conn.fetchrow("SELECT id, email, first_name, last_name FROM users WHERE id = $1 AND deleted_at IS NULL", uuid.UUID(user_id))
            if not user:
                raise HTTPException(status_code=401, detail="User not found")
            return dict(user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ============================================
# Pydantic Models
# ============================================

# Auth Models
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    first_name: Optional[str] = None
    last_name: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = config.JWT_EXPIRATION_HOURS * 3600

class UserResponse(BaseModel):
    id: str
    email: str
    first_name: Optional[str]
    last_name: Optional[str]

# Observation Models
class ObservationCreate(BaseModel):
    biomarker_id: str
    value: Decimal
    effective_date: date
    effective_time: Optional[str] = None
    lab_name: Optional[str] = None
    lab_reference_low: Optional[Decimal] = None
    lab_reference_high: Optional[Decimal] = None
    notes: Optional[str] = None

class ObservationUpdate(BaseModel):
    value: Optional[Decimal] = None
    effective_date: Optional[date] = None
    lab_name: Optional[str] = None
    notes: Optional[str] = None

class ObservationResponse(BaseModel):
    id: str
    biomarker_id: str
    biomarker_name: str
    category: str
    value: Decimal
    unit: str
    effective_date: date
    status: str
    lab_name: Optional[str]
    notes: Optional[str]
    created_at: datetime

# Medication Models
class MedicationCreate(BaseModel):
    name: str
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    category: Optional[str] = None
    start_date: Optional[date] = None
    notes: Optional[str] = None

class MedicationResponse(BaseModel):
    id: str
    name: str
    dosage: Optional[str]
    frequency: Optional[str]
    category: Optional[str]
    start_date: Optional[date]
    is_active: bool
    notes: Optional[str]

# Condition Models
class ConditionCreate(BaseModel):
    name: str
    clinical_status: str = "active"
    onset_date: Optional[date] = None
    notes: Optional[str] = None

class ConditionResponse(BaseModel):
    id: str
    name: str
    clinical_status: str
    onset_date: Optional[date]
    notes: Optional[str]

# Allergy Models
class AllergyCreate(BaseModel):
    allergen: str
    criticality: str = "low"
    reaction_description: Optional[str] = None
    notes: Optional[str] = None

class AllergyResponse(BaseModel):
    id: str
    allergen: str
    criticality: str
    reaction_description: Optional[str]
    clinical_status: str

# Vaccination Models
class VaccinationCreate(BaseModel):
    vaccine_name: str
    administration_date: date
    next_dose_due: Optional[date] = None
    notes: Optional[str] = None

class VaccinationResponse(BaseModel):
    id: str
    vaccine_name: str
    administration_date: date
    next_dose_due: Optional[date]
    status: str

# Procedure Models
class ProcedureCreate(BaseModel):
    name: str
    procedure_type: Optional[str] = None
    performed_date: date
    facility_name: Optional[str] = None
    performed_by: Optional[str] = None
    findings: Optional[str] = None
    notes: Optional[str] = None

class ProcedureResponse(BaseModel):
    id: str
    name: str
    procedure_type: Optional[str]
    performed_date: date
    facility_name: Optional[str]
    findings: Optional[str]

# Goal Models
class GoalCreate(BaseModel):
    biomarker_id: str
    target_value: Decimal
    target_date: Optional[date] = None
    description: Optional[str] = None

class GoalResponse(BaseModel):
    id: str
    biomarker_id: str
    target_value: Decimal
    current_value: Optional[Decimal]
    target_date: Optional[date]
    status: str

# Journal Models
class JournalEntryCreate(BaseModel):
    entry_date: date
    sleep_hours: Optional[Decimal] = None
    energy_level: Optional[int] = Field(None, ge=1, le=5)
    mood_level: Optional[int] = Field(None, ge=1, le=5)
    exercise_done: bool = False
    notes: Optional[str] = None

class JournalEntryResponse(BaseModel):
    id: str
    entry_date: date
    sleep_hours: Optional[Decimal]
    energy_level: Optional[int]
    mood_level: Optional[int]
    exercise_done: bool
    notes: Optional[str]

# Health Score Models
class HealthScoreResponse(BaseModel):
    category: str
    score: Decimal
    marker_count: int

class DashboardResponse(BaseModel):
    overall_score: Optional[Decimal]
    category_scores: List[HealthScoreResponse]
    recent_observations: List[ObservationResponse]
    active_medications: List[MedicationResponse]
    active_conditions: List[ConditionResponse]
    pattern_alerts: List[Dict[str, Any]]

# ============================================
# Auth Endpoints
# ============================================

@app.post("/api/auth/register", response_model=TokenResponse, tags=["Auth"])
async def register(user: UserRegister):
    async with db_pool.acquire() as conn:
        # Check if email exists
        existing = await conn.fetchval("SELECT id FROM users WHERE email = $1", user.email)
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Create user
        user_id = await conn.fetchval(
            """
            INSERT INTO users (email, password_hash, first_name, last_name)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            """,
            user.email, hash_password(user.password), user.first_name, user.last_name
        )
        
        return TokenResponse(
            access_token=create_access_token(str(user_id)),
            refresh_token=create_refresh_token(str(user_id))
        )

@app.post("/api/auth/login", response_model=TokenResponse, tags=["Auth"])
async def login(credentials: UserLogin):
    async with db_pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id, password_hash FROM users WHERE email = $1 AND deleted_at IS NULL",
            credentials.email
        )
        if not user or not verify_password(credentials.password, user['password_hash']):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Update last login
        await conn.execute("UPDATE users SET last_login_at = NOW() WHERE id = $1", user['id'])
        
        return TokenResponse(
            access_token=create_access_token(str(user['id'])),
            refresh_token=create_refresh_token(str(user['id']))
        )

@app.get("/api/auth/me", response_model=UserResponse, tags=["Auth"])
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=str(user['id']),
        email=user['email'],
        first_name=user['first_name'],
        last_name=user['last_name']
    )

# ============================================
# Biomarker Definitions
# ============================================

@app.get("/api/biomarkers", tags=["Biomarkers"])
async def get_biomarkers(category: Optional[str] = None):
    async with db_pool.acquire() as conn:
        if category:
            rows = await conn.fetch(
                "SELECT * FROM biomarker_definitions WHERE category = $1 ORDER BY name",
                category
            )
        else:
            rows = await conn.fetch("SELECT * FROM biomarker_definitions ORDER BY category, name")
        return [dict(row) for row in rows]

@app.get("/api/biomarkers/{biomarker_id}", tags=["Biomarkers"])
async def get_biomarker(biomarker_id: str):
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM biomarker_definitions WHERE id = $1", biomarker_id)
        if not row:
            raise HTTPException(status_code=404, detail="Biomarker not found")
        return dict(row)

# ============================================
# Observations (Lab Results)
# ============================================

@app.get("/api/observations", response_model=List[ObservationResponse], tags=["Observations"])
async def get_observations(
    user: dict = Depends(get_current_user),
    biomarker_id: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: int = Query(100, le=500)
):
    async with db_pool.acquire() as conn:
        query = """
            SELECT o.*, bd.name as biomarker_name, bd.category, bd.unit
            FROM observations o
            JOIN biomarker_definitions bd ON o.biomarker_id = bd.id
            WHERE o.user_id = $1 AND o.deleted_at IS NULL
        """
        params = [user['id']]
        param_idx = 2
        
        if biomarker_id:
            query += f" AND o.biomarker_id = ${param_idx}"
            params.append(biomarker_id)
            param_idx += 1
        if start_date:
            query += f" AND o.effective_date >= ${param_idx}"
            params.append(start_date)
            param_idx += 1
        if end_date:
            query += f" AND o.effective_date <= ${param_idx}"
            params.append(end_date)
            param_idx += 1
        
        query += f" ORDER BY o.effective_date DESC, o.created_at DESC LIMIT ${param_idx}"
        params.append(limit)
        
        rows = await conn.fetch(query, *params)
        return [ObservationResponse(
            id=str(row['id']),
            biomarker_id=row['biomarker_id'],
            biomarker_name=row['biomarker_name'],
            category=row['category'],
            value=row['value'],
            unit=row['unit'],
            effective_date=row['effective_date'],
            status=row['status'],
            lab_name=row['lab_name'],
            notes=row['notes'],
            created_at=row['created_at']
        ) for row in rows]

@app.post("/api/observations", response_model=ObservationResponse, tags=["Observations"])
async def create_observation(obs: ObservationCreate, user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        # Verify biomarker exists
        bio = await conn.fetchrow("SELECT * FROM biomarker_definitions WHERE id = $1", obs.biomarker_id)
        if not bio:
            raise HTTPException(status_code=400, detail="Invalid biomarker_id")
        
        row = await conn.fetchrow(
            """
            INSERT INTO observations (user_id, biomarker_id, value, unit, effective_date, lab_name, lab_reference_low, lab_reference_high, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
            """,
            user['id'], obs.biomarker_id, obs.value, bio['unit'], obs.effective_date,
            obs.lab_name, obs.lab_reference_low, obs.lab_reference_high, obs.notes
        )
        
        return ObservationResponse(
            id=str(row['id']),
            biomarker_id=row['biomarker_id'],
            biomarker_name=bio['name'],
            category=bio['category'],
            value=row['value'],
            unit=row['unit'],
            effective_date=row['effective_date'],
            status=row['status'],
            lab_name=row['lab_name'],
            notes=row['notes'],
            created_at=row['created_at']
        )

@app.put("/api/observations/{observation_id}", response_model=ObservationResponse, tags=["Observations"])
async def update_observation(observation_id: str, obs: ObservationUpdate, user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        # Verify ownership
        existing = await conn.fetchrow(
            "SELECT * FROM observations WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
            uuid.UUID(observation_id), user['id']
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Observation not found")
        
        updates = []
        params = []
        param_idx = 1
        
        if obs.value is not None:
            updates.append(f"value = ${param_idx}")
            params.append(obs.value)
            param_idx += 1
        if obs.effective_date is not None:
            updates.append(f"effective_date = ${param_idx}")
            params.append(obs.effective_date)
            param_idx += 1
        if obs.lab_name is not None:
            updates.append(f"lab_name = ${param_idx}")
            params.append(obs.lab_name)
            param_idx += 1
        if obs.notes is not None:
            updates.append(f"notes = ${param_idx}")
            params.append(obs.notes)
            param_idx += 1
        
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        params.append(uuid.UUID(observation_id))
        query = f"UPDATE observations SET {', '.join(updates)} WHERE id = ${param_idx} RETURNING *"
        
        row = await conn.fetchrow(query, *params)
        bio = await conn.fetchrow("SELECT * FROM biomarker_definitions WHERE id = $1", row['biomarker_id'])
        
        return ObservationResponse(
            id=str(row['id']),
            biomarker_id=row['biomarker_id'],
            biomarker_name=bio['name'],
            category=bio['category'],
            value=row['value'],
            unit=row['unit'],
            effective_date=row['effective_date'],
            status=row['status'],
            lab_name=row['lab_name'],
            notes=row['notes'],
            created_at=row['created_at']
        )

@app.delete("/api/observations/{observation_id}", tags=["Observations"])
async def delete_observation(observation_id: str, user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE observations SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
            uuid.UUID(observation_id), user['id']
        )
        if result == "UPDATE 0":
            raise HTTPException(status_code=404, detail="Observation not found")
        return {"status": "deleted"}

# ============================================
# Medications
# ============================================

@app.get("/api/medications", response_model=List[MedicationResponse], tags=["Medications"])
async def get_medications(user: dict = Depends(get_current_user), active_only: bool = True):
    async with db_pool.acquire() as conn:
        query = "SELECT * FROM medications WHERE user_id = $1 AND deleted_at IS NULL"
        if active_only:
            query += " AND is_active = TRUE"
        query += " ORDER BY name"
        rows = await conn.fetch(query, user['id'])
        return [MedicationResponse(
            id=str(row['id']), name=row['name'], dosage=row['dosage'],
            frequency=row['frequency'], category=row['category'],
            start_date=row['start_date'], is_active=row['is_active'], notes=row['notes']
        ) for row in rows]

@app.post("/api/medications", response_model=MedicationResponse, tags=["Medications"])
async def create_medication(med: MedicationCreate, user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO medications (user_id, name, dosage, frequency, category, start_date, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            """,
            user['id'], med.name, med.dosage, med.frequency, med.category, med.start_date, med.notes
        )
        return MedicationResponse(
            id=str(row['id']), name=row['name'], dosage=row['dosage'],
            frequency=row['frequency'], category=row['category'],
            start_date=row['start_date'], is_active=row['is_active'], notes=row['notes']
        )

@app.patch("/api/medications/{medication_id}/toggle", tags=["Medications"])
async def toggle_medication(medication_id: str, user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE medications SET is_active = NOT is_active, 
            end_date = CASE WHEN is_active THEN CURRENT_DATE ELSE NULL END
            WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
            """,
            uuid.UUID(medication_id), user['id']
        )
        if result == "UPDATE 0":
            raise HTTPException(status_code=404, detail="Medication not found")
        return {"status": "toggled"}

@app.delete("/api/medications/{medication_id}", tags=["Medications"])
async def delete_medication(medication_id: str, user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE medications SET deleted_at = NOW() WHERE id = $1 AND user_id = $2",
            uuid.UUID(medication_id), user['id']
        )
        if result == "UPDATE 0":
            raise HTTPException(status_code=404, detail="Medication not found")
        return {"status": "deleted"}

# ============================================
# Conditions
# ============================================

@app.get("/api/conditions", response_model=List[ConditionResponse], tags=["Conditions"])
async def get_conditions(user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM conditions WHERE user_id = $1 AND deleted_at IS NULL ORDER BY onset_date DESC",
            user['id']
        )
        return [ConditionResponse(
            id=str(row['id']), name=row['name'], clinical_status=row['clinical_status'],
            onset_date=row['onset_date'], notes=row['notes']
        ) for row in rows]

@app.post("/api/conditions", response_model=ConditionResponse, tags=["Conditions"])
async def create_condition(cond: ConditionCreate, user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO conditions (user_id, name, clinical_status, onset_date, notes)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            """,
            user['id'], cond.name, cond.clinical_status, cond.onset_date, cond.notes
        )
        return ConditionResponse(
            id=str(row['id']), name=row['name'], clinical_status=row['clinical_status'],
            onset_date=row['onset_date'], notes=row['notes']
        )

# ============================================
# Allergies
# ============================================

@app.get("/api/allergies", response_model=List[AllergyResponse], tags=["Allergies"])
async def get_allergies(user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM allergies WHERE user_id = $1 AND deleted_at IS NULL ORDER BY allergen",
            user['id']
        )
        return [AllergyResponse(
            id=str(row['id']), allergen=row['allergen'], criticality=row['criticality'],
            reaction_description=row['reaction_description'], clinical_status=row['clinical_status']
        ) for row in rows]

@app.post("/api/allergies", response_model=AllergyResponse, tags=["Allergies"])
async def create_allergy(allergy: AllergyCreate, user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO allergies (user_id, allergen, criticality, reaction_description, notes)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            """,
            user['id'], allergy.allergen, allergy.criticality, allergy.reaction_description, allergy.notes
        )
        return AllergyResponse(
            id=str(row['id']), allergen=row['allergen'], criticality=row['criticality'],
            reaction_description=row['reaction_description'], clinical_status=row['clinical_status']
        )

# ============================================
# Vaccinations
# ============================================

@app.get("/api/vaccinations", response_model=List[VaccinationResponse], tags=["Vaccinations"])
async def get_vaccinations(user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM vaccinations WHERE user_id = $1 AND deleted_at IS NULL ORDER BY administration_date DESC",
            user['id']
        )
        return [VaccinationResponse(
            id=str(row['id']), vaccine_name=row['vaccine_name'],
            administration_date=row['administration_date'],
            next_dose_due=row['next_dose_due'], status=row['status']
        ) for row in rows]

@app.post("/api/vaccinations", response_model=VaccinationResponse, tags=["Vaccinations"])
async def create_vaccination(vacc: VaccinationCreate, user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO vaccinations (user_id, vaccine_name, administration_date, next_dose_due, notes)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            """,
            user['id'], vacc.vaccine_name, vacc.administration_date, vacc.next_dose_due, vacc.notes
        )
        return VaccinationResponse(
            id=str(row['id']), vaccine_name=row['vaccine_name'],
            administration_date=row['administration_date'],
            next_dose_due=row['next_dose_due'], status=row['status']
        )

# ============================================
# Procedures
# ============================================

@app.get("/api/procedures", response_model=List[ProcedureResponse], tags=["Procedures"])
async def get_procedures(user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM procedures WHERE user_id = $1 AND deleted_at IS NULL ORDER BY performed_date DESC",
            user['id']
        )
        return [ProcedureResponse(
            id=str(row['id']), name=row['name'], procedure_type=row['procedure_type'],
            performed_date=row['performed_date'], facility_name=row['facility_name'],
            findings=row['findings']
        ) for row in rows]

@app.post("/api/procedures", response_model=ProcedureResponse, tags=["Procedures"])
async def create_procedure(proc: ProcedureCreate, user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO procedures (user_id, name, procedure_type, performed_date, facility_name, performed_by, findings, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            """,
            user['id'], proc.name, proc.procedure_type, proc.performed_date,
            proc.facility_name, proc.performed_by, proc.findings, proc.notes
        )
        return ProcedureResponse(
            id=str(row['id']), name=row['name'], procedure_type=row['procedure_type'],
            performed_date=row['performed_date'], facility_name=row['facility_name'],
            findings=row['findings']
        )

# ============================================
# Goals
# ============================================

@app.get("/api/goals", response_model=List[GoalResponse], tags=["Goals"])
async def get_goals(user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM health_goals WHERE user_id = $1 ORDER BY created_at DESC",
            user['id']
        )
        return [GoalResponse(
            id=str(row['id']), biomarker_id=row['biomarker_id'],
            target_value=row['target_value'], current_value=row['current_value'],
            target_date=row['target_date'], status=row['status']
        ) for row in rows]

@app.post("/api/goals", response_model=GoalResponse, tags=["Goals"])
async def create_goal(goal: GoalCreate, user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        # Get current value
        current = await conn.fetchval(
            """
            SELECT value FROM observations 
            WHERE user_id = $1 AND biomarker_id = $2 AND deleted_at IS NULL
            ORDER BY effective_date DESC LIMIT 1
            """,
            user['id'], goal.biomarker_id
        )
        
        row = await conn.fetchrow(
            """
            INSERT INTO health_goals (user_id, biomarker_id, target_value, baseline_value, current_value, target_date, description)
            VALUES ($1, $2, $3, $4, $4, $5, $6)
            RETURNING *
            """,
            user['id'], goal.biomarker_id, goal.target_value, current, goal.target_date, goal.description
        )
        return GoalResponse(
            id=str(row['id']), biomarker_id=row['biomarker_id'],
            target_value=row['target_value'], current_value=row['current_value'],
            target_date=row['target_date'], status=row['status']
        )

# ============================================
# Journal
# ============================================

@app.get("/api/journal", response_model=List[JournalEntryResponse], tags=["Journal"])
async def get_journal(user: dict = Depends(get_current_user), limit: int = Query(30, le=100)):
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM journal_entries WHERE user_id = $1 ORDER BY entry_date DESC LIMIT $2",
            user['id'], limit
        )
        return [JournalEntryResponse(
            id=str(row['id']), entry_date=row['entry_date'],
            sleep_hours=row['sleep_hours'], energy_level=row['energy_level'],
            mood_level=row['mood_level'], exercise_done=row['exercise_done'],
            notes=row['notes']
        ) for row in rows]

@app.post("/api/journal", response_model=JournalEntryResponse, tags=["Journal"])
async def create_journal_entry(entry: JournalEntryCreate, user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO journal_entries (user_id, entry_date, sleep_hours, energy_level, mood_level, exercise_done, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (user_id, entry_date) DO UPDATE SET
                sleep_hours = EXCLUDED.sleep_hours,
                energy_level = EXCLUDED.energy_level,
                mood_level = EXCLUDED.mood_level,
                exercise_done = EXCLUDED.exercise_done,
                notes = EXCLUDED.notes,
                updated_at = NOW()
            RETURNING *
            """,
            user['id'], entry.entry_date, entry.sleep_hours,
            entry.energy_level, entry.mood_level, entry.exercise_done, entry.notes
        )
        return JournalEntryResponse(
            id=str(row['id']), entry_date=row['entry_date'],
            sleep_hours=row['sleep_hours'], energy_level=row['energy_level'],
            mood_level=row['mood_level'], exercise_done=row['exercise_done'],
            notes=row['notes']
        )

# ============================================
# Dashboard & Analytics
# ============================================

@app.get("/api/dashboard", response_model=DashboardResponse, tags=["Dashboard"])
async def get_dashboard(user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        # Get health scores by category
        scores = await conn.fetch(
            """
            SELECT category, score, marker_count FROM health_scores WHERE user_id = $1
            """,
            user['id']
        )
        
        category_scores = [HealthScoreResponse(
            category=row['category'], score=row['score'], marker_count=row['marker_count']
        ) for row in scores]
        
        # Calculate overall score
        overall_score = None
        if category_scores:
            overall_score = sum(s.score for s in category_scores) / len(category_scores)
        
        # Get recent observations
        recent_obs = await conn.fetch(
            """
            SELECT o.*, bd.name as biomarker_name, bd.category, bd.unit
            FROM observations o
            JOIN biomarker_definitions bd ON o.biomarker_id = bd.id
            WHERE o.user_id = $1 AND o.deleted_at IS NULL
            ORDER BY o.effective_date DESC, o.created_at DESC
            LIMIT 10
            """,
            user['id']
        )
        
        recent_observations = [ObservationResponse(
            id=str(row['id']), biomarker_id=row['biomarker_id'],
            biomarker_name=row['biomarker_name'], category=row['category'],
            value=row['value'], unit=row['unit'], effective_date=row['effective_date'],
            status=row['status'], lab_name=row['lab_name'], notes=row['notes'],
            created_at=row['created_at']
        ) for row in recent_obs]
        
        # Get active medications
        meds = await conn.fetch(
            "SELECT * FROM medications WHERE user_id = $1 AND is_active = TRUE AND deleted_at IS NULL",
            user['id']
        )
        
        active_medications = [MedicationResponse(
            id=str(row['id']), name=row['name'], dosage=row['dosage'],
            frequency=row['frequency'], category=row['category'],
            start_date=row['start_date'], is_active=row['is_active'], notes=row['notes']
        ) for row in meds]
        
        # Get active conditions
        conds = await conn.fetch(
            "SELECT * FROM conditions WHERE user_id = $1 AND clinical_status = 'active' AND deleted_at IS NULL",
            user['id']
        )
        
        active_conditions = [ConditionResponse(
            id=str(row['id']), name=row['name'], clinical_status=row['clinical_status'],
            onset_date=row['onset_date'], notes=row['notes']
        ) for row in conds]
        
        # Detect patterns
        pattern_alerts = await detect_patterns(conn, user['id'])
        
        return DashboardResponse(
            overall_score=overall_score,
            category_scores=category_scores,
            recent_observations=recent_observations,
            active_medications=active_medications,
            active_conditions=active_conditions,
            pattern_alerts=pattern_alerts
        )

async def detect_patterns(conn, user_id) -> List[Dict[str, Any]]:
    """Detect health patterns from user's data"""
    patterns = []
    
    # Get latest values for key biomarkers
    latest = {}
    rows = await conn.fetch(
        """
        SELECT DISTINCT ON (biomarker_id) biomarker_id, value, status
        FROM observations
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY biomarker_id, effective_date DESC
        """,
        user_id
    )
    for row in rows:
        latest[row['biomarker_id']] = {'value': float(row['value']), 'status': row['status']}
    
    # Metabolic Syndrome Check
    metabolic_flags = sum([
        latest.get('glucose', {}).get('value', 0) > 100,
        latest.get('triglycerides', {}).get('value', 0) > 150,
        latest.get('hdl', {}).get('value', 100) < 40,
        latest.get('hba1c', {}).get('value', 0) > 5.6
    ])
    
    if metabolic_flags >= 3:
        patterns.append({
            'type': 'warning',
            'name': 'Metabolic Syndrome Risk',
            'description': 'Multiple markers suggest metabolic syndrome risk. Discuss with your doctor.',
            'markers': ['glucose', 'triglycerides', 'hdl', 'hba1c']
        })
    
    # Anemia Check
    if latest.get('hemoglobin', {}).get('value', 100) < 12 and latest.get('ferritin', {}).get('value', 100) < 30:
        patterns.append({
            'type': 'attention',
            'name': 'Possible Iron Deficiency',
            'description': 'Low hemoglobin with low ferritin may indicate iron deficiency.',
            'markers': ['hemoglobin', 'ferritin']
        })
    
    # Kidney Function
    if latest.get('creatinine', {}).get('value', 0) > 1.3 and latest.get('egfr', {}).get('value', 100) < 60:
        patterns.append({
            'type': 'warning',
            'name': 'Reduced Kidney Function',
            'description': 'Elevated creatinine with low eGFR suggests reduced kidney function.',
            'markers': ['creatinine', 'egfr']
        })
    
    return patterns

# ============================================
# Visit Preparation Export
# ============================================

@app.get("/api/visit-prep", tags=["Export"])
async def get_visit_prep(user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        # Get flagged observations
        flagged = await conn.fetch(
            """
            SELECT o.*, bd.name as biomarker_name, bd.unit
            FROM observations o
            JOIN biomarker_definitions bd ON o.biomarker_id = bd.id
            WHERE o.user_id = $1 AND o.deleted_at IS NULL
              AND o.status IN ('attention', 'critical')
              AND o.id IN (
                  SELECT id FROM (
                      SELECT id, ROW_NUMBER() OVER (PARTITION BY biomarker_id ORDER BY effective_date DESC) as rn
                      FROM observations WHERE user_id = $1 AND deleted_at IS NULL
                  ) sub WHERE rn = 1
              )
            ORDER BY CASE WHEN o.status = 'critical' THEN 1 ELSE 2 END, bd.category
            """,
            user['id']
        )
        
        # Get significant changes (>10% change)
        changes = await conn.fetch(
            """
            WITH ranked AS (
                SELECT o.*, bd.name as biomarker_name, bd.unit,
                       LAG(value) OVER (PARTITION BY biomarker_id ORDER BY effective_date) as prev_value
                FROM observations o
                JOIN biomarker_definitions bd ON o.biomarker_id = bd.id
                WHERE o.user_id = $1 AND o.deleted_at IS NULL
            )
            SELECT * FROM ranked
            WHERE prev_value IS NOT NULL
              AND ABS((value - prev_value) / NULLIF(prev_value, 0)) > 0.1
            ORDER BY effective_date DESC
            LIMIT 10
            """,
            user['id']
        )
        
        # Get active medications
        meds = await conn.fetch(
            "SELECT name, dosage, frequency FROM medications WHERE user_id = $1 AND is_active = TRUE AND deleted_at IS NULL",
            user['id']
        )
        
        # Generate questions
        questions = []
        for row in flagged:
            questions.append(f"My {row['biomarker_name']} is {row['value']} {row['unit']}, outside normal range. What might cause this?")
        
        return {
            'flagged_markers': [dict(row) for row in flagged],
            'significant_changes': [dict(row) for row in changes],
            'active_medications': [dict(row) for row in meds],
            'suggested_questions': questions[:5]
        }

# ============================================
# AI-Powered Endpoints (Gemini Integration)
# ============================================

@app.post("/api/ocr/extract", tags=["AI"])
async def extract_lab_values(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    """
    Extract lab values from uploaded lab report (PDF or image).
    Uses Gemini Vision for OCR and intelligent extraction.
    """
    try:
        from services.gemini_service import get_gemini_service
        
        # Validate file type
        allowed_types = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
        if file.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")
        
        # Read file content
        content = await file.read()
        if len(content) > 10 * 1024 * 1024:  # 10MB limit
            raise HTTPException(status_code=400, detail="File too large (max 10MB)")
        
        # Extract using Gemini
        gemini = get_gemini_service()
        result = await gemini.extract_lab_values(content, file.content_type)
        
        if not result.success:
            raise HTTPException(status_code=422, detail=result.error or "Failed to extract lab values")
        
        # Return structured result
        return {
            "success": True,
            "lab_name": result.lab_name,
            "report_date": result.report_date,
            "extracted_values": [
                {
                    "test_name": v.test_name,
                    "value": v.value,
                    "unit": v.unit,
                    "reference_range": v.reference_range,
                    "flag": v.flag,
                    "confidence": v.confidence,
                    "mapped_biomarker_id": v.mapped_biomarker_id
                }
                for v in result.extracted_values
            ],
            "unmapped_count": sum(1 for v in result.extracted_values if not v.mapped_biomarker_id)
        }
        
    except ValueError as e:
        raise HTTPException(status_code=500, detail=f"AI service not configured: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ai/explain/{biomarker_id}", tags=["AI"])
async def explain_biomarker(
    biomarker_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Get AI-powered plain-language explanation of a biomarker.
    """
    try:
        from services.gemini_service import get_gemini_service
        
        async with db_pool.acquire() as conn:
            # Get biomarker definition
            biomarker = await conn.fetchrow(
                "SELECT * FROM biomarker_definitions WHERE id = $1", biomarker_id
            )
            if not biomarker:
                raise HTTPException(status_code=404, detail="Biomarker not found")
            
            # Get latest observation for this user
            observation = await conn.fetchrow(
                """
                SELECT value, status, effective_date 
                FROM observations 
                WHERE user_id = $1 AND biomarker_id = $2 AND deleted_at IS NULL
                ORDER BY effective_date DESC LIMIT 1
                """,
                user['id'], biomarker_id
            )
            
            value = float(observation['value']) if observation else None
            status = observation['status'] if observation else 'unknown'
            
            # Get trend
            trend = None
            if observation:
                prev = await conn.fetchrow(
                    """
                    SELECT value FROM observations 
                    WHERE user_id = $1 AND biomarker_id = $2 AND deleted_at IS NULL
                    AND effective_date < $3
                    ORDER BY effective_date DESC LIMIT 1
                    """,
                    user['id'], biomarker_id, observation['effective_date']
                )
                if prev:
                    change = ((value - float(prev['value'])) / float(prev['value'])) * 100
                    trend = f"{'increased' if change > 0 else 'decreased'} by {abs(change):.1f}%"
        
        # Generate explanation
        gemini = get_gemini_service()
        ref_range = f"{biomarker['normal_range_low']}-{biomarker['normal_range_high']}"
        
        result = await gemini.explain_biomarker(
            marker_name=biomarker['name'],
            value=value or 0,
            unit=biomarker['unit'],
            status=status,
            reference_range=ref_range,
            trend=trend
        )
        
        if not result.success:
            raise HTTPException(status_code=500, detail=result.error)
        
        return {
            "biomarker_id": biomarker_id,
            "name": biomarker['name'],
            "current_value": value,
            "unit": biomarker['unit'],
            "status": status,
            "explanation": result.plain_explanation,
            "what_it_measures": result.what_it_measures,
            "why_it_matters": result.why_it_matters,
            "factors_that_affect": result.factors_that_affect,
            "questions_for_doctor": result.questions_for_doctor
        }
        
    except ValueError as e:
        raise HTTPException(status_code=500, detail=f"AI service not configured: {str(e)}")


@app.get("/api/ai/insights", tags=["AI"])
async def get_health_insights(
    user: dict = Depends(get_current_user)
):
    """
    Get AI-powered health insights based on all lab results.
    """
    try:
        from services.gemini_service import get_gemini_service
        
        async with db_pool.acquire() as conn:
            # Get latest observations
            observations = await conn.fetch(
                """
                SELECT DISTINCT ON (o.biomarker_id)
                    o.biomarker_id, o.value, o.status, b.name, b.unit, b.category
                FROM observations o
                JOIN biomarker_definitions b ON o.biomarker_id = b.id
                WHERE o.user_id = $1 AND o.deleted_at IS NULL
                ORDER BY o.biomarker_id, o.effective_date DESC
                """,
                user['id']
            )
            
            # Get conditions
            conditions = await conn.fetch(
                "SELECT name FROM conditions WHERE user_id = $1 AND clinical_status = 'active' AND deleted_at IS NULL",
                user['id']
            )
            
            # Get medications
            medications = await conn.fetch(
                "SELECT name FROM medications WHERE user_id = $1 AND active = true AND deleted_at IS NULL",
                user['id']
            )
        
        if not observations:
            return {"success": True, "summary": "No lab results available for analysis.", "patterns": [], "recommendations": [], "lifestyle_suggestions": []}
        
        # Format data for AI
        obs_data = [
            {"name": o['name'], "value": float(o['value']), "unit": o['unit'], "status": o['status']}
            for o in observations
        ]
        condition_names = [c['name'] for c in conditions]
        medication_names = [m['name'] for m in medications]
        
        # Generate insights
        gemini = get_gemini_service()
        result = await gemini.generate_insights(obs_data, condition_names, medication_names)
        
        if not result.success:
            raise HTTPException(status_code=500, detail=result.error)
        
        return {
            "success": True,
            "summary": result.summary,
            "patterns": result.patterns,
            "recommendations": result.recommendations,
            "lifestyle_suggestions": result.lifestyle_suggestions
        }
        
    except ValueError as e:
        raise HTTPException(status_code=500, detail=f"AI service not configured: {str(e)}")


@app.get("/api/ai/visit-questions", tags=["AI"])
async def get_smart_visit_questions(
    user: dict = Depends(get_current_user)
):
    """
    Get AI-generated smart questions for doctor visit.
    """
    try:
        from services.gemini_service import get_gemini_service
        
        async with db_pool.acquire() as conn:
            # Get flagged markers
            flagged = await conn.fetch(
                """
                SELECT DISTINCT ON (o.biomarker_id)
                    b.name, o.value, b.unit, o.status
                FROM observations o
                JOIN biomarker_definitions b ON o.biomarker_id = b.id
                WHERE o.user_id = $1 AND o.deleted_at IS NULL
                AND o.status IN ('attention', 'critical')
                ORDER BY o.biomarker_id, o.effective_date DESC
                """,
                user['id']
            )
            
            # Get significant changes
            changes = await conn.fetch(
                """
                WITH recent AS (
                    SELECT biomarker_id, value, effective_date,
                           LAG(value) OVER (PARTITION BY biomarker_id ORDER BY effective_date) as prev_value
                    FROM observations
                    WHERE user_id = $1 AND deleted_at IS NULL
                )
                SELECT b.name, 
                       CASE WHEN r.prev_value > 0 THEN ((r.value - r.prev_value) / r.prev_value * 100) ELSE 0 END as change
                FROM recent r
                JOIN biomarker_definitions b ON r.biomarker_id = b.id
                WHERE r.prev_value IS NOT NULL
                AND ABS((r.value - r.prev_value) / NULLIF(r.prev_value, 0) * 100) > 15
                """,
                user['id']
            )
            
            # Get conditions
            conditions = await conn.fetch(
                "SELECT name FROM conditions WHERE user_id = $1 AND clinical_status = 'active' AND deleted_at IS NULL",
                user['id']
            )
        
        flagged_data = [{"name": f['name'], "value": float(f['value']), "unit": f['unit'], "status": f['status']} for f in flagged]
        changes_data = [{"name": c['name'], "change": float(c['change']), "direction": "increased" if c['change'] > 0 else "decreased"} for c in changes]
        condition_names = [c['name'] for c in conditions]
        
        gemini = get_gemini_service()
        questions = await gemini.generate_visit_questions(flagged_data, changes_data, condition_names)
        
        return {"success": True, "questions": questions}
        
    except ValueError as e:
        raise HTTPException(status_code=500, detail=f"AI service not configured: {str(e)}")


@app.get("/api/ai/test-timing", tags=["AI"])
async def get_test_timing_recommendations(
    user: dict = Depends(get_current_user)
):
    """
    Get AI-powered recommendations for optimal test timing.
    """
    try:
        from services.gemini_service import get_gemini_service
        
        async with db_pool.acquire() as conn:
            # Get marker history with variance
            history = await conn.fetch(
                """
                SELECT 
                    b.name,
                    b.id as biomarker_id,
                    array_agg(o.value ORDER BY o.effective_date) as values,
                    STDDEV(o.value) as variance,
                    MAX(o.status) as status,
                    COUNT(*) as test_count,
                    MAX(o.effective_date) as last_test
                FROM observations o
                JOIN biomarker_definitions b ON o.biomarker_id = b.id
                WHERE o.user_id = $1 AND o.deleted_at IS NULL
                GROUP BY b.id, b.name
                HAVING COUNT(*) >= 2
                """,
                user['id']
            )
        
        if not history:
            return {
                "success": True,
                "recommendations": [],
                "general_advice": "Not enough test history for timing optimization. Continue regular testing as recommended by your doctor.",
                "next_test_date": None
            }
        
        history_data = [
            {
                "name": h['name'],
                "values": [float(v) for v in h['values']],
                "variance": float(h['variance']) if h['variance'] else 0,
                "status": h['status'],
                "test_count": h['test_count']
            }
            for h in history
        ]
        
        gemini = get_gemini_service()
        result = await gemini.optimize_test_timing(history_data)
        
        return {"success": True, **result}
        
    except ValueError as e:
        raise HTTPException(status_code=500, detail=f"AI service not configured: {str(e)}")


# ============================================
# PDF Export Endpoints
# ============================================

@app.get("/api/export/visit-pdf", tags=["Export"])
async def export_visit_pdf(
    user: dict = Depends(get_current_user)
):
    """
    Generate and download a PDF visit summary.
    """
    try:
        from services.pdf_service import get_pdf_service
        from services.gemini_service import get_gemini_service
        
        async with db_pool.acquire() as conn:
            # Get user info
            user_info = await conn.fetchrow(
                "SELECT first_name, last_name FROM users WHERE id = $1", user['id']
            )
            patient_name = f"{user_info['first_name'] or ''} {user_info['last_name'] or ''}".strip() or "Patient"
            
            # Get flagged markers
            flagged = await conn.fetch(
                """
                SELECT DISTINCT ON (o.biomarker_id) b.name, o.value, b.unit, o.status
                FROM observations o
                JOIN biomarker_definitions b ON o.biomarker_id = b.id
                WHERE o.user_id = $1 AND o.deleted_at IS NULL AND o.status IN ('attention', 'critical')
                ORDER BY o.biomarker_id, o.effective_date DESC
                """,
                user['id']
            )
            
            # Get significant changes
            changes = await conn.fetch(
                """
                WITH ordered AS (
                    SELECT biomarker_id, value, effective_date,
                           LAG(value) OVER (PARTITION BY biomarker_id ORDER BY effective_date) as prev
                    FROM observations WHERE user_id = $1 AND deleted_at IS NULL
                )
                SELECT b.name, 
                       CASE WHEN o.prev > 0 THEN ((o.value - o.prev) / o.prev * 100) ELSE 0 END as change
                FROM ordered o
                JOIN biomarker_definitions b ON o.biomarker_id = b.id
                WHERE o.prev IS NOT NULL AND ABS((o.value - o.prev) / NULLIF(o.prev, 0) * 100) > 15
                """,
                user['id']
            )
            
            # Get medications, conditions, allergies
            medications = await conn.fetch(
                "SELECT name, dosage, frequency, active FROM medications WHERE user_id = $1 AND deleted_at IS NULL",
                user['id']
            )
            conditions = await conn.fetch(
                "SELECT name, clinical_status as status FROM conditions WHERE user_id = $1 AND deleted_at IS NULL",
                user['id']
            )
            allergies = await conn.fetch(
                "SELECT allergen as name, criticality as severity FROM allergies WHERE user_id = $1 AND deleted_at IS NULL",
                user['id']
            )
        
        # Format data
        flagged_data = [{"name": f['name'], "value": float(f['value']), "unit": f['unit'], "status": f['status']} for f in flagged]
        changes_data = [{"name": c['name'], "change": float(c['change']), "direction": "increased" if c['change'] > 0 else "decreased"} for c in changes]
        
        # Try to get AI insights
        ai_insights = None
        try:
            gemini = get_gemini_service()
            # Get observations for insights
            async with db_pool.acquire() as conn:
                obs = await conn.fetch(
                    """
                    SELECT DISTINCT ON (o.biomarker_id) b.name, o.value, b.unit, o.status
                    FROM observations o
                    JOIN biomarker_definitions b ON o.biomarker_id = b.id
                    WHERE o.user_id = $1 AND o.deleted_at IS NULL
                    ORDER BY o.biomarker_id, o.effective_date DESC
                    """,
                    user['id']
                )
            obs_data = [{"name": o['name'], "value": float(o['value']), "unit": o['unit'], "status": o['status']} for o in obs]
            condition_names = [c['name'] for c in conditions if c['status'] == 'active']
            med_names = [m['name'] for m in medications if m['active']]
            
            insight_result = await gemini.generate_insights(obs_data, condition_names, med_names)
            if insight_result.success:
                ai_insights = {
                    "summary": insight_result.summary,
                    "lifestyle_suggestions": insight_result.lifestyle_suggestions
                }
        except:
            pass  # AI insights are optional
        
        # Generate default questions
        questions = [
            "What do my flagged markers indicate about my health?",
            "Should I be concerned about the significant changes in my results?",
            "Are my current medications affecting any of these results?",
            "What lifestyle changes would you recommend?",
            "When should I retest these markers?"
        ]
        
        # Generate PDF
        pdf_service = get_pdf_service()
        from datetime import datetime
        
        pdf_bytes = pdf_service.generate_visit_summary(
            patient_name=patient_name,
            report_date=datetime.now(),
            flagged_markers=flagged_data,
            significant_changes=changes_data,
            medications=[dict(m) for m in medications],
            conditions=[dict(c) for c in conditions],
            allergies=[dict(a) for a in allergies],
            questions=questions,
            ai_insights=ai_insights
        )
        
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=visit-summary-{datetime.now().strftime('%Y-%m-%d')}.pdf"}
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Family Members (Family Health Graph)
# ============================================

class FamilyMemberCreate(BaseModel):
    name: str
    relationship: str  # parent, sibling, child, grandparent, etc.
    date_of_birth: Optional[date] = None
    notes: Optional[str] = None

class FamilyMemberResponse(BaseModel):
    id: str
    name: str
    relationship: str
    date_of_birth: Optional[date]
    notes: Optional[str]
    conditions: List[str]

@app.get("/api/family", response_model=List[FamilyMemberResponse], tags=["Family"])
async def get_family_members(user: dict = Depends(get_current_user)):
    """Get all family members for family health graph."""
    async with db_pool.acquire() as conn:
        members = await conn.fetch(
            """
            SELECT fm.*, 
                   COALESCE(array_agg(fc.condition_name) FILTER (WHERE fc.condition_name IS NOT NULL), '{}') as conditions
            FROM family_members fm
            LEFT JOIN family_conditions fc ON fm.id = fc.family_member_id
            WHERE fm.user_id = $1 AND fm.deleted_at IS NULL
            GROUP BY fm.id
            """,
            user['id']
        )
        return [
            FamilyMemberResponse(
                id=str(m['id']),
                name=m['name'],
                relationship=m['relationship'],
                date_of_birth=m['date_of_birth'],
                notes=m['notes'],
                conditions=list(m['conditions']) if m['conditions'] else []
            )
            for m in members
        ]

@app.post("/api/family", response_model=FamilyMemberResponse, tags=["Family"])
async def create_family_member(
    member: FamilyMemberCreate,
    user: dict = Depends(get_current_user)
):
    """Add a family member for family health tracking."""
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO family_members (user_id, name, relationship, date_of_birth, notes)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, name, relationship, date_of_birth, notes
            """,
            user['id'], member.name, member.relationship, member.date_of_birth, member.notes
        )
        return FamilyMemberResponse(
            id=str(row['id']),
            name=row['name'],
            relationship=row['relationship'],
            date_of_birth=row['date_of_birth'],
            notes=row['notes'],
            conditions=[]
        )

class FamilyConditionCreate(BaseModel):
    condition_name: str
    age_at_diagnosis: Optional[int] = None
    notes: Optional[str] = None

@app.post("/api/family/{member_id}/conditions", tags=["Family"])
async def add_family_condition(
    member_id: str,
    condition: FamilyConditionCreate,
    user: dict = Depends(get_current_user)
):
    """Add a health condition to a family member."""
    async with db_pool.acquire() as conn:
        # Verify ownership
        member = await conn.fetchrow(
            "SELECT id FROM family_members WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
            member_id, user['id']
        )
        if not member:
            raise HTTPException(status_code=404, detail="Family member not found")
        
        await conn.execute(
            """
            INSERT INTO family_conditions (family_member_id, condition_name, age_at_diagnosis, notes)
            VALUES ($1, $2, $3, $4)
            """,
            member_id, condition.condition_name, condition.age_at_diagnosis, condition.notes
        )
        return {"success": True}

@app.get("/api/family/risk-patterns", tags=["Family"])
async def get_family_risk_patterns(user: dict = Depends(get_current_user)):
    """
    Analyze family health history to identify potential risk patterns.
    """
    async with db_pool.acquire() as conn:
        # Get all family conditions
        conditions = await conn.fetch(
            """
            SELECT fc.condition_name, fm.relationship, fc.age_at_diagnosis
            FROM family_conditions fc
            JOIN family_members fm ON fc.family_member_id = fm.id
            WHERE fm.user_id = $1 AND fm.deleted_at IS NULL
            """,
            user['id']
        )
    
    if not conditions:
        return {"patterns": [], "recommendations": []}
    
    # Group conditions
    condition_counts = {}
    for c in conditions:
        name = c['condition_name'].lower()
        if name not in condition_counts:
            condition_counts[name] = {"count": 0, "relationships": [], "ages": []}
        condition_counts[name]["count"] += 1
        condition_counts[name]["relationships"].append(c['relationship'])
        if c['age_at_diagnosis']:
            condition_counts[name]["ages"].append(c['age_at_diagnosis'])
    
    # Identify patterns (conditions in multiple family members)
    patterns = []
    recommendations = []
    
    for condition, data in condition_counts.items():
        if data["count"] >= 2:
            avg_age = sum(data["ages"]) / len(data["ages"]) if data["ages"] else None
            patterns.append({
                "condition": condition.title(),
                "family_members_affected": data["count"],
                "relationships": list(set(data["relationships"])),
                "average_age_at_diagnosis": round(avg_age) if avg_age else None,
                "risk_level": "elevated" if data["count"] >= 2 else "normal"
            })
            
            # Add recommendation
            recommendations.append(
                f"Consider discussing {condition} screening with your doctor due to family history "
                f"({data['count']} family members affected)."
            )
    
    return {
        "patterns": patterns,
        "recommendations": recommendations[:5]  # Limit to top 5
    }


# ============================================
# Health Check
# ============================================

@app.get("/health", tags=["System"])
async def health_check():
    return {"status": "healthy", "version": "3.0.0"}

@app.get("/", tags=["System"])
async def root():
    return {"message": "HealthCanvas API", "docs": "/docs", "version": "3.0.0"}

# ============================================
# Run with: uvicorn main:app --reload
# ============================================
