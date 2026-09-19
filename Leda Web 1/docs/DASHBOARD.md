# Command Center (Main Dashboard)

The dashboard is the app's default view at the empty hash (`index.html`). The
landing page with the decode demo stays at `#/welcome` and onboarding at
`#/onboarding`.

## Layout

- **Sidebar** (fixed, dark forest gradient): brand, business switcher (verified
  workspace), grouped navigation (Workspace, Money, Business), a live Sabi Engine
  status card, and the signed-in owner with sign out. On screens up to 1024px it
  becomes an off-canvas drawer with a scrim, Escape to close, and auto-close when
  the viewport widens.
- **Header** (sticky, blurred cream): page title with active workspace, search
  field that live-filters the table and the flag queue, notification bell with an
  unread badge and dropdown, and the profile menu. `Cmd/Ctrl + K` focuses search.
- **Main content**: greeting row with date and workspace, plus "Review flags" and
  "New order" actions, each wired to real destinations rather than dead clicks.

## KPI Row

| Tile | Accent | Notes |
| --- | --- | --- |
| Total Orders Today | Gold `#B45309` | 38 orders, +18.75% versus yesterday, animated gold sparkline |
| Pending Verifications | Amber `#DA8300` | starts at 9 and decreases as flags are cleared, shows AI flag / transfer / duplicate breakdown |
| Total Receivables | Forest `#065F46` | ₦12,480,000 outstanding of ₦28,620,000 invoiced, animated collected bar |

All three values animate with a tween from their previous value, so resolving a
flag updates the tile smoothly instead of restarting from zero.

## Recent Activity

Last five orders with order ID and time, retailer and market, channel (voice
note, text, photo), amount in mono, and a Paid or Pending status badge with a
detail line (transfer matched, cash collected, proof received). Rows are filtered
by the header search, animate in and out, and the footer shows the reconciled
total.

## Attention Required

Three flagged orders with the Sabi reasoning attached:

1. Voice note ambiguity, "like fifty, make e remain small" (54% confidence).
2. Low photo match, 62% between Royal Stallion and Mama Gold.
3. Shared slang, "the yellow one" matching two 25L oils (71% confidence).

Each flag expands to show the quoted message, why it was flagged, candidate
options, and two actions: **Confirm & clear flag** (disabled until a value is
chosen, then moves the order to a resolved list with Undo) and **Ask retailer**
(records that a WhatsApp question was sent). Clearing flags decrements the
Pending Verifications tile and the Payments badge, and an all-clear state appears
when the queue empties.

Each order ID, plus an **Open war room** action in a flagged order, opens
`#/order/LE-1041` style Order Detail for side-by-side evidence review.

## Workspace Sections

Five core sidebar destinations are now functional local workspace views:

- **Orders**: status filters, searchable order table and direct War Room links.
- **Inventory**: sellable stock, reserved quantities, low-stock filter and local
  restock controls.
- **Retailers**: directory, relationship snapshot panel and a local add-retailer
  form.
- **Payments**: matched, review and pending transaction tabs with manual matching.
- **Ledger**: running account activity, period selection and CSV export.

Team and Settings remain clearly marked preview panels because they need live
permissions and workspace APIs before they can be safely activated.

## Data and Limits

All figures are illustrative demo data held in `src/dashboard/Dashboard.tsx`.
Nothing here is persisted or fetched; refresh restores the original queue. Wiring
this to real order, payment and verification APIs is the next step before launch,
and the Sabi confidence scores should come from the decoding service rather than
constants.
