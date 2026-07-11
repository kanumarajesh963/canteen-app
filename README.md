# The Canteen Counter

A booking-and-pickup app for an office canteen: browse the board, pay your way (including a built-in wallet),
get a token, and track order status live. One deployment now serves **multiple companies**, each at its own
URL path, each with completely separate products / stock / orders / wallets.

---

## What changed in this build

This started as a `localStorage`-only demo (single browser, single "company", no way for a buyer's phone and
the seller's phone to see the same order). It now runs on **Supabase** (hosted Postgres + realtime) so that:

- **Multi-company** — `your-app.vercel.app/acme` and `your-app.vercel.app/techcorp` are two totally separate
  canteens on the same deployment. Add a new company with one SQL insert — no redeploy needed.
- **Canteen Wallet** — buyers log in with a phone number, recharge once, and pay instantly at checkout instead
  of picking a UPI app every time.
- **Live order status** — admin marks an order Preparing → Ready → Picked Up, and the buyer's own order page
  updates in real time (via Supabase Realtime), no refresh needed.
- **Restock alerts + one-tap reorder** — the seller dashboard flags items at/under a threshold; buyers can
  re-book a past order in one tap from "My Orders".

## Honest limitations — read before you rely on this for real money

- **Wallet recharge is a mock top-up.** Tapping "Add ₹200" credits the wallet instantly with no payment
  gateway behind it. Before real money is involved, put a real gateway (Razorpay/Cashfree/UPI) in front of it
  and only call `wallet_recharge` from a **server-side webhook** that has verified the payment succeeded —
  never let the browser trigger a credit on its own. The RPC and schema comments flag exactly where this goes.
- **No OTP.** Buyer "login" is just a phone number the app remembers you by — it is not verified. Fine for an
  internal office tool where wallet balances are small; not fine if you want real identity assurance. Swap in
  Supabase's phone-auth (Twilio-backed OTP) when you're ready — see `supabase/schema.sql` comments.
- **Admin login is a per-company password**, not a real user account. It's enough to gate the dashboard from
  random visitors, but it's not multi-admin-with-audit-log security.
- **Multi-tenancy is path-based** (`/acme`, `/techcorp`), not separate subdomains or custom domains. That
  means nothing shows up in a public directory and each company's URL is only known to people you send it to
  — but it *is* one shared codebase and database, so a determined visitor could technically try guessing
  other company slugs. If that's a concern, add a per-company invite-only flag before rollout (not included
  here) or move to real subdomains (see below).

None of this is unusual for a first backend pass — it's exactly what to harden next once this is in real use.

---

## 1. Backend setup (Supabase — free tier is enough)

