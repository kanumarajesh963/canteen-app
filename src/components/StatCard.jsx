import React from "react";

export default function StatCard({ label, value, sub, tone = "sage", icon: Icon }) {
  const toneClasses = {
    sage: "text-sage bg-sage/10",
    brick: "text-brick bg-brick/10",
    turmeric: "text-turmeric-dark bg-turmeric/15",
    board: "text-board bg-board/10",
  };
  return (
    <div className="bg-white rounded-2xl border border-ink/5 p-4 sm:p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-wide text-steel">{label}</span>
        {Icon && (
          <span className={`w-8 h-8 rounded-full flex items-center justify-center ${toneClasses[tone]}`}>
            <Icon size={16} />
          </span>
        )}
      </div>
      <span className="text-2xl sm:text-3xl font-bold font-mono text-ink">{value}</span>
      {sub && <span className="text-xs text-steel">{sub}</span>}
    </div>
  );
}
