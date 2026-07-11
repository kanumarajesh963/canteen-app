import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Store, UserCircle2 } from "lucide-react";

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
          Members and sellers both need to log in. Pick one below — or jump straight to a company's counter if
          you already have the link.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <Link
            to="/member/login"
            className="flex flex-col items-center gap-2 bg-surface border border-ink/10 hover:border-turmeric rounded-2xl py-5 transition"
          >
            <UserCircle2 size={22} className="text-turmeric-dark" />
            <span className="text-sm font-semibold">Member Login</span>
          </Link>
          <Link
            to="/seller/login"
            className="flex flex-col items-center gap-2 bg-surface border border-ink/10 hover:border-turmeric rounded-2xl py-5 transition"
          >
            <Store size={22} className="text-turmeric-dark" />
            <span className="text-sm font-semibold">Seller Login</span>
          </Link>
        </div>

        <p className="text-steel text-xs mb-3">— or open a canteen's shop directly —</p>
        <form onSubmit={go} className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. acme"
            className="flex-1 px-4 py-2.5 rounded-full border border-ink/15 focus:border-turmeric outline-none text-sm"
          />
          <button
            type="submit"
            className="bg-turmeric hover:bg-turmeric-dark text-onbrand font-semibold px-5 py-2.5 rounded-full transition"
          >
            Go
          </button>
        </form>
      </div>
    </div>
  );
}
