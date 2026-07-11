import React from "react";
import { X, Plus, Minus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/StoreContext";

export default function CartDrawer({ open, onClose }) {
  const { cart, products, setCartQty, clearCart, company } = useStore();
  const navigate = useNavigate();

  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ product: products.find((p) => p.id === id), qty }))
    .filter((l) => l.product);

  const total = lines.reduce((s, l) => s + l.product.price * l.qty, 0);

  return (
    <>
      <div
        className={`fixed inset-0 bg-ink/40 z-40 transition-opacity ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-[420px] bg-paper z-50 shadow-2xl transition-transform duration-300 flex flex-col ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="bg-board text-paper px-5 py-4 flex items-center justify-between">
          <h2 className="font-chalk text-2xl">Your Booking</h2>
          <button onClick={onClose} aria-label="Close cart" className="p-1 hover:bg-white/10 rounded-full">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {lines.length === 0 ? (
            <div className="text-center text-steel mt-16">
              <div className="text-5xl mb-3">🧺</div>
              <p className="font-medium">Nothing booked yet.</p>
              <p className="text-sm">Add snacks from the counter to get started.</p>
            </div>
          ) : (
            lines.map(({ product, qty }) => (
              <div key={product.id} className="flex items-center gap-3 bg-surface rounded-xl p-3 border border-ink/5">
                <div className="text-2xl">{product.emoji}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{product.name}</p>
                  <p className="text-xs font-mono text-steel">₹{product.price} × {qty} = ₹{product.price * qty}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCartQty(product.id, qty - 1)}
                    className="w-6 h-6 rounded-full bg-paper2 flex items-center justify-center hover:bg-brick hover:text-white"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="font-mono text-sm w-4 text-center">{qty}</span>
                  <button
                    onClick={() => qty < product.stock && setCartQty(product.id, qty + 1)}
                    disabled={qty >= product.stock}
                    className="w-6 h-6 rounded-full bg-paper2 flex items-center justify-center hover:bg-sage hover:text-white disabled:opacity-30"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {lines.length > 0 && (
          <div className="border-t border-ink/10 p-5 space-y-3 bg-surface">
            <div className="flex items-center justify-between font-mono">
              <span className="text-steel">Total</span>
              <span className="text-xl font-bold text-sage">₹{total}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={clearCart}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full border border-ink/15 text-sm font-medium hover:bg-paper2"
              >
                <Trash2 size={15} /> Clear
              </button>
              <button
                onClick={() => {
                  onClose();
                  navigate(`/${company.slug}/checkout`);
                }}
                className="flex-1 bg-turmeric hover:bg-turmeric-dark text-onbrand font-semibold py-2.5 rounded-full transition"
              >
                Proceed to Pay
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
