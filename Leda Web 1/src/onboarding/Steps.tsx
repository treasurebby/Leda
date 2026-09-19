import { useRef, useState, type DragEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight, Check, ChevronDown, Download, FileSpreadsheet,
  Landmark, Loader2, PhoneForwarded, Plus, Smartphone, Trash2, Upload, X,
} from "lucide-react";
import { Field, IndustrySelect, PasswordInput, PhoneInput, TextInput } from "./Fields";
import {
  ROLES, type BridgeMethod, type FieldErrors, type Identity, type ImportJob,
  type ImportResult, type Product, type Retailer, type StaffInput, type StaffMember,
} from "./model";
import { downloadTemplate } from "./imports";

export function IdentityStep({ identity, onChange, errors, onLegal }: {
  identity: Identity;
  onChange: (key: keyof Identity, value: string) => void;
  errors: FieldErrors;
  onLegal: (kind: "terms" | "privacy") => void;
}) {
  return (
    <>
      <div className="setup-fields">
        <Field id="identity-fullName" label="Full name" error={errors.fullName}>
          <TextInput id="identity-fullName" name="fullName" autoComplete="name" placeholder="e.g. Ada Okoro" value={identity.fullName} onChange={event => onChange("fullName", event.target.value)} invalid={!!errors.fullName} maxLength={100} required />
        </Field>
        <Field id="identity-phone" label="Phone number" error={errors.phone}>
          <PhoneInput id="identity-phone" name="phone" value={identity.phone} onChange={event => onChange("phone", event.target.value)} invalid={!!errors.phone} required />
        </Field>
        <Field id="identity-email" label="Email address" error={errors.email}>
          <TextInput id="identity-email" name="email" type="email" autoComplete="email" placeholder="you@yourbusiness.com" value={identity.email} onChange={event => onChange("email", event.target.value)} invalid={!!errors.email} maxLength={254} required />
        </Field>
        <Field id="identity-password" label="Password" error={errors.password} hint="At least 8 characters, with a letter and a number.">
          <PasswordInput id="identity-password" name="password" autoComplete="new-password" placeholder="Create a secure password" value={identity.password} onChange={event => onChange("password", event.target.value)} invalid={!!errors.password} required />
        </Field>
        <Field id="identity-businessName" label="Business name" error={errors.businessName}>
          <TextInput id="identity-businessName" name="businessName" autoComplete="organization" placeholder="e.g. Okoro Wholesale Ltd" value={identity.businessName} onChange={event => onChange("businessName", event.target.value)} invalid={!!errors.businessName} maxLength={160} required />
        </Field>
        <Field id="identity-industry" label="Industry category" error={errors.industry}>
          <IndustrySelect value={identity.industry} onChange={value => onChange("industry", value)} invalid={!!errors.industry} />
        </Field>
        {identity.industry === "Other" && (
          <Field id="identity-customIndustry" label="What does your business sell?" error={errors.customIndustry} wide>
            <TextInput id="identity-customIndustry" placeholder="e.g. Musical instruments and studio equipment" value={identity.customIndustry} onChange={event => onChange("customIndustry", event.target.value)} invalid={!!errors.customIndustry} maxLength={160} required />
          </Field>
        )}
      </div>
      <p className="setup-consent">By continuing, you agree to our <button type="button" onClick={() => onLegal("terms")}>Terms of Service</button> and <button type="button" onClick={() => onLegal("privacy")}>Privacy Policy</button>.</p>
    </>
  );
}

