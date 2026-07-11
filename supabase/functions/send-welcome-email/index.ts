// =========================================================================
// send-welcome-email — Supabase Edge Function
// =========================================================================
// Called from the browser right after member_self_signup() succeeds.
// Sends a welcome email to the member's OWN entered email address (not a
// fixed address) confirming their ₹250 signup bonus.
//
// This does NOT trust the client for the bonus amount or company name in
// any way that matters — it's just email copy. The wallet credit itself
// already happened server-side inside member_self_signup(). If this email
// fails to send, the signup still succeeds; the wallet bonus is not
// affected either way.
//
// Required secrets (Supabase Dashboard → Edge Functions → Secrets):
//   GMAIL_USER          — the Gmail address you're sending FROM
//   GMAIL_APP_PASSWORD  — App Password for that Gmail account
//                          (see supabase/functions/_shared/email.ts)
//
// Deploy with JWT verification OFF (members aren't logged in with a
// Supabase auth session — they use their own token system):
//   supabase functions deploy send-welcome-email --no-verify-jwt
// =========================================================================

import { sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WELCOME_BONUS = 250;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    if (req.method !== "POST") return json({ error: "POST only" }, 405);

    const { email, name, companyName, memberNumber } = await req.json().catch(() => ({}));
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return json({ error: "A valid email is required" }, 400);
    }

    const displayName = escapeHtml(name?.trim() || "there");
    const company = escapeHtml(companyName?.trim() || "your company canteen");

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:460px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:12px">
        <h2 style="margin:0 0 4px">Welcome to ${company} 🍱</h2>
        <p style="color:#555;margin:0 0 16px">Hi ${displayName}${memberNumber ? ` (Member #${memberNumber})` : ""},</p>
        <p style="font-size:14px;color:#333">Your account is ready. As a welcome gift, we've added a signup bonus to your canteen wallet:</p>
        <div style="font-size:28px;font-weight:bold;text-align:center;background:#faf9f6;border-radius:12px;padding:18px 0;margin:20px 0">
          ₹${WELCOME_BONUS} credited
        </div>
        <p style="font-size:14px;color:#333">Log in any time to check your balance, mark daily attendance, and see your order history.</p>
        <p style="color:#999;font-size:12px;margin-top:20px">If you didn't create this account, you can safely ignore this email.</p>
      </div>`;

    const result = await sendEmail({
      to: email,
      subject: `Welcome to ${companyName?.trim() || "the canteen"} — ₹${WELCOME_BONUS} added to your wallet`,
      html,
    });

    if (!result.ok) return json({ error: result.error }, 500);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}
