import {
  useEffect, useMemo, useRef, useState,
  type ChangeEvent, type PointerEvent as ReactPointerEvent, type RefObject, type WheelEvent,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import orderSlip from "/images/warroom-order-slip.jpg";
import ricePhoto from "/images/chat-rice.jpg";
import {
  ArrowLeft, ArrowUpRight, BadgeCheck, Check, CheckCheck, ClipboardCheck, Copy,
  FileText, MessageSquare,
  Mic, Minus, Pause, Play, Plus, RotateCcw, Send, Sparkles, Store, Trash2,
  TriangleAlert, Volume2, X, ZoomIn, ZoomOut,
} from "lucide-react";
import "./order-detail.css";

type Confidence = "sure" | "check";
type OrderLine = {
  id: string;
  product: string;
  sku: string;
  quantity: number;
  unit: string;
  price: number;
  confidence: Confidence;
  score: number;
};

type Evidence = {
  id: string;
  name: string;
  count: string;
  src: string;
  alt: string;
  hint: string;
};

const AUDIO_LENGTH = 42;
const WAVEFORM = [0.22, 0.36, 0.65, 0.34, 0.53, 0.8, 0.95, 0.57, 0.4, 0.73, 0.9, 0.48, 0.29, 0.58, 0.84, 1, 0.68, 0.42, 0.62, 0.37, 0.82, 0.96, 0.56, 0.31, 0.64, 0.86, 0.52, 0.25, 0.71, 0.92, 0.6, 0.39, 0.58, 0.8, 0.44, 0.2, 0.5, 0.77, 0.96, 0.59, 0.37, 0.66, 0.89, 0.53, 0.34, 0.78, 0.95, 0.62, 0.28, 0.49, 0.83, 0.56, 0.35, 0.74, 0.91, 0.46, 0.25, 0.59, 0.86, 0.63];

const INITIAL_LINES: OrderLine[] = [
  { id: "line-rsr", product: "Royal Stallion Parboiled Rice", sku: "RSR-50", quantity: 40, unit: "Bag 50kg", price: 78500, confidence: "sure", score: 98 },
  { id: "line-mgr", product: "Mama Gold Premium Rice", sku: "MGR-50", quantity: 25, unit: "Bag 50kg", price: 77200, confidence: "sure", score: 96 },
  { id: "line-kvo", product: "Kings Vegetable Oil", sku: "KVO-25R", quantity: 15, unit: "Keg 25L", price: 96500, confidence: "check", score: 71 },
];

const EVIDENCE: Evidence[] = [
  {
    id: "slip",
    name: "Handwritten order slip",
    count: "1 of 2",
    src: orderSlip,
    alt: "Handwritten wholesale order slip on a wooden counter",
    hint: "Scroll to zoom. Drag to inspect.",
  },
  {
    id: "photo",
    name: "Product photo",
    count: "2 of 2",
    src: ricePhoto,
    alt: "Customer product photo of stacked rice bags",
    hint: "Scroll to zoom. Drag to inspect.",
  },
];

const RAW_TRANSCRIPT = `Good morning o. Abeg I wan restock before weekend.

Forty bags Stallion, the fifty kg. Twenty five Mama Gold. Same price as last week, abeg.

Add fifteen kegs of that red cap oil, the twenty five litre one. No send the yellow belle oh.

Driver go reach Friday morning. Keep am for the usual warehouse.`;

const formatMoney = (amount: number) => "\u20A6" + Math.round(amount || 0).toLocaleString("en-NG");
const formatTime = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}`;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function useClickAway(open: boolean, ref: RefObject<HTMLDialogElement | null>, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const element = ref.current;
    element?.showModal();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", close);
      if (element?.open) element.close();
    };
  }, [open, ref, onClose]);
}

function EvidenceAudio() {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setProgress(current => {
        const next = Math.min(AUDIO_LENGTH, current + 0.25);
        if (next >= AUDIO_LENGTH) window.setTimeout(() => setPlaying(false), 0);
        return next;
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, [playing]);

  function toggle() {
    if (progress >= AUDIO_LENGTH) setProgress(0);
    setPlaying(current => !current);
  }

  return (
    <section className={`order-audio${playing ? " order-audio-playing" : ""}`} aria-label="Voice note evidence">
      <div className="order-audio-head">
        <div className="order-audio-source">
          <span className="order-audio-source-icon"><Mic size={17} strokeWidth={1.75} /></span>
          <div><p>Voice note from Madam Kike</p><span>WhatsApp · received 09:03 · 42 seconds</span></div>
        </div>
        <span className="order-source-tag">Pidgin</span>
      </div>
      <div className="order-audio-controls">
        <button type="button" className="order-play" aria-label={playing ? "Pause voice note" : "Play voice note"} onClick={toggle}>
          {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" style={{ marginLeft: 2 }} />}
        </button>
        <div className="order-wave" aria-label={`Voice note progress ${formatTime(progress)} of ${formatTime(AUDIO_LENGTH)}`}>
          <div className="order-wave-bars" aria-hidden="true">
            {WAVEFORM.map((height, index) => <span key={index} className="order-wave-bar" style={{ height: `${Math.max(16, height * 100)}%` }} />)}
          </div>
          <div className="order-wave-progress" aria-hidden="true" style={{ width: `${(progress / AUDIO_LENGTH) * 100}%` }}>
            {WAVEFORM.map((height, index) => <span key={index} className="order-wave-bar" style={{ height: `${Math.max(16, height * 100)}%`, animationDelay: `${(index % 7) * .08}s` }} />)}
          </div>
          <input type="range" min="0" max={AUDIO_LENGTH} step="0.1" value={progress} onChange={event => { setProgress(Number(event.target.value)); setPlaying(false); }} aria-label="Seek voice note" />
        </div>
        <span className="order-audio-time">{formatTime(progress)} / {formatTime(AUDIO_LENGTH)}</span>
      </div>
      <p className="order-audio-caption"><Sparkles size={13} />Sabi identified three product lines, one delivery note and one uncertain phrase.</p>
    </section>
  );
}

function EvidenceViewer() {
  const [selected, setSelected] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const current = EVIDENCE[selected];

  function changeEvidence(next: number) {
    setSelected(next);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function setLevel(level: number) {
    const next = clamp(level, 1, 2.2);
    setZoom(next);
    if (next === 1) setPan({ x: 0, y: 0 });
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    setLevel(zoom + (event.deltaY < 0 ? 0.18 : -0.18));
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (zoom <= 1) return;
    drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const range = (zoom - 1) * 115;
    setPan({ x: clamp(drag.current.panX + event.clientX - drag.current.x, -range, range), y: clamp(drag.current.panY + event.clientY - drag.current.y, -range, range) });
  }

  function onPointerEnd() { drag.current = null; }

  return (
    <section className="order-evidence-block" aria-label="Image evidence gallery">
      <div className="order-evidence-label">
        <h3>Visual evidence</h3>
        <span>{current.count} · {Math.round(zoom * 100)}%</span>
      </div>
      <div className="order-image-viewer">
        <div className="order-image-canvas" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
          <img src={current.src} alt={current.alt} draggable={false} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} />
        </div>
        <div className="order-image-controls" aria-label="Image zoom controls">
          <button type="button" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setLevel(zoom - .25)}><ZoomOut size={16} /></button>
          <button type="button" aria-label="Reset zoom" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><RotateCcw size={15} /></button>
          <button type="button" aria-label="Zoom in" disabled={zoom >= 2.2} onClick={() => setLevel(zoom + .25)}><ZoomIn size={16} /></button>
        </div>
        <span className="order-image-hint">{current.hint}</span>
      </div>
      <div className="order-gallery" role="tablist" aria-label="Evidence images">
        {EVIDENCE.map((item, index) => (
          <button key={item.id} type="button" role="tab" aria-selected={selected === index} className={`order-thumb${selected === index ? " order-thumb-active" : ""}`} onClick={() => changeEvidence(index)}>
            <img src={item.src} alt="" />
            <span>{item.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Transcript() {
  const [text, setText] = useState(RAW_TRANSCRIPT);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="order-evidence-block" aria-label="Raw transcription">
      <div className="order-evidence-label"><h3>Raw transcription</h3><span>Editable source text</span></div>
      <div className="order-transcript-wrap">
        <textarea className="order-transcript" value={text} onChange={event => setText(event.target.value)} aria-label="Raw transcription from voice note" />
        <button type="button" className="order-transcript-copy" onClick={() => void copy()} aria-label={copied ? "Transcription copied" : "Copy transcription"}>{copied ? <Check size={16} /> : <Copy size={15} />}</button>
      </div>
      <p className="order-transcript-note">This is the source transcription, before product matching and cleanup. Edits here do not alter the original voice note.</p>
    </section>
  );
}

function SendDialog({ open, onClose, onSend, lines, total }: { open: boolean; onClose: () => void; onSend: () => void; lines: OrderLine[]; total: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useClickAway(open, dialog, onClose);
  const checks = lines.filter(line => line.confidence === "check").length;
  return (
    <dialog ref={dialog} className="order-send-dialog" aria-labelledby="send-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="order-send-dialog-content">
        <button type="button" className="order-dialog-close" aria-label="Close confirmation preview" onClick={onClose}><X size={17} /></button>
        <h2 id="send-title">Send order confirmation?</h2>
        <p>Review the summary that will be prepared for Madam Kike Stores.</p>
        <div className="order-send-preview">
          <p><strong>Order #LE-1041</strong> · {lines.reduce((count, line) => count + Math.max(0, line.quantity || 0), 0)} units · <strong>{formatMoney(total)}</strong></p>
          <p>Delivery: Friday, 8:00 AM · Warehouse 3, Trade Fair</p>
        </div>
        {checks > 0 && <p className="order-dialog-alert"><TriangleAlert size={14} />{checks} item{checks === 1 ? " is" : "s are"} still marked for confirmation. The retailer message will ask them to approve the item before fulfilment.</p>}
        <p className="order-dialog-disclosure">Preview only. The payload is prepared locally; connect a WhatsApp provider before messages can be delivered.</p>
        <div className="order-dialog-actions">
          <button type="button" className="order-dialog-cancel" onClick={onClose}>Keep reviewing</button>
          <button type="button" className="order-send order-dialog-confirm" onClick={onSend}><Send size={15} />Prepare confirmation</button>
        </div>
      </div>
    </dialog>
  );
}

export default function OrderDetail() {
  const [lines, setLines] = useState<OrderLine[]>(INITIAL_LINES);
  const [dirty, setDirty] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const reduce = useReducedMotion();

  const hashId = window.location.hash.split("/").pop()?.toUpperCase() || "LE-1041";
  const orderId = `#${hashId.replace(/^#/, "")}`;
  const total = useMemo(() => lines.reduce((sum, line) => sum + Math.max(0, line.quantity || 0) * Math.max(0, line.price || 0), 0), [lines]);
  const unverified = lines.filter(line => line.confidence === "check").length;

  function updateLine(id: string, key: keyof OrderLine, value: string) {
    setLines(current => current.map(line => {
      if (line.id !== id) return line;
      if (key === "quantity" || key === "price") return { ...line, [key]: Math.max(0, Number(value) || 0) };
      return { ...line, [key]: value };
    }));
    setDirty(true);
    setPrepared(false);
  }

  function toggleConfidence(id: string) {
    setLines(current => current.map(line => line.id === id ? { ...line, confidence: line.confidence === "sure" ? "check" : "sure", score: line.confidence === "sure" ? 71 : 100 } : line));
    setDirty(true);
    setPrepared(false);
  }

  function addLine() {
    setLines(current => [...current, { id: `line-${Date.now()}`, product: "New product", sku: "NEW-ITEM", quantity: 1, unit: "Piece", price: 0, confidence: "check", score: 0 }]);
    setDirty(true);
    setPrepared(false);
  }

  function removeLine(id: string) {
    if (lines.length <= 1) return;
    setLines(current => current.filter(line => line.id !== id));
    setDirty(true);
    setPrepared(false);
  }

  return (
    <div className="order-page">
      <header className="order-topbar">
        <a href="#/dashboard" className="order-back"><ArrowLeft size={16} /><span>Command Center</span></a>
        <div className="order-top-title"><h1>{orderId}</h1><p>Order detail · War Room</p></div>
        <div className="order-top-right"><span className="order-workspace"><Store size={15} />Okoro Wholesale Ltd</span><span className="order-avatar" aria-label="Ada Okoro">AO</span></div>
      </header>

      <section className="order-summary" aria-label="Order context">
        <div className="order-summary-retailer"><strong>Madam Kike Stores</strong><span>Trade Fair Complex, Lagos · reseller since 2019</span></div>
        <div className="order-summary-meta">
          <span><ClockIcon />Received 09:03 today</span>
          <span><MessageSquare size={13} />WhatsApp order</span>
          <span className="order-summary-status">{unverified ? `${unverified} item needs a check` : "All lines verified"}</span>
        </div>
      </section>

      <main className="order-workspace-grid">
        <section className="order-evidence-pane" aria-labelledby="evidence-title">
          <div className="order-pane-head">
            <div>
              <p className="order-pane-kicker"><FileText />The evidence</p>
              <h2 id="evidence-title">What the customer sent</h2>
              <p>Listen, inspect and compare the original message before you confirm the structured order.</p>
            </div>
            <span className="order-evidence-count">3 sources</span>
          </div>
          <EvidenceAudio />
          <EvidenceViewer />
          <Transcript />
        </section>

        <section className="order-structured-pane" aria-labelledby="structured-title">
          <div className="order-structured-head">
            <div className="order-pane-head">
              <div>
                <p className="order-pane-kicker"><ClipboardCheck />The structured order</p>
                <h2 id="structured-title">Ready for a human eye</h2>
                <p>Edit any value here. Yellow confidence means Sabi wants you to compare it with the evidence.</p>
              </div>
              <span className={`order-edit-status${dirty ? " order-edit-status-unsaved" : ""}`}>{dirty ? <><Minus size={12} />Draft changes</> : <><Check size={12} />Auto saved</>}</span>
            </div>
            <div className="order-retailer-strip"><span><Store size={13} />Madam Kike Stores</span><span><BadgeCheck size={13} />Gold tier</span><span><Volume2 size={13} />Preferred: WhatsApp</span></div>
          </div>

          <div className="order-structured-body">
            <div className="order-table-scroll">
              <table className="order-table">
                <thead><tr><th scope="col">Product</th><th scope="col">Quantity</th><th scope="col">Unit</th><th scope="col">Price</th><th scope="col">Total</th><th scope="col"><span className="sr-only">Row actions</span></th></tr></thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {lines.map(line => (
                      <motion.tr key={line.id} layout initial={{ opacity: 0, y: reduce ? 0 : 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: reduce ? 0 : .18 }}>
                        <td className="order-product-cell">
                          <input className="order-cell-input" aria-label={`Product for ${line.sku}`} value={line.product} onChange={(event: ChangeEvent<HTMLInputElement>) => updateLine(line.id, "product", event.target.value)} />
                          <span className="order-line-sku">{line.sku}</span>
                          <button type="button" className={`order-confidence order-confidence-${line.confidence === "sure" ? "sure" : "check"}`} onClick={() => toggleConfidence(line.id)} aria-label={`${line.confidence === "sure" ? "Mark as needing review" : "Mark as manually verified"} for ${line.product}`} title={line.confidence === "sure" ? "Confirmed from evidence. Click to mark for review." : "Needs a human check. Click after verifying."}>
                            {line.confidence === "sure" ? <Check size={10} /> : <TriangleAlert size={10} />} {line.confidence === "sure" ? "Sure" : "Check"} <small>{line.score}%</small>
                          </button>
                        </td>
                        <td><input className="order-cell-input order-cell-number" type="number" min="0" inputMode="numeric" aria-label={`Quantity for ${line.product}`} value={line.quantity} onChange={event => updateLine(line.id, "quantity", event.target.value)} /></td>
                        <td><select className="order-cell-input order-cell-select" aria-label={`Unit for ${line.product}`} value={line.unit} onChange={event => updateLine(line.id, "unit", event.target.value)}><option>Bag 50kg</option><option>Keg 25L</option><option>Carton</option><option>Piece</option><option>Pack</option><option>Case</option></select></td>
                        <td><input className="order-cell-input order-cell-price" type="number" min="0" inputMode="decimal" aria-label={`Unit price for ${line.product}`} value={line.price} onChange={event => updateLine(line.id, "price", event.target.value)} /></td>
                        <td><span className="order-line-total">{formatMoney(line.quantity * line.price)}</span></td>
                        <td><button type="button" className="order-row-delete" disabled={lines.length <= 1} aria-label={`Remove ${line.product}`} onClick={() => removeLine(line.id)}><Trash2 size={15} /></button></td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
            <button type="button" className="order-add-line" onClick={addLine}><Plus size={15} />Add another line</button>

            <div className="order-totals">
              <div className="order-totals-row"><span>Subtotal</span><strong>{formatMoney(total)}</strong></div>
              <div className="order-totals-row"><span>Delivery</span><strong>To be arranged</strong></div>
              <div className="order-totals-row order-totals-row-total"><span>Order total</span><strong>{formatMoney(total)}</strong></div>
            </div>
            <p className="order-payment-note"><strong>Payment terms:</strong> 7 days from delivery. Transfer instructions will be included in the retailer confirmation.</p>
          </div>

          <footer className="order-footer">
            {prepared ? (
              <div className="order-send-success" role="status"><CheckCheck size={17} /><span><strong>Confirmation prepared for Madam Kike Stores.</strong><br />This preview has not delivered a WhatsApp message. Connect a messaging provider to dispatch it.</span></div>
            ) : (
              <div className="order-footer-row">
                <button type="button" className="order-send" onClick={() => setSendOpen(true)}><Send size={17} />Send Confirmation to Retailer<ArrowUpRight size={15} /></button>
                <span className="order-footer-hint">{unverified ? `${unverified} line${unverified === 1 ? " needs" : "s need"} retailer confirmation` : "Every line is verified against the evidence"}</span>
              </div>
            )}
          </footer>
        </section>
      </main>
      <SendDialog open={sendOpen} onClose={() => setSendOpen(false)} lines={lines} total={total} onSend={() => { setPrepared(true); setDirty(false); setSendOpen(false); }} />
    </div>
  );
}

function ClockIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
}