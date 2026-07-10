import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Landing() {
  const [code, setCode] = useState("");
  const navigate = useNavigate();

  const go = (e) => {
    e.preventDefault();
    const slug = code.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (slug) navigate(`/${slug}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        <div className="text-5xl mb-3">🍱</div>
        <h1 className="font-chalk text-3xl mb-2">The Canteen Counter</h1>
        <p className="text-steel text-sm mb-6">
          Enter your company's canteen code to open your counter. Your admin will have shared this with you —
          it's also just the last part of your bookmarked link.
        </p>
        <form onSubmit={go} className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. acme"
            autoFocus
            className="flex-1 px-4 py-2.5 rounded-full border border-ink/15 focus:border-turmeric outline-none text-sm"
          />
          <button
            type="submit"
            className="bg-turmeric hover:bg-turmeric-dark text-ink font-semibold px-5 py-2.5 rounded-full transition"
          >
            Go
          </button>
        </form>
      </div>
    </div>
  );
}
