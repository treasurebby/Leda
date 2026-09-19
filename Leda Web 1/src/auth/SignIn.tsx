import { useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import "./auth.css";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!emailPattern.test(email.trim())) {
      setError("Enter the email address linked to your Leda workspace.");
      return;
    }
    if (password.length < 8) {
      setError("Enter your password. It should be at least 8 characters.");
      return;
    }
    setError("");
    setSubmitting(true);
    window.setTimeout(() => {
      if (remember) localStorage.setItem("leda.preview.session", email.trim().toLowerCase());
      else sessionStorage.setItem("leda.preview.session", email.trim().toLowerCase());
      window.location.hash = "/dashboard";
    }, 550);
  }

  function requestRecovery() {
    if (!emailPattern.test(email.trim())) {
      setError("Enter your workspace email above, then choose Forgot password.");
      return;
    }
    setError("");
    setMessage("Recovery links need an email provider in production. This preview has not sent a message.");
  }

  return (
    <main className="auth-page">
      <section className="auth-aside" aria-label="About Leda">
        <a href="#/welcome" className="auth-brand" aria-label="Leda home">
          <span className="auth-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="21" height="21" fill="none"><path d="M5 21c6.5 0 8.5-9.5 14-9.5 3.6 0 5.4 2.4 7.6 4.5" stroke="#065F46" strokeWidth="3" strokeLinecap="round" /><circle cx="25" cy="19" r="2.6" fill="#D97706" /></svg>
          </span>
          <span>Leda</span>
        </a>
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

      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <div className="auth-mobile-brand"><a href="#/welcome" className="auth-brand"><span className="auth-brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" width="21" height="21" fill="none"><path d="M5 21c6.5 0 8.5-9.5 14-9.5 3.6 0 5.4 2.4 7.6 4.5" stroke="#065F46" strokeWidth="3" strokeLinecap="round" /><circle cx="25" cy="19" r="2.6" fill="#D97706" /></svg></span><span>Leda</span></a></div>
          <div className="auth-title"><p>Welcome back</p><h2>Sign in to your workspace.</h2><span>Use the email and password your business administrator set up.</span></div>
          <form className="auth-form" onSubmit={submit} noValidate>
            <label htmlFor="signin-email">Email address</label>
            <div className="auth-input-wrap"><Mail size={16} aria-hidden="true" /><input id="signin-email" type="email" autoComplete="email" value={email} onChange={event => { setEmail(event.target.value); setError(""); }} placeholder="you@yourbusiness.com" aria-invalid={!!error || undefined} /></div>
            <div className="auth-password-row"><label htmlFor="signin-password">Password</label><button type="button" onClick={requestRecovery}>Forgot password?</button></div>
            <div className="auth-input-wrap"><LockKeyhole size={16} aria-hidden="true" /><input id="signin-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={event => { setPassword(event.target.value); setError(""); }} placeholder="Enter your password" aria-invalid={!!error || undefined} /><button type="button" className="auth-show-password" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(current => !current)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
            <label className="auth-remember"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} /><span>Remember this device</span></label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            {message && <p className="auth-message" role="status"><ShieldCheck size={15} />{message}</p>}
            <button type="submit" className="auth-submit" disabled={submitting}>{submitting ? "Opening workspace" : "Sign in"}<ArrowRight size={17} /></button>
          </form>
          <p className="auth-signup">New to Leda? <a href="#/onboarding">Create your distributor workspace <ArrowRight size={13} /></a></p>
          <p className="auth-security"><LockKeyhole size={13} />Preview sign-in. Connect secure authentication before using real business passwords.</p>
        </div>
      </section>
    </main>
  );
}