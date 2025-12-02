import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

// ============================================
// HEALTHCANVAS v3.0 - Full Stack Integration
// React + FastAPI + PostgreSQL
// ============================================

// Design Tokens
const COLORS = {
  bgPrimary: '#FAFBFC',
  bgSecondary: '#F1F5F9',
  bgCard: '#FFFFFF',
  primary: '#0EA5E9',
  primaryLight: '#E0F2FE',
  primaryDark: '#0284C7',
  secondary: '#14B8A6',
  secondaryLight: '#CCFBF1',
  optimal: '#10B981',
  optimalLight: '#D1FAE5',
  normal: '#3B82F6',
  normalLight: '#DBEAFE',
  attention: '#F59E0B',
  attentionLight: '#FEF3C7',
  critical: '#EF4444',
  criticalLight: '#FEE2E2',
  text: '#1E293B',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
};

const SHADOWS = {
  sm: '0 1px 2px rgba(15, 23, 42, 0.05)',
  md: '0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -1px rgba(15, 23, 42, 0.04)',
  lg: '0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -2px rgba(15, 23, 42, 0.04)',
  xl: '0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 10px 10px -5px rgba(15, 23, 42, 0.04)',
};

// ============================================
// API CLIENT SERVICE
// ============================================

const API_BASE = import.meta.env.VITE_API_URL || '';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('healthcanvas_token');
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('healthcanvas_token', token);
    } else {
      localStorage.removeItem('healthcanvas_token');
    }
  }

  async request(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
      
      if (response.status === 401) {
        this.setToken(null);
        window.dispatchEvent(new Event('auth:logout'));
        throw new Error('Session expired');
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Request failed');
      }
      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  // Auth
  async register(email, password, firstName, lastName) {
    const data = await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, first_name: firstName, last_name: lastName })
    });
    this.setToken(data.access_token);
    return data;
  }

  async login(email, password) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.setToken(data.access_token);
    return data;
  }

  async getMe() {
    return this.request('/api/auth/me');
  }

  logout() {
    this.setToken(null);
  }

  // Biomarkers
  async getBiomarkers(category = null) {
    const params = category ? `?category=${category}` : '';
    return this.request(`/api/biomarkers${params}`);
  }

  // Observations (Lab Results)
  async getObservations(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/observations${query ? '?' + query : ''}`);
  }

  async createObservation(data) {
    return this.request('/api/observations', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateObservation(id, data) {
    return this.request(`/api/observations/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteObservation(id) {
    return this.request(`/api/observations/${id}`, { method: 'DELETE' });
  }

  // Medications
  async getMedications(activeOnly = false) {
    return this.request(`/api/medications${activeOnly ? '?active_only=true' : ''}`);
  }

  async createMedication(data) {
    return this.request('/api/medications', { method: 'POST', body: JSON.stringify(data) });
  }

  async toggleMedication(id) {
    return this.request(`/api/medications/${id}/toggle`, { method: 'PATCH' });
  }

  async deleteMedication(id) {
    return this.request(`/api/medications/${id}`, { method: 'DELETE' });
  }

  // Conditions
  async getConditions() {
    return this.request('/api/conditions');
  }

  async createCondition(data) {
    return this.request('/api/conditions', { method: 'POST', body: JSON.stringify(data) });
  }

  // Allergies
  async getAllergies() {
    return this.request('/api/allergies');
  }

  async createAllergy(data) {
    return this.request('/api/allergies', { method: 'POST', body: JSON.stringify(data) });
  }

  // Vaccinations
  async getVaccinations() {
    return this.request('/api/vaccinations');
  }

  async createVaccination(data) {
    return this.request('/api/vaccinations', { method: 'POST', body: JSON.stringify(data) });
  }

  // Procedures
  async getProcedures() {
    return this.request('/api/procedures');
  }

  async createProcedure(data) {
    return this.request('/api/procedures', { method: 'POST', body: JSON.stringify(data) });
  }

  // Goals
  async getGoals() {
    return this.request('/api/goals');
  }

  async createGoal(data) {
    return this.request('/api/goals', { method: 'POST', body: JSON.stringify(data) });
  }

  // Journal
  async getJournal(limit = 30) {
    return this.request(`/api/journal?limit=${limit}`);
  }

  async createJournalEntry(data) {
    return this.request('/api/journal', { method: 'POST', body: JSON.stringify(data) });
  }

  // Dashboard
  async getDashboard() {
    return this.request('/api/dashboard');
  }

  // Visit Prep
  async getVisitPrep() {
    return this.request('/api/visit-prep');
  }
}

const api = new ApiClient();

// ============================================
// AUTH CONTEXT
// ============================================

const AuthContext = createContext(null);

const useAuth = () => useContext(AuthContext);

// ============================================
// BIOMARKER DEFINITIONS (Client-side reference)
// ============================================

