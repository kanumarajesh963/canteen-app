import React, { useEffect, useState } from "react";
import { Users, LogIn, CalendarDays, Sigma, X, Lock } from "lucide-react";
import { useStore } from "../lib/StoreContext";
import StatCard from "./StatCard";

// Seller's Logins tab: their own company's member-login stats, plus a
// per-company table ("for every company, how many people logged in").
// Counts only — no names or details from other companies are exposed.
export default function LoginStats() {
  const { loginStats, allCompanyLoginCounts, memberLoginDetails, company } = useStore();
  const [stats, setStats] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [members, setMembers] = useState([]);
  const [otherCompanyNote, setOtherCompanyNote] = useState(false);

  useEffect(() => {
    (async () => {
      const [s, c] = await Promise.all([loginStats(), allCompanyLoginCounts()]);
      setStats(s);
      setCompanies(c);
      setLoading(false);
    })();
  }, [loginStats, allCompanyLoginCounts]);

  const openOwnCompanyDetails = async () => {
    setDetailOpen(true);
    setDetailLoading(true);
    const rows = await memberLoginDetails();
    setMembers(rows);
    setDetailLoading(false);
  };

  const handleRowClick = (slug) => {
    if (slug === company.slug) {
      openOwnCompanyDetails();
    } else {
      setOtherCompanyNote(true);
      setTimeout(() => setOtherCompanyNote(false), 3500);
    }
  };

  if (loading) return <p className="text-steel text-sm py-10 text-center">Loading…</p>;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-mono uppercase text-steel mb-2">{company.name} — member logins</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label="Logins today" value={stats?.today_logins ?? 0} icon={LogIn} tone="sage" />
          <StatCard label="Unique members today" value={stats?.today_unique_members ?? 0} icon={Users} tone="turmeric" />
          <StatCard label="This month" value={stats?.month_logins ?? 0} icon={CalendarDays} tone="board" />
          <StatCard label="All time" value={stats?.total_logins ?? 0} icon={Sigma} tone="sage" />
        </div>
      </div>

      <div className="bg-surface rounded-2xl border border-ink/5 p-4 sm:p-5">
        <h3 className="font-semibold mb-1">Logins per company</h3>
        <p className="text-xs text-steel mb-4">
          How many people logged in, for every company on this deployment (counts only).
          Click your own company's row to see per-member details.
        </p>
        {otherCompanyNote && (
          <div className="mb-3 text-xs bg-ink/5 border border-ink/10 rounded-lg px-3 py-2 flex items-center gap-2">
            <Lock size={13} className="text-steel shrink-0" />
            <span className="text-steel">
              Only counts are shared for other companies — individual member details stay private to each seller.
            </span>
          </div>
        )}
        {companies.length === 0 ? (
          <p className="text-steel text-sm py-6 text-center">No companies found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-mono uppercase text-steel border-b border-ink/10">
                  <th className="py-2 pr-3">Company</th>
                  <th className="py-2 pr-3 text-right">Active members</th>
                  <th className="py-2 pr-3 text-right">Logins today</th>
                  <th className="py-2 pr-3 text-right">Unique today</th>
                  <th className="py-2 text-right">Logins total</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr
                    key={c.company_slug}
                    onClick={() => handleRowClick(c.company_slug)}
                    className={`border-b border-ink/5 last:border-0 cursor-pointer hover:bg-ink/5 transition-colors ${
                      c.company_slug === company.slug ? "bg-turmeric/10" : ""
                    }`}
                  >
                    <td className="py-2.5 pr-3">
                      <span className="font-medium">{c.company_name}</span>{" "}
                      <span className="text-steel font-mono text-xs">/{c.company_slug}</span>
                      {c.company_slug === company.slug && (
                        <span className="ml-2 text-[10px] font-mono uppercase bg-turmeric/30 px-1.5 py-0.5 rounded-full">you</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono">{c.members_total}</td>
                    <td className="py-2.5 pr-3 text-right font-mono">{c.logins_today}</td>
                    <td className="py-2.5 pr-3 text-right font-mono">{c.unique_members_today}</td>
                    <td className="py-2.5 text-right font-mono font-semibold">{c.logins_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailOpen && (
        <div
          className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-4"
          onClick={() => setDetailOpen(false)}
        >
          <div
            className="bg-surface rounded-2xl border border-ink/10 max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink/10">
              <div>
                <h3 className="font-semibold">{company.name} — member login details</h3>
                <p className="text-xs text-steel">Last login, today's logins, and all-time logins per member.</p>
              </div>
              <button onClick={() => setDetailOpen(false)} className="p-1.5 rounded-lg hover:bg-ink/5">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              {detailLoading ? (
                <p className="text-steel text-sm py-10 text-center">Loading…</p>
              ) : members.length === 0 ? (
                <p className="text-steel text-sm py-10 text-center">No members yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-mono uppercase text-steel border-b border-ink/10">
                      <th className="py-2 pr-3">#</th>
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Email</th>
                      <th className="py-2 pr-3">Last login</th>
                      <th className="py-2 pr-3 text-right">Today</th>
                      <th className="py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.member_id} className="border-b border-ink/5 last:border-0">
                        <td className="py-2 pr-3 font-mono text-steel">{m.member_number}</td>
                        <td className="py-2 pr-3">
                          {m.member_name || "—"}
                          {!m.active && (
                            <span className="ml-2 text-[10px] font-mono uppercase bg-brick/10 text-brick px-1.5 py-0.5 rounded-full">
                              inactive
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-steel">{m.email || "—"}</td>
                        <td className="py-2 pr-3 text-steel">
                          {m.last_login ? new Date(m.last_login).toLocaleString() : "Never"}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono">{m.logins_today}</td>
                        <td className="py-2 text-right font-mono font-semibold">{m.logins_total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
