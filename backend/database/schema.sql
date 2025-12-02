-- ============================================
-- HEALTHCANVAS - PostgreSQL Database Schema
-- FHIR R4 Aligned Data Model
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- CORE TABLES
-- ============================================

-- Users (Patient in FHIR terms)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Profile
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    date_of_birth DATE,
    gender VARCHAR(20),
    blood_type VARCHAR(5),
    
    -- Contact
    phone VARCHAR(20),
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'India',
    postal_code VARCHAR(20),
    
    -- Emergency Contact
    emergency_contact_name VARCHAR(200),
    emergency_contact_phone VARCHAR(20),
    emergency_contact_relation VARCHAR(50),
    
    -- Settings
    unit_system VARCHAR(10) DEFAULT 'metric', -- metric or imperial
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    language VARCHAR(10) DEFAULT 'en',
    
    -- Security
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret VARCHAR(100),
    last_login_at TIMESTAMP WITH TIME ZONE,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Sessions for JWT refresh tokens
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    device_info JSONB,
    ip_address INET,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- BIOMARKER DEFINITIONS (System Reference Data)
-- ============================================

CREATE TABLE biomarker_definitions (
    id VARCHAR(50) PRIMARY KEY, -- e.g., 'glucose', 'hba1c'
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    unit VARCHAR(30) NOT NULL,
    
    -- Reference ranges (standard/optimal)
    normal_range_low DECIMAL(10,4),
    normal_range_high DECIMAL(10,4),
    optimal_range_low DECIMAL(10,4),
    optimal_range_high DECIMAL(10,4),
    critical_low DECIMAL(10,4),
    critical_high DECIMAL(10,4),
    
    -- Metadata
    description TEXT,
    influences TEXT[], -- Array of factors that influence this marker
    related_markers TEXT[], -- Array of related marker IDs
    aliases TEXT[], -- Alternative names for search
    higher_is_better BOOLEAN, -- NULL means neither direction is inherently better
    
    -- LOINC code for FHIR compliance
    loinc_code VARCHAR(20),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- OBSERVATIONS (Lab Results - FHIR Observation)
-- ============================================

CREATE TABLE observations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    biomarker_id VARCHAR(50) NOT NULL REFERENCES biomarker_definitions(id),
    
    -- Value
    value DECIMAL(10,4) NOT NULL,
    unit VARCHAR(30) NOT NULL,
    
    -- Lab-specific reference (may differ from standard)
    lab_reference_low DECIMAL(10,4),
    lab_reference_high DECIMAL(10,4),
    lab_flag VARCHAR(10), -- 'H', 'L', 'HH', 'LL', 'N'
    
    -- Source
    source_type VARCHAR(30) DEFAULT 'manual', -- manual, ocr, api, wearable
    lab_name VARCHAR(100),
    lab_report_id UUID, -- Reference to diagnostic_reports if applicable
    
    -- Timing
    effective_date DATE NOT NULL,
    effective_time TIME,
    
    -- Notes
    notes TEXT,
    
    -- Computed fields (updated by trigger)
    status VARCHAR(20), -- optimal, normal, attention, critical
    deviation_score DECIMAL(5,2), -- How far from optimal (normalized)
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_observations_user_date ON observations(user_id, effective_date DESC);
CREATE INDEX idx_observations_user_biomarker ON observations(user_id, biomarker_id);
CREATE INDEX idx_observations_biomarker ON observations(biomarker_id);

-- ============================================
-- DIAGNOSTIC REPORTS (Lab Reports - FHIR DiagnosticReport)
-- ============================================

CREATE TABLE diagnostic_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Report details
    report_name VARCHAR(200),
    report_date DATE NOT NULL,
    lab_name VARCHAR(100),
    ordering_physician VARCHAR(200),
    
    -- Source document
    source_type VARCHAR(30), -- pdf, image, manual
    original_filename VARCHAR(255),
    storage_path VARCHAR(500), -- S3 path or local path
    ocr_extracted_text TEXT,
    ocr_confidence DECIMAL(5,2),
    
    -- Status
    processing_status VARCHAR(30) DEFAULT 'pending', -- pending, processing, completed, failed
    review_status VARCHAR(30) DEFAULT 'unreviewed', -- unreviewed, reviewed, confirmed
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- MEDICATIONS (FHIR MedicationStatement)
-- ============================================

CREATE TABLE medications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Medication details
    name VARCHAR(200) NOT NULL,
    generic_name VARCHAR(200),
    dosage VARCHAR(100),
    unit VARCHAR(30),
    frequency VARCHAR(100), -- 'Daily', 'Twice daily', 'As needed'
    route VARCHAR(50), -- oral, injection, topical
    
    -- Category
    category VARCHAR(50), -- prescription, supplement, otc
    
    -- Timing
    start_date DATE,
    end_date DATE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Prescriber
    prescribing_physician VARCHAR(200),
    
    -- Notes
    reason TEXT,
    notes TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_medications_user ON medications(user_id, is_active);

-- ============================================
-- CONDITIONS (Diagnoses - FHIR Condition)
-- ============================================

CREATE TABLE conditions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Condition details
    name VARCHAR(200) NOT NULL,
    icd10_code VARCHAR(20), -- ICD-10 code for standardization
    
    -- Clinical status
    clinical_status VARCHAR(30) DEFAULT 'active', -- active, recurrence, relapse, inactive, remission, resolved
    verification_status VARCHAR(30) DEFAULT 'confirmed', -- unconfirmed, provisional, differential, confirmed
    severity VARCHAR(20), -- mild, moderate, severe
    
    -- Timing
    onset_date DATE,
    abatement_date DATE, -- When condition resolved
    
    -- Source
    diagnosed_by VARCHAR(200),
    
    -- Notes
    notes TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_conditions_user ON conditions(user_id, clinical_status);

-- ============================================
-- PROCEDURES (FHIR Procedure)
-- ============================================

CREATE TABLE procedures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Procedure details
    name VARCHAR(200) NOT NULL,
    procedure_type VARCHAR(50), -- surgery, imaging, biopsy, endoscopy, other
    cpt_code VARCHAR(20), -- CPT code for standardization
    
    -- Timing
    performed_date DATE NOT NULL,
    performed_time TIME,
    
    -- Location
    facility_name VARCHAR(200),
    facility_location VARCHAR(200),
    
    -- Providers
    performed_by VARCHAR(200),
    
    -- Outcome
    outcome VARCHAR(50), -- successful, complications, inconclusive
    findings TEXT,
    
    -- Notes
    notes TEXT,
    
    -- Related documents
    report_storage_path VARCHAR(500),
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- ALLERGIES (FHIR AllergyIntolerance)
-- ============================================

CREATE TABLE allergies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Allergy details
    allergen VARCHAR(200) NOT NULL,
    allergy_type VARCHAR(30), -- allergy, intolerance
    category VARCHAR(30), -- food, medication, environment, biologic
    
    -- Severity
    criticality VARCHAR(20), -- low, high, unable-to-assess
    
    -- Reaction
    reaction_description TEXT,
    reaction_severity VARCHAR(20), -- mild, moderate, severe
    
    -- Timing
    onset_date DATE,
    
    -- Status
    clinical_status VARCHAR(20) DEFAULT 'active', -- active, inactive, resolved
    verification_status VARCHAR(20) DEFAULT 'confirmed',
    
    -- Notes
    notes TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- VACCINATIONS (FHIR Immunization)
-- ============================================

CREATE TABLE vaccinations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Vaccine details
    vaccine_name VARCHAR(200) NOT NULL,
    vaccine_code VARCHAR(50), -- CVX code
    manufacturer VARCHAR(100),
    lot_number VARCHAR(50),
    
    -- Administration
    administration_date DATE NOT NULL,
    site VARCHAR(50), -- left arm, right arm, etc.
    route VARCHAR(30), -- intramuscular, subcutaneous, oral
    
    -- Provider
    administered_by VARCHAR(200),
    facility_name VARCHAR(200),
    
    -- Dose info
    dose_number INTEGER,
    series_doses INTEGER, -- Total doses in series
    
    -- Next dose
    next_dose_due DATE,
    
    -- Status
    status VARCHAR(20) DEFAULT 'completed', -- completed, entered-in-error, not-done
    
    -- Notes
    notes TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- HEALTH GOALS
-- ============================================

CREATE TABLE health_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Goal details
    biomarker_id VARCHAR(50) REFERENCES biomarker_definitions(id),
    goal_type VARCHAR(30), -- biomarker, weight, activity, custom
    
    -- Targets
    target_value DECIMAL(10,4),
    target_direction VARCHAR(20), -- increase, decrease, maintain
    baseline_value DECIMAL(10,4),
    current_value DECIMAL(10,4),
    
    -- Timing
    start_date DATE DEFAULT CURRENT_DATE,
    target_date DATE,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active', -- active, achieved, abandoned
    
    -- Notes
    description TEXT,
    notes TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- LIFESTYLE JOURNAL
-- ============================================

CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Date
    entry_date DATE NOT NULL,
    
    -- Metrics
    sleep_hours DECIMAL(3,1),
    sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 5),
    energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 5),
    mood_level INTEGER CHECK (mood_level BETWEEN 1 AND 5),
    stress_level INTEGER CHECK (stress_level BETWEEN 1 AND 5),
    
    -- Activity
    exercise_done BOOLEAN DEFAULT FALSE,
    exercise_type VARCHAR(100),
    exercise_duration_minutes INTEGER,
    steps INTEGER,
    
    -- Nutrition
    water_intake_ml INTEGER,
    meals_logged JSONB, -- Array of meal objects
    
    -- Symptoms
    symptoms TEXT[],
    
    -- Notes
    notes TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_journal_user_date ON journal_entries(user_id, entry_date);

