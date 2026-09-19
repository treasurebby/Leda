import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight, BadgeCheck, Banknote, Boxes, Check, CheckCheck, ClipboardList,
  Clock, Download, Filter, HandCoins, LockKeyhole, MessageSquare, Mic, Plus,
  Search, Store, Tags, TrendingUp, TriangleAlert, Wallet, X,
} from "lucide-react";

type WorkspaceKey = "orders" | "inventory" | "sku" | "retailers" | "payments" | "ledger";
type OrderState = "Paid" | "Pending" | "Processing" | "Needs review";

type WorkspaceProps = {
  active: WorkspaceKey;
  query: string;
};

const currency = (amount: number) => "\u20A6" + amount.toLocaleString("en-NG");
const normalise = (value: string) => value.toLowerCase();

const ALL_ORDERS: {
  id: string;
  retailer: string;
  market: string;
  time: string;
  channel: "Voice note" | "Text order" | "Photo";
  items: number;
  amount: number;
  status: OrderState;
  owner: string;
}[] = [
  { id: "#LE-1042", retailer: "Madam Kike Stores", market: "Trade Fair Complex, Lagos", time: "Today, 09:05", channel: "Voice note", items: 80, amount: 6517500, status: "Paid", owner: "Ada" },
  { id: "#LE-1041", retailer: "Okafor Provisions", market: "Onitsha Main Market", time: "Today, 08:52", channel: "Voice note", items: 42, amount: 2410000, status: "Needs review", owner: "Ada" },
  { id: "#LE-1040", retailer: "Amina Food Mart", market: "Kantin Kwari, Kano", time: "Today, 08:31", channel: "Text order", items: 26, amount: 1845500, status: "Paid", owner: "Musa" },
  { id: "#LE-1039", retailer: "Bola & Sons", market: "Oyingbo, Lagos", time: "Today, 07:58", channel: "Photo", items: 18, amount: 972000, status: "Processing", owner: "Ada" },
  { id: "#LE-1038", retailer: "Emeka Beverages Ltd", market: "Ariaria, Aba", time: "Today, 07:40", channel: "Voice note", items: 55, amount: 3120000, status: "Pending", owner: "Chidi" },
  { id: "#LE-1037", retailer: "Alhaji Musa Grains", market: "Kantin Kwari, Kano", time: "Today, 07:19", channel: "Photo", items: 34, amount: 2674500, status: "Needs review", owner: "Musa" },
  { id: "#LE-1036", retailer: "Yetunde Electronics", market: "Alaba International", time: "Yesterday, 17:20", channel: "Text order", items: 15, amount: 1430000, status: "Paid", owner: "Ada" },
  { id: "#LE-1035", retailer: "Idris Supermarket", market: "Wuse Market, Abuja", time: "Yesterday, 16:54", channel: "Voice note", items: 22, amount: 1887500, status: "Paid", owner: "Chidi" },
];

const PRODUCTS = [
  { sku: "RSR-50", product: "Royal Stallion Parboiled Rice", pack: "Bag 50kg", stock: 126, reorder: 60, reserved: 40, value: 9891000, trend: "+12 bags today" },
  { sku: "MGR-50", product: "Mama Gold Premium Rice", pack: "Bag 50kg", stock: 43, reorder: 55, reserved: 25, value: 3319600, trend: "12 below reorder" },
  { sku: "KVO-25R", product: "Kings Vegetable Oil", pack: "Keg 25L", stock: 18, reorder: 35, reserved: 15, value: 1737000, trend: "17 below reorder" },
  { sku: "FSL-25", product: "Fortune Soya Oil", pack: "Keg 25L", stock: 67, reorder: 30, reserved: 0, value: 6097000, trend: "+4 delivered today" },
  { sku: "SUG-50", product: "Dangote Granulated Sugar", pack: "Bag 50kg", stock: 31, reorder: 40, reserved: 12, value: 2232000, trend: "9 below reorder" },
  { sku: "NOD-70", product: "Golden Penny Noodles", pack: "Carton 70", stock: 205, reorder: 80, reserved: 20, value: 6150000, trend: "Healthy stock" },
];

