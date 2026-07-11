// =========================================================================
// send-seller-signup-otp — Supabase Edge Function
// =========================================================================
// Called from the browser (Sellersignup page) with an email address, but
// ONLY when get_signup_settings().otp_required is true — the frontend skips
// this entirely otherwise. Uses the SERVICE ROLE key to call
// generate_signup_otp (locked to service_role — see schema.sql) and emails
// the resulting code.
//
// Required secrets (Supabase Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY — same key used by the other email functions
//   FROM_EMAIL     — e.g. "Canteen <onboarding@resend.dev>"
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Deploy with JWT verification OFF (no one is logged in yet at signup):
//   supabase functions deploy send-seller-signup-otp --no-verify-jwt
// =========================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
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

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "Canteen <onboarding@resend.dev>";

    const { data: otpCode, error } = await supabase.rpc("generate_signup_otp", { p_email: email });
    if (error) return json({ error: error.message }, 500);

    if (!RESEND_API_KEY) {
      return json({ error: "Set RESEND_API_KEY secret first (see README)." }, 500);
    }

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:12px">
        <h2 style="margin:0 0 4px">Verify your email</h2>
        <p style="color:#555;margin:0 0 16px">One more step to create your canteen.</p>
        <p style="font-size:14px;color:#333">Use this code to finish signing up. It expires in <b>10 minutes</b>.</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;background:#faf9f6;border-radius:12px;padding:20px 0;margin:20px 0">
          ${escapeHtml(String(otpCode))}
        </div>
        <p style="color:#999;font-size:12px">Didn't request this? You can safely ignore this email.</p>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: "Your verification code",
        html,
      }),
    });

    if (!res.ok) return json({ error: await res.text() }, 500);
    return json({ ok: true });
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
