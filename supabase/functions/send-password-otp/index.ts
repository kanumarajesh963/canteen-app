// =========================================================================
// send-password-otp — Supabase Edge Function
// =========================================================================
// Called directly from the browser (ForgotPassword page) with just an
// email address. Uses the SERVICE ROLE key to call generate_password_otp
// (which is deliberately locked to service_role — see schema.sql — so
// the browser can never fetch a code without going through this function
// and an actual email being sent). Always returns a generic "sent" style
// response whether or not the email exists, so this can't be used to
// check which emails are registered.
//
// Required secrets (Supabase Dashboard → Edge Functions → Secrets):
//   GMAIL_USER          — the Gmail address you're sending FROM
//   GMAIL_APP_PASSWORD  — App Password for that Gmail account
//                          (see supabase/functions/_shared/email.ts)
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Deploy with JWT verification OFF (this is a public, unauthenticated
// endpoint by design — members aren't logged in yet when they need this):
//   supabase functions deploy send-password-otp --no-verify-jwt
// =========================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // CORS preflight — the browser sends OPTIONS before the real POST.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    if (req.method !== "POST") return json({ error: "POST only" }, 405);

    const { email } = await req.json().catch(() => ({}));
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return json({ error: "A valid email is required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase.rpc("generate_password_otp", { p_email: email });
    if (error) return json({ error: error.message }, 500);

    const row = data?.[0];

    // Always respond the same way, whether or not the account exists —
    // don't let this endpoint be used to enumerate registered emails.
    if (!row?.found) {
      return json({ ok: true, message: "If that email is registered, a code has been sent." });
    }

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:12px">
        <h2 style="margin:0 0 4px">Reset your password</h2>
        <p style="color:#555;margin:0 0 16px">${escapeHtml(row.company_name)} · Hi ${escapeHtml(row.member_name)},</p>
        <p style="font-size:14px;color:#333">Use this code to reset your password. It expires in <b>10 minutes</b>.</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;background:#faf9f6;border-radius:12px;padding:20px 0;margin:20px 0">
          ${escapeHtml(row.otp_code)}
        </div>
        <p style="color:#999;font-size:12px">Didn't request this? You can safely ignore this email.</p>
      </div>`;

    const result = await sendEmail({
      to: email,
      subject: "Your password reset code",
      html,
    });

    if (!result.ok) return json({ error: result.error }, 500);
    return json({ ok: true, message: "If that email is registered, a code has been sent." });
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
