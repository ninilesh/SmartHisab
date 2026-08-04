import { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard, Users, Package, FileText, BarChart3, Plus, Search,
  ArrowLeft, X, Trash2, ChevronRight, Phone, AlertTriangle, IndianRupee,
} from "lucide-react";

// ---- Theme tokens: "official ledger + stamp" business identity ----
const BG_APP = "#F2F0EA";
const CARD_BG = "#FFFFFF";
const BORDER = "#E3E0D6";
const INK = "#1F2430";
const INK_SOFT = "#6B7280";
const PRIMARY = "#1D3557";
const PRIMARY_DARK = "#14263F";
const ACCENT = "#C77D26";
const GREEN = "#1E7A4C";
const RED = "#B23A2E";

const displayFont = 'ui-sans-serif, system-ui, "Segoe UI", sans-serif';
const bodyFont = 'ui-sans-serif, system-ui, "Segoe UI", sans-serif';

const LOW_STOCK = 5;
const GST_SLABS = [0, 5, 12, 18, 28];
const STORAGE_KEY = "vyapar-app-data";

function rupee(n) {
  const abs = Math.abs(Math.round(n));
  return "₹" + abs.toLocaleString("en-IN");
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function formatDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function monthKey(d) {
  return d.slice(0, 7);
}

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "parties", label: "Parties", icon: Users },
  { key: "items", label: "Items", icon: Package },
  { key: "invoices", label: "Invoices", icon: FileText },
  { key: "reports", label: "Reports", icon: BarChart3 },
];

