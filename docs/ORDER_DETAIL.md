# Order Detail: The War Room

Order Detail is available at `#/order/LE-1041`. Any recent order or AI flag in
the Command Center links into the same review experience, with the selected order
number reflected in the header.

## Evidence Pane

The left pane keeps every original signal in one place:

- A working simulated 42-second WhatsApp voice-note player: Play/Pause, scrub
  control, active waveform and accessible elapsed-time label.
- A visual evidence gallery with a generated handwritten wholesale order slip and
  the original product photo. The selected image can be zoomed with buttons or
  the mouse wheel, reset, and panned by dragging at a zoom level above 100%.
- A raw, editable speech transcription. It starts deliberately close to the
  retailer's Pidgin message before product matching. The copy button works where
  clipboard access is allowed.

The evidence source is never rewritten when the structured table changes.

## Structured Order Pane

The right pane is an editable line-item table with Product, Quantity, Unit,
Price and Total. It begins with Royal Stallion Rice, Mama Gold Rice and Kings
Vegetable Oil. Quantity and price changes recalculate each line and the total
immediately; rows can be added or deleted.

Every row has the requested confidence badge:

- **Sure** is green and starts at 98% or 96% for evidence Sabi matched clearly.
- **Check** is amber for the ambiguous oil row at 71%.

Clicking a badge deliberately toggles its review state: an amber row can be
marked manually verified after comparing it to the evidence, and a green row can
be returned to review. This updates the header and send hint in real time.

## Confirmation

The sticky footer contains the primary **Send Confirmation to Retailer** action.
It opens a review dialog with retailer, delivery, unit count, total and any items
still marked for confirmation. Choosing **Prepare confirmation** updates the page
to a success state.

The interaction is deliberately labeled as a preview: no WhatsApp message is
actually sent without a connected provider. The final delivery integration should
send this reviewed payload from a secure backend, persist the audit trail, and
replace the preview disclosure only when delivery status is available.

## Responsive Behavior

Desktop uses a full split screen so evidence and structured data remain side by
side. Below 860px, evidence appears first and the structured order follows,
preserving the same controls. The table remains horizontally scrollable to avoid
hiding editable values, and the confirmation footer remains sticky.