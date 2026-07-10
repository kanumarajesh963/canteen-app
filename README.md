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
