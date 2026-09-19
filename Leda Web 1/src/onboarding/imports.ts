import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";
import { downloadFile, normalisePhone, validEmail, type Product, type Retailer } from "./model";

const MAX_ROWS = 5000;
const MAX_BYTES = 5 * 1024 * 1024;
const headerKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function readSpreadsheet(file: File): Promise<string[][]> {
  if (!file.size) throw new Error("This file is empty. Add a header row and at least one record.");
  if (file.size > MAX_BYTES) throw new Error("This file is a little too large. Please use a file under 5 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "csv" && extension !== "xlsx") {
    throw new Error("Please choose a CSV or Excel (.xlsx) file. Older .xls files can be saved as .xlsx in Excel.");
  }

  let rows: string[][];
  if (extension === "csv") {
    const result = Papa.parse<string[]>(await file.text(), { skipEmptyLines: "greedy", preview: MAX_ROWS + 2 });
    if (result.errors.some(error => error.type === "Quotes")) {
      throw new Error("Some quotation marks in this CSV do not match. Please check the file and try again.");
    }
    rows = result.data;
  } else {
    try {
      const data = await readSheet(file, 1);
      rows = data.map(row => row.map(cell => String(cell ?? "")));
    } catch {
      throw new Error("We couldn't read this workbook. Please check it isn't password protected, or save it as CSV.");
    }
  }

  rows = rows.map(row => row.map(cell => cell.trim())).filter(row => row.some(Boolean));
  if (rows.length < 2) throw new Error("Add column headers and at least one record to your file.");
  if (rows.length > MAX_ROWS + 1) throw new Error("Please import up to 5,000 records at a time.");
  return rows;
}

function column(headers: string[], aliases: string[]) {
  return headers.findIndex(header => aliases.map(headerKey).includes(headerKey(header)));
}

function numeric(value: string | undefined, fallback?: number) {
  if (value === undefined || value === "") return fallback ?? NaN;
  const cleaned = value.replace(/NGN|\u20a6|,/gi, "").trim();
  return cleaned ? Number(cleaned) : NaN;
}

export function parseProducts(rows: string[][]): Product[] {
  const [headers, ...data] = rows;
  const nameColumn = column(headers, ["product", "product name", "name", "item", "item name"]);
  const priceColumn = column(headers, ["price", "price ngn", "unit price", "unit price ngn", "selling price", "amount"]);
  const skuColumn = column(headers, ["sku", "product code", "item code", "code"]);
  const stockColumn = column(headers, ["stock", "quantity", "qty", "stock quantity", "stock level", "quantity available", "stock on hand"]);
  if (nameColumn < 0 || priceColumn < 0) {
    throw new Error('Your file needs "Product name" and "Price" columns. SKU and Stock are optional. Our template has the right headings.');
  }

  const errors: string[] = [];
  const skus = new Set<string>();
  const products = data.map((row, index) => {
    const name = row[nameColumn] ?? "";
    const price = numeric(row[priceColumn]);
    const stock = numeric(row[stockColumn], 0);
    const sku = (row[skuColumn] || `LEDA${String(index + 1).padStart(4, "0")}`).toUpperCase();
    if (!name) errors.push(`Row ${index + 2}: product name is missing.`);
    if (!Number.isFinite(price) || price < 0) errors.push(`Row ${index + 2}: enter a valid, nonnegative price.`);
    if (!Number.isSafeInteger(stock) || stock < 0) errors.push(`Row ${index + 2}: stock must be a nonnegative whole number.`);
    if (skus.has(sku)) errors.push(`Row ${index + 2}: SKU ${sku} is repeated.`);
    skus.add(sku);
    return { name, price, stock, sku };
  });
  if (errors.length) throw new Error(errors.slice(0, 3).join(" ") + (errors.length > 3 ? ` Plus ${errors.length - 3} more issues.` : ""));
  return products;
}

export function parseRetailers(rows: string[][]): Retailer[] {
  const [headers, ...data] = rows;
  const nameColumn = column(headers, ["retailer name", "retailer", "business name", "name", "customer", "customer name"]);
  const emailColumn = column(headers, ["email", "email address", "retailer email"]);
  const phoneColumn = column(headers, ["phone", "phone number", "phone no", "mobile", "mobile number", "whatsapp", "whatsapp number", "telephone", "contact number"]);
  if (nameColumn < 0 || (emailColumn < 0 && phoneColumn < 0)) {
    throw new Error('Your file needs a "Retailer name" column and at least one contact column: "Email" or "Phone".');
  }
  const errors: string[] = [];
  const contacts = new Set<string>();
  const retailers = data.map((row, index) => {
    const name = row[nameColumn] ?? "";
    const email = (row[emailColumn] ?? "").toLowerCase();
    const rawPhone = row[phoneColumn] ?? "";
    const phone = rawPhone ? normalisePhone(rawPhone) ?? "" : "";
    if (!name) errors.push(`Row ${index + 2}: retailer name is missing.`);
    if (!email && !rawPhone) errors.push(`Row ${index + 2}: add an email or phone number.`);
    if (email && !validEmail(email)) errors.push(`Row ${index + 2}: the email is not valid.`);
    if (rawPhone && !phone) errors.push(`Row ${index + 2}: use a valid Nigerian phone number.`);
    const key = email || phone;
    if (key && contacts.has(key)) errors.push(`Row ${index + 2}: this contact appears more than once.`);
    if (key) contacts.add(key);
    // Preview references cannot be mistaken for usable bank account numbers.
    return { name, email, phone, accountReference: `PREVIEW ${String(index + 1).padStart(4, "0")}` };
  });
  if (errors.length) throw new Error(errors.slice(0, 3).join(" ") + (errors.length > 3 ? ` Plus ${errors.length - 3} more issues.` : ""));
  return retailers;
}

export const SAMPLE_PRODUCTS = [
  ["Product name", "SKU", "Price", "Stock"],
  ["Royal Stallion Rice 50kg", "RSR50", "78500", "120"],
  ["Mama Gold Rice 50kg", "MGR50", "77200", "80"],
  ["Kings Vegetable Oil 25L", "KVO25", "96500", "65"],
];

export const SAMPLE_RETAILERS = [
  ["Retailer name", "Email", "Phone"],
  ["Kike Stores", "kike@example.com", "08031234567"],
  ["Okafor Provisions", "okafor@example.com", "08052345678"],
  ["Amina Food Mart", "amina@example.com", "07063456789"],
];

export function downloadTemplate(kind: "products" | "retailers") {
  const data = kind === "products" ? SAMPLE_PRODUCTS : SAMPLE_RETAILERS;
  const csv = Papa.unparse(data, { escapeFormulae: true });
  downloadFile(`\uFEFF${csv}`, `leda-${kind}-template.csv`, "text/csv;charset=utf-8;");
}