const BIOMARKER_DEFINITIONS = {
  // METABOLIC
  glucose: { name: 'Fasting Glucose', unit: 'mg/dL', category: 'Metabolic', normalRange: [70, 100], optimalRange: [72, 90], criticalLow: 54, criticalHigh: 126, description: 'Blood sugar level after fasting.', influences: ['Diet', 'Sleep', 'Stress', 'Exercise'], relatedMarkers: ['hba1c', 'insulin'], aliases: ['fbs', 'blood glucose'], higherIsBetter: false },
  hba1c: { name: 'HbA1c', unit: '%', category: 'Metabolic', normalRange: [4.0, 5.6], optimalRange: [4.5, 5.2], criticalLow: 3.5, criticalHigh: 6.5, description: 'Average blood sugar over 2-3 months.', influences: ['Dietary patterns', 'Exercise', 'Medication'], relatedMarkers: ['glucose', 'insulin'], aliases: ['a1c', 'glycated hemoglobin'], higherIsBetter: false },
  insulin: { name: 'Fasting Insulin', unit: 'µIU/mL', category: 'Metabolic', normalRange: [2.6, 24.9], optimalRange: [3, 10], criticalLow: 1, criticalHigh: 30, description: 'Hormone regulating blood sugar.', influences: ['Carbohydrate intake', 'Body composition', 'Exercise'], relatedMarkers: ['glucose', 'hba1c'], aliases: ['serum insulin'], higherIsBetter: false },
  
  // CARDIOVASCULAR  
  totalCholesterol: { name: 'Total Cholesterol', unit: 'mg/dL', category: 'Cardiovascular', normalRange: [125, 200], optimalRange: [140, 180], criticalLow: 100, criticalHigh: 240, description: 'Sum of all cholesterol types.', influences: ['Diet', 'Genetics', 'Exercise'], relatedMarkers: ['ldl', 'hdl', 'triglycerides'], aliases: ['cholesterol', 'tc'], higherIsBetter: null },
  ldl: { name: 'LDL Cholesterol', unit: 'mg/dL', category: 'Cardiovascular', normalRange: [0, 100], optimalRange: [0, 70], criticalLow: 0, criticalHigh: 160, description: '"Bad" cholesterol. High levels linked to arterial plaque.', influences: ['Saturated fat', 'Trans fats', 'Genetics'], relatedMarkers: ['totalCholesterol', 'hdl'], aliases: ['ldl-c'], higherIsBetter: false },
  hdl: { name: 'HDL Cholesterol', unit: 'mg/dL', category: 'Cardiovascular', normalRange: [40, 100], optimalRange: [60, 100], criticalLow: 35, criticalHigh: 120, description: '"Good" cholesterol. Higher levels are protective.', influences: ['Exercise', 'Healthy fats', 'Not smoking'], relatedMarkers: ['totalCholesterol', 'ldl'], aliases: ['hdl-c'], higherIsBetter: true },
  triglycerides: { name: 'Triglycerides', unit: 'mg/dL', category: 'Cardiovascular', normalRange: [0, 150], optimalRange: [0, 100], criticalLow: 0, criticalHigh: 500, description: 'Blood fats from unused calories.', influences: ['Carbohydrates', 'Alcohol', 'Sugar'], relatedMarkers: ['glucose', 'hdl'], aliases: ['tg'], higherIsBetter: false },
  homocysteine: { name: 'Homocysteine', unit: 'µmol/L', category: 'Cardiovascular', normalRange: [5, 15], optimalRange: [6, 10], criticalLow: 3, criticalHigh: 20, description: 'Amino acid linked to heart disease.', influences: ['B12', 'Folate', 'B6'], relatedMarkers: ['vitaminB12', 'folate'], aliases: ['hcy'], higherIsBetter: false },

  // KIDNEY
  creatinine: { name: 'Creatinine', unit: 'mg/dL', category: 'Kidney', normalRange: [0.7, 1.3], optimalRange: [0.8, 1.1], criticalLow: 0.5, criticalHigh: 1.5, description: 'Waste product filtered by kidneys.', influences: ['Muscle mass', 'Protein intake', 'Hydration'], relatedMarkers: ['bun', 'egfr'], aliases: ['creat'], higherIsBetter: false },
  egfr: { name: 'eGFR', unit: 'mL/min', category: 'Kidney', normalRange: [90, 120], optimalRange: [100, 120], criticalLow: 60, criticalHigh: 150, description: 'Estimated kidney filtration rate.', influences: ['Age', 'Kidney health', 'Hydration'], relatedMarkers: ['creatinine', 'bun'], aliases: ['gfr'], higherIsBetter: true },
  bun: { name: 'BUN', unit: 'mg/dL', category: 'Kidney', normalRange: [7, 20], optimalRange: [10, 16], criticalLow: 5, criticalHigh: 30, description: 'Blood urea nitrogen.', influences: ['Protein intake', 'Hydration', 'Kidney function'], relatedMarkers: ['creatinine', 'egfr'], aliases: ['blood urea nitrogen'], higherIsBetter: false },
  uricAcid: { name: 'Uric Acid', unit: 'mg/dL', category: 'Kidney', normalRange: [3.5, 7.2], optimalRange: [4.0, 6.0], criticalLow: 2.0, criticalHigh: 9.0, description: 'Byproduct of purine metabolism.', influences: ['Diet', 'Alcohol', 'Fructose'], relatedMarkers: ['creatinine'], aliases: ['urate'], higherIsBetter: false },

  // LIVER
  alt: { name: 'ALT', unit: 'U/L', category: 'Liver', normalRange: [7, 56], optimalRange: [10, 35], criticalLow: 5, criticalHigh: 100, description: 'Liver enzyme for cell damage.', influences: ['Alcohol', 'Medications', 'Fatty liver'], relatedMarkers: ['ast', 'ggt'], aliases: ['sgpt'], higherIsBetter: false },
  ast: { name: 'AST', unit: 'U/L', category: 'Liver', normalRange: [10, 40], optimalRange: [15, 30], criticalLow: 5, criticalHigh: 80, description: 'Found in liver and heart.', influences: ['Liver damage', 'Heart damage', 'Exercise'], relatedMarkers: ['alt', 'ggt'], aliases: ['sgot'], higherIsBetter: false },
  ggt: { name: 'GGT', unit: 'U/L', category: 'Liver', normalRange: [9, 48], optimalRange: [10, 30], criticalLow: 5, criticalHigh: 100, description: 'Sensitive to alcohol use.', influences: ['Alcohol', 'Medications', 'Bile duct'], relatedMarkers: ['alt', 'ast'], aliases: ['gamma-gt'], higherIsBetter: false },
  bilirubin: { name: 'Total Bilirubin', unit: 'mg/dL', category: 'Liver', normalRange: [0.1, 1.2], optimalRange: [0.2, 0.8], criticalLow: 0, criticalHigh: 2.0, description: 'Breakdown product of red blood cells.', influences: ['Liver function', 'RBC destruction'], relatedMarkers: ['alt', 'ast'], aliases: ['tbili'], higherIsBetter: false },
  albumin: { name: 'Albumin', unit: 'g/dL', category: 'Liver', normalRange: [3.5, 5.5], optimalRange: [4.0, 5.0], criticalLow: 3.0, criticalHigh: 6.0, description: 'Protein made by liver.', influences: ['Liver function', 'Nutrition'], relatedMarkers: ['alt'], aliases: ['alb'], higherIsBetter: true },
  alp: { name: 'ALP', unit: 'U/L', category: 'Liver', normalRange: [44, 147], optimalRange: [50, 120], criticalLow: 30, criticalHigh: 200, description: 'Alkaline phosphatase.', influences: ['Liver disease', 'Bone disease'], relatedMarkers: ['alt', 'ggt'], aliases: ['alkaline phosphatase'], higherIsBetter: false },

  // THYROID
  tsh: { name: 'TSH', unit: 'mIU/L', category: 'Thyroid', normalRange: [0.4, 4.0], optimalRange: [1.0, 2.5], criticalLow: 0.1, criticalHigh: 10.0, description: 'Primary thyroid marker.', influences: ['Iodine', 'Stress', 'Sleep'], relatedMarkers: ['freeT4', 'freeT3'], aliases: ['thyroid stimulating hormone'], higherIsBetter: null },
  freeT4: { name: 'Free T4', unit: 'ng/dL', category: 'Thyroid', normalRange: [0.8, 1.8], optimalRange: [1.0, 1.5], criticalLow: 0.5, criticalHigh: 2.5, description: 'Active thyroid hormone.', influences: ['Thyroid function', 'Iodine'], relatedMarkers: ['tsh', 'freeT3'], aliases: ['ft4'], higherIsBetter: null },
  freeT3: { name: 'Free T3', unit: 'pg/mL', category: 'Thyroid', normalRange: [2.0, 4.4], optimalRange: [2.5, 4.0], criticalLow: 1.5, criticalHigh: 5.0, description: 'Most active thyroid hormone.', influences: ['T4 conversion', 'Selenium'], relatedMarkers: ['tsh', 'freeT4'], aliases: ['ft3'], higherIsBetter: null },

  // INFLAMMATION
  crp: { name: 'hs-CRP', unit: 'mg/L', category: 'Inflammation', normalRange: [0, 3.0], optimalRange: [0, 1.0], criticalLow: 0, criticalHigh: 10.0, description: 'Inflammation marker for CV risk.', influences: ['Infection', 'Obesity', 'Sleep'], relatedMarkers: ['esr'], aliases: ['c-reactive protein', 'hscrp'], higherIsBetter: false },
  esr: { name: 'ESR', unit: 'mm/hr', category: 'Inflammation', normalRange: [0, 20], optimalRange: [0, 10], criticalLow: 0, criticalHigh: 40, description: 'Non-specific inflammation marker.', influences: ['Inflammation', 'Infection'], relatedMarkers: ['crp'], aliases: ['sed rate'], higherIsBetter: false },

  // NUTRIENTS
  vitaminD: { name: 'Vitamin D', unit: 'ng/mL', category: 'Nutrients', normalRange: [30, 100], optimalRange: [40, 60], criticalLow: 20, criticalHigh: 100, description: 'Critical for bones, immunity, mood.', influences: ['Sun exposure', 'Supplementation'], relatedMarkers: ['calcium'], aliases: ['25-oh vitamin d'], higherIsBetter: true },
  vitaminB12: { name: 'Vitamin B12', unit: 'pg/mL', category: 'Nutrients', normalRange: [200, 900], optimalRange: [400, 700], criticalLow: 150, criticalHigh: 1000, description: 'Essential for nerves and blood cells.', influences: ['Diet', 'Absorption', 'Supplementation'], relatedMarkers: ['folate', 'homocysteine'], aliases: ['cobalamin'], higherIsBetter: true },
  folate: { name: 'Folate', unit: 'ng/mL', category: 'Nutrients', normalRange: [3.0, 17.0], optimalRange: [5.0, 15.0], criticalLow: 2.0, criticalHigh: 20.0, description: 'B vitamin for cell division.', influences: ['Diet', 'Pregnancy', 'Medication'], relatedMarkers: ['vitaminB12', 'homocysteine'], aliases: ['folic acid'], higherIsBetter: true },
  iron: { name: 'Serum Iron', unit: 'µg/dL', category: 'Nutrients', normalRange: [60, 170], optimalRange: [70, 140], criticalLow: 40, criticalHigh: 200, description: 'Essential mineral for oxygen transport.', influences: ['Diet', 'Absorption', 'Blood loss'], relatedMarkers: ['ferritin', 'hemoglobin'], aliases: ['fe'], higherIsBetter: null },
  ferritin: { name: 'Ferritin', unit: 'ng/mL', category: 'Nutrients', normalRange: [30, 300], optimalRange: [50, 150], criticalLow: 15, criticalHigh: 400, description: 'Iron storage protein.', influences: ['Iron intake', 'Inflammation', 'Blood loss'], relatedMarkers: ['iron', 'hemoglobin'], aliases: ['serum ferritin'], higherIsBetter: null },
  calcium: { name: 'Calcium', unit: 'mg/dL', category: 'Nutrients', normalRange: [8.5, 10.5], optimalRange: [9.0, 10.0], criticalLow: 7.5, criticalHigh: 11.5, description: 'Essential for bones and nerves.', influences: ['Vitamin D', 'PTH', 'Diet'], relatedMarkers: ['vitaminD'], aliases: ['ca'], higherIsBetter: null },
  magnesium: { name: 'Magnesium', unit: 'mg/dL', category: 'Nutrients', normalRange: [1.7, 2.2], optimalRange: [1.9, 2.1], criticalLow: 1.4, criticalHigh: 2.5, description: 'Essential for muscles and nerves.', influences: ['Diet', 'Medication', 'Kidney function'], relatedMarkers: ['calcium'], aliases: ['mg'], higherIsBetter: null },
  zinc: { name: 'Zinc', unit: 'µg/dL', category: 'Nutrients', normalRange: [60, 120], optimalRange: [70, 100], criticalLow: 50, criticalHigh: 150, description: 'Essential for immunity and healing.', influences: ['Diet', 'Absorption'], relatedMarkers: [], aliases: ['zn'], higherIsBetter: null },

  // BLOOD COUNT
  hemoglobin: { name: 'Hemoglobin', unit: 'g/dL', category: 'Blood Count', normalRange: [12.0, 17.5], optimalRange: [13.5, 16.0], criticalLow: 10.0, criticalHigh: 18.5, description: 'Oxygen-carrying protein in RBCs.', influences: ['Iron', 'B12', 'Folate', 'Kidney function'], relatedMarkers: ['rbc', 'hematocrit', 'ferritin'], aliases: ['hgb', 'hb'], higherIsBetter: null },
  hematocrit: { name: 'Hematocrit', unit: '%', category: 'Blood Count', normalRange: [36, 50], optimalRange: [40, 46], criticalLow: 30, criticalHigh: 55, description: 'Percentage of blood that is RBCs.', influences: ['Hydration', 'Altitude', 'Blood loss'], relatedMarkers: ['hemoglobin', 'rbc'], aliases: ['hct'], higherIsBetter: null },
  rbc: { name: 'Red Blood Cells', unit: 'M/µL', category: 'Blood Count', normalRange: [4.0, 5.5], optimalRange: [4.5, 5.2], criticalLow: 3.5, criticalHigh: 6.0, description: 'Oxygen-carrying cells.', influences: ['EPO', 'Iron', 'B12'], relatedMarkers: ['hemoglobin', 'hematocrit'], aliases: ['erythrocytes'], higherIsBetter: null },
  wbc: { name: 'White Blood Cells', unit: 'K/µL', category: 'Blood Count', normalRange: [4.0, 11.0], optimalRange: [5.0, 9.0], criticalLow: 3.0, criticalHigh: 15.0, description: 'Immune cells.', influences: ['Infection', 'Inflammation', 'Medications'], relatedMarkers: [], aliases: ['leukocytes'], higherIsBetter: null },
  platelets: { name: 'Platelets', unit: 'K/µL', category: 'Blood Count', normalRange: [150, 400], optimalRange: [175, 350], criticalLow: 100, criticalHigh: 500, description: 'Blood clotting cells.', influences: ['Bone marrow', 'Medications', 'Infection'], relatedMarkers: [], aliases: ['thrombocytes'], higherIsBetter: null },
  mcv: { name: 'MCV', unit: 'fL', category: 'Blood Count', normalRange: [80, 100], optimalRange: [82, 96], criticalLow: 70, criticalHigh: 110, description: 'Average RBC size.', influences: ['B12', 'Folate', 'Iron'], relatedMarkers: ['hemoglobin', 'rbc'], aliases: ['mean corpuscular volume'], higherIsBetter: null },

  // HORMONES
  testosterone: { name: 'Total Testosterone', unit: 'ng/dL', category: 'Hormones', normalRange: [300, 1000], optimalRange: [500, 800], criticalLow: 200, criticalHigh: 1200, description: 'Primary male sex hormone.', influences: ['Age', 'Sleep', 'Exercise', 'Body fat'], relatedMarkers: ['shbg'], aliases: ['t'], higherIsBetter: null },
  estradiol: { name: 'Estradiol', unit: 'pg/mL', category: 'Hormones', normalRange: [10, 40], optimalRange: [15, 30], criticalLow: 5, criticalHigh: 60, description: 'Primary estrogen.', influences: ['Age', 'Body fat', 'Medications'], relatedMarkers: ['testosterone'], aliases: ['e2'], higherIsBetter: null },
  cortisol: { name: 'Cortisol (AM)', unit: 'µg/dL', category: 'Hormones', normalRange: [6, 23], optimalRange: [10, 18], criticalLow: 3, criticalHigh: 30, description: 'Stress hormone.', influences: ['Stress', 'Sleep', 'Time of day'], relatedMarkers: [], aliases: ['hydrocortisone'], higherIsBetter: null },
  dheas: { name: 'DHEA-S', unit: 'µg/dL', category: 'Hormones', normalRange: [100, 400], optimalRange: [150, 350], criticalLow: 50, criticalHigh: 500, description: 'Adrenal hormone precursor.', influences: ['Age', 'Adrenal function'], relatedMarkers: ['cortisol'], aliases: ['dehydroepiandrosterone sulfate'], higherIsBetter: null },
};