-- ============================================
-- PATTERN ALERTS (System-generated)
-- ============================================

CREATE TABLE pattern_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Alert details
    alert_type VARCHAR(50) NOT NULL, -- metabolic_syndrome, anemia, thyroid, kidney, etc.
    severity VARCHAR(20) NOT NULL, -- info, warning, critical
    title VARCHAR(200) NOT NULL,
    description TEXT,
    
    -- Related markers
    related_markers TEXT[],
    
    -- Status
    status VARCHAR(20) DEFAULT 'active', -- active, dismissed, resolved
    dismissed_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- WATCH LIST
-- ============================================

CREATE TABLE watched_markers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    biomarker_id VARCHAR(50) NOT NULL REFERENCES biomarker_definitions(id),
    
    -- Notification preferences
    notify_on_new_result BOOLEAN DEFAULT TRUE,
    notify_on_status_change BOOLEAN DEFAULT TRUE,
    
    -- Custom thresholds (override system defaults)
    custom_alert_low DECIMAL(10,4),
    custom_alert_high DECIMAL(10,4),
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, biomarker_id)
);

-- ============================================
-- SHARE LINKS
-- ============================================

CREATE TABLE share_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Link details
    access_code VARCHAR(100) UNIQUE NOT NULL,
    
    -- What to share
    share_type VARCHAR(30), -- full_history, visit_summary, specific_report
    share_config JSONB, -- Configuration for what's included
    
    -- Access control
    recipient_email VARCHAR(255),
    recipient_name VARCHAR(200),
    password_hash VARCHAR(255), -- Optional password protection
    
    -- Timing
    expires_at TIMESTAMP WITH TIME ZONE,
    max_views INTEGER DEFAULT 1,
    view_count INTEGER DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    last_accessed_ip INET,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- AUDIT LOG
