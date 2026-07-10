import React, { useEffect, useState } from "react";
import { LifeBuoy, KeyRound, CheckCircle2, RotateCcw } from "lucide-react";
import { useStore } from "../lib/StoreContext";

// Seller's Tickets tab: support tickets raised by members (or anonymously via
// the Forgot Password page). password_reset tickets get a hint pointing the
// seller to the Members tab, where they can set a new password.
export default function TicketsManager() {
  const { listTickets, setTicketStatus } = useStore();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

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
              className={`bg-white rounded-2xl border p-4 ${
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
                </div>
                {t.status === "open" ? (
                  <button
                    onClick={() => setTicketStatus(t.id, "resolved").then(refresh)}
                    className="shrink-0 flex items-center gap-1.5 text-xs font-semibold bg-sage/15 text-sage hover:bg-sage/25 px-3 py-1.5 rounded-full"
                  >
                    <CheckCircle2 size={13} /> Resolve
                  </button>
                ) : (
                  <button
                    onClick={() => setTicketStatus(t.id, "open").then(refresh)}
                    className="shrink-0 flex items-center gap-1.5 text-xs font-medium border border-ink/15 hover:bg-paper2 px-3 py-1.5 rounded-full"
                  >
                    <RotateCcw size={12} /> Reopen
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