const CATEGORIES = ['Metabolic', 'Cardiovascular', 'Kidney', 'Liver', 'Thyroid', 'Inflammation', 'Nutrients', 'Blood Count', 'Hormones'];

// ============================================
// UTILITY FUNCTIONS
// ============================================

const getStatus = (value, markerId) => {
  const def = BIOMARKER_DEFINITIONS[markerId];
  if (!def) return 'normal';
  if (value <= def.criticalLow || value >= def.criticalHigh) return 'critical';
  if (value >= def.optimalRange[0] && value <= def.optimalRange[1]) return 'optimal';
  if (value >= def.normalRange[0] && value <= def.normalRange[1]) return 'normal';
  return 'attention';
};

const getStatusColor = (status) => {
  const colors = { optimal: COLORS.optimal, normal: COLORS.normal, attention: COLORS.attention, critical: COLORS.critical };
  return colors[status] || COLORS.normal;
};

const getStatusBg = (status) => {
  const colors = { optimal: COLORS.optimalLight, normal: COLORS.normalLight, attention: COLORS.attentionLight, critical: COLORS.criticalLight };
  return colors[status] || COLORS.normalLight;
};

const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
const formatDateShort = (dateStr) => new Date(dateStr).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });

const calculateTrend = (records) => {
  if (records.length < 2) return { direction: 'stable', change: 0 };
  const sorted = [...records].sort((a, b) => new Date(a.date) - new Date(b.date));
  const recent = sorted.slice(-3);
  const first = recent[0].value;
  const last = recent[recent.length - 1].value;
  const change = first !== 0 ? ((last - first) / first) * 100 : 0;
  if (Math.abs(change) < 3) return { direction: 'stable', change: 0 };
  return { direction: change > 0 ? 'up' : 'down', change: Math.abs(change).toFixed(1) };
};

// Pattern Detection
const detectPatterns = (records) => {
  const patterns = [];
  const latest = {};
  
  Object.keys(BIOMARKER_DEFINITIONS).forEach(id => {
    const markerRecords = records.filter(r => r.markerId === id);
    if (markerRecords.length > 0) {
      latest[id] = markerRecords.sort((a, b) => new Date(b.date) - new Date(a.date))[0].value;
    }
  });

  // Metabolic Syndrome Pattern
  const metabolicFlags = [
    latest.glucose > 100,
    latest.triglycerides > 150,
    latest.hdl && latest.hdl < 40,
    latest.hba1c > 5.6
  ].filter(Boolean).length;
  
  if (metabolicFlags >= 3) {
    patterns.push({
      type: 'metabolic_syndrome',
      severity: 'attention',
      title: 'Metabolic Pattern Detected',
      description: `${metabolicFlags} markers suggest metabolic syndrome risk. Consider discussing with your doctor.`,
      markers: ['glucose', 'triglycerides', 'hdl', 'hba1c'].filter(m => latest[m])
    });
  }

  // Anemia Pattern
  if (latest.hemoglobin && latest.hemoglobin < 12 && latest.ferritin && latest.ferritin < 30) {
    patterns.push({
      type: 'iron_deficiency',
      severity: 'attention',
      title: 'Iron Deficiency Pattern',
      description: 'Low hemoglobin with low ferritin suggests possible iron deficiency.',
      markers: ['hemoglobin', 'ferritin']
    });
  }

  // Thyroid Pattern
  if (latest.tsh && (latest.tsh > 4 || latest.tsh < 0.4)) {
    patterns.push({
      type: 'thyroid',
      severity: latest.tsh > 10 || latest.tsh < 0.1 ? 'critical' : 'attention',
      title: 'Thyroid Pattern Detected',
      description: `TSH is ${latest.tsh > 4 ? 'elevated' : 'low'}. Further thyroid evaluation may be needed.`,
      markers: ['tsh', 'freeT4', 'freeT3'].filter(m => latest[m])
    });
  }

  // Kidney Pattern
  if (latest.creatinine > 1.3 && latest.egfr && latest.egfr < 60) {
    patterns.push({
      type: 'kidney',
      severity: 'attention',
      title: 'Reduced Kidney Function',
      description: 'Elevated creatinine with reduced eGFR suggests kidney function assessment needed.',
      markers: ['creatinine', 'egfr', 'bun'].filter(m => latest[m])
    });
  }

  return patterns;
};

// ============================================
// UI COMPONENTS
// ============================================

const Card = ({ children, style = {} }) => (
  <div style={{ backgroundColor: COLORS.bgCard, borderRadius: '12px', padding: '16px', boxShadow: SHADOWS.md, border: `1px solid ${COLORS.borderLight}`, ...style }}>
    {children}
  </div>
);

const Button = ({ children, variant = 'primary', size = 'medium', icon, onClick, disabled, style = {} }) => {
  const variants = {
    primary: { bg: COLORS.primary, color: '#FFFFFF', border: 'none' },
    secondary: { bg: COLORS.bgSecondary, color: COLORS.text, border: `1px solid ${COLORS.border}` },
    success: { bg: COLORS.optimal, color: '#FFFFFF', border: 'none' },
    danger: { bg: COLORS.critical, color: '#FFFFFF', border: 'none' },
    ghost: { bg: 'transparent', color: COLORS.textSecondary, border: 'none' }
  };
  const sizes = { small: { padding: '6px 12px', fontSize: '12px' }, medium: { padding: '10px 16px', fontSize: '14px' } };
  const v = variants[variant];
  const s = sizes[size];
  
  return (
    <button onClick={onClick} disabled={disabled} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '8px', fontWeight: '500', cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s', opacity: disabled ? 0.5 : 1, backgroundColor: v.bg, color: v.color, border: v.border, ...s, ...style }}>
      {icon && <span>{icon}</span>}{children}
    </button>
  );
};

const Input = ({ label, value, onChange, type = 'text', placeholder, style = {} }) => (
  <div style={{ marginBottom: '12px', ...style }}>
    {label && <label style={{ fontSize: '12px', fontWeight: '500', color: COLORS.textSecondary, display: 'block', marginBottom: '4px' }}>{label}</label>}
    <input type={type} value={value} onChange={onChange} placeholder={placeholder} style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: `1px solid ${COLORS.border}`, borderRadius: '8px', backgroundColor: COLORS.bgCard, outline: 'none', boxSizing: 'border-box' }} />
  </div>
);

const Select = ({ label, value, onChange, children, style = {} }) => (
  <div style={{ marginBottom: '12px', ...style }}>
    {label && <label style={{ fontSize: '12px', fontWeight: '500', color: COLORS.textSecondary, display: 'block', marginBottom: '4px' }}>{label}</label>}
    <select value={value} onChange={onChange} style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: `1px solid ${COLORS.border}`, borderRadius: '8px', backgroundColor: COLORS.bgCard, outline: 'none' }}>
      {children}
    </select>
  </div>
);

