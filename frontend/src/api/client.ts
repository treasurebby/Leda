import type { components, paths } from "./types.gen";

export type Schemas = components["schemas"];
export type Paths = paths;
const API_ORIGIN = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ?? "";
export const API_BASE = `${API_ORIGIN}/api/v1`;
export const SESSION_EXPIRED = "leda:session-expired";
const TOKEN_KEY = "leda.access";
const SIGNED_OUT_KEY = "leda.signed-out";
type ValidationItem = { loc: (string | number)[]; msg: string };

export class ApiError extends Error {
  constructor(public status: number, public detail: string | ValidationItem[]) {
    super(typeof detail === "string" ? detail : detail.map(d => d.msg).join(" "));
  }
  fieldErrors(): Record<string, string> {
    return typeof this.detail === "string" ? {} : Object.fromEntries(
      this.detail.map(item => [String(item.loc[item.loc.length - 1]), item.msg.replace(/^Value error, /, "")]),
    );
  }
}

let accessToken: string | null = null;
let generation = 0;
let refreshPending: Promise<boolean> | null = null;
let signedOut = false;
try {
  signedOut = localStorage.getItem(SIGNED_OUT_KEY) === "true";
  accessToken = signedOut ? null : sessionStorage.getItem(TOKEN_KEY);
  localStorage.removeItem("leda.preview.session");
  sessionStorage.removeItem("leda.preview.session");
} catch { /* Authentication also works when storage is disabled. */ }

function storeToken(token: string | null) {
  accessToken = token;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* Keep the access token in memory. */ }
}

export function setToken(token: string | null) {
  generation += 1;
  storeToken(token);
  if (token) {
    signedOut = false;
    try { localStorage.removeItem(SIGNED_OUT_KEY); } catch { /* Optional storage. */ }
  }
}

export function endSession() {
  setToken(null);
  signedOut = true;
  try { localStorage.setItem(SIGNED_OUT_KEY, "true"); } catch { /* Optional storage. */ }
  window.dispatchEvent(new Event(SESSION_EXPIRED));
}

window.addEventListener("storage", event => {
  if (event.key === SIGNED_OUT_KEY && event.newValue === "true") endSession();
});

export const hasToken = () => !!accessToken;
type Options = { method?: string; body?: unknown; form?: FormData; retry?: boolean; auth?: boolean };

async function readResponse(resp: Response): Promise<unknown> {
  if (resp.status === 204) return undefined;
  const text = await resp.text();
  let data;
  try { data = text ? JSON.parse(text) : undefined; } catch {
    throw new ApiError(resp.status || 502, "Leda's API is unavailable. Please try again shortly.");
  }
  if (!resp.ok) {
    const detail = data?.detail;
    throw new ApiError(resp.status, typeof detail === "string" || Array.isArray(detail)
      ? detail : "Leda couldn't complete this request. Please try again.");
  }
  return data;
}

async function refresh(): Promise<boolean> {
  if (signedOut) return false;
  if (refreshPending) return refreshPending;
  const started = generation;
  refreshPending = (async () => {
    const resp = await fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "include" });
    if (started !== generation) return false;
    if (resp.status === 401) { storeToken(null); return false; }
    const data = await readResponse(resp) as Schemas["TokenResponse"];
    if (started !== generation) return false;
    storeToken(data.access_token);
    return true;
  })().finally(() => { refreshPending = null; });
  return refreshPending;
}

export async function request<T>(path: string, options: Options = {}): Promise<T> {
  const { method = "GET", body, form, retry = true, auth = true } = options;
  const headers: Record<string, string> = {};
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const started = generation;
  const resp = await fetch(`${API_BASE}${path}`, {
    method, headers, credentials: "include",
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  if (resp.status === 401 && auth) {
    if (retry && started === generation && await refresh()) return request<T>(path, { ...options, retry: false });
    if (started === generation) {
      storeToken(null);
      window.dispatchEvent(new Event(SESSION_EXPIRED));
    }
  }
  return await readResponse(resp) as T;
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
