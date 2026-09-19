import type { ReactNode } from "react";
import { Check, LockKeyhole } from "lucide-react";
import "./auth.css";

function Brand() {
  return <a href="#/welcome" className="auth-brand" aria-label="Leda home">
    <span className="auth-brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" width="21" height="21" fill="none"><path d="M5 21c6.5 0 8.5-9.5 14-9.5 3.6 0 5.4 2.4 7.6 4.5" stroke="#065F46" strokeWidth="3" strokeLinecap="round" /><circle cx="25" cy="19" r="2.6" fill="#D97706" /></svg></span><span>Leda</span>
  </a>;
}

export default function AuthPage({ title, intro, kicker = "Welcome back", children }: {
  title: string; intro: string; kicker?: string; children: ReactNode;
}) {
  return <main className="auth-page">
    <section className="auth-aside" aria-label="About Leda">
      <Brand />
      <div className="auth-aside-copy">
        <p className="auth-kicker">Wholesale, in order</p>
        <h1>Every WhatsApp order, clear enough to trust.</h1>
        <p>Bring your customers, stock and cash flow into one business view, without asking the market to change how it speaks.</p>
      </div>
      <div className="auth-aside-points">
        <span><Check size={15} />Structured orders from real conversations</span>
        <span><Check size={15} />A ledger that reconciles as you trade</span>
        <span><Check size={15} />Built for distributors across Nigeria</span>
      </div>
      <p className="auth-aside-foot">Leda Technologies Ltd · Lagos, Nigeria</p>
    </section>
    <section className="auth-form-side" aria-label={title}>
      <div className="auth-form-wrap">
        <div className="auth-mobile-brand"><Brand /></div>
        <div className="auth-title"><p>{kicker}</p><h2>{title}</h2><span>{intro}</span></div>
        {children}
        <p className="auth-security"><LockKeyhole size={13} />Your password stays private. Your business stays yours.</p>
      </div>
    </section>
  </main>;
}
