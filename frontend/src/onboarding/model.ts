export type Identity = {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  businessName: string;
  industry: string;
  customIndustry: string;
};

export type BridgeMethod = "current" | "virtual" | null;
export type FieldErrors = Record<string, string>;
export type Product = { name: string; sku: string; price: number; stock: number };
export type Retailer = {
  name: string;
  email: string;
  phone: string;
  accountReference: string;
};
export type StaffMember = { id: string; email: string; phone: string; role: string };
export type StaffInput = Omit<StaffMember, "id"> & { password: string };
export type ImportResult<T> = { fileName: string; rows: T[]; sample: boolean };
export type ImportJob = { kind: "products" | "retailers"; phase: number };

export const EMPTY_IDENTITY: Identity = {
  fullName: "", phone: "", email: "", password: "", businessName: "",
  industry: "", customIndustry: "",
};

export const EMPTY_STAFF: StaffInput = {
  email: "", phone: "", password: "", role: "Sales representative",
};

export const STEPS = [
  { name: "Identity", short: "Identity", description: "You & your business" },
  { name: "The Bridge", short: "Bridge", description: "Connect your number" },
  { name: "The Brain", short: "Brain", description: "Add your products" },
  { name: "The Money", short: "Money", description: "Bring your retailers" },
  { name: "The Team", short: "Team", description: "Invite your people" },
];

export const INDUSTRIES = [
  "Foodstuff & groceries", "Beverages", "Agriculture & agro products",
  "Pharma & pharmaceuticals", "Home appliances", "Kitchen utensils",
  "Skincare & cosmetics", "Clothing & fashion", "Footwear & bags",
  "Electronics & gadgets", "Phones & accessories", "Furniture & home decor",
  "Building & construction materials", "Electrical & lighting",
  "Plumbing & sanitary ware", "Automotive parts & accessories",
  "Lubricants & petroleum products", "Household & cleaning supplies",
  "Personal care & hygiene", "Baby & maternity products", "Books & stationery",
  "Packaging & plastics", "Textiles & fabrics", "Jewellery & accessories",
  "Sports & fitness equipment", "Medical & laboratory supplies",
  "Animal feed & veterinary supplies", "Frozen food & seafood", "Meat & poultry",
  "Grains & cereals", "Fruits & vegetables", "Bakery & confectionery",
  "Computers & office equipment", "Solar & renewable energy",
  "Industrial machinery & tools", "Paints & chemicals", "Toys & games",
  "General merchandise",
];

export const ROLES: Record<string, string> = {
  "Sales representative": "Create orders and manage retailers. No access to account settings.",
  "Administrator": "Manage the workspace, team, orders, inventory and payments.",
  "Operations manager": "Manage orders, retailers, deliveries and inventory.",
  "Accountant": "View payments, reconcile accounts and export financial reports.",
  "Warehouse staff": "Manage stock levels, packing and order fulfilment.",
  "Viewer": "View orders and inventory without making changes.",
};

export function normalisePhone(value: string) {
  const digits = value.replace(/[\s()+.-]/g, "");
  const local = digits.startsWith("234") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
  return /^[789]\d{9}$/.test(local) ? `+234${local}` : null;
}

export const validEmail = (value: string) =>
  value.length <= 254 && /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i.test(value.trim());

export const validPassword = (value: string) =>
  value.length >= 8 && value.length <= 128 && /[a-z]/i.test(value) && /\d/.test(value);

export function validateIdentity(identity: Identity): FieldErrors {
  const errors: FieldErrors = {};
  if (identity.fullName.trim().length < 2) errors.fullName = "Please enter your full name.";
  if (!normalisePhone(identity.phone)) errors.phone = "Enter a valid Nigerian mobile number.";
  if (!validEmail(identity.email)) errors.email = "Enter a valid email address.";
  if (!validPassword(identity.password)) errors.password = "Use at least 8 characters, with a letter and a number.";
  if (identity.businessName.trim().length < 2) errors.businessName = "Please enter your business name.";
  if (!INDUSTRIES.includes(identity.industry) && identity.industry !== "Other") errors.industry = "Choose an industry or select Other.";
  if (identity.industry === "Other" && identity.customIndustry.trim().length < 2) errors.customIndustry = "Tell us what your business sells.";
  return errors;
}

export function validateStaff(input: StaffInput, members: StaffMember[], ownerEmail: string): FieldErrors {
  const errors: FieldErrors = {};
  const email = input.email.trim().toLowerCase();
  if (!validEmail(email)) errors.staffEmail = "Enter a valid staff email address.";
  else if (email === ownerEmail.trim().toLowerCase()) errors.staffEmail = "You're already the workspace owner. Add someone else.";
  else if (members.some(member => member.email === email)) errors.staffEmail = "This person is already in your team list.";
  if (!normalisePhone(input.phone)) errors.staffPhone = "Enter a valid Nigerian mobile number.";
  if (!validPassword(input.password)) errors.staffPassword = "Use at least 8 characters, with a letter and a number.";
  if (!Object.prototype.hasOwnProperty.call(ROLES, input.role)) errors.staffRole = "Please choose a role.";
  return errors;
}

export function downloadFile(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Cancelled", "AbortError"));
    const cancel = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}