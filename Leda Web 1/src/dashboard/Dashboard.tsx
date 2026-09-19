import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight, ArrowUpRight, BadgeCheck, Banknote, Bell, Boxes, Camera, Check,
  CheckCheck, ChevronDown, ChevronRight, ClipboardList, Clock, HandCoins,
  LayoutDashboard, LogOut, Menu, MessageSquare, Mic, Plus, ReceiptText, Search,
  Settings, ShieldAlert, Sparkles, Store, Tags, TrendingUp, TriangleAlert, Users, Wallet, X,
} from "lucide-react";
import Workspaces from "./Workspaces";
import "./dashboard.css";

/* ------------------------------------------------------------------ data */
type NavItem = { key: string; label: string; icon: typeof LayoutDashboard; badge?: string; alert?: boolean };

const NAV_GROUPS: { group: string; items: NavItem[] }[] = [
  {
    group: "Workspace",
    items: [
      { key: "dashboard", label: "Command Center", icon: LayoutDashboard },
      { key: "orders", label: "Orders", icon: ClipboardList, badge: "38" },
      { key: "inventory", label: "Inventory", icon: Boxes },
      { key: "sku", label: "SKU Mapping", icon: Tags },
      { key: "retailers", label: "Retailers", icon: Store },
    ],
  },
  {
    group: "Money",
    items: [
      { key: "payments", label: "Payments", icon: Banknote, alert: true },
      { key: "ledger", label: "Global Ledger", icon: ReceiptText },
    ],
  },
  {
    group: "Business",
    items: [
      { key: "team", label: "Team", icon: Users, badge: "3" },
      { key: "settings", label: "Settings", icon: Settings },
    ],
  },
];

const BUSINESSES = [
  { name: "Okoro Wholesale Ltd", detail: "Foodstuff & groceries · Trade Fair, Lagos", verified: true },
  { name: "Okoro Provisions Ibadan", detail: "Grains & cereals · Gbagi, Ibadan", verified: true },
];

type Channel = "Voice note" | "Text order" | "Photo";
const ORDERS: {
  id: string; time: string; retailer: string; market: string; channel: Channel;
  items: number; amount: number; status: "Paid" | "Pending"; detail: string;
}[] = [
  { id: "#LE-1042", time: "09:05", retailer: "Madam Kike Stores", market: "Trade Fair Complex, Lagos", channel: "Voice note", items: 80, amount: 6517500, status: "Paid", detail: "Transfer matched to invoice" },
  { id: "#LE-1041", time: "08:52", retailer: "Okafor Provisions", market: "Onitsha Main Market", channel: "Voice note", items: 42, amount: 2410000, status: "Pending", detail: "Awaiting payment" },
  { id: "#LE-1040", time: "08:31", retailer: "Amina Food Mart", market: "Kantin Kwari, Kano", channel: "Text order", items: 26, amount: 1845500, status: "Paid", detail: "Transfer matched 08:44" },
  { id: "#LE-1039", time: "07:58", retailer: "Bola & Sons", market: "Oyingbo, Lagos", channel: "Photo", items: 18, amount: 972000, status: "Paid", detail: "Cash collected on pickup" },
  { id: "#LE-1038", time: "07:40", retailer: "Emeka Beverages Ltd", market: "Ariaria, Aba", channel: "Voice note", items: 55, amount: 3120000, status: "Pending", detail: "Proof of payment received" },
];

const CHANNEL_ICON: Record<Channel, typeof Mic> = { "Voice note": Mic, "Text order": MessageSquare, "Photo": Camera };

