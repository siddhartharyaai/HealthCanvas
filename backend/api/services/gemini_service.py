"""
HealthCanvas - Gemini AI Service
Handles OCR (Vision) and LLM (Explanations, Insights) via Google Gemini API
"""

import os
import json
import base64
import httpx
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
from datetime import datetime
import re

# ============================================
# Configuration
# ============================================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_VISION_MODEL = "gemini-1.5-flash"
GEMINI_TEXT_MODEL = "gemini-1.5-flash"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

# ============================================
# Data Classes
# ============================================

@dataclass
class ExtractedLabValue:
    test_name: str
    value: float
    unit: str
    reference_range: Optional[str] = None
    flag: Optional[str] = None  # H, L, or None
    confidence: float = 0.0
    mapped_biomarker_id: Optional[str] = None

@dataclass
class OCRResult:
    success: bool
    lab_name: Optional[str] = None
    report_date: Optional[str] = None
    patient_name: Optional[str] = None
    extracted_values: List[ExtractedLabValue] = None
    raw_text: Optional[str] = None
    error: Optional[str] = None

@dataclass
class ExplanationResult:
    success: bool
    marker_name: str
    plain_explanation: Optional[str] = None
    what_it_measures: Optional[str] = None
    why_it_matters: Optional[str] = None
    factors_that_affect: List[str] = None
    questions_for_doctor: List[str] = None
    error: Optional[str] = None

@dataclass
class InsightResult:
    success: bool
    summary: Optional[str] = None
    patterns: List[Dict[str, Any]] = None
    recommendations: List[str] = None
    lifestyle_suggestions: List[str] = None
    error: Optional[str] = None

# ============================================
# Biomarker Mapping
# ============================================

BIOMARKER_ALIASES = {
    # Metabolic
    'glucose': ['fasting glucose', 'blood glucose', 'fbs', 'fasting blood sugar', 'plasma glucose', 'glucose fasting'],
    'hba1c': ['hba1c', 'a1c', 'glycated hemoglobin', 'hemoglobin a1c', 'glycosylated hemoglobin', 'hb a1c'],
    'insulin': ['fasting insulin', 'serum insulin', 'insulin fasting'],
    
    # Cardiovascular
    'totalCholesterol': ['total cholesterol', 'cholesterol total', 'cholesterol', 'tc', 'serum cholesterol'],
    'ldl': ['ldl', 'ldl-c', 'ldl cholesterol', 'low density lipoprotein', 'ldl-cholesterol'],
    'hdl': ['hdl', 'hdl-c', 'hdl cholesterol', 'high density lipoprotein', 'hdl-cholesterol'],
    'triglycerides': ['triglycerides', 'tg', 'triglyceride', 'trigs'],
    'homocysteine': ['homocysteine', 'hcy', 'homocystine'],
    
    # Kidney
    'creatinine': ['creatinine', 'creat', 'serum creatinine', 's.creatinine', 's creatinine'],
    'egfr': ['egfr', 'gfr', 'estimated gfr', 'glomerular filtration rate'],
    'bun': ['bun', 'blood urea nitrogen', 'urea nitrogen', 'urea'],
    'uricAcid': ['uric acid', 'urate', 'serum uric acid'],
    
    # Liver
    'alt': ['alt', 'sgpt', 'alanine aminotransferase', 'alanine transaminase'],
    'ast': ['ast', 'sgot', 'aspartate aminotransferase', 'aspartate transaminase'],
    'ggt': ['ggt', 'gamma gt', 'gamma-gt', 'gamma glutamyl transferase'],
    'bilirubin': ['bilirubin', 'total bilirubin', 'tbili', 't.bilirubin', 'serum bilirubin'],
    'albumin': ['albumin', 'alb', 'serum albumin'],
    'alp': ['alp', 'alkaline phosphatase', 'alk phos', 'alkp'],
    
    # Thyroid
    'tsh': ['tsh', 'thyroid stimulating hormone', 'thyrotropin'],
    'freeT4': ['free t4', 'ft4', 't4 free', 'free thyroxine'],
    'freeT3': ['free t3', 'ft3', 't3 free', 'free triiodothyronine'],
    
    # Inflammation
    'crp': ['crp', 'c-reactive protein', 'hs-crp', 'hscrp', 'high sensitivity crp'],
    'esr': ['esr', 'sed rate', 'sedimentation rate', 'erythrocyte sedimentation rate'],
    
    # Nutrients
    'vitaminD': ['vitamin d', 'vit d', '25-oh vitamin d', '25-hydroxy vitamin d', 'cholecalciferol', 'd3', 'vitamin d3', '25 oh d'],
    'vitaminB12': ['vitamin b12', 'b12', 'cobalamin', 'cyanocobalamin'],
    'folate': ['folate', 'folic acid', 'serum folate'],
    'iron': ['iron', 'serum iron', 'fe', 's.iron'],
    'ferritin': ['ferritin', 'serum ferritin'],
    'calcium': ['calcium', 'ca', 'serum calcium', 's.calcium'],
    'magnesium': ['magnesium', 'mg', 'serum magnesium'],
    'zinc': ['zinc', 'zn', 'serum zinc'],
    
    # Blood Count
    'hemoglobin': ['hemoglobin', 'hgb', 'hb', 'haemoglobin'],
    'hematocrit': ['hematocrit', 'hct', 'pcv', 'packed cell volume'],
    'rbc': ['rbc', 'red blood cells', 'erythrocytes', 'red cell count'],
    'wbc': ['wbc', 'white blood cells', 'leukocytes', 'white cell count', 'total wbc'],
    'platelets': ['platelets', 'plt', 'platelet count', 'thrombocytes'],
    'mcv': ['mcv', 'mean corpuscular volume'],
    
    # Hormones
    'testosterone': ['testosterone', 'total testosterone', 'serum testosterone'],
    'estradiol': ['estradiol', 'e2', 'oestradiol'],
    'cortisol': ['cortisol', 'serum cortisol', 'am cortisol', 'morning cortisol'],
    'dheas': ['dhea-s', 'dheas', 'dehydroepiandrosterone sulfate'],
}

