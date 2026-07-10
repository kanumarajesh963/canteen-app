import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Store, Loader2 } from "lucide-react";
import { sellerLoginGlobal } from "../lib/globalAuth";
import { supabaseConfigured } from "../lib/supabaseClient";

export default function SellerLoginGlobal() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (!supabaseConfigured) {
      setError("Backend not connected yet — see README.md → Backend setup.");
      return;
    }
    setSubmitting(true);
    setError("");
    const session = await sellerLoginGlobal(username.trim(), password);
    setSubmitting(false);
    if (!session) {
      setError("Username or password is wrong.");
      return;
    }
    // Stash the token under this company's own storage key, then hand off
    // to the company's admin dashboard — it'll pick the token up on load.
    localStorage.setItem(`canteen_admin_token_${session.company_slug}`, session.token);
    navigate(`/${session.company_slug}/admin`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-board text-turmeric flex items-center justify-center mx-auto mb-4">
            <Store size={24} />
          </div>
          <h1 className="font-chalk text-3xl">Seller Login</h1>
          <p className="text-steel text-sm">Just your username and password — no company name needed.</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-ink/5 p-5 space-y-4">
          <div>
            <label className="text-xs font-mono uppercase text-steel">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full px-4 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
              placeholder="e.g. acme_seller"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-mono uppercase text-steel">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full px-4 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
              placeholder="Enter password"
            />
          </div>
          {error && <p className="text-brick text-sm">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink font-semibold py-3 rounded-full transition flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Log in
          </button>
          <p className="text-[11px] text-steel font-mono text-center">
            Demo: username <b>demo_seller</b>, password <b>canteen123</b>
          </p>
        </form>

        <p className="text-center text-sm text-steel mt-6">
          Buyer instead?{" "}
          <Link to="/member/login" className="text-turmeric-dark font-medium hover:underline">
            Member login
          </Link>
        </p>
      </div>
    </div>
  );
}
