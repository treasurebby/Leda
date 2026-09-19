import { api, request, setToken, hasToken, endSession, ApiError, type Schemas } from "./client";

export type Me = Schemas["MeResponse"];

export async function register(data: Schemas["RegisterRequest"]) {
  const token = await request<Schemas["TokenResponse"]>("/auth/register", { method: "POST", body: data, auth: false });
  setToken(token.access_token);
  return token;
}

export async function login(email: string, password: string, remember = true) {
  const token = await request<Schemas["TokenResponse"]>("/auth/login", {
    method: "POST", body: { email, password, remember }, auth: false,
  });
  setToken(token.access_token);
  return token;
}

export async function logout() {
  try { await request("/auth/logout", { method: "POST", auth: false }); } finally { endSession(); }
}

/** Returns the signed-in user, or null when there is no usable session (no token and no refresh cookie). */
export async function me(): Promise<Me | null> {
  try {
    return await api.get<Me>("/auth/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function acceptInvite(token: string, full_name: string, password: string) {
  const result = await request<Schemas["TokenResponse"]>(`/team/invites/${encodeURIComponent(token)}/accept`, {
    method: "POST", body: { full_name, password }, auth: false,
  });
  setToken(result.access_token);
  return result;
}

export { hasToken };

export const forgotPassword = (email: string) => request<Schemas["Message"]>("/auth/forgot-password", {
  method: "POST", auth: false, body: { email },
});

export async function resetPassword(token: string, password: string) {
  const result = await request<Schemas["Message"]>("/auth/reset-password", {
    method: "POST", auth: false, body: { token, password },
  });
  endSession();
  return result;
}
