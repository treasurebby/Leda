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
  const [draft] = useState(readDraft);
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
  const resumeStep = useRef(draft?.step ?? 0);
  const controller = useRef<AbortController | null>(null);
  const reduceMotion = useReducedMotion();
  const card = useRef<HTMLElement>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const data: SetupData = { identity, method, businessPhone, products, retailers, staff };

  function navigate(next: number) {
    if (job) return;
    setDirection(next >= step ? 1 : -1);
    setStep(next);
    setFinished(false);
    setErrors({});
    setImportError("");
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
      const rows = file ? await readSpreadsheet(file) : kind === "products" ? SAMPLE_PRODUCTS : SAMPLE_RETAILERS;
      const productRows = kind === "products" ? parseProducts(rows) : null;
      const retailerRows = kind === "retailers" ? parseRetailers(rows) : null;
      await delay(450, signal);
      setJob({ kind, phase: 1 });
      await delay(650, signal);
      setJob({ kind, phase: 2 });
      await delay(600, signal);
      if (signal.aborted) return;
      const fileName = file?.name ?? `leda-sample-${kind}.csv`;
      if (productRows) setProducts({ fileName, rows: productRows, sample: !file });
      if (retailerRows) setRetailers({ fileName, rows: retailerRows, sample: !file });
    } catch (error) {
      if (!signal.aborted) setImportError(error instanceof Error ? error.message : "We couldn't read the file. Please try again.");
    } finally {
      if (controller.current === activeController) { setJob(null); controller.current = null; }
    }
  }

  function cancelImport() {
    controller.current?.abort();
    controller.current = null;
    setJob(null);
  }

  function addMember(): StaffMember | null {
    const validation = validateStaff(staffInput, staff, identity.email);
    if (Object.keys(validation).length) { setErrors(validation); focusError(); return null; }
    const member: StaffMember = {
      id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `staff-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      email: staffInput.email.trim().toLowerCase(),
      phone: normalisePhone(staffInput.phone)!, role: staffInput.role,
    };
    setStaff(current => [...current, member]);
    setStaffInput({ ...EMPTY_STAFF });
    setErrors({});
    return member;
  }

  function completeSetup(skipPendingMember = false) {
    const identityErrors = validateIdentity(identity);
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
    const pending = !!(staffInput.email.trim() || staffInput.phone.trim() || staffInput.password);
    if (!skipPendingMember && pending && !addMember()) return;
    if (skipPendingMember) setStaffInput({ ...EMPTY_STAFF });
    setReached(4);
    setFinished(true);
    setErrors({});
    clearDraft();
    if (window.innerWidth < 640) card.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (job) return;
    if (step === 0) {
      const validation = validateIdentity(identity);
      setErrors(validation);
      if (Object.keys(validation).length) { focusError(); return; }
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
    }
    if (step === 2 && !products) { setImportError("Add a product list, try sample data, or choose Skip for later."); return; }
    if (step === 3 && !retailers) { setImportError("Import your retailers, try sample data, or choose I'll do this later."); return; }
    if (step === 4) { completeSetup(); return; }
    nextStep();
  }

  function saveAndExit() {
    try {
      saveDraft(data, step);
      setDialog(null);
      window.location.hash = "/welcome";
    } catch {
      setSaveError("Your browser couldn't save this draft. Storage may be full or disabled. Keep this tab open to retain your progress.");
    }
  }

  function restart() {
    clearDraft();
    setIdentity({ ...EMPTY_IDENTITY });
    setMethod(null);
    setBusinessPhone("");
    setProducts(null);
    setRetailers(null);
    setStaff([]);
    setStaffInput({ ...EMPTY_STAFF });
    setResuming(false);
    resumeStep.current = 0;
    setReached(0);
    setDownloaded(false);
    setDialog(null);
    navigate(0);
  }

  function exportSummary() {
    const summary = { mode: "preview", preparedAt: new Date().toISOString(), ...safeSummary(data) };
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
    { label: "Your connection", value: method === "current" ? normalisePhone(businessPhone) || businessPhone : "Leda Virtual Number", detail: "Selected, pending activation" },
    { label: "Your products", value: products ? `${products.rows.length} products prepared` : "Add products later", detail: products?.sample ? "Sample catalog" : products?.fileName },
    { label: "Your retailers", value: retailers ? `${retailers.rows.length} retailers prepared` : "Add retailers later", detail: retailers ? "Preview references only" : undefined },
    { label: "Your team", value: staff.length ? `${staff.length} team ${staff.length === 1 ? "member" : "members"} prepared` : "Just you, for now", detail: staff.length ? "Roles assigned, invitations not sent" : "You can add your team anytime" },
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
                <p className="completion-disclosure">This is a setup preview. Live logins, WhatsApp numbers, bank accounts and invitations require connected services. Passwords are not included in your summary.</p>
                <a className="setup-button setup-button-primary open-dashboard" href="#/dashboard"><ArrowRight size={16} />Open the Command Center</a>
                <p className="download-status" role="status">{downloaded ? "Your summary has been downloaded. Keep it somewhere safe." : "Your setup is kept in this session until you leave or refresh."}</p>
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

                {step === 0 && <IdentityStep identity={identity} onChange={changeIdentity} errors={errors} onLegal={setDialog} />}
                {step === 1 && <BridgeStep method={method} onMethod={chooseMethod} phone={businessPhone} onPhone={value => { setBusinessPhone(value); setErrors({}); }} errors={errors} />}
                {step === 2 && <ProductsStep products={products} {...importProps("products")} />}
                {step === 3 && <RetailersStep retailers={retailers} {...importProps("retailers")} />}
                {step === 4 && <TeamStep staff={staff} input={staffInput} onChange={changeStaff} onAdd={addMember} onRemove={id => setStaff(current => current.filter(member => member.id !== id))} onRole={(id, role) => setStaff(current => current.map(member => member.id === id ? { ...member, role } : member))} errors={errors} onSkip={() => completeSetup(true)} />}

                <div className="setup-form-actions">
                  <button type="button" className="setup-back-button" disabled={!!job} onClick={() => step ? navigate(step - 1) : (window.location.hash = "/welcome")}><ArrowLeft size={16} />{step ? "Back" : "Back to Leda"}</button>
                  <button type="submit" className="setup-button setup-button-primary continue-button" disabled={!!job}>{step === 4 ? "Finish setup" : "Continue"}<ArrowRight size={17} /></button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.section>

        <p className="setup-reassurance"><LockKeyhole size={13} strokeWidth={1.6} />Your details stay in this browser during setup. Always yours.</p>
      </main>

      <footer className="setup-page-footer">
        <p>&copy; {new Date().getFullYear()} Leda. Built for the way you trade.</p>
        <div><button type="button" onClick={() => setDialog("privacy")}>Privacy policy</button><button type="button" onClick={() => setDialog("terms")}>Terms of service</button></div>
      </footer>

      {dialog && <SetupDialog kind={dialog} onClose={() => setDialog(null)} onSave={saveAndExit} onRestart={restart} error={saveError} />}
    </div>
  );
}