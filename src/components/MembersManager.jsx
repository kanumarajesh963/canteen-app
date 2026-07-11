import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, X } from "lucide-react";
import { useStore } from "../lib/StoreContext";
import PasswordInput from "./PasswordInput";

export default function MembersManager() {
  const { listMembers, upsertMember, deleteMember } = useStore();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'new' | member

  const refresh = async () => {
    setLoading(true);
    setMembers(await listMembers());
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-steel text-sm">
          {members.length} member{members.length === 1 ? "" : "s"}. Give each one a number, email and password.
          Their email is their login AND where the morning check-in mail goes.
        </p>
        <button
          onClick={() => setModal("new")}
          className="flex items-center gap-1.5 bg-turmeric hover:bg-turmeric-dark text-ink text-sm font-semibold px-4 py-2 rounded-full"
        >
          <Plus size={16} /> Add member
        </button>
      </div>

      {loading ? (
        <p className="text-steel text-sm py-10 text-center">Loading…</p>
      ) : members.length === 0 ? (
        <p className="text-steel text-sm py-10 text-center">No members yet — add your first one above.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {members.map((m) => (
            <div key={m.id} className={`bg-surface rounded-2xl border p-4 ${m.active ? "border-ink/5" : "border-brick/30 opacity-60"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm flex items-center gap-1.5">
                    #{m.member_number} · {m.name || "(no name)"}
                    {m.role === "hr" && (
                      <span className="text-[10px] font-mono uppercase bg-sage/15 text-sage px-1.5 py-0.5 rounded-full">HR</span>
                    )}
                    {m.role === "fullaccess" && (
                      <span className="text-[10px] font-mono uppercase bg-turmeric/20 text-turmeric-dark px-1.5 py-0.5 rounded-full">Full Access</span>
                    )}
                  </p>
                  <p className="text-xs text-steel font-mono truncate max-w-[170px]">{m.email || m.username}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setModal(m)} className="p-1.5 rounded-lg hover:bg-paper2">
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => confirm(`Remove member #${m.member_number}?`) && deleteMember(m.id).then(refresh)}
                    className="p-1.5 rounded-lg hover:bg-brick/10 text-brick"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="flex justify-between text-xs font-mono text-steel mt-3">
                <span>₹{m.daily_amount}/day</span>
                <span className={m.active ? "text-sage" : "text-brick"}>{m.active ? "Active" : "Inactive"}</span>
              </div>
              {m.khata_eligible && (
                <p className="text-[10px] font-mono uppercase text-turmeric-dark mt-1">Khata enabled</p>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <MemberModal
          initial={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSave={async (data) => {
            const res = await upsertMember(data);
            setModal(null);
            if (res.ok) refresh();
            else alert(res.error || "Couldn't save member.");
          }}
        />
      )}
    </div>
  );
}

function MemberModal({ initial, onClose, onSave }) {
  const [memberNumber, setMemberNumber] = useState(initial?.member_number ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [dailyAmount, setDailyAmount] = useState(initial?.daily_amount ?? 250);
  const [active, setActive] = useState(initial?.active ?? true);
  const [role, setRole] = useState(initial?.role ?? "member");
  const [khataEligible, setKhataEligible] = useState(initial?.khata_eligible ?? false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!memberNumber || !email.trim()) return;
    setSaving(true);
    await onSave({
      id: initial?.id,
      memberNumber: Number(memberNumber),
      name,
      email: email.trim(),
      password: password || undefined,
      dailyAmount: Number(dailyAmount),
      active,
      role,
      khataEligible,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center p-4 z-50">
      <div className="bg-surface rounded-2xl max-w-sm w-full p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-chalk text-xl">{initial ? "Edit member" : "Add member"}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-paper2">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-mono uppercase text-steel">Member number</label>
            <input
              type="number"
              min="1"
              value={memberNumber}
              onChange={(e) => setMemberNumber(e.target.value)}
              className="mt-1 w-full px-3.5 py-2 rounded-xl border border-ink/15 outline-none focus:border-turmeric"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-mono uppercase text-steel">Name (optional)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full px-3.5 py-2 rounded-xl border border-ink/15 outline-none focus:border-turmeric"
            />
          </div>
          <div>
            <label className="text-xs font-mono uppercase text-steel">Email (login + morning check-in mail)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full px-3.5 py-2 rounded-xl border border-ink/15 outline-none focus:border-turmeric"
              placeholder="member@gmail.com"
              required
            />
          </div>
          <div>
            <label className="text-xs font-mono uppercase text-steel">
              {initial ? "New password (leave blank to keep current)" : "Password"}
            </label>
            <PasswordInput className="mt-1" value={password} onChange={(e) => setPassword(e.target.value)} required={!initial} />
          </div>
          <div>
            <label className="text-xs font-mono uppercase text-steel">Daily amount (₹)</label>
            <input
              type="number"
              min="0"
              value={dailyAmount}
              onChange={(e) => setDailyAmount(e.target.value)}
              className="mt-1 w-full px-3.5 py-2 rounded-xl border border-ink/15 outline-none focus:border-turmeric"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
          </label>
          <div>
            <label className="text-xs font-mono uppercase text-steel">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 w-full px-3.5 py-2 rounded-xl border border-ink/15 outline-none focus:border-turmeric bg-surface"
            >
              <option value="member">Member</option>
              <option value="hr">HR — attendance/analytics view + password resets</option>
              <option value="fullaccess">Full Access — sees everything you see</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={khataEligible} onChange={(e) => setKhataEligible(e.target.checked)} />
            Allow Khata (credit tab) at checkout
          </label>
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink font-semibold py-2.5 rounded-full transition flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            Save
          </button>
        </form>
      </div>
    </div>
  );
}
