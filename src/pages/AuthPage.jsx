import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Store, UserCircle2, Loader2, CheckCircle2, Copy, Building2, Mail } from "lucide-react";
import {
  memberLoginGlobal, sellerLoginGlobal, sellerSignup, memberSignup, sendOtp,
  storeAdminSession, storeMemberSession, rememberSession, hasAccountOnThisDevice, findActiveSession,
} from "../lib/globalAuth";
import { supabaseConfigured } from "../lib/supabaseClient";
import PasswordInput from "../components/PasswordInput";

// =========================================================================
// The FIRST SCREEN of the app. All auth lives here:
//   * Sign In (member or seller — one tab, role toggle)
//   * Sign Up (choose Member or Seller → details → emailed OTP → account)
//   * Forgot password (links to /forgot)
// Returning users (this device has an account) see Sign In by default and
// only a small "first time?" link. Still-logged-in visitors are bounced
// straight to their home screen.
// =========================================================================
export default function AuthPage() {
  const navigate = useNavigate();
  const returning = hasAccountOnThisDevice();
  const [mode, setMode] = useState("signin"); // 'signin' | 'signup'

  // Already logged in? Go straight home — the auth page is for logged-out people.
  useEffect(() => {
    const active = findActiveSession();
    if (active) {
      navigate(active.role === "seller" ? `/${active.companySlug}/admin` : `/${active.companySlug}/member`, {
        replace: true,
      });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">🍱</div>
          <h1 className="font-chalk text-3xl">The Canteen Counter</h1>
          <p className="text-steel text-sm">
            {mode === "signin" ? "Sign in to your canteen." : "Create your account — verified by email."}
          </p>
        </div>

        {/* Tabs — returning devices lead with Sign In only */}
        <div className="flex bg-paper2 rounded-full p-1 mb-5">
          <button
            onClick={() => setMode("signin")}
            className={`flex-1 py-2 rounded-full text-sm font-semibold transition ${
              mode === "signin" ? "bg-board text-paper shadow" : "text-steel hover:text-ink"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 py-2 rounded-full text-sm font-semibold transition ${
              mode === "signup" ? "bg-board text-paper shadow" : "text-steel hover:text-ink"
            }`}
          >
            Sign Up
          </button>
        </div>

        {mode === "signin" ? <SignInCard /> : <SignUpCard />}

        {mode === "signin" && !returning && (
          <p className="text-center text-xs text-steel mt-4">
            First time here?{" "}
            <button onClick={() => setMode("signup")} className="text-turmeric-dark font-semibold hover:underline">
              Create an account
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// SIGN IN — one form, member/seller toggle. Backend finds the company.
// -------------------------------------------------------------------------
function SignInCard() {
  const [role, setRole] = useState("member");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (!supabaseConfigured) return setError("Backend not connected — the site owner must set the Supabase env vars.");
    if (!email.trim() || !password) return setError("Email and password are both required.");
    setSubmitting(true);
    setError("");

    if (role === "member") {
      const session = await memberLoginGlobal(email.trim(), password);
      setSubmitting(false);
      if (!session) return setError("Wrong email or password.");
      storeMemberSession(session);
      rememberSession("member", session.company_slug);
      navigate(`/${session.company_slug}/member`);
    } else {
      const session = await sellerLoginGlobal(email.trim(), password);
      setSubmitting(false);
      if (!session) return setError("Wrong email or password.");
      storeAdminSession(session);
      rememberSession("seller", session.company_slug);
      navigate(`/${session.company_slug}/admin`);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-ink/5 p-5 space-y-4">
      <RoleToggle role={role} setRole={setRole} />
      <div>
        <label className="text-xs font-mono uppercase text-steel">Email</label>
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
        <label className="text-xs font-mono uppercase text-steel">Password</label>
        <PasswordInput className="mt-1" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <div className="text-right mt-1">
          <Link to="/forgot" className="text-xs text-turmeric-dark font-medium hover:underline">
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
        Sign in
      </button>
    </form>
  );
}

// -------------------------------------------------------------------------
// SIGN UP — choose Member or Seller → details → OTP (always) → account.
// -------------------------------------------------------------------------
function SignUpCard() {
  const [role, setRole] = useState(null); // null → still choosing
  if (!role) {
    return (
      <div className="bg-white rounded-2xl border border-ink/5 p-5">
        <p className="text-sm text-steel text-center mb-4">Who are you signing up as?</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setRole("member")}
            className="flex flex-col items-center gap-2 border border-ink/10 hover:border-turmeric rounded-2xl py-6 transition"
          >
            <UserCircle2 size={24} className="text-turmeric-dark" />
            <span className="text-sm font-semibold">Member</span>
            <span className="text-[11px] text-steel px-2 text-center">Join your office canteen with its company code</span>
          </button>
          <button
            onClick={() => setRole("seller")}
            className="flex flex-col items-center gap-2 border border-ink/10 hover:border-turmeric rounded-2xl py-6 transition"
          >
            <Store size={24} className="text-turmeric-dark" />
            <span className="text-sm font-semibold">Seller</span>
            <span className="text-[11px] text-steel px-2 text-center">Create a new canteen and run its counter</span>
          </button>
        </div>
      </div>
    );
  }
  return role === "member" ? <MemberSignupFlow onBack={() => setRole(null)} /> : <SellerSignupFlow onBack={() => setRole(null)} />;
}

function MemberSignupFlow({ onBack }) {
  const [step, setStep] = useState(1); // 1 details → 2 otp
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const begin = async (e) => {
    e.preventDefault();
    if (!supabaseConfigured) return setError("Backend not connected — the site owner must set the Supabase env vars.");
    if (!companyCode.trim()) return setError("Company code is required — ask your canteen seller for it.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setSubmitting(true);
    setError("");
    const res = await sendOtp(email.trim());
    setSubmitting(false);
    if (!res.ok) return setError(res.error);
    setStep(2);
  };

  const finish = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const res = await memberSignup(email.trim(), password, name.trim(), companyCode.trim(), otp.trim());
    setSubmitting(false);
    if (!res.ok) return setError(res.error);
    storeMemberSession(res);
    rememberSession("member", res.company_slug);
    navigate(`/${res.company_slug}/member`);
  };

  if (step === 2) {
    return (
      <OtpForm
        email={email}
        otp={otp}
        setOtp={setOtp}
        error={error}
        submitting={submitting}
        onSubmit={finish}
        onResend={() => sendOtp(email.trim())}
        submitLabel="Verify & create account"
      />
    );
  }

  return (
    <form onSubmit={begin} className="bg-white rounded-2xl border border-ink/5 p-5 space-y-4">
      <BackRow onBack={onBack} icon={UserCircle2} title="Member signup" />
      <div>
        <label className="text-xs font-mono uppercase text-steel">Your name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full px-4 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
          placeholder="e.g. Priya Sharma"
          autoFocus
        />
      </div>
      <div>
        <label className="text-xs font-mono uppercase text-steel">Company code</label>
        <input
          value={companyCode}
          onChange={(e) => setCompanyCode(e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 6))}
          className="mt-1 w-full px-4 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none font-mono tracking-[0.3em] text-center"
          placeholder="ABC123"
          required
        />
        <p className="text-[11px] text-steel mt-1">Your canteen seller shares this 6-character code.</p>
      </div>
      <div>
        <label className="text-xs font-mono uppercase text-steel">Email</label>
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
        Send verification code
      </button>
    </form>
  );
}

function SellerSignupFlow({ onBack }) {
  const [step, setStep] = useState(1); // 1 details → 2 otp → 3 created
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  const begin = async (e) => {
    e.preventDefault();
    if (!supabaseConfigured) return setError("Backend not connected — the site owner must set the Supabase env vars.");
    if (!companyName.trim()) return setError("Company name is required.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setSubmitting(true);
    setError("");
    const res = await sendOtp(email.trim());
    setSubmitting(false);
    if (!res.ok) return setError(res.error);
    setStep(2);
  };

  const finish = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const res = await sellerSignup(email.trim(), password, companyName.trim(), otp.trim());
    setSubmitting(false);
    if (!res.ok) return setError(res.error);
    storeAdminSession(res);
    rememberSession("seller", res.company_slug);
    setCreated(res);
    setStep(3);
  };

  if (step === 3 && created) {
    return (
      <div className="bg-white rounded-2xl border border-ink/5 p-6 text-center">
        <CheckCircle2 size={32} className="text-sage mx-auto mb-2" />
        <p className="font-semibold mb-1">{created.company_name} is ready 🎉</p>
        <p className="text-steel text-sm mb-4">Share this company code — your members sign up with it:</p>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(created.company_code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="w-full bg-board text-paper rounded-2xl py-4 mb-2 font-mono text-2xl tracking-[0.3em] flex items-center justify-center gap-3"
          title="Tap to copy"
        >
          {created.company_code} <Copy size={16} className="text-turmeric" />
        </button>
        <p className="text-[11px] text-steel mb-4">{copied ? "Copied ✅" : "Tap the code to copy it."}</p>
        <button
          onClick={() => navigate(`/${created.company_slug}/admin`)}
          className="w-full bg-turmeric hover:bg-turmeric-dark text-ink font-semibold py-3 rounded-full"
        >
          Go to my dashboard
        </button>
      </div>
    );
  }

  if (step === 2) {
    return (
      <OtpForm
        email={email}
        otp={otp}
        setOtp={setOtp}
        error={error}
        submitting={submitting}
        onSubmit={finish}
        onResend={() => sendOtp(email.trim())}
        submitLabel="Verify & create company"
      />
    );
  }

  return (
    <form onSubmit={begin} className="bg-white rounded-2xl border border-ink/5 p-5 space-y-4">
      <BackRow onBack={onBack} icon={Building2} title="Seller signup" />
      <div>
        <label className="text-xs font-mono uppercase text-steel">Company name</label>
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
        Send verification code
      </button>
    </form>
  );
}

// -------------------------------------------------------------------------
// Shared bits
// -------------------------------------------------------------------------
function RoleToggle({ role, setRole }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[
        { id: "member", label: "Member", Icon: UserCircle2 },
        { id: "seller", label: "Seller", Icon: Store },
      ].map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setRole(id)}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition ${
            role === id ? "border-turmeric bg-turmeric/10 text-ink" : "border-ink/10 text-steel hover:border-ink/25"
          }`}
        >
          <Icon size={16} /> {label}
        </button>
      ))}
    </div>
  );
}

function BackRow({ onBack, icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 -mt-1">
      <button type="button" onClick={onBack} className="text-xs text-steel hover:text-ink hover:underline">
        ← Back
      </button>
      <span className="flex items-center gap-1.5 text-sm font-semibold ml-auto text-turmeric-dark">
        <Icon size={15} /> {title}
      </span>
    </div>
  );
}

function OtpForm({ email, otp, setOtp, error, submitting, onSubmit, onResend, submitLabel }) {
  const [resent, setResent] = useState(false);
  return (
    <form onSubmit={onSubmit} className="bg-white rounded-2xl border border-ink/5 p-5 space-y-4">
      <div className="flex items-center gap-2 text-xs text-steel bg-paper2 px-3 py-2 rounded-xl">
        <Mail size={14} className="shrink-0" />
        <span>
          We mailed a 6-digit code to <b>{email}</b>. It expires in 10 minutes.
        </span>
      </div>
      <input
        value={otp}
        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="w-full px-4 py-3 rounded-xl border border-ink/15 focus:border-turmeric outline-none text-center font-mono text-2xl tracking-[0.4em]"
        placeholder="••••••"
        inputMode="numeric"
        autoFocus
        required
      />
      {error && <p className="text-brick text-sm">{error}</p>}
      <button
        type="submit"
        disabled={submitting || otp.length !== 6}
        className="w-full bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink font-semibold py-3 rounded-full flex items-center justify-center gap-2"
      >
        {submitting && <Loader2 size={16} className="animate-spin" />}
        {submitLabel}
      </button>
      <button
        type="button"
        onClick={() => {
          onResend();
          setResent(true);
          setTimeout(() => setResent(false), 2000);
        }}
        className="w-full text-xs text-turmeric-dark font-medium hover:underline"
      >
        {resent ? "Code re-sent ✅" : "Resend code"}
      </button>
    </form>
  );
}
