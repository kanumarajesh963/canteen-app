-- =========================================================================
-- The Canteen Counter — multi-tenant schema for Supabase (Postgres)
-- =========================================================================
-- Run this whole file once in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run).
--
-- Design notes (read this before you deploy):
--   * There is no Supabase Auth user account per admin/buyer — admin login
--     is a plain per-company password, and buyers only give a phone number
--     (no OTP verification). Because of that, Row Level Security cannot
--     truly distinguish "this admin" from "the public" using RLS alone.
--     So: every WRITE (insert/update/delete) is blocked for the public
--     `anon` key at the table level, and instead goes through the RPC
--     functions below, which are SECURITY DEFINER and do their own checks
--     (admin session token, stock validation, wallet balance, etc).
--   * This is good enough for an internal office tool. Before you'd trust
--     it with strangers' money, swap the admin password + phone-only buyer
--     ID for real Supabase Auth (email/phone OTP) — see README.md.
-- =========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists companies (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text unique not null,           -- used in the URL: /:slug
  name                 text not null,
  emoji                text not null default '🍱',
  admin_password_hash  text not null,                  -- set via crypt() below
  next_token           int not null default 1,
  created_at           timestamptz not null default now()
);

create table if not exists products (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references companies(id) on delete cascade,
  name                 text not null,
  category             text not null default 'Snacks',
  emoji                text not null default '🍽️',
  price                numeric not null default 0,
  cost                 numeric not null default 0,
  stock                int not null default 0,
  low_stock_threshold  int not null default 5,
  unit                 text not null default 'pc',
  created_at           timestamptz not null default now()
);
create index if not exists idx_products_company on products(company_id);

create table if not exists customers (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  phone        text not null,
  name         text,
  device_id    text,
  created_at   timestamptz not null default now(),
  unique(company_id, phone)
);
create index if not exists idx_customers_company on customers(company_id);

create table if not exists wallets (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null unique references customers(id) on delete cascade,
  balance      numeric not null default 0,
  updated_at   timestamptz not null default now()
);

create table if not exists wallet_transactions (
  id           uuid primary key default gen_random_uuid(),
  wallet_id    uuid not null references wallets(id) on delete cascade,
  amount       numeric not null,        -- positive = credit, negative = debit
  type         text not null,           -- 'recharge' | 'order_payment' | 'refund'
  order_id     uuid,
  created_at   timestamptz not null default now()
);

create table if not exists orders (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  customer_id     uuid references customers(id),
  device_id       text,                          -- fallback for guest checkout
  token           int not null,
  items           jsonb not null,
  total           numeric not null,
  profit          numeric not null,
  payment_method  text not null,
  source          text not null default 'online', -- 'online' | 'counter'
  status          text not null default 'placed', -- placed | preparing | ready | picked_up
  created_at      timestamptz not null default now()
);
create index if not exists idx_orders_company on orders(company_id);
create index if not exists idx_orders_customer on orders(customer_id);
create index if not exists idx_orders_device on orders(device_id);

create table if not exists admin_sessions (
  token        uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '12 hours')
);

-- ---------------------------------------------------------------------
-- Row Level Security — public anon key gets read-only, scoped access.
-- All writes happen through the RPCs further down.
-- ---------------------------------------------------------------------

alter table companies enable row level security;
alter table products enable row level security;
alter table customers enable row level security;
alter table wallets enable row level security;
alter table wallet_transactions enable row level security;
alter table orders enable row level security;
alter table admin_sessions enable row level security;

-- companies: public can look up a company by slug (needed to resolve the URL)
drop policy if exists companies_select on companies;
create policy companies_select on companies for select using (true);

-- products: public menu browsing
drop policy if exists products_select on products;
create policy products_select on products for select using (true);

-- orders: readable so a buyer's own order page / live status + the admin
-- dashboard can query them. No PII beyond items/total/token lives here.
drop policy if exists orders_select on orders;
create policy orders_select on orders for select using (true);

-- customers, wallets, wallet_transactions, admin_sessions: NOT publicly
-- readable (contain phone numbers / balances / session tokens). No select
-- policy is created for them, so RLS blocks all direct access — they are
-- only ever touched from inside SECURITY DEFINER functions below.

-- No insert/update/delete policies exist for ANY table, so the anon key
-- cannot write anything directly. Everything below goes through RPCs.

-- ---------------------------------------------------------------------
-- Helper: validate an admin session token, return its company_id or NULL
-- ---------------------------------------------------------------------
create or replace function _admin_company(p_token uuid)
returns uuid
language sql
security definer
as $$
  select company_id from admin_sessions
  where token = p_token and expires_at > now();
$$;

-- ---------------------------------------------------------------------
-- Admin: login / logout
-- ---------------------------------------------------------------------
create or replace function admin_login(p_slug text, p_password text)
returns uuid  -- session token, or NULL if wrong password
language plpgsql
security definer
as $$
declare
  v_company companies%rowtype;
  v_token uuid;
begin
  select * into v_company from companies where slug = p_slug;
  if v_company.id is null then
    return null;
  end if;
  if v_company.admin_password_hash <> crypt(p_password, v_company.admin_password_hash) then
    return null;
  end if;
  insert into admin_sessions(company_id) values (v_company.id) returning token into v_token;
  return v_token;
end;
$$;

create or replace function admin_logout(p_token uuid)
returns void
language sql
security definer
as $$
  delete from admin_sessions where token = p_token;
$$;

-- ---------------------------------------------------------------------
-- Admin: product management
-- ---------------------------------------------------------------------
create or replace function admin_upsert_product(
  p_token uuid, p_id uuid, p_name text, p_category text, p_emoji text,
  p_price numeric, p_cost numeric, p_stock int, p_low_stock_threshold int, p_unit text
) returns products
language plpgsql
security definer
as $$
declare
  v_company_id uuid := _admin_company(p_token);
  v_row products%rowtype;
