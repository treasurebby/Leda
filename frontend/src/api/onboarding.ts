import { api, type Schemas } from "./client";

export type ImportJob = Schemas["ImportJobOut"];
export type InviteOut = Schemas["InviteOut"];

export function updateBridge(method: "current" | "virtual", phone: string | null) {
  return api.patch<Schemas["BusinessSummary"]>("/business/bridge", { method, phone });
}

export async function startImport(kind: "products" | "retailers", file: File | Blob, fileName: string) {
  const path = kind === "products" ? "/products/import" : "/retailers/import";
  return api.upload<ImportJob>(path, file, fileName);
}

export function getImportJob(id: string) {
  return api.get<ImportJob>(`/import-jobs/${id}`);
}

/** Poll until the server has finished processing the file. */
export async function waitForImport(id: string, signal: AbortSignal, intervalMs = 400): Promise<ImportJob> {
  for (;;) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const job = await getImportJob(id);
    if (job.status === "done" || job.status === "failed") return job;
    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(resolve, intervalMs);
      signal.addEventListener("abort", () => { window.clearTimeout(t); reject(new DOMException("Cancelled", "AbortError")); }, { once: true });
    });
  }
}

export function createInvite(email: string, phone: string, role: string) {
  return api.post<InviteOut>("/team/invites", { email, phone, role });
}

export function cancelInvite(id: string) {
  return api.del<Schemas["Message"]>(`/team/invites/${id}`);
}

export function listTeam() {
  return api.get<Schemas["TeamResponse"]>("/team");
}

/** Build a CSV blob from the sample rows so "try sample data" goes through the same server path as a real file. */
export function csvBlob(rows: string[][]) {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return new Blob([rows.map(r => r.map(escape).join(",")).join("\n")], { type: "text/csv" });
}

/* ------------------------------------------------------------------ price list -> catalog */
export type CatalogItem = { name: string; unit: string | null; price: string | number | null; sku?: string | null; stock?: number; aliases?: string[]; confidence?: number; note?: string | null };
export type CatalogDraft = { id: string; source: string; status: string; items: CatalogItem[]; summary: string | null; inserted: number; updated: number; created_at: string };

export function extractPriceListText(text: string) {
  return api.post<CatalogDraft>("/catalog/extract", { text });
}

export function extractPriceListFile(file: File) {
  return api.upload<CatalogDraft>("/catalog/extract-file", file);
}

export function applyCatalogDraft(id: string, items?: CatalogItem[]) {
  return api.post<CatalogDraft>(`/catalog/drafts/${id}/apply`, items ? { items } : {});
}

export function discardCatalogDraft(id: string) {
  return api.post<Schemas["Message"]>(`/catalog/drafts/${id}/discard`);
}
