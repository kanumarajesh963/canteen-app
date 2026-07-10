import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/StoreContext";
import { Lock, Loader2 } from "lucide-react";
import PasswordInput from "../components/PasswordInput";

export default function AdminLogin() {
  const { login, company } = useStore();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const ok = await login(password);
    setSubmitting(false);
    if (ok) {
      navigate(`/${company.slug}/admin`);
    } else {
      setError("That password doesn't match. Try again.");
    }
  };

  return (
    <div className="max-w-sm mx-auto px-4 py-16">
      <div className="text-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-board text-turmeric flex items-center justify-center mx-auto mb-4">
          <Lock size={24} />
        </div>
        <h1 className="font-chalk text-3xl">Seller Login</h1>
        <p className="text-steel text-sm">Manage stock, orders and today's sales for {company.name}.</p>
      </div>

      <form onSubmit={submit} className="bg-white rounded-2xl border border-ink/5 p-5 space-y-4">
        <div>
          <label className="text-xs font-mono uppercase text-steel">Password</label>
          <PasswordInput className="mt-1" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter seller password" autoFocus />
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
          Set/change this in Supabase (companies.admin_password_hash). Demo company password: canteen123
        </p>
      </form>
    </div>
  );
}
