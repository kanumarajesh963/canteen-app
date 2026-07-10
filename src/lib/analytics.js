function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isSameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
function isSameYear(a, b) {
  return a.getFullYear() === b.getFullYear();
}

export function summarize(orders, refDate = new Date()) {
  const today = orders.filter((o) => isSameDay(new Date(o.created_at), refDate));
  const month = orders.filter((o) => isSameMonth(new Date(o.created_at), refDate));
  const year = orders.filter((o) => isSameYear(new Date(o.created_at), refDate));

  const totalOf = (list) => list.reduce((s, o) => s + o.total, 0);
  const profitOf = (list) => list.reduce((s, o) => s + o.profit, 0);
  const costOf = (list) => totalOf(list) - profitOf(list);

  return {
    today: { revenue: totalOf(today), profit: profitOf(today), cost: costOf(today), orders: today.length },
    month: { revenue: totalOf(month), profit: profitOf(month), cost: costOf(month), orders: month.length },
    year: { revenue: totalOf(year), profit: profitOf(year), cost: costOf(year), orders: year.length },
    allTime: { revenue: totalOf(orders), profit: profitOf(orders), cost: costOf(orders), orders: orders.length },
  };
}

// Returns last N days of revenue/profit for the trend chart
export function dailySeries(orders, days = 14) {
  const map = new Map();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { date: key, label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), revenue: 0, profit: 0 });
  }
  orders.forEach((o) => {
    const key = new Date(o.created_at).toISOString().slice(0, 10);
    if (map.has(key)) {
      const entry = map.get(key);
      entry.revenue += o.total;
      entry.profit += o.profit;
    }
  });
  return Array.from(map.values());
}

// Monthly totals for the current year, for a year-view bar chart
export function monthlySeries(orders, year = new Date().getFullYear()) {
  const months = Array.from({ length: 12 }, (_, i) => ({
    label: new Date(year, i, 1).toLocaleDateString("en-IN", { month: "short" }),
    revenue: 0,
    profit: 0,
  }));
  orders.forEach((o) => {
    const d = new Date(o.created_at);
    if (d.getFullYear() === year) {
      months[d.getMonth()].revenue += o.total;
      months[d.getMonth()].profit += o.profit;
    }
  });
  return months;
}

export function topSellers(orders, limit = 6) {
  const map = new Map();
  orders.forEach((o) => {
    o.items.forEach((it) => {
      const cur = map.get(it.productId) || { name: it.name, emoji: it.emoji, qty: 0, revenue: 0 };
      cur.qty += it.qty;
      cur.revenue += it.price * it.qty;
      map.set(it.productId, cur);
    });
  });
  return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, limit);
}

export function categoryBreakdown(orders, products) {
  const catById = Object.fromEntries(products.map((p) => [p.id, p.category]));
  const map = new Map();
  orders.forEach((o) => {
    o.items.forEach((it) => {
      const cat = catById[it.productId] || "Other";
      map.set(cat, (map.get(cat) || 0) + it.price * it.qty);
    });
  });
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}
