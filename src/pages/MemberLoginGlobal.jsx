import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { UserCircle2, Loader2 } from "lucide-react";
import { memberLoginGlobal } from "../lib/globalAuth";
import { supabaseConfigured } from "../lib/supabaseClient";
import PasswordInput from "../components/PasswordInput";

export default function MemberLoginGlobal() {
  const [companyQuery, setCompanyQuery] = useState("");
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
    if (!companyQuery.trim() || !username.trim() || !password) {
      setError("Company name, username and password are all required.");
      return;
    }
    setSubmitting(true);
    setError("");
    const session = await memberLoginGlobal(companyQuery.trim(), username.trim(), password);
    setSubmitting(false);
    if (!session) {
      setError("Couldn't find that company/username/password combination.");
      return;
    }
    localStorage.setItem(`canteen_member_token_${session.company_slug}`, session.token);
    localStorage.setItem(
      `canteen_member_token_${session.company_slug}_info`,
      JSON.stringify({ memberId: session.member_id, memberNumber: session.member_number, name: session.member_name })
    );
    navigate(`/${session.company_slug}/member`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-board text-turmeric flex items-center justify-center mx-auto mb-4">
            <UserCircle2 size={24} />
          </div>
          <h1 className="font-chalk text-3xl">Member Login</h1>
          <p className="text-steel text-sm">Company name, your username, and password.</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-ink/5 p-5 space-y-4">
          <div>
            <label className="text-xs font-mono uppercase text-steel">Company name</label>
            <input
              value={companyQuery}
              onChange={(e) => setCompanyQuery(e.target.value)}
              className="mt-1 w-full px-4 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
              placeholder="e.g. demo or The Canteen Counter"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-mono uppercase text-steel">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full px-4 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
              placeholder="e.g. member1"
            />
          </div>
          <div>
            <label className="text-xs font-mono uppercase text-steel">Password</label>
            <PasswordInput className="mt-1" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="text-right mt-1">
              <Link to="/member/forgot" className="text-xs text-turmeric-dark font-medium hover:underline">
                Forgot password?
              </Link>
            </div>
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
            Demo: company <b>demo</b>, username <b>member1</b>, password <b>member123</b>
          </p>
        </form>

        <p className="text-center text-sm text-steel mt-6">
          Seller instead?{" "}
          <Link to="/seller/login" className="text-turmeric-dark font-medium hover:underline">
            Seller login
          </Link>
        </p>
      </div>
    </div>
  );
}
