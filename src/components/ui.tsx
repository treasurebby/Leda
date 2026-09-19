import { useEffect, useState } from "react";
import { animate } from "framer-motion";
import { cn } from "../utils/cn";

/* ------------------------------------------------ logo */
export function BrandLogo({ dark = false }: { dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={cn(
          "grid size-9 place-items-center rounded-xl shadow-soft",
          dark ? "bg-cream" : "bg-forest"
        )}
        aria-hidden
      >
        <svg viewBox="0 0 32 32" className="size-5" fill="none">
          <path
            d="M5 21c6.5 0 8.5-9.5 14-9.5 3.6 0 5.4 2.4 7.6 4.5"
            stroke={dark ? "#065F46" : "#FDFBF7"}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="25" cy="19" r="2.6" fill="#D97706" />
        </svg>
      </span>
      <span
        className={cn(
          "text-[19px] font-extrabold tracking-tight",
          dark ? "text-cream" : "text-olive"
        )}
      >
        Leda
      </span>
    </span>
  );
}

/* ------------------------------------------------ section label (plain, editorial) */
export function SectionLabel({
  children,
  className,
  dark = false,
}: {
  children: React.ReactNode;
  className?: string;
  dark?: boolean;
}) {
  return (
    <p
      className={cn(
        "text-[11px] font-bold uppercase tracking-[0.22em]",
        dark ? "text-gold-bright" : "text-gold",
        className
      )}
    >
      {children}
    </p>
  );
}

/* ------------------------------------------------ count up */
export function CountUp({
  to,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 1.8,
  delay = 0,
  play = true,
  className,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  delay?: number;
  play?: boolean;
  className?: string;
}) {
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!play) return;
    const controls = animate(0, to, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setVal(v),
    });
    return () => controls.stop();
  }, [play, to, duration, delay]);

  const formatted = val.toLocaleString("en-NG", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------ waveform */
const DEFAULT_BARS = [
  0.4, 0.7, 0.55, 0.9, 0.62, 1, 0.78, 0.5, 0.86, 0.64, 0.95, 0.58, 0.42, 0.8,
  0.68, 0.92, 0.55, 0.74, 0.48, 0.88, 0.6, 0.7, 0.45, 0.82,
];

export function Waveform({
  bars = DEFAULT_BARS,
  active = false,
  playing = false,
  className,
  barClass = "bg-forest/70",
  progress = 0.55,
}: {
  bars?: number[];
  active?: boolean;
  playing?: boolean;
  className?: string;
  barClass?: string;
  progress?: number;
}) {
  return (
    <span className={cn("flex h-7 items-center gap-[2.5px]", className)}>
      {bars.map((h, i) => {
        const played = i / bars.length < progress;
        return (
          <span
            key={i}
            className={cn(
              "wave-bar w-[2.5px] origin-center rounded-full transition-colors duration-300",
              playing ? "animate-eq" : "",
              active || played ? barClass : "bg-stone-300"
            )}
            style={{
              height: `${Math.max(18, h * 100)}%`,
              animationDelay: `${(i % 7) * 0.09}s`,
              animationDuration: `${0.7 + ((i * 37) % 5) * 0.12}s`,
            }}
          />
        );
      })}
    </span>
  );
}
