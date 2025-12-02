# HealthCanvas

**Your body's biography, data-driven.**

A comprehensive personal health tracking platform that centralizes and visualizes your medical data: labs, diagnoses, medications, and vitals.

![Health Score Dashboard](https://via.placeholder.com/800x400?text=HealthCanvas+Dashboard)

---

## Features

### ✅ Implemented

| Feature | Description |
|---------|-------------|
| **50+ Biomarkers** | Comprehensive database with reference ranges, optimal zones, and educational descriptions |
| **Health Score** | Multi-domain scoring (Metabolic, Cardiovascular, Kidney, Liver, Thyroid, etc.) |
| **Trend Analysis** | Historical charts with direction indicators and percentage changes |
| **Pattern Detection** | Automated alerts for metabolic syndrome, anemia, thyroid issues, kidney function |
| **Visit Preparation** | Auto-generated doctor questions, flagged markers, export packets |
| **Medications Tracker** | Add, toggle, delete with dosage and frequency |
| **Conditions Tracker** | Diagnoses with status (active/managed/resolved) |
| **Allergies Tracker** | With severity levels (mild/moderate/severe) |
| **Vaccinations Tracker** | With due date reminders |
| **Procedures Tracker** | Surgeries, imaging, biopsies |
| **Health Goals** | Target values with progress tracking |
| **Lifestyle Journal** | Sleep, energy, mood, exercise logging |
| **Timeline View** | Chronological combined events |
| **Share Links** | Generate shareable summaries for doctors |
| **Data Persistence** | PostgreSQL backend with full CRUD |
| **Authentication** | JWT-based auth with refresh tokens |

### 🚧 Coming Soon

- OCR document parsing for lab reports
- Apple Health / Google Fit integration
- AI-powered explanations
- Family health graph
- Test timing optimizer

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   React Frontend (Vite)                      │
│              Calm Clinical Design System                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend                           │
│              JWT Auth + REST Endpoints                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                PostgreSQL 16 + JSONB                         │
│              FHIR-Aligned Data Model                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local frontend development)
- Python 3.11+ (for local backend development)

### Option 1: Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/yourusername/healthcanvas.git
cd healthcanvas

# Copy environment file
cp .env.example .env

# Edit .env with your settings (especially JWT_SECRET and DB_PASSWORD)
nano .env

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

Access:
- Frontend: http://localhost:3000
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- pgAdmin (optional): http://localhost:5050

### Option 2: Local Development

**Backend:**

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL=postgresql://localhost:5432/healthcanvas
export JWT_SECRET=your-dev-secret

# Run database migrations
psql -U postgres -d healthcanvas -f database/schema.sql

# Start API server
cd api
uvicorn main:app --reload
```

**Frontend:**

```bash
cd frontend

# Install dependencies
npm install

# Set API URL
echo "VITE_API_URL=http://localhost:8000" > .env

# Start dev server
npm run dev
```

---

## API Documentation

### Authentication

```bash
# Register
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "securepassword"}'

# Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "securepassword"}'

# Response: { "access_token": "...", "refresh_token": "..." }
```

### Observations (Lab Results)

```bash
# Get all observations
curl http://localhost:8000/api/observations \
  -H "Authorization: Bearer YOUR_TOKEN"

# Create observation
curl -X POST http://localhost:8000/api/observations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "biomarker_id": "glucose",
    "value": 95,
    "effective_date": "2025-03-25",
    "lab_name": "Quest Diagnostics"
  }'

# Update observation
curl -X PUT http://localhost:8000/api/observations/UUID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value": 92}'

# Delete observation
curl -X DELETE http://localhost:8000/api/observations/UUID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Dashboard

```bash
curl http://localhost:8000/api/dashboard \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Full API documentation available at `/docs` (Swagger UI).

---

## Database Schema

The database uses a FHIR-aligned schema:

| Table | FHIR Resource | Description |
|-------|---------------|-------------|
| `users` | Patient | User accounts and profiles |
| `observations` | Observation | Lab results and measurements |
| `diagnostic_reports` | DiagnosticReport | Uploaded lab reports |
| `medications` | MedicationStatement | Current and past medications |
| `conditions` | Condition | Diagnoses and health conditions |
| `procedures` | Procedure | Surgeries, imaging, biopsies |
| `allergies` | AllergyIntolerance | Allergies and adverse reactions |
| `vaccinations` | Immunization | Vaccine records |
| `health_goals` | Goal | Target values and progress |
| `journal_entries` | - | Lifestyle logging |

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | Secret key for JWT tokens | Required |
| `JWT_EXPIRATION_HOURS` | Access token lifetime | 24 |
| `REFRESH_TOKEN_DAYS` | Refresh token lifetime | 30 |
| `CORS_ORIGINS` | Allowed frontend origins | localhost |

### Security Considerations

1. **Change JWT_SECRET in production** - Use a cryptographically secure random string
2. **Use HTTPS** - All production traffic should be encrypted
3. **Database encryption** - Enable SSL for PostgreSQL connections
4. **Rate limiting** - Consider adding rate limiting for auth endpoints
5. **Input validation** - All inputs are validated via Pydantic models

---

## Design System: Calm Clinical

The UI follows healthcare best practices:

| Element | Specification |
|---------|---------------|
| Background | #FAFBFC (light gray-blue) |
| Cards | #FFFFFF with soft shadows |
| Primary | #0EA5E9 (calming blue) |
| Optimal | #10B981 (soft green) |
| Attention | #F59E0B (amber) |
| Critical | #EF4444 (coral red) |
| Typography | System fonts, 500-600 weight |
| Borders | 1px, #E2E8F0 |
| Radius | 8-12px |

---

## Project Structure

```
healthcanvas/
├── backend/
│   ├── api/
│   │   └── main.py          # FastAPI application
│   ├── database/
│   │   └── schema.sql       # PostgreSQL schema
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   └── HealthCanvas.jsx # Main React component
│   ├── Dockerfile.dev
│   └── package.json
├── docker-compose.yml
├── .env.example
├── AUDIT_REPORT.md          # Feature audit document
└── README.md
```

---

## Disclaimer

⚠️ **This application is for informational purposes only.** It does not provide medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider for medical decisions.

---

## License

MIT License - See LICENSE file for details.

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Support

- 📧 Email: support@healthcanvas.app
- 📖 Documentation: https://docs.healthcanvas.app
- 🐛 Issues: https://github.com/yourusername/healthcanvas/issues
