import { useEffect, useState, type FormEvent } from "react";
import { Check, LockKeyhole, LogOut, Save, Smartphone } from "lucide-react";
import type { Me } from "../api/auth";
import { ApiError } from "../api/client";
import { updateBridge, updateBusiness } from "../api/onboarding";
import { useSession } from "../auth/Session";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner", admin: "Administrator", ops: "Operations manager", sales: "Sales representative",
  accountant: "Accountant", warehouse: "Warehouse staff", viewer: "Viewer",
};

export default function SettingsPage({ account }: { account: Me }) {
  const { reload, signOut } = useSession();
  const editable = account.role === "owner" || account.role === "admin";
  const [businessName, setBusinessName] = useState(account.business.name);
  const [industry, setIndustry] = useState(account.business.industry);
  const [method, setMethod] = useState<"current" | "virtual">((account.business.bridge_method as "current" | "virtual") || "virtual");
  const [phone, setPhone] = useState(account.business.whatsapp_number || "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setBusinessName(account.business.name);
    setIndustry(account.business.industry);
    setMethod((account.business.bridge_method as "current" | "virtual") || "virtual");
    setPhone(account.business.whatsapp_number || "");
  }, [account]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || busy) return;
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      await updateBusiness({ name: businessName.trim(), industry: industry.trim() });
      await updateBridge(method, method === "current" ? phone : null);
      await reload();
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "We couldn't save your workspace settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-page">
      <div className="dash-content-head settings-page-head">
        <div><h2>Workspace settings</h2><p>Keep your business profile and connected channels up to date.</p></div>
        <button type="button" className="dash-button-ghost" onClick={() => { void signOut().catch(() => undefined); }}><LogOut size={15.5} />Sign out</button>
      </div>

      <form className="settings-grid" onSubmit={save}>
        <section className="settings-panel">
          <div className="settings-panel-heading"><div><p className="settings-eyebrow">Business profile</p><h3>Your workspace</h3></div><span className="settings-status"><Check size={13} />Live</span></div>
          <label className="settings-field"><span>Business name</span><input value={businessName} onChange={event => setBusinessName(event.target.value)} disabled={!editable} /></label>
          <label className="settings-field"><span>Industry</span><input value={industry} onChange={event => setIndustry(event.target.value)} disabled={!editable} /></label>
          <div className="settings-readonly"><span>Workspace ID</span><code>{account.business.id}</code></div>
          <p className="settings-note">Business profile editing is available to owners and administrators.</p>
        </section>

        <section className="settings-panel">
          <div className="settings-panel-heading"><div><p className="settings-eyebrow">WhatsApp connection</p><h3>How retailers reach you</h3></div><Smartphone size={20} /></div>
          <div className="settings-choice-group">
            <label className={`settings-choice${method === "current" ? " settings-choice-selected" : ""}`}><input type="radio" name="method" checked={method === "current"} onChange={() => setMethod("current")} disabled={!editable} /><span><strong>Use my current number</strong><small>Keep the WhatsApp number retailers already know.</small></span></label>
            <label className={`settings-choice${method === "virtual" ? " settings-choice-selected" : ""}`}><input type="radio" name="method" checked={method === "virtual"} onChange={() => setMethod("virtual")} disabled={!editable} /><span><strong>Leda Virtual Number</strong><small>A dedicated line for your business, activated after verification.</small></span></label>
          </div>
          {method === "current" && <label className="settings-field"><span>WhatsApp number</span><input type="tel" value={phone} onChange={event => setPhone(event.target.value)} disabled={!editable} placeholder="+234 801 234 5678" /></label>}
          <p className="settings-note">Changing this setting updates the workspace connection used during onboarding.</p>
        </section>

        <section className="settings-panel settings-account-panel">
          <div className="settings-panel-heading"><div><p className="settings-eyebrow">Your account</p><h3>{account.user.full_name}</h3></div><LockKeyhole size={20} /></div>
          <div className="settings-account-row"><span>Email</span><strong>{account.user.email}</strong></div>
          <div className="settings-account-row"><span>Phone</span><strong>{account.user.phone}</strong></div>
          <div className="settings-account-row"><span>Role</span><strong>{ROLE_LABEL[account.role] ?? account.role}</strong></div>
          <p className="settings-note">Password and recovery options are managed from the sign-in flow.</p>
        </section>

        <div className="settings-actions">
          {error && <p className="setup-form-error" role="alert">{error}</p>}
          {saved && <p className="settings-saved" role="status"><Check size={15} />Settings saved.</p>}
          {editable && <button type="submit" className="dash-button-primary" disabled={busy}><Save size={15.5} />{busy ? "Saving..." : "Save changes"}</button>}
        </div>
      </form>
    </div>
  );
}
