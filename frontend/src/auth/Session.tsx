import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { me, logout, type Me } from "../api/auth";
import { ApiError, SESSION_EXPIRED } from "../api/client";

type State = { user: Me | null; status: "loading" | "ready" | "error"; error: string };
type Session = State & { reload: () => Promise<Me | null>; signOut: () => Promise<void> };
const Context = createContext<Session | null>(null);
let pending: Promise<Me | null> | null = null;
function loadSession() {
  pending ??= me().finally(() => { pending = null; });
  return pending;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ user: null, status: "loading", error: "" });
  const revision = useRef(0);
  const reload = useCallback(async () => {
    const current = ++revision.current;
    try {
      const user = await loadSession();
      if (current === revision.current) setState({ user, status: "ready", error: "" });
      return user;
    } catch (error) {
      if (current === revision.current) setState({ user: null, status: "error", error: error instanceof ApiError
        ? error.message : "We couldn't reach your workspace. Check your connection and try again." });
      throw error;
    }
  }, []);
  useEffect(() => {
    const expired = () => {
      revision.current += 1;
      setState({ user: null, status: "ready", error: "" });
    };
    window.addEventListener(SESSION_EXPIRED, expired);
    void reload().catch(() => undefined);
    return () => { revision.current += 1; window.removeEventListener(SESSION_EXPIRED, expired); };
  }, [reload]);
  const signOut = useCallback(async () => {
    try { await logout(); } finally { window.location.hash = "/signin"; }
  }, []);
  return <Context.Provider value={{ ...state, reload, signOut }}>{children}</Context.Provider>;
}

export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error("SessionProvider is missing");
  return value;
}

export function safeNext(value: string | null) {
  return value && /^(#\/dashboard|#\/order\/[A-Za-z0-9-]+|#\/onboarding)$/.test(value) ? value : "#/dashboard";
}

export function afterSignIn(user: Me | null, next: string | null = null) {
  if (user?.role === "owner" && !user.business.onboarding_completed) return "#/onboarding";
  return safeNext(next);
}
