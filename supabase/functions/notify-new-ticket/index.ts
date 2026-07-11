// =========================================================================
// notify-new-ticket — Supabase Edge Function
// =========================================================================
// Called automatically by a Postgres trigger (see supabase/schema.sql,
// "v6 add-on") every time a row is inserted into `tickets` — a member
// raising a support ticket, a password-reset request, or an anonymous
// forgot-password ticket. Emails the support inbox with the ticket ID,
// who raised it, and what it's about.
//
// Required secrets (Supabase Dashboard → Edge Functions → Secrets):
//   GMAIL_USER          — the Gmail address you're sending FROM
//   GMAIL_APP_PASSWORD  — App Password for that Gmail account
//                          (see supabase/functions/_shared/email.ts)
//   SUPPORT_EMAIL       — where new-ticket alerts go
//                          (e.g. "kanumarajesh143@gmail.com")
//
// This function trusts its caller (the Postgres trigger, authenticated with
// your service role key — see app_config in schema.sql) rather than end
// users, so it does not need SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY itself.
// =========================================================================

import { sendEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  try {
    const SUPPORT_EMAIL = Deno.env.get("SUPPORT_EMAIL") || "support@canteen.com";

    const body = await req.json().catch(() => ({}));
    const {
      ticket_id = "",
      company_name = "Unknown company",
      type = "general",
      subject = "(no subject)",
      message = "",
      name = "Anonymous",
      contact = "",
    } = body;

    const isPasswordReset = type === "password_reset";

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:12px">
        <h2 style="margin:0 0 4px">${isPasswordReset ? "🔑 Password reset" : "🛟 New support ticket"}</h2>
        <p style="color:#555;margin:0 0 16px">${escapeHtml(company_name)}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:4px 0;color:#888;width:110px">Ticket ID</td><td style="padding:4px 0;font-family:monospace">${escapeHtml(String(ticket_id))}</td></tr>
          <tr><td style="padding:4px 0;color:#888">From</td><td style="padding:4px 0">${escapeHtml(name)}${contact ? ` (${escapeHtml(contact)})` : ""}</td></tr>
          <tr><td style="padding:4px 0;color:#888">Subject</td><td style="padding:4px 0"><b>${escapeHtml(subject)}</b></td></tr>
        </table>
        ${message ? `<p style="margin-top:16px;white-space:pre-wrap;color:#333;font-size:14px;background:#faf9f6;padding:12px;border-radius:8px">${escapeHtml(message)}</p>` : ""}
        <p style="color:#999;font-size:12px;margin-top:20px">Reply and manage this from the seller dashboard → Tickets tab.</p>
      </div>`;

    const result = await sendEmail({
      to: SUPPORT_EMAIL,
      subject: `${isPasswordReset ? "[Password reset] " : "[Ticket] "}${subject} — ${company_name}`,
      html,
    });

    if (!result.ok) {
      return json({ error: result.error }, 500);
    }
    return json({ sent: true });
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
