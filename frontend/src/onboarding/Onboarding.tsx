import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, CircleHelp, Download, LockKeyhole, Pencil } from "lucide-react";
import Progress from "./Progress";
import { BridgeStep, IdentityStep, ProductsStep, RetailersStep, TeamStep } from "./Steps";
import SetupDialog, { type DialogKind } from "./SetupDialog";
import {
  EMPTY_IDENTITY, EMPTY_STAFF, delay, downloadFile, normalisePhone,
  validateIdentity, validateStaff, type BridgeMethod, type FieldErrors,
  type Identity, type ImportJob, type ImportResult, type Product,
  type Retailer, type StaffInput, type StaffMember,
} from "./model";
import { SAMPLE_PRODUCTS, SAMPLE_RETAILERS, parseProducts, parseRetailers, readSpreadsheet } from "./imports";
import { clearDraft, readDraft, safeSummary, saveDraft, type SetupData } from "./draft";
import { ApiError } from "../api/client";
import { login, register } from "../api/auth";
import { api } from "../api/client";
import { useSession } from "../auth/Session";
import { cancelInvite, createInvite, csvBlob, startImport, updateBridge, waitForImport } from "../api/onboarding";
import "./onboarding.css";

const HEADINGS = [
  ["First, a little about you.", "Tell us about the person and the business behind the orders."],
  ["Keep the conversation going.", "Choose how your retailers will connect with your business on WhatsApp."],
  ["Help Leda learn your shelves.", "Your product list turns everyday messages into the right items and quantities."],
  ["Put a name to every payment.", "Import your retailers to prepare their dedicated virtual accounts."],
  ["Good business takes good people.", "Bring your team into the picture, with the right access for each person."],
];

function focusError() {
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('.setup-form [aria-invalid="true"]')?.focus();
  });
}

