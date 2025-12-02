# HealthCanvas Deployment Guide

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│    Netlify      │────▶│     Render      │────▶│      Neon       │
│   (Frontend)    │     │    (Backend)    │     │   (Database)    │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
     React/Vite          FastAPI/Python         PostgreSQL
```

---

## Step 1: Database (Neon) ✅ DONE

Your Neon database is already set up with all tables.

**Connection String Format:**
```
postgresql://neondb_owner:PASSWORD@ep-dry-violet-a1any456-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

---

## Step 2: Backend (Render)

### 2.1 Create a GitHub Repository

1. Create a new repo called `healthcanvas-backend`
2. Upload ONLY the `backend/` folder contents to this repo:
   ```
   healthcanvas-backend/
   ├── api/
   │   ├── __init__.py
   │   ├── main.py
   │   └── services/
   │       ├── __init__.py
   │       ├── gemini_service.py
   │       └── pdf_service.py
   ├── database/
   │   └── schema.sql
   ├── requirements.txt
   ├── Dockerfile
   └── render.yaml
   ```

### 2.2 Deploy on Render

1. Go to [render.com](https://render.com) and sign up/login
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repo
4. Configure:
   - **Name:** `healthcanvas-api`
   - **Region:** Singapore (closest to Neon)
   - **Branch:** `main`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn api.main:app --host 0.0.0.0 --port $PORT`

### 2.3 Set Environment Variables in Render

Go to **Environment** tab and add:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | `postgresql://neondb_owner:YOUR_PASSWORD@ep-dry-violet-a1any456-pooler.ap-southeast-1.aws.neon.tech/neondb` |
| `JWT_SECRET` | Your 32+ character secret |
| `GEMINI_API_KEY` | Your Gemini API key |
| `CORS_ORIGINS` | `https://YOUR-SITE.netlify.app,http://localhost:3000` |

⚠️ **Important:** Remove `?sslmode=require` from the DATABASE_URL - the code handles SSL automatically.

### 2.4 Deploy

Click **"Create Web Service"** and wait for deployment.

Your API will be available at: `https://healthcanvas-api.onrender.com`

---

## Step 3: Frontend (Netlify)

### 3.1 Create a GitHub Repository

1. Create a new repo called `healthcanvas-frontend`
2. Upload the `frontend/` folder contents:
   ```
   healthcanvas-frontend/
   ├── src/
   │   ├── main.jsx
   │   └── HealthCanvas.jsx
   ├── index.html
   ├── package.json
   ├── vite.config.js
   └── netlify.toml
   ```

### 3.2 Deploy on Netlify

1. Go to [netlify.com](https://netlify.com) and sign up/login
2. Click **"Add new site"** → **"Import an existing project"**
3. Connect your GitHub repo
4. Configure:
   - **Branch:** `main`
   - **Build command:** `npm install && npm run build`
   - **Publish directory:** `dist`

### 3.3 Set Environment Variables in Netlify

Go to **Site settings** → **Environment variables** and add:

| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://healthcanvas-api.onrender.com` |

⚠️ **Note:** Use your actual Render URL from Step 2.

### 3.4 Trigger Redeploy

After adding environment variables, go to **Deploys** and click **"Trigger deploy"** → **"Deploy site"**

---

## Step 4: Update CORS

After both are deployed, go back to Render and update `CORS_ORIGINS` with your actual Netlify URL:

```
https://your-site-name.netlify.app,http://localhost:3000
```

---

## Testing

1. Open your Netlify URL
2. Register a new account
3. Add some test lab results
4. Verify data persists after refresh

---

## Troubleshooting

### "Failed to fetch" errors
- Check CORS_ORIGINS in Render includes your Netlify URL
- Check browser console for specific error messages

### Database connection errors
- Verify DATABASE_URL is correct (no typos)
- Make sure you removed `?sslmode=require` from the URL

### 500 errors on API
- Check Render logs for error details
- Verify all environment variables are set

### Gemini/AI features not working
- Verify GEMINI_API_KEY is set in Render
- Check Render logs for API errors

---

## URLs Reference

| Service | URL |
|---------|-----|
| Frontend | `https://YOUR-SITE.netlify.app` |
| Backend API | `https://healthcanvas-api.onrender.com` |
| API Docs | `https://healthcanvas-api.onrender.com/docs` |
| Neon Console | `https://console.neon.tech` |

---

## Local Development

If you want to run locally:

```bash
# Backend
cd backend
pip install -r requirements.txt
export DATABASE_URL="your-neon-url"
export JWT_SECRET="your-secret"
export GEMINI_API_KEY="your-key"
uvicorn api.main:app --reload

# Frontend (separate terminal)
cd frontend
npm install
export VITE_API_URL="http://localhost:8000"
npm run dev
```
