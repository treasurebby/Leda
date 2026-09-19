import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import "../onboarding/onboarding.css";

/** Shared chrome for the sign-in and invitation pages, styled like the onboarding card. */
export default function AuthPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="onboarding-page">
      <header className="setup-topbar">
        <a href="#/welcome" className="onboarding-brand" aria-label="Leda home">
          <svg viewBox="0 0 40 40" width="39" height="39" aria-hidden="true"><rect width="40" height="40" rx="11" fill="#065F46" /><path d="M9 25c8 0 9-12 15-12 4 0 6 3 8 5" fill="none" stroke="#FDFBF7" strokeWidth="3.5" strokeLinecap="round" /><circle cx="30" cy="23" r="2.7" fill="#D97706" /></svg>
          <span>Leda</span>
        </a>
      </header>
      <main className="setup-main">
        <motion.div className="setup-intro" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.5 }}>
          <h1>{title}</h1>
          <p>{intro}</p>
        </motion.div>
        <motion.section className="setup-card auth-card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.6, delay: reduceMotion ? 0 : 0.1, ease: [0.16, 1, 0.3, 1] }}>
          {children}
        </motion.section>
      </main>
      <footer className="setup-page-footer"><p>&copy; {new Date().getFullYear()} Leda. Built for the way you trade.</p></footer>
    </div>
  );
}