-- ============================================

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    
    -- Action details
    action VARCHAR(50) NOT NULL, -- create, read, update, delete, export, share
    resource_type VARCHAR(50) NOT NULL, -- observation, medication, condition, etc.
    resource_id UUID,
    
    -- Context
    ip_address INET,
    user_agent TEXT,
    
    -- Changes
    old_values JSONB,
    new_values JSONB,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update observation status based on value
CREATE OR REPLACE FUNCTION calculate_observation_status()
RETURNS TRIGGER AS $$
DECLARE
    bio_def RECORD;
BEGIN
    SELECT * INTO bio_def FROM biomarker_definitions WHERE id = NEW.biomarker_id;
    
    IF bio_def IS NULL THEN
        NEW.status := 'unknown';
        NEW.deviation_score := 0;
        RETURN NEW;
    END IF;
    
    -- Calculate status
    IF NEW.value <= bio_def.critical_low OR NEW.value >= bio_def.critical_high THEN
        NEW.status := 'critical';
    ELSIF NEW.value >= bio_def.optimal_range_low AND NEW.value <= bio_def.optimal_range_high THEN
        NEW.status := 'optimal';
    ELSIF NEW.value >= bio_def.normal_range_low AND NEW.value <= bio_def.normal_range_high THEN
        NEW.status := 'normal';
    ELSE
        NEW.status := 'attention';
    END IF;
    
    -- Calculate deviation score (0 = optimal, higher = worse)
    IF bio_def.optimal_range_high - bio_def.optimal_range_low > 0 THEN
        NEW.deviation_score := ABS(NEW.value - (bio_def.optimal_range_low + bio_def.optimal_range_high) / 2) 
                               / ((bio_def.optimal_range_high - bio_def.optimal_range_low) / 2);
    ELSE
        NEW.deviation_score := 0;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_observation_status
    BEFORE INSERT OR UPDATE ON observations
    FOR EACH ROW
    EXECUTE FUNCTION calculate_observation_status();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_observations_updated_at BEFORE UPDATE ON observations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_medications_updated_at BEFORE UPDATE ON medications FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_conditions_updated_at BEFORE UPDATE ON conditions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_procedures_updated_at BEFORE UPDATE ON procedures FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_allergies_updated_at BEFORE UPDATE ON allergies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_vaccinations_updated_at BEFORE UPDATE ON vaccinations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- SEED DATA: Biomarker Definitions
