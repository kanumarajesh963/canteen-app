import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  CalendarCheck, LogOut, IndianRupee, Mail, KeyRound, LifeBuoy, Loader2, X, CheckCircle2,
} from "lucide-react";
import { useStore } from "../lib/StoreContext";
import StatCard from "../components/StatCard";
import PasswordInput from "../components/PasswordInput";

export default function MemberHome() {
  const {
    isMember, memberInfo, logoutMember, myAttendance, company,
    myProfile, setMyEmail, changeMyPassword, checkinStatusToday, checkinToday, raiseMyTicket,
  } = useStore();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [checkin, setCheckin] = useState(null); // { status: 'none'|'pending'|'yes'|'no', amount }
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showTicket, setShowTicket] = useState(false);

  const refreshAll = async () => {
    const [r, p, c] = await Promise.all([myAttendance(), myProfile(), checkinStatusToday()]);
    setRecords(r);
    setProfile(p);
    setCheckin(c);
    setLoading(false);
  };

  useEffect(() => {
    if (isMember) refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMember]);

  if (!isMember) return <Navigate to="/member/login" replace />;

  const now = new Date();
  const thisMonthTotal = records
    .filter((r) => {
      const d = new Date(r.visit_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, r) => s + Number(r.amount), 0);
  const allTimeTotal = records.reduce((s, r) => s + Number(r.amount), 0);

  const answerToday = async (coming) => {
    setCheckinBusy(true);
    const res = await checkinToday(coming);
    setCheckinBusy(false);
    if (!res.ok) {
      alert(res.error || "Couldn't record your answer.");
      return;
    }
    refreshAll();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-chalk text-3xl">Hi, {memberInfo?.name || `Member #${memberInfo?.memberNumber}`}</h1>
          <p className="text-steel text-sm font-mono">
            {company.name} · Member #{memberInfo?.memberNumber}
          </p>
        </div>
        <button
          onClick={logoutMember}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-ink/15 hover:bg-paper2"
        >
          <LogOut size={13} /> Log out
        </button>
      </div>

      {/* ---- Today's check-in: same question the morning email asks ---- */}
      <div className="bg-board text-paper rounded-2xl p-5 mb-6">
        {checkin?.status === "yes" ? (
          <div className="flex items-center gap-3">
            <CheckCircle2 size={22} className="text-turmeric shrink-0" />
            <div>
              <p className="font-semibold">You're coming to the office today ✅</p>
              <p className="text-paper/70 text-sm">₹{checkin.amount} recorded as today's canteen collection.</p>
            </div>
          </div>
        ) : checkin?.status === "no" ? (
          <div>
            <p className="font-semibold mb-1">Marked as not coming today.</p>
            <p className="text-paper/70 text-sm mb-3">Plans changed? You can still check in:</p>
            <button
              onClick={() => answerToday(true)}
              disabled={checkinBusy}
              className="bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink text-sm font-semibold px-5 py-2 rounded-full inline-flex items-center gap-2"
            >
              {checkinBusy && <Loader2 size={14} className="animate-spin" />}
              Actually, I'm coming (₹{checkin.amount})
            </button>
          </div>
        ) : (
          <div>
            <p className="font-semibold text-lg mb-1">Are you coming to the office today?</p>
            <p className="text-paper/70 text-sm mb-4">
              Tapping YES records ₹{checkin?.amount ?? 250} as today's canteen collection.
              {profile?.email
                ? " We also email you this every morning."
                : " Add your email below to get this by mail every morning."}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => answerToday(true)}
                disabled={checkinBusy}
                className="flex-1 bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink font-semibold py-2.5 rounded-full inline-flex items-center justify-center gap-2"
              >
                {checkinBusy && <Loader2 size={14} className="animate-spin" />}✅ Yes
              </button>
              <button
                onClick={() => answerToday(false)}
                disabled={checkinBusy}
                className="flex-1 border border-paper/30 hover:bg-paper/10 disabled:opacity-60 font-semibold py-2.5 rounded-full"
              >
                ❌ Not today
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
        <StatCard label="This month" value={`₹${thisMonthTotal}`} icon={IndianRupee} tone="sage" />
        <StatCard label="All time" value={`₹${allTimeTotal}`} icon={CalendarCheck} tone="turmeric" />
      </div>

      {/* ---- Email for the morning mail ---- */}
      <EmailCard profile={profile} setMyEmail={setMyEmail} onSaved={refreshAll} />

      {/* ---- Account actions ---- */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={() => setShowPassword(true)}
          className="bg-white rounded-2xl border border-ink/5 p-4 flex items-center gap-3 hover:border-turmeric transition text-left"
        >
          <KeyRound size={18} className="text-turmeric-dark shrink-0" />
          <div>
            <p className="font-semibold text-sm">Change password</p>
            <p className="text-xs text-steel">Update your login password</p>
          </div>
        </button>
        <button
          onClick={() => setShowTicket(true)}
          className="bg-white rounded-2xl border border-ink/5 p-4 flex items-center gap-3 hover:border-turmeric transition text-left"
        >
          <LifeBuoy size={18} className="text-brick shrink-0" />
          <div>
            <p className="font-semibold text-sm">Raise a ticket</p>
            <p className="text-xs text-steel">Problem or question? Tell the seller</p>
          </div>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-ink/5 p-4 sm:p-5">
        <p className="text-sm font-semibold mb-3">Attendance history</p>
        {loading ? (
          <p className="text-steel text-sm text-center py-6">Loading…</p>
        ) : records.length === 0 ? (
          <p className="text-steel text-sm text-center py-6">No visits recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {records.map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-sm">
                <CalendarCheck size={14} className="text-sage shrink-0" />
                <span className="flex-1 text-steel">
                  {new Date(r.visit_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
                <span className="font-mono font-semibold text-sage">₹{r.amount}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} changeMyPassword={changeMyPassword} />}
      {showTicket && <RaiseTicketModal onClose={() => setShowTicket(false)} raiseMyTicket={raiseMyTicket} />}
    </div>
  );
}

function EmailCard({ profile, setMyEmail, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setEmail(profile?.email || "");
  }, [profile]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await setMyEmail(email.trim());
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEditing(false);
    onSaved();
  };

  return (
    <div className={`rounded-2xl border p-4 sm:p-5 mb-3 ${profile?.email ? "bg-white border-ink/5" : "bg-turmeric/10 border-turmeric/40"}`}>
      <div className="flex items-start gap-3">
        <Mail size={18} className="text-turmeric-dark shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold text-sm">Morning check-in email</p>
          {!editing ? (
            <>
              <p className="text-xs text-steel mt-0.5">
                {profile?.email
                  ? <>Every morning we mail <b>{profile.email}</b> asking if you're coming — one tap answers it.</>
                  : "Add your email to get the daily \"coming to office?\" mail with one-tap Yes/No buttons."}
              </p>
              <button
                onClick={() => setEditing(true)}
                className="mt-2 text-xs font-semibold text-turmeric-dark hover:underline"
              >
                {profile?.email ? "Change email" : "Add my email"}
              </button>
            </>
          ) : (
            <form onSubmit={save} className="mt-2 flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="flex-1 px-3.5 py-2 rounded-xl border border-ink/15 outline-none focus:border-turmeric text-sm"
                autoFocus
                required
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink text-sm font-semibold px-4 py-2 rounded-full inline-flex items-center gap-1.5"
                >
                  {saving && <Loader2 size={13} className="animate-spin" />} Save
                </button>
                <button type="button" onClick={() => setEditing(false)} className="text-sm px-3 py-2 rounded-full border border-ink/15 hover:bg-paper2">
                  Cancel
                </button>
              </div>
            </form>
          )}
          {error && <p className="text-brick text-xs mt-1">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function ChangePasswordModal({ onClose, changeMyPassword }) {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setError("New passwords don't match.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await changeMyPassword(oldPw, newPw);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
  };

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-sm w-full p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-chalk text-xl">Change password</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-paper2">
            <X size={18} />
          </button>
        </div>
        {done ? (
          <div className="text-center py-4">
            <CheckCircle2 size={32} className="text-sage mx-auto mb-2" />
            <p className="font-semibold mb-1">Password updated ✅</p>
            <p className="text-steel text-sm mb-4">Use the new password next time you log in.</p>
            <button onClick={onClose} className="bg-turmeric hover:bg-turmeric-dark text-ink font-semibold px-6 py-2 rounded-full">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="text-xs font-mono uppercase text-steel">Current password</label>
              <PasswordInput className="mt-1" value={oldPw} onChange={(e) => setOldPw(e.target.value)} required autoFocus />
            </div>
            <div>
              <label className="text-xs font-mono uppercase text-steel">New password (min 6 chars)</label>
              <PasswordInput className="mt-1" value={newPw} onChange={(e) => setNewPw(e.target.value)} required placeholder="New password" />
            </div>
            <div>
              <label className="text-xs font-mono uppercase text-steel">Confirm new password</label>
              <PasswordInput className="mt-1" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required placeholder="Repeat new password" />
            </div>
            {error && <p className="text-brick text-sm">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink font-semibold py-2.5 rounded-full inline-flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={15} className="animate-spin" />}
              Update password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function RaiseTicketModal({ onClose, raiseMyTicket }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await raiseMyTicket(subject.trim(), message.trim());
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
  };

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-sm w-full p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-chalk text-xl">Raise a ticket</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-paper2">
            <X size={18} />
          </button>
        </div>
        {done ? (
          <div className="text-center py-4">
            <CheckCircle2 size={32} className="text-sage mx-auto mb-2" />
            <p className="font-semibold mb-1">Ticket raised ✅</p>
            <p className="text-steel text-sm mb-4">Your seller will see it in their dashboard and follow up.</p>
            <button onClick={onClose} className="bg-turmeric hover:bg-turmeric-dark text-ink font-semibold px-6 py-2 rounded-full">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="text-xs font-mono uppercase text-steel">Subject</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1 w-full px-3.5 py-2 rounded-xl border border-ink/15 outline-none focus:border-turmeric"
                placeholder="e.g. Wrong amount charged on 5 July"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-mono uppercase text-steel">Details</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="mt-1 w-full px-3.5 py-2 rounded-xl border border-ink/15 outline-none focus:border-turmeric resize-none"
                placeholder="Describe the issue…"
              />
            </div>
            {error && <p className="text-brick text-sm">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink font-semibold py-2.5 rounded-full inline-flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={15} className="animate-spin" />}
              Submit ticket
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