const RETAILERS = [
  { name: "Madam Kike Stores", initials: "MK", market: "Trade Fair Complex, Lagos", orders: 128, outstanding: 0, terms: "7 day credit", lastOrder: "Today, 09:05", tier: "Gold", phone: "+234 803 405 1198" },
  { name: "Okafor Provisions", initials: "OP", market: "Onitsha Main Market", orders: 89, outstanding: 2410000, terms: "Cash on delivery", lastOrder: "Today, 08:52", tier: "Gold", phone: "+234 805 201 6042" },
  { name: "Amina Food Mart", initials: "AF", market: "Kantin Kwari, Kano", orders: 73, outstanding: 0, terms: "14 day credit", lastOrder: "Today, 08:31", tier: "Silver", phone: "+234 706 549 0211" },
  { name: "Emeka Beverages Ltd", initials: "EB", market: "Ariaria, Aba", orders: 62, outstanding: 3120000, terms: "7 day credit", lastOrder: "Today, 07:40", tier: "Gold", phone: "+234 803 882 3048" },
  { name: "Bola & Sons", initials: "BS", market: "Oyingbo, Lagos", orders: 48, outstanding: 0, terms: "Cash on delivery", lastOrder: "Today, 07:58", tier: "Silver", phone: "+234 805 610 7789" },
  { name: "Alhaji Musa Grains", initials: "AM", market: "Kantin Kwari, Kano", orders: 41, outstanding: 2674500, terms: "7 day credit", lastOrder: "Today, 07:19", tier: "Standard", phone: "+234 802 044 3288" },
];

type Payment = { id: string; retailer: string; reference: string; received: string; amount: number; status: "Matched" | "Review" | "Pending"; detail: string };
const PAYMENTS: Payment[] = [
  { id: "pay-1042", retailer: "Madam Kike Stores", reference: "LEDA-1042-KIKE", received: "Today, 09:05", amount: 6517500, status: "Matched", detail: "Matched to #LE-1042" },
  { id: "pay-1040", retailer: "Amina Food Mart", reference: "LEDA-1040-AMINA", received: "Today, 08:44", amount: 1845500, status: "Matched", detail: "Matched to #LE-1040" },
  { id: "pay-1038", retailer: "Emeka Beverages Ltd", reference: "TRF-EMEKA-APR", received: "Today, 08:17", amount: 3120000, status: "Review", detail: "Amount matches, reference is unclear" },
  { id: "pay-1031", retailer: "Okafor Provisions", reference: "Pending", received: "Due today", amount: 2410000, status: "Pending", detail: "Virtual account has not been credited" },
  { id: "pay-1028", retailer: "Alhaji Musa Grains", reference: "LEDA-MUSA-1028", received: "Due tomorrow", amount: 2674500, status: "Pending", detail: "Virtual account awaiting payment" },
];

const DEBT_ACCOUNTS = [
  { id: "okafor", retailer: "Okafor Provisions", market: "Onitsha Main Market", ordered: 14800000, paid: 12390000, due: "Due today", risk: "High", contact: "+234 805 201 6042" },
  { id: "emeka", retailer: "Emeka Beverages Ltd", market: "Ariaria, Aba", ordered: 11720000, paid: 8600000, due: "Due in 2 days", risk: "High", contact: "+234 803 882 3048" },
  { id: "musa", retailer: "Alhaji Musa Grains", market: "Kantin Kwari, Kano", ordered: 9405000, paid: 6730000, due: "Due tomorrow", risk: "Medium", contact: "+234 802 044 3288" },
  { id: "chima", retailer: "Chima General Stores", market: "Balogun Market, Lagos", ordered: 6220000, paid: 5680000, due: "Due in 5 days", risk: "Low", contact: "+234 809 511 1987" },
  { id: "sadiq", retailer: "Sadiq Mart", market: "Wuse Market, Abuja", ordered: 4350000, paid: 4130000, due: "Due in 6 days", risk: "Low", contact: "+234 706 488 2003" },
];

const SKU_MAPPINGS = [
  { code: "PEAK-380-EV", official: "Peak Milk Evaporated 380g", pack: "Carton 48", aliases: ["Blue Peak", "Small Peak", "Peak tin"] },
  { code: "RSR-50", official: "Royal Stallion Parboiled Rice 50kg", pack: "Bag 50kg", aliases: ["Stallion", "White Stallion", "The fifty kg Stallion"] },
  { code: "MGR-50", official: "Mama Gold Premium Rice 50kg", pack: "Bag 50kg", aliases: ["Mama Gold", "Gold rice", "The other fifty"] },
  { code: "KVO-25R", official: "Kings Vegetable Oil Red Cap 25L", pack: "Keg 25L", aliases: ["Red cap oil", "Kings 25", "The red one"] },
  { code: "FSL-25", official: "Fortune Soya Oil 25L", pack: "Keg 25L", aliases: ["Yellow oil", "Fortune 25", "Yellow belle"] },
  { code: "NOD-70", official: "Golden Penny Noodles 70g", pack: "Carton 70", aliases: ["GP noodles", "Small Golden Penny"] },
  { code: "SUG-50", official: "Dangote Granulated Sugar 50kg", pack: "Bag 50kg", aliases: ["Dangote sugar", "White sugar bag", "Sugar fifty"] },
];

