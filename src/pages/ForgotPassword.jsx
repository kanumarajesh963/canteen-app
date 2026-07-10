import React, { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, Loader2, CheckCircle2 } from "lucide-react";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";

// Forgot password: just the email — the backend finds which company the
// account belongs to and raises a password-reset ticket for that seller.
// The seller resets the password (Members tab) and shares the new one.
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!supabaseConfigured) {
      setError("Backend not connected yet — see README.md → Backend setup.");
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
          <h1 className="font-chalk text-3xl">Forgot password</h1>
          <p className="text-steel text-sm">
            Enter your login email — your canteen seller will be notified, reset your password, and share the new one with you.
          </p>
        </div>

        {done ? (
          <div className="bg-white rounded-2xl border border-ink/5 p-6 text-center">
            <CheckCircle2 size={32} className="text-sage mx-auto mb-2" />
            <p className="font-semibold mb-1">Request sent ✅</p>
            <p className="text-steel text-sm">
              Your seller has been notified. Once they reset it, log in with your new password.
            </p>
            <Link
              to="/member/login"
              className="inline-block mt-4 bg-turmeric hover:bg-turmeric-dark text-ink font-semibold px-6 py-2.5 rounded-full"
            >
              Back to login
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
          Remembered it?{" "}
          <Link to="/member/login" className="text-turmeric-dark font-medium hover:underline">
            Member login
          </Link>
        </p>
      </div>
    </div>
  );
}
