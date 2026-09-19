import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Check, ChevronDown, Eye, EyeOff, Search, X } from "lucide-react";
import { INDUSTRIES } from "./model";

type FieldProps = {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
};

export function Field({ id, label, error, hint, children, wide }: FieldProps) {
  return (
    <div className={`setup-field${wide ? " setup-field-wide" : ""}`}>
      <label className="setup-label" htmlFor={id}>{label}</label>
      {children}
      <p id={`${id}-help`} className={error ? "field-error" : "field-hint"} role={error ? "alert" : undefined} hidden={!error && !hint}>
        {error || hint}
      </p>
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export function TextInput({ invalid, className = "", id, ...props }: InputProps) {
  return <input {...props} id={id} className={`setup-input ${className}`} aria-invalid={invalid || undefined} aria-describedby={id ? `${id}-help` : undefined} />;
}

export function PasswordInput({ id, invalid, ...props }: InputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-control">
      <TextInput {...props} id={id} type={visible ? "text" : "password"} invalid={invalid} maxLength={128} />
      <button type="button" className="password-toggle" onClick={() => setVisible(value => !value)} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible}>
        {visible ? <EyeOff size={17} strokeWidth={1.6} /> : <Eye size={17} strokeWidth={1.6} />}
      </button>
    </div>
  );
}

export function PhoneInput({ id, invalid, ...props }: InputProps) {
  return (
    <div className={`phone-control${invalid ? " phone-invalid" : ""}`}>
      <span className="phone-prefix" aria-hidden="true">
        <svg width="19" height="13" viewBox="0 0 21 14" fill="none"><rect width="21" height="14" rx="1.5" fill="#07864B" /><path d="M7 0h7v14H7z" fill="#fff" /></svg>
        <span>+234</span>
      </span>
      <TextInput {...props} id={id} type="tel" inputMode="tel" autoComplete="tel-national" maxLength={22} invalid={invalid} placeholder="801 234 5678" />
    </div>
  );
}

export function IndustrySelect({ value, onChange, invalid }: { value: string; onChange: (value: string) => void; invalid: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = [...INDUSTRIES.filter(industry => industry.toLowerCase().includes(search.toLowerCase().trim())), "Other"];

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`industry-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(option: string) {
    onChange(option);
    setOpen(false);
    setSearch("");
    trigger.current?.focus();
  }

  return (
    <div className="industry-select" ref={root} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button id="identity-industry" ref={trigger} type="button" className={`setup-input select-trigger${value ? "" : " is-placeholder"}`} aria-haspopup="listbox" aria-expanded={open} aria-controls="industry-options" aria-invalid={invalid || undefined} aria-describedby="identity-industry-help" onClick={() => { setOpen(current => !current); setSearch(""); setActive(0); }} onKeyDown={event => {
        if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); }
      }}>
        <span>{value === "Other" ? "Other (tell us what you sell)" : value || "Select your industry"}</span>
        <ChevronDown size={16} className={open ? "chevron-open" : ""} />
      </button>
      {open && (
        <div className="industry-popover">
          <div className="industry-search">
            <Search size={16} aria-hidden="true" />
            <input ref={input} value={search} role="combobox" aria-expanded="true" aria-controls="industry-options" aria-activedescendant={`industry-option-${active}`} aria-label="Search industries" placeholder="Search for your industry" onChange={event => { setSearch(event.target.value); setActive(0); }} onKeyDown={event => {
              if (event.key === "ArrowDown") { event.preventDefault(); setActive(current => Math.min(current + 1, options.length - 1)); }
              if (event.key === "ArrowUp") { event.preventDefault(); setActive(current => Math.max(current - 1, 0)); }
              if (event.key === "Enter") { event.preventDefault(); choose(options[active] ?? "Other"); }
              if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
              if (event.key === "Tab") setOpen(false);
            }} />
            {search && <button type="button" aria-label="Clear search" onClick={() => { setSearch(""); setActive(0); input.current?.focus(); }}><X size={14} /></button>}
          </div>
          <div id="industry-options" role="listbox" aria-label="Industry category" className="industry-options">
            {options.map((option, index) => (
              <button type="button" id={`industry-option-${index}`} key={option} role="option" tabIndex={-1} aria-selected={value === option} className={`industry-option${index === active ? " option-active" : ""}`} onMouseMove={() => setActive(index)} onClick={() => choose(option)}>
                <span>{option === "Other" ? "Other, I'll enter it myself" : option}</span>
                {option === value && <Check size={15} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}