const statusClass = (status: string) => `workspace-status workspace-status-${status.toLowerCase().replace(/\s/g, "-")}`;
const channelIcon = (channel: string) => channel === "Voice note" ? Mic : channel === "Photo" ? Boxes : MessageSquare;

function PageHead({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return <div className="workspace-head"><div><h2>{title}</h2><p>{description}</p></div>{children && <div className="workspace-head-actions">{children}</div>}</div>;
}

function ScopeTabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (tab: string) => void }) {
  return <div className="workspace-tabs" role="tablist">{tabs.map(tab => <button key={tab} type="button" role="tab" aria-selected={active === tab} className={active === tab ? "workspace-tab-active" : ""} onClick={() => onChange(tab)}>{tab}</button>)}</div>;
}

function WorkspaceMetric({ label, value, meta, icon: Icon, kind = "green" }: { label: string; value: string; meta: string; icon: typeof Wallet; kind?: "green" | "gold" | "amber" }) {
  return <article className={`workspace-metric workspace-metric-${kind}`}><span className="workspace-metric-icon"><Icon size={19} /></span><div><p>{label}</p><strong>{value}</strong><span>{meta}</span></div></article>;
}

function OrderWorkspace({ query }: Omit<WorkspaceProps, "active">) {
  const [scope, setScope] = useState("All orders");
  const [newToast, setNewToast] = useState(false);
  const reduce = useReducedMotion();
  const needle = normalise(query.trim());
  const rows = ALL_ORDERS.filter(order => {
    const correctScope = scope === "All orders" || order.status === scope;
    const matching = !needle || [order.id, order.retailer, order.market, order.channel, order.status, order.owner].join(" ").toLowerCase().includes(needle);
    return correctScope && matching;
  });
  const pending = ALL_ORDERS.filter(order => order.status === "Pending").length;

  return <>
    <PageHead title="Orders" description="Every conversation, photo and typed request, structured into a trackable sale.">
      <button type="button" className="dash-button-ghost"><Filter size={15} />Filters</button>
      <button type="button" className="dash-button-primary" onClick={() => { setNewToast(true); window.setTimeout(() => setNewToast(false), 2500); }}><Plus size={16} />New order</button>
    </PageHead>
    {newToast && <p className="workspace-toast" role="status"><Check size={15} />New order draft opened. In a live workspace, this starts a clean manual order form.</p>}
    <section className="workspace-section">
      <div className="workspace-split-head"><ScopeTabs tabs={["All orders", "Paid", "Pending", "Processing", "Needs review"]} active={scope} onChange={setScope} /><p>{rows.length} showing · {pending} awaiting payment</p></div>
      <div className="workspace-card workspace-table-card"><div className="dash-table-scroll"><table className="dash-table workspace-table"><thead><tr><th>Order</th><th>Retailer</th><th>Received</th><th>Channel</th><th>Amount</th><th>Status</th><th>Owner</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody><AnimatePresence initial={false}>{rows.map(order => {
        const Icon = channelIcon(order.channel);
        return <motion.tr key={order.id} layout initial={{ opacity: 0, y: reduce ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: reduce ? 0 : .18 }}>
          <td><a className="dash-order-id" href={`#/order/${order.id.slice(1)}`}>{order.id}</a><span className="dash-order-time">{order.items} line items</span></td>
          <td><span className="dash-retailer"><strong>{order.retailer}</strong><span>{order.market}</span></span></td>
          <td className="workspace-muted">{order.time}</td>
          <td><span className="dash-channel"><Icon size={14} />{order.channel}</span></td>
          <td><span className="dash-num-strong">{currency(order.amount)}</span></td>
          <td><span className={statusClass(order.status)}>{order.status === "Paid" ? <BadgeCheck size={13} /> : order.status === "Needs review" ? <TriangleAlert size={13} /> : <Clock size={13} />}{order.status}</span></td>
          <td><span className="workspace-owner">{order.owner}</span></td>
          <td><a className="workspace-row-link" href={`#/order/${order.id.slice(1)}`}>Review<ArrowRight size={13} /></a></td>
        </motion.tr>;
      })}</AnimatePresence></tbody></table></div>{!rows.length && <p className="dash-empty">No orders match this view.</p>}</div>
    </section>
  </>;
}

