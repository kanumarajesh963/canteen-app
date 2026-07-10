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
