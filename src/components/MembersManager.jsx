import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, X } from "lucide-react";
import { useStore } from "../lib/StoreContext";

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
          {members.length} member{members.length === 1 ? "" : "s"}. Give each one a number, username and
          password — that number is what you'll type in Attendance each day.
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
            <div key={m.id} className={`bg-white rounded-2xl border p-4 ${m.active ? "border-ink/5" : "border-brick/30 opacity-60"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm">
                    #{m.member_number} · {m.name || "(no name)"}
                  </p>
                  <p className="text-xs text-steel font-mono">@{m.username}</p>
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
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [dailyAmount, setDailyAmount] = useState(initial?.daily_amount ?? 250);
  const [active, setActive] = useState(initial?.active ?? true);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!memberNumber || !username) return;
    setSaving(true);
    await onSave({
      id: initial?.id,
      memberNumber: Number(memberNumber),
      name,
      username,
      password: password || undefined,
      dailyAmount: Number(dailyAmount),
      active,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-sm w-full p-5">
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
            <label className="text-xs font-mono uppercase text-steel">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full px-3.5 py-2 rounded-xl border border-ink/15 outline-none focus:border-turmeric"
              required
            />
          </div>
          <div>
            <label className="text-xs font-mono uppercase text-steel">
              {initial ? "New password (leave blank to keep current)" : "Password"}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full px-3.5 py-2 rounded-xl border border-ink/15 outline-none focus:border-turmeric"
              required={!initial}
            />
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
