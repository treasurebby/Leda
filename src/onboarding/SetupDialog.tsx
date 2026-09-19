import { useEffect, useRef } from "react";
import { ArrowUpRight, Mail, X } from "lucide-react";

export type DialogKind = "help" | "save" | "privacy" | "terms" | "restart";

export default function SetupDialog({ kind, onClose, onSave, onRestart, error }: {
  kind: DialogKind;
  onClose: () => void;
  onSave: () => void;
  onRestart: () => void;
  error: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const titles = {
    help: "A little help, whenever you need it.",
    save: "Pick up where you left off.",
    privacy: "Your information, your choice.",
    terms: "About this setup preview.",
    restart: "Start with a clean page?",
  };

  return (
    <dialog ref={dialog} className="setup-dialog" aria-labelledby="setup-dialog-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="setup-dialog-content">
        <button type="button" className="setup-icon-button dialog-close" onClick={onClose} aria-label="Close dialog"><X size={20} /></button>
        <h2 id="setup-dialog-title">{titles[kind]}</h2>
        {kind === "help" && <>
          <p>You don't need to get everything ready at once. Start with your business details and add the rest at your own pace.</p>
          <div className="setup-faq">
            <details><summary>Can I finish setting up later?</summary><p>Yes. Choose Save and exit to keep a draft on this device for up to seven days. You'll need to re-enter your password when you come back.</p></details>
            <details><summary>What if I don't have a spreadsheet?</summary><p>Download a template from the product or retailer step, fill it in with your information, and upload it. You can also skip those steps for now.</p></details>
            <details><summary>Does this create live accounts?</summary><p>This is an interactive setup preview. File imports run in your browser. Authentication, WhatsApp activation, banking and staff invitations need connected services before going live.</p></details>
          </div>
          <a className="setup-button setup-button-primary help-email" href="mailto:hello@leda.africa?subject=Help%20with%20my%20Leda%20setup"><Mail size={16} />Email the Leda team<ArrowUpRight size={15} /></a>
        </>}
        {kind === "save" && <>
          <p>Save your business details, imports and team list on this device for seven days. You can return to this page to continue.</p>
          <p><strong>Passwords are never saved.</strong> Only save a draft if you're using a device you trust. No live account is created.</p>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="dialog-actions"><button className="setup-button setup-button-secondary" type="button" onClick={onClose}>Keep setting up</button><button className="setup-button setup-button-primary" type="button" onClick={onSave}>Save and exit<ArrowUpRight size={15} /></button></div>
        </>}
        {kind === "privacy" && <>
          <p>Your onboarding entries and spreadsheets are processed in this browser. This preview does not upload them to a Leda server or send invitations.</p>
          <p>Drafts are saved to this device only when you select Save and exit. They expire after seven days. Passwords are excluded from drafts and exports.</p>
          <p>Starting a new setup clears the saved draft. External fonts and landing-page photos are loaded from their providers. Contact <a href="mailto:hello@leda.africa">hello@leda.africa</a> with privacy questions.</p>
          <p className="dialog-small-print">This notice describes the preview, not a live service's privacy policy.</p>
        </>}
        {kind === "terms" && <>
          <p>This onboarding is a product preview for exploring how Leda could fit your business. Completing it does not create a live account, provision a WhatsApp number or open a bank account.</p>
          <p>Use sample data where possible. Imported account references cannot receive payments. Please do not transfer money to any reference shown here.</p>
          <p>Live service terms, business verification and secure account activation must be completed when a production service is connected.</p>
        </>}
        {kind === "restart" && <>
          <p>This clears the current setup and any draft saved on this device. Download your setup summary first if you'd like to keep a copy.</p>
          <div className="dialog-actions"><button type="button" className="setup-button setup-button-secondary" onClick={onClose}>Keep my setup</button><button type="button" className="setup-button setup-button-primary" onClick={onRestart}>Start fresh</button></div>
        </>}
      </div>
    </dialog>
  );
}