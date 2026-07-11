import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Store, UserCircle2, Loader2, CheckCircle2, Copy, Building2, Mail, ArrowLeft, Lock, Hash, User,
} from "lucide-react";
import {
  memberLoginGlobal, sellerLoginGlobal, sellerSignup, memberSignup, sendOtp,
  storeAdminSession, storeMemberSession, rememberSession, findActiveSession, setEphemeral,
} from "../lib/globalAuth";
import { supabaseConfigured } from "../lib/supabaseClient";
import PasswordInput from "../components/PasswordInput";

// =========================================================================
// The FIRST SCREEN — laid out like a real mobile app's login:
//
//   ┌──────────────────────────────┐
//   │   dark header band           │
//   │      (🍱 logo pill)          │
//   ├──── white rounded sheet ─────┤
//   │         Welcome!             │
//   │   ✉  Email Address           │
//   │   🔒 Password                │
//   │   ☑ Remember me   Forgot?    │
//   │   (        Login        )    │
//   │   New here? Create account   │
//   │   — or try the demo —        │
//   └──────────────────────────────┘
//
// One form for everyone — member vs seller is auto-detected on sign-in.
// The Member/Seller choice only appears when creating an account.
// =========================================================================

const DEMO_ACCOUNTS = [
  { label: "Seller", sub: "runs the counter", email: "seller@demo.com", password: "demo123", Icon: Store },
  { label: "Rahul", sub: "member", email: "rahul@demo.com", password: "demo123", Icon: UserCircle2 },
  { label: "Priya", sub: "member", email: "priya@demo.com", password: "demo123", Icon: UserCircle2 },
  { label: "Amit", sub: "member", email: "amit@demo.com", password: "demo123", Icon: UserCircle2 },
  { label: "Sneha", sub: "member", email: "sneha@demo.com", password: "demo123", Icon: UserCircle2 },
];
export const DEMO_COMPANY_CODE = "DEMO99";

// Sign in with just email + password — tries member first, then seller,
// so nobody ever has to say which one they are.
async function smartLogin(email, password, prefer = "member") {
  const attempts =
    prefer === "seller"
      ? [
          ["seller", sellerLoginGlobal],
          ["member", memberLoginGlobal],
        ]
      : [
          ["member", memberLoginGlobal],
          ["seller", sellerLoginGlobal],
        ];
  for (const [role, fn] of attempts) {
    const session = await fn(email, password);
    if (session) return { role, session };
  }
  return null;
}

