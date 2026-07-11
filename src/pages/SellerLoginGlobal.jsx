import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Store, Loader2 } from "lucide-react";
import { sellerLoginGlobal, storeAdminSession } from "../lib/globalAuth";
import { supabaseConfigured } from "../lib/supabaseClient";
import PasswordInput from "../components/PasswordInput";

// One login for both sellers and HR — email + password. The backend decides
// the role: sellers get the full dashboard, HR gets login stats only.
export default function SellerLoginGlobal() {
  const [email, setEmail] = useState("");
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
    if (!email.trim() || !password) {
      setError("Email and password are both required.");
      return;
    }
    setSubmitting(true);
    setError("");
    const session = await sellerLoginGlobal(email.trim(), password);
    setSubmitting(false);
    if (!session) {
      setError("Wrong email or password.");
      return;
    }
    storeAdminSession(session);
    navigate(`/${session.company_slug}/admin`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-board text-turmeric flex items-center justify-center mx-auto mb-4">
            <Store size={24} />
          </div>
          <h1 className="font-chalk text-3xl">Seller / HR Login</h1>
          <p className="text-steel text-sm">Log in with your email and password.</p>
        </div>

        <form onSubmit={submit} className="bg-surface rounded-2xl border border-ink/5 p-5 space-y-4">
          <div>
            <label className="text-xs font-mono uppercase text-steel">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full px-4 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
              placeholder="seller@company.com"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-mono uppercase text-steel">Password</label>
            <PasswordInput className="mt-1" value={password} onChange={(e) => setPassword(e.target.value)} />
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
          <p className="text-[11px] text-steel text-center">
            New seller?{" "}
            <Link to="/seller/signup" className="text-turmeric-dark font-semibold hover:underline">
              Create your company
            </Link>
          </p>
        </form>

        <p className="text-center text-sm text-steel mt-6">
          Member instead?{" "}
          <Link to="/member/login" className="text-turmeric-dark font-medium hover:underline">
            Member login
          </Link>
        </p>
      </div>
    </div>
  );
}