export function BridgeStep({ method, onMethod, phone, onPhone, errors }: {
  method: BridgeMethod;
  onMethod: (method: BridgeMethod) => void;
  phone: string;
  onPhone: (value: string) => void;
  errors: FieldErrors;
}) {
  return (
    <>
      <fieldset className="bridge-choices" aria-label="Choose your business number" aria-describedby={errors.bridge ? "bridge-error" : undefined}>
        <label className={`bridge-choice${method === "current" ? " bridge-selected" : ""}`}>
          <input type="radio" name="bridgeMethod" value="current" checked={method === "current"} onChange={() => onMethod("current")} />
          <div className="bridge-choice-top"><Smartphone size={29} strokeWidth={1.5} /><span className="bridge-radio" aria-hidden="true">{method === "current" && <Check size={12} />}</span></div>
          <h3>Use my current number</h3>
          <p>Keep the number your retailers already know. Bring your existing conversations with you.</p>
          <span className="bridge-footnote">A familiar way to stay connected</span>
        </label>
        <label className={`bridge-choice${method === "virtual" ? " bridge-selected" : ""}`}>
          <input type="radio" name="bridgeMethod" value="virtual" checked={method === "virtual"} onChange={() => onMethod("virtual")} />
          <div className="bridge-choice-top"><PhoneForwarded size={29} strokeWidth={1.5} /><span className="bridge-radio" aria-hidden="true">{method === "virtual" && <Check size={12} />}</span></div>
          <h3>Get a Leda Virtual Number</h3>
          <p>A dedicated line for your business. Keep your personal number private, without an extra SIM.</p>
          <span className="bridge-footnote instant-path">Instant path <ArrowUpRight size={13} /></span>
        </label>
      </fieldset>
      {errors.bridge && <p id="bridge-error" className="field-error" role="alert">{errors.bridge}</p>}
      <AnimatePresence mode="wait" initial={false}>
        {method === "current" ? (
          <motion.div key="number" className="bridge-detail" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Field id="bridge-phone" label="Your WhatsApp business number" error={errors.bridgePhone} hint="You'll verify ownership before this number is connected.">
              <PhoneInput id="bridge-phone" value={phone} onChange={event => onPhone(event.target.value)} invalid={!!errors.bridgePhone} />
            </Field>
          </motion.div>
        ) : (
          <motion.p key="note" className="step-footnote bridge-note" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {method === "virtual" ? "Choose your setup path now. Your dedicated number will be activated after business verification." : "Pick what works for you. Your number is only connected after verification."}
          </motion.p>
        )}
      </AnimatePresence>
    </>
  );
}

