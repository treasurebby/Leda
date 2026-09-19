# Leda

WhatsApp voice notes, blurry photos and market slang in; structured orders and a balanced ledger out, for
Nigeria's wholesale distributors.

```
frontend/   React 19 + Vite 7 + Tailwind 4 (landing page, onboarding, Command Center, War Room)
backend/    FastAPI + SQLAlchemy 2.0 (async) + Alembic on PostgreSQL
docs/       Product and engineering notes; start with docs/BACKEND.md
```

## Run it locally

Requirements: Node 20+, Python 3.12+, [uv](https://docs.astral.sh/uv/), PostgreSQL 16+ installed natively.

```bash
# 1. Database (once)
sudo -u postgres psql -c "CREATE USER leda WITH PASSWORD 'leda';" -c "CREATE DATABASE leda OWNER leda;"

# 2. Backend
cd backend
cp .env.example .env            # defaults match the database above
uv sync
uv run alembic upgrade head
uv run scripts/seed.py          # optional demo data: ada@leda.africa / "Leda demo 1"
uv run scripts/dev.sh           # http://localhost:8000  (docs at /docs)

# 3. Frontend
cd ../frontend
npm install
npm run dev                     # http://localhost:5173  (proxies /api to the backend)
```

Sign in at `#/login`, or create a business at `#/onboarding`. All third-party providers (Paystack, WhatsApp,
Whisper, Claude) fall back to local fakes until their keys are set, so the whole product runs offline.

## Checks

```bash
cd backend && uv run ruff check . && uv run pytest              # SQLite in-memory
TEST_DATABASE_URL=postgresql+asyncpg://leda:leda@localhost/leda_test uv run pytest   # same suite on Postgres
cd frontend && npm run typecheck && npm run build
```