const TabNav = ({ tabs, active, onChange }) => (
  <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', backgroundColor: COLORS.bgSecondary, padding: '4px', borderRadius: '10px', overflowX: 'auto' }}>
    {tabs.map(tab => (
      <button key={tab.id} onClick={() => onChange(tab.id)} style={{ flex: 1, minWidth: '80px', padding: '10px 16px', borderRadius: '8px', border: 'none', backgroundColor: active === tab.id ? COLORS.bgCard : 'transparent', color: active === tab.id ? COLORS.primary : COLORS.textSecondary, fontWeight: '500', fontSize: '13px', cursor: 'pointer', boxShadow: active === tab.id ? SHADOWS.sm : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
        <span>{tab.icon}</span>{tab.label}
      </button>
    ))}
  </div>
);

// ============================================
// AUTHENTICATION COMPONENTS
// ============================================

const AuthScreen = ({ onLogin }) => {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      if (mode === 'login') {
        await api.login(email, password);
      } else {
        await api.register(email, password, firstName, lastName);
      }
      const user = await api.getMe();
      onLogin(user);
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: COLORS.bgPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <Card style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', margin: '0 auto 16px' }}>❤️</div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: COLORS.text, margin: '0 0 4px' }}>HealthCanvas</h1>
          <p style={{ fontSize: '14px', color: COLORS.textSecondary, margin: 0 }}>Your personal health dashboard</p>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <Button variant={mode === 'login' ? 'primary' : 'secondary'} onClick={() => setMode('login')} style={{ flex: 1 }}>Login</Button>
          <Button variant={mode === 'register' ? 'primary' : 'secondary'} onClick={() => setMode('register')} style={{ flex: 1 }}>Register</Button>
        </div>

        {error && (
          <div style={{ padding: '12px', backgroundColor: COLORS.criticalLight, borderRadius: '8px', marginBottom: '16px', color: COLORS.critical, fontSize: '13px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Input label="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="John" />
              <Input label="Last Name" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" />
            </div>
          )}
          <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          <Button variant="primary" disabled={loading} style={{ width: '100%', marginTop: '8px' }}>
            {loading ? 'Please wait...' : (mode === 'login' ? 'Sign In' : 'Create Account')}
          </Button>
        </form>

        <p style={{ fontSize: '12px', color: COLORS.textMuted, textAlign: 'center', marginTop: '16px' }}>
          Demo mode: Use any email/password to create an account
        </p>
      </Card>
    </div>
  );
};

// ============================================
// HEALTH COMPONENTS
// ============================================

const BiomarkerCard = ({ markerId, data, onClick, isSelected, isWatched }) => {
  const def = BIOMARKER_DEFINITIONS[markerId];
  if (!def || data.length === 0) return null;
  
  const latest = data[data.length - 1];
  const status = getStatus(latest.value, markerId);
  const trend = calculateTrend(data);
  
  const sparklineData = data.slice(-6);
  const minY = Math.min(...sparklineData.map(d => d.value));
  const maxY = Math.max(...sparklineData.map(d => d.value));
  const range = maxY - minY || 1;
  
  return (
    <Card style={{ cursor: 'pointer', border: isSelected ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.borderLight}`, transition: 'all 0.2s' }} onClick={() => onClick(markerId)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: COLORS.text }}>{def.name}</span>
            {isWatched && <span style={{ fontSize: '12px' }}>⭐</span>}
          </div>
          <span style={{ fontSize: '11px', color: COLORS.textMuted }}>{def.category}</span>
        </div>
        <span style={{ padding: '4px 8px', borderRadius: '6px', backgroundColor: getStatusBg(status), color: getStatusColor(status), fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' }}>{status}</span>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
        <div>
          <span style={{ fontSize: '26px', fontWeight: '700', color: COLORS.text }}>{latest.value}</span>
          <span style={{ fontSize: '13px', color: COLORS.textSecondary, marginLeft: '4px' }}>{def.unit}</span>
          {trend.direction !== 'stable' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
              <span style={{ color: trend.direction === 'up' ? (def.higherIsBetter ? COLORS.optimal : COLORS.critical) : (def.higherIsBetter === false ? COLORS.optimal : COLORS.critical), fontSize: '12px' }}>
                {trend.direction === 'up' ? '↑' : '↓'} {trend.change}%
              </span>
            </div>
          )}
        </div>
        
        {sparklineData.length > 1 && (
          <svg width="80" height="32" style={{ marginLeft: 'auto' }}>
            <polyline
              fill="none"
              stroke={getStatusColor(status)}
              strokeWidth="2"
              points={sparklineData.map((d, i) => `${(i / (sparklineData.length - 1)) * 76 + 2},${30 - ((d.value - minY) / range) * 26}`).join(' ')}
            />
          </svg>
        )}
      </div>
      <div style={{ fontSize: '11px', color: COLORS.textMuted, marginTop: '6px' }}>{formatDateShort(latest.date)}</div>
    </Card>
  );
};

const HealthScoreDashboard = ({ records }) => {
  const categoryScores = CATEGORIES.map(category => {
    const markers = Object.entries(BIOMARKER_DEFINITIONS).filter(([_, def]) => def.category === category);
    let totalScore = 0;
    let count = 0;
    
    markers.forEach(([id]) => {
      const markerRecords = records.filter(r => r.markerId === id);
      if (markerRecords.length > 0) {
        const latest = markerRecords.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        const status = getStatus(latest.value, id);
        const scores = { optimal: 100, normal: 80, attention: 50, critical: 20 };
        totalScore += scores[status] || 50;
        count++;
      }
    });
    
    return { category, score: count > 0 ? Math.round(totalScore / count) : null, count };
  }).filter(c => c.score !== null);

  const overallScore = categoryScores.length > 0 ? Math.round(categoryScores.reduce((sum, c) => sum + c.score, 0) / categoryScores.length) : null;

  return (
    <Card style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center', minWidth: '100px' }}>
          <div style={{ fontSize: '40px', fontWeight: '700', color: overallScore >= 80 ? COLORS.optimal : overallScore >= 60 ? COLORS.attention : COLORS.critical }}>{overallScore || '--'}</div>
          <div style={{ fontSize: '12px', color: COLORS.textSecondary }}>Overall Score</div>
        </div>
        <div style={{ flex: 1, display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {categoryScores.map(({ category, score, count }) => (
            <div key={category} style={{ backgroundColor: COLORS.bgSecondary, padding: '10px 14px', borderRadius: '8px', minWidth: '100px' }}>
              <div style={{ fontSize: '18px', fontWeight: '600', color: score >= 80 ? COLORS.optimal : score >= 60 ? COLORS.attention : COLORS.critical }}>{score}</div>
              <div style={{ fontSize: '11px', color: COLORS.textSecondary }}>{category}</div>
              <div style={{ fontSize: '10px', color: COLORS.textMuted }}>{count} markers</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};

const DetailedChart = ({ markerId, data }) => {
  const def = BIOMARKER_DEFINITIONS[markerId];
  if (!def) return null;
  
  const chartData = data.map(d => ({
    date: formatDateShort(d.date),
    value: d.value,
    optimalLow: def.optimalRange[0],
    optimalHigh: def.optimalRange[1],
  }));

  return (
    <Card>
      <h3 style={{ fontSize: '15px', fontWeight: '600', color: COLORS.text, margin: '0 0 12px' }}>{def.name} Trend</h3>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: COLORS.textMuted }} />
          <YAxis tick={{ fontSize: 10, fill: COLORS.textMuted }} domain={['auto', 'auto']} />
          <Tooltip contentStyle={{ backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: '8px', fontSize: '12px' }} />
          <ReferenceLine y={def.optimalRange[0]} stroke={COLORS.optimal} strokeDasharray="3 3" />
          <ReferenceLine y={def.optimalRange[1]} stroke={COLORS.optimal} strokeDasharray="3 3" />
          <Area type="monotone" dataKey="value" stroke={COLORS.primary} fill={COLORS.primaryLight} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '11px', color: COLORS.textSecondary }}>
        <span>Optimal: {def.optimalRange[0]} - {def.optimalRange[1]} {def.unit}</span>
        <span>Normal: {def.normalRange[0]} - {def.normalRange[1]} {def.unit}</span>
      </div>
    </Card>
  );
};

const InsightsPanel = ({ markerId, data }) => {
  const def = BIOMARKER_DEFINITIONS[markerId];
  if (!def || data.length === 0) return null;
  
  const latest = data[data.length - 1];
  const status = getStatus(latest.value, markerId);
  const trend = calculateTrend(data);

  return (
    <Card>
      <h3 style={{ fontSize: '15px', fontWeight: '600', color: COLORS.text, margin: '0 0 12px' }}>Insights</h3>
      <p style={{ fontSize: '13px', color: COLORS.textSecondary, margin: '0 0 12px', lineHeight: '1.5' }}>{def.description}</p>
      
      <div style={{ backgroundColor: getStatusBg(status), padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
        <div style={{ fontWeight: '600', fontSize: '13px', color: getStatusColor(status), marginBottom: '4px' }}>
          {status === 'optimal' ? '✓ Optimal Range' : status === 'normal' ? '● Normal Range' : status === 'attention' ? '⚠ Needs Attention' : '⚠ Critical'}
        </div>
        <div style={{ fontSize: '12px', color: COLORS.text }}>
          Your value of {latest.value} {def.unit} is {status === 'optimal' ? 'in the optimal range' : status === 'normal' ? 'within normal limits' : `outside the ${status === 'critical' ? 'critical' : 'normal'} range`}.
          {trend.direction !== 'stable' && ` Trending ${trend.direction} ${trend.change}% recently.`}
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: COLORS.text, marginBottom: '6px' }}>Key Influences</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {def.influences.map((inf, i) => (
            <span key={i} style={{ padding: '4px 10px', backgroundColor: COLORS.bgSecondary, borderRadius: '12px', fontSize: '11px', color: COLORS.textSecondary }}>{inf}</span>
          ))}
        </div>
      </div>

      {def.relatedMarkers.length > 0 && (
        <div>
          <div style={{ fontSize: '12px', fontWeight: '600', color: COLORS.text, marginBottom: '6px' }}>Related Markers</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {def.relatedMarkers.map(rm => BIOMARKER_DEFINITIONS[rm] && (
              <span key={rm} style={{ padding: '4px 10px', backgroundColor: COLORS.primaryLight, borderRadius: '12px', fontSize: '11px', color: COLORS.primary }}>{BIOMARKER_DEFINITIONS[rm].name}</span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};

const PatternAlerts = ({ patterns }) => {
  if (patterns.length === 0) return null;
  
  return (
    <Card style={{ marginBottom: '20px', backgroundColor: COLORS.attentionLight, border: `1px solid ${COLORS.attention}` }}>
      <h3 style={{ fontSize: '14px', fontWeight: '600', color: COLORS.text, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>🔍</span> Pattern Alerts
      </h3>
      {patterns.map((p, i) => (
        <div key={i} style={{ padding: '10px', backgroundColor: COLORS.bgCard, borderRadius: '8px', marginBottom: i < patterns.length - 1 ? '8px' : 0 }}>
          <div style={{ fontWeight: '600', fontSize: '13px', color: p.severity === 'critical' ? COLORS.critical : COLORS.attention }}>{p.title}</div>
          <div style={{ fontSize: '12px', color: COLORS.textSecondary, marginTop: '4px' }}>{p.description}</div>
        </div>
      ))}
    </Card>
  );
};

const HealthRadar = ({ records }) => {
  const radarData = CATEGORIES.map(category => {
    const markers = Object.entries(BIOMARKER_DEFINITIONS).filter(([_, def]) => def.category === category);
    let totalScore = 0;
    let count = 0;
    
    markers.forEach(([id]) => {
      const markerRecords = records.filter(r => r.markerId === id);
      if (markerRecords.length > 0) {
        const latest = markerRecords.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        const status = getStatus(latest.value, id);
        const scores = { optimal: 100, normal: 80, attention: 50, critical: 20 };
        totalScore += scores[status] || 50;
        count++;
      }
    });
    
    return { category: category.substring(0, 8), score: count > 0 ? Math.round(totalScore / count) : 0, fullMark: 100 };
  }).filter(d => d.score > 0);

  if (radarData.length < 3) return null;

  return (
    <Card>
      <h3 style={{ fontSize: '15px', fontWeight: '600', color: COLORS.text, margin: '0 0 12px' }}>Health Overview</h3>
      <ResponsiveContainer width="100%" height={250}>
        <RadarChart data={radarData}>
          <PolarGrid stroke={COLORS.border} />
          <PolarAngleAxis dataKey="category" tick={{ fontSize: 10, fill: COLORS.textSecondary }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
          <Radar name="Score" dataKey="score" stroke={COLORS.primary} fill={COLORS.primaryLight} fillOpacity={0.6} />
        </RadarChart>
      </ResponsiveContainer>
    </Card>
  );
};

// ============================================
// TRACKER COMPONENTS
// ============================================

const MedicationTracker = ({ medications, onAdd, onToggle, onDelete }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [newMed, setNewMed] = useState({ name: '', dosage: '', frequency: 'daily' });
  
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: COLORS.text, margin: 0 }}>💊 Medications</h3>
        <Button variant="secondary" size="small" icon="+" onClick={() => setShowAdd(!showAdd)}>Add</Button>
      </div>
      
      {showAdd && (
        <div style={{ padding: '12px', backgroundColor: COLORS.bgSecondary, borderRadius: '8px', marginBottom: '12px' }}>
          <Input value={newMed.name} onChange={e => setNewMed({...newMed, name: e.target.value})} placeholder="Medication name" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <Input value={newMed.dosage} onChange={e => setNewMed({...newMed, dosage: e.target.value})} placeholder="Dosage" />
            <Select value={newMed.frequency} onChange={e => setNewMed({...newMed, frequency: e.target.value})}>
              <option value="daily">Daily</option>
              <option value="twice_daily">Twice Daily</option>
              <option value="weekly">Weekly</option>
              <option value="as_needed">As Needed</option>
            </Select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" size="small" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button variant="success" size="small" onClick={() => { if (newMed.name) { onAdd({ ...newMed, id: Date.now().toString(), active: true, startDate: new Date().toISOString().split('T')[0] }); setNewMed({ name: '', dosage: '', frequency: 'daily' }); setShowAdd(false); } }}>Add</Button>
          </div>
        </div>
      )}
      
      {medications.map(med => (
        <div key={med.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', backgroundColor: med.active ? COLORS.bgSecondary : COLORS.borderLight, borderRadius: '8px', marginBottom: '8px', opacity: med.active ? 1 : 0.6 }}>
          <input type="checkbox" checked={med.active} onChange={() => onToggle(med.id)} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '500', fontSize: '13px', color: COLORS.text }}>{med.name}</div>
            <div style={{ fontSize: '11px', color: COLORS.textSecondary }}>{med.dosage} • {med.frequency?.replace('_', ' ')}</div>
          </div>
          <button onClick={() => onDelete(med.id)} style={{ background: 'none', border: 'none', color: COLORS.critical, cursor: 'pointer', fontSize: '14px' }}>✕</button>
        </div>
      ))}
      
      {medications.length === 0 && <p style={{ fontSize: '12px', color: COLORS.textMuted, textAlign: 'center', margin: '10px 0' }}>No medications tracked</p>}
    </Card>
  );
};

const ConditionsTracker = ({ conditions, onAdd, onDelete }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [newC, setNewC] = useState({ name: '', status: 'active' });
  
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: COLORS.text, margin: 0 }}>📋 Conditions</h3>
        <Button variant="secondary" size="small" icon="+" onClick={() => setShowAdd(!showAdd)}>Add</Button>
      </div>
      {showAdd && (
        <div style={{ padding: '12px', backgroundColor: COLORS.bgSecondary, borderRadius: '8px', marginBottom: '10px' }}>
          <Input value={newC.name} onChange={e => setNewC({...newC, name: e.target.value})} placeholder="Condition name" />
          <Select value={newC.status} onChange={e => setNewC({...newC, status: e.target.value})}>
            <option value="active">Active</option>
            <option value="resolved">Resolved</option>
            <option value="recurrence">Recurrence</option>
          </Select>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" size="small" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button variant="success" size="small" onClick={() => { if (newC.name) { onAdd({ ...newC, id: Date.now().toString(), diagnosedDate: new Date().toISOString().split('T')[0] }); setNewC({ name: '', status: 'active' }); setShowAdd(false); } }}>Add</Button>
          </div>
        </div>
      )}
      {conditions.map(c => (
        <div key={c.id} style={{ padding: '10px 12px', backgroundColor: COLORS.bgSecondary, borderRadius: '6px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: '500', fontSize: '13px' }}>{c.name}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', backgroundColor: c.status === 'active' ? COLORS.attentionLight : COLORS.optimalLight, color: c.status === 'active' ? COLORS.attention : COLORS.optimal }}>{c.status}</span>
            {onDelete && <button onClick={() => onDelete(c.id)} style={{ background: 'none', border: 'none', color: COLORS.critical, cursor: 'pointer', fontSize: '12px' }}>✕</button>}
          </div>
        </div>
      ))}
      {conditions.length === 0 && <p style={{ fontSize: '12px', color: COLORS.textMuted, textAlign: 'center' }}>No conditions recorded</p>}
    </Card>
  );
};

const AllergiesTracker = ({ allergies, onAdd, onDelete }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [newA, setNewA] = useState({ name: '', severity: 'moderate' });
  
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: COLORS.text, margin: 0 }}>⚠️ Allergies</h3>
        <Button variant="secondary" size="small" icon="+" onClick={() => setShowAdd(!showAdd)}>Add</Button>
      </div>
      {showAdd && (
        <div style={{ padding: '12px', backgroundColor: COLORS.bgSecondary, borderRadius: '8px', marginBottom: '10px' }}>
          <Input value={newA.name} onChange={e => setNewA({...newA, name: e.target.value})} placeholder="Allergen" />
          <Select value={newA.severity} onChange={e => setNewA({...newA, severity: e.target.value})}>
            <option value="mild">Mild</option>
            <option value="moderate">Moderate</option>
            <option value="severe">Severe</option>
          </Select>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" size="small" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button variant="success" size="small" onClick={() => { if (newA.name) { onAdd({ ...newA, id: Date.now().toString() }); setNewA({ name: '', severity: 'moderate' }); setShowAdd(false); } }}>Add</Button>
          </div>
        </div>
      )}
      {allergies.map(a => (
        <div key={a.id} style={{ padding: '10px 12px', backgroundColor: a.severity === 'severe' ? COLORS.criticalLight : COLORS.attentionLight, borderRadius: '6px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontWeight: '600', fontSize: '13px' }}>{a.name}</span>
            <span style={{ fontSize: '11px', marginLeft: '8px', color: COLORS.textSecondary }}>{a.severity}</span>
          </div>
          {onDelete && <button onClick={() => onDelete(a.id)} style={{ background: 'none', border: 'none', color: COLORS.critical, cursor: 'pointer', fontSize: '12px' }}>✕</button>}
        </div>
      ))}
      {allergies.length === 0 && <p style={{ fontSize: '12px', color: COLORS.textMuted, textAlign: 'center' }}>No allergies recorded</p>}
    </Card>
  );
};

const VaccinationsTracker = ({ vaccinations, onAdd, onDelete }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [newV, setNewV] = useState({ name: '', date: '', nextDue: '' });
  
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: COLORS.text, margin: 0 }}>💉 Vaccinations</h3>
        <Button variant="secondary" size="small" icon="+" onClick={() => setShowAdd(!showAdd)}>Add</Button>
      </div>
      {showAdd && (
        <div style={{ padding: '12px', backgroundColor: COLORS.bgSecondary, borderRadius: '8px', marginBottom: '10px' }}>
          <Input value={newV.name} onChange={e => setNewV({...newV, name: e.target.value})} placeholder="Vaccine name" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <Input label="Date Given" type="date" value={newV.date} onChange={e => setNewV({...newV, date: e.target.value})} />
            <Input label="Next Due" type="date" value={newV.nextDue} onChange={e => setNewV({...newV, nextDue: e.target.value})} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" size="small" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button variant="success" size="small" onClick={() => { if (newV.name && newV.date) { onAdd({ ...newV, id: Date.now().toString() }); setNewV({ name: '', date: '', nextDue: '' }); setShowAdd(false); } }}>Add</Button>
          </div>
        </div>
      )}
      {vaccinations.map(v => (
        <div key={v.id} style={{ padding: '10px 12px', backgroundColor: COLORS.bgSecondary, borderRadius: '6px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: '500', fontSize: '13px' }}>{v.name}</div>
            <div style={{ fontSize: '11px', color: COLORS.textSecondary }}>
              {formatDate(v.date)}
              {v.nextDue && <span style={{ marginLeft: '8px', color: new Date(v.nextDue) < new Date() ? COLORS.critical : COLORS.textMuted }}>Next: {formatDate(v.nextDue)}</span>}
            </div>
          </div>
          {onDelete && <button onClick={() => onDelete(v.id)} style={{ background: 'none', border: 'none', color: COLORS.critical, cursor: 'pointer', fontSize: '12px' }}>✕</button>}
        </div>
      ))}
      {vaccinations.length === 0 && <p style={{ fontSize: '12px', color: COLORS.textMuted, textAlign: 'center' }}>No vaccinations recorded</p>}
    </Card>
  );
};

const ProceduresTracker = ({ procedures, onAdd, onDelete }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [newP, setNewP] = useState({ name: '', date: '', provider: '', findings: '' });
  
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: COLORS.text, margin: 0 }}>🏥 Procedures</h3>
        <Button variant="secondary" size="small" icon="+" onClick={() => setShowAdd(!showAdd)}>Add</Button>
      </div>
      {showAdd && (
        <div style={{ padding: '12px', backgroundColor: COLORS.bgSecondary, borderRadius: '8px', marginBottom: '10px' }}>
          <Input value={newP.name} onChange={e => setNewP({...newP, name: e.target.value})} placeholder="Procedure name" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <Input label="Date" type="date" value={newP.date} onChange={e => setNewP({...newP, date: e.target.value})} />
            <Input label="Provider" value={newP.provider} onChange={e => setNewP({...newP, provider: e.target.value})} placeholder="Dr. Smith" />
          </div>
          <Input label="Findings" value={newP.findings} onChange={e => setNewP({...newP, findings: e.target.value})} placeholder="Key findings or notes" />
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" size="small" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button variant="success" size="small" onClick={() => { if (newP.name && newP.date) { onAdd({ ...newP, id: Date.now().toString() }); setNewP({ name: '', date: '', provider: '', findings: '' }); setShowAdd(false); } }}>Add</Button>
          </div>
        </div>
      )}
      {procedures.map(p => (
        <div key={p.id} style={{ padding: '10px 12px', backgroundColor: COLORS.bgSecondary, borderRadius: '6px', marginBottom: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: '500', fontSize: '13px' }}>{p.name}</div>
              <div style={{ fontSize: '11px', color: COLORS.textSecondary }}>{formatDate(p.date)} {p.provider && `• ${p.provider}`}</div>
              {p.findings && <div style={{ fontSize: '11px', color: COLORS.textSecondary, marginTop: '4px' }}>{p.findings}</div>}
            </div>
            {onDelete && <button onClick={() => onDelete(p.id)} style={{ background: 'none', border: 'none', color: COLORS.critical, cursor: 'pointer', fontSize: '12px' }}>✕</button>}
          </div>
        </div>
      ))}
      {procedures.length === 0 && <p style={{ fontSize: '12px', color: COLORS.textMuted, textAlign: 'center' }}>No procedures recorded</p>}
    </Card>
  );
};

const GoalsTracker = ({ goals, records, onAdd, onDelete }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [newG, setNewG] = useState({ markerId: '', targetValue: '', targetDate: '' });
  
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: COLORS.text, margin: 0 }}>🎯 Goals</h3>
        <Button variant="secondary" size="small" icon="+" onClick={() => setShowAdd(!showAdd)}>Add</Button>
      </div>
      {showAdd && (
        <div style={{ padding: '12px', backgroundColor: COLORS.bgSecondary, borderRadius: '8px', marginBottom: '10px' }}>
          <Select value={newG.markerId} onChange={e => setNewG({...newG, markerId: e.target.value})}>
            <option value="">Select marker...</option>
            {Object.entries(BIOMARKER_DEFINITIONS).map(([id, def]) => <option key={id} value={id}>{def.name}</option>)}
          </Select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <Input label="Target Value" type="number" value={newG.targetValue} onChange={e => setNewG({...newG, targetValue: e.target.value})} />
            <Input label="Target Date" type="date" value={newG.targetDate} onChange={e => setNewG({...newG, targetDate: e.target.value})} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" size="small" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button variant="success" size="small" onClick={() => { if (newG.markerId && newG.targetValue) { onAdd({ ...newG, id: Date.now().toString(), targetValue: parseFloat(newG.targetValue) }); setNewG({ markerId: '', targetValue: '', targetDate: '' }); setShowAdd(false); } }}>Add</Button>
          </div>
        </div>
      )}
      {goals.map(g => {
        const def = BIOMARKER_DEFINITIONS[g.markerId];
        const markerRecords = records.filter(r => r.markerId === g.markerId);
        const latest = markerRecords.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        
        // Calculate progress correctly
        let progress = 0;
        if (latest && g.targetValue) {
          const baseline = markerRecords.length > 1 ? markerRecords[0].value : latest.value;
          const current = latest.value;
          const target = g.targetValue;
          const totalChange = Math.abs(target - baseline);
          const actualChange = Math.abs(current - baseline);
          progress = totalChange > 0 ? Math.min(100, (actualChange / totalChange) * 100) : 0;
          // Check direction
          if ((target < baseline && current > baseline) || (target > baseline && current < baseline)) {
            progress = 0; // Going wrong direction
          }
        }
        
        return def ? (
          <div key={g.id} style={{ padding: '10px 12px', backgroundColor: COLORS.bgSecondary, borderRadius: '6px', marginBottom: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontWeight: '500', fontSize: '13px' }}>{def.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: COLORS.textSecondary }}>Target: {g.targetValue} {def.unit}</span>
                {onDelete && <button onClick={() => onDelete(g.id)} style={{ background: 'none', border: 'none', color: COLORS.critical, cursor: 'pointer', fontSize: '12px' }}>✕</button>}
              </div>
            </div>
            <div style={{ height: '6px', backgroundColor: COLORS.border, borderRadius: '3px' }}>
              <div style={{ height: '100%', width: `${progress}%`, backgroundColor: progress >= 75 ? COLORS.optimal : progress >= 25 ? COLORS.attention : COLORS.critical, borderRadius: '3px', transition: 'width 0.3s' }} />
            </div>
            {latest && <div style={{ fontSize: '11px', color: COLORS.textSecondary, marginTop: '4px' }}>Current: {latest.value} {def.unit} • {Math.round(progress)}% progress</div>}
          </div>
        ) : null;
      })}
      {goals.length === 0 && <p style={{ fontSize: '12px', color: COLORS.textMuted, textAlign: 'center' }}>No goals set</p>}
    </Card>
  );
};

const LifestyleJournal = ({ journal, onAddEntry }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [entry, setEntry] = useState({ date: new Date().toISOString().split('T')[0], sleep: 7, energy: 3, mood: 3, exercise: false, notes: '' });
  
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: COLORS.text, margin: 0 }}>📓 Lifestyle Journal</h3>
        <Button variant="secondary" size="small" icon="+" onClick={() => setShowAdd(!showAdd)}>Log</Button>
      </div>
      {showAdd && (
        <div style={{ padding: '12px', backgroundColor: COLORS.bgSecondary, borderRadius: '8px', marginBottom: '12px' }}>
          <Input label="Date" type="date" value={entry.date} onChange={e => setEntry({...entry, date: e.target.value})} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '500', display: 'block', marginBottom: '6px' }}>Sleep: {entry.sleep}h</label>
              <input type="range" min="0" max="12" step="0.5" value={entry.sleep} onChange={e => setEntry({...entry, sleep: parseFloat(e.target.value)})} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '500', display: 'block', marginBottom: '6px' }}>Energy: {entry.energy}/5</label>
              <div style={{ display: 'flex', gap: '4px' }}>{[1,2,3,4,5].map(n => <button key={n} onClick={() => setEntry({...entry, energy: n})} style={{ width: '24px', height: '24px', borderRadius: '4px', border: `1px solid ${entry.energy >= n ? COLORS.primary : COLORS.border}`, backgroundColor: entry.energy >= n ? COLORS.primary : '#FFF', color: entry.energy >= n ? '#FFF' : COLORS.textSecondary, fontWeight: '600', cursor: 'pointer', fontSize: '10px' }}>{n}</button>)}</div>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '500', display: 'block', marginBottom: '6px' }}>Mood: {entry.mood}/5</label>
              <div style={{ display: 'flex', gap: '4px' }}>{[1,2,3,4,5].map(n => <button key={n} onClick={() => setEntry({...entry, mood: n})} style={{ width: '24px', height: '24px', borderRadius: '4px', border: `1px solid ${entry.mood >= n ? COLORS.secondary : COLORS.border}`, backgroundColor: entry.mood >= n ? COLORS.secondary : '#FFF', color: entry.mood >= n ? '#FFF' : COLORS.textSecondary, fontWeight: '600', cursor: 'pointer', fontSize: '10px' }}>{n}</button>)}</div>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginBottom: '12px', cursor: 'pointer' }}>
            <input type="checkbox" checked={entry.exercise} onChange={e => setEntry({...entry, exercise: e.target.checked})} />Exercised
          </label>
          <Input value={entry.notes} onChange={e => setEntry({...entry, notes: e.target.value})} placeholder="Notes..." />
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" size="small" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button variant="success" size="small" onClick={() => { onAddEntry({ ...entry, id: Date.now().toString() }); setEntry({ date: new Date().toISOString().split('T')[0], sleep: 7, energy: 3, mood: 3, exercise: false, notes: '' }); setShowAdd(false); }}>Save</Button>
          </div>
        </div>
      )}
      {journal.slice(0, 5).map(e => (
        <div key={e.id} style={{ padding: '10px 12px', backgroundColor: COLORS.bgSecondary, borderRadius: '6px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: '500', fontSize: '12px' }}>{formatDateShort(e.date)}</div>
            <div style={{ fontSize: '11px', color: COLORS.textSecondary }}>{e.notes || 'No notes'}</div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '11px' }}>
            <span>😴{e.sleep}h</span>
            <span>⚡{e.energy}</span>
            <span>😊{e.mood}</span>
            {e.exercise && <span style={{ color: COLORS.optimal }}>💪</span>}
          </div>
        </div>
      ))}
      {journal.length === 0 && <p style={{ fontSize: '12px', color: COLORS.textMuted, textAlign: 'center' }}>No journal entries</p>}
    </Card>
  );
};

// Timeline & Visit Prep
const TimelineView = ({ records, medications, conditions, vaccinations, procedures }) => {
  const events = [
    ...records.slice(-15).map(r => ({ type: 'lab', date: r.date, title: BIOMARKER_DEFINITIONS[r.markerId]?.name || r.markerId, subtitle: `${r.value} ${BIOMARKER_DEFINITIONS[r.markerId]?.unit || ''}`, status: getStatus(r.value, r.markerId) })),
    ...medications.map(m => ({ type: 'medication', date: m.startDate, title: `Started ${m.name}`, subtitle: m.dosage, status: 'normal' })),
    ...conditions.map(c => ({ type: 'condition', date: c.diagnosedDate, title: c.name, subtitle: c.status, status: c.status === 'resolved' ? 'optimal' : 'attention' })),
    ...vaccinations.map(v => ({ type: 'vaccination', date: v.date, title: v.name, subtitle: 'Vaccination', status: 'optimal' })),
    ...procedures.map(p => ({ type: 'procedure', date: p.date, title: p.name, subtitle: p.provider || '', status: 'normal' }))
  ].filter(e => e.date).sort((a, b) => new Date(b.date) - new Date(a.date));
  
  const icons = { lab: '🔬', medication: '💊', condition: '📋', vaccination: '💉', procedure: '🏥' };
  
  return (
    <Card>
      <h3 style={{ fontSize: '15px', fontWeight: '600', color: COLORS.text, margin: '0 0 12px' }}>Timeline</h3>
      {events.slice(0, 15).map((e, i) => (
        <div key={i} style={{ display: 'flex', gap: '12px', paddingBottom: '14px', position: 'relative' }}>
          {i < events.length - 1 && <div style={{ position: 'absolute', left: '14px', top: '32px', bottom: '0', width: '2px', backgroundColor: COLORS.border }} />}
          <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: getStatusBg(e.status), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0, zIndex: 1 }}>{icons[e.type]}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', color: COLORS.textMuted }}>{formatDateShort(e.date)}</div>
            <div style={{ fontSize: '13px', fontWeight: '500', color: COLORS.text }}>{e.title}</div>
            {e.subtitle && <div style={{ fontSize: '12px', color: COLORS.textSecondary }}>{e.subtitle}</div>}
          </div>
        </div>
      ))}
      {events.length === 0 && <p style={{ fontSize: '12px', color: COLORS.textMuted, textAlign: 'center' }}>No events recorded</p>}
    </Card>
  );
};

const VisitPreparation = ({ records, medications, conditions, allergies }) => {
  const flaggedMarkers = [];
  const significantChanges = [];
  
  Object.keys(BIOMARKER_DEFINITIONS).forEach(id => {
    const markerRecords = records.filter(r => r.markerId === id);
    if (markerRecords.length > 0) {
      const sorted = markerRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
      const latest = sorted[0];
      const status = getStatus(latest.value, id);
      
      if (status === 'attention' || status === 'critical') {
        flaggedMarkers.push({ id, name: BIOMARKER_DEFINITIONS[id].name, value: latest.value, unit: BIOMARKER_DEFINITIONS[id].unit, status });
      }
      
      if (sorted.length >= 2) {
        const previous = sorted[1];
        const change = ((latest.value - previous.value) / previous.value) * 100;
        if (Math.abs(change) > 15) {
          significantChanges.push({ id, name: BIOMARKER_DEFINITIONS[id].name, change: change.toFixed(1), direction: change > 0 ? 'increased' : 'decreased' });
        }
      }
    }
  });

  const questions = [
    ...flaggedMarkers.map(m => `My ${m.name} is ${m.status}. What could be causing this and what should I do?`),
    ...significantChanges.slice(0, 2).map(c => `My ${c.name} has ${c.direction} by ${Math.abs(c.change)}%. Is this concerning?`),
    'Are there any tests I should schedule based on my current results?',
    'Should I adjust any of my current medications?'
  ].slice(0, 5);

  const exportVisitSummary = () => {
    const summary = [
      '=== VISIT PREPARATION SUMMARY ===',
      `Generated: ${new Date().toLocaleDateString()}`,
      '',
      '--- FLAGGED MARKERS ---',
      ...flaggedMarkers.map(m => `• ${m.name}: ${m.value} ${m.unit} (${m.status})`),
      '',
      '--- SIGNIFICANT CHANGES ---',
      ...significantChanges.map(c => `• ${c.name}: ${c.direction} by ${c.change}%`),
      '',
      '--- CURRENT MEDICATIONS ---',
      ...medications.filter(m => m.active).map(m => `• ${m.name} - ${m.dosage}`),
      '',
      '--- ACTIVE CONDITIONS ---',
      ...conditions.filter(c => c.status === 'active').map(c => `• ${c.name}`),
      '',
      '--- ALLERGIES ---',
      ...allergies.map(a => `• ${a.name} (${a.severity})`),
      '',
      '--- QUESTIONS FOR DOCTOR ---',
      ...questions.map((q, i) => `${i + 1}. ${q}`),
      '',
      '=== END OF SUMMARY ==='
    ].join('\n');

    const blob = new Blob([summary], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `visit-summary-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: COLORS.text, margin: 0 }}>🩺 Visit Preparation</h3>
          <Button variant="primary" size="small" onClick={exportVisitSummary}>Export</Button>
        </div>
        
        {flaggedMarkers.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: COLORS.text, marginBottom: '8px' }}>Flagged Markers</div>
            {flaggedMarkers.map(m => (
              <div key={m.id} style={{ padding: '8px 10px', backgroundColor: getStatusBg(m.status), borderRadius: '6px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', fontWeight: '500' }}>{m.name}</span>
                <span style={{ fontSize: '12px', color: getStatusColor(m.status) }}>{m.value} {m.unit}</span>
              </div>
            ))}
          </div>
        )}

        {significantChanges.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: COLORS.text, marginBottom: '8px' }}>Significant Changes</div>
            {significantChanges.map(c => (
              <div key={c.id} style={{ padding: '8px 10px', backgroundColor: COLORS.bgSecondary, borderRadius: '6px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px' }}>{c.name}</span>
                <span style={{ fontSize: '12px', color: c.direction === 'increased' ? COLORS.critical : COLORS.optimal }}>{c.direction} {Math.abs(c.change)}%</span>
              </div>
            ))}
          </div>
        )}

        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: COLORS.text, marginBottom: '8px' }}>Suggested Questions</div>
          {questions.map((q, i) => (
            <div key={i} style={{ padding: '10px', backgroundColor: COLORS.bgSecondary, borderRadius: '6px', marginBottom: '6px', fontSize: '12px', color: COLORS.text }}>
              {i + 1}. {q}
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Card>
          <h4 style={{ fontSize: '13px', fontWeight: '600', color: COLORS.text, margin: '0 0 10px' }}>Active Medications</h4>
          {medications.filter(m => m.active).map(m => (
            <div key={m.id} style={{ fontSize: '12px', padding: '6px 0', borderBottom: `1px solid ${COLORS.borderLight}` }}>
              <strong>{m.name}</strong> - {m.dosage}
            </div>
          ))}
          {medications.filter(m => m.active).length === 0 && <p style={{ fontSize: '12px', color: COLORS.textMuted }}>No active medications</p>}
        </Card>

        <Card>
          <h4 style={{ fontSize: '13px', fontWeight: '600', color: COLORS.text, margin: '0 0 10px' }}>Allergies</h4>
          {allergies.map(a => (
            <div key={a.id} style={{ fontSize: '12px', padding: '6px 0', borderBottom: `1px solid ${COLORS.borderLight}` }}>
              <strong>{a.name}</strong> - {a.severity}
            </div>
          ))}
          {allergies.length === 0 && <p style={{ fontSize: '12px', color: COLORS.textMuted }}>No allergies recorded</p>}
        </Card>
      </div>
    </div>
  );
};

// Add Record Modal
const AddRecordModal = ({ isOpen, onClose, onAdd }) => {
  const [form, setForm] = useState({ markerId: '', value: '', date: new Date().toISOString().split('T')[0], labName: '' });
  if (!isOpen) return null;
  
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <Card style={{ width: '100%', maxWidth: '400px', boxShadow: SHADOWS.xl }}>
        <h2 style={{ fontSize: '17px', fontWeight: '600', color: COLORS.text, margin: '0 0 16px' }}>Add Test Result</h2>
        <Select label="Biomarker" value={form.markerId} onChange={e => setForm({...form, markerId: e.target.value})}>
          <option value="">Select...</option>
          {CATEGORIES.map(cat => (
            <optgroup key={cat} label={cat}>
              {Object.entries(BIOMARKER_DEFINITIONS).filter(([_, d]) => d.category === cat).map(([id, d]) => <option key={id} value={id}>{d.name} ({d.unit})</option>)}
            </optgroup>
          ))}
        </Select>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Input label="Value" type="number" step="0.01" value={form.value} onChange={e => setForm({...form, value: e.target.value})} />
          <Input label="Date" type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
        </div>
        <Input label="Lab (optional)" value={form.labName} onChange={e => setForm({...form, labName: e.target.value})} placeholder="e.g., Quest" />
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <Button variant="secondary" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
          <Button variant="primary" onClick={() => { if (form.markerId && form.value) { onAdd({ ...form, id: `${form.date}-${form.markerId}-${Date.now()}`, value: parseFloat(form.value) }); setForm({ markerId: '', value: '', date: new Date().toISOString().split('T')[0], labName: '' }); onClose(); } }} style={{ flex: 1 }}>Add</Button>
        </div>
      </Card>
    </div>
  );
};