begin
  if v_company_id is null then
    raise exception 'Not authorized';
  end if;

  if p_id is null then
    insert into products(company_id, name, category, emoji, price, cost, stock, low_stock_threshold, unit)
    values (v_company_id, p_name, p_category, p_emoji, p_price, p_cost, p_stock, p_low_stock_threshold, p_unit)
    returning * into v_row;
  else
    update products set
      name = p_name, category = p_category, emoji = p_emoji, price = p_price,
      cost = p_cost, stock = p_stock, low_stock_threshold = p_low_stock_threshold, unit = p_unit
    where id = p_id and company_id = v_company_id
    returning * into v_row;
  end if;
  return v_row;
end;
$$;

create or replace function admin_delete_product(p_token uuid, p_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_company_id uuid := _admin_company(p_token);
begin
  if v_company_id is null then raise exception 'Not authorized'; end if;
  delete from products where id = p_id and company_id = v_company_id;
end;
$$;

create or replace function admin_set_stock(p_token uuid, p_id uuid, p_stock int)
returns products
language plpgsql
security definer
as $$
declare
  v_company_id uuid := _admin_company(p_token);
  v_row products%rowtype;
begin
  if v_company_id is null then raise exception 'Not authorized'; end if;
  update products set stock = greatest(0, p_stock)
  where id = p_id and company_id = v_company_id
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- Admin: order status (Preparing → Ready → Picked Up)
-- ---------------------------------------------------------------------
create or replace function admin_set_order_status(p_token uuid, p_order_id uuid, p_status text)
returns orders
language plpgsql
security definer
as $$
declare
  v_company_id uuid := _admin_company(p_token);
  v_row orders%rowtype;
begin
  if v_company_id is null then raise exception 'Not authorized'; end if;
  if p_status not in ('placed','preparing','ready','picked_up') then
    raise exception 'Invalid status';
  end if;
  update orders set status = p_status
  where id = p_order_id and company_id = v_company_id
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- Buyer identity: get-or-create a customer row + wallet by phone number.
-- NOTE: no OTP here — this is "remember me by phone number", not verified
-- identity. Fine for an internal tool; add real phone auth before trusting
-- it with strangers.
-- ---------------------------------------------------------------------
create or replace function get_or_create_customer(p_company_slug text, p_phone text, p_name text, p_device_id text)
returns table(customer_id uuid, balance numeric)
language plpgsql
security definer
as $$
declare
  v_company_id uuid;
  v_customer customers%rowtype;
  v_wallet wallets%rowtype;
begin
  select id into v_company_id from companies where slug = p_company_slug;
  if v_company_id is null then raise exception 'Unknown company'; end if;

  select * into v_customer from customers where company_id = v_company_id and phone = p_phone;
  if v_customer.id is null then
    insert into customers(company_id, phone, name, device_id)
    values (v_company_id, p_phone, p_name, p_device_id)
    returning * into v_customer;
    insert into wallets(customer_id, balance) values (v_customer.id, 0) returning * into v_wallet;
  else
    select * into v_wallet from wallets where customer_id = v_customer.id;
    if v_wallet.id is null then
      insert into wallets(customer_id, balance) values (v_customer.id, 0) returning * into v_wallet;
    end if;
  end if;

  return query select v_customer.id, v_wallet.balance;
end;
$$;

create or replace function get_wallet_balance(p_customer_id uuid)
returns numeric
language sql
security definer
as $$
  select coalesce(balance, 0) from wallets where customer_id = p_customer_id;
$$;

create or replace function get_wallet_transactions(p_customer_id uuid)
returns setof wallet_transactions
language sql
security definer
as $$
  select wt.* from wallet_transactions wt
  join wallets w on w.id = wt.wallet_id
  where w.customer_id = p_customer_id
  order by wt.created_at desc
  limit 50;
$$;

-- ---------------------------------------------------------------------
-- Wallet recharge.
-- DEMO NOTE: this credits the wallet immediately with no real payment
-- gateway behind it. Before going live with real money, call this only
-- from a server-side webhook that has verified a Razorpay/Cashfree/UPI
-- payment succeeded — never let the client trigger a credit on its own.
-- ---------------------------------------------------------------------
create or replace function wallet_recharge(p_customer_id uuid, p_amount numeric)
returns numeric
language plpgsql
security definer
as $$
declare
  v_wallet_id uuid;
  v_new_balance numeric;
begin
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  select id into v_wallet_id from wallets where customer_id = p_customer_id;
  if v_wallet_id is null then raise exception 'No wallet for customer'; end if;

  update wallets set balance = balance + p_amount, updated_at = now()
  where id = v_wallet_id
  returning balance into v_new_balance;

  insert into wallet_transactions(wallet_id, amount, type) values (v_wallet_id, p_amount, 'recharge');
  return v_new_balance;
end;
$$;

-- ---------------------------------------------------------------------
-- Place an order atomically: validates stock, decrements it, assigns the
-- next token for that company, and (if paying by wallet) debits the
-- wallet — all inside one transaction so concurrent buyers can't oversell
-- the last item or double-spend a wallet balance.
-- p_items shape: [{"productId": "...", "qty": 2}, ...]
-- ---------------------------------------------------------------------
create or replace function place_order(
  p_company_slug text, p_items jsonb, p_payment_method text, p_source text,
  p_customer_id uuid, p_device_id text
) returns orders
language plpgsql
security definer
as $$
declare
  v_company companies%rowtype;
  v_item jsonb;
  v_product products%rowtype;
  v_order_items jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_profit numeric := 0;
  v_token int;
  v_order orders%rowtype;
  v_wallet_id uuid;
  v_balance numeric;
begin
  select * into v_company from companies where slug = p_company_slug for update;
  if v_company.id is null then raise exception 'Unknown company'; end if;

  -- validate + lock every product row first
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products
      where id = (v_item->>'productId')::uuid and company_id = v_company.id
      for update;
    if v_product.id is null then
      raise exception 'Product not found';
    end if;
    if v_product.stock < (v_item->>'qty')::int then
      raise exception 'Not enough stock for %', v_product.name;
    end if;
  end loop;

  -- build order items + decrement stock
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products
      where id = (v_item->>'productId')::uuid and company_id = v_company.id;

    v_order_items := v_order_items || jsonb_build_object(
      'productId', v_product.id, 'name', v_product.name, 'emoji', v_product.emoji,
      'qty', (v_item->>'qty')::int, 'price', v_product.price, 'cost', v_product.cost
    );
    v_total := v_total + v_product.price * (v_item->>'qty')::int;
    v_profit := v_profit + (v_product.price - v_product.cost) * (v_item->>'qty')::int;

    update products set stock = stock - (v_item->>'qty')::int where id = v_product.id;
  end loop;

  -- wallet payment: debit atomically, fail the whole order if insufficient
  if p_payment_method = 'Wallet' then
    if p_customer_id is null then raise exception 'No customer for wallet payment'; end if;
    select id, balance into v_wallet_id, v_balance from wallets where customer_id = p_customer_id for update;
    if v_wallet_id is null or v_balance < v_total then
      raise exception 'Insufficient wallet balance';
    end if;
    update wallets set balance = balance - v_total, updated_at = now() where id = v_wallet_id;
  end if;

  -- assign next token
  update companies set next_token = next_token + 1 where id = v_company.id returning next_token - 1 into v_token;

  insert into orders(company_id, customer_id, device_id, token, items, total, profit, payment_method, source, status)
  values (v_company.id, p_customer_id, p_device_id, v_token, v_order_items, v_total, v_profit, p_payment_method, p_source, 'placed')
  returning * into v_order;

  if p_payment_method = 'Wallet' then
    insert into wallet_transactions(wallet_id, amount, type, order_id) values (v_wallet_id, -v_total, 'order_payment', v_order.id);
  end if;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------
-- Seed a demo company so you have something to point the app at right
-- away. Slug: "demo", admin password: "canteen123".
-- Run this once — safe to re-run (it upserts by slug).
-- ---------------------------------------------------------------------
insert into companies (slug, name, emoji, admin_password_hash)
values ('demo', 'The Canteen Counter', '🍱', crypt('canteen123', gen_salt('bf')))
on conflict (slug) do nothing;

insert into products (company_id, name, category, emoji, price, cost, stock, low_stock_threshold, unit)
select c.id, x.name, x.category, x.emoji, x.price, x.cost, x.stock, 5, x.unit
from companies c,
(values
  ('Chocolate Bar','Snacks','🍫',20,12,10,'pc'),
  ('Samosa','Snacks','🥟',15,8,25,'pc'),
  ('Vada Pav','Snacks','🍔',25,14,18,'pc'),
  ('Masala Chai','Beverages','☕',10,4,40,'cup'),
  ('Filter Coffee','Beverages','☕',15,6,30,'cup'),
  ('Cold Drink Can','Beverages','🥤',40,28,20,'can'),
  ('Veg Sandwich','Meals','🥪',35,20,15,'pc'),
  ('Maggi Noodles','Meals','🍜',30,16,20,'bowl'),
  ('Chips Packet','Snacks','🍟',20,13,22,'pkt'),
  ('Biscuit Pack','Snacks','🍪',10,5,35,'pkt'),
  ('Fruit Bowl','Meals','🍎',30,18,12,'bowl'),
  ('Mineral Water','Beverages','💧',15,9,30,'bottle')
) as x(name, category, emoji, price, cost, stock, unit)
where c.slug = 'demo'
and not exists (select 1 from products p where p.company_id = c.id);

-- To add another company later, run (change the slug/name/password):
--   insert into companies (slug, name, emoji, admin_password_hash)
--   values ('acme', 'Acme Corp Canteen', '🍔', crypt('a-new-password', gen_salt('bf')));
-- Then its shop is instantly live at:  https://your-app.vercel.app/acme

-- =========================================================================
-- Membership attendance & daily-collection add-on
-- =========================================================================
-- What this adds, on top of everything above:
--   * Every company gets a globally-unique `seller_username` so the seller
--     can log in from one shared page with just username + password — no
--     need to know/type the company slug.
--   * `members` — a company's list of people who pay a flat daily amount
--     (default Rs 250) on days they actually show up. Each member logs in
--     with Company name/slug + their own username + password.
--   * `attendance` — one row per member per day they were marked present,
--     recording exactly how much was collected from them that day.
--   * The seller marks which member numbers were present each day
--     (mark_attendance) and gets day/month/year charts of
--     collected vs "potential" (what it would've been if everyone showed
--     up) vs the difference, which this app calls "profit" per your spec:
--     profit = potential - collected.
-- Safe to re-run: every statement below is idempotent.
-- =========================================================================

alter table companies add column if not exists seller_username text unique;

create table if not exists members (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  member_number int not null,
  name          text,
  username      text not null,
  password_hash text not null,
  daily_amount  numeric not null default 250,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique(company_id, member_number),
  unique(company_id, username)
);
create index if not exists idx_members_company on members(company_id);

create table if not exists attendance (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  visit_date  date not null,
  amount      numeric not null,
  created_at  timestamptz not null default now(),
  unique(company_id, member_id, visit_date)
);
create index if not exists idx_attendance_company_date on attendance(company_id, visit_date);

create table if not exists member_sessions (
  token       uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '12 hours')
);

