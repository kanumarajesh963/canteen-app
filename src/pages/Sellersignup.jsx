import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Building2, Loader2, CheckCircle2, Copy } from "lucide-react";
import { sellerSignup, isOtpRequired, sendOtp, storeAdminSession } from "../lib/globalAuth";
import { supabaseConfigured } from "../lib/supabaseClient";
import PasswordInput from "../components/PasswordInput";

// Seller creates their company: email + password + company name (compulsory).
// If OTP is turned on in settings, a 6-digit code is mailed and verified
// before the company is created. On success a unique COMPANY CODE is shown —
// members join with it.
export default function SellerSignup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [otpNeeded, setOtpNeeded] = useState(false);
  const [otpStage, setOtpStage] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null); // { company_code, company_slug, company_name }
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (supabaseConfigured) isOtpRequired().then(setOtpNeeded);
  }, []);

  const validate = () => {
    if (!companyName.trim()) return "Company name is required.";
    if (!email.trim()) return "Email is required.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    if (password !== confirm) return "Passwords don't match.";
    return "";
  };

  const begin = async (e) => {
    e.preventDefault();
    const v = validate();
    if (v) return setError(v);
    if (!supabaseConfigured) return setError("Backend not connected yet — see README.md.");
    setError("");

    if (otpNeeded) {
      setSubmitting(true);
      const res = await sendOtp(email.trim(), "seller_signup");
      setSubmitting(false);
      if (!res.ok) return setError(res.error);
      setOtpStage(true);
      return;
    }
    await finish();
  };

  const finish = async (code) => {
    setSubmitting(true);
    setError("");
    const res = await sellerSignup(email.trim(), password, companyName.trim(), code);
    setSubmitting(false);
    if (!res.ok) return setError(res.error);
    storeAdminSession(res);
    setCreated(res);
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(created.company_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-board text-turmeric flex items-center justify-center mx-auto mb-4">
            <Building2 size={24} />
          </div>
          <h1 className="font-chalk text-3xl">Create your company</h1>
          <p className="text-steel text-sm">Your email is your seller login.</p>
        </div>

        {created ? (
          <div className="bg-white rounded-2xl border border-ink/5 p-6 text-center">
            <CheckCircle2 size={32} className="text-sage mx-auto mb-2" />
            <p className="font-semibold mb-1">{created.company_name} is ready 🎉</p>
            <p className="text-steel text-sm mb-4">Share this company code — your members join with it:</p>
            <button
              onClick={copyCode}
              className="w-full bg-board text-paper rounded-2xl py-4 mb-2 font-mono text-2xl tracking-[0.3em] flex items-center justify-center gap-3"
              title="Tap to copy"
            >
              {created.company_code} <Copy size={16} className="text-turmeric" />
            </button>
            <p className="text-[11px] text-steel mb-4">{copied ? "Copied ✅" : "Tap the code to copy. It's always visible in your dashboard → Company tab."}</p>
            <button
              onClick={() => navigate(`/${created.company_slug}/admin`)}
              className="w-full bg-turmeric hover:bg-turmeric-dark text-ink font-semibold py-3 rounded-full"
            >
              Go to my dashboard
            </button>
          </div>
        ) : otpStage ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              finish(otpCode.trim());
            }}
            className="bg-white rounded-2xl border border-ink/5 p-5 space-y-4"
          >
            <p className="text-sm text-steel">
              We mailed a 6-digit code to <b>{email.trim()}</b>. Enter it to finish:
            </p>
            <input
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full px-4 py-3 rounded-xl border border-ink/15 focus:border-turmeric outline-none text-center font-mono text-2xl tracking-[0.4em]"
              placeholder="••••••"
              inputMode="numeric"
              autoFocus
            />
            {error && <p className="text-brick text-sm">{error}</p>}
            <button
              type="submit"
              disabled={submitting || otpCode.length !== 6}
              className="w-full bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink font-semibold py-3 rounded-full flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              Verify & create company
            </button>
            <button
              type="button"
              onClick={() => sendOtp(email.trim(), "seller_signup")}
              className="w-full text-xs text-turmeric-dark font-medium hover:underline"
            >
              Resend code
            </button>
          </form>
        ) : (
          <form onSubmit={begin} className="bg-white rounded-2xl border border-ink/5 p-5 space-y-4">
            <div>
              <label className="text-xs font-mono uppercase text-steel">Company name (required)</label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="mt-1 w-full px-4 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
                placeholder="e.g. Acme Corp Canteen"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="text-xs font-mono uppercase text-steel">Your email (seller login)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full px-4 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
                placeholder="you@gmail.com"
                required
              />
            </div>
            <div>
              <label className="text-xs font-mono uppercase text-steel">Password (min 6 chars)</label>
              <PasswordInput className="mt-1" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-mono uppercase text-steel">Confirm password</label>
              <PasswordInput className="mt-1" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" required />
            </div>
            {error && <p className="text-brick text-sm">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink font-semibold py-3 rounded-full flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {otpNeeded ? "Send verification code" : "Create company"}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-steel mt-6">
          Already have a company?{" "}
          <Link to="/seller/login" className="text-turmeric-dark font-medium hover:underline">
            Seller login
          </Link>
        </p>
      </div>
    </div>
  );
}