// Upload Zone
const UploadZone = ({ onUpload }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef(null);
  
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onUpload(files);
  };
  
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) onUpload(files);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      style={{
        border: `2px dashed ${isDragging ? COLORS.primary : COLORS.border}`,
        borderRadius: '12px',
        padding: '24px',
        textAlign: 'center',
        backgroundColor: isDragging ? COLORS.primaryLight : COLORS.bgSecondary,
        cursor: 'pointer',
        transition: 'all 0.2s'
      }}
    >
      <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileSelect} style={{ display: 'none' }} />
      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
      <div style={{ fontSize: '14px', fontWeight: '500', color: COLORS.text }}>Upload Lab Reports</div>
      <div style={{ fontSize: '12px', color: COLORS.textSecondary, marginTop: '4px' }}>Drag & drop or click to select PDF/images</div>
    </div>
  );
};

// ============================================
// SAMPLE DATA GENERATORS (for demo/offline mode)
// ============================================

const generateSampleData = () => {
  const markers = ['glucose', 'hba1c', 'totalCholesterol', 'ldl', 'hdl', 'triglycerides', 'creatinine', 'egfr', 'alt', 'ast', 'tsh', 'vitaminD', 'vitaminB12', 'hemoglobin', 'ferritin'];
  const records = [];
  
  markers.forEach(markerId => {
    const def = BIOMARKER_DEFINITIONS[markerId];
    if (!def) return;
    
    const mid = (def.normalRange[0] + def.normalRange[1]) / 2;
    const range = (def.normalRange[1] - def.normalRange[0]) * 0.3;
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i * 2);
      const variation = (Math.random() - 0.5) * range;
      const value = Math.round((mid + variation) * 100) / 100;
      records.push({ id: `${markerId}-${i}`, markerId, value, date: date.toISOString().split('T')[0], labName: 'Demo Lab' });
    }
  });
  
  return records;
};

