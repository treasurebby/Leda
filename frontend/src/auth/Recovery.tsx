import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import AuthPage from "./AuthPage";
import AuthInput, { focusAuthError } from "./AuthInput";
import { forgotPassword, resetPassword } from "../api/auth";
import { ApiError } from "../api/client";
import { validEmail, validPassword } from "../onboarding/model";

export default function Recovery({ token, initialEmail = "" }: { token?: string; initialEmail?: string }) {
  const resetting = token !== undefined;
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const validation: Record<string, string> = {};
    if (!resetting && !validEmail(email)) validation.email = "Enter your workspace email address.";
    if (resetting && !validPassword(password)) validation.password = "Use 8–128 characters, with a letter and a number.";
    if (resetting && password !== confirm) validation.confirm = "Your passwords don't match.";
    setErrors(validation);
    if (Object.keys(validation).length) { focusAuthError(); return; }
    setBusy(true);
    try {
      if (resetting) await resetPassword(token!, password);
      else await forgotPassword(email.trim().toLowerCase());
      setPassword(""); setConfirm(""); setSent(true);
    } catch (error) {
      setErrors({ form: error instanceof ApiError ? error.message : "We couldn't reach Leda. Please try again." });
    } finally { setBusy(false); }
  }

  return <AuthPage kicker="Account recovery" title={sent ? (resetting ? "Your password is updated." : "Check your inbox.")
    : resetting ? "Choose a new password." : "Forgot your password?"}
    intro={sent ? (resetting ? "Sign in again on your devices with your new password."
      : "If an account exists for this email, a reset link will arrive shortly. Check your spam folder too.")
      : resetting ? "Use a password you haven't used before. Your reset link expires after 30 minutes."
      : "Enter your workspace email and we'll help you get back in."}>
    {sent ? <p className="auth-message" role="status"><CheckCircle2 size={18} />{resetting ? "Your previous sessions have been signed out." : "You can request another link after one minute."}</p> :
      <form className="auth-form" noValidate onSubmit={submit} aria-busy={busy}>
        {resetting ? <>
          <AuthInput id="reset-password" label="New password" type="password" autoComplete="new-password" required maxLength={128}
            value={password} onChange={e => setPassword(e.target.value)} error={errors.password} />
          <AuthInput id="reset-confirm" label="Confirm new password" type="password" autoComplete="new-password" required maxLength={128}
            value={confirm} onChange={e => setConfirm(e.target.value)} error={errors.confirm} />
        </> : <AuthInput id="recovery-email" label="Email address" type="email" autoComplete="email" required maxLength={254}
          value={email} onChange={e => setEmail(e.target.value)} error={errors.email} />}
        {errors.form && <p className="auth-error" role="alert">{errors.form}</p>}
        <button className="auth-submit" disabled={busy}>{busy ? "One moment…" : resetting ? "Update password" : "Send reset link"}<ArrowRight size={17} /></button>
      </form>}
    <p className="auth-signup"><a href="#/signin">Back to sign in</a>{resetting && !sent && <> · <a href="#/forgot-password">Request a new link</a></>}</p>
  </AuthPage>;
}
