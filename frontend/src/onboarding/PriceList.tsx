import { useRef, useState } from "react";
import { Camera, Check, ClipboardPaste, Loader2, Mic, Sparkles, X } from "lucide-react";
import { ApiError } from "../api/client";
import { applyCatalogDraft, discardCatalogDraft, extractPriceListFile, extractPriceListText, type CatalogDraft, type CatalogItem } from "../api/onboarding";

/**
 * "Paste or snap your price list": the no-spreadsheet way into the catalog.
 * Sabi extracts products from pasted text, a photo of the price board or a voice note; the owner
 * reviews and edits the rows, then adds them in one click.
 */
export default function PriceList({ onApplied, onError }: { onApplied: (items: CatalogItem[], source: string) => void; onError: (message: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"extract" | "apply" | null>(null);
  const [draft, setDraft] = useState<CatalogDraft | null>(null);
  const [rows, setRows] = useState<CatalogItem[]>([]);
  const [source, setSource] = useState("pasted price list");
  const fileInput = useRef<HTMLInputElement>(null);

  async function run(work: () => Promise<CatalogDraft>, label: string) {
    setBusy("extract");
    onError("");
    try {
      const result = await work();
      setDraft(result);
      setRows(result.items.map(item => ({ ...item, price: item.price === null ? "" : String(item.price) })));
      setSource(label);
    } catch (error) {
      onError(error instanceof ApiError ? error.message : "We couldn't read that. Try pasting the list as text.");
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    if (!draft) return;
    const ready = rows.filter(r => r.name.trim() && r.price !== "" && r.price !== null);
    if (!ready.length) { onError("Add a price to at least one product, or remove the rows you don't want."); return; }
    setBusy("apply");
    try {
      const result = await applyCatalogDraft(draft.id, ready.map(r => ({ ...r, price: String(r.price) })));
      onApplied(result.items, source);
      setDraft(null);
      setRows([]);
      setText("");
    } catch (error) {
      onError(error instanceof ApiError ? error.message : "We couldn't save those products. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    if (draft) void discardCatalogDraft(draft.id).catch(() => undefined);
    setDraft(null);
    setRows([]);
  }

  function update(index: number, key: keyof CatalogItem, value: string) {
    setRows(current => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  if (draft) {
    const unpriced = rows.filter(r => r.price === "" || r.price === null).length;
    return (
      <div className="import-preview">
        <div className="import-preview-header">
          <div><p><Sparkles size={16} />Sabi found {rows.length} {rows.length === 1 ? "product" : "products"}</p><span>{source}{unpriced ? ` · ${unpriced} without a price` : ""}</span></div>
          <button type="button" className="setup-icon-button" onClick={discard} aria-label="Discard extracted products"><X size={17} /></button>
        </div>
        <div className="setup-table-scroll">
          <table className="setup-table price-list-table">
            <thead><tr><th>Product</th><th>Pack size</th><th className="number-cell">Price (NGN)</th><th aria-label="Remove" /></tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={row.confidence !== undefined && row.confidence < 70 ? "price-list-check" : undefined}>
                  <td><input className="setup-input setup-input-compact" value={row.name} onChange={e => update(i, "name", e.target.value)} aria-label={`Product ${i + 1} name`} /></td>
                  <td><input className="setup-input setup-input-compact" value={row.unit ?? ""} placeholder="e.g. Bag 50kg" onChange={e => update(i, "unit", e.target.value)} aria-label={`Product ${i + 1} pack size`} /></td>
                  <td className="number-cell"><input className="setup-input setup-input-compact number-cell" inputMode="decimal" value={row.price ?? ""} placeholder="Price" onChange={e => update(i, "price", e.target.value.replace(/[^\d.]/g, ""))} aria-label={`Product ${i + 1} price`} /></td>
                  <td><button type="button" className="setup-icon-button" onClick={() => setRows(current => current.filter((_, j) => j !== i))} aria-label={`Remove ${row.name || "row"}`}><X size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="preview-note">Fix anything Sabi got wrong, add missing prices, then add them to your catalog. Rows without a price are left out.</p>
        <div className="price-list-actions">
          <button type="button" className="setup-button setup-button-primary" disabled={busy === "apply"} onClick={apply}>{busy === "apply" ? <Loader2 size={16} className="spin" /> : <Check size={16} />}Add {rows.length} to my catalog</button>
          <button type="button" className="setup-subtle-button" onClick={discard}>Start over</button>
        </div>
      </div>
    );
  }

  return (
    <div className="price-list-panel">
      <p className="price-list-heading"><Sparkles size={15} />No spreadsheet? Send Sabi your price list.</p>
      <textarea
        className="setup-input price-list-textarea"
        rows={5}
        placeholder={"Paste the price list you already send retailers, e.g.\nRoyal Stallion 50kg - 78,500\nMama Gold 50kg - 77,200\nKings Oil 25L - 96,500"}
        value={text}
        onChange={e => setText(e.target.value)}
        disabled={!!busy}
        aria-label="Paste your price list"
      />
      <div className="price-list-actions">
        <button type="button" className="setup-button setup-button-secondary" disabled={!!busy || text.trim().length < 3} onClick={() => run(() => extractPriceListText(text), "pasted price list")}>
          {busy === "extract" ? <Loader2 size={16} className="spin" /> : <ClipboardPaste size={16} />}Read this list
        </button>
        <button type="button" className="setup-subtle-button" disabled={!!busy} onClick={() => fileInput.current?.click()}><Camera size={15} />Snap the price board</button>
        <button type="button" className="setup-subtle-button" disabled={!!busy} onClick={() => fileInput.current?.click()}><Mic size={15} />Voice note</button>
        <input ref={fileInput} type="file" accept="image/*,audio/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void run(() => extractPriceListFile(f), f.name); e.target.value = ""; }} />
      </div>
      <p className="price-list-hint">Or forward your price list to your Leda WhatsApp number any time — Sabi will ask you to confirm before adding anything.</p>
    </div>
  );
}
