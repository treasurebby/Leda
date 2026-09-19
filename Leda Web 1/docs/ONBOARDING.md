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
5. The Team: prepare staff contacts, temporary passwords and roles, add or remove
   team members, and edit assigned roles.

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
Returning requires re-entering the owner password before resuming the saved step.

Passwords never enter localStorage, setup downloads, logs or network requests.
Owner and unsubmitted staff passwords only exist in React state. Staff passwords
are discarded after adding a member in the preview. Drafts include added team
members, not an unsubmitted staff form.

## Live Service Boundary

This is an interactive frontend preview, not a production account provisioning
system. CSV/Excel parsing, validation, templates, local drafts and summary exports
work. No authentication account, WhatsApp number, bank account or staff invitation
is created by completing the flow. Account references use `PREVIEW 0001` rather
than plausible bank account numbers and cannot receive payments.

Before production, connect a secure backend for owner authentication, business
verification, WhatsApp number provisioning, retailer virtual accounts and staff
invitations. Passwords must be sent over HTTPS to an authentication provider,
never added to drafts or summary exports. Validate role permissions and imports
again on the server. The preview disclosures must only be removed once those
services are actually connected.

## Implementation

- `src/onboarding/Onboarding.tsx`: flow state, transitions, navigation and completion.
- `src/onboarding/Steps.tsx`: the five screens and import progress.
- `src/onboarding/Fields.tsx`: accessible fields and keyboard-searchable industries.
- `src/onboarding/model.ts`: shared types, validation and industry/role data.
- `src/onboarding/imports.ts`: spreadsheet parsing, validation and templates.
- `src/onboarding/draft.ts`: explicit draft storage and password-free exports.
- `src/onboarding/onboarding.css`: responsive visual system.

Keyboard users can search industries with arrow keys and Enter, go back to completed
steps, reveal passwords and operate native focus-trapped help/save dialogs. The
flow respects reduced-motion preferences.