"""
HealthCanvas - PDF Generation Service
Generates professional PDF reports for visit summaries and health exports
"""

import io
from datetime import datetime
from typing import List, Dict, Optional
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, HRFlowable
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT


class PDFService:
    """Service for generating PDF reports"""
    
    def __init__(self):
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()
    
    def _setup_custom_styles(self):
        """Setup custom paragraph styles"""
        self.styles.add(ParagraphStyle(
            name='Title',
            parent=self.styles['Heading1'],
            fontSize=24,
            spaceAfter=30,
            textColor=colors.HexColor('#0EA5E9'),
            alignment=TA_CENTER
        ))
        
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=self.styles['Heading2'],
            fontSize=14,
            spaceBefore=20,
            spaceAfter=10,
            textColor=colors.HexColor('#1E293B'),
            borderColor=colors.HexColor('#E2E8F0'),
            borderWidth=1,
            borderPadding=5
        ))
        
        self.styles.add(ParagraphStyle(
            name='SubHeader',
            parent=self.styles['Heading3'],
            fontSize=12,
            spaceBefore=15,
            spaceAfter=8,
            textColor=colors.HexColor('#64748B')
        ))
        
        self.styles.add(ParagraphStyle(
            name='BodyText',
            parent=self.styles['Normal'],
            fontSize=10,
            spaceAfter=8,
            textColor=colors.HexColor('#1E293B')
        ))
        
        self.styles.add(ParagraphStyle(
            name='SmallText',
            parent=self.styles['Normal'],
            fontSize=8,
            textColor=colors.HexColor('#94A3B8')
        ))
        
        self.styles.add(ParagraphStyle(
            name='Warning',
            parent=self.styles['Normal'],
            fontSize=9,
            textColor=colors.HexColor('#F59E0B'),
            backColor=colors.HexColor('#FEF3C7'),
            borderColor=colors.HexColor('#F59E0B'),
            borderWidth=1,
            borderPadding=8,
            spaceBefore=10,
            spaceAfter=10
        ))
        
        self.styles.add(ParagraphStyle(
            name='Critical',
            parent=self.styles['Normal'],
            fontSize=10,
            textColor=colors.HexColor('#EF4444'),
            fontName='Helvetica-Bold'
        ))
        
        self.styles.add(ParagraphStyle(
            name='Optimal',
            parent=self.styles['Normal'],
            fontSize=10,
            textColor=colors.HexColor('#10B981')
        ))
    
    def _get_status_color(self, status: str) -> colors.Color:
        """Get color for status"""
        status_colors = {
            'optimal': colors.HexColor('#10B981'),
            'normal': colors.HexColor('#3B82F6'),
            'attention': colors.HexColor('#F59E0B'),
            'critical': colors.HexColor('#EF4444')
        }
        return status_colors.get(status, colors.HexColor('#64748B'))
    
    def generate_visit_summary(
        self,
        patient_name: str,
        report_date: datetime,
        flagged_markers: List[Dict],
        significant_changes: List[Dict],
        medications: List[Dict],
        conditions: List[Dict],
        allergies: List[Dict],
        questions: List[str],
        health_scores: Dict = None,
        ai_insights: Dict = None
    ) -> bytes:
        """
        Generate a comprehensive visit summary PDF.
        
        Returns PDF as bytes.
        """
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=20*mm,
            leftMargin=20*mm,
            topMargin=20*mm,
            bottomMargin=20*mm
        )
        
        story = []
        
        # Header
        story.append(Paragraph("HealthCanvas", self.styles['Title']))
        story.append(Paragraph("Visit Preparation Summary", self.styles['Heading2']))
        story.append(Spacer(1, 10))
        
        # Patient Info
        info_data = [
            ['Patient:', patient_name or 'Not specified'],
            ['Report Date:', report_date.strftime('%B %d, %Y')],
            ['Generated:', datetime.now().strftime('%B %d, %Y at %I:%M %p')]
        ]
        info_table = Table(info_data, colWidths=[80, 300])
        info_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#64748B')),
            ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor('#1E293B')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(info_table)
        story.append(Spacer(1, 15))
        
        # Horizontal line
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0')))
        story.append(Spacer(1, 15))
        
        # Health Scores (if available)
        if health_scores:
            story.append(Paragraph("Health Overview", self.styles['SectionHeader']))
            overall = health_scores.get('overall', 'N/A')
            story.append(Paragraph(f"Overall Health Score: <b>{overall}</b>", self.styles['BodyText']))
            
            if health_scores.get('categories'):
                score_data = [['Category', 'Score', 'Status']]
                for cat in health_scores['categories']:
                    score_data.append([
                        cat['name'],
                        str(cat['score']),
                        cat.get('status', 'N/A')
                    ])
                
                score_table = Table(score_data, colWidths=[150, 80, 100])
                score_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F1F5F9')),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), 9),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('PADDING', (0, 0), (-1, -1), 6),
                ]))
                story.append(score_table)
            story.append(Spacer(1, 15))
        
        # Flagged Markers
        if flagged_markers:
            story.append(Paragraph("⚠️ Flagged Markers", self.styles['SectionHeader']))
            story.append(Paragraph(
                "The following markers are outside the normal reference range and should be discussed with your healthcare provider.",
                self.styles['SmallText']
            ))
            story.append(Spacer(1, 8))
            
            marker_data = [['Marker', 'Value', 'Unit', 'Status']]
            for m in flagged_markers:
                marker_data.append([
                    m.get('name', 'Unknown'),
                    str(m.get('value', 'N/A')),
                    m.get('unit', ''),
                    m.get('status', 'N/A').upper()
                ])
            
            marker_table = Table(marker_data, colWidths=[150, 80, 60, 80])
            marker_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#FEE2E2')),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('PADDING', (0, 0), (-1, -1), 6),
                ('TEXTCOLOR', (3, 1), (3, -1), colors.HexColor('#EF4444')),
            ]))
            story.append(marker_table)
            story.append(Spacer(1, 15))
        
        # Significant Changes
        if significant_changes:
            story.append(Paragraph("📈 Significant Changes", self.styles['SectionHeader']))
            story.append(Paragraph(
                "These markers have changed by more than 15% since your last test.",
                self.styles['SmallText']
            ))
            story.append(Spacer(1, 8))
            
            for change in significant_changes:
                direction = "↑" if change.get('direction') == 'increased' else "↓"
                color = '#EF4444' if change.get('direction') == 'increased' else '#10B981'
                story.append(Paragraph(
                    f"• <b>{change.get('name', 'Unknown')}</b>: {direction} {abs(float(change.get('change', 0)))}%",
                    self.styles['BodyText']
                ))
            story.append(Spacer(1, 15))
        
        # Current Medications
        story.append(Paragraph("💊 Current Medications", self.styles['SectionHeader']))
        if medications:
            for med in medications:
                if med.get('active', True):
                    story.append(Paragraph(
                        f"• <b>{med.get('name', 'Unknown')}</b> - {med.get('dosage', 'N/A')} ({med.get('frequency', 'N/A')})",
                        self.styles['BodyText']
                    ))
        else:
            story.append(Paragraph("No medications reported", self.styles['SmallText']))
        story.append(Spacer(1, 15))
        
        # Conditions
        story.append(Paragraph("📋 Active Conditions", self.styles['SectionHeader']))
        if conditions:
            for cond in conditions:
                if cond.get('status') == 'active':
                    story.append(Paragraph(f"• {cond.get('name', 'Unknown')}", self.styles['BodyText']))
        else:
            story.append(Paragraph("No active conditions reported", self.styles['SmallText']))
        story.append(Spacer(1, 15))
        
        # Allergies
        story.append(Paragraph("⚠️ Allergies", self.styles['SectionHeader']))
        if allergies:
            for allergy in allergies:
                severity = allergy.get('severity', 'unknown')
                style = self.styles['Critical'] if severity == 'severe' else self.styles['BodyText']
                story.append(Paragraph(
                    f"• <b>{allergy.get('name', 'Unknown')}</b> ({severity})",
                    style
                ))
        else:
            story.append(Paragraph("No allergies reported", self.styles['SmallText']))
        story.append(Spacer(1, 15))
        
        # AI Insights (if available)
        if ai_insights and ai_insights.get('summary'):
            story.append(Paragraph("🤖 AI Health Insights", self.styles['SectionHeader']))
            story.append(Paragraph(ai_insights['summary'], self.styles['BodyText']))
            
            if ai_insights.get('lifestyle_suggestions'):
                story.append(Paragraph("Lifestyle Considerations:", self.styles['SubHeader']))
                for suggestion in ai_insights['lifestyle_suggestions']:
                    story.append(Paragraph(f"• {suggestion}", self.styles['BodyText']))
            story.append(Spacer(1, 15))
        
        # Questions for Doctor
        story.append(Paragraph("❓ Questions for Your Doctor", self.styles['SectionHeader']))
        if questions:
            for i, q in enumerate(questions, 1):
                story.append(Paragraph(f"{i}. {q}", self.styles['BodyText']))
        story.append(Spacer(1, 20))
        
        # Disclaimer
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0')))
        story.append(Spacer(1, 10))
        story.append(Paragraph(
            "<b>DISCLAIMER:</b> This report is for informational purposes only and does not constitute medical advice. "
            "Always consult with a qualified healthcare provider for diagnosis and treatment decisions. "
            "The AI-generated insights are educational and should not replace professional medical judgment.",
            self.styles['Warning']
        ))
        
        # Footer
        story.append(Spacer(1, 20))
        story.append(Paragraph(
            f"Generated by HealthCanvas • {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            self.styles['SmallText']
        ))
        
        # Build PDF
        doc.build(story)
        buffer.seek(0)
        return buffer.getvalue()
    
    def generate_lab_report_summary(
        self,
        patient_name: str,
        observations: List[Dict],
        report_date: datetime = None
    ) -> bytes:
        """
        Generate a summary of all lab results.
        """
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=20*mm,
            leftMargin=20*mm,
            topMargin=20*mm,
            bottomMargin=20*mm
        )
        
        story = []
        
        # Header
        story.append(Paragraph("HealthCanvas", self.styles['Title']))
        story.append(Paragraph("Lab Results Summary", self.styles['Heading2']))
        story.append(Spacer(1, 10))
        
        # Info
        story.append(Paragraph(f"Patient: {patient_name or 'Not specified'}", self.styles['BodyText']))
        story.append(Paragraph(f"Generated: {datetime.now().strftime('%B %d, %Y')}", self.styles['BodyText']))
        story.append(Spacer(1, 15))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0')))
        story.append(Spacer(1, 15))
        
        # Group by category
        categories = {}
        for obs in observations:
            cat = obs.get('category', 'Other')
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(obs)
        
        # Results table for each category
        for category, obs_list in categories.items():
            story.append(Paragraph(category, self.styles['SectionHeader']))
            
            table_data = [['Test', 'Value', 'Unit', 'Range', 'Status']]
            for obs in obs_list:
                table_data.append([
                    obs.get('name', 'Unknown'),
                    str(obs.get('value', 'N/A')),
                    obs.get('unit', ''),
                    obs.get('reference_range', 'N/A'),
                    obs.get('status', 'N/A')
                ])
            
            table = Table(table_data, colWidths=[120, 60, 50, 80, 60])
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F1F5F9')),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('PADDING', (0, 0), (-1, -1), 4),
            ]))
            story.append(table)
            story.append(Spacer(1, 15))
        
        # Disclaimer
        story.append(Paragraph(
            "<b>DISCLAIMER:</b> This report is for informational purposes only. "
            "Consult your healthcare provider for interpretation of results.",
            self.styles['Warning']
        ))
        
        doc.build(story)
        buffer.seek(0)
        return buffer.getvalue()


# Singleton instance
_pdf_service = None

def get_pdf_service() -> PDFService:
    """Get or create PDF service singleton"""
    global _pdf_service
    if _pdf_service is None:
        _pdf_service = PDFService()
    return _pdf_service
