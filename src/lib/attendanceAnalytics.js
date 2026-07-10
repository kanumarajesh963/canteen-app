// Turns raw attendance rows ({ visit_date, amount, ... }) into chart-ready
// series. "potential" = what would've been collected if every active
// member showed up that day; "profit" = potential - collected, per the
// business rule: money not paid out for people who didn't come in.

function dailyCapacity(members) {
  return members.reduce((s, m) => s + Number(m.daily_amount || 250), 0);
}

export function attendanceSummary(records, members, refDate = new Date()) {
  const capacity = dailyCapacity(members);
  const key = refDate.toISOString().slice(0, 10);
  const todays = records.filter((r) => r.visit_date === key);
  const collected = todays.reduce((s, r) => s + Number(r.amount), 0);
  return {
    potential: capacity,
    collected,
    profit: capacity - collected,
    presentCount: todays.length,
    totalMembers: members.length,
  };
}

// Last N days of collected / potential / profit, for a day-view chart.
export function dailyAttendanceSeries(records, members, days = 14) {
  const capacity = dailyCapacity(members);
  const map = new Map();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, {
      date: key,
      label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      collected: 0,
      potential: capacity,
    });
  }
  records.forEach((r) => {
    if (map.has(r.visit_date)) map.get(r.visit_date).collected += Number(r.amount);
  });
  return Array.from(map.values()).map((e) => ({ ...e, profit: e.potential - e.collected }));
}

// Month-by-month totals for a given year, for a month-view chart.
export function monthlyAttendanceSeries(records, members, year = new Date().getFullYear()) {
  const capacity = dailyCapacity(members);
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const daysInMonth = new Date(year, i + 1, 0).getDate();
    // Don't count "potential" for days that haven't happened yet this year.
    const effectiveDays =
      year === now.getFullYear() && i === now.getMonth()
        ? now.getDate()
        : year === now.getFullYear() && i > now.getMonth()
        ? 0
        : daysInMonth;
    return {
      label: new Date(year, i, 1).toLocaleDateString("en-IN", { month: "short" }),
      collected: 0,
      potential: capacity * effectiveDays,
    };
  });
  records.forEach((r) => {
    const d = new Date(r.visit_date);
    if (d.getFullYear() === year) months[d.getMonth()].collected += Number(r.amount);
  });
  return months.map((m) => ({ ...m, profit: m.potential - m.collected }));
}

// Year-by-year totals for the last N years, for a year-view chart.
export function yearlyAttendanceSeries(records, members, yearsBack = 4) {
  const capacity = dailyCapacity(members);
  const now = new Date();
  const thisYear = now.getFullYear();
  const startOfYearDay = (y) => Math.floor((now - new Date(y, 0, 1)) / 86400000) + 1;
  const years = [];
  for (let y = thisYear - yearsBack + 1; y <= thisYear; y++) {
    const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const totalDays = isLeap ? 366 : 365;
    const effectiveDays = y === thisYear ? Math.min(startOfYearDay(y), totalDays) : totalDays;
    years.push({ label: String(y), year: y, collected: 0, potential: capacity * effectiveDays });
  }
  records.forEach((r) => {
    const d = new Date(r.visit_date);
    const y = years.find((x) => x.year === d.getFullYear());
    if (y) y.collected += Number(r.amount);
  });
  return years.map((y) => ({ ...y, profit: y.potential - y.collected }));
}
