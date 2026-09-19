import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowRight,
  AudioLines,
  Camera,
  Check,
  CheckCheck,
  Loader2,
  MessagesSquare,
  MoreVertical,
  Phone,
  Play,
  RotateCcw,
  Send,
  Truck,
  Video,
} from "lucide-react";
import { CountUp, SectionLabel, Waveform } from "./ui";
import { cn } from "../utils/cn";
import { IMAGES } from "../config/images";

const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* ------------------------------------------------------------------ data */
const ROWS = [
  {
    sku: "RSR-50",
    name: "Royal Stallion Parboiled Rice",
    pack: "50kg bag",
    qty: 40,
    price: 78500,
    appearAt: 2,
    photoVerifiedAt: 4,
  },
  {
    sku: "MGR-50",
    name: "Mama Gold Premium Rice",
    pack: "50kg bag",
    qty: 25,
    price: 77200,
    appearAt: 2,
  },
  {
    sku: "KVO-25R",
    name: "Kings Vegetable Oil \u00B7 Red Cap",
    pack: "25L keg",
    qty: 15,
    price: 96500,
    appearAt: 3,
  },
];
const TOTAL = 6517500;

const naira = (n: number) => "\u20A6" + n.toLocaleString("en-NG");

const BRIDGE_STATUS = [
  "Sabi Engine standing by",
  "Transcribing 42s of Pidgin voice note\u2026",
  "2 line items written to ledger",
  "Market slang matched \u2192 KVO-25R",
  "Verifying photos against your catalog",
  "Adding delivery note & totals\u2026",
  "Ledger cleared. Invoice ready.",
];

const TIMELINE = [500, 2100, 3500, 4900, 6300, 7700];

/* ------------------------------------------------------------------ chat bits */
function Bubble({
  side = "in",
  active = false,
  className,
  children,
}: {
  side?: "in" | "out";
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex", side === "out" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug shadow-[0_1px_1.5px_rgb(6,78,59,0.08)] transition-shadow duration-500",
          side === "in"
            ? "rounded-tl-md bg-white text-olive"
            : "rounded-tr-md bg-[#DFF0E6] text-olive",
          active && "shadow-[0_0_0_3px_rgba(217,119,6,0.45)]",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      transition={{ duration: 0.5, ease: easeOut }}
      className="overflow-hidden"
    >
      <div className="mt-1.5 max-w-[85%] rounded-xl bg-cream-deep/80 px-3.5 py-2.5 text-[11.5px] leading-snug text-olive/80">
        {children}
      </div>
    </motion.div>
  );
}

function MetaLabel({
  icon: Icon,
  children,
}: {
  icon: typeof AudioLines;
  children: React.ReactNode;
}) {
  return (
    <span className="mb-1 flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-gold">
      <Icon className="size-3" />
      {children}
    </span>
  );
}

function Time({ t, ticks = false }: { t: string; ticks?: boolean }) {
  return (
    <span className="mt-1 flex items-center justify-end gap-1 text-[10px] font-medium text-olive/40">
      {t}
      {ticks && <CheckCheck className="size-3 text-forest/60" />}
    </span>
  );
}

function VoiceNote({
  duration,
  time,
  playing,
}: {
  duration: string;
  time: string;
  playing: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full transition-colors",
            playing ? "bg-gold text-cream" : "bg-forest text-cream"
          )}
        >
          {playing ? (
            <AudioLines className="size-4" />
          ) : (
            <Play className="ml-0.5 size-3.5 fill-current" />
          )}
        </span>
        <Waveform playing={playing} barClass="bg-forest" progress={playing ? 1 : 0.45} />
        <span className="font-mono text-[11px] text-olive/55">{duration}</span>
      </div>
      <Time t={time} />
    </div>
  );
}