1. Go to [supabase.com](https://supabase.com), create a free account and a new project.
2. In your new project: **SQL Editor → New query**, paste the entire contents of
   [`supabase/schema.sql`](./supabase/schema.sql), and click **Run**. This creates every table, locks down
   direct writes with Row Level Security, creates the business-logic functions (placing orders, wallet
   recharge, admin login, etc.), and seeds one demo company (`slug: demo`, admin password `canteen123`).
3. Go to **Project Settings → API** and copy the **Project URL** and the **anon public key**.

## 2. Point the app at your Supabase project

```bash
cp .env.example .env
```

Edit `.env`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Then:

```bash
npm install
npm run dev
```

Visit `http://localhost:5173/demo` to see the seeded demo canteen.

## 3. Deploy

Push to GitHub and import into Vercel as usual, **or** if you're already deployed at
`https://canteen-app-pi.vercel.app`, just add the two env vars in **Vercel → Project → Settings →
Environment Variables** (same names as `.env`) and redeploy. `vercel.json` already rewrites all paths to
`index.html`, which is what lets `/acme`, `/techcorp`, etc. work as client-side routes.

---

## Adding a new company

No code changes, no redeploy. In Supabase's SQL Editor:

```sql
insert into companies (slug, name, emoji, admin_password_hash)
values ('acme', 'Acme Corp Canteen', '🍔', crypt('choose-a-real-password', gen_salt('bf')));
```

That company's shop is instantly live at:

```
https://canteen-app-pi.vercel.app/acme
```

Give the seller their admin link (`/acme/admin/login`) and password — that's it. Add products for the new
company from that dashboard (Inventory tab → Add item); each company only ever sees its own menu, orders,
stock, and wallets.

### Upgrading to real subdomains later (optional)

If you'd rather have `acme.yourdomain.com` instead of `yourdomain.com/acme`: keep this same codebase, add each
company as a custom domain in Vercel pointing at the same deployment, and change the slug-resolution in
`src/App.jsx` / `StoreContext` to read the subdomain instead of the URL path. The database schema doesn't need
to change at all — `companies.slug` already is the tenant key.

---

## How the pieces fit together

- **`supabase/schema.sql`** — the entire backend: tables, Row Level Security, and every RPC function
  (`place_order`, `wallet_recharge`, `admin_login`, `admin_set_order_status`, …). The browser's Supabase
  "anon" key can only *read* `companies`/`products`/`orders` directly; every write goes through one of these
  functions, which validate stock, admin sessions, and wallet balances before touching a row.
- **`src/lib/StoreContext.jsx`** — the app's data layer. Scoped to one company (by slug), loads
  products/orders on mount, and subscribes to Supabase Realtime so stock and order-status changes made by
  *anyone* (another buyer, the seller's dashboard) show up live without a refresh.
- **`src/App.jsx`** — routes `/:companySlug/*` into a `StoreProvider` for that company; everything under it
  (Shop, Checkout, Wallet, My Orders, Admin) is automatically scoped correctly.

---

## Demo credentials

- Shop: `/demo`
- Admin dashboard: `/demo/admin/login`, password `canteen123`
- Wallet: any phone number "logs in" (no OTP) — try `9876543210`

---

## Membership attendance & daily-collection billing

On top of the shop/wallet system above, this build adds a second, independent feature: a per-company member
list that pays a flat daily amount (₹250 by default) on days they actually show up — with the seller marking
attendance and getting day/month/year charts of what was collected vs. what "profit" (unpaid/saved amount)
that represents.

**This is all in the same `supabase/schema.sql` file** — just run the whole file again in the SQL Editor
(it's idempotent, so re-running the parts you already ran is harmless) and the new tables/functions/demo data
appear alongside the existing ones.

### Login, redesigned

- **Seller login** (`/seller/login`) — username + password only, no company name needed. The backend looks
  up which company that username belongs to. Demo: `demo_seller` / `canteen123`.
- **Member login** (`/member/login`) — Company name + username + password, all required. Demo: company
  `demo`, username `member1`, password `member123` (also `member5` / `member10`).
- The old per-company `/​:slug/admin/login` (password-only) still works too, if you'd rather link people
  straight to one company.

### How it works day to day

1. Seller logs in → **Members** tab → add each person with a member number, username, password, and daily
   amount (defaults to ₹250).
2. Each day, seller logs in → **Attendance** tab → types the member numbers who actually showed up (e.g.
   `1,5,10,15,25,30,50`) → "Mark present". Only those get charged that day's amount.
3. The dashboard shows, for that day/month/year: **Potential** (every active member × daily amount),
   **Collected** (what was actually marked), and **Profit** = Potential − Collected — the amount not paid out
   because someone didn't come in.
4. Members can log in themselves to see their own attendance history and how much they've paid this month /
   all-time.

### Honest limitations of this add-on

- **"Profit" here means "money not paid out,"** not accounting profit against real costs — that's exactly
  the definition you asked for (50 members × ₹250 = ₹12,500 potential; if only 10 show up, ₹2,500 collected,
  ₹10,000 "profit"). If you later want true profit (revenue minus your actual costs for that day), that's a
  different number and would need your cost data wired in separately.
- **No real payment gateway is behind attendance marking.** Marking someone present just records that
  ₹250 was collected — it assumes the seller collected it in cash/UPI outside the app. Same caveat as the
  wallet recharge above: don't treat this as a ledger of money that's actually sitted in a bank account.
- **Passwords are simple bcrypt-hashed passwords, not full accounts with password reset, email verification,
  etc.** Fine for an internal tool; add real auth (Supabase Auth) before this handles outside users or real
  money at scale.
- **"Potential" assumes daily amount and active member count are roughly stable across the whole period** —
  if you add/remove members partway through a month, past months' potential is still calculated using
  *current* active members × days, not who was active on each historical day. Good enough for a first pass;
  ask if you want it to track membership changes precisely over time.

---

# v3 features (this build)

1. **Member email** — sellers set it when adding a member (Members tab), or the member adds/changes it themselves on their home page. This is where the morning mail goes.
2. **Morning "coming to office?" email** — every morning each member with an email gets a mail with **✅ Yes / ❌ Not today** buttons. Tapping **Yes charges that member ₹250** (their `daily_amount`) as that day's collection — recorded in the same attendance system the seller's charts already use. The identical question also appears as a card on the member's home page, so members without email (or who missed the mail) can still answer in-app.
3. **Logins per company** — new **Logins** tab in the seller dashboard: your company's logins today / unique members today / this month / all time, plus a table showing login counts for **every** company on the deployment.
4. **Update password + show password** — every password field now has a show/hide eye toggle. Members can change their own password from their home page (current + new). Sellers can still reset any member's password from the Members tab.
5. **Forgot password** — "Forgot password?" link on the member login. It raises a *password-reset ticket*; the seller sees it in the new **Tickets** tab, resets the password from the Members tab, and marks the ticket resolved.
6. **Raise a ticket** — members have a "Raise a ticket" button on their home page; anonymous users can raise one via the forgot-password flow. Sellers manage all of them in the **Tickets** tab (open/resolve/reopen).

## Setting up the morning email (one-time, ~10 minutes, free)

Everything except *sending scheduled emails* runs on the existing Supabase setup. Email needs two free services:

**A. Get a free email API key (Resend)**
1. Sign up at [resend.com](https://resend.com) (free: 100 emails/day).
2. Create an API key.
3. **Verify a domain before going live** — go to [resend.com/domains](https://resend.com/domains), add a domain you control, and add the SPF/DKIM DNS records it gives you (usually verifies in minutes). Until you do this, `onboarding@resend.dev` **only delivers to the email address on your own Resend account** — every other recipient silently fails or gets a 403. This is the #1 cause of "OTP/welcome emails only reach one inbox." Once verified, set `FROM_EMAIL` to use your domain (e.g. `Corporate Canteen <noreply@yourdomain.com>`) and every member's real email will start receiving mail correctly.

**B. Deploy the Edge Function**
1. In your Supabase project: **Edge Functions → Deploy a new function**, name it `daily-checkin-email`, and paste the contents of [`supabase/functions/daily-checkin-email/index.ts`](./supabase/functions/daily-checkin-email/index.ts). (Or use the CLI: `supabase functions deploy daily-checkin-email`.)
2. In **Edge Functions → Secrets**, add:
   - `RESEND_API_KEY` — your Resend key
   - `APP_URL` — your deployed frontend, e.g. `https://canteen-app-pi.vercel.app`
   - `FROM_EMAIL` — e.g. `Canteen <onboarding@resend.dev>`
3. Test it once: click **Invoke** (or `curl` it with your service role key). Members with emails get the mail instantly.

**C. Schedule it for every morning**
In Supabase: **Integrations → Cron** (enables `pg_cron` + `pg_net`), then SQL Editor:

```sql
select cron.schedule(
  'daily-checkin-email',
  '30 2 * * *',   -- 02:30 UTC = 08:00 IST every day
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/daily-checkin-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR-SERVICE-ROLE-KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Replace `YOUR-PROJECT-REF` and `YOUR-SERVICE-ROLE-KEY` (Project Settings → API → service_role). Cron times are UTC — `30 2 * * *` is 8:00 AM IST.

> If you skip the email setup entirely, everything else still works: members answer the same Yes/No question on their home page after logging in, and Yes still charges ₹250.

## If you already ran the old schema

Just paste and run the **whole updated `supabase/schema.sql`** again in the SQL Editor — every statement is idempotent, and the new v3 section at the bottom adds the email column, check-ins, tickets, and login-event tables/functions without touching your existing data.

---

# v4 change: email IS the login

Members no longer have a separate username. The **email they log in with is their identity AND where the morning check-in mail goes** — Gmail, Outlook, any provider (email delivery doesn't care about the provider).

- Seller adds a member with just: number, name, **email**, password (Members tab).
- Member logs in with: company + **email** + password.
- If an old member's username already looked like an email, it's auto-copied to the mail list; it also auto-fills the first time they log in.
- The old demo accounts (`member1` etc.) still work for testing.

## Triggering the morning mail YOURSELF (your own timing)

You said you'll trigger it from your side — perfect. The Edge Function is just a URL; hit it whenever you want and it emails **everyone across all companies** who hasn't been asked yet today (safe to hit twice — already-sent/answered members are skipped):

```bash
curl -X POST "https://YOUR-PROJECT-REF.supabase.co/functions/v1/daily-checkin-email" \
  -H "Authorization: Bearer YOUR-SERVICE-ROLE-KEY"
```

Trigger it from anywhere: a cron on your machine, the Supabase dashboard's **Invoke** button, Postman, or the pg_cron schedule from the section above if you later want it automatic. Each mail's ✅ **Yes** button charges that member their ₹250 for today; ❌ **No** charges nothing.

---

# v6 + v7 additions (this build)

On top of everything above, this build adds three things that were only half-wired in before: **ticket email alerts**, a **real OTP password reset**, and a **working seller self-signup** page (the `Sellersignup.jsx` page already existed but the backend functions and `globalAuth.js` exports it needed didn't — the build was broken until this update).

## 1. Email support@canteen.com whenever a ticket is raised

Every new row in `tickets` (a member's "Raise a ticket", a password-reset request, or the anonymous forgot-password flow) now fires a Postgres trigger that emails your support inbox with the ticket ID, who raised it, and what it's about.

**Setup (~5 minutes):**
1. Run the updated `supabase/schema.sql` (whole file — it's idempotent).
2. Deploy the new Edge Function: **Edge Functions → Deploy**, name it `notify-new-ticket`, paste [`supabase/functions/notify-new-ticket/index.ts`](./supabase/functions/notify-new-ticket/index.ts).
3. In that function's **Secrets**, set `RESEND_API_KEY`, `FROM_EMAIL` (same values as `daily-checkin-email`), and optionally `SUPPORT_EMAIL` (defaults to `support@canteen.com`).
4. In the SQL Editor, point the trigger at your function and key:
   ```sql
   update app_config set value = 'https://YOUR-PROJECT-REF.supabase.co/functions/v1' where key = 'edge_function_url';
   update app_config set value = 'YOUR-SERVICE-ROLE-KEY' where key = 'service_role_key';
   ```
   (Project Settings → API → service_role.) Until you set these, ticket creation still works fine — the trigger just skips the email silently.

## 2. Password reset with an emailed OTP (no more waiting on the seller)

`/member/forgot` now: enter your email → get a 6-digit code → enter the code + a new password → done, immediately. The old flow (raise a ticket, seller resets it manually) still exists as a fallback at `/member/forgot/ask-seller` for members who can't access their inbox.

**Setup:** deploy `supabase/functions/send-password-otp/index.ts` as an Edge Function named `send-password-otp`, with the same `RESEND_API_KEY` / `FROM_EMAIL` secrets, deployed with `--no-verify-jwt` (no one is logged in yet at this point). That's it — the RPCs are already in `schema.sql`.

## Member wallet signup bonus + welcome email

Every member now gets a **₹250 wallet bonus** automatically the moment they sign up (`member_self_signup` in `schema.sql` credits it and logs it in `member_wallet_transactions`). Their home page shows the balance as a "Wallet" stat card.

Right after signup, the app also emails the member a welcome message confirming the bonus, sent to whatever address *they* entered (not a fixed address).

**Setup:** deploy `supabase/functions/send-welcome-email/index.ts` as an Edge Function named `send-welcome-email`, using the same `RESEND_API_KEY` / `FROM_EMAIL` secrets as the other functions, deployed with `--no-verify-jwt`:
```
supabase functions deploy send-welcome-email --no-verify-jwt
```
If this function isn't deployed yet, signup still works fine — the wallet credit happens in the database regardless; only the confirmation email is skipped.

## 3. Seller signup — "Create your company" (`/seller/signup`)

A seller can now create their own company (name + email + password) without you running a manual SQL insert. On success they get a short **company code** and land straight in their dashboard. OTP email verification before account creation is supported but **off by default**; turn it on with:
```sql
update app_config set value = 'true' where key = 'seller_signup_otp_required';
```
If you turn it on, also deploy `supabase/functions/send-seller-signup-otp/index.ts` as `send-seller-signup-otp` (`--no-verify-jwt`, same Resend secrets).

## Honest limitations of this add-on

- OTP codes are 6 digits, expire in 10 minutes, and are single-use — reasonable for an internal tool, but there's no rate-limiting on how often a code can be requested. Add that at the Edge Function or API-gateway level before opening this up beyond a trusted office.
- The `notify-new-ticket` trigger reads its target URL and key from a plain `app_config` table (no encryption) rather than Supabase Vault, matching the existing cron-setup pattern in this repo. Fine for an internal deployment; tighten it (e.g. Vault secrets) if this ever handles sensitive tickets.
- `seller_signup` lets anyone with an email create a company — there's no admin approval step. If you don't want that, leave it undocumented/unlinked, or add an approval flag before rollout.
