import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";

export default function AuthInput({ id, label, error, type = "text", ...props }: InputHTMLAttributes<HTMLInputElement> & {
  id: string; label: string; error?: string;
}) {
  const [shown, setShown] = useState(false);
  const Icon = type === "password" ? LockKeyhole : type === "email" ? Mail : UserRound;
  return <div className="auth-field">
    <label htmlFor={id}>{label}</label>
    <div className="auth-input-wrap">
      <Icon size={16} aria-hidden="true" />
      <input {...props} id={id} type={type === "password" && shown ? "text" : type}
        aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-error` : undefined} />
      {type === "password" && <button type="button" className="auth-show-password"
        aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}
        onClick={() => setShown(value => !value)}>{shown ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
    </div>
    {error && <p id={`${id}-error`} className="auth-field-error">{error}</p>}
  </div>;
}

export function focusAuthError() {
  requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.auth-form [aria-invalid="true"]')?.focus());
}