/* ------------------------------------------------------------------ main */
export default function Decode() {
  const [step, setStep] = useState(0);
  const [started, setStarted] = useState(false);
  const timeouts = useRef<number[]>([]);
  const sectionRef = useRef<HTMLElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const autoPlayed = useRef(false);

  const clearAll = () => {
    timeouts.current.forEach((t) => window.clearTimeout(t));
    timeouts.current = [];
  };

  const run = () => {
    clearAll();
    setStep(0);
    setStarted(true);
    TIMELINE.forEach((ms, i) => {
      timeouts.current.push(window.setTimeout(() => setStep(i + 1), ms));
    });
  };

  /* auto-play once when scrolled into view */
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !autoPlayed.current) {
          autoPlayed.current = true;
          timeouts.current.push(window.setTimeout(run, 800));
          io.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* keep chat scrolled to newest activity */
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [step]);

  const decoding = step >= 1 && step < 6;
  const done = step >= 6;

  const legend = [
    { icon: AudioLines, label: "Voice \u2192 Text", on: step >= 1, ok: step >= 2 },
    { icon: MessagesSquare, label: "Slang \u2192 SKU", on: step >= 3, ok: step >= 3 },
    { icon: Camera, label: "Photo \u2192 Data", on: step >= 4, ok: step >= 4 },
  ];

  return (
    <section id="decode" ref={sectionRef} className="relative bg-white py-24 lg:py-32">
      <div className="relative mx-auto max-w-7xl px-5 md:px-8">
        {/* header */}
        <div className="mx-auto max-w-2xl text-center">
          <SectionLabel>01 &middot; The invisible bridge</SectionLabel>
          <h2 className="text-balance mt-4 text-[34px] font-black leading-[1.06] tracking-[-0.02em] text-olive sm:text-[44px] lg:text-[52px]">
            From chat chaos to a cleared ledger{" "}
            <span className="text-forest">in seconds.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[16.5px] leading-relaxed text-olive/65">
            Your customers won&rsquo;t change how they order. Leda listens to
            every voice note, blurry photo, and market slang in between, and
            writes a clean ledger on the other side.
          </p>
          <button
            onClick={run}
            className="group mt-7 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-2.5 text-[13.5px] font-bold text-forest shadow-soft ring-1 ring-olive/10 transition-all hover:-translate-y-0.5 hover:shadow-lift hover:ring-forest/25"
          >
            <RotateCcw className="size-4 transition-transform duration-500 group-hover:-rotate-180" />
            {started ? "Replay the decode" : "Watch Leda decode"}
          </button>
        </div>

        {/* theatre */}
        <div className="mt-16 grid items-start gap-10 lg:grid-cols-[1fr_auto_1fr] lg:gap-8">
          {/* ---------------- CHAOS: phone ---------------- */}
          <div className="mx-auto w-full max-w-[420px]">
            <div className="mb-4 flex items-baseline justify-between px-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-olive/40">
                Before
              </p>
              <p className="font-mono text-[12px] text-olive/45">
                WhatsApp &middot; 62 unread &middot; 14 voice notes
              </p>
            </div>

            <div className="rounded-[26px] bg-white p-2 shadow-lift ring-1 ring-olive/10">
              <div className="overflow-hidden rounded-[20px] bg-[#ECE5DA]">
                {/* header */}
                <div className="flex items-center gap-3 bg-forest px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-cream">
                      Madam Kike, Trade Fair
                    </p>
                    <p className="text-[10.5px] font-medium text-cream/65">
                      online &middot; reseller since 2019
                    </p>
                  </div>
                  <Video className="size-4.5 shrink-0 text-cream/75" />
                  <Phone className="size-4 shrink-0 text-cream/75" />
                  <MoreVertical className="size-4 shrink-0 text-cream/75" />
                </div>

                {/* chat */}
                <div
                  ref={chatRef}
                  className="pattern-chat chat-scroll h-[430px] space-y-2.5 overflow-y-auto px-3 py-4 sm:h-[470px]"
                >
                  <div className="flex justify-center">
                    <span className="rounded-lg bg-[#F5EFE4] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-olive/45">
                      Today
                    </span>
                  </div>

                  <Bubble side="in">
                    Good morning o. Abeg I wan restock before weekend.
                    <Time t="9:02" />
                  </Bubble>

                  {/* voice 1 */}
                  <div>
                    <Bubble side="in" active={step === 1}>
                      <VoiceNote duration="0:42" time="9:03" playing={step === 1} />
                    </Bubble>
                    {step >= 2 && (
                      <Meta>
                        <MetaLabel icon={AudioLines}>Sabi transcript</MetaLabel>
                        &ldquo;Forty bags Stallion, the fifty-kg. Twenty-five
                        Mama Gold. Same price as last week, abeg.&rdquo;
                      </Meta>
                    )}
                  </div>

                  {/* slang text */}
                  <div>
                    <Bubble side="in" active={step === 3}>
                      Abeg add 15 kegs of that red-cap oil, the 25 litre one.
                      No send the yellow belle oh.
                      <Time t="9:04" />
                    </Bubble>
                    {step >= 3 && (
                      <Meta>
                        <MetaLabel icon={MessagesSquare}>Slang matched</MetaLabel>
                        &ldquo;red-cap oil, 25 litre&rdquo; &rarr;{" "}
                        <span className="font-mono font-semibold">KVO-25R</span>{" "}
                        Kings Vegetable Oil
                      </Meta>
                    )}
                  </div>

                  {/* photo 1 */}
                  <div>
                    <Bubble side="in" active={step === 4} className="px-2 pt-2">
                      <div className="relative overflow-hidden rounded-xl">
                        <img
                          src={IMAGES.chatSacks}
                          alt="Blurry photo of stacked rice bags"
                          className="h-32 w-full scale-110 object-cover blur-[3px] saturate-[0.8]"
                        />
                        {step === 4 && (
                          <span
                            className="scanline absolute left-0 h-14 w-full bg-gradient-to-b from-transparent via-gold-bright/50 to-transparent"
                            style={{ animation: "scan-y 1.4s ease-in-out infinite" }}
                          />
                        )}
                      </div>
                      <p className="mt-1.5 px-1">This one. The 50kg size.</p>
                      <Time t="9:04" />
                    </Bubble>
                    {step >= 4 && (
                      <Meta>
                        <MetaLabel icon={Camera}>Photo verified</MetaLabel>
                        Matched to{" "}
                        <span className="font-mono font-semibold">RSR-50</span>{" "}
                        Royal Stallion 50kg &middot; 98% confidence
                      </Meta>
                    )}
                  </div>

                  {/* voice 2 */}
                  <div>
                    <Bubble side="in" active={step === 5}>
                      <VoiceNote duration="1:07" time="9:05" playing={step === 5} />
                    </Bubble>
                    {step >= 6 && (
                      <Meta>
                        <MetaLabel icon={AudioLines}>Sabi transcript</MetaLabel>
                        &ldquo;Driver go reach Friday morning. Keep am for the
                        usual warehouse.&rdquo;
                      </Meta>
                    )}
                  </div>

                  {/* reply */}
                  {done && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    >
                      <Bubble side="out">
                        Confirmed. 80 items, all verified. Proforma sent.
                        <Time t="9:05" ticks />
                      </Bubble>
                    </motion.div>
                  )}
                </div>

                {/* input bar */}
                <div className="flex items-center gap-2 bg-[#F0EAE0] px-3 py-2.5">
                  <div className="flex h-10 flex-1 items-center rounded-full bg-white px-4 text-[13px] text-olive/45">
                    Message
                  </div>
                  <span className="grid size-10 place-items-center rounded-full bg-forest text-cream">
                    <AudioLines className="size-4.5" />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ---------------- BRIDGE ---------------- */}
          <div className="mx-auto flex w-full max-w-[420px] items-center justify-center lg:w-[150px] lg:self-stretch">
            {/* mobile */}
            <div className="flex w-full flex-col items-center gap-3 py-2 lg:hidden">
              <motion.span
                animate={{ y: [0, 5, 0] }}
                transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                className={cn(
                  "transition-colors duration-500",
                  done ? "text-forest" : decoding ? "text-gold" : "text-olive/30"
                )}
              >
                {done ? (
                  <Check className="size-7" />
                ) : decoding ? (
                  <Loader2 className="size-7 animate-spin" />
                ) : (
                  <ArrowDown className="size-7" />
                )}
              </motion.span>
              <p aria-live="polite" className="text-center text-[12px] font-semibold leading-snug text-olive/60">
                {BRIDGE_STATUS[step]}
              </p>
            </div>

            {/* desktop */}
            <div className="hidden h-full w-full flex-col items-center justify-center gap-6 lg:flex">
              <motion.span
                animate={{ x: [0, 8, 0] }}
                transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                className={cn(
                  "transition-colors duration-500",
                  done ? "text-forest" : decoding ? "text-gold" : "text-olive/30"
                )}
              >
                {done ? (
                  <Check className="size-8" />
                ) : decoding ? (
                  <Loader2 className="size-8 animate-spin" />
                ) : (
                  <ArrowRight className="size-8" />
                )}
              </motion.span>

              <p
                aria-live="polite"
                className="text-center text-[12px] font-semibold leading-snug text-olive/60"
              >
                {BRIDGE_STATUS[step]}
              </p>

              <div className="space-y-2.5">
                {legend.map((l) => (
                  <span
                    key={l.label}
                    className={cn(
                      "flex items-center gap-2 font-mono text-[11px] font-semibold transition-colors duration-500",
                      l.ok
                        ? "text-forest"
                        : l.on
                          ? "text-gold"
                          : "text-olive/35"
                    )}
                  >
                    <l.icon className="size-3.5 shrink-0" />
                    {l.label}
                    {l.ok && <Check className="size-3" />}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ---------------- ORDER: ledger ---------------- */}
          <div className="mx-auto w-full max-w-[480px] lg:max-w-none">
            <div className="mb-4 flex items-baseline justify-between px-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-olive/40">
                After
              </p>
              <p className="font-mono text-[12px] text-olive/45">
                {done ? "0 pending \u00B7 invoice ready" : "auto-written by Leda"}
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl bg-white shadow-lift ring-1 ring-olive/10">
              {/* header */}
              <div className="bg-cream-deep/60 px-6 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-olive/40">
                      Leda &middot; Order ledger
                    </p>
                    <p className="mt-1 font-mono text-[14px] font-semibold text-olive">
                      #LE-1042 &middot; Madam Kike Stores
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-[12px] font-bold transition-colors duration-500",
                      done ? "text-forest" : decoding ? "text-gold" : "text-olive/45"
                    )}
                  >
                    {decoding && <Loader2 className="size-3.5 animate-spin" />}
                    {done && <Check className="size-3.5" />}
                    {done ? "Ledger cleared" : decoding ? "Decoding\u2026" : "Awaiting WhatsApp"}
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] font-medium text-olive/55">
                  Trade Fair Complex, Lagos &middot; Gold tier customer
                </p>
              </div>

              {/* rows */}
              <div className="relative min-h-[228px] px-6 pb-6 pt-5">
                <AnimatePresence>
                  {step === 0 && (
                    <motion.div
                      key="empty"
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.4 }}
                      className="absolute inset-x-6 top-5 flex h-[196px] flex-col items-center justify-center rounded-xl bg-cream-deep/40 text-center"
                    >
                      <AudioLines className="size-6 text-olive/40" />
                      <p className="mt-3 text-[13px] font-bold text-olive/60">
                        No structured order yet
                      </p>
                      <p className="mt-1 max-w-[240px] text-[11.5px] leading-snug text-olive/45">
                        WhatsApp messages land here as clean line items the
                        moment they arrive.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-1.5">
                  <AnimatePresence>
                    {step > 0 && (
                      <motion.div
                        key="cols"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-olive/40"
                      >
                        <span>Line item</span>
                        <span>Amount</span>
                      </motion.div>
                    )}
                    {ROWS.filter((r) => step >= r.appearAt).map((r) => (
                      <motion.div
                        key={r.sku}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.55, ease: easeOut }}
                        className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-cream-deep/40"
                      >
                        <span className="w-[62px] shrink-0 font-mono text-[11px] font-semibold text-forest">
                          {r.sku}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-olive">
                            {r.name}
                          </p>
                          <p className="flex items-center gap-1.5 font-mono text-[10.5px] text-olive/50">
                            {r.pack} &middot; {r.qty} &times; {naira(r.price)}
                            {r.photoVerifiedAt && step >= r.photoVerifiedAt && (
                              <span className="inline-flex items-center gap-0.5 font-sans font-semibold text-forest">
                                <Check className="size-3" /> verified
                              </span>
                            )}
                          </p>
                        </div>
                        <span className="font-mono text-[12.5px] font-semibold text-olive">
                          {naira(r.price * r.qty)}
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  <AnimatePresence>
                    {step >= 6 && (
                      <motion.div
                        key="delivery"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.55, ease: easeOut }}
                        className="mt-1 flex items-center gap-3 rounded-xl bg-cream-deep/50 px-4 py-3"
                      >
                        <Truck className="size-4 shrink-0 text-gold" />
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-olive">
                            Delivery &middot; Friday, 8:00 AM
                          </p>
                          <p className="text-[11px] font-medium text-olive/55">
                            Warehouse 3, Trade Fair &middot; from voice note
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* totals */}
              <div className="bg-cream-deep/60 px-6 py-5">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-olive/40">
                      Order total
                    </p>
                    <p className="mt-1 font-mono text-[24px] font-semibold tracking-tight text-forest">
                      {done || decoding ? (
                        <CountUp to={TOTAL} prefix={"\u20A6"} play={step >= 5} duration={1.8} />
                      ) : (
                        "\u20A60"
                      )}
                    </p>
                  </div>
                  <p className="pb-1 text-[11.5px] font-medium text-olive/50">
                    80 items &middot; terms: 7 days
                  </p>
                </div>

                <button
                  disabled={!done}
                  className={cn(
                    "mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[14px] font-bold transition-all duration-500",
                    done
                      ? "bg-forest text-cream shadow-[0_14px_28px_-12px_rgb(6,95,70,0.7)] hover:-translate-y-0.5 hover:bg-forest-deep"
                      : "cursor-not-allowed bg-olive/[0.07] text-olive/40"
                  )}
                >
                  {done ? <Send className="size-4" /> : <Loader2 className="size-4 animate-spin" />}
                  {done ? "Send proforma invoice" : "Waiting for decode\u2026"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <p className="mx-auto mt-14 max-w-xl text-center text-[13.5px] font-medium leading-relaxed text-olive/55">
          No new app for your customers. No retraining for your boys.{" "}
          <span className="font-bold text-olive">
            Leda is the invisible bridge between the market you know and the
            business you&rsquo;re building.
          </span>
        </p>
      </div>
    </section>
  );
}
