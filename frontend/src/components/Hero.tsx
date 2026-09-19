import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type Variants,
} from "framer-motion";
import { ArrowDown, ArrowRight, Check, Mic, Truck } from "lucide-react";
import { CountUp, SectionLabel, Waveform } from "./ui";
import { IMAGES } from "../config/images";

const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: easeOut } },
};

const ITEMS = [
  {
    sku: "RSR-50",
    name: "Royal Stallion Parboiled Rice",
    pack: "50kg bag",
    qty: 40,
    amount: 3140000,
  },
  {
    sku: "MGR-50",
    name: "Mama Gold Premium Rice",
    pack: "50kg bag",
    qty: 25,
    amount: 1930000,
  },
  {
    sku: "KVO-25R",
    name: "Kings Vegetable Oil \u00B7 Red Cap",
    pack: "25L keg",
    qty: 15,
    amount: 1447500,
  },
];
const TOTAL = 6517500;
const naira = (n: number) => "\u20A6" + n.toLocaleString("en-NG");

export default function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const sx = useSpring(mx, { stiffness: 60, damping: 18 });
  const sy = useSpring(my, { stiffness: 60, damping: 18 });
  const tiltX = useTransform(sy, [0, 1], [2.5, -2.5]);
  const tiltY = useTransform(sx, [0, 1], [-2.5, 2.5]);

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - r.left) / r.width);
    my.set((e.clientY - r.top) / r.height);
  };

  return (
    <section id="top" className="relative overflow-hidden bg-forest-ink pt-[72px]">
      {/* background photo + dark overlay */}
      <img
        src={IMAGES.heroMarket}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-[#07110d]/78" aria-hidden />
      <div
        className="absolute inset-0 bg-gradient-to-b from-[#07110d]/40 via-transparent to-[#07110d]/70"
        aria-hidden
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-5 pb-24 pt-16 md:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-12 lg:pb-32 lg:pt-24">
        {/* ---------------- copy ---------------- */}
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.div variants={rise}>
            <SectionLabel dark>For Nigeria&rsquo;s wholesale distributors</SectionLabel>
          </motion.div>

          <motion.h1
            variants={rise}
            className="text-balance mt-5 text-[42px] font-black leading-[1.03] tracking-[-0.03em] text-cream sm:text-[56px] lg:text-[64px] xl:text-[70px]"
          >
            Stop the WhatsApp Chaos.{" "}
            <span className="text-gold-bright">Clear Your Ledger.</span>
          </motion.h1>

          <motion.p
            variants={rise}
            className="mt-6 max-w-xl text-[17px] leading-relaxed text-cream/75 sm:text-lg"
          >
            Leda turns voice notes, blurry photos, and market slang into
            structured orders and a balanced ledger before your morning tea.
            Your customers keep chatting; your books keep clearing.
          </motion.p>

          <motion.div variants={rise} className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
            <a
              href="#/onboarding"
              className="group inline-flex h-14 items-center gap-2 rounded-2xl bg-forest px-8 text-[15.5px] font-bold text-cream shadow-[0_18px_40px_-12px_rgb(6,95,70,0.9)] ring-1 ring-white/10 transition-all hover:-translate-y-0.5 hover:bg-[#0A7455]"
            >
              Sign Up
              <ArrowRight className="size-4.5 transition-transform group-hover:translate-x-1" />
            </a>
            <a
              href="#decode"
              className="group inline-flex items-center gap-2 text-[15px] font-bold text-cream/85 transition-colors hover:text-gold-bright"
            >
              See how Leda decodes
              <ArrowDown className="size-4 transition-transform group-hover:translate-y-0.5" />
            </a>
          </motion.div>

          <motion.p variants={rise} className="mt-7 text-[14px] font-medium text-cream/60">
            Join other distributors and make your orders structured.
          </motion.p>
        </motion.div>

        {/* ---------------- workspace window ---------------- */}
        <div ref={ref} onMouseMove={onMove} className="[perspective:1400px]">
          <motion.div
            initial={{ opacity: 0, y: 36 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.3, ease: easeOut }}
            style={{ rotateX: tiltX, rotateY: tiltY }}
            className="overflow-hidden rounded-2xl bg-white shadow-[0_40px_90px_-20px_rgb(0,0,0,0.6)]"
          >
            {/* window bar */}
            <div className="flex items-center justify-between bg-cream-deep/70 px-5 py-3.5">
              <p className="text-[12.5px] font-bold text-olive/70">Leda workspace</p>
              <p className="font-mono text-[11.5px] text-olive/45">Order #LE-1042</p>
            </div>

            <div className="p-5 sm:p-6">
              {/* raw input */}
              <div className="rounded-xl bg-cream-deep/50 p-4">
                <div className="flex items-start gap-3.5">
                  <img
                    src={IMAGES.chatSacks}
                    alt="Snapshot of stacked rice bags from a customer"
                    className="h-11 w-14 shrink-0 rounded-lg object-cover blur-[2px] saturate-[0.85] ring-1 ring-olive/10"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-bold text-olive/80">
                      Madam Kike &middot; Trade Fair Complex
                    </p>
                    <p className="mt-0.5 truncate text-[11.5px] text-olive/55">
                      &ldquo;&hellip;40 bags Stallion, 25 Mama Gold, 15 kegs
                      red-cap oil&hellip;&rdquo;
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[10.5px] font-semibold text-gold">
                    0.9s
                  </span>
                </div>
                <div className="mt-3.5 flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-forest text-cream">
                    <Mic className="size-3.5" />
                  </span>
                  <Waveform playing progress={1} barClass="bg-forest/70" className="h-6" />
                  <span className="shrink-0 font-mono text-[11px] text-olive/50">
                    0:42 &middot; Pidgin
                  </span>
                </div>
              </div>

              {/* line items */}
              <div className="mt-6 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-olive/40">
                <span>Line item</span>
                <span>Amount</span>
              </div>

              <div className="mt-2 space-y-0.5">
                {ITEMS.map((it, i) => (
                  <motion.div
                    key={it.sku}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.75 + i * 0.18, ease: easeOut }}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-cream-deep/40"
                  >
                    <span className="w-[62px] shrink-0 font-mono text-[11px] font-semibold text-forest">
                      {it.sku}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-olive">
                        {it.name}
                      </p>
                      <p className="text-[11px] text-olive/50">
                        {it.pack} &middot; qty {it.qty}
                      </p>
                    </div>
                    <span className="font-mono text-[12.5px] font-semibold text-olive">
                      {naira(it.amount)}
                    </span>
                  </motion.div>
                ))}
              </div>

              {/* delivery */}
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 1.35, ease: easeOut }}
                className="mt-4 flex items-center gap-3 rounded-xl bg-cream-deep/50 px-4 py-3"
              >
                <Truck className="size-4 shrink-0 text-gold" />
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-olive">
                    Delivery &middot; Friday, 8:00 AM
                  </p>
                  <p className="text-[11px] text-olive/50">
                    Warehouse 3, Trade Fair, taken from voice note
                  </p>
                </div>
              </motion.div>

              {/* total */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7, delay: 1.5 }}
                className="mt-5 flex items-end justify-between"
              >
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-olive/40">
                    Order total
                  </p>
                  <p className="mt-1 font-mono text-[26px] font-semibold tracking-tight text-forest">
                    <CountUp to={TOTAL} prefix={"\u20A6"} delay={1.55} duration={1.6} />
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 pb-1 text-[12.5px] font-bold text-forest">
                  <Check className="size-4" />
                  Ledger cleared
                </span>
              </motion.div>

              <div className="mt-5 flex items-center justify-between text-[11px] font-medium text-olive/45">
                <span>80 items &middot; terms: 7 days</span>
                <span className="font-mono">Synced 09:05 &middot; invoice ready</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