function FileDropZone({ kind, onFile, onSample, onError }: {
  kind: "products" | "retailers";
  onFile: (file: File) => void;
  onSample: () => void;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const products = kind === "products";

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    if (event.dataTransfer.files.length !== 1) {
      onError("Please choose one spreadsheet at a time.");
      return;
    }
    onFile(event.dataTransfer.files[0]);
  }

  return (
    <>
      <div className={`file-drop-zone${dragging ? " file-dragging" : ""}`} onDragEnter={event => { event.preventDefault(); depth.current++; setDragging(true); }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDragLeave={event => { event.preventDefault(); depth.current--; if (depth.current <= 0) setDragging(false); }} onDrop={onDrop}>
        {products ? <FileSpreadsheet className="upload-art" size={42} strokeWidth={1.25} /> : <Landmark className="upload-art" size={42} strokeWidth={1.25} />}
        <h3>{dragging ? "Drop it here. We'll take it from there." : products ? "A product list is all we need." : "Bring your retailers along."}</h3>
        <p>Drag and drop your Excel or CSV file here.</p>
        <button type="button" className="setup-button setup-button-secondary browse-button" onClick={() => input.current?.click()}><Upload size={16} />{products ? "Choose a file" : "Import retailer list"}</button>
        <span className="file-accept-note">.xlsx or .csv, up to 5 MB</span>
        <input ref={input} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" tabIndex={-1} aria-label={products ? "Upload product list" : "Upload retailer list"} onChange={event => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }} />
      </div>
      <div className="import-secondary-actions">
        <button type="button" className="setup-text-button" onClick={() => downloadTemplate(kind)}><Download size={14} />Use our template</button>
        <button type="button" className="setup-subtle-button" onClick={onSample}>Try with sample data <ArrowUpRight size={13} /></button>
      </div>
    </>
  );
}

function ImportProgress({ job, onCancel }: { job: ImportJob; onCancel: () => void }) {
  const captions = job.kind === "products"
    ? ["Reading your spreadsheet", "Checking product names, SKUs and prices", "Preparing your catalog"]
    : ["Reading your retailer list", "Checking contact details", "Preparing preview account references"];
  const progress = [22, 58, 90][job.phase] ?? 90;
  return (
    <div className="import-processing" aria-live="polite" aria-busy="true">
      <Loader2 size={32} strokeWidth={1.6} className="setup-spinner" />
      <h3>{job.kind === "products" ? "Getting to know your products..." : "Importing & Generating Virtual Accounts..."}</h3>
      <p>{captions[job.phase]}</p>
      <div className="import-progress-track" role="progressbar" aria-label="Import progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <motion.span initial={{ width: "0%" }} animate={{ width: `${progress}%` }} transition={{ duration: 0.6 }} />
      </div>
      {job.kind === "retailers" && <span className="file-accept-note">Preview only. No live bank accounts are being opened.</span>}
      <button type="button" className="setup-subtle-button cancel-import" onClick={onCancel}>Cancel import</button>
    </div>
  );
}

type ImportStepProps = {
  job: ImportJob | null;
  error?: string;
  onFile: (file: File) => void;
  onSample: () => void;
  onClear: () => void;
  onError: (message: string) => void;
  onSkip: () => void;
  onCancel: () => void;
};

export function ProductsStep({ products, job, error, onFile, onSample, onClear, onError, onSkip, onCancel }: ImportStepProps & { products: ImportResult<Product> | null }) {
  return (
    <>
      {job ? <ImportProgress job={job} onCancel={onCancel} /> : products ? (
        <div className="import-preview">
          <div className="import-preview-header">
            <div><p><Check size={16} />{products.rows.length} {products.rows.length === 1 ? "product" : "products"} ready</p><span>{products.fileName}{products.sample ? " (sample data)" : ""}</span></div>
            <button type="button" className="setup-icon-button" onClick={onClear} aria-label="Remove product file"><X size={17} /></button>
          </div>
          <div className="setup-table-scroll"><table className="setup-table"><thead><tr><th>Product</th><th>SKU</th><th className="number-cell">Price (NGN)</th><th className="number-cell">Stock</th></tr></thead>
            <tbody>{products.rows.slice(0, 5).map(product => <tr key={product.sku}><td>{product.name}</td><td className="mono-cell">{product.sku}</td><td className="number-cell">{product.price.toLocaleString("en-NG", { maximumFractionDigits: 2 })}</td><td className="number-cell">{product.stock}</td></tr>)}</tbody>
          </table></div>
          <p className="preview-note">{products.rows.length > 5 ? `Showing the first 5 of ${products.rows.length} products. ` : ""}Your catalog is ready for the next step.</p>
        </div>
      ) : <FileDropZone kind="products" onFile={onFile} onSample={onSample} onError={onError} />}
      {error && <p className="import-error" role="alert">{error}</p>}
      {!job && <p className="step-footnote">Don't have a product list yet? {products ? "You can update it after setup." : <><button type="button" onClick={onSkip}>Skip for later</button>. You can add products anytime.</>}</p>}
    </>
  );
}

export function RetailersStep({ retailers, job, error, onFile, onSample, onClear, onError, onSkip, onCancel }: ImportStepProps & { retailers: ImportResult<Retailer> | null }) {
  return (
    <>
      {job ? <ImportProgress job={job} onCancel={onCancel} /> : retailers ? (
        <div className="import-preview">
          <div className="import-preview-header">
            <div><p><Check size={16} />{retailers.rows.length} {retailers.rows.length === 1 ? "retailer" : "retailers"} prepared</p><span>{retailers.fileName}{retailers.sample ? " (sample data)" : ""}</span></div>
            <button type="button" className="setup-icon-button" onClick={onClear} aria-label="Remove retailer file"><X size={17} /></button>
          </div>
          <div className="setup-table-scroll"><table className="setup-table"><thead><tr><th>Retailer</th><th>Contact</th><th>Account reference</th></tr></thead>
            <tbody>{retailers.rows.slice(0, 5).map(retailer => <tr key={retailer.accountReference}><td>{retailer.name}</td><td>{retailer.email || retailer.phone}</td><td className="mono-cell">{retailer.accountReference}</td></tr>)}</tbody>
          </table></div>
          <p className="preview-note">{retailers.rows.length > 5 ? `Showing the first 5 of ${retailers.rows.length} retailers. ` : ""}These are preview references, not bank account numbers.</p>
        </div>
      ) : <FileDropZone kind="retailers" onFile={onFile} onSample={onSample} onError={onError} />}
      {error && <p className="import-error" role="alert">{error}</p>}
      <p className="step-footnote">Live virtual accounts require business verification and a connected banking provider.{!job && !retailers && <> <button type="button" onClick={onSkip}>I'll do this later.</button></>}</p>
    </>
  );
}

export function TeamStep({ staff, input, onChange, onAdd, onRemove, onRole, errors, onSkip }: {
  staff: StaffMember[];
  input: StaffInput;
  onChange: (key: keyof StaffInput, value: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onRole: (id: string, role: string) => void;
  errors: FieldErrors;
  onSkip: () => void;
}) {
  return (
    <>
      <div className="setup-fields">
        <Field id="staffEmail" label="Staff email address" error={errors.staffEmail}>
          <TextInput id="staffEmail" type="email" autoComplete="off" placeholder="colleague@yourbusiness.com" value={input.email} onChange={event => onChange("email", event.target.value)} invalid={!!errors.staffEmail} maxLength={254} />
        </Field>
        <Field id="staffPhone" label="Phone number" error={errors.staffPhone}>
          <PhoneInput id="staffPhone" value={input.phone} onChange={event => onChange("phone", event.target.value)} invalid={!!errors.staffPhone} />
        </Field>
        <Field id="staffPassword" label="Temporary password" error={errors.staffPassword} hint="At least 8 characters, with a letter and a number.">
          <PasswordInput id="staffPassword" autoComplete="new-password" placeholder="Create a temporary password" value={input.password} onChange={event => onChange("password", event.target.value)} invalid={!!errors.staffPassword} />
        </Field>
        <Field id="staffRole" label="Assign a role" error={errors.staffRole}>
          <div className="native-select-wrap"><select id="staffRole" className="setup-input" value={input.role} onChange={event => onChange("role", event.target.value)} aria-describedby="role-description">{Object.keys(ROLES).map(role => <option key={role}>{role}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></div>
        </Field>
      </div>
      <p id="role-description" className="role-description"><span>{input.role}:</span> {ROLES[input.role]}</p>
      <button type="button" className="setup-button setup-button-secondary add-member-button" onClick={onAdd}><Plus size={16} />Add team member</button>
      {staff.length > 0 && (
        <div className="staff-list" aria-live="polite">
          <p className="staff-list-heading">Your team <span>({staff.length})</span></p>
          <AnimatePresence initial={false}>
            {staff.map(member => (
              <motion.div key={member.id} className="staff-row" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
                <div className="staff-person"><strong>{member.email}</strong><span>{member.phone}</span></div>
                <select className="staff-role-select" aria-label={`Role for ${member.email}`} value={member.role} onChange={event => onRole(member.id, event.target.value)}>{Object.keys(ROLES).map(role => <option key={role}>{role}</option>)}</select>
                <button type="button" className="setup-icon-button remove-member" onClick={() => onRemove(member.id)} aria-label={`Remove ${member.email}`}><Trash2 size={15} /></button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      <p className="step-footnote">Team access is prepared here; live logins and invitations are not sent in this preview. {!staff.length && <button type="button" onClick={onSkip}>I'll add my team later.</button>}</p>
    </>
  );
}