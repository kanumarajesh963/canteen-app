// =========================================================================
// khata-digest-email — Supabase Edge Function
// =========================================================================
// Runs on a schedule (Supabase Cron — see README):
//   • day-end   → call with { "period": "day" }   e.g. every night at 9pm
//   • month-end → call with { "period": "month" } e.g. 11:55pm on the 28th+
//
// Groups today's/this month's *unsettled* khata entries by company, and
// emails each seller (companies.seller_username) a summary of who took
// what on credit. Same Gmail SMTP pattern as daily-checkin-email.
//
// Required secrets (Supabase Dashboard → Edge Functions → Secrets):
//   GMAIL_USER, GMAIL_APP_PASSWORD — see supabase/functions/_shared/email.ts
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// =========================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let period = "day";
    try {
      const body = await req.json();
      if (body?.period === "month") period = "month";
    } catch {
      // no body / not JSON — default to "day"
    }

    const { data: rows, error } = await supabase.rpc("khata_digest_rows", { p_period: period });
    if (error) return json({ error: error.message }, 500);

    // Group flat rows by company_id.
    const byCompany = new Map<string, { name: string; email: string; rows: any[]; total: number }>();
    for (const r of rows ?? []) {
      if (!byCompany.has(r.company_id)) {
        byCompany.set(r.company_id, { name: r.company_name, email: r.seller_email, rows: [], total: 0 });
      }
      const g = byCompany.get(r.company_id)!;
      g.rows.push(r);
      g.total += Number(r.line_total);
    }

    let sent = 0;
    const failures: string[] = [];
    const label = period === "month" ? "This month's" : "Today's";

    for (const [, g] of byCompany) {
      if (!g.email || g.rows.length === 0) continue;

      const lineItems = g.rows
        .map(
          (r) =>
            `<tr>
              <td style="padding:6px 8px;border-bottom:1px solid #eee">#${r.member_number} · ${escapeHtml(r.member_name)}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(r.product_name)} × ${r.qty}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">₹${r.line_total}</td>
            </tr>`
        )
        .join("");

      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:12px">
          <h2 style="margin:0 0 4px">📒 ${label} khata summary — ${escapeHtml(g.name)}</h2>
          <p style="color:#555;margin:0 0 16px">${g.rows.length} khata entr${g.rows.length === 1 ? "y" : "ies"} · ₹${g.total} total on credit</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <thead>
              <tr style="text-align:left;color:#888;font-size:11px;text-transform:uppercase">
                <th style="padding:6px 8px">Member</th><th style="padding:6px 8px">Item</th><th style="padding:6px 8px;text-align:right">Amount</th>
              </tr>
            </thead>
            <tbody>${lineItems}</tbody>
          </table>
          <p style="color:#999;font-size:12px;margin-top:16px">Settle entries any time from your Khata tab in the dashboard.</p>
        </div>`;

      const result = await sendEmail({
        to: g.email,
        subject: `${label} khata: ₹${g.total} across ${g.rows.length} entr${g.rows.length === 1 ? "y" : "ies"} — ${g.name}`,
        html,
      });

      if (result.ok) sent++;
      else failures.push(`${g.email}: ${result.error}`);
    }

    return json({ period, companies: byCompany.size, sent, failures });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}
