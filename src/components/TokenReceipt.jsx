import React from "react";

export default function TokenReceipt({ order }) {
  if (!order) return null;
  const date = new Date(order.date);

  return (
    <div className="max-w-sm mx-auto animate-token-reveal">
      <div className="bg-white rounded-t-2xl shadow-xl overflow-hidden border border-ink/10 border-b-0">
        <div className="bg-board text-paper text-center py-4">
          <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-turmeric-light">Token Number</p>
          <p className="font-mono text-5xl font-bold mt-1">#{String(order.token).padStart(3, "0")}</p>
        </div>

        <div className="p-5">
          <div className="flex justify-between text-xs font-mono text-steel mb-3">
            <span>{date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
            <span>{date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>

          <div className="space-y-2 border-t border-dashed border-ink/20 pt-3">
            {order.items.map((it) => (
              <div key={it.productId} className="flex justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  <span>{it.emoji}</span> {it.name} <span className="text-steel font-mono">×{it.qty}</span>
                </span>
                <span className="font-mono">₹{it.price * it.qty}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-ink/20 mt-3 pt-3 flex justify-between items-baseline">
            <span className="font-semibold">Total Paid</span>
            <span className="font-mono text-xl font-bold text-sage">₹{order.total}</span>
          </div>

          <div className="mt-3 text-center">
            <span className="inline-block text-[11px] font-mono uppercase tracking-wide bg-sage/10 text-sage px-3 py-1 rounded-full">
              Paid via {order.paymentMethod}
            </span>
          </div>
        </div>
      </div>
      {/* perforated tear edge */}
      <div className="h-4 perforated bg-transparent" style={{ backgroundColor: "transparent" }}>
        <svg viewBox="0 0 400 20" className="w-full h-4" preserveAspectRatio="none">
          <path
            d="M0,0 L400,0 L400,20 Q380,5 360,20 Q340,5 320,20 Q300,5 280,20 Q260,5 240,20 Q220,5 200,20 Q180,5 160,20 Q140,5 120,20 Q100,5 80,20 Q60,5 40,20 Q20,5 0,20 Z"
            fill="white"
          />
        </svg>
      </div>
      <p className="text-center text-xs text-steel mt-2 font-mono">Show this token at the counter for pickup</p>
    </div>
  );
}
