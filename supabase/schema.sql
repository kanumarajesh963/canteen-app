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

-- Drop any newer variant first so re-running this whole file on an upgraded
-- database never hits "cannot change name of input parameter". The final
-- (correct) version is re-created at the bottom of this file.
drop function if exists admin_upsert_member(uuid, uuid, int, text, text, text, numeric, boolean);
drop function if exists admin_upsert_member(uuid, uuid, int, text, text, text, numeric, boolean, text);

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

-- =========================================================================
-- v6 add-on: OTP-verified password reset, ticket email notifications,
--            admin replies to tickets, member's own ticket list.
-- =========================================================================
-- Safe to re-run — everything below is idempotent. Run the WHOLE file again
-- and only this new section changes anything.
-- =========================================================================

-- 1) Tickets can now carry a reply from the seller.
alter table tickets add column if not exists reply text;
alter table tickets add column if not exists replied_at timestamptz;

-- 2) Small key/value config table so the notify-new-ticket trigger below can
--    find your Edge Function URL + service role key without editing SQL.
--    Fill these in AFTER you deploy the notify-new-ticket function (README).
create table if not exists app_config (
  key   text primary key,
  value text not null
);
insert into app_config (key, value) values
  ('edge_function_url', 'https://YOUR-PROJECT-REF.supabase.co/functions/v1'),
  ('service_role_key',  'YOUR-SERVICE-ROLE-KEY'),
  ('support_email',     'support@canteen.com')
on conflict (key) do nothing;
alter table app_config enable row level security;
-- no policies: nothing in the browser (anon key) can read or write this.

-- 3) One-time passwords for password reset. A code is only ever valid for
--    10 minutes and can only be used once.
create table if not exists password_reset_otps (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  otp_code    text not null,
  expires_at  timestamptz not null,
  used        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_password_reset_otps_email on password_reset_otps(email, used, expires_at);
alter table password_reset_otps enable row level security;
-- no policies: RPC-only access, and generate_password_otp is service_role-only.

-- ---------------------------------------------------------------------
-- Notify support@canteen.com by email whenever a new ticket is raised.
-- Fires on every insert into tickets; calls the notify-new-ticket Edge
-- Function via pg_net using the URL/key stored in app_config above. If
-- those are still the placeholder values, it quietly does nothing instead
-- of erroring — so this is safe to run before you've deployed the function.
-- ---------------------------------------------------------------------
create or replace function notify_new_ticket()
returns trigger
language plpgsql
security definer
as $$
declare
  v_url text;
  v_key text;
  v_company companies%rowtype;
begin
  select value into v_url from app_config where key = 'edge_function_url';
  select value into v_key from app_config where key = 'service_role_key';

  if v_url is null or v_key is null
     or v_url = 'https://YOUR-PROJECT-REF.supabase.co/functions/v1'
     or v_key = 'YOUR-SERVICE-ROLE-KEY' then
    return new; -- not configured yet — skip silently, don't block the insert
  end if;

  select * into v_company from companies where id = new.company_id;

  perform net.http_post(
    url := v_url || '/notify-new-ticket',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'ticket_id', new.id,
      'company_name', coalesce(v_company.name, 'Unknown company'),
      'type', new.type,
      'subject', new.subject,
      'message', new.message,
      'name', coalesce(new.name, 'Anonymous'),
      'contact', new.contact
    )
  );
  return new;
exception when others then
  -- Never let a notification failure block the ticket from being created.
  return new;
end;
$$;

drop trigger if exists trg_notify_new_ticket on tickets;
create trigger trg_notify_new_ticket
  after insert on tickets
  for each row execute function notify_new_ticket();

-- ---------------------------------------------------------------------
-- Admin (seller) replies to a ticket. Sets the reply and marks resolved.
-- ---------------------------------------------------------------------
create or replace function admin_reply_ticket(p_token uuid, p_id uuid, p_reply text)
returns tickets
language plpgsql
security definer
as $$
declare
  v_company_id uuid := _admin_company(p_token);
  v_ticket tickets%rowtype;
begin
  if v_company_id is null then raise exception 'Not authorized'; end if;
  if coalesce(trim(p_reply), '') = '' then raise exception 'Reply cannot be empty'; end if;

  update tickets
  set reply = p_reply, replied_at = now(), status = 'resolved'
  where id = p_id and company_id = v_company_id
  returning * into v_ticket;

  if v_ticket.id is null then raise exception 'Ticket not found'; end if;
  return v_ticket;
