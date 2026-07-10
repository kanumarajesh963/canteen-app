import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../lib/StoreContext";
import TokenReceipt from "../components/TokenReceipt";
import { Receipt, ChevronRight, X, RotateCw } from "lucide-react";

const STATUS_STYLE = {
  placed: "bg-steel/10 text-steel",
  preparing: "bg-turmeric/15 text-turmeric-dark",
  ready: "bg-sage/10 text-sage",
  picked_up: "bg-board/10 text-board",
};
const STATUS_LABEL = { placed: "Placed", preparing: "Preparing", ready: "Ready", picked_up: "Picked up" };

export default function MyOrders() {
  const { myOrders, company, reorderItems } = useStore();
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const [reorderMsg, setReorderMsg] = useState("");

  if (myOrders.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-24 px-4 animate-fade-in-up">
        <div className="text-5xl mb-3">🧾</div>
        <h1 className="font-semibold text-xl mb-1">No orders yet</h1>
        <p className="text-steel text-sm mb-5">Everything you book will show up here, with your receipts.</p>
        <Link to={`/${company.slug}`} className="inline-block bg-turmeric hover:bg-turmeric-dark text-ink font-semibold px-6 py-2.5 rounded-full transition">
          Browse the menu
        </Link>
      </div>
    );
  }

  const doReorder = (e, order) => {
    e.stopPropagation();
    const count = reorderItems(order);
    setReorderMsg(count > 0 ? "Added to your cart." : "Those items are out of stock right now.");
    setTimeout(() => setReorderMsg(""), 2500);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-3xl sm:text-4xl font-bold mb-1 animate-fade-in-up">My Orders</h1>
      <p className="text-steel text-sm mb-6 animate-fade-in-up">
        {myOrders.length} past order{myOrders.length > 1 ? "s" : ""}. Status updates live as the counter works on them.
      </p>
      {reorderMsg && <p className="text-sm font-mono text-sage mb-4">{reorderMsg}</p>}

      <div className="space-y-3">
        {myOrders.map((o, i) => (
          <div
            key={o.id}
            style={{ animationDelay: `${i * 40}ms` }}
            className="w-full text-left bg-white rounded-2xl border border-ink/5 p-4 flex items-center gap-3 hover:border-turmeric hover:-translate-y-0.5 transition animate-fade-in-up cursor-pointer"
            onClick={() => setSelected(o)}
          >
            <div className="w-11 h-11 rounded-full bg-board text-turmeric-light flex items-center justify-center shrink-0">
              <Receipt size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">Token #{String(o.token).padStart(3, "0")}</span>
                <span className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_STYLE[o.status] || "bg-steel/10 text-steel"}`}>
                  {STATUS_LABEL[o.status] || o.status}
                </span>
              </div>
              <p className="text-xs text-steel truncate mt-0.5">
                {o.items.map((it) => `${it.name} ×${it.qty}`).join(", ")}
              </p>
              <p className="text-[11px] text-steel mt-0.5">
                {new Date(o.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                {" · "}{o.payment_method}
              </p>
            </div>
            <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
              <p className="font-bold text-sage">₹{o.total}</p>
              <button
                onClick={(e) => doReorder(e, o)}
                className="flex items-center gap-1 text-[11px] font-medium text-steel hover:text-turmeric-dark border border-ink/10 hover:border-turmeric px-2 py-1 rounded-full transition"
              >
                <RotateCw size={11} /> Reorder
              </button>
            </div>
            <ChevronRight size={18} className="text-steel shrink-0" />
          </div>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-ink/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelected(null)}>
          <div className="relative animate-pop-in" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelected(null)}
              className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center z-10"
              aria-label="Close receipt"
            >
              <X size={18} />
            </button>
            <TokenReceipt order={selected} />
          </div>
        </div>
      )}
    </div>
  );
}
