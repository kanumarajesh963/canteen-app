import React, { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { IndianRupee, TrendingUp, ShoppingBag, PackageMinus, Plus, Pencil, Trash2, LogOut, AlertTriangle } from "lucide-react";
import { useStore } from "../lib/StoreContext";
import { summarize, dailySeries, monthlySeries, topSellers, categoryBreakdown } from "../lib/analytics";
import StatCard from "../components/StatCard";
import ProductModal from "../components/ProductModal";

const PIE_COLORS = ["#4C7A64", "#E8A93B", "#C0472A", "#1F3A2E", "#7C8B85", "#F3C876"];
const STATUS_FLOW = ["placed", "preparing", "ready", "picked_up"];
const STATUS_LABEL = { placed: "Placed", preparing: "Preparing", ready: "Ready", picked_up: "Picked up" };

export default function AdminDashboard() {
  const {
    isAdmin, logout, orders, products, addProduct, updateProduct, deleteProduct, setStock,
    placeOrder, canFulfill, lowStockProducts, setOrderStatus, company,
  } = useStore();
  const [tab, setTab] = useState("overview");
  const [modal, setModal] = useState(null); // null | 'new' | product

  const stats = useMemo(() => summarize(orders), [orders]);
  const daily = useMemo(() => dailySeries(orders, 14), [orders]);
  const monthly = useMemo(() => monthlySeries(orders), [orders]);
  const sellers = useMemo(() => topSellers(orders), [orders]);
  const catData = useMemo(() => categoryBreakdown(orders, products), [orders, products]);

  if (!isAdmin) return <Navigate to={`/${company.slug}/admin/login`} replace />;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-chalk text-3xl sm:text-4xl">Seller Dashboard</h1>
          <p className="text-steel text-sm">Track sales, manage stock, and log counter purchases for {company.name}.</p>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-full border border-ink/15 hover:bg-paper2"
        >
          <LogOut size={15} /> Log out
        </button>
      </div>

      {lowStockProducts.length > 0 && (
        <div className="mb-6 bg-brick/10 border border-brick/20 text-brick rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Running low: {lowStockProducts.map((p) => p.name).join(", ")}</p>
            <p className="text-xs mt-0.5">Restock these before they hit zero — check the Inventory tab.</p>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-none">
        {[
          ["overview", "Overview"],
          ["inventory", "Inventory"],
          ["orders", "Orders"],
          ["counter", "Counter Sale"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition ${
              tab === id ? "bg-board text-paper" : "border border-ink/15 text-ink/70 hover:border-board"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <Overview stats={stats} daily={daily} monthly={monthly} sellers={sellers} catData={catData} />
      )}

      {tab === "inventory" && (
        <Inventory
          products={products}
          setStock={setStock}
          onEdit={(p) => setModal(p)}
          onDelete={deleteProduct}
          onAdd={() => setModal("new")}
        />
      )}

      {tab === "orders" && <Orders orders={orders} setOrderStatus={setOrderStatus} />}

      {tab === "counter" && <CounterSale products={products} placeOrder={placeOrder} canFulfill={canFulfill} />}

      {modal && (
        <ProductModal
          initial={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSave={(data) => {
            if (modal === "new") addProduct(data);
            else updateProduct(modal.id, data);
            setModal(null);
          }}
        />
      )}
    </div>
  );
}

function Overview({ stats, daily, monthly, sellers, catData }) {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-mono uppercase text-steel mb-2">Today</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label="Revenue" value={`₹${stats.today.revenue}`} icon={IndianRupee} tone="sage" />
          <StatCard label="Profit" value={`₹${stats.today.profit}`} icon={TrendingUp} tone="turmeric" />
          <StatCard label="Orders" value={stats.today.orders} icon={ShoppingBag} tone="board" />
          <StatCard
            label="Cost"
            value={`₹${stats.today.cost}`}
            icon={PackageMinus}
            tone={stats.today.profit < 0 ? "brick" : "sage"}
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-mono uppercase text-steel mb-2">This Month</p>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Revenue" value={`₹${stats.month.revenue}`} tone="sage" />
            <StatCard
              label="Profit / Loss"
              value={`${stats.month.profit < 0 ? "-" : ""}₹${Math.abs(stats.month.profit)}`}
              tone={stats.month.profit < 0 ? "brick" : "turmeric"}
            />
          </div>
        </div>
        <div>
          <p className="text-xs font-mono uppercase text-steel mb-2">This Year</p>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Revenue" value={`₹${stats.year.revenue}`} tone="sage" />
            <StatCard
              label="Profit / Loss"
              value={`${stats.year.profit < 0 ? "-" : ""}₹${Math.abs(stats.year.profit)}`}
              tone={stats.year.profit < 0 ? "brick" : "turmeric"}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-ink/5 p-4 sm:p-5">
        <h3 className="font-semibold mb-3">Last 14 days — Revenue vs Profit</h3>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={daily} margin={{ left: -20, right: 10 }}>
            <defs>
              <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4C7A64" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#4C7A64" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="prof" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E8A93B" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#E8A93B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2B262015" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
            <YAxis tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: "1px solid #2B262015", fontFamily: "IBM Plex Mono", fontSize: 12 }}
            />
            <Area type="monotone" dataKey="revenue" stroke="#4C7A64" fill="url(#rev)" strokeWidth={2} name="Revenue" />
            <Area type="monotone" dataKey="profit" stroke="#E8A93B" fill="url(#prof)" strokeWidth={2} name="Profit" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-ink/5 p-4 sm:p-5">
          <h3 className="font-semibold mb-3">Monthly revenue ({new Date().getFullYear()})</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthly} margin={{ left: -20, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2B262015" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
              <YAxis tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #2B262015", fontFamily: "IBM Plex Mono", fontSize: 12 }} />
              <Bar dataKey="revenue" fill="#1F3A2E" radius={[6, 6, 0, 0]} name="Revenue" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-ink/5 p-4 sm:p-5">
          <h3 className="font-semibold mb-3">Revenue by category</h3>
          {catData.length === 0 ? (
            <p className="text-steel text-sm py-10 text-center">No sales recorded yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={catData} dataKey="value" nameKey="name" outerRadius={85} label={{ fontSize: 11 }}>
                  {catData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, fontFamily: "IBM Plex Mono", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-ink/5 p-4 sm:p-5">
        <h3 className="font-semibold mb-3">Top sellers</h3>
        {sellers.length === 0 ? (
          <p className="text-steel text-sm py-6 text-center">No sales yet — top items will appear here.</p>
        ) : (
          <div className="space-y-2">
            {sellers.map((s, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="w-6 font-mono text-steel">{i + 1}</span>
                <span className="text-xl">{s.emoji}</span>
                <span className="flex-1">{s.name}</span>
                <span className="font-mono text-steel">{s.qty} sold</span>
                <span className="font-mono font-semibold text-sage w-16 text-right">₹{s.revenue}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Inventory({ products, setStock, onEdit, onDelete, onAdd }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-steel text-sm">{products.length} items on the board. Adjust stock directly for walk-in changes.</p>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 bg-turmeric hover:bg-turmeric-dark text-ink text-sm font-semibold px-4 py-2 rounded-full"
        >
          <Plus size={16} /> Add item
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {products.map((p) => {
          const low = p.stock <= (p.low_stock_threshold ?? 5);
          return (
            <div key={p.id} className={`bg-white rounded-2xl border p-4 ${low ? "border-brick/40" : "border-ink/5"}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{p.emoji}</span>
                  <div>
                    <p className="font-semibold text-sm leading-tight">{p.name}</p>
                    <p className="text-xs text-steel font-mono">{p.category}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => onEdit(p)} className="p-1.5 rounded-lg hover:bg-paper2">
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => confirm(`Remove ${p.name} from the menu?`) && onDelete(p.id)}
                    className="p-1.5 rounded-lg hover:bg-brick/10 text-brick"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {low && (
                <p className="mt-2 text-[11px] font-mono text-brick flex items-center gap-1">
                  <AlertTriangle size={11} /> Below threshold of {p.low_stock_threshold ?? 5}
                </p>
              )}

              <div className="flex justify-between text-xs font-mono text-steel mt-3">
                <span>Sell ₹{p.price}</span>
                <span>Cost ₹{p.cost}</span>
                <span className="text-sage font-semibold">+₹{p.price - p.cost} margin</span>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs font-mono text-steel">Stock:</span>
                <input
                  type="number"
                  min="0"
                  defaultValue={p.stock}
                  onBlur={(e) => setStock(p.id, Number(e.target.value))}
                  className={`w-20 px-2 py-1 rounded-lg border font-mono text-sm ${
                    low ? "border-brick text-brick" : "border-ink/15"
                  }`}
                />
                <span className="text-xs text-steel">{p.unit}(s)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Orders({ orders, setOrderStatus }) {
  return (
    <div className="bg-white rounded-2xl border border-ink/5 overflow-hidden">
      {orders.length === 0 ? (
        <p className="text-steel text-sm py-12 text-center">No orders yet.</p>
      ) : (
        <div className="divide-y divide-ink/5">
          {orders.map((o) => {
            const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(o.status) + 1];
            return (
              <div key={o.id} className="p-4 flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs bg-board text-paper px-2.5 py-1 rounded-full">
                  #{String(o.token).padStart(3, "0")}
                </span>
                <span className="text-xs font-mono text-steel">
                  {new Date(o.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span
                  className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full ${
                    o.source === "counter" ? "bg-turmeric/20 text-turmeric-dark" : "bg-sage/10 text-sage"
                  }`}
                >
                  {o.source === "counter" ? "Walk-in" : "Online"}
                </span>
                <span className="text-sm flex-1 min-w-[140px] text-steel truncate">
                  {o.items.map((it) => `${it.name} ×${it.qty}`).join(", ")}
                </span>
                <span className="text-xs font-mono text-steel">{o.payment_method}</span>
                <span className="font-mono font-semibold text-sage">₹{o.total}</span>

                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-board/10 text-board">
                  {STATUS_LABEL[o.status] || o.status}
                </span>
                {nextStatus && (
                  <button
                    onClick={() => setOrderStatus(o.id, nextStatus)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full bg-turmeric hover:bg-turmeric-dark text-ink transition"
                  >
                    Mark {STATUS_LABEL[nextStatus]}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CounterSale({ products, placeOrder, canFulfill }) {
  const [qtyMap, setQtyMap] = useState({});
  const [payMethod, setPayMethod] = useState("cash");
  const [lastOrder, setLastOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const items = Object.entries(qtyMap)
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => ({ productId: id, qty }));
  const total = items.reduce((s, it) => {
    const p = products.find((x) => x.id === it.productId);
    return s + (p ? p.price * it.qty : 0);
  }, 0);

  const record = async () => {
    if (items.length === 0) return;
    if (!canFulfill(items)) {
      alert("Not enough stock for one of the selected items.");
      return;
    }
    setSubmitting(true);
    const { order, error } = await placeOrder({
      items,
      paymentMethod: payMethod === "cash" ? "Cash" : "Card (counter)",
      source: "counter",
    });
    setSubmitting(false);
    if (error) {
      alert(error);
      return;
    }
    setLastOrder(order);
    setQtyMap({});
  };

  return (
    <div className="max-w-2xl">
      <p className="text-steel text-sm mb-4">
        Someone walked up to the shop and bought directly? Log it here — stock updates immediately for online buyers too.
      </p>

      <div className="bg-white rounded-2xl border border-ink/5 p-4 sm:p-5 space-y-3">
        {products.map((p) => (
          <div key={p.id} className="flex items-center gap-3">
            <span className="text-xl">{p.emoji}</span>
            <span className="flex-1 text-sm">{p.name}</span>
            <span className="text-xs font-mono text-steel">{p.stock} in stock</span>
            <input
              type="number"
              min="0"
              max={p.stock}
              value={qtyMap[p.id] || ""}
              onChange={(e) =>
                setQtyMap((m) => ({ ...m, [p.id]: Math.max(0, Math.min(p.stock, Number(e.target.value))) }))
              }
              placeholder="0"
              className="w-16 px-2 py-1.5 rounded-lg border border-ink/15 font-mono text-sm text-center"
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {["cash", "card"].map((m) => (
            <button
              key={m}
              onClick={() => setPayMethod(m)}
              className={`px-4 py-2 rounded-full text-sm font-medium capitalize border ${
                payMethod === m ? "bg-board text-paper border-board" : "border-ink/15"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <span className="font-mono font-semibold text-sage ml-auto">Total ₹{total}</span>
        <button
          onClick={record}
          disabled={items.length === 0 || submitting}
          className="bg-turmeric hover:bg-turmeric-dark disabled:bg-steel/30 text-ink font-semibold px-5 py-2.5 rounded-full transition"
        >
          Record sale
        </button>
      </div>

      {lastOrder && (
        <div className="mt-4 bg-sage/10 text-sage rounded-xl p-3 text-sm font-mono">
          ✅ Recorded token #{String(lastOrder.token).padStart(3, "0")} — ₹{lastOrder.total}
        </div>
      )}
    </div>
  );
}
