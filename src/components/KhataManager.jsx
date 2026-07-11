import React, { useEffect, useState } from "react";
import { BookText, Plus, Loader2, X, CheckCircle2, IndianRupee } from "lucide-react";
import { useStore } from "../lib/StoreContext";

export default function KhataManager() {
  const { listMembers, khataSummary, khataEntriesFor, addKhataEntry, settleKhata } = useStore();
  const [members, setMembers] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [detailMember, setDetailMember] = useState(null); // member row from summary

  const refresh = async () => {
    setLoading(true);
    const [m, s] = await Promise.all([listMembers(), khataSummary()]);
    setMembers(m);
    setSummary(s);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalDue = summary.reduce((s, r) => s + Number(r.due_total), 0);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <div>
          <p className="text-steel text-sm">
            The village-shop tab — log what a member took on credit, settle it whenever they pay.
          </p>
          {summary.length > 0 && (
            <p className="text-sm font-semibold mt-1">
              {summary.length} member{summary.length === 1 ? "" : "s"} with an open tab · ₹{totalDue} total outstanding
            </p>
          )}
        </div>
        <button
          onClick={() => setAddModal(true)}
          className="flex items-center gap-1.5 bg-turmeric hover:bg-turmeric-dark text-onbrand text-sm font-semibold px-4 py-2 rounded-full shrink-0"
        >
          <Plus size={16} /> Add to khata
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
        </div>
      ) : summary.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-ink/5 p-8 text-center">
          <BookText size={28} className="text-steel mx-auto mb-2" />
          <p className="text-steel text-sm">No open khata entries. Everyone's settled up 🎉</p>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-ink/5 divide-y divide-ink/5">
          {summary.map((row) => (
            <button
              key={row.member_id}
              onClick={() => setDetailMember(row)}
              className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-paper2 transition"
            >
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">
                  {row.member_name || `Member #${row.member_number}`}
                </p>
                <p className="text-xs text-steel truncate">{row.member_email || `#${row.member_number}`}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono font-bold text-brick">₹{row.due_total}</p>
                <p className="text-[11px] text-steel">{row.due_count} item{row.due_count === 1 ? "" : "s"}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {addModal && (
        <AddKhataModal
          members={members}
          onClose={() => setAddModal(false)}
          addKhataEntry={addKhataEntry}
          onSaved={refresh}
        />
      )}

      {detailMember && (
        <KhataDetailModal
          member={detailMember}
          onClose={() => setDetailMember(null)}
          khataEntriesFor={khataEntriesFor}
          settleKhata={settleKhata}
          onSettled={refresh}
        />
      )}
    </div>
  );
}

function AddKhataModal({ members, onClose, addKhataEntry, onSaved }) {
  const [memberId, setMemberId] = useState("");
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState(1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!memberId) return setError("Pick a member.");
    if (!productName.trim()) return setError("Product name is required.");
    if (!price || Number(price) <= 0) return setError("Enter a valid price.");
    setSaving(true);
    setError("");
    const res = await addKhataEntry(memberId, productName.trim(), Number(price), Number(qty) || 1);
    setSaving(false);
    if (!res.ok) return setError(res.error);
    setDone(true);
    onSaved?.();
  };

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center p-4 z-50">
      <div className="bg-surface rounded-2xl max-w-sm w-full p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-chalk text-xl">Add to khata</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-paper2">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-4">
            <CheckCircle2 size={32} className="text-sage mx-auto mb-2" />
            <p className="font-semibold mb-1">Added to their tab ✅</p>
            <button onClick={onClose} className="bg-turmeric hover:bg-turmeric-dark text-onbrand font-semibold px-6 py-2 rounded-full mt-2">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="text-xs font-mono uppercase text-steel">Member</label>
              <select
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none bg-surface"
                required
                autoFocus
              >
                <option value="">Choose a member…</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    #{m.member_number} · {m.name || m.email || m.username}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-mono uppercase text-steel">Product</label>
              <input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
                placeholder="e.g. Samosa + chai"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-mono uppercase text-steel">Price (₹)</label>
                <div className="relative mt-1">
                  <IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel" />
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none font-mono"
                    placeholder="20"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-mono uppercase text-steel">Qty</label>
                <input
                  type="number"
                  min="1"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none font-mono"
                />
              </div>
            </div>
            {error && <p className="text-brick text-sm">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-onbrand font-semibold py-3 rounded-full flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Add to tab
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function KhataDetailModal({ member, onClose, khataEntriesFor, settleKhata, onSettled }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    khataEntriesFor(member.member_id).then((e) => {
      setEntries(e);
      setLoading(false);
    });
  }, [member.member_id, khataEntriesFor]);

  const doSettle = async () => {
    setSettling(true);
    await settleKhata(member.member_id);
    setSettling(false);
    setSettled(true);
    onSettled?.();
  };

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center p-4 z-50">
      <div className="bg-surface rounded-2xl max-w-sm w-full p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-chalk text-xl">{member.member_name || `Member #${member.member_number}`}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-paper2">
            <X size={18} />
          </button>
        </div>
        <p className="text-steel text-xs font-mono mb-4">{member.member_email}</p>

        {loading ? (
          <div className="space-y-2">
            <div className="skeleton h-8 w-full" />
            <div className="skeleton h-8 w-full" />
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-sm">
                <span className={`flex-1 ${e.status === "settled" ? "text-steel line-through" : ""}`}>
                  {e.product_name} {e.qty > 1 ? `×${e.qty}` : ""}
                </span>
                <span className="font-mono text-xs text-steel">
                  {new Date(e.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                </span>
                <span className={`font-mono font-semibold ${e.status === "settled" ? "text-steel" : "text-brick"}`}>
                  ₹{Number(e.price) * e.qty}
                </span>
              </div>
            ))}
          </div>
        )}

        {settled ? (
          <div className="text-center py-3">
            <CheckCircle2 size={28} className="text-sage mx-auto mb-2" />
            <p className="font-semibold text-sm mb-3">Tab settled ✅</p>
            <button onClick={onClose} className="bg-turmeric hover:bg-turmeric-dark text-onbrand font-semibold px-6 py-2 rounded-full">
              Done
            </button>
          </div>
        ) : (
          <button
            onClick={doSettle}
            disabled={settling}
            className="w-full bg-sage hover:bg-sage/90 disabled:opacity-60 text-white font-semibold py-3 rounded-full flex items-center justify-center gap-2"
          >
            {settling && <Loader2 size={16} className="animate-spin" />}
            Mark tab as paid (₹{member.due_total})
          </button>
        )}
      </div>
    </div>
  );
}
