// =========================================================================
// daily-checkin-email — Supabase Edge Function
// =========================================================================
// Runs every morning (scheduled via Supabase Cron — see README).
// 1. Calls create_daily_checkins() with the SERVICE ROLE key — this creates
//    today's pending check-in row (with a secret token) for every active
//    member who has an email.
// 2. Emails each of them: "Are you coming to office today?" with two
//    buttons — YES and NO. YES charges that member their daily amount
//    (₹250 by default) by recording attendance for today.
//
// Required secrets (Supabase Dashboard → Edge Functions → Secrets):
//   GMAIL_USER          — the Gmail address you're sending FROM
//   GMAIL_APP_PASSWORD  — App Password for that Gmail account
//                          (see supabase/functions/_shared/email.ts)
//   APP_URL             — your deployed app, e.g.
//                          https://canteen-app-pi.vercel.app
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

    const APP_URL = (Deno.env.get("APP_URL") || "").replace(/\/$/, "");

    if (!APP_URL) {
      return json({ error: "Set APP_URL secret first (see README)." }, 500);
    }

    // Create today's pending check-ins and get everyone who needs an email.
    const { data: rows, error } = await supabase.rpc("create_daily_checkins");
    if (error) return json({ error: error.message }, 500);

    let sent = 0;
    const failures: string[] = [];

    for (const r of rows ?? []) {
      const yesUrl = `${APP_URL}/checkin/${r.token}?answer=yes`;
      const noUrl = `${APP_URL}/checkin/${r.token}?answer=no`;

      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:12px">
          <h2 style="margin:0 0 4px">Good morning, ${escapeHtml(r.member_name)}! 🍱</h2>
          <p style="color:#555;margin:0 0 16px">${escapeHtml(r.company_name)} · Member #${r.member_number}</p>
          <p style="font-size:16px"><b>Are you coming to the office today?</b></p>
          <p style="color:#555;font-size:14px">If yes, ₹${r.daily_amount} will be recorded as today's canteen collection for you.</p>
          <div style="margin:24px 0">
            <a href="${yesUrl}" style="background:#4C7A64;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:bold;margin-right:12px">✅ Yes, I'm coming</a>
            <a href="${noUrl}" style="background:#eee;color:#333;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:bold">❌ Not today</a>
          </div>
          <p style="color:#999;font-size:12px">This link works only for today. If the buttons don't work, open: ${yesUrl}</p>
        </div>`;

      const result = await sendEmail({
        to: r.email,
        subject: `Coming to office today? — ${r.company_name}`,
        html,
      });

      if (result.ok) sent++;
      else failures.push(`${r.email}: ${result.error}`);
    }

    return json({ pending: rows?.length ?? 0, sent, failures });
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
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}
