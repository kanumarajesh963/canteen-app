import React, { useEffect, useState } from "react";
import { Users, LogIn, CalendarDays, Sigma } from "lucide-react";
import { useStore } from "../lib/StoreContext";
import StatCard from "./StatCard";

// Seller's Logins tab: their own company's member-login stats, plus a
// per-company table ("for every company, how many people logged in").
// Counts only — no names or details from other companies are exposed.
export default function LoginStats() {
  const { loginStats, allCompanyLoginCounts, company } = useStore();
  const [stats, setStats] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [s, c] = await Promise.all([loginStats(), allCompanyLoginCounts()]);
      setStats(s);
      setCompanies(c);
      setLoading(false);
    })();
  }, [loginStats, allCompanyLoginCounts]);

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

      <div className="bg-white rounded-2xl border border-ink/5 p-4 sm:p-5">
        <h3 className="font-semibold mb-1">Logins per company</h3>
        <p className="text-xs text-steel mb-4">
          How many people logged in, for every company on this deployment (counts only).
        </p>
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
                    className={`border-b border-ink/5 last:border-0 ${c.company_slug === company.slug ? "bg-turmeric/10" : ""}`}
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
    </div>
  );
}