alter table members enable row level security;
alter table attendance enable row level security;
alter table member_sessions enable row level security;
-- No select policies on any of the three -- same pattern as the rest of this
-- file: the anon key can't read or write them directly, only the
-- SECURITY DEFINER functions below can, after checking a valid token.

-- ---------------------------------------------------------------------
-- Seller login -- GLOBAL username, no company slug needed up front.
-- ---------------------------------------------------------------------
create or replace function seller_login(p_username text, p_password text)
returns table(token uuid, company_slug text, company_name text)
language plpgsql
security definer
as $$
declare
  v_company companies%rowtype;
  v_token uuid;
begin
  select * into v_company from companies where seller_username = p_username;
  if v_company.id is null then
    return;
  end if;
  if v_company.admin_password_hash <> crypt(p_password, v_company.admin_password_hash) then
    return;
  end if;
  insert into admin_sessions(company_id) values (v_company.id) returning admin_sessions.token into v_token;
  return query select v_token, v_company.slug, v_company.name;
end;
$$;

-- ---------------------------------------------------------------------
-- Member (buyer) login -- Company name/slug + their own username + password.
-- ---------------------------------------------------------------------
create or replace function member_login(p_company_query text, p_username text, p_password text)
returns table(token uuid, member_id uuid, member_number int, member_name text, company_slug text, company_name text)
language plpgsql
security definer
as $$
declare
  v_company companies%rowtype;
  v_member members%rowtype;
  v_token uuid;