const generateSampleMedications = () => [
  { id: '1', name: 'Vitamin D3', dosage: '2000 IU', frequency: 'daily', active: true, startDate: '2024-01-15' },
  { id: '2', name: 'Fish Oil', dosage: '1000mg', frequency: 'daily', active: true, startDate: '2024-03-01' }
];

const generateSampleConditions = () => [
  { id: '1', name: 'Vitamin D Deficiency', status: 'active', diagnosedDate: '2024-01-10' }
];

const generateSampleAllergies = () => [
  { id: '1', name: 'Penicillin', severity: 'moderate' }
];

const generateSampleVaccinations = () => [
  { id: '1', name: 'COVID-19 Booster', date: '2024-10-15', nextDue: '2025-10-15' },
  { id: '2', name: 'Influenza', date: '2024-09-01', nextDue: '2025-09-01' }
];

const generateSampleProcedures = () => [
  { id: '1', name: 'Annual Physical', date: '2025-01-15', provider: 'Dr. Smith', findings: 'Routine checkup, all clear' }
];

const generateSampleGoals = () => [
  { id: '1', markerId: 'ldl', targetValue: 70, targetDate: '2025-06-01' },
  { id: '2', markerId: 'vitaminD', targetValue: 50, targetDate: '2025-03-01' }
];

