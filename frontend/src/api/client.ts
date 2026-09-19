/**
 * Thin fetch wrapper for the Leda API.
 *
 * - Access tokens are short-lived and kept in memory + sessionStorage.
 * - The refresh token lives in an httpOnly cookie set by the server; on a 401 we try one refresh and retry.
 * - Errors surface as ApiError with the server's `detail` (string or FastAPI validation list).
 */
import type { components, paths } from "./types.gen";

export type Schemas = components["schemas"];
export type Paths = paths;

export const API_BASE = "/api/v1";
const TOKEN_KEY = "leda.access";

type ValidationItem = { loc: (string | number)[]; msg: string };

export class ApiError extends Error {
  status: number;
  detail: string | ValidationItem[];
  constructor(status: number, detail: string | ValidationItem[]) {
    super(typeof detail === "string" ? detail : detail.map(d => d.msg).join(" "));
    this.status = status;
    this.detail = detail;
  }
  /** Map FastAPI validation errors to { fieldName: message }. */
  fieldErrors(): Record<string, string> {
    if (typeof this.detail === "string") return {};
    const out: Record<string, string> = {};
    for (const item of this.detail) {
      const key = String(item.loc[item.loc.length - 1]);
      out[key] = item.msg.replace(/^Value error, /, "");
    }
    return out;
  }
}

let accessToken: string | null = null;
try { accessToken = sessionStorage.getItem(TOKEN_KEY); } catch { /* storage may be disabled */ }

export function setToken(token: string | null) {
  accessToken = token;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

export function hasToken() {
  return !!accessToken;
}

type Options = { method?: string; body?: unknown; form?: FormData; retry?: boolean; auth?: boolean };

async function refresh(): Promise<boolean> {
  const resp = await fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "include" });
  if (!resp.ok) { setToken(null); return false; }
  const data = (await resp.json()) as Schemas["TokenResponse"];
  setToken(data.access_token);
  return true;
}

export async function request<T>(path: string, options: Options = {}): Promise<T> {
  const { method = "GET", body, form, retry = true, auth = true } = options;
  const headers: Record<string, string> = {};
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const resp = await fetch(`${API_BASE}${path}`, {
    method, headers, credentials: "include",
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  if (resp.status === 401 && auth && retry && (await refresh())) {
    return request<T>(path, { ...options, retry: false });
  }
  if (resp.status === 204) return undefined as T;
  const text = await resp.text();
  const data = text ? JSON.parse(text) : null;
  if (!resp.ok) throw new ApiError(resp.status, data?.detail ?? resp.statusText);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body ?? {} }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, file: File | Blob, name = "upload") => {
    const form = new FormData();
    form.append("file", file, file instanceof File ? file.name : name);
    return request<T>(path, { method: "POST", form });
  },
};
