# Leda

Leda is an operations platform for Nigerian wholesale distributors. It turns messy order inputs (WhatsApp text, voice notes, and photos) into structured orders, routes uncertain lines into review, reconciles incoming payments, and records every money movement in an append-only ledger.

## What the product does

Leda covers the full order-to-cash flow:

1. **Onboard a business**: create the owner account, capture business setup, import products and retailers, and invite team members.
2. **Ingest order signals**: accept WhatsApp messages and media from retailers.
3. **Decode and verify**: transcribe voice notes, extract order lines, score confidence, and flag ambiguous items.
4. **Review in War Room**: confirm or correct lines against evidence, resolve flags, then confirm the order.
5. **Reconcile money**: ingest Paystack credits, auto-match or manually match payments, and keep balances accurate.
6. **Track with ledger + dashboard**: expose receivables, activity, notifications, and CSV exports.

In development mode, provider integrations fall back to local fakes so you can run the product offline.

## Repository structure

```text
frontend/   React + Vite UI (landing, onboarding, command center, war room)
backend/    FastAPI + SQLAlchemy + Alembic API and domain logic
docs/       Product and engineering deep-dives
```

## Key backend domains

- **Auth & team**: JWT auth, role-based permissions, invites, password reset.
- **Catalog & retailers**: imports, catalog drafts, product requests, virtual account setup.
- **Orders & flags**: decoded lines, evidence, review actions, order confirmation.
- **Payments & ledger**: webhook ingestion, match/unmatch, immutable journal entries.
- **Integrations**: Paystack, WhatsApp, Whisper, Claude, email, object storage (all with fakes).

## Run locally

Requirements:

- Node.js 20+
- Python 3.12+
- [uv](https://docs.astral.sh/uv/)
- PostgreSQL 16+

```bash
# 1) Create local database (once)
sudo -u postgres psql -c "CREATE USER leda WITH PASSWORD 'leda';" -c "CREATE DATABASE leda OWNER leda;"

# 2) Start backend
cd backend
cp .env.example .env
uv sync
uv run alembic upgrade head
uv run scripts/seed.py          # optional demo data
uv run scripts/dev.sh           # http://localhost:8000

# 3) Start frontend
cd ../frontend
npm install
npm run dev                     # http://localhost:5173
```

Then open:

- `#/welcome` for the landing/demo page
- `#/onboarding` for business setup
- `#/login` to sign in

## Validation

```bash
cd backend
uv run ruff check .
uv run pytest
TEST_DATABASE_URL=******localhost/leda_test uv run pytest

cd ../frontend
npm run typecheck
npm run build
```

## Documentation map

- `/docs/BACKEND.md` — API architecture, domain flow, config, providers, invariants.
- `/docs/ONBOARDING.md` — full onboarding flow, imports, drafts, and security boundaries.
- `/docs/DASHBOARD.md` — command center behavior and data expectations.
- `/docs/ORDER_DETAIL.md` — war room/evidence review experience.
- `/docs/WORKSPACES.md` — orders, inventory, retailers, payments, and ledger workspace behavior.
