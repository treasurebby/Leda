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

- Running debit, credit and balance activity table tied to order references.
- Period selector and CSV export. Export creates a local browser download with all
  visible ledger seed records.
- A production ledger needs immutable server-side journal entries, user/audit IDs,
  bank-event idempotency and accounting approval rules.

## Demo Boundary

These sections are interactive frontend data. Refreshing restores the seed data;
no changes are saved to a server. Amounts are illustrative. Before launch, replace
the constants in `src/dashboard/Workspaces.tsx` with authenticated APIs and keep
the current local feedback only as optimistic UI after server confirmation.