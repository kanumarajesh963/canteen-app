import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/StoreContext";
import { Lock } from "lucide-react";

export default function AdminLogin() {
  const { login } = useStore();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const submit = (e) => {
    e.preventDefault();
    if (login(password)) {
      navigate("/admin");
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
        <p className="text-steel text-sm">Manage stock, orders and today's sales.</p>
      </div>

      <form onSubmit={submit} className="bg-white rounded-2xl border border-ink/5 p-5 space-y-4">
        <div>
          <label className="text-xs font-mono uppercase text-steel">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full px-4 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
            placeholder="Enter seller password"
            autoFocus
          />
        </div>
        {error && <p className="text-brick text-sm">{error}</p>}
        <button
          type="submit"
          className="w-full bg-turmeric hover:bg-turmeric-dark text-ink font-semibold py-3 rounded-full transition"
        >
          Log in
        </button>
        <p className="text-[11px] text-steel font-mono text-center">
          Demo password: <span className="font-semibold">canteen123</span>
        </p>
      </form>
    </div>
  );
}
