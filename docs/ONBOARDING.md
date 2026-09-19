# Leda Onboarding

The main app opens the five-step onboarding. It is also available at
`#/onboarding`. The existing landing page and animated decode example are
preserved at `#/welcome`; its navigation and hero Sign Up buttons open onboarding.

## Flow

1. Identity: full name, Nigerian mobile number, email, password, business name,
   searchable industry selection, and a manual Other option.
2. The Bridge: use an existing WhatsApp number or choose a Leda Virtual Number.
3. The Brain: import an Excel (.xlsx) or CSV product catalog, download a template,
   try sample data, or skip.
4. The Money: import retailers with an animated processing sequence, preview
   account references, download a template, try sample data, or skip.
5. The Team: invite staff by email with a role; each invitee sets their own
   password from the emailed link. Invitations can be withdrawn before acceptance.

Completion presents an editable setup summary and a JSON download. The progress
navigation allows returning to visited steps. Product and retailer imports remain
available when navigating back. Editing an earlier step does not clear other data.

## Import Formats

- Product columns: Product name and Price are required. SKU and Stock are optional.
- Retailer columns: Retailer name is required, plus Email or Phone.
- Common alternatives such as Product, Item name, Unit price, Quantity, Business
  name, Email address and Mobile are also recognized.
- Up to 5 MB and 5,000 records per import. The first worksheet is read for Excel.
- Import errors include missing columns, bad numeric values, missing contacts and
  duplicate identifiers. The original file is processed in the browser, not uploaded.
- Downloadable templates contain clearly labelled example rows to replace with
  real data. Sample imports are labelled in the UI.

CSV parsing uses Papa Parse. Excel parsing uses `readSheet(file, 1)` from
`read-excel-file/browser`. Downloads escape spreadsheet formulas.

## Drafts and Passwords

Saving is explicit through Save and exit. A draft is stored in this browser's
localStorage with a seven-day expiry and removed on the next visit after expiry.
Returning requires re-entering the owner password, which signs in to the account
created in step 1 before resuming the saved step.

Passwords never enter localStorage, setup downloads, logs or drafts. The owner
password is sent once to `POST /auth/register` (or `/auth/login` when resuming)
over HTTPS and stored as an argon2 hash. Staff never receive a password from the
owner: each invitation is an emailed link (`#/join/<token>`) where the invitee
chooses their own.

## Live Service Boundary

Steps 1, 3, 4 and 5 are live against the backend (see `docs/BACKEND.md`):
the owner account and business are created, product and retailer files are
validated and imported server-side (the browser validation is a fast pre-check
with the same rules), and team invitations are sent by email.

Two parts still depend on external providers being configured:

- The Bridge (step 2) stores the choice. A Leda Virtual Number is provisioned
  only once the WhatsApp Cloud API credentials are set.
- Retailer virtual accounts are created per retailer from the Retailers page via
  Paystack; until a Paystack key is configured a fake provider issues test
  account numbers.

## Implementation

- `src/onboarding/Onboarding.tsx`: flow state, transitions, API calls and completion.
- `src/onboarding/Steps.tsx`: the five screens and import progress.
- `src/onboarding/Fields.tsx`: accessible fields and keyboard-searchable industries.
- `src/onboarding/model.ts`: shared types, validation and industry/role data.
- `src/onboarding/imports.ts`: spreadsheet pre-validation and templates (mirrored by `backend/app/services/imports.py`).
- `src/onboarding/draft.ts`: explicit draft storage and password-free exports.
- `src/api/`: fetch client, generated OpenAPI types (`npm run gen:api`), auth and onboarding helpers.
- `src/auth/`: the sign-in (`#/login`) and invitation (`#/join/<token>`) pages.

Keyboard users can search industries with arrow keys and Enter, go back to completed
steps, reveal passwords and operate native focus-trapped help/save dialogs. The
flow respects reduced-motion preferences.