begin
  select * into v_company from companies
    where lower(slug) = lower(trim(p_company_query)) or lower(name) = lower(trim(p_company_query))
    limit 1;
  if v_company.id is null then
    return;
  end if;

  select * into v_member from members where company_id = v_company.id and username = p_username;
  if v_member.id is null then
    return;
  end if;
  if v_member.password_hash <> crypt(p_password, v_member.password_hash) then
    return;
  end if;

  insert into member_sessions(member_id) values (v_member.id) returning member_sessions.token into v_token;
  return query select v_token, v_member.id, v_member.member_number, v_member.name, v_company.slug, v_company.name;
end;
$$;

create or replace function member_logout(p_token uuid)
returns void
language sql
security definer
as $$
  delete from member_sessions where token = p_token;
$$;

create or replace function _member_from_token(p_token uuid)
returns members
language sql
security definer
as $$
  select m.* from members m
  join member_sessions s on s.member_id = m.id
  where s.token = p_token and s.expires_at > now();
$$;

-- A member's own attendance/payment history.
create or replace function get_my_attendance(p_token uuid)
returns setof attendance
language sql
security definer
as $$
  select a.* from attendance a
  where a.member_id = (select id from _member_from_token(p_token))
  order by a.visit_date desc;
$$;

-- ---------------------------------------------------------------------
-- Seller: manage the member list
-- ---------------------------------------------------------------------
create or replace function admin_list_members(p_token uuid)
returns setof members
language sql
security definer
as $$
  select * from members where company_id = _admin_company(p_token) order by member_number;
$$;

create or replace function admin_upsert_member(
  p_token uuid, p_id uuid, p_member_number int, p_name text,
  p_username text, p_password text, p_daily_amount numeric, p_active boolean
) returns members
language plpgsql
security definer
as $$
declare
  v_company_id uuid;
  v_member members%rowtype;
begin
  v_company_id := _admin_company(p_token);
  if v_company_id is null then raise exception 'Not authorized'; end if;

  if p_id is null then
    insert into members(company_id, member_number, name, username, password_hash, daily_amount, active)
    values (
      v_company_id, p_member_number, p_name, p_username,
      crypt(coalesce(p_password, substr(gen_random_uuid()::text, 1, 8)), gen_salt('bf')),
      coalesce(p_daily_amount, 250), coalesce(p_active, true)
    )
    returning * into v_member;
  else
    update members set
      member_number = p_member_number,
      name = p_name,
      username = coalesce(p_username, username),
      password_hash = case when p_password is not null and p_password <> '' then crypt(p_password, gen_salt('bf')) else password_hash end,
      daily_amount = coalesce(p_daily_amount, daily_amount),
      active = coalesce(p_active, active)
    where id = p_id and company_id = v_company_id
    returning * into v_member;
  end if;
  return v_member;
end;
$$;

create or replace function admin_delete_member(p_token uuid, p_id uuid)
returns void
language sql
security definer
as $$
  delete from members where id = p_id and company_id = _admin_company(p_token);
$$;

-- ---------------------------------------------------------------------
-- Seller: mark today's (or any date's) attendance.
-- p_member_numbers: e.g. ARRAY[1,5,10,15,25,30,50] -- only these get charged.
-- Idempotent: re-marking someone already marked for that date is a no-op.
-- ---------------------------------------------------------------------
create or replace function mark_attendance(p_token uuid, p_date date, p_member_numbers int[])
returns table(marked int, already int, unknown int)
language plpgsql
security definer
as $$
declare
  v_company_id uuid;
  v_num int;
  v_member members%rowtype;
  v_marked int := 0;
  v_already int := 0;
  v_unknown int := 0;
begin
  v_company_id := _admin_company(p_token);
  if v_company_id is null then raise exception 'Not authorized'; end if;

  foreach v_num in array p_member_numbers loop
    select * into v_member from members where company_id = v_company_id and member_number = v_num and active;
    if v_member.id is null then
      v_unknown := v_unknown + 1;
      continue;
    end if;
    begin
      insert into attendance(company_id, member_id, visit_date, amount)
      values (v_company_id, v_member.id, p_date, v_member.daily_amount);
      v_marked := v_marked + 1;
    exception when unique_violation then
      v_already := v_already + 1;
    end;
  end loop;

  return query select v_marked, v_already, v_unknown;
end;
$$;

create or replace function admin_unmark_attendance(p_token uuid, p_date date, p_member_number int)
returns void
language plpgsql
security definer
as $$
declare
  v_company_id uuid;
  v_member_id uuid;
begin
  v_company_id := _admin_company(p_token);
  if v_company_id is null then raise exception 'Not authorized'; end if;
  select id into v_member_id from members where company_id = v_company_id and member_number = p_member_number;
  delete from attendance where company_id = v_company_id and member_id = v_member_id and visit_date = p_date;
end;
$$;

-- Raw attendance rows for the seller's charts (app aggregates by day/month/year).
create or replace function admin_get_attendance(p_token uuid, p_days int default 400)
returns setof attendance
language sql
security definer
as $$
  select a.* from attendance a
  where a.company_id = _admin_company(p_token)
  and a.visit_date >= (current_date - p_days)
  order by a.visit_date desc;
