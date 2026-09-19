import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import AuthPage from "./AuthPage";
import { Field, PasswordInput, TextInput } from "../onboarding/Fields";
import { validEmail } from "../onboarding/model";
import { login } from "../api/auth";
import { ApiError } from "../api/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!validEmail(email)) next.email = "Enter a valid email address.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await login(email.trim().toLowerCase(), password);
      window.location.hash = "/dashboard";
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setErrors({ password: "Incorrect email or password." });
      else setErrors({ form: error instanceof ApiError ? error.message : "We couldn't reach Leda. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPage title="Welcome back." intro="Sign in to your Command Center.">
      <form className="setup-form" onSubmit={submit} noValidate>
        <div className="setup-fields">
          <Field id="login-email" label="Email address" error={errors.email}>
            <TextInput id="login-email" type="email" autoComplete="email" value={email} onChange={e => { setEmail(e.target.value); setErrors({}); }} invalid={!!errors.email} required />
          </Field>
          <Field id="login-password" label="Password" error={errors.password}>
            <PasswordInput id="login-password" autoComplete="current-password" value={password} onChange={e => { setPassword(e.target.value); setErrors({}); }} invalid={!!errors.password} required />
          </Field>
        </div>
        {errors.form && <p className="setup-form-error" role="alert">{errors.form}</p>}
        <div className="setup-form-actions">
          <a className="setup-back-button" href="#/onboarding">New to Leda? Set up a business</a>
          <button type="submit" className="setup-button setup-button-primary continue-button" disabled={busy} aria-busy={busy}>{busy ? "Signing in…" : "Sign in"}<ArrowRight size={17} /></button>
        </div>
      </form>
    </AuthPage>
  );
}
