import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../lib/StoreContext";
import TokenReceipt from "../components/TokenReceipt";
import { Receipt, ChevronRight, X } from "lucide-react";

export default function MyOrders() {
  const { myOrders } = useStore();
  const [selected, setSelected] = useState(null);

  if (myOrders.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-24 px-4 animate-fade-in-up">
        <div className="text-5xl mb-3">🧾</div>
        <h1 className="font-semibold text-xl mb-1">No orders yet</h1>
        <p className="text-steel text-sm mb-5">Everything you book will show up here, with your receipts.</p>
        <Link to="/" className="inline-block bg-turmeric hover:bg-turmeric-dark text-ink font-semibold px-6 py-2.5 rounded-full transition">
          Browse the menu
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-3xl sm:text-4xl font-bold mb-1 animate-fade-in-up">My Orders</h1>
      <p className="text-steel text-sm mb-6 animate-fade-in-up">
        {myOrders.length} past order{myOrders.length > 1 ? "s" : ""} on this device.
      </p>

      <div className="space-y-3">
        {myOrders.map((o, i) => (
          <button
            key={o.id}
            onClick={() => setSelected(o)}
            style={{ animationDelay: `${i * 40}ms` }}
            className="w-full text-left bg-white rounded-2xl border border-ink/5 p-4 flex items-center gap-3 hover:border-turmeric hover:-translate-y-0.5 transition animate-fade-in-up"
          >
            <div className="w-11 h-11 rounded-full bg-board text-turmeric-light flex items-center justify-center shrink-0">
              <Receipt size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">Token #{String(o.token).padStart(3, "0")}</span>
                <span className="text-[10px] font-medium uppercase tracking-wide bg-sage/10 text-sage px-2 py-0.5 rounded-full">
                  {o.status === "paid" ? "Paid" : o.status}
                </span>
              </div>
              <p className="text-xs text-steel truncate mt-0.5">
                {o.items.map((it) => `${it.name} ×${it.qty}`).join(", ")}
              </p>
              <p className="text-[11px] text-steel mt-0.5">
                {new Date(o.date).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                {" · "}{o.paymentMethod}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-sage">₹{o.total}</p>
            </div>
            <ChevronRight size={18} className="text-steel shrink-0" />
          </button>
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