end;
$$;

-- ---------------------------------------------------------------------
-- A logged-in member's own tickets (so they can see the seller's reply).
-- ---------------------------------------------------------------------
create or replace function member_list_tickets(p_token uuid)
returns setof tickets
language sql
security definer
as $$
  select t.* from tickets t
  join member_sessions s on s.member_id = t.member_id
  where s.token = p_token and t.member_id is not null
  order by t.created_at desc;
$$;

-- ---------------------------------------------------------------------
-- OTP-verified password reset.
-- ---------------------------------------------------------------------
-- Step 1: generate a 6-digit code for an email, valid 10 minutes.
-- SERVICE-ROLE ONLY: the frontend never calls this directly — it goes
-- through the send-password-otp Edge Function, which is the only thing
-- that actually emails the code out. That's what keeps this from being a
-- way to read someone else's OTP straight from the browser.
create or replace function generate_password_otp(p_email text)
returns table(otp_code text, member_name text, company_name text, found boolean)
language plpgsql
security definer
as $$
declare
  v_member members%rowtype;
  v_company companies%rowtype;
  v_code text;
begin
  select m.* into v_member from members m
  where (lower(m.username) = lower(trim(p_email)) or lower(m.email) = lower(trim(p_email)))
    and m.active
  order by m.created_at desc
  limit 1;

  if v_member.id is null then
    return query select null::text, null::text, null::text, false;
    return;
  end if;

  select * into v_company from companies where id = v_member.company_id;
  v_code := lpad(floor(random() * 1000000)::text, 6, '0');

  insert into password_reset_otps(email, otp_code, expires_at)
  values (lower(trim(p_email)), v_code, now() + interval '10 minutes');

  return query select v_code, coalesce(v_member.name, 'Member #' || v_member.member_number), v_company.name, true;
end;
$$;

revoke execute on function generate_password_otp(text) from public, anon, authenticated;
grant execute on function generate_password_otp(text) to service_role;

-- Step 2: verify the code and set a new password. Callable from the browser.
create or replace function verify_and_reset_password(p_email text, p_otp text, p_new_password text)
returns boolean
language plpgsql
security definer
as $$
declare
  v_otp password_reset_otps%rowtype;
  v_member members%rowtype;
begin
  if coalesce(length(p_new_password), 0) < 6 then
    raise exception 'New password must be at least 6 characters';
  end if;

  select * into v_otp from password_reset_otps
  where lower(email) = lower(trim(p_email))
    and otp_code = trim(p_otp)
    and not used
    and expires_at > now()
  order by created_at desc
  limit 1;

  if v_otp.id is null then
    raise exception 'That code is invalid or has expired — request a new one';
  end if;

  select * into v_member from members m
  where (lower(m.username) = lower(trim(p_email)) or lower(m.email) = lower(trim(p_email)))
    and m.active
  order by m.created_at desc
  limit 1;

  if v_member.id is null then
    raise exception 'Account not found';
  end if;

  update members set password_hash = crypt(p_new_password, gen_salt('bf')) where id = v_member.id;
  update password_reset_otps set used = true where id = v_otp.id;
  -- burn any other outstanding codes for this email too
  update password_reset_otps set used = true
  where lower(email) = lower(trim(p_email)) and not used;

  return true;
end;
$$;

-- =========================================================================
-- v7 add-on: seller self-signup (create your own company), with an
--            optional OTP-verification step before the company is created.
-- =========================================================================
-- Safe to re-run. This is what src/pages/Sellersignup.jsx talks to.
-- =========================================================================

alter table companies add column if not exists company_code text unique;

-- Toggle whether signup requires an emailed OTP before creating the company.
-- Off by default — flip to 'true' any time in the SQL editor:
--   update app_config set value = 'true' where key = 'seller_signup_otp_required';
insert into app_config (key, value) values ('seller_signup_otp_required', 'false')
on conflict (key) do nothing;

-- Publicly readable — the signup page checks this before deciding whether
-- to show the OTP step. Contains no secrets.
create or replace function get_signup_settings()
returns table(otp_required boolean)
language sql
security definer
as $$
  select coalesce((select value from app_config where key = 'seller_signup_otp_required'), 'false') = 'true';
$$;

