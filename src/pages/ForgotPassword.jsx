import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KeyRound, Loader2, CheckCircle2, Mail } from "lucide-react";
import { supabaseConfigured, supabase } from "../lib/supabaseClient";
import { requestPasswordOtp, resetPasswordWithOtp } from "../lib/globalAuth";
import PasswordInput from "../components/PasswordInput";

// Forgot password — OTP flow:
//   1) Enter the email you log in with → we email a 6-digit code.
//   2) Enter the code + a new password → done.
//   3) Auto-redirect back to the Sign In screen.
// NOTE: this page lives OUTSIDE StoreProvider, so it must never call
// useStore() — it uses the standalone helpers from globalAuth instead.
export default function ForgotPassword() {
  const [step, setStep] = useState(1); // 1: email, 2: code + new password, 3: done
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  // After a successful reset, send them back to Sign In automatically.
  useEffect(() => {
    if (step !== 3) return;
    const t = setTimeout(() => navigate("/", { replace: true }), 2500);
    return () => clearTimeout(t);
  }, [step, navigate]);

  const sendCode = async (e) => {
    e.preventDefault();
    if (!supabaseConfigured) {
      setError("Backend not connected — the site owner must set the Supabase env vars.");
      return;
    }
    if (!email.trim()) {
      setError("Enter the email you log in with.");
      return;
    }
    setSubmitting(true);
    setError("");
    const res = await requestPasswordOtp(email.trim());
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStep(2);
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setError("New passwords don't match.");
      return;
    }
    setSubmitting(true);
    setError("");
    const res = await resetPasswordWithOtp(email.trim(), otp.trim(), newPw);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStep(3);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-board text-turmeric flex items-center justify-center mx-auto mb-4">
            <KeyRound size={24} />
          </div>
          <h1 className="font-chalk text-3xl">Forgot password</h1>
          <p className="text-steel text-sm">
            {step === 1 && "Enter your login email — we'll send a 6-digit code."}
            {step === 2 && "Enter the code we emailed you and choose a new password."}
            {step === 3 && "All set."}
          </p>
        </div>

        {step === 3 ? (
          <div className="bg-white rounded-2xl border border-ink/5 p-6 text-center">
            <CheckCircle2 size={32} className="text-sage mx-auto mb-2" />
            <p className="font-semibold mb-1">Password reset ✅</p>
            <p className="text-steel text-sm">Taking you back to Sign In…</p>
            <Link
              to="/"
              className="inline-block mt-4 bg-turmeric hover:bg-turmeric-dark text-ink font-semibold px-6 py-2.5 rounded-full"
            >
              Back to Sign In now
            </Link>
          </div>
        ) : step === 2 ? (
          <form onSubmit={resetPassword} className="bg-white rounded-2xl border border-ink/5 p-5 space-y-4">
            <div className="flex items-center gap-2 text-xs text-steel bg-paper2 px-3 py-2 rounded-xl">
              <Mail size={14} className="shrink-0" />
              <span>
                Code sent to <b>{email}</b>. Expires in 10 minutes.
              </span>
            </div>
            <div>
              <label className="text-xs font-mono uppercase text-steel">6-digit code</label>
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                className="mt-1 w-full px-4 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none tracking-[0.4em] text-center font-mono text-lg"
                placeholder="000000"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="text-xs font-mono uppercase text-steel">New password (min 6 chars)</label>
              <PasswordInput className="mt-1" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password" required />
            </div>
            <div>
              <label className="text-xs font-mono uppercase text-steel">Confirm new password</label>
              <PasswordInput className="mt-1" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Repeat new password" required />
            </div>
            {error && <p className="text-brick text-sm">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink font-semibold py-3 rounded-full transition flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              Reset password
            </button>
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setOtp("");
                setError("");
              }}
              className="w-full text-xs text-steel hover:underline"
            >
              Use a different email
            </button>
          </form>
        ) : (
          <form onSubmit={sendCode} className="bg-white rounded-2xl border border-ink/5 p-5 space-y-4">
            <div>
              <label className="text-xs font-mono uppercase text-steel">Your email (the one you log in with)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full px-4 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
                placeholder="you@gmail.com"
                autoFocus
                required
              />
            </div>
            {error && <p className="text-brick text-sm">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink font-semibold py-3 rounded-full transition flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              Send code
            </button>
          </form>
        )}

        <p className="text-center text-sm text-steel mt-6">
          Remembered it?{" "}
          <Link to="/" className="text-turmeric-dark font-medium hover:underline">
            Back to Sign In
          </Link>
        </p>
        {step !== 3 && (
          <p className="text-center text-xs text-steel mt-2">
            Can't access that inbox?{" "}
            <Link to="/forgot/ask-seller" className="text-turmeric-dark hover:underline">
              Ask the seller to reset it instead
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

// Fallback: raises a ticket for the seller to handle manually, for members
// whose email inbox is unreachable right now. (No useStore here either.)
export function ForgotPasswordAskSeller() {
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!supabaseConfigured) {
      setError("Backend not connected — the site owner must set the Supabase env vars.");
      return;
    }
    if (!email.trim()) {
      setError("Enter the email you log in with.");
      return;
    }
    setSubmitting(true);
    setError("");
    const { error: err } = await supabase.rpc("raise_ticket_by_email", {
      p_email: email.trim(),
      p_contact: contact.trim() || null,
    });
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-board text-turmeric flex items-center justify-center mx-auto mb-4">
            <KeyRound size={24} />
          </div>
          <h1 className="font-chalk text-3xl">Ask the seller</h1>
          <p className="text-steel text-sm">
            Enter your login email — your canteen seller will be notified, reset your password, and share the new one with you.
          </p>
        </div>

        {done ? (
          <div className="bg-white rounded-2xl border border-ink/5 p-6 text-center">
            <CheckCircle2 size={32} className="text-sage mx-auto mb-2" />
            <p className="font-semibold mb-1">Request sent ✅</p>
            <p className="text-steel text-sm">
              Your seller has been notified. Once they reset it, sign in with your new password.
            </p>
            <Link
              to="/"
              className="inline-block mt-4 bg-turmeric hover:bg-turmeric-dark text-ink font-semibold px-6 py-2.5 rounded-full"
            >
              Back to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-white rounded-2xl border border-ink/5 p-5 space-y-4">
            <div>
              <label className="text-xs font-mono uppercase text-steel">Your email (the one you log in with)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full px-4 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
                placeholder="you@gmail.com"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="text-xs font-mono uppercase text-steel">Phone (optional, so they can reach you)</label>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="mt-1 w-full px-4 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
                placeholder="98765 43210"
              />
            </div>
            {error && <p className="text-brick text-sm">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink font-semibold py-3 rounded-full transition flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              Send reset request
            </button>
          </form>
        )}

        <p className="text-center text-sm text-steel mt-6">
          <Link to="/forgot" className="text-turmeric-dark font-medium hover:underline">
            ← Try the email code instead
          </Link>
        </p>
      </div>
    </div>
  );
}