export default function VyaparApp() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState({ parties: [], items: [], transactions: [], invoices: [], invoiceCounter: 1 });
  const [view, setView] = useState("dashboard");
  const [selectedPartyId, setSelectedPartyId] = useState(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [modal, setModal] = useState(null); // 'addParty' | 'addItem' | 'payment'

  useEffect(() => {
    (async () => {
      try {
        if (window.storage) {
          const res = await window.storage.get(STORAGE_KEY, false);
          if (res && res.value) setData(JSON.parse(res.value));
        } else {
          const res = localStorage.getItem(STORAGE_KEY);
          if (res) setData(JSON.parse(res));
        }
      } catch (e) {
        // fresh install, nothing saved yet
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function persist(next) {
    setData(next);
    setError("");
    try {
      if (window.storage) {
        const result = await window.storage.set(STORAGE_KEY, JSON.stringify(next), false);
        if (!result) setError("Save nahi ho paaya. Dobara try karein.");
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
    } catch (e) {
      setError("Save nahi ho paaya. Dobara try karein.");
    }
  }

  // ---- derived helpers ----
  function partyBalance(partyId) {
    return data.transactions
      .filter((t) => t.partyId === partyId)
      .reduce((s, t) => s + (t.type === "gave" ? t.amount : -t.amount), 0);
  }
  const totalReceivable = data.parties.reduce((s, p) => {
    const b = partyBalance(p.id);
    return b > 0 ? s + b : s;
  }, 0);
  const lowStockItems = data.items.filter((i) => i.stock <= LOW_STOCK);
  const salesThisMonth = data.invoices
    .filter((inv) => monthKey(inv.date) === monthKey(todayStr()))
    .reduce((s, inv) => s + inv.total, 0);

  // ---- mutations ----
  function addParty(name, phone) {
    const p = { id: crypto.randomUUID(), name: name.trim(), phone: phone.trim() };
    persist({ ...data, parties: [...data.parties, p] });
    return p.id;
  }
  function addItem(name, salePrice, purchasePrice, stock, unit) {
    const it = {
      id: crypto.randomUUID(),
      name: name.trim(),
      salePrice: Number(salePrice) || 0,
      purchasePrice: Number(purchasePrice) || 0,
      stock: Number(stock) || 0,
      unit: unit.trim() || "pc",
    };
    persist({ ...data, items: [...data.items, it] });
  }
  function adjustStock(itemId, delta) {
    const items = data.items.map((i) => (i.id === itemId ? { ...i, stock: i.stock + delta } : i));
    persist({ ...data, items });
  }
  function recordPayment(partyId, amount, note, invoiceId) {
    const t = {
      id: crypto.randomUUID(), partyId, type: "got",
      amount: Math.round(Number(amount) * 100) / 100,
      note: note.trim(), date: todayStr(), invoiceId: invoiceId || null,
    };
    let invoices = data.invoices;
    if (invoiceId) {
      invoices = data.invoices.map((inv) => {
        if (inv.id !== invoiceId) return inv;
        const paid = inv.amountPaid + t.amount;
        return { ...inv, amountPaid: paid, status: paid >= inv.total ? "paid" : paid > 0 ? "partial" : "unpaid" };
      });
    }
    persist({ ...data, transactions: [...data.transactions, t], invoices });
  }
  function createInvoice(partyId, items, taxPercent) {
    const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
    const taxAmount = Math.round(subtotal * taxPercent) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;
    const invoiceNo = `INV-${String(data.invoiceCounter).padStart(4, "0")}`;
    const invoice = {
      id: crypto.randomUUID(), invoiceNo, partyId, date: todayStr(),
      items, subtotal, taxPercent, taxAmount, total, amountPaid: 0, status: "unpaid",
    };
    const newItems = data.items.map((i) => {
      const line = items.find((li) => li.itemId === i.id);
      return line ? { ...i, stock: i.stock - line.qty } : i;
    });
    const txn = {
      id: crypto.randomUUID(), partyId, type: "gave", amount: total,
      note: `Invoice ${invoiceNo}`, date: todayStr(), invoiceId: invoice.id,
    };
    persist({
      ...data,
      items: newItems,
      invoices: [...data.invoices, invoice],
      transactions: [...data.transactions, txn],
      invoiceCounter: data.invoiceCounter + 1,
    });
    return invoice.id;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG_APP }}>
        <p style={{ fontFamily: bodyFont, color: INK_SOFT }} className="text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ background: BG_APP, fontFamily: bodyFont }}>
      {/* desktop sidebar */}
      <aside
        className="hidden md:flex flex-col w-56 flex-shrink-0 min-h-screen"
        style={{ background: PRIMARY_DARK }}
      >
        <div className="px-5 py-6">
          <h1 style={{ fontFamily: displayFont, color: "#fff" }} className="text-lg font-bold tracking-tight">
            VYAPAR<span style={{ color: ACCENT }}>+</span>
          </h1>
          <p className="text-[11px] mt-0.5" style={{ color: "#9AA7B8" }}>Business Manager</p>
        </div>
        <nav className="flex-1 px-3">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => { setView(n.key); setSelectedPartyId(null); setSelectedInvoiceId(null); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm"
              style={{
                background: view === n.key ? PRIMARY : "transparent",
                color: view === n.key ? "#fff" : "#A9B4C4",
              }}
            >
              <n.icon size={17} />
              {n.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* main column */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        <header
          className="flex items-center justify-between px-4 md:px-6 py-4 flex-shrink-0"
          style={{ background: PRIMARY }}
        >
          <h2 style={{ fontFamily: displayFont, color: "#fff" }} className="text-base md:text-lg font-semibold">
            {view === "dashboard" && "Dashboard"}
            {view === "parties" && !selectedPartyId && "Parties"}
            {view === "parties" && selectedPartyId && data.parties.find((p) => p.id === selectedPartyId)?.name}
            {view === "items" && "Items"}
            {view === "invoices" && !selectedInvoiceId && "Invoices"}
            {view === "invoices" && selectedInvoiceId && data.invoices.find((i) => i.id === selectedInvoiceId)?.invoiceNo}
            {view === "reports" && "Reports"}
            {view === "invoiceCreate" && "Naya Invoice"}
          </h2>
          {error && <span className="text-xs" style={{ color: "#F3C6C0" }}>{error}</span>}
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {view === "dashboard" && (
            <Dashboard
              data={data}
              totalReceivable={totalReceivable}
              lowStockItems={lowStockItems}
              salesThisMonth={salesThisMonth}
              onGoInvoices={() => setView("invoices")}
              onOpenInvoice={(id) => { setSelectedInvoiceId(id); setView("invoices"); }}
            />
          )}

          {view === "parties" && !selectedPartyId && (
            <PartiesList
              parties={data.parties}
              partyBalance={partyBalance}
              onSelect={(id) => setSelectedPartyId(id)}
              onAdd={() => setModal("addParty")}
            />
          )}
          {view === "parties" && selectedPartyId && (
            <PartyDetail
              party={data.parties.find((p) => p.id === selectedPartyId)}
              txns={data.transactions.filter((t) => t.partyId === selectedPartyId).sort((a, b) => (a.date < b.date ? 1 : -1))}
              balance={partyBalance(selectedPartyId)}
              onBack={() => setSelectedPartyId(null)}
              onPayment={() => setModal("payment")}
              onOpenInvoice={(invId) => { setSelectedInvoiceId(invId); setView("invoices"); setSelectedPartyId(null); }}
            />
          )}

          {view === "items" && (
            <ItemsList items={data.items} onAdd={() => setModal("addItem")} onAdjust={adjustStock} />
          )}

          {view === "invoices" && !selectedInvoiceId && (
            <InvoicesList
              invoices={data.invoices}
              parties={data.parties}
              onSelect={(id) => setSelectedInvoiceId(id)}
              onCreate={() => setView("invoiceCreate")}
            />
          )}
          {view === "invoices" && selectedInvoiceId && (
            <InvoiceDetail
              invoice={data.invoices.find((i) => i.id === selectedInvoiceId)}
              party={data.parties.find((p) => p.id === data.invoices.find((i) => i.id === selectedInvoiceId)?.partyId)}
              onBack={() => setSelectedInvoiceId(null)}
              onPayment={() => setModal("payment")}
            />
          )}

          {view === "invoiceCreate" && (
            <InvoiceCreate
              parties={data.parties}
              items={data.items}
              onBack={() => setView("invoices")}
              onAddParty={addParty}
              onCreate={(partyId, items, tax) => {
                const id = createInvoice(partyId, items, tax);
                setSelectedInvoiceId(id);
                setView("invoices");
              }}
            />
          )}

          {view === "reports" && <Reports data={data} />}
        </main>
      </div>

      {/* mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 flex justify-around py-2 z-10"
        style={{ background: PRIMARY_DARK, borderTop: `1px solid ${PRIMARY}` }}
      >
        {NAV.map((n) => (
          <button
            key={n.key}
            onClick={() => { setView(n.key); setSelectedPartyId(null); setSelectedInvoiceId(null); }}
            className="flex flex-col items-center gap-0.5 px-2 py-1"
            style={{ color: view === n.key ? ACCENT : "#8B96A6" }}
          >
            <n.icon size={19} />
            <span className="text-[10px]">{n.label}</span>
          </button>
        ))}
      </nav>

      {modal === "addParty" && (
        <AddPartyModal onClose={() => setModal(null)} onSave={(n, p) => { addParty(n, p); setModal(null); }} />
      )}
      {modal === "addItem" && (
        <AddItemModal onClose={() => setModal(null)} onSave={(...args) => { addItem(...args); setModal(null); }} />
      )}
      {modal === "payment" && (
        <PaymentModal
          partyName={
            data.parties.find((p) => p.id === (selectedPartyId || data.invoices.find((i) => i.id === selectedInvoiceId)?.partyId))?.name
          }
          onClose={() => setModal(null)}
          onSave={(amount, note) => {
            const invoice = data.invoices.find((i) => i.id === selectedInvoiceId);
            const pid = selectedPartyId || invoice?.partyId;
            recordPayment(pid, amount, note, selectedInvoiceId || null);
            setModal(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------- shared bits ----------------

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-xl p-4 ${className}`} style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}>
      {children}
    </div>
  );
}

function StatusStamp({ status }) {
  const cfg = {
    paid: { label: "PAID", color: GREEN },
    partial: { label: "PARTIAL", color: ACCENT },
    unpaid: { label: "UNPAID", color: RED },
  }[status];
  return (
    <div
      className="inline-flex items-center justify-center px-4 py-1.5 rounded-full text-xs font-bold tracking-wider"
      style={{
        border: `2px dashed ${cfg.color}`,
        color: cfg.color,
        transform: "rotate(-4deg)",
      }}
    >
      {cfg.label}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
      style={{ background: PRIMARY, color: "#fff", ...style }}
    >
      {children}
    </button>
  );
}

// ---------------- Dashboard ----------------

function Dashboard({ data, totalReceivable, lowStockItems, salesThisMonth, onGoInvoices, onOpenInvoice }) {
  const recent = [...data.invoices].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <p className="text-xs" style={{ color: INK_SOFT }}>Sales (Is Mahine)</p>
          <p className="text-xl font-bold mt-1" style={{ color: PRIMARY }}>{rupee(salesThisMonth)}</p>
        </Card>
        <Card>
          <p className="text-xs" style={{ color: INK_SOFT }}>Aapko Lena Hai</p>
          <p className="text-xl font-bold mt-1" style={{ color: GREEN }}>{rupee(totalReceivable)}</p>
        </Card>
        <Card>
          <p className="text-xs" style={{ color: INK_SOFT }}>Total Invoices</p>
          <p className="text-xl font-bold mt-1" style={{ color: INK }}>{data.invoices.length}</p>
        </Card>
        <Card>
          <p className="text-xs" style={{ color: INK_SOFT }}>Low Stock Items</p>
          <p className="text-xl font-bold mt-1" style={{ color: lowStockItems.length ? RED : INK }}>{lowStockItems.length}</p>
        </Card>
      </div>

      {lowStockItems.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} color={RED} />
            <p className="text-sm font-semibold" style={{ color: INK }}>Stock Kam Hai</p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {lowStockItems.map((i) => (
              <li key={i.id} className="text-xs px-2 py-1 rounded-full" style={{ background: "#F7EAE8", color: RED }}>
                {i.name} — {i.stock} {i.unit}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold" style={{ color: INK }}>Recent Invoices</p>
          <button onClick={onGoInvoices} className="text-xs" style={{ color: PRIMARY }}>Sab Dekhein</button>
        </div>
        {recent.length === 0 && <p className="text-sm" style={{ color: INK_SOFT }}>Abhi tak koi invoice nahi bana</p>}
        <ul>
          {recent.map((inv) => (
            <li
              key={inv.id}
              onClick={() => onOpenInvoice(inv.id)}
              className="flex items-center justify-between py-2 cursor-pointer"
              style={{ borderBottom: `1px dashed ${BORDER}` }}
            >
              <div>
                <p className="text-sm font-medium" style={{ color: INK }}>{inv.invoiceNo}</p>
                <p className="text-xs" style={{ color: INK_SOFT }}>{formatDate(inv.date)}</p>
              </div>
              <p className="text-sm font-semibold" style={{ color: INK }}>{rupee(inv.total)}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ---------------- Parties ----------------

function PartiesList({ parties, partyBalance, onSelect, onAdd }) {
  const [search, setSearch] = useState("");
  const filtered = parties.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 flex-1" style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}>
          <Search size={15} color={INK_SOFT} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Naam se dhoondein"
            className="flex-1 bg-transparent outline-none text-sm" style={{ color: INK }} />
        </div>
        <PrimaryButton onClick={onAdd}><Plus size={14} className="inline -mt-0.5 mr-1" />Party</PrimaryButton>
      </div>
      <Card>
        {filtered.length === 0 && <p className="text-sm text-center py-6" style={{ color: INK_SOFT }}>Koi party nahi mili</p>}
        <ul>
          {filtered.map((p) => {
            const bal = partyBalance(p.id);
            return (
              <li key={p.id}>
                <button onClick={() => onSelect(p.id)} className="w-full flex items-center justify-between py-3" style={{ borderBottom: `1px dashed ${BORDER}` }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold" style={{ background: `${PRIMARY}1A`, color: PRIMARY }}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate text-sm" style={{ color: INK }}>{p.name}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <p className="text-sm font-semibold" style={{ color: bal === 0 ? INK_SOFT : bal > 0 ? GREEN : RED }}>{rupee(bal)}</p>
                    <ChevronRight size={15} color={INK_SOFT} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function PartyDetail({ party, txns, balance, onBack, onPayment, onOpenInvoice }) {
  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack} className="flex items-center gap-2 text-sm" style={{ color: PRIMARY }}>
        <ArrowLeft size={15} /> Parties
      </button>
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-semibold" style={{ color: INK }}>{party?.name}</p>
            {party?.phone && (
              <a href={`tel:${party.phone}`} className="text-xs flex items-center gap-1 mt-0.5" style={{ color: INK_SOFT }}>
                <Phone size={12} /> {party.phone}
              </a>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs" style={{ color: INK_SOFT }}>{balance === 0 ? "Clear" : balance > 0 ? "Lena Hai" : "Dena Hai"}</p>
            <p className="text-xl font-bold" style={{ color: balance === 0 ? INK : balance > 0 ? GREEN : RED }}>{rupee(balance)}</p>
          </div>
        </div>
        <PrimaryButton onClick={onPayment} style={{ marginTop: 14, width: "100%" }}>Payment Record Karein</PrimaryButton>
      </Card>
      <Card>
        <p className="text-sm font-semibold mb-2" style={{ color: INK }}>Ledger</p>
        {txns.length === 0 && <p className="text-sm" style={{ color: INK_SOFT }}>Koi len-den nahi hai</p>}
        <ul>
          {txns.map((t) => (
            <li key={t.id} onClick={() => t.invoiceId && onOpenInvoice(t.invoiceId)}
              className="flex items-center justify-between py-2" style={{ borderBottom: `1px dashed ${BORDER}`, cursor: t.invoiceId ? "pointer" : "default" }}>
              <div>
                <p className="text-sm" style={{ color: INK }}>{t.note || (t.type === "gave" ? "Udhaar Diya" : "Payment Mila")}</p>
                <p className="text-xs" style={{ color: INK_SOFT }}>{formatDate(t.date)}</p>
              </div>
              <p className="text-sm font-semibold" style={{ color: t.type === "gave" ? GREEN : RED }}>
                {t.type === "gave" ? "+" : "-"}{rupee(t.amount)}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ---------------- Items ----------------

function ItemsList({ items, onAdd, onAdjust }) {
  const [search, setSearch] = useState("");
  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 flex-1" style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}>
          <Search size={15} color={INK_SOFT} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item dhoondein"
            className="flex-1 bg-transparent outline-none text-sm" style={{ color: INK }} />
        </div>
        <PrimaryButton onClick={onAdd}><Plus size={14} className="inline -mt-0.5 mr-1" />Item</PrimaryButton>
      </div>
      <Card>
        {filtered.length === 0 && <p className="text-sm text-center py-6" style={{ color: INK_SOFT }}>Koi item nahi hai</p>}
        <ul>
          {filtered.map((i) => (
            <li key={i.id} className="flex items-center justify-between py-3" style={{ borderBottom: `1px dashed ${BORDER}` }}>
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: INK }}>{i.name}</p>
                <p className="text-xs" style={{ color: INK_SOFT }}>Sale: {rupee(i.salePrice)} / {i.unit}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <p className="text-sm font-semibold" style={{ color: i.stock <= LOW_STOCK ? RED : INK }}>{i.stock} {i.unit}</p>
                <div className="flex gap-1">
                  <button onClick={() => onAdjust(i.id, -1)} className="w-6 h-6 rounded-full text-sm font-bold flex items-center justify-center" style={{ background: `${RED}1A`, color: RED }}>−</button>
                  <button onClick={() => onAdjust(i.id, 1)} className="w-6 h-6 rounded-full text-sm font-bold flex items-center justify-center" style={{ background: `${GREEN}1A`, color: GREEN }}>+</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ---------------- Invoices ----------------

function InvoicesList({ invoices, parties, onSelect, onCreate }) {
  const sorted = [...invoices].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <PrimaryButton onClick={onCreate}><Plus size={14} className="inline -mt-0.5 mr-1" />Naya Invoice</PrimaryButton>
      </div>
      <Card>
        {sorted.length === 0 && <p className="text-sm text-center py-6" style={{ color: INK_SOFT }}>Koi invoice nahi bana abhi tak</p>}
        <ul>
          {sorted.map((inv) => {
            const party = parties.find((p) => p.id === inv.partyId);
            return (
              <li key={inv.id}>
                <button onClick={() => onSelect(inv.id)} className="w-full flex items-center justify-between py-3" style={{ borderBottom: `1px dashed ${BORDER}` }}>
                  <div className="text-left">
                    <p className="text-sm font-medium" style={{ color: INK }}>{inv.invoiceNo} · {party?.name || "—"}</p>
                    <p className="text-xs" style={{ color: INK_SOFT }}>{formatDate(inv.date)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold" style={{ color: INK }}>{rupee(inv.total)}</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{
                      color: inv.status === "paid" ? GREEN : inv.status === "partial" ? ACCENT : RED,
                      background: inv.status === "paid" ? "#EAF4EE" : inv.status === "partial" ? "#FBF0E3" : "#F7EAE8",
                    }}>{inv.status.toUpperCase()}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function InvoiceDetail({ invoice, party, onBack, onPayment }) {
  if (!invoice) return null;
  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack} className="flex items-center gap-2 text-sm" style={{ color: PRIMARY }}>
        <ArrowLeft size={15} /> Invoices
      </button>
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-bold" style={{ color: INK }}>{invoice.invoiceNo}</p>
            <p className="text-sm" style={{ color: INK_SOFT }}>{party?.name} · {formatDate(invoice.date)}</p>
          </div>
          <StatusStamp status={invoice.status} />
        </div>

        <div className="mt-4 rounded-lg overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
          <div className="grid grid-cols-4 text-xs font-semibold px-3 py-2" style={{ background: BG_APP, color: INK_SOFT }}>
            <span className="col-span-2">Item</span><span className="text-right">Qty</span><span className="text-right">Amount</span>
          </div>
          {invoice.items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-4 text-sm px-3 py-2" style={{ borderTop: `1px solid ${BORDER}`, color: INK }}>
              <span className="col-span-2 truncate">{it.name}</span>
              <span className="text-right">{it.qty}</span>
              <span className="text-right">{rupee(it.qty * it.price)}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-1 text-sm">
          <div className="flex justify-between"><span style={{ color: INK_SOFT }}>Subtotal</span><span style={{ color: INK }}>{rupee(invoice.subtotal)}</span></div>
          <div className="flex justify-between"><span style={{ color: INK_SOFT }}>Tax ({invoice.taxPercent}%)</span><span style={{ color: INK }}>{rupee(invoice.taxAmount)}</span></div>
          <div className="flex justify-between font-bold text-base"><span>Total</span><span>{rupee(invoice.total)}</span></div>
          <div className="flex justify-between"><span style={{ color: INK_SOFT }}>Mila Hua</span><span style={{ color: GREEN }}>{rupee(invoice.amountPaid)}</span></div>
          <div className="flex justify-between font-semibold"><span style={{ color: INK_SOFT }}>Baaki</span><span style={{ color: RED }}>{rupee(invoice.total - invoice.amountPaid)}</span></div>
        </div>

        {invoice.status !== "paid" && (
          <PrimaryButton onClick={onPayment} style={{ marginTop: 14, width: "100%" }}>Payment Record Karein</PrimaryButton>
        )}
      </Card>
    </div>
  );
}

function InvoiceCreate({ parties, items, onBack, onAddParty, onCreate }) {
  const [partyId, setPartyId] = useState("");
  const [newPartyName, setNewPartyName] = useState("");
  const [lines, setLines] = useState([{ itemId: "", qty: 1, price: 0, name: "" }]);
  const [tax, setTax] = useState(0);

  const subtotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
  const taxAmount = (subtotal * tax) / 100;
  const total = subtotal + taxAmount;

  function updateLine(idx, patch) {
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function pickItem(idx, itemId) {
    const it = items.find((i) => i.id === itemId);
    updateLine(idx, { itemId, name: it?.name || "", price: it?.salePrice || 0 });
  }
  function handleCreate() {
    let finalPartyId = partyId;
    if (!finalPartyId && newPartyName.trim()) finalPartyId = onAddParty(newPartyName, "");
    const cleanLines = lines
      .filter((l) => l.itemId && Number(l.qty) > 0)
      .map((l) => ({ itemId: l.itemId, name: l.name, qty: Number(l.qty), price: Number(l.price) }));
    if (!finalPartyId || cleanLines.length === 0) return;
    onCreate(finalPartyId, cleanLines, tax);
  }

  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <button onClick={onBack} className="flex items-center gap-2 text-sm" style={{ color: PRIMARY }}>
        <ArrowLeft size={15} /> Invoices
      </button>
      <Card>
        <p className="text-xs mb-1" style={{ color: INK_SOFT }}>Party</p>
        <select value={partyId} onChange={(e) => setPartyId(e.target.value)}
          className="w-full rounded-lg px-3 py-2.5 text-sm outline-none mb-2" style={{ border: `1px solid ${BORDER}`, color: INK }}>
          <option value="">-- Party Chunein --</option>
          {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {!partyId && (
          <input value={newPartyName} onChange={(e) => setNewPartyName(e.target.value)} placeholder="Ya naya naam likhein"
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ border: `1px solid ${BORDER}`, color: INK }} />
        )}
      </Card>

      <Card>
        <p className="text-sm font-semibold mb-2" style={{ color: INK }}>Items</p>
        {lines.map((l, idx) => (
          <div key={idx} className="flex items-center gap-2 mb-2">
            <select value={l.itemId} onChange={(e) => pickItem(idx, e.target.value)}
              className="flex-1 rounded-lg px-2 py-2 text-sm outline-none min-w-0" style={{ border: `1px solid ${BORDER}`, color: INK }}>
              <option value="">-- Item --</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.stock} {i.unit})</option>)}
            </select>
            <input type="number" min="1" value={l.qty} onChange={(e) => updateLine(idx, { qty: e.target.value })}
              className="w-16 rounded-lg px-2 py-2 text-sm outline-none" style={{ border: `1px solid ${BORDER}`, color: INK }} />
            <input type="number" min="0" value={l.price} onChange={(e) => updateLine(idx, { price: e.target.value })}
              className="w-20 rounded-lg px-2 py-2 text-sm outline-none" style={{ border: `1px solid ${BORDER}`, color: INK }} />
            <button onClick={() => setLines(lines.filter((_, i) => i !== idx))} aria-label="Remove">
              <X size={16} color={INK_SOFT} />
            </button>
          </div>
        ))}
        <button onClick={() => setLines([...lines, { itemId: "", qty: 1, price: 0, name: "" }])}
          className="text-xs mt-1" style={{ color: PRIMARY }}>+ Aur Item Jodein</button>

        <div className="mt-4">
          <p className="text-xs mb-1" style={{ color: INK_SOFT }}>GST / Tax</p>
          <div className="flex gap-2">
            {GST_SLABS.map((g) => (
              <button key={g} onClick={() => setTax(g)}
                className="px-3 py-1.5 rounded-full text-xs font-medium"
                style={{ background: tax === g ? PRIMARY : BG_APP, color: tax === g ? "#fff" : INK }}>
                {g}%
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-1 text-sm">
          <div className="flex justify-between"><span style={{ color: INK_SOFT }}>Subtotal</span><span>{rupee(subtotal)}</span></div>
          <div className="flex justify-between"><span style={{ color: INK_SOFT }}>Tax</span><span>{rupee(taxAmount)}</span></div>
          <div className="flex justify-between font-bold text-base"><span>Total</span><span>{rupee(total)}</span></div>
        </div>

        <PrimaryButton onClick={handleCreate} style={{ marginTop: 14, width: "100%" }}>Invoice Banayein</PrimaryButton>
      </Card>
    </div>
  );
}

// ---------------- Reports ----------------

function Reports({ data }) {
  const totalSales = data.invoices.reduce((s, i) => s + i.total, 0);
  const monthly = useMemo(() => {
    const map = {};
    data.invoices.forEach((inv) => {
      const k = monthKey(inv.date);
      map[k] = (map[k] || 0) + inv.total;
    });
    return Object.entries(map).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 6);
  }, [data.invoices]);

  const itemQty = useMemo(() => {
    const map = {};
    data.invoices.forEach((inv) => inv.items.forEach((it) => {
      map[it.name] = (map[it.name] || 0) + it.qty;
    }));
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [data.invoices]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-xs" style={{ color: INK_SOFT }}>Total Sales (Sab Time)</p>
          <p className="text-xl font-bold mt-1" style={{ color: PRIMARY }}>{rupee(totalSales)}</p>
        </Card>
        <Card>
          <p className="text-xs" style={{ color: INK_SOFT }}>Total Invoices</p>
          <p className="text-xl font-bold mt-1" style={{ color: INK }}>{data.invoices.length}</p>
        </Card>
      </div>
      <Card>
        <p className="text-sm font-semibold mb-2" style={{ color: INK }}>Mahine Wise Sales</p>
        {monthly.length === 0 && <p className="text-sm" style={{ color: INK_SOFT }}>Data nahi hai</p>}
        <ul>
          {monthly.map(([m, val]) => (
            <li key={m} className="flex justify-between py-1.5 text-sm" style={{ borderBottom: `1px dashed ${BORDER}` }}>
              <span style={{ color: INK }}>{m}</span><span style={{ color: PRIMARY, fontWeight: 600 }}>{rupee(val)}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <p className="text-sm font-semibold mb-2" style={{ color: INK }}>Top Bikne Waale Items</p>
        {itemQty.length === 0 && <p className="text-sm" style={{ color: INK_SOFT }}>Data nahi hai</p>}
        <ul>
          {itemQty.map(([name, qty]) => (
            <li key={name} className="flex justify-between py-1.5 text-sm" style={{ borderBottom: `1px dashed ${BORDER}` }}>
              <span style={{ color: INK }}>{name}</span><span style={{ color: INK_SOFT }}>{qty} units</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ---------------- Modals ----------------

function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-20 flex items-end md:items-center justify-center" style={{ background: "rgba(20,38,63,0.5)" }}>
      <div className="w-full md:max-w-sm rounded-t-2xl md:rounded-2xl p-5" style={{ background: CARD_BG }}>
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontFamily: displayFont, color: INK }} className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="Band karein"><X size={19} color={INK_SOFT} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddPartyModal({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <ModalShell title="Nayi Party" onClose={onClose}>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Naam"
        className="w-full rounded-lg px-3 py-2.5 text-sm outline-none mb-3" style={{ border: `1px solid ${BORDER}`, color: INK }} />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" inputMode="numeric"
        className="w-full rounded-lg px-3 py-2.5 text-sm outline-none mb-4" style={{ border: `1px solid ${BORDER}`, color: INK }} />
      <PrimaryButton disabled={!name.trim()} onClick={() => onSave(name, phone)} style={{ width: "100%" }}>Save Karein</PrimaryButton>
    </ModalShell>
  );
}

function AddItemModal({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [stock, setStock] = useState("");
  const [unit, setUnit] = useState("pc");
  return (
    <ModalShell title="Naya Item" onClose={onClose}>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Item ka naam"
        className="w-full rounded-lg px-3 py-2.5 text-sm outline-none mb-3" style={{ border: `1px solid ${BORDER}`, color: INK }} />
      <div className="grid grid-cols-2 gap-3 mb-3">
        <input value={salePrice} onChange={(e) => setSalePrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Sale Price" inputMode="decimal"
          className="rounded-lg px-3 py-2.5 text-sm outline-none" style={{ border: `1px solid ${BORDER}`, color: INK }} />
        <input value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Purchase Price" inputMode="decimal"
          className="rounded-lg px-3 py-2.5 text-sm outline-none" style={{ border: `1px solid ${BORDER}`, color: INK }} />
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <input value={stock} onChange={(e) => setStock(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Stock Qty" inputMode="decimal"
          className="rounded-lg px-3 py-2.5 text-sm outline-none" style={{ border: `1px solid ${BORDER}`, color: INK }} />
        <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit (pc/kg)"
          className="rounded-lg px-3 py-2.5 text-sm outline-none" style={{ border: `1px solid ${BORDER}`, color: INK }} />
      </div>
      <PrimaryButton disabled={!name.trim()} onClick={() => onSave(name, salePrice, purchasePrice, stock, unit)} style={{ width: "100%" }}>Save Karein</PrimaryButton>
    </ModalShell>
  );
}

function PaymentModal({ partyName, onClose, onSave }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  return (
    <ModalShell title={`Payment — ${partyName || ""}`} onClose={onClose}>
      <div className="flex items-center rounded-lg px-3 py-2.5 mb-3" style={{ border: `1px solid ${BORDER}` }}>
        <IndianRupee size={16} color={GREEN} />
        <input autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" inputMode="decimal"
          className="flex-1 bg-transparent outline-none text-lg ml-1" style={{ color: INK }} />
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (Cash/UPI...)"
        className="w-full rounded-lg px-3 py-2.5 text-sm outline-none mb-4" style={{ border: `1px solid ${BORDER}`, color: INK }} />
      <PrimaryButton disabled={!amount || Number(amount) <= 0} onClick={() => onSave(amount, note)} style={{ width: "100%", background: GREEN }}>
        Payment Save Karein
      </PrimaryButton>
    </ModalShell>
  );
}