$$;

-- Present/absent + amount for every member on one specific date (for the
-- attendance-marking screen so the seller can see who's already ticked).
create or replace function admin_attendance_for_date(p_token uuid, p_date date)
returns table(member_number int, member_name text, present boolean, amount numeric)
language sql
security definer
as $$
  select m.member_number, m.name,
    (a.id is not null) as present,
    coalesce(a.amount, 0) as amount
  from members m
  left join attendance a on a.member_id = m.id and a.visit_date = p_date
  where m.company_id = _admin_company(p_token) and m.active
  order by m.member_number;
$$;

-- ---------------------------------------------------------------------
-- Seed: give the demo company a seller username + a few demo members so
-- there's something to click around immediately (safe to re-run).
-- ---------------------------------------------------------------------
update companies set seller_username = 'demo_seller'
where slug = 'demo' and seller_username is null;

insert into members (company_id, member_number, name, username, password_hash, daily_amount)
select c.id, x.member_number, x.name, x.username, crypt(x.password, gen_salt('bf')), 250
from companies c,
(values
  (1, 'Member One',   'member1',  'member123'),
  (5, 'Member Five',  'member5',  'member123'),
  (10,'Member Ten',   'member10', 'member123')
) as x(member_number, name, username, password)
where c.slug = 'demo'
and not exists (select 1 from members m where m.company_id = c.id);

-- To add a new company with membership billing:
--   insert into companies (slug, name, emoji, admin_password_hash, seller_username)
--   values ('acme', 'Acme Corp', '🍔', crypt('a-real-password', gen_salt('bf')), 'acme_seller');
-- Then add its members:
--   insert into members (company_id, member_number, name, username, password_hash, daily_amount)
--   select id, 1, 'First Member', 'user1', crypt('a-real-password', gen_salt('bf')), 250
--   from companies where slug = 'acme';

-- =========================================================================
-- v3 add-on: member emails, morning check-in mail (₹250 on "yes"),
--            login counts per company, password self-service, tickets
-- =========================================================================
-- Safe to re-run — everything below is idempotent. If you already ran the
-- file before, just run the WHOLE file again; only the new parts change.
-- =========================================================================

-- 1) Members now have an email — this is where the morning mail goes.
alter table members add column if not exists email text;

-- 2) Login events — powers "how many people logged in, per company".
create table if not exists login_events (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  member_id   uuid references members(id) on delete set null,
  kind        text not null default 'member',   -- 'member' | 'seller'
  created_at  timestamptz not null default now()
);
create index if not exists idx_login_events_company on login_events(company_id, created_at);
alter table login_events enable row level security;
-- no policies: only SECURITY DEFINER functions below can touch it.

-- 3) Tickets — support requests + forgot-password requests.
create table if not exists tickets (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  member_id   uuid references members(id) on delete set null,
  name        text,
  contact     text,                               -- email or phone to reach them
  subject     text not null,
  message     text not null default '',
  type        text not null default 'general',    -- 'general' | 'password_reset'
  status      text not null default 'open',       -- 'open' | 'resolved'
  created_at  timestamptz not null default now()
);
create index if not exists idx_tickets_company on tickets(company_id, status);
alter table tickets enable row level security;
-- no policies: RPC-only access.

-- 4) Daily check-ins — one row per member per day. The morning email links
--    to /checkin/<token>; answering YES charges that member ₹daily_amount
--    (default 250) by inserting an attendance row for that date.
create table if not exists checkins (
  token         uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  member_id     uuid not null references members(id) on delete cascade,
  checkin_date  date not null,
  status        text not null default 'pending',  -- 'pending' | 'yes' | 'no'
  responded_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique(member_id, checkin_date)
);
create index if not exists idx_checkins_company_date on checkins(company_id, checkin_date);
alter table checkins enable row level security;
-- no policies: the token itself is the secret; access via RPCs only.

