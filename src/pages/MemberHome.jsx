import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { CalendarCheck, LogOut, IndianRupee } from "lucide-react";
import { useStore } from "../lib/StoreContext";
import StatCard from "../components/StatCard";

export default function MemberHome() {
  const { isMember, memberInfo, logoutMember, myAttendance, company } = useStore();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isMember) myAttendance().then((r) => { setRecords(r); setLoading(false); });
  }, [isMember, myAttendance]);

  if (!isMember) return <Navigate to="/member/login" replace />;

  const now = new Date();
  const thisMonthTotal = records
    .filter((r) => {
      const d = new Date(r.visit_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, r) => s + Number(r.amount), 0);
  const allTimeTotal = records.reduce((s, r) => s + Number(r.amount), 0);

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

      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
        <StatCard label="This month" value={`₹${thisMonthTotal}`} icon={IndianRupee} tone="sage" />
        <StatCard label="All time" value={`₹${allTimeTotal}`} icon={CalendarCheck} tone="turmeric" />
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
    </div>
  );
}
