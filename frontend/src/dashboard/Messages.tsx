import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Check, MessageSquare, Phone, RefreshCw, Send, Sparkles } from "lucide-react";
import { api } from "../api/client";
import { normalisePhone } from "../onboarding/model";

/**
 * Messages: the WhatsApp conversation as the distributor sees it.
 * Left: one thread per retailer number. Right: what they sent, what Sabi did, what Leda replied,
 * and a box to answer by hand. Live data from GET /whatsapp/messages, refreshed every 8 seconds.
 */

type Message = {
  id: string; direction: "in" | "out"; wa_message_id: string; from_number: string; sender_name: string | null;
  kind: string; text: string | null; received_at: string; outcome: string; error: string | null;
  order_id: string | null; order_number: string | null; order_status: string | null; reply_text: string | null;
};
type Business = { name: string; whatsapp_number: string | null; auto_reply: boolean };

const OUTCOME: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "muted" }> = {
  order: { label: "Order created", tone: "ok" },
  "question-answered": { label: "Answered Sabi's question", tone: "ok" },
  "catalog-or-inquiry": { label: "Inquiry / catalog", tone: "muted" },
  error: { label: "Could not process", tone: "bad" },
  sent: { label: "Sent", tone: "muted" },
};

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" });

export default function Messages({ query }: { query: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [numberDraft, setNumberDraft] = useState("");
  const [busy, setBusy] = useState<"send" | "number" | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const [msgs, biz] = await Promise.all([api.get<Message[]>("/whatsapp/messages?limit=200"), api.get<Business>("/business")]);
      setMessages(msgs);
      setBusiness(biz);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load messages.");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, 8000);
    return () => window.clearInterval(timer);
  }, []);

  const threads = useMemo(() => {
    const byNumber = new Map<string, Message[]>();
    for (const m of messages) {
      const list = byNumber.get(m.from_number) ?? [];
      list.push(m);
      byNumber.set(m.from_number, list);
    }
    const q = query.trim().toLowerCase();
    return [...byNumber.entries()]
      .map(([number, list]) => {
        const sorted = [...list].sort((a, b) => a.received_at.localeCompare(b.received_at));
        const name = sorted.find(m => m.sender_name)?.sender_name ?? null;
        return { number, name, messages: sorted, last: sorted[sorted.length - 1], errors: sorted.filter(m => m.outcome === "error").length };
      })
      .filter(t => !q || t.number.includes(q) || (t.name ?? "").toLowerCase().includes(q) || t.messages.some(m => (m.text ?? "").toLowerCase().includes(q)))
      .sort((a, b) => b.last.received_at.localeCompare(a.last.received_at));
  }, [messages, query]);

  const thread = threads.find(t => t.number === selected) ?? threads[0] ?? null;

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [thread?.messages.length, thread?.number]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!thread || !draft.trim()) return;
    setBusy("send");
    try {
      await api.post("/whatsapp/messages/send", { to: thread.number, text: draft.trim() });
      setDraft("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that message.");
    } finally {
      setBusy(null);
    }
  }

  async function saveNumber(event: FormEvent) {
    event.preventDefault();
    const value = normalisePhone(numberDraft) ?? (numberDraft.trim().startsWith("+") ? numberDraft.replace(/[\s()-]/g, "") : "");
    if (!value) { setError("Enter the number in international format, e.g. +15551787628 or 0803 123 4567."); return; }
    setBusy("number");
    try {
      const biz = await api.patch<Business>("/business", { whatsapp_number: value });
      setBusiness(biz);
      setNumberDraft("");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the number.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="msg-page">
      <div className="msg-connect dash-card">
        <div className="msg-connect-copy">
          <span className="dash-avatar" aria-hidden="true"><Phone size={16} /></span>
          <div>
            <strong>{business?.whatsapp_number ? `Retailers message ${business.whatsapp_number}` : "No WhatsApp number connected yet"}</strong>
            <span>{business?.whatsapp_number ? `Messages to this number route to ${business.name}. Auto-reply is ${business.auto_reply ? "on" : "off"}.` : "Enter the number Meta gave you (the test number, or your business line) so incoming messages reach this workspace."}</span>
          </div>
        </div>
        <form className="msg-connect-form" onSubmit={saveNumber}>
          <input className="dash-input" placeholder={business?.whatsapp_number ? "Change number" : "+1 555 178 7628"} value={numberDraft} onChange={e => setNumberDraft(e.target.value)} aria-label="WhatsApp number retailers message" />
          <button type="submit" className="dash-button-secondary" disabled={busy === "number" || !numberDraft.trim()}>{business?.whatsapp_number ? "Update" : "Connect"}</button>
        </form>
      </div>

      {error && <p className="msg-error" role="alert"><AlertTriangle size={14} />{error}</p>}

      <div className="msg-layout dash-card">
        <aside className="msg-threads">
          <div className="msg-threads-head"><h3>Conversations</h3><button type="button" className="dash-icon-button" onClick={() => void load()} aria-label="Refresh"><RefreshCw size={14} /></button></div>
          {!loaded ? <p className="msg-empty">Loading…</p> : threads.length === 0 ? (
            <p className="msg-empty">No messages yet. When a retailer writes to your number, the conversation appears here with Sabi's reply.</p>
          ) : threads.map(t => (
            <button key={t.number} type="button" className={`msg-thread${thread?.number === t.number ? " is-active" : ""}`} onClick={() => setSelected(t.number)}>
              <span className="dash-avatar" aria-hidden="true">{(t.name ?? t.number.slice(-2)).slice(0, 2).toUpperCase()}</span>
              <span className="msg-thread-copy">
                <strong>{t.name ?? t.number}</strong>
                <span>{t.last.direction === "out" ? "Leda: " : ""}{(t.last.text ?? `[${t.last.kind}]`).slice(0, 48)}</span>
              </span>
              <span className="msg-thread-meta">{time(t.last.received_at)}{t.errors > 0 && <em title={`${t.errors} could not be processed`}><AlertTriangle size={12} /></em>}</span>
            </button>
          ))}
        </aside>

        <section className="msg-conversation" aria-live="polite">
          {thread ? (
            <>
              <header className="msg-conversation-head">
                <div><h3>{thread.name ?? thread.number}</h3><p>{thread.name ? thread.number : "Not yet a named retailer"}</p></div>
              </header>
              <div className="msg-bubbles">
                {thread.messages.map((m, i) => {
                  const prev = thread.messages[i - 1];
                  const showDay = !prev || day(prev.received_at) !== day(m.received_at);
                  const badge = OUTCOME[m.outcome];
                  return (
                    <div key={m.id}>
                      {showDay && <p className="msg-day">{day(m.received_at)}</p>}
                      <article className={`msg-bubble msg-bubble-${m.direction}`}>
                        {m.direction === "out" && <span className="msg-who"><Sparkles size={11} />Leda</span>}
                        {m.kind === "audio" && <span className="msg-kind">🎙 Voice note</span>}
                        {m.kind === "image" && <span className="msg-kind">📷 Photo</span>}
                        {m.text && <p>{m.text}</p>}
                        <footer>
                          <time>{time(m.received_at)}</time>
                          {m.direction === "in" && badge && m.outcome !== "catalog-or-inquiry" && <span className={`msg-outcome msg-outcome-${badge.tone}`}>{badge.tone === "ok" ? <Check size={11} /> : badge.tone === "bad" ? <AlertTriangle size={11} /> : null}{badge.label}</span>}
                          {m.order_number && <a className="msg-order" href={`#/order/${m.order_number}`}>{m.order_number} · {m.order_status?.replace("_", " ")}</a>}
                        </footer>
                        {m.error && <p className="msg-bubble-error">{m.error}</p>}
                      </article>
                    </div>
                  );
                })}
                <div ref={bottom} />
              </div>
              <form className="msg-compose" onSubmit={send}>
                <input className="dash-input" placeholder={`Reply to ${thread.name ?? thread.number}…`} value={draft} onChange={e => setDraft(e.target.value)} aria-label="Reply" />
                <button type="submit" className="dash-button-primary" disabled={busy === "send" || !draft.trim()}><Send size={15} />Send</button>
              </form>
            </>
          ) : (
            <div className="msg-empty msg-empty-large"><MessageSquare size={28} strokeWidth={1.5} /><p>Pick a conversation to read it.</p></div>
          )}
        </section>
      </div>
    </div>
  );
}