-- ============================================

INSERT INTO biomarker_definitions (id, name, category, unit, normal_range_low, normal_range_high, optimal_range_low, optimal_range_high, critical_low, critical_high, description, influences, related_markers, aliases, higher_is_better, loinc_code) VALUES
-- Metabolic
('glucose', 'Fasting Glucose', 'Metabolic', 'mg/dL', 70, 100, 72, 90, 54, 126, 'Blood sugar level after fasting', ARRAY['Diet', 'Sleep', 'Stress', 'Exercise'], ARRAY['hba1c', 'insulin'], ARRAY['fbs', 'blood glucose'], false, '1558-6'),
('hba1c', 'HbA1c', 'Metabolic', '%', 4.0, 5.6, 4.5, 5.2, 3.5, 6.5, 'Average blood sugar over 2-3 months', ARRAY['Dietary patterns', 'Exercise', 'Medication'], ARRAY['glucose', 'insulin'], ARRAY['a1c', 'glycated hemoglobin'], false, '4548-4'),
('insulin', 'Fasting Insulin', 'Metabolic', 'µIU/mL', 2.6, 24.9, 3, 10, 1, 30, 'Hormone regulating blood sugar', ARRAY['Carbohydrate intake', 'Body composition', 'Exercise'], ARRAY['glucose', 'hba1c'], ARRAY['serum insulin'], false, '20448-7'),

-- Cardiovascular
('totalCholesterol', 'Total Cholesterol', 'Cardiovascular', 'mg/dL', 125, 200, 140, 180, 100, 240, 'Sum of all cholesterol types', ARRAY['Diet', 'Genetics', 'Exercise'], ARRAY['ldl', 'hdl', 'triglycerides'], ARRAY['cholesterol', 'tc'], NULL, '2093-3'),
('ldl', 'LDL Cholesterol', 'Cardiovascular', 'mg/dL', 0, 100, 0, 70, 0, 160, 'Bad cholesterol linked to arterial plaque', ARRAY['Saturated fat', 'Trans fats', 'Genetics'], ARRAY['totalCholesterol', 'hdl'], ARRAY['ldl-c'], false, '2089-1'),
('hdl', 'HDL Cholesterol', 'Cardiovascular', 'mg/dL', 40, 100, 60, 100, 35, 120, 'Good cholesterol that is protective', ARRAY['Exercise', 'Healthy fats', 'Not smoking'], ARRAY['totalCholesterol', 'ldl'], ARRAY['hdl-c'], true, '2085-9'),
('triglycerides', 'Triglycerides', 'Cardiovascular', 'mg/dL', 0, 150, 0, 100, 0, 500, 'Blood fats from unused calories', ARRAY['Carbohydrates', 'Alcohol', 'Sugar'], ARRAY['glucose', 'hdl'], ARRAY['tg'], false, '2571-8'),

