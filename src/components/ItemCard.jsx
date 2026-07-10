import React from "react";
import { Plus, Minus } from "lucide-react";
import { useStore } from "../lib/StoreContext";

export default function ItemCard({ product }) {
  const { cart, addToCart, setCartQty } = useStore();
  const inCart = cart[product.id] || 0;
  const outOfStock = product.stock <= 0;
  const low = !outOfStock && product.stock <= 5;

  return (
    <div
      className={`relative bg-white rounded-2xl border-2 p-4 flex flex-col gap-3 transition ${
        outOfStock ? "border-steel/20 opacity-60" : "border-ink/5 hover:border-turmeric hover:-translate-y-0.5"
      }`}
    >
      {low && (
        <span className="absolute top-3 right-3 text-[10px] font-mono uppercase tracking-wide bg-brick text-white px-2 py-0.5 rounded-full">
          Only {product.stock} left
        </span>
      )}
      {outOfStock && (
        <span className="absolute top-3 right-3 text-[10px] font-mono uppercase tracking-wide bg-steel text-white px-2 py-0.5 rounded-full">
          Sold out
        </span>
      )}

      <div className="text-4xl">{product.emoji}</div>
      <div>
        <h3 className="font-semibold text-ink leading-tight">{product.name}</h3>
        <p className="text-xs text-steel font-mono">{product.category} · per {product.unit}</p>
      </div>

      <div className="mt-auto flex items-center justify-between">
        <span className="font-mono font-bold text-lg text-sage">₹{product.price}</span>

        {outOfStock ? (
          <span className="text-xs font-mono text-steel">unavailable</span>
        ) : inCart > 0 ? (
          <div className="flex items-center gap-2 bg-paper2 rounded-full px-1 py-1">
            <button
              onClick={() => setCartQty(product.id, inCart - 1)}
              className="w-7 h-7 rounded-full bg-white border border-ink/10 flex items-center justify-center hover:bg-brick hover:text-white transition"
              aria-label={`Remove one ${product.name}`}
            >
              <Minus size={14} />
            </button>
            <span className="font-mono w-5 text-center text-sm">{inCart}</span>
            <button
              onClick={() => inCart < product.stock && setCartQty(product.id, inCart + 1)}
              disabled={inCart >= product.stock}
              className="w-7 h-7 rounded-full bg-white border border-ink/10 flex items-center justify-center hover:bg-sage hover:text-white transition disabled:opacity-30"
              aria-label={`Add one more ${product.name}`}
            >
              <Plus size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => addToCart(product.id, 1)}
            className="text-sm font-semibold bg-board text-paper px-4 py-1.5 rounded-full hover:bg-board-light transition"
          >
            Book
          </button>
        )}
      </div>
    </div>
  );
}
