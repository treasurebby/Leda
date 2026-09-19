import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Loader2,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { isValidEmail, joinWaitlist, type JoinResult } from "../lib/waitlist";
import { cn } from "../utils/cn";

type Status = "idle" | "sending" | "sent" | "error";

export default function Cta() {
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JoinResult | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;

    const value = email.trim();
    if (!value) {
      setError("Please enter your email address.");
      setStatus("error");
      return;
    }
    if (!isValidEmail(value)) {
      setError("That doesn't look like a valid email address.");
      setStatus("error");
      return;
    }

    /* Bots fill the hidden field. Pretend success, send nothing. */
    if (honeypot) {
      setResult({ mode: "sent" });
      setStatus("sent");
      return;
    }

    setError(null);
    setStatus("sending");
    try {
      const res = await joinWaitlist(value);
      setResult(res);
      setStatus("sent");
    } catch (err) {
      console.error("[Leda] Waitlist signup failed:", err);
      setError(
        "We couldn't send your confirmation email. Please check the address and try again."
      );
      setStatus("error");
    }
  };

  const invalid = status === "error" && !!error;

  return (
    <section id="signup" className="relative py-24 lg:py-28">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 36 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden rounded-[28px] bg-gradient-to-b from-[#D4560F] to-[#B4470B] px-7 py-16 shadow-[0_40px_80px_-24px_rgb(154,52,18,0.45)] sm:px-12 lg:px-16 lg:py-20"
        >
          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-[32px] font-black leading-[1.08] tracking-[-0.02em] text-cream sm:text-[42px] lg:text-[48px]">
              Your ledger is waiting to{" "}
              <span className="text-[#FFE3B8]">clear itself.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-[16px] leading-relaxed text-cream/80">
              Join distributors moving their wholesale business from WhatsApp
              chaos to professional order without changing a single habit.
            </p>

            <AnimatePresence mode="wait">
              {status === "sent" ? (
                <motion.div
                  key="sent"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  role="status"
                  aria-live="polite"
                  className="mx-auto mt-9 max-w-md rounded-2xl bg-white/15 px-6 py-5"
                >
                  <div className="flex items-center justify-center gap-3">
                    <BadgeCheck className="size-6 shrink-0 text-cream" />
                    <p className="text-[15px] font-bold text-cream">
                      You&rsquo;re on the list. We&rsquo;ll reach out via email.
                    </p>
                  </div>
                  {result?.mode === "sent" ? (
                    <p className="mt-2 text-[12.5px] font-medium text-cream/70">
                      A confirmation is on its way to{" "}
                      <span className="font-semibold text-cream">{email.trim()}</span>.
                    </p>
                  ) : (
                    <p className="mt-2 text-[11.5px] font-medium text-cream/55">
                      Demo mode: connect EmailJS in src/config/email.ts to send
                      the confirmation email.
                    </p>
                  )}
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  onSubmit={submit}
                  noValidate
                  className="mx-auto mt-9 max-w-md"
                >
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <label htmlFor="waitlist-email" className="sr-only">
                      Email address
                    </label>
                    <input
                      id="waitlist-email"
                      type="email"
                      name="email"
                      inputMode="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (status === "error") {
                          setStatus("idle");
                          setError(null);
                        }
                      }}
                      placeholder="Enter your email"
                      aria-invalid={invalid || undefined}
                      aria-describedby={invalid ? "waitlist-error" : undefined}
                      disabled={status === "sending"}
                      className={cn(
                        "h-14 flex-1 rounded-2xl bg-white/15 px-5 text-[15px] font-semibold text-cream outline-none transition-all placeholder:text-cream/55 focus:bg-white/22 disabled:opacity-70",
                        invalid && "ring-2 ring-[#FFE3B8]"
                      )}
                    />

                    {/* honeypot: hidden from humans, tempting for bots */}
                    <input
                      type="text"
                      name="company"
                      tabIndex={-1}
                      autoComplete="off"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                      className="absolute -left-[9999px] h-0 w-0 opacity-0"
                      aria-hidden
                    />

                    <button
                      type="submit"
                      disabled={status === "sending"}
                      className="group inline-flex h-14 min-w-[136px] items-center justify-center gap-2 rounded-2xl bg-cream px-7 text-[15px] font-bold text-olive shadow-[0_14px_32px_-12px_rgb(0,0,0,0.35)] transition-all hover:-translate-y-0.5 hover:bg-white disabled:cursor-wait disabled:opacity-80 disabled:hover:translate-y-0"
                    >
                      {status === "sending" ? (
                        <>
                          <Loader2 className="size-4.5 animate-spin" />
                          Signing up
                        </>
                      ) : (
                        <>
                          Sign Up
                          <ArrowRight className="size-4.5 transition-transform group-hover:translate-x-1" />
                        </>
                      )}
                    </button>
                  </div>

                  <AnimatePresence>
                    {invalid && (
                      <motion.p
                        id="waitlist-error"
                        role="alert"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mt-3 text-[13px] font-semibold text-[#FFE3B8]"
                      >
                        {error}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.form>
              )}
            </AnimatePresence>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-x-8 gap-y-2.5 text-[13px] font-semibold text-cream/75">
              <span className="inline-flex items-center gap-2">
                <Timer className="size-4 text-cream" />
                Set up in one afternoon
              </span>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="size-4 text-cream" />
                Your catalog stays private
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