type Flag = {
  id: string; retailer: string; kind: "Voice note" | "Photo" | "Slang"; raised: string;
  issue: string; quote: string; why: string; options: string[]; confidence: number;
};
const FLAGS: Flag[] = [
  {
    id: "#LE-1041", retailer: "Okafor Provisions", kind: "Voice note", raised: "2 minutes ago",
    issue: "Quantity unclear (54% confidence)",
    quote: "“Send me like fifty, make e remain small.”",
    why: "“Like fifty” with “make e remain small” could mean 50 bags or 55 bags. The difference is ₦392,500.",
    options: ["50 bags of Royal Stallion 50kg", "55 bags of Royal Stallion 50kg"], confidence: 54,
  },
  {
    id: "#LE-1037", retailer: "Alhaji Musa Grains", kind: "Photo", raised: "14 minutes ago",
    issue: "Product match 62%",
    quote: "[Blurry photo of stacked bags]",
    why: "The stitching pattern matches Royal Stallion, but the label looks closer to Mama Gold. Confirming keeps your stock counts honest.",
    options: ["Royal Stallion Parboiled 50kg", "Mama Gold Premium 50kg"], confidence: 62,
  },
  {
    id: "#LE-1036", retailer: "Yetunde Electronics", kind: "Slang", raised: "31 minutes ago",
    issue: "Two products share this slang",
    quote: "“Add 15 kegs of the yellow one.”",
    why: "“Yellow one” could be Kings Vegetable Oil (25L, red cap) or Fortune Soya Oil (25L, yellow label). Both are in your catalog.",
    options: ["Kings Vegetable Oil 25L", "Fortune Soya Oil 25L"], confidence: 71,
  },
];

const NOTIFICATIONS = [
  { id: 1, icon: Banknote, title: "₦6,517,500 matched to #LE-1042", detail: "Madam Kike Stores · transfer reconciled 09:05" },
  { id: 2, icon: TriangleAlert, title: "3 messages need your eye", detail: "Sabi flagged uncertainty in voice notes and photos" },
  { id: 3, icon: BadgeCheck, title: "Amina Food Mart paid in full", detail: "Virtual account credit of ₦1,845,500" },
];

/* ------------------------------------------------------------------ helpers */
function useTween(value: number, duration = 0.9) {
  const [display, setDisplay] = useState(0);
  const previous = useRef(0);
  useEffect(() => {
    const controls = animate(previous.current, value, {
      duration, ease: [0.16, 1, 0.3, 1],
      onUpdate: latest => setDisplay(latest),
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, duration]);
  return display;
}

const naira = (value: number) => "\u20A6" + Math.round(value).toLocaleString("en-NG");

const SPARK = [21, 25, 23, 30, 28, 34, 38];
function sparkPaths(values: number[], width = 100, height = 34) {
  const max = Math.max(...values) * 1.15;
  const points = values.map((value, index) => [
    (index / (values.length - 1)) * width,
    height - (value / max) * height,
  ]);
  const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return { line, area: `${line} L${width} ${height} L0 ${height} Z`, last: points[points.length - 1] };
}

function useDismiss(open: boolean, ref: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, close]);
}

function Greeting({ name }: { name: string }) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return <>{part}, {name}</>;
}

