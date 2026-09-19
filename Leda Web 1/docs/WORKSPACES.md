# Leda Core Workspaces

The Command Center sidebar now opens five functional local workspace sections.
Each uses the same dark forest sidebar, sticky search header and responsive table
system as the dashboard. Search (`Cmd/Ctrl + K`) changes context with the active
section and filters its relevant records.

## Orders

- Status tabs: All orders, Paid, Pending, Processing and Needs review.
- Order rows show channel, retailer, amount, owner and status.
- Each order ID and Review action opens the War Room at `#/order/<id>`.
- New order presents an honest local-draft notice; connecting a real order-creation
  form/API is required before it can persist a sale.

## Inventory

- Catalog table shows SKU, product, pack size, available stock, reserved units,
  reorder level, current sell-side value and stock signal.
- Low Stock filters products at or below the reorder threshold.
- Restock and Add stock buttons mutate local available stock immediately, recalculate
  catalog value and clear warning states where applicable.
- Product persistence and catalog import need a production inventory API.

## Retailers

- Directory shows market, order count, terms, last order, current balance and tier.
- Selecting a retailer opens a relationship snapshot side panel.
- Add retailer opens a small local form and inserts the new retailer into the table
  for this session. A real flow must collect validated contact, credit and virtual
  account data through the backend.

## Payments

- Matched, Review and Pending tabs make reconciliation status explicit.
- Match now resolves a review or pending item in the local UI and updates its ledger
  action label.
- A payment provider, virtual-account webhooks and server-side reconciliation are
  required before any amount can be treated as a real payment.

## Ledger

- **Global Ledger** is now a debt-control view rather than a generic activity log.
  It shows total business debt, total ordered, total paid and collection rate at
  the top, followed by a high-density retailer table.
- Table columns are Retailer Name, Total Ordered, Total Paid, Outstanding Balance
  (red) and a working local Send Payment Reminder action. Local search, due-today,
  high-risk and reminded filters keep collections focused.
- Export Debt List creates a local CSV of current seeded balances and reminder
  state. Real reminders require an approved WhatsApp or email provider and a
  server-side audit trail.
- A production ledger still needs immutable server-side journal entries, user/audit
  IDs, bank-event idempotency and accounting approval rules.

## SKU Mapping

- Two-column mapping table: Official SKU and Aliases/Street Names.
- Existing aliases can be removed; Add New Alias opens an inline save form for a
  local name such as "Blue Peak" or "red cap oil".
- Search reaches official names, SKU codes, pack sizes and aliases. This is how
  Sabi learns the distributor's local market vocabulary.
- New aliases are local preview data until connected to a catalog and AI-mapping
  backend.

## Demo Boundary

These sections are interactive frontend data. Refreshing restores the seed data;
no changes are saved to a server. Amounts are illustrative. Before launch, replace
the constants in `src/dashboard/Workspaces.tsx` with authenticated APIs and keep
the current local feedback only as optimistic UI after server confirmation.