import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Store, UserCircle2, Loader2, CheckCircle2, Copy, Building2, Mail, ArrowLeft } from "lucide-react";
import {
  memberLoginGlobal, sellerLoginGlobal, sellerSignup, memberSignup, sendOtp,
  storeAdminSession, storeMemberSession, rememberSession, findActiveSession,
} from "../lib/globalAuth";
import { supabaseConfigured } from "../lib/supabaseClient";
import PasswordInput from "../components/PasswordInput";

// =========================================================================
// The FIRST SCREEN — kept as simple as a real app's login:
//
//   [ email    ]
//   [ password ]        ← no role choice; we auto-detect member vs seller
//   (  Sign in  )
//   Forgot password? · New here? Create account
//
// "Create account" is the ONLY place you choose Member or Seller.
// Demo accounts sign you in with one tap.
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
// so nobody ever has to say which one they are. Returns { role, session }.
async function smartLogin(email, password) {
  const member = await memberLoginGlobal(email, password);
  if (member) return { role: "member", session: member };
  const seller = await sellerLoginGlobal(email, password);
  if (seller) return { role: "seller", session: seller };
  return null;
}

export default function AuthPage() {
  const navigate = useNavigate();
  // 'signin' | 'choose' | 'signup-member' | 'signup-seller'
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
    <div className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="max-w-sm w-full">
        <div className="text-center mb-7">
          <div className="text-5xl mb-2">🍱</div>
          <h1 className="font-chalk text-3xl">The Canteen Counter</h1>
          <p className="text-steel text-sm">
            {view === "signin" && "Welcome back — sign in to continue."}
            {view === "choose" && "Let's set you up. Who are you?"}
            {view === "signup-member" && "Join your office canteen."}
            {view === "signup-seller" && "Create and run your canteen."}
          </p>
        </div>

        {view === "signin" && <SignInView onCreateAccount={() => setView("choose")} />}
        {view === "choose" && (
          <ChooseRole
            onMember={() => setView("signup-member")}
            onSeller={() => setView("signup-seller")}
            onBack={() => setView("signin")}
          />
        )}
        {view === "signup-member" && <MemberSignupFlow onBack={() => setView("choose")} />}
        {view === "signup-seller" && <SellerSignupFlow onBack={() => setView("choose")} />}

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
  );
}

// -------------------------------------------------------------------------
// SIGN IN — one form for everyone. Role is auto-detected.
// -------------------------------------------------------------------------
function SignInView({ onCreateAccount }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [demoBusy, setDemoBusy] = useState(null); // email of the demo being signed in
  const navigate = useNavigate();

  const finishLogin = ({ role, session }) => {
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
    const result = await smartLogin(email.trim(), password);
    setSubmitting(false);
    if (!result) return setError("Wrong email or password.");
    finishLogin(result);
  };

  const signInAsDemo = async (acc) => {
    if (!supabaseConfigured) return setError("Backend not connected — the site owner must set the Supabase env vars.");
    setDemoBusy(acc.email);
    setError("");
    const result = await smartLogin(acc.email, acc.password);
    setDemoBusy(null);
    if (!result) return setError("Demo accounts aren't set up yet — run the latest schema.sql in Supabase.");
    finishLogin(result);
  };

  return (
    <>
      <form onSubmit={submit} className="bg-white rounded-2xl border border-ink/5 p-5 space-y-4">
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
        <div className="flex items-center justify-between text-xs">
          <Link to="/forgot" className="text-turmeric-dark font-medium hover:underline">
            Forgot password?
          </Link>
          <button type="button" onClick={onCreateAccount} className="text-turmeric-dark font-semibold hover:underline">
            New here? Create account
          </button>
        </div>
      </form>

      {/* Demo: one tap signs you straight in */}
      <div className="mt-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-px bg-ink/10" />
          <span className="text-[11px] font-mono uppercase tracking-widest text-steel">or try the demo</span>
          <div className="flex-1 h-px bg-ink/10" />
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.email}
              onClick={() => signInAsDemo(acc)}
              disabled={demoBusy !== null}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-ink/15 bg-white text-sm font-medium hover:border-turmeric hover:bg-turmeric/5 disabled:opacity-50 transition"
              title={`${acc.email} · ${acc.password}`}
            >
              {demoBusy === acc.email ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <acc.Icon size={14} className={acc.sub === "member" ? "text-sage" : "text-turmeric-dark"} />
              )}
              {acc.label}
              <span className="text-[10px] text-steel font-normal">· {acc.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// -------------------------------------------------------------------------
// CREATE ACCOUNT — the only place you choose Member or Seller.
// -------------------------------------------------------------------------
function ChooseRole({ onMember, onSeller, onBack }) {
  return (
    <div className="bg-white rounded-2xl border border-ink/5 p-5">
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-steel hover:text-ink mb-4">
        <ArrowLeft size={13} /> Back
      </button>
      <div className="space-y-3">
        <button
          onClick={onMember}
          className="w-full flex items-center gap-4 border border-ink/10 hover:border-turmeric rounded-2xl p-4 transition text-left"
        >
          <div className="w-11 h-11 rounded-xl bg-sage/10 text-sage flex items-center justify-center shrink-0">
            <UserCircle2 size={22} />
          </div>
          <div>
            <p className="font-semibold">I'm a member</p>
            <p className="text-xs text-steel">I eat at my office canteen — I have its company code</p>
          </div>
        </button>
        <button
          onClick={onSeller}
          className="w-full flex items-center gap-4 border border-ink/10 hover:border-turmeric rounded-2xl p-4 transition text-left"
        >
          <div className="w-11 h-11 rounded-xl bg-turmeric/15 text-turmeric-dark flex items-center justify-center shrink-0">
            <Store size={22} />
          </div>
          <div>
            <p className="font-semibold">I run a canteen</p>
            <p className="text-xs text-steel">Create a new canteen and manage its counter</p>
          </div>
        </button>
      </div>
    </div>
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
    <form onSubmit={begin} className="bg-white rounded-2xl border border-ink/5 p-5 space-y-4">
      <TitleRow icon={UserCircle2} title="Create your member account" onBack={onBack} />
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
        <p className="text-[11px] text-steel mt-1">Your canteen seller shares this 6-character code. (Demo: {DEMO_COMPANY_CODE})</p>
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
        onBack={() => {
          setStep(1);
          setOtp("");
          setError("");
        }}
      />
    );
  }

  return (
    <form onSubmit={begin} className="bg-white rounded-2xl border border-ink/5 p-5 space-y-4">
      <TitleRow icon={Building2} title="Create your canteen" onBack={onBack} />
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
function TitleRow({ icon: Icon, title, onBack }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-turmeric-dark -mt-1">
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