/* ------------------------------------------------------------------ sidebar */
function SidebarContent({ active, onSelect, business, unread, pending, onSignOut }: {
  active: string;
  onSelect: (key: string) => void;
  business: number;
  unread: number;
  pending: number;
  onSignOut: () => void;
}) {
  const [switcher, setSwitcher] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(switcher, wrap, () => setSwitcher(false));

  return (
    <>
      <div className="dash-sidebar-head">
        <a href="#/welcome" className="dash-brand" aria-label="Leda home">
          <span className="dash-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="21" height="21" fill="none">
              <path d="M5 21c6.5 0 8.5-9.5 14-9.5 3.6 0 5.4 2.4 7.6 4.5" stroke="#065F46" strokeWidth="3" strokeLinecap="round" />
              <circle cx="25" cy="19" r="2.6" fill="#D97706" />
            </svg>
          </span>
          <span className="dash-brand-name">Leda</span>
        </a>
        <div className="dash-business" ref={wrap}>
          <button type="button" className="dash-business-button" aria-haspopup="menu" aria-expanded={switcher} onClick={() => setSwitcher(open => !open)}>
            <div className="dash-business-copy">
              <strong>{BUSINESSES[business].name}</strong>
              <span><BadgeCheck size={11} />Verified distributor</span>
            </div>
            <ChevronDown size={15} style={{ color: "rgba(231,241,233,.6)" }} />
          </button>
          <AnimatePresence>
            {switcher && (
              <motion.div className="dash-popover dash-popover-dark" role="menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
                <p>Switch workspace</p>
                {BUSINESSES.map((item, index) => (
                  <button key={item.name} type="button" role="menuitem" className={`dash-business-option${index === business ? " dash-business-option-active" : ""}`} onClick={() => { onSelect(`__business:${index}`); setSwitcher(false); }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p>{item.name}</p>
                      <span>{item.detail}</span>
                    </div>
                    {index === business && <Check size={15} style={{ color: "#7fd0a4" }} />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <nav className="dash-nav" aria-label="Workspace sections">
        {NAV_GROUPS.map(group => (
          <div className="dash-nav-group" key={group.group}>
            <p>{group.group}</p>
            {group.items.map(item => {
              const isActive = item.key === active;
              const badge = item.key === "payments" && pending > 0 ? String(pending) : item.badge;
              return (
                <button key={item.key} type="button" className={`dash-nav-item${isActive ? " dash-nav-item-active" : ""}`} aria-current={isActive ? "page" : undefined} onClick={() => onSelect(item.key)}>
                  <item.icon size={17.5} strokeWidth={1.75} />
                  <span className="dash-nav-label">{item.label}</span>
                  {badge && <span className={`dash-nav-badge${item.alert ? " dash-nav-badge-alert" : ""}`} aria-label={`${badge} items`}>{badge}</span>}
                </button>
              );
            })}
          </div>
        ))}
        {unread > 0 && (
          <div className="dash-nav-group">
            <p>Signals</p>
            <button type="button" className="dash-nav-item" onClick={() => onSelect("dashboard")}>
              <Bell size={17.5} strokeWidth={1.75} />
              <span className="dash-nav-label">Needs attention</span>
              <span className="dash-nav-badge dash-nav-badge-alert">{pending}</span>
            </button>
          </div>
        )}
      </nav>

      <div className="dash-sidebar-foot">
        <div className="dash-engine">
          <span className="dash-engine-dot" aria-hidden="true" />
          <div>
            <p>Sabi Engine decoding</p>
            <span>Last sync 09:05 · 96% straight through</span>
          </div>
        </div>
        <div className="dash-user">
          <span className="dash-avatar" aria-hidden="true">AO</span>
          <div className="dash-user-copy">
            <strong>Ada Okoro</strong>
            <span>Owner · full access</span>
          </div>
          <button type="button" className="dash-signout" aria-label="Sign out" onClick={onSignOut}><LogOut size={16} /></button>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ KPI tiles */
function KpiTile({ label, icon: Icon, accent, tint, bg, value, valueSuffix, meta, children }: {
  label: string; icon: typeof Wallet; accent: string; tint: string; bg: string;
  value: string; valueSuffix?: ReactNode; meta: ReactNode; children?: ReactNode;
}) {
  return (
    <article className="dash-kpi" style={{ "--kpi-color": accent, "--kpi-tint": tint, "--kpi-bg": bg, "--access-color": accent, "--kpi-fill": accent } as CSSProperties}>
      <div className="dash-kpi-head">
        <span className="dash-kpi-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.8} /></span>
        <span className="dash-kpi-label">{label}</span>
      </div>
      <p className="dash-kpi-value">{value}{valueSuffix}</p>
      <div className="dash-kpi-meta">{meta}</div>
      {children}
    </article>
  );
}

/* ------------------------------------------------------------------ dashboard */
export default function Dashboard() {
  const [active, setActive] = useState("dashboard");
  const [business, setBusiness] = useState(0);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [notifications, setNotifications] = useState(NOTIFICATIONS.length);
  const [bellOpen, setBellOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [openFlag, setOpenFlag] = useState<string | null>(FLAGS[0].id);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [asked, setAsked] = useState<string[]>([]);
  const [resolved, setResolved] = useState<{ id: string; label: string; retailer: string }[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const newOrderRef = useRef<HTMLDivElement>(null);
  const attentionRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useDismiss(bellOpen, bellRef, () => setBellOpen(false));
  useDismiss(profileOpen, profileRef, () => setProfileOpen(false));
  useDismiss(newOrderOpen, newOrderRef, () => setNewOrderOpen(false));

  /* Close the mobile drawer when the viewport grows to desktop. */
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1025px)");
    const onChange = () => { if (media.matches) setDrawer(false); };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  /* Escape closes the mobile drawer. */
  useEffect(() => {
    if (!drawer) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setDrawer(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const needle = query.trim().toLowerCase();
  const match = (...fields: (string | number)[]) => fields.join(" ").toLowerCase().includes(needle);

  const openFlags = useMemo(() => FLAGS.filter(flag => !resolved.some(item => item.id === flag.id)), [resolved]);
  const visibleOrders = useMemo(() => ORDERS.filter(order => !needle || match(order.id, order.retailer, order.market, order.status, order.channel)), [needle]);
  const visibleFlags = useMemo(() => openFlags.filter(flag => !needle || match(flag.id, flag.retailer, flag.issue, flag.kind, flag.quote)), [openFlags, needle]);

  const pendingVerifications = 9 - resolved.length;
  const ordersToday = useTween(38);
  const receivables = useTween(12480000, 1.2);
  const collected = 16140000;
  const invoiced = 28620000;
  const collectedShare = Math.round((collected / invoiced) * 100);
  const spark = useMemo(() => sparkPaths(SPARK), []);

  const activeLabel = NAV_GROUPS.flatMap(group => group.items).find(item => item.key === active);
  const isWorkspace = ["orders", "inventory", "sku", "retailers", "payments", "ledger"].includes(active);
  const searchCopy: Record<string, string> = {
    dashboard: "Search orders, retailers, SKUs",
    orders: "Search orders and retailers",
    inventory: "Search products and SKUs",
    sku: "Search official SKUs and aliases",
    retailers: "Search retailers and markets",
    payments: "Search payment references",
    ledger: "Search retailers with debt",
  };

  function confirmFlag(flag: Flag) {
    const choice = choices[flag.id];
    if (!choice) return;
    setResolved(current => [...current, { id: flag.id, label: choice, retailer: flag.retailer }]);
    setOpenFlag(null);
  }

  function undoFlag(id: string) {
    setResolved(current => current.filter(item => item.id !== id));
  }

  function selectNav(key: string) {
    if (key.startsWith("__business:")) {
      setBusiness(Number(key.split(":")[1]));
      return;
    }
    setActive(key);
    setDrawer(false);
  }

  function signOut() {
    localStorage.removeItem("leda.preview.session");
    sessionStorage.removeItem("leda.preview.session");
    window.location.hash = "/signin";
  }

  return (
    <div className="dash-app">
      <aside className="dash-sidebar">
        <SidebarContent active={active} onSelect={selectNav} business={business} unread={notifications} pending={pendingVerifications} onSignOut={signOut} />
      </aside>

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div className="dash-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
            <motion.aside className="dash-sidebar" style={{ display: "flex" }} initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ duration: reduce ? 0 : 0.26, ease: [0.16, 1, 0.3, 1] }} aria-label="Workspace navigation">
              <button type="button" className="dash-drawer-close" aria-label="Close navigation" onClick={() => setDrawer(false)}><X size={17} /></button>
              <SidebarContent active={active} onSelect={selectNav} business={business} unread={notifications} pending={pendingVerifications} onSignOut={signOut} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="dash-frame">
        <header className="dash-header">
          <button type="button" className="dash-menu-button" aria-label="Open navigation" onClick={() => setDrawer(true)}><Menu size={18} /></button>
          <div className="dash-header-titles">
            <h1>{activeLabel?.label ?? "Command Center"}</h1>
            <p>{BUSINESSES[business].name} · {BUSINESSES[business].detail.split(" · ")[1]}</p>
          </div>

          <div className="dash-search">
            <Search size={16} strokeWidth={1.9} aria-hidden="true" />
            <label htmlFor="dash-search" className="sr-only">{searchCopy[active] ?? "Search this workspace"}</label>
            <input ref={searchRef} id="dash-search" type="search" placeholder={searchCopy[active] ?? "Search this workspace"} value={query} onChange={event => setQuery(event.target.value)} />
            {query ? (
              <button type="button" className="dash-search-clear" aria-label="Clear search" onClick={() => { setQuery(""); searchRef.current?.focus(); }}><X size={14} /></button>
            ) : (
              <kbd aria-hidden="true">⌘K</kbd>
            )}
          </div>

          <div className="dash-header-actions">
            <div className="dash-popover-wrap" ref={bellRef}>
              <button type="button" className={`dash-icon-button${notifications ? " dash-icon-button-badge" : ""}`} data-count={notifications || undefined} aria-label={`Notifications, ${notifications} unread`} aria-haspopup="menu" aria-expanded={bellOpen} onClick={() => setBellOpen(open => !open)}>
                <Bell size={18} strokeWidth={1.8} />
              </button>
              <AnimatePresence>
                {bellOpen && (
                  <motion.div className="dash-popover" role="menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
                    <p>Latest activity</p>
                    {NOTIFICATIONS.map(item => (
                      <button key={item.id} type="button" role="menuitem" className="dash-popover-item" onClick={() => setBellOpen(false)}>
                        <item.icon size={16} />
                        <div style={{ flex: 1 }}>
                          <p>{item.title}</p>
                          <span>{item.detail}</span>
                        </div>
                      </button>
                    ))}
                    <button type="button" className="dash-popover-item" onClick={() => { setNotifications(0); setBellOpen(false); }}>
                      <CheckCheck size={16} />
                      <div style={{ flex: 1 }}><p>Mark all as read</p><span>{notifications} updates cleared from here</span></div>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="dash-popover-wrap" ref={profileRef}>
              <button type="button" className="dash-profile-button" aria-haspopup="menu" aria-expanded={profileOpen} onClick={() => setProfileOpen(open => !open)}>
                <span className="dash-avatar" aria-hidden="true">AO</span>
                <span className="dash-profile-copy"><strong>Ada Okoro</strong><span>Owner</span></span>
                <ChevronDown size={15} style={{ color: "#93a091" }} />
              </button>
              <AnimatePresence>
                {profileOpen && (
                  <motion.div className="dash-popover" role="menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
                    <button type="button" role="menuitem" className="dash-popover-item" onClick={() => { setProfileOpen(false); setActive("settings"); }}><Settings size={16} /><div style={{ flex: 1 }}><p>Workspace settings</p><span>Business profile, channels, payments</span></div></button>
                    <a className="dash-popover-item" role="menuitem" href="#/welcome" style={{ textDecoration: "none" }}><ArrowUpRight size={16} /><div style={{ flex: 1 }}><p>View the public site</p><span>Landing page and decode demo</span></div></a>
                    <button type="button" role="menuitem" className="dash-popover-item" onClick={signOut}><LogOut size={16} /><div style={{ flex: 1 }}><p>Sign out</p><span>Ada Okoro · Owner</span></div></button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main className="dash-main">
          {active !== "dashboard" && isWorkspace ? (
            <Workspaces active={active as "orders" | "inventory" | "sku" | "retailers" | "payments" | "ledger"} query={query} />
          ) : active !== "dashboard" && activeLabel ? (
            <div className="dash-preview">
              <div className="dash-preview-card">
                <span className="dash-preview-icon" aria-hidden="true"><activeLabel.icon size={24} strokeWidth={1.7} /></span>
                <h2>{activeLabel.label} is part of the full product.</h2>
                <p>This preview covers the Command Center: your daily snapshot of orders, verifications and receivables. Everything else keeps the same layout, density and Sabi Engine data.</p>
                <button type="button" className="dash-button-primary" onClick={() => setActive("dashboard")}><LayoutDashboard size={16} />Back to Command Center</button>
              </div>
            </div>
          ) : (
            <>
              <div className="dash-content-head">
                <div>
                  <h2><Greeting name="Ada" /></h2>
                  <p>{new Date().toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long" })} · {BUSINESSES[business].name} · updated just now</p>
                </div>
                <div className="dash-content-actions">
                  <button type="button" className="dash-button-ghost" onClick={() => {
                    setOpenFlag(openFlags[0]?.id ?? null);
                    attentionRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
                  }}><TriangleAlert size={15.5} />Review {openFlags.length} flag{openFlags.length === 1 ? "" : "s"}</button>
                  <span className="dash-popover-wrap" ref={newOrderRef}>
                    <button type="button" className="dash-button-primary" aria-haspopup="menu" aria-expanded={newOrderOpen} onClick={() => setNewOrderOpen(open => !open)}><Plus size={16} />New order</button>
                    <AnimatePresence>
                      {newOrderOpen && (
                        <motion.div className="dash-popover" role="menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
                          <p>Start an order</p>
                          <button type="button" role="menuitem" className="dash-popover-item" onClick={() => { setNewOrderOpen(false); setActive("orders"); }}>
                            <ClipboardList size={16} />
                            <div style={{ flex: 1 }}><p>Open the orders workspace</p><span>Create it there and Sabi keeps the ledger in step</span></div>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </span>
                </div>
              </div>

              {needle && (
                <p className="dash-search-note" role="status">
                  Showing results for <strong>&ldquo;{query}&rdquo;</strong> · {visibleOrders.length} of 5 recent orders, {visibleFlags.length} of {openFlags.length} flagged
                  <button type="button" className="dash-section-link" onClick={() => setQuery("")}>Clear</button>
                </p>
              )}

              {/* ---------------------------------------------- KPI row */}
              <section className="dash-section" aria-label="Today at a glance">
                <div className="dash-kpis">
                  <KpiTile
                    label="Total orders today" icon={ClipboardList}
                    accent="#b45309" tint="rgba(180,83,9,.09)" bg="rgba(180,83,9,.11)"
                    value={Math.round(ordersToday).toLocaleString("en-NG")}
                    valueSuffix={<small> orders</small>}
                    meta={<>
                      <span className="dash-kpi-delta"><TrendingUp size={12} />+18.75%</span>
                      <span>vs 32 orders yesterday</span>
                    </>}
                  >
                    <div className="dash-kpi-chart">
                      <svg viewBox="0 0 100 34" preserveAspectRatio="none" style={{ display: "block", width: "100%", height: 54 }} role="img" aria-label="Orders rising from 21 to 38 across the last seven trading days">
                        <defs>
                          <linearGradient id="dash-spark" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#b45309" stopOpacity="0.22" />
                            <stop offset="100%" stopColor="#b45309" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <motion.path d={spark.area} fill="url(#dash-spark)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.7, delay: 0.25 }} />
                        <motion.path d={spark.line} fill="none" stroke="#b45309" strokeWidth="1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduce ? 0 : 1.2, ease: "easeInOut" }} />
                        <circle cx={spark.last[0]} cy={spark.last[1]} r="2.2" fill="#b45309" />
                      </svg>
                    </div>
                  </KpiTile>

                  <KpiTile
                    label="Pending verifications" icon={ShieldAlert}
                    accent="#da8300" tint="rgba(218,131,0,.12)" bg="rgba(218,131,0,.14)"
                    value={String(pendingVerifications)}
                    valueSuffix={<small> items</small>}
                    meta={<span>Oldest waiting 12 minutes · nothing blocks a sale</span>}
                  >
                    <div className="dash-kpi-breakdown">
                      <span className="dash-chip dash-chip-alert" aria-live="polite"><Sparkles size={12} /><strong>{openFlags.length}</strong>&nbsp;AI flags</span>
                      <span className="dash-chip"><strong>3</strong>&nbsp;awaiting transfer</span>
                      <span className="dash-chip"><strong>2</strong>&nbsp;duplicate check</span>
                    </div>
                  </KpiTile>

                  <KpiTile
                    label="Total receivables" icon={Wallet}
                    accent="#065f46" tint="rgba(6,95,70,.07)" bg="rgba(6,95,70,.09)"
                    value={naira(receivables)}
                    meta={<span>of {naira(invoiced)} invoiced this month · ₦4.8M due this week</span>}
                  >
                    <div className="dash-kpi-bar">
                      <div className="dash-kpi-bar-track" role="progressbar" aria-label={`${collectedShare}% of invoiced value collected`} aria-valuenow={collectedShare} aria-valuemin={0} aria-valuemax={100}>
                        <motion.div className="dash-kpi-bar-fill" initial={{ width: 0 }} animate={{ width: `${collectedShare}%` }} transition={{ duration: reduce ? 0 : 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }} />
                      </div>
                      <div className="dash-kpi-bar-labels"><span>Collected {naira(collected)}</span><span>{collectedShare}% of invoices</span></div>
                    </div>
                  </KpiTile>
                </div>
              </section>

              {/* ---------------------------------------------- activity + attention */}
              <section className="dash-section dash-grid" aria-label="Activity and attention">
                <div className="dash-card">
                  <div className="dash-card-head">
                    <div>
                      <h3>Recent activity</h3>
                      <p>Last 5 orders across WhatsApp, photos and typed requests</p>
                    </div>
                    <button type="button" className="dash-section-link" onClick={() => setActive("orders")}>View all orders<ArrowRight size={14} /></button>
                  </div>
                  <div className="dash-table-scroll">
                    <table className="dash-table">
                      <thead>
                        <tr><th scope="col">Order</th><th scope="col">Retailer</th><th scope="col">Channel</th><th scope="col">Amount</th><th scope="col">Status</th></tr>
                      </thead>
                      <tbody>
                        <AnimatePresence initial={false}>
                          {visibleOrders.map(order => {
                            const ChannelIcon = CHANNEL_ICON[order.channel];
                            return (
                              <motion.tr key={order.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: reduce ? 0 : 0.2 }}>
                                <td><a className="dash-order-id" href={`#/order/${order.id.slice(1)}`}>{order.id}</a><span className="dash-order-time">{order.time} · {order.items} items</span></td>
                                <td><span className="dash-retailer"><strong>{order.retailer}</strong><span>{order.market}</span></span></td>
                                <td><span className="dash-channel"><ChannelIcon size={14.5} />{order.channel}</span></td>
                                <td><span className="dash-num-strong">{naira(order.amount)}</span></td>
                                <td>
                                  <span className="dash-status">
                                    <span className={`dash-status-badge ${order.status === "Paid" ? "dash-status-paid" : "dash-status-pending"}`}>
                                      {order.status === "Paid" ? <BadgeCheck size={13} /> : <Clock size={13} />}
                                      {order.status}
                                    </span>
                                    <span className="dash-status-detail">{order.detail}</span>
                                  </span>
                                </td>
                              </motion.tr>
                            );
                          })}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>
                  {visibleOrders.length === 0 && <p className="dash-empty">No orders match &ldquo;{query}&rdquo; today.</p>}
                  <div className="dash-card-foot">
                    <span>Showing {visibleOrders.length} of 1,284 orders today · ₦6,517,500 reconciled</span>
                    <button type="button" className="dash-section-link" onClick={() => setActive("orders")}>Open orders workspace<ChevronRight size={14} /></button>
                  </div>
                </div>

                <div className="dash-card dash-attention" ref={attentionRef}>
                  <div className="dash-attention-head">
                    <div>
                      <h3><TriangleAlert size={16.5} />Attention required</h3>
                      <p>Sabi flagged these for a human eye, with its reasoning attached</p>
                    </div>
                    <span className="dash-attention-count" aria-live="polite" aria-label={`${openFlags.length} items need attention`}>{openFlags.length}</span>
                  </div>

                  <div className="dash-flags">
                    <AnimatePresence initial={false}>
                      {visibleFlags.map(flag => {
                        const isOpen = openFlag === flag.id;
                        const chosen = choices[flag.id];
                        const questionSent = asked.includes(flag.id);
                        const FlagIcon = flag.kind === "Voice note" ? Mic : flag.kind === "Photo" ? Camera : MessageSquare;
                        return (
                          <motion.article key={flag.id} layout className={`dash-flag${isOpen ? " dash-flag-open" : ""}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: reduce ? 1 : 0.97, height: 0, marginBottom: 0 }} transition={{ duration: reduce ? 0 : 0.22 }}>
                            <button type="button" className="dash-flag-head" aria-expanded={isOpen} onClick={() => setOpenFlag(isOpen ? null : flag.id)}>
                              <span className="dash-flag-body">
                                <span className="dash-flag-retailer">{flag.retailer}<span>{flag.id}</span></span>
                                <span className="dash-flag-issue">{flag.issue}</span>
                                <span className="dash-flag-kind">{flag.kind} · raised {flag.raised}</span>
                              </span>
                              <ChevronDown size={16} className="dash-flag-chevron" />
                            </button>
                            <AnimatePresence initial={false}>
                              {isOpen && (
                                <motion.div className="dash-flag-detail" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduce ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}>
                                  <p className="dash-quote"><FlagIcon size={13} style={{ verticalAlign: -2, marginRight: 6, color: "#8a5a10" }} /><strong>{flag.quote}</strong></p>
                                  <p className="dash-flag-why"><Sparkles size={13} />{flag.why}</p>
                                  <div className="dash-options" role="radiogroup" aria-label={`Choose the correct value for ${flag.id}`}>
                                    {flag.options.map(option => (
                                      <button key={option} type="button" role="radio" aria-checked={chosen === option} className={`dash-option${chosen === option ? " dash-option-active" : ""}`} onClick={() => setChoices(current => ({ ...current, [flag.id]: option }))}>{option}</button>
                                    ))}
                                  </div>
                                  <div className="dash-flag-actions">
                                    <a className="dash-button-ghost" href={`#/order/${flag.id.slice(1)}`}><ClipboardList size={14} />Open war room</a>
                                    <button type="button" className="dash-button-primary" disabled={!chosen} onClick={() => confirmFlag(flag)}><Check size={14} />Confirm &amp; clear flag</button>
                                    <button type="button" className="dash-button-ghost" disabled={questionSent} onClick={() => setAsked(current => [...current, flag.id])}><MessageSquare size={14} />Ask retailer</button>
                                  </div>
                                  {questionSent && <p className="dash-flag-sent"><CheckCheck size={14} />Question sent to {flag.retailer} on WhatsApp. The order stays pending until they reply.</p>}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.article>
                        );
                      })}
                    </AnimatePresence>

                    {visibleFlags.length === 0 && openFlags.length === 0 && (
                      <div className="dash-all-clear">
                        <BadgeCheck size={30} strokeWidth={1.6} />
                        <p>All caught up. Every flagged order is resolved.</p>
                        <span>Sabi cleared the rest without a human eye. New flags land here the moment they appear.</span>
                      </div>
                    )}
                    {visibleFlags.length === 0 && openFlags.length > 0 && <p className="dash-empty">No flagged orders match &ldquo;{query}&rdquo;.</p>}
                  </div>

                  {resolved.length > 0 && (
                    <div className="dash-flags" style={{ paddingTop: 0 }}>
                      <AnimatePresence initial={false}>
                        {resolved.map(item => (
                          <motion.div key={item.id} layout className="dash-flag-resolved" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
                            <BadgeCheck size={17} />
                            <p><strong>{item.retailer}</strong> · {item.label} confirmed and written to the ledger.<br /><span style={{ color: "#7c8d7c" }}>{item.id} moved to verified</span></p>
                            <button type="button" className="dash-section-link" onClick={() => undoFlag(item.id)}>Undo</button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}

                  <div className="dash-attention-foot">
                    <span>Sabi resolves 96% of messages on its own. These {openFlags.length || "few"} are the exceptions.</span>
                    <button type="button" className="dash-section-link" onClick={() => setActive("orders")}>Queue<ArrowRight size={14} /></button>
                  </div>
                </div>
              </section>

              <div className="dash-ledger-strip">
                <span><ReceiptText size={14} />Ledger synced 09:05 · reconciled <strong>{naira(6517500)}</strong></span>
                <span><HandCoins size={14} />Bulk payout to your bank on Friday · <strong>₦8,240,000</strong></span>
                <span><MessageSquare size={14} />{asked.length ? <><strong>{asked.length}</strong>&nbsp;question{asked.length > 1 ? "s" : ""} sent to retailers</> : "No questions sent to retailers yet today"}</span>
              </div>
            </>
          )}
        </main>

        <footer className="dash-footer">
          Command Center preview · figures are illustrative · Leda Technologies Ltd, Surulere, Lagos
        </footer>
      </div>
    </div>
  );
}