function InventoryWorkspace({ query }: Omit<WorkspaceProps, "active">) {
  const [lowOnly, setLowOnly] = useState(false);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState("");
  const needle = normalise(query.trim());
  const products = PRODUCTS.map(product => ({ ...product, stock: stock[product.sku] ?? product.stock })).filter(product => {
    const low = product.stock <= product.reorder;
    const matching = !needle || [product.sku, product.product, product.pack].join(" ").toLowerCase().includes(needle);
    return (!lowOnly || low) && matching;
  });
  const lowCount = PRODUCTS.filter(product => (stock[product.sku] ?? product.stock) <= product.reorder).length;
  const totalValue = PRODUCTS.reduce((sum, product) => sum + (stock[product.sku] ?? product.stock) * (product.value / product.stock), 0);

  function restock(sku: string, amount: number) {
    const product = PRODUCTS.find(item => item.sku === sku)!;
    setStock(current => ({ ...current, [sku]: (current[sku] ?? product.stock) + amount }));
    setNotice(`${product.product}: ${amount} units added to available stock.`);
  }

  return <>
    <PageHead title="Inventory" description="Your sellable stock, committed quantities and reorder signals in one working list.">
      <button type="button" className="dash-button-ghost" onClick={() => setLowOnly(current => !current)}><TriangleAlert size={15} />{lowOnly ? "Show all stock" : `Low stock (${lowCount})`}</button>
      <button type="button" className="dash-button-primary" onClick={() => setNotice("Catalog import is ready in the onboarding flow. Your current catalog remains unchanged.")}><Plus size={16} />Add product</button>
    </PageHead>
    {notice && <p className="workspace-toast" role="status"><Check size={15} />{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss notification"><X size={14} /></button></p>}
    <section className="workspace-metrics-grid">
      <WorkspaceMetric label="Catalog value" value={currency(totalValue)} meta="Available stock at current sell price" icon={Boxes} />
      <WorkspaceMetric label="Low stock" value={`${lowCount} SKUs`} meta="At or below your reorder threshold" icon={TriangleAlert} kind="amber" />
      <WorkspaceMetric label="Committed today" value="112 units" meta="Reserved across 5 open orders" icon={ClipboardList} kind="gold" />
    </section>
    <section className="workspace-section"><div className="workspace-section-title"><div><h3>Catalog</h3><p>Stock updates here change only this local preview.</p></div><span>{products.length} SKUs visible</span></div>
      <div className="workspace-card workspace-table-card"><div className="dash-table-scroll"><table className="dash-table workspace-table"><thead><tr><th>Product</th><th>Available</th><th>Reserved</th><th>Reorder at</th><th>Stock value</th><th>Signal</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{products.map(product => {
        const low = product.stock <= product.reorder;
        return <tr key={product.sku}><td><span className="dash-retailer"><strong>{product.product}</strong><span className="workspace-sku">{product.sku} · {product.pack}</span></span></td><td><strong className={`workspace-stock${low ? " workspace-stock-low" : ""}`}>{product.stock}</strong></td><td className="dash-num">{product.reserved}</td><td className="dash-num">{product.reorder}</td><td className="dash-num-strong">{currency(Math.round(product.stock * (product.value / product.stock)))}</td><td><span className={low ? "workspace-stock-signal workspace-stock-signal-low" : "workspace-stock-signal"}>{low ? "Reorder now" : product.trend}</span></td><td><button type="button" className="workspace-row-link" onClick={() => restock(product.sku, low ? product.reorder : 10)}><Plus size={13} />{low ? "Restock" : "Add stock"}</button></td></tr>;
      })}</tbody></table></div>{!products.length && <p className="dash-empty">No catalog products match this view.</p>}</div>
    </section>
  </>;
}

function RetailersWorkspace({ query }: Omit<WorkspaceProps, "active">) {
  const [selected, setSelected] = useState<string | null>(null);
  const [newRetailer, setNewRetailer] = useState(false);
  const [name, setName] = useState("");
  const [added, setAdded] = useState<typeof RETAILERS>([]);
  const needle = normalise(query.trim());
  const allRetailers = [...RETAILERS, ...added];
  const retailers = allRetailers.filter(retailer => !needle || [retailer.name, retailer.market, retailer.phone, retailer.tier].join(" ").toLowerCase().includes(needle));
  const picked = allRetailers.find(retailer => retailer.name === selected);
  const outstanding = RETAILERS.reduce((sum, retailer) => sum + retailer.outstanding, 0);

  function addRetailer() {
    const clean = name.trim();
    if (!clean) return;
    setAdded(current => [...current, {
      name: clean,
      initials: clean.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase(),
      market: "Location to be added",
      orders: 0,
      outstanding: 0,
      terms: "Terms to be set",
      lastOrder: "No orders yet",
      tier: "Standard",
      phone: "Contact to be added",
    }]);
    setName("");
    setNewRetailer(false);
  }

  return <>
    <PageHead title="Retailers" description="Know who is buying, what they owe and how their relationship is moving.">
      <button type="button" className="dash-button-ghost"><Download size={15} />Export list</button>
      <button type="button" className="dash-button-primary" onClick={() => setNewRetailer(true)}><Plus size={16} />Add retailer</button>
    </PageHead>
    <section className="workspace-metrics-grid">
      <WorkspaceMetric label="Active retailers" value="186" meta="14 placed an order this week" icon={Store} />
      <WorkspaceMetric label="Credit outstanding" value={currency(outstanding)} meta="Across 3 accounts due this week" icon={HandCoins} kind="amber" />
      <WorkspaceMetric label="Repeat buyers" value="72%" meta="Ordered again in the last 30 days" icon={TrendingUp} kind="gold" />
    </section>
    <section className="workspace-section"><div className="workspace-section-title"><div><h3>Retailer directory</h3><p>Select a row to review the relationship snapshot.</p></div><span>{retailers.length} shown</span></div>
      <div className="workspace-card workspace-table-card"><div className="dash-table-scroll"><table className="dash-table workspace-table"><thead><tr><th>Retailer</th><th>Market</th><th>Orders</th><th>Outstanding</th><th>Terms</th><th>Last order</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{retailers.map(retailer => <tr key={retailer.name} className={selected === retailer.name ? "workspace-row-selected" : ""}><td><button type="button" className="workspace-retailer-button" onClick={() => setSelected(retailer.name)}><span className="workspace-initials">{retailer.initials}</span><span className="dash-retailer"><strong>{retailer.name}</strong><span>{retailer.tier} tier · {retailer.phone}</span></span></button></td><td className="workspace-muted">{retailer.market}</td><td className="dash-num">{retailer.orders}</td><td><span className={retailer.outstanding ? "workspace-amount-due" : "workspace-amount-clear"}>{retailer.outstanding ? currency(retailer.outstanding) : "Clear"}</span></td><td className="workspace-muted">{retailer.terms}</td><td className="workspace-muted">{retailer.lastOrder}</td><td><button type="button" className="workspace-row-link" onClick={() => setSelected(retailer.name)}>Profile<ArrowRight size={13} /></button></td></tr>)}</tbody></table></div>{!retailers.length && <p className="dash-empty">No retailers match this view.</p>}</div>
    </section>
    {added.length > 0 && <p className="workspace-toast" role="status"><Check size={15} />{added[added.length - 1].name} was added to this preview. Connect a backend to persist retailer profiles.</p>}
    <AnimatePresence>{picked && <motion.aside className="workspace-side-panel" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 14 }}><button type="button" className="workspace-panel-close" onClick={() => setSelected(null)} aria-label="Close retailer profile"><X size={16} /></button><span className="workspace-initials workspace-initials-large">{picked.initials}</span><h3>{picked.name}</h3><p>{picked.market}</p><div className="workspace-panel-list"><span><strong>{picked.orders}</strong> lifetime orders</span><span><strong>{picked.outstanding ? currency(picked.outstanding) : "No balance"}</strong> currently outstanding</span><span><strong>{picked.terms}</strong> agreed terms</span></div><button type="button" className="dash-button-primary" onClick={() => setSelected(null)}><MessageSquare size={15} />Message retailer</button></motion.aside>}</AnimatePresence>
    <AnimatePresence>{newRetailer && <motion.div className="workspace-modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setNewRetailer(false)}><motion.form className="workspace-modal" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} onSubmit={event => { event.preventDefault(); addRetailer(); }} onClick={event => event.stopPropagation()}><button type="button" className="workspace-panel-close" onClick={() => setNewRetailer(false)} aria-label="Close"><X size={16} /></button><h3>Add retailer</h3><p>Give the new buyer a name. A live workspace would request their contact details and payment terms next.</p><label className="workspace-label" htmlFor="new-retailer">Retailer or business name</label><input id="new-retailer" className="workspace-input" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Chima General Stores" autoFocus /><div className="workspace-modal-actions"><button type="button" className="dash-button-ghost" onClick={() => setNewRetailer(false)}>Cancel</button><button type="submit" className="dash-button-primary">Add retailer</button></div></motion.form></motion.div>}</AnimatePresence>
  </>;
}