create table if not exists signup_otps (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  otp_code    text not null,
  expires_at  timestamptz not null,
  used        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_signup_otps_email on signup_otps(email, used, expires_at);
alter table signup_otps enable row level security;
-- no policies: RPC-only, and generate_signup_otp is service_role-only.

-- SERVICE-ROLE ONLY — called by the send-seller-signup-otp Edge Function,
-- which is the only thing that actually emails the code out.
create or replace function generate_signup_otp(p_email text)
returns text
language plpgsql
security definer
as $$
declare
  v_code text := lpad(floor(random() * 1000000)::text, 6, '0');
begin
  insert into signup_otps(email, otp_code, expires_at)
  values (lower(trim(p_email)), v_code, now() + interval '10 minutes');
  return v_code;
end;
$$;

revoke execute on function generate_signup_otp(text) from public, anon, authenticated;
grant execute on function generate_signup_otp(text) to service_role;

-- Turn "Acme Corp Canteen" into a unique, URL-safe slug like "acme-corp-canteen",
-- "acme-corp-canteen-2" if that's taken, etc.
create or replace function _slugify_company_name(p_name text)
returns text
language plpgsql
as $$
declare
  v_base text;
  v_slug text;
  v_n int := 1;
begin
  v_base := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base := trim(both '-' from v_base);
  if v_base = '' then v_base := 'canteen'; end if;
  v_slug := v_base;
  while exists (select 1 from companies where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  return v_slug;
end;
$$;

-- A short, shareable, unique code for the company (shown to the seller after
-- signup — handy as a human-friendly identifier alongside the URL slug).
create or replace function _generate_company_code()
returns text
language plpgsql
as $$
declare
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I ambiguity
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    exit when not exists (select 1 from companies where company_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- Create a brand-new company + its first seller login, in one step.
-- If OTP is required (see get_signup_settings), p_otp must match a code
-- generated for p_email within the last 10 minutes.
create or replace function seller_signup(p_email text, p_password text, p_company_name text, p_otp text default null)
returns table(token uuid, company_slug text, company_name text, company_code text)
language plpgsql
security definer
as $$
declare
  v_email text := lower(trim(p_email));
  v_otp_required boolean;
  v_otp signup_otps%rowtype;
  v_slug text;
  v_code text;
  v_company_id uuid;
  v_token uuid;
begin
  if coalesce(trim(p_company_name), '') = '' then raise exception 'Company name is required'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'A valid email is required'; end if;
  if coalesce(length(p_password), 0) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  if exists (select 1 from companies where seller_username = v_email) then
    raise exception 'An account with that email already exists — try logging in instead';
  end if;

  select otp_required into v_otp_required from get_signup_settings();
  if v_otp_required then
    select * into v_otp from signup_otps
    where lower(email) = v_email and otp_code = trim(coalesce(p_otp, '')) and not used and expires_at > now()
    order by created_at desc limit 1;
    if v_otp.id is null then
      raise exception 'That code is invalid or has expired — request a new one';
    end if;
    update signup_otps set used = true where id = v_otp.id;
  end if;

  v_slug := _slugify_company_name(p_company_name);
  v_code := _generate_company_code();

  insert into companies (slug, name, admin_password_hash, seller_username, company_code)
  values (v_slug, trim(p_company_name), crypt(p_password, gen_salt('bf')), v_email, v_code)
  returning id into v_company_id;

  insert into admin_sessions(company_id) values (v_company_id) returning admin_sessions.token into v_token;

  return query select v_token, v_slug, trim(p_company_name), v_code;
end;
$$;

-- =========================================================================
-- v8 add-on: production auth flow
--   * Seller signup OTP is now ALWAYS required.
--   * Members can self-signup with their company's code + emailed OTP.
--   * Backfills company_code for companies created before v7.
-- =========================================================================
-- Safe to re-run — everything below is idempotent. Run the WHOLE file again
-- in the SQL Editor and only this new section changes anything.
-- =========================================================================

-- 1) OTP verification is mandatory for seller signup from now on.
insert into app_config (key, value) values ('seller_signup_otp_required', 'true')
on conflict (key) do update set value = 'true';

-- 2) Older companies (created before v7) never got a company_code — give
--    them one so their members can self-signup too.
update companies set company_code = _generate_company_code() where company_code is null;

-- 3) Member self-signup: email + password + name + COMPANY CODE + OTP.
--    The OTP reuses the same signup_otps table + send-seller-signup-otp
--    Edge Function (it just emails a code — purpose-agnostic).
--    Returns a ready-to-use member session, exactly like member_login_v2.
create or replace function member_self_signup(
  p_email text, p_password text, p_name text, p_company_code text, p_otp text
)
returns table(token uuid, member_id uuid, member_number int, member_name text, company_slug text, company_name text)
language plpgsql
security definer
as $$
declare
  v_email text := lower(trim(p_email));
  v_company companies%rowtype;
  v_otp signup_otps%rowtype;
  v_number int;
  v_member members%rowtype;
  v_token uuid;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email is required';
  end if;
  if coalesce(length(p_password), 0) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if coalesce(trim(p_company_code), '') = '' then
    raise exception 'Company code is required — ask your canteen seller for it';
  end if;

  select * into v_company from companies
  where upper(companies.company_code) = upper(trim(p_company_code));
  if v_company.id is null then
    raise exception 'That company code doesn''t match any canteen — double-check it with your seller';
  end if;

  if exists (
    select 1 from members m
    where m.company_id = v_company.id
      and (lower(m.username) = v_email or lower(m.email) = v_email)
  ) then
    raise exception 'An account with that email already exists here — try signing in instead';
  end if;

  -- OTP is always required for member signup.
  select * into v_otp from signup_otps
  where lower(email) = v_email
    and otp_code = trim(coalesce(p_otp, ''))
    and not used
    and expires_at > now()
  order by created_at desc
  limit 1;
  if v_otp.id is null then
    raise exception 'That code is invalid or has expired — request a new one';
  end if;
  update signup_otps set used = true where id = v_otp.id;

  select coalesce(max(m.member_number), 0) + 1 into v_number
  from members m where m.company_id = v_company.id;

  insert into members(company_id, member_number, name, username, email, password_hash, daily_amount, active)
  values (
    v_company.id, v_number, nullif(trim(p_name), ''), v_email, v_email,
    crypt(p_password, gen_salt('bf')), 250, true
  )
  returning * into v_member;

  insert into member_sessions(member_id) values (v_member.id)
  returning member_sessions.token into v_token;
  insert into login_events(company_id, member_id, kind) values (v_company.id, v_member.id, 'member');

  return query select v_token, v_member.id, v_member.member_number, v_member.name, v_company.slug, v_company.name;
