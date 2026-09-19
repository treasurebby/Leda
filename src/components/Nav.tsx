import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { BrandLogo } from "./ui";
import { cn } from "../utils/cn";

const LINKS = [
  { label: "The bridge", href: "#decode" },
  { label: "Sabi-Decoding", href: "#features" },
  { label: "Distributors", href: "#voices" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const light = !scrolled;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-cream/85 shadow-[0_10px_32px_-18px_rgb(6,78,59,0.25)] backdrop-blur-xl"
          : "bg-transparent"
      )}
    >
      <nav className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 md:px-8">
        <a href="#top" aria-label="Leda home">
          <BrandLogo dark={light} />
        </a>

        <div className="hidden items-center gap-9 lg:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={cn(
                "text-[14px] font-medium transition-colors",
                light
                  ? "text-cream/75 hover:text-cream"
                  : "text-olive/60 hover:text-forest"
              )}
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <a
            href="#/onboarding"
            className={cn(
              "group hidden items-center gap-1.5 rounded-2xl px-5 py-2.5 text-[14px] font-bold transition-all hover:-translate-y-0.5 sm:inline-flex",
              light
                ? "bg-cream text-olive hover:bg-white"
                : "bg-forest text-cream shadow-[0_10px_24px_-10px_rgb(6,95,70,0.7)] hover:bg-forest-deep hover:shadow-lift"
            )}
          >
            Sign Up
            <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
          <button
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "grid size-10 place-items-center rounded-xl transition-colors lg:hidden",
              light ? "bg-white/10 text-cream" : "bg-white/70 text-olive shadow-soft"
            )}
            aria-label="Toggle menu"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden bg-cream/95 backdrop-blur-xl lg:hidden"
          >
            <div className="flex flex-col gap-1 px-5 py-4">
              {LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-3 text-[15px] font-semibold text-olive hover:bg-forest/5"
                >
                  {l.label}
                </a>
              ))}
              <a
                href="#/onboarding"
                onClick={() => setOpen(false)}
                className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-forest px-5 py-3 text-[15px] font-bold text-cream"
              >
                Sign Up
                <ArrowUpRight className="size-4" />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