function PaymentsWorkspace({ query }: Omit<WorkspaceProps, "active">) {
  const [payments, setPayments] = useState(PAYMENTS);
  const [scope, setScope] = useState("All activity");
  const needle = normalise(query.trim());
  const rows = payments.filter(payment => {
    const correctScope = scope === "All activity" || payment.status === scope;
    return correctScope && (!needle || [payment.retailer, payment.reference, payment.status, payment.detail].join(" ").toLowerCase().includes(needle));
  });
  const awaiting = payments.filter(payment => payment.status !== "Matched");
  const matchedToday = payments.filter(payment => payment.status === "Matched").reduce((sum, payment) => sum + payment.amount, 0);

  function matchPayment(id: string) {
    setPayments(current => current.map(payment => payment.id === id ? { ...payment, status: "Matched", detail: `Matched manually at ${new Date().toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}` } : payment));
  }

  return <>
    <PageHead title="Payments" description="Match incoming transfers, protect credit and keep every customer balance current.">
      <button type="button" className="dash-button-ghost"><Download size={15} />Export activity</button>
      <button type="button" className="dash-button-primary"><Banknote size={16} />Create payment link</button>
    </PageHead>
    <section className="workspace-metrics-grid">
      <WorkspaceMetric label="Matched today" value={currency(matchedToday)} meta="2 transfers reconciled automatically" icon={CheckCheck} />
      <WorkspaceMetric label="Needs matching" value={`${awaiting.length} payments`} meta="One reference needs a human check" icon={TriangleAlert} kind="amber" />
      <WorkspaceMetric label="Collections due" value={currency(7484500)} meta="Before Friday's payout run" icon={Wallet} kind="gold" />
    </section>
    <section className="workspace-section"><div className="workspace-split-head"><ScopeTabs tabs={["All activity", "Matched", "Review", "Pending"]} active={scope} onChange={setScope} /><p>{rows.length} payment records</p></div><div className="workspace-card workspace-table-card"><div className="dash-table-scroll"><table className="dash-table workspace-table"><thead><tr><th>Retailer</th><th>Reference</th><th>Received</th><th>Amount</th><th>Status</th><th>Ledger action</th></tr></thead><tbody>{rows.map(payment => <tr key={payment.id}><td><span className="dash-retailer"><strong>{payment.retailer}</strong><span>{payment.detail}</span></span></td><td className="workspace-sku">{payment.reference}</td><td className="workspace-muted">{payment.received}</td><td className="dash-num-strong">{currency(payment.amount)}</td><td><span className={statusClass(payment.status)}>{payment.status === "Matched" ? <BadgeCheck size={13} /> : payment.status === "Review" ? <TriangleAlert size={13} /> : <Clock size={13} />}{payment.status}</span></td><td>{payment.status === "Matched" ? <span className="workspace-ledger-action"><Check size={13} />Written to ledger</span> : <button type="button" className="workspace-row-link" onClick={() => matchPayment(payment.id)}><Check size={13} />Match now</button>}</td></tr>)}</tbody></table></div>{!rows.length && <p className="dash-empty">No payment activity matches this view.</p>}</div></section>
  </>;
}

