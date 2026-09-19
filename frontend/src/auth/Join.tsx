import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import AuthPage from "./AuthPage";
import AuthInput, { focusAuthError } from "./AuthInput";
import { validPassword } from "../onboarding/model";
import { acceptInvite } from "../api/auth";
import { ApiError } from "../api/client";
import { afterSignIn, useSession } from "./Session";

export default function Join({ token }: { token: string }) {
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const { reload } = useSession();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const next: Record<string, string> = {};
    if (fullName.trim().length < 2) next.fullName = "Enter your full name.";
    if (!validPassword(password)) next.password = "Use 8–128 characters, with a letter and a number.";
    setErrors(next);
    if (Object.keys(next).length) { focusAuthError(); return; }
    setBusy(true);
    try {
      await acceptInvite(token, fullName.trim(), password);
      window.location.hash = afterSignIn(await reload());
    } catch (error) {
      setErrors({ form: error instanceof ApiError ? error.message : "We couldn't reach Leda. Please try again." });
    } finally { setBusy(false); }
  }
  return <AuthPage kicker="Your team is waiting" title="Join your workspace." intro="New to Leda? Choose a password. If you already have an account, use its current password.">
    <form className="auth-form" onSubmit={submit} noValidate aria-busy={busy}>
      <AuthInput id="join-name" label="Your full name" autoComplete="name" maxLength={120} required
        value={fullName} onChange={e => setFullName(e.target.value)} error={errors.fullName} />
      <AuthInput id="join-password" label="Password" type="password" autoComplete="new-password" maxLength={128} required
        value={password} onChange={e => setPassword(e.target.value)} error={errors.password} />
      {errors.form && <p className="auth-error" role="alert">{errors.form}</p>}
      <button type="submit" className="auth-submit" disabled={busy}>{busy ? "Joining…" : "Join the team"}<ArrowRight size={17} /></button>
    </form>
    <p className="auth-signup"><a href="#/signin">Back to sign in</a> · <a href="#/forgot-password">Forgot password?</a></p>
  </AuthPage>;
}
