import { useEffect, useState } from "react";
import { MotionConfig } from "framer-motion";
import LandingPage from "./components/LandingPage";
import Onboarding from "./onboarding/Onboarding";
import Dashboard from "./dashboard/Dashboard";
import OrderDetail from "./order-detail/OrderDetail";
import Login from "./auth/Login";
import Join from "./auth/Join";

type View = "landing" | "onboarding" | "dashboard" | "order" | "login" | "join";

const LANDING_HASHES = new Set(["#/welcome", "#top", "#decode", "#features", "#voices", "#signup"]);
const ONBOARDING_HASHES = new Set(["#/onboarding", "#/setup"]);
const TITLES: Record<View, string> = {
  landing: "Leda | Stop the WhatsApp Chaos. Clear Your Ledger.",
  onboarding: "Leda | Set up your business",
  dashboard: "Leda | Command Center",
  order: "Leda | Order detail",
  login: "Leda | Sign in",
  join: "Leda | Join your team",
};

function resolveView(): View {
  const hash = window.location.hash;
  if (LANDING_HASHES.has(hash)) return "landing";
  if (ONBOARDING_HASHES.has(hash)) return "onboarding";
  if (hash.startsWith("#/order/")) return "order";
  if (hash === "#/login") return "login";
  if (hash.startsWith("#/join/")) return "join";
  return "dashboard";
}

export default function App() {
  const [view, setView] = useState<View>(resolveView);

  useEffect(() => {
    const onHashChange = () => setView(resolveView());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    document.title = TITLES[view];
    const frame = window.requestAnimationFrame(() => {
      const anchor = view === "landing" ? document.getElementById(window.location.hash.slice(1)) : null;
      if (anchor) anchor.scrollIntoView({ behavior: "instant" });
      else window.scrollTo({ top: 0, behavior: "instant" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view]);

  return (
    <MotionConfig reducedMotion="user">
      {view === "landing" && <LandingPage />}
      {view === "onboarding" && <Onboarding />}
      {view === "dashboard" && <Dashboard />}
      {view === "order" && <OrderDetail />}
      {view === "login" && <Login />}
      {view === "join" && <Join token={decodeURIComponent(window.location.hash.slice("#/join/".length))} />}
    </MotionConfig>
  );
}