function GlobalLedgerWorkspace({ query }: Omit<WorkspaceProps, "active">) {
  const [scope, setScope] = useState("All debt");
  const [retailerQuery, setRetailerQuery] = useState("");
  const [reminders, setReminders] = useState<Record<string, string>>({});
  const globalNeedle = normalise(query.trim());
  const localNeedle = normalise(retailerQuery.trim());
  const totalOutstanding = DEBT_ACCOUNTS.reduce((sum, account) => sum + account.ordered - account.paid, 0);
  const totalOrdered = DEBT_ACCOUNTS.reduce((sum, account) => sum + account.ordered, 0);
  const totalPaid = DEBT_ACCOUNTS.reduce((sum, account) => sum + account.paid, 0);
  const rows = DEBT_ACCOUNTS.filter(account => {
    const outstanding = account.ordered - account.paid;
    const reminder = reminders[account.id];
    const haystack = [account.retailer, account.market, account.contact, account.risk, account.due].join(" ").toLowerCase();
    const matching = [globalNeedle, localNeedle].filter(Boolean).every(term => haystack.includes(term));
    const correctScope = scope === "All debt" || scope === "Due today" && account.due === "Due today" || scope === "High risk" && account.risk === "High" || scope === "Reminded" && !!reminder;
    return outstanding > 0 && matching && correctScope;
  });

  function sendReminder(id: string) {
    const time = new Date().toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
    setReminders(current => ({ ...current, [id]: `Sent ${time}` }));
  }

  function exportDebt() {
    const header = "Retailer,Market,Total Ordered,Total Paid,Outstanding Balance,Due,Reminder";
    const content = [header, ...DEBT_ACCOUNTS.map(account => {
      const values = [account.retailer, account.market, account.ordered, account.paid, account.ordered - account.paid, account.due, reminders[account.id] ?? "Not sent"];
      return values.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",");
    })].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "leda-global-ledger-debt.csv";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <>
    <PageHead title="Global Ledger" description="Every retailer balance in one controlled view. Know exactly who owes, how much, and what to do next.">
      <button type="button" className="dash-button-ghost" onClick={exportDebt}><Download size={15} />Export debt list</button>
      <button type="button" className="dash-button-primary" onClick={() => setScope("High risk")}><TriangleAlert size={16} />Review high risk</button>
    </PageHead>
    <section className="ledger-control-banner" aria-label="Outstanding debt summary">
      <div className="ledger-control-main"><span><HandCoins size={19} />Total outstanding debt</span><strong>{currency(totalOutstanding)}</strong><p>Across {DEBT_ACCOUNTS.length} retailer accounts. This is the money currently outside your business.</p></div>
      <div className="ledger-control-facts"><div><span>Total ordered</span><strong>{currency(totalOrdered)}</strong></div><div><span>Total paid</span><strong>{currency(totalPaid)}</strong></div><div><span>Collection rate</span><strong>{Math.round((totalPaid / totalOrdered) * 100)}%</strong></div></div>
    </section>
    <section className="workspace-section">
      <div className="ledger-toolbar"><div className="ledger-search"><Search size={16} /><label className="sr-only" htmlFor="ledger-retailer-search">Search retailers in Global Ledger</label><input id="ledger-retailer-search" value={retailerQuery} onChange={event => setRetailerQuery(event.target.value)} placeholder="Search retailer or market" /></div><ScopeTabs tabs={["All debt", "Due today", "High risk", "Reminded"]} active={scope} onChange={setScope} /></div>
      <div className="workspace-card workspace-table-card ledger-table-card"><div className="dash-table-scroll"><table className="dash-table workspace-table ledger-table"><thead><tr><th>Retailer name</th><th>Total ordered (NGN)</th><th>Total paid (NGN)</th><th>Outstanding balance</th><th>Action</th></tr></thead><tbody><AnimatePresence initial={false}>{rows.map(account => {
        const outstanding = account.ordered - account.paid;
        const sent = reminders[account.id];
        return <motion.tr key={account.id} layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: .18 }}><td><span className="dash-retailer"><strong>{account.retailer}</strong><span>{account.market} · {account.due} · {account.risk} risk</span></span></td><td><span className="dash-num">{currency(account.ordered)}</span></td><td><span className="workspace-credit">{currency(account.paid)}</span></td><td><span className="ledger-outstanding">{currency(outstanding)}</span></td><td><div className="ledger-reminder-cell"><button type="button" className={sent ? "ledger-reminder ledger-reminder-sent" : "ledger-reminder"} onClick={() => sendReminder(account.id)}>{sent ? <CheckCheck size={14} /> : <MessageSquare size={14} />}{sent ? "Reminder sent" : "Send Payment Reminder"}</button>{sent && <span>{sent}</span>}</div></td></motion.tr>;
      })}</AnimatePresence></tbody></table></div>{!rows.length && <p className="dash-empty">No debt accounts match this view.</p>}</div>
      <p className="ledger-disclosure"><LockKeyhole size={13} />Reminders are prepared locally in this preview. Connect WhatsApp or email delivery before any retailer receives a collection notice.</p>
    </section>
  </>;
}

