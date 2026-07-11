import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useStore, paymentApps } from "../lib/StoreContext";
import { Loader2, ShieldCheck, Wallet as WalletIcon } from "lucide-react";

export default function Checkout() {
  const {
    cart, products, placeOrder, placeOrderKhata, canFulfill, clearCart,
    customerId, walletBalance, company, isMember, memberProfile,
  } = useStore();
  const [method, setMethod] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
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
        <Link to={`/${company?.slug}`} className="text-sage font-semibold underline">Back to the counter</Link>
      </div>
    );
  }

  const walletShort = method === "wallet" && customerId && walletBalance < total;
  const walletNeedsLogin = method === "wallet" && !customerId;
  const khataNeedsLogin = method === "khata" && !isMember;
  const khataNotEligible = method === "khata" && isMember && !memberProfile?.khata_eligible;

  const confirmPay = async () => {
    if (!method) return;
    if (walletNeedsLogin) {
      navigate(`/${company.slug}/wallet`, { state: { redirectTo: "/checkout" } });
      return;
    }
    if (walletShort || khataNeedsLogin || khataNotEligible) return;

    const items = lines.map((l) => ({ productId: l.product.id, qty: l.qty }));
    if (!canFulfill(items)) {
      setError("Someone just booked the last of an item in your cart. Please review your booking.");
      return;
    }
    setProcessing(true);
    setError("");
    const methodLabel = method === "wallet" ? "Wallet" : paymentApps.find((a) => a.id === method)?.name || method;
    // brief pause so the payment step still feels real for the simulated apps
    await new Promise((r) => setTimeout(r, method === "wallet" || method === "khata" ? 300 : 1100));
    const { order, error: err } =
      method === "khata" ? await placeOrderKhata({ items }) : await placeOrder({ items, paymentMethod: methodLabel, source: "online" });
    setProcessing(false);
    if (err) {
      setError(err.includes("Insufficient") ? "Not enough wallet balance — recharge or pick another method." : err);
      return;
    }
    if (order) {
      clearCart();
      navigate(`/${company.slug}/success/${order.id}`);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-10">
      <h1 className="font-chalk text-3xl sm:text-4xl text-ink mb-1">Pay for your booking</h1>
      <p className="text-steel text-sm mb-6">Use your Canteen Wallet for instant checkout, any UPI app, or pay at the counter.</p>

      <div className="bg-surface rounded-2xl border border-ink/5 p-4 mb-6">
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
              method === app.id ? "border-turmeric bg-turmeric/10" : "border-ink/10 hover:border-ink/25 bg-surface"
            }`}
          >
            <span className="text-2xl">{app.emoji}</span>
            <span className="font-medium flex-1">
              {app.name}
              {app.id === "wallet" && customerId && (
                <span className="block text-xs font-mono text-steel">Balance ₹{walletBalance}</span>
              )}
              {app.id === "wallet" && !customerId && (
                <span className="block text-xs font-mono text-steel">Log in to use your wallet</span>
              )}
              {app.id === "khata" && !isMember && (
                <span className="block text-xs font-mono text-steel">Log in to your member account to use Khata</span>
              )}
              {app.id === "khata" && isMember && !memberProfile?.khata_eligible && (
                <span className="block text-xs font-mono text-steel">Not enabled for your account — ask your seller</span>
              )}
              {app.id === "khata" && isMember && memberProfile?.khata_eligible && (
                <span className="block text-xs font-mono text-steel">Adds to your credit tab, settle later</span>
              )}
            </span>
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

      {walletShort && (
        <p className="text-brick text-sm mt-3">
          Only ₹{walletBalance} in your wallet. <Link to={`/${company.slug}/wallet`} className="underline font-semibold">Recharge</Link> or choose another method.
        </p>
      )}
      {error && <p className="text-brick text-sm mt-3">{error}</p>}

      <button
        onClick={confirmPay}
        disabled={!method || processing || walletShort || khataNeedsLogin || khataNotEligible}
        className="mt-6 w-full bg-sage hover:bg-sage/90 disabled:bg-steel/40 text-white font-semibold py-3.5 rounded-full flex items-center justify-center gap-2 transition"
      >
        {processing ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Confirming payment…
          </>
        ) : walletNeedsLogin ? (
          <>
            <WalletIcon size={18} /> Log in to pay with Wallet
          </>
        ) : (
          <>
            <ShieldCheck size={18} /> Confirm & Pay ₹{total}
          </>
        )}
      </button>
      <p className="text-center text-[11px] text-steel mt-3 font-mono">
        {method === "wallet"
          ? "Wallet payments are real balance moves against your Supabase-backed wallet."
          : method === "khata"
          ? "This adds a real entry to your khata (credit tab) — no money moves now."
          : "Demo checkout — simulates a successful payment. No real money moves."}
      </p>
    </div>
  );
}