-- Kidney
('creatinine', 'Creatinine', 'Kidney', 'mg/dL', 0.7, 1.3, 0.8, 1.1, 0.5, 1.5, 'Waste product filtered by kidneys', ARRAY['Muscle mass', 'Protein intake', 'Hydration'], ARRAY['bun', 'egfr'], ARRAY['creat'], false, '2160-0'),
('egfr', 'eGFR', 'Kidney', 'mL/min', 90, 120, 100, 120, 60, 150, 'Estimated kidney filtration rate', ARRAY['Age', 'Kidney health', 'Hydration'], ARRAY['creatinine', 'bun'], ARRAY['gfr'], true, '33914-3'),
('bun', 'BUN', 'Kidney', 'mg/dL', 7, 20, 10, 16, 5, 30, 'Blood urea nitrogen', ARRAY['Protein intake', 'Hydration', 'Kidney function'], ARRAY['creatinine', 'egfr'], ARRAY['blood urea nitrogen'], false, '3094-0'),

-- Liver
('alt', 'ALT', 'Liver', 'U/L', 7, 56, 10, 35, 5, 100, 'Liver enzyme for cell damage', ARRAY['Alcohol', 'Medications', 'Fatty liver'], ARRAY['ast', 'ggt'], ARRAY['sgpt'], false, '1742-6'),
('ast', 'AST', 'Liver', 'U/L', 10, 40, 15, 30, 5, 80, 'Found in liver and heart', ARRAY['Liver damage', 'Heart damage', 'Exercise'], ARRAY['alt', 'ggt'], ARRAY['sgot'], false, '1920-8'),

-- Thyroid
('tsh', 'TSH', 'Thyroid', 'mIU/L', 0.4, 4.0, 1.0, 2.5, 0.1, 10.0, 'Primary thyroid marker', ARRAY['Iodine', 'Stress', 'Sleep'], ARRAY['freeT4', 'freeT3'], ARRAY['thyroid stimulating hormone'], NULL, '3016-3'),
('freeT4', 'Free T4', 'Thyroid', 'ng/dL', 0.8, 1.8, 1.0, 1.5, 0.5, 2.5, 'Active thyroid hormone', ARRAY['Thyroid function', 'Iodine'], ARRAY['tsh', 'freeT3'], ARRAY['ft4'], NULL, '3024-7'),

-- Inflammation
('crp', 'hs-CRP', 'Inflammation', 'mg/L', 0, 3.0, 0, 1.0, 0, 10.0, 'Inflammation marker for CV risk', ARRAY['Infection', 'Obesity', 'Sleep'], ARRAY['esr'], ARRAY['c-reactive protein', 'hscrp'], false, '30522-7'),

-- Nutrients
('vitaminD', 'Vitamin D', 'Nutrients', 'ng/mL', 30, 100, 40, 60, 20, 100, 'Critical for bones, immunity, mood', ARRAY['Sun exposure', 'Supplementation'], ARRAY['calcium'], ARRAY['25-oh vitamin d'], true, '1989-3'),
('vitaminB12', 'Vitamin B12', 'Nutrients', 'pg/mL', 200, 900, 400, 800, 150, 1000, 'Essential for nerves and RBCs', ARRAY['Animal products', 'Supplementation'], ARRAY['folate', 'homocysteine'], ARRAY['cobalamin', 'b12'], true, '2132-9'),
('ferritin', 'Ferritin', 'Nutrients', 'ng/mL', 30, 300, 50, 150, 15, 400, 'Iron storage protein', ARRAY['Dietary iron', 'Vitamin C'], ARRAY['iron', 'hemoglobin'], ARRAY['serum ferritin'], NULL, '2276-4'),

