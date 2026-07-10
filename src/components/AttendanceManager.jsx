import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { IndianRupee, TrendingUp, Users, CheckCircle2, Loader2 } from "lucide-react";
import { useStore } from "../lib/StoreContext";
import { attendanceSummary, dailyAttendanceSeries, monthlyAttendanceSeries, yearlyAttendanceSeries } from "../lib/attendanceAnalytics";
import StatCard from "./StatCard";

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function AttendanceManager() {
  const { listMembers, markAttendance, getAttendanceRecords, attendanceForDate } = useStore();
  const [members, setMembers] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState(todayStr());
  const [numbersInput, setNumbersInput] = useState("");
  const [marking, setMarking] = useState(false);
  const [result, setResult] = useState(null);
  const [todayRoster, setTodayRoster] = useState([]);
  const [range, setRange] = useState("day"); // day | month | year

  const loadAll = async () => {
    setLoading(true);
    const [m, r] = await Promise.all([listMembers(), getAttendanceRecords(800)]);
    setMembers(m);
    setRecords(r);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    attendanceForDate(date).then(setTodayRoster);
  }, [date, attendanceForDate, records]);

  const submitAttendance = async (e) => {
    e.preventDefault();
    const nums = numbersInput
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n));
    if (nums.length === 0) return;
    setMarking(true);
    const res = await markAttendance(date, nums);
    setMarking(false);
    setResult(res);
    if (res.ok) {
      setNumbersInput("");
      loadAll();
    }
  };

  const summary = useMemo(() => attendanceSummary(records, members, new Date(date)), [records, members, date]);
  const daily = useMemo(() => dailyAttendanceSeries(records, members, 14), [records, members]);
  const monthly = useMemo(() => monthlyAttendanceSeries(records, members), [records, members]);
  const yearly = useMemo(() => yearlyAttendanceSeries(records, members), [records, members]);
  const chartData = range === "day" ? daily : range === "month" ? monthly : yearly;

  if (loading) return <p className="text-steel text-sm py-10 text-center">Loading…</p>;

  return (
    <div className="space-y-6">
      {members.length === 0 && (
        <div className="bg-turmeric/10 border border-turmeric/30 text-turmeric-dark rounded-2xl p-4 text-sm">
          No members yet — add members in the <b>Members</b> tab first, then come back here to mark attendance.
        </div>
      )}

      {/* Mark attendance */}
      <div className="bg-white rounded-2xl border border-ink/5 p-4 sm:p-5">
        <h3 className="font-semibold mb-3">Mark attendance</h3>
        <form onSubmit={submitAttendance} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-mono uppercase text-steel">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={todayStr()}
              className="mt-1 px-3.5 py-2 rounded-xl border border-ink/15 outline-none focus:border-turmeric font-mono text-sm"
            />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs font-mono uppercase text-steel">Member numbers who came today</label>
            <input
              value={numbersInput}
              onChange={(e) => setNumbersInput(e.target.value)}
              placeholder="e.g. 1,5,10,15,25,30,50"
              className="mt-1 w-full px-3.5 py-2 rounded-xl border border-ink/15 outline-none focus:border-turmeric font-mono text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={marking || !numbersInput.trim()}
            className="bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink font-semibold px-5 py-2.5 rounded-full transition flex items-center gap-2"
          >
            {marking && <Loader2 size={16} className="animate-spin" />}
            Mark present
          </button>
        </form>
        {result && (
          <p className="text-xs font-mono text-steel mt-3">
            ✅ Charged {result.marked} member{result.marked === 1 ? "" : "s"}
            {result.already > 0 ? ` · ${result.already} already marked today` : ""}
            {result.unknown > 0 ? ` · ${result.unknown} unknown number(s) skipped` : ""}
          </p>
        )}
      </div>

      {/* Today's stat cards */}
      <div>
        <p className="text-xs font-mono uppercase text-steel mb-2">{date === todayStr() ? "Today" : date}</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label="Potential (all present)" value={`₹${summary.potential}`} icon={Users} tone="board" />
          <StatCard label="Collected" value={`₹${summary.collected}`} icon={IndianRupee} tone="sage" />
          <StatCard label="Profit (not paid out)" value={`₹${summary.profit}`} icon={TrendingUp} tone="turmeric" />
          <StatCard label="Present" value={`${summary.presentCount} / ${summary.totalMembers}`} icon={CheckCircle2} tone="sage" />
        </div>
      </div>

      {/* Who's marked for this date */}
      <div className="bg-white rounded-2xl border border-ink/5 p-4 sm:p-5">
        <h3 className="font-semibold mb-3">Roster for {date}</h3>
        {todayRoster.length === 0 ? (
          <p className="text-steel text-sm py-4 text-center">No members yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {todayRoster.map((r) => (
              <div
                key={r.member_number}
                className={`rounded-xl px-3 py-2 text-xs font-mono flex items-center justify-between ${
                  r.present ? "bg-sage/10 text-sage" : "bg-paper2 text-steel"
                }`}
              >
                <span>#{r.member_number}</span>
                <span>{r.present ? `₹${r.amount}` : "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="bg-white rounded-2xl border border-ink/5 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold">Collected vs profit</h3>
          <div className="flex gap-2">
            {[
              ["day", "Day"],
              ["month", "Month"],
              ["year", "Year"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setRange(id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition ${
                  range === id ? "bg-board text-paper" : "border border-ink/15 text-ink/70 hover:border-board"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ left: -20, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2B262015" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
            <YAxis tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
            <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #2B262015", fontFamily: "IBM Plex Mono", fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="collected" fill="#4C7A64" radius={[6, 6, 0, 0]} name="Collected" />
            <Bar dataKey="profit" fill="#E8A93B" radius={[6, 6, 0, 0]} name="Profit" />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-steel font-mono mt-3">
          Profit = potential (all active members × daily amount) − actually collected that period.
        </p>
      </div>
    </div>
  );
}
