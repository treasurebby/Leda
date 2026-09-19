import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import AuthPage from "./AuthPage";
import AuthInput, { focusAuthError } from "./AuthInput";
import { validEmail } from "../onboarding/model";
import { login } from "../api/auth";
import { ApiError } from "../api/client";
import { afterSignIn, useSession } from "./Session";

export default function Login({ next }: { next: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const { reload } = useSession();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const validation: Record<string, string> = {};
    if (!validEmail(email)) validation.email = "Enter your workspace email address.";
    if (!password) validation.password = "Enter your password.";
    setErrors(validation);
    if (Object.keys(validation).length) { focusAuthError(); return; }
    setBusy(true);
    try {
      await login(email.trim().toLowerCase(), password, remember);
      const session = await reload();
      window.location.hash = afterSignIn(session, next);
    } catch (error) {
      setErrors({ form: error instanceof ApiError ? error.message : "We couldn't reach Leda. Check your connection and try again." });
    } finally { setBusy(false); }
  }

  return <AuthPage title="Sign in to your workspace." intro="Use the email and password you chose when joining Leda.">
    <form className="auth-form" onSubmit={submit} noValidate aria-busy={busy}>
      <AuthInput id="signin-email" label="Email address" type="email" autoComplete="username" required maxLength={254}
        placeholder="you@yourbusiness.com" value={email} error={errors.email}
        onChange={e => { setEmail(e.target.value); setErrors({}); }} />
      <AuthInput id="signin-password" label="Password" type="password" autoComplete="current-password" required maxLength={128}
        placeholder="Enter your password" value={password} error={errors.password}
        onChange={e => { setPassword(e.target.value); setErrors({}); }} />
      <div className="auth-options">
        <label className="auth-remember"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /><span>Remember this device</span></label>
        <a href={`#/forgot-password?email=${encodeURIComponent(email.trim())}`}>Forgot password?</a>
      </div>
      {errors.form && <p className="auth-error" role="alert">{errors.form}</p>}
      <button type="submit" className="auth-submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<ArrowRight size={17} /></button>
    </form>
    <p className="auth-signup">New to Leda? <a href="#/onboarding">Create your distributor workspace <ArrowRight size={13} /></a></p>
  </AuthPage>;
}
