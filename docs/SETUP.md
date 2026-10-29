# ClinixVault Quick Setup Guide

Simple, direct commands to set up, run, and test ClinixVault locally or via Docker.

---

## 1. Local Development Setup (Recommended for Mac / Linux)

### A. Backend Setup
```bash
# 1. From clinixvault project root
cd /path/to/clinixvault

# 2. Create and activate a Python 3.11+ virtual environment
python3 -m venv venv
source venv/bin/activate

# 3. Install core dependencies
pip install -r backend/gateway/requirements.txt
# (Optional) For local inference engines:
pip install -r inference/requirements.txt

# 4. Start the API Gateway
python3 -m uvicorn backend.gateway.main:app --host 127.0.0.1 --port 8000 --reload
```
*API Gateway is live at: `http://127.0.0.1:8000` (Swagger docs: `http://127.0.0.1:8000/docs`)*

---

### B. Frontend Setup
```bash
# 1. In a new terminal tab, navigate to frontend
cd frontend

# 2. Install Node dependencies
npm install

# 3. Start Vite dev server
npm run dev
```
*ClinixVault UI is live at: `http://localhost:5173`*

---

## 2. Docker Compose (One-Command Full Edge Stack)

To run the complete air-gapped system (Gateway, PostgreSQL + pgvector, Nginx, Frontend, Microservices):

```bash
# Start all services in the background
docker compose up -d

# Check running container health
docker compose ps

# View live system logs
docker compose logs -f gateway

# Stop all services
docker compose down
```

---

## 3. Running Verification & Tests

```bash
# Run all Python unit and integration tests (88 test cases)
python3 -m pytest tests/unit tests/integration -v

# Type-check and build frontend for production
npm --prefix frontend run build
```

---

## 4. Default Ports & Service Matrix

| Service | Port | Endpoint / Description |
|---|---|---|
| **Frontend Workstation** | `5173` / `80` | `http://localhost:5173` (React UI) |
| **API Gateway** | `8000` | `http://127.0.0.1:8000` (`/docs`, `/api/v1/*`, `/metrics`) |
| **VLM Radiology Service** | `8001` | `http://127.0.0.1:8001/generate` |
| **LLM Summarizer Service** | `8002` | `http://127.0.0.1:8002/summarize` |
| **Audio Scribe Service** | `8003` | `ws://127.0.0.1:8003/stream` |
| **Document OCR Service** | `8004` | `http://127.0.0.1:8004/extract` |
| **SQLite (Edge Default)** | File | `backend/database/clinixvault_edge.db` (auto-loaded) |
| **PostgreSQL (Cloud)** | `5432` | `postgresql://clinix:clinix@localhost:5432/clinixvault` |
