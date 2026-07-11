import React, { useState } from "react";
import { X } from "lucide-react";

const EMOJI_CHOICES = ["🍫", "🥟", "🍔", "☕", "🥤", "🥪", "🍜", "🍟", "🍪", "🍎", "💧", "🍕", "🍩", "🥗", "🧃", "🍿"];

export default function ProductModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(
    initial
      ? { ...initial, lowStockThreshold: initial.low_stock_threshold ?? 5 }
      : { name: "", category: "Snacks", emoji: "🍫", price: "", cost: "", stock: "", unit: "pc", lowStockThreshold: 5 }
  );

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.name || form.price === "" || form.cost === "" || form.stock === "") return;
    onSave({
      ...form,
      price: Number(form.price),
      cost: Number(form.cost),
      stock: Number(form.stock),
      lowStockThreshold: Number(form.lowStockThreshold) || 5,
    });
  };

  return (
    <div className="fixed inset-0 bg-ink/50 z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink/10">
          <h2 className="font-chalk text-2xl">{initial ? "Edit item" : "Add item"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-paper2 rounded-full">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-mono uppercase text-steel">Name</label>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-mono uppercase text-steel">Category</label>
              <input
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-mono uppercase text-steel">Unit</label>
              <input
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
                placeholder="pc / cup / pkt"
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-mono uppercase text-steel">Icon</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {EMOJI_CHOICES.map((em) => (
                <button
                  type="button"
                  key={em}
                  onClick={() => set("emoji", em)}
                  className={`w-9 h-9 rounded-lg border-2 text-lg flex items-center justify-center ${
                    form.emoji === em ? "border-turmeric bg-turmeric/10" : "border-ink/10"
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-mono uppercase text-steel">Low stock alert threshold</label>
            <input
              type="number"
              min="0"
              value={form.lowStockThreshold}
              onChange={(e) => set("lowStockThreshold", e.target.value)}
              className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
            />
            <p className="text-[11px] text-steel mt-1">You'll see a restock banner once stock drops to this number.</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-mono uppercase text-steel">Sell price ₹</label>
              <input
                type="number"
                min="0"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
                required
              />
            </div>
            <div>
              <label className="text-xs font-mono uppercase text-steel">Cost ₹</label>
              <input
                type="number"
                min="0"
                value={form.cost}
                onChange={(e) => set("cost", e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
                required
              />
            </div>
            <div>
              <label className="text-xs font-mono uppercase text-steel">Stock</label>
              <input
                type="number"
                min="0"
                value={form.stock}
                onChange={(e) => set("stock", e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-turmeric hover:bg-turmeric-dark text-onbrand font-semibold py-3 rounded-full transition"
          >
            {initial ? "Save changes" : "Add to menu"}
          </button>
        </form>
      </div>
    </div>
  );
}
