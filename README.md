# The Canteen Counter 🍱

A corporate-office canteen ordering app. Employees browse today's stock, book items, pay with
whichever app they have, and pick up with a token number. The seller gets a full dashboard —
inventory control, walk-in sale logging, and sales analytics (today / month / year, charts, profit & loss).

Built with **React + Vite + Tailwind CSS**. Fully responsive (mobile + desktop).

## ⚠️ Important — read before you rely on this for real money

This is a **working demo**, not a production payment system:

- **Payment is simulated.** The checkout screen lets a person pick Google Pay / PhonePe / Paytm / Card / Cash,
  then simulates a successful payment after ~1 second. **No real money moves** and no bank/UPI account is
  contacted. To take real payments you'd need to integrate a real gateway (Razorpay, Stripe, PhonePe
  Business API, etc.) on a real backend — that requires business KYC and server-side secret keys, which
  can't be wired up without your business's own credentials.
- **Data lives in the browser** (`localStorage`), not a shared database. Every device/browser has its own
  separate stock and order history. That's fine for a single-counter demo or a single admin device, but if
  you want multiple employees on different phones to see the *same* live stock, you'll need a real backend
  (e.g. Supabase, Firebase, or a small Node/Postgres API) — happy to help wire one up if you want to take
  this further.
- **Admin login is a demo password** (`canteen123`) stored client-side — good enough to keep casual users
  out of the dashboard, not real security. Don't use it to gate anything sensitive as-is.

## Features

- **Shop / booking page** — menu-board style grid, category filters, search, live stock (auto "Sold out" /
  "Only N left" badges)
- **Cart → Checkout → Token receipt** — pick a payment method, confirm, get a torn-ticket style token
  (e.g. `#042`) to show at the counter
- **Seller dashboard**
  - **Overview** — today / month / year revenue, profit & loss, 14-day trend chart, monthly bar chart,
    category pie chart, top sellers
  - **Inventory** — add/edit/delete items, edit price & cost, **directly change stock number** (for when
    someone buys in person)
  - **Orders** — full log of online + walk-in orders
  - **Counter Sale** — log a walk-in purchase in a few taps; stock updates immediately
- **My Orders** — every customer booking is saved to that device, with the full receipt viewable again anytime (nav → "My Orders")
- One consistent typeface (Poppins) throughout, with subtle entrance/reveal animations
- Reset-to-demo-data button for re-testing

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel

**Option A — Vercel CLI**
```bash
npm i -g vercel
vercel
```

**Option B — Git + Vercel dashboard**
1. Push this folder to a GitHub repo.
2. Go to vercel.com/new, import the repo.
3. Framework preset: **Vite**. Build command `npm run build`, output directory `dist` (Vercel usually
   auto-detects this).
4. Deploy — you'll get a live `.vercel.app` URL that works on both mobile and desktop.

The included `vercel.json` makes sure page refreshes on routes like `/admin` or `/checkout` work correctly
(client-side routing rewrite).

## Seller login

Go to the **Seller Login** link in the top nav → password `canteen123` (change this in
`src/lib/StoreContext.jsx`, look for the `login` function, before you share the app with anyone).

## Customizing the menu

Edit the starting items in `src/lib/seed.js`, or just use the **Inventory** tab in the dashboard after
logging in — add, edit, delete, and adjust stock right from the UI.
