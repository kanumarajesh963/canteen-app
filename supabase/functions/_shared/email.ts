// =========================================================================
// _shared/email.ts — sends email via Gmail SMTP (using an App Password)
// =========================================================================
// Replaces the earlier Resend integration. Resend's free tier only lets
// you deliver to your own signup email until you verify a domain you own.
// Gmail SMTP lets you send to ANY recipient immediately, for free, using
// nothing but a Google account + an App Password.
//
// Required secrets (Supabase Dashboard → Edge Functions → Secrets, or
// `supabase secrets set ...`):
//   GMAIL_USER          — the Gmail address you're sending FROM,
//                          e.g. "kanumarajesh963@gmail.com"
//   GMAIL_APP_PASSWORD  — a 16-character App Password (NOT your normal
//                          Gmail password). Generate one at:
//                          https://myaccount.google.com/apppasswords
//                          (requires 2-Step Verification to be turned on
//                          for the Google account first)
//
// Limits: Gmail caps free accounts at ~500 emails/day, and unverified
// senders are more likely to land in spam than a domain-verified sender
// would. Fine for getting a canteen app of a few hundred people running;
// swap back to a verified-domain provider (Resend, SES, etc.) later if
// you outgrow it.
// =========================================================================

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const GMAIL_USER = Deno.env.get("GMAIL_USER");
  const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return {
      ok: false,
      error:
        "Set GMAIL_USER and GMAIL_APP_PASSWORD secrets first (see supabase/functions/_shared/email.ts).",
    };
  }

  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: {
        username: GMAIL_USER,
        password: GMAIL_APP_PASSWORD,
      },
    },
  });

  try {
    await client.send({
      from: GMAIL_USER,
      to: opts.to,
      subject: opts.subject,
      content: "text/html",
      html: opts.html,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  } finally {
    // Always close the connection, even if send() throws.
    try {
      await client.close();
    } catch {
      // ignore close errors
    }
  }
}