const generateSampleJournal = () => [
  { id: '1', date: new Date().toISOString().split('T')[0], sleep: 7.5, energy: 4, mood: 4, exercise: true, notes: 'Feeling good today' },
  { id: '2', date: new Date(Date.now() - 86400000).toISOString().split('T')[0], sleep: 6, energy: 3, mood: 3, exercise: false, notes: 'Busy day' }
];

// ============================================
// MAIN APPLICATION
// ============================================

export default function HealthCanvas() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);
  
  // Data state
  const [records, setRecords] = useState([]);
  const [medications, setMedications] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [allergies, setAllergies] = useState([]);
  const [vaccinations, setVaccinations] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [goals, setGoals] = useState([]);
  const [journal, setJournal] = useState([]);
  
  // UI state
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [watchedMarkers, setWatchedMarkers] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      if (api.token) {
        try {
          const userData = await api.getMe();
          setUser(userData);
          await loadData();
        } catch (err) {
          console.log('Auth check failed, switching to offline mode');
          setOfflineMode(true);
          loadOfflineData();
        }
      } else {
        setOfflineMode(true);
        loadOfflineData();
      }
      setLoading(false);
    };
    checkAuth();
    
    // Listen for logout events
    const handleLogout = () => {
      setUser(null);
      setOfflineMode(true);
      loadOfflineData();
    };
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  const loadData = async () => {
    try {
      const [obs, meds, conds, alls, vaccs, procs, gls, jrnl] = await Promise.all([
        api.getObservations({ limit: 500 }),
        api.getMedications(),
        api.getConditions(),
        api.getAllergies(),
        api.getVaccinations(),
        api.getProcedures(),
        api.getGoals(),
        api.getJournal()
      ]);
      
      // Map API responses to local format
      setRecords(obs.map(o => ({ id: o.id, markerId: o.biomarker_id, value: parseFloat(o.value), date: o.effective_date, labName: o.lab_name })));
      setMedications(meds.map(m => ({ id: m.id, name: m.name, dosage: m.dosage, frequency: m.frequency, active: m.active, startDate: m.start_date })));
      setConditions(conds.map(c => ({ id: c.id, name: c.name, status: c.clinical_status, diagnosedDate: c.onset_date })));
      setAllergies(alls.map(a => ({ id: a.id, name: a.allergen, severity: a.criticality })));
      setVaccinations(vaccs.map(v => ({ id: v.id, name: v.vaccine_name, date: v.administration_date, nextDue: v.next_dose_due })));
      setProcedures(procs.map(p => ({ id: p.id, name: p.name, date: p.performed_date, provider: p.performed_by, findings: p.findings })));
      setGoals(gls.map(g => ({ id: g.id, markerId: g.biomarker_id, targetValue: parseFloat(g.target_value), targetDate: g.target_date })));
      setJournal(jrnl.map(j => ({ id: j.id, date: j.entry_date, sleep: parseFloat(j.sleep_hours || 0), energy: j.energy_level, mood: j.mood_level, exercise: j.exercise_done, notes: j.notes })));
    } catch (err) {
      console.error('Error loading data:', err);
      setOfflineMode(true);
      loadOfflineData();
    }
  };

  const loadOfflineData = () => {
    // Load from localStorage or generate sample data
    const stored = localStorage.getItem('healthcanvas_offline');
    if (stored) {
      const data = JSON.parse(stored);
      setRecords(data.records || []);
      setMedications(data.medications || []);
      setConditions(data.conditions || []);
      setAllergies(data.allergies || []);
      setVaccinations(data.vaccinations || []);
      setProcedures(data.procedures || []);
      setGoals(data.goals || []);
      setJournal(data.journal || []);
      setWatchedMarkers(new Set(data.watchedMarkers || []));
    } else {
      setRecords(generateSampleData());
      setMedications(generateSampleMedications());
      setConditions(generateSampleConditions());
      setAllergies(generateSampleAllergies());
      setVaccinations(generateSampleVaccinations());
      setProcedures(generateSampleProcedures());
      setGoals(generateSampleGoals());
      setJournal(generateSampleJournal());
    }
  };

  // Save offline data
  useEffect(() => {
    if (offlineMode && !loading) {
      localStorage.setItem('healthcanvas_offline', JSON.stringify({
        records, medications, conditions, allergies, vaccinations, procedures, goals, journal,
        watchedMarkers: Array.from(watchedMarkers)
      }));
    }
  }, [records, medications, conditions, allergies, vaccinations, procedures, goals, journal, watchedMarkers, offlineMode, loading]);

  // Handlers
  const handleLogin = (userData) => {
    setUser(userData);
    setOfflineMode(false);
    loadData();
  };

  const handleLogout = () => {
    api.logout();
    setUser(null);
    setOfflineMode(true);
    loadOfflineData();
  };

  const addRecord = async (record) => {
    if (offlineMode) {
      setRecords([...records, record]);
    } else {
      try {
        await api.createObservation({
          biomarker_id: record.markerId,
          value: record.value,
          effective_date: record.date,
          lab_name: record.labName
        });
        await loadData();
      } catch (err) {
        console.error('Error adding record:', err);
        setRecords([...records, record]); // Fallback to local
      }
    }
  };

  const addMedication = async (med) => {
    if (offlineMode) {
      setMedications([...medications, med]);
    } else {
      try {
        await api.createMedication({
          name: med.name,
          dosage: med.dosage,
          frequency: med.frequency
        });
        await loadData();
      } catch (err) {
        setMedications([...medications, med]);
      }
    }
  };

  const toggleMedication = async (id) => {
    if (offlineMode) {
      setMedications(medications.map(m => m.id === id ? {...m, active: !m.active} : m));
    } else {
      try {
        await api.toggleMedication(id);
        await loadData();
      } catch (err) {
        setMedications(medications.map(m => m.id === id ? {...m, active: !m.active} : m));
      }
    }
  };

  const deleteMedication = async (id) => {
    if (offlineMode) {
      setMedications(medications.filter(m => m.id !== id));
    } else {
      try {
        await api.deleteMedication(id);
        await loadData();
      } catch (err) {
        setMedications(medications.filter(m => m.id !== id));
      }
    }
  };

  // Computed values
  const patterns = detectPatterns(records);
  const getMarkerData = (id) => records.filter(r => r.markerId === id).sort((a, b) => new Date(a.date) - new Date(b.date));
  const filterCategories = ['all', ...CATEGORIES];
  
  const filteredMarkers = Object.keys(BIOMARKER_DEFINITIONS).filter(id => {
    const def = BIOMARKER_DEFINITIONS[id];
    if (categoryFilter !== 'all' && def.category !== categoryFilter) return false;
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      return def.name.toLowerCase().includes(t) || def.aliases.some(a => a.includes(t));
    }
    return true;
  }).filter(m => getMarkerData(m).length > 0);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'timeline', label: 'Timeline', icon: '📅' },
    { id: 'visit', label: 'Visit Prep', icon: '🩺' },
    { id: 'profile', label: 'Profile', icon: '👤' }
  ];

  // Loading state
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: COLORS.bgPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>❤️</div>
          <div style={{ fontSize: '16px', color: COLORS.textSecondary }}>Loading HealthCanvas...</div>
        </div>
      </div>
    );
  }

  // Auth screen (optional - for demo we skip directly to app)
  // if (!user && !offlineMode) {
  //   return <AuthScreen onLogin={handleLogin} />;
  // }

  return (
    <AuthContext.Provider value={{ user, login: handleLogin, logout: handleLogout, offlineMode }}>
      <div style={{ minHeight: '100vh', backgroundColor: COLORS.bgPrimary, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <header style={{ backgroundColor: COLORS.bgCard, borderBottom: `1px solid ${COLORS.border}`, padding: '12px 20px', position: 'sticky', top: 0, zIndex: 100 }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>❤️</div>
              <span style={{ fontSize: '17px', fontWeight: '600', color: COLORS.text }}>HealthCanvas</span>
              {offlineMode && <span style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: COLORS.attentionLight, color: COLORS.attention, borderRadius: '4px' }}>Offline</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Button variant="primary" size="small" icon="+" onClick={() => setIsModalOpen(true)}>Add Result</Button>
              {user && <Button variant="ghost" size="small" onClick={handleLogout}>Logout</Button>}
            </div>
          </div>
        </header>
        
        <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
          <TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />
          
          {activeTab === 'dashboard' && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <UploadZone onUpload={(files) => alert(`Upload: ${files.map(f => f.name).join(', ')}\n\nOCR processing would extract lab values here.`)} />
              </div>
              {patterns.length > 0 && <PatternAlerts patterns={patterns} />}
              <HealthScoreDashboard records={records} />
              
              <div style={{ marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1', minWidth: '180px', maxWidth: '280px' }}>
                  <input type="text" placeholder="Search markers..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '100%', padding: '9px 12px 9px 34px', fontSize: '13px', border: `1px solid ${COLORS.border}`, borderRadius: '8px', backgroundColor: COLORS.bgCard, outline: 'none', boxSizing: 'border-box' }} />
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px' }}>🔍</span>
                </div>
                <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '4px', flex: '1' }}>
                  {filterCategories.map(cat => (
                    <button key={cat} onClick={() => setCategoryFilter(cat)} style={{ padding: '6px 12px', border: `1px solid ${categoryFilter === cat ? COLORS.primary : COLORS.border}`, borderRadius: '6px', backgroundColor: categoryFilter === cat ? COLORS.primaryLight : COLORS.bgCard, color: categoryFilter === cat ? COLORS.primary : COLORS.textSecondary, fontSize: '11px', fontWeight: '500', cursor: 'pointer', whiteSpace: 'nowrap' }}>{cat === 'all' ? 'All' : cat}</button>
                  ))}
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: selectedMarker ? '1fr 360px' : '1fr', gap: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px', alignContent: 'start' }}>
                  {filteredMarkers.map(id => (
                    <BiomarkerCard
                      key={id}
                      markerId={id}
                      data={getMarkerData(id)}
                      onClick={setSelectedMarker}
                      isSelected={selectedMarker === id}
                      isWatched={watchedMarkers.has(id)}
                    />
                  ))}
                  {filteredMarkers.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: COLORS.textSecondary }}>
                      <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
                      <p style={{ margin: 0 }}>No results found</p>
                    </div>
                  )}
                </div>
                {selectedMarker && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Button
                        variant={watchedMarkers.has(selectedMarker) ? 'primary' : 'secondary'}
                        size="small"
                        icon={watchedMarkers.has(selectedMarker) ? '⭐' : '☆'}
                        onClick={() => {
                          const n = new Set(watchedMarkers);
                          n.has(selectedMarker) ? n.delete(selectedMarker) : n.add(selectedMarker);
                          setWatchedMarkers(n);
                        }}
                      >
                        {watchedMarkers.has(selectedMarker) ? 'Watching' : 'Watch'}
                      </Button>
                      <Button variant="ghost" size="small" onClick={() => setSelectedMarker(null)}>✕</Button>
                    </div>
                    <DetailedChart markerId={selectedMarker} data={getMarkerData(selectedMarker)} />
                    <InsightsPanel markerId={selectedMarker} data={getMarkerData(selectedMarker)} />
                  </div>
                )}
              </div>
            </>
          )}
          
          {activeTab === 'timeline' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              <TimelineView records={records} medications={medications} conditions={conditions} vaccinations={vaccinations} procedures={procedures} />
              <HealthRadar records={records} />
            </div>
          )}
          
          {activeTab === 'visit' && (
            <VisitPreparation records={records} medications={medications} conditions={conditions} allergies={allergies} />
          )}
          
          {activeTab === 'profile' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <MedicationTracker medications={medications} onAdd={addMedication} onToggle={toggleMedication} onDelete={deleteMedication} />
                <ConditionsTracker conditions={conditions} onAdd={c => setConditions([...conditions, c])} onDelete={id => setConditions(conditions.filter(c => c.id !== id))} />
                <AllergiesTracker allergies={allergies} onAdd={a => setAllergies([...allergies, a])} onDelete={id => setAllergies(allergies.filter(a => a.id !== id))} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <VaccinationsTracker vaccinations={vaccinations} onAdd={v => setVaccinations([...vaccinations, v])} onDelete={id => setVaccinations(vaccinations.filter(v => v.id !== id))} />
                <ProceduresTracker procedures={procedures} onAdd={p => setProcedures([...procedures, p])} onDelete={id => setProcedures(procedures.filter(p => p.id !== id))} />
                <GoalsTracker goals={goals} records={records} onAdd={g => setGoals([...goals, g])} onDelete={id => setGoals(goals.filter(g => g.id !== id))} />
              </div>
              <LifestyleJournal journal={journal} onAddEntry={e => setJournal([e, ...journal])} />
            </div>
          )}
        </main>
        
        <footer style={{ backgroundColor: COLORS.attentionLight, borderTop: `1px solid ${COLORS.attention}`, padding: '12px 20px', marginTop: '30px' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <p style={{ fontSize: '11px', color: COLORS.text, margin: 0, display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
              <span>⚠️</span>
              <span><strong>Disclaimer:</strong> For informational purposes only. Not medical advice. Always consult your healthcare provider for diagnosis and treatment decisions.</span>
            </p>
          </div>
        </footer>
        
        <AddRecordModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onAdd={addRecord} />
      </div>
    </AuthContext.Provider>
  );
}