def map_to_biomarker_id(test_name: str) -> Optional[str]:
    """Map extracted test name to our biomarker ID"""
    test_lower = test_name.lower().strip()
    
    for biomarker_id, aliases in BIOMARKER_ALIASES.items():
        for alias in aliases:
            if alias in test_lower or test_lower in alias:
                return biomarker_id
    
    return None

# ============================================
# Gemini API Client
# ============================================

class GeminiService:
    def __init__(self):
        self.api_key = GEMINI_API_KEY
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set")
    
    async def _call_gemini(self, model: str, contents: List[Dict], generation_config: Dict = None) -> Dict:
        """Make a call to Gemini API"""
        url = f"{GEMINI_BASE_URL}/{model}:generateContent?key={self.api_key}"
        
        payload = {"contents": contents}
        if generation_config:
            payload["generationConfig"] = generation_config
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            return response.json()
    
    # ============================================
    # OCR - Extract Lab Values from Images/PDFs
    # ============================================
    
    async def extract_lab_values(self, file_content: bytes, mime_type: str) -> OCRResult:
        """
        Extract lab values from an uploaded lab report image or PDF.
        Uses Gemini Vision to parse the document.
        """
        try:
            # Encode file to base64
            file_base64 = base64.standard_b64encode(file_content).decode('utf-8')
            
            # Construct the prompt for structured extraction
            extraction_prompt = """Analyze this lab report image and extract all lab test results.

Return a JSON object with this exact structure:
{
    "lab_name": "Name of the laboratory if visible",
    "report_date": "Date of the report in YYYY-MM-DD format if visible",
    "patient_name": "Patient name if visible (or null)",
    "tests": [
        {
            "test_name": "Full name of the test",
            "value": numeric_value_only,
            "unit": "unit of measurement",
            "reference_range": "reference range as shown (e.g., '70-100')",
            "flag": "H for high, L for low, or null if normal"
        }
    ]
}

Rules:
1. Extract ALL tests visible in the report
2. For "value", provide ONLY the numeric value (no units)
3. Convert any values written as text to numbers
4. If a value has multiple components (like blood pressure), extract each separately
5. Include the reference range exactly as shown
6. Set flag to "H" if marked high, "L" if marked low, null otherwise
7. If you cannot determine a field, set it to null
8. Return ONLY valid JSON, no other text"""

            contents = [
                {
                    "parts": [
                        {"text": extraction_prompt},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": file_base64
                            }
                        }
                    ]
                }
            ]
            
            response = await self._call_gemini(
                GEMINI_VISION_MODEL,
                contents,
                {"temperature": 0.1, "maxOutputTokens": 4096}
            )
            
            # Parse response
            response_text = response['candidates'][0]['content']['parts'][0]['text']
            
            # Clean up response - extract JSON from markdown if present
            json_match = re.search(r'```json\s*(.*?)\s*```', response_text, re.DOTALL)
            if json_match:
                response_text = json_match.group(1)
            else:
                # Try to find JSON object directly
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    response_text = json_match.group(0)
            
            parsed = json.loads(response_text)
            
            # Convert to our data structures
            extracted_values = []
            for test in parsed.get('tests', []):
                try:
                    value = float(test.get('value', 0))
                    lab_value = ExtractedLabValue(
                        test_name=test.get('test_name', 'Unknown'),
                        value=value,
                        unit=test.get('unit', ''),
                        reference_range=test.get('reference_range'),
                        flag=test.get('flag'),
                        confidence=0.9,
                        mapped_biomarker_id=map_to_biomarker_id(test.get('test_name', ''))
                    )
                    extracted_values.append(lab_value)
                except (ValueError, TypeError):
                    continue
            
            return OCRResult(
                success=True,
                lab_name=parsed.get('lab_name'),
                report_date=parsed.get('report_date'),
                patient_name=parsed.get('patient_name'),
                extracted_values=extracted_values,
                raw_text=response_text
            )
            
        except json.JSONDecodeError as e:
            return OCRResult(success=False, error=f"Failed to parse extracted data: {str(e)}", extracted_values=[])
        except Exception as e:
            return OCRResult(success=False, error=str(e), extracted_values=[])
    
    # ============================================
    # LLM - Biomarker Explanations
    # ============================================
    
    async def explain_biomarker(self, marker_name: str, value: float, unit: str, status: str, 
                                 reference_range: str = None, trend: str = None) -> ExplanationResult:
        """
        Generate a plain-language explanation of a biomarker result.
        """
        try:
            prompt = f"""You are a health educator (NOT a doctor). Explain this lab result in simple terms.

Lab Result:
- Test: {marker_name}
- Value: {value} {unit}
- Status: {status}
{f'- Reference Range: {reference_range}' if reference_range else ''}
{f'- Recent Trend: {trend}' if trend else ''}

Provide a JSON response with this structure:
{{
    "plain_explanation": "2-3 sentence explanation a non-medical person can understand",
    "what_it_measures": "One sentence about what this test measures",
    "why_it_matters": "Why this marker is important for health",
    "factors_that_affect": ["factor1", "factor2", "factor3"],
    "questions_for_doctor": ["question1", "question2"]
}}

Rules:
1. Use simple, non-technical language
2. NEVER diagnose or suggest specific treatments
3. NEVER say "you have X disease"
4. Always encourage discussing with a doctor
5. Be factual and reassuring but honest
6. Focus on lifestyle factors that commonly influence this marker
7. Return ONLY valid JSON"""

            contents = [{"parts": [{"text": prompt}]}]
            
            response = await self._call_gemini(
                GEMINI_TEXT_MODEL,
                contents,
                {"temperature": 0.3, "maxOutputTokens": 1024}
            )
            
            response_text = response['candidates'][0]['content']['parts'][0]['text']
            
            # Clean up JSON
            json_match = re.search(r'```json\s*(.*?)\s*```', response_text, re.DOTALL)
            if json_match:
                response_text = json_match.group(1)
            else:
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    response_text = json_match.group(0)
            
            parsed = json.loads(response_text)
            
            return ExplanationResult(
                success=True,
                marker_name=marker_name,
                plain_explanation=parsed.get('plain_explanation'),
                what_it_measures=parsed.get('what_it_measures'),
                why_it_matters=parsed.get('why_it_matters'),
                factors_that_affect=parsed.get('factors_that_affect', []),
                questions_for_doctor=parsed.get('questions_for_doctor', [])
            )
            
        except Exception as e:
            return ExplanationResult(success=False, marker_name=marker_name, error=str(e))
    
    # ============================================
    # LLM - Health Insights & Patterns
    # ============================================
    
    async def generate_insights(self, observations: List[Dict], conditions: List[str] = None,
                                 medications: List[str] = None) -> InsightResult:
        """
        Generate AI-powered insights from a collection of lab results.
        """
        try:
            # Format observations for the prompt
            obs_text = "\n".join([
                f"- {o['name']}: {o['value']} {o['unit']} ({o['status']})"
                for o in observations
            ])
            
            conditions_text = ", ".join(conditions) if conditions else "None reported"
            medications_text = ", ".join(medications) if medications else "None reported"
            
            prompt = f"""You are a health educator analyzing lab results. Generate insights for the user.

Lab Results:
{obs_text}

Known Conditions: {conditions_text}
Current Medications: {medications_text}

Provide a JSON response:
{{
    "summary": "2-3 sentence overall summary of the lab profile",
    "patterns": [
        {{
            "name": "Pattern name (e.g., 'Metabolic Health')",
            "status": "good/attention/concern",
            "description": "Brief description of what you noticed",
            "related_markers": ["marker1", "marker2"]
        }}
    ],
    "recommendations": [
        "General recommendation 1 (always include 'discuss with your doctor')",
        "General recommendation 2"
    ],
    "lifestyle_suggestions": [
        "Lifestyle factor that commonly affects these markers",
        "Another lifestyle suggestion"
    ]
}}

Rules:
1. NEVER diagnose diseases
2. NEVER recommend specific medications or dosages
3. Always suggest discussing with a healthcare provider
4. Focus on patterns and general wellness
5. Be encouraging but honest
6. Limit to 3-4 patterns, 3-4 recommendations, 3-4 lifestyle suggestions
7. Return ONLY valid JSON"""

            contents = [{"parts": [{"text": prompt}]}]
            
            response = await self._call_gemini(
                GEMINI_TEXT_MODEL,
                contents,
                {"temperature": 0.4, "maxOutputTokens": 2048}
            )
            
            response_text = response['candidates'][0]['content']['parts'][0]['text']
            
            # Clean up JSON
            json_match = re.search(r'```json\s*(.*?)\s*```', response_text, re.DOTALL)
            if json_match:
                response_text = json_match.group(1)
            else:
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    response_text = json_match.group(0)
            
            parsed = json.loads(response_text)
            
            return InsightResult(
                success=True,
                summary=parsed.get('summary'),
                patterns=parsed.get('patterns', []),
                recommendations=parsed.get('recommendations', []),
                lifestyle_suggestions=parsed.get('lifestyle_suggestions', [])
            )
            
        except Exception as e:
            return InsightResult(success=False, error=str(e))
    
    # ============================================
    # LLM - Smart Visit Prep Questions
    # ============================================
    
    async def generate_visit_questions(self, flagged_markers: List[Dict], 
                                        recent_changes: List[Dict],
                                        conditions: List[str] = None) -> List[str]:
        """
        Generate smart, personalized questions for a doctor visit.
        """
        try:
            flagged_text = "\n".join([
                f"- {m['name']}: {m['value']} {m['unit']} ({m['status']})"
                for m in flagged_markers
            ]) or "None"
            
            changes_text = "\n".join([
                f"- {c['name']}: {c['direction']} by {c['change']}%"
                for c in recent_changes
            ]) or "None"
            
            conditions_text = ", ".join(conditions) if conditions else "None"
            
            prompt = f"""Generate 5 specific questions a patient should ask their doctor based on these lab results.

Flagged Markers (outside normal range):
{flagged_text}

Significant Changes:
{changes_text}

Known Conditions: {conditions_text}

Return a JSON array of exactly 5 questions:
["Question 1?", "Question 2?", "Question 3?", "Question 4?", "Question 5?"]

Rules:
1. Questions should be specific to the actual results shown
2. Questions should help the patient understand their results
3. Questions should explore potential causes and next steps
4. Questions should be respectful and appropriate for a medical setting
5. Return ONLY the JSON array, no other text"""

            contents = [{"parts": [{"text": prompt}]}]
            
            response = await self._call_gemini(
                GEMINI_TEXT_MODEL,
                contents,
                {"temperature": 0.5, "maxOutputTokens": 512}
            )
            
            response_text = response['candidates'][0]['content']['parts'][0]['text']
            
            # Clean up JSON
            json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
            if json_match:
                response_text = json_match.group(0)
            
            questions = json.loads(response_text)
            return questions[:5]
            
        except Exception as e:
            # Return default questions on error
            return [
                "What do my current results indicate about my overall health?",
                "Are there any concerning trends I should be aware of?",
                "What lifestyle changes would you recommend based on these results?",
                "When should I retest these markers?",
                "Are my current medications affecting any of these results?"
            ]
    
    # ============================================
    # Test Timing Optimizer
    # ============================================
    
    async def optimize_test_timing(self, marker_history: List[Dict]) -> Dict:
        """
        Analyze marker history and recommend optimal retest intervals.
        Uses variance analysis to determine if more or less frequent testing is needed.
        """
        try:
            history_text = "\n".join([
                f"- {h['name']}: {len(h['values'])} tests, variance: {h.get('variance', 'unknown')}, "
                f"last value: {h['values'][-1] if h['values'] else 'N/A'}, status: {h.get('status', 'unknown')}"
                for h in marker_history
            ])
            
            prompt = f"""Analyze this test history and recommend optimal retest intervals.

Test History:
{history_text}

Return a JSON object:
{{
    "recommendations": [
        {{
            "marker": "Marker name",
            "current_frequency": "How often they've been testing",
            "recommended_frequency": "3 months / 6 months / 12 months / as needed",
            "reasoning": "Brief explanation",
            "priority": "high/medium/low"
        }}
    ],
    "general_advice": "Overall advice about testing frequency",
    "next_test_date": "Suggested date for next comprehensive panel (YYYY-MM-DD)"
}}

Rules:
1. Stable markers within normal range need less frequent testing
2. Markers with high variance or abnormal values need more frequent testing
3. Consider cost-effectiveness
4. Always recommend at least annual testing for key markers
5. Return ONLY valid JSON"""

            contents = [{"parts": [{"text": prompt}]}]
            
            response = await self._call_gemini(
                GEMINI_TEXT_MODEL,
                contents,
                {"temperature": 0.3, "maxOutputTokens": 1024}
            )
            
            response_text = response['candidates'][0]['content']['parts'][0]['text']
            
            json_match = re.search(r'```json\s*(.*?)\s*```', response_text, re.DOTALL)
            if json_match:
                response_text = json_match.group(1)
            else:
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    response_text = json_match.group(0)
            
            return json.loads(response_text)
            
        except Exception as e:
            return {"error": str(e)}


# ============================================
# Singleton Instance
# ============================================

_gemini_service = None

def get_gemini_service() -> GeminiService:
    """Get or create the Gemini service singleton"""
    global _gemini_service
    if _gemini_service is None:
        _gemini_service = GeminiService()
    return _gemini_service