-- Blood Count
('hemoglobin', 'Hemoglobin', 'Blood Count', 'g/dL', 12.0, 17.5, 13.5, 16.0, 10.0, 19.0, 'Oxygen-carrying protein', ARRAY['Iron', 'B12', 'Blood loss'], ARRAY['rbc', 'hematocrit'], ARRAY['hgb', 'hb'], NULL, '718-7'),
('wbc', 'White Blood Cells', 'Blood Count', 'K/µL', 4.5, 11.0, 5.0, 8.0, 3.0, 15.0, 'Immune cells', ARRAY['Infection', 'Inflammation', 'Stress'], ARRAY['crp'], ARRAY['leukocytes'], NULL, '6690-2'),
('platelets', 'Platelets', 'Blood Count', 'K/µL', 150, 400, 175, 300, 100, 500, 'Cells for blood clotting', ARRAY['Bone marrow', 'Infections'], ARRAY['wbc'], ARRAY['plt'], NULL, '777-3'),

-- Electrolytes
('sodium', 'Sodium', 'Electrolytes', 'mEq/L', 136, 145, 138, 142, 130, 150, 'Critical for fluid balance', ARRAY['Hydration', 'Kidney function'], ARRAY['potassium', 'chloride'], ARRAY['na'], NULL, '2951-2'),
('potassium', 'Potassium', 'Electrolytes', 'mEq/L', 3.5, 5.0, 4.0, 4.5, 3.0, 5.5, 'Critical for heart rhythm', ARRAY['Diet', 'Kidney function'], ARRAY['sodium', 'magnesium'], ARRAY['k'], NULL, '2823-3');

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- Latest observation per biomarker for a user
CREATE VIEW latest_observations AS
SELECT DISTINCT ON (user_id, biomarker_id)
    o.*,
    bd.name as biomarker_name,
    bd.category,
    bd.optimal_range_low,
    bd.optimal_range_high
FROM observations o
JOIN biomarker_definitions bd ON o.biomarker_id = bd.id
WHERE o.deleted_at IS NULL
ORDER BY user_id, biomarker_id, effective_date DESC, created_at DESC;

-- Health score by category
CREATE VIEW health_scores AS
SELECT 
    o.user_id,
    bd.category,
    AVG(CASE 
        WHEN o.status = 'optimal' THEN 100
        WHEN o.status = 'normal' THEN 75
        WHEN o.status = 'attention' THEN 45
        WHEN o.status = 'critical' THEN 20
        ELSE 50
    END) as score,
    COUNT(*) as marker_count
FROM observations o
JOIN biomarker_definitions bd ON o.biomarker_id = bd.id
WHERE o.deleted_at IS NULL
  AND o.id IN (
      SELECT id FROM latest_observations 
      WHERE user_id = o.user_id AND biomarker_id = o.biomarker_id
  )
GROUP BY o.user_id, bd.category;

-- ============================================
-- FAMILY HEALTH GRAPH TABLES
-- ============================================

-- Family Members (for hereditary risk tracking)
CREATE TABLE family_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    name VARCHAR(200) NOT NULL,
    relationship VARCHAR(50) NOT NULL, -- parent, sibling, child, grandparent, aunt, uncle, cousin
    date_of_birth DATE,
    date_of_death DATE,
    gender VARCHAR(20),
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_family_members_user ON family_members(user_id);

-- Family Health Conditions (conditions that run in family)
CREATE TABLE family_conditions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    
    condition_name VARCHAR(200) NOT NULL,
    icd10_code VARCHAR(10),
    age_at_diagnosis INTEGER,
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_family_conditions_member ON family_conditions(family_member_id);

-- Trigger for family_members updated_at
CREATE TRIGGER update_family_members_updated_at
    BEFORE UPDATE ON family_members
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- GRANTS (adjust role names as needed)
-- ============================================

-- GRANT USAGE ON SCHEMA public TO healthcanvas_api;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO healthcanvas_api;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO healthcanvas_api;
