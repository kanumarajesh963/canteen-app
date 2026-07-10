import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useStore } from "../lib/StoreContext";
import { paymentApps } from "../lib/seed";
import { Loader2, ShieldCheck } from "lucide-react";

export default function Checkout() {
  const { cart, products, placeOrder, canFulfill } = useStore();
  const [method, setMethod] = useState(null);
  const [processing, setProcessing] = useState(false);
  const navigate = useNavigate();

  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ product: products.find((p) => p.id === id), qty }))
    .filter((l) => l.product);
  const total = lines.reduce((s, l) => s + l.product.price * l.qty, 0);

  if (lines.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-24 px-4">
        <div className="text-5xl mb-3">🧺</div>
        <p className="text-steel mb-4">Your booking is empty.</p>
        <Link to="/" className="text-sage font-semibold underline">Back to the counter</Link>
      </div>
    );
  }

  const confirmPay = () => {
    if (!method) return;
    const items = lines.map((l) => ({ productId: l.product.id, qty: l.qty }));
    if (!canFulfill(items)) {
      alert("Sorry, someone just booked the last of an item in your cart. Please review your booking.");
      return;
    }
    setProcessing(true);
    // Simulated payment gateway delay
    setTimeout(() => {
      const methodLabel = paymentApps.find((a) => a.id === method)?.name || method;
      const order = placeOrder({ items, paymentMethod: methodLabel, source: "online" });
      setProcessing(false);
      if (order) navigate(`/success/${order.id}`);
    }, 1100);
  };

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-10">
      <h1 className="font-chalk text-3xl sm:text-4xl text-ink mb-1">Pay for your booking</h1>
      <p className="text-steel text-sm mb-6">Choose whichever app you have on your phone — or pay at the counter.</p>

      <div className="bg-white rounded-2xl border border-ink/5 p-4 mb-6">
        {lines.map((l) => (
          <div key={l.product.id} className="flex justify-between text-sm py-1.5">
            <span>{l.product.emoji} {l.product.name} × {l.qty}</span>
            <span className="font-mono">₹{l.product.price * l.qty}</span>
          </div>
        ))}
        <div className="border-t border-dashed border-ink/15 mt-2 pt-2 flex justify-between font-semibold">
          <span>Total</span>
          <span className="font-mono text-sage text-lg">₹{total}</span>
        </div>
      </div>

      <div className="space-y-2.5">
        {paymentApps.map((app) => (
          <button
            key={app.id}
            onClick={() => setMethod(app.id)}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition ${
              method === app.id ? "border-turmeric bg-turmeric/10" : "border-ink/10 hover:border-ink/25 bg-white"
            }`}
          >
            <span className="text-2xl">{app.emoji}</span>
            <span className="font-medium flex-1">{app.name}</span>
            <span
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                method === app.id ? "border-turmeric" : "border-ink/20"
              }`}
            >
              {method === app.id && <span className="w-2.5 h-2.5 rounded-full bg-turmeric" />}
            </span>
          </button>
        ))}
      </div>

      <button
        onClick={confirmPay}
        disabled={!method || processing}
        className="mt-6 w-full bg-sage hover:bg-sage/90 disabled:bg-steel/40 text-white font-semibold py-3.5 rounded-full flex items-center justify-center gap-2 transition"
      >
        {processing ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Confirming payment…
          </>
        ) : (
          <>
            <ShieldCheck size={18} /> Confirm & Pay ₹{total}
          </>
        )}
      </button>
      <p className="text-center text-[11px] text-steel mt-3 font-mono">
        Demo checkout — simulates a successful payment. No real money moves.
      </p>
    </div>
  );
}
