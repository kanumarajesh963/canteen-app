# 🚀 Production Release Checklist — do these in order

## 1. Database (one-time, ~2 minutes)

Open **Supabase → SQL Editor → New query**, paste the ENTIRE `supabase/schema.sql`, click **Run**.

- The file is idempotent — running it again only applies the new **v8** section:
  - Member self-signup (`member_self_signup`)
  - Seller signup OTP is now **always required**
  - Company codes backfilled for older companies
  - Session-validity checks (`admin_session_valid`, `member_session_valid`)

> **"Do users have to connect the DB?" — NO.** The database is connected **once by you**
> at build time via two environment variables (step 3). People using the app never
> connect anything — their browser talks to your Supabase project automatically.

## 2. Email (OTP + daily "are you coming?" mail)

All 4 Edge Functions must be deployed with JWT verification OFF:

```bash
supabase functions deploy send-seller-signup-otp --no-verify-jwt   # signup OTP (members AND sellers)
supabase functions deploy send-password-otp --no-verify-jwt        # forgot-password OTP
supabase functions deploy daily-checkin-email --no-verify-jwt      # morning "coming today?" mail
supabase functions deploy notify-new-ticket --no-verify-jwt        # ticket alerts to support inbox
```

Set the secrets (Supabase Dashboard → Edge Functions → Secrets):

| Secret           | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| `RESEND_API_KEY` | free key from https://resend.com (100 emails/day free)             |
| `APP_URL`        | your deployed URL, e.g. `https://canteen-app-pi.vercel.app`        |
| `FROM_EMAIL`     | `Canteen <onboarding@resend.dev>` for testing; your domain for prod |

**Schedule the morning email** (this is the "are you coming tomorrow? YES adds ₹250" mail —
YES records the member's daily amount, ₹250 by default, as that day's canteen collection):

Supabase → **Database → Cron** (pg_cron) → new job, e.g. every day at 8:00 AM IST:

```sql
select cron.schedule(
  'daily-checkin-email',
  '30 2 * * *',   -- 02:30 UTC = 08:00 IST
  $$ select net.http_post(
       url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/daily-checkin-email',
       headers := jsonb_build_object('Authorization', 'Bearer YOUR-SERVICE-ROLE-KEY')
     ) $$
);
```

Also fill in `app_config` so ticket emails fire (SQL Editor):

```sql
update app_config set value = 'https://YOUR-PROJECT-REF.supabase.co/functions/v1' where key = 'edge_function_url';
update app_config set value = 'YOUR-SERVICE-ROLE-KEY' where key = 'service_role_key';
update app_config set value = 'your-support@email.com' where key = 'support_email';
```

## 3. Deploy the frontend (Vercel)

One-time: **Vercel → Project → Settings → Environment Variables**:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Then push / redeploy. `vercel.json` already rewrites all paths to `index.html`.

## 4. Smoke-test before announcing

1. Open the site logged out → you land on the **Sign In / Sign Up** screen (nothing else is reachable).
2. **Sign Up → Seller** → email OTP arrives → company created → company code shown.
3. **Sign Up → Member** → enter that company code → email OTP arrives → member home opens.
4. Top bar shows **only Logout** (plus Cart/Orders/etc.) — no login links.
5. **Logout** → you're back on the first screen; pressing Back doesn't re-enter the app.
6. **Forgot password** → OTP mail → reset → auto-returned to Sign In → sign in with new password.
7. Wait for (or manually invoke) `daily-checkin-email` → tap **YES** in the mail → ₹250 recorded.

## ⚠️ Known limitation you accepted for v1

**Wallet recharge is still a mock top-up** — tapping "Add ₹200" credits instantly with no
payment gateway. Fine while the wallet is an internal tally; before REAL money flows in,
put Razorpay/Cashfree in front and only call `wallet_recharge` from a server-side webhook.