function SkuWorkspace({ query }: Omit<WorkspaceProps, "active">) {
  const [mappings, setMappings] = useState(SKU_MAPPINGS);
  const [editing, setEditing] = useState<string | null>(null);
  const [alias, setAlias] = useState("");
  const [notice, setNotice] = useState("");
  const needle = normalise(query.trim());
  const rows = mappings.filter(mapping => !needle || [mapping.code, mapping.official, mapping.pack, ...mapping.aliases].join(" ").toLowerCase().includes(needle));
  const aliasCount = mappings.reduce((sum, mapping) => sum + mapping.aliases.length, 0);

  function addAlias(code: string) {
    const value = alias.trim();
    if (!value) return;
    const mapping = mappings.find(item => item.code === code);
    if (!mapping) return;
    if (mapping.aliases.some(item => normalise(item) === normalise(value))) {
      setNotice(`“${value}” is already mapped to ${mapping.official}.`);
      return;
    }
    setMappings(current => current.map(item => item.code === code ? { ...item, aliases: [...item.aliases, value] } : item));
    setNotice(`Sabi learned “${value}” for ${mapping.official}.`);
    setAlias("");
    setEditing(null);
  }

  function removeAlias(code: string, value: string) {
    setMappings(current => current.map(item => item.code === code ? { ...item, aliases: item.aliases.filter(aliasValue => aliasValue !== value) } : item));
    setNotice(`Removed “${value}” from this mapping.`);
  }

  return <>
    <PageHead title="SKU Mapping" description="Teach Sabi the local names your retailers use, so market slang always lands on the right product.">
      <button type="button" className="dash-button-ghost" onClick={() => setNotice("SKU imports are available through your product catalog setup.")}><Download size={15} />Import mappings</button>
      <button type="button" className="dash-button-primary" onClick={() => setNotice("New SKUs are created from Inventory. Add aliases here once the product exists.")}><Plus size={16} />New SKU</button>
    </PageHead>
    {notice && <p className="workspace-toast" role="status"><Check size={15} />{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss notification"><X size={14} /></button></p>}
    <section className="workspace-metrics-grid sku-metrics">
      <WorkspaceMetric label="Mapped products" value={`${mappings.length} SKUs`} meta="Products Sabi can recognise" icon={Tags} />
      <WorkspaceMetric label="Known aliases" value={`${aliasCount} names`} meta="Street names and shorthand in your catalog" icon={MessageSquare} kind="gold" />
      <WorkspaceMetric label="Match quality" value="96%" meta="Straight through orders this week" icon={CheckCheck} kind="green" />
    </section>
    <section className="workspace-section"><div className="workspace-section-title"><div><h3>What your market calls it</h3><p>Official SKUs stay precise. Aliases make the AI fluent in the way your retailers order.</p></div><span>{rows.length} mappings shown</span></div>
      <div className="workspace-card workspace-table-card"><div className="dash-table-scroll"><table className="dash-table sku-table"><thead><tr><th>Official SKU</th><th>Aliases and street names</th></tr></thead><tbody>{rows.map(mapping => <tr key={mapping.code}><td><span className="dash-retailer"><strong>{mapping.official}</strong><span className="workspace-sku">{mapping.code} · {mapping.pack}</span></span></td><td><div className="sku-alias-cell"><div className="sku-aliases">{mapping.aliases.map(value => <span className="sku-alias" key={value}>{value}<button type="button" aria-label={`Remove alias ${value}`} onClick={() => removeAlias(mapping.code, value)}><X size={11} /></button></span>)}</div>{editing === mapping.code ? <form className="sku-add-form" onSubmit={event => { event.preventDefault(); addAlias(mapping.code); }}><input value={alias} onChange={event => setAlias(event.target.value)} placeholder="e.g. Blue Peak" autoFocus maxLength={80} /><button type="submit" className="sku-save-alias">Save</button><button type="button" className="sku-cancel-alias" onClick={() => { setEditing(null); setAlias(""); }}>Cancel</button></form> : <button type="button" className="sku-add-alias" onClick={() => { setEditing(mapping.code); setAlias(""); }}><Plus size={13} />Add New Alias</button>}</div></td></tr>)}</tbody></table></div>{!rows.length && <p className="dash-empty">No SKU mappings match this search.</p>}</div>
    </section>
  </>;
}

export default function Workspaces({ active, query }: WorkspaceProps) {
  if (active === "orders") return <OrderWorkspace query={query} />;
  if (active === "inventory") return <InventoryWorkspace query={query} />;
  if (active === "sku") return <SkuWorkspace query={query} />;
  if (active === "retailers") return <RetailersWorkspace query={query} />;
  if (active === "payments") return <PaymentsWorkspace query={query} />;
  return <GlobalLedgerWorkspace query={query} />;
}