import { api, setToken, hasToken, type Schemas } from "./client";

export type Me = Schemas["MeResponse"];

export async function register(data: Schemas["RegisterRequest"]) {
  const token = await api.post<Schemas["TokenResponse"]>("/auth/register", data);
  setToken(token.access_token);
  return token;
}

export async function login(email: string, password: string) {
  const token = await api.post<Schemas["TokenResponse"]>("/auth/login", { email, password });
  setToken(token.access_token);
  return token;
}

export async function logout() {
  try { await api.post("/auth/logout"); } finally { setToken(null); }
}

/** Returns the signed-in user, or null when there is no usable session (no token and no refresh cookie). */
export async function me(): Promise<Me | null> {
  try {
    return await api.get<Me>("/auth/me");
  } catch {
    return null;
  }
}

export async function acceptInvite(token: string, full_name: string, password: string) {
  const result = await api.post<Schemas["TokenResponse"]>(`/team/invites/${encodeURIComponent(token)}/accept`, { full_name, password });
  setToken(result.access_token);
  return result;
}

export { hasToken };
