import React, { useMemo, useState } from "react";
import { useStore } from "../lib/StoreContext";
import ItemCard from "../components/ItemCard";

export default function Shop() {
  const { products } = useStore();
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");

  const categories = useMemo(() => ["All", ...new Set(products.map((p) => p.category))], [products]);

  const filtered = products.filter(
    (p) =>
      (category === "All" || p.category === category) &&
      p.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
      {/* Hero: chalkboard menu */}
      <section className="mt-6 sm:mt-10 rounded-3xl bg-board bg-chalk-texture text-paper px-6 sm:px-10 py-10 sm:py-14 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 text-[140px] opacity-10 select-none">🍱</div>
        <p className="font-mono text-turmeric-light text-xs tracking-[0.3em] uppercase mb-3">Today's Board</p>
        <h1 className="font-chalk text-4xl sm:text-6xl leading-tight max-w-xl">
          Book your snack. <br /> Skip the queue.
        </h1>
        <p className="mt-4 text-paper/75 max-w-md">
          Reserve items from the counter, pay however suits you, and pick up with your token number.
          Stock updates live — what you see is what's left.
        </p>
      </section>

      {/* Filters */}
      <section className="mt-8 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium border transition ${
                category === c
                  ? "bg-board text-paper border-board"
                  : "border-ink/15 text-ink/70 hover:border-board"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search the board…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full sm:w-56 px-4 py-2 rounded-full border border-ink/15 text-sm focus:border-turmeric outline-none"
        />
      </section>

      {/* Grid */}
      <section className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((p) => (
          <ItemCard key={p.id} product={p} />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-steel py-12">No items match — try a different search.</p>
        )}
      </section>
    </div>
  );
}
