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
//   RESEND_API_KEY — same key used by daily-checkin-email
//   FROM_EMAIL     — e.g. "Canteen <onboarding@resend.dev>"
//   SUPPORT_EMAIL  — where new-ticket alerts go (default: support@canteen.com)
//
// This function trusts its caller (the Postgres trigger, authenticated with
// your service role key — see app_config in schema.sql) rather than end
// users, so it does not need SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY itself.
// =========================================================================

Deno.serve(async (req) => {
  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "Canteen <onboarding@resend.dev>";
    const SUPPORT_EMAIL = Deno.env.get("SUPPORT_EMAIL") || "support@canteen.com";

    if (!RESEND_API_KEY) {
      return json({ error: "Set RESEND_API_KEY secret first (see README)." }, 500);
    }

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

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [SUPPORT_EMAIL],
        subject: `${isPasswordReset ? "[Password reset] " : "[Ticket] "}${subject} — ${company_name}`,
        html,
      }),
    });

    if (!res.ok) {
      return json({ error: await res.text() }, 500);
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
