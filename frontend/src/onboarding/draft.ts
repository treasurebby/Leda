import { ROLES, type BridgeMethod, type Identity, type ImportResult, type Product, type Retailer, type StaffMember } from "./model";

export type SetupData = {
  identity: Identity;
  method: BridgeMethod;
  businessPhone: string;
  products: ImportResult<Product> | null;
  retailers: ImportResult<Retailer> | null;
  staff: StaffMember[];
};

type Draft = Omit<SetupData, "identity"> & {
  version: 1;
  savedAt: number;
  step: number;
  identity: Omit<Identity, "password">;
};

const KEY = "leda.onboarding.draft.v1";
const string = (value: unknown): value is string => typeof value === "string";

export function safeSummary(data: SetupData) {
  const { identity } = data;
  return {
    identity: {
      fullName: identity.fullName.trim(), phone: identity.phone.trim(),
      email: identity.email.trim().toLowerCase(), businessName: identity.businessName.trim(),
      industry: identity.industry, customIndustry: identity.customIndustry.trim(),
    },
    method: data.method,
    businessPhone: data.businessPhone,
    products: data.products,
    retailers: data.retailers,
    staff: data.staff.map(({ id, email, phone, role, inviteId }) => ({ id, email, phone, role, inviteId })),
  };
}

export function saveDraft(data: SetupData, step: number) {
  // Draft saving is explicit; neither owner nor staff passwords are serialized.
  const draft: Draft = { ...safeSummary(data), version: 1, savedAt: Date.now(), step };
  localStorage.setItem(KEY, JSON.stringify(draft));
}

export function clearDraft() {
  try { localStorage.removeItem(KEY); } catch { /* Storage can be disabled by the browser. */ }
}

export function readDraft(): Draft | null {
  try {
    const value = localStorage.getItem(KEY);
    if (!value) return null;
    const draft = JSON.parse(value) as Draft;
    if (draft.version !== 1 || !Number.isFinite(draft.savedAt)) return null;
    if (Date.now() - draft.savedAt > 7 * 86400000) {
      localStorage.removeItem(KEY);
      return null;
    }
    if (!draft.identity || !["fullName", "phone", "email", "businessName", "industry", "customIndustry"].every(key => string(draft.identity[key as keyof Draft["identity"]]))) return null;
    if (!Number.isInteger(draft.step) || draft.step < 0 || draft.step > 4) return null;
    if (![null, "current", "virtual"].includes(draft.method) || !string(draft.businessPhone)) return null;
    if (!Array.isArray(draft.staff) || draft.staff.length > 100 || !draft.staff.every(member => string(member.id) && string(member.email) && string(member.phone) && string(member.role) && Object.prototype.hasOwnProperty.call(ROLES, member.role))) return null;
    if (draft.products && (!string(draft.products.fileName) || !Array.isArray(draft.products.rows) || draft.products.rows.length > 5000 || !draft.products.rows.every(item => string(item.name) && string(item.sku) && Number.isFinite(item.price) && Number.isSafeInteger(item.stock)))) return null;
    if (draft.retailers && (!string(draft.retailers.fileName) || !Array.isArray(draft.retailers.rows) || draft.retailers.rows.length > 5000 || !draft.retailers.rows.every(item => [item.name, item.email, item.phone, item.accountReference].every(string)))) return null;
    return draft;
  } catch { return null; }
}