export default function AuthPage() {
  const navigate = useNavigate();
  // 'signin' | 'signup-member' | 'signup-seller'
  const [view, setView] = useState("signin");

  // Already logged in? Skip this page entirely.
  useEffect(() => {
    const active = findActiveSession();
    if (active) {
      navigate(active.role === "seller" ? `/${active.companySlug}/admin` : `/${active.companySlug}/member`, {
        replace: true,
      });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-paper flex flex-col page-enter">
      {/* ── Logo row — plain white, no dark band ─────────────────────── */}
      <div className="pt-8 pb-2 flex justify-center shrink-0">
        <div className="bg-white border border-ink/10 rounded-full pl-1.5 pr-5 py-1.5 flex items-center gap-2 shadow-sm">
          <span className="w-8 h-8 rounded-full bg-turmeric flex items-center justify-center text-base">🍱</span>
          <span className="font-chalk text-lg text-ink leading-none">Corporate Canteen</span>
        </div>
      </div>

      {/* ── About-the-app: short rotating highlights, not a heavy hero ── */}
      <AboutStrip />

      {/* ── Form area — same white background, no separate "sheet" ──── */}
      <div className="flex-1 px-6 pt-4 pb-8">
        <div className="max-w-sm mx-auto w-full">
          {view === "signin" && (
            <>
              <h2 className="text-center text-2xl font-bold mb-5">Welcome!</h2>
              <SignInView
                onCreateMember={() => setView("signup-member")}
                onCreateSeller={() => setView("signup-seller")}
              />
            </>
          )}
          {view === "signup-member" && <MemberSignupFlow onBack={() => setView("signin")} />}
          {view === "signup-seller" && <SellerSignupFlow onBack={() => setView("signin")} />}

          {view !== "signin" && (
            <p className="text-center text-sm text-steel mt-5">
              Already have an account?{" "}
              <button onClick={() => setView("signin")} className="text-turmeric-dark font-semibold hover:underline">
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// ABOUT STRIP — a small, auto-rotating one-liner introducing what the app
// does, so a first-time visitor understands it in 3 seconds without a full
// marketing page. Pure CSS/JS, no extra libraries.
// -------------------------------------------------------------------------
const APP_HIGHLIGHTS = [
  { icon: "🍱", text: "Order canteen food from your phone — no queue." },
  { icon: "💳", text: "A wallet + khata for every member, tracked automatically." },
  { icon: "📅", text: "Daily attendance & check-ins, synced with your canteen bill." },
  { icon: "🏢", text: "Built for companies — every canteen's data stays private." },
];

function AboutStrip() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % APP_HIGHLIGHTS.length), 3200);
    return () => clearInterval(id);
  }, []);
  const current = APP_HIGHLIGHTS[i];
  return (
    <div className="flex justify-center px-6 pb-3 shrink-0">
      <div className="max-w-sm w-full bg-turmeric/10 border border-turmeric/25 rounded-2xl px-4 py-2.5 flex items-center gap-2.5 min-h-[52px]">
        <span key={i} className="text-lg animate-pop-in shrink-0">{current.icon}</span>
        <p key={`t-${i}`} className="text-xs sm:text-sm text-ink/80 font-medium animate-fade-in leading-snug">
          {current.text}
        </p>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// SIGN IN — one form for everyone. Role is auto-detected.
// -------------------------------------------------------------------------
function SignInView({ onCreateMember, onCreateSeller }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [demoBusy, setDemoBusy] = useState(null);
  const navigate = useNavigate();

  const finishLogin = ({ role, session }, rememberMe) => {
    setEphemeral(!rememberMe);
    if (role === "member") {
      storeMemberSession(session);
      rememberSession("member", session.company_slug);
      navigate(`/${session.company_slug}/member`);
    } else {
      storeAdminSession(session);
      rememberSession("seller", session.company_slug);
      navigate(`/${session.company_slug}/admin`);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!supabaseConfigured) return setError("Backend not connected — the site owner must set the Supabase env vars.");
    if (!email.trim() || !password) return setError("Email and password are both required.");
    setSubmitting(true);
    setError("");
    const result = await smartLogin(email.trim(), password); // member or seller — auto-detected
    setSubmitting(false);
    if (!result) return setError("Wrong email or password.");
    finishLogin(result, remember);
  };

  const signInAsDemo = async (acc) => {
    if (!supabaseConfigured) return setError("Backend not connected — the site owner must set the Supabase env vars.");
    setDemoBusy(acc.email);
    setError("");
    const result = await smartLogin(acc.email, acc.password, acc.sub === "member" ? "member" : "seller");
    setDemoBusy(null);
    if (!result) return setError("Demo accounts aren't set up yet — run the latest schema.sql in Supabase.");
    finishLogin(result, true);
  };

  return (
    <>
      <form onSubmit={submit} className="space-y-3">
        <div className="relative">
          <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-steel pointer-events-none" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-ink/15 focus:border-turmeric outline-none bg-white"
            placeholder="Email Address"
            autoFocus
            required
          />
        </div>

        <PasswordInput icon={Lock} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-steel cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-4 h-4 rounded border-ink/25 accent-turmeric"
            />
            Remember me
          </label>
          <Link to="/forgot" className="text-turmeric-dark font-semibold hover:underline">
            Forgot Password?
          </Link>
        </div>

        {error && <p className="text-brick text-sm text-center">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink font-bold text-base py-3.5 rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
        >
          {submitting && <Loader2 size={17} className="animate-spin" />}
          Login
        </button>
      </form>

      {/* One click straight to the right signup — no in-between screen */}
      <div className="flex items-center justify-center gap-2 text-sm mt-4">
        <span className="text-steel">New here?</span>
        <button onClick={onCreateMember} className="text-turmeric-dark font-semibold hover:underline">
          Join as member
        </button>
        <span className="text-ink/20">|</span>
        <button onClick={onCreateSeller} className="text-turmeric-dark font-semibold hover:underline">
          Create canteen
        </button>
      </div>

      {/* Demo: one tap signs you straight in */}
      <div className="mt-5">
        <div className="flex items-center gap-3 mb-2.5">
          <div className="flex-1 h-px bg-ink/10" />
          <span className="text-[11px] font-mono uppercase tracking-widest text-steel">or try the demo</span>
          <div className="flex-1 h-px bg-ink/10" />
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.email}
              onClick={() => signInAsDemo(acc)}
              disabled={demoBusy !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-ink/15 bg-white text-xs font-medium hover:border-turmeric hover:bg-turmeric/5 disabled:opacity-50 transition"
              title={`${acc.email} · ${acc.password}`}
            >
              {demoBusy === acc.email ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <acc.Icon size={13} className={acc.sub === "member" ? "text-sage" : "text-turmeric-dark"} />
              )}
              {acc.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// -------------------------------------------------------------------------
// MEMBER: Create account — details → emailed OTP → account + session.
// -------------------------------------------------------------------------
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
    setEphemeral(false);
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
        onBack={() => {
          setStep(1);
          setOtp("");
          setError("");
        }}
      />
    );
  }

  return (
    <form onSubmit={begin} className="space-y-4">
      <TitleRow icon={UserCircle2} title="Create member account" onBack={onBack} />
      <div className="relative">
        <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-steel pointer-events-none" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-ink/15 focus:border-turmeric outline-none bg-white"
          placeholder="Your name"
          autoFocus
        />
      </div>
      <div>
        <div className="relative">
          <Hash size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-steel pointer-events-none" />
          <input
            value={companyCode}
            onChange={(e) => setCompanyCode(e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 6))}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-ink/15 focus:border-turmeric outline-none bg-white font-mono tracking-[0.25em]"
            placeholder="Company code"
            required
          />
        </div>
        <p className="text-[11px] text-steel mt-1 pl-1">
          Your canteen seller shares this 6-character code. (Demo: {DEMO_COMPANY_CODE})
        </p>
      </div>
      <div className="relative">
        <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-steel pointer-events-none" />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-ink/15 focus:border-turmeric outline-none bg-white"
          placeholder="Email Address"
          required
        />
      </div>
      <PasswordInput icon={Lock} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6 chars)" required />
      <PasswordInput icon={Lock} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm password" required />
      {error && <p className="text-brick text-sm text-center">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-sm"
      >
        {submitting && <Loader2 size={16} className="animate-spin" />}
        Send verification code
      </button>
    </form>
  );
}

// -------------------------------------------------------------------------
// SELLER: Create account — details → emailed OTP → company + code shown.
// -------------------------------------------------------------------------
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
    setEphemeral(false);
    storeAdminSession(res);
    rememberSession("seller", res.company_slug);
    setCreated(res);
    setStep(3);
  };

  if (step === 3 && created) {
    return (
      <div className="bg-white rounded-2xl border border-ink/5 p-6 text-center shadow-sm">
        <CheckCircle2 size={32} className="text-sage mx-auto mb-2" />
        <p className="font-semibold mb-1">{created.company_name} is ready 🎉</p>
        <p className="text-steel text-sm mb-4">Share this company code — your members sign up with it:</p>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(created.company_code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="w-full bg-turmeric/15 border-2 border-dashed border-turmeric text-ink rounded-2xl py-4 mb-2 font-mono text-2xl tracking-[0.3em] flex items-center justify-center gap-3"
          title="Tap to copy"
        >
          {created.company_code} <Copy size={16} className="text-turmeric-dark" />
        </button>
        <p className="text-[11px] text-steel mb-4">{copied ? "Copied ✅" : "Tap the code to copy it."}</p>
        <button
          onClick={() => navigate(`/${created.company_slug}/admin`)}
          className="w-full bg-turmeric hover:bg-turmeric-dark text-ink font-bold py-3.5 rounded-xl"
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
        onBack={() => {
          setStep(1);
          setOtp("");
          setError("");
        }}
      />
    );
  }

  return (
    <form onSubmit={begin} className="space-y-4">
      <TitleRow icon={Building2} title="Create seller account" onBack={onBack} />
      <div className="relative">
        <Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-steel pointer-events-none" />
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-ink/15 focus:border-turmeric outline-none bg-white"
          placeholder="Company name (e.g. Acme Corp Canteen)"
          autoFocus
          required
        />
      </div>
      <div className="relative">
        <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-steel pointer-events-none" />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-ink/15 focus:border-turmeric outline-none bg-white"
          placeholder="Email Address (your seller login)"
          required
        />
      </div>
      <PasswordInput icon={Lock} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6 chars)" required />
      <PasswordInput icon={Lock} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm password" required />
      {error && <p className="text-brick text-sm text-center">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-sm"
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
function TitleRow({ icon: Icon, title, onBack }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-turmeric-dark">
      {onBack && (
        <button type="button" onClick={onBack} className="text-steel hover:text-ink" title="Back">
          <ArrowLeft size={15} />
        </button>
      )}
      <Icon size={15} /> {title}
    </div>
  );
}

function OtpForm({ email, otp, setOtp, error, submitting, onSubmit, onResend, submitLabel, onBack }) {
  const [resent, setResent] = useState(false);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-steel bg-white border border-ink/10 px-3 py-2.5 rounded-xl">
        <Mail size={14} className="shrink-0" />
        <span>
          We mailed a 6-digit code to <b>{email}</b>. It expires in 10 minutes.
        </span>
      </div>
      <input
        value={otp}
        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="w-full px-4 py-3 rounded-xl border border-ink/15 focus:border-turmeric outline-none text-center font-mono text-2xl tracking-[0.4em] bg-white"
        placeholder="••••••"
        inputMode="numeric"
        autoFocus
        required
      />
      {error && <p className="text-brick text-sm text-center">{error}</p>}
      <button
        type="submit"
        disabled={submitting || otp.length !== 6}
        className="w-full bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-sm"
      >
        {submitting && <Loader2 size={16} className="animate-spin" />}
        {submitLabel}
      </button>
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-xs text-steel hover:underline">
          ← Edit details
        </button>
        <button
          type="button"
          onClick={() => {
            onResend();
            setResent(true);
            setTimeout(() => setResent(false), 2000);
          }}
          className="text-xs text-turmeric-dark font-medium hover:underline"
        >
          {resent ? "Code re-sent ✅" : "Resend code"}
        </button>
      </div>
    </form>
  );
}