end;
$$;

-- 4) Cheap "is my stored session still valid?" checks — the app calls these
--    on load so an expired token sends you back to Sign In instead of
--    showing an empty, broken screen.
create or replace function admin_session_valid(p_token uuid)
returns boolean
language sql
security definer
as $$
  select _admin_company(p_token) is not null;
$$;

create or replace function member_session_valid(p_token uuid)
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from member_sessions
    where token = p_token and expires_at > now()
  );
$$;

-- =========================================================================
-- v9 add-on: demo accounts shown on the login screen.
-- =========================================================================
-- Creates/refreshes a Demo Canteen with 1 seller + 4 members, all with the
-- password demo123, company code DEMO99. Safe to re-run any time.
-- Remove the demo before/after your real launch with:
--   delete from companies where slug = 'demo';
-- =========================================================================

do $$
declare
  v_company_id uuid;
begin
  select id into v_company_id from companies where slug = 'demo';
  if v_company_id is null then
    insert into companies (slug, name, emoji, admin_password_hash)
    values ('demo', 'Demo Canteen', '🍱', crypt('demo123', gen_salt('bf')))
    returning id into v_company_id;
  end if;

  -- Demo seller login + password (guarded so unique constraints can't break a re-run)
  update companies set admin_password_hash = crypt('demo123', gen_salt('bf')), name = 'Demo Canteen'
  where id = v_company_id;
  update companies set seller_username = 'seller@demo.com'
  where id = v_company_id
    and not exists (select 1 from companies where seller_username = 'seller@demo.com' and id <> v_company_id);
  update companies set company_code = 'DEMO99'
  where id = v_company_id
    and company_code is distinct from 'DEMO99'
    and not exists (select 1 from companies where company_code = 'DEMO99' and id <> v_company_id);
  update companies set company_code = _generate_company_code()
  where id = v_company_id and company_code is null;

  -- 4 demo members (high member numbers so they never collide with real ones)
  insert into members (company_id, member_number, name, username, email, password_hash, daily_amount, active)
  values
    (v_company_id, 9001, 'Rahul Verma',  'rahul@demo.com', 'rahul@demo.com', crypt('demo123', gen_salt('bf')), 250, true),
    (v_company_id, 9002, 'Priya Sharma', 'priya@demo.com', 'priya@demo.com', crypt('demo123', gen_salt('bf')), 250, true),
    (v_company_id, 9003, 'Amit Patel',   'amit@demo.com',  'amit@demo.com',  crypt('demo123', gen_salt('bf')), 250, true),
    (v_company_id, 9004, 'Sneha Reddy',  'sneha@demo.com', 'sneha@demo.com', crypt('demo123', gen_salt('bf')), 250, true)
  on conflict (company_id, username) do update
    set password_hash = excluded.password_hash, active = true,
        name = excluded.name, email = excluded.email;
end $$;

-- =========================================================================
-- Member wallet — ₹250 signup bonus + transaction history
-- =========================================================================
-- Every member gets a starting wallet balance of ₹250 the moment their
-- account is created (member_self_signup). This is separate from
-- `daily_amount` (the per-visit canteen charge used by attendance/checkin) —
-- wallet_balance is a spendable balance, daily_amount is a per-day price.

alter table members add column if not exists wallet_balance numeric not null default 0;

create table if not exists member_wallet_transactions (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  amount      numeric not null,           -- positive = credit, negative = debit
  type        text not null,              -- 'signup_bonus', 'admin_credit', 'admin_debit', 'spend'
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_member_wallet_txn_member on member_wallet_transactions(member_id);

alter table member_wallet_transactions enable row level security;
-- No public policies on purpose — same pattern as `members`: only reachable
-- through security-definer RPC functions below, never directly by anon/auth roles.

-- Re-defines member_self_signup (see earlier definition) to also grant the
-- ₹250 signup bonus and log it as a wallet transaction.
create or replace function member_self_signup(
  p_email text, p_password text, p_name text, p_company_code text, p_otp text
)
returns table(token uuid, member_id uuid, member_number int, member_name text, company_slug text, company_name text, wallet_balance numeric)
language plpgsql
security definer
as $$
declare
  v_email text := lower(trim(p_email));
  v_company companies%rowtype;
  v_otp signup_otps%rowtype;
  v_number int;
  v_member members%rowtype;
  v_token uuid;
  v_signup_bonus numeric := 250;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email is required';
  end if;
  if coalesce(length(p_password), 0) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if coalesce(trim(p_company_code), '') = '' then
    raise exception 'Company code is required — ask your canteen seller for it';
  end if;

  select * into v_company from companies
  where upper(companies.company_code) = upper(trim(p_company_code));
  if v_company.id is null then
    raise exception 'That company code doesn''t match any canteen — double-check it with your seller';
  end if;

  if exists (
    select 1 from members m
    where m.company_id = v_company.id
      and (lower(m.username) = v_email or lower(m.email) = v_email)
  ) then
    raise exception 'An account with that email already exists here — try signing in instead';
  end if;

  -- OTP is always required for member signup.
  select * into v_otp from signup_otps
  where lower(email) = v_email
    and otp_code = trim(coalesce(p_otp, ''))
    and not used
    and expires_at > now()
  order by created_at desc
  limit 1;
  if v_otp.id is null then
    raise exception 'That code is invalid or has expired — request a new one';
  end if;
  update signup_otps set used = true where id = v_otp.id;

  select coalesce(max(m.member_number), 0) + 1 into v_number
  from members m where m.company_id = v_company.id;

  insert into members(company_id, member_number, name, username, email, password_hash, daily_amount, active, wallet_balance)
  values (
    v_company.id, v_number, nullif(trim(p_name), ''), v_email, v_email,
    crypt(p_password, gen_salt('bf')), 250, true, v_signup_bonus
  )
  returning * into v_member;

  insert into member_wallet_transactions(company_id, member_id, amount, type, note)
  values (v_company.id, v_member.id, v_signup_bonus, 'signup_bonus', 'Welcome bonus on joining ' || v_company.name);

  insert into member_sessions(member_id) values (v_member.id)
  returning member_sessions.token into v_token;
  insert into login_events(company_id, member_id, kind) values (v_company.id, v_member.id, 'member');

  return query select v_token, v_member.id, v_member.member_number, v_member.name, v_company.slug, v_company.name, v_member.wallet_balance;
end;
$$;

-- Re-defines get_my_profile to also return the wallet balance.
create or replace function get_my_profile(p_token uuid)
returns table(member_number int, member_name text, username text, email text, daily_amount numeric, wallet_balance numeric)
language sql
security definer
as $$
  select m.member_number, m.name, m.username, m.email, m.daily_amount, m.wallet_balance
  from _member_from_token(p_token) m
  where m.id is not null;
$$;

-- Member's own wallet transaction history (mirrors get_wallet_transactions
-- for the phone/customer flow, but scoped to the logged-in member's token).
create or replace function get_my_wallet_transactions(p_token uuid)
returns setof member_wallet_transactions
language sql
security definer
as $$
  select wt.* from member_wallet_transactions wt
  join _member_from_token(p_token) m on m.id = wt.member_id
  order by wt.created_at desc
  limit 100;
$$;

-- =========================================================================
-- Khata — the village-shop credit tab. A member can take items "on credit"
-- instead of paying immediately; the seller logs product + price, and it
-- adds up into a running due balance per member. Seller can settle
-- (mark paid) any time. Tracked per company, so with many members the
-- seller gets one dashboard of everyone's outstanding tab.
-- =========================================================================

create table if not exists khata_entries (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  member_id    uuid not null references members(id) on delete cascade,
  product_name text not null,
  price        numeric not null check (price > 0),
  qty          int not null default 1 check (qty > 0),
  status       text not null default 'due' check (status in ('due', 'settled')),
  note         text,
  created_at   timestamptz not null default now(),
  settled_at   timestamptz
);
create index if not exists idx_khata_company on khata_entries(company_id);
create index if not exists idx_khata_member on khata_entries(member_id);
create index if not exists idx_khata_status on khata_entries(company_id, status);

alter table khata_entries enable row level security;
-- No public policies — same pattern as `members`/`member_wallet_transactions`:
-- only reachable through the security-definer RPC functions below.

-- Seller: log a new khata entry for one of their members.
create or replace function admin_add_khata_entry(
  p_token uuid, p_member_id uuid, p_product_name text, p_price numeric, p_qty int default 1, p_note text default null
)
returns khata_entries
language plpgsql
security definer
as $$
declare
  v_company_id uuid := _admin_company(p_token);
  v_row khata_entries%rowtype;
begin
  if v_company_id is null then raise exception 'Not authorized'; end if;
  if coalesce(trim(p_product_name), '') = '' then raise exception 'Product name is required'; end if;
  if p_price is null or p_price <= 0 then raise exception 'Price must be greater than 0'; end if;
  if not exists (select 1 from members where id = p_member_id and company_id = v_company_id) then
    raise exception 'That member does not belong to your company';
  end if;

  insert into khata_entries(company_id, member_id, product_name, price, qty, note)
  values (v_company_id, p_member_id, trim(p_product_name), p_price, coalesce(p_qty, 1), nullif(trim(coalesce(p_note, '')), ''))
  returning * into v_row;

  return v_row;
end;
$$;

-- Seller: per-member outstanding totals for the whole company (the "khata
-- book" view — one row per member who has ever had an entry).
create or replace function admin_khata_summary(p_token uuid)
returns table(
  member_id uuid, member_number int, member_name text, member_email text,
  due_total numeric, due_count int, last_entry_at timestamptz
)
language sql
security definer
as $$
  select
    m.id, m.member_number, m.name, m.email,
    coalesce(sum(k.price * k.qty) filter (where k.status = 'due'), 0) as due_total,
    count(k.id) filter (where k.status = 'due')::int as due_count,
    max(k.created_at) as last_entry_at
  from members m
  join khata_entries k on k.member_id = m.id
  where m.company_id = _admin_company(p_token)
  group by m.id, m.member_number, m.name, m.email
  having coalesce(sum(k.price * k.qty) filter (where k.status = 'due'), 0) > 0
  order by due_total desc;
$$;

-- Seller: full entry list for one member (their itemized tab).
create or replace function admin_khata_entries(p_token uuid, p_member_id uuid)
returns setof khata_entries
language sql
security definer
as $$
  select k.* from khata_entries k
  where k.member_id = p_member_id and k.company_id = _admin_company(p_token)
  order by k.created_at desc;
$$;

-- Seller: mark a member's outstanding entries as settled (they paid their tab).
create or replace function admin_settle_khata(p_token uuid, p_member_id uuid)
returns int
language plpgsql
security definer
as $$
declare
  v_company_id uuid := _admin_company(p_token);
  v_count int;
begin
  if v_company_id is null then raise exception 'Not authorized'; end if;
  update khata_entries
  set status = 'settled', settled_at = now()
  where member_id = p_member_id and company_id = v_company_id and status = 'due';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Member: their own current tab (used on the member home page).
create or replace function get_my_khata(p_token uuid)
returns table(due_total numeric, entries json)
language sql
security definer
as $$
  select
    coalesce(sum(k.price * k.qty) filter (where k.status = 'due'), 0),
    coalesce(json_agg(json_build_object(
      'id', k.id, 'product_name', k.product_name, 'price', k.price, 'qty', k.qty,
      'status', k.status, 'created_at', k.created_at
    ) order by k.created_at desc) filter (where k.status = 'due'), '[]'::json)
  from khata_entries k
  join _member_from_token(p_token) m on m.id = k.member_id;
$$;

-- =========================================================================
-- v9 — Company codes up to 10 chars, HR role, member-facing khata checkout.
-- Idempotent: safe to re-run the whole file against an existing database.
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1) Company codes: generate 8 chars now (field/column already support up
--    to 10 -- no schema change needed there, company_code was always plain
--    `text unique` with no length constraint). Existing 6-char codes keep
--    working unchanged.
-- ---------------------------------------------------------------------
create or replace function _generate_company_code()
returns text
language plpgsql
as $$
declare
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I ambiguity
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    exit when not exists (select 1 from companies where company_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) HR role: a member with elevated, narrowly-scoped permissions --
--    view attendance/login analytics, view last-login per member, and
--    reset passwords for regular ('member') accounts. Cannot touch other
--    HR accounts or the seller, and cannot do anything admin_* can do.
-- ---------------------------------------------------------------------
alter table members add column if not exists role text not null default 'member';
alter table members add column if not exists khata_eligible boolean not null default false;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'members_role_check'
  ) then
    alter table members add constraint members_role_check check (role in ('member', 'hr'));
  end if;
end $$;

-- Mirrors _admin_company / _member_from_token: resolves a live member
-- session token to a company_id ONLY if that member's role is 'hr'.
create or replace function _hr_company(p_token uuid)
returns uuid
language sql
security definer
as $$
  select m.company_id from members m
  join member_sessions s on s.member_id = m.id
  where s.token = p_token and s.expires_at > now() and m.role = 'hr' and m.active;
$$;

-- admin_upsert_member now also sets role + khata_eligible (seller-only --
-- this is how HR accounts get created/promoted, and how khata eligibility
-- gets turned on per member).
drop function if exists admin_upsert_member(uuid, uuid, int, text, text, text, numeric, boolean, text);
create or replace function admin_upsert_member(
  p_token uuid, p_id uuid, p_member_number int, p_name text,
  p_email text, p_password text, p_daily_amount numeric, p_active boolean,
  p_role text default null, p_khata_eligible boolean default null
) returns members
language plpgsql
security definer
as $$
declare
  v_company_id uuid;
  v_member members%rowtype;
  v_email text := lower(trim(p_email));
  v_role text := nullif(lower(trim(p_role)), '');
begin
  v_company_id := _admin_company(p_token);
  if v_company_id is null then raise exception 'Not authorized'; end if;
  if v_role is not null and v_role not in ('member', 'hr') then
    raise exception 'Role must be member or hr';
  end if;

  if p_id is null then
    if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'A valid email is required — it is the member''s login and where the morning mail goes';
    end if;
    insert into members(company_id, member_number, name, username, password_hash, daily_amount, active, email, role, khata_eligible)
    values (
      v_company_id, p_member_number, p_name, v_email,
      crypt(coalesce(p_password, substr(gen_random_uuid()::text, 1, 8)), gen_salt('bf')),
      coalesce(p_daily_amount, 250), coalesce(p_active, true), v_email,
      coalesce(v_role, 'member'), coalesce(p_khata_eligible, false)
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
      active = coalesce(p_active, active),
      role = coalesce(v_role, role),
      khata_eligible = coalesce(p_khata_eligible, khata_eligible)
    where id = p_id and company_id = v_company_id
    returning * into v_member;
  end if;
  return v_member;
end;
$$;

-- get_my_profile now also returns role + khata_eligible, so the client
-- can branch into the HR panel and show the khata option at checkout.
create or replace function get_my_profile(p_token uuid)
returns table(member_number int, member_name text, username text, email text, daily_amount numeric,
              wallet_balance numeric, role text, khata_eligible boolean)
language sql
security definer
as $$
  select m.member_number, m.name, m.username, m.email, m.daily_amount, m.wallet_balance, m.role, m.khata_eligible
  from _member_from_token(p_token) m
  where m.id is not null;
$$;

-- HR: list regular members in their company, with last-login computed
-- from login_events. Deliberately excludes password_hash, and excludes
-- other HR/seller accounts -- HR only ever sees/manages plain members.
create or replace function hr_list_members(p_token uuid)
returns table(id uuid, member_number int, name text, email text, active boolean,
              daily_amount numeric, khata_eligible boolean, last_login timestamptz)
language sql
security definer
as $$
  select m.id, m.member_number, m.name, m.email, m.active, m.daily_amount, m.khata_eligible,
         (select max(le.created_at) from login_events le where le.member_id = m.id and le.kind = 'member')
  from members m
  where m.company_id = _hr_company(p_token) and m.role = 'member'
  order by m.member_number;
$$;

-- HR: reset a regular member's password. Scoped to role='member' targets
-- only, in HR's own company -- cannot touch other HR accounts or sellers.
create or replace function hr_reset_member_password(p_token uuid, p_member_id uuid, p_new_password text)
returns void
language plpgsql
security definer
as $$
declare
  v_company_id uuid := _hr_company(p_token);
begin
  if v_company_id is null then raise exception 'Not authorized'; end if;
  if coalesce(length(p_new_password), 0) < 6 then
    raise exception 'New password must be at least 6 characters';
  end if;
  update members
  set password_hash = crypt(p_new_password, gen_salt('bf'))
  where id = p_member_id and company_id = v_company_id and role = 'member';
  if not found then raise exception 'Member not found'; end if;
end;
$$;

-- HR: read-only attendance + login-stat views, same shape as the seller's
-- so the dashboard-lite panel can reuse existing chart code.
create or replace function hr_get_attendance(p_token uuid, p_days int default 400)
returns setof attendance
language sql
security definer
as $$
  select a.* from attendance a
  where a.company_id = _hr_company(p_token)
  and a.visit_date >= (current_date - p_days)
  order by a.visit_date desc;
$$;

create or replace function hr_login_stats(p_token uuid)
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
  where company_id = _hr_company(p_token);
$$;

-- ---------------------------------------------------------------------
-- 3) Khata as a real checkout payment method. Members are the identity
--    here (khata_entries.member_id), not the older phone/customer/wallet
--    system -- so this is a member-token-authenticated order, mirroring
--    place_order's stock-locking logic but logging a khata_entries row
--    per line item instead of debiting a wallet.
-- ---------------------------------------------------------------------
create or replace function place_order_khata(
  p_member_token uuid, p_items jsonb, p_device_id text
) returns orders
language plpgsql
security definer
as $$
declare
  v_member members%rowtype;
  v_item jsonb;
  v_product products%rowtype;
  v_order_items jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_profit numeric := 0;
  v_token int;
  v_order orders%rowtype;
begin
  select * into v_member from _member_from_token(p_member_token);
  if v_member.id is null then raise exception 'Not authorized'; end if;
  if not v_member.khata_eligible then raise exception 'Khata is not enabled for this account'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products
      where id = (v_item->>'productId')::uuid and company_id = v_member.company_id
      for update;
    if v_product.id is null then raise exception 'Product not found'; end if;
    if v_product.stock < (v_item->>'qty')::int then
      raise exception 'Not enough stock for %', v_product.name;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products
      where id = (v_item->>'productId')::uuid and company_id = v_member.company_id;

    v_order_items := v_order_items || jsonb_build_object(
      'productId', v_product.id, 'name', v_product.name, 'emoji', v_product.emoji,
      'qty', (v_item->>'qty')::int, 'price', v_product.price, 'cost', v_product.cost
    );
    v_total := v_total + v_product.price * (v_item->>'qty')::int;
    v_profit := v_profit + (v_product.price - v_product.cost) * (v_item->>'qty')::int;

    update products set stock = stock - (v_item->>'qty')::int where id = v_product.id;

    insert into khata_entries(company_id, member_id, product_name, price, qty, note)
    values (v_member.company_id, v_member.id, v_product.name, v_product.price, (v_item->>'qty')::int, 'Checkout order');
  end loop;

  update companies set next_token = next_token + 1 where id = v_member.company_id returning next_token - 1 into v_token;

  insert into orders(company_id, customer_id, device_id, token, items, total, profit, payment_method, source, status)
  values (v_member.company_id, null, p_device_id, v_token, v_order_items, v_total, v_profit, 'Khata', 'online', 'placed')
  returning * into v_order;

  return v_order;
end;
$$;
