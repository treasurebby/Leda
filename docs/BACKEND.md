# Leda Backend

FastAPI service under `backend/`. Everything the frontend previously simulated now has a real API: accounts and
teams, catalog and retailer imports, WhatsApp intake, the Sabi decoding engine, order review, Paystack
reconciliation and an append-only ledger.

## Architecture

```
app/
  main.py            app factory, CORS, /healthz
  core/              config (pydantic-settings), async DB session, security (argon2 + JWT), tenant/role deps
  models/            SQLAlchemy 2.0 models, one file per aggregate
  schemas/           Pydantic request/response models (money is always a 2-dp string)
  api/v1/            one router per domain
  services/          business logic, no FastAPI imports (imports, orders, ledger, reconcile, decode, team, auth)
  integrations/      external providers behind Protocols, each with a Fake: email, storage, paystack,
                     whatsapp, whisper, claude
  jobs/              background work run via BackgroundTasks: import_job, decode_job
alembic/             migrations (uv run alembic upgrade head)
scripts/             dev.sh (uvicorn --reload), seed.py (demo data)
tests/               pytest; SQLite by default, Postgres with TEST_DATABASE_URL
```

Every tenant table carries `business_id`; `current_tenant` resolves the caller's membership from the JWT and
`require("<permission>")` gates writes by role (`owner`, `admin`, `ops`, `sales`, `accountant`, `warehouse`,
`viewer`; see `PERMISSIONS` in `app/core/deps.py`).

## Domain flow

1. **Onboarding** – `POST /auth/register` creates user + business + owner membership. `PATCH /business/bridge`
   stores the WhatsApp choice. `POST /products/import` and `POST /retailers/import` accept CSV/XLSX, validate with
   the same rules as the browser (`services/imports.py` mirrors `frontend/src/onboarding/imports.ts`) and run as a
   job polled at `GET /import-jobs/{id}`. `POST /team/invites` emails a link; the invitee sets their own password
   at `POST /team/invites/{token}/accept`. Passwords never appear in invites, drafts or exports.
2. **Intake** – Meta's Cloud API posts to `POST /webhooks/whatsapp` (signature verified). Each message is logged
   in `whatsapp_messages` (unique `wa_message_id`, so redelivery is a no-op) and handed to `jobs/decode_job.py`.
3. **Sabi pipeline** (`services/decode.py`) – original signals are stored as `evidence` rows and never edited.
   Voice notes go through Whisper (`integrations/whisper.py`); the transcript is stored as its own evidence row.
   Claude (`integrations/claude.py`, `claude-opus-5`, structured output `DecodedOrder`, adaptive thinking, cached
   system prompt + catalog, server-side refusal fallbacks) returns lines with per-line confidence and explicit
   flags. Lines under 85 are marked `check`; an order with any flag or `check` line is `needs_review`.
4. **Review** – the War Room reads `GET /orders/{id}` (lines, evidence with media URLs, flags), edits lines with
   `PATCH /orders/{id}/lines`, toggles a badge with `POST /orders/{id}/lines/{line}/review`, resolves flags with
   `POST /flags/{id}/resolve {option_index}` (applies the chosen quantity/product), or asks the retailer over
   WhatsApp. `POST /orders/{id}/confirm` posts an invoice to the ledger, reserves stock and sends the confirmation.
5. **Money** – `POST /retailers/{id}/virtual-account` creates a Paystack dedicated virtual account.
   `POST /webhooks/paystack` (HMAC-SHA512) records each credit once per reference; it auto-matches when the
   amount equals a single pending order for that retailer or the narration names the order, otherwise the payment
   waits in `review` for `POST /payments/{id}/match`. Matching posts a payment entry and marks the order paid;
   unmatching posts a reversing adjustment. `GET /ledger` returns running balances, `GET /ledger/export.csv`
   downloads them.
6. **Dashboard** – `GET /dashboard/summary` feeds the three KPI tiles; `GET /notifications` the bell.

Dev-only (`APP_ENV=dev`): `POST /dev/simulate/whatsapp` (text, audio or image upload) and
`POST /dev/simulate/paystack-credit` drive the pipeline without Meta or Paystack accounts.

## Configuration (`backend/.env`)

| Variable | Purpose |
| --- | --- |
| `APP_ENV` | `dev` mounts `/docs` and `/dev/*`; `prod` disables them and marks cookies `Secure` |
| `SECRET_KEY` | JWT signing key (32+ random bytes) |
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@host/db` |
| `CORS_ORIGINS` | comma-separated frontend origins |
| `PUBLIC_APP_URL` | used in invitation links (`<url>/#/join/<token>`) |
| `RESEND_API_KEY`, `EMAIL_FROM` | invitations; empty = logged, not sent |
| `S3_BUCKET`, `S3_ENDPOINT_URL`, `S3_REGION`, `AWS_*` | evidence storage; empty = `backend/media/` on disk |
| `PAYSTACK_SECRET_KEY` | DVA creation + webhook signature; empty = fake provider |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | Cloud API; empty = fake |
| `OPENAI_API_KEY`, `WHISPER_MODEL` | voice transcription; empty = fake transcriber |
| `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` | decoding; empty = deterministic fake decoder |

## Provider setup

- **Paystack**: create a business account, enable Dedicated Virtual Accounts, add the secret key, and point the
  webhook at `https://<api>/api/v1/webhooks/paystack`.
- **Meta WhatsApp Cloud API**: create a Meta app with the WhatsApp product, add the phone number id and permanent
  token, set the webhook callback to `https://<api>/api/v1/webhooks/whatsapp` with your `WHATSAPP_VERIFY_TOKEN`,
  subscribe to `messages`, and copy the app secret for signature checks.
- **OpenAI**: any key with access to `whisper-1`.
- **Anthropic**: any key; the decoder enables `fallbacks: "default"` so a safety refusal is retried server-side on
  Anthropic's recommended fallback model. Remove `betas`/`fallbacks` in `integrations/claude.py` to opt out.
- **Resend**: verify the sending domain and add the key.

## Invariants worth protecting

- Money is `NUMERIC(18,2)`; the API serialises it as a string. Never floats.
- `ledger_entries` is append-only. Corrections are new rows (`adjustment`), never updates.
- `payments` is unique on `(provider, provider_reference)`; a replayed webhook changes nothing.
- `evidence` rows are never modified after creation; the transcript is separate from the structured lines.
- Passwords exist only in the register/login/accept request bodies and as argon2 hashes.

## Running the tests

```bash
cd backend
uv run pytest                                   # 28 tests on in-memory SQLite (fast)
TEST_DATABASE_URL=postgresql+asyncpg://leda:leda@localhost/leda_test uv run pytest   # same suite on Postgres
ANTHROPIC_API_KEY=... uv run pytest -m live     # opt-in: real Claude reads the bundled order slip
```
