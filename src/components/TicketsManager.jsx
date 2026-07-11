import React, { useEffect, useState } from "react";
import { LifeBuoy, KeyRound, CheckCircle2, RotateCcw, MessageSquareReply, X, Loader2 } from "lucide-react";
import { useStore } from "../lib/StoreContext";

// Seller's Tickets tab: support tickets raised by members (or anonymously via
// the Forgot Password page). password_reset tickets get a hint pointing the
// seller to the Members tab, where they can set a new password. "Reply"
// opens a modal where the seller can write a response — sending it also
// marks the ticket resolved and the reply becomes visible to the member on
// their own home page.
export default function TicketsManager() {
  const { listTickets, setTicketStatus, replyTicket } = useStore();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyTarget, setReplyTarget] = useState(null); // ticket being replied to

  const refresh = async () => {
    setLoading(true);
    setTickets(await listTickets());
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = tickets.filter((t) => t.status === "open");
  const resolved = tickets.filter((t) => t.status === "resolved");

  return (
    <div>
      <p className="text-steel text-sm mb-4">
        {open.length} open ticket{open.length === 1 ? "" : "s"}. Password-reset requests can be handled from the{" "}
        <b>Members</b> tab (edit the member → set a new password) and then marked resolved here.
      </p>

      {loading ? (
        <p className="text-steel text-sm py-10 text-center">Loading…</p>
      ) : tickets.length === 0 ? (
        <p className="text-steel text-sm py-10 text-center">No tickets yet — members can raise them from their home page.</p>
      ) : (
        <div className="space-y-3">
          {[...open, ...resolved].map((t) => (
            <div
              key={t.id}
              className={`bg-surface rounded-2xl border p-4 ${
                t.status === "open"
                  ? t.type === "password_reset"
                    ? "border-turmeric/50"
                    : "border-ink/10"
                  : "border-ink/5 opacity-60"
              }`}
            >
              <div className="flex items-start gap-3">
                {t.type === "password_reset" ? (
                  <KeyRound size={17} className="text-turmeric-dark shrink-0 mt-0.5" />
                ) : (
                  <LifeBuoy size={17} className="text-brick shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{t.subject}</p>
                    {t.type === "password_reset" && (
                      <span className="text-[10px] font-mono uppercase bg-turmeric/20 text-turmeric-dark px-2 py-0.5 rounded-full">
                        password reset
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full ${
                        t.status === "open" ? "bg-brick/10 text-brick" : "bg-sage/15 text-sage"
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                  {t.message && <p className="text-sm text-steel mt-1 whitespace-pre-wrap">{t.message}</p>}
                  <p className="text-[11px] font-mono text-steel mt-2">
                    {t.name || "Anonymous"}
                    {t.contact ? ` · ${t.contact}` : ""} ·{" "}
                    {new Date(t.created_at).toLocaleString("en-IN", {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                  {t.reply && (
                    <div className="mt-3 bg-paper2 rounded-xl p-3">
                      <p className="text-[10px] font-mono uppercase text-steel mb-1">Your reply</p>
                      <p className="text-sm whitespace-pre-wrap">{t.reply}</p>
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex flex-col items-end gap-2">
                  <button
                    onClick={() => setReplyTarget(t)}
                    className="flex items-center gap-1.5 text-xs font-semibold bg-board/5 text-ink hover:bg-board/10 px-3 py-1.5 rounded-full"
                  >
                    <MessageSquareReply size={13} /> {t.reply ? "Edit reply" : "Reply"}
                  </button>
                  {t.status === "open" ? (
                    <button
                      onClick={() => setTicketStatus(t.id, "resolved").then(refresh)}
                      className="flex items-center gap-1.5 text-xs font-semibold bg-sage/15 text-sage hover:bg-sage/25 px-3 py-1.5 rounded-full"
                    >
                      <CheckCircle2 size={13} /> Resolve
                    </button>
                  ) : (
                    <button
                      onClick={() => setTicketStatus(t.id, "open").then(refresh)}
                      className="flex items-center gap-1.5 text-xs font-medium border border-ink/15 hover:bg-paper2 px-3 py-1.5 rounded-full"
                    >
                      <RotateCcw size={12} /> Reopen
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {replyTarget && (
        <ReplyModal
          ticket={replyTarget}
          onClose={() => setReplyTarget(null)}
          replyTicket={replyTicket}
          onSent={refresh}
        />
      )}
    </div>
  );
}

function ReplyModal({ ticket, onClose, replyTicket, onSent }) {
  const [reply, setReply] = useState(ticket.reply || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!reply.trim()) {
      setError("Write a reply first.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await replyTicket(ticket.id, reply.trim());
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSent();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center p-4 z-50">
      <div className="bg-surface rounded-2xl max-w-md w-full p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-chalk text-xl">Reply to ticket</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-paper2">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-steel mb-4">
          {ticket.subject} — {ticket.name || "Anonymous"}{ticket.contact ? ` (${ticket.contact})` : ""}
        </p>
        {ticket.message && (
          <div className="bg-paper2 rounded-xl p-3 mb-4">
            <p className="text-sm whitespace-pre-wrap text-steel">{ticket.message}</p>
          </div>
        )}
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-mono uppercase text-steel">Your reply</label>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={5}
              autoFocus
              className="mt-1 w-full px-3.5 py-2 rounded-xl border border-ink/15 outline-none focus:border-turmeric resize-none"
              placeholder="Type your response to the member…"
            />
          </div>
          {error && <p className="text-brick text-sm">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink font-semibold py-2.5 rounded-full inline-flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            Send reply &amp; mark resolved
          </button>
        </form>
      </div>
    </div>
  );
}
