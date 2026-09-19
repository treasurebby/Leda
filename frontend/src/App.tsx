import { useEffect, useState } from "react";
import { MotionConfig } from "framer-motion";
import LandingPage from "./components/LandingPage";
import Onboarding from "./onboarding/Onboarding";
import Dashboard from "./dashboard/Dashboard";
import OrderDetail from "./order-detail/OrderDetail";
import Login from "./auth/Login";
import Join from "./auth/Join";
import Recovery from "./auth/Recovery";
import { afterSignIn, SessionProvider, useSession } from "./auth/Session";

type View = "landing" | "onboarding" | "dashboard" | "order" | "login" | "join" | "forgot" | "reset" | "missing";
const LANDING_HASHES = new Set(["#/welcome", "#top", "#decode", "#features", "#voices", "#signup"]);
const TITLES: Record<View, string> = {
  landing: "Stop the WhatsApp Chaos. Clear Your Ledger.", onboarding: "Set up your business", dashboard: "Command Center",
  order: "Order detail", login: "Sign in", join: "Join your team", forgot: "Password recovery", reset: "Reset password", missing: "Page not found",
};

function decode(value: string) { try { return decodeURIComponent(value); } catch { return ""; } }
function resolveView(path: string): View {
  if (LANDING_HASHES.has(path)) return "landing";
  if (["#/onboarding", "#/setup", "#/signup"].includes(path)) return "onboarding";
  if (path.startsWith("#/order/")) return "order";
  if (["#/signin", "#/login"].includes(path)) return "login";
  if (path.startsWith("#/join/")) return "join";
  if (path === "#/forgot-password") return "forgot";
  if (path.startsWith("#/reset-password")) return "reset";
  if (["", "#", "#/", "#/dashboard"].includes(path)) return "dashboard";
  return "missing";
}

function Routes() {
  const [hash, setHash] = useState(window.location.hash);
  const { user, status, error, reload, signOut } = useSession();
  const [path, query = ""] = hash.split("?");
  const params = new URLSearchParams(query);
  const next = params.get("next");
  const view = resolveView(path);
  const protectedView = view === "dashboard" || view === "order";
  useEffect(() => {
    const changed = () => setHash(window.location.hash);
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    if (status !== "ready") return;
    if (protectedView && !user) window.location.replace(`#/signin?next=${encodeURIComponent(hash || "#/dashboard")}`);
    else if (protectedView && user?.role === "owner" && !user.business.onboarding_completed) window.location.replace("#/onboarding");
    else if (view === "login" && user) window.location.replace(afterSignIn(user, next));
  }, [view, status, user, protectedView, hash, next]);
  useEffect(() => {
    document.title = `Leda | ${TITLES[view]}`;
    const frame = requestAnimationFrame(() => {
      const anchor = view === "landing" ? document.getElementById(path.slice(1)) : null;
      if (anchor) anchor.scrollIntoView({ behavior: "instant" });
      else window.scrollTo({ top: 0, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [path, view]);

  if ((protectedView || view === "onboarding" || view === "login") && status === "loading") {
    return <main className="auth-state" role="status">Opening your workspace…</main>;
  }
  if ((protectedView || view === "onboarding") && status === "error") return <main className="auth-state">
    <h1>We couldn't open your workspace.</h1><p role="alert">{error}</p>
    <button className="auth-submit" onClick={() => { void reload().catch(() => undefined); }}>Try again</button>
    <button onClick={() => { void signOut().catch(() => undefined); }}>Back to sign in</button>
  </main>;
  if (protectedView && (!user || (user.role === "owner" && !user.business.onboarding_completed))) return <main className="auth-state" role="status">Redirecting…</main>;

  return <>
    {view === "landing" && <LandingPage />}
    {view === "onboarding" && <Onboarding />}
    {view === "dashboard" && user && <Dashboard key={`${user.user.id}:${user.business.id}`} account={user} />}
    {view === "order" && <OrderDetail key={path} />}
    {view === "login" && <Login next={next} />}
    {view === "join" && <Join key={path} token={decode(path.slice("#/join/".length))} />}
    {view === "forgot" && <Recovery key="forgot" initialEmail={params.get("email") ?? ""} />}
    {view === "reset" && <Recovery key={path} token={decode(path.slice("#/reset-password/".length))} />}
    {view === "missing" && <main className="auth-state"><h1>Page not found</h1><a href="#/dashboard">Open your workspace</a><a href="#/welcome">Back to Leda</a></main>}
  </>;
}

export default function App() {
  return <MotionConfig reducedMotion="user"><SessionProvider><Routes /></SessionProvider></MotionConfig>;
}