-- ---------------------------------------------------------------------
-- Re-define the two login functions so they also record a login event.
-- (Same signatures as before — the frontend doesn't change.)
-- ---------------------------------------------------------------------
create or replace function seller_login(p_username text, p_password text)
returns table(token uuid, company_slug text, company_name text)
language plpgsql
security definer
as $$
declare
  v_company companies%rowtype;
  v_token uuid;
begin
  select * into v_company from companies where seller_username = p_username;
  if v_company.id is null then
    return;
  end if;
  if v_company.admin_password_hash <> crypt(p_password, v_company.admin_password_hash) then
    return;
  end if;
  insert into admin_sessions(company_id) values (v_company.id) returning admin_sessions.token into v_token;
  insert into login_events(company_id, kind) values (v_company.id, 'seller');
  return query select v_token, v_company.slug, v_company.name;
end;
$$;

create or replace function member_login(p_company_query text, p_username text, p_password text)
returns table(token uuid, member_id uuid, member_number int, member_name text, company_slug text, company_name text)
language plpgsql
security definer
as $$
declare
  v_company companies%rowtype;
  v_member members%rowtype;
  v_token uuid;
begin
  select * into v_company from companies
    where lower(slug) = lower(trim(p_company_query)) or lower(name) = lower(trim(p_company_query))
    limit 1;
  if v_company.id is null then
    return;
  end if;

  select * into v_member from members where company_id = v_company.id and username = p_username;
  if v_member.id is null then
    return;
  end if;
  if v_member.password_hash <> crypt(p_password, v_member.password_hash) then
    return;
  end if;

  insert into member_sessions(member_id) values (v_member.id) returning member_sessions.token into v_token;
  insert into login_events(company_id, member_id, kind) values (v_company.id, v_member.id, 'member');
  return query select v_token, v_member.id, v_member.member_number, v_member.name, v_company.slug, v_company.name;
end;
$$;

-- ---------------------------------------------------------------------
-- Member self-service: profile (incl. email), change password
-- ---------------------------------------------------------------------
create or replace function get_my_profile(p_token uuid)
returns table(member_number int, member_name text, username text, email text, daily_amount numeric)
language sql
security definer
as $$
  select m.member_number, m.name, m.username, m.email, m.daily_amount
  from _member_from_token(p_token) m
  where m.id is not null;
$$;

create or replace function member_set_email(p_token uuid, p_email text)
returns boolean
language plpgsql
security definer
as $$
declare
  v_member members%rowtype := _member_from_token(p_token);
begin
  if v_member.id is null then raise exception 'Not logged in'; end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That does not look like a valid email address';
  end if;
  update members set email = lower(trim(p_email)) where id = v_member.id;
  return true;
end;
$$;

create or replace function member_change_password(p_token uuid, p_old text, p_new text)
returns boolean
language plpgsql
security definer
as $$
declare
  v_member members%rowtype := _member_from_token(p_token);
begin
  if v_member.id is null then raise exception 'Not logged in'; end if;
  if v_member.password_hash <> crypt(p_old, v_member.password_hash) then
    raise exception 'Current password is incorrect';
  end if;
  if p_new is null or length(p_new) < 6 then
    raise exception 'New password must be at least 6 characters';
  end if;
  update members set password_hash = crypt(p_new, gen_salt('bf')) where id = v_member.id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- admin_upsert_member now also takes the member's email.
-- Drop the old 8-arg version so only this one exists.
-- ---------------------------------------------------------------------
drop function if exists admin_upsert_member(uuid, uuid, int, text, text, text, numeric, boolean);

create or replace function admin_upsert_member(
  p_token uuid, p_id uuid, p_member_number int, p_name text,
  p_username text, p_password text, p_daily_amount numeric, p_active boolean,
  p_email text default null
) returns members
language plpgsql
security definer
as $$
declare
  v_company_id uuid;
  v_member members%rowtype;
begin
  v_company_id := _admin_company(p_token);
  if v_company_id is null then raise exception 'Not authorized'; end if;

  if p_id is null then
    insert into members(company_id, member_number, name, username, password_hash, daily_amount, active, email)
    values (
      v_company_id, p_member_number, p_name, p_username,
      crypt(coalesce(p_password, substr(gen_random_uuid()::text, 1, 8)), gen_salt('bf')),
      coalesce(p_daily_amount, 250), coalesce(p_active, true),
      nullif(lower(trim(p_email)), '')
    )
    returning * into v_member;
  else
    update members set
      member_number = p_member_number,
      name = p_name,
      username = coalesce(p_username, username),
      password_hash = case when p_password is not null and p_password <> '' then crypt(p_password, gen_salt('bf')) else password_hash end,
      daily_amount = coalesce(p_daily_amount, daily_amount),
      active = coalesce(p_active, active),
      email = coalesce(nullif(lower(trim(p_email)), ''), email)
    where id = p_id and company_id = v_company_id
    returning * into v_member;
  end if;
  return v_member;
end;
$$;

-- ---------------------------------------------------------------------
-- Daily check-in flow
-- ---------------------------------------------------------------------
-- Called by the SCHEDULED EDGE FUNCTION every morning (service-role only —
-- execute is revoked from the public anon key below). Creates today's
-- pending check-in row for every active member who has an email, and
-- returns everything the mailer needs (token → link, email, name, amount).
create or replace function create_daily_checkins(p_date date default current_date)
returns table(token uuid, email text, member_name text, member_number int,
              company_name text, company_slug text, daily_amount numeric)
language plpgsql
security definer
as $$
begin
  insert into checkins(company_id, member_id, checkin_date)
  select m.company_id, m.id, p_date
  from members m
  where m.active and m.email is not null
  on conflict (member_id, checkin_date) do nothing;

  return query
  select c.token, m.email, coalesce(m.name, 'Member #' || m.member_number), m.member_number,
         co.name, co.slug, m.daily_amount
  from checkins c
  join members m on m.id = c.member_id
  join companies co on co.id = c.company_id
  where c.checkin_date = p_date and c.status = 'pending' and m.email is not null;
end;
$$;
revoke execute on function create_daily_checkins(date) from public, anon, authenticated;

-- Public: look up a check-in by its token (the token IS the secret link).
create or replace function get_checkin(p_token uuid)
returns table(member_name text, member_number int, company_name text,
              checkin_date date, status text, amount numeric)
language sql
security definer
as $$
  select coalesce(m.name, 'Member #' || m.member_number), m.member_number,
         co.name, c.checkin_date, c.status, m.daily_amount
  from checkins c
  join members m on m.id = c.member_id
  join companies co on co.id = c.company_id
  where c.token = p_token;
$$;

-- Public: answer the check-in from the email link.
-- YES → insert attendance for that date (charges daily_amount, e.g. ₹250).
-- Answering twice is safe; the first answer sticks unless it was 'no' and
-- they change to 'yes' the same day (then attendance is added).
create or replace function respond_checkin(p_token uuid, p_coming boolean)
returns table(status text, amount numeric)
language plpgsql
security definer
as $$
declare
  v_row checkins%rowtype;
  v_member members%rowtype;
begin
  select * into v_row from checkins where checkins.token = p_token;
  if v_row.member_id is null then raise exception 'Invalid or expired check-in link'; end if;
  if v_row.checkin_date <> current_date then
    raise exception 'This check-in link was for %, not today', v_row.checkin_date;
  end if;

  select * into v_member from members where id = v_row.member_id;

  if p_coming then
    begin
      insert into attendance(company_id, member_id, visit_date, amount)
      values (v_row.company_id, v_row.member_id, v_row.checkin_date, v_member.daily_amount);
    exception when unique_violation then null;  -- already charged today
    end;
    update checkins set status = 'yes', responded_at = now() where checkins.token = p_token;
    return query select 'yes'::text, v_member.daily_amount;
  else
    if v_row.status = 'yes' then
      -- already said yes earlier — don't silently un-charge; keep yes.
      return query select 'yes'::text, v_member.daily_amount;
      return;
    end if;
    update checkins set status = 'no', responded_at = now() where checkins.token = p_token;
    return query select 'no'::text, 0::numeric;
  end if;
end;
$$;

-- In-app version for a logged-in member (works even without the email):
create or replace function member_checkin_today(p_token uuid, p_coming boolean)
returns table(status text, amount numeric)
language plpgsql
security definer
as $$
declare
  v_member members%rowtype := _member_from_token(p_token);
  v_checkin_token uuid;
begin
  if v_member.id is null then raise exception 'Not logged in'; end if;

  insert into checkins(company_id, member_id, checkin_date)
  values (v_member.company_id, v_member.id, current_date)
  on conflict (member_id, checkin_date) do nothing;

  select checkins.token into v_checkin_token
  from checkins where member_id = v_member.id and checkin_date = current_date;

  return query select * from respond_checkin(v_checkin_token, p_coming);
end;
$$;

create or replace function member_checkin_status(p_token uuid)
returns table(status text, amount numeric)
language sql
security definer
as $$
  select coalesce(c.status, 'none'), m.daily_amount
  from _member_from_token(p_token) m
  left join checkins c on c.member_id = m.id and c.checkin_date = current_date
  where m.id is not null;
$$;

-- ---------------------------------------------------------------------
-- Tickets
-- ---------------------------------------------------------------------
-- Public (no login needed — this is also the "forgot password" path):
create or replace function raise_ticket(
  p_company_query text, p_name text, p_contact text,
  p_subject text, p_message text, p_type text default 'general'
) returns boolean
language plpgsql
security definer
as $$
declare
  v_company companies%rowtype;
begin
  select * into v_company from companies
    where lower(slug) = lower(trim(p_company_query)) or lower(name) = lower(trim(p_company_query))
    limit 1;
  if v_company.id is null then raise exception 'Unknown company — check the company name'; end if;
  if coalesce(trim(p_subject), '') = '' then raise exception 'Subject is required'; end if;
  if p_type not in ('general', 'password_reset') then p_type := 'general'; end if;

  insert into tickets(company_id, name, contact, subject, message, type)
  values (v_company.id, p_name, p_contact, p_subject, coalesce(p_message, ''), p_type);
  return true;
end;
$$;

-- Logged-in member raising a ticket (auto-attached to their account):
create or replace function member_raise_ticket(p_token uuid, p_subject text, p_message text)
returns boolean
language plpgsql
security definer
as $$
declare
  v_member members%rowtype := _member_from_token(p_token);
begin
  if v_member.id is null then raise exception 'Not logged in'; end if;
  if coalesce(trim(p_subject), '') = '' then raise exception 'Subject is required'; end if;
  insert into tickets(company_id, member_id, name, contact, subject, message, type)
  values (v_member.company_id, v_member.id,
          coalesce(v_member.name, 'Member #' || v_member.member_number),
          v_member.email, p_subject, coalesce(p_message, ''), 'general');
  return true;
end;
$$;

create or replace function admin_list_tickets(p_token uuid)
returns setof tickets
language sql
security definer
as $$
  select * from tickets
  where company_id = _admin_company(p_token)
  order by (status = 'open') desc, created_at desc;
$$;

create or replace function admin_set_ticket_status(p_token uuid, p_id uuid, p_status text)
returns void
language plpgsql
security definer
as $$
declare
  v_company_id uuid := _admin_company(p_token);
begin
  if v_company_id is null then raise exception 'Not authorized'; end if;
  if p_status not in ('open', 'resolved') then raise exception 'Invalid status'; end if;
  update tickets set status = p_status where id = p_id and company_id = v_company_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Login stats
-- ---------------------------------------------------------------------
-- Your own company's numbers:
create or replace function admin_login_stats(p_token uuid)
returns table(today_logins bigint, today_unique_members bigint,
              month_logins bigint, total_logins bigint)
language sql
security definer
as $$
  select
    count(*) filter (where created_at::date = current_date and kind = 'member'),
    count(distinct member_id) filter (where created_at::date = current_date and kind = 'member'),
    count(*) filter (where date_trunc('month', created_at) = date_trunc('month', now()) and kind = 'member'),
    count(*) filter (where kind = 'member')
  from login_events
  where company_id = _admin_company(p_token);
$$;

-- "For every company, how many people logged in" — visible to any
-- logged-in seller (counts only, no names/PII from other companies):
create or replace function admin_all_company_login_counts(p_token uuid)
returns table(company_name text, company_slug text,
              members_total bigint, logins_today bigint,
              unique_members_today bigint, logins_total bigint)
language plpgsql
security definer
as $$
begin
  if _admin_company(p_token) is null then raise exception 'Not authorized'; end if;
  return query
  select co.name, co.slug,
    (select count(*) from members m where m.company_id = co.id and m.active),
    (select count(*) from login_events e where e.company_id = co.id and e.kind = 'member' and e.created_at::date = current_date),
    (select count(distinct e.member_id) from login_events e where e.company_id = co.id and e.kind = 'member' and e.created_at::date = current_date),
    (select count(*) from login_events e where e.company_id = co.id and e.kind = 'member')
  from companies co
  order by co.name;
end;
$$;

-- =========================================================================
-- v4: the member's EMAIL is their login — no separate username.
-- =========================================================================
-- Whatever email a member logs in with (gmail, outlook, anything) is the
-- address the morning check-in mail goes to. Safe to re-run.
-- =========================================================================

-- Backfill: any existing member whose username already looks like an email
-- gets it copied into the email column automatically.
update members set email = lower(username)
where email is null and username ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';

-- Login: case-insensitive email/username match. On successful login, if the
-- identifier looks like an email, it auto-fills the email column — so the
-- morning-mail list builds itself from logins.
create or replace function member_login(p_company_query text, p_username text, p_password text)
returns table(token uuid, member_id uuid, member_number int, member_name text, company_slug text, company_name text)
language plpgsql
security definer
as $$
declare
  v_company companies%rowtype;
  v_member members%rowtype;
  v_token uuid;
begin
  select * into v_company from companies
    where lower(slug) = lower(trim(p_company_query)) or lower(name) = lower(trim(p_company_query))
    limit 1;
  if v_company.id is null then
    return;
  end if;

  select * into v_member from members
    where company_id = v_company.id and lower(username) = lower(trim(p_username));
  if v_member.id is null then
    return;
  end if;
  if v_member.password_hash <> crypt(p_password, v_member.password_hash) then
    return;
  end if;

  if v_member.email is null and v_member.username ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    update members set email = lower(trim(v_member.username)) where id = v_member.id;
  end if;

  insert into member_sessions(member_id) values (v_member.id) returning member_sessions.token into v_token;
  insert into login_events(company_id, member_id, kind) values (v_company.id, v_member.id, 'member');
  return query select v_token, v_member.id, v_member.member_number, v_member.name, v_company.slug, v_company.name;
end;
$$;

-- Seller adds a member with just: number, name, EMAIL, password.
-- The email becomes both the login and the morning-mail address.
drop function if exists admin_upsert_member(uuid, uuid, int, text, text, text, numeric, boolean, text);
drop function if exists admin_upsert_member(uuid, uuid, int, text, text, text, numeric, boolean);

create or replace function admin_upsert_member(
  p_token uuid, p_id uuid, p_member_number int, p_name text,
  p_email text, p_password text, p_daily_amount numeric, p_active boolean
) returns members
language plpgsql
security definer
as $$
declare
  v_company_id uuid;
  v_member members%rowtype;
  v_email text := lower(trim(p_email));
begin
  v_company_id := _admin_company(p_token);
  if v_company_id is null then raise exception 'Not authorized'; end if;

  if p_id is null then
    if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'A valid email is required — it is the member''s login and where the morning mail goes';
    end if;
    insert into members(company_id, member_number, name, username, password_hash, daily_amount, active, email)
    values (
      v_company_id, p_member_number, p_name, v_email,
      crypt(coalesce(p_password, substr(gen_random_uuid()::text, 1, 8)), gen_salt('bf')),
      coalesce(p_daily_amount, 250), coalesce(p_active, true), v_email
    )
    returning * into v_member;
  else
    if v_email is not null and v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'That does not look like a valid email address';
    end if;
    update members set
      member_number = p_member_number,
      name = p_name,
      username = coalesce(nullif(v_email, ''), username),
      email = coalesce(nullif(v_email, ''), email),
      password_hash = case when p_password is not null and p_password <> '' then crypt(p_password, gen_salt('bf')) else password_hash end,
      daily_amount = coalesce(p_daily_amount, daily_amount),
      active = coalesce(p_active, active)
    where id = p_id and company_id = v_company_id
    returning * into v_member;
  end if;
  return v_member;
end;
$$;

-- Changing your email (rarely needed now) also moves your login with it.
create or replace function member_set_email(p_token uuid, p_email text)
returns boolean
language plpgsql
security definer
as $$
declare
  v_member members%rowtype := _member_from_token(p_token);
  v_email text := lower(trim(p_email));
begin
  if v_member.id is null then raise exception 'Not logged in'; end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That does not look like a valid email address';
  end if;
  update members set email = v_email, username = v_email where id = v_member.id;
  return true;
end;
$$;

-- =========================================================================
-- v5: member login with ONLY email + password (no company field).
-- =========================================================================
-- The company is found automatically from the email. Company is only
-- involved at CREATION time (seller adds the member). Safe to re-run.
-- =========================================================================

create or replace function member_login_v2(p_email text, p_password text)
returns table(token uuid, member_id uuid, member_number int, member_name text, company_slug text, company_name text)
language plpgsql
security definer
as $$
declare
  v_member members%rowtype;
  v_company companies%rowtype;
  v_token uuid;
begin
  -- The same email could exist in more than one company; check the password
  -- against each match and log into the one it unlocks.
  for v_member in
    select m.* from members m
    where (lower(m.username) = lower(trim(p_email)) or lower(m.email) = lower(trim(p_email)))
      and m.active
    order by m.created_at desc
  loop
    if v_member.password_hash = crypt(p_password, v_member.password_hash) then
      select * into v_company from companies where id = v_member.company_id;

      if v_member.email is null and v_member.username ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        update members set email = lower(trim(v_member.username)) where id = v_member.id;
      end if;

      insert into member_sessions(member_id) values (v_member.id) returning member_sessions.token into v_token;
      insert into login_events(company_id, member_id, kind) values (v_company.id, v_member.id, 'member');
      return query select v_token, v_member.id, v_member.member_number, v_member.name, v_company.slug, v_company.name;
      return;
    end if;
  end loop;
  return; -- no match → empty result → "wrong email or password"
end;
$$;

-- Forgot password with ONLY the email — company found automatically.
create or replace function raise_ticket_by_email(p_email text, p_contact text)
returns boolean
language plpgsql
security definer
as $$
declare
  v_member members%rowtype;
begin
  select m.* into v_member from members m
  where lower(m.username) = lower(trim(p_email)) or lower(m.email) = lower(trim(p_email))
  order by m.created_at desc
  limit 1;

  if v_member.id is null then
    raise exception 'No account found with that email — check the spelling or ask your seller to add you';
  end if;

  insert into tickets(company_id, member_id, name, contact, subject, message, type)
  values (
    v_member.company_id, v_member.id,
    coalesce(v_member.name, 'Member #' || v_member.member_number),
    coalesce(nullif(trim(p_contact), ''), v_member.email, v_member.username),
    'Password reset — ' || coalesce(v_member.email, v_member.username),
    'This member forgot their password and requested a reset from the login page.',
    'password_reset'
  );
  return true;
end;
$$;
