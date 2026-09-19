import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import AuthPage from "./AuthPage";
import { Field, PasswordInput, TextInput } from "../onboarding/Fields";
import { validPassword } from "../onboarding/model";
import { acceptInvite } from "../api/auth";
import { ApiError } from "../api/client";

/** Invitation landing page: #/join/<token>. The invitee picks their own password here. */
export default function Join({ token }: { token: string }) {
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (fullName.trim().length < 2) next.fullName = "Please enter your full name.";
    if (!validPassword(password)) next.password = "Use at least 8 characters, with a letter and a number.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await acceptInvite(token, fullName.trim(), password);
      window.location.hash = "/dashboard";
    } catch (error) {
      setErrors({ form: error instanceof ApiError ? error.message : "We couldn't reach Leda. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPage title="You've been invited." intro="Set up your login to join the team on Leda.">
      <form className="setup-form" onSubmit={submit} noValidate>
        <div className="setup-fields">
          <Field id="join-name" label="Your full name" error={errors.fullName}>
            <TextInput id="join-name" autoComplete="name" value={fullName} onChange={e => { setFullName(e.target.value); setErrors({}); }} invalid={!!errors.fullName} required />
          </Field>
          <Field id="join-password" label="Choose a password" error={errors.password} hint="At least 8 characters, with a letter and a number.">
            <PasswordInput id="join-password" autoComplete="new-password" value={password} onChange={e => { setPassword(e.target.value); setErrors({}); }} invalid={!!errors.password} required />
          </Field>
        </div>
        {errors.form && <p className="setup-form-error" role="alert">{errors.form}</p>}
        <div className="setup-form-actions">
          <a className="setup-back-button" href="#/login">Already have a login? Sign in</a>
          <button type="submit" className="setup-button setup-button-primary continue-button" disabled={busy} aria-busy={busy}>{busy ? "Joining…" : "Join the team"}<ArrowRight size={17} /></button>
        </div>
      </form>
    </AuthPage>
  );
}
