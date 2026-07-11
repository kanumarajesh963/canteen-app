import React, { useEffect, useState } from "react";
import { Users, LogIn, CalendarDays, Sigma, KeyRound, X, Loader2, ShieldCheck } from "lucide-react";
import { useStore } from "../lib/StoreContext";
import StatCard from "./StatCard";
import PasswordInput from "./PasswordInput";

// Dashboard-lite for HR: read-only attendance/login analytics (same numbers
// the seller sees), a roster of regular members with last-login, and the
// ability to reset a regular member's password. HR cannot see or touch
// other HR accounts, the seller account, or anything admin_* controls.
export default function HrPanel() {
  const { hrListMembers, hrLoginStats } = useStore();
  const [members, setMembers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetTarget, setResetTarget] = useState(null); // null | member

  const refresh = async () => {
    setLoading(true);
    const [m, s] = await Promise.all([hrListMembers(), hrLoginStats()]);
    setMembers(m);
    setStats(s);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatLastLogin = (ts) => {
    if (!ts) return "Never logged in";
    const d = new Date(ts);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days === 0) return `Today, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days} days ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="bg-surface rounded-2xl border border-ink/5 p-4 sm:p-5 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-chalk text-xl">HR tools</h2>
        <span className="text-[10px] font-mono uppercase bg-sage/15 text-sage px-2 py-0.5 rounded-full">HR access</span>
      </div>
      <p className="text-steel text-xs mb-4">
        Attendance/login analytics, plus password resets for regular members. You can't manage other HR
        accounts or the seller login.
      </p>

      {loading ? (
        <p className="text-steel text-sm py-8 text-center">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard label="Logins today" value={stats?.today_logins ?? 0} icon={LogIn} tone="sage" />
            <StatCard label="Unique members today" value={stats?.today_unique_members ?? 0} icon={Users} tone="turmeric" />
            <StatCard label="This month" value={stats?.month_logins ?? 0} icon={CalendarDays} tone="board" />
            <StatCard label="All time" value={stats?.total_logins ?? 0} icon={Sigma} tone="sage" />
          </div>

          {members.length === 0 ? (
            <p className="text-steel text-sm py-6 text-center">No members yet.</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-mono uppercase text-steel border-b border-ink/10">
                    <th className="py-2 px-1">Member</th>
                    <th className="py-2 px-1">Last login</th>
                    <th className="py-2 px-1 text-right">Reset password</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className="border-b border-ink/5 last:border-0">
                      <td className="py-2 px-1">
                        <p className="font-medium">#{m.member_number} · {m.name || "(no name)"}</p>
                        <p className="text-xs text-steel font-mono">{m.email}</p>
                      </td>
                      <td className="py-2 px-1 text-steel font-mono text-xs">{formatLastLogin(m.last_login)}</td>
                      <td className="py-2 px-1 text-right">
                        <button
                          onClick={() => setResetTarget(m)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-sage hover:text-sage/80 px-2 py-1"
                        >
                          <KeyRound size={13} /> Reset
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {resetTarget && <ResetPasswordModal member={resetTarget} onClose={() => setResetTarget(null)} />}
    </div>
  );
}

function ResetPasswordModal({ member, onClose }) {
  const { hrResetMemberPassword } = useStore();
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await hrResetMemberPassword(member.id, password);
    setSaving(false);
    if (!res.ok) {
      setError(res.error || "Couldn't reset the password.");
      return;
    }
    setDone(true);
  };

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center p-4 z-50">
      <div className="bg-surface rounded-2xl max-w-sm w-full p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-chalk text-xl">Reset password</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-paper2">
            <X size={18} />
          </button>
        </div>
        {done ? (
          <div className="text-center py-4">
            <ShieldCheck size={28} className="text-sage mx-auto mb-2" />
            <p className="text-sm">
              Password updated for #{member.member_number} · {member.name || member.email}.
            </p>
            <button
              onClick={onClose}
              className="mt-4 w-full bg-turmeric hover:bg-turmeric-dark text-ink font-semibold py-2.5 rounded-full"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-xs text-steel">
              For #{member.member_number} · {member.name || member.email}
            </p>
            <div>
              <label className="text-xs font-mono uppercase text-steel">New password (min 6 chars)</label>
              <PasswordInput className="mt-1" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
            </div>
            {error && <p className="text-brick text-xs">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink font-semibold py-2.5 rounded-full transition flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Reset password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