export default function Onboarding() {
  const { user: session, reload, signOut } = useSession();
  const [draft] = useState(() => {
    const saved = readDraft();
    return session && saved?.identity.email.toLowerCase() !== session.user.email.toLowerCase() ? null : saved;
  });
  const [identity, setIdentity] = useState<Identity>(() => ({ ...EMPTY_IDENTITY, ...draft?.identity, password: "" }));
  const [method, setMethod] = useState<BridgeMethod>(draft?.method ?? null);
  const [businessPhone, setBusinessPhone] = useState(draft?.businessPhone ?? "");
  const [products, setProducts] = useState<ImportResult<Product> | null>(draft?.products ?? null);
  const [retailers, setRetailers] = useState<ImportResult<Retailer> | null>(draft?.retailers ?? null);
  const [staff, setStaff] = useState<StaffMember[]>(draft?.staff ?? []);
  const [staffInput, setStaffInput] = useState<StaffInput>({ ...EMPTY_STAFF });
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [direction, setDirection] = useState(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [importError, setImportError] = useState("");
  const [job, setJob] = useState<ImportJob | null>(null);
  const [finished, setFinished] = useState(false);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [saveError, setSaveError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const [resuming, setResuming] = useState(!!draft);
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(!!session);
  const [formError, setFormError] = useState("");
  const resumeStep = useRef(draft?.step ?? 0);
  const controller = useRef<AbortController | null>(null);
  const reduceMotion = useReducedMotion();
  const card = useRef<HTMLElement>(null);

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (session) {
      setRegistered(true);
      setIdentity(current => ({
        ...current, fullName: session.user.full_name, email: session.user.email,
        phone: session.user.phone || "", businessName: session.business.name,
        industry: session.business.custom_industry ? "Other" : session.business.industry,
        customIndustry: session.business.custom_industry ?? "", password: "",
      }));
      if (session.business.bridge_method && !method) setMethod(session.business.bridge_method as BridgeMethod);
      if (session.business.whatsapp_number && !businessPhone) setBusinessPhone(session.business.whatsapp_number);
      setResuming(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const data: SetupData = { identity, method, businessPhone, products, retailers, staff };

  function navigate(next: number) {
    if (job || busy) return;
    setDirection(next >= step ? 1 : -1);
    setStep(next);
    setFinished(false);
    setErrors({});
    setImportError("");
    setFormError("");
    if (window.innerWidth < 640) card.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  function nextStep() {
    const next = Math.min(step + 1, 4);
    setReached(current => Math.max(current, next));
    navigate(next);
  }

  function changeIdentity(key: keyof Identity, value: string) {
    setIdentity(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: "" }));
  }

  function changeStaff(key: keyof StaffInput, value: string) {
    setStaffInput(current => ({ ...current, [key]: value }));
    const errorKey = `staff${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    setErrors(current => ({ ...current, [errorKey]: "" }));
  }

  function chooseMethod(value: BridgeMethod) {
    setMethod(value);
    if (value === "current" && !businessPhone) setBusinessPhone(identity.phone);
    setErrors({});
  }

  async function importList(kind: "products" | "retailers", file?: File) {
    controller.current?.abort();
    const activeController = new AbortController();
    controller.current = activeController;
    const { signal } = activeController;
    setJob({ kind, phase: 0 });
    setImportError("");
    try {
      // Validate in the browser first for instant feedback; the server re-validates with the same rules.
      const rows = file ? await readSpreadsheet(file) : kind === "products" ? SAMPLE_PRODUCTS : SAMPLE_RETAILERS;
      const productRows = kind === "products" ? parseProducts(rows) : null;
      const retailerRows = kind === "retailers" ? parseRetailers(rows) : null;
      const fileName = file?.name ?? `leda-sample-${kind}.csv`;
      await delay(300, signal);
      setJob({ kind, phase: 1 });
      const started = await startImport(kind, file ?? csvBlob(rows), fileName);
      setJob({ kind, phase: 2 });
      const result = await waitForImport(started.id, signal);
      if (signal.aborted) return;
      if (result.status === "failed") throw new Error(result.errors[0] ?? "The import failed. Please try again.");
      if (productRows) setProducts({ fileName, rows: productRows, sample: !file });
      if (retailerRows) setRetailers({ fileName, rows: retailerRows, sample: !file });
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) setImportError("Your session has expired. Go back to step 1 to sign in again.");
      else setImportError(error instanceof Error ? error.message : "We couldn't read the file. Please try again.");
    } finally {
      if (controller.current === activeController) { setJob(null); controller.current = null; }
    }
  }

  function cancelImport() {
    controller.current?.abort();
    controller.current = null;
    setJob(null);
  }

  async function addMember(): Promise<StaffMember | null> {
    const validation = validateStaff(staffInput, staff, identity.email);
    if (Object.keys(validation).length) { setErrors(validation); focusError(); return null; }
    const email = staffInput.email.trim().toLowerCase();
    const phone = normalisePhone(staffInput.phone)!;
    setBusy(true);
    try {
      const invite = await createInvite(email, phone, staffInput.role);
      const member: StaffMember = { id: invite.id, inviteId: invite.id, email, phone, role: staffInput.role };
      setStaff(current => [...current, member]);
      setStaffInput({ ...EMPTY_STAFF });
      setErrors({});
      return member;
    } catch (error) {
      setErrors(error instanceof ApiError ? { staffEmail: error.message } : { staffEmail: "We couldn't send that invitation. Please try again." });
      focusError();
      return null;
    } finally {
      setBusy(false);
    }
  }

  function removeMember(id: string) {
    const member = staff.find(item => item.id === id);
    setStaff(current => current.filter(item => item.id !== id));
    if (member?.inviteId) void cancelInvite(member.inviteId).catch(() => undefined);
  }

  async function completeSetup(skipPendingMember = false) {
    if (busy) return;
    const identityErrors = validateIdentity(identity);
    if (registered) delete identityErrors.password;
    if (Object.keys(identityErrors).length) {
      navigate(0);
      setErrors(identityErrors);
      focusError();
      return;
    }
    if (!method || (method === "current" && !normalisePhone(businessPhone))) {
      navigate(1);
      setErrors(!method ? { bridge: "Choose how you'd like to connect your business." } : { bridgePhone: "Enter a valid Nigerian mobile number." });
      focusError();
      return;
    }
    const pending = !!(staffInput.email.trim() || staffInput.phone.trim());
    if (!skipPendingMember && pending && !(await addMember())) return;
    if (skipPendingMember) setStaffInput({ ...EMPTY_STAFF });
    setBusy(true);
    try {
      await api.post("/business/complete-setup");
      await reload();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "We couldn't finish your setup. Please try again.");
      return;
    } finally { setBusy(false); }
    setReached(4);
    setFinished(true);
    setErrors({});
    clearDraft();
    if (window.innerWidth < 640) card.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (job || busy) return;
    setFormError("");
    if (step === 0) {
      const validation = validateIdentity(identity);
      if (registered) delete validation.password;
      setErrors(validation);
      if (Object.keys(validation).length) { focusError(); return; }
      setBusy(true);
      try {
        if (registered) {
          // This identity is already authenticated; don't create another account or retain its password.
        } else if (resuming && draft?.accountCreated) {
          // Returning: the account already exists, so the password re-entry is a real sign-in.
          await login(identity.email.trim().toLowerCase(), identity.password);
          setRegistered(true);
        } else {
          await register({
            full_name: identity.fullName.trim(), phone: identity.phone, email: identity.email.trim().toLowerCase(),
            password: identity.password, business_name: identity.businessName.trim(),
            industry: identity.industry === "Other" ? identity.customIndustry.trim() : identity.industry,
            custom_industry: identity.industry === "Other" ? identity.customIndustry.trim() : null,
          });
          setRegistered(true);
        }
        await reload();
        setIdentity(current => ({ ...current, password: "" }));
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.status === 409) {
            setErrors({ email: "An account with this email already exists. Use Sign in below to continue." });
          } else if (error.status === 401) setErrors({ password: "That password doesn't match this account." });
          else if (error.status === 422) {
            const keys: Record<string, string> = { full_name: "fullName", business_name: "businessName", custom_industry: "customIndustry" };
            setErrors(Object.fromEntries(Object.entries(error.fieldErrors()).map(([key, value]) => [keys[key] ?? key, value])));
          }
          else setFormError(error.message);
        } else setFormError("We couldn't reach Leda. Check your connection and try again.");
        focusError();
        return;
      } finally {
        setBusy(false);
      }
      if (resuming && resumeStep.current > 1) {
        const resume = resumeStep.current;
        setResuming(false);
        setReached(resume);
        navigate(resume);
        return;
      }
      setResuming(false);
    }
    if (step === 1) {
      if (!method) { setErrors({ bridge: "Choose the number option that works for your business." }); return; }
      if (method === "current" && !normalisePhone(businessPhone)) { setErrors({ bridgePhone: "Enter a valid Nigerian mobile number." }); focusError(); return; }
      setBusy(true);
      try {
        await updateBridge(method, method === "current" ? normalisePhone(businessPhone) : null);
      } catch (error) {
        setFormError(error instanceof ApiError ? error.message : "We couldn't save your connection choice. Please try again.");
        return;
      } finally {
        setBusy(false);
      }
    }
    if (step === 2 && !products) { setImportError("Add a product list, try sample data, or choose Skip for later."); return; }
    if (step === 3 && !retailers) { setImportError("Import your retailers, try sample data, or choose I'll do this later."); return; }
    if (step === 4) { await completeSetup(); return; }
    nextStep();
  }

  function saveAndExit() {
    try {
      saveDraft(data, step, registered);
      setDialog(null);
      window.location.hash = "/welcome";
    } catch {
      setSaveError("Your browser couldn't save this draft. Storage may be full or disabled. Keep this tab open to retain your progress.");
    }
  }

  async function restart() {
    try { await signOut(); } catch { /* The local session is cleared even if the connection is lost. */ }
    clearDraft();
    setIdentity({ ...EMPTY_IDENTITY });
    setMethod(null);
    setBusinessPhone("");
    setProducts(null);
    setRetailers(null);
    setStaff([]);
    setStaffInput({ ...EMPTY_STAFF });
    setResuming(false);
    setRegistered(false);
    resumeStep.current = 0;
    setReached(0);
    setDownloaded(false);
    setDialog(null);
    navigate(0);
  }

  function exportSummary() {
    const summary = { preparedAt: new Date().toISOString(), ...safeSummary(data) };
    downloadFile(JSON.stringify(summary, null, 2), "leda-workspace-setup.json", "application/json");
    setDownloaded(true);
  }

  const importProps = (kind: "products" | "retailers") => ({
    job, error: importError,
    onFile: (file: File) => { void importList(kind, file); },
    onSample: () => { void importList(kind); },
    onClear: () => { if (kind === "products") setProducts(null); else setRetailers(null); setImportError(""); },
    onError: setImportError, onSkip: nextStep, onCancel: cancelImport,
  });

  const summaryRows = [
    { label: "Your business", value: identity.businessName, detail: identity.industry === "Other" ? identity.customIndustry : identity.industry },
    { label: "Your connection", value: method === "current" ? normalisePhone(businessPhone) || businessPhone : "Leda Virtual Number", detail: method === "current" ? "Saved to your workspace" : "Selected, number provisioning pending" },
    { label: "Your products", value: products ? `${products.rows.length} products imported` : "Add products later", detail: products?.sample ? "Sample catalog" : products?.fileName },
    { label: "Your retailers", value: retailers ? `${retailers.rows.length} retailers imported` : "Add retailers later", detail: retailers ? "Virtual accounts are created from the Retailers page" : undefined },
    { label: "Your team", value: staff.length ? `${staff.length} ${staff.length === 1 ? "invitation" : "invitations"} sent` : "Just you, for now", detail: staff.length ? "Each person sets their own password from the email" : "You can add your team anytime" },
  ];

  return (
    <div className="onboarding-page">
      <header className="setup-topbar">
        <a href="#/welcome" className="onboarding-brand" aria-label="Leda home">
          <svg viewBox="0 0 40 40" width="39" height="39" aria-hidden="true"><rect width="40" height="40" rx="11" fill="#065F46" /><path d="M9 25c8 0 9-12 15-12 4 0 6 3 8 5" fill="none" stroke="#FDFBF7" strokeWidth="3.5" strokeLinecap="round" /><circle cx="30" cy="23" r="2.7" fill="#D97706" /></svg>
          <span>Leda</span>
        </a>
        <div className="setup-header-actions">
          {!finished && <button type="button" className="save-exit-button" disabled={!!job} onClick={() => { setSaveError(""); setDialog("save"); }}>Save and exit</button>}
          <button type="button" className="setup-help-button" aria-label="Get help with your setup" onClick={() => setDialog("help")}><CircleHelp size={17} strokeWidth={1.65} /><span>Need a hand?</span></button>
        </div>
      </header>

      <main className="setup-main">
        <motion.div className="setup-intro" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.55 }}>
          <h1>A little setup. A lot more order.</h1>
          <p>Five simple steps to a business that flows better.</p>
        </motion.div>

        <motion.section ref={card} className="setup-card" aria-label="Set up your Leda workspace" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.65, delay: reduceMotion ? 0 : 0.1, ease: [0.16, 1, 0.3, 1] }}>
          <Progress step={step} reached={reached} finished={finished} disabled={!!job} onNavigate={navigate} />
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            {finished ? (
              <motion.div key="complete" className="setup-complete" initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onAnimationComplete={() => document.getElementById("setup-complete-title")?.focus({ preventScroll: true })}>
                <div className="completion-heading">
                  <motion.svg width="38" height="38" viewBox="0 0 38 38" fill="none" aria-hidden="true"><motion.path d="M8 20l7 7L31 11" stroke="#065F46" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduceMotion ? 0 : 0.65 }} /></motion.svg>
                  <h2 id="setup-complete-title" tabIndex={-1}>That's the setup sorted, {identity.fullName.trim().split(" ")[0]}.</h2>
                  <p>Your workspace plan is ready. Here's what you've put in place.</p>
                </div>
                <dl className="setup-summary">
                  {summaryRows.map((row, index) => <div key={row.label} className="summary-row"><dt>{row.label}</dt><dd><strong>{row.value}</strong>{row.detail && <span>{row.detail}</span>}</dd><button type="button" className="setup-icon-button" onClick={() => navigate(index)} aria-label={`Edit ${row.label.toLowerCase()}`}><Pencil size={14} /></button></div>)}
                </dl>
                <p className="completion-disclosure">Your account, products, retailers and team invitations are saved to your Leda workspace. WhatsApp number provisioning and retailer virtual accounts activate once those providers are connected. Passwords are never included in your summary.</p>
                <a className="setup-button setup-button-primary open-dashboard" href="#/dashboard"><ArrowRight size={16} />Open the Command Center</a>
                <p className="download-status" role="status">{downloaded ? "Your summary has been downloaded. Keep it somewhere safe." : "You're signed in. Your workspace is ready whenever you come back."}</p>
                <div className="completion-secondary-actions">
                  <button type="button" className="setup-subtle-button download-summary" onClick={exportSummary}><Download size={14} />Download setup summary</button>
                  <button type="button" className="setup-subtle-button restart-button" onClick={() => setDialog("restart")}>Start a new setup</button>
                </div>
              </motion.div>
            ) : (
              <motion.form key={step} className="setup-form" onSubmit={submit} noValidate custom={direction} variants={{ enter: (direction: number) => ({ opacity: 0, x: reduceMotion ? 0 : direction * 16 }), active: { opacity: 1, x: 0 }, leave: (direction: number) => ({ opacity: 0, x: reduceMotion ? 0 : direction * -10 }) }} initial="enter" animate="active" exit="leave" transition={{ duration: reduceMotion ? 0 : 0.22 }} onAnimationComplete={() => document.getElementById("setup-step-title")?.focus({ preventScroll: true })}>
                <div className="step-heading">
                  <div className="step-heading-line"><h2 id="setup-step-title" tabIndex={-1}>{HEADINGS[step][0]}</h2><span className="step-counter">Step {step + 1} of 5</span></div>
                  <p>{resuming && step === 0 ? "Welcome back. Your draft is here. Re-enter your password to keep going." : HEADINGS[step][1]}</p>
                </div>

                {step === 0 && <IdentityStep identity={identity} onChange={changeIdentity} errors={errors} onLegal={setDialog} locked={registered} />}
                {step === 1 && <BridgeStep method={method} onMethod={chooseMethod} phone={businessPhone} onPhone={value => { setBusinessPhone(value); setErrors({}); }} errors={errors} />}
                {step === 2 && <ProductsStep products={products} {...importProps("products")} />}
                {step === 3 && <RetailersStep retailers={retailers} {...importProps("retailers")} />}
                {step === 4 && <TeamStep staff={staff} input={staffInput} onChange={changeStaff} onAdd={() => { void addMember(); }} onRemove={removeMember} onRole={(id, role) => setStaff(current => current.map(member => member.id === id ? { ...member, role } : member))} errors={errors} onSkip={() => { void completeSetup(true); }} />}

                {formError && <p className="setup-form-error" role="alert">{formError}</p>}
                {step === 0 && <p className="setup-reassurance">{registered ? "You're signed in. Continue setting up your workspace." : <a href="#/signin?next=%23%2Fonboarding">Already have an account? Sign in</a>}</p>}

                <div className="setup-form-actions">
                  <button type="button" className="setup-back-button" disabled={!!job || busy} onClick={() => step ? navigate(step - 1) : (window.location.hash = "/welcome")}><ArrowLeft size={16} />{step ? "Back" : "Back to Leda"}</button>
                  <button type="submit" className="setup-button setup-button-primary continue-button" disabled={!!job || busy} aria-busy={busy}>{busy ? "One moment…" : step === 4 ? "Finish setup" : "Continue"}<ArrowRight size={17} /></button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.section>

        <p className="setup-reassurance"><LockKeyhole size={13} strokeWidth={1.6} />Sent securely to your Leda workspace. Always yours.</p>
      </main>

      <footer className="setup-page-footer">
        <p>&copy; {new Date().getFullYear()} Leda. Built for the way you trade.</p>
        <div><button type="button" onClick={() => setDialog("privacy")}>Privacy policy</button><button type="button" onClick={() => setDialog("terms")}>Terms of service</button></div>
      </footer>

      {dialog && <SetupDialog kind={dialog} onClose={() => setDialog(null)} onSave={saveAndExit} onRestart={restart} error={saveError} />}
    </div>